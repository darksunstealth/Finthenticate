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
            // Consume from the correct queue: register_user_queue
            await this.amqpManager.consume("register_user_queue", async (message) => {
                this.logger.debug("Message received:", message);
                this.logger.info(`MESSAGE VALUE: ${JSON.stringify(message)}`);

                await this.registerController.handleMessage(message);
            });
            this.logger.info("Register consumers successfully initialized.");
        } catch (error) {
            this.logger.error("Error initializing consumers:", error);
        }
    }
}

// Main initialization function
(async function start() {
    try {
        logger.info("Starting register consumer service...");

        // Initialize AMQP connection
        const amqpManager = new AMQPManager(logger);
        await amqpManager.connect();
        logger.info("AMQP connection established");

        // Initialize Redis connection
        const redisCacheManager = new RedisCacheManager();
        logger.info("Redis cache manager initialized");

        // Create the controller for handling registration messages
        const registerController = new RegisterController(logger, redisCacheManager);
        logger.info("Register controller initialized");

        // Create and start the consumer manager
        const consumerManager = new ConsumerManager(
            logger,
            redisCacheManager,
            amqpManager,
            registerController
        );

        // Start consuming messages
        await consumerManager.initializeConsumers();
        logger.info("Register consumer now listening for messages");

    } catch (error) {
        logger.error("Error during initialization:", error);
        process.exit(1);
    }
})();