
/* ===========================
   producers/loginProducer.js
   =========================== */

   import registerLoginRoutes from "../../../routes/producer/producerLoginRoutes.js";
   import { initLoginService } from "../../../services/loginService/loginService.js";
   import { startBatchProcessing } from "./batch/loginBatch.js";
   
   class LoginProducer {
     constructor(fastify, options) {
       // options will have {logger, redisCacheManager, emailService, amqpManager, models, loginBatch, batchSize}
   
       this.fastify = fastify;
       this.logger = options.logger;
       // init the loginService with these dependencies
       initLoginService(options);
   
       // Register routes
       registerLoginRoutes(fastify);
     }
   
     // Optionally, start batch in a method here:
     startBatch() {
       startBatchProcessing();
     }
   }
   
   export default LoginProducer;