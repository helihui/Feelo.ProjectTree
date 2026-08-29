"use server"

import { db } from "@/lib/db"
import { members, invitations } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { eq } from "drizzle-orm"
import { revalidatePath, revalidateTag } from "next/cache"
import { headers } from "next/headers"
import { MEMBERS_TAG } from "@/lib/cache-tags"

export interface InvitationInfo {
  email: string
  name: string
  roleKey: string
}

/** 校验邀请 token 是否有效，返回受邀人信息 */
export async function getInvitation(token: string): Promise<InvitationInfo | null> {
  const [invite] = await db.select().from(invitations).where(eq(invitations.token, token))
  if (!invite) return null
  if (invite.acceptedAt) return null
  if (invite.expiresAt.getTime() < Date.now()) return null

  const [member] = await db.select().from(members).where(eq(members.id, invite.memberId))
  if (!member || member.userId) return null

  return { email: invite.email, name: member.name, roleKey: invite.roleKey }
}

/** 凭邀请 token 注册账号并绑定到成员记录 */
export async function acceptInvitation(token: string, password: string) {
  const [invite] = await db.select().from(invitations).where(eq(invitations.token, token))
  if (!invite) throw new Error("邀请链接无效")
  if (invite.acceptedAt) throw new Error("该邀请已被使用")
  if (invite.expiresAt.getTime() < Date.now()) throw new Error("邀请链接已过期")
  if (password.length < 8) throw new Error("密码至少 8 位")

  const [member] = await db.select().from(members).where(eq(members.id, invite.memberId))
  if (!member) throw new Error("成员不存在")
  if (member.userId) throw new Error("该成员已开通登录账号")

  const result = await auth.api.signUpEmail({
    body: { email: invite.email, password, name: member.name },
    headers: await headers(),
  })

  await db.update(members).set({ userId: result.user.id }).where(eq(members.id, member.id))
  await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(invitations.token, token))

  revalidateTag(MEMBERS_TAG, "max")
  revalidatePath("/members")
}
