"use client"

import { useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { NodeStatus, Project, TreeNode } from "@/lib/types"
import { findNode, flattenNodes } from "@/lib/tree-utils"
import { TreeToolbar } from "./tree-toolbar"
import { TreeCanvas } from "./tree-canvas"
import { NodeDetailPanel } from "./node-detail-panel"
import { ProjectSummaryBar } from "./project-summary-bar"
import { ArrowLeft } from "lucide-react"

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
    <div className="flex h-full min-h-0 flex-col">
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

      <TreeToolbar
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto bg-muted/30">
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
