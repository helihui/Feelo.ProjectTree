import { PageHeader } from "@/components/page-header"
import { getMembersFull } from "@/app/actions/projects"
import { MembersView } from "@/components/members/members-view"
import { requirePermission } from "@/lib/session"
import { toRoleKey } from "@/lib/permissions"

export const metadata = {
  title: "成员管理 · ProjectTree",
  description: "管理团队成员，支持新增、编辑与删除。",
}

function toDateLabel(value: Date | string | number): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "string") return value.slice(0, 10)
  return new Date(value).toISOString().slice(0, 10)
}

export default async function MembersPage() {
  const current = await requirePermission("member:manage")
  const members = await getMembersFull()
  return (
    <>
      <PageHeader title="成员管理" description="管理团队成员与权限角色，并通过邀请链接开通登录账号。" />
      <MembersView
        currentMemberId={current.memberId}
        initialMembers={members.map((m) => ({
          id: m.id,
          name: m.name,
          initials: m.initials,
          color: m.color,
          email: m.email,
          role: m.role,
          roleKey: toRoleKey(m.roleKey),
          hasAccount: m.hasAccount,
          pendingInviteToken: m.pendingInviteToken,
          createdAt: toDateLabel(m.createdAt),
        }))}
      />
    </>
  )
}
