import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSchemaComparison } from '@/hooks/useSchemaComparison'
import { SchemaComparisonTable } from '@/components/SchemaComparisonTable'
import { SchemaEntityTabs } from '@/components/SchemaEntityTabs'
import { SyncNotReportedBanner } from '@/components/SyncNotReportedBanner'

export function SchemaStatus() {
  const { data, isLoading, error, refresh } = useSchemaComparison()
  const [activeEntity, setActiveEntity] = useState<string>('')

  useEffect(() => {
    if (data && activeEntity === '') {
      setActiveEntity(data[0]?.entity ?? '')
    }
  }, [data])

  if (isLoading && !data) {
    return (
      <div className="min-h-screen gradient-bg grid-pattern flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="w-16 h-16 text-primary animate-spin mx-auto" />
          <p className="text-xl font-semibold text-muted-foreground">Cargando schemas...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen gradient-bg grid-pattern flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
          <h2 className="text-2xl font-bold">Error al cargar schemas</h2>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="min-h-screen gradient-bg grid-pattern flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <Database className="w-16 h-16 text-muted-foreground mx-auto" />
          <h2 className="text-2xl font-bold">No hay datos de schemas disponibles</h2>
          <p className="text-muted-foreground">
            El gateway no ha podido obtener los schemas de comparacion. Verifica que el gateway este corriendo y reintenta.
          </p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const activeComparison = data.find(e => e.entity === activeEntity) ?? data[0]
  const showSyncBanner = data[0]?.sync_reported === false

  return (
    <div className="min-h-screen gradient-bg grid-pattern">
      <div className="max-w-[1600px] mx-auto p-4 space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-cyan-300 bg-clip-text text-transparent">
              Schema Status
            </h1>
            <p className="text-sm text-muted-foreground">
              Comparacion de schemas entre PostgreSQL, gateway y sync
            </p>
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1.5 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2 text-sm"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Actualizar
          </button>
        </header>

        {/* Sync banner */}
        {showSyncBanner && <SyncNotReportedBanner />}

        {/* Entity tabs */}
        <SchemaEntityTabs
          entities={data}
          activeEntity={activeEntity}
          onSelect={setActiveEntity}
        />

        {/* Comparison table */}
        {activeComparison && (
          <SchemaComparisonTable comparison={activeComparison} />
        )}
      </div>
    </div>
  )
}
