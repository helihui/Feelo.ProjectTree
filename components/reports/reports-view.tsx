"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { STATUS_META } from "@/lib/tree-utils"
import type { ReportData, ReportProject } from "@/lib/queries/dashboard"
import { Download, Copy, Sparkles, Check } from "lucide-react"
import { toast } from "sonner"

export function ReportsView({
  projects,
  data,
}: {
  projects: ReportProject[]
  data: ReportData | null
}) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  const markdown = useMemo(() => {
    if (!data) return ""
    const lines: string[] = []
    lines.push(`# ${data.projectName} · 进度报告`)
    lines.push("")
    lines.push(`> 生成时间：${new Date().toLocaleDateString("zh-CN")}`)
    lines.push("")
    lines.push(`## 总览`)
    lines.push(`- 整体进度：**${data.progress}%**`)
    lines.push(
      `- 节点总数：${data.total}（已完成 ${data.done} · 进行中 ${data.progressCount} · 阻塞 ${data.blockedCount} · 未开始 ${data.todoCount}）`,
    )
    lines.push("")
    lines.push(`## 本周进展`)
    if (data.inProgress.length) {
      data.inProgress.forEach((n) => lines.push(`- ${n.title}（${n.progress}%）`))
    } else {
      lines.push("- 暂无进行中的任务")
    }
    lines.push("")
    lines.push(`## 风险与阻塞`)
    if (data.blocked.length) {
      data.blocked.forEach((n) => lines.push(`- ⚠️ ${n.title} — 需尽快处理`))
    } else {
      lines.push("- 当前无阻塞项")
    }
    lines.push("")
    lines.push(`## 下周计划`)
    data.upcoming.forEach((n) => lines.push(`- ${n.title}`))
    return lines.join("\n")
  }, [data])

  const copy = async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    toast.success("已复制 Markdown")
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    if (!data) return
    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${data.projectName}-进度报告.md`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("报告已下载")
  }

  return (
    <>
      <PageHeader
        title="进度报告"
        description="基于项目树实时数据，一键生成可导出的进度报告。"
        actions={
          data ? (
            <Select
              value={data.projectId}
              onValueChange={(v) => v && router.push(`/reports?project=${v}`)}
            >
              <SelectTrigger className="w-56">
                <SelectValue>
                  {(v: string) => projects.find((p) => p.id === v)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!data ? (
          <p className="py-12 text-center text-sm text-muted-foreground">暂无项目数据</p>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">整体进度</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {data.progress}%
                </div>
              </Card>
              {(["done", "progress", "blocked"] as const).map((s) => (
                <Card key={s} className="p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
                    {STATUS_META[s].label}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {s === "done"
                      ? data.done
                      : s === "progress"
                        ? data.progressCount
                        : data.blockedCount}
                  </div>
                </Card>
              ))}
            </div>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">AI 生成的进度报告</span>
                  <Badge variant="secondary" className="font-normal">
                    Markdown
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    复制
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={download}>
                    <Download className="h-3.5 w-3.5" />
                    导出 .md
                  </Button>
                </div>
              </div>
              <div className="bg-muted/30 p-5">
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
                  {markdown}
                </pre>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
