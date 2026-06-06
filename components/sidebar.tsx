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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CURRENT_USER } from "@/lib/data"

const NAV = [
  { href: "/", label: "概览", icon: LayoutDashboard },
  { href: "/projects", label: "项目", icon: FolderTree },
  { href: "/create", label: "AI 创建", icon: Sparkles },
  { href: "/reports", label: "进度报告", icon: FileText },
]

const NAV_SETTINGS = [
  { href: "/models", label: "AI 模型", icon: Cpu },
  { href: "/prompts", label: "Prompt 模板", icon: MessageSquareText },
]

export function Sidebar() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GitBranch className="h-4.5 w-4.5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">ProjectTree</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            AI Workspace
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="mt-6 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          配置
        </div>
        <div className="space-y-1">
          {NAV_SETTINGS.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-sidebar-accent/60">
          <Avatar className="h-8 w-8">
            <AvatarFallback
              className="text-xs font-semibold text-primary-foreground"
              style={{ backgroundColor: CURRENT_USER.color }}
            >
              {CURRENT_USER.initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col leading-tight">
            <span className="text-sm font-medium">{CURRENT_USER.name}</span>
            <span className="text-xs text-muted-foreground">项目负责人</span>
          </div>
          <Settings className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </aside>
  )
}
