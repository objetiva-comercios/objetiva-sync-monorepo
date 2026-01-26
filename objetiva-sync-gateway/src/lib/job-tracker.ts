/**
 * Job Tracker - Rastrea trabajos de sincronización y acumula batches
 * Un "job" es una sincronización completa que puede estar compuesta por múltiples batches
 */

interface BatchResult {
  totalReceived: number
  inserted: number
  updated: number
  failed: number
  durationMs: number
}

interface SyncJob {
  syncId: string
  queryId: number
  queryName: string
  entityType: 'articulo' | 'comprobante' | 'pago' | 'comprobante_cabecera' | 'comprobante_detalle' | 'comprobante_pago'
  comercioId: string
  comercioUsername?: string
  startedAt: Date

  // Batch tracking
  totalBatches: number
  receivedBatches: number

  // Accumulated results
  totalReceived: number
  inserted: number
  updated: number
  failed: number

  // Timing
  firstBatchAt: Date
  lastBatchAt: Date
  totalDurationMs: number
}

class JobTracker {
  private jobs: Map<string, SyncJob> = new Map()
  private jobTimeouts: Map<string, NodeJS.Timeout> = new Map()

  // Si un job no recibe batches por 5 minutos, se considera completo
  private readonly JOB_TIMEOUT_MS = 5 * 60 * 1000

  /**
   * Registrar un batch de un job
   * @returns true si es el último batch del job
   */
  trackBatch(params: {
    syncId: string
    queryId: number
    queryName: string
    entityType: SyncJob['entityType']
    comercioId: string
    comercioUsername?: string
    batchNumber: number
    totalBatches: number
    result: BatchResult
  }): { job: SyncJob; isLastBatch: boolean } {
    const { syncId, queryId, queryName, entityType, comercioId, comercioUsername, totalBatches, result } = params

    // Obtener o crear job
    let job = this.jobs.get(syncId)

    if (!job) {
      job = {
        syncId,
        queryId,
        queryName,
        entityType,
        comercioId,
        comercioUsername,
        startedAt: new Date(),
        totalBatches,
        receivedBatches: 0,
        totalReceived: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        firstBatchAt: new Date(),
        lastBatchAt: new Date(),
        totalDurationMs: 0,
      }

      this.jobs.set(syncId, job)
    }

    // Acumular resultados
    job.receivedBatches++
    job.totalReceived += result.totalReceived
    job.inserted += result.inserted
    job.updated += result.updated
    job.failed += result.failed
    job.lastBatchAt = new Date()
    job.totalDurationMs += result.durationMs

    // Limpiar timeout anterior
    const existingTimeout = this.jobTimeouts.get(syncId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const isLastBatch = job.receivedBatches >= job.totalBatches

    if (isLastBatch) {
      // Job completo, programar limpieza después de 30 segundos
      const cleanupTimeout = setTimeout(() => {
        this.jobs.delete(syncId)
        this.jobTimeouts.delete(syncId)
      }, 30000)

      this.jobTimeouts.set(syncId, cleanupTimeout)
    } else {
      // Programar timeout de inactividad
      const inactivityTimeout = setTimeout(() => {
        this.finalizeJob(syncId)
      }, this.JOB_TIMEOUT_MS)

      this.jobTimeouts.set(syncId, inactivityTimeout)
    }

    return { job, isLastBatch }
  }

  /**
   * Finalizar job manualmente (por timeout o error)
   */
  private finalizeJob(syncId: string): void {
    const job = this.jobs.get(syncId)
    if (!job) return

    console.log(`[JobTracker] Finalizando job ${syncId} (${job.receivedBatches}/${job.totalBatches} batches recibidos)`)

    // Limpiar timeout
    const timeout = this.jobTimeouts.get(syncId)
    if (timeout) {
      clearTimeout(timeout)
    }

    // Programar limpieza
    const cleanupTimeout = setTimeout(() => {
      this.jobs.delete(syncId)
      this.jobTimeouts.delete(syncId)
    }, 30000)

    this.jobTimeouts.set(syncId, cleanupTimeout)
  }

  /**
   * Obtener job actual
   */
  getJob(syncId: string): SyncJob | undefined {
    return this.jobs.get(syncId)
  }

  /**
   * Obtener todos los jobs activos
   */
  getActiveJobs(): SyncJob[] {
    return Array.from(this.jobs.values())
  }
}

// Singleton
export const jobTracker = new JobTracker()
