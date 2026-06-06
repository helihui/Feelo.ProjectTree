"use server"

import { db } from "@/lib/db"
import { members, projects, nodes } from "@/lib/db/schema"
import type { NodeRow, MemberRow } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import type { Project, TreeNode, NodeStatus, NodeType, Priority, User } from "@/lib/types"
import { and, asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

function rowToTreeNode(row: NodeRow, byParent: Map<string | null, NodeRow[]>): TreeNode {
  const children = (byParent.get(row.id) ?? []).map((c) => rowToTreeNode(c, byParent))
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type as NodeType,
    status: row.status as NodeStatus,
    priority: row.priority as Priority,
    progress: row.progress,
    assigneeIds: (row.assigneeIds ?? []) as string[],
    startDate: row.startDate,
    dueDate: row.dueDate,
    estimateHours: row.estimateHours,
    tags: (row.tags ?? []) as string[],
    comments: [],
    aiGenerated: row.aiGenerated,
    children,
  }
}

export async function getMembers(): Promise<User[]> {
  await ensureSeeded()
  const rows = await db.select().from(members).orderBy(asc(members.createdAt))
  return rows.map((m: MemberRow) => ({
    id: m.id,
    name: m.name,
    initials: m.initials,
    color: m.color,
  }))
}

export async function getMembersFull() {
  await ensureSeeded()
  return db.select().from(members).orderBy(asc(members.createdAt))
}

export async function getProjectSummaries() {
  await ensureSeeded()
  return db.select().from(projects).orderBy(asc(projects.createdAt))
}

export async function getProject(projectId: string): Promise<Project | null> {
  await ensureSeeded()
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId))
  if (!p) return null

  const allNodes = await db
    .select()
    .from(nodes)
    .where(eq(nodes.projectId, projectId))
    .orderBy(asc(nodes.sortOrder), asc(nodes.createdAt))

  const byParent = new Map<string | null, NodeRow[]>()
  for (const n of allNodes) {
    const key = n.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(n)
  }
  const rootRow = (byParent.get(null) ?? [])[0]
  if (!rootRow) return null

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    ownerId: p.ownerId ?? "",
    memberIds: (p.memberIds ?? []) as string[],
    createdAt: p.createdAt.toISOString().slice(0, 10),
    updatedAt: p.updatedAt.toISOString().slice(0, 10),
    root: rowToTreeNode(rootRow, byParent),
  }
}

// ---- 节点增删改 ----

export interface NodePatch {
  title?: string
  description?: string
  status?: NodeStatus
  priority?: Priority
  progress?: number
  assigneeIds?: string[]
  startDate?: string | null
  dueDate?: string | null
  estimateHours?: number
  tags?: string[]
}

export async function updateNode(projectId: string, nodeId: string, patch: NodePatch) {
  await db.update(nodes).set(patch).where(eq(nodes.id, nodeId))
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  revalidatePath(`/projects/${projectId}`)
}

export async function addNode(
  projectId: string,
  parentId: string,
  input: {
    title: string
    description?: string
    type?: NodeType
    priority?: Priority
    assigneeIds?: string[]
    startDate?: string | null
    dueDate?: string | null
    estimateHours?: number
    tags?: string[]
  },
) {
  const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const siblings = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.projectId, projectId), eq(nodes.parentId, parentId)))
  await db.insert(nodes).values({
    id,
    projectId,
    parentId,
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
    aiGenerated: false,
    sortOrder: siblings.length,
  })
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  revalidatePath(`/projects/${projectId}`)
  return id
}

export async function deleteNode(projectId: string, nodeId: string) {
  // 递归收集子孙
  const all = await db
    .select({ id: nodes.id, parentId: nodes.parentId })
    .from(nodes)
    .where(eq(nodes.projectId, projectId))
  const childrenOf = new Map<string | null, string[]>()
  for (const n of all) {
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, [])
    childrenOf.get(n.parentId)!.push(n.id)
  }
  const toDelete: string[] = []
  const stack = [nodeId]
  while (stack.length) {
    const cur = stack.pop()!
    toDelete.push(cur)
    for (const c of childrenOf.get(cur) ?? []) stack.push(c)
  }
  for (const id of toDelete) {
    await db.delete(nodes).where(eq(nodes.id, id))
  }
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  revalidatePath(`/projects/${projectId}`)
}

// ---- 人员管理 ----

export async function createMember(input: {
  name: string
  email?: string
  role?: string
  color?: string
}) {
  const id = `u_${Date.now().toString(36)}`
  const initials =
    input.name.trim().slice(0, 2).toUpperCase() || input.name.trim().slice(0, 1).toUpperCase()
  const palette = [
    "oklch(0.52 0.18 258)",
    "oklch(0.6 0.13 195)",
    "oklch(0.65 0.15 145)",
    "oklch(0.7 0.15 70)",
    "oklch(0.6 0.2 25)",
  ]
  await db.insert(members).values({
    id,
    name: input.name.trim(),
    initials,
    color: input.color ?? palette[Math.floor(Math.random() * palette.length)],
    email: input.email?.trim() || null,
    role: input.role?.trim() || "成员",
  })
  revalidatePath("/members")
  return id
}

export async function updateMember(
  id: string,
  patch: { name?: string; email?: string | null; role?: string },
) {
  const set: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    set.name = patch.name.trim()
    set.initials = patch.name.trim().slice(0, 2).toUpperCase()
  }
  if (patch.email !== undefined) set.email = patch.email?.trim() || null
  if (patch.role !== undefined) set.role = patch.role.trim() || "成员"
  await db.update(members).set(set).where(eq(members.id, id))
  revalidatePath("/members")
}

export async function deleteMember(id: string) {
  await db.delete(members).where(eq(members.id, id))
  revalidatePath("/members")
}
