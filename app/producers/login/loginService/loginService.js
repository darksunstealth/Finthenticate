/* ===========================
   services/loginService.js
   =========================== */

   import argon2 from "argon2";
   import jwt from "jsonwebtoken";
   import speakeasy from "speakeasy";
   import { sanitizeInput, validateLoginInput, isDuplicateInBatch } from "./utils/utils.js";
   
   // We'll receive these references once at init.
   let logger, redisCacheManager, emailService, amqpManager, models, loginBatch, batchSize;
   let batchTimeout = null;

   // We define JWT secrets here for convenience
   const JWT_SECRET = process.env.JWT_SECRET;
   const REFRESH_SECRET = process.env.REFRESH_SECRET_KEY;
   
   // This function acts like "init" for this service.
   export function initLoginService(deps) {
     // deps might have { logger, redisCacheManager, emailService, amqpManager, models, loginBatch, batchSize }
     logger = deps.logger;
     redisCacheManager = deps.redisCacheManager;
     emailService = deps.emailService;
     amqpManager = deps.amqpManager;
     models = deps.models;
     loginBatch = deps.loginBatch;
     batchSize = deps.batchSize || 100;
   }
   
   //================================================//
   // ROTA: /api/v1/auth/login
   //================================================//
   export async function loginHandler(req, res) {
    const { email, password, deviceId, connectionId } = req.body;
    const clientIp = req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress;
  
    logger.info(`[login] Requisição recebida | email: ${email}, deviceId: ${deviceId}, connId: ${connectionId}, IP: ${clientIp}`);
  
    try {
      const sanitizedEmail = sanitizeInput(email);
      const sanitizedPassword = sanitizeInput(password);
  
      if (!validateLoginInput(sanitizedEmail, sanitizedPassword) || !deviceId || !connectionId) {
        logger.warn(`[login] Dados inválidos | email: ${email}, IP: ${clientIp}`);
        return res.status(400).send({ error: "Invalid input." });
      }
  
      await checkLoginAttempts(sanitizedEmail, clientIp);
  
      const user = await findUserByEmail(sanitizedEmail);
      if (!user) {
        logger.warn(`[login] Usuário não encontrado | email: ${sanitizedEmail}`);
        await recordFailedLogin(sanitizedEmail, clientIp, req.headers["user-agent"]);
        return res.status(401).send({ error: "Invalid user or password." });
      }
  
      logger.info(`[login] Usuário encontrado | email: ${user.email}, userId: ${user.userId}`);
  
      const isPasswordValid = await verifyPassword(sanitizedPassword, user.password);
      if (!isPasswordValid) {
        logger.warn(`[login] Senha incorreta | email: ${sanitizedEmail}`);
        await recordFailedLogin(sanitizedEmail, clientIp, req.headers["user-agent"]);
        return res.status(401).send({ error: "Invalid user or password." });
      }
  
      const loginData = {
        email: sanitizedEmail,
        deviceId,
        userId: user.userId,
        connectionId,
      };
  
      if (isDuplicateInBatch(loginBatch, loginData)) {
        logger.warn(`[login] Requisição duplicada detectada | email: ${sanitizedEmail}`);
        return res.status(409).send({ error: "Duplicate login request." });
      }
  
      logger.info(`[login] Requisição válida, adicionando ao batch | email: ${sanitizedEmail}`);
      loginBatch.push({ data: loginData });
  
      if (loginBatch.length >= batchSize) {
        logger.info("[login] Batch cheio, enviando imediatamente via AMQP...");
        await sendBatchToAMQP();
      } else {
        if (!batchTimeout) {
          batchTimeout = setTimeout(async () => {
            logger.info("[login] Timeout atingido, enviando batch parcial via AMQP...");
            await sendBatchToAMQP();
            batchTimeout = null;
          }, 300); // 3 segundos
        }
      }
  
      return res.status(202).send({
        success: true,
        message: "Login processing. Await response via WebSocket.",
      });
    } catch (error) {
      logger.error(`[login] Erro inesperado | ${error.message}`);
      return res.status(500).send({ error: "Error processing login." });
    }
  }
  
  
  
   
   //================================================//
   // ROTA: /api/v1/logout
   //================================================//
   export async function logoutHandler(req, res) {
     const token = req.headers.authorization?.split(" ")[1];
     if (!token) {
       return res.status(400).send({ error: "Authentication token not provided." });
     }
   
     try {
       const decoded = jwt.verify(token, JWT_SECRET);
       const userId = decoded.id;
   
       // Invalidate session
       const sessionKey = `session:user:${userId}`;
       await redisCacheManager.del(sessionKey);
       logger.info(`User session ${userId} removed from Redis.`);
   
       await redisCacheManager.zrem("SESSION:USERS", userId.toString());
       logger.info(`User ${userId} removed from SESSION:USERS and invalidated.`);
   
       await stopMonitoringForUser(userId);
   
       return res.send({
         success: true,
         message: "Logout successful.",
       });
     } catch (error) {
       logger.error(`Logout error: ${error.message}`);
       return res.status(500).send({ error: "Error during logout." });
     }
   }
   

   export async function sendBatchToAMQP() {
    if (loginBatch.length === 0) return;
  
    try {
      const payload = JSON.stringify(loginBatch);
      await amqpManager.sendToQueue("login_queue", Buffer.from(payload));
      logger.info(`[sendBatchToAMQP] Sent batch, size: ${loginBatch.length}`);
      loginBatch.splice(0, loginBatch.length); // Clear array
    } catch (error) {
      logger.error(`Error sending batch: ${error.message}`);
    }
  }
  
   
   export async function checkLoginAttempts(email, ip) {
     const loginAttemptsKey = `LOGIN_ATTEMPTS:${email}:${ip}`;
     const blockDuration = 15 * 60 * 1000;
     const maxAttempts = 5;
     const currentTime = Date.now();
   
     try {
       const recentAttempts = await redisCacheManager.zCount(
         loginAttemptsKey,
         currentTime - blockDuration,
         "+inf"
       );
   
       const pipeline = redisCacheManager.createPipeline();
       pipeline.zadd(loginAttemptsKey, currentTime, currentTime.toString());
       pipeline.zremrangebyscore(loginAttemptsKey, "-inf", currentTime - blockDuration);
       await redisCacheManager.execPipeline(pipeline);
   
       if (recentAttempts >= maxAttempts) {
         logger.warn(`[checkLoginAttempts] Account locked: email ${email}, IP: ${ip}`);
         throw new Error("Account locked.");
       }
     } catch (error) {
       logger.error(`[checkLoginAttempts] Error: ${error.message}`);
       throw new Error("Error checking login attempts.");
     }
   }
   
   export async function recordFailedLogin(email, ip, userAgent) {
     const loginAttemptsKey = `LOGIN_ATTEMPTS:${email}:${ip}`;
     const currentTime = Date.now();
   
     try {
       const pipeline = redisCacheManager.createPipeline();
       pipeline.zadd(loginAttemptsKey, currentTime, currentTime.toString());
       pipeline.expire(loginAttemptsKey, 15 * 60);
       await redisCacheManager.execPipeline(pipeline);
   
       logger.info(`[recordFailedLogin] for email: ${email}, IP: ${ip}`);
     } catch (error) {
       logger.error(`[recordFailedLogin] error: ${error.message}`);
     }
   }
   
   export async function findUserByEmail(email) {
    const functionName = "[findUserByEmail]";
    try {
      logger.debug(`${functionName} buscando usuário com email: ${email}`);
      const pipeline = redisCacheManager.createPipeline();
      pipeline.hget("USERS", email.toLowerCase());
      const results = await redisCacheManager.execPipeline(pipeline);
  
      const userId = results[0][1];
      if (!userId) {
        logger.warn(`${functionName} nenhum userId encontrado para: ${email}`);
        return null;
      }
  
      logger.debug(`${functionName} userId encontrado: ${userId}`);
      const userData = await redisCacheManager.hgetall(`USER_DATA_${userId}`);
  
      if (!userData || (!userData.userId && !userData.id)) {
        logger.warn(`${functionName} dados inválidos para o userId: ${userId} | Conteúdo: ${JSON.stringify(userData)}`);
        return null;
      }
  
      userData.userId = userId;
      return userData;
    } catch (error) {
      logger.error(`${functionName} erro ao buscar usuário: ${error.message}`);
      throw new Error("Error searching user in Redis.");
    }
  }
  
   
   export async function verifyPassword(plainPassword, hashedPassword) {
     try {
       logger.debug("[verifyPassword]...");
       const hashingOptions = {
         type: argon2.argon2id,
         memoryCost: 512,
         timeCost: 2,
         parallelism: 1,
       };
       const isMatch = await argon2.verify(hashedPassword, plainPassword, hashingOptions);
       isMatch ? logger.info("[verifyPassword] success.") : logger.warn("[verifyPassword] fail.");
       return isMatch;
     } catch (error) {
       logger.error(`[verifyPassword] error: ${error.message}`);
       throw new Error("Error verifying password.");
     }
   }
   
   export function verify2FACode(user, twoFactorCode) {
     if (!twoFactorCode) return false;
     return speakeasy.totp.verify({
       secret: user.twoFactorSecret,
       encoding: "base32",
       token: twoFactorCode,
     });
   }
   
   export async function manageUserSession(userId, token) {
     const sessionKey = `session:user:${userId}`;
     const sessionData = {
       token,
       lastActivity: Date.now(),
     };
   
     try {
       const pipeline = redisCacheManager.createPipeline();
       pipeline.set(sessionKey, JSON.stringify(sessionData), "EX", 1800);
       pipeline.zadd("SESSION:USERS", Date.now(), userId.toString());
       await redisCacheManager.execPipeline(pipeline);
   
       logger.info(`Session managed for user ${userId}`);
     } catch (error) {
       logger.error(`Error managing session: ${error.message}`);
       throw error;
     }
   }
   
   
   export async function startMonitoringForUser(userId) {
     logger.info(`Started monitoring user ${userId}...`);
     // ...
   }
   
   export async function stopMonitoringForUser(userId) {
     logger.info(`Stopped monitoring user ${userId}...`);
     // ...
   }
   
   export async function revokeRefreshToken(refreshToken) {
     // etc. Move from your code
   }
   
   export async function revokeSession(userId) {
     // etc.
   }
   