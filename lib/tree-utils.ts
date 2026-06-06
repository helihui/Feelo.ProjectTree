import type { NodeStatus, NodeType, Priority, TreeNode, User } from "./types"

/** 从成员列表解析用户，未找到时返回占位用户 */
export function resolveUser(members: User[], id: string): User {
  return (
    members.find((u) => u.id === id) ?? {
      id,
      name: "未知成员",
      initials: "?",
      color: "oklch(0.6 0.02 260)",
    }
  )
}

export const STATUS_META: Record<
  NodeStatus,
  { label: string; bg: string; fg: string; dot: string }
> = {
  todo: {
    label: "未开始",
    bg: "bg-status-todo",
    fg: "text-status-todo-foreground",
    dot: "bg-status-todo-foreground",
  },
  progress: {
    label: "进行中",
    bg: "bg-status-progress",
    fg: "text-status-progress-foreground",
    dot: "bg-status-progress-foreground",
  },
  done: {
    label: "已完成",
    bg: "bg-status-done",
    fg: "text-status-done-foreground",
    dot: "bg-status-done-foreground",
  },
  blocked: {
    label: "阻塞",
    bg: "bg-status-blocked",
    fg: "text-status-blocked-foreground",
    dot: "bg-status-blocked-foreground",
  },
  paused: {
    label: "已暂停",
    bg: "bg-status-paused",
    fg: "text-status-paused-foreground",
    dot: "bg-status-paused-foreground",
  },
}

export const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  low: { label: "低", className: "text-muted-foreground" },
  medium: { label: "中", className: "text-chart-2" },
  high: { label: "高", className: "text-chart-4" },
  urgent: { label: "紧急", className: "text-destructive" },
}

export const NODE_TYPE_META: Record<NodeType, { label: string }> = {
  root: { label: "项目" },
  milestone: { label: "里程碑" },
  phase: { label: "阶段" },
  epic: { label: "大型任务" },
  module: { label: "模块" },
  task: { label: "任务" },
  subtask: { label: "子任务" },
}

/** 递归收集所有节点 */
export function flattenNodes(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flattenNodes)]
}

/** 计算节点进度：叶子用自身 progress，父节点按叶子加权平均 */
export function computeProgress(node: TreeNode): number {
  if (node.children.length === 0) {
    return node.status === "done" ? 100 : node.progress
  }
  const leaves = flattenNodes(node).filter((n) => n.children.length === 0)
  if (leaves.length === 0) return node.progress
  const total = leaves.reduce(
    (sum, n) => sum + (n.status === "done" ? 100 : n.progress),
    0,
  )
  return Math.round(total / leaves.length)
}

export interface NodeStats {
  total: number
  done: number
  progress: number
  blocked: number
  todo: number
  paused: number
  leaves: number
}

export function computeStats(node: TreeNode): NodeStats {
  const all = flattenNodes(node).filter((n) => n.id !== node.id)
  return {
    total: all.length,
    done: all.filter((n) => n.status === "done").length,
    progress: all.filter((n) => n.status === "progress").length,
    blocked: all.filter((n) => n.status === "blocked").length,
    todo: all.filter((n) => n.status === "todo").length,
    paused: all.filter((n) => n.status === "paused").length,
    leaves: all.filter((n) => n.children.length === 0).length,
  }
}

export function findNode(node: TreeNode, id: string): TreeNode | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

export function formatDate(date: string | null): string {
  if (!date) return "—"
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null
  const d = new Date(date)
  const now = new Date()
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}
