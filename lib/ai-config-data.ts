import type { ModelProvider, PromptTemplate } from "./types"

export const modelProviders: ModelProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    enabled: true,
    isDefault: true,
    models: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
    selectedModel: "gpt-5",
    latencyMs: 820,
    successRate: 99.4,
    monthlyCalls: 12840,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    enabled: true,
    isDefault: false,
    isFallback: true,
    models: ["claude-opus-4.6", "claude-sonnet-4.5", "claude-haiku-4"],
    selectedModel: "claude-opus-4.6",
    latencyMs: 1120,
    successRate: 99.1,
    monthlyCalls: 4210,
  },
  {
    id: "google",
    name: "Google Gemini",
    enabled: true,
    isDefault: false,
    models: ["gemini-3-flash", "gemini-3-pro"],
    selectedModel: "gemini-3-flash",
    latencyMs: 640,
    successRate: 98.7,
    monthlyCalls: 6730,
  },
  {
    id: "xai",
    name: "xAI Grok",
    enabled: false,
    isDefault: false,
    models: ["grok-4", "grok-4-mini"],
    selectedModel: "grok-4",
    latencyMs: 950,
    successRate: 97.9,
    monthlyCalls: 0,
  },
]

export const promptTemplates: PromptTemplate[] = [
  {
    id: "tpl-decompose",
    name: "需求拆解",
    scene: "项目拆解",
    enabled: true,
    description: "把一段自然语言需求拆解为多层级任务树。",
    updatedAt: "2026-05-28",
    variables: ["requirement", "depth", "style"],
    content:
      "你是一名资深项目经理。请把以下需求拆解为 {{depth}} 层的任务树，风格为 {{style}}。\n\n需求：{{requirement}}\n\n要求：\n1. 顶层为阶段，其次为模块、任务、子任务。\n2. 每个叶子节点给出预计工作量（小时）。\n3. 输出 JSON。",
  },
  {
    id: "tpl-estimate",
    name: "工作量估算",
    scene: "排期估算",
    enabled: true,
    description: "为已有任务节点估算工作量与排期。",
    updatedAt: "2026-05-20",
    variables: ["taskTitle", "context"],
    content:
      "基于任务「{{taskTitle}}」及上下文 {{context}}，估算所需工作量（小时）与建议排期，并说明依赖与风险。",
  },
  {
    id: "tpl-report",
    name: "进度周报",
    scene: "报告生成",
    enabled: true,
    description: "根据节点状态自动生成进度周报。",
    updatedAt: "2026-06-01",
    variables: ["projectName", "stats", "blockers"],
    content:
      "为项目「{{projectName}}」生成本周进度周报。整体数据：{{stats}}。阻塞项：{{blockers}}。\n请用 Markdown 输出，包含：本周进展、风险与阻塞、下周计划。",
  },
  {
    id: "tpl-risk",
    name: "风险识别",
    scene: "风险分析",
    enabled: false,
    description: "扫描项目树识别潜在延期与阻塞风险。",
    updatedAt: "2026-04-30",
    variables: ["tree"],
    content:
      "分析以下项目树 {{tree}}，识别可能导致延期的风险节点，并按严重程度排序给出缓解建议。",
  },
  {
    id: "tpl-summary",
    name: "节点摘要",
    scene: "内容生成",
    enabled: true,
    description: "为任务节点生成简洁的描述与验收标准。",
    updatedAt: "2026-05-12",
    variables: ["title", "parentContext"],
    content:
      "为任务「{{title}}」（上下文：{{parentContext}}）撰写一段清晰描述与 3 条验收标准。",
  },
]
