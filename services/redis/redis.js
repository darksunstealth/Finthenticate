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
    
    // Parse REDIS_URL if available (redis://redis.default.svc.cluster.local:6379)
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

    // Create Redis clients with the correct connection information
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

    // Inicialização do Redlock com múltiplos clientes Redis para maior resiliência
    this.redlock = new Redlock(
      [this.redisClient, this.redisSubscriber],
      {
        driftFactor: 0.01, // Ajuste conforme necessário
        retryCount: 10,     // Número de tentativas de adquirir o lock
        retryDelay: 200,    // Tempo em ms entre as tentativas
        retryJitter: 200,   // Jitter para evitar competição
      }
    );

    // Tratamento de erros no Redlock
    this.redlock.on('clientError', (err) => {
      this.logger.error(`Redlock error on Redis client: ${err.message}`);
    });

    this.logger.info('RedisCacheManager initialized successfully');
  }

  /**
   * Adquire um lock para a chave especificada.
   * @param {string} lockKey - A chave para a qual adquirir o lock.
   * @param {number} ttl - Tempo de vida do lock em milissegundos.
   * @returns {Promise<Lock|null>} - Retorna o objeto Lock se adquirido, ou null em caso de falha.
   */
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

  /**
   * Libera o lock adquirido.
   * @param {Lock} lock - O objeto Lock a ser liberado.
   */
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
      // Dependendo da lógica, você pode querer tratar esse erro de outra forma
    }
  }

  // --- Métodos de Interação com o Redis ---

  // Observa chaves no Redis
  async watch(...keys) {
    try {
      await this.redisClient.watch(...keys);
    } catch (error) {
      this.logger.error(`Erro ao observar chaves no Redis: ${error.message}`);
      throw error;
    }
  }

  async getAssetIconUrl(assetId) {
    const iconUrlKey = 'assets:iconUrls';
    try {
      const iconUrl = await this.redisClient.hget(iconUrlKey, assetId);
      return iconUrl;
    } catch (error) {
      this.logger.error(`Erro ao recuperar iconUrl do ativo ${assetId} do Redis: ${error.message}`);
      throw error;
    }
  }

  async storeAssetIconUrls(iconUrls) {
    const iconUrlKey = 'assets:iconUrls'; // Chave global para armazenar os iconUrls
    try {
      // Usa um pipeline para melhorar o desempenho ao inserir vários campos
      const pipeline = this.redisClient.pipeline();
      for (const [assetId, iconUrl] of Object.entries(iconUrls)) {
        pipeline.hset(iconUrlKey, assetId, iconUrl);
      }
      await pipeline.exec();
    } catch (error) {
      this.logger.error(`Erro ao armazenar iconUrls dos ativos no Redis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Inicia uma transação Redis (MULTI).
   * @returns {Redis.Multi} - Instância da transação Redis.
   */
  multi() {
    try {
      return this.redisClient.multi();
    } catch (error) {
      this.logger.error(
        `[RedisCacheManager] Erro ao iniciar transação Redis: ${error.message}`,
      );
      throw error;
    }
  }

  async zcount(key, min, max) {
    try {
      return await this.redisClient.zcount(key, min, max);
    } catch (error) {
      throw new Error(`Erro ao executar zcount: ${error.message}`);
    }
  }

  // Cancela observação de chaves no Redis
  async unwatch() {
    try {
      await this.redisClient.unwatch();
    } catch (error) {
      this.logger.error(
        `Erro ao cancelar observação de chaves no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Incrementa uma chave no Redis
  async incr(key) {
    try {
      const result = await this.redisClient.incr(key);
      return result;
    } catch (error) {
      this.logger.error(`[RedisCacheManager] Erro ao incrementar chave no Redis: ${error.message}`);
      throw error;
    }
  }

  // Adiciona valores a um Set (SADD)
  async sadd(key, value) {
    try {
      key = this.sanitizeKey(key);
      await this.redisClient.sadd(key, value);
    } catch (error) {
      this.logger.error(`Erro ao adicionar valor ao Set no Redis: ${error.message}`);
      throw error;
    }
  }

  // Simula scanStream utilizando SCAN manualmente
  async *scanStream(pattern, count = 100) {
    try {
      let cursor = '0'; // Inicializa o cursor
      do {
        // Executa o comando SCAN
        const [newCursor, keys] = await this.redisClient.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          count,
        );
        cursor = newCursor; // Atualiza o cursor para a próxima iteração

        // Retorna as chaves encontradas
        for (const key of keys) {
          yield key;
        }
      } while (cursor !== '0'); // Continua até o cursor voltar para '0'
    } catch (error) {
      this.logger.error(`[scanStream] Erro ao executar SCAN: ${error.message}`);
      throw error;
    }
  }

  // Obtém valores do Sorted Set (ZSET) em ordem decrescente de score usando ZREVRANGE
  async zrevrange(key, start = 0, stop = -1) {
    try {
      key = this.sanitizeKey(key);

      // Usando o comando ZREVRANGE para buscar os elementos na ordem decrescente dos scores
      const result = await this.redisClient.zrevrange(key, start, stop, 'WITHSCORES');
      return result;
    } catch (error) {
      this.logger.error(
        `Erro ao obter elementos do ZSET em ordem decrescente no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Cria e retorna um pipeline Redis.
   * @returns {Pipeline} - Instância do pipeline Redis.
   */
  pipeline() {
    try {
      return this.redisClient.pipeline();
    } catch (error) {
      this.logger.error(
        `[RedisCacheManager] Erro ao criar pipeline: ${error.message}`,
      );
      throw error;
    }
  }

  // Remove valores de um conjunto no Redis (SREM)
  async srem(key, value) {
    try {
      key = this.sanitizeKey(key);

      await this.redisClient.srem(key, value); // Comando SREM do Redis

    } catch (error) {
      this.logger.error(
        `Erro ao remover valor do conjunto no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Adiciona uma nova ordem ao Stream
  async addMarketOrderToStream(key, orderData) {
    try {
      key = this.sanitizeKey(key);
      const entryId = await this.redisClient.xadd(
        key,
        '*',
        'order',
        JSON.stringify(orderData),
      );

      // Manter apenas as últimas 200 ordens no Stream
      await this.redisClient.xtrim(key, 'MAXLEN', '~', 200);
    } catch (error) {
      this.logger.error(
        `Erro ao adicionar ordem ao Stream no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Busca as ordens mais recentes do Stream
  async getMarketOrdersFromStream(key, count = 200) {
    try {
      key = this.sanitizeKey(key);

      // Obter as últimas ordens do Stream (do mais recente ao mais antigo)
      const entries = await this.redisClient.xrevrange(key, '+', '-', 'COUNT', count);
      return entries.map((entry) => JSON.parse(entry[1][1])); // Converter JSON de volta para objeto
    } catch (error) {
      this.logger.error(`Erro ao obter ordens do Stream no Redis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Adiciona um elemento ao início de uma lista no Redis.
   * @param {string} key - A chave Redis da lista.
   * @param {string|Object} value - O valor a ser adicionado à lista (será convertido para string).
   */
  async lpush(key, value) {
    try {
      const valueToStore = typeof value === 'string' ? value : JSON.stringify(value);

      await this.redisClient.lpush(key, valueToStore);
      this.logger.info(`[RedisCacheManager:lpush] Valor adicionado ao início da lista "${key}": ${valueToStore}`);
    } catch (error) {
      this.logger.error(`[RedisCacheManager:lpush] Erro ao adicionar valor ao início da lista "${key}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Adiciona um elemento ao final de uma lista no Redis.
   * @param {string} key - A chave Redis da lista.
   * @param {string|Object} value - O valor a ser adicionado à lista (será convertido para string).
   */
  async rpush(key, value) {
    try {
      const valueToStore = typeof value === 'string' ? value : JSON.stringify(value);

      await this.redisClient.rpush(key, valueToStore);
      this.logger.info(`[RedisCacheManager:rpush] Valor adicionado ao final da lista "${key}": ${valueToStore}`);
    } catch (error) {
      this.logger.error(`[RedisCacheManager:rpush] Erro ao adicionar valor ao final da lista "${key}": ${error.message}`);
      throw error;
    }
  }

  // Publica uma mensagem em um canal no Redis
  async publish(channel, message) {
    try {
      const messageString =
        typeof message === 'string' ? message : JSON.stringify(message);
      
      const result = await this.redisClient.publish(channel, messageString);

      if (result > 0) {
        // Mensagem recebida por pelo menos um assinante
        this.logger.info(`[publish] Mensagem publicada no canal "${channel}" com sucesso.`);
      } else if (result === 0) {
        this.logger.warn(
          `[RedisCacheManager] Nenhum assinante recebeu a mensagem no canal "${channel}".`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        `[RedisCacheManager] Erro ao publicar mensagem no canal "${channel}": ${error.message}`,
      );
      throw error;
    }
  }

  // Inscreve-se em um padrão de canal para Pub/Sub
  subscribe(pattern, messageHandler) {
    redisSubscriber.psubscribe(pattern, (err, count) => {
      if (err) {
        this.logger.error(
          `[RedisCacheManager] Erro ao se inscrever no padrão "${pattern}": ${err.message}`,
        );
        throw err;
      }
      this.logger.info(
        `[RedisCacheManager] Inscrito no padrão "${pattern}". Número de assinantes: ${count}`,
      );
    });

    redisSubscriber.on('pmessage', (subscribedPattern, channel, message) => {
      try {
        const parsedMessage = JSON.parse(message);
        messageHandler(channel, parsedMessage);
      } catch (error) {
        this.logger.error(
          `[RedisCacheManager] Erro ao processar mensagem no canal "${channel}": ${error.message}`,
        );
      }
    });
  }

  /**
   * Obtém múltiplos campos de um hash no Redis.
   * @param {String} key - Chave do hash no Redis.
   * @param {...String} fields - Campos a serem obtidos do hash.
   * @returns {Promise<Array>} - Retorna um array com os valores dos campos solicitados.
   */
  async hmget(key, ...fields) {
    try {
      key = this.sanitizeKey(key);

      const values = await this.redisClient.hmget(key, ...fields);
      return values;
    } catch (error) {
      this.logger.error(
        `Erro ao obter múltiplos campos do hash no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Verifica a existência de uma chave no Redis
  async exists(key) {
    try {
      key = this.sanitizeKey(key);
      const result = await this.redisClient.exists(key); // Comando EXISTS do Redis
      return result > 0; // Retorna true se a chave existir, caso contrário, false
    } catch (error) {
      this.logger.error(
        `Erro ao verificar a existência da chave "${key}" no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Obtém todos os membros de um Set no Redis (SMEMBERS)
  async smembers(key) {
    try {
      key = this.sanitizeKey(key);
      const members = await this.redisClient.smembers(key);
      return members;
    } catch (error) {
      this.logger.error(`Erro ao buscar membros do Set no Redis: ${error.message}`);
      throw error;
    }
  }

  // Retorna o cliente Redis principal
  getClient() {
    return this.redisClient;
  }

  // Retorna o cliente Redis para Pub/Sub
  getSubscriberClient() {
    return redisSubscriber;
  }

  // Executa um script Lua no Redis
  async execLuaScript(script, numKeys, ...args) {
    try {
      // Verificar que todos os argumentos são strings ou números
      const sanitizedArgs = args.map((arg) =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
      );

      // Carregar o script no Redis e obter o SHA1 hash
      const sha1 = await this.redisClient.script('load', script);

      // Executar o script usando evalsha
      const result = await this.redisClient.evalsha(sha1, numKeys, ...sanitizedArgs);
      return result;
    } catch (error) {
      this.logger.error(`Erro ao executar script Lua no Redis: ${error.message}`);
      throw error;
    }
  }

  // Adiciona elemento a uma lista no Redis (LPUSH)
  async lpush(key, value) {
    try {
      key = this.sanitizeKey(key);
      await this.redisClient.lpush(key, value);
    } catch (error) {
      this.logger.error(
        `Erro ao adicionar valor à lista no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Mantém um tamanho máximo de uma lista no Redis (LTRIM)
  async ltrim(key, start, stop) {
    try {
      key = this.sanitizeKey(key);
      await this.redisClient.ltrim(key, start, stop);
    } catch (error) {
      this.logger.error(`Erro ao truncar a lista no Redis: ${error.message}`);
      throw error;
    }
  }

  // Sanitiza chaves (substitui barras "/")
  sanitizeKey(key) {
    return key.replace(/\//g, '_');
  }

  // Obtém uma chave no Redis
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

  // Define uma chave no Redis com TTL opcional
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

  // Obtém o tipo de uma chave no Redis
  async type(key) {
    try {
      key = this.sanitizeKey(key);
      const result = await this.redisClient.type(key);
      return result;
    } catch (error) {
      this.logger.error(
        `Erro ao verificar o tipo da chave "${key}" no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Manipulação de hashes: HSET
  async hset(key, ...args) {
    try {
      key = this.sanitizeKey(key);
      await this.redisClient.hset(key, ...args);
    } catch (error) {
      this.logger.error(`Erro ao setar valores no hash "${key}" do Redis: ${error.message}`);
      throw error;
    }
  }

  // Manipulação de hashes: HGET
  async hget(key, field) {
    try {
      key = this.sanitizeKey(key);
      const value = await this.redisClient.hget(key, field);
      return value;
    } catch (error) {
      this.logger.error(
        `Erro ao obter campo "${field}" do hash "${key}" no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Deleta uma chave no Redis
  async del(key) {
    try {
      key = this.sanitizeKey(key);
      await this.redisClient.del(key);
    } catch (error) {
      this.logger.error(`Erro ao deletar chave "${key}" no Redis: ${error.message}`);
      throw error;
    }
  }

  async zremrangebyscore(key, min, max) {
    return new Promise((resolve, reject) => {
      this.redisClient.zremrangebyscore(key, min, max, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  // Adiciona valores ao Sorted Set (ZADD)
  async zadd(key, score, value) {
    return this.zaddAtomic(key, score, value);
  }

  // Adiciona valores atômicos ao Sorted Set com ZADD e retorno de valores atualizados
  async zaddAtomic(key, score, value) {
    const script = `
      redis.call("ZADD", KEYS[1], ARGV[1], ARGV[2]);
      return redis.call("ZRANGE", KEYS[1], 0, -1, "WITHSCORES");
    `;
    try {
      key = this.sanitizeKey(key);
      return await this.execLuaScript(script, 1, key, score, value);
    } catch (error) {
      this.logger.error(`Erro ao executar ZADD atômico no Redis: ${error.message}`);
      throw error;
    }
  }

  // Define um tempo de expiração em segundos para uma chave no Redis
  async expire(key, seconds) {
    try {
      const sanitizedKey = this.sanitizeKey(key); // Sanitiza a chave se necessário
      const result = await this.redisClient.expire(sanitizedKey, seconds); // Usa a instância `redis` corretamente
      return result; // Retorna o resultado da operação
    } catch (error) {
      this.logger.error(`Erro ao definir tempo de expiração para a chave "${key}": ${error.message}`);
      throw error; // Lança o erro para o chamador tratar
    }
  }

  /**
   * Define um tempo de expiração em milissegundos para uma chave no Redis.
   * @param {string} key - A chave para a qual definir a expiração.
   * @param {number} milliseconds - O tempo de expiração em milissegundos.
   * @returns {Promise<number>} - O resultado da operação PEXPIRE (1 se o tempo limite foi definido, 0 se a chave não existe).
   */
  async pexpire(key, milliseconds) {
    try {
      const sanitizedKey = this.sanitizeKey(key); // Sanitiza a chave se necessário
      const result = await this.redisClient.pexpire(sanitizedKey, milliseconds); // Usa a instância redis corretamente

      return result; // Retorna o resultado da operação (1 ou 0)
    } catch (error) {
      this.logger.error(
        `Erro ao definir tempo de expiração para a chave "${key}": ${error.message}`
      );
      throw error; // Lança o erro para o chamador tratar
    }
  }

  // Remove valor do Sorted Set atômico com ZREM e retorno dos valores atualizados
  async zrem(key, value) {
    const script = `
      redis.call("ZREM", KEYS[1], ARGV[1]);
      return redis.call("ZRANGE", KEYS[1], 0, -1, "WITHSCORES");
    `;
    try {
      key = this.sanitizeKey(key);
      return await this.execLuaScript(script, 1, key, value);
    } catch (error) {
      this.logger.error(`Erro ao executar ZREM atômico no Redis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtém o score de um membro em um sorted set.
   * @param {string} key - A chave do sorted set.
   * @param {string} member - O membro para o qual obter o score.
   * @returns {Promise<number|null>} - O score do membro, ou null se o membro ou a chave não existirem.
   */
  async zscore(key, member) {
    try {
      const score = await this.redisClient.zscore(key, member);

      return score ? parseFloat(score) : null;
    } catch (error) {
      this.logger.error(
        `Erro ao executar ZSCORE na chave "${key}": ${error.message}`,
      );
      throw error;
    }
  }

  // Obtém valores do Sorted Set (ZRANGE)
  async zrange(key, start = 0, stop = -1) {
    try {
      key = this.sanitizeKey(key);
      return await this.redisClient.zrange(key, start, stop, 'WITHSCORES');
    } catch (error) {
      this.logger.error(
        `Erro ao executar ZRANGE na chave "${key}": ${error.message}`,
      );
      throw error;
    }
  }

  // Conta o número de tentativas de login recentes
  async count(model, options) {
    try {
      const count = await model.count(options);
      return count;
    } catch (error) {
      this.logger.error(`Erro ao contar registros: ${error.message}`);
      throw error;
    }
  }

  // Marca uma carteira como processada
  async markWalletAsProcessed(walletAddress) {
    const cacheKey = `wallet:processed:${walletAddress}`;
    await this.set(cacheKey, 'true', 300); // TTL de 5 minutos
  }

  // Desmarca uma carteira como processada
  async unmarkWalletAsProcessed(walletAddress) {
    const cacheKey = `wallet:processed:${walletAddress}`;
    await this.del(cacheKey);
  }

  // Verifica se uma carteira foi processada
  async isWalletProcessed(walletAddress) {
    const cacheKey = `wallet:processed:${walletAddress}`;
    const exists = await this.get(cacheKey);
    return exists !== null;
  }

  // Obtém elementos de uma lista (LRANGE)
  async lrange(key, start = 0, stop = -1) {
    try {
      key = this.sanitizeKey(key);

      const values = await this.redisClient.lrange(key, start, stop);
      return values.map((value) => JSON.parse(value));
    } catch (error) {
      this.logger.error(
        `Erro ao obter elementos da lista "${key}" no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Adiciona um usuário ao conjunto de usuários logados e publica o evento
  async addSessionUser(userId) {
    try {
      await this.redisClient.sadd('SESSION:USERS', userId);
      
      // Publica o evento de adição
      await this.publish('SESSION:USERS', JSON.stringify({ action: 'add', userId }));
    } catch (error) {
      this.logger.error(`Erro ao adicionar usuário ao "SESSION:USERS": ${error.message}`);
      throw error;
    }
  }

  // Remove um usuário do conjunto de usuários logados e publica o evento
  async removeSessionUser(userId) {
    try {
      await this.redisClient.srem('SESSION:USERS', userId);
      
      // Publica o evento de remoção
      await this.publish('SESSION:USERS', JSON.stringify({ action: 'remove', userId }));
    } catch (error) {
      this.logger.error(`Erro ao remover usuário do "SESSION:USERS": ${error.message}`);
      throw error;
    }
  }

  // Obtém todos os usuários atualmente logados
  async getSessionUsers() {
    try {
      const users = await this.redisClient.smembers('SESSION:USERS');
      return users;
    } catch (error) {
      this.logger.error(`Erro ao obter usuários logados: ${error.message}`);
      throw error;
    }
  }

  // Verifica se um valor pertence a um conjunto no Redis (SISMEMBER)
  async sismember(key, value) {
    try {
      key = this.sanitizeKey(key);
     
      const result = await this.redisClient.sismember(key, value); // Comando SISMEMBER do Redis
      
      return result === 1; // Retorna true se o valor pertence ao conjunto
    } catch (error) {
      this.logger.error(
        `[RedisCacheManager] Erro ao verificar membro no conjunto "${key}" no Redis: ${error.message}`,
      );
      throw error;
    }
  }

  // Obtém todos os campos de um hash no Redis (HGETALL)
  async hgetall(key) {
    try {
      key = this.sanitizeKey(key);
      const result = await this.redisClient.hgetall(key);
      return result;
    } catch (error) {
      this.logger.error(
        `Erro ao obter todos os campos do hash "${key}" no Redis: ${error.message}`,
      );
      throw error;
    }
  }
}

export default RedisCacheManager;
