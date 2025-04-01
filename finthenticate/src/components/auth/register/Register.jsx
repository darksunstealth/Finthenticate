import { useState } from "react";
import { registerUser } from "../../services/api/api";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [msg, setMsg] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      await registerUser({ email, password, terms });
      setMsg("Registrado com sucesso!");
    } catch (err) {
      setMsg(err.message || "Erro ao registrar");
    }
  };

  return (
    <div>
      <h2>Registro</h2>
      <form onSubmit={handleRegister}>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Senha"
          type="password"
        />
        <label>
          <input
            type="checkbox"
            checked={terms}
            onChange={e => setTerms(e.target.checked)}
          />
          Aceito os termos de uso
        </label>
        <button type="submit">Registrar</button>
      </form>
      <p>{msg}</p>
    </div>
  );
}
