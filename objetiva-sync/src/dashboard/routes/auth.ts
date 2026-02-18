/**
 * Rutas de autenticación
 * Login, logout, cambio de password
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  validateCredentials,
  changePassword,
  setUserInSession,
  clearUserFromSession,
  getUserFromSession,
} from '../../services/auth-service.js';
import { logger } from '../../utils/logger.js';

/**
 * Schema de validación para login
 */
const loginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string', minLength: 1 },
      password: { type: 'string', minLength: 1 },
    },
  },
};

/**
 * Schema de validación para cambio de password
 */
const changePasswordSchema = {
  body: {
    type: 'object',
    required: ['newPassword', 'confirmPassword'],
    properties: {
      newPassword: { type: 'string', minLength: 6 },
      confirmPassword: { type: 'string', minLength: 6 },
    },
  },
};

/**
 * Registra las rutas de autenticación
 */
export async function registerAuthRoutes(app: FastifyInstance) {
  /**
   * GET / - Página principal (redirige a login o dashboard)
   */
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromSession(request.session);

    if (!user) {
      return reply.redirect('/login');
    }

    if (user.requirePasswordChange) {
      return reply.redirect('/change-password');
    }

    return reply.redirect('/dashboard');
  });

  /**
   * GET /login - Página de login
   */
  app.get('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromSession(request.session);

    // Si ya está autenticado, redirigir al dashboard
    if (user && !user.requirePasswordChange) {
      return reply.redirect('/dashboard');
    }

    return reply.view('auth/login.ejs', {
      error: null,
    });
  });

  /**
   * POST /auth/login - Procesar login
   */
  app.post(
    '/auth/login',
    { schema: loginSchema },
    async (
      request: FastifyRequest<{
        Body: { username: string; password: string };
      }>,
      reply: FastifyReply
    ) => {
      const { username, password } = request.body;

      try {
        const user = await validateCredentials(username, password);

        if (!user) {
          // Credenciales inválidas
          return reply.view('auth/login.ejs', {
            error: 'Usuario o contraseña incorrectos',
          });
        }

        // Guardar usuario en sesión
        setUserInSession(request.session, user);

        logger.info({ username }, 'Usuario autenticado');

        // Si requiere cambio de password, redirigir
        if (user.requirePasswordChange) {
          return reply.redirect('/change-password');
        }

        // Redirigir al dashboard
        return reply.redirect('/dashboard');
      } catch (error) {
        logger.error({ error }, 'Error en login');

        return reply.view('auth/login.ejs', {
          error: 'Error al procesar login. Intente nuevamente.',
        });
      }
    }
  );

  /**
   * GET /change-password - Página de cambio de password
   */
  app.get('/change-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromSession(request.session);

    if (!user) {
      return reply.redirect('/login');
    }

    return reply.view('auth/change-password.ejs', {
      user,
      error: null,
      success: null,
    });
  });

  /**
   * POST /auth/change-password - Procesar cambio de password
   */
  app.post(
    '/auth/change-password',
    { schema: changePasswordSchema },
    async (
      request: FastifyRequest<{
        Body: { newPassword: string; confirmPassword: string };
      }>,
      reply: FastifyReply
    ) => {
      const user = getUserFromSession(request.session);

      if (!user) {
        return reply.redirect('/login');
      }

      const { newPassword, confirmPassword } = request.body;

      try {
        // Verificar que coincidan
        if (newPassword !== confirmPassword) {
          return reply.view('auth/change-password.ejs', {
            user,
            error: 'Las contraseñas no coinciden',
            success: null,
          });
        }

        // Cambiar password
        const success = await changePassword(newPassword);

        if (!success) {
          return reply.view('auth/change-password.ejs', {
            user,
            error: 'Error al cambiar contraseña. Debe tener al menos 6 caracteres.',
            success: null,
          });
        }

        // Actualizar usuario en sesión (ya no requiere cambio)
        user.requirePasswordChange = false;
        setUserInSession(request.session, user);

        logger.info({ username: user.username }, 'Contraseña cambiada exitosamente');

        // Redirigir al dashboard
        return reply.redirect('/dashboard');
      } catch (error) {
        logger.error({ error }, 'Error al cambiar contraseña');

        return reply.view('auth/change-password.ejs', {
          user,
          error: 'Error al cambiar contraseña. Intente nuevamente.',
          success: null,
        });
      }
    }
  );

  /**
   * POST /auth/logout - Cerrar sesión
   */
  app.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromSession(request.session);

    if (user) {
      logger.info({ username: user.username }, 'Usuario cerró sesión');
    }

    clearUserFromSession(request.session);

    return reply.redirect('/login');
  });


  /**
   * GET /auth/logout - Cerrar sesión (GET para links)
   */
  app.get('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromSession(request.session);

    if (user) {
      logger.info({ username: user.username }, 'Usuario cerró sesión');
    }

    clearUserFromSession(request.session);

    return reply.redirect('/login');
  });

  /**
   * GET /api/auth/session - Verificar estado de sesión (JSON)
   *
   * Used by React dashboard to check authentication status.
   */
  app.get('/api/auth/session', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromSession(request.session);

    if (!user) {
      return reply.send({
        authenticated: false,
        user: null,
      });
    }

    return reply.send({
      authenticated: true,
      user: {
        username: user.username,
        requirePasswordChange: user.requirePasswordChange || false,
      },
    });
  });
}
