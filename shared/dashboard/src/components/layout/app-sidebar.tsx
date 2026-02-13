import {
  Home,
  Database,
  Settings,
  Clock,
  RefreshCw,
  LayoutDashboard,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

/**
 * Navigation item for the sidebar
 */
export interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  isActive?: boolean
}

/**
 * Navigation section containing multiple items
 */
export interface NavSection {
  label: string
  items: NavItem[]
}

/**
 * Props for AppSidebar component
 */
export interface AppSidebarProps {
  /** Custom navigation sections to override defaults */
  sections?: NavSection[]
  /** Currently active URL for highlighting */
  activeUrl?: string
  /** Application title shown in header */
  title?: string
  /** Version shown in footer */
  version?: string
  /** Custom render for navigation item click handler */
  onNavigate?: (url: string) => void
}

/**
 * Default navigation sections
 */
const defaultSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: Home },
      { title: "Sync Status", url: "/sync", icon: RefreshCw },
    ],
  },
  {
    label: "Records",
    items: [
      { title: "Articulos", url: "/records/articulos", icon: Database },
      { title: "Comprobantes", url: "/records/comprobantes", icon: Database },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Connections", url: "/settings/connections", icon: LayoutDashboard },
      { title: "Queries", url: "/settings/queries", icon: Database },
      { title: "Scheduler", url: "/settings/scheduler", icon: Clock },
      { title: "Configuration", url: "/settings/config", icon: Settings },
    ],
  },
]

/**
 * AppSidebar - Main navigation sidebar component
 *
 * Uses shadcn/ui Sidebar primitives for collapsible navigation.
 * Supports custom navigation sections and theming.
 */
export function AppSidebar({
  sections = defaultSections,
  activeUrl = "/",
  title = "Objetiva Sync",
  version,
  onNavigate,
}: AppSidebarProps) {
  const handleClick = (url: string) => (e: React.MouseEvent) => {
    if (onNavigate) {
      e.preventDefault()
      onNavigate(url)
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <RefreshCw className="h-4 w-4" />
          </div>
          <span className="font-semibold group-data-[collapsible=icon]:hidden">
            {title}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.isActive ?? item.url === activeUrl}
                      tooltip={item.title}
                    >
                      <a href={item.url} onClick={handleClick(item.url)}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center justify-between px-2 py-2">
          <ThemeToggle />
          {version && (
            <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              v{version}
            </span>
          )}
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
