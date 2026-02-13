/**
 * @objetiva/dashboard - Shared React dashboard components
 *
 * This is the library entry point. Export all components and utilities here.
 */

// Import styles - will be extracted to style.css during build
import './index.css'

// Core utilities
export { cn } from './lib/utils'

// UI components
export { Button, buttonVariants, type ButtonProps } from './components/ui/button'
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './components/ui/table'

// Data components
export {
  DataTable,
  type DataTableProps,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type RowSelectionState,
} from './components/data/data-table'
export {
  DataTablePagination,
  PAGE_SIZE_OPTIONS,
  type DataTablePaginationProps,
  type PageSize,
} from './components/data/data-table-pagination'

// Hooks
export { useInterval } from './hooks/use-interval'
export { useIsMobile } from './hooks/use-mobile'

// Theme
export { ThemeProvider, useTheme } from './components/theme-provider'
export { ThemeToggle } from './components/theme-toggle'

// Layout components
export { DashboardLayout, type DashboardLayoutProps } from './components/layout/dashboard-layout'
export { AppSidebar, type AppSidebarProps, type NavItem, type NavSection } from './components/layout/app-sidebar'

// Sidebar primitives (re-export from ui for convenience)
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from './components/ui/sidebar'

// Card
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from './components/ui/card'

// Dropdown Menu
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './components/ui/dropdown-menu'

// Tooltip
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './components/ui/tooltip'

// Sheet (mobile sidebar)
export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './components/ui/sheet'

// Separator
export { Separator } from './components/ui/separator'

// Input
export { Input } from './components/ui/input'

// Skeleton
export { Skeleton } from './components/ui/skeleton'

// Charts
export {
  SyncMetricsChart,
  type SyncMetricsChartProps,
  type MetricDataPoint,
} from './components/charts/sync-metrics-chart'
export {
  StatusPieChart,
  type StatusPieChartProps,
  type StatusDataPoint,
} from './components/charts/status-pie-chart'
