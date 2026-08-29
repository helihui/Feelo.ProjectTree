"use server"

import { db, pool } from "@/lib/db"
import { members, projects, nodes, nodeComments, invitations } from "@/lib/db/schema"
import type { NodeRow, MemberRow, NodeCommentRow } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import type { Project, TreeNode, NodeStatus, NodeType, Priority, User, Comment } from "@/lib/types"
import { assertPermission, getCurrentMember } from "@/lib/session"
import { canEditNode, toRoleKey, type RoleKey } from "@/lib/permissions"
import { MEMBERS_TAG, PROJECTS_TAG, projectTag } from "@/lib/cache-tags"
import { and, asc, count, eq, inArray, isNull, gt } from "drizzle-orm"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"

export type DatabaseTableInfo = {
  schema: string
  name: string
  type: "BASE TABLE" | "VIEW"
}

export async function getDatabaseTables(input?: {
  schema?: string
  includeViews?: boolean
  includeSystemSchemas?: boolean
}): Promise<DatabaseTableInfo[]> {
  const includeViews = input?.includeViews ?? false
  const includeSystemSchemas = input?.includeSystemSchemas ?? false

  const allowedTypes = includeViews ? ["BASE TABLE", "VIEW"] : ["BASE TABLE"]

  const where: string[] = [`table_type = ANY($1::text[])`]
  const params: unknown[] = [allowedTypes]

  if (input?.schema) {
    params.push(input.schema)
    where.push(`table_schema = $${params.length}`)
  } else if (!includeSystemSchemas) {
    where.push(`table_schema NOT IN ('pg_catalog','information_schema')`)
  }

  const sql = `
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE ${where.join(" AND ")}
    ORDER BY table_schema, table_name
  `

  const res = await pool.query<{
    table_schema: string
    table_name: string
    table_type: "BASE TABLE" | "VIEW"
  }>(sql, params)

  return res.rows.map((r) => ({
    schema: r.table_schema,
    name: r.table_name,
    type: r.table_type,
  }))
}

function rowToComment(row: NodeCommentRow): Comment {
  return {
    id: row.id,
    authorId: row.authorId,
    content: row.content,
    createdAt: row.createdAt.toISOString().slice(0, 10),
  }
}

function rowToTreeNode(
  row: NodeRow,
  byParent: Map<string | null, NodeRow[]>,
  commentsByNode: Map<string, Comment[]>,
): TreeNode {
  const children = (byParent.get(row.id) ?? []).map((c) => rowToTreeNode(c, byParent, commentsByNode))
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
    comments: commentsByNode.get(row.id) ?? [],
    aiGenerated: row.aiGenerated,
    children,
  }
}

export async function getMembers(): Promise<User[]> {
  const loadMembers = unstable_cache(
    async (): Promise<User[]> => {
      await ensureSeeded()
      const rows = await db.select().from(members).orderBy(asc(members.createdAt))
      return rows.map((m: MemberRow) => ({
        id: m.id,
        name: m.name,
        initials: m.initials,
        color: m.color,
      }))
    },
    ["members:list"],
    { tags: [MEMBERS_TAG] },
  )

  return loadMembers()
}

export async function getMembersFull() {
  const loadMembersFull = unstable_cache(
    async () => {
      await ensureSeeded()
      const rows = await db.select().from(members).orderBy(asc(members.createdAt))
      // 只取仍然有效的邀请，避免全表扫描
      const invites = await db
        .select({ memberId: invitations.memberId, token: invitations.token })
        .from(invitations)
        .where(and(isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
      const pendingByMember = new Map(invites.map((i) => [i.memberId, i.token] as const))
      return rows.map((m) => ({
        ...m,
        hasAccount: !!m.userId,
        pendingInviteToken: pendingByMember.get(m.id) ?? null,
      }))
    },
    ["members:full"],
    { tags: [MEMBERS_TAG] },
  )

  return loadMembersFull()
}

export async function getProjectSummaries() {
  const loadProjectSummaries = unstable_cache(
    async () => {
      await ensureSeeded()
      return db.select().from(projects).orderBy(asc(projects.createdAt))
    },
    ["projects:summaries"],
    { tags: [PROJECTS_TAG] },
  )

  return loadProjectSummaries()
}

export async function getProject(projectId: string): Promise<Project | null> {
  const loadProject = unstable_cache(
    async (): Promise<Project | null> => {
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

      const nodeIds = allNodes.map((n) => n.id)
      const commentsByNode = new Map<string, Comment[]>()
      if (nodeIds.length) {
        const allComments = await db
          .select()
          .from(nodeComments)
          .where(eq(nodeComments.projectId, projectId))
          .orderBy(asc(nodeComments.createdAt))
        for (const c of allComments) {
          if (!commentsByNode.has(c.nodeId)) commentsByNode.set(c.nodeId, [])
          commentsByNode.get(c.nodeId)!.push(rowToComment(c))
        }
      }

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        ownerId: p.ownerId ?? "",
        memberIds: (p.memberIds ?? []) as string[],
        createdAt: p.createdAt.toISOString().slice(0, 10),
        updatedAt: p.updatedAt.toISOString().slice(0, 10),
        root: rowToTreeNode(rootRow, byParent, commentsByNode),
      }
    },
    ["project:detail", projectId],
    { tags: [projectTag(projectId)] },
  )

  return loadProject()
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

/** 校验当前用户能否编辑指定节点，返回当前成员 */
async function assertNodeEditable(nodeId: string) {
  const member = await getCurrentMember()
  if (!member) throw new Error("请先登录")
  const [row] = await db
    .select({ assigneeIds: nodes.assigneeIds })
    .from(nodes)
    .where(eq(nodes.id, nodeId))
  const assigneeIds = (row?.assigneeIds ?? []) as string[]
  if (!canEditNode(member.roleKey, assigneeIds, member.memberId)) {
    throw new Error("没有操作权限")
  }
  return member
}

export async function updateNode(projectId: string, nodeId: string, patch: NodePatch) {
  const member = await assertNodeEditable(nodeId)
  // 普通成员仅能改自己负责节点的状态与进度
  const allowed: NodePatch =
    member.roleKey === "admin" || member.roleKey === "manager"
      ? patch
      : { status: patch.status, progress: patch.progress }
  const set = Object.fromEntries(
    Object.entries(allowed).filter(([, v]) => v !== undefined),
  )
  if (Object.keys(set).length === 0) return
  await db.update(nodes).set(set).where(eq(nodes.id, nodeId))
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  // 客户端已做乐观更新，只失效缓存标签即可，无需 revalidatePath 触发整页重渲染
  revalidateTag(projectTag(projectId), "max")
  revalidateTag(PROJECTS_TAG, "max")
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
  await assertPermission("node:manage")
  const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const [{ value: siblingCount }] = await db
    .select({ value: count() })
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
    sortOrder: siblingCount,
  })
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  revalidateTag(projectTag(projectId), "max")
  revalidateTag(PROJECTS_TAG, "max")
  return id
}

export async function deleteNode(projectId: string, nodeId: string) {
  await assertPermission("node:manage")
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
  // 批量删除，避免逐条往返
  await db.delete(nodes).where(inArray(nodes.id, toDelete))
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  revalidateTag(projectTag(projectId), "max")
  revalidateTag(PROJECTS_TAG, "max")
}

// ---- 节点评论 ----

export async function addNodeComment(
  projectId: string,
  nodeId: string,
  input: { content: string },
) {
  const member = await assertPermission("comment:write")
  const text = input.content.trim()
  if (!text) return null
  const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  await db.insert(nodeComments).values({
    id,
    nodeId,
    projectId,
    authorId: member.memberId,
    content: text,
  })
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
  revalidateTag(projectTag(projectId), "max")
  return {
    id,
    authorId: member.memberId,
    content: text,
    createdAt: new Date().toISOString().slice(0, 10),
  } as Comment
}

export async function deleteNodeComment(
  projectId: string,
  nodeId: string,
  commentId: string,
) {
  const member = await getCurrentMember()
  if (!member) throw new Error("请先登录")
  const [row] = await db
    .select({ authorId: nodeComments.authorId })
    .from(nodeComments)
    .where(eq(nodeComments.id, commentId))
  const isOwn = row?.authorId === member.memberId
  if (!isOwn && member.roleKey !== "admin" && member.roleKey !== "manager") {
    throw new Error("没有操作权限")
  }
  await db.delete(nodeComments).where(eq(nodeComments.id, commentId))
  revalidateTag(projectTag(projectId), "max")
  void nodeId
}

// ---- 人员管理 ----

export async function createMember(input: {
  name: string
  email?: string
  role?: string
  roleKey?: RoleKey
  color?: string
}) {
  await assertPermission("member:manage")
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
    roleKey: toRoleKey(input.roleKey),
  })
  revalidateTag(MEMBERS_TAG, "max")
  revalidatePath("/members")
  return id
}

export async function updateMember(
  id: string,
  patch: { name?: string; email?: string | null; role?: string; roleKey?: RoleKey },
) {
  const operator = await assertPermission("member:manage")
  const set: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    set.name = patch.name.trim()
    set.initials = patch.name.trim().slice(0, 2).toUpperCase()
  }
  if (patch.email !== undefined) set.email = patch.email?.trim() || null
  if (patch.role !== undefined) set.role = patch.role.trim() || "成员"
  if (patch.roleKey !== undefined) {
    // 不允许把自己降级，避免系统失去管理员
    if (id === operator.memberId && patch.roleKey !== "admin") {
      throw new Error("不能修改自己的角色")
    }
    set.roleKey = toRoleKey(patch.roleKey)
  }
  await db.update(members).set(set).where(eq(members.id, id))
  revalidateTag(MEMBERS_TAG, "max")
  revalidatePath("/members")
}

export async function deleteMember(id: string) {
  const operator = await assertPermission("member:manage")
  if (id === operator.memberId) throw new Error("不能删除自己")
  await db.delete(members).where(eq(members.id, id))
  await db.delete(invitations).where(eq(invitations.memberId, id))
  revalidateTag(MEMBERS_TAG, "max")
  revalidatePath("/members")
}

// ---- 邀请链接 ----

const INVITE_TTL_DAYS = 7

/** 为成员生成一次性邀请链接，成员凭链接自行注册并设置密码 */
export async function createInvitation(memberId: string) {
  await assertPermission("member:manage")
  const [member] = await db.select().from(members).where(eq(members.id, memberId))
  if (!member) throw new Error("成员不存在")
  if (!member.email) throw new Error("请先为该成员填写邮箱")
  if (member.userId) throw new Error("该成员已开通登录账号")

  // 同一成员只保留最新一条邀请
  await db.delete(invitations).where(eq(invitations.memberId, memberId))

  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random()
    .toString(36)
    .slice(2, 12)}`
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(invitations).values({
    token,
    memberId,
    email: member.email,
    roleKey: toRoleKey(member.roleKey),
    expiresAt,
  })
  revalidateTag(MEMBERS_TAG, "max")
  revalidatePath("/members")
  return { token, expiresAt: expiresAt.toISOString().slice(0, 10) }
}

