// loginWorker.js
import { setupQueues } from './services/amqp/amqp.js';

export async function runLoginWorker(loginController, redisPublish) {
  const { channel, loginQueue } = await setupQueues();

  let batchMessages = [];
  let batchTimer = null;
  const BATCH_SIZE = 10;
  const BATCH_TIMEOUT_MS = 500;

  const processBatch = async () => {
    if (batchMessages.length === 0) return;

    const currentBatch = [...batchMessages];
    batchMessages = [];
    clearTimeout(batchTimer);
    batchTimer = null;

    console.log(`Processing login batch of ${currentBatch.length} messages`);

    try {
      const loginDataArray = currentBatch.map(msg => {
        try {
          let raw = msg.content;

          const parsed = JSON.parse(raw.toString());
          if (parsed?.type === 'Buffer' && Array.isArray(parsed.data)) {
            raw = Buffer.from(parsed.data);
          }

          return JSON.parse(raw.toString());
        } catch (e) {
          console.error('[ERROR] Failed to decode AMQP message:', e);
          return {};
        }
      });

      const results = await loginController.processLoginBatch(loginDataArray);

      for (const result of results) {
        if (result.connectionId) {
          await redisPublish.publish('login_results', JSON.stringify(result));
        }
      }

      currentBatch.forEach(msg => channel.ack(msg));
      console.log(`✅ Batch processed: ${currentBatch.length} login requests`);
    } catch (err) {
      console.error('[ERROR] Processing batch failed:', err);
      currentBatch.forEach(msg => channel.nack(msg));
    }
  };

  await channel.consume(loginQueue, (msg) => {
    if (!msg) return;

    batchMessages.push(msg);

    if (batchMessages.length >= BATCH_SIZE) {
      processBatch();
    } else if (!batchTimer) {
      batchTimer = setTimeout(processBatch, BATCH_TIMEOUT_MS);
    }
  });

  console.log('💡 Login worker ready to process login batches');
}
