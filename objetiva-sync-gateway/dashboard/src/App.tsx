import { useState } from 'react'
import { Dashboard } from '@/components/Dashboard'
import { SchemaStatus } from '@/components/SchemaStatus'
import { cn } from '@/lib/utils'

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schema'>('dashboard')

  return (
    <div>
      {/* Top tab bar — per D-01, D-02 */}
      <nav className="bg-card border-b border-border">
        <div className="max-w-[1600px] mx-auto px-4 flex gap-0">
          {(['dashboard', 'schema'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-6 min-h-[44px] text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab === 'dashboard' ? 'Dashboard' : 'Schema Status'}
            </button>
          ))}
        </div>
      </nav>
      {/* Page content — conditional render per D-01 */}
      {activeTab === 'dashboard' ? <Dashboard /> : <SchemaStatus />}
    </div>
  )
}

export default App
