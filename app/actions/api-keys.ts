"use server"

import {
  issueApiKey,
  listApiKeys,
  revokeApiKey,
  setApiKeyEnabled,
  isApiKeyScope,
  type ApiKeyBrief,
} from "@/lib/api-keys"
import { db } from "@/lib/db"
import { apiKeys } from "@/lib/db/schema"
import { getCurrentMember } from "@/lib/session"
import { eq } from "drizzle-orm"

async function requireMember() {
  const member = await getCurrentMember()
  if (!member) throw new Error("请先登录")
  return member
}

/** 管理员看全部密钥，其他成员只看自己名下的 */
export async function getApiKeys(): Promise<ApiKeyBrief[]> {
  const me = await requireMember()
  return listApiKeys(me.roleKey === "admin" ? undefined : me.memberId)
}

/** 校验操作权限：管理员或密钥归属人 */
async function assertKeyAccess(keyId: string) {
  const me = await requireMember()
  if (me.roleKey === "admin") return
  const [row] = await db
    .select({ memberId: apiKeys.memberId })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
  if (!row || row.memberId !== me.memberId) throw new Error("没有操作权限")
}

/** 签发密钥。原文只在这里返回一次，之后无法找回 */
export async function createApiKey(input: {
  name: string
  memberId?: string
  scopes: string[]
  expiresInDays?: number | null
}): Promise<{ id: string; key: string }> {
  const me = await requireMember()
  // 只有管理员能给别人签发密钥
  const targetMemberId = input.memberId ?? me.memberId
  if (targetMemberId !== me.memberId && me.roleKey !== "admin") {
    throw new Error("没有操作权限")
  }
  return issueApiKey({
    name: input.name,
    memberId: targetMemberId,
    scopes: input.scopes.filter(isApiKeyScope),
    expiresInDays: input.expiresInDays ?? null,
    createdBy: me.memberId,
  })
}

export async function toggleApiKey(id: string, enabled: boolean) {
  await assertKeyAccess(id)
  await setApiKeyEnabled(id, enabled)
}

export async function deleteApiKey(id: string) {
  await assertKeyAccess(id)
  await revokeApiKey(id)
}
