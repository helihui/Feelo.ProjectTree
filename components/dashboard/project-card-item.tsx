"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/status-badge"
import { ProjectRouteLink } from "@/components/project/project-route-link"
import { deleteProject } from "@/app/actions/projects"
import type { ProjectCard } from "@/lib/queries/dashboard"
import { ArrowUpRight, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"

export function ProjectCardItem({
  project: p,
  canDelete,
}: {
  project: ProjectCard
  canDelete: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [pending, startTransition] = useTransition()

  const confirmDelete = () => {
    setConfirming(false)
    setRemoved(true)
    startTransition(async () => {
      try {
        await deleteProject(p.id)
        toast.success("项目已删除")
      } catch (e) {
        setRemoved(false)
        toast.error(e instanceof Error ? e.message : "删除失败，请刷新重试")
      }
    })
  }

  if (removed) return null

  return (
    <>
      <div className="group relative">
        <ProjectRouteLink href={`/projects/${p.id}`} prefetchOnMount>
          <Card className="h-full p-4 transition-colors group-hover:border-primary/40">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{p.name}</h3>
                {p.aiGenerated && <Sparkles className="h-3.5 w-3.5 text-primary" />}
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
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

        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            aria-label="删除项目"
            title="删除项目"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setConfirming(true)
            }}
            className="absolute right-10 top-3 h-7 w-7 text-muted-foreground transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>
              确定删除「{p.name}」吗？该项目下的 {p.total} 个任务节点与全部评论都会一并删除，操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
