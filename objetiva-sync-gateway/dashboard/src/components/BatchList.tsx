import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatTimestamp, formatDuration, getEntityColor, getEntityLabel } from '@/lib/utils'
import { Package, CheckCircle, XCircle, Loader2, Ban, Clock } from 'lucide-react'
import type { BatchOperation } from '@/types'

interface BatchListProps {
  batches: BatchOperation[]
  className?: string
}

const statusConfig = {
  success: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Completado' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Fallido' },
  partial: { icon: Loader2, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'En progreso' },
  cancelled: { icon: Ban, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'Cancelado' },
  timeout: { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30', label: 'Sin respuesta' }
}

export function BatchList({ batches, className }: BatchListProps) {
  return (
    <Card className={cn('border-2 border-primary/20', className)}>
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="w-4 h-4 text-primary" />
          Operaciones de Sincronización
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-2">
          {batches.map((batch, index) => {
            const config = statusConfig[batch.status]
            const Icon = config.icon
            const entityColor = getEntityColor(batch.entity)
            const progressPercent = batch.totalBatches
              ? Math.round((batch.currentBatch || 0) / batch.totalBatches * 100)
              : (batch.size > 0 ? Math.round(batch.processed / batch.size * 100) : 0)

            return (
              <div
                key={batch.id}
                className={cn(
                  'border rounded-lg p-3 transition-all duration-300',
                  config.bg,
                  config.border,
                  'animate-fade-in'
                )}
                style={{
                  animationDelay: `${index * 30}ms`
                }}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={cn(
                      'w-4 h-4',
                      config.color,
                      batch.status === 'partial' && 'animate-spin'
                    )} />
                    <span
                      className="font-medium px-2 py-0.5 rounded text-xs"
                      style={{
                        backgroundColor: `${entityColor}20`,
                        color: entityColor
                      }}
                    >
                      {getEntityLabel(batch.entity)}
                    </span>
                    {batch.queryName && (
                      <span className="text-xs text-muted-foreground">
                        {batch.queryName}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {formatTimestamp(batch.timestamp)}
                  </span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-5 gap-2 text-xs mb-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Recibidos</p>
                    <p className="font-mono font-semibold">{batch.size.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Procesados</p>
                    <p className="font-mono font-semibold text-emerald-400">{batch.processed.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Fallidos</p>
                    <p className="font-mono font-semibold text-red-400">{batch.failed}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Duración</p>
                    <p className="font-mono font-semibold">{formatDuration(batch.duration)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Estimado</p>
                    <p className="font-mono font-semibold text-blue-400">
                      {batch.status === 'partial' && batch.estimatedRemainingMs
                        ? formatDuration(batch.estimatedRemainingMs)
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Progress bar with batch info */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">
                      {batch.totalBatches
                        ? `Lote ${batch.currentBatch || 0} de ${batch.totalBatches}`
                        : 'Progreso'}
                      {(batch.status === 'cancelled' || batch.status === 'timeout') && (
                        <span className={cn('ml-2 font-medium', config.color)}>
                          — {config.label}
                        </span>
                      )}
                    </span>
                    <span className={cn('font-mono font-medium', config.color)}>
                      {progressPercent}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        batch.status === 'partial' && 'animate-pulse'
                      )}
                      style={{
                        width: `${progressPercent}%`,
                        backgroundColor: batch.status === 'cancelled' || batch.status === 'timeout'
                          ? 'hsl(var(--muted-foreground))'
                          : entityColor
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}

          {batches.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No hay operaciones recientes
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
