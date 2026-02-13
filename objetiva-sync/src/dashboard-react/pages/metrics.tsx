import { SyncMetricsChart, StatusPieChart } from '@objetiva/dashboard'

/**
 * Metrics Page - Detailed sync performance visualizations
 *
 * Shows larger chart displays for in-depth monitoring.
 */
export default function MetricsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Métricas</h1>
        <p className="text-muted-foreground">
          Visualización del rendimiento y estado de sincronización
        </p>
      </div>

      <SyncMetricsChart
        endpoint="/api/dashboard/stats"
        refreshInterval={15000}
        title="Actividad de Sincronización (30 Días)"
        description="Sincronizaciones exitosas y fallidas diarias"
        height={400}
        maxDataPoints={30}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <StatusPieChart
          endpoint="/api/dashboard/stats"
          refreshInterval={15000}
          title="Distribución de Estado (7 Días)"
          description="Desglose de resultados de sincronización"
          height={350}
        />
        {/* Marcador para métricas futuras */}
        <div className="border rounded-lg p-6 flex items-center justify-center text-muted-foreground h-[350px]">
          Métricas adicionales próximamente
        </div>
      </div>
    </div>
  )
}
