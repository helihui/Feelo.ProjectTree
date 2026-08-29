import { PageHeader } from "@/components/page-header"
import { ModelsView } from "@/components/models/models-view"
import { requirePermission } from "@/lib/session"

export default async function ModelsPage() {
  await requirePermission("ai:configure")
  return (
    <>
      <PageHeader
        title="AI 模型"
        description="管理多模型供应商、默认与备用策略，确保拆解服务高可用。"
      />
      <ModelsView />
    </>
  )
}
