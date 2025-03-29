import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './login.css';
import authService from '../services/api/apiClient';
import wsService from '../services/wss/wsService';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const navigate = useNavigate();

  // Log ao iniciar o componente
  useEffect(() => {
    console.log('🔍 [Login] Componente montado');
    console.log('🔍 [Login] Ambiente:', {
      NODE_ENV: process.env.NODE_ENV,
      BASE_URL: window.location.origin,
      API_URL: process.env.REACT_APP_API_BASE_URL || '/api',
      WS_URL: process.env.REACT_APP_WS_URL || 'ws://localhost/ws'
    });
    
    // Limpar conexão WebSocket ao desmontar o componente
    return () => {
      console.log('🔍 [Login] Componente desmontado, desconectando WebSocket');
      wsService.disconnect();
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    // Limpa o erro quando o usuário começa a digitar
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'E-mail é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'E-mail inválido';
    }
    
    if (!formData.password) {
      newErrors.password = 'Senha é obrigatória';
    }
    
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      console.log('⚠️ [Login] Erros de validação:', validationErrors);
      setErrors(validationErrors);
      return;
    }
    
    setIsLoading(true);
    console.log('🔍 [Login] Iniciando processo de login para:', formData.email);
    
    try {
      // Log antes da chamada à API
      console.log('🌐 [Login] Enviando requisição de login ao endpoint:', 
        `${process.env.REACT_APP_API_BASE_URL || '/api'}/auth/login`);
        
      // Chamada real à API
      const result = await authService.login(formData);
      console.log('✅ [Login] Login bem-sucedido:', {
        hasToken: !!result.token,
        tokenLength: result.token ? result.token.length : 0,
        user: result.user ? `${result.user.name || 'Nome não disponível'} (${result.user.email})` : 'Dados do usuário não disponíveis'
      });
      
      // Atualizar status da conexão
      setWsStatus('connecting');
      console.log('🌐 [Login] Iniciando conexão WebSocket com URL:', 
        process.env.REACT_APP_WS_URL || 'ws://localhost/ws');
      
      // Conexão WebSocket após login bem-sucedido
      try {
        await wsService.connect(result.token);
        console.log('✅ [Login] Conexão WebSocket estabelecida com sucesso');
        setWsStatus('connected');
        
        // Adiciona listener para mensagens de notificação
        console.log('🔔 [Login] Registrando listeners de WebSocket');
        wsService.on('notification', (data) => {
          console.log('📩 [Login] Nova notificação recebida:', data);
          // Atualizar estado, mostrar notificação, etc.
        });
        
        // Listener para sessão expirada
        wsService.on('session_expired', () => {
          console.log('⚠️ [Login] Sessão expirada, redirecionando para login');
          authService.logout();
          navigate('/login', { state: { message: 'Sua sessão expirou. Por favor, faça login novamente.' } });
        });
        
        // Listener para erros
        wsService.on('error', (error) => {
          console.error('❌ [Login] Erro recebido via WebSocket:', error);
          setWsStatus('error');
        });
      } catch (wsError) {
        console.error('❌ [Login] Falha ao conectar WebSocket:', wsError);
        console.error('❌ [Login] Detalhes da URL WebSocket:', {
          wsUrl: process.env.REACT_APP_WS_URL || 'ws://localhost/ws',
          navegador: navigator.userAgent,
          online: navigator.onLine
        });
        setWsStatus('error');
      }
      
      // Redirecionar para a página principal
      console.log('🔄 [Login] Redirecionando para dashboard');
      navigate('/dashboard');
    } catch (error) {
      console.error('❌ [Login] Erro durante o login:', {
        message: error.message,
        type: error.name,
        stack: error.stack,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data
        } : 'Sem resposta do servidor',
        url: `${process.env.REACT_APP_API_BASE_URL || '/api'}/auth/login`
      });
      
      // Mostrar mensagem de erro apropriada baseada no tipo de erro
      if (error.response && error.response.status === 401) {
        setErrors({ general: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
      } else {
        setErrors({ general: 'Falha ao fazer login. Tente novamente mais tarde.' });
      }
      setWsStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Bem-vindo de volta</h1>
          <p>Acesse sua conta para continuar</p>
          {wsStatus === 'connected' && (
            <div className="ws-status connected">
              <span className="status-dot"></span> Conectado em tempo real
            </div>
          )}
          {wsStatus === 'connecting' && (
            <div className="ws-status connecting">
              <span className="status-dot"></span> Conectando...
            </div>
          )}
          {wsStatus === 'error' && (
            <div className="ws-status error">
              <span className="status-dot"></span> Erro na conexão
            </div>
          )}
        </div>
        
        {errors.general && <div className="error-message">{errors.general}</div>}
        
        <form onSubmit={handleSubmit} className="login-form">
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
              placeholder="********"
            />
            {errors.password && <span className="error-text">{errors.password}</span>}
          </div>
          
          <div className="form-options">
            <div className="remember-me">
              <input type="checkbox" id="remember" />
              <label htmlFor="remember">Lembrar-me</label>
            </div>
            <a href="#" className="forgot-password">Esqueceu a senha?</a>
          </div>
          
          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        
        <div className="login-footer">
          <p>Não tem uma conta? <Link to="/register">Cadastre-se</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Login;