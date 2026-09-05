import { db, ensureSchema } from "./index"
import { members, projects, nodes } from "./schema"
import { PROJECTS, USERS } from "@/lib/data"
import type { TreeNode } from "@/lib/types"

const ROLE_BY_ID: Record<string, string> = {
  u1: "负责人",
  u2: "产品设计",
  u3: "研发负责人",
  u4: "设计",
  u5: "运营",
}

const EMAIL_BY_ID: Record<string, string> = {
  u1: "linshen@projecttree.ai",
  u2: "chenjing@projecttree.ai",
  u3: "wanghao@projecttree.ai",
  u4: "zhaomin@projecttree.ai",
  u5: "lina@projecttree.ai",
}

type NodeInsert = typeof nodes.$inferInsert

function flatten(
  node: TreeNode,
  projectId: string,
  parentId: string | null,
  order: number,
  acc: NodeInsert[],
) {
  acc.push({
    id: node.id,
    projectId,
    parentId,
    title: node.title,
    description: node.description,
    type: node.type,
    status: node.status,
    priority: node.priority,
    progress: node.progress,
    assigneeIds: node.assigneeIds,
    startDate: node.startDate,
    dueDate: node.dueDate,
    estimateHours: node.estimateHours,
    tags: node.tags,
    aiGenerated: node.aiGenerated,
    sortOrder: order,
  })
  node.children.forEach((child, i) => flatten(child, projectId, node.id, i, acc))
}

let seedPromise: Promise<void> | null = null

/** 每次启动都补齐内置示例数据（幂等：按主键去重，不覆盖已有数据）。 */
export async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    await ensureSchema()

    const [existingMembers, existingProjects, existingNodeProjects] = await Promise.all([
      db.select({ id: members.id }).from(members),
      db.select({ id: projects.id }).from(projects),
      // 只取去重后的 projectId，避免对 nodes 全表拉取
      db.selectDistinct({ projectId: nodes.projectId }).from(nodes),
    ])

    const projectIds = new Set(existingProjects.map((p) => p.id))
    const nodeProjectIds = new Set(existingNodeProjects.map((n) => n.projectId))

    // 示例成员只在成员表为空时播种一次，否则用户删除的示例成员会在下次启动复活
    if (existingMembers.length === 0) {
      await db
        .insert(members)
        .values(
          USERS.map((u) => ({
            id: u.id,
            name: u.name,
            initials: u.initials,
            color: u.color,
            email: EMAIL_BY_ID[u.id] ?? null,
            role: ROLE_BY_ID[u.id] ?? "成员",
          })),
        )
        .onConflictDoNothing()
    }

    // 示例项目只在项目表为空时播种一次，否则用户删除的示例项目会在下次启动复活
    if (existingProjects.length > 0) return

    for (const p of PROJECTS) {
      if (!projectIds.has(p.id)) {
        await db
          .insert(projects)
          .values({
            id: p.id,
            name: p.name,
            description: p.description,
            ownerId: p.ownerId,
            memberIds: p.memberIds,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          })
          .onConflictDoNothing()
      }

      if (!nodeProjectIds.has(p.id)) {
        const rows: NodeInsert[] = []
        flatten(p.root, p.id, null, 0, rows)
        if (rows.length > 0) {
          await db.insert(nodes).values(rows).onConflictDoNothing()
        }
      }
    }
  })().catch((err) => {
    seedPromise = null
    throw err
  })
  return seedPromise
}
