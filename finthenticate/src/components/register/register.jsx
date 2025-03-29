import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './register.css';
import authService from '../services/api/apiClient';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    terms: false
  });
  
  const [errors, setErrors] = useState({});
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    console.log('🔍 [Register] Componente montado');
  }, []);
  
  useEffect(() => {
    if (formData.password) {
      let strength = 0;
      if (formData.password.length >= 8) strength += 1;
      if (/[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password)) strength += 1;
      if (/[0-9]/.test(formData.password)) strength += 1;
      if (/[^a-zA-Z0-9]/.test(formData.password)) strength += 1;
      setPasswordStrength(strength);
    } else {
      setPasswordStrength(0);
    }
  }, [formData.password]);
  
  const getStrengthText = () => {
    if (passwordStrength === 0) return '';
    if (passwordStrength === 1) return 'Fraca';
    if (passwordStrength === 2) return 'Média';
    if (passwordStrength === 3) return 'Boa';
    return 'Forte';
  };
  
  const getStrengthColor = () => {
    if (passwordStrength === 0) return '#ddd';
    if (passwordStrength === 1) return '#f56565';
    if (passwordStrength === 2) return '#ed8936';
    if (passwordStrength === 3) return '#48bb78';
    return '#38a169';
  };
  
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ 
      ...formData, 
      [name]: type === 'checkbox' ? checked : value 
    });
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };
  
  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.email) {
      newErrors.email = 'E-mail é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'E-mail inválido';
    }
    if (!formData.password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (formData.password.length < 8) {
      newErrors.password = 'A senha deve ter pelo menos 8 caracteres';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'As senhas não coincidem';
    }
    if (!formData.terms) {
      newErrors.terms = 'Você deve aceitar os termos e condições';
    }
    return newErrors;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      console.log('⚠️ [Register] Erros de validação:', validationErrors);
      setErrors(validationErrors);
      return;
    }
    
    setIsLoading(true);
    console.log('🔍 [Register] Iniciando processo de registro para:', formData.email);
    
    try {
      const { confirmPassword, ...registerData } = formData;
      const result = await authService.register(registerData);
      console.log('✅ [Register] Registro bem-sucedido:', result);
      navigate('/login', { 
        state: { message: 'Conta criada com sucesso! Faça login para continuar.' } 
      });
    } catch (error) {
      console.error('❌ [Register] Erro durante o registro:', error);
      if (error.response && error.response.status === 409) {
        setErrors({ email: 'Este e-mail já está em uso. Tente outro ou faça login.' });
      } else {
        setErrors({ general: 'Falha ao criar conta. Tente novamente mais tarde.' });
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-header">
          <h1>Crie sua conta</h1>
          <p>Preencha os dados abaixo para começar</p>
        </div>
        
        {errors.general && <div className="error-message">{errors.general}</div>}
        
        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label htmlFor="name">Nome completo</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={errors.name ? 'error' : ''}
              placeholder="Seu nome completo"
            />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </div>
          
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={errors.email ? 'error' : ''}
              placeholder="seu@email.com"
            />
            {errors.email && <span className="error-text">{errors.email}</span>}
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={errors.password ? 'error' : ''}
              placeholder="Crie uma senha forte"
            />
            {formData.password && (
              <div className="password-strength">
                <div className="strength-bar">
                  <div
                    className="strength-indicator"
                    style={{
                      width: `${(passwordStrength / 4) * 100}%`,
                      backgroundColor: getStrengthColor()
                    }}
                  ></div>
                </div>
                <span className="strength-text" style={{ color: getStrengthColor() }}>
                  {getStrengthText()}
                </span>
              </div>
            )}
            {errors.password && <span className="error-text">{errors.password}</span>}
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirme sua senha</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={errors.confirmPassword ? 'error' : ''}
              placeholder="Digite a senha novamente"
            />
            {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
          </div>
          
          <div className="terms-checkbox">
            <input
              type="checkbox"
              id="terms"
              name="terms"
              checked={formData.terms}
              onChange={handleChange}
            />
            <label htmlFor="terms">
              Eu li e aceito os <a href="#" className="terms-link">Termos de Uso</a> e <a href="#" className="terms-link">Política de Privacidade</a>
            </label>
            {errors.terms && <span className="error-text">{errors.terms}</span>}
          </div>
          
          <button 
            type="submit" 
            className="register-button"
            disabled={isLoading}
          >
            {isLoading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>
        
        <div className="register-footer">
          <p>Já tem uma conta? <Link to="/login">Faça login</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Register;