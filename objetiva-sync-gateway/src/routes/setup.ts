import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { logger } from '../lib/logger.js'
import fs from 'fs/promises'
import path from 'path'
import { writeEnvVar } from '../utils/env-writer.js'

const TestDbSchema = z.object({
  databaseUrl: z.string().url('URL de base de datos inválida')
})

const SetPasswordSchema = z.object({
  password: z.string().min(6, 'Password debe tener al menos 6 caracteres')
})

const SaveDomainSchema = z.object({
  protocol: z.enum(['http', 'https']),
  domain: z.string().min(1, 'Domain is required').regex(/^[a-zA-Z0-9.-]+$/, 'Domain must be a valid hostname'),
  port: z.string().regex(/^\d+$/, 'Port must be numeric').optional().or(z.literal(''))
})

/**
 * Assembles a gateway public URL from its parts.
 * Default ports (80 for http, 443 for https) are omitted from the URL.
 */
export function assembleGatewayUrl(protocol: string, domain: string, port?: string): string {
  const defaultPorts: Record<string, string> = { http: '80', https: '443' }
  const includePort = port && port !== '' && port !== defaultPorts[protocol]
  return includePort ? `${protocol}://${domain}:${port}` : `${protocol}://${domain}`
}

export async function registerSetupRoutes(app: FastifyInstance) {
  // GET /setup - Interfaz web de configuración
  app.get('/setup', async (_request, reply) => {
    return reply.type('text/html').send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${process.env.APP_NAME || 'Objetiva Sync Gateway'} - Configuración Inicial</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .container {
      max-width: 800px;
      width: 100%;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }

    .header h1 {
      font-size: 28px;
      margin-bottom: 8px;
    }

    .header p {
      opacity: 0.9;
      font-size: 14px;
    }

    .content {
      padding: 40px;
    }

    .step {
      margin-bottom: 40px;
      padding-bottom: 40px;
      border-bottom: 1px solid #e5e7eb;
    }

    .step:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .step-header {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
    }

    .step-number {
      width: 36px;
      height: 36px;
      background: #667eea;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      margin-right: 12px;
      flex-shrink: 0;
    }

    .step-title {
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }

    .step-description {
      color: #6b7280;
      margin-bottom: 20px;
      line-height: 1.6;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
      font-size: 14px;
    }

    input, textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
    }

    input:focus, textarea:focus {
      outline: none;
      border-color: #667eea;
    }

    .input-hint {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .btn-primary {
      background: #667eea;
      color: white;
    }

    .btn-primary:hover {
      background: #5568d3;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover {
      background: #e5e7eb;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .btn-group {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .alert {
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }

    .alert.show {
      display: block;
    }

    .alert-success {
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #6ee7b7;
    }

    .alert-error {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
    }

    .alert-info {
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #93c5fd;
    }

    .alert-warning {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #fff;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .status-pending {
      background: #fef3c7;
      color: #92400e;
    }

    .status-success {
      background: #d1fae5;
      color: #065f46;
    }

    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
    }

    .info-box {
      background: #f9fafb;
      border-left: 4px solid #667eea;
      padding: 16px;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .info-box strong {
      display: block;
      margin-bottom: 8px;
      color: #374151;
    }

    .info-box p {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 ${process.env.APP_NAME || 'Objetiva Sync Gateway'}</h1>
      <p>Configuración inicial del servidor</p>
    </div>

    <div class="content">
      <!-- Current Configuration Status -->
      <div id="current-config" class="info-box" style="display: none; margin-bottom: 24px;">
        <strong>📋 Configuración Actual</strong>
        <div id="current-config-content" style="margin-top: 12px;">
          <div style="font-size: 13px; color: #6b7280; line-height: 1.8;">
            Cargando...
          </div>
        </div>
      </div>

      <!-- PASO 1: PostgreSQL -->
      <div class="step">
        <div class="step-header">
          <div class="step-number">1</div>
          <div class="step-title">Configurar PostgreSQL</div>
        </div>
        <p class="step-description">
          Configura la conexión a tu base de datos PostgreSQL existente. El sistema verificará que las tablas necesarias existan.
        </p>

        <div class="form-group">
          <label for="db-url">Database URL</label>
          <input
            type="text"
            id="db-url"
            placeholder="postgresql://user:password@localhost:5432/objetiva_db"
            value="postgresql://user:password@localhost:5432/objetiva_db"
          >
          <div class="input-hint">Formato: postgresql://usuario:contraseña@host:puerto/nombre_db</div>
        </div>

        <div id="db-alert" class="alert"></div>

        <div class="btn-group">
          <button class="btn btn-primary" onclick="testDatabase()" id="test-db-btn">
            Probar Conexión
          </button>
        </div>
      </div>

      <!-- PASO 2: JWT Secret -->
      <div class="step">
        <div class="step-header">
          <div class="step-number">2</div>
          <div class="step-title">Configurar JWT Secret</div>
        </div>
        <p class="step-description">
          El JWT Secret debe ser <strong>el mismo</strong> que usas en Objetiva Sync para que los tokens sean válidos.
        </p>

        <div class="form-group">
          <label for="jwt-secret">JWT Secret</label>
          <input
            type="text"
            id="jwt-secret"
            placeholder="tu-secret-super-seguro-aqui"
          >
          <div class="input-hint">Usa el mismo secret configurado en objetiva-sync</div>
        </div>

        <div id="jwt-alert" class="alert"></div>

        <div class="btn-group">
          <button class="btn btn-secondary" onclick="generateSecret()">
            🎲 Generar Automáticamente
          </button>
          <button class="btn btn-primary" onclick="saveJwtSecret()" id="save-jwt-btn">
            Guardar Secret
          </button>
        </div>
      </div>

      <!-- PASO 3: Verificar Tablas -->
      <div class="step">
        <div class="step-header">
          <div class="step-number">3</div>
          <div class="step-title">Verificar Tablas Existentes</div>
        </div>
        <p class="step-description">
          Verifica que las tablas necesarias existan en PostgreSQL: <code>articulos</code>, <code>comprobantes_cabecera</code>, <code>comprobantes_detalle</code>, <code>comprobantes_pagos</code>.
        </p>

        <div id="verify-alert" class="alert"></div>

        <div class="btn-group">
          <button class="btn btn-primary" onclick="verifyTables()" id="verify-btn">
            Verificar Tablas
          </button>
        </div>
      </div>

      <!-- PASO 4: Configurar Credenciales -->
      <div class="step">
        <div class="step-header">
          <div class="step-number">4</div>
          <div class="step-title">Configurar Credenciales de Autenticación</div>
        </div>
        <p class="step-description">
          Configura la contraseña del usuario <strong>admin</strong> que se usará para autenticarse desde el sincronizador local.
        </p>

        <div class="info-box">
          <strong>Usuario fijo:</strong>
          <p>El sistema usa un usuario fijo <code>admin</code>. Solo necesitas configurar la contraseña.</p>
        </div>

        <div class="form-group">
          <label for="admin-password">Password para usuario 'admin'</label>
          <input type="password" id="admin-password" placeholder="Contraseña segura">
          <div class="input-hint">Mínimo 6 caracteres. Esta contraseña se usará en objetiva-sync.</div>
        </div>

        <div id="password-alert" class="alert"></div>

        <div class="btn-group">
          <button class="btn btn-primary" onclick="setAdminPassword()" id="set-password-btn">
            Configurar Contraseña
          </button>
        </div>
      </div>

      <!-- Estado Final -->
      <div class="step" style="border-top: 2px solid #e5e7eb; padding-top: 30px;">
        <div class="step-header">
          <div class="step-number">✓</div>
          <div class="step-title">Estado de Configuración</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div>
            <strong style="font-size: 13px; color: #6b7280;">Base de Datos</strong>
            <div id="status-db" class="status-badge status-pending" style="margin-top: 8px;">Pendiente</div>
          </div>
          <div>
            <strong style="font-size: 13px; color: #6b7280;">JWT Secret</strong>
            <div id="status-jwt" class="status-badge status-pending" style="margin-top: 8px;">Pendiente</div>
          </div>
          <div>
            <strong style="font-size: 13px; color: #6b7280;">Tablas DB</strong>
            <div id="status-tables" class="status-badge status-pending" style="margin-top: 8px;">Pendiente</div>
          </div>
          <div>
            <strong style="font-size: 13px; color: #6b7280;">Credenciales</strong>
            <div id="status-password" class="status-badge status-pending" style="margin-top: 8px;">Pendiente</div>
          </div>
        </div>

        <div style="margin-top: 24px; padding: 16px; background: #f9fafb; border-radius: 8px;">
          <p style="font-size: 14px; color: #6b7280;">
            Una vez completados todos los pasos, el servidor estará listo para recibir sincronizaciones con las credenciales: <strong>admin</strong> / <strong>[tu contraseña]</strong>
          </p>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentDbUrl = '';

    // Load current configuration on page load
    window.addEventListener('DOMContentLoaded', async () => {
      await loadCurrentConfig();
    });

    async function loadCurrentConfig() {
      try {
        const res = await fetch('/api/setup/status');
        const data = await res.json();

        let hasConfig = false;
        let html = '<div style="font-size: 13px; color: #6b7280; line-height: 1.8;">';

        // Database configuration
        if (data.database) {
          hasConfig = true;
          html += '<div style="margin-bottom: 8px;">';
          html += '<strong style="color: #10b981;">✓ PostgreSQL:</strong> ';
          html += \`\${data.database.username}@\${data.database.host}:\${data.database.port}/\${data.database.database}\`;
          html += '</div>';
          setStatus('status-db', 'success');
        }

        // JWT Secret
        if (data.jwt) {
          hasConfig = true;
          html += '<div style="margin-bottom: 8px;">';
          html += '<strong style="color: #10b981;">✓ JWT Secret:</strong> ';
          html += \`Configurado (\${data.jwt.length} caracteres) - Preview: <code>\${data.jwt.preview}</code>\`;
          html += '</div>';
          setStatus('status-jwt', 'success');
        }

        // Auth credentials
        if (data.auth && data.auth.passwordConfigured) {
          hasConfig = true;
          html += '<div style="margin-bottom: 8px;">';
          html += '<strong style="color: #10b981;">✓ Credenciales:</strong> ';
          html += \`Usuario: <code>\${data.auth.username}</code> / Contraseña configurada\`;
          html += '</div>';
          setStatus('status-password', 'success');
        }

        html += '</div>';

        if (hasConfig) {
          document.getElementById('current-config-content').innerHTML = html;
          document.getElementById('current-config').style.display = 'block';
        }
      } catch (error) {
        console.error('Error loading current config:', error);
        // Silently fail - if there's no config, we just don't show the box
      }
    }

    function showAlert(id, type, message) {
      const alert = document.getElementById(id);
      alert.className = \`alert alert-\${type} show\`;
      alert.innerHTML = message;
    }

    function hideAlert(id) {
      document.getElementById(id).className = 'alert';
    }

    function setStatus(id, status) {
      const el = document.getElementById(id);
      el.className = \`status-badge status-\${status}\`;
      el.textContent = status === 'success' ? 'Completado' : 'Pendiente';
    }

    async function testDatabase() {
      const btn = document.getElementById('test-db-btn');
      const dbUrl = document.getElementById('db-url').value.trim();

      if (!dbUrl) {
        showAlert('db-alert', 'error', 'Por favor ingresa una Database URL');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Probando conexión...';
      hideAlert('db-alert');

      try {
        const res = await fetch('/api/setup/test-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ databaseUrl: dbUrl })
        });

        const data = await res.json();

        if (data.success) {
          showAlert('db-alert', 'success', '✓ Conexión exitosa a PostgreSQL');
          setStatus('status-db', 'success');
          currentDbUrl = dbUrl;
        } else {
          showAlert('db-alert', 'error', \`Error: \${data.error}\`);
          setStatus('status-db', 'pending');
        }
      } catch (error) {
        showAlert('db-alert', 'error', \`Error: \${error.message}\`);
        setStatus('status-db', 'pending');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Probar Conexión';
      }
    }

    function generateSecret() {
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      document.getElementById('jwt-secret').value = secret;
      showAlert('jwt-alert', 'info', 'Secret generado. Recuerda usar este mismo valor en objetiva-sync');
    }

    async function saveJwtSecret() {
      const btn = document.getElementById('save-jwt-btn');
      const secret = document.getElementById('jwt-secret').value.trim();

      if (!secret) {
        showAlert('jwt-alert', 'error', 'Por favor ingresa un JWT Secret');
        return;
      }

      if (secret.length < 32) {
        showAlert('jwt-alert', 'error', 'El secret debe tener al menos 32 caracteres para ser seguro');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Guardando...';
      hideAlert('jwt-alert');

      try {
        const res = await fetch('/api/setup/save-jwt-secret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jwtSecret: secret })
        });

        const data = await res.json();

        if (data.success) {
          showAlert('jwt-alert', 'success', '✓ JWT Secret guardado en .env');
          setStatus('status-jwt', 'success');
        } else {
          showAlert('jwt-alert', 'error', \`Error: \${data.error}\`);
        }
      } catch (error) {
        showAlert('jwt-alert', 'error', \`Error: \${error.message}\`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Secret';
      }
    }

    async function verifyTables() {
      const btn = document.getElementById('verify-btn');

      if (!currentDbUrl) {
        showAlert('verify-alert', 'error', 'Primero debes probar la conexión a la base de datos');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Verificando tablas...';
      hideAlert('verify-alert');

      try {
        const res = await fetch('/api/setup/verify-tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ databaseUrl: currentDbUrl })
        });

        const data = await res.json();

        if (data.success) {
          let message = '✓ Todas las tablas existen:<br>';
          message += '<ul style="margin-top: 8px; margin-left: 20px;">';
          data.tables.forEach(t => {
            message += \`<li>\${t}</li>\`;
          });
          message += '</ul>';
          message += '<div style="margin-top: 12px; padding: 10px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px;">';
          message += '<span style="color: #1565c0; font-size: 12px;">💡 <strong>Nota:</strong> La conexión a PostgreSQL se guardó. ';
          message += 'Recuerda <strong>reiniciar el servidor</strong> al finalizar el setup.</span>';
          message += '</div>';
          showAlert('verify-alert', 'success', message);
          setStatus('status-tables', 'success');
        } else {
          let message = \`❌ Faltan tablas:<br>\`;
          message += '<ul style="margin-top: 8px; margin-left: 20px;">';
          data.missing.forEach(t => {
            message += \`<li><code>\${t}</code></li>\`;
          });
          message += '</ul>';
          message += '<p style="margin-top: 8px;">Por favor crea estas tablas en PostgreSQL antes de continuar.</p>';
          showAlert('verify-alert', 'error', message);
          setStatus('status-tables', 'pending');
        }
      } catch (error) {
        showAlert('verify-alert', 'error', \`Error: \${error.message}\`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verificar Tablas';
      }
    }

    async function setAdminPassword() {
      const btn = document.getElementById('set-password-btn');
      const password = document.getElementById('admin-password').value;

      if (!password) {
        showAlert('password-alert', 'error', 'Por favor ingresa una contraseña');
        return;
      }

      if (password.length < 6) {
        showAlert('password-alert', 'error', 'La contraseña debe tener al menos 6 caracteres');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Configurando...';
      hideAlert('password-alert');

      try {
        const res = await fetch('/api/setup/set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        const data = await res.json();

        if (data.success) {
          showAlert('password-alert', 'success',
            '✓ Credenciales configuradas:<br>' +
            '<strong>Usuario:</strong> admin<br>' +
            '<strong>Password:</strong> [la que acabas de ingresar]<br>' +
            '<div style="margin-top: 16px; padding: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px;">' +
            '<strong style="color: #856404;">⚠️ IMPORTANTE:</strong><br>' +
            '<span style="color: #856404; font-size: 13px;">Debes <strong>reiniciar el servidor</strong> para que los cambios surtan efecto.<br>' +
            'Presiona Ctrl+C y ejecuta <code style="background: #f5f5f5; padding: 2px 6px;">npm run dev</code> nuevamente.</span>' +
            '</div>' +
            '<em style="font-size: 12px; margin-top: 8px; display: block;">Usa estas credenciales en objetiva-sync</em>'
          );
          setStatus('status-password', 'success');
          document.getElementById('admin-password').value = '';
        } else {
          showAlert('password-alert', 'error', \`Error: \${data.error}\`);
        }
      } catch (error) {
        showAlert('password-alert', 'error', \`Error: \${error.message}\`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Configurar Contraseña';
      }
    }
  </script>
</body>
</html>
    `)
  })

  // POST /api/setup/test-db - Probar conexión a PostgreSQL
  app.post('/api/setup/test-db', async (request, reply) => {
    try {
      const { databaseUrl } = TestDbSchema.parse(request.body)

      // Crear cliente temporal de Prisma
      const tempPrisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl
          }
        }
      })

      try {
        // Intentar conectar
        await tempPrisma.$connect()
        await tempPrisma.$queryRaw`SELECT 1`

        logger.info({ databaseUrl: databaseUrl.replace(/:[^:@]+@/, ':***@') }, 'Conexión a DB exitosa')

        return reply.send({ success: true })
      } finally {
        await tempPrisma.$disconnect()
      }
    } catch (error) {
      logger.error({ error }, 'Error al probar conexión a DB')
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al conectar a la base de datos'
      })
    }
  })

  // POST /api/setup/save-jwt-secret - Guardar JWT secret en .env
  app.post('/api/setup/save-jwt-secret', async (request, reply) => {
    try {
      const { jwtSecret } = z.object({ jwtSecret: z.string().min(32) }).parse(request.body)

      await writeEnvVar('JWT_SECRET', jwtSecret)

      logger.info('JWT Secret guardado en .env')

      return reply.send({ success: true })
    } catch (error) {
      logger.error({ error }, 'Error al guardar JWT secret')
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al guardar JWT secret'
      })
    }
  })

  // POST /api/setup/verify-tables - Verificar que las tablas existan
  app.post('/api/setup/verify-tables', async (request, reply) => {
    try {
      const { databaseUrl } = TestDbSchema.parse(request.body)

      // Actualizar DATABASE_URL en .env
      await writeEnvVar('DATABASE_URL', databaseUrl)

      // Crear cliente temporal de Prisma
      const tempPrisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl
          }
        }
      })

      try {
        await tempPrisma.$connect()

        // Verificar que las tablas necesarias existan
        const requiredTables = [
          'articulos',
          'comprobantes_cabecera',
          'comprobantes_detalle',
          'comprobantes_pagos'
        ]

        const result = await tempPrisma.$queryRaw<Array<{ tablename: string }>>`
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename = ANY(ARRAY['articulos', 'comprobantes_cabecera', 'comprobantes_detalle', 'comprobantes_pagos'])
        `

        const existingTables = result.map(r => r.tablename)
        const missingTables = requiredTables.filter(t => !existingTables.includes(t))

        if (missingTables.length > 0) {
          logger.warn({ missingTables }, 'Faltan tablas requeridas')
          return reply.send({
            success: false,
            missing: missingTables
          })
        }

        logger.info({ tables: existingTables }, 'Todas las tablas existen')

        return reply.send({
          success: true,
          tables: existingTables
        })
      } finally {
        await tempPrisma.$disconnect()
      }
    } catch (error) {
      logger.error({ error }, 'Error al verificar tablas')
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al verificar tablas'
      })
    }
  })

  // POST /api/setup/set-password - Configurar password de admin
  app.post('/api/setup/set-password', async (request, reply) => {
    try {
      const { password } = SetPasswordSchema.parse(request.body)

      // Guardar en .env usando env-writer centralizado (serializado y con escape correcto)
      await writeEnvVar('SYNC_USERNAME', 'admin')
      await writeEnvVar('SYNC_PASSWORD', password)

      logger.info('Credenciales de autenticación configuradas')

      return reply.send({ success: true })
    } catch (error) {
      logger.error({ error }, 'Error al configurar password')
      return reply.send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al configurar password'
      })
    }
  })

  // POST /api/setup/save-domain - Guardar URL pública del gateway en .env
  app.post('/api/setup/save-domain', async (request, reply) => {
    try {
      const parsed = SaveDomainSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.issues.map(i => i.message).join(', ')
        })
      }
      const { protocol, domain, port } = parsed.data
      const url = assembleGatewayUrl(protocol, domain, port)
      await writeEnvVar('GATEWAY_PUBLIC_URL', url)
      logger.info({ url }, 'GATEWAY_PUBLIC_URL guardado en .env')
      return reply.send({ success: true, url })
    } catch (error) {
      logger.error({ error }, 'Error al guardar domain')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Error al guardar domain'
      })
    }
  })

  // GET /api/setup/generate-env - Descargar .env actual como archivo
  app.get('/api/setup/generate-env', async (_request, reply) => {
    try {
      const cwd = process.cwd()
      const envPath = path.join(cwd, '.env')
      const examplePath = path.join(cwd, '.env.example')

      // Read .env.example as template
      let exampleContent = ''
      try {
        exampleContent = await fs.readFile(examplePath, 'utf-8')
      } catch {
        // No .env.example — fall back to raw .env
      }

      // Read current .env values
      let envContent = ''
      try {
        envContent = await fs.readFile(envPath, 'utf-8')
      } catch {
        // No .env file yet — return example as-is
      }

      // Build a map of current .env values
      const envMap: Record<string, string> = {}
      for (const line of envContent.split('\n')) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (match) {
          envMap[match[1]] = match[2]
        }
      }

      // Merge: replace KEY= lines in example with current values where they exist
      let merged: string
      if (exampleContent) {
        merged = exampleContent
          .split('\n')
          .map(line => {
            const match = line.match(/^([A-Z0-9_]+)=/)
            if (match && envMap[match[1]] !== undefined) {
              return `${match[1]}=${envMap[match[1]]}`
            }
            return line
          })
          .join('\n')
      } else {
        merged = envContent
      }

      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename=".env"')
        .send(merged)
    } catch (error) {
      logger.error({ error }, 'Error al generar .env para descarga')
      return reply.status(500).send('Error generating .env file')
    }
  })

  // GET /api/setup/status - Obtener estado actual de configuración
  app.get('/api/setup/status', async (_request, reply) => {
    try {
      const DATABASE_URL = process.env.DATABASE_URL || ''
      const JWT_SECRET = process.env.JWT_SECRET || ''
      const SYNC_USERNAME = process.env.SYNC_USERNAME || ''
      const SYNC_PASSWORD = process.env.SYNC_PASSWORD || ''

      // Parsear DATABASE_URL para mostrar info segura
      let dbInfo = null
      if (DATABASE_URL && DATABASE_URL !== 'postgresql://user:password@localhost:5432/objetiva_db') {
        try {
          const url = new URL(DATABASE_URL)
          dbInfo = {
            host: url.hostname,
            port: url.port || '5432',
            database: url.pathname.substring(1),
            username: url.username
          }
        } catch {
          // URL inválida, ignorar
        }
      }

      // Mostrar JWT_SECRET parcialmente
      let jwtInfo = null
      if (JWT_SECRET && JWT_SECRET !== 'change-this-secret-in-production-debe-ser-el-mismo-que-en-objetiva-sync') {
        jwtInfo = {
          length: JWT_SECRET.length,
          preview: JWT_SECRET.substring(0, 8) + '...' + JWT_SECRET.substring(JWT_SECRET.length - 8)
        }
      }

      // Info de credenciales
      let authInfo = null
      if (SYNC_USERNAME && SYNC_USERNAME !== 'admin' || SYNC_PASSWORD && SYNC_PASSWORD !== 'change-me') {
        authInfo = {
          username: SYNC_USERNAME || 'admin',
          passwordConfigured: SYNC_PASSWORD && SYNC_PASSWORD !== 'change-me'
        }
      }

      return reply.send({
        database: dbInfo,
        jwt: jwtInfo,
        auth: authInfo,
        gatewayUrl: process.env.GATEWAY_PUBLIC_URL || null
      })
    } catch (error) {
      logger.error({ error }, 'Error al obtener estado de setup')
      return reply.send({
        database: null,
        jwt: null,
        auth: null,
        gatewayUrl: null
      })
    }
  })
}
