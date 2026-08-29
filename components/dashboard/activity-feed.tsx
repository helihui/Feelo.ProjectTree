import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getRecentActivities } from "@/lib/queries/dashboard"

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}

export async function ActivityFeed() {
  const activities = await getRecentActivities(6)

  return (
    <Card className="p-4">
      <h2 className="mb-4 text-sm font-semibold">最近活动</h2>
      {activities.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">暂无动态</p>
      ) : (
        <ol className="relative space-y-5 before:absolute before:left-[11px] before:top-1 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
          {activities.map((a) => (
            <li key={a.id} className="relative flex gap-3">
              <Avatar className="z-10 h-6 w-6 shrink-0">
                <AvatarFallback
                  className="text-[10px] font-semibold text-primary-foreground"
                  style={{ backgroundColor: a.color }}
                >
                  {a.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm leading-snug">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground"> 评论了 </span>
                  <span className="font-medium">{a.nodeTitle}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {a.projectName} · {timeAgo(a.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
