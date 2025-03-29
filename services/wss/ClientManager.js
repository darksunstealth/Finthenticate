class ClientManager {
  constructor() {
    this.clients = new Map();
  }

  addClient(connectionId, ws) {
    this.clients.set(connectionId, ws);
  }

  removeClient(connectionId) {
    this.clients.delete(connectionId);
  }

  getClient(connectionId) {
    return this.clients.get(connectionId);
  }

  broadcast(event, data) {
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, data }));
      }
    });
  }
}

export default ClientManager;