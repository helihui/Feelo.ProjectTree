import { PageHeader } from "@/components/page-header"
import { ProfileView } from "@/components/profile/profile-view"

export const metadata = { title: "个人中心 · ProjectTree AI" }

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="个人中心" description="管理你的个人资料、头像与账号安全。" />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <ProfileView />
      </div>
    </>
  )
}
