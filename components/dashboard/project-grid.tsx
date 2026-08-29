import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getProjectCards } from "@/lib/queries/dashboard"
import { StatusBadge } from "@/components/status-badge"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { ProjectRouteLink } from "@/components/project/project-route-link"

export async function ProjectGrid() {
  const cards = await getProjectCards(4)

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
        {cards.map((p) => (
          <ProjectRouteLink key={p.id} href={`/projects/${p.id}`} prefetchOnMount>
            <Card className="group h-full p-4 transition-colors hover:border-primary/40">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{p.name}</h3>
                  {p.aiGenerated && <Sparkles className="h-3.5 w-3.5 text-primary" />}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {p.description}
              </p>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">完成度</span>
                <span className="font-semibold">{p.progress}%</span>
              </div>
              <Progress value={p.progress} className="mt-1.5 h-1.5" />

              <div className="mt-4 flex items-center justify-between">
                <div className="flex -space-x-2">
                  {p.members.map((u) => (
                    <Avatar key={u.id} className="h-6 w-6 border-2 border-card">
                      <AvatarFallback
                        className="text-[10px] font-semibold text-primary-foreground"
                        style={{ backgroundColor: u.color }}
                      >
                        {u.initials}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {p.blocked > 0 && <StatusBadge status="blocked" />}
                  <span>
                    {p.done}/{p.total} 节点
                  </span>
                </div>
              </div>
            </Card>
          </ProjectRouteLink>
        ))}
      </div>
    </section>
  )
}
