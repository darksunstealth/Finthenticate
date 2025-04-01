import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import ClientManager from './ClientManager.js';
import MessageRouter from './MessageRouter.js';
import PubSub from './services/PubSub.js';
import logger from './services/logger/logger.js';
const wss = new WebSocketServer({ port: 8080 });
const clientManager = new ClientManager();
const pubsub = new PubSub(clientManager,logger);
pubsub.init(); // Inicializa o PubSub com logs detalhados

const messageRouter = new MessageRouter(process.env.WSS_SECRET_KEY || 'default-secret', clientManager, logger);

wss.on('connection', (ws) => {
  const connectionId = uuidv4();
  clientManager.addClient(connectionId, ws);

  console.log(`[WS] New client connected. ConnectionId: ${connectionId}`);

  // Envia o evento de conexão para o cliente
  const connectMessage = JSON.stringify({ event: 'connected', data: { connectionId } });
  ws.send(connectMessage);
  console.log(`[WS] Sent "connected" event to client. Message: ${connectMessage}`);

  ws.on('message', (message) => {
    console.log(`[WS] Message received from ConnectionId ${connectionId}: ${message}`);
    messageRouter.routeMessage(message, ws);
  });

  ws.on('close', () => {
    clientManager.removeClient(connectionId);
    console.log(`[WS] Connection ${connectionId} closed`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error on connection ${connectionId}:`, err);
  });
});

console.log('WebSocket Server running on port 8080');
