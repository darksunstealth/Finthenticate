import Redis from 'ioredis';
import Redlock from 'redlock';

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

class RedisCacheManager {
  constructor() {
    const redisConfig = getRedisConfig();

    this.redisClient = new Redis(redisConfig);
    this.redisSubscriber = new Redis(redisConfig);

    this.redlock = new Redlock(
      [this.redisClient, this.redisSubscriber],
      {
        driftFactor: 0.01,
        retryCount: 10,
        retryDelay: 200,
        retryJitter: 200,
      }
    );

    this.redlock.on('clientError', (err) => {
      console.error('Redlock error no cliente Redis:', err);
    });
  }
// In your RedisCacheManager class
async set(key, value, options = {}) {
  if (typeof options === 'string' && options === 'EX' && arguments.length === 4) {
    // Handle the case where 'EX' is passed as a string followed by seconds
    const seconds = arguments[3];
    return this.redisClient.set(key, value, 'EX', seconds);
  }
  return this.redisClient.set(key, value, options);
}

  async get(key) {
    return this.redisClient.get(key);
  }

  async hset(key, field, value) {
    return this.redisClient.hset(key, field, value);
  }

  async hget(key, field) {
    return this.redisClient.hget(key, field);
  }

  async hgetall(key) {
    return this.redisClient.hgetall(key);
  }

  async zadd(key, score, value) {
    return this.redisClient.zadd(key, score, value);
  }

  async zcount(key, min, max) {
    return this.redisClient.zcount(key, min, max);
  } 
  
  async multiHExists(key, fields) {
    const pipeline = this.redisClient.pipeline();
  
    fields.forEach(field => {
      pipeline.hexists(key, field);
    });
  
    try {
      const results = await pipeline.exec();
      const response = {};
  
      fields.forEach((field, index) => {
        const [err, result] = results[index];
        response[field] = err ? false : result === 1;
      });
  
      return response;
    } catch (error) {
      console.error(`Erro ao verificar múltiplos hexists para key "${key}"`, error);
      throw error;
    }
  }

  async del(key) {
    return this.redisClient.del(key);
  }
  async ping() {
    try {
      const result = await this.redisClient.ping();
      console.log('Redis connection verified:', result);
      return result; // Should return "PONG"
    } catch (error) {
      console.error('Redis connection failed:', error);
      throw error;
    }
  }
  /**
   * Cria um pipeline para operações em lote no Redis.
   * @returns {Pipeline} - Instância do pipeline do ioredis.
   */
  createPipeline() {
    return this.redisClient.pipeline();
  }

  /**
   * Executa um pipeline de comandos no Redis.
   * @param {Pipeline} pipeline - O pipeline a ser executado.
   * @returns {Promise<Array>} - Resultados das operações do pipeline.
   */
  async execPipeline(pipeline) {
    try {
      const results = await pipeline.exec();
      console.log('Pipeline executado com sucesso:', results);
      return results;
    } catch (error) {
      console.error('Erro ao executar o pipeline:', error);
      throw error;
    }
  }

  async disconnect() {
    await this.redisClient.quit();
    await this.redisSubscriber.quit();
    console.log('Desconectado do Redis.');
  }
}

export default RedisCacheManager;