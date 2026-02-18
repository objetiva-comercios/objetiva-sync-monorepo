import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, getEntityColor, getEntityLabel, formatNumber, formatDuration } from '@/lib/utils'
import { Activity } from 'lucide-react'
import type { EntityStats } from '@/types'

interface EntityCardProps {
  stats: EntityStats
  className?: string
}

export function EntityCard({ stats, className }: EntityCardProps) {
  const color = getEntityColor(stats.entity)
  const label = getEntityLabel(stats.entity)
  const successRate = stats.received > 0 ? ((stats.processed / stats.received) * 100).toFixed(1) : '0'

  return (
    <Card className={cn('border-2 relative overflow-hidden transition-all duration-300 hover:scale-105', className)}
      style={{ borderColor: `${color}30` }}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="font-semibold" style={{ color }}>{label}</span>
          <Activity className="w-5 h-5 animate-pulse-glow" style={{ color }} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Recibidos</p>
            <p className="font-mono text-2xl font-bold">{formatNumber(stats.received)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Procesados</p>
            <p className="font-mono text-2xl font-bold text-emerald-400">{formatNumber(stats.processed)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Fallidos</p>
            <p className="font-mono text-2xl font-bold text-red-400">{formatNumber(stats.failed)}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Tasa de éxito</span>
            <span className="font-mono font-semibold" style={{ color }}>{successRate}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${successRate}%`,
                backgroundColor: color,
                boxShadow: `0 0 10px ${color}50`
              }}
            />
          </div>
        </div>

        {/* Last Batch Info */}
        {stats.lastBatch && (
          <div className="pt-3 border-t border-border space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Último Lote</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono">{stats.lastBatch.size} registros</span>
              <span className="text-sm font-mono text-muted-foreground">{formatDuration(stats.lastBatch.duration)}</span>
            </div>
          </div>
        )}
      </CardContent>

      {/* Background glow */}
      <div
        className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-10"
        style={{ backgroundColor: color }}
      />
    </Card>
  )
}
