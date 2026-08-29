"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GenerateInput } from "@/lib/mock-ai"
import { Sparkles, ArrowLeft, Lightbulb } from "lucide-react"
import { cn } from "@/lib/utils"

const EXAMPLES = [
  {
    title: "电商 App 重构",
    text: "重构现有电商 App，包含商品浏览、购物车、下单支付、订单管理、用户中心五大模块，需要在 Q3 上线，团队 8 人。",
  },
  {
    title: "品牌官网改版",
    text: "为 SaaS 公司打造全新品牌官网，包含首页、产品页、定价页、博客、客户案例，强调动效与转化率。",
  },
  {
    title: "数据中台建设",
    text: "搭建企业数据中台，覆盖数据采集、清洗、建模、可视化看板与权限管理，分两期交付。",
  },
]

const DEPTH_OPTIONS = [
  { value: "3", label: "精简（3 层）" },
  { value: "4", label: "标准（4 层）" },
  { value: "5", label: "详细（5 层）" },
]

const STYLE_OPTIONS = [
  { value: "balanced", label: "均衡" },
  { value: "agile", label: "敏捷迭代" },
  { value: "waterfall", label: "瀑布阶段" },
]

export function CreateForm({
  onSubmit,
  defaultValue,
}: {
  onSubmit: (data: GenerateInput) => void
  defaultValue: GenerateInput | null
}) {
  const [name, setName] = useState(defaultValue?.name ?? "")
  const [requirement, setRequirement] = useState(defaultValue?.requirement ?? "")
  const [depth, setDepth] = useState(String(defaultValue?.depth ?? 4))
  const [style, setStyle] = useState(defaultValue?.style ?? "balanced")

  const canSubmit = requirement.trim().length >= 10

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
      </div>

      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          用 AI 把需求拆解成树形项目
        </h1>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          描述你的项目目标，AI 会自动生成可执行的多层级任务树。
        </p>
      </div>

      <Card className="p-6">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">项目名称（可选）</Label>
            <Input
              id="project-name"
              placeholder="例如：FEELO V2 产品迭代"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="requirement">需求描述</Label>
            <Textarea
              id="requirement"
              placeholder="尽量描述清楚项目目标、核心模块、约束条件、时间与团队规模……"
              className="min-h-36 resize-none"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              至少 10 个字。描述越具体，生成的任务树越贴合。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>拆解深度</Label>
              <Select value={depth} onValueChange={(v) => v && setDepth(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {(v: string) => DEPTH_OPTIONS.find((o) => o.value === v)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEPTH_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>拆解风格</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as GenerateInput["style"])}>
                <SelectTrigger>
                  <SelectValue>
                    {(v: string) => STYLE_OPTIONS.find((o) => o.value === v)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                name: name.trim() || "未命名项目",
                requirement: requirement.trim(),
                depth: Number(depth),
                style,
              })
            }
          >
            <Sparkles className="h-4 w-4" />
            生成任务树
          </Button>
        </div>
      </Card>

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
          试试这些示例
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.title}
              type="button"
              onClick={() => {
                setName(ex.title)
                setRequirement(ex.text)
              }}
              className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <Badge variant="secondary" className="mb-2">
                {ex.title}
              </Badge>
              <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {ex.text}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
