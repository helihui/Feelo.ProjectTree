"use client"

import { useState } from "react"
import type { NodeStatus, Project, TreeNode } from "@/lib/types"
import {
  STATUS_META,
  NODE_TYPE_META,
  PRIORITY_META,
  computeProgress,
  computeStats,
  formatDate,
  daysUntil,
} from "@/lib/tree-utils"
import { getUser, CURRENT_USER } from "@/lib/data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  X,
  Sparkles,
  CalendarClock,
  Clock,
  Tag,
  Send,
} from "lucide-react"

export function NodeDetailPanel({
  node,
  project,
  onClose,
  onStatusChange,
  onProgressChange,
  onUpdate,
}: {
  node: TreeNode
  project: Project
  onClose: () => void
  onStatusChange: (id: string, status: NodeStatus) => void
  onProgressChange: (id: string, progress: number) => void
  onUpdate: (id: string, patch: Partial<TreeNode>) => void
}) {
  const [commentDraft, setCommentDraft] = useState("")
  const isLeaf = node.children.length === 0
  const progress = computeProgress(node)
  const stats = computeStats(node)
  const days = daysUntil(node.dueDate)

  const submitComment = () => {
    const text = commentDraft.trim()
    if (!text) return
    onUpdate(node.id, {
      comments: [
        ...node.comments,
        {
          id: `c${Date.now()}`,
          authorId: CURRENT_USER.id,
          content: text,
          createdAt: new Date().toISOString().slice(0, 10),
        },
      ],
    })
    setCommentDraft("")
  }

  return (
    <aside className="flex w-full max-w-md shrink-0 flex-col border-l border-border bg-card md:w-96">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {NODE_TYPE_META[node.type].label}
          </span>
          {node.aiGenerated && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
              <Sparkles className="h-3 w-3" />
              AI 生成
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h2 className="text-pretty text-base font-semibold leading-snug">
          {node.title}
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {node.description}
        </p>

        {/* 状态 + 优先级 */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">状态</label>
            <Select
              value={node.status}
              onValueChange={(v) => onStatusChange(node.id, v as NodeStatus)}
            >
              <SelectTrigger className="mt-1.5 h-8 w-full">
                <SelectValue>
                  {(value: NodeStatus) => (
                    <span className="flex items-center gap-2">
                      <span
                        className={cn("h-2 w-2 rounded-full", STATUS_META[value].dot)}
                      />
                      {STATUS_META[value].label}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_META) as NodeStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn("h-2 w-2 rounded-full", STATUS_META[s].dot)}
                      />
                      {STATUS_META[s].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">优先级</label>
            <div className="mt-1.5 flex h-8 items-center">
              <span className={cn("text-sm font-medium", PRIORITY_META[node.priority].className)}>
                {PRIORITY_META[node.priority].label}优先级
              </span>
            </div>
          </div>
        </div>

        {/* 进度 */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              {isLeaf ? "完成进度" : "汇总进度（按子任务自动计算）"}
            </label>
            <span className="text-sm font-semibold tabular-nums">{progress}%</span>
          </div>
          {isLeaf ? (
            <Slider
              value={[progress]}
              max={100}
              step={5}
              onValueChange={(v) => onProgressChange(node.id, v[0])}
              className="mt-3"
            />
          ) : (
            <>
              <Progress value={progress} className="mt-2 h-2" />
              <p className="mt-2 text-xs text-muted-foreground">
                共 {stats.total} 个子节点，已完成 {stats.done} 个
                {stats.blocked > 0 && `，${stats.blocked} 个阻塞`}
              </p>
            </>
          )}
        </div>

        {/* 元信息 */}
        <div className="mt-5 space-y-3 rounded-lg border border-border p-3">
          <MetaRow icon={CalendarClock} label="截止日期">
            <span
              className={cn(
                days !== null && days < 0 && node.status !== "done"
                  ? "font-medium text-destructive"
                  : "",
              )}
            >
              {formatDate(node.dueDate)}
              {days !== null && node.status !== "done" && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {days < 0 ? `已逾期 ${-days} 天` : `剩 ${days} 天`}
                </span>
              )}
            </span>
          </MetaRow>
          <MetaRow icon={Clock} label="预估工时">
            {node.estimateHours > 0 ? `${node.estimateHours} 小时` : "—"}
          </MetaRow>
          <MetaRow icon={Tag} label="标签">
            {node.tags.length ? (
              <span className="flex flex-wrap gap-1">
                {node.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                  >
                    {t}
                  </span>
                ))}
              </span>
            ) : (
              "—"
            )}
          </MetaRow>
        </div>

        {/* 负责人 */}
        <div className="mt-5">
          <label className="text-xs font-medium text-muted-foreground">负责人</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {node.assigneeIds.map((id) => {
              const u = getUser(id)
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-2.5 text-sm"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarFallback
                      className="text-[9px] font-semibold text-primary-foreground"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.initials}
                    </AvatarFallback>
                  </Avatar>
                  {u.name}
                </span>
              )
            })}
          </div>
        </div>

        {/* 评论 */}
        <div className="mt-6">
          <label className="text-xs font-medium text-muted-foreground">
            评论 ({node.comments.length})
          </label>
          <div className="mt-2 space-y-3">
            {node.comments.map((c) => {
              const u = getUser(c.authorId)
              return (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback
                      className="text-[10px] font-semibold text-primary-foreground"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{u.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-pretty text-sm leading-relaxed text-foreground/90">
                      {c.content}
                    </p>
                  </div>
                </div>
              )
            })}
            {node.comments.length === 0 && (
              <p className="text-sm text-muted-foreground">还没有评论。</p>
            )}
          </div>
        </div>
      </div>

      {/* 评论输入 */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="添加评论..."
            rows={1}
            className="min-h-9 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment()
            }}
          />
          <Button size="icon" onClick={submitComment} aria-label="发送">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  )
}
