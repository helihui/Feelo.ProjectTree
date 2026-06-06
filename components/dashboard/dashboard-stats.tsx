import { Card } from "@/components/ui/card"
import { PROJECTS } from "@/lib/data"
import { computeStats, computeProgress } from "@/lib/tree-utils"
import { FolderTree, CircleCheck, CircleDashed, OctagonAlert } from "lucide-react"

export function DashboardStats() {
  const allStats = PROJECTS.map((p) => computeStats(p.root))
  const totalNodes = allStats.reduce((s, x) => s + x.total, 0)
  const doneNodes = allStats.reduce((s, x) => s + x.done, 0)
  const progressNodes = allStats.reduce((s, x) => s + x.progress, 0)
  const blockedNodes = allStats.reduce((s, x) => s + x.blocked, 0)
  const avgProgress = Math.round(
    PROJECTS.reduce((s, p) => s + computeProgress(p.root), 0) / PROJECTS.length,
  )

  const stats = [
    {
      label: "进行中项目",
      value: PROJECTS.length,
      sub: `平均完成度 ${avgProgress}%`,
      icon: FolderTree,
      tint: "text-primary",
    },
    {
      label: "已完成节点",
      value: doneNodes,
      sub: `共 ${totalNodes} 个任务节点`,
      icon: CircleCheck,
      tint: "text-status-done-foreground",
    },
    {
      label: "进行中节点",
      value: progressNodes,
      sub: "正在推进",
      icon: CircleDashed,
      tint: "text-status-progress-foreground",
    },
    {
      label: "阻塞节点",
      value: blockedNodes,
      sub: "需优先处理",
      icon: OctagonAlert,
      tint: "text-status-blocked-foreground",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon
        return (
          <Card key={s.label} className="p-4">
            <div className="flex items-start justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <Icon className={`h-4 w-4 ${s.tint}`} />
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
          </Card>
        )
      })}
    </div>
  )
}
