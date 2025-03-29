// server.js

import Fastify from 'fastify';
import dotenv from 'dotenv';
dotenv.config();

import logger from './logger/logger.js'; // seu logger
import RedisCacheManager from './services/redis/redis.js';
import AMQPManager from './services/amqp/amqp.js';
// import EmailService from './services/mail/email_service.js';
// import { sequelize } from './models/index.js';
// import models from './models/index.js';
// import CacheManager from './services/lru-cache/lru-cache.js';

// Importa o LoginProducer refatorado
import LoginProducer from './app/producers/login/LoginProducer.js';

const fastify = Fastify({
  logger: false,
});

const PORT = process.env.PORT || 3001;

// *** Instâncias de serviços essenciais ***
const redisCacheManager = new RedisCacheManager(logger);
const amqpManager = new AMQPManager(logger);
// const cacheManager = new CacheManager(logger);
// const emailService = new EmailService(redisCacheManager, logger);

// Podemos usar um array para armazenar o batch local
const loginBatch = [];

// *** Producer refatorado ***
const loginProducer = new LoginProducer(fastify, {
  logger,
  redisCacheManager,
  // emailService,
  amqpManager,
  // models,
  // Aqui passamos a referência para o batch
  loginBatch,
  // Tamanho máximo antes de enviar
  batchSize: parseInt(process.env.AMQP_BATCH_SIZE || '100', 10)
});

// Opcional: iniciar o batch no mesmo processo

// Rota padrão de verificação
fastify.get('/', async (request, reply) => {
  reply.send({
    status: 'online',
    service: 'Login API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// *** Função de inicialização ***
const startServer = async () => {
  try {
    logger.debug('[DEBUG] Conectando ao banco de dados...');
    // await sequelize.authenticate();
    logger.info('[INFO] Banco de dados conectado.');

    logger.debug('[DEBUG] Inicializando RabbitMQ...');
    await amqpManager.initialize();
    logger.info('[INFO] RabbitMQ inicializado.');

    // Inicia o servidor Fastify
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    logger.info(`Servidor rodando na porta ${PORT}`);
  } catch (err) {
    logger.error('[ERROR] Erro ao iniciar servidor:', err);
    process.exit(1);
  }
};

startServer();
