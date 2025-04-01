import amqp from 'amqplib';
import {v4 as uuidv4  } from 'uuid';

class AMQPManager {
  constructor(logger) {
    this.logger = logger
    this.connection = null;
    this.channelsByQueue = {};

    this.prefetchCount = 20;
    this.numConsumers = 100; // Consumidores paralelos por fila
    this.maxChannels = 20;    // Máximo de canais simultâneos



    // Contadores de mensagens processadas por fila
    this.messageCounters = {
      login_queue: 0,
    };

    // Gerenciamento de callbacks para RPC
    this.callbacks = {};

    // Bind do método para garantir o contexto correto
    this.handleResponse = this.handleResponse.bind(this);

  }

  async connect() {
    if (this.connection) {
      this.logger.debug('[AMQPManager:connect] Conexão já existente. Reutilizando...');
      return;
    }

    this.logger.debug('[AMQPManager:connect] Iniciando conexão com RabbitMQ...');

    // Obtendo as variáveis de ambiente

    const RABBITMQ_DEFAULT_USER = process.env.RABBITMQ_USERNAME || "guest";
    const RABBITMQ_DEFAULT_PASS = process.env.RABBITMQ_PASSWORD || "guest";
    const RABBITMQ_HOSTNAME = process.env.RABBITMQ_HOSTNAME || "localhost";
    const RABBITMQ_PORT = process.env.RABBITMQ_PORT || "5672";
    const RABBITMQ_VHOST = process.env.RABBITMQ_VHOST || "/";


    // Criando a connection string
    const connectionString = `amqp://${RABBITMQ_DEFAULT_USER}:${RABBITMQ_DEFAULT_PASS}@${RABBITMQ_HOSTNAME}:${RABBITMQ_PORT}${RABBITMQ_VHOST}`;
    this.logger.debug(`[AMQPManager:connect] Connection String: ${connectionString}`);

    const retryInterval = 5000; // Intervalo de reconexão em milissegundos

    while (!this.connection) {
      try {
        // Tentativa de conexão
        this.connection = await amqp.connect(connectionString);

        this.logger.info('[AMQPManager:connect] Conexão com RabbitMQ estabelecida.');

        // Gerenciar eventos de conexão
        this.connection.on('close', (reason) => {
          this.logger.error(
              '[AMQPManager:connect] Conexão com RabbitMQ encerrada.',
              { reason: reason || 'Razão desconhecida' }
          );
          this.connection = null;
          setTimeout(() => this.connect(), retryInterval); // Tentativa de reconexão
        });

        this.connection.on('error', (err) => {
          this.logger.error(
              '[AMQPManager:connect] Erro na conexão com RabbitMQ:',
              { message: err.message, stack: err.stack }
          );
        });
      } catch (error) {
        // Registro de erro e espera antes de nova tentativa
        this.logger.error(
            '[AMQPManager:connect] Falha ao conectar ao RabbitMQ:',
            { message: error.message, stack: error.stack }
        );
        this.logger.info(`[AMQPManager:connect] Tentando reconectar em ${retryInterval / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }
  }
  async ack(message) {
    if (this.channel && this.channel.isOpen && message) {
      try {
        this.logger.debug('Iniciando o processo de confirmação da mensagem.', { messageId: message.messageId });
        this.channel.ack(message);
        this.logger.debug('Mensagem confirmada com sucesso.', { messageId: message.messageId });
      } catch (error) {
        this.logger.error(`Erro ao confirmar a mensagem: ${error.message}`, {
          stack: error.stack,
          messageId: message.messageId,
        });
        throw error;
      }
    } else {
      this.logger.error('Não é possível confirmar a mensagem: canal ou mensagem inválida.', {
        channelState: this.channel ? this.channel.isOpen : 'Indefinido',
        message,
      });
      throw new Error('Canal fechado ou mensagem inválida.');
    }
  }

  async nack(message, multiple = false, requeue = false) {
    if (this.channel && this.channel.isOpen && message) {
      try {
        this.logger.debug('Iniciando o processo de rejeição da mensagem.', { messageId: message.messageId, requeue });
        this.channel.nack(message, multiple, requeue);
        this.logger.debug('Mensagem rejeitada com sucesso.', { messageId: message.messageId });
      } catch (error) {
        this.logger.error(`Erro ao rejeitar a mensagem: ${error.message}`, {
          stack: error.stack,
          messageId: message.messageId,
          requeue,
        });
        throw error;
      }
    } else {
      this.logger.error('Não é possível rejeitar a mensagem: canal ou mensagem inválida.', {
        channelState: this.channel ? this.channel.isOpen : 'Indefinido',
        message,
      });
      throw new Error('Canal fechado ou mensagem inválida.');
    }
  }


  /**
   * Retorna quantos canais já estão abertos (tamanho do objeto channelsByQueue).
   */
  getCurrentChannelCount() {
    return Object.keys(this.channelsByQueue).length;
  }

  /**
   * Cria (ou recupera) um canal dedicado para a fila informada.
   */
  async getChannelForQueue(queueName) {
    if (this.channelsByQueue[queueName]) {
      return this.channelsByQueue[queueName];
    }

    if (this.getCurrentChannelCount() >= this.maxChannels) {
      const errMsg = `Número máximo de canais (${this.maxChannels}) atingido.`;
      this.logger.error(`[AMQPManager:getChannelForQueue] ${errMsg}`);
      throw new Error(errMsg);
    }

    if (!this.connection) {
      await this.connect();
    }

    this.logger.debug(`[AMQPManager:getChannelForQueue] Criando canal para fila '${queueName}'...`);
    const channel = await this.connection.createChannel();
    await channel.prefetch(this.prefetchCount);

    // Não configure a fila aqui, apenas consuma ou publique mensagens
    this.channelsByQueue[queueName] = channel;
    this.logger.info(`[AMQPManager:getChannelForQueue] Canal criado para fila '${queueName}'.`);

    return channel;
  }
  /**
   * Fecha explicitamente o canal de uma fila, se precisar desmontar consumers.
   */
  async closeChannel(queueName) {
    const channel = this.channelsByQueue[queueName];
    if (!channel) return;

    try {
      await channel.close();
      this.logger.info(`[AMQPManager:closeChannel] Canal fechado para fila '${queueName}'.`);
    } catch (error) {
      this.logger.error(`[AMQPManager:closeChannel] Erro ao fechar canal da fila '${queueName}': ${error.message}`);
    } finally {
      delete this.channelsByQueue[queueName];
    }
  }
  async consume(queueName, callback) {
    try {
      const channel = await this.getChannelForQueue(queueName);
      await channel.prefetch(this.prefetchCount);

      for (let i = 0; i < this.numConsumers; i++) {
        const consumerId = i + 1;

        channel.consume(queueName, async (msg) => {
          if (!msg) {
            this.logger.warn(`[AMQPManager:consume] Mensagem nula recebida pelo consumidor ${consumerId} na fila '${queueName}'.`);
            return;
          }

          try {
            const content = JSON.parse(msg.content.toString());

            // Processa a mensagem com o callback fornecido
            await callback(content, msg, channel);

            // Confirma a mensagem
            channel.ack(msg);
            this.incrementMessageCounter(queueName);
          } catch (error) {
            this.logger.error(`[AMQPManager:consume] Erro no consumidor ${consumerId}: ${error.message}`);

            // Envia a mensagem para a DLQ
            await this.sendToDeadLetterQueue(msg.content.toString(), error);

            // Rejeita a mensagem sem reenfileirar
            channel.nack(msg, false, false);
          }
        });
      }
    } catch (error) {
      this.logger.error(`[AMQPManager:consume] Erro ao iniciar consumo na fila '${queueName}': ${error.message}`);
      throw error;
    }
  }
  async sendToQueue(queueName, messageObj) {
    try {


      // Log da mensagem antes de enviar
      this.logger.debug(`[sendToQueue] Mensagem a ser enviada: ${JSON.stringify(messageObj, null, 2)}`);

      // Obtenção do canal da fila
      const channel = await this.getChannelForQueue(queueName);

      // Serialização e envio da mensagem
      const sent = channel.sendToQueue(
          queueName,
          Buffer.from(JSON.stringify(messageObj)),
          { persistent: true }
      );

      if (!sent) {
        this.logger.warn(`[sendToQueue] Falha ao enviar mensagem para a fila '${queueName}'.`);
        return false;
      }

      this.logger.info(`[sendToQueue] Mensagem enviada para a fila '${queueName}' com sucesso.`);
      return true;
    } catch (error) {
      this.logger.error(`[sendToQueue] Erro ao enviar mensagem para a fila '${queueName}': ${error.message}`);
      this.logger.debug(`[sendToQueue] Stacktrace do erro: ${error.stack}`);
      throw error;
    }
  }

  handleResponse(msg) {
    const correlationId = msg.properties.correlationId;
    const callback = this.callbacks[correlationId];

    if (callback) {
      const content = JSON.parse(msg.content.toString());
      callback(null, content);
      delete this.callbacks[correlationId];
    } else {
      this.logger.warn(`[AMQPManager:handleResponse] Nenhum callback encontrado para correlationId: ${correlationId}`);
    }
  }
  sendAndReceive(queueName, messageObj, timeout = 5000) {
    return new Promise(async (resolve, reject) => {
      try {
        const channel = await this.getChannelForQueue(queueName);
        const correlationId = uuidv4();

        // Adiciona o callback no mapa
        this.callbacks[correlationId] = (err, response) => {
          if (err) {
            return reject(err);
          }
          resolve(response);
        };

        // Envia a mensagem com correlationId e replyTo setado para 'amq.rabbitmq.reply-to'
        const sent = channel.sendToQueue(queueName, Buffer.from(JSON.stringify(messageObj)), {
          correlationId,
          replyTo: 'amq.rabbitmq.reply-to',
          persistent: true,
        });

        if (!sent) {
          delete this.callbacks[correlationId];
          return reject(new Error(`Falha ao enviar mensagem para a fila '${queueName}'.`));
        }

        this.logger.info(`[AMQPManager:sendAndReceive] Mensagem enviada para a fila '${queueName}' com correlationId = ${correlationId}`);

        // Configura o timeout
        setTimeout(() => {
          if (this.callbacks[correlationId]) {
            delete this.callbacks[correlationId];
            reject(new Error('Timeout aguardando resposta do consumidor.'));
          }
        }, timeout);
      } catch (error) {
        reject(error);
      }
    });
  }async initialize() {
    this.logger.debug('[AMQPManager:initialize] Iniciando AMQPManager...');
    await this.connect();

    // Configura a DLQ
    this.dlqExchange = 'dlx_exchange'; // Exchange para a DLQ
    this.dlqQueue = 'dead_letter_queue'; // Fila para a DLQ

    // Cria a exchange e a fila da DLQ
    const channel = await this.connection.createChannel();
    await channel.assertExchange(this.dlqExchange, 'direct', { durable: true });
    await channel.assertQueue(this.dlqQueue, { durable: true });
    await channel.bindQueue(this.dlqQueue, this.dlqExchange, '');

    this.logger.info('[AMQPManager:initialize] Dead-letter queue configurada.');

    // Configura um canal dedicado para consumir respostas de RPC usando 'amq.rabbitmq.reply-to'
    this.responseChannel = await this.connection.createChannel();
    await this.responseChannel.prefetch(this.prefetchCount);
    await this.responseChannel.consume('amq.rabbitmq.reply-to', this.handleResponse, { noAck: true });

    this.logger.info('[AMQPManager:initialize] Consumidor para respostas RPC registrado na fila "amq.rabbitmq.reply-to".');
    this.logger.debug('[AMQPManager:initialize] AMQPManager inicializado.');
  }
  /**
   * Incrementa o contador de mensagens processadas para a fila.
   */
  incrementMessageCounter(queueName) {
    // Normalizar o nome da fila se necessário (ex.: snake_case ou algo)
    const normalizedName = queueName;
    if (!this.messageCounters[normalizedName]) {
      this.messageCounters[normalizedName] = 0;
    }
    this.messageCounters[normalizedName] += 1;
    this.logger.debug(`[AMQPManager:incrementMessageCounter] Fila '${normalizedName}' -> Total processado: ${this.messageCounters[normalizedName]}`);
  }

  async sendToDeadLetterQueue(message, error) {
    try {
      if (!this.connection) {
        throw new Error('Conexão AMQP não inicializada.');
      }

      const channel = await this.connection.createChannel();

      // Adiciona informações de erro à mensagem
      const dlqMessage = {
        originalMessage: JSON.parse(message), // Converte a mensagem de volta para objeto
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date().toISOString(),
      };

      // Publica a mensagem na DLQ
      await channel.sendToQueue(this.dlqQueue, Buffer.from(JSON.stringify(dlqMessage)), {
        persistent: true, // Garante que a mensagem seja persistente
      });

      this.logger.info('Mensagem enviada para a dead-letter queue:', dlqMessage);
    } catch (err) {
      this.logger.error('Erro ao enviar mensagem para a dead-letter queue:', {
        errorName: err.name,
        errorMessage: err.message,
        errorStack: err.stack,
      });
      throw err;
    }
  }


  // -------------------------------------------------------
  // ABAIXO: métodos de fluxo específicos (ex.: processOrderQueue)
  // Você pode unificar chamando `consume` / `sendToQueue` conforme a nova lógica
  // -------------------------------------------------------

  async consumeProcessOrders(callback) {
    this.logger.debug('[AMQPManager:consumeProcessOrders] Consumindo process_order_queue...');
    await this.consume(this.processOrderQueue, async (content, msg, channel) => {
      const { messageId } = content;

      if (!messageId) {
        this.logger.error('[consumeProcessOrders] Mensagem sem "messageId".');
        channel.ack(msg);
        return;
      }
      try {
        // ... processar message ...
        await callback(content);
        // ack é dado em this.consume
      } catch (error) {
        this.logger.error(`[consumeProcessOrders] Erro: ${error.message}`, { stack: error.stack });
        channel.nack(msg, false, true);
      }
    });
  }

  // etc.: consumeAddOrders, consumeMatchOrders, etc., todos usando `await this.consume(...)`
}

export default  AMQPManager;
