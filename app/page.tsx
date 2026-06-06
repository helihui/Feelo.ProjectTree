import { AppShell, PageHeader } from "@/components/app-shell"
import { buttonVariants } from "@/components/ui/button"
import { DashboardStats } from "@/components/dashboard/dashboard-stats"
import { ProjectGrid } from "@/components/dashboard/project-grid"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { Sparkles } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  return (
    <AppShell>
      <PageHeader
        title="工作台概览"
        description="掌握所有项目的整体进度、风险与今日重点。"
        actions={
          <Link href="/create" className={buttonVariants()}>
            <Sparkles className="h-4 w-4" />
            AI 创建项目
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <DashboardStats />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ProjectGrid />
            <MyTasks />
          </div>
          <div>
            <ActivityFeed />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
