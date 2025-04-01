import { verifyDeviceSchema, verify2FASchema } from '../schemas/loginSchemas.js';

export default async function loginRoutes(fastify, options) {
  const { loginController, redisPublish } = fastify;
  
  // Health check route
  fastify.get('/health', async (request, reply) => {
    return { status: 'OK', timestamp: new Date().toISOString() };
  });

  // Device verification route
  fastify.post('/verify-device', {
    schema: verifyDeviceSchema,
    handler: async (request, reply) => {
      const { userId, deviceId, verificationCode, connectionId, email } = request.body;
      
      try {
        fastify.log.info(`Processing device verification for user ${userId}`);
        
        // Verify device and login in one step
        const result = await loginController.verifyDeviceAndLogin(
          userId,
          deviceId,
          verificationCode, // This was previously named 'code'
          connectionId,
          email
        );
        
        if (!result.success) {
          return reply.code(400).send({
            success: false,
            message: result.message || 'Device verification failed'
          });
        }
        
        return result;
      } catch (error) {
        fastify.log.error(`Error verifying device: ${error.message}`);
        
        // Publish error event via Redis
        redisPublish.publish('user-events', JSON.stringify({
          type: 'device_verification_error',
          userId,
          deviceId,
          connectionId,
          error: error.message,
          timestamp: new Date().toISOString()
        }));
        
        return reply.code(500).send({
          success: false,
          message: 'Internal server error during device verification'
        });
      }
    }
  });

  // 2FA verification route
  fastify.post('/verify-2fa', {
    schema: verify2FASchema,
    handler: async (request, reply) => {
      const { email, twoFactorCode, connectionId } = request.body;
      
      try {
        fastify.log.info(`Processing 2FA verification for email ${email}`);
        
        // Get temporary session from Redis
        const tempSessionKey = `temp:2fa:${email.toLowerCase()}`;
        const tempSessionData = await loginController.redisClient.get(tempSessionKey);
        
        if (!tempSessionData) {
          return reply.code(400).send({
            success: false,
            message: 'No active 2FA session found'
          });
        }
        
        const session = JSON.parse(tempSessionData);
        const { userId, deviceId } = session;
        
        // Get user's 2FA secret
        const userSecurityKey = `USER:SECURITY:${userId}`;
        const twoFactorSecret = await loginController.redisClient.hget(userSecurityKey, 'twoFactorSecret');
        
        // Verify 2FA code
        const isCodeValid = loginController.verify2FACode({ twoFactorSecret }, twoFactorCode);
        
        if (!isCodeValid) {
          // Publish failure event
          redisPublish.publish('user-events', JSON.stringify({
            type: '2fa_verification_failed',
            userId,
            connectionId: connectionId || session.connectionId,
            timestamp: new Date().toISOString()
          }));
          
          return reply.code(400).send({
            success: false,
            message: 'Invalid 2FA code'
          });
        }
        
        // Generate tokens
        const tokenPayload = { id: userId, email };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '30m' });
        const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_SECRET_KEY, { expiresIn: '7d' });
        
        // Store tokens in Redis
        const pipeline = loginController.redisClient.createPipeline();
        pipeline.set(`TOKEN:${userId}`, token, 'EX', 1800);
        pipeline.set(`REFRESH_TOKEN:${userId}`, refreshToken, 'EX', 604800);
        pipeline.hset(`USER:LOGIN:${userId}`, 'last_login', Date.now());
        pipeline.hset(`USER:LOGIN:${userId}`, 'last_device', deviceId);
        pipeline.del(tempSessionKey);
        await loginController.redisClient.execPipeline(pipeline);
        
        // Publish success event
        redisPublish.publish('user-events', JSON.stringify({
          type: 'login_success',
          userId,
          deviceId,
          connectionId: connectionId || session.connectionId,
          timestamp: new Date().toISOString()
        }));
        
        return {
          success: true,
          message: '2FA verification successful',
          token,
          refreshToken
        };
      } catch (error) {
        fastify.log.error(`Error verifying 2FA: ${error.message}`);
        
        return reply.code(500).send({
          success: false,
          message: 'Internal server error during 2FA verification'
        });
      }
    }
  });
}