import { Card } from "@/components/ui/card"
import { getMyTasks } from "@/lib/queries/dashboard"
import { formatDate, daysUntil } from "@/lib/tree-utils"
import type { NodeStatus } from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { CalendarClock } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProjectRouteLink } from "@/components/project/project-route-link"

export async function MyTasks({ memberId }: { memberId: string }) {
  const tasks = await getMyTasks(memberId, 5)

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">我的待办</h2>
      <Card className="divide-y divide-border p-0">
        {tasks.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            暂无指派给你的待办任务
          </p>
        )}
        {tasks.map((t) => {
          const days = daysUntil(t.dueDate)
          const overdue = days !== null && days < 0
          return (
            <ProjectRouteLink
              key={t.id}
              href={`/projects/${t.projectId}?node=${t.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
              prefetchOnMount
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.title}</p>
                <p className="truncate text-xs text-muted-foreground">{t.projectName}</p>
              </div>
              <div
                className={cn(
                  "hidden items-center gap-1 text-xs sm:flex",
                  overdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {formatDate(t.dueDate)}
              </div>
              <StatusBadge status={t.status as NodeStatus} />
            </ProjectRouteLink>
          )
        })}
      </Card>
    </section>
  )
}
