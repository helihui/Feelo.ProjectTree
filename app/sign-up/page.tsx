import { redirect } from "next/navigation"
import Link from "next/link"
import { getSession } from "@/lib/session"
import { db } from "@/lib/db"
import { members } from "@/lib/db/schema"
import { ensureSchema } from "@/lib/db"
import { count, eq } from "drizzle-orm"
import { AuthForm } from "@/components/auth-form"
import { GitBranch } from "lucide-react"

export const metadata = { title: "注册 · ProjectTree AI" }

export default async function SignUpPage() {
  const session = await getSession()
  if (session?.user) redirect("/")

  // 邀请制：仅在系统尚无管理员时开放公开注册，用于初始化首个管理员
  await ensureSchema()
  const [{ value: adminCount }] = await db
    .select({ value: count() })
    .from(members)
    .where(eq(members.roleKey, "admin"))

  if (adminCount > 0) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
            <GitBranch className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">注册已关闭</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            本系统采用邀请制，请联系管理员为你生成邀请链接。
          </p>
          <Link
            href="/sign-in"
            className="mt-5 inline-block text-sm font-medium underline-offset-4 hover:underline"
          >
            返回登录
          </Link>
        </div>
      </div>
    )
  }

  return <AuthForm mode="sign-up" />
}
