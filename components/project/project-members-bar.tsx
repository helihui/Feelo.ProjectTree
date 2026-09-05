"use client"

import { useState, useTransition } from "react"
import type { User } from "@/lib/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { updateProjectMembers } from "@/app/actions/projects"
import { cn } from "@/lib/utils"
import { Check, Plus, Search } from "lucide-react"
import { toast } from "sonner"

export function ProjectMembersBar({
  projectId,
  ownerId,
  memberIds,
  members,
  canManage,
}: {
  projectId: string
  ownerId: string
  memberIds: string[]
  members: User[]
  canManage: boolean
}) {
  const [ids, setIds] = useState<string[]>(memberIds)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(memberIds)
  const [query, setQuery] = useState("")
  const [pending, startTransition] = useTransition()

  const joined = ids
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is User => !!m)

  const openDialog = () => {
    setDraft(ids)
    setQuery("")
    setOpen(true)
  }

  const toggle = (id: string) => {
    if (id === ownerId) return // 创建者不可移除
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const save = () => {
    startTransition(async () => {
      try {
        const next = await updateProjectMembers(projectId, draft)
        setIds(next)
        setOpen(false)
        toast.success("项目成员已更新")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失败，请重试")
      }
    })
  }

  const q = query.trim().toLowerCase()
  const visible = q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members

  return (
    <>
      <div className="flex flex-col items-end">
        <span className="text-xs text-muted-foreground">团队成员 {joined.length}</span>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex -space-x-2">
            {joined.slice(0, 6).map((u) => (
              <Avatar
                key={u.id}
                className="h-7 w-7 border-2 border-background"
                title={u.name}
              >
                <AvatarFallback
                  className="text-[10px] font-semibold text-primary-foreground"
                  style={{ backgroundColor: u.color }}
                >
                  {u.initials}
                </AvatarFallback>
              </Avatar>
            ))}
            {joined.length > 6 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground">
                +{joined.length - 6}
              </span>
            )}
          </div>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={openDialog}
              className="h-7 gap-1 px-2 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              成员
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>管理项目成员</DialogTitle>
            <DialogDescription>
              勾选参与本项目的成员。已选 {draft.length} 人，创建者不可移除。
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索姓名或岗位"
              className="pl-8"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                没有匹配的成员
              </p>
            ) : (
              visible.map((u) => {
                const checked = draft.includes(u.id)
                const locked = u.id === ownerId
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.id)}
                    disabled={locked}
                    className={cn(
                      "flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left text-sm outline-none last:border-b-0",
                      locked ? "cursor-not-allowed opacity-70" : "hover:bg-accent",
                    )}
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback
                        className="text-[10px] font-semibold text-primary-foreground"
                        style={{ backgroundColor: u.color }}
                      >
                        {u.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{u.name}</span>
                      {locked && (
                        <span className="block text-xs text-muted-foreground">创建者</span>
                      )}
                    </span>
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0 text-primary",
                        checked ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </button>
                )
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
