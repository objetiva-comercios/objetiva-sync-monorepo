import pino from 'pino'
import { getCorrelationId } from './correlation.js'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  mixin: () => {
    const correlationId = getCorrelationId()
    return correlationId ? { correlationId } : {}
  },
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname'
          }
        }
      : undefined
})
