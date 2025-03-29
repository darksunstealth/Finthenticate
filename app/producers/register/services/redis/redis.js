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
  
  async set(key, value, options = {}) {
    return this.redisClient.set(key, value, options);
  }

  async get(key) {
    return this.redisClient.get(key);
  }

  async hset(key, field, value) {
    return this.redisClient.hset(key, field, value);
  }

  async hGet(key, field) {
    return this.redisClient.hget(key, field);
  }

  async hgetall(key) {
    return this.redisClient.hgetall(key);
  }

  async zAdd(key, score, value) {
    return this.redisClient.zadd(key, score, value);
  }

  async zCount(key, min, max) {
    return this.redisClient.zcount(key, min, max);
  }

  async del(key) {
    return this.redisClient.del(key);
  }

  createPipeline() {
    return this.redisClient.pipeline();
  }

  async multiHExists(key, fields) {
    // Se fields for uma string única (como um email), converta para array
    const fieldsArray = Array.isArray(fields) ? fields : [fields];
    
    if (fieldsArray.length === 0) {
      return Array.isArray(fields) ? {} : false;
    }
    
    const pipeline = this.redisClient.pipeline();
    
    fieldsArray.forEach(field => {
      pipeline.hexists(key, field);
    });
    
    try {
      const results = await pipeline.exec();
      
      // Verifica se temos resultados válidos
      if (!results || results.length === 0) {
        console.warn(`No results returned from Redis for key: ${key}`);
        return Array.isArray(fields) ? {} : false;
      }
      
      // Se estamos verificando apenas um campo e fields não é um array, retorne boolean diretamente
      if (!Array.isArray(fields)) {
        return results[0][1] === 1;
      }
      
      // Caso contrário, retorne um objeto com os resultados para cada campo
      const response = {};
      fieldsArray.forEach((field, index) => {
        if (index < results.length) {
          const [err, result] = results[index];
          if (err) {
            console.error(`Error checking exists for field "${field}":`, err);
            response[field] = false;
          } else {
            response[field] = result === 1;
          }
        } else {
          console.warn(`No result for field "${field}" at index ${index}`);
          response[field] = false;
        }
      });
      
      return response;
    } catch (error) {
      console.error(`Error executing multiHExists for key "${key}":`, error);
      throw error;
    }
  }

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