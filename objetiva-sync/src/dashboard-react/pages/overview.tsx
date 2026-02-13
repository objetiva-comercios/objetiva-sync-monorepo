import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SyncMetricsChart,
  StatusPieChart,
} from '@objetiva/dashboard'

/**
 * Overview Page - Dashboard landing page
 *
 * Shows quick stats, sync activity chart, and status distribution pie chart.
 */
export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Synchronization overview and recent activity
        </p>
      </div>

      {/* Quick stats row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Syncs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Currently running
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled Queries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Auto-sync enabled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retry Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Pending retries
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        <SyncMetricsChart
          endpoint="/api/dashboard/stats"
          refreshInterval={30000}
        />
        <StatusPieChart
          endpoint="/api/dashboard/stats"
          refreshInterval={30000}
        />
      </div>
    </div>
  )
}
