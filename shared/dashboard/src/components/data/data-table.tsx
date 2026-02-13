import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type RowSelectionState,
  type OnChangeFn,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { DataTablePagination, type PageSize } from './data-table-pagination'

export interface DataTableProps<TData, TValue> {
  /**
   * Column definitions for the table
   */
  columns: ColumnDef<TData, TValue>[]
  /**
   * Data array to display
   */
  data: TData[]
  /**
   * Optional class name for the container
   */
  className?: string
  /**
   * Whether to show pagination controls
   * @default true
   */
  showPagination?: boolean
  /**
   * Whether to show rows per page selector
   * @default true
   */
  showRowsPerPage?: boolean
  /**
   * Initial page size
   * @default 10
   */
  defaultPageSize?: PageSize
  /**
   * Enable row selection
   * @default false
   */
  enableRowSelection?: boolean
  /**
   * Controlled row selection state
   */
  rowSelection?: RowSelectionState
  /**
   * Callback when row selection changes
   */
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  /**
   * Controlled sorting state
   */
  sorting?: SortingState
  /**
   * Callback when sorting changes
   */
  onSortingChange?: OnChangeFn<SortingState>
  /**
   * Controlled pagination state (for server-side pagination)
   */
  pagination?: PaginationState
  /**
   * Callback when pagination changes (for server-side pagination)
   */
  onPaginationChange?: OnChangeFn<PaginationState>
  /**
   * Total page count (for server-side pagination)
   */
  pageCount?: number
  /**
   * Enable manual pagination (server-side)
   * @default false
   */
  manualPagination?: boolean
  /**
   * Loading state - shows skeleton rows
   * @default false
   */
  isLoading?: boolean
  /**
   * Number of skeleton rows to show when loading
   * @default 5
   */
  loadingRowCount?: number
  /**
   * Message to show when no data
   * @default "No results."
   */
  emptyMessage?: string
  /**
   * Get row ID for selection tracking
   */
  getRowId?: (row: TData) => string
}

/**
 * Generic data table component built on TanStack Table.
 *
 * Features:
 * - Pagination with page size selector
 * - Column sorting (client or server-side)
 * - Row selection (optional)
 * - Loading skeleton state
 * - Empty state message
 * - Server-side pagination support
 *
 * @example
 * ```tsx
 * const columns = [
 *   { accessorKey: 'name', header: 'Name' },
 *   { accessorKey: 'status', header: 'Status' },
 * ]
 *
 * <DataTable columns={columns} data={records} />
 * ```
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  className,
  showPagination = true,
  showRowsPerPage = true,
  defaultPageSize = 10,
  enableRowSelection = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  sorting: controlledSorting,
  onSortingChange,
  pagination: controlledPagination,
  onPaginationChange,
  pageCount,
  manualPagination = false,
  isLoading = false,
  loadingRowCount = 5,
  emptyMessage = 'Sin resultados.',
  getRowId,
}: DataTableProps<TData, TValue>) {
  // Internal state for uncontrolled mode
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([])
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({})
  const [internalPagination, setInternalPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  })

  // Use controlled state if provided, otherwise use internal state
  const sorting = controlledSorting ?? internalSorting
  const rowSelection = controlledRowSelection ?? internalRowSelection
  const pagination = controlledPagination ?? internalPagination

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: onSortingChange ?? setInternalSorting,
    onRowSelectionChange: onRowSelectionChange ?? setInternalRowSelection,
    onPaginationChange: onPaginationChange ?? setInternalPagination,
    state: {
      sorting,
      rowSelection,
      pagination,
    },
    enableRowSelection,
    manualPagination,
    pageCount,
    getRowId,
  })

  // Generate skeleton rows for loading state
  const skeletonRows = React.useMemo(() => {
    if (!isLoading) return null
    return Array.from({ length: loadingRowCount }).map((_, index) => (
      <TableRow key={`skeleton-${index}`}>
        {columns.map((_, colIndex) => (
          <TableCell key={`skeleton-cell-${index}-${colIndex}`}>
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </TableCell>
        ))}
      </TableRow>
    ))
  }, [isLoading, loadingRowCount, columns])

  return (
    <div className={cn('space-y-4', className)}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              skeletonRows
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && (
        <DataTablePagination
          table={table}
          showRowsPerPage={showRowsPerPage}
          showSelectedRowCount={enableRowSelection}
        />
      )}
    </div>
  )
}

// Re-export types for convenience
export type { ColumnDef, SortingState, PaginationState, RowSelectionState }
