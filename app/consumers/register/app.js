import dotenv from "dotenv";
import logger from "./services/logger/logger.js";
import AMQPManager from "./services/amqp/amqp.js";
import RedisCacheManager from "./services/redis/redis.js";
import RegisterController from "./controller/registerController.js";

dotenv.config();

class ConsumerManager {
    constructor(logger, redisCacheManager, amqpManager, registerController) {
        this.logger = logger;
        this.redisCacheManager = redisCacheManager;
        this.amqpManager = amqpManager;
        this.registerController = registerController;
    }

    async initializeConsumers() {
        try {
            await this.amqpManager.consume("register_user_queue", async (message) => {
                this.logger.debug("Mensagem recebida:", message);
              this.logger.info(`MESSAGE VALUE ${JSON.stringify(message)}`)

                await this.registerController.handleMessage(message);
            });
            this.logger.info("Consumidores inicializados com sucesso.");
        } catch (error) {
            this.logger.error("Erro ao inicializar consumidores:", error);
        }
    }
}

(async function start() {
    try {
        const amqpManager = new AMQPManager(logger);
        await amqpManager.connect();

        const redisCacheManager = new RedisCacheManager();
        // Removida a chamada para redisCacheManager.connect() pois não existe esse método

        const registerController = new RegisterController(logger, redisCacheManager);

        const consumerManager = new ConsumerManager(
            logger,
            redisCacheManager,
            amqpManager,
            registerController
        );

        await consumerManager.initializeConsumers();
    } catch (error) {
        logger.error("Erro na inicialização:", error);
    }
})();