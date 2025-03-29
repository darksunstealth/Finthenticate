import jwt from 'jsonwebtoken';
import amqp from 'amqplib';

class LoginConsumer {
  constructor(redisClient, channel, queue) {
    this.redisClient = redisClient;
    this.channel = channel; // Initialize the channel
    this.queue = queue; // Initialize the queue
  }

  async processLoginBatch(loginDataArray) {
    if (!Array.isArray(loginDataArray)) {
      console.error('Erro: loginDataArray não é um array:', loginDataArray);
      throw new TypeError('loginDataArray deve ser um array.');
    }

    const results = [];
    const pipeline = this.redisClient.pipeline(); // Inicia o pipeline

    for (const loginData of loginDataArray) {
      const { email, deviceId, userId, connectionId } = loginData;

      if (!email || !deviceId || !userId || !connectionId) {
        console.warn('Dados de login incompletos:', loginData);
        results.push({ success: false, error: 'Dados de login incompletos.', connectionId });
        continue;
      }

      try {
        // Verificar dispositivo
        const isDeviceVerified = await this.redisClient.hGet(`DEVICE:${userId}`, deviceId) === 'verified';
        if (!isDeviceVerified) {
          const verificationCode = '123456'; // Código de verificação
          await this.sendVerificationEmail(email, verificationCode);
          console.log(`E-mail de verificação enviado para ${email}`);

          const tempToken = jwt.sign(
            { userId, email, deviceId },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
          );

          results.push({
            success: true,
            requireDeviceVerification: true,
            token: tempToken,
            connectionId,
            message: 'Dispositivo novo detectado. Código de verificação enviado.',
          });
          continue;
        }

        // Gerar tokens
        const tokenPayload = { id: userId, email };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '30m' });
        const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_SECRET_KEY, { expiresIn: '7d' });

        // Adicionar operações ao pipeline
        pipeline.set(`TOKEN:${userId}`, token);
        pipeline.set(`REFRESH_TOKEN:${userId}`, refreshToken);

        results.push({
          success: true,
          token,
          refreshToken,
          connectionId,
          message: 'Login bem-sucedido.',
        });
      } catch (error) {
        console.error(`Erro durante o processamento do login: ${error.message}`);
        results.push({ success: false, error: 'Erro ao processar o login.', connectionId });
      }
    }

    // Executar o pipeline
    try {
      await pipeline.exec();
      console.log('Operações do pipeline executadas com sucesso.');
    } catch (pipelineError) {
      console.error('Erro ao executar o pipeline no Redis:', pipelineError);
    }

    return results;
  }

  async verifyDevice(userId, deviceId) {
    // Verificar se o dispositivo já foi verificado no Redis
    const isDeviceVerified = await this.redisClient.hGet(`DEVICE:${userId}`, deviceId) === 'verified';
    return {
      requireDeviceVerification: !isDeviceVerified,
      verificationCode: '123456', // Código de verificação
    };
  }

  async sendVerificationEmail(email, verificationCode) {
    // Lógica para enviar e-mail de verificação (exemplo simplificado)
    console.log(`E-mail de verificação enviado para ${email} com código ${verificationCode}`);
  }
}

// Example usage:
async function initializeConsumer() {
  const connection = await amqp.connect(process.env.AMQP_URL);
  const channel = await connection.createChannel();
  const queue = 'login_queue'; // Replace with your actual queue name

  await channel.assertQueue(queue, { durable: true });

  const redisClient = {}; // Replace with your Redis client initialization
  const loginConsumer = new LoginConsumer(redisClient, channel, queue);

  // Start consuming messages
  loginConsumer.channel.consume(loginConsumer.queue, async (message) => {
    if (message !== null) {
      try {
        console.log("Mensagem recebida:", message.content.toString());

        // Parse the message
        const rawMessage = JSON.parse(message.content.toString());
        const loginDataArray = Array.isArray(rawMessage) ? rawMessage : [rawMessage];

        // Process login batch
        const loginResponses = await loginConsumer.processLoginBatch(loginDataArray);

        // Send responses via WebSocket
        loginResponses.forEach((response) => {
          const payload = {
            event: response.success ? "login_success" : "login_error",
            data: response,
          };
          loginConsumer.websocketManager.sendMessage(response.connectionId, payload);
        });

        loginConsumer.channel.ack(message);
      } catch (error) {
        console.error("Erro ao processar mensagem de login:", error);
        loginConsumer.channel.nack(message, false, false);
      }
    }
  });
}

initializeConsumer().catch((error) => {
  console.error("Erro ao inicializar o consumidor:", error);
});

export default LoginConsumer;