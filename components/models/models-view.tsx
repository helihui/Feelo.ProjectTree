"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { modelProviders as seed } from "@/lib/ai-config-data"
import type { ModelProvider } from "@/lib/types"
import { Cpu, Zap, CheckCircle2, Activity, Star, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export function ModelsView() {
  const [providers, setProviders] = useState<ModelProvider[]>(seed)

  const toggle = (id: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
    )
  }

  const setDefault = (id: string) => {
    setProviders((prev) =>
      prev.map((p) => ({ ...p, isDefault: p.id === id, enabled: p.id === id ? true : p.enabled })),
    )
    toast.success("已设为默认模型")
  }

  const setModel = (id: string, model: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selectedModel: model } : p)),
    )
  }

  const active = providers.filter((p) => p.enabled).length
  const totalCalls = providers.reduce((s, p) => s + p.monthlyCalls, 0)
  const avgLatency = Math.round(
    providers.filter((p) => p.enabled).reduce((s, p) => s + p.latencyMs, 0) / Math.max(active, 1),
  )

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={Cpu} label="启用供应商" value={`${active} / ${providers.length}`} />
          <StatCard icon={Activity} label="本月调用" value={totalCalls.toLocaleString()} />
          <StatCard icon={Zap} label="平均延迟" value={`${avgLatency}ms`} />
        </div>

        <div className="space-y-3">
          {providers.map((p) => (
            <Card key={p.id} className={cn("p-5", !p.enabled && "opacity-70")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Cpu className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{p.name}</h3>
                      {p.isDefault && (
                        <Badge className="gap-1 bg-primary text-primary-foreground">
                          <Star className="h-3 w-3" />
                          默认
                        </Badge>
                      )}
                      {p.isFallback && (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          备用
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-[var(--status-done)]" />
                        成功率 {p.successRate}%
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {p.latencyMs}ms
                      </span>
                      <span>本月 {p.monthlyCalls.toLocaleString()} 次</span>
                    </div>
                  </div>
                </div>
                <Switch checked={p.enabled} onCheckedChange={() => toggle(p.id)} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">模型</span>
                  <Select
                    value={p.selectedModel}
                    onValueChange={(v) => v && setModel(p.id, v)}
                    disabled={!p.enabled}
                  >
                    <SelectTrigger className="h-8 w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {p.models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!p.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={!p.enabled}
                    onClick={() => setDefault(p.id)}
                  >
                    设为默认
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <Card className="border-dashed p-5">
          <h3 className="text-sm font-semibold">降级策略</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            当默认模型连续失败或超时，系统将自动切换到「备用」供应商，保证 AI 拆解与报告生成不中断。
          </p>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  )
}
