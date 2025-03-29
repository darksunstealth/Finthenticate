class MessageRouter {
  constructor(secretKey, clientManager) {
    this.secretKey = secretKey;
    this.clientManager = clientManager;
  }

  authenticateMessage(message) {
    if (!message || !message.authToken || message.authToken !== this.secretKey) {
      console.warn('Unauthenticated message or invalid token.');
      return false;
    }
    return true;
  }

  routeMessage(rawData, ws) {
    try {
      const message = JSON.parse(rawData);

      if (!this.authenticateMessage(message)) {
        ws.send(JSON.stringify({ event: 'error', data: { message: 'Authentication failed.' } }));
        return;
      }

      switch (message.event) {
        case 'login_success':
          this.handleLoginMessages(message);
          break;
        case 'batch_login':
          this.handleBatchLoginMessages(message.data);
          break;
        default:
          console.warn('Unrecognized event type:', message.event);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ event: 'error', data: { message: 'Error processing message.' } }));
    }
  }

  handleLoginMessages(messageData) {
    const loginData = Array.isArray(messageData.data) ? messageData.data : [messageData.data];

    loginData.forEach((data) => {
      const clientWs = this.clientManager.getClient(data.connectionId);

      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            event: 'login_success',
            data: {
              token: data.token,
              refreshToken: data.refreshToken,
              userId: data.userId,
              message: data.message || 'Login successful',
            },
          })
        );
      } else {
        console.warn(`No active connection found for channel ${data.connectionId}`);
      }
    });
  }

  handleBatchLoginMessages(batchData) {
    batchData.forEach((messageData) => {
      if (messageData.event === 'login_success') {
        this.handleLoginMessages(messageData);
      } else {
        console.warn('Unrecognized batch event:', messageData.event);
      }
    });
  }
}

export default MessageRouter;