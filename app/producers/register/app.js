import Fastify from 'fastify';
import registerRoutes from './routes/registerRoutes.js';

const fastify = Fastify({
  logger: true,
});

fastify.register(registerRoutes, { prefix: '/api/v1/auth' });

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();