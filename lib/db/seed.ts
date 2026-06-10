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

/** 首次访问时把内置示例数据写入数据库（幂等：仅当 projects 表为空时执行）。 */
export async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    await ensureSchema()
    const existing = await db.select({ id: projects.id }).from(projects).limit(1)
    if (existing.length > 0) return

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

    for (const p of PROJECTS) {
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

      const rows: NodeInsert[] = []
      flatten(p.root, p.id, null, 0, rows)
      if (rows.length > 0) {
        await db.insert(nodes).values(rows).onConflictDoNothing()
      }
    }
  })().catch((err) => {
    seedPromise = null
    throw err
  })
  return seedPromise
}
