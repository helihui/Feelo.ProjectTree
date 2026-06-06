import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

/** 获取当前会话，未登录返回 null */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/** 要求登录，未登录跳转到登录页，返回当前用户 */
export async function requireUser() {
  const session = await getSession()
  if (!session?.user) redirect("/sign-in")
  return session.user
}
