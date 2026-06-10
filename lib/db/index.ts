import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })

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
