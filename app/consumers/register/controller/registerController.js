import { v4 as uuidv4, validate as uuidValidate } from "uuid";

class RegisterController {
    constructor(logger, redisCacheManager) {
        this.logger = logger;
        this.redisCacheManager = redisCacheManager;
    }

    async handleMessage(message) {
        if (!message || !message.data) {
            this.logger.warn("Mensagem inválida ou sem dados.");
            return;
        }

        try {
            // Melhoria: Use uma única pipeline para processar todo o batch de uma vez
            const pipeline = this.redisCacheManager.createPipeline();
            const processedUsers = [];

            if (Array.isArray(message.data)) {
                this.logger.info(`Processando batch com ${message.data.length} usuários`);
                for (const userData of message.data) {
                    const userId = this.prepareUserDataForRedis(userData, pipeline);
                    if (userId) processedUsers.push({ email: userData.email, userId });
                }
            } else {
                const userId = this.prepareUserDataForRedis(message.data, pipeline);
                if (userId) processedUsers.push({ email: message.data.email, userId });
            }

            // Execute o pipeline apenas uma vez para todos os usuários
            if (processedUsers.length > 0) {
                this.logger.debug(`Executando pipeline para ${processedUsers.length} usuários`);
                await this.redisCacheManager.execPipeline(pipeline);
                this.logger.info(`Batch processado com sucesso: ${processedUsers.length} usuários`);
            }
        } catch (error) {
            this.logger.error(`Erro ao processar mensagem: ${error.message}`);
        }
    }

    prepareUserDataForRedis(userData, pipeline) {
        try {
            if (!userData || typeof userData !== 'object') {
                this.logger.warn("Dados de usuário inválidos ignorados");
                return null;
            }

            if (!userData.email) {
                this.logger.warn("Usuário sem email ignorado");
                return null;
            }

            // Usar userId existente ou gerar um novo
            const userId = userData.userId && uuidValidate(userData.userId) ? userData.userId : uuidv4();
            userData.userId = userId;

            // Adicionar o mapeamento email -> userId ao pipeline
            pipeline.hset('USERS', userData.email, userId);

            // Preparar os dados do usuário para o Redis
            const userDataKey = `USER_DATA_${userId}`;
            
            // Iterar sobre todas as propriedades e incluir comandos hset no pipeline
            Object.entries(userData).forEach(([key, value]) => {
                if (value === null || value === undefined) {
                    return; // Ignorar valores nulos
                }
                
                // Garantir que todos os valores sejam strings
                const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
                pipeline.hset(userDataKey, key, valueToStore);
            });

            this.logger.debug(`Dados preparados para o usuário: ${userData.email} (${userId})`);
            return userId;
        } catch (error) {
            this.logger.error(`Erro ao preparar dados: ${error.message}`);
            return null;
        }
    }
}

export default RegisterController;
