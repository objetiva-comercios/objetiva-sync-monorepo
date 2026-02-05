/**
 * PM2 Ecosystem Configuration for Objetiva Sync Gateway
 *
 * Process manager configuration for production deployment.
 * Uses fork mode (not cluster) because the gateway has:
 * - Server-Sent Events (SSE) for sync progress streaming
 * - Stateful connections that would break in cluster mode
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production
 *   pm2 stop sync-gateway
 *   pm2 logs sync-gateway
 */

export default {
  apps: [
    {
      name: 'sync-gateway',
      script: './dist/server.js',

      // Fork mode (NOT cluster) - required for SSE and stateful connections
      instances: 1,
      exec_mode: 'fork',

      // Environment variables
      env_production: {
        NODE_ENV: 'production'
      },

      // Process management
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 10,

      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Time before forcing kill (in ms)
      kill_timeout: 5000,

      // Wait time before restart (in ms)
      restart_delay: 4000
    }
  ]
}
