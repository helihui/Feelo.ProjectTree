import Link from "next/link"
import { getInvitation } from "@/app/actions/invitations"
import { InviteForm } from "@/components/invite-form"
import { ROLE_LABELS, toRoleKey } from "@/lib/permissions"
import { GitBranch } from "lucide-react"

export const metadata = { title: "接受邀请 · ProjectTree AI" }

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invite = await getInvitation(token)

  if (!invite) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
            <GitBranch className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">邀请链接无效</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            链接可能已过期或已被使用，请联系管理员重新生成。
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

  return (
    <InviteForm
      token={token}
      email={invite.email}
      name={invite.name}
      roleLabel={ROLE_LABELS[toRoleKey(invite.roleKey)]}
    />
  )
}
