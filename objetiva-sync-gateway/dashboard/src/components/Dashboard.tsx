import { useGatewayData } from '@/hooks/useGatewayData'
import { MetricCard } from '@/components/MetricCard'
import { EntityCard } from '@/components/EntityCard'
import { ActivityFeed } from '@/components/ActivityFeed'
import { BatchList } from '@/components/BatchList'
import { SystemHealthMini } from '@/components/SystemHealthMini'
import { Database, TrendingUp, AlertCircle, Zap, RefreshCw, Trash2 } from 'lucide-react'

export function Dashboard() {
  const { stats, entities, batches, health, activity, isLoading, error, refresh, resetMetrics } = useGatewayData()

  if (isLoading && !stats) {
    return (
      <div className="min-h-screen gradient-bg grid-pattern flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="w-16 h-16 text-primary animate-spin mx-auto" />
          <p className="text-xl font-semibold text-muted-foreground">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen gradient-bg grid-pattern flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
          <h2 className="text-2xl font-bold">Error al cargar datos</h2>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-bg grid-pattern">
      <div className="max-w-[1600px] mx-auto p-4 space-y-4">
        {/* Header with System Health */}
        <header className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-cyan-300 bg-clip-text text-transparent">
              Gateway Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitoreo en tiempo real
            </p>
          </div>
          <div className="flex items-center gap-4">
            {health && <SystemHealthMini health={health} />}
            <button
              onClick={resetMetrics}
              className="px-3 py-1.5 bg-card border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-2 text-sm text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar
            </button>
          </div>
        </header>

        {/* Key Metrics */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
            <MetricCard
              title="Total Recibido"
              value={stats.total}
              icon={Database}
              variant="default"
            />
            <MetricCard
              title="Procesados"
              value={stats.processed}
              icon={TrendingUp}
              variant="success"
            />
            <MetricCard
              title="Fallidos"
              value={stats.failed}
              icon={AlertCircle}
              variant="error"
            />
            <MetricCard
              title="Tasa (reg/s)"
              value={stats.ratePerSecond}
              icon={Zap}
              variant="warning"
            />
          </div>
        )}

        {/* Entity Stats */}
        {entities.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
            <h2 className="text-lg font-semibold mb-2">Estadísticas por Entidad</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {entities.map((entity) => (
                <EntityCard key={entity.entity} stats={entity} />
              ))}
            </div>
          </div>
        )}

        {/* Activity Feed and Batch List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <BatchList batches={batches} />
          <ActivityFeed activities={activity} />
        </div>
      </div>
    </div>
  )
}
