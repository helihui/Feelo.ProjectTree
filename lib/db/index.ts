import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { setDefaultResultOrder } from "node:dns"
import * as schema from "./schema"

// Node 默认优先解析 IPv6，部分网络下连接 Neon 会在 TLS 握手后被中断，强制走 IPv4。
setDefaultResultOrder("ipv4first")

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  // 保留空闲连接，避免每次请求都重新走 TLS 握手（对 Neon 这类远端库影响明显）
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
})
export const db = drizzle(pool, { schema })

// 预热首个数据库连接，减少冷启动时第一条认证/项目请求的握手耗时。
void pool.query("SELECT 1").catch(() => {})

let schemaPromise: Promise<void> | null = null

export async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise
  schemaPromise = (async () => {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      await client.query(`
        CREATE TABLE IF NOT EXISTS "members" (
          "id" text PRIMARY KEY,
          "name" text NOT NULL,
          "initials" text NOT NULL,
          "color" text NOT NULL,
          "email" text,
          "role" text NOT NULL DEFAULT '成员',
          "roleKey" text NOT NULL DEFAULT 'member',
          "userId" text,
          "createdAt" timestamp NOT NULL DEFAULT now()
        )
      `)

      // 兼容已存在的旧库
      await client.query(`
        ALTER TABLE "members"
        ADD COLUMN IF NOT EXISTS "roleKey" text NOT NULL DEFAULT 'member'
      `)
      await client.query(`
        ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "userId" text
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS "invitations" (
          "token" text PRIMARY KEY,
          "memberId" text NOT NULL,
          "email" text NOT NULL,
          "roleKey" text NOT NULL DEFAULT 'member',
          "expiresAt" timestamp NOT NULL,
          "acceptedAt" timestamp,
          "createdAt" timestamp NOT NULL DEFAULT now()
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS "projects" (
          "id" text PRIMARY KEY,
          "name" text NOT NULL,
          "description" text NOT NULL DEFAULT '',
          "ownerId" text,
          "memberIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now()
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS "nodes" (
          "id" text PRIMARY KEY,
          "projectId" text NOT NULL,
          "parentId" text,
          "title" text NOT NULL,
          "description" text NOT NULL DEFAULT '',
          "type" text NOT NULL DEFAULT 'task',
          "status" text NOT NULL DEFAULT 'todo',
          "priority" text NOT NULL DEFAULT 'medium',
          "progress" integer NOT NULL DEFAULT 0,
          "assigneeIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
          "startDate" text,
          "dueDate" text,
          "estimateHours" integer NOT NULL DEFAULT 0,
          "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
          "aiGenerated" boolean NOT NULL DEFAULT false,
          "sortOrder" integer NOT NULL DEFAULT 0,
          "createdAt" timestamp NOT NULL DEFAULT now()
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS "user" (
          "id" text PRIMARY KEY,
          "name" text NOT NULL,
          "email" text NOT NULL,
          "emailVerified" boolean NOT NULL DEFAULT false,
          "image" text,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now(),
          UNIQUE ("email")
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          "id" text PRIMARY KEY,
          "expiresAt" timestamp NOT NULL,
          "token" text NOT NULL,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now(),
          "ipAddress" text,
          "userAgent" text,
          "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          UNIQUE ("token")
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS "account" (
          "id" text PRIMARY KEY,
          "accountId" text NOT NULL,
          "providerId" text NOT NULL,
          "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "accessToken" text,
          "refreshToken" text,
          "idToken" text,
          "accessTokenExpiresAt" timestamp,
          "refreshTokenExpiresAt" timestamp,
          "scope" text,
          "password" text,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now()
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS "verification" (
          "id" text PRIMARY KEY,
          "identifier" text NOT NULL,
          "value" text NOT NULL,
          "expiresAt" timestamp NOT NULL,
          "createdAt" timestamp DEFAULT now(),
          "updatedAt" timestamp DEFAULT now()
        )
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_members_createdAt"
        ON "members" ("createdAt")
      `)

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "idx_members_userId"
        ON "members" ("userId") WHERE "userId" IS NOT NULL
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_projects_createdAt"
        ON "projects" ("createdAt")
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_nodes_project_sort_created"
        ON "nodes" ("projectId", "sortOrder", "createdAt")
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_nodes_project_parent"
        ON "nodes" ("projectId", "parentId")
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_session_userId"
        ON "session" ("userId")
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_account_userId"
        ON "account" ("userId")
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS "node_comments" (
          "id" text PRIMARY KEY,
          "nodeId" text NOT NULL,
          "projectId" text NOT NULL,
          "authorId" text NOT NULL,
          "content" text NOT NULL,
          "createdAt" timestamp NOT NULL DEFAULT now()
        )
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_node_comments_node_created"
        ON "node_comments" ("nodeId", "createdAt")
      `)

      // 最近活动按时间倒序取前 N 条
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_node_comments_created"
        ON "node_comments" ("createdAt" DESC)
      `)

      // 「我的待办」按负责人过滤（jsonb 包含查询）
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_nodes_assignees"
        ON "nodes" USING gin ("assigneeIds")
      `)

      // 邀请按成员查询有效邀请
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_invitations_member"
        ON "invitations" ("memberId")
      `)

      await client.query("COMMIT")
    } catch (err) {
      schemaPromise = null
      try {
        await client.query("ROLLBACK")
      } catch {}
      throw err
    } finally {
      client.release()
    }
  })()
  return schemaPromise
}
