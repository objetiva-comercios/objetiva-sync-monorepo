/**
 * API endpoints para configuración del sistema
 * Gestión de configuración de API remota y otros parámetros
 */

import type { FastifyInstance } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import { getConfig, setConfig } from '../../../store/repositories/config-repo.js';
import { encrypt } from '../../../utils/crypto.js';
import { getJwtToken } from '../../../services/gateway-client.js';
import { logger } from '../../../utils/logger.js';

/**
 * Keys de configuración utilizadas
 */
const CONFIG_KEYS = {
  API_URL: 'REMOTE_API_URL',
  JWT_SECRET: 'JWT_SECRET',
  API_TIMEOUT: 'REMOTE_API_TIMEOUT',
  API_RETRY_ATTEMPTS: 'REMOTE_API_RETRY_ATTEMPTS',
  API_ENDPOINT_ARTICULOS: 'REMOTE_API_ENDPOINT_ARTICULOS',
  API_ENDPOINT_COMPROBANTES: 'REMOTE_API_ENDPOINT_COMPROBANTES',
  API_ENDPOINT_PAGOS: 'REMOTE_API_ENDPOINT_PAGOS',
  API_TEST_STATUS: 'REMOTE_API_TEST_STATUS',
  API_TEST_MESSAGE: 'REMOTE_API_TEST_MESSAGE',
  API_TESTED_AT: 'REMOTE_API_TESTED_AT',
};

/**
 * Registra las rutas de API de configuración
 */
export async function registerConfigApiRoutes(app: FastifyInstance) {
  /**
   * GET /api/config/api - Obtener configuración de API (JSON)
   */
  app.get(
    '/api/config/api',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const [
          url,
          jwtSecret,
          timeout,
          retryAttempts,
          endpointArticulos,
          endpointComprobantes,
          endpointPagos,
        ] = await Promise.all([
          getConfig(CONFIG_KEYS.API_URL),
          getConfig(CONFIG_KEYS.JWT_SECRET),
          getConfig(CONFIG_KEYS.API_TIMEOUT),
          getConfig(CONFIG_KEYS.API_RETRY_ATTEMPTS),
          getConfig(CONFIG_KEYS.API_ENDPOINT_ARTICULOS),
          getConfig(CONFIG_KEYS.API_ENDPOINT_COMPROBANTES),
          getConfig(CONFIG_KEYS.API_ENDPOINT_PAGOS),
        ]);

        const config: Record<string, unknown> = {};

        if (url) config.url = url.value;
        config.paired = !!(url && jwtSecret);
        if (timeout) config.timeout = parseInt(timeout.value, 10);
        if (retryAttempts) config.retryAttempts = parseInt(retryAttempts.value, 10);
        if (endpointArticulos) config.endpointArticulos = endpointArticulos.value;
        if (endpointComprobantes) config.endpointComprobantes = endpointComprobantes.value;
        if (endpointPagos) config.endpointPagos = endpointPagos.value;

        return reply.send({
          success: true,
          data: config,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener configuración de API');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener configuración',
        });
      }
    }
  );

  /**
   * GET /api/config/api/status - Obtener estado de API (HTML fragment)
   * Shows pairing status instead of token expiry
   */
  app.get(
    '/api/config/api/status',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const [url, jwtSecret, testStatus, testMessage, testedAt] = await Promise.all([
          getConfig(CONFIG_KEYS.API_URL),
          getConfig(CONFIG_KEYS.JWT_SECRET),
          getConfig(CONFIG_KEYS.API_TEST_STATUS),
          getConfig(CONFIG_KEYS.API_TEST_MESSAGE),
          getConfig(CONFIG_KEYS.API_TESTED_AT),
        ]);

        const isPaired = !!(url && jwtSecret);

        if (!isPaired) {
          return reply.type('text/html').send(`
            <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div class="flex">
                <div class="flex-shrink-0">
                  <i data-lucide="alert-triangle" class="h-5 w-5 text-yellow-400"></i>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-yellow-800">
                    No enlazado
                  </h3>
                  <div class="mt-2 text-sm text-yellow-700">
                    <p>Gateway no enlazado &mdash; ingresa el codigo de pairing en Configuracion API.</p>
                  </div>
                </div>
              </div>
            </div>
          `);
        }

        // Paired — show connection test status
        const isSuccess = testStatus?.value === 'success';
        const isFailed = testStatus?.value === 'failed';
        const notTested = !testStatus;

        let statusClass = '';
        let iconName = '';
        let iconClass = '';
        let title = '';
        let description = '';

        if (isSuccess) {
          statusClass = 'bg-green-50 border-green-400';
          iconName = 'check-circle';
          iconClass = 'text-green-400';
          title = 'Enlazado y Funcionando';
          description = testMessage?.value || `Conectado a ${escapeHtml(url!.value)}`;
        } else if (isFailed) {
          statusClass = 'bg-red-50 border-red-400';
          iconName = 'x-circle';
          iconClass = 'text-red-400';
          title = 'Enlazado — Error de conexion';
          description = testMessage?.value || 'La ultima prueba de conexion fallo';
        } else {
          statusClass = 'bg-blue-50 border-blue-400';
          iconName = 'link';
          iconClass = 'text-blue-400';
          title = 'Enlazado';
          description = `Conectado a ${escapeHtml(url!.value)} — no se ha probado la conexion aun`;
        }

        const html = `
          <div class="${statusClass} border-l-4 p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <i data-lucide="${iconName}" class="h-5 w-5 ${iconClass}"></i>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium ${isSuccess ? 'text-green-800' : isFailed ? 'text-red-800' : 'text-blue-800'}">
                    ${escapeHtml(title)}
                  </h3>
                  <div class="mt-1 text-sm ${isSuccess ? 'text-green-700' : isFailed ? 'text-red-700' : 'text-blue-700'}">
                    <p>${escapeHtml(description)}</p>
                    ${
                      testedAt
                        ? `<p class="text-xs mt-1">Ultima prueba: ${new Date(testedAt.value).toLocaleString('es-AR')}</p>`
                        : ''
                    }
                  </div>
                </div>
              </div>
              ${
                !notTested
                  ? `
                <div>
                  <button
                    onclick="testApiConnection()"
                    class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      isSuccess
                        ? 'text-green-700 bg-green-100 hover:bg-green-200'
                        : isFailed
                          ? 'text-red-700 bg-red-100 hover:bg-red-200'
                          : 'text-blue-700 bg-blue-100 hover:bg-blue-200'
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${isSuccess ? 'green' : isFailed ? 'red' : 'blue'}-500"
                  >
                    <i data-lucide="refresh-cw" class="mr-2 h-4 w-4"></i>
                    Probar Nuevamente
                  </button>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `;

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al obtener estado de API');
        return reply.status(500).type('text/html').send(`
          <div class="bg-red-50 border-l-4 border-red-400 p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <i data-lucide="alert-circle" class="h-5 w-5 text-red-400"></i>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">Error al cargar estado</h3>
              </div>
            </div>
          </div>
        `);
      }
    }
  );

  /**
   * POST /api/config/api - Guardar configuración de API (solo URL del gateway)
   */
  app.post(
    '/api/config/api',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const body = request.body as {
          url: string;
          timeout?: number;
          retryAttempts?: number;
          endpointArticulos?: string | null;
          endpointComprobantes?: string | null;
          endpointPagos?: string | null;
        };

        if (!body.url) {
          return reply.status(400).send({
            success: false,
            error: 'Falta campo requerido (url)',
          });
        }

        // Save configuration
        await Promise.all([
          setConfig(CONFIG_KEYS.API_URL, body.url),
          setConfig(CONFIG_KEYS.API_TIMEOUT, String(body.timeout || 30000)),
          setConfig(CONFIG_KEYS.API_RETRY_ATTEMPTS, String(body.retryAttempts ?? 3)),
        ]);

        // Save optional endpoints
        if (body.endpointArticulos) {
          await setConfig(CONFIG_KEYS.API_ENDPOINT_ARTICULOS, body.endpointArticulos);
        }
        if (body.endpointComprobantes) {
          await setConfig(CONFIG_KEYS.API_ENDPOINT_COMPROBANTES, body.endpointComprobantes);
        }
        if (body.endpointPagos) {
          await setConfig(CONFIG_KEYS.API_ENDPOINT_PAGOS, body.endpointPagos);
        }

        logger.info('Configuracion de API guardada exitosamente');

        return reply.send({
          success: true,
          message: 'Configuracion guardada exitosamente',
        });
      } catch (error) {
        logger.error({ error }, 'Error al guardar configuración de API');
        return reply.status(500).send({
          success: false,
          error: 'Error al guardar configuración',
        });
      }
    }
  );

  /**
   * POST /api/config/pairing/claim - Reclamar código de emparejamiento del gateway
   * Saves only REMOTE_API_URL and JWT_SECRET (no password)
   */
  app.post(
    '/api/config/pairing/claim',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const body = request.body as {
          gatewayUrl?: string;
          code?: string;
        };

        if (!body.gatewayUrl || !body.code) {
          return reply.status(400).send({
            success: false,
            error: 'Faltan campos requeridos (gatewayUrl, code)',
          });
        }

        // Normalize: remove trailing slashes
        const baseUrl = body.gatewayUrl.replace(/\/+$/, '');

        let response: Response;
        try {
          response = await fetch(`${baseUrl}/api/pairing/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: body.code }),
            signal: AbortSignal.timeout(10000),
          });
        } catch {
          return reply.status(502).send({
            success: false,
            error: 'No se pudo conectar al gateway',
          });
        }

        if (response.status === 404) {
          return reply.status(404).send({
            success: false,
            error: 'Codigo invalido o expirado',
          });
        }

        if (response.status === 410) {
          return reply.status(410).send({
            success: false,
            error: 'Codigo ya fue utilizado',
          });
        }

        if (!response.ok) {
          return reply.status(502).send({
            success: false,
            error: `Error del gateway: HTTP ${response.status}`,
          });
        }

        const data = (await response.json()) as {
          success: boolean;
          gatewayUrl: string | null;
          jwtSecret: string | null;
        };

        if (!data.jwtSecret) {
          return reply.status(502).send({
            success: false,
            error: 'El gateway no devolvio el JWT secret necesario para el enlace',
          });
        }

        // Always use the URL the user entered — it's the one that actually reached the gateway.
        // Save only URL (plain) and JWT_SECRET (encrypted) — no password needed
        await Promise.all([
          setConfig('REMOTE_API_URL', baseUrl),
          setConfig('JWT_SECRET', encrypt(data.jwtSecret), true),
        ]);

        logger.info({ baseUrl }, 'Pairing claim exitoso — configuracion guardada');

        return reply.send({
          success: true,
          gatewayUrl: baseUrl,
        });
      } catch (error) {
        logger.error({ error }, 'Error al procesar claim de emparejamiento');
        return reply.status(502).send({
          success: false,
          error: 'No se pudo conectar al gateway',
        });
      }
    }
  );

  /**
   * POST /api/config/api/test - Probar conexion a API via JWT + /health
   */
  app.post(
    '/api/config/api/test',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const url = await getConfig(CONFIG_KEYS.API_URL);

        if (!url) {
          return reply.status(400).send({
            success: false,
            error: 'Gateway no configurado',
          });
        }

        // Sign a JWT locally and hit /health
        let token: string;
        try {
          token = await getJwtToken();
        } catch {
          // No JWT_SECRET configured — not paired
          await Promise.all([
            setConfig(CONFIG_KEYS.API_TEST_STATUS, 'failed'),
            setConfig(CONFIG_KEYS.API_TEST_MESSAGE, 'Gateway no enlazado — ejecuta el pairing primero'),
            setConfig(CONFIG_KEYS.API_TESTED_AT, new Date().toISOString()),
          ]);

          return reply.status(400).send({
            success: false,
            error: 'Gateway no enlazado — ejecuta el pairing primero',
          });
        }

        try {
          const baseUrl = url.value.replace(/\/+$/, '');
          const response = await fetch(`${baseUrl}/health`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          });

          if (response.ok) {
            await Promise.all([
              setConfig(CONFIG_KEYS.API_TEST_STATUS, 'success'),
              setConfig(CONFIG_KEYS.API_TEST_MESSAGE, 'Conexion exitosa — JWT valido'),
              setConfig(CONFIG_KEYS.API_TESTED_AT, new Date().toISOString()),
            ]);

            return reply.send({
              success: true,
              message: 'Conexion exitosa — JWT valido',
            });
          }

          // Check for 401 — JWT_SECRET mismatch
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          if (response.status === 401) {
            errorMessage = 'JWT rechazado por el gateway — posible desincronizacion del JWT_SECRET. Re-ejecuta el pairing.';
          } else {
            try {
              const errorData = (await response.json()) as Record<string, any>;
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
              // Ignore JSON parse error
            }
          }

          await Promise.all([
            setConfig(CONFIG_KEYS.API_TEST_STATUS, 'failed'),
            setConfig(CONFIG_KEYS.API_TEST_MESSAGE, errorMessage),
            setConfig(CONFIG_KEYS.API_TESTED_AT, new Date().toISOString()),
          ]);

          return reply.status(400).send({
            success: false,
            error: errorMessage,
          });
        } catch (fetchError) {
          await Promise.all([
            setConfig(CONFIG_KEYS.API_TEST_STATUS, 'failed'),
            setConfig(
              CONFIG_KEYS.API_TEST_MESSAGE,
              fetchError instanceof Error ? fetchError.message : String(fetchError)
            ),
            setConfig(CONFIG_KEYS.API_TESTED_AT, new Date().toISOString()),
          ]);

          logger.error({ error: fetchError }, 'Error al probar API');
          return reply.status(400).send({
            success: false,
            error: `Error de conexion: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
          });
        }
      } catch (error) {
        logger.error({ error }, 'Error al probar configuracion de API');
        return reply.status(500).send({
          success: false,
          error: 'Error al probar conexion',
        });
      }
    }
  );
}

/**
 * Helper para escapar HTML y prevenir XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
