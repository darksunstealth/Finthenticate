// tests/loginProducer.test.js

// 1. Mocka o módulo 'argon2' inteiro antes de importar
jest.mock('argon2', () => ({
    verify: jest.fn(),
    hash: jest.fn(),
  }));
  
  import argon2 from 'argon2';
  import LoginProducer from '../app/producers/login/LoginProducer.js';
  
  describe('LoginProducer', () => {
    let loginProducer;
  
    beforeEach(() => {
      // Mocks necessários
      const mockApp = { post: jest.fn() };
      const mockLogger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() };
      const mockCache = {};
      const mockRedis = {};
      const mockEmail = {};
      const mockAMQP = {};
      const mockModels = {};
      const mockWS = {};
  
      loginProducer = new LoginProducer(
        mockApp,
        mockCache,
        mockLogger,
        mockRedis,
        mockEmail,
        mockAMQP,
        mockModels,
        mockWS
      );
    });
  
    afterEach(() => {
      // Evita vazamento de handle
      clearInterval(loginProducer._intervalId);
      jest.clearAllMocks();
    });
  
    test('should verify a correct password using argon2', async () => {
      argon2.verify.mockResolvedValue(true); // simula retorno positivo
  
      const result = await loginProducer.verifyPassword('password', 'fakeHash');
      expect(result).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith('fakeHash', 'password', expect.any(Object));
    });
  
    test('should reject incorrect password', async () => {
      argon2.verify.mockResolvedValue(false); // simula falha de verificação
  
      const result = await loginProducer.verifyPassword('wrongPassword', 'fakeHash');
      expect(result).toBe(false);
      expect(argon2.verify).toHaveBeenCalled();
    });
  });
  