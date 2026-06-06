"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { NodeStatus, Project, TreeNode } from "@/lib/types"
import { findNode, flattenNodes } from "@/lib/tree-utils"
import { TreeToolbar } from "./tree-toolbar"
import { TreeCanvas } from "./tree-canvas"
import { NodeDetailPanel } from "./node-detail-panel"
import { ProjectSummaryBar } from "./project-summary-bar"
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type StatusFilter = NodeStatus | "all"

/** 不可变更新某节点的部分字段 */
function updateNode(
  node: TreeNode,
  id: string,
  patch: Partial<TreeNode>,
): TreeNode {
  if (node.id === id) return { ...node, ...patch }
  if (node.children.length === 0) return node
  return { ...node, children: node.children.map((c) => updateNode(c, id, patch)) }
}

export function ProjectView({ project: initial }: { project: Project }) {
  const searchParams = useSearchParams()
  const initialNode = searchParams.get("node")

  const [root, setRoot] = useState<TreeNode>(initial.root)
  const [selectedId, setSelectedId] = useState<string | null>(initialNode)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [expanded, setExpanded] = useState(false)

  // 全屏放大时按 Esc 还原
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [expanded])

  const selectedNode = useMemo(
    () => (selectedId ? findNode(root, selectedId) : null),
    [root, selectedId],
  )

  const handleStatusChange = useCallback((id: string, status: NodeStatus) => {
    setRoot((prev) =>
      updateNode(prev, id, {
        status,
        progress: status === "done" ? 100 : status === "todo" ? 0 : undefined,
      } as Partial<TreeNode>),
    )
  }, [])

  const handleProgressChange = useCallback((id: string, progress: number) => {
    setRoot((prev) =>
      updateNode(prev, id, {
        progress,
        status: progress === 100 ? "done" : progress === 0 ? "todo" : "progress",
      }),
    )
  }, [])

  const handleUpdateNode = useCallback((id: string, patch: Partial<TreeNode>) => {
    setRoot((prev) => updateNode(prev, id, patch))
  }, [])

  // 搜索时高亮匹配的节点 id 集合
  const matchedIds = useMemo(() => {
    if (!query.trim()) return null
    const q = query.trim().toLowerCase()
    return new Set(
      flattenNodes(root)
        .filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.description.toLowerCase().includes(q),
        )
        .map((n) => n.id),
    )
  }, [root, query])

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        expanded && "fixed inset-0 z-50 bg-background",
      )}
    >
      {!expanded && (
        <header className="flex flex-col gap-3 border-b border-border px-6 py-4">
          <Link
            href="/projects"
            className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回项目列表
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{initial.name}</h1>
            <p className="text-pretty text-sm text-muted-foreground">
              {initial.description}
            </p>
          </div>
          <ProjectSummaryBar root={root} project={initial} />
        </header>
      )}

      <TreeToolbar
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-auto bg-muted/30">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "还原节点视图" : "放大节点视图"}
            title={expanded ? "还原 (Esc)" : "放大查看全部节点"}
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
          >
            {expanded ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                还原
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                放大
              </>
            )}
          </button>
          <TreeCanvas
            root={root}
            selectedId={selectedId}
            onSelect={setSelectedId}
            statusFilter={statusFilter}
            matchedIds={matchedIds}
            onStatusChange={handleStatusChange}
          />
        </div>

        {selectedNode && (
          <NodeDetailPanel
            key={selectedNode.id}
            node={selectedNode}
            project={initial}
            onClose={() => setSelectedId(null)}
            onStatusChange={handleStatusChange}
            onProgressChange={handleProgressChange}
            onUpdate={handleUpdateNode}
          />
        )}
      </div>
    </div>
  )
}
