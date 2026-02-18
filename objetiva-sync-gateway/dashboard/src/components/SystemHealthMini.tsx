import { cn, formatDuration } from '@/lib/utils'
import { Circle, Cpu, MemoryStick } from 'lucide-react'
import type { SystemHealth as SystemHealthType } from '@/types'

interface SystemHealthMiniProps {
  health: SystemHealthType
  className?: string
}

const statusConfig = {
  healthy: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', dot: 'bg-emerald-500', label: 'OK' },
  degraded: { color: 'text-amber-400', bg: 'bg-amber-500/20', dot: 'bg-amber-500', label: 'Degradado' },
  down: { color: 'text-red-400', bg: 'bg-red-500/20', dot: 'bg-red-500', label: 'Caído' }
}

export function SystemHealthMini({ health, className }: SystemHealthMiniProps) {
  const config = statusConfig[health.status]

  return (
    <div className={cn('flex items-center gap-3 text-sm', className)}>
      {/* Status indicator */}
      <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md', config.bg)}>
        <Circle className={cn('w-2 h-2 fill-current animate-pulse', config.dot)} />
        <span className={cn('font-medium', config.color)}>{config.label}</span>
      </div>

      {/* Uptime */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <span className="text-xs">Up:</span>
        <span className="font-mono text-xs">{formatDuration(health.uptime)}</span>
      </div>

      {/* CPU */}
      <div className="flex items-center gap-1">
        <Cpu className={cn(
          'w-3.5 h-3.5',
          health.cpuUsage < 50 ? 'text-emerald-400' :
            health.cpuUsage < 80 ? 'text-amber-400' : 'text-red-400'
        )} />
        <span className="font-mono text-xs">{health.cpuUsage}%</span>
      </div>

      {/* Memory */}
      <div className="flex items-center gap-1">
        <MemoryStick className={cn(
          'w-3.5 h-3.5',
          health.memoryUsage < 50 ? 'text-emerald-400' :
            health.memoryUsage < 80 ? 'text-amber-400' : 'text-red-400'
        )} />
        <span className="font-mono text-xs">{health.memoryUsage}%</span>
      </div>
    </div>
  )
}
