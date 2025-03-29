import { parentPort, workerData, threadId } from 'worker_threads';
import argon2 from 'argon2';
import { performance } from 'perf_hooks';

// Configurações de performance
const MAX_OPERATION_TIME = 5000; // 5 segundos
const MEMORY_LIMIT = 1024 * 1024 * 50; // 50MB

class PasswordWorker {
  constructor() {
    this.startTime = performance.now();
    this.init();
  }

  init() {
    try {
      this.validateInput();
      this.memoryGuard();
      this.setTimeoutGuard();
      
      argon2.verify(workerData.hash, workerData.password)
        .then(match => this.sendResponse({ success: true, match }))
        .catch(error => this.sendError(error));

    } catch (error) {
      this.sendError(error);
    }
  }

  validateInput() {
    if (!workerData?.hash || !workerData?.password) {
      throw new Error('Dados de entrada inválidos');
    }
    
    if (typeof workerData.hash !== 'string' || typeof workerData.password !== 'string') {
      throw new TypeError('Tipos de dados inválidos');
    }
  }

  memoryGuard() {
    const memoryUsage = process.memoryUsage().rss;
    if (memoryUsage > MEMORY_LIMIT) {
      throw new Error(`Excesso de consumo de memória: ${memoryUsage} bytes`);
    }
  }

  setTimeoutGuard() {
    const elapsed = performance.now() - this.startTime;
    if (elapsed > MAX_OPERATION_TIME) {
      throw new Error(`Timeout excedido: ${elapsed}ms`);
    }
  }

  sendResponse(result) {
    const response = {
      ...result,
      threadId,
      duration: performance.now() - this.startTime,
      memoryUsage: process.memoryUsage().rss
    };
    
    parentPort.postMessage(response);
    this.cleanup();
  }

  sendError(error) {
    const errorResponse = {
      success: false,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      threadId
    };
    
    parentPort.postMessage(errorResponse);
    this.cleanup();
  }

  cleanup() {
    // Força coleta de lixo (V8 only)
    if (global.gc) {
      global.gc();
    }
    
    // Desreferencia objetos grandes
    workerData.hash = null;
    workerData.password = null;
  }
}

new PasswordWorker();