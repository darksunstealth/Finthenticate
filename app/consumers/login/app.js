// server.js
import Fastify from 'fastify';
import cors from '@fastify/cors';
import logger from './services/logger/logger.js';
import dotenv from 'dotenv';
dotenv.config();

import { runLoginWorker } from './loginWorker.js';
import LoginController from './loginController.js';
import Redis from './services/redis/redis.js';
import RedisPublish from './services/redis/redisPublish.js';
import loginRoutes from './routes/loginRoutes.js';

const fastify = Fastify({ 
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty'
    }
  } 
});

// Register dependencies as decorators so they're available in routes
fastify.decorate('loginController', null);
fastify.decorate('redisPublish', null);

// Habilita CORS para todas as origens
await fastify.register(cors, { origin: true });

const PORT = process.env.PORT || 3002;

const redis = new Redis();
const redisPublish = new RedisPublish(logger);
const loginController = new LoginController(redis, redisPublish, logger);

// Set the decorators
fastify.loginController = loginController;
fastify.redisPublish = redisPublish;

// Register the login routes - this replaces the hardcoded /verify-device route
fastify.register(loginRoutes, { prefix: '/api' });

// Rota básica
fastify.get('/', async () => {
  return { 
    status: 'online', 
    service: 'Login Consumer Api', 
    timestamp: new Date().toISOString() 
  };
});

// Add error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(`Error processing request: ${error.message}`);
  reply.status(error.statusCode || 500).send({ 
    success: false, 
    message: error.message || 'Internal Server Error' 
  });
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`🚀 API server running on port ${PORT}`);

    // Inicia o worker AMQP
    await runLoginWorker(loginController, redisPublish);
  } catch (err) {
    fastify.log.error(`[ERROR] Startup failed: ${err.message}`);
    process.exit(1);
  }
};

start();