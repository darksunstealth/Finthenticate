import Fastify from 'fastify';
import cors from '@fastify/cors';
import logger from './services/logger/logger.js';
import registerRoutes from './routes/registerRoutes.js';

const fastify = Fastify({
  logger: true,
});

// 🟡 Inicialização do servidor
logger.info('Iniciando o servidor Fastify...');

// 🟢 Registro do plugin CORS
await fastify.register(cors, {
  origin: true // Aceita qualquer origem
});
logger.info('Plugin CORS registrado com sucesso.');

// 🟢 Registro das rotas de autenticação
fastify.register(registerRoutes, { prefix: '/api/v1/auth' });
logger.info('Rotas de autenticação registradas em /api/v1/auth.');

const start = async () => {
  try {
    const PORT = process.env.PORT || 3001;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    const address = fastify.server.address();
    logger.info(`🚀 Servidor escutando em http://${address.address}:${address.port}`);
  } catch (err) {
    logger.error('❌ Erro ao iniciar o servidor:', err);
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
