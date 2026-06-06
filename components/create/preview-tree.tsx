"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { TreeNode } from "@/lib/types"
import { computeStats, flattenNodes } from "@/lib/tree-utils"
import { ChevronDown, ChevronRight, RefreshCw, Check, ArrowLeft, Layers, ListTree } from "lucide-react"
import { cn } from "@/lib/utils"

const TYPE_LABEL: Record<TreeNode["type"], string> = {
  root: "项目",
  phase: "阶段",
  module: "模块",
  task: "任务",
  subtask: "子任务",
}

function PreviewNode({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            aria-label={open ? "收起" : "展开"}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-5 w-5" />
        )}
        <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
          {TYPE_LABEL[node.type]}
        </Badge>
        <span className="truncate text-sm">{node.title}</span>
        {node.estimateHours ? (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {node.estimateHours}h
          </span>
        ) : null}
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((c) => (
            <PreviewNode key={c.id} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function PreviewTree({
  tree,
  onBack,
  onRegenerate,
  onConfirm,
}: {
  tree: TreeNode
  onBack: () => void
  onRegenerate: () => void
  onConfirm: () => void
}) {
  const total = computeStats(tree).total
  const all = flattenNodes(tree)
  const totalHours = all.reduce((s, n) => s + (n.estimateHours ?? 0), 0)
  const phases = tree.children.length

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            修改需求
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            重新生成
          </Button>
          <Button size="sm" onClick={onConfirm} className="gap-1.5">
            <Check className="h-4 w-4" />
            确认并创建
          </Button>
        </div>
      </div>

      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{tree.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI 已生成下面的任务树，确认无误后即可创建项目。
        </p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            阶段
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{phases}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListTree className="h-3.5 w-3.5" />
            节点总数
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">预计工作量</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totalHours}h</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-2">
        <div className="max-h-[480px] overflow-auto">
          <PreviewNode node={tree} depth={0} />
        </div>
      </Card>
    </div>
  )
}
