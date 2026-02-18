import { Card } from '@/components/ui/card'
import { cn, formatNumber } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: number
  change?: number
  icon: LucideIcon
  variant?: 'default' | 'success' | 'warning' | 'error'
  className?: string
}

const variantStyles = {
  default: 'glow-cyan border-cyan-500/30',
  success: 'glow-emerald border-emerald-500/30',
  warning: 'glow-amber border-amber-500/30',
  error: 'glow-purple border-purple-500/30'
}

const iconColors = {
  default: 'text-cyan-400',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error: 'text-purple-400'
}

export function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  variant = 'default',
  className
}: MetricCardProps) {
  return (
    <Card className={cn(
      'relative overflow-hidden border-2 transition-all duration-500',
      variantStyles[variant],
      className
    )}>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              'p-1.5 rounded-md bg-card/50 backdrop-blur',
              iconColors[variant]
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
          </div>
          {change !== undefined && (
            <div className={cn(
              'text-xs font-mono px-1.5 py-0.5 rounded',
              change >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
            )}>
              {change >= 0 ? '+' : ''}{change}%
            </div>
          )}
        </div>

        <div className="font-mono text-2xl font-bold tracking-tight number-update mt-1">
          {formatNumber(value)}
        </div>
      </div>

      {/* Background decoration */}
      <div className={cn(
        'absolute -right-4 -top-4 w-16 h-16 rounded-full blur-2xl opacity-20',
        variant === 'default' && 'bg-cyan-500',
        variant === 'success' && 'bg-emerald-500',
        variant === 'warning' && 'bg-amber-500',
        variant === 'error' && 'bg-purple-500'
      )} />
    </Card>
  )
}
