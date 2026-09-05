import type { Project, TreeNode, User } from "@/lib/types"
import { computeProgress, computeStats } from "@/lib/tree-utils"
import { Progress } from "@/components/ui/progress"
import { STATUS_META } from "@/lib/tree-utils"
import { cn } from "@/lib/utils"
import { ProjectMembersBar } from "./project-members-bar"

export function ProjectSummaryBar({
  root,
  project,
  members,
  canManageMembers,
}: {
  root: TreeNode
  project: Project
  members: User[]
  canManageMembers: boolean
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
        <ProjectMembersBar
          projectId={project.id}
          ownerId={project.ownerId}
          memberIds={project.memberIds}
          members={members}
          canManage={canManageMembers}
        />
      </div>
    </div>
  )
}
