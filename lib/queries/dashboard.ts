import { db } from "@/lib/db"
import { ensureSeeded } from "@/lib/db/seed"
import { MEMBERS_TAG, PROJECTS_TAG } from "@/lib/cache-tags"
import { sql } from "drizzle-orm"
import { unstable_cache } from "next/cache"

/**
 * 看板取数层：全部用聚合 SQL 在数据库侧算完，只回传统计结果，
 * 不把节点树拉到 Node 内存里遍历，也不会进入客户端 bundle。
 */

export interface DashboardOverview {
  projectCount: number
  totalNodes: number
  doneNodes: number
  progressNodes: number
  blockedNodes: number
  avgProgress: number
}

export interface ProjectCard {
  id: string
  name: string
  description: string
  ownerId: string | null
  aiGenerated: boolean
  progress: number
  total: number
  done: number
  blocked: number
  members: { id: string; initials: string; color: string }[]
}

export interface TaskItem {
  id: string
  title: string
  status: string
  dueDate: string | null
  projectId: string
  projectName: string
}

export interface ReportProject {
  id: string
  name: string
}

export interface ActivityItem {
  id: string
  name: string
  initials: string
  color: string
  content: string
  projectId: string
  projectName: string
  nodeTitle: string
  createdAt: string
}

export interface ReportData {
  projectId: string
  projectName: string
  progress: number
  total: number
  done: number
  progressCount: number
  blockedCount: number
  todoCount: number
  inProgress: { title: string; progress: number }[]
  blocked: { title: string }[]
  upcoming: { title: string }[]
}

/**
 * 叶子节点进度（已完成按 100 计）是所有进度口径的基准，
 * 与前端 computeProgress 保持一致。
 */
const leafProgressSql = sql`
  SELECT
    n."id",
    n."projectId",
    n."status",
    CASE WHEN n."status" = 'done' THEN 100 ELSE n."progress" END AS "eff"
  FROM "nodes" n
  WHERE n."parentId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "nodes" c WHERE c."parentId" = n."id")
`

/** 工作台顶部四个统计卡：一条 SQL 出全部数字 */
export const getDashboardOverview = unstable_cache(
  async (): Promise<DashboardOverview> => {
    await ensureSeeded()
    const { rows } = await db.execute<{
      projectcount: number
      totalnodes: number
      donenodes: number
      progressnodes: number
      blockednodes: number
      avgprogress: number
    }>(sql`
      WITH leaves AS (${leafProgressSql}),
      per_project AS (
        SELECT "projectId", ROUND(AVG("eff"))::int AS "progress"
        FROM leaves GROUP BY "projectId"
      )
      SELECT
        (SELECT COUNT(*) FROM "projects")::int AS "projectcount",
        (SELECT COUNT(*) FROM "nodes" WHERE "parentId" IS NOT NULL)::int AS "totalnodes",
        (SELECT COUNT(*) FROM "nodes" WHERE "parentId" IS NOT NULL AND "status" = 'done')::int AS "donenodes",
        (SELECT COUNT(*) FROM "nodes" WHERE "parentId" IS NOT NULL AND "status" = 'progress')::int AS "progressnodes",
        (SELECT COUNT(*) FROM "nodes" WHERE "parentId" IS NOT NULL AND "status" = 'blocked')::int AS "blockednodes",
        COALESCE((SELECT ROUND(AVG("progress")) FROM per_project), 0)::int AS "avgprogress"
    `)
    const r = rows[0]
    return {
      projectCount: Number(r?.projectcount ?? 0),
      totalNodes: Number(r?.totalnodes ?? 0),
      doneNodes: Number(r?.donenodes ?? 0),
      progressNodes: Number(r?.progressnodes ?? 0),
      blockedNodes: Number(r?.blockednodes ?? 0),
      avgProgress: Number(r?.avgprogress ?? 0),
    }
  },
  ["dashboard:overview"],
  { tags: [PROJECTS_TAG] },
)

/** 项目卡片列表：项目行 + 聚合统计 + 成员头像，一条 SQL */
export async function getProjectCards(limit = 4): Promise<ProjectCard[]> {
  const load = unstable_cache(
    async (): Promise<ProjectCard[]> => {
      await ensureSeeded()
      const { rows } = await db.execute<{
      id: string
      name: string
      description: string
      ownerid: string | null
      aigenerated: boolean
      progress: number
      total: number
      done: number
      blocked: number
      members: { id: string; initials: string; color: string }[] | null
    }>(sql`
      WITH leaves AS (${leafProgressSql}),
      agg AS (
        SELECT
          n."projectId",
          COUNT(*)::int AS "total",
          COUNT(*) FILTER (WHERE n."status" = 'done')::int AS "done",
          COUNT(*) FILTER (WHERE n."status" = 'blocked')::int AS "blocked"
        FROM "nodes" n WHERE n."parentId" IS NOT NULL GROUP BY n."projectId"
      ),
      prog AS (
        SELECT "projectId", ROUND(AVG("eff"))::int AS "progress"
        FROM leaves GROUP BY "projectId"
      )
      SELECT
        p."id", p."name", p."description", p."ownerId" AS "ownerid",
        COALESCE(r."aiGenerated", false) AS "aigenerated",
        COALESCE(prog."progress", 0) AS "progress",
        COALESCE(agg."total", 0) AS "total",
        COALESCE(agg."done", 0) AS "done",
        COALESCE(agg."blocked", 0) AS "blocked",
        (
          SELECT COALESCE(json_agg(json_build_object(
            'id', m."id", 'initials', m."initials", 'color', m."color"
          )), '[]'::json)
          FROM "members" m
          WHERE m."id" IN (SELECT jsonb_array_elements_text(p."memberIds"))
        ) AS "members"
      FROM "projects" p
      LEFT JOIN agg ON agg."projectId" = p."id"
      LEFT JOIN prog ON prog."projectId" = p."id"
      LEFT JOIN "nodes" r ON r."projectId" = p."id" AND r."parentId" IS NULL
      ORDER BY p."createdAt" DESC
      LIMIT ${limit}
    `)
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      ownerId: r.ownerid ?? null,
      aiGenerated: !!r.aigenerated,
      progress: Number(r.progress),
      total: Number(r.total),
      done: Number(r.done),
      blocked: Number(r.blocked),
      members: (r.members ?? []).slice(0, 4),
    }))
    },
    ["dashboard:project-cards", String(limit)],
    { tags: [PROJECTS_TAG, MEMBERS_TAG] },
  )
  return load()
}

/** 我的待办：数据库侧按负责人过滤 + 排序 + 限量 */
export async function getMyTasks(memberId: string, limit = 5): Promise<TaskItem[]> {
  const load = unstable_cache(
    async (): Promise<TaskItem[]> => {
      await ensureSeeded()
      const { rows } = await db.execute<{
        id: string
        title: string
        status: string
        dueDate: string | null
        projectId: string
        projectName: string
      }>(sql`
        SELECT n."id", n."title", n."status", n."dueDate",
               n."projectId", p."name" AS "projectName"
        FROM "nodes" n
        JOIN "projects" p ON p."id" = n."projectId"
        WHERE n."parentId" IS NOT NULL
          AND n."status" <> 'done'
          AND n."assigneeIds" @> ${JSON.stringify([memberId])}::jsonb
          AND NOT EXISTS (SELECT 1 FROM "nodes" c WHERE c."parentId" = n."id")
        ORDER BY n."dueDate" ASC NULLS LAST
        LIMIT ${limit}
      `)
      return rows.map((r) => ({ ...r, dueDate: r.dueDate ?? null }))
    },
    ["dashboard:my-tasks", memberId],
    { tags: [PROJECTS_TAG] },
  )
  return load()
}

/** 最近活动：由真实评论派生，避免维护额外的活动表 */
export const getRecentActivities = unstable_cache(
  async (limit = 6): Promise<ActivityItem[]> => {
    await ensureSeeded()
    const { rows } = await db.execute<{
      id: string
      name: string | null
      initials: string | null
      color: string | null
      content: string
      projectId: string
      projectName: string
      nodeTitle: string
      createdAt: Date
    }>(sql`
      SELECT c."id", m."name", m."initials", m."color", c."content",
             c."projectId", p."name" AS "projectName", n."title" AS "nodeTitle",
             c."createdAt"
      FROM "node_comments" c
      JOIN "projects" p ON p."id" = c."projectId"
      JOIN "nodes" n ON n."id" = c."nodeId"
      LEFT JOIN "members" m ON m."id" = c."authorId"
      ORDER BY c."createdAt" DESC
      LIMIT ${limit}
    `)
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? "未知成员",
      initials: r.initials ?? "?",
      color: r.color ?? "oklch(0.6 0.02 260)",
      content: r.content,
      projectId: r.projectId,
      projectName: r.projectName,
      nodeTitle: r.nodeTitle,
      createdAt: new Date(r.createdAt).toISOString(),
    }))
  },
  ["dashboard:activities"],
  { tags: [PROJECTS_TAG, MEMBERS_TAG] },
)

/** 报告页项目下拉：只取 id 与名称 */
export const getReportProjects = unstable_cache(
  async (): Promise<ReportProject[]> => {
    await ensureSeeded()
    const { rows } = await db.execute<{ id: string; name: string }>(sql`
      SELECT "id", "name" FROM "projects" ORDER BY "createdAt" DESC
    `)
    return rows
  },
  ["reports:projects"],
  { tags: [PROJECTS_TAG] },
)

/** 报告页数据：统计 + 三段清单，全部在库侧限量 */
export async function getReportData(projectId: string): Promise<ReportData | null> {
  const load = unstable_cache(
    async (): Promise<ReportData | null> => {
      await ensureSeeded()
      const { rows } = await db.execute<{
        name: string
        progress: number
        total: number
        done: number
        progresscount: number
        blockedcount: number
        todocount: number
        inprogress: { title: string; progress: number }[] | null
        blocked: { title: string }[] | null
        upcoming: { title: string }[] | null
      }>(sql`
        WITH leaves AS (
          SELECT n."id", n."status",
                 CASE WHEN n."status" = 'done' THEN 100 ELSE n."progress" END AS "eff"
          FROM "nodes" n
          WHERE n."projectId" = ${projectId} AND n."parentId" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "nodes" c WHERE c."parentId" = n."id")
        ),
        body AS (
          SELECT * FROM "nodes"
          WHERE "projectId" = ${projectId} AND "parentId" IS NOT NULL
        )
        SELECT
          p."name",
          COALESCE((SELECT ROUND(AVG("eff")) FROM leaves), 0)::int AS "progress",
          (SELECT COUNT(*) FROM body)::int AS "total",
          (SELECT COUNT(*) FROM body WHERE "status" = 'done')::int AS "done",
          (SELECT COUNT(*) FROM body WHERE "status" = 'progress')::int AS "progresscount",
          (SELECT COUNT(*) FROM body WHERE "status" = 'blocked')::int AS "blockedcount",
          (SELECT COUNT(*) FROM body WHERE "status" = 'todo')::int AS "todocount",
          (SELECT COALESCE(json_agg(json_build_object('title', t."title", 'progress', t."progress")), '[]'::json)
             FROM (SELECT "title", "progress" FROM body WHERE "status" = 'progress'
                   ORDER BY "sortOrder" LIMIT 6) t) AS "inprogress",
          (SELECT COALESCE(json_agg(json_build_object('title', t."title")), '[]'::json)
             FROM (SELECT "title" FROM body WHERE "status" = 'blocked'
                   ORDER BY "sortOrder" LIMIT 10) t) AS "blocked",
          (SELECT COALESCE(json_agg(json_build_object('title', t."title")), '[]'::json)
             FROM (SELECT b."title" FROM body b WHERE b."status" = 'todo'
                     AND NOT EXISTS (SELECT 1 FROM "nodes" c WHERE c."parentId" = b."id")
                   ORDER BY b."sortOrder" LIMIT 5) t) AS "upcoming"
        FROM "projects" p WHERE p."id" = ${projectId}
      `)
      const r = rows[0]
      if (!r) return null
      return {
        projectId,
        projectName: r.name,
        progress: Number(r.progress),
        total: Number(r.total),
        done: Number(r.done),
        progressCount: Number(r.progresscount),
        blockedCount: Number(r.blockedcount),
        todoCount: Number(r.todocount),
        inProgress: r.inprogress ?? [],
        blocked: r.blocked ?? [],
        upcoming: r.upcoming ?? [],
      }
    },
    ["reports:data", projectId],
    { tags: [PROJECTS_TAG] },
  )
  return load()
}
