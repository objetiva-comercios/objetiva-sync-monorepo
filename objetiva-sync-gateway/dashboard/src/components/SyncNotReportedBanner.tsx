import { AlertTriangle } from 'lucide-react'

export function SyncNotReportedBanner() {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
      <p className="text-sm text-yellow-400">
        Sync no ha reportado schemas al gateway. Los datos de la columna Sync no estan disponibles.
      </p>
    </div>
  )
}
