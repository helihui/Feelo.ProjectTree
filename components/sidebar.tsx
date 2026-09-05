"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  FolderTree,
  Sparkles,
  Cpu,
  FileText,
  MessageSquareText,
  Settings,
  GitBranch,
  KeyRound,
  BookOpen,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions"

export function Sidebar({
  name,
  initials,
  roleKey,
  canManageMembers,
  canConfigureAI,
  canCreateProject,
}: {
  name: string
  initials: string
  roleKey: RoleKey
  canManageMembers: boolean
  canConfigureAI: boolean
  canCreateProject: boolean
}) {
  const pathname = usePathname()

  const nav = [
    { href: "/", label: "概览", icon: LayoutDashboard, show: true },
    { href: "/projects", label: "项目", icon: FolderTree, show: true },
    { href: "/members", label: "成员", icon: Users, show: canManageMembers },
    { href: "/create", label: "AI 创建", icon: Sparkles, show: canCreateProject },
    { href: "/reports", label: "进度报告", icon: FileText, show: true },
  ].filter((i) => i.show)

  const navSettings = [
    ...(canConfigureAI
      ? [
          { href: "/models", label: "AI 模型", icon: Cpu },
          { href: "/prompts", label: "Prompt 模板", icon: MessageSquareText },
        ]
      : []),
    { href: "/api-keys", label: "API 密钥", icon: KeyRound },
    { href: "/mcp-docs", label: "MCP 对接文档", icon: BookOpen },
  ]

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  const linkClass = (href: string) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      isActive(href)
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    )

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GitBranch className="h-4.5 w-4.5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">项目树</span>
          <span className="text-[10px] font-medium tracking-wider text-muted-foreground">
            AI 智能工作台
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>

        {navSettings.length > 0 && (
          <>
            <div className="mt-6 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              配置
            </div>
            <div className="space-y-1">
              {navSettings.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/profile"
          className={cn(
            "flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent/60",
            pathname.startsWith("/profile") && "bg-sidebar-accent",
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {ROLE_LABELS[roleKey]}
            </span>
          </div>
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </aside>
  )
}
