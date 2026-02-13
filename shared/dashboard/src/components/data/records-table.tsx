import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from './data-table'
import { SourceFilter } from './source-filter'
import { OriginBadge } from './origin-badge'
import { useInterval } from '@/hooks/use-interval'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { PageSize } from './data-table-pagination'

export interface SyncRecord {
  id: string | number
  entityType: string
  recordsSent: number
  recordsSuccess: number
  recordsFailed: number
  status: 'success' | 'failed' | 'partial'
  createdAt: string
  // Origin tracking fields (from Phase 14)
  origin_source?: string | null
  origin_timestamp?: string | null
  has_conflict?: boolean
  conflict_at?: string | null
}

export interface RecordsTableProps {
  /** API endpoint to fetch records from */
  apiEndpoint?: string
  /** Refresh interval in ms */
  refreshInterval?: number
  /** Title for the table card */
  title?: string
  /** Description */
  description?: string
  /** Default page size (10, 25, 50, or 100) */
  defaultPageSize?: PageSize
}

export function RecordsTable({
  apiEndpoint = '/api/logs',
  refreshInterval = 30000,
  title = 'Sync Records',
  description = 'Recent synchronization operations with origin tracking',
  defaultPageSize = 25,
}: RecordsTableProps) {
  const [data, setData] = useState<SyncRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string>('')

  const fetchRecords = useCallback(async () => {
    try {
      const response = await fetch(apiEndpoint)
      const result = await response.json()

      if (result.success && Array.isArray(result.logs || result.data)) {
        setData(result.logs || result.data)
        setError(null)
      } else if (Array.isArray(result)) {
        setData(result)
        setError(null)
      } else {
        setError('Invalid response format')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch records')
    } finally {
      setIsLoading(false)
    }
  }, [apiEndpoint])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  useInterval(fetchRecords, refreshInterval)

  // Extract unique sources for filter
  const availableSources = useMemo(() => {
    const sources = new Set<string>()
    data.forEach((record) => {
      if (record.origin_source) {
        sources.add(record.origin_source)
      }
    })
    return Array.from(sources).sort()
  }, [data])

  // Filter data by source
  const filteredData = useMemo(() => {
    if (!sourceFilter || sourceFilter === '__all__') return data
    return data.filter((record) => record.origin_source === sourceFilter)
  }, [data, sourceFilter])

  // Column definitions
  const columns: ColumnDef<SyncRecord>[] = [
    {
      accessorKey: 'entityType',
      header: 'Entity',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string
        const colorClass = {
          success: 'text-green-600 dark:text-green-400',
          failed: 'text-red-600 dark:text-red-400',
          partial: 'text-yellow-600 dark:text-yellow-400',
        }[status] || ''
        return <span className={`font-medium ${colorClass}`}>{status}</span>
      },
    },
    {
      accessorKey: 'recordsSent',
      header: 'Records',
      cell: ({ row }) => {
        const sent = row.original.recordsSent
        const success = row.original.recordsSuccess
        const failed = row.original.recordsFailed
        return (
          <span>
            {sent} <span className="text-muted-foreground">({success} ok, {failed} err)</span>
          </span>
        )
      },
    },
    {
      accessorKey: 'origin_source',
      header: 'Source',
      cell: ({ row }) => (
        <OriginBadge
          source={row.original.origin_source ?? null}
          hasConflict={row.original.has_conflict}
          conflictAt={row.original.conflict_at}
        />
      ),
    },
    {
      accessorKey: 'origin_timestamp',
      header: 'Origin Time',
      cell: ({ row }) => {
        const timestamp = row.original.origin_timestamp
        if (!timestamp) return <span className="text-muted-foreground">-</span>
        return new Date(timestamp).toLocaleString()
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Synced At',
      cell: ({ row }) => {
        const timestamp = row.getValue('createdAt') as string
        return new Date(timestamp).toLocaleString()
      },
    },
  ]

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando...</div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-destructive">Error: {error}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {availableSources.length > 0 && (
            <SourceFilter
              sources={availableSources}
              value={sourceFilter}
              onChange={setSourceFilter}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={filteredData}
          defaultPageSize={defaultPageSize}
        />
      </CardContent>
    </Card>
  )
}
