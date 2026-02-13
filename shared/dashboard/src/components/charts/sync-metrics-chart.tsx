import { useEffect, useState, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useInterval } from '@/hooks/use-interval'

/**
 * Data point for time-series metrics
 */
export interface MetricDataPoint {
  timestamp: string
  success: number
  failed: number
  total: number
}

/**
 * Props for SyncMetricsChart component
 */
export interface SyncMetricsChartProps {
  /**
   * API endpoint to fetch metrics from
   * @default '/api/stats'
   */
  endpoint?: string

  /**
   * Auto-refresh interval in milliseconds
   * Pass null to disable auto-refresh
   * @default 5000
   */
  refreshInterval?: number | null

  /**
   * Chart title
   * @default 'Sync Metrics Over Time'
   */
  title?: string

  /**
   * Chart description
   */
  description?: string

  /**
   * Maximum number of data points to display
   * @default 20
   */
  maxDataPoints?: number

  /**
   * Chart height in pixels
   * @default 300
   */
  height?: number

  /**
   * Custom class name for the card wrapper
   */
  className?: string

  /**
   * Custom data transformer function
   * Use this to transform API response to MetricDataPoint[]
   */
  transformData?: (response: unknown) => MetricDataPoint | null
}

/**
 * Default transformer for /api/stats endpoint
 * Converts the stats response to a metric data point
 */
function defaultTransformData(response: unknown): MetricDataPoint | null {
  if (!response || typeof response !== 'object') return null

  const data = response as {
    stats?: {
      processed?: number
      failed?: number
      total?: number
    }
  }

  if (!data.stats) return null

  return {
    timestamp: new Date().toISOString(),
    success: data.stats.processed ?? 0,
    failed: data.stats.failed ?? 0,
    total: data.stats.total ?? 0,
  }
}

/**
 * Format timestamp for X-axis display
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * SyncMetricsChart - Time-series line chart for sync metrics
 *
 * Displays success/failed records over time with auto-refresh capability.
 * Uses Recharts for rendering and shadcn Card for consistent styling.
 *
 * @example
 * ```tsx
 * // Basic usage with defaults
 * <SyncMetricsChart />
 *
 * // Custom endpoint and refresh interval
 * <SyncMetricsChart
 *   endpoint="/api/custom-metrics"
 *   refreshInterval={10000}
 *   title="Custom Metrics"
 * />
 *
 * // Disabled auto-refresh
 * <SyncMetricsChart refreshInterval={null} />
 * ```
 */
export function SyncMetricsChart({
  endpoint = '/api/stats',
  refreshInterval = 5000,
  title = 'Sync Metrics Over Time',
  description,
  maxDataPoints = 20,
  height = 300,
  className,
  transformData = defaultTransformData,
}: SyncMetricsChartProps) {
  const [data, setData] = useState<MetricDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const json = await response.json()
      const point = transformData(json)

      if (point) {
        setData((prev) => {
          const newData = [...prev, point]
          // Keep only the last N data points
          return newData.slice(-maxDataPoints)
        })
      }

      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics')
    } finally {
      setLoading(false)
    }
  }, [endpoint, maxDataPoints, transformData])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh
  useInterval(fetchData, refreshInterval)

  // Loading skeleton
  if (loading && data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full" style={{ height }} />
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error && data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center text-muted-foreground"
            style={{ height }}
          >
            <span className="text-destructive">Error: {error}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {error && (
          <span className="text-sm text-destructive">
            Refresh error: {error}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              className="text-muted-foreground text-xs"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              className="text-muted-foreground text-xs"
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
              labelStyle={{ color: 'hsl(var(--card-foreground))' }}
              labelFormatter={formatTime}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="success"
              name="Success"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="failed"
              name="Failed"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
