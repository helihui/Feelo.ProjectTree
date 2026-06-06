import { requireUser } from "@/lib/session"
import { AppShell, PageHeader } from "@/components/app-shell"
import { ProfileView } from "@/components/profile/profile-view"

export const metadata = { title: "个人中心 · ProjectTree AI" }

export default async function ProfilePage() {
  const user = await requireUser()
  return (
    <AppShell>
      <PageHeader title="个人中心" description="管理你的个人资料、头像与账号安全。" />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <ProfileView
          user={{
            name: user.name,
            email: user.email,
            image: user.image ?? null,
          }}
        />
      </div>
    </AppShell>
  )
}
