import axios from 'axios';

// Definir a URL base com o prefixo '/api/v1'
const API_BASE_URL = `${process.env.REACT_APP_API_BASE_URL || ''}/api/v1`;

// Criar instância do axios com configurações padrão
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // Timeout de 10 segundos
});

// Interceptor para adicionar token de autorização a todas as requisições
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor para tratar erros de resposta
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Tratamento de erros específicos da API
    if (error.response) {
      // O servidor respondeu com um status de erro
      if (error.response.status === 401) {
        // Token expirado ou inválido
        localStorage.removeItem('authToken');
        // Redirecionar para login se necessário
        // window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Serviço de autenticação
const authService = {
  // Registrar novo usuário
  register: async (userData) => {
    console.log('🌐 [AuthService] Enviando requisição de registro ao endpoint:', 
      `${API_BASE_URL}/auth/register`);
    console.log('🌐 [AuthService] Dados sendo enviados:', userData); // Removido o mascaramento da senha
    
    try {
      const response = await apiClient.post('/auth/register', userData);
      console.log('✅ [AuthService] Registro bem-sucedido:', {
        response: response.data,
        requestedEmail: userData.email
      });
      return response.data;
    } catch (error) {
      console.error('❌ [AuthService] Erro durante o registro:', {
        message: error.message,
        type: error.name,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data
        } : 'Sem resposta do servidor',
        url: `${API_BASE_URL}/auth/register`
      });
      throw error;
    }
  },
  
  // Login de usuário
  login: async (credentials) => {
    console.log('🌐 [AuthService] Enviando requisição de login ao endpoint:', 
      `${API_BASE_URL}/auth/login`);
    
    try {
      const response = await apiClient.post('/auth/login', credentials);
      console.log('✅ [AuthService] Login bem-sucedido');
      
      // Salvar token no localStorage
      if (response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        
        // Salvar informações do usuário se disponíveis
        if (response.data.user) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
        }
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ [AuthService] Erro durante o login:', {
        message: error.message,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data
        } : 'Sem resposta do servidor'
      });
      throw error;
    }
  },
  
  // Logout do usuário
  logout: () => {
    console.log('🔄 [AuthService] Realizando logout');
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },
  
  // Obter usuário atual
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },
  
  // Verificar se o usuário está autenticado
  isAuthenticated: () => {
    return !!localStorage.getItem('authToken');
  },
  
  // Recuperar senha
  forgotPassword: async (email) => {
    try {
      const response = await apiClient.post('/auth/forgot-password', { email });
      return response.data;
    } catch (error) {
      console.error('❌ [AuthService] Erro ao solicitar recuperação de senha:', error);
      throw error;
    }
  },
  
  // Redefinir senha
  resetPassword: async (token, newPassword) => {
    try {
      const response = await apiClient.post('/auth/reset-password', { 
        token, 
        password: newPassword 
      });
      return response.data;
    } catch (error) {
      console.error('❌ [AuthService] Erro ao redefinir senha:', error);
      throw error;
    }
  }
};

export default authService;