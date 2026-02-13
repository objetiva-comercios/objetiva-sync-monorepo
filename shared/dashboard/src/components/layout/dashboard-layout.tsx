import * as React from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar, type NavSection } from "@/components/layout/app-sidebar"
import { Separator } from "@/components/ui/separator"

/**
 * Props for DashboardLayout component
 */
export interface DashboardLayoutProps {
  /** Child content to render in main area */
  children: React.ReactNode
  /** Custom navigation sections for sidebar */
  sections?: NavSection[]
  /** Currently active URL for highlighting */
  activeUrl?: string
  /** Application title shown in sidebar header */
  title?: string
  /** Version shown in sidebar footer */
  version?: string
  /** Handler for navigation clicks */
  onNavigate?: (url: string) => void
  /** Default theme (defaults to "system") */
  defaultTheme?: "dark" | "light" | "system"
  /** Storage key for theme persistence (defaults to "objetiva-ui-theme") */
  storageKey?: string
  /** Default sidebar open state */
  defaultOpen?: boolean
  /** Breadcrumb content to show in header */
  breadcrumb?: React.ReactNode
}

/**
 * DashboardLayout - Main layout wrapper for dashboard pages
 *
 * Provides:
 * - Theme context (light/dark/system with localStorage persistence)
 * - Sidebar context (collapsible navigation)
 * - Main content area with header
 *
 * @example
 * ```tsx
 * <DashboardLayout
 *   title="My App"
 *   activeUrl="/dashboard"
 *   onNavigate={(url) => router.push(url)}
 * >
 *   <h1>Dashboard Content</h1>
 * </DashboardLayout>
 * ```
 */
export function DashboardLayout({
  children,
  sections,
  activeUrl = "/",
  title = "Objetiva Sync",
  version,
  onNavigate,
  defaultTheme = "system",
  storageKey = "objetiva-ui-theme",
  defaultOpen = true,
  breadcrumb,
}: DashboardLayoutProps) {
  return (
    <ThemeProvider defaultTheme={defaultTheme} storageKey={storageKey}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          sections={sections}
          activeUrl={activeUrl}
          title={title}
          version={version}
          onNavigate={onNavigate}
        />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            {breadcrumb && (
              <>
                <Separator orientation="vertical" className="mr-2 h-4" />
                {breadcrumb}
              </>
            )}
          </header>
          <main className="flex-1 overflow-auto p-4">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  )
}
