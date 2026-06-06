"use client"

import { useEffect, useState } from "react"
import type { NodeType, Priority, TreeNode, User } from "@/lib/types"
import { NODE_TYPE_META } from "@/lib/tree-utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AssigneePicker } from "./assignee-picker"
import { TagPicker } from "./tag-picker"

export interface AddNodeInput {
  title: string
  description?: string
  type?: NodeType
  priority?: Priority
  assigneeIds?: string[]
  startDate?: string | null
  dueDate?: string | null
  estimateHours?: number
  tags?: string[]
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
]

const TYPE_OPTIONS: NodeType[] = ["epic", "module", "task", "subtask"]

export function AddNodeDialog({
  open,
  parent,
  members,
  allTags,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  parent: TreeNode | null
  members: User[]
  allTags: string[]
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AddNodeInput) => Promise<void> | void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<NodeType>("task")
  const [priority, setPriority] = useState<Priority>("medium")
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [estimateHours, setEstimateHours] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 每次打开时重置表单
  useEffect(() => {
    if (open) {
      setTitle("")
      setDescription("")
      setType("task")
      setPriority("medium")
      setAssigneeIds(parent?.assigneeIds ?? [])
      setStartDate("")
      setDueDate("")
      setEstimateHours("")
      setTags([])
    }
  }, [open, parent])

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        type,
        priority,
        assigneeIds,
        startDate: startDate || null,
        dueDate: dueDate || null,
        estimateHours: estimateHours ? Number(estimateHours) : 0,
        tags,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加子节点</DialogTitle>
          <DialogDescription>
            {parent ? `在「${parent.title}」下新增一个节点` : "新增节点"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-0.5 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="node-title">标题</Label>
            <Input
              id="node-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：完成接口联调"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="node-desc">描述</Label>
            <Textarea
              id="node-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充节点说明（可选）"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as NodeType)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {NODE_TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>优先级</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="node-start">开始日期</Label>
              <Input
                id="node-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="node-due">截止日期</Label>
              <Input
                id="node-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="node-hours">预估工时（小时）</Label>
            <Input
              id="node-hours"
              type="number"
              min={0}
              value={estimateHours}
              onChange={(e) => setEstimateHours(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>负责人</Label>
            <AssigneePicker
              members={members}
              value={assigneeIds}
              onChange={setAssigneeIds}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>标签</Label>
            <TagPicker suggestions={allTags} value={tags} onChange={setTags} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || submitting}>
            {submitting ? "添加中..." : "添加节点"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
