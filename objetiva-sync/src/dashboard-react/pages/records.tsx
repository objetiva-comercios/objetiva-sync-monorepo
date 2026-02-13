import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  useInterval,
  type ColumnDef,
  type PaginationState,
} from '@objetiva/dashboard'

/**
 * Sync log record from API
 */
interface SyncRecord {
  id: number
  query_name: string
  status: 'success' | 'partial' | 'error'
  records_processed: number
  records_failed: number
  started_at: string
  finished_at: string | null
  error_message: string | null
  source_id?: string
}

/**
 * Column definitions for the records table
 */
const columns: ColumnDef<SyncRecord, unknown>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ getValue }) => (
      <span className="font-mono text-sm">{getValue() as number}</span>
    ),
  },
  {
    accessorKey: 'query_name',
    header: 'Consulta',
    cell: ({ getValue }) => (
      <span className="font-medium">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ getValue }) => {
      const status = getValue() as string
      const colors: Record<string, string> = {
        success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      }
      const labels: Record<string, string> = {
        success: 'éxito',
        partial: 'parcial',
        error: 'error',
      }
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || ''}`}>
          {labels[status] || status}
        </span>
      )
    },
  },
  {
    accessorKey: 'records_processed',
    header: 'Procesados',
    cell: ({ getValue }) => (
      <span className="text-green-600 dark:text-green-400">
        {(getValue() as number).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: 'records_failed',
    header: 'Fallidos',
    cell: ({ getValue }) => {
      const value = getValue() as number
      return value > 0 ? (
        <span className="text-red-600 dark:text-red-400">
          {value.toLocaleString()}
        </span>
      ) : (
        <span className="text-muted-foreground">0</span>
      )
    },
  },
  {
    accessorKey: 'source_id',
    header: 'Origen',
    cell: ({ getValue }) => {
      const source = getValue() as string | undefined
      if (!source) return <span className="text-muted-foreground">-</span>
      return (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
          {source}
        </span>
      )
    },
  },
  {
    accessorKey: 'started_at',
    header: 'Iniciado',
    cell: ({ getValue }) => {
      const date = new Date(getValue() as string)
      return (
        <span className="text-sm text-muted-foreground">
          {date.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )
    },
  },
  {
    accessorKey: 'error_message',
    header: 'Error',
    cell: ({ getValue }) => {
      const message = getValue() as string | null
      if (!message) return <span className="text-muted-foreground">-</span>
      return (
        <span className="text-xs text-red-600 dark:text-red-400 truncate max-w-[200px] block" title={message}>
          {message}
        </span>
      )
    },
  },
]

/**
 * Records Page - Sync log table with pagination
 *
 * Displays synchronization operation history with origin tracking.
 */
export default function RecordsPage() {
  const [data, setData] = useState<SyncRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  })

  const fetchData = useCallback(async () => {
    try {
      const offset = pagination.pageIndex * pagination.pageSize
      const response = await fetch(
        `/api/logs?limit=${pagination.pageSize}&offset=${offset}`
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const json = await response.json()

      // Handle API response structure
      if (json.logs) {
        setData(json.logs)
        setTotalCount(json.total || json.logs.length)
      } else if (Array.isArray(json)) {
        setData(json)
        setTotalCount(json.length)
      } else {
        setData([])
        setTotalCount(0)
      }

      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs')
    } finally {
      setLoading(false)
    }
  }, [pagination.pageIndex, pagination.pageSize])

  // Initial fetch and pagination changes
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh
  useInterval(fetchData, 30000)

  const pageCount = Math.ceil(totalCount / pagination.pageSize)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Registros de Sincronización</h1>
        <p className="text-muted-foreground">
          Ver registros sincronizados con seguimiento de origen
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sincronizaciones Recientes</CardTitle>
          <CardDescription>
            Operaciones de sincronización con información de origen y marca de tiempo
          </CardDescription>
          {error && (
            <span className="text-sm text-destructive">
              Error: {error}
            </span>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={data}
            isLoading={loading}
            loadingRowCount={10}
            showPagination={true}
            showRowsPerPage={true}
            pagination={pagination}
            onPaginationChange={setPagination}
            pageCount={pageCount}
            manualPagination={true}
            emptyMessage="No se encontraron registros de sincronización"
          />
        </CardContent>
      </Card>
    </div>
  )
}
