import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getSocket, sendMessage } from "../../services/wss/websocket";

export default function Verification() {
  const location = useLocation();
  const navigate = useNavigate();
  const [verificationCode, setVerificationCode] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Extract data from location state
  const { type, userId, email, deviceId, connectionId } = location.state || {};

  useEffect(() => {
    // If no verification type is provided, redirect to login
    if (!type) {
      navigate("/login");
      return;
    }

    // Usa a conexão WebSocket existente (já estabelecida no Login)
    const socket = getSocket();
    
    if (!socket) {
      setMsg("Connection error. Please return to login.");
      return;
    }

    const handleWebSocketMessage = (message) => {
      console.log("Verification WebSocket message:", message);

      // Handle verification-specific events
      switch (message.event) {
        case "device_verified":
          setLoading(false);
          setMsg("Device successfully verified! Redirecting...");
          storeTokens(message.data);
          setTimeout(() => navigate("/dashboard"), 2000);
          break;
          
        case "device_verification_failed":
          setLoading(false);
          setMsg(`Verification failed: ${message.data?.message || "Invalid code"}`);
          break;
          
        case "2fa_verified":
          setLoading(false);
          setMsg("2FA successfully verified! Redirecting...");
          storeTokens(message.data);
          setTimeout(() => navigate("/dashboard"), 2000);
          break;
          
        case "2fa_verification_failed":
          setLoading(false);
          setMsg(`2FA verification failed: ${message.data?.message || "Invalid code"}`);
          break;
          
        case "error":
          setLoading(false);
          setMsg(`Error: ${message.data?.message || "Unknown error occurred"}`);
          break;
          
        default:
          console.log("Unhandled WebSocket event:", message.event);
      }
    };

    // Adiciona o handler de mensagens ao socket existente
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    return () => {
      // Remove o handler específico quando o componente desmontar
      socket.removeEventListener('message', handleWebSocketMessage);
    };
  }, [navigate, type]);

  const storeTokens = (data) => {
    if (data?.token) {
      localStorage.setItem("token", data.token);
      if (data.refreshToken) {
        localStorage.setItem("refreshToken", data.refreshToken);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!verificationCode || verificationCode.length !== 6) {
      setMsg("Please enter a valid 6-digit code");
      return;
    }

    setLoading(true);
    setMsg("Verifying...");

    try {
      const verificationPayload = {
        event: type === "device" ? "verify_device" : "verify_2fa",
        data: {
          userId,
          verificationCode,
          connectionId,
          ...(type === "device" && { deviceId, email })
        }
      };

      sendMessage(verificationPayload);
      
    } catch (error) {
      setMsg(`Failed to send verification: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="verification-container">
      <h2>{type === "device" ? "Device Verification" : "Two-Factor Authentication"}</h2>
      
      <div className="verification-info">
        {type === "device" ? (
          <p>A verification code has been sent to your email address. Please enter it below to verify your device.</p>
        ) : (
          <p>Please enter your two-factor authentication code to complete login.</p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="verificationCode">
            {type === "device" ? "Device Verification Code" : "2FA Code"}
          </label>
          <input
            id="verificationCode"
            type="text"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={type === "device" ? "Enter 6-digit code" : "Enter authentication code"}
            maxLength={6}
            pattern="\d{6}"
            required
            disabled={loading}
          />
        </div>
        <button type="submit" className="verify-button" disabled={loading}>
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>

      {msg && <p className="message">{msg}</p>}
      
      <button 
        className="back-button"
        onClick={() => navigate("/login")}
        disabled={loading}
      >
        Back to Login
      </button>
    </div>
  );
}