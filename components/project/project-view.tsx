"use client"

import { useState, useMemo, useCallback, useEffect, useRef, useTransition } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { NodeStatus, Project, TreeNode, User } from "@/lib/types"
import { findNode, flattenNodes } from "@/lib/tree-utils"
import { canEditNode, hasPermission, type RoleKey } from "@/lib/permissions"
import { TreeToolbar } from "./tree-toolbar"
import { TreeCanvas } from "./tree-canvas"
import { MindMapCanvas } from "./mind-map-canvas"
import { NodeDetailPanel } from "./node-detail-panel"
import { ProjectSummaryBar } from "./project-summary-bar"
import { AddNodeDialog } from "./add-node-dialog"
import {
  updateNode as updateNodeAction,
  addNode as addNodeAction,
  deleteNode as deleteNodeAction,
  addNodeComment as addNodeCommentAction,
  type NodePatch,
} from "@/app/actions/projects"
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type StatusFilter = NodeStatus | "all"
export type ViewMode = "tree" | "mindmap"
export type MindMapMode = "compact" | "standard" | "detail"

/** 不可变更新某节点的部分字段 */
function patchTree(node: TreeNode, id: string, patch: Partial<TreeNode>): TreeNode {
  if (node.id === id) return { ...node, ...patch }
  if (node.children.length === 0) return node
  return { ...node, children: node.children.map((c) => patchTree(c, id, patch)) }
}

/** 不可变插入子节点 */
function insertChild(node: TreeNode, parentId: string, child: TreeNode): TreeNode {
  if (node.id === parentId) return { ...node, children: [...node.children, child] }
  if (node.children.length === 0) return node
  return { ...node, children: node.children.map((c) => insertChild(c, parentId, child)) }
}

/** 不可变删除节点 */
function removeNode(node: TreeNode, id: string): TreeNode {
  return {
    ...node,
    children: node.children
      .filter((c) => c.id !== id)
      .map((c) => removeNode(c, id)),
  }
}

export function ProjectView({
  project: initial,
  members,
  currentMemberId,
  roleKey,
}: {
  project: Project
  members: User[]
  currentMemberId: string
  roleKey: RoleKey
}) {
  const searchParams = useSearchParams()
  const initialNode = searchParams.get("node")
  const canManageNodes = hasPermission(roleKey, "node:manage")
  const canComment = hasPermission(roleKey, "comment:write")
  // 管理员可调整任意项目的成员，项目经理只能调整自己创建的项目
  const canManageMembers =
    roleKey === "admin" || (roleKey === "manager" && initial.ownerId === currentMemberId)

  const [root, setRoot] = useState<TreeNode>(initial.root)
  const [selectedId, setSelectedId] = useState<string | null>(initialNode)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("tree")
  const [mindMapMode, setMindMapMode] = useState<MindMapMode>("standard")
  const [expanded, setExpanded] = useState(false)
  const [addParent, setAddParent] = useState<TreeNode | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TreeNode | null>(null)
  const [, startTransition] = useTransition()

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

  // 项目内已有标签的并集，供标签选择器复用
  const allTags = useMemo(() => {
    const set = new Set<string>()
    flattenNodes(root).forEach((n) => n.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [root])

  const persist = useCallback(
    (nodeId: string, patch: NodePatch) => {
      startTransition(async () => {
        try {
          await updateNodeAction(initial.id, nodeId, patch)
        } catch {
          toast.error("保存失败，请重试")
        }
      })
    },
    [initial.id],
  )

  // 按节点合并短时间内的连续改动（拖动进度条、连续输入），避免每次微调都打一次接口
  const pendingPatches = useRef(new Map<string, NodePatch>())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPatches = useCallback(() => {
    flushTimer.current = null
    const entries = Array.from(pendingPatches.current.entries())
    pendingPatches.current.clear()
    for (const [nodeId, patch] of entries) persist(nodeId, patch)
  }, [persist])

  const persistDebounced = useCallback(
    (nodeId: string, patch: NodePatch) => {
      const merged = { ...(pendingPatches.current.get(nodeId) ?? {}), ...patch }
      pendingPatches.current.set(nodeId, merged)
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(flushPatches, 400)
    },
    [flushPatches],
  )

  // 卸载前把未提交的改动落库
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
  }, [])

  const handleStatusChange = useCallback(
    (id: string, status: NodeStatus) => {
      const progress = status === "done" ? 100 : status === "todo" ? 0 : undefined
      setRoot((prev) =>
        patchTree(prev, id, { status, ...(progress !== undefined ? { progress } : {}) }),
      )
      persistDebounced(id, { status, ...(progress !== undefined ? { progress } : {}) })
    },
    [persistDebounced],
  )

  const handleProgressChange = useCallback(
    (id: string, progress: number) => {
      const status: NodeStatus =
        progress === 100 ? "done" : progress === 0 ? "todo" : "progress"
      setRoot((prev) => patchTree(prev, id, { progress, status }))
      persistDebounced(id, { progress, status })
    },
    [persistDebounced],
  )

  const handleUpdateNode = useCallback(
    (id: string, patch: Partial<TreeNode>) => {
      setRoot((prev) => patchTree(prev, id, patch))
      const { comments, children, id: _omit, type, aiGenerated, ...rest } = patch as any
      void comments
      void children
      void type
      void aiGenerated
      void _omit
      persistDebounced(id, rest as NodePatch)
    },
    [persistDebounced],
  )

  const handleAddComment = useCallback(
    async (nodeId: string, content: string) => {
      try {
        const created = await addNodeCommentAction(initial.id, nodeId, { content })
        if (!created) return
        setRoot((prev) =>
          patchTree(prev, nodeId, { comments: [...findNode(prev, nodeId)!.comments, created] }),
        )
      } catch {
        toast.error("评论保存失败，请重试")
      }
    },
    [initial.id],
  )

  const handleAddNode = useCallback(
    async (
      parentId: string,
      input: {
        title: string
        description?: string
        type?: TreeNode["type"]
        priority?: TreeNode["priority"]
        assigneeIds?: string[]
        startDate?: string | null
        dueDate?: string | null
        estimateHours?: number
        tags?: string[]
      },
    ) => {
      try {
        const id = await addNodeAction(initial.id, parentId, input)
        const newNode: TreeNode = {
          id,
          title: input.title,
          description: input.description ?? "",
          type: input.type ?? "task",
          status: "todo",
          priority: input.priority ?? "medium",
          progress: 0,
          assigneeIds: input.assigneeIds ?? [],
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
          estimateHours: input.estimateHours ?? 0,
          tags: input.tags ?? [],
          comments: [],
          aiGenerated: false,
          children: [],
        }
        setRoot((prev) => insertChild(prev, parentId, newNode))
        setSelectedId(id)
        toast.success("已添加节点")
      } catch {
        toast.error("添加失败，请重试")
      }
    },
    [initial.id],
  )

  // 请求新增子节点：无权限时拦截
  const requestAddChild = useCallback(
    (node: TreeNode) => {
      if (!canManageNodes) {
        toast.error("没有操作权限")
        return
      }
      setAddParent(node)
    },
    [canManageNodes],
  )

  // 请求删除：先弹确认框
  const requestDeleteNode = useCallback(
    (id: string) => {
      if (!canManageNodes) {
        toast.error("没有操作权限")
        return
      }
      if (id === root.id) {
        toast.error("根节点不可删除")
        return
      }
      const node = findNode(root, id)
      if (node) setPendingDelete(node)
    },
    [root, canManageNodes],
  )

  // 确认后真正执行删除
  const handleDeleteNode = useCallback(
    (id: string) => {
      if (id === root.id) {
        toast.error("根节点不可删除")
        return
      }
      setRoot((prev) => removeNode(prev, id))
      if (selectedId === id) setSelectedId(null)
      startTransition(async () => {
        try {
          await deleteNodeAction(initial.id, id)
          toast.success("已删除节点")
        } catch {
          toast.error("删除失败，请刷新重试")
        }
      })
    },
    [initial.id, root.id, selectedId],
  )

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
          <ProjectSummaryBar
            root={root}
            project={initial}
            members={members}
            canManageMembers={canManageMembers}
          />
        </header>
      )}

      <TreeToolbar
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        mindMapMode={mindMapMode}
        onMindMapModeChange={setMindMapMode}
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
          {viewMode === "tree" ? (
            <TreeCanvas
              root={root}
              selectedId={selectedId}
              onSelect={setSelectedId}
              statusFilter={statusFilter}
              matchedIds={matchedIds}
              onStatusChange={handleStatusChange}
              onAddChild={requestAddChild}
              onDelete={requestDeleteNode}
              members={members}
            />
          ) : (
            <MindMapCanvas
              root={root}
              selectedId={selectedId}
              onSelect={setSelectedId}
              statusFilter={statusFilter}
              matchedIds={matchedIds}
              mode={mindMapMode}
              onAddChild={requestAddChild}
              members={members}
            />
          )}
        </div>

        {selectedNode && (
          <NodeDetailPanel
            key={selectedNode.id}
            node={selectedNode}
            project={initial}
            members={members}
            allTags={allTags}
            onClose={() => setSelectedId(null)}
            onStatusChange={handleStatusChange}
            onProgressChange={handleProgressChange}
            onUpdate={handleUpdateNode}
            onAddComment={handleAddComment}
            onAddChild={() => requestAddChild(selectedNode)}
            onDelete={() => requestDeleteNode(selectedNode.id)}
            canManageNodes={canManageNodes}
            canComment={canComment}
            canEdit={canEditNode(roleKey, selectedNode.assigneeIds, currentMemberId)}
          />
        )}
      </div>

      <AddNodeDialog
        open={!!addParent}
        parent={addParent}
        members={members}
        allTags={allTags}
        onOpenChange={(o) => !o && setAddParent(null)}
        onSubmit={async (input) => {
          if (addParent) await handleAddNode(addParent.id, input)
          setAddParent(null)
        }}
      />

      {/* 删除节点确认 */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除节点</DialogTitle>
            <DialogDescription>
              确定删除「{pendingDelete?.title}」吗？
              {pendingDelete && pendingDelete.children.length > 0
                ? ` 该节点下的 ${pendingDelete.children.length} 个子节点也会被一并删除。`
                : ""}
              {" "}该操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) handleDeleteNode(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
