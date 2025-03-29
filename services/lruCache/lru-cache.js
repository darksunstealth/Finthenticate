import NodeCache from 'node-cache';

class CacheManager {
  constructor(logger) {

      this.logger = logger
    try {
      // Configuração do cache local
      this.cache = new NodeCache({
        stdTTL: 0,
        checkperiod: 600, // Intervalo para verificar chaves expiradas (em segundos)
        maxKeys: 50000, // Máximo de itens no cache
      });
      if (!this.cache) {
        throw new Error('Falha ao inicializar NodeCache.');
      }
      this.logger.info('[this.LocalCacheManager] Cache local inicializado com sucesso.');
    } catch (error) {
      this.logger.error(`[this.LocalCacheManager] Erro ao inicializar o cache local: ${error.message}`);
      // Opcional: Re-throw para evitar usar um cache inválido
      throw error;
    }
  }


  get(key) {
    if (!this.cache) {
      this.logger.error(`[this.LocalCacheManager] Tentativa de chamar 'get' quando 'cache' está indefinido.`);
      return null;
    }
    try {
      const value = this.cache.get(key);
      if (value === undefined) {
        this.logger.debug(`[this.LocalCacheManager] Chave "${key}" não encontrada no cache local.`);
        return null;
      }
      return value;
    } catch (error) {
      this.logger.error(`[this.LocalCacheManager] Erro ao tentar obter chave "${key}" do cache: ${error.message}`);
      return null;
    }
  }
  set(key, value, ttl) {
    try {
      let result;
      // Use stdTTL padrão (infinito) se ttl não for fornecido
      if (ttl === undefined || ttl === 0) {
        result = this.cache.set(key, value); // Sem TTL
      } else {
        result = this.cache.set(key, value, ttl);
      }
  
      const usedTTL = ttl !== undefined ? ttl : this.cache.options.stdTTL;
      this.logger.debug(
        `[this.LocalCacheManager] Chave "${key}" definida no cache com TTL ${usedTTL}. Resultado: ${result}`
      );
  
      return result; // Retorna o resultado do NodeCache (true/false)
    } catch (error) {
      this.logger.error(
        `[this.LocalCacheManager] Erro ao tentar definir chave "${key}" no cache: ${error.message}`
      );
      return false; // Retorna false em caso de erro
    }
  }
  
  

  del(key) {
    try {
      this.cache.del(key);
      this.logger.debug(`[this.LocalCacheManager] Chave "${key}" removida do cache local.`);
    } catch (error) {
      this.logger.error(`[this.LocalCacheManager] Erro ao tentar remover chave "${key}" do cache: ${error.message}`);
    }
  }

  has(key) {
    try {
      const exists = this.cache.has(key);
      this.logger.debug(`[this.LocalCacheManager] Verificação da existência da chave "${key}" no cache local: ${exists}.`);
      return exists;
    } catch (error) {
      this.logger.error(`[this.LocalCacheManager] Erro ao verificar existência da chave "${key}" no cache: ${error.message}`);
      return false;
    }
  }

  keys() {
    try {
      const allKeys = this.cache.keys();
      this.logger.debug(`[this.LocalCacheManager] Chaves obtidas do cache local: ${JSON.stringify(allKeys)}.`);
      return allKeys;
    } catch (error) {
      this.logger.error(`[this.LocalCacheManager] Erro ao obter chaves do cache local: ${error.message}`);
      return [];
    }
  }
}

export default CacheManager;