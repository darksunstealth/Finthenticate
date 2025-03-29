import { WebSocket } from 'ws';

class WebSocketManager {
  constructor() {
    this.ws = null;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(process.env.WEBSOCKET_URL || 'ws://localhost:8080');

    this.ws.on('open', () => {
      console.log('Conectado ao WebSocket Server.');
    });

    this.ws.on('error', (error) => {
      console.error('Erro na conexão WebSocket:', error);
    });

    this.ws.on('close', () => {
      console.log('Conexão WebSocket fechada. Tentando reconectar...');
      setTimeout(() => this.connect(), 5000); // Reconecta após 5 segundos
    });
  }

  sendBatchMessages(messages) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const batchPayload = JSON.stringify(messages);
        this.ws.send(batchPayload);
        console.log(`Lote de mensagens enviado:`, messages);
      } catch (error) {
        console.error('Erro ao enviar lote de mensagens:', error);
      }
    } else {
      console.error('WebSocket não está conectado.');
    }
  }
}

export default WebSocketManager;