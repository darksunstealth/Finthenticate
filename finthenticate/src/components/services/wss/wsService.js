class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000; // 3 segundos
    this.listeners = {};
    this.url = process.env.REACT_APP_WS_URL || 'ws://localhost/ws';
  }

  /**
   * Inicia a conexão WebSocket
   * @param {string} token - Token de autenticação
   * @returns {Promise<WebSocket>} A conexão WebSocket
   */
  connect(token) {
    return new Promise((resolve, reject) => {
      try {
        // Encerra a conexão anterior se existir
        if (this.socket) {
          this.disconnect();
        }

        // Adiciona o token como parâmetro de consulta
        const wsUrl = token ? `${this.url}?token=${token}` : this.url;
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
          console.log('Conexão WebSocket estabelecida');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve(this.socket);
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.socket.onerror = (error) => {
          console.error('Erro na conexão WebSocket:', error);
          reject(error);
        };

        this.socket.onclose = (event) => {
          this.isConnected = false;
          console.log(`Conexão WebSocket fechada: ${event.code} ${event.reason}`);
          
          // Tenta reconectar automaticamente se não foi um fechamento limpo
          if (event.code !== 1000 && event.code !== 1001) {
            this.attemptReconnect(token);
          }
        };
      } catch (error) {
        console.error('Erro ao iniciar conexão WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Tenta reconectar ao WebSocket
   * @param {string} token - Token de autenticação
   * @private
   */
  attemptReconnect(token) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Tentando reconectar (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect(token).catch(() => {
          console.log('Falha na tentativa de reconexão');
        });
      }, this.reconnectInterval);
    } else {
      console.log('Número máximo de tentativas de reconexão alcançado');
    }
  }

  /**
   * Desconecta do WebSocket
   */
  disconnect() {
    if (this.socket && this.isConnected) {
      this.socket.close(1000, 'Fechamento solicitado pelo cliente');
      this.isConnected = false;
      this.socket = null;
    }
  }

  /**
   * Envia dados pelo WebSocket
   * @param {string} type - Tipo da mensagem
   * @param {Object} data - Dados a serem enviados
   * @returns {boolean} - Status do envio
   */
  send(type, data) {
    if (!this.isConnected) {
      console.error('WebSocket não está conectado');
      return false;
    }

    try {
      const message = JSON.stringify({ type, data });
      this.socket.send(message);
      return true;
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      return false;
    }
  }

  /**
   * Processa as mensagens recebidas
   * @param {MessageEvent} event - Evento de mensagem
   * @private
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      const { type, data } = message;

      // Notifica todos os listeners para este tipo de mensagem
      if (this.listeners[type]) {
        this.listeners[type].forEach(callback => callback(data));
      }

      // Notifica os listeners gerais
      if (this.listeners['*']) {
        this.listeners['*'].forEach(callback => callback(message));
      }
    } catch (error) {
      console.error('Erro ao processar mensagem recebida:', error);
    }
  }

  /**
   * Adiciona um ouvinte para um tipo específico de mensagem
   * @param {string} type - Tipo da mensagem para escutar ('*' para todas)
   * @param {Function} callback - Função a ser chamada quando a mensagem for recebida
   * @returns {Function} - Função para remover o ouvinte
   */
  on(type, callback) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);

    // Retorna uma função para remover este listener
    return () => {
      this.listeners[type] = this.listeners[type].filter(cb => cb !== callback);
      if (this.listeners[type].length === 0) {
        delete this.listeners[type];
      }
    };
  }
}

// Cria uma instância única para todo o aplicativo
const wsService = new WebSocketService();

export default wsService;