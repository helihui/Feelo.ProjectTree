import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { SkeletonBlock } from "@/components/skeletons"
import { buttonVariants } from "@/components/ui/button"
import { DashboardStats } from "@/components/dashboard/dashboard-stats"
import { ProjectGrid } from "@/components/dashboard/project-grid"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { requireMember } from "@/lib/session"
import { hasPermission } from "@/lib/permissions"
import { Sparkles } from "lucide-react"
import Link from "next/link"

export default async function DashboardPage() {
  const member = await requireMember()
  const canCreate = hasPermission(member.roleKey, "project:create")
  return (
    <>
      <PageHeader
        title="工作台概览"
        description="掌握所有项目的整体进度、风险与今日重点。"
        actions={
          canCreate ? (
            <Link href="/create" className={buttonVariants()}>
              <Sparkles className="h-4 w-4" />
              AI 创建项目
            </Link>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Suspense
          fallback={
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-[104px]" />
              ))}
            </div>
          }
        >
          <DashboardStats />
        </Suspense>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Suspense
              fallback={
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonBlock key={i} className="h-[196px]" />
                  ))}
                </div>
              }
            >
              <ProjectGrid />
            </Suspense>
            <Suspense fallback={<SkeletonBlock className="h-[248px]" />}>
              <MyTasks memberId={member.memberId} />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SkeletonBlock className="h-[320px]" />}>
              <ActivityFeed />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}
