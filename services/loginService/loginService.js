/* ===========================
   services/loginService.js
   =========================== */

   import argon2 from "argon2";
   import jwt from "jsonwebtoken";
   import speakeasy from "speakeasy";
   import zlib from "zlib";
   import { sanitizeInput, validateLoginInput, isDuplicateInBatch } from "./utils/utils.js";
   
   // We'll receive these references once at init.
   let logger, redisCacheManager, emailService, amqpManager, models, loginBatch, batchSize;
   
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
   
     const sanitizedEmail = sanitizeInput(email);
     const sanitizedPassword = sanitizeInput(password);
   
     if (!validateLoginInput(sanitizedEmail, sanitizedPassword) || !deviceId || !connectionId) {
       logger.warn(`[login] Invalid input from IP: ${clientIp}, connectionId: ${connectionId}`);
       return res.status(400).send({ error: "Invalid input." });
     }
   
     logger.info(`[login] Attempt for email: ${sanitizedEmail}, IP: ${clientIp}, connId: ${connectionId}`);
   
     try {
       await checkLoginAttempts(sanitizedEmail, clientIp);
       const user = await findUserByEmail(sanitizedEmail);
       if (!user) {
         await recordFailedLogin(sanitizedEmail, clientIp, req.headers["user-agent"]);
         return res.status(401).send({ error: "Invalid user or password." });
       }
   
       const isPasswordValid = await verifyPassword(sanitizedPassword, user.password);
       if (!isPasswordValid) {
         await recordFailedLogin(sanitizedEmail, clientIp, req.headers["user-agent"]);
         return res.status(401).send({ error: "Invalid user or password." });
       }
   
       const loginData = { email: sanitizedEmail, deviceId, userId: user.id, connectionId };
       if (isDuplicateInBatch(loginBatch, loginData)) {
         logger.warn(`[login] Duplicate login request for ${sanitizedEmail}, connId: ${connectionId}`);
         return res.status(409).send({ error: "Duplicate login request." });
       }
   
       // Add to batch
       loginBatch.push({ data: loginData });
       if (loginBatch.length >= batchSize) {
         await sendBatchToAMQP();
       }
   
       return res.status(202).send({
         success: true,
         message: "Login processing. Await response via WebSocket.",
       });
     } catch (error) {
       logger.error(`[login] Error: ${error.message}`);
       return res.status(500).send({ error: "Error processing login." });
     }
   }
   
   //================================================//
   // ROTA: /api/v1/verify-2fa
   //================================================//
   export async function verifyTwoFactorHandler(req, res) {
     const { email, twoFactorCode } = req.body;
   
     if (!email || !twoFactorCode) {
       return res.status(400).send({ error: "Email and 2FA code are required." });
     }
   
     const lowerCaseEmail = email.toLowerCase();
     const tempSessionKey = `temp:2fa:${lowerCaseEmail}`;
   
     try {
       logger.info("[verify2FA]");
       const tempSessionData = await redisCacheManager.get(tempSessionKey);
       if (!tempSessionData) {
         return res.status(400).send({
           error: "Temporary 2FA session expired or invalid. Please log in again.",
         });
       }
   
       const tempSession = JSON.parse(tempSessionData);
       const userId = tempSession.userId;
       const user = await models.User.findByPk(userId);
   
       if (!user) {
         return res.status(400).send({ error: "User not found." });
       }
   
       const isValid = verify2FACode(user, twoFactorCode);
       if (!isValid) {
         // no IP or userAgent, but we do what we can
         await recordFailedLogin(lowerCaseEmail, "NA", req.headers["user-agent"]);
         return res.status(401).send({ error: "Invalid 2FA code." });
       }
   
       // Generate JWT
       let token;
       try {
         token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "1h" });
       } catch (err) {
         logger.error("Error generating token after 2FA", err);
         return res.status(500).send({ error: "Error generating auth token." });
       }
   
       // Manage session
       try {
         await manageUserSession(user.id, token);
       } catch (err) {
         logger.error("Error managing user session after 2FA", err);
         return res.status(500).send({ error: "Error managing user session." });
       }
   
       // Clean up
       await redisCacheManager.del(tempSessionKey);
       await startMonitoringForUser(user.id);
   
       return res.send({
         success: true,
         userId: user.id,
         token,
         message: "Login successful. Session started.",
       });
     } catch (error) {
       logger.error(`[verify2FA] error: ${error.message}`);
       return res.status(500).send({ error: "Internal server error." });
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
   
   //================================================//
   // ROTA: /api/v1/verify-device
   //================================================//
   export async function verifyDeviceHandler(req, res) {
     const { userId, deviceId } = req.body;
     if (!userId || !deviceId) {
       return res.status(400).send({ error: "Missing userId or deviceId." });
     }
   
     try {
       const result = await verifyDevice(userId, deviceId);
       return res.send(result);
     } catch (error) {
       logger.error("verifyDevice error", error);
       return res.status(500).send({ error: "Error verifying device." });
     }
   }
   
   //================================================//
   // LÓGICA de NEGÓCIO e FUNÇÕES Auxiliares
   //================================================//
   
   export async function compressData(data) {
     return new Promise((resolve, reject) => {
       try {
         const jsonString = JSON.stringify(data);
         zlib.deflate(jsonString, (err, buffer) => {
           if (err) return reject(err);
           resolve(buffer);
         });
       } catch (error) {
         reject(new Error("Failed to compress data."));
       }
     });
   }
   
   export async function sendBatchToAMQP() {
     if (loginBatch.length === 0) return;
   
     try {
       const compressedBatch = await compressData(loginBatch);
       await amqpManager.sendToQueue("login_queue", compressedBatch);
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
       const pipeline = redisCacheManager.createPipeline();
       pipeline.hget("USERS", email.toLowerCase());
       const results = await redisCacheManager.execPipeline(pipeline);
   
       const userId = results[0][1];
       if (!userId) {
         logger.warn(`${functionName} not found: ${email}`);
         return null;
       }
   
       const userData = await redisCacheManager.hGetAll(`USER_DATA_${userId}`);
       if (!userData || !userData.id) {
         logger.warn(`${functionName} invalid data for user: ${userId}`);
         return null;
       }
   
       logger.info(`${functionName} found: ${userData.email}, ID: ${userData.id}`);
       return userData;
     } catch (error) {
       logger.error(`${functionName} error: ${error.message}`);
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
   
   export async function verifyDevice(userId, deviceId) {
     try {
       const deviceKey = `USER_DEVICES:${userId}`;
       logger.debug(`Checking device: ${userId}, devId: ${deviceId}`);
   
       const pipeline = redisCacheManager.pipeline();
       pipeline.sismember(deviceKey, deviceId);
       const results = await pipeline.exec();
   
       const isDeviceKnown = results[0][1];
       if (!isDeviceKnown) {
         logger.info(`Device not recognized: user ${userId}`);
         const code = Math.floor(100000 + Math.random() * 900000).toString();
         const verificationKey = `DEVICE_VERIFICATION:${userId}:${deviceId}`;
         logger.info(`Verification code: ${code}`);
   
         await redisCacheManager.set(verificationKey, code, 600);
         return { requireDeviceVerification: true, verificationCode: code };
       }
   
       logger.info(`Device verified: ${deviceId}, user ${userId}`);
       return { requireDeviceVerification: false };
     } catch (error) {
       logger.error(`verifyDevice error: ${error.message}`);
       throw new Error("Error verifying device.");
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
   