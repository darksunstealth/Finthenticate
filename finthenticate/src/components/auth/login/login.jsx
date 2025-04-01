import { useState, useEffect } from "react";
import { loginUser } from "../services/api/api";
import { connectWebSocket, closeWebSocket } from "../services/wss/websocket";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const data = await loginUser({ email, password });
      setMsg("Logado! Token: " + data.token);

      connectWebSocket(data.token, (message) => {
        console.log("Mensagem do WebSocket:", message);
      });
    } catch (err) {
      setMsg(err.message);
    }
  };

  useEffect(() => {
    return () => {
      closeWebSocket();
    };
  }, []);

  return (
    <div>
      <h2>Login</h2>
      <form onSubmit={handleLogin}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" type="password" />
        <button type="submit">Entrar</button>
      </form>
      <p>{msg}</p>
    </div>
  );
}
