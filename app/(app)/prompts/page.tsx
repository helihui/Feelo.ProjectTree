import { PageHeader } from "@/components/page-header"
import { PromptsView } from "@/components/prompts/prompts-view"
import { requirePermission } from "@/lib/session"

export default async function PromptsPage() {
  await requirePermission("ai:configure")
  return (
    <>
      <PageHeader
        title="Prompt 模板"
        description="管理各业务场景的提示词模板，支持变量占位与启用开关。"
      />
      <PromptsView />
    </>
  )
}
