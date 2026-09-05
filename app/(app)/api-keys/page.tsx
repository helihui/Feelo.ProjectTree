import { PageHeader } from "@/components/page-header"
import { ApiKeysView } from "@/components/api-keys/api-keys-view"
import { getApiKeys } from "@/app/actions/api-keys"
import { getMembersFull } from "@/app/actions/projects"
import { requireMember } from "@/lib/session"

export const metadata = {
  title: "API 密钥 · ProjectTree",
  description: "签发与管理 MCP 接入密钥。",
}

export default async function ApiKeysPage() {
  const me = await requireMember()
  const keys = await getApiKeys()
  // 只有管理员能把密钥签给别人，普通成员不需要成员列表
  const members =
    me.roleKey === "admin"
      ? (await getMembersFull()).map((m) => ({ id: m.id, name: m.name }))
      : [{ id: me.memberId, name: me.name }]

  return (
    <>
      <PageHeader
        title="API 密钥"
        description="签发密钥给第三方，让其通过 MCP 端点读写项目与任务树。密钥原文仅在签发时显示一次。"
      />
      <ApiKeysView
        initialKeys={keys}
        members={members}
        canAssignOthers={me.roleKey === "admin"}
        currentMemberId={me.memberId}
      />
    </>
  )
}
