// LoginController.js
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';

class LoginController {
  constructor(redisClient, redisPublish) {
    this.redisClient = redisClient;
    this.redisPublish = redisPublish;
  }

  async processLoginBatch(loginDataArray) {
    if (!Array.isArray(loginDataArray)) {
      console.error('Error: loginDataArray is not an array:', loginDataArray);
      throw new TypeError('loginDataArray must be an array.');
    }

    const results = [];
    const pipeline = this.redisClient.createPipeline();

    for (const loginData of loginDataArray) {
      const { email, deviceId, userId, connectionId } = loginData;

      if (!email || !deviceId || !userId || !connectionId) {
        console.warn('Incomplete login data:', loginData);
        results.push({ success: false, error: 'Incomplete login data.', connectionId });
        continue;
      }

      try {
        // Check if device is verified
        const isDeviceVerified = await this.redisClient.hGet(`DEVICE:${userId}`, deviceId) === 'verified';

        // Check if user has 2FA enabled
        const userSecurityKey = `USER:SECURITY:${userId}`;
        const has2FAEnabled = await this.redisClient.hGet(userSecurityKey, 'has2FA') === 'true';

        if (!isDeviceVerified) {
          // Generate verification code for new device
          const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
          
          // Store verification code 
          const verificationKey = `DEVICE_VERIFICATION:${userId}:${deviceId}`;
          await this.redisClient.set(verificationKey, verificationCode, 'EX', 600); // 10 minutes expiry
          
          // Send email with verification code
          await this.sendVerificationEmail(email, verificationCode);

          // Create temporary token for verification process
          const tempToken = jwt.sign(
            { userId, email, deviceId },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
          );

          // Publish device verification event
          this.redisPublish.publish('auth_events', JSON.stringify({
            type: 'new_device_detected',
            userId,
            deviceId,
            connectionId,
            timestamp: new Date().toISOString()
          }));

          results.push({
            success: true,
            requireDeviceVerification: true,
            token: tempToken,
            connectionId,
            message: 'Novo dispositivo detectado. Código de verificação enviado por e-mail.',
          });
          continue;
        }
        
        // If device is verified but user has 2FA enabled
        if (has2FAEnabled) {
          // Generate temporary session for 2FA
          const tempSessionKey = `temp:2fa:${email.toLowerCase()}`;
          const tempSessionData = JSON.stringify({ 
            userId, 
            deviceId, 
            connectionId,
            timestamp: Date.now() 
          });
          
          // Store temp session with 10 min expiry
          await this.redisClient.set(tempSessionKey, tempSessionData, 'EX', 600);
          
          // Publish 2FA required event
          this.redisPublish.publish('auth_events', JSON.stringify({
            type: '2fa_required',
            userId,
            connectionId,
            timestamp: new Date().toISOString()
          }));
          
          results.push({
            success: true,
            require2FA: true,
            connectionId,
            message: 'Verificação de dois fatores necessária.',
          });
          continue;
        }

        // If device is verified and no 2FA, proceed with login
        const tokenPayload = { id: userId, email };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '30m' });
        const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_SECRET_KEY, { expiresIn: '7d' });

        // Add token to Redis
        pipeline.set(`TOKEN:${userId}`, token, 'EX', 1800); // 30 minutes
        pipeline.set(`REFRESH_TOKEN:${userId}`, refreshToken, 'EX', 604800); // 7 days

        // Record successful login
        pipeline.hSet(`USER:LOGIN:${userId}`, 'last_login', Date.now());
        pipeline.hSet(`USER:LOGIN:${userId}`, 'last_device', deviceId);

        // Publish successful login event
        this.redisPublish.publish('auth_events', JSON.stringify({
          type: 'login_success',
          userId,
          deviceId,
          connectionId,
          timestamp: new Date().toISOString()
        }));

        results.push({
          success: true,
          token,
          refreshToken,
          connectionId,
          message: 'Login efetuado com sucesso.',
        });
      } catch (error) {
        console.error(`Error during login processing: ${error.message}`);
        
        // Publish login failure event
        this.redisPublish.publish('auth_events', JSON.stringify({
          type: 'login_failure',
          userId: loginData.userId || 'unknown',
          connectionId: loginData.connectionId,
          error: error.message,
          timestamp: new Date().toISOString()
        }));
        
        results.push({ success: false, error: 'Error processing login.', connectionId });
      }
    }

    try {
      await this.redisClient.execPipeline(pipeline);
      console.log('Pipeline operations executed successfully.');
    } catch (pipelineError) {
      console.error('Error executing pipeline in Redis:', pipelineError);
    }

    return results;
  }

  async sendVerificationEmail(email, verificationCode) {
    console.log(`Verification email sent to ${email} with code ${verificationCode}`);
    // Implementar com seu provedor de e-mail
  }

  verify2FACode(user, twoFactorCode) {
    if (!twoFactorCode) return false;
    return speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: twoFactorCode,
    });
  }
  
  async verifyDevice(userId, deviceId, verificationCode) {
    try {
      const verificationKey = `DEVICE_VERIFICATION:${userId}:${deviceId}`;
      const storedCode = await this.redisClient.get(verificationKey);
      
      if (!storedCode || storedCode !== verificationCode) {
        // Publish verification failure event
        this.redisPublish.publish('auth_events', JSON.stringify({
          type: 'device_verification_failed',
          userId,
          deviceId,
          timestamp: new Date().toISOString()
        }));
        
        return { success: false, message: 'Invalid verification code' };
      }
      
      // Add device to user's verified devices
      await this.redisClient.hSet(`DEVICE:${userId}`, deviceId, 'verified');
      
      // Delete verification key
      await this.redisClient.del(verificationKey);
      
      // Publish verification success event
      this.redisPublish.publish('auth_events', JSON.stringify({
        type: 'device_verified',
        userId,
        deviceId,
        timestamp: new Date().toISOString()
      }));
      
      return { success: true, message: 'Device successfully verified' };
    } catch (error) {
      console.error(`verifyDevice error: ${error.message}`);
      throw new Error("Error verifying device.");
    }
  }
}

export default LoginController;