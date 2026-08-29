import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { members } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import { toRoleKey, hasPermission, type Permission, type RoleKey } from "@/lib/permissions"
import { MEMBERS_TAG } from "@/lib/cache-tags"
import { count, eq, isNull, and } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

/** 获取当前会话，未登录返回 null（同一次请求内只查一次） */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

/** 要求登录，未登录跳转到登录页，返回当前用户 */
export async function requireUser() {
  const session = await getSession()
  if (!session?.user) redirect("/sign-in")
  return session.user
}

export interface CurrentMember {
  userId: string
  memberId: string
  name: string
  email: string
  initials: string
  color: string
  roleKey: RoleKey
}

function initialsOf(name: string) {
  const trimmed = name.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return trimmed.slice(0, 2).toUpperCase() || "U"
}

/**
 * 已绑定成员的读取走 Next 数据缓存，按 userId 分键、挂 MEMBERS_TAG。
 * 命中后整次导航不需要访问数据库（数据库在美国东部，单次往返约 250ms）。
 */
const getBoundMember = (userId: string) =>
  unstable_cache(
    async () => {
      const [bound] = await db.select().from(members).where(eq(members.userId, userId))
      return bound ?? null
    },
    ["bound-member", userId],
    { tags: [MEMBERS_TAG], revalidate: 300 },
  )()

/**
 * 获取当前登录用户对应的成员记录。
 * 若尚未绑定，则按邮箱认领已有成员，否则创建一条新成员。
 * 系统内第一个成员自动成为管理员。
 * 用 cache 包裹，同一次请求内只执行一次。
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const session = await getSession()
  const user = session?.user
  if (!user) return null

  // 进程内已 memoize，命中后不产生数据库往返
  await ensureSeeded()

  const bound = await getBoundMember(user.id)
  if (bound) {
    return {
      userId: user.id,
      memberId: bound.id,
      name: bound.name,
      email: user.email,
      initials: bound.initials,
      color: bound.color,
      roleKey: toRoleKey(bound.roleKey),
    }
  }

  // 缓存里是「未绑定」，绕过缓存再确认一次，避免刚绑定完又重复建成员
  const [reBound] = await db.select().from(members).where(eq(members.userId, user.id))
  if (reBound) {
    return {
      userId: user.id,
      memberId: reBound.id,
      name: reBound.name,
      email: user.email,
      initials: reBound.initials,
      color: reBound.color,
      roleKey: toRoleKey(reBound.roleKey),
    }
  }

  // 按邮箱认领尚未绑定账号的成员记录
  const [claimable] = user.email
    ? await db
        .select()
        .from(members)
        .where(and(eq(members.email, user.email), isNull(members.userId)))
    : []

  // 是否已存在管理员，没有则当前用户成为管理员
  const [{ value: adminCount }] = await db
    .select({ value: count() })
    .from(members)
    .where(eq(members.roleKey, "admin"))
  const promoteToAdmin = adminCount === 0

  if (claimable) {
    const roleKey = promoteToAdmin ? "admin" : toRoleKey(claimable.roleKey)
    await db
      .update(members)
      .set({ userId: user.id, roleKey })
      .where(eq(members.id, claimable.id))
    return {
      userId: user.id,
      memberId: claimable.id,
      name: claimable.name,
      email: user.email,
      initials: claimable.initials,
      color: claimable.color,
      roleKey,
    }
  }

  const id = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const roleKey: RoleKey = promoteToAdmin ? "admin" : "member"
  const initials = initialsOf(user.name || user.email)
  const color = "oklch(0.52 0.18 258)"
  await db.insert(members).values({
    id,
    name: user.name || user.email,
    initials,
    color,
    email: user.email,
    role: promoteToAdmin ? "管理员" : "成员",
    roleKey,
    userId: user.id,
  })

  return {
    userId: user.id,
    memberId: id,
    name: user.name || user.email,
    email: user.email,
    initials,
    color,
    roleKey,
  }
})

/** 要求登录并返回成员信息，未登录跳转登录页 */
export async function requireMember(): Promise<CurrentMember> {
  const member = await getCurrentMember()
  if (!member) redirect("/sign-in")
  return member
}

/** 要求具备指定权限，不足时跳转首页 */
export async function requirePermission(permission: Permission): Promise<CurrentMember> {
  const member = await requireMember()
  if (!hasPermission(member.roleKey, permission)) redirect("/")
  return member
}

/** 在 Server Action 中校验权限，不足时抛错 */
export async function assertPermission(permission: Permission): Promise<CurrentMember> {
  const member = await getCurrentMember()
  if (!member) throw new Error("请先登录")
  if (!hasPermission(member.roleKey, permission)) throw new Error("没有操作权限")
  return member
}
