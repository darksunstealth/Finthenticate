class ClientManager {
  constructor() {
    this.clients = new Map();
    console.log('[ClientManager] Initialized ClientManager.');
  }

  addClient(connectionId, ws) {
    this.clients.set(connectionId, ws);
    console.log(`[ClientManager] Client added. ConnectionId: ${connectionId}. Total clients: ${this.clients.size}`);
  }

  removeClient(connectionId) {
    this.clients.delete(connectionId);
    console.log(`[ClientManager] Client removed. ConnectionId: ${connectionId}. Total clients: ${this.clients.size}`);
  }

  getClient(connectionId) {
    const client = this.clients.get(connectionId);
    console.log(`[ClientManager] getClient called for ConnectionId: ${connectionId}. Found: ${client ? 'Yes' : 'No'}`);
    return client;
  }

  broadcast(event, data) {
    console.log(`[ClientManager] Broadcasting event "${event}" to ${this.clients.size} clients.`);
    this.clients.forEach((ws, connectionId) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ event, data }));
        console.log(`[ClientManager] Broadcast sent to ConnectionId: ${connectionId}`);
      } else {
        console.warn(`[ClientManager] Unable to broadcast to ConnectionId: ${connectionId}. WebSocket not open.`);
      }
    });
  }
}

export default ClientManager;
