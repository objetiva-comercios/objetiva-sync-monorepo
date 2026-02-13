import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertCircle } from "lucide-react"

export interface OriginBadgeProps {
  /** Source identifier (e.g., hostname or label) */
  source: string | null
  /** Whether this record had a recent conflict */
  hasConflict?: boolean
  /** Conflict timestamp if any */
  conflictAt?: string | null
  /** Short display mode (truncate long source names) */
  short?: boolean
}

/**
 * Displays origin source with optional conflict indicator.
 * Shows full source on hover when truncated.
 */
export function OriginBadge({
  source,
  hasConflict = false,
  conflictAt,
  short = true,
}: OriginBadgeProps) {
  if (!source) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Unknown
      </Badge>
    )
  }

  // Truncate long source names
  const displaySource = short && source.length > 15
    ? `${source.substring(0, 12)}...`
    : source

  const badge = (
    <Badge
      variant={hasConflict ? "destructive" : "secondary"}
      className="gap-1"
    >
      {hasConflict && <AlertCircle className="h-3 w-3" />}
      {displaySource}
    </Badge>
  )

  // Show tooltip with full source and conflict info
  if ((short && source.length > 15) || hasConflict) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-medium">Source: {source}</p>
              {hasConflict && conflictAt && (
                <p className="text-xs text-muted-foreground">
                  Conflict detected: {new Date(conflictAt).toLocaleString()}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return badge
}
