"use client"

import type { NodeStatus, TreeNode } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  ChevronRight,
  Sparkles,
  MessageSquare,
  CircleCheck,
  CircleDashed,
  OctagonAlert,
  Circle,
  PauseCircle,
} from "lucide-react"
import { computeProgress, computeStats, STATUS_META, NODE_TYPE_META } from "@/lib/tree-utils"
import { getUser } from "@/lib/data"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const STATUS_ICON: Record<NodeStatus, typeof Circle> = {
  done: CircleCheck,
  progress: CircleDashed,
  blocked: OctagonAlert,
  paused: PauseCircle,
  todo: Circle,
}

const STATUS_ORDER: NodeStatus[] = ["todo", "progress", "done", "blocked", "paused"]

interface Props {
  node: TreeNode
  depth: number
  isLast: boolean
  ancestorsLast: boolean[]
  collapsed: Set<string>
  onToggle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onStatusChange: (id: string, status: NodeStatus) => void
  matchedIds: Set<string> | null
  isVisible: (node: TreeNode) => boolean
  isMatch: (node: TreeNode) => boolean
}

export function TreeNodeRow(props: Props) {
  const {
    node,
    depth,
    ancestorsLast,
    collapsed,
    onToggle,
    selectedId,
    onSelect,
    onStatusChange,
    matchedIds,
    isVisible,
    isMatch,
  } = props

  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const isSelected = selectedId === node.id
  const progress = computeProgress(node)
  const meta = STATUS_META[node.status]
  const StatusIcon = STATUS_ICON[node.status]
  const dimmed = matchedIds !== null && !isMatch(node)

  const visibleChildren = node.children.filter(isVisible)

  return (
    <div className="relative">
      <div
        className={cn(
          "group relative flex items-center gap-2 rounded-lg py-1.5 pr-2 transition-colors",
          isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent/60",
          dimmed && "opacity-40",
        )}
        style={{ paddingLeft: depth * 22 + 4 }}
      >
        {/* 连接线 */}
        {depth > 0 && (
          <Connectors depth={depth} ancestorsLast={ancestorsLast} isLast={props.isLast} />
        )}

        {/* 展开/收起 */}
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          className={cn(
            "z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors",
            hasChildren ? "hover:bg-accent hover:text-foreground" : "invisible",
          )}
          aria-label={isCollapsed ? "展开" : "收起"}
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", !isCollapsed && "rotate-90")}
          />
        </button>

        {/* 状态图标（可点击切换） */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn("z-10 shrink-0 rounded-full p-0.5 outline-none", meta.fg)}
            aria-label="切换状态"
          >
            <StatusIcon className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATUS_ORDER.map((s) => {
              const Icon = STATUS_ICON[s]
              return (
                <DropdownMenuItem
                  key={s}
                  onClick={() => onStatusChange(node.id, s)}
                  className="gap-2"
                >
                  <Icon className={cn("h-4 w-4", STATUS_META[s].fg)} />
                  {STATUS_META[s].label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 主体（可点击选中） */}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="z-10 flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "truncate text-sm",
              depth === 0 ? "font-semibold" : "font-medium",
            )}
          >
            {node.title}
          </span>
          {node.aiGenerated && (
            <Sparkles className="h-3 w-3 shrink-0 text-primary" />
          )}
          <span className="hidden shrink-0 rounded border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground sm:inline">
            {NODE_TYPE_META[node.type].label}
          </span>
          {node.comments.length > 0 && (
            <span className="hidden items-center gap-0.5 text-[11px] text-muted-foreground sm:flex">
              <MessageSquare className="h-3 w-3" />
              {node.comments.length}
            </span>
          )}
        </button>

        {/* 右侧：进度 + 负责人 */}
        <div className="z-10 flex shrink-0 items-center gap-3">
          {hasChildren && (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {computeStats(node).done}/{computeStats(node).total}
            </span>
          )}
          <div className="hidden w-24 items-center gap-2 md:flex">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", meta.dot)}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
              {progress}%
            </span>
          </div>
          <div className="flex -space-x-1.5">
            {node.assigneeIds.slice(0, 2).map((id) => {
              const u = getUser(id)
              return (
                <Avatar key={id} className="h-5 w-5 border border-background">
                  <AvatarFallback
                    className="text-[9px] font-semibold text-primary-foreground"
                    style={{ backgroundColor: u.color }}
                  >
                    {u.initials}
                  </AvatarFallback>
                </Avatar>
              )
            })}
          </div>
        </div>
      </div>

      {/* 子节点 */}
      {hasChildren && !isCollapsed && (
        <div>
          {visibleChildren.map((child, idx) => (
            <TreeNodeRow
              {...props}
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={idx === visibleChildren.length - 1}
              ancestorsLast={[...ancestorsLast, props.isLast]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 绘制树形连接线 */
function Connectors({
  depth,
  ancestorsLast,
  isLast,
}: {
  depth: number
  ancestorsLast: boolean[]
  isLast: boolean
}) {
  return (
    <>
      {Array.from({ length: depth }).map((_, i) => {
        const left = i * 22 + 14
        // 祖先层：若该祖先不是其父的最后一个，画竖线贯穿
        if (i < depth - 1) {
          const ancestorIsLast = ancestorsLast[i + 1]
          if (ancestorIsLast) return null
          return (
            <span
              key={i}
              className="pointer-events-none absolute top-0 h-full w-px bg-border"
              style={{ left }}
            />
          )
        }
        // 当前层：画 L 形（竖线到中点 + 横线）
        return (
          <span key={i} className="pointer-events-none absolute" style={{ left }}>
            <span
              className={cn(
                "absolute top-0 w-px bg-border",
                isLast ? "h-[18px]" : "h-full",
              )}
            />
            <span className="absolute top-[18px] h-px w-[12px] bg-border" />
          </span>
        )
      })}
    </>
  )
}
