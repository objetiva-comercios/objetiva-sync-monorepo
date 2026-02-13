import { useState, useEffect } from 'react'
import { DashboardLayout, type NavSection } from '@objetiva/dashboard'
import OverviewPage from './pages/overview'
import MetricsPage from './pages/metrics'
import RecordsPage from './pages/records'

/**
 * Navigation sections for the dashboard sidebar
 */
const navSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      {
        title: 'Overview',
        url: '/dashboard',
        icon: 'LayoutDashboard',
      },
      {
        title: 'Metrics',
        url: '/dashboard/metrics',
        icon: 'BarChart3',
      },
      {
        title: 'Records',
        url: '/dashboard/records',
        icon: 'Database',
      },
    ],
  },
  {
    title: 'Admin',
    items: [
      {
        title: 'Legacy Dashboard',
        url: '/admin',
        icon: 'Settings',
      },
    ],
  },
]

/**
 * Get the page component based on current path
 */
function getPage(path: string) {
  // Normalize path by removing trailing slash
  const normalizedPath = path.replace(/\/$/, '') || '/dashboard'

  switch (normalizedPath) {
    case '/dashboard/metrics':
      return <MetricsPage />
    case '/dashboard/records':
      return <RecordsPage />
    case '/dashboard':
    default:
      return <OverviewPage />
  }
}

/**
 * React Dashboard Application
 *
 * Simple path-based routing using DashboardLayout from @objetiva/dashboard.
 * Navigation uses regular anchor tags with full page loads (acceptable for dashboard).
 */
function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  // Handle browser navigation (back/forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Handle navigation clicks
  const handleNavigate = (url: string) => {
    // If it's an external or admin link, do full navigation
    if (!url.startsWith('/dashboard')) {
      window.location.href = url
      return
    }
    // For dashboard routes, use History API for smoother navigation
    window.history.pushState({}, '', url)
    setPath(url)
  }

  return (
    <DashboardLayout
      title="Objetiva Sync"
      version="1.0.0"
      sections={navSections}
      activeUrl={path}
      onNavigate={handleNavigate}
      defaultTheme="system"
    >
      {getPage(path)}
    </DashboardLayout>
  )
}

export default App
