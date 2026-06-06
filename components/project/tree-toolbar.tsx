"use client"

import type { StatusFilter } from "./project-view"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { STATUS_META } from "@/lib/tree-utils"
import { cn } from "@/lib/utils"
import type { NodeStatus } from "@/lib/types"

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "progress", label: STATUS_META.progress.label },
  { value: "blocked", label: STATUS_META.blocked.label },
  { value: "todo", label: STATUS_META.todo.label },
  { value: "done", label: STATUS_META.done.label },
  { value: "paused", label: STATUS_META.paused.label },
]

export function TreeToolbar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
}: {
  query: string
  onQueryChange: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (v: StatusFilter) => void
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value
          const dot =
            f.value !== "all" ? STATUS_META[f.value as NodeStatus].dot : null
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => onStatusFilterChange(f.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {dot && (
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    active ? "bg-primary-foreground" : dot,
                  )}
                />
              )}
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="搜索节点..."
          className="h-8 pl-8"
        />
      </div>
    </div>
  )
}
