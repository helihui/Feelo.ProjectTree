import type { NodeStatus, Priority, TreeNode } from "./types"

let counter = 1000
const gid = () => `gen${++counter}`

interface BlueprintNode {
  title: string
  description: string
  priority?: Priority
  estimate?: number
  children?: BlueprintNode[]
}

/** 不同场景模板的拆解蓝图 */
const BLUEPRINTS: Record<string, BlueprintNode[]> = {
  product: [
    {
      title: "产品规划",
      description: "明确产品目标、用户画像与核心功能范围。",
      priority: "high",
      children: [
        { title: "需求调研", description: "用户访谈与竞品分析。", estimate: 40 },
        { title: "PRD 撰写", description: "输出产品需求文档。", estimate: 32 },
        { title: "功能优先级排期", description: "确定 MVP 范围与迭代节奏。", estimate: 16 },
      ],
    },
    {
      title: "设计",
      description: "完成交互与视觉设计。",
      priority: "high",
      children: [
        { title: "交互原型", description: "核心流程的高保真原型。", estimate: 48 },
        { title: "视觉设计", description: "界面视觉与设计规范。", estimate: 56 },
        { title: "设计走查", description: "设计与产品评审对齐。", estimate: 12 },
      ],
    },
    {
      title: "研发",
      description: "前后端开发与联调。",
      priority: "urgent",
      children: [
        { title: "后端接口开发", description: "核心业务接口与数据模型。", estimate: 120 },
        { title: "前端页面开发", description: "页面与组件实现。", estimate: 100 },
        { title: "前后端联调", description: "接口联调与缺陷修复。", estimate: 40 },
      ],
    },
    {
      title: "测试与上线",
      description: "质量保障与发布。",
      priority: "medium",
      children: [
        { title: "功能测试", description: "覆盖核心流程的测试用例。", estimate: 48 },
        { title: "灰度发布", description: "分阶段灰度与监控。", estimate: 24 },
        { title: "正式上线", description: "全量发布与复盘。", estimate: 16 },
      ],
    },
  ],
  tech: [
    {
      title: "架构设计",
      description: "技术选型与系统架构设计。",
      priority: "urgent",
      children: [
        { title: "技术选型", description: "评估并确定技术栈。", estimate: 24 },
        { title: "架构方案评审", description: "输出架构文档并评审。", estimate: 32 },
      ],
    },
    {
      title: "基础设施",
      description: "环境、CI/CD 与可观测性。",
      priority: "high",
      children: [
        { title: "环境搭建", description: "开发/测试/生产环境。", estimate: 40 },
        { title: "CI/CD 流水线", description: "自动化构建与部署。", estimate: 32 },
        { title: "监控告警", description: "日志、指标与告警体系。", estimate: 24 },
      ],
    },
    {
      title: "核心模块开发",
      description: "分模块迭代实现。",
      priority: "urgent",
      children: [
        { title: "模块 A", description: "核心业务模块。", estimate: 88 },
        { title: "模块 B", description: "支撑业务模块。", estimate: 72 },
        { title: "模块 C", description: "扩展功能模块。", estimate: 64 },
      ],
    },
    {
      title: "测试与交付",
      description: "压测、安全与交付。",
      priority: "high",
      children: [
        { title: "性能压测", description: "全链路压力测试。", estimate: 40 },
        { title: "安全审计", description: "安全扫描与加固。", estimate: 32 },
        { title: "交付上线", description: "发布与文档交付。", estimate: 24 },
      ],
    },
  ],
  marketing: [
    {
      title: "策略与定位",
      description: "明确营销目标与人群定位。",
      priority: "high",
      children: [
        { title: "市场分析", description: "目标市场与竞争格局。", estimate: 32 },
        { title: "传播策略", description: "渠道与节奏规划。", estimate: 24 },
      ],
    },
    {
      title: "内容生产",
      description: "多形式内容创意与生产。",
      priority: "medium",
      children: [
        { title: "创意脚本", description: "核心创意与文案。", estimate: 40 },
        { title: "素材制作", description: "图文、视频素材。", estimate: 56 },
      ],
    },
    {
      title: "投放与运营",
      description: "渠道投放与活动运营。",
      priority: "high",
      children: [
        { title: "渠道投放", description: "多渠道广告投放。", estimate: 48 },
        { title: "活动运营", description: "线上线下活动。", estimate: 40 },
        { title: "数据复盘", description: "ROI 分析与优化。", estimate: 24 },
      ],
    },
  ],
}

function blueprintToTree(bp: BlueprintNode, depth: number): TreeNode {
  const type =
    depth === 0 ? "epic" : bp.children && bp.children.length ? "task" : "subtask"
  return {
    id: gid(),
    title: bp.title,
    description: bp.description,
    type,
    status: "todo" as NodeStatus,
    priority: bp.priority ?? "medium",
    progress: 0,
    assigneeIds: [],
    startDate: null,
    dueDate: null,
    estimateHours: bp.estimate ?? 0,
    tags: [],
    comments: [],
    aiGenerated: true,
    children: (bp.children ?? []).map((c) => blueprintToTree(c, depth + 1)),
  }
}

export interface GenerateInput {
  name: string
  requirement: string
  template: "product" | "tech" | "marketing"
  depth: number
}

/** 模拟 AI 拆解：基于模板蓝图生成树 */
export function mockGenerateTree(input: GenerateInput): TreeNode {
  const blueprint = BLUEPRINTS[input.template] ?? BLUEPRINTS.product
  return {
    id: gid(),
    title: input.name || "未命名项目",
    description: input.requirement || "由 AI 根据需求自动拆解生成。",
    type: "milestone",
    status: "todo",
    priority: "high",
    progress: 0,
    assigneeIds: [],
    startDate: null,
    dueDate: null,
    estimateHours: 0,
    tags: ["AI 生成"],
    comments: [],
    aiGenerated: true,
    children: blueprint.map((b) => blueprintToTree(b, 0)),
  }
}

export const GENERATION_STEPS = [
  "理解需求语义",
  "识别核心目标与约束",
  "拆解里程碑与大型任务",
  "细化任务与子任务",
  "估算工时与优先级",
  "构建树形结构",
]
