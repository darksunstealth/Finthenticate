import RegisterController from '../controller/registerController.js';
import Redis from '../services/redis/redis.js'
import Amqp from '../services/amqp/amqp.js'	
import Logger from '../services/logger/logger.js'; // Ajuste o caminho conforme necessário

const redis = new Redis()
const amqp = new Amqp()
export default async function registerRoutes(fastify, options) {
  // Instantiate the controller.
  // Adjust the dependencies as needed. Here we pass options or null values.
  const registerCtrl = new RegisterController(
    // options.emailService || null,
    redis,
    amqp,
    Logger
  );

  // Inicia o processador de batches
  registerCtrl.startBatchProcessor();

  fastify.post(
    '/register',
    { preHandler: registerCtrl.validateRegister.bind(registerCtrl) },
    registerCtrl.registerUser.bind(registerCtrl)
  );
  fastify.post('/change-password', registerCtrl.changePassword.bind(registerCtrl));
  fastify.post('/confirm-email', registerCtrl.confirmEmail.bind(registerCtrl));
}

