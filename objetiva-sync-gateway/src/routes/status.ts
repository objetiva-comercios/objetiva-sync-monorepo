import type { FastifyInstance } from 'fastify'
import { systemState } from '../server.js'
import { metrics } from '../lib/metrics.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import fs from 'fs/promises'
import path from 'path'

export async function registerStatusRoutes(app: FastifyInstance) {
  /**
   * GET /api/status/recent - Endpoint JSON para obtener sincronizaciones recientes
   */
  app.get('/api/status/recent', async (_request, reply) => {
    const recent = metrics.getRecentEvents(15)
    return reply.send({
      success: true,
      syncs: recent.syncs,
      timestamp: Date.now()
    })
  })

  /**
   * GET /status - Dashboard de monitoreo del sistema
   */
  app.get('/status', async (_request, reply) => {
    // Obtener estadísticas
    const stats = metrics.getStats()
    const recent = metrics.getRecentEvents(15)

    // Intentar obtener info de DB si está conectada
    let dbInfo = null
    let articulosCount = 0
    let comprobantesCount = 0
    let detallesCount = 0
    let pagosCount = 0

    if (systemState.dbConnected) {
      try {
        const [articulos, comprobantes, detalles, pagos] = await Promise.all([
          prisma.articulo.count().catch(() => 0),
          prisma.comprobanteCabecera.count().catch(() => 0),
          prisma.comprobanteDetalle.count().catch(() => 0),
          prisma.comprobantePagos.count().catch(() => 0)
        ])

        articulosCount = articulos
        comprobantesCount = comprobantes
        detallesCount = detalles
        pagosCount = pagos

        dbInfo = {
          articulos,
          comprobantes,
          detalles,
          pagos
        }
      } catch (error) {
        logger.error({ error }, 'Error al obtener info de DB')
      }
    }

    // Verificar JWT Secret
    const jwtConfigured = !!process.env.JWT_SECRET && process.env.JWT_SECRET !== 'change-me-in-production'

    // Uptime
    const uptime = Date.now() - systemState.startTime.getTime()
    const uptimeSeconds = Math.floor(uptime / 1000)
    const uptimeMinutes = Math.floor(uptimeSeconds / 60)
    const uptimeHours = Math.floor(uptimeMinutes / 60)
    const uptimeDays = Math.floor(uptimeHours / 24)

    let uptimeStr = ''
    if (uptimeDays > 0) uptimeStr += `${uptimeDays}d `
    if (uptimeHours % 24 > 0) uptimeStr += `${uptimeHours % 24}h `
    if (uptimeMinutes % 60 > 0) uptimeStr += `${uptimeMinutes % 60}m `
    uptimeStr += `${uptimeSeconds % 60}s`

    // Verificar .env
    let envExists = false
    try {
      await fs.access(path.join(process.cwd(), '.env'))
      envExists = true
    } catch {
      envExists = false
    }

    return reply.type('text/html').send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- <meta http-equiv="refresh" content="30"> -->
  <title>Status - ${process.env.APP_NAME || 'Objetiva Sync Gateway'}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    }

    .header h1 {
      font-size: 28px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header p {
      opacity: 0.9;
      font-size: 14px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }

    .card {
      background: #1e293b;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.2);
      border: 1px solid #334155;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .card-value {
      font-size: 36px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }

    .card-label {
      font-size: 13px;
      color: #64748b;
    }

    .status-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 8px;
      animation: pulse 2s infinite;
    }

    .status-dot.online {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }

    .status-dot.offline {
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }

    .status-dot.warning {
      background: #f59e0b;
      box-shadow: 0 0 8px #f59e0b;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .stat-group {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 16px;
    }

    .stat-item {
      background: #0f172a;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #334155;
    }

    .stat-item-value {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }

    .stat-item-label {
      font-size: 12px;
      color: #64748b;
    }

    .table-container {
      overflow-x: auto;
      background: #1e293b;
      border-radius: 12px;
      border: 1px solid #334155;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      background: #0f172a;
      padding: 12px 16px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #334155;
    }

    td {
      padding: 12px 16px;
      font-size: 13px;
      border-bottom: 1px solid #334155;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover {
      background: #0f172a;
    }

    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-success {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
    }

    .badge-error {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .badge-info {
      background: rgba(59, 130, 246, 0.2);
      color: #3b82f6;
    }

    .badge-warning {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: #64748b;
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
      border: none;
      cursor: pointer;
    }

    .btn:hover {
      background: #5568d3;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: #334155;
    }

    .btn-secondary:hover {
      background: #475569;
    }

    .alert {
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid;
    }

    .alert-warning {
      background: rgba(245, 158, 11, 0.1);
      border-color: #f59e0b;
      color: #fbbf24;
    }

    .alert-error {
      background: rgba(239, 68, 68, 0.1);
      border-color: #ef4444;
      color: #f87171;
    }

    .alert-info {
      background: rgba(59, 130, 246, 0.1);
      border-color: #3b82f6;
      color: #60a5fa;
    }

    .section {
      margin-bottom: 24px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #f1f5f9;
    }

    code {
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #10b981;
    }

    .timestamp {
      color: #64748b;
      font-size: 12px;
    }

    .update-indicator {
      display: inline-block;
      font-size: 10px;
      color: #64748b;
      margin-left: 8px;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .update-indicator.active {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        <span class="status-dot ${systemState.dbConnected ? 'online' : 'offline'}"></span>
        ${process.env.APP_NAME || 'Objetiva Sync Gateway'}
      </h1>
      <p>Dashboard de Monitoreo en Tiempo Real • Actualización automática cada 2s</p>
    </div>

    ${!systemState.dbConnected ? `
      <div class="alert alert-error">
        <strong>⚠️ PostgreSQL no conectado</strong><br>
        ${systemState.dbError ? `Error: <code>${escapeHtml(systemState.dbError)}</code><br>` : ''}
        <a href="/setup" class="btn" style="margin-top: 12px;">Configurar en /setup →</a>
      </div>
    ` : ''}

    ${!jwtConfigured ? `
      <div class="alert alert-warning">
        <strong>⚠️ JWT Secret no configurado</strong><br>
        El secret por defecto no es seguro para producción.
        <a href="/setup" class="btn btn-secondary" style="margin-top: 12px;">Configurar en /setup →</a>
      </div>
    ` : ''}

    <!-- Estadísticas Principales -->
    <div class="grid">
      <div class="card">
        <div class="card-title">Estado del Sistema</div>
        <div style="margin-bottom: 12px;">
          <span class="status-dot ${systemState.dbConnected ? 'online' : 'offline'}"></span>
          <strong>${systemState.dbConnected ? 'Operacional' : 'Sin Base de Datos'}</strong>
        </div>
        <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
          Uptime: <strong style="color: #10b981;">${uptimeStr}</strong>
        </div>
        <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
          JWT: ${jwtConfigured ? '<span class="badge badge-success">✓ Configurado</span>' : '<span class="badge badge-warning">⚠ Por defecto</span>'}
        </div>
        <div style="font-size: 13px; color: #64748b;">
          .env: ${envExists ? '<span class="badge badge-success">✓ Existe</span>' : '<span class="badge badge-error">✗ No encontrado</span>'}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Sincronizaciones (24h)</div>
        <div class="card-value">${stats.syncEvents.total24h}</div>
        <div class="card-label">
          ${stats.syncEvents.lastHour} en la última hora
        </div>
        <div style="margin-top: 12px; font-size: 12px; color: #64748b;">
          📦 ${stats.syncEvents.byType.articulo} artículos<br>
          📄 ${stats.syncEvents.byType.comprobante} comprobantes<br>
          💳 ${stats.syncEvents.byType.pago} pagos
        </div>
      </div>

      <div class="card">
        <div class="card-title">Registros Procesados (24h)</div>
        <div class="card-value">${stats.records.received24h.toLocaleString()}</div>
        <div class="card-label">Total recibidos</div>
        <div class="stat-group" style="margin-top: 16px;">
          <div style="font-size: 12px;">
            <div style="font-size: 18px; font-weight: 700; color: #10b981;">${stats.records.inserted24h}</div>
            <div style="color: #64748b;">Insertados</div>
          </div>
          <div style="font-size: 12px;">
            <div style="font-size: 18px; font-weight: 700; color: #3b82f6;">${stats.records.updated24h}</div>
            <div style="color: #64748b;">Actualizados</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Base de Datos</div>
        ${dbInfo ? `
          <div class="stat-group">
            <div class="stat-item">
              <div class="stat-item-value">${articulosCount.toLocaleString()}</div>
              <div class="stat-item-label">Artículos</div>
            </div>
            <div class="stat-item">
              <div class="stat-item-value">${comprobantesCount.toLocaleString()}</div>
              <div class="stat-item-label">Comprobantes</div>
            </div>
            <div class="stat-item">
              <div class="stat-item-value">${detallesCount.toLocaleString()}</div>
              <div class="stat-item-label">Detalles</div>
            </div>
            <div class="stat-item">
              <div class="stat-item-value">${pagosCount.toLocaleString()}</div>
              <div class="stat-item-label">Pagos</div>
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-state-icon">💾</div>
            <div>Base de datos no disponible</div>
          </div>
        `}
      </div>
    </div>

    <!-- Sincronizaciones -->

    <div class="section">
      <div class="section-title">
        Sincronizaciones
        <span id="update-indicator" class="update-indicator">Actualizando...</span>
      </div>
      <div class="table-container">
        ${recent.syncs.length > 0 ? `
          <table id="recent-syncs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Tipo</th>
                <th>Comercio</th>
                <th>Recibidos</th>
                <th>Insertados</th>
                <th>Actualizados</th>
                <th>Fallidos</th>
                <th>Duración</th>
              </tr>
            </thead>
            <tbody id="recent-syncs-tbody">
              ${recent.syncs.map(s => `
                <tr>
                  <td class="timestamp">${new Date(s.timestamp).toLocaleTimeString('es-AR')}</td>
                  <td>
                    ${s.type === 'articulo' ? '📦 Artículos' :
                      s.type === 'comprobante' ? '📄 Comprobantes' : '💳 Pagos'}
                  </td>
                  <td>${escapeHtml(s.comercio)}</td>
                  <td>${s.received}</td>
                  <td><span class="badge badge-success">${s.inserted}</span></td>
                  <td><span class="badge badge-info">${s.updated}</span></td>
                  <td>${s.failed > 0 ? `<span class="badge badge-error">${s.failed}</span>` : '-'}</td>
                  <td>${s.duration}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <div class="empty-state" id="empty-syncs-state">
            <div class="empty-state-icon">📊</div>
            <div>No hay sincronizaciones registradas aún</div>
            <p style="margin-top: 8px; font-size: 13px;">Las sincronizaciones aparecerán aquí cuando objetiva-sync se conecte</p>
          </div>
        `}
      </div>
    </div>

    <!-- Acciones -->
    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
      <a href="/setup" class="btn">⚙️ Configuración</a>
      <a href="/health" class="btn btn-secondary">🏥 Health Check</a>
      <button onclick="location.reload()" class="btn btn-secondary">🔄 Actualizar</button>
    </div>

    <div style="margin-top: 24px; padding: 16px; background: #1e293b; border-radius: 8px; font-size: 12px; color: #64748b; text-align: center;">
      ${process.env.APP_NAME || 'Objetiva Sync Gateway'} v1.0.0 • Esta página se actualiza automáticamente cada 2 segundos
    </div>
  </div>

  <script>
    // Auto-update de sincronizaciones recientes
    let lastScrollY = 0;
    let isUpdating = false;

    function escapeHtml(unsafe) {
      const div = document.createElement('div');
      div.textContent = unsafe;
      return div.innerHTML;
    }

    function formatDuration(durationStr) {
      return durationStr;
    }

    function getEntityIcon(type) {
      switch(type) {
        case 'articulo': return '📦 Artículos';
        case 'comprobante': return '📄 Comprobantes';
        case 'pago': return '💳 Pagos';
        default: return type;
      }
    }

    async function updateRecentSyncs() {
      if (isUpdating) return;

      try {
        isUpdating = true;
        const indicator = document.getElementById('update-indicator');
        if (indicator) {
          indicator.classList.add('active');
        }

        // Guardar posición de scroll
        lastScrollY = window.scrollY;

        const response = await fetch('/api/status/recent', {
          cache: 'no-cache'
        });

        if (!response.ok) {
          throw new Error('Error al obtener datos');
        }

        const data = await response.json();

        if (data.success && data.syncs) {
          const tbody = document.getElementById('recent-syncs-tbody');
          const table = document.getElementById('recent-syncs-table');
          const emptyState = document.getElementById('empty-syncs-state');

          if (data.syncs.length > 0) {
            // Mostrar tabla y ocultar empty state si existe
            if (emptyState) {
              emptyState.style.display = 'none';
            }
            if (table) {
              table.style.display = 'table';
            }

            // Actualizar tabla
            if (tbody) {
              const html = data.syncs.map(s => {
                const timestamp = new Date(s.timestamp).toLocaleTimeString('es-AR');
                const type = getEntityIcon(s.type);
                const comercio = escapeHtml(s.comercio);
                const failedBadge = s.failed > 0
                  ? \`<span class="badge badge-error">\${s.failed}</span>\`
                  : '-';

                return \`
                  <tr>
                    <td class="timestamp">\${timestamp}</td>
                    <td>\${type}</td>
                    <td>\${comercio}</td>
                    <td>\${s.received}</td>
                    <td><span class="badge badge-success">\${s.inserted}</span></td>
                    <td><span class="badge badge-info">\${s.updated}</span></td>
                    <td>\${failedBadge}</td>
                    <td>\${s.duration}</td>
                  </tr>
                \`;
              }).join('');

              tbody.innerHTML = html;
            }
          } else {
            // Mostrar empty state si no hay datos
            if (table) {
              table.style.display = 'none';
            }
            if (emptyState) {
              emptyState.style.display = 'block';
            }
          }

          // Restaurar posición de scroll
          window.scrollTo(0, lastScrollY);
        }

        // Ocultar indicador después de un breve delay
        setTimeout(() => {
          if (indicator) {
            indicator.classList.remove('active');
          }
        }, 300);

      } catch (error) {
        console.error('Error al actualizar sincronizaciones:', error);
        // Silenciosamente fallar y reintentar en el siguiente ciclo
      } finally {
        isUpdating = false;
      }
    }

    // Iniciar actualización automática cada 2 segundos
    setInterval(updateRecentSyncs, 2000);
  </script>
</body>
</html>
    `)
  })
}

function escapeHtml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
