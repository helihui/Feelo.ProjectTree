import { createHash, randomBytes } from "node:crypto"
import { db, ensureSchema } from "@/lib/db"
import { apiKeys, members, mcpAuditLogs } from "@/lib/db/schema"
import { toRoleKey, type Permission } from "@/lib/permissions"
import { eq, desc } from "drizzle-orm"
import type { Actor } from "@/lib/core/actor"

const KEY_PREFIX = "pt_live_"

/** 可授予 API Key 的权限范围。与 lib/permissions.ts 的 Permission 一致，不引入第二套模型 */
export const API_KEY_SCOPES: Permission[] = [
  "project:create",
  "node:manage",
  "node:updateOwn",
  "comment:write",
  "member:manage",
]

export function isApiKeyScope(v: unknown): v is Permission {
  return typeof v === "string" && (API_KEY_SCOPES as string[]).includes(v)
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

/** 生成新密钥原文。格式 pt_live_ + 48 位 base64url */
function generateKey() {
  return KEY_PREFIX + randomBytes(36).toString("base64url")
}

export interface ApiKeyBrief {
  id: string
  name: string
  keyPrefix: string
  memberId: string
  memberName: string
  scopes: Permission[]
  enabled: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

/** 签发新密钥。返回的 key 为原文，只在此刻可见一次 */
export async function issueApiKey(input: {
  name: string
  memberId: string
  scopes: Permission[]
  expiresInDays?: number | null
  createdBy: string
}): Promise<{ id: string; key: string }> {
  await ensureSchema()
  const name = input.name.trim()
  if (!name) throw new Error("密钥名称不能为空")

  const [member] = await db.select({ id: members.id }).from(members).where(eq(members.id, input.memberId))
  if (!member) throw new Error("成员不存在")

  const key = generateKey()
  const id = `ak_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null

  await db.insert(apiKeys).values({
    id,
    name,
    keyHash: sha256(key),
    // 展示用前缀：pt_live_ 加原文的前 6 个字符
    keyPrefix: key.slice(0, KEY_PREFIX.length + 6),
    memberId: input.memberId,
    scopes: input.scopes.filter(isApiKeyScope),
    enabled: true,
    expiresAt,
    createdBy: input.createdBy,
  })

  return { id, key }
}

/** 列出密钥（不含摘要）。传 memberId 时只列该成员名下的 */
export async function listApiKeys(memberId?: string): Promise<ApiKeyBrief[]> {
  await ensureSchema()
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      memberId: apiKeys.memberId,
      scopes: apiKeys.scopes,
      enabled: apiKeys.enabled,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
      memberName: members.name,
    })
    .from(apiKeys)
    .leftJoin(members, eq(members.id, apiKeys.memberId))
    .orderBy(desc(apiKeys.createdAt))

  return rows
    .filter((r) => !memberId || r.memberId === memberId)
    .map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      memberId: r.memberId,
      memberName: r.memberName ?? "(已删除成员)",
      scopes: ((r.scopes ?? []) as string[]).filter(isApiKeyScope),
      enabled: r.enabled,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
}

export async function setApiKeyEnabled(id: string, enabled: boolean) {
  await db.update(apiKeys).set({ enabled }).where(eq(apiKeys.id, id))
}

export async function revokeApiKey(id: string) {
  await db.delete(apiKeys).where(eq(apiKeys.id, id))
}

export type VerifyFailure =
  | "missing"
  | "invalid"
  | "disabled"
  | "expired"
  | "member_missing"

export type VerifyResult =
  | { ok: true; keyId: string; keyName: string; actor: Actor }
  | { ok: false; reason: VerifyFailure }

/**
 * 校验密钥原文并解析出执行身份。
 * 权限 = 成员角色权限 ∩ 密钥声明的 scopes，密钥只能收窄不能放大。
 */
export async function verifyApiKey(raw: string | null | undefined): Promise<VerifyResult> {
  if (!raw?.trim()) return { ok: false, reason: "missing" }
  await ensureSchema()

  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, sha256(raw.trim())))
  if (!row) return { ok: false, reason: "invalid" }
  if (!row.enabled) return { ok: false, reason: "disabled" }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" }
  }

  const [member] = await db
    .select({ id: members.id, roleKey: members.roleKey })
    .from(members)
    .where(eq(members.id, row.memberId))
  if (!member) return { ok: false, reason: "member_missing" }

  // 最后使用时间是软信息，写失败不影响调用
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => {})

  return {
    ok: true,
    keyId: row.id,
    keyName: row.name,
    actor: {
      memberId: member.id,
      roleKey: toRoleKey(member.roleKey),
      scopes: ((row.scopes ?? []) as string[]).filter(isApiKeyScope),
    },
  }
}

/** 写审计日志。失败不影响主流程 */
export function writeAudit(entry: {
  keyId: string | null
  memberId: string | null
  tool: string
  projectId?: string | null
  ok: boolean
  errorCode?: string | null
  durationMs: number
}) {
  void db
    .insert(mcpAuditLogs)
    .values({
      id: `al_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`,
      keyId: entry.keyId,
      memberId: entry.memberId,
      tool: entry.tool,
      projectId: entry.projectId ?? null,
      ok: entry.ok,
      errorCode: entry.errorCode ?? null,
      durationMs: entry.durationMs,
    })
    .catch(() => {})
}
