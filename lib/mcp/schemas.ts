import { z } from "zod"

export const nodeStatusSchema = z.enum(["todo", "progress", "done", "blocked", "paused"])
export const nodeTypeSchema = z.enum([
  "root",
  "milestone",
  "phase",
  "epic",
  "module",
  "task",
  "subtask",
])
export const prioritySchema = z.enum(["low", "medium", "high", "urgent"])

/** ISO 日期 yyyy-MM-dd */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 yyyy-MM-dd")
  .nullable()

export const treeNodeInputSchema: z.ZodType<TreeNodeInput> = z.lazy(() =>
  z.object({
    title: z.string().min(1).max(200).describe("节点标题，必填"),
    description: z.string().max(2000).optional().describe("节点描述"),
    type: nodeTypeSchema.optional().describe("节点类型，默认 task（根节点自动为 root）"),
    status: nodeStatusSchema.optional().describe("状态，默认 todo"),
    priority: prioritySchema.optional().describe("优先级，默认 medium"),
    progress: z.number().int().min(0).max(100).optional().describe("进度 0-100，默认 0"),
    assigneeIds: z.array(z.string()).optional().describe("负责人 memberId 数组"),
    startDate: dateSchema.optional().describe("开始日期 yyyy-MM-dd"),
    dueDate: dateSchema.optional().describe("截止日期 yyyy-MM-dd"),
    estimateHours: z.number().int().min(0).max(100000).optional().describe("预估工时（小时）"),
    tags: z.array(z.string().max(40)).optional().describe("标签数组"),
    children: z.array(treeNodeInputSchema).optional().describe("子节点数组，可递归嵌套"),
  }),
)

export interface TreeNodeInput {
  title: string
  description?: string
  type?: z.infer<typeof nodeTypeSchema>
  status?: z.infer<typeof nodeStatusSchema>
  priority?: z.infer<typeof prioritySchema>
  progress?: number
  assigneeIds?: string[]
  startDate?: string | null
  dueDate?: string | null
  estimateHours?: number
  tags?: string[]
  children?: TreeNodeInput[]
}

export const nodePatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: nodeStatusSchema.optional(),
  priority: prioritySchema.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  assigneeIds: z.array(z.string()).optional(),
  startDate: dateSchema.optional(),
  dueDate: dateSchema.optional(),
  estimateHours: z.number().int().min(0).max(100000).optional(),
  tags: z.array(z.string().max(40)).optional(),
})
