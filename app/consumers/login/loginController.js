import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';

// Suponha que o logger esteja definido ou importado
// Exemplo: import logger from './logger';

class LoginController {
  constructor(redisClient, redisPublish, logger) {
    this.redisClient = redisClient;
    this.redisPublish = redisPublish;
    this.logger = logger;
    
    // Valida variáveis de ambiente críticas
    if (!process.env.JWT_SECRET || !process.env.REFRESH_SECRET_KEY) {
      this.logError('Initialization', 'Missing required environment variables: JWT_SECRET or REFRESH_SECRET_KEY');
    }
  }
  
  // Métodos auxiliares para logging
  logDebug(context, message, data = null) {
    let formattedMessage = `[DEBUG] [${context}] ${message}`;
    if (data !== null && typeof data !== 'object') {
      formattedMessage += `: ${data}`;
      this.logger.debug(formattedMessage);
    } else if (data !== null) {
      this.logger.debug(formattedMessage, data);
    } else {
      this.logger.debug(formattedMessage);
    }
  }
  
  logInfo(context, message, data = null) {
    const formattedMessage = `[INFO] [${context}] ${message}`;
    data ? this.logger.info(formattedMessage, data) : this.logger.info(formattedMessage);
  }
  
  logError(context, message, error = null) {
    const formattedMessage = `[ERROR] [${context}] ${message}`;
    if (error) {
      const errorDetails = `${error.message || 'No message'}\nStack: ${error.stack || 'No stack'}`;
      this.logger.error(formattedMessage, errorDetails);
    } else {
      this.logger.error(formattedMessage);
    }
  }

  async processLoginBatch(loginDataArray) {
    try {
      await this.redisClient.ping();
      this.logInfo('Redis Connection', 'Redis connection verified');
    } catch (redisError) {
      this.logError('Redis Connection', 'Redis connection failed', redisError);
    }
    
    this.logInfo('Batch Processing', 'Login batch received', JSON.stringify(loginDataArray, null, 2));
    this.logInfo('Batch Processing', JSON.stringify(loginDataArray));
    if (!Array.isArray(loginDataArray)) {
      this.logError('Batch Processing', 'loginDataArray is not an array', loginDataArray);
      throw new TypeError('loginDataArray must be an array.');
    }
  
    const flatData = loginDataArray.flat(Infinity);
    this.logInfo('Batch Processing', 'Flat data', JSON.stringify(flatData, null, 2));
  
    const results = [];
    const pipeline = this.redisClient.createPipeline();
  
    for (const loginData of flatData) {
      let payload = null;
  
      if (loginData && loginData.data) {
        if (typeof loginData.data === 'string') {
          try {
            payload = JSON.parse(loginData.data);
          } catch (err) {
            this.logError('Payload Parsing', 'Parsing loginData.data string failed', err);
            payload = null;
          }
        } else if (typeof loginData.data === 'object') {
          payload = loginData.data;
        }
      }
      if (!payload) {
        payload = loginData;
      }
  
      this.logInfo('Payload Processing', 'Login payload', JSON.stringify(payload, null, 2));
  
      const { email, deviceId, userId, connectionId } = payload;
  
      this.logDebug('Fields Debug', 'Extracted fields', {
        email,
        deviceId,
        userId,
        connectionId,
        emailValid: !!email,
        deviceIdValid: !!deviceId,
        userIdValid: !!userId,
        connectionIdValid: !!connectionId
      });
  
      if (
        !email || (typeof email === 'string' && email.trim() === '') ||
        !deviceId || (typeof deviceId === 'string' && deviceId.trim() === '') ||
        !userId || (typeof userId === 'string' && userId.trim() === '') ||
        !connectionId || (typeof connectionId === 'string' && connectionId.trim() === '')
      ) {
        this.logInfo('Incomplete Data', 'Incomplete login data', JSON.stringify(loginData, null, 2));
        results.push({ success: false, error: 'Incomplete login data.', connectionId });
        continue;
      }
  
      this.logDebug('LOGIN', `Processing login for user: ${email}, userId: ${userId}, connectionId: ${connectionId}`);
  
      try {
        let isDeviceVerified;
        try {
          isDeviceVerified = await this.redisClient.hget(`DEVICE:${userId}`, deviceId) === 'verified';
          this.logDebug('Device Verification', 'Device verification check result', isDeviceVerified);
        } catch (deviceError) {
          this.logError('DEVICE_VERIFY', `Failed to verify device for user ${userId}`, deviceError);
          throw deviceError;
        }
  
        let has2FAEnabled;
        try {
          const userSecurityKey = `USER:SECURITY:${userId}`;
          has2FAEnabled = await this.redisClient.hget(userSecurityKey, 'has2FA') === 'true';
          this.logDebug('2FA Status', '2FA status check result', has2FAEnabled);
        } catch (twoFAError) {
          this.logError('2FA Status', 'Failed to check 2FA status', twoFAError);
          throw twoFAError;
        }
  
        if (!isDeviceVerified) {
          const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
          const verificationKey = `DEVICE_VERIFICATION:${userId}:${deviceId}`;
          await this.redisClient.set(verificationKey, verificationCode, 'EX', 600);
          await this.sendVerificationEmail(email, verificationCode);
  
          const tempToken = jwt.sign(
            { userId, email, deviceId },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
          );
  
          this.logDebug('Temporary Token', `Temporary token for unverified device generated for user ${userId}`, tempToken);
            
          this.redisPublish.publish('user-events', JSON.stringify({
            type: 'new_device_detected',
            userId,
            deviceId,
            connectionId,
            timestamp: new Date().toISOString()
          }));
  
          this.logInfo('New Device', `New device detected for user ${userId}. Verification email sent.`);
          
          results.push({
            success: true,
            requireDeviceVerification: true,
            token: tempToken,
            connectionId,
            message: 'New device detected. Verification code sent via email.',
          });
          continue;
        }
  
        if (has2FAEnabled) {
          const tempSessionKey = `temp:2fa:${email.toLowerCase()}`;
          const tempSessionData = JSON.stringify({ userId, deviceId, connectionId, timestamp: Date.now() });
          await this.redisClient.set(tempSessionKey, tempSessionData, 'EX', 600);
  
          this.redisPublish.publish('user-events', JSON.stringify({
            type: '2fa_required',
            userId,
            connectionId,
            timestamp: new Date().toISOString()
          }));
  
          this.logInfo('2FA Required', `2FA required for user ${userId}. Temporary session created.`);
  
          results.push({
            success: true,
            require2FA: true,
            connectionId,
            message: 'Two-factor authentication required.',
          });
          continue;
        }
  
        const tokenPayload = { id: userId, email };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '30m' });
        const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_SECRET_KEY, { expiresIn: '7d' });
  
        this.logDebug('Token Generation', `JWT and refresh token generated for user ${userId}`);
        this.logDebug('JWT Token', `Token generated for user ${userId}`, token);
        this.logDebug('Refresh Token', 'Refresh token generated', refreshToken);
  
        pipeline.set(`TOKEN:${userId}`, token, 'EX', 1800);
        pipeline.set(`REFRESH_TOKEN:${userId}`, refreshToken, 'EX', 604800);
        pipeline.hset(`USER:LOGIN:${userId}`, 'last_login', Date.now());
        pipeline.hset(`USER:LOGIN:${userId}`, 'last_device', deviceId);
  
        this.redisPublish.publish('user-events', JSON.stringify({
          type: 'login_success',
          userId,
          deviceId,
          connectionId,
          timestamp: new Date().toISOString()
        }));
  
        this.logInfo('Login Success', `Login success event published for user ${userId}`);
  
        results.push({
          success: true,
          token,
          refreshToken,
          connectionId,
          message: 'Login successful.',
        });
      } catch (error) {
        this.logError('Login Processing', `Exception during login processing for user ${userId} and error ${error}`);
        this.logDebug('Environment Variables', 'Environment variables present', {
          JWT_SECRET: !!process.env.JWT_SECRET,
          REFRESH_SECRET_KEY: !!process.env.REFRESH_SECRET_KEY
        });
        
        this.redisPublish.publish('user-events', JSON.stringify({
          type: 'login_failure',
          userId: userId || 'unknown',
          connectionId,
          error: error.message,
          timestamp: new Date().toISOString()
        }));
  
        results.push({ success: false, error: 'Error processing login.', connectionId });
      }
    }
  
    try {
      await this.redisClient.execPipeline(pipeline);
      this.logInfo('Redis Pipeline', 'Redis pipeline operations executed successfully.');
    } catch (pipelineError) {
      this.logError('Redis Pipeline', 'Failed to execute Redis pipeline', pipelineError);
    }
  
    return results;
  }
  
  async sendVerificationEmail(email, verificationCode) {
    this.logInfo('Email Service', `Sending verification code to ${email}: ${verificationCode}`);
    // Implemente o serviço de e-mail aqui
  }

  verify2FACode(user, twoFactorCode) {
    if (!twoFactorCode) return false;
    return speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: twoFactorCode,
    });
  }

  async verifyDeviceAndLogin(userId, deviceId, code, connectionId, email) {
    const verificationKey = `DEVICE_VERIFICATION:${userId}:${deviceId}`;
    const storedCode = await this.redisClient.get(verificationKey);

    if (!storedCode || storedCode !== code) {
      this.redisPublish.publish('user-events', JSON.stringify({
        type: 'device_verification_failed',
        userId,
        deviceId,
        connectionId,
        timestamp: new Date().toISOString()
      }));
      return { success: false, message: 'Invalid verification code' };
    }

    await this.redisClient.hset(`DEVICE:${userId}`, deviceId, 'verified');
    await this.redisClient.del(verificationKey);

    const tokenPayload = { id: userId, email };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '30m' });
    const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_SECRET_KEY, { expiresIn: '7d' });

    this.logDebug('Device Verification', `Device verified and tokens issued for user ${userId}`);
    this.logDebug('JWT Token', token);
    this.logDebug('Refresh Token', refreshToken);

    const pipeline = this.redisClient.createPipeline();
    pipeline.set(`TOKEN:${userId}`, token, 'EX', 1800);
    pipeline.set(`REFRESH_TOKEN:${userId}`, refreshToken, 'EX', 604800);
    pipeline.hset(`USER:LOGIN:${userId}`, 'last_login', Date.now());
    pipeline.hset(`USER:LOGIN:${userId}`, 'last_device', deviceId);
    await this.redisClient.execPipeline(pipeline);

    this.redisPublish.publish('user-events', JSON.stringify({
      type: 'device_verified',
      userId,
      deviceId,
      connectionId,
      timestamp: new Date().toISOString()
    }));

    return {
      success: true,
      message: 'Device verified and login completed.',
      token,
      refreshToken,
      connectionId
    };
  }

  async verifyDevice(userId, deviceId, verificationCode) {
    try {
      const verificationKey = `DEVICE_VERIFICATION:${userId}:${deviceId}`;
      const storedCode = await this.redisClient.get(verificationKey);

      if (!storedCode || storedCode !== verificationCode) {
        this.redisPublish.publish('user-events', JSON.stringify({
          type: 'device_verification_failed',
          userId,
          deviceId,
          timestamp: new Date().toISOString()
        }));
        return { success: false, message: 'Invalid verification code' };
      }

      await this.redisClient.hset(`DEVICE:${userId}`, deviceId, 'verified');
      await this.redisClient.del(verificationKey);

      this.redisPublish.publish('user-events', JSON.stringify({
        type: 'device_verified',
        userId,
        deviceId,
        timestamp: new Date().toISOString()
      }));

      this.logInfo('Device Verification', `Device ${deviceId} verified successfully for user ${userId}`);
      return { success: true, message: 'Device successfully verified' };
    } catch (error) {
      this.logError('DEVICE_VERIFY', `verifyDevice() failed for user ${userId}`, error);
      throw new Error("Error verifying device.");
    }
  }
}

export default LoginController;
