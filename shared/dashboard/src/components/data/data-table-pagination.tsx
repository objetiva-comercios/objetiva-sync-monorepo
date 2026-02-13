import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import type { Table } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Row count options for the pagination selector
 */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

export interface DataTablePaginationProps<TData> {
  /**
   * TanStack Table instance
   */
  table: Table<TData>
  /**
   * Optional class name for the container
   */
  className?: string
  /**
   * Whether to show rows per page selector
   * @default true
   */
  showRowsPerPage?: boolean
  /**
   * Whether to show selected row count
   * @default false
   */
  showSelectedRowCount?: boolean
}

/**
 * Pagination controls for DataTable.
 *
 * Features:
 * - First/Previous/Next/Last page navigation
 * - Current page indicator (Page X of Y)
 * - Rows per page selector (10, 25, 50, 100)
 * - Optional selected row count display
 */
export function DataTablePagination<TData>({
  table,
  className,
  showRowsPerPage = true,
  showSelectedRowCount = false,
}: DataTablePaginationProps<TData>) {
  const pageCount = table.getPageCount()
  const currentPage = table.getState().pagination.pageIndex + 1

  return (
    <div
      className={cn(
        'flex items-center justify-between px-2 py-4',
        className
      )}
    >
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {showSelectedRowCount && (
          <span>
            {table.getFilteredSelectedRowModel().rows.length} de{' '}
            {table.getFilteredRowModel().rows.length} fila(s) seleccionada(s)
          </span>
        )}
        {showRowsPerPage && (
          <div className="flex items-center gap-2">
            <span>Filas por página</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value))
              }}
              className="h-8 w-16 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PAGE_SIZE_OPTIONS.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Página {currentPage} de {pageCount || 1}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="Go to first page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Go to next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Go to last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
