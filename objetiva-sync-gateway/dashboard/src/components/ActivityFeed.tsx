import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatTimestamp, getEntityColor } from '@/lib/utils'
import { Activity, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import type { ActivityItem } from '@/types'

interface ActivityFeedProps {
  activities: ActivityItem[]
  className?: string
}

const typeConfig = {
  ingestion: { icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' }
}

export function ActivityFeed({ activities, className }: ActivityFeedProps) {
  return (
    <Card className={cn('border-2 border-primary/20', className)}>
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 animate-pulse-glow text-primary" />
          Actividad en Vivo
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
          {activities.map((item, index) => {
            const config = typeConfig[item.type]
            const Icon = config.icon

            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-2 py-1.5 px-2 rounded border border-border/30 transition-all duration-200',
                  config.bg,
                  'animate-fade-in hover:scale-[1.01]'
                )}
                style={{
                  animationDelay: `${index * 30}ms`
                }}
              >
                <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', config.color)} />

                {item.entity && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                    style={{
                      backgroundColor: `${getEntityColor(item.entity)}20`,
                      color: getEntityColor(item.entity)
                    }}
                  >
                    {item.entity}
                  </span>
                )}

                <p className="text-xs flex-1 truncate">
                  {item.message}
                </p>

                <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                  {formatTimestamp(item.timestamp)}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
