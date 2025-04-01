class MessageRouter {
  constructor(secretKey, clientManager, logger) {
    this.secretKey = secretKey;
    this.clientManager = clientManager;
    this.logger = logger;
    this.logger.info('[MessageRouter] Initialized with secretKey and clientManager.');
  }

  // 🔓 Desabilitado — não usado mais
  authenticateMessage(message) {
    return true;
  }
routeMessage(rawData, ws) {
  this.logger.info('[MessageRouter] Raw message received:', rawData);
  try {
    // Se rawData for um Buffer, converte para string
    const dataStr = Buffer.isBuffer(rawData) ? rawData.toString() : rawData;
    const message = JSON.parse(dataStr);
    this.logger.info('[MessageRouter] Parsed message:', message);

    // Use "event" se existir; caso contrário, use "type"
    const event = message.event || message.type;
    this.logger.info('[MessageRouter] Determined event:', event);

    // Se for "auth" e token for null, ignora a mensagem (ou trata como handshake)
    if (event === 'auth' && message.token == null) {
      this.logger.debug('[MessageRouter] Ignoring auth message with null token (handshake scenario).');
      return;
    }

    switch (event) {
      case 'login_success':
        this.logger.info('[MessageRouter] Routing "login_success" event.');
        this.handleLoginMessages(message);
        break;
      case 'batch_login':
        this.logger.info('[MessageRouter] Routing "batch_login" event.');
        this.handleBatchLoginMessages(message.data);
        break;
      default:
        this.logger.warn('[MessageRouter] Unrecognized event type:', event);
    }
  } catch (error) {
    this.logger.error('[MessageRouter] Error processing message:', error);
    ws.send(JSON.stringify({ event: 'error', data: { message: 'Error processing message.' } }));
  }
}

  
  handleLoginMessages(messageData) {
    this.logger.info('[MessageRouter] Handling login messages with data:', messageData);
    // Se a propriedade "data" existir, utiliza-a; caso contrário, assume que messageData é o payload.
    let loginDataArray = [];
    if (messageData && messageData.data) {
      loginDataArray = Array.isArray(messageData.data)
        ? messageData.data
        : [messageData.data];
    } else {
      loginDataArray = [messageData];
    }

    loginDataArray.forEach((data) => {
      this.logger.info('[MessageRouter] Processing login data for connectionId:', data.connectionId);
      const clientWs = this.clientManager.getClient(data.connectionId);

      if (clientWs && clientWs.readyState === clientWs.OPEN) {
        const response = JSON.stringify({
          event: 'login_success',
          data: {
            token: data.token,
            refreshToken: data.refreshToken,
            userId: data.userId,
            message: data.message || 'Login successful',
          },
        });
        this.logger.info(`[MessageRouter] Sending login_success message to connectionId ${data.connectionId}: ${response}`);
        clientWs.send(response);
      } else {
        this.logger.warn(`[MessageRouter] No active connection found for connectionId ${data.connectionId}`);
      }
    });
  }

  handleBatchLoginMessages(batchData) {
    this.logger.info('[MessageRouter] Handling batch login messages:', batchData);
    batchData.forEach((messageData) => {
      const event = messageData.event || messageData.type;
      if (event === 'login_success') {
        this.logger.info('[MessageRouter] Batch event "login_success" detected. Processing individual login messages.');
        this.handleLoginMessages(messageData);
      } else {
        this.logger.warn('[MessageRouter] Unrecognized batch event:', event);
      }
    });
  }
}

export default MessageRouter;
