import { PageHeader } from "@/components/page-header"
import { CreateProjectFlow } from "@/components/create/create-project-flow"
import { requirePermission } from "@/lib/session"

export default async function CreatePage() {
  await requirePermission("project:create")
  return (
    <>
      <PageHeader
        title="AI 创建项目"
        description="描述你的目标，AI 将自动拆解为可执行的树形任务结构。"
      />
      <div className="flex-1 overflow-y-auto">
        <CreateProjectFlow />
      </div>
    </>
  )
}
