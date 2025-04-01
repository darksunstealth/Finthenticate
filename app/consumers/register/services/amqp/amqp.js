import amqp from 'amqplib';

class AMQPManager {
  constructor(logger) {
    this.logger = logger || console;
    this.connection = null;
    this.channelsByQueue = {};

    this.prefetchCount = 20;
    this.numConsumers = 100; // Consumidores paralelos por fila
    this.maxChannels = 20;   // Máximo de canais simultâneos
  }

  async connect() {
    if (this.connection) {
      this.logger.debug('[AMQPManager:connect] Conexão já existente. Reutilizando...');
      return;
    }

    this.logger.debug('[AMQPManager:connect] Iniciando conexão com RabbitMQ...');

    // Obtendo as variáveis de ambiente
    const RABBITMQ_DEFAULT_USER = process.env.RABBITMQ_USERNAME || 'guest';
    const RABBITMQ_DEFAULT_PASS = process.env.RABBITMQ_PASSWORD || 'guest';
    const RABBITMQ_HOSTNAME = process.env.RABBITMQ_HOSTNAME || 'localhost';
    const RABBITMQ_PORT = process.env.RABBITMQ_PORT || 5672;
    const RABBITMQ_VHOST = process.env.RABBITMQ_VHOST || '/';

    // Criando a connection string
    const connectionString = `amqp://${RABBITMQ_DEFAULT_USER}:${RABBITMQ_DEFAULT_PASS}@${RABBITMQ_HOSTNAME}:${RABBITMQ_PORT}${RABBITMQ_VHOST}`;
    this.logger.debug(`[AMQPManager:connect] Connection String: ${connectionString}`);

    const retryInterval = 5000; // Intervalo de reconexão em milissegundos

    while (!this.connection) {
      try {
        this.connection = await amqp.connect(connectionString);
        this.logger.info('[AMQPManager:connect] Conexão com RabbitMQ estabelecida.');

        // Gerenciar eventos de conexão
        this.connection.on('close', (reason) => {
          this.logger.error('[AMQPManager:connect] Conexão com RabbitMQ encerrada.', { reason: reason || 'Razão desconhecida' });
          this.connection = null;
          setTimeout(() => this.connect(), retryInterval);
        });

        this.connection.on('error', (err) => {
          this.logger.error('[AMQPManager:connect] Erro na conexão com RabbitMQ:', { message: err.message, stack: err.stack });
        });
      } catch (error) {
        this.logger.error('[AMQPManager:connect] Falha ao conectar ao RabbitMQ:', { message: error.message, stack: error.stack });
        this.logger.info(`[AMQPManager:connect] Tentando reconectar em ${retryInterval / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }
  }

  // Obtém ou cria um canal para uma fila específica, apenas verificando sua existência
  async getChannelForQueue(queueName) {
    if (!this.connection) {
      await this.connect();
    }

    if (this.channelsByQueue[queueName]) {
      return this.channelsByQueue[queueName];
    }

    try {
      const channel = await this.connection.createChannel();
      
      await channel.prefetch(this.prefetchCount);
      
      await channel.assertQueue(queueName, { durable: true });
      
      channel.on('close', () => {
        this.logger.warn(`[getChannelForQueue] Canal para a fila ${queueName} foi fechado. Será recriado na próxima operação.`);
        delete this.channelsByQueue[queueName];
      });

      channel.on('error', (err) => {
        this.logger.error(`[getChannelForQueue] Erro no canal para a fila ${queueName}:`, err);
        delete this.channelsByQueue[queueName];
      });

      this.channelsByQueue[queueName] = channel;
      return channel;
    } catch (error) {
      this.logger.error(`[getChannelForQueue] Erro ao criar canal para a fila ${queueName}:`, error);
      throw error;
    }
  }

  async consume(queue, callback) {
    const channel = await this.getChannelForQueue(queue);

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        try {
          const message = JSON.parse(msg.content.toString());
          await callback(message);
          channel.ack(msg); // Confirma a mensagem
        } catch (error) {
          this.logger.error(`Erro ao processar mensagem da fila ${queue}:`, error);
          channel.nack(msg, false, false); // Rejeita a mensagem
        }
      }
    });
  }

  async close() {
    if (this.connection) {
      for (const queueName in this.channelsByQueue) {
        try {
          await this.channelsByQueue[queueName].close();
        } catch (error) {
          this.logger.warn(`[close] Erro ao fechar canal para fila ${queueName}:`, error);
        }
      }

      await this.connection.close();
      this.connection = null;
      this.channelsByQueue = {};
      this.logger.info('[AMQPManager:close] Conexão e canais encerrados.');
    }
  }
}

export default AMQPManager;
