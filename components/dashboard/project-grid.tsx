import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PROJECTS, getUser } from "@/lib/data"
import { computeProgress, computeStats } from "@/lib/tree-utils"
import { StatusBadge } from "@/components/status-badge"
import { ArrowUpRight, Sparkles } from "lucide-react"

export function ProjectGrid() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">我的项目</h2>
        <Link
          href="/projects"
          className="text-xs font-medium text-primary hover:underline"
        >
          查看全部
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PROJECTS.map((p) => {
          const progress = computeProgress(p.root)
          const stats = computeStats(p.root)
          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="group h-full p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{p.name}</h3>
                    {p.root.aiGenerated && (
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {p.description}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">完成度</span>
                  <span className="font-semibold">{progress}%</span>
                </div>
                <Progress value={progress} className="mt-1.5 h-1.5" />

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {p.memberIds.slice(0, 4).map((id) => {
                      const u = getUser(id)
                      return (
                        <Avatar
                          key={id}
                          className="h-6 w-6 border-2 border-card"
                        >
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {stats.blocked > 0 && (
                      <StatusBadge status="blocked" />
                    )}
                    <span>{stats.done}/{stats.total} 节点</span>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
