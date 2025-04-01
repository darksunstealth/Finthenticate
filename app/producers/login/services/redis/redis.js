import Redis from 'ioredis';
import Redlock from 'redlock';

// Classe de Gerenciamento do Redis com Redlock
class RedisCacheManager {
  constructor(logger) {
    this.logger = logger;

    // Parse Redis connection information from environment variable
    let redisHost = 'localhost';
    let redisPort = 6379;
    let redisPassword = null;
    
    // Parse REDIS_URL if available
    if (process.env.REDIS_URL) {
      try {
        const redisUrl = new URL(process.env.REDIS_URL);
        redisHost = redisUrl.hostname;
        redisPort = parseInt(redisUrl.port) || 6379;
        if (redisUrl.password) redisPassword = redisUrl.password;
        
        this.logger.info(`Connecting to Redis at ${redisHost}:${redisPort}`);
      } catch (err) {
        this.logger.error(`Failed to parse REDIS_URL: ${err.message}`);
      }
    } else if (process.env.REDIS_HOST) {
      redisHost = process.env.REDIS_HOST;
      this.logger.info(`Using Redis host: ${redisHost} from REDIS_HOST`);
    }

    // Create Redis clients
    const redisOptions = {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 100,
      connectTimeout: 30000,
    };
    
    this.redisClient = new Redis(redisOptions);
    this.redisSubscriber = new Redis(redisOptions);

    // Add event listeners for connection monitoring
    this.redisClient.on('connect', () => {
      this.logger.info('Connected to Redis successfully');
    });
    
    this.redisClient.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`);
    });

    // Initialize Redlock
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
      this.logger.error(`Redlock error on Redis client: ${err.message}`);
    });

    this.logger.info('RedisCacheManager initialized successfully');
  }

  // Acquire a lock
  async acquireLock(lockKey, ttl = 5000) {
    try {
      this.logger.info(`[acquireLock] Tentando adquirir lock para a chave: ${lockKey}`);
      const lock = await this.redlock.acquire([lockKey], ttl);
      this.logger.info(`[acquireLock] Lock adquirido para a chave: ${lock.resource}`);
      return lock;
    } catch (error) {
      this.logger.error(`[acquireLock] Erro ao adquirir lock para a chave "${lockKey}": ${error.message}`, { errorStack: error.stack });
      return null;
    }
  }

  // Release a lock
  async releaseLock(lock) {
    if (!lock) {
      this.logger.warn(`[releaseLock] Nenhum lock para liberar.`);
      return;
    }
    try {
      await this.redlock.release(lock);
      this.logger.info(`[releaseLock] Lock liberado para a chave: ${lock.resource}`);
    } catch (error) {
      this.logger.error(`[releaseLock] Erro ao liberar lock para a chave "${lock.resource}": ${error.message}`);
    }
  }

  // Sanitize keys
  sanitizeKey(key) {
    return key.replace(/\//g, '_');
  }

  // Get a key from Redis
  async get(key) {
    try {
      key = this.sanitizeKey(key);
      const value = await this.redisClient.get(key);
      if (!value) return null;
      return value.startsWith('{') || value.startsWith('[')
        ? JSON.parse(value)
        : value;
    } catch (error) {
      this.logger.error(`Erro ao obter chave "${key}" no Redis: ${error.message}`);
      throw error;
    }
  }

  // Set a key in Redis with optional TTL
  async set(key, value, ttl) {
    try {
      const valueToStore = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttl > 0) {
        await this.redisClient.set(key, valueToStore, 'EX', ttl);
      } else {
        await this.redisClient.set(key, valueToStore);
      }
      this.logger.info(`[RedisCacheManager:set] Chave "${key}" salva com sucesso.`);
    } catch (error) {
      this.logger.error(`[RedisCacheManager:set] Erro ao setar chave "${key}" no Redis: ${error.message}`);
      throw error;
    }
  }

  // Delete a key from Redis
  async del(key) {
    try {
      key = this.sanitizeKey(key);
      await this.redisClient.del(key);
    } catch (error) {
      this.logger.error(`Erro ao deletar chave "${key}" no Redis: ${error.message}`);
      throw error;
    }
  }

  // Count elements in a sorted set
  async zCount(key, min, max) {
    try {
      return await this.redisClient.zcount(key, min, max);
    } catch (error) {
      throw new Error(`Erro ao executar zcount: ${error.message}`);
    }
  }

  // Remove elements from a sorted set by score
  async zremrangebyscore(key, min, max) {
    try {
      return await this.redisClient.zremrangebyscore(key, min, max);
    } catch (error) {
      this.logger.error(`Erro ao remover por score: ${error.message}`);
      throw error;
    }
  }

  // Create a Redis pipeline
  createPipeline() {
    return this.redisClient.pipeline();
  }
  
  // Execute a Redis pipeline
  async execPipeline(pipeline) {
    try {
      const results = await pipeline.exec();
      return results;
    } catch (err) {
      this.logger.error("Erro ao executar pipeline Redis:", err);
      throw err;
    }
  }

  // Set expiration time for a key
  async expire(key, seconds) {
    try {
      const sanitizedKey = this.sanitizeKey(key);
      const result = await this.redisClient.expire(sanitizedKey, seconds);
      return result;
    } catch (error) {
      this.logger.error(`Erro ao definir tempo de expiração para a chave "${key}": ${error.message}`);
      throw error;
    }
  }

  // Get field from hash
  async hget(key, field) {
    try {
      key = this.sanitizeKey(key);
      const value = await this.redisClient.hget(key, field);
      return value;
    } catch (error) {
      this.logger.error(`Erro ao obter campo "${field}" do hash "${key}" no Redis: ${error.message}`);
      throw error;
    }
  }

  // Get all fields from hash
  async hgetall(key) {
    try {
      key = this.sanitizeKey(key);
      const result = await this.redisClient.hgetall(key);
      return result;
    } catch (error) {
      this.logger.error(`Erro ao obter todos os campos do hash "${key}" no Redis: ${error.message}`);
      throw error;
    }
  }

  // Add to sorted set
  async zadd(key, score, value) {
    try {
      key = this.sanitizeKey(key);
      return await this.redisClient.zadd(key, score, value);
    } catch (error) {
      this.logger.error(`Erro ao adicionar ao sorted set "${key}": ${error.message}`);
      throw error;
    }
  }

  // Remove from sorted set
  async zrem(key, value) {
    try {
      key = this.sanitizeKey(key);
      return await this.redisClient.zrem(key, value);
    } catch (error) {
      this.logger.error(`Erro ao remover do sorted set "${key}": ${error.message}`);
      throw error;
    }
  }

  // Check if member exists in set
  async sismember(key, value) {
    try {
      key = this.sanitizeKey(key);
      const result = await this.redisClient.sismember(key, value);
      return result === 1;
    } catch (error) {
      this.logger.error(`[RedisCacheManager] Erro ao verificar membro no conjunto "${key}" no Redis: ${error.message}`);
      throw error;
    }
  }
}

export default RedisCacheManager;