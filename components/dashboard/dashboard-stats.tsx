import { Card } from "@/components/ui/card"
import { getDashboardOverview } from "@/lib/queries/dashboard"
import { FolderTree, CircleCheck, CircleDashed, OctagonAlert } from "lucide-react"

export async function DashboardStats() {
  const o = await getDashboardOverview()

  const stats = [
    {
      label: "进行中项目",
      value: o.projectCount,
      sub: `平均完成度 ${o.avgProgress}%`,
      icon: FolderTree,
      tint: "text-primary",
    },
    {
      label: "已完成节点",
      value: o.doneNodes,
      sub: `共 ${o.totalNodes} 个任务节点`,
      icon: CircleCheck,
      tint: "text-status-done-foreground",
    },
    {
      label: "进行中节点",
      value: o.progressNodes,
      sub: "正在推进",
      icon: CircleDashed,
      tint: "text-status-progress-foreground",
    },
    {
      label: "阻塞节点",
      value: o.blockedNodes,
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
