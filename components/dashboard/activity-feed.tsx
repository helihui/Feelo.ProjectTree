import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ACTIVITIES, getUser, getProject } from "@/lib/data"

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = new Date("2026-06-04T12:00:00").getTime()
  const mins = Math.round((now - then) / 60000)
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  return `${days} 天前`
}

export function ActivityFeed() {
  return (
    <Card className="p-4">
      <h2 className="mb-4 text-sm font-semibold">最近活动</h2>
      <ol className="relative space-y-5 before:absolute before:left-[11px] before:top-1 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
        {ACTIVITIES.map((a) => {
          const u = getUser(a.userId)
          const project = getProject(a.projectId)
          return (
            <li key={a.id} className="relative flex gap-3">
              <Avatar className="z-10 h-6 w-6 shrink-0">
                <AvatarFallback
                  className="text-[10px] font-semibold text-primary-foreground"
                  style={{ backgroundColor: u.color }}
                >
                  {u.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm leading-snug">
                  <span className="font-medium">{u.name}</span>
                  <span className="text-muted-foreground"> {a.action} </span>
                  <span className="font-medium">{a.target}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {project?.name} · {timeAgo(a.createdAt)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
