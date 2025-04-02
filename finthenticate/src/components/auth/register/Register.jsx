import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../../services/api/api";
import {
  InputAdornment,
  IconButton,
  CircularProgress,
  Alert,
  AlertTitle
} from "@mui/material";
import { Email, Lock, Visibility, VisibilityOff } from "@mui/icons-material";
import "./register.css";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      await registerUser({ email, password, terms });
      setMessage({
        text: "Registration successful! Please check your email to verify your account.",
        severity: "success"
      });
      // Clear form on successful registration
      setEmail("");
      setPassword("");
      setTerms(false);
    } catch (err) {
      setMessage({
        text: err.message || "Registration failed. Please try again.",
        severity: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-header">
          <h1>Create Account</h1>
          <p>Enter your information to get started</p>
        </div>

        {message && (
          <div className={`message ${message.severity}`}>
            <strong>{message.severity === "error" ? "Error" : "Success"}</strong>
            <p>{message.text}</p>
          </div>
        )}

        <form className="register-form" onSubmit={handleRegister}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-with-icon">
              <span className="input-icon">
                <Email />
              </span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                required
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <span className="input-icon">
                <Lock />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={handleClickShowPassword}
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </button>
            </div>
          </div>

          <div className="terms-checkbox">
            <input
              type="checkbox"
              id="terms"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              required
            />
            <label htmlFor="terms">
              I agree to the <a href="/terms" className="terms-link">Terms of Service</a> and <a href="/privacy" className="terms-link">Privacy Policy</a>
            </label>
          </div>

          <button 
            type="submit" 
            className="register-button"
            disabled={isSubmitting || !terms}
          >
            {isSubmitting ? (
              <>
                <CircularProgress size={20} style={{ color: 'white', marginRight: '10px' }} />
                Processing...
              </>
            ) : (
              "Register"
            )}
          </button>
        </form>

        <div className="register-footer">
          <p>Already have an account? <a href="/login" className="login-link">Sign in</a></p>
        </div>
      </div>
    </div>
  );
}