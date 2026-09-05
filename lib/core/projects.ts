import { db } from "@/lib/db"
import { members, projects, nodes, nodeComments } from "@/lib/db/schema"
import type { NodeRow, NodeCommentRow } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import type {
  Project,
  TreeNode,
  NodeStatus,
  NodeType,
  Priority,
  Comment,
} from "@/lib/types"
import { MEMBERS_TAG, PROJECTS_TAG, projectTag } from "@/lib/cache-tags"
import { toRoleKey, type RoleKey } from "@/lib/permissions"
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { revalidateTag, unstable_cache } from "next/cache"
import { assertCan, can, canEditNodeAs, CoreError, type Actor } from "./actor"

/** 单次写入的树规模上限，防止一个请求打爆数据库 */
export const MAX_TREE_NODES = 500
export const MAX_TREE_DEPTH = 8

// ---- 内部工具 ----

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
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
  depth: number,
  maxDepth: number,
): TreeNode {
  const children =
    depth >= maxDepth
      ? []
      : (byParent.get(row.id) ?? []).map((c) =>
          rowToTreeNode(c, byParent, commentsByNode, depth + 1, maxDepth),
        )
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

/** 传入的树节点，除 title 外全部可选（MCP 客户端不必构造完整 TreeNode） */
export interface TreeInput {
  title: string
  description?: string
  type?: NodeType
  status?: NodeStatus
  priority?: Priority
  progress?: number
  assigneeIds?: string[]
  startDate?: string | null
  dueDate?: string | null
  estimateHours?: number
  tags?: string[]
  children?: TreeInput[]
}

/** 校验树规模与深度，返回节点总数 */
function measureTree(root: TreeInput): number {
  let total = 0
  const walk = (node: TreeInput, depth: number) => {
    if (depth > MAX_TREE_DEPTH) {
      throw new CoreError("too_large", `树深度超过上限 ${MAX_TREE_DEPTH} 层`)
    }
    total += 1
    if (total > MAX_TREE_NODES) {
      throw new CoreError("too_large", `节点总数超过上限 ${MAX_TREE_NODES} 个`)
    }
    if (!node.title?.trim()) {
      throw new CoreError("invalid_input", "节点 title 不能为空")
    }
    node.children?.forEach((c) => walk(c, depth + 1))
  }
  walk(root, 1)
  return total
}

/** 把树展平写入 nodes 表，返回 { rootId, count } */
async function insertTree(
  projectId: string,
  root: TreeInput,
  parentId: string | null,
  startOrder: number,
) {
  const rows: (typeof nodes.$inferInsert)[] = []
  let seq = 0
  let rootId = ""
  const walk = (node: TreeInput, parent: string | null, sortOrder: number) => {
    const id = `n_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`
    if (!rootId) rootId = id
    rows.push({
      id,
      projectId,
      parentId: parent,
      title: node.title.trim(),
      description: node.description ?? "",
      type: node.type ?? (parent === null ? "root" : "task"),
      status: node.status ?? "todo",
      priority: node.priority ?? "medium",
      progress: node.progress ?? 0,
      assigneeIds: node.assigneeIds ?? [],
      startDate: node.startDate ?? null,
      dueDate: node.dueDate ?? null,
      estimateHours: node.estimateHours ?? 0,
      tags: node.tags ?? [],
      aiGenerated: true,
      sortOrder,
    })
    node.children?.forEach((child, i) => walk(child, id, i))
  }
  walk(root, parentId, startOrder)
  // 一次批量插入，避免逐条往返
  await db.insert(nodes).values(rows)
  return { rootId, count: rows.length }
}

function bumpProject(projectId: string) {
  return db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId))
}

function invalidate(projectId?: string) {
  revalidateTag(PROJECTS_TAG, "max")
  if (projectId) revalidateTag(projectTag(projectId), "max")
}

/** 校验项目存在并返回 ownerId */
async function loadProjectOwner(projectId: string) {
  const [row] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!row) throw new CoreError("not_found", "项目不存在")
  return row.ownerId
}

/** 管理员可操作任意项目，项目经理只能操作自己创建的 */
function assertProjectOwnership(actor: Actor, ownerId: string | null) {
  const isOwner = ownerId === actor.memberId
  if (actor.roleKey === "admin") return
  if (actor.roleKey === "manager" && isOwner) return
  throw new CoreError("forbidden", "没有操作权限")
}

// ---- 读取 ----

export interface ProjectSummary {
  id: string
  name: string
  description: string
  ownerId: string | null
  memberIds: string[]
  nodeCount: number
  progress: number
  createdAt: string
  updatedAt: string
}

/** 项目摘要列表，按创建时间倒序 */
export async function listProjects(limit = 50, offset = 0): Promise<ProjectSummary[]> {
  const load = unstable_cache(
    async (): Promise<ProjectSummary[]> => {
      await ensureSeeded()
      const rows = await db.select().from(projects)
      const nodeRows = await db
        .select({ projectId: nodes.projectId, progress: nodes.progress, id: nodes.id })
        .from(nodes)
      const statsByProject = new Map<string, { total: number; sum: number }>()
      for (const n of nodeRows) {
        const cur = statsByProject.get(n.projectId) ?? { total: 0, sum: 0 }
        cur.total += 1
        cur.sum += n.progress
        statsByProject.set(n.projectId, cur)
      }
      return rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((p) => {
          const s = statsByProject.get(p.id) ?? { total: 0, sum: 0 }
          return {
            id: p.id,
            name: p.name,
            description: p.description,
            ownerId: p.ownerId,
            memberIds: (p.memberIds ?? []) as string[],
            nodeCount: s.total,
            progress: s.total ? Math.round(s.sum / s.total) : 0,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
          }
        })
    },
    ["core:projects:summary"],
    { tags: [PROJECTS_TAG] },
  )
  const all = await load()
  return all.slice(offset, offset + limit)
}

/** 项目详情（含嵌套树）。maxDepth 控制返回层级，避免超大响应 */
export async function getProjectDetail(
  projectId: string,
  maxDepth = 99,
): Promise<Project | null> {
  const load = unstable_cache(
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

      const commentsByNode = new Map<string, Comment[]>()
      if (allNodes.length) {
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
        root: rowToTreeNode(rootRow, byParent, commentsByNode, 1, 99),
      }
    },
    ["core:project:detail", projectId],
    { tags: [projectTag(projectId)] },
  )

  const full = await load()
  if (!full || maxDepth >= 99) return full
  // 深度裁剪在缓存外做，避免不同 depth 串缓存
  const prune = (node: TreeNode, depth: number): TreeNode => ({
    ...node,
    children: depth >= maxDepth ? [] : node.children.map((c) => prune(c, depth + 1)),
  })
  return { ...full, root: prune(full.root, 1) }
}

export interface FlatNode {
  id: string
  parentId: string | null
  title: string
  description: string
  type: NodeType
  status: NodeStatus
  priority: Priority
  progress: number
  assigneeIds: string[]
  startDate: string | null
  dueDate: string | null
  estimateHours: number
  tags: string[]
  sortOrder: number
}

/** 扁平节点列表，支持按父节点、状态、负责人筛选 */
export async function listNodes(
  projectId: string,
  filter: { parentId?: string | null; status?: NodeStatus; assigneeId?: string } = {},
): Promise<FlatNode[]> {
  await ensureSeeded()
  const rows = await db
    .select()
    .from(nodes)
    .where(eq(nodes.projectId, projectId))
    .orderBy(asc(nodes.sortOrder), asc(nodes.createdAt))
  if (!rows.length) {
    // 区分「项目不存在」与「项目为空」
    await loadProjectOwner(projectId)
  }
  return rows
    .filter((n) => {
      if (filter.parentId !== undefined && n.parentId !== filter.parentId) return false
      if (filter.status && n.status !== filter.status) return false
      if (filter.assigneeId && !((n.assigneeIds ?? []) as string[]).includes(filter.assigneeId))
        return false
      return true
    })
    .map((n) => ({
      id: n.id,
      parentId: n.parentId,
      title: n.title,
      description: n.description,
      type: n.type as NodeType,
      status: n.status as NodeStatus,
      priority: n.priority as Priority,
      progress: n.progress,
      assigneeIds: (n.assigneeIds ?? []) as string[],
      startDate: n.startDate,
      dueDate: n.dueDate,
      estimateHours: n.estimateHours,
      tags: (n.tags ?? []) as string[],
      sortOrder: n.sortOrder,
    }))
}

/** 单个节点详情（含评论） */
export async function getNodeDetail(projectId: string, nodeId: string) {
  const [row] = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.projectId, projectId)))
  if (!row) throw new CoreError("not_found", "节点不存在")
  const comments = await db
    .select()
    .from(nodeComments)
    .where(eq(nodeComments.nodeId, nodeId))
    .orderBy(asc(nodeComments.createdAt))
  const children = await db
    .select({ id: nodes.id, title: nodes.title })
    .from(nodes)
    .where(and(eq(nodes.projectId, projectId), eq(nodes.parentId, nodeId)))
    .orderBy(asc(nodes.sortOrder))
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
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
    aiGenerated: row.aiGenerated,
    childIds: children.map((c) => c.id),
    comments: comments.map(rowToComment),
  }
}

export interface MemberBrief {
  id: string
  name: string
  email: string | null
  role: string
  roleKey: RoleKey
  hasAccount: boolean
}

/** 成员列表。传 projectId 时只返回该项目的参与成员 */
export async function listMembers(projectId?: string): Promise<MemberBrief[]> {
  const load = unstable_cache(
    async () => {
      await ensureSeeded()
      return db.select().from(members).orderBy(asc(members.createdAt))
    },
    ["core:members:list"],
    { tags: [MEMBERS_TAG] },
  )
  const rows = await load()
  let allowed: Set<string> | null = null
  if (projectId) {
    const [p] = await db
      .select({ memberIds: projects.memberIds, ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId))
    if (!p) throw new CoreError("not_found", "项目不存在")
    allowed = new Set([...((p.memberIds ?? []) as string[]), ...(p.ownerId ? [p.ownerId] : [])])
  }
  return rows
    .filter((m) => !allowed || allowed.has(m.id))
    .map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      roleKey: toRoleKey(m.roleKey),
      hasAccount: !!m.userId,
    }))
}

// ---- 项目写操作 ----

export async function createProjectCore(
  actor: Actor,
  input: { name: string; description?: string; tree?: TreeInput; memberIds?: string[] },
) {
  assertCan(actor, "project:create")
  const name = input.name?.trim()
  if (!name) throw new CoreError("invalid_input", "项目名称不能为空")

  const tree: TreeInput = input.tree ?? { title: name, type: "root" }
  const nodeCount = measureTree(tree)

  const projectId = newId("p")
  const extra = input.memberIds?.length
    ? (
        await db.select({ id: members.id }).from(members).where(inArray(members.id, input.memberIds))
      ).map((m) => m.id)
    : []
  const memberIds = Array.from(new Set([actor.memberId, ...extra]))

  await db.insert(projects).values({
    id: projectId,
    name,
    description: input.description?.trim() ?? "",
    ownerId: actor.memberId,
    memberIds,
  })
  // 根节点标题始终与项目名一致
  await insertTree(projectId, { ...tree, title: name, type: "root" }, null, 0)

  invalidate(projectId)
  return { projectId, nodeCount }
}

export async function updateProjectCore(
  actor: Actor,
  projectId: string,
  patch: { name?: string; description?: string },
) {
  const ownerId = await loadProjectOwner(projectId)
  assertProjectOwnership(actor, ownerId)

  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new CoreError("invalid_input", "项目名称不能为空")
    set.name = name
  }
  if (patch.description !== undefined) set.description = patch.description.trim()

  await db.update(projects).set(set).where(eq(projects.id, projectId))
  // 项目改名时同步根节点标题
  if (set.name) {
    await db
      .update(nodes)
      .set({ title: set.name as string })
      .where(and(eq(nodes.projectId, projectId), eq(nodes.type, "root")))
  }
  invalidate(projectId)
}

export async function deleteProjectCore(actor: Actor, projectId: string) {
  const ownerId = await loadProjectOwner(projectId)
  assertProjectOwnership(actor, ownerId)

  await db.delete(nodeComments).where(eq(nodeComments.projectId, projectId))
  await db.delete(nodes).where(eq(nodes.projectId, projectId))
  await db.delete(projects).where(eq(projects.id, projectId))

  invalidate(projectId)
}

export async function updateProjectMembersCore(
  actor: Actor,
  projectId: string,
  memberIds: string[],
) {
  const ownerId = await loadProjectOwner(projectId)
  assertProjectOwnership(actor, ownerId)

  // 过滤掉不存在的成员 id，并保证项目创建者始终在列表内
  const valid = memberIds.length
    ? (
        await db.select({ id: members.id }).from(members).where(inArray(members.id, memberIds))
      ).map((m) => m.id)
    : []
  const next = Array.from(new Set(ownerId ? [ownerId, ...valid] : valid))

  await db
    .update(projects)
    .set({ memberIds: next, updatedAt: new Date() })
    .where(eq(projects.id, projectId))

  invalidate(projectId)
  return next
}

// ---- 节点写操作 ----

export interface NodePatchInput {
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

export async function addNodeCore(
  actor: Actor,
  projectId: string,
  parentId: string,
  input: {
    title: string
    description?: string
    type?: NodeType
    status?: NodeStatus
    priority?: Priority
    assigneeIds?: string[]
    startDate?: string | null
    dueDate?: string | null
    estimateHours?: number
    tags?: string[]
  },
) {
  assertCan(actor, "node:manage")
  if (!input.title?.trim()) throw new CoreError("invalid_input", "节点 title 不能为空")

  const [parent] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, parentId), eq(nodes.projectId, projectId)))
  if (!parent) throw new CoreError("not_found", "父节点不存在")

  const id = newId("n")
  const [{ value: siblingCount }] = await db
    .select({ value: count() })
    .from(nodes)
    .where(and(eq(nodes.projectId, projectId), eq(nodes.parentId, parentId)))

  await db.insert(nodes).values({
    id,
    projectId,
    parentId,
    title: input.title.trim(),
    description: input.description ?? "",
    type: input.type ?? "task",
    status: input.status ?? "todo",
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
  await bumpProject(projectId)
  invalidate(projectId)
  return id
}

/** 在指定父节点下挂一整棵子树，返回新根 id 与写入条数 */
export async function addSubtreeCore(
  actor: Actor,
  projectId: string,
  parentId: string,
  tree: TreeInput,
) {
  assertCan(actor, "node:manage")
  const nodeCount = measureTree(tree)

  const [parent] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, parentId), eq(nodes.projectId, projectId)))
  if (!parent) throw new CoreError("not_found", "父节点不存在")

  const [{ value: siblingCount }] = await db
    .select({ value: count() })
    .from(nodes)
    .where(and(eq(nodes.projectId, projectId), eq(nodes.parentId, parentId)))

  const { rootId } = await insertTree(projectId, tree, parentId, siblingCount)
  await bumpProject(projectId)
  invalidate(projectId)
  return { rootId, nodeCount }
}

export async function updateNodeCore(
  actor: Actor,
  projectId: string,
  nodeId: string,
  patch: NodePatchInput,
) {
  const [row] = await db
    .select({ assigneeIds: nodes.assigneeIds })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.projectId, projectId)))
  if (!row) throw new CoreError("not_found", "节点不存在")

  const assigneeIds = (row.assigneeIds ?? []) as string[]
  if (!canEditNodeAs(actor, assigneeIds)) {
    throw new CoreError("forbidden", "没有操作权限")
  }

  // 无 node:manage 时只允许改自己负责节点的状态与进度
  const allowed: NodePatchInput = can(actor, "node:manage")
    ? patch
    : { status: patch.status, progress: patch.progress }

  const set = Object.fromEntries(Object.entries(allowed).filter(([, v]) => v !== undefined))
  if (Object.keys(set).length === 0) {
    throw new CoreError("invalid_input", "没有可更新的字段")
  }
  if (typeof set.progress === "number" && (set.progress < 0 || set.progress > 100)) {
    throw new CoreError("invalid_input", "progress 必须在 0-100 之间")
  }
  if (typeof set.title === "string" && !set.title.trim()) {
    throw new CoreError("invalid_input", "title 不能为空")
  }

  await db.update(nodes).set(set).where(eq(nodes.id, nodeId))
  await bumpProject(projectId)
  invalidate(projectId)
  return Object.keys(set)
}

/** 批量推进进度，逐条走与 updateNodeCore 相同的权限判定 */
export async function updateProgressCore(
  actor: Actor,
  projectId: string,
  updates: { nodeId: string; status?: NodeStatus; progress?: number }[],
) {
  if (!updates.length) throw new CoreError("invalid_input", "updates 不能为空")
  if (updates.length > 200) throw new CoreError("too_large", "单次最多更新 200 个节点")

  const ids = updates.map((u) => u.nodeId)
  const rows = await db
    .select({ id: nodes.id, assigneeIds: nodes.assigneeIds })
    .from(nodes)
    .where(and(eq(nodes.projectId, projectId), inArray(nodes.id, ids)))
  const byId = new Map(rows.map((r) => [r.id, (r.assigneeIds ?? []) as string[]]))

  const results: { nodeId: string; ok: boolean; reason?: string }[] = []
  for (const u of updates) {
    const assignees = byId.get(u.nodeId)
    if (!assignees) {
      results.push({ nodeId: u.nodeId, ok: false, reason: "节点不存在" })
      continue
    }
    if (!canEditNodeAs(actor, assignees)) {
      results.push({ nodeId: u.nodeId, ok: false, reason: "没有操作权限" })
      continue
    }
    const set: Record<string, unknown> = {}
    if (u.status !== undefined) set.status = u.status
    if (u.progress !== undefined) {
      if (u.progress < 0 || u.progress > 100) {
        results.push({ nodeId: u.nodeId, ok: false, reason: "progress 必须在 0-100 之间" })
        continue
      }
      set.progress = u.progress
    }
    if (!Object.keys(set).length) {
      results.push({ nodeId: u.nodeId, ok: false, reason: "没有可更新的字段" })
      continue
    }
    await db.update(nodes).set(set).where(eq(nodes.id, u.nodeId))
    results.push({ nodeId: u.nodeId, ok: true })
  }

  await bumpProject(projectId)
  invalidate(projectId)
  return results
}

export async function deleteNodeCore(actor: Actor, projectId: string, nodeId: string) {
  assertCan(actor, "node:manage")

  const all = await db
    .select({ id: nodes.id, parentId: nodes.parentId, type: nodes.type })
    .from(nodes)
    .where(eq(nodes.projectId, projectId))
  const target = all.find((n) => n.id === nodeId)
  if (!target) throw new CoreError("not_found", "节点不存在")
  if (target.type === "root") {
    throw new CoreError("forbidden", "根节点不可删除，请改用 delete_project")
  }

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

  await db.delete(nodeComments).where(inArray(nodeComments.nodeId, toDelete))
  await db.delete(nodes).where(inArray(nodes.id, toDelete))
  await bumpProject(projectId)
  invalidate(projectId)
  return toDelete.length
}

// ---- 评论 ----

export async function addCommentCore(
  actor: Actor,
  projectId: string,
  nodeId: string,
  content: string,
) {
  assertCan(actor, "comment:write")
  const text = content?.trim()
  if (!text) throw new CoreError("invalid_input", "评论内容不能为空")

  const [node] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.projectId, projectId)))
  if (!node) throw new CoreError("not_found", "节点不存在")

  const id = newId("c")
  await db.insert(nodeComments).values({
    id,
    nodeId,
    projectId,
    authorId: actor.memberId,
    content: text,
  })
  await bumpProject(projectId)
  invalidate(projectId)
  return {
    id,
    authorId: actor.memberId,
    content: text,
    createdAt: new Date().toISOString().slice(0, 10),
  } as Comment
}

export async function deleteCommentCore(actor: Actor, projectId: string, commentId: string) {
  const [row] = await db
    .select({ authorId: nodeComments.authorId })
    .from(nodeComments)
    .where(eq(nodeComments.id, commentId))
  if (!row) throw new CoreError("not_found", "评论不存在")
  const isOwn = row.authorId === actor.memberId
  if (!isOwn && actor.roleKey !== "admin" && actor.roleKey !== "manager") {
    throw new CoreError("forbidden", "没有操作权限")
  }
  await db.delete(nodeComments).where(eq(nodeComments.id, commentId))
  invalidate(projectId)
}
