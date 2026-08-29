"use client"

import type { MindMapMode, StatusFilter, ViewMode } from "./project-view"
import { Input } from "@/components/ui/input"
import { Search, GitBranch, Workflow, PanelTopClose, LayoutPanelTop, Rows3 } from "lucide-react"
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
  viewMode,
  onViewModeChange,
  mindMapMode,
  onMindMapModeChange,
}: {
  query: string
  onQueryChange: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (v: StatusFilter) => void
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  mindMapMode: MindMapMode
  onMindMapModeChange: (v: MindMapMode) => void
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => onViewModeChange("tree")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              viewMode === "tree"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            树形视图
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("mindmap")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              viewMode === "mindmap"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Workflow className="h-3.5 w-3.5" />
            思维导图
          </button>
        </div>

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

        {viewMode === "mindmap" && (
          <div className="inline-flex items-center rounded-lg border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => onMindMapModeChange("compact")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                mindMapMode === "compact"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <PanelTopClose className="h-3.5 w-3.5" />
              简洁模式
            </button>
            <button
              type="button"
              onClick={() => onMindMapModeChange("standard")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                mindMapMode === "standard"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutPanelTop className="h-3.5 w-3.5" />
              标准模式
            </button>
            <button
              type="button"
              onClick={() => onMindMapModeChange("detail")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                mindMapMode === "detail"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Rows3 className="h-3.5 w-3.5" />
              详细模式
            </button>
          </div>
        )}
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
