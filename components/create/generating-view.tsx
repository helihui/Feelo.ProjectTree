"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import type { GenerateInput } from "@/lib/mock-ai"
import { Check, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = [
  "理解需求与目标约束",
  "识别核心模块与里程碑",
  "拆解任务层级与依赖",
  "估算工作量与排期",
  "生成树形结构",
]

export function GeneratingView({
  input,
  onDone,
}: {
  input: GenerateInput
  onDone: () => void
}) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (active >= STEPS.length) {
      const t = setTimeout(onDone, 500)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setActive((a) => a + 1), 650)
    return () => clearTimeout(t)
  }, [active, onDone])

  return (
    <div className="mx-auto max-w-xl py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="h-6 w-6 animate-pulse text-primary" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">AI 正在拆解你的项目</h1>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {input.name} · {input.requirement.slice(0, 48)}
          {input.requirement.length > 48 ? "…" : ""}
        </p>
      </div>

      <Card className="p-6">
        <ul className="space-y-1">
          {STEPS.map((step, i) => {
            const done = i < active
            const current = i === active
            return (
              <li
                key={step}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                  current && "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    done && "border-[var(--status-done)] bg-[var(--status-done)] text-white",
                    current && "border-primary text-primary",
                    !done && !current && "border-border text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" />
                  ) : current ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="text-[10px]">{i + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    done && "text-foreground",
                    current && "font-medium text-foreground",
                    !done && !current && "text-muted-foreground",
                  )}
                >
                  {step}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
