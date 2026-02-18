/**
 * Extensiones de tipos para Fastify
 */

import 'fastify';
import type { User } from '../services/auth-service.js';

interface FlashMessage {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

declare module 'fastify' {
  interface FastifyReply {
    locals: {
      appName: string;
      user: User | null;
      flashMessages: FlashMessage[];
      currentPath: string;
    };
  }

  interface Session {
    user?: User;
    flash?: FlashMessage[];
  }
}

declare module '@fastify/session' {
  interface FastifySessionObject {
    user?: User;
    flash?: FlashMessage[];
  }
}
