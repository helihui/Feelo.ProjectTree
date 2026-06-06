import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STATUS_META, PRIORITY_META, NODE_TYPE_META } from "@/lib/tree-utils"
import type { NodeStatus, NodeType, Priority } from "@/lib/types"

export function StatusBadge({
  status,
  className,
}: {
  status: NodeStatus
  className?: string
}) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.bg,
        meta.fg,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority]
  return (
    <span className={cn("text-xs font-medium", meta.className)}>{meta.label}优先级</span>
  )
}

export function TypeBadge({ type }: { type: NodeType }) {
  return (
    <Badge variant="outline" className="rounded-full text-[11px] font-medium">
      {NODE_TYPE_META[type].label}
    </Badge>
  )
}
