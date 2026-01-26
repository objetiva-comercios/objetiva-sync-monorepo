import { buildApp } from './app.js'
import { logger } from './lib/logger.js'
import { prisma } from './lib/prisma.js'

const PORT = Number(process.env.PORT) || 3335
const HOST = process.env.HOST || '0.0.0.0'

// Estado global del sistema
export const systemState = {
  dbConnected: false,
  dbError: null as string | null,
  startTime: new Date(),
  lastDbCheck: null as Date | null
}

async function start() {
  try {
    // Intentar conectar a PostgreSQL (pero no fallar si no se puede)
    try {
      await prisma.$connect()
      await prisma.$queryRaw`SELECT 1`
      systemState.dbConnected = true
      systemState.dbError = null
      systemState.lastDbCheck = new Date()
      logger.info('✅ Conectado a PostgreSQL')
    } catch (dbError) {
      systemState.dbConnected = false
      systemState.dbError = dbError instanceof Error ? dbError.message : String(dbError)
      systemState.lastDbCheck = new Date()
      logger.warn(
        { error: dbError },
        '⚠️  PostgreSQL no disponible - El servidor iniciará de todos modos. Configura la DB en /setup'
      )
    }

    // Build app (siempre iniciar, incluso sin DB)
    const app = await buildApp()

    // Start server
    await app.listen({ port: PORT, host: HOST })

    logger.info(`🚀 Sync Gateway escuchando en http://${HOST}:${PORT}`)
    logger.info('📝 Endpoints disponibles:')
    logger.info('   GET  /status - Dashboard de monitoreo')
    logger.info('   GET  /setup - Configuración inicial')
    logger.info('   GET  /health - Health check')
    logger.info('')
    logger.info('   Autenticación:')
    logger.info('   POST /auth/login - Login de usuario')
    logger.info('')
    logger.info('   Sincronización (requieren Bearer token):')
    logger.info('   POST /api/articulos/batch - Batch de artículos')
    logger.info('   POST /api/comprobantes/cabecera/batch - Batch de comprobantes cabecera')
    logger.info('   POST /api/comprobantes/detalle/batch - Batch de comprobantes detalle')
    logger.info('   POST /api/comprobantes/pagos/batch - Batch de comprobantes pagos')

    if (!systemState.dbConnected) {
      logger.warn('⚠️  Para configurar PostgreSQL, abre: http://' + HOST + ':' + PORT + '/setup')
    }

  } catch (error) {
    logger.error(error, 'Error crítico al iniciar servidor')
    process.exit(1)
  }
}

start()
