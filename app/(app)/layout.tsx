import type { ReactNode } from "react"
import { Sidebar } from "@/components/sidebar"
import { requireMember } from "@/lib/session"
import { hasPermission } from "@/lib/permissions"

/**
 * 受保护区域的共享布局。
 * 侧边栏与登录校验放在这一层，切换菜单时不会重新渲染，
 * 只有右侧内容区会被 loading.tsx 替换。
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await requireMember()

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <Sidebar
        name={member.name}
        initials={member.initials}
        roleKey={member.roleKey}
        canManageMembers={hasPermission(member.roleKey, "member:manage")}
        canConfigureAI={hasPermission(member.roleKey, "ai:configure")}
        canCreateProject={hasPermission(member.roleKey, "project:create")}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
