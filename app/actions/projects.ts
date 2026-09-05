"use server"

import { db, pool } from "@/lib/db"
import { members, projects, invitations } from "@/lib/db/schema"
import type { MemberRow } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import type { Project, TreeNode, NodeType, Priority, User } from "@/lib/types"
import { assertPermission, getCurrentMember } from "@/lib/session"
import { toRoleKey, type RoleKey } from "@/lib/permissions"
import { MEMBERS_TAG, PROJECTS_TAG } from "@/lib/cache-tags"
import { and, asc, eq, isNull, gt } from "drizzle-orm"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import type { Actor } from "@/lib/core/actor"
import {
  addCommentCore,
  addNodeCore,
  createProjectCore,
  deleteCommentCore,
  deleteNodeCore,
  deleteProjectCore,
  getProjectDetail,
  updateNodeCore,
  updateProjectMembersCore,
  type NodePatchInput,
  type TreeInput,
} from "@/lib/core/projects"

/** 网页会话的 Actor：不额外收窄权限范围 */
async function currentActor(): Promise<Actor> {
  const member = await getCurrentMember()
  if (!member) throw new Error("请先登录")
  return { memberId: member.memberId, roleKey: member.roleKey, scopes: null }
}

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
  // 库表结构属于敏感信息，仅管理员可读
  const member = await getCurrentMember()
  if (!member) throw new Error("请先登录")
  if (member.roleKey !== "admin") throw new Error("没有操作权限")

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
  return getProjectDetail(projectId)
}

// ---- 节点增删改 ----

export type NodePatch = NodePatchInput

export async function updateNode(projectId: string, nodeId: string, patch: NodePatch) {
  // 前端可能传来全 undefined 的 patch，直接短路，避免核心层抛错
  if (Object.values(patch).every((v) => v === undefined)) return
  const actor = await currentActor()
  await updateNodeCore(actor, projectId, nodeId, patch)
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
  const actor = await currentActor()
  return addNodeCore(actor, projectId, parentId, input)
}

export async function deleteNode(projectId: string, nodeId: string) {
  const actor = await currentActor()
  await deleteNodeCore(actor, projectId, nodeId)
}

// ---- 项目增删 ----

export async function createProject(input: {
  name: string
  description?: string
  tree: TreeNode
}) {
  const actor = await currentActor()
  const { projectId } = await createProjectCore(actor, {
    name: input.name,
    description: input.description,
    tree: input.tree as TreeInput,
  })
  revalidatePath("/")
  revalidatePath("/projects")
  return projectId
}

export async function deleteProject(projectId: string) {
  const actor = await currentActor()
  await deleteProjectCore(actor, projectId)
  revalidatePath("/")
  revalidatePath("/projects")
}

/** 更新项目参与成员。管理员可改任意项目，项目经理只能改自己创建的 */
export async function updateProjectMembers(projectId: string, memberIds: string[]) {
  const actor = await currentActor()
  const next = await updateProjectMembersCore(actor, projectId, memberIds)
  revalidatePath("/")
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
  return next
}

// ---- 节点评论 ----

export async function addNodeComment(
  projectId: string,
  nodeId: string,
  input: { content: string },
) {
  const actor = await currentActor()
  if (!input.content.trim()) return null
  return addCommentCore(actor, projectId, nodeId, input.content)
}

export async function deleteNodeComment(
  projectId: string,
  nodeId: string,
  commentId: string,
) {
  const actor = await currentActor()
  await deleteCommentCore(actor, projectId, commentId)
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
