import type { Project, TreeNode } from "@/lib/types"
import { computeProgress, computeStats } from "@/lib/tree-utils"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getUser } from "@/lib/data"
import { STATUS_META } from "@/lib/tree-utils"
import { cn } from "@/lib/utils"

export function ProjectSummaryBar({
  root,
  project,
}: {
  root: TreeNode
  project: Project
}) {
  const progress = computeProgress(root)
  const stats = computeStats(root)

  const segments: { status: keyof typeof STATUS_META; count: number }[] = [
    { status: "done", count: stats.done },
    { status: "progress", count: stats.progress },
    { status: "blocked", count: stats.blocked },
    { status: "paused", count: stats.paused },
    { status: "todo", count: stats.todo },
  ]

  return (
    <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-col gap-1.5 lg:max-w-md">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">整体完成度</span>
          <span className="font-semibold tabular-nums">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {segments
            .filter((s) => s.count > 0)
            .map((s) => (
              <div key={s.status} className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn("h-2 w-2 rounded-full", STATUS_META[s.status].dot)}
                />
                <span className="text-muted-foreground">
                  {STATUS_META[s.status].label}
                </span>
                <span className="font-semibold tabular-nums">{s.count}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground">团队成员</span>
          <div className="mt-1 flex -space-x-2">
            {project.memberIds.map((id) => {
              const u = getUser(id)
              return (
                <Avatar key={id} className="h-7 w-7 border-2 border-background">
                  <AvatarFallback
                    className="text-[10px] font-semibold text-primary-foreground"
                    style={{ backgroundColor: u.color }}
                  >
                    {u.initials}
                  </AvatarFallback>
                </Avatar>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
