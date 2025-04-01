import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../../services/api/api";
import { connectWebSocket, getSocket } from "../../services/wss/websocket";

// Variável global para armazenar callbacks
let messageCallbacks = [];

function getDeviceInfo() {
  const userAgent = navigator.userAgent || "unknown";
  const platform = navigator.platform || "unknown";
  const language = navigator.language || "unknown";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";

  return `${platform} | ${userAgent} | ${language} | ${timezone}`;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [connectionId, setConnectionId] = useState(null);
  const [deviceId] = useState(() => getDeviceInfo());
  const [connecting, setConnecting] = useState(true);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const connectTimeoutRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Iniciando conexão WebSocket...");
    
    // Timeout para fallback de conexão
    connectTimeoutRef.current = setTimeout(() => {
      if (!connectionId) {
        const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        console.log("Timeout de conexão WebSocket. Usando ID fallback:", fallbackId);
        setConnectionId(fallbackId);
        setConnecting(false);
        setMsg("Conexão WebSocket não disponível. Modo fallback ativado.");
      }
    }, 5000);

    // Conexão WebSocket (sempre tente conectar, mesmo que já exista)
    try {
      connectWebSocket(null, handleWebSocketMessage);
    } catch (error) {
      console.error("Falha na conexão WebSocket:", error);
      setConnecting(false);
      setMsg(`Erro de conexão: ${error.message}`);
    }

    // Limpeza ao desmontar
    return () => {
      clearTimeout(connectTimeoutRef.current);
      // Remove o callback específico deste componente
      messageCallbacks = messageCallbacks.filter(cb => cb !== handleWebSocketMessage);
    };
  }, []);

  useEffect(() => {
    if (waitingForResponse) {
      const responseTimeout = setTimeout(() => {
        if (waitingForResponse) {
          setWaitingForResponse(false);
          setMsg("Tempo esgotado. Tente novamente.");
        }
      }, 15000);
      
      return () => clearTimeout(responseTimeout);
    }
  }, [waitingForResponse]);

  const handleWebSocketMessage = (message) => {
    console.log("Mensagem WebSocket recebida:", message);
  
    // Eventos de conexão
    if (message.event === "connected" && message.data?.connectionId) {
      setConnectionId(message.data.connectionId);
      setConnecting(false);
      setMsg("");
      clearTimeout(connectTimeoutRef.current);
    }

    // Eventos de erro
    if (message.event === "error") {
      console.error("Erro WebSocket:", message.data);
      setMsg(`Erro: ${message.data?.message || "Erro desconhecido"}`);
    }

    // Processa eventos críticos imediatamente
    switch (message.event) {
      case 'new_device_detected':
      case '2fa_required':
      case 'login_success':
      case 'login_failure':
        handleWebSocketResponse(message);
        break;
      default:
        break;
    }
  };

  const handleWebSocketResponse = (response) => {
    console.log("Processando resposta:", response);
    setWaitingForResponse(false);

    const responseData = response.data || {};
    
    switch (response.event) {
      case 'new_device_detected':
        navigate("/verify", {
          state: {
            type: "device",
            userId: responseData.userId,
            email,
            deviceId,
            connectionId,
            tempToken: responseData.token || "TEMPORARY_TOKEN_FOR_TESTING", // Fallback para testes
          },
        });
        break;
      
      case '2fa_required':
        navigate("/verify", {
          state: {
            type: "2fa",
            userId: responseData.userId,
            email,
            connectionId,
          },
        });
        break;
      
      case 'login_success':
        localStorage.setItem("token", responseData.token);
        localStorage.setItem("refreshToken", responseData.refreshToken);
        navigate("/dashboard");
        break;
      
      case 'login_failure':
        setMsg(responseData.error || "Falha no login");
        break;
      
      default:
        setMsg("Resposta inesperada do servidor");
        console.warn("Evento não tratado:", response.event);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (connecting) {
      setMsg("Aguardando conexão WebSocket...");
      return;
    }

    if (!connectionId) {
      setMsg("ID de conexão não disponível. Recarregue a página.");
      return;
    }

    try {
      setMsg("Autenticando...");
      setWaitingForResponse(true);
      
      await loginUser({
        email,
        password,
        deviceId,
        connectionId,
      });

    } catch (err) {
      setWaitingForResponse(false);
      setMsg(err.message);
    }
  };

  return (
    <div className="login-container">
      <h2>Login</h2>
      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Seu email"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sua senha"
            required
          />
        </div>
        <button 
          type="submit" 
          className="login-button"
          disabled={waitingForResponse}
        >
          {waitingForResponse ? "Processando..." : "Entrar"}
        </button>
      </form>
      {msg && <p className="message">{msg}</p>}
    </div>
  );
}