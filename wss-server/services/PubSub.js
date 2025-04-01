import Redis from 'ioredis';

class PubSub {
  constructor(clientManager, logger) {
    this.clientManager = clientManager;
    this.logger = logger;
    this.subscriber = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    this.CHANNEL = 'user-events';
  }

  init() {
    this.logger.info(`[PubSub] Starting subscriber and trying to subscribe to channel: ${this.CHANNEL}`);
    
    this.subscriber.subscribe(this.CHANNEL, (err, count) => {
      if (err) {
        this.logger.error('[PubSub] Error subscribing to channel:', err);
      } else {
        this.logger.info(`[PubSub] Successfully subscribed to channel "${this.CHANNEL}". Total channels subscribed: ${count}`);
      }
    });

    this.subscriber.on('message', (channel, message) => {
      this.logger.info(`[PubSub] Message received on channel "${channel}"`);
      if (channel !== this.CHANNEL) {
        this.logger.warn(`[PubSub] Message received from unexpected channel: ${channel}`);
        return;
      }
      
      try {
        // Se a mensagem for um Buffer, converte para string
        let messageStr = message;
        if (Buffer.isBuffer(message)) {
          messageStr = message.toString();
        }
        this.logger.info(`[PubSub] Raw message: ${messageStr}`);

        const parsedMessage = JSON.parse(messageStr);
        const event = parsedMessage.event || parsedMessage.type;
        const connectionId = parsedMessage.connectionId;
        const data = parsedMessage.data || parsedMessage; // Fall back to the whole message if data not specified

        if (!event) {
          this.logger.warn(`[PubSub] No event type in message`);
          return;
        }

        // If no connectionId, broadcast to all clients if it's a system message
        if (!connectionId) {
          if (event.startsWith('system_') || event === 'login_failure') {
            this.logger.info(`[PubSub] Broadcasting ${event} message to all clients`);
            this.clientManager.broadcast(event, data);
            return;
          }
          this.logger.warn(`[PubSub] No connectionId for non-system message: ${event}`);
          return;
        }

        this.logger.info(`[PubSub] Parsed message -> Event: ${event}, ConnectionId: ${connectionId}, Data: ${JSON.stringify(data)}`);

        const clientWs = this.clientManager.getClient(connectionId);
        if (clientWs && clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({ event, data }));
          this.logger.info(`[PubSub] Message sent to connectionId ${connectionId}`);
        } else {
          this.logger.warn(`[PubSub] No active socket found for connectionId ${connectionId}`);
        }
      } catch (err) {
        this.logger.error('[PubSub] Error processing Redis Pub/Sub message:', err);
      }
    });

    this.subscriber.on('error', (err) => {
      this.logger.error('[PubSub] Error on Redis subscriber:', err);
    });

    this.logger.info(`[PubSub] Subscriber initialized and subscribed to channel: ${this.CHANNEL}`);
  }
}

export default PubSub;
