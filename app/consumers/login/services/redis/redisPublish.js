import Redis from 'ioredis';

function getRedisConfig() {
  if (process.env.REDIS_URL) {
    const redisUrl = new URL(process.env.REDIS_URL);
    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port),
      retryStrategy: (times) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 100,
      connectTimeout: 30000,
    };
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: 6379,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    maxRetriesPerRequest: 100,
    connectTimeout: 30000,
  };
}

class RedisPubSub {
  constructor(logger) {
    const redisConfig = getRedisConfig();
    this.logger = logger;

    // Cria dois clientes Redis: um para publicação e outro para inscrição
    this.publisher = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);

    // Evento opcional para log de erros
    this.subscriber.on('error', (error) => {
      this.logger.error('Erro no subscriber Redis:', error);
    });
    this.publisher.on('error', (error) => {
      this.logger.error('Erro no publisher Redis:', error);
    });
  }

  /**
   * Inscreve-se em um canal e executa o callback sempre que uma mensagem for recebida.
   * @param {string} channel - O canal para se inscrever.
   * @param {function} handler - Função callback que recebe (channel, message).
   */
  subscribe(channel, handler) {
    this.subscriber.subscribe(channel, (err, count) => {
      if (err) {
        this.logger.error(`Falha ao se inscrever no canal ${channel}:`, err);
      } else {
        this.logger.info(`Inscrito no canal "${channel}". Total de inscrições: ${count}`);
      }
    });
    
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        this.logger.info(`Mensagem recebida no canal "${ch}": ${message}`);
        if (handler && typeof handler === 'function') {
          handler(ch, message);
        }
      }
    });
  }

  /**
   * Publica uma mensagem em um canal específico.
   * @param {string} channel - O canal para publicar a mensagem.
   * @param {string} message - A mensagem a ser publicada.
   */
  publish(channel, message) {
    this.publisher.publish(channel, message, (err, count) => {
      if (err) {
        this.logger.error(`Erro ao publicar no canal ${channel}:`, err);
      } else {
        this.logger.info(`Mensagem publicada no canal "${channel}" para ${count} assinantes.`);
      }
    });
  }

  /**
   * Fecha as conexões Redis.
   */
  async disconnect() {
    await this.publisher.quit();
    await this.subscriber.quit();
    this.logger.info('Desconectado do Redis Pub/Sub.');
  }
}

export default RedisPubSub;
