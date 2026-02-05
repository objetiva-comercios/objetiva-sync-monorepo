/**
 * API endpoints para configuración del sistema
 * Gestión de configuración de API remota y otros parámetros
 */

import type { FastifyInstance } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import { getConfig, setConfig } from '../../../store/repositories/config-repo.js';
import { encrypt, decrypt } from '../../../utils/crypto.js';
import { logger } from '../../../utils/logger.js';

/**
 * Keys de configuración utilizadas
 */
const CONFIG_KEYS = {
  API_URL: 'REMOTE_API_URL',
  API_USERNAME: 'REMOTE_API_USERNAME',
  API_PASSWORD: 'REMOTE_API_PASSWORD',
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
          username,
          timeout,
          retryAttempts,
          endpointArticulos,
          endpointComprobantes,
          endpointPagos,
        ] = await Promise.all([
          getConfig(CONFIG_KEYS.API_URL),
          getConfig(CONFIG_KEYS.API_USERNAME),
          getConfig(CONFIG_KEYS.API_TIMEOUT),
          getConfig(CONFIG_KEYS.API_RETRY_ATTEMPTS),
          getConfig(CONFIG_KEYS.API_ENDPOINT_ARTICULOS),
          getConfig(CONFIG_KEYS.API_ENDPOINT_COMPROBANTES),
          getConfig(CONFIG_KEYS.API_ENDPOINT_PAGOS),
        ]);

        const config: Record<string, unknown> = {};

        if (url) config.url = url.value;
        if (username) config.username = username.value;
        // Don't return password for security
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
   */
  app.get(
    '/api/config/api/status',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const [url, testStatus, testMessage, testedAt] = await Promise.all([
          getConfig(CONFIG_KEYS.API_URL),
          getConfig(CONFIG_KEYS.API_TEST_STATUS),
          getConfig(CONFIG_KEYS.API_TEST_MESSAGE),
          getConfig(CONFIG_KEYS.API_TESTED_AT),
        ]);

        if (!url) {
          return reply.type('text/html').send(`
            <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div class="flex">
                <div class="flex-shrink-0">
                  <i data-lucide="alert-triangle" class="h-5 w-5 text-yellow-400"></i>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-yellow-800">
                    API no configurada
                  </h3>
                  <div class="mt-2 text-sm text-yellow-700">
                    <p>Configure la URL y credenciales de la API para enviar datos.</p>
                  </div>
                </div>
              </div>
            </div>
          `);
        }

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
          title = 'API Configurada y Funcionando';
          description = testMessage?.value || 'La conexión con la API es exitosa';
        } else if (isFailed) {
          statusClass = 'bg-red-50 border-red-400';
          iconName = 'x-circle';
          iconClass = 'text-red-400';
          title = 'Error en la API';
          description = testMessage?.value || 'La última prueba de conexión falló';
        } else {
          statusClass = 'bg-blue-50 border-blue-400';
          iconName = 'info';
          iconClass = 'text-blue-400';
          title = 'API Configurada';
          description = 'No se ha probado la conexión aún';
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
                        ? `<p class="text-xs mt-1">Última prueba: ${new Date(testedAt.value).toLocaleString('es-AR')}</p>`
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
   * POST /api/config/api - Guardar configuración de API
   */
  app.post(
    '/api/config/api',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const body = request.body as {
          url: string;
          username: string;
          password: string;
          timeout?: number;
          retryAttempts?: number;
          endpointArticulos?: string | null;
          endpointComprobantes?: string | null;
          endpointPagos?: string | null;
        };

        if (!body.url || !body.username || !body.password) {
          return reply.status(400).send({
            success: false,
            error: 'Faltan campos requeridos (url, username, password)',
          });
        }

        // Encrypt password
        const encryptedPassword = encrypt(body.password);

        // Save configuration
        await Promise.all([
          setConfig(CONFIG_KEYS.API_URL, body.url),
          setConfig(CONFIG_KEYS.API_USERNAME, body.username),
          setConfig(CONFIG_KEYS.API_PASSWORD, encryptedPassword, true),
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

        logger.info('Configuración de API guardada exitosamente');

        return reply.send({
          success: true,
          message: 'Configuración guardada exitosamente',
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
   * POST /api/config/api/test - Probar conexión a API
   */
  app.post(
    '/api/config/api/test',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const [url, username, passwordConfig] = await Promise.all([
          getConfig(CONFIG_KEYS.API_URL),
          getConfig(CONFIG_KEYS.API_USERNAME),
          getConfig(CONFIG_KEYS.API_PASSWORD),
        ]);

        if (!url || !username || !passwordConfig) {
          return reply.status(400).send({
            success: false,
            error: 'La API no está configurada completamente',
          });
        }

        // Decrypt password
        const password = decrypt(passwordConfig.value);

        // Test API connection with actual login
        try {
          // Remove trailing slash from URL if present
          const baseUrl = url.value.replace(/\/+$/, '');
          const loginUrl = `${baseUrl}/auth/login`;
          const response = await fetch(loginUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              username: username.value,
              password: password,
            }),
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });

          if (response.ok) {
            const data = (await response.json()) as Record<string, any>;
            if (!data.success || !data.token) {
              // Save test failure
              await Promise.all([
                setConfig(CONFIG_KEYS.API_TEST_STATUS, 'failed'),
                setConfig(
                  CONFIG_KEYS.API_TEST_MESSAGE,
                  `Login falló: ${data.message || 'Error desconocido'}`
                ),
                setConfig(CONFIG_KEYS.API_TESTED_AT, new Date().toISOString()),
              ]);

              return reply.status(400).send({
                success: false,
                error: `Login falló: ${data.message || 'Error desconocido'}`,
              });
            }
            // Save test result
            await Promise.all([
              setConfig(CONFIG_KEYS.API_TEST_STATUS, 'success'),
              setConfig(CONFIG_KEYS.API_TEST_MESSAGE, 'Autenticación exitosa - Credenciales válidas'),
              setConfig(CONFIG_KEYS.API_TESTED_AT, new Date().toISOString()),
            ]);

            return reply.send({
              success: true,
              message: 'Autenticación exitosa - Credenciales validadas correctamente',
            });
          } else {
            // Try to get error message from response
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
              const errorData = (await response.json()) as Record<string, any>;
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
              // Ignore JSON parse error
            }

            // Save test failure
            await Promise.all([
              setConfig(CONFIG_KEYS.API_TEST_STATUS, 'failed'),
              setConfig(CONFIG_KEYS.API_TEST_MESSAGE, errorMessage),
              setConfig(CONFIG_KEYS.API_TESTED_AT, new Date().toISOString()),
            ]);

            return reply.status(400).send({
              success: false,
              error: errorMessage,
            });
          }
        } catch (fetchError) {
          // Save test failure
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
            error: `Error de conexión: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
          });
        }
      } catch (error) {
        logger.error({ error }, 'Error al probar configuración de API');
        return reply.status(500).send({
          success: false,
          error: 'Error al probar conexión',
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
