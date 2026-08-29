"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { promptTemplates as seed } from "@/lib/ai-config-data"
import type { PromptTemplate } from "@/lib/types"
import { FileText, Pencil, Variable } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export function PromptsView() {
  const [templates, setTemplates] = useState<PromptTemplate[]>(seed)
  const [editing, setEditing] = useState<PromptTemplate | null>(null)
  const [draft, setDraft] = useState("")

  const toggle = (id: string) =>
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)),
    )

  const openEdit = (t: PromptTemplate) => {
    setEditing(t)
    setDraft(t.content)
  }

  const save = () => {
    if (!editing) return
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === editing.id
          ? { ...t, content: draft, updatedAt: new Date().toISOString().slice(0, 10) }
          : t,
      ),
    )
    toast.success("模板已保存")
    setEditing(null)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className={cn("flex flex-col p-5", !t.enabled && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-4.5 w-4.5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold leading-tight">{t.name}</h3>
                    <Badge variant="secondary" className="mt-1.5 font-normal">
                      {t.scene}
                    </Badge>
                  </div>
                </div>
                <Switch checked={t.enabled} onCheckedChange={() => toggle(t.id)} />
              </div>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t.description}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.variables.map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                  >
                    <Variable className="h-3 w-3" />
                    {v}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">更新于 {t.updatedAt}</span>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openEdit(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑模板 · {editing?.name}</DialogTitle>
            <DialogDescription>
              使用 {"{{变量名}}"} 作为占位符，运行时将自动替换为真实值。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {editing?.variables.map((v) => (
                <span
                  key={v}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-content">模板内容</Label>
              <Textarea
                id="prompt-content"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-56 resize-none font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={save}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
