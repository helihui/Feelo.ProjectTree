"use client"

import { useState } from "react"
import type { NodeStatus, TreeNode } from "@/lib/types"
import type { StatusFilter } from "./project-view"
import { TreeNodeRow } from "./tree-node-row"
import { flattenNodes } from "@/lib/tree-utils"

export function TreeCanvas({
  root,
  selectedId,
  onSelect,
  statusFilter,
  matchedIds,
  onStatusChange,
}: {
  root: TreeNode
  selectedId: string | null
  onSelect: (id: string) => void
  statusFilter: StatusFilter
  matchedIds: Set<string> | null
  onStatusChange: (id: string, status: NodeStatus) => void
}) {
  // 默认展开前两层
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const set = new Set<string>()
    const walk = (node: TreeNode, depth: number) => {
      if (depth >= 2 && node.children.length > 0) set.add(node.id)
      node.children.forEach((c) => walk(c, depth + 1))
    }
    walk(root, 0)
    return set
  })

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 当某节点的子孙匹配筛选/搜索时，该节点也需可见
  const visibleByDescendant = (node: TreeNode): boolean => {
    if (nodeMatches(node)) return true
    return node.children.some(visibleByDescendant)
  }

  function nodeMatches(node: TreeNode): boolean {
    const statusOk = statusFilter === "all" || node.status === statusFilter
    const searchOk = !matchedIds || matchedIds.has(node.id)
    return statusOk && searchOk
  }

  return (
    <div className="min-w-fit px-4 pb-5 pt-14 sm:px-6">
      <TreeNodeRow
        node={root}
        depth={0}
        isLast
        ancestorsLast={[]}
        collapsed={collapsed}
        onToggle={toggle}
        selectedId={selectedId}
        onSelect={onSelect}
        onStatusChange={onStatusChange}
        matchedIds={matchedIds}
        isVisible={visibleByDescendant}
        isMatch={nodeMatches}
      />
    </div>
  )
}
