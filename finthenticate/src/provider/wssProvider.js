import { useEffect, useState } from "react";
import WebSocketContext from "../context/wssContext";
import { connectWebSocket, closeWebSocket } from "../components/services/wss/websocket";

export default function WebSocketProvider({ children }) {
  const [connectionId, setConnectionId] = useState(null);
  const [wsMessages, setWsMessages] = useState([]);

  useEffect(() => {
    // Conecta o WebSocket apenas uma vez para toda a aplicação
    connectWebSocket(null, (message) => {
      console.log("Broadcast from global WebSocket:", message);
      // Se for o evento de conexão, atualize o connectionId
      if (message.event === "connected" && message.data?.connectionId) {
        setConnectionId(message.data.connectionId);
        console.log("🔗 Global Connection ID received:", message.data.connectionId);
      }
      // Armazena ou processa as mensagens conforme necessário
      setWsMessages((prev) => [...prev, message]);
    });

    // Opcional: Remova o closeWebSocket do cleanup se desejar manter a conexão global até que o app seja fechado
    return () => {
      // Caso queira fechar o WebSocket quando o provedor for desmontado (geralmente, não acontecerá em apps SPA)
      closeWebSocket();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ connectionId, wsMessages }}>
      {children}
    </WebSocketContext.Provider>
  );
}
