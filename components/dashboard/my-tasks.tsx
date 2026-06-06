import Link from "next/link"
import { Card } from "@/components/ui/card"
import { PROJECTS, CURRENT_USER } from "@/lib/data"
import { flattenNodes, formatDate, daysUntil } from "@/lib/tree-utils"
import { StatusBadge } from "@/components/status-badge"
import { CalendarClock } from "lucide-react"
import { cn } from "@/lib/utils"

export function MyTasks() {
  const myTasks = PROJECTS.flatMap((p) =>
    flattenNodes(p.root)
      .filter(
        (n) =>
          n.children.length === 0 &&
          n.assigneeIds.includes(CURRENT_USER.id) &&
          n.status !== "done",
      )
      .map((n) => ({ node: n, project: p })),
  )

  // FEELO 负责人样例：补充几条跨项目任务，确保非空
  const fallback = PROJECTS.flatMap((p) =>
    flattenNodes(p.root)
      .filter((n) => n.children.length === 0 && n.status !== "done")
      .slice(0, 2)
      .map((n) => ({ node: n, project: p })),
  )
  const tasks = (myTasks.length ? myTasks : fallback).slice(0, 5)

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">我的待办</h2>
      <Card className="divide-y divide-border p-0">
        {tasks.map(({ node, project }) => {
          const days = daysUntil(node.dueDate)
          const overdue = days !== null && days < 0
          return (
            <Link
              key={node.id}
              href={`/projects/${project.id}?node=${node.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{node.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {project.name}
                </p>
              </div>
              <div
                className={cn(
                  "hidden items-center gap-1 text-xs sm:flex",
                  overdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {formatDate(node.dueDate)}
              </div>
              <StatusBadge status={node.status} />
            </Link>
          )
        })}
      </Card>
    </section>
  )
}
