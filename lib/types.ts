export type NodeStatus = "todo" | "progress" | "done" | "blocked" | "paused"

export type NodeType =
  | "root"
  | "milestone"
  | "phase"
  | "epic"
  | "module"
  | "task"
  | "subtask"

export type Priority = "low" | "medium" | "high" | "urgent"

export interface User {
  id: string
  name: string
  initials: string
  color: string
}

export interface Comment {
  id: string
  authorId: string
  content: string
  createdAt: string
}

export interface TreeNode {
  id: string
  title: string
  description: string
  type: NodeType
  status: NodeStatus
  priority: Priority
  progress: number // 0-100, 仅叶子节点手动设置，父节点自动汇总
  assigneeIds: string[]
  startDate: string | null
  dueDate: string | null
  estimateHours: number
  tags: string[]
  comments: Comment[]
  aiGenerated: boolean
  children: TreeNode[]
}

export interface Project {
  id: string
  name: string
  description: string
  ownerId: string
  memberIds: string[]
  createdAt: string
  updatedAt: string
  root: TreeNode
}

export interface PromptTemplate {
  id: string
  name: string
  scene: string
  description: string
  content: string
  enabled: boolean
  variables: string[]
  updatedAt: string
}

export interface AIModel {
  id: string
  provider: string
  name: string
  model: string
  enabled: boolean
  isDefault: boolean
  isFallback: boolean
  contextWindow: string
  costPer1k: string
  latency: "low" | "medium" | "high"
  capabilities: string[]
}

export interface ModelProvider {
  id: string
  name: string
  enabled: boolean
  isDefault: boolean
  isFallback?: boolean
  models: string[]
  selectedModel: string
  latencyMs: number
  successRate: number
  monthlyCalls: number
}

export interface ActivityItem {
  id: string
  userId: string
  action: string
  target: string
  projectId: string
  createdAt: string
}
