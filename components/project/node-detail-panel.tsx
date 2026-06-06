"use client"

import { useEffect, useState } from "react"
import type { NodeStatus, Project, TreeNode, User } from "@/lib/types"
import {
  STATUS_META,
  NODE_TYPE_META,
  PRIORITY_META,
  computeProgress,
  computeStats,
  formatDate,
  daysUntil,
  resolveUser,
} from "@/lib/tree-utils"
import { CURRENT_USER } from "@/lib/data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AssigneePicker } from "./assignee-picker"
import { TagPicker } from "./tag-picker"
import {
  X,
  Sparkles,
  CalendarClock,
  Clock,
  Tag,
  Send,
  Minus,
  Plus,
  Pencil,
  Check,
  Trash2,
} from "lucide-react"

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const

export function NodeDetailPanel({
  node,
  project,
  members,
  allTags,
  onClose,
  onStatusChange,
  onProgressChange,
  onUpdate,
  onAddChild,
  onDelete,
}: {
  node: TreeNode
  project: Project
  members: User[]
  allTags: string[]
  onClose: () => void
  onStatusChange: (id: string, status: NodeStatus) => void
  onProgressChange: (id: string, progress: number) => void
  onUpdate: (id: string, patch: Partial<TreeNode>) => void
  onAddChild: () => void
  onDelete: () => void
}) {
  const [commentDraft, setCommentDraft] = useState("")
  const [editingMeta, setEditingMeta] = useState(false)
  const [title, setTitle] = useState(node.title)
  const [description, setDescription] = useState(node.description)

  // 切换节点时同步标题/描述本地状态
  useEffect(() => {
    setTitle(node.title)
    setDescription(node.description)
    setEditingMeta(false)
  }, [node.id, node.title, node.description])

  const isLeaf = node.children.length === 0
  const isRoot = node.type === "root" || node.type === "milestone"
  const progress = computeProgress(node)
  const stats = computeStats(node)
  const days = daysUntil(node.dueDate)

  const saveTitle = () => {
    const t = title.trim()
    if (t && t !== node.title) onUpdate(node.id, { title: t })
    else setTitle(node.title)
  }

  const saveDescription = () => {
    if (description !== node.description) onUpdate(node.id, { description })
  }

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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onAddChild}
            aria-label="添加子节点"
            title="添加子节点"
          >
            <Plus className="h-4 w-4" />
          </Button>
          {!isRoot && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label="删除节点"
              title="删除节点"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* 标题（可编辑） */}
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="h-auto border-transparent bg-transparent px-0 py-0 text-base font-semibold shadow-none focus-visible:border-input focus-visible:px-2 focus-visible:py-1"
          aria-label="节点标题"
        />

        {/* 描述（可编辑） */}
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          rows={3}
          placeholder="添加描述..."
          className="mt-2 resize-none border-transparent bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:border-input focus-visible:px-2 focus-visible:py-1"
          aria-label="节点描述"
        />

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
            <Select
              value={node.priority}
              onValueChange={(v) => onUpdate(node.id, { priority: v as TreeNode["priority"] })}
            >
              <SelectTrigger className="mt-1.5 h-8 w-full">
                <SelectValue>
                  {(value: TreeNode["priority"]) => (
                    <span className={cn("font-medium", PRIORITY_META[value].className)}>
                      {PRIORITY_META[value].label}优先级
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className={cn("font-medium", PRIORITY_META[p].className)}>
                      {PRIORITY_META[p].label}优先级
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="减少 5%"
                  onClick={() => onProgressChange(node.id, Math.max(0, progress - 5))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Slider
                  value={[progress]}
                  max={100}
                  step={5}
                  onValueChange={(v) => {
                    const next = Array.isArray(v) ? v[0] : v
                    if (typeof next === "number" && !Number.isNaN(next)) {
                      onProgressChange(node.id, next)
                    }
                  }}
                  className="flex-1 py-2"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="增加 5%"
                  onClick={() => onProgressChange(node.id, Math.min(100, progress + 5))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {[0, 25, 50, 75, 100].map((p) => (
                  <Button
                    key={p}
                    variant={progress === p ? "default" : "outline"}
                    size="sm"
                    className="h-8 px-0 text-xs tabular-nums"
                    onClick={() => onProgressChange(node.id, p)}
                  >
                    {p}%
                  </Button>
                ))}
              </div>
            </div>
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

        {/* 元信息（可编辑） */}
        <div className="mt-5 space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">详细信息</span>
            <button
              type="button"
              onClick={() => setEditingMeta((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {editingMeta ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  完成
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </>
              )}
            </button>
          </div>

          {editingMeta ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">开始日期</label>
                  <Input
                    type="date"
                    value={node.startDate ?? ""}
                    onChange={(e) => onUpdate(node.id, { startDate: e.target.value || null })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">截止日期</label>
                  <Input
                    type="date"
                    value={node.dueDate ?? ""}
                    onChange={(e) => onUpdate(node.id, { dueDate: e.target.value || null })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">预估工时（小时）</label>
                <Input
                  type="number"
                  min={0}
                  value={node.estimateHours || ""}
                  onChange={(e) =>
                    onUpdate(node.id, { estimateHours: Number(e.target.value) || 0 })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">标签</label>
                <TagPicker
                  suggestions={allTags}
                  value={node.tags}
                  onChange={(tags) => onUpdate(node.id, { tags })}
                />
              </div>
            </div>
          ) : (
            <>
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
                  <span className="flex flex-wrap justify-end gap-1">
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
            </>
          )}
        </div>

        {/* 负责人（可编辑） */}
        <div className="mt-5">
          <label className="text-xs font-medium text-muted-foreground">负责人</label>
          <div className="mt-2">
            <AssigneePicker
              members={members}
              value={node.assigneeIds}
              onChange={(ids) => onUpdate(node.id, { assigneeIds: ids })}
            />
          </div>
        </div>

        {/* 评论 */}
        <div className="mt-6">
          <label className="text-xs font-medium text-muted-foreground">
            评论 ({node.comments.length})
          </label>
          <div className="mt-2 space-y-3">
            {node.comments.map((c) => {
              const u = resolveUser(members, c.authorId)
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
