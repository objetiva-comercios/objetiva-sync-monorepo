import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import type { EntityComparison, ComparisonFieldRow, FieldLayerData } from '@/types'

const STATUS_CONFIG = {
  aligned:    { dot: 'bg-emerald-400', row: '',                 text: 'text-emerald-400', label: 'Alineado' },
  mismatched: { dot: 'bg-red-400',     row: 'bg-red-500/10',    text: 'text-red-400',     label: 'Desincronizado' },
  missing:    { dot: 'bg-yellow-400',  row: 'bg-yellow-500/10', text: 'text-yellow-400',  label: 'Faltante' },
} as const

function LayerCell({ layer }: { layer: FieldLayerData | null }) {
  if (layer === null) {
    return <td className="px-4 py-2 text-muted-foreground">—</td>
  }
  return (
    <td className="px-4 py-2">
      <span className="font-mono text-sm">{layer.data_type}</span>
      <span className="block text-xs text-muted-foreground">{layer.is_nullable ? 'YES' : 'NO'}</span>
    </td>
  )
}

interface SchemaComparisonTableProps {
  comparison: EntityComparison
}

export function SchemaComparisonTable({ comparison }: SchemaComparisonTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Campo</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">PostgreSQL</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Compilado</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Sync</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-muted-foreground">Estado</th>
            </tr>
          </thead>
          <tbody>
            {comparison.fields.map((field: ComparisonFieldRow) => (
              <tr
                key={field.column_name}
                className={cn('border-b border-border transition-colors', STATUS_CONFIG[field.status].row)}
              >
                <td className="px-4 py-2 text-sm">{field.column_name}</td>
                <LayerCell layer={field.postgresql} />
                <LayerCell layer={field.compiled} />
                <LayerCell layer={field.sync} />
                <td className="px-4 py-2">
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', STATUS_CONFIG[field.status].dot)} />
                  <span className={cn('text-sm', STATUS_CONFIG[field.status].text)}>
                    {STATUS_CONFIG[field.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
