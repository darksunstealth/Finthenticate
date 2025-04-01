import { createLogger, format, transports }  from 'winston';
const { combine, timestamp, printf, errors, colorize } = format;
import DailyRotateFile  from 'winston-daily-rotate-file';

const safeStringify = (obj) => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  });
};

// Função para colorir a mensagem inteira
const customColorizer = format((info) => {
  // Cores personalizadas para diferentes partes
  const levelColor = colorize().colorize(info.level, `[${info.level.toUpperCase()}]`);
  const timeColor = `\x1b[36m${info.timestamp}\x1b[0m`; // Cyan para o timestamp
  const messageColor = `\x1b[33m${info.message}\x1b[0m`; // Yellow para a mensagem

  info.message = `${timeColor} ${levelColor}: ${messageColor}`;
  return info;
});

// Formatação personalizada com cores aplicadas a todas as partes
const logFormat = printf(({ message }) => {
  return message; // A mensagem já vem colorida pelo `customColorizer`
});

const logger = createLogger({
  level: 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    customColorizer(), // Aplica a coloração personalizada
    logFormat
  ),
  transports: [
    new transports.Console(), // Mostra logs coloridos no console
    new DailyRotateFile({
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat // Logs simples, sem cor, em arquivos
      ),
    }),
  ],
  exceptionHandlers: [
    new transports.File({ filename: 'exceptions.log' }),
  ],
  rejectionHandlers: [
    new transports.File({ filename: 'rejections.log' }),
  ],
});

export default logger;
