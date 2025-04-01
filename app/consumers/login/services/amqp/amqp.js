import amqp from "amqplib";
import dotenv from "dotenv";
dotenv.config();

/* --- Configuração das filas: exchanges, DLX e fila principal --- */
export async function setupQueues() {
  const rabbitmqUsername = process.env.RABBITMQ_USERNAME || "guest";
  const rabbitmqPassword = process.env.RABBITMQ_PASSWORD || "guest";
  const rabbitmqHostname = process.env.RABBITMQ_HOSTNAME || "localhost";
  const rabbitmqPort = process.env.RABBITMQ_PORT || "5672";
  const rabbitmqVhost = process.env.RABBITMQ_VHOST || "/";
  const amqpUrl = `amqp://${rabbitmqUsername}:${rabbitmqPassword}@${rabbitmqHostname}:${rabbitmqPort}${rabbitmqVhost}`;

  try {
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    const dlxExchange = "dlx_exchange";
    const dlxQueue = "login_queue_dlx";
    const loginQueue = "login_queue";

    console.log("[setup] Configurando exchanges e filas RabbitMQ...");

    await channel.assertExchange(dlxExchange, "direct", { durable: true });
    await channel.assertQueue(dlxQueue, { durable: true });

    try {
      await channel.cancel('login_queue_consumer');
    } catch {}

    try {
      await channel.deleteQueue(loginQueue);
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 1000));

    await channel.assertQueue(loginQueue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": dlxExchange,
        "x-message-ttl": 60000
      },
    });

    console.log("[setup] Fila configurada com sucesso.");
    
    // Return the channel and queue name instead of closing them
    return { channel, loginQueue };
  } catch (error) {
    console.error("[setup] Erro durante configuração da fila:", error);
    process.exit(1);
  }
}