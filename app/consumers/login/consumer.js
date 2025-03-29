import amqp from "amqplib";
import dotenv from "dotenv";
dotenv.config();

/* --- Setup Section: Create exchanges, DLQ and the main queue --- */
async function setupQueues() {
  const rabbitmqUsername = process.env.RABBITMQ_USERNAME || "guest";
  const rabbitmqPassword = process.env.RABBITMQ_PASSWORD || "guest";
  const rabbitmqHostname = process.env.RABBITMQ_HOSTNAME || "localhost";
  const rabbitmqPort = process.env.RABBITMQ_PORT || "5672";
  const rabbitmqVhost = process.env.RABBITMQ_VHOST || "/";
  const amqpUrl = `amqp://${rabbitmqUsername}:${rabbitmqPassword}@${rabbitmqHostname}:${rabbitmqPort}${rabbitmqVhost}`;

  try {
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    // Define exchange names and queue names
    const dlxExchange = "dlx_exchange";
    const dlxQueue = "login_queue_dlx";
    const mainQueue = "login_queue";

    console.log("Setting up RabbitMQ queues and exchanges...");

    // 1. Declare the dead-letter exchange
    await channel.assertExchange(dlxExchange, "direct", { durable: true });
    console.log(`Dead letter exchange '${dlxExchange}' configured`);

    // 2. Declare the dead-letter queue
    await channel.assertQueue(dlxQueue, { durable: true });
    console.log(`Dead letter queue '${dlxQueue}' configured`);

    // 3. Force delete the main queue (if it exists) to avoid conflicts
    console.log(`Attempting to forcefully delete queue '${mainQueue}' if it exists...`);
    try {
      // Cancel any consumers (using an assumed consumer tag, if set)
      await channel.cancel('login_queue_consumer');
      console.log("Cancelled any consumers on the queue");
    } catch (err) {
      console.log("No active consumers to cancel");
    }
    try {
      await channel.deleteQueue(mainQueue, { ifUnused: false, ifEmpty: false });
      console.log(`Queue '${mainQueue}' deleted successfully (if it existed)`);
    } catch (err) {
      console.log(`Error deleting queue '${mainQueue}': ${err.message}`);
    }

    // Short delay to allow deletion to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 4. Create the main queue with the DLX and message TTL settings
    console.log(`Creating queue '${mainQueue}' with DLX settings...`);
    await channel.assertQueue(mainQueue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": dlxExchange,
        "x-message-ttl": 60000
      },
    });
    console.log("Queue setup completed successfully.");

    await channel.close();
    await connection.close();
  } catch (error) {
    console.error("Error during queue setup:", error);
    process.exit(1);
  }
}

/* --- Consumer Section: Only consume from an existing queue --- */
class LoginWorker {
  constructor() {
    const rabbitmqUsername = process.env.RABBITMQ_USERNAME || "guest";
    const rabbitmqPassword = process.env.RABBITMQ_PASSWORD || "guest";
    const rabbitmqHostname = process.env.RABBITMQ_HOSTNAME || "localhost";
    const rabbitmqPort = process.env.RABBITMQ_PORT || "5672";
    const rabbitmqVhost = process.env.RABBITMQ_VHOST || "/";
    this.amqpUrl = `amqp://${rabbitmqUsername}:${rabbitmqPassword}@${rabbitmqHostname}:${rabbitmqPort}${rabbitmqVhost}`;
    this.queue = "login_queue";
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  async connectWithRetry(attempt = 1) {
    try {
      this.connection = await amqp.connect(this.amqpUrl);
      console.log("Connected to RabbitMQ successfully.");
      return this.connection;
    } catch (error) {
      if (attempt <= this.maxRetries) {
        console.log(
          `Connection failed. Attempt ${attempt}/${this.maxRetries}. Retrying in ${this.retryDelay/1000}s...`
        );
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.connectWithRetry(attempt + 1);
      }
      console.error("Fatal error connecting to RabbitMQ:", error);
      throw error;
    }
  }

  async start() {
    try {
      this.connection = await this.connectWithRetry();
      this.channel = await this.connection.createChannel();

      // Set prefetch so only one message is processed at a time
      await this.channel.prefetch(1);
      console.log("Login worker started. Awaiting messages...");

      // Simply consume from the existing queue; DO NOT (re)declare or check the queue here.
      this.channel.consume(this.queue, async (message) => {
        if (message !== null) {
          try {
            console.log("Message received:", message.content.toString());
            // Process the message (add your processing logic here)
            this.channel.ack(message);
          } catch (error) {
            console.error("Error processing message:", error);
            this.channel.nack(message, false, false);
          }
        }
      }, { noAck: false })
      .then(() => {
        console.log(`Consuming from queue: ${this.queue}`);
      })
      .catch(err => {
        console.error("Error setting up consumer:", err.message);
        throw err;
      });
    } catch (error) {
      console.error("Error starting login worker:", error);
      setTimeout(() => this.start(), this.retryDelay);
    }
  }

  async reconnect() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch (error) {
      console.error("Error closing connections:", error);
    }
    setTimeout(() => this.start(), this.retryDelay);
  }
}

/* --- Main Execution: Run setup then start consuming --- */
async function main() {
  await setupQueues();
  const worker = new LoginWorker();
  await worker.start();
}

main().catch(error => {
  console.error("Fatal error in login consumer service:", error);
  process.exit(1);
});
