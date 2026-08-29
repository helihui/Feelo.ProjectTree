import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { SkeletonBlock } from "@/components/skeletons"
import { buttonVariants } from "@/components/ui/button"
import { ProjectGrid } from "@/components/dashboard/project-grid"
import { requireMember } from "@/lib/session"
import { hasPermission } from "@/lib/permissions"
import { Sparkles } from "lucide-react"
import Link from "next/link"

export default async function ProjectsPage() {
  const member = await requireMember()
  const canCreate = hasPermission(member.roleKey, "project:create")
  return (
    <>
      <PageHeader
        title="全部项目"
        description="管理你参与的所有树形项目。"
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-[196px]" />
              ))}
            </div>
          }
        >
          <ProjectGrid />
        </Suspense>
      </div>
    </>
  )
}
