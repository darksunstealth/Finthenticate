import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

class registerController {
  constructor(
    redisCacheManager,
    amqpManager,
    logger
  ) {
    this.redisCacheManager = redisCacheManager;
    this.amqpManager = amqpManager;
    this.logger = logger;

    // Bind methods para preservar o contexto "this"
    this.registerUser = this.registerUser.bind(this);
    this.confirmEmail = this.confirmEmail.bind(this);
    this.processRegistrationBatch = this.processRegistrationBatch.bind(this);
    this.startBatchProcessor = this.startBatchProcessor.bind(this);

    // Inicializa o buffer de lote e inicia o processador
    this.registrationBatch = [];
    this.batchProcessingInterval = 100; // em milissegundos
    
    this.startBatchProcessor();
  }

  // Validação para Fastify (pre-handler)
  async validateRegister(request, reply) {
    const { email, password, terms } = request.body || {};
    
    // Validações básicas
    if (!email || !password) {
      return reply.code(400).send({ message: 'Email and password are required.' });
    }
    
    if (!email.includes('@') || !email.includes('.')) {
      return reply.code(400).send({ message: 'Invalid email format.' });
    }
    
    if (password.length < 8) {
      return reply.code(400).send({ message: 'Password must be at least 8 characters long.' });
    }
    
    if (!terms) {
      return reply.code(400).send({ message: 'You must agree to the terms of use.' });
    }
  }

  async registerUser(request, reply) {
    this.logger.info('Starting user registration process');

    const { email, password, terms } = request.body;
    const lowerEmail = email.toLowerCase().trim();

    if (!terms) {
      this.logger.warn('Terms of use were not accepted.', { email: lowerEmail });
      return reply.code(400).send({
        message: 'You must agree to the terms of use to create an account.'
      });
    }

    try {
      // Verifica se o email já existe usando multiHExists
      const emailExists = await this.redisCacheManager.multiHExists('USERS', lowerEmail);
      if (emailExists) {
        this.logger.warn('User already registered.', { email: lowerEmail });
        return reply.code(400).send({ message: 'Email is already in use.' });
      }
    } catch (error) {
      this.logger.error('Error checking duplicate email:', error);
      return reply.code(500).send({ message: 'Internal error verifying duplication.' });
    }

    // Coleta informações do dispositivo e IP
    const deviceInfo = request.headers['user-agent'] || 'Unknown';
    const ipAddress = request.ip || request.connection?.remoteAddress || 'Unknown';

    // Prepara dados para o lote
    const registrationData = {
      email: lowerEmail,
      password,
      terms,
      deviceInfo,
      ipAddress,
    };

    // Cria uma Promise para aguardar o processamento assíncrono
    const registrationPromise = new Promise((resolve, reject) => {
      registrationData.resolve = resolve;
      registrationData.reject = reject;
    });

    // Adiciona ao lote para processamento
    this.registrationBatch.push(registrationData);
    this.logger.info('Registration added to batch.', { email: lowerEmail });

    try {
      // Aguarda o resultado do processamento em lote
      const result = await registrationPromise;
      return reply.code(result.code).send({ message: result.message });
    } catch (e) {
      this.logger.error('Error during registration promise resolution:', e);
      return reply.code(500).send({ message: 'Unexpected error.' });
    }
  }

  async processRegistrationBatch() {
    if (this.registrationBatch.length === 0) return;

    // Remove todos os registros do lote para processamento
    const batch = this.registrationBatch.splice(0, this.registrationBatch.length);
    this.logger.info(`Processing batch with ${batch.length} registrations.`);

    // Extrai emails para verificação eficiente
    const emails = batch.map(reg => reg.email);
    
    try {
      // Verifica todos os emails de uma só vez (eficiente)
      const emailExistsResults = await this.redisCacheManager.multiHExists('USERS', emails);
      
      // Separa emails duplicados e registros válidos
      const validRegistrations = [];
      const duplicateEmails = [];
      
      for (const reg of batch) {
        if (emailExistsResults[reg.email]) {
          this.logger.warn('User already registered (batch):', { email: reg.email });
          reg.resolve({ code: 400, message: 'Email is already in use.' });
          duplicateEmails.push(reg.email);
        } else {
          validRegistrations.push(reg);
        }
      }
      
      this.logger.info(`Found ${duplicateEmails.length} duplicate emails and ${validRegistrations.length} valid registrations.`);
      
      // Se não houver registros válidos, encerra
      if (validRegistrations.length === 0) return;
      
      // Prepara dados para envio à fila (sem criar usuários aqui)
      const amqpMessages = [];
      
      for (const reg of validRegistrations) {
        try {
          // Hash da senha (por segurança, melhor não enviar senha em texto plano)
          const hashedPassword = await argon2.hash(reg.password);
          
          // Gera código de confirmação
          const confirmationCode = crypto.randomInt(100000, 999999).toString();
          const confirmationCodeExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          const userId = uuidv4();
          
          // Gera dados para envio à fila
          const userData = {
            userId,
            email: reg.email,
            password: hashedPassword,
            confirmationCode,
            confirmationCodeExpires,
            verified: false,
            terms: reg.terms,
            deviceInfo: reg.deviceInfo,
            ipAddress: reg.ipAddress,
            createdAt: new Date().toISOString()
          };
          
          amqpMessages.push(userData);
          reg.userData = userData; // Para referência ao resolver a Promise
        } catch (error) {
          this.logger.error('Error preparing registration data:', error, { email: reg.email });
          reg.resolve({ code: 500, message: 'Internal server error.' });
        }
      }
      
      // Envia dados para a fila RabbitMQ
      if (amqpMessages.length > 0) {
        const messageObj = {
          action: 'register_batch',
          data: amqpMessages,
        };
        
        await this.amqpManager.sendToQueue('register_user_queue', messageObj);
        this.logger.info(`Batch sent to AMQP queue with ${amqpMessages.length} registrations.`);
        
        // Resolve promessas para registros válidos
        validRegistrations.forEach((reg) => {
          if (reg.userData) {
            reg.resolve({
              code: 200,
              message: 'Registration request received. Please check your email for confirmation instructions.'
            });
          }
        });
      }
    } catch (error) {
      this.logger.error('Error in batch processing:', error);
      batch.forEach((reg) => {
        reg.resolve({ code: 500, message: 'Internal server error during registration.' });
      });
    }
  }

  startBatchProcessor() {
    setInterval(this.processRegistrationBatch, this.batchProcessingInterval);
  }

  async confirmEmail(request, reply) {
    const { email, code } = request.body;
    this.logger.info('[CONFIRM EMAIL] Received email confirmation request');

    if (!email || !code) {
      this.logger.warn('[CONFIRM EMAIL] Insufficient data.', { email, code });
      return reply.code(400).send({ message: 'Email and confirmation code are required.' });
    }

    // Encaminhar solicitação de confirmação para a fila de processamento
    try {
      const confirmationRequest = {
        action: 'confirm_email',
        data: {
          email: email.toLowerCase().trim(),
          code
        }
      };
      
      await this.amqpManager.sendToQueue('register_user_queue', confirmationRequest);
      this.logger.info('[CONFIRM EMAIL] Confirmation request sent to queue.', { email });
      
      return reply.code(202).send({ 
        message: 'Confirmation request received. If the code is valid, your email will be confirmed shortly.' 
      });
    } catch (error) {
      this.logger.error('[CONFIRM EMAIL] Error sending confirmation request to queue:', error);
      return reply.code(500).send({ message: 'Internal server error.' });
    }
  }

  async changePassword(request, reply) {
    const { email, currentPassword, newPassword } = request.body;
    
    if (!email || !currentPassword || !newPassword) {
      return reply.code(400).send({ message: 'All fields are required.' });
    }
    
    // Encaminhar solicitação de alteração de senha para a fila
    try {
      const passwordChangeRequest = {
        action: 'change_password',
        data: {
          email: email.toLowerCase().trim(),
          currentPassword,
          newPassword
        }
      };
      
      await this.amqpManager.sendToQueue('register_user_queue', passwordChangeRequest);
      
      return reply.code(202).send({ 
        message: 'Password change request received and is being processed.' 
      });
    } catch (error) {
      this.logger.error('Error sending password change request to queue:', error);
      return reply.code(500).send({ message: 'Internal server error.' });
    }
  }
}

export default registerController;