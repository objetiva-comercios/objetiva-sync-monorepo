import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDuration } from '@/lib/utils'
import { Server, Cpu, MemoryStick, Users, Circle } from 'lucide-react'
import type { SystemHealth as SystemHealthType } from '@/types'

interface SystemHealthProps {
  health: SystemHealthType
  className?: string
}

const statusConfig = {
  healthy: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', dot: 'bg-emerald-500' },
  degraded: { color: 'text-amber-400', bg: 'bg-amber-500/20', dot: 'bg-amber-500' },
  down: { color: 'text-red-400', bg: 'bg-red-500/20', dot: 'bg-red-500' }
}

export function SystemHealth({ health, className }: SystemHealthProps) {
  const config = statusConfig[health.status]

  return (
    <Card className={cn('border-2 border-primary/20 relative overflow-hidden', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            Estado del Sistema
          </span>
          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full', config.bg)}>
            <Circle className={cn('w-2 h-2 fill-current animate-pulse-glow', config.dot)} />
            <span className={cn('text-sm font-semibold uppercase tracking-wide', config.color)}>
              {health.status === 'healthy' ? 'Saludable' : health.status === 'degraded' ? 'Degradado' : 'Caído'}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Uptime */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Server className="w-4 h-4" />
              <span className="text-sm uppercase tracking-wide">Tiempo Activo</span>
            </div>
            <p className="font-mono text-2xl font-bold">
              {formatDuration(health.uptime)}
            </p>
          </div>

          {/* Active Connections */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-sm uppercase tracking-wide">Conexiones</span>
            </div>
            <p className="font-mono text-2xl font-bold text-cyan-400">
              {health.activeConnections}
            </p>
          </div>

          {/* CPU Usage */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cpu className="w-4 h-4" />
              <span className="text-sm uppercase tracking-wide">CPU</span>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-xl font-bold">{health.cpuUsage}%</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    health.cpuUsage < 50 ? 'bg-emerald-500' :
                      health.cpuUsage < 80 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${health.cpuUsage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Memory Usage */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MemoryStick className="w-4 h-4" />
              <span className="text-sm uppercase tracking-wide">Memoria</span>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-xl font-bold">{health.memoryUsage}%</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    health.memoryUsage < 50 ? 'bg-emerald-500' :
                      health.memoryUsage < 80 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${health.memoryUsage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Background pulse effect */}
      <div className={cn(
        'absolute -bottom-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 animate-pulse-glow',
        health.status === 'healthy' && 'bg-emerald-500',
        health.status === 'degraded' && 'bg-amber-500',
        health.status === 'down' && 'bg-red-500'
      )} />
    </Card>
  )
}
