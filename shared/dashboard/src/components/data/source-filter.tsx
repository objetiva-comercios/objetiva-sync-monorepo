import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface SourceFilterProps {
  /** Available sources to filter by */
  sources: string[]
  /** Currently selected source (empty string = all) */
  value: string
  /** Callback when selection changes */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
}

/**
 * Dropdown filter for selecting origin source.
 */
export function SourceFilter({
  sources,
  value,
  onChange,
  placeholder = "Filter by source",
}: SourceFilterProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All sources</SelectItem>
        {sources.map((source) => (
          <SelectItem key={source} value={source}>
            {source}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
