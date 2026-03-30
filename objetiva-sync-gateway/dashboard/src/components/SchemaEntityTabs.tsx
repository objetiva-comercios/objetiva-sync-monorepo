import { CheckCircle2 } from 'lucide-react'
import { cn, getEntityLabel } from '@/lib/utils'
import type { EntityComparison } from '@/types'

interface SchemaEntityTabsProps {
  entities: EntityComparison[]
  activeEntity: string
  onSelect: (entity: string) => void
}

export function SchemaEntityTabs({ entities, activeEntity, onSelect }: SchemaEntityTabsProps) {
  return (
    <div className="flex items-end border-b border-border overflow-x-auto">
      {entities.map((entity) => {
        const isActive = entity.entity === activeEntity
        const problems = entity.summary.mismatched + entity.summary.missing

        return (
          <button
            key={entity.entity}
            onClick={() => onSelect(entity.entity)}
            className={cn(
              'flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium border-b-2 transition-colors',
              isActive
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {getEntityLabel(entity.entity)}
            {problems === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
                {problems} {problems === 1 ? 'problema' : 'problemas'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
