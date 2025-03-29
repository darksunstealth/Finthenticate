import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import ClientManager from './ClientManager.js';
import MessageRouter from './MessageRouter.js';

const wss = new WebSocketServer({ port: 8080 });
const clientManager = new ClientManager();
const messageRouter = new MessageRouter(process.env.WSS_SECRET_KEY || 'default-secret', clientManager);

wss.on('connection', (ws) => {
  const connectionId = uuidv4();
  clientManager.addClient(connectionId, ws);

  console.log(`New client connected. ConnectionId: ${connectionId}`);

  ws.send(JSON.stringify({ event: 'connected', data: { connectionId } }));

  ws.on('message', (message) => {
    messageRouter.routeMessage(message, ws);
  });

  ws.on('close', () => {
    clientManager.removeClient(connectionId);
    console.log(`Connection ${connectionId} closed`);
  });
});

console.log('WebSocket Server running on port 8080');