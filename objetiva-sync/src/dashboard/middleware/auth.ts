/**
 * Middleware de autenticación
 * Verifica que el usuario esté autenticado y tenga los permisos necesarios
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getUserFromSession } from '../../services/auth-service.js';

/**
 * Middleware de autenticación para API (devuelve JSON en lugar de redirigir)
 */
export async function requireAuthApi(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = getUserFromSession(request.session);

  if (!user) {
    return reply.status(401).send({
      error: 'No autenticado',
      message: 'Debe iniciar sesión para acceder a esta API',
    });
  }

  if (user.requirePasswordChange) {
    return reply.status(403).send({
      error: 'Cambio de contraseña requerido',
      message: 'Debe cambiar su contraseña antes de continuar',
    });
  }
}

/**
 * Middleware que requiere autenticación
 * Redirige a login si no está autenticado
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = getUserFromSession(request.session);

  if (!user) {
    // No autenticado, redirigir a login
    return reply.redirect('/login');
  }

  // Si requiere cambio de password y no está en esa página, redirigir
  if (
    user.requirePasswordChange &&
    !request.url.startsWith('/change-password') &&
    !request.url.startsWith('/auth/change-password') &&
    !request.url.startsWith('/auth/logout')
  ) {
    return reply.redirect('/change-password');
  }
}

/**
 * Middleware que requiere que NO necesite cambio de password
 * Redirige a change-password si lo requiere
 */
export async function requireNoPasswordChange(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = getUserFromSession(request.session);

  if (!user) {
    return reply.redirect('/login');
  }

  if (user.requirePasswordChange) {
    return reply.redirect('/change-password');
  }
}
