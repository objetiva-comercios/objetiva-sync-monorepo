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
        <h1 className="text-3xl font-bold tracking-tight">Metrics</h1>
        <p className="text-muted-foreground">
          Sync performance and status visualizations
        </p>
      </div>

      <SyncMetricsChart
        endpoint="/api/dashboard/stats"
        refreshInterval={15000}
        title="Sync Activity (30 Days)"
        description="Daily successful and failed synchronizations"
        height={400}
        maxDataPoints={30}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <StatusPieChart
          endpoint="/api/dashboard/stats"
          refreshInterval={15000}
          title="Status Distribution (7 Days)"
          description="Breakdown of sync outcomes"
          height={350}
        />
        {/* Placeholder for future metrics */}
        <div className="border rounded-lg p-6 flex items-center justify-center text-muted-foreground h-[350px]">
          Additional metrics coming soon
        </div>
      </div>
    </div>
  )
}
