import { AppShell, PageHeader } from "@/components/app-shell"
import { buttonVariants } from "@/components/ui/button"
import { ProjectGrid } from "@/components/dashboard/project-grid"
import { Sparkles } from "lucide-react"
import Link from "next/link"

export default function ProjectsPage() {
  return (
    <AppShell>
      <PageHeader
        title="全部项目"
        description="管理你参与的所有树形项目。"
        actions={
          <Link href="/create" className={buttonVariants()}>
            <Sparkles className="h-4 w-4" />
            AI 创建项目
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <ProjectGrid />
      </div>
    </AppShell>
  )
}
