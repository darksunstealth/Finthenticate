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

  const wsStatusClass = () => {
    if (connecting) return "ws-status connecting";
    if (connectionId && !connecting) return "ws-status connected";
    if (msg.includes("Erro")) return "ws-status error";
    return "ws-status";
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Bem-vindo de volta</h1>
          <p>Por favor, faça login para continuar</p>
        </div>

        {msg && (
          <div className={msg.includes("Erro") ? "error-message" : "message"}>
            {msg}
          </div>
        )}

        <form className="login-form" onSubmit={handleLogin}>
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

          <div className="form-options">
            <div className="remember-me">
              <input type="checkbox" id="remember" />
              <label htmlFor="remember">Lembrar de mim</label>
            </div>
            <a href="/forgot-password" className="forgot-password">Esqueceu a senha?</a>
          </div>

          <button 
            type="submit" 
            className="login-button"
            disabled={waitingForResponse || connecting}
          >
            {waitingForResponse ? "Processando..." : "Entrar"}
          </button>
        </form>

        <div className="login-footer">
          <p>Não tem uma conta? <a href="/register">Cadastre-se</a></p>
        </div>

        <div className={wsStatusClass()}>
          <span className="status-dot"></span>
          {connecting ? "Conectando..." : 
           connectionId ? "Conectado" : 
           "Erro de conexão"}
        </div>
      </div>
    </div>
  );
}

const styles = `
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-card {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 450px;
  padding: 40px;
  transition: transform 0.3s ease;
}

.login-card:hover {
  transform: translateY(-5px);
}

.login-header {
  margin-bottom: 30px;
  text-align: center;
}

.login-header h1 {
  color: #333;
  font-size: 28px;
  margin-bottom: 10px;
}

.login-header p {
  color: #666;
  font-size: 16px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 6px;
  color: #555;
  font-weight: 500;
}

.form-group input {
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #ddd;
  font-size: 16px;
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.form-group input.error {
  border-color: #e53e3e;
}

.error-text {
  color: #e53e3e;
  font-size: 14px;
  margin-top: 5px;
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 5px;
}

.remember-me {
  display: flex;
  align-items: center;
  gap: 5px;
}

.remember-me label {
  color: #555;
  font-size: 14px;
}

.forgot-password {
  color: #667eea;
  font-size: 14px;
  text-decoration: none;
  transition: color 0.3s;
}

.forgot-password:hover {
  color: #764ba2;
  text-decoration: underline;
}

.login-button {
  background: linear-gradient(to right, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 15px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.3s, transform 0.3s;
  margin-top: 10px;
}

.login-button:hover {
  opacity: 0.9;
  transform: translateY(-2px);
}

.login-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.login-footer {
  margin-top: 30px;
  text-align: center;
  color: #666;
}

.login-footer a {
  color: #667eea;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.3s;
}

.login-footer a:hover {
  color: #764ba2;
  text-decoration: underline;
}

.message {
  background-color: #f0f7ff;
  color: #3182ce;
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
  border-left: 3px solid #3182ce;
}

.error-message {
  background-color: #FEECF0;
  color: #e53e3e;
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
  border-left: 3px solid #e53e3e;
}

.ws-status {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  margin-top: 8px;
  padding: 4px 8px;
  border-radius: 12px;
  background-color: rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.ws-status.connected {
  color: #10b981;
}

.ws-status.connecting {
  color: #f59e0b;
}

.ws-status.error {
  color: #ef4444;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.connected .status-dot {
  background-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  animation: pulse 2s infinite;
}

.connecting .status-dot {
  background-color: #f59e0b;
  animation: blink 1s infinite;
}

.error .status-dot {
  background-color: #ef4444;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 500px) {
  .login-card {
    padding: 30px 20px;
  }
  
  .form-options {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}
`;

// Adiciona os estilos ao head do documento
const styleElement = document.createElement('style');
styleElement.innerHTML = styles;
document.head.appendChild(styleElement);