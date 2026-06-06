import { AppShell, PageHeader } from "@/components/app-shell"
import { getMembersFull } from "@/app/actions/projects"
import { MembersView } from "@/components/members/members-view"

export const metadata = {
  title: "成员管理 · ProjectTree",
  description: "管理团队成员，支持新增、编辑与删除。",
}

export default async function MembersPage() {
  const members = await getMembersFull()
  return (
    <AppShell>
      <PageHeader title="成员管理" description="管理团队成员信息，成员可被指派为节点负责人。" />
      <MembersView
        initialMembers={members.map((m) => ({
          id: m.id,
          name: m.name,
          initials: m.initials,
          color: m.color,
          email: m.email,
          role: m.role,
          createdAt: m.createdAt.toISOString().slice(0, 10),
        }))}
      />
    </AppShell>
  )
}
