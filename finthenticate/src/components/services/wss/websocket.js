let socket = null;
let messageCallbacks = []; // Lista de callbacks
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

export function getSocket() {
  return socket;
}

export function connectWebSocket(token, onMessageCallback) {
  // Adiciona callback à lista
  if (onMessageCallback && !messageCallbacks.includes(onMessageCallback)) {
    messageCallbacks.push(onMessageCallback);
  }

  // Se já estiver conectado, não faz nada
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log("Using existing WebSocket connection");
    return;
  }

  // Fecha conexão existente se houver
  if (socket) {
    socket.onclose = null;
    socket.close();
  }

  // Nova conexão
  const wsUrl = `ws://${window.location.hostname}:8080/ws?token=${encodeURIComponent(token)}`;
  console.log("Connecting to WebSocket:", wsUrl);
  
  socket = new WebSocket(wsUrl);

  // Configura handlers
  socket.onopen = () => {
    console.log('WebSocket connection established');
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log("Received WebSocket message:", message);
      
      // Dispara todos os callbacks registrados
      messageCallbacks.forEach(cb => {
        try {
          cb(message);
        } catch (error) {
          console.error('Error in WebSocket callback:', error);
        }
      });
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  socket.onclose = (event) => {
    console.log(`WebSocket closed: ${event.code} ${event.reason || 'No reason provided'}`);
    
    if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
      const delay = Math.min(1000 * (reconnectAttempts + 1), 5000); // Exponential backoff
      console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1})`);
      
      setTimeout(() => {
        reconnectAttempts++;
        connectWebSocket(token);
      }, delay);
    } else {
      console.log("Max reconnection attempts reached or normal closure");
      messageCallbacks.forEach(cb => {
        try {
          cb({ event: "connection_lost", data: { message: "WebSocket connection lost" } });
        } catch (error) {
          console.error('Error in connection lost callback:', error);
        }
      });
    }
  };
}

export function closeWebSocket() {
  if (socket) {
    console.log("Closing WebSocket connection");
    socket.close(1000, "Normal closure");
    socket = null;
    messageCallbacks = [];
  }
}

export function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket connection is not open');
  }
  
  try {
    const messageString = JSON.stringify(message);
    console.log("Sending WebSocket message:", message);
    socket.send(messageString);
  } catch (error) {
    console.error('Error sending WebSocket message:', error);
    throw new Error('Failed to send message');
  }
}