import { useEffect, useState, useCallback } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useInterval } from '@/hooks/use-interval'

/**
 * Data point for pie chart segment
 */
export interface StatusDataPoint {
  name: string
  value: number
  color?: string
}

/**
 * Props for StatusPieChart component
 */
export interface StatusPieChartProps {
  /**
   * API endpoint to fetch status data from
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
   * @default 'Sync Status Distribution'
   */
  title?: string

  /**
   * Chart description
   */
  description?: string

  /**
   * Chart height in pixels
   * @default 300
   */
  height?: number

  /**
   * Inner radius for donut chart effect (0 for solid pie)
   * @default 60
   */
  innerRadius?: number

  /**
   * Outer radius of the pie
   * @default 80
   */
  outerRadius?: number

  /**
   * Custom class name for the card wrapper
   */
  className?: string

  /**
   * Custom data transformer function
   * Use this to transform API response to StatusDataPoint[]
   */
  transformData?: (response: unknown) => StatusDataPoint[]
}

/**
 * Default colors using shadcn CSS variables
 */
const DEFAULT_COLORS = [
  'hsl(var(--chart-2))', // Success - teal/green
  'hsl(var(--destructive))', // Failed - red
  'hsl(var(--chart-4))', // Pending - yellow
  'hsl(var(--chart-1))', // Other - orange
  'hsl(var(--chart-3))', // Other - dark blue
]

/**
 * Default transformer for /api/stats endpoint
 * Converts the stats response to pie chart data
 */
function defaultTransformData(response: unknown): StatusDataPoint[] {
  if (!response || typeof response !== 'object') return []

  const data = response as {
    stats?: {
      processed?: number
      failed?: number
      total?: number
    }
  }

  if (!data.stats) return []

  const processed = data.stats.processed ?? 0
  const failed = data.stats.failed ?? 0
  const total = data.stats.total ?? 0
  const pending = Math.max(0, total - processed - failed)

  const result: StatusDataPoint[] = []

  if (processed > 0) {
    result.push({
      name: 'Processed',
      value: processed,
      color: DEFAULT_COLORS[0],
    })
  }

  if (failed > 0) {
    result.push({
      name: 'Failed',
      value: failed,
      color: DEFAULT_COLORS[1],
    })
  }

  if (pending > 0) {
    result.push({
      name: 'Pending',
      value: pending,
      color: DEFAULT_COLORS[2],
    })
  }

  return result
}

/**
 * Custom tooltip for pie chart
 */
interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number
    payload: StatusDataPoint
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const item = payload[0]
  const total = payload.reduce((sum, p) => sum + p.value, 0)
  const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0

  return (
    <div
      className="rounded-lg border bg-card p-2 shadow-sm"
      style={{
        backgroundColor: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
      }}
    >
      <p className="font-medium" style={{ color: item.payload.color }}>
        {item.name}
      </p>
      <p className="text-sm text-muted-foreground">
        {item.value.toLocaleString()} ({percentage}%)
      </p>
    </div>
  )
}

/**
 * Custom label for pie slices
 */
interface LabelProps {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  percent: number
  name: string
}

function renderLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: LabelProps) {
  // Don't show label for very small slices
  if (percent < 0.05) return null

  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

/**
 * StatusPieChart - Pie/donut chart for sync status distribution
 *
 * Displays processed/failed/pending status distribution with auto-refresh.
 * Uses Recharts for rendering and shadcn Card for consistent styling.
 *
 * @example
 * ```tsx
 * // Basic usage with defaults
 * <StatusPieChart />
 *
 * // Solid pie (no hole in center)
 * <StatusPieChart innerRadius={0} />
 *
 * // Custom endpoint and refresh interval
 * <StatusPieChart
 *   endpoint="/api/custom-status"
 *   refreshInterval={10000}
 *   title="Custom Status"
 * />
 *
 * // Disabled auto-refresh
 * <StatusPieChart refreshInterval={null} />
 * ```
 */
export function StatusPieChart({
  endpoint = '/api/stats',
  refreshInterval = 5000,
  title = 'Sync Status Distribution',
  description,
  height = 300,
  innerRadius = 60,
  outerRadius = 80,
  className,
  transformData = defaultTransformData,
}: StatusPieChartProps) {
  const [data, setData] = useState<StatusDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const json = await response.json()
      const points = transformData(json)
      setData(points)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
    }
  }, [endpoint, transformData])

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
          <div className="flex items-center justify-center" style={{ height }}>
            <Skeleton className="rounded-full" style={{ width: outerRadius * 2, height: outerRadius * 2 }} />
          </div>
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

  // Empty state
  if (data.length === 0) {
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
            No data available
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
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              dataKey="value"
              label={renderLabel}
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value: string) => (
                <span className="text-sm text-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
