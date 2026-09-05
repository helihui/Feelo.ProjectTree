import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { CoreError, type Actor } from "@/lib/core/actor"
import {
  addCommentCore,
  addNodeCore,
  addSubtreeCore,
  createProjectCore,
  deleteNodeCore,
  deleteProjectCore,
  getNodeDetail,
  getProjectDetail,
  listMembers,
  listNodes,
  listProjects,
  updateNodeCore,
  updateProgressCore,
  updateProjectCore,
  updateProjectMembersCore,
  MAX_TREE_DEPTH,
  MAX_TREE_NODES,
} from "@/lib/core/projects"
import { writeAudit } from "@/lib/api-keys"
import {
  nodePatchSchema,
  nodeStatusSchema,
  nodeTypeSchema,
  prioritySchema,
  treeNodeInputSchema,
} from "./schemas"

export interface McpCaller {
  actor: Actor
  keyId: string
  keyName: string
}

type ToolResult = {
  content: { type: "text"; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

function ok(summary: string, data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: data,
  }
}

function fail(code: string, message: string): ToolResult {
  return {
    content: [{ type: "text", text: `[${code}] ${message}` }],
    structuredContent: { error: { code, message } },
    isError: true,
  }
}

/** 统一包裹：错误映射为机器可读的 code，并写审计 */
function guard<A>(
  caller: McpCaller,
  tool: string,
  fn: (args: A) => Promise<ToolResult>,
  projectIdOf?: (args: A) => string | undefined,
) {
  return async (args: A): Promise<ToolResult> => {
    const started = Date.now()
    const projectId = projectIdOf?.(args) ?? null
    try {
      const result = await fn(args)
      writeAudit({
        keyId: caller.keyId,
        memberId: caller.actor.memberId,
        tool,
        projectId,
        ok: !result.isError,
        errorCode: result.isError ? "tool_error" : null,
        durationMs: Date.now() - started,
      })
      return result
    } catch (err) {
      const code = err instanceof CoreError ? err.code : "internal_error"
      const message = err instanceof Error ? err.message : String(err)
      writeAudit({
        keyId: caller.keyId,
        memberId: caller.actor.memberId,
        tool,
        projectId,
        ok: false,
        errorCode: code,
        durationMs: Date.now() - started,
      })
      if (!(err instanceof CoreError)) {
        console.error(`[mcp] ${tool} failed:`, err)
        return fail("internal_error", "服务端内部错误")
      }
      return fail(code, message)
    }
  }
}

export function registerTools(server: McpServer, caller: McpCaller) {
  const { actor } = caller

  // ---- 项目 ----

  server.registerTool(
    "list_projects",
    {
      title: "列出项目",
      description:
        "分页返回项目摘要（id、名称、描述、负责人、成员、节点总数、整体进度、创建与更新时间），按创建时间倒序。用于先拿到 projectId 再做后续操作。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe("返回条数，默认 50"),
        offset: z.number().int().min(0).optional().describe("偏移量，默认 0"),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(caller, "list_projects", async ({ limit, offset }) => {
      const projects = await listProjects(limit ?? 50, offset ?? 0)
      return ok(
        `共 ${projects.length} 个项目：${projects.map((p) => `${p.name}(${p.id}, ${p.progress}%)`).join("、") || "无"}`,
        { projects, count: projects.length },
      )
    }),
  )

  server.registerTool(
    "get_project",
    {
      title: "获取项目详情",
      description:
        "返回单个项目的完整信息与嵌套节点树。树很大时用 depth 限制层级，或改用 list_nodes 分层读取。",
      inputSchema: z.object({
        projectId: z.string().min(1).describe("项目 id，形如 p_xxx"),
        depth: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("返回的树层级，默认全部返回；根节点为第 1 层"),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(
      caller,
      "get_project",
      async ({ projectId, depth }) => {
        const project = await getProjectDetail(projectId, depth ?? 99)
        if (!project) return fail("not_found", "项目不存在")
        return ok(`项目「${project.name}」，根节点 ${project.root.children.length} 个直接子节点`, {
          project,
        })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "create_project",
    {
      title: "创建项目",
      description: `创建项目并一次性写入完整任务树。tree 由调用方（客户端模型）自行拆解后传入，服务端只做校验与落库。不传 tree 时只建一个空的根节点。单次上限 ${MAX_TREE_NODES} 个节点、${MAX_TREE_DEPTH} 层深度。需要 project:create 权限。`,
      inputSchema: z.object({
        name: z.string().min(1).max(120).describe("项目名称，同时作为根节点标题"),
        description: z.string().max(2000).optional().describe("项目描述"),
        tree: treeNodeInputSchema.optional().describe("根节点及其嵌套子节点；不传则只建空根节点"),
        memberIds: z
          .array(z.string())
          .optional()
          .describe("初始参与成员 memberId 数组；密钥归属成员始终自动加入"),
      }),
    },
    guard(caller, "create_project", async ({ name, description, tree, memberIds }) => {
      const { projectId, nodeCount } = await createProjectCore(actor, {
        name,
        description,
        tree,
        memberIds,
      })
      return ok(`已创建项目「${name}」，写入 ${nodeCount} 个节点，projectId=${projectId}`, {
        projectId,
        nodeCount,
      })
    }),
  )

  server.registerTool(
    "update_project",
    {
      title: "更新项目信息",
      description:
        "修改项目名称或描述。改名会同步更新根节点标题。管理员可改任意项目，项目经理只能改自己创建的。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
      }),
    },
    guard(
      caller,
      "update_project",
      async ({ projectId, name, description }) => {
        if (name === undefined && description === undefined) {
          return fail("invalid_input", "name 与 description 至少提供一个")
        }
        await updateProjectCore(actor, projectId, { name, description })
        return ok(`项目 ${projectId} 已更新`, { projectId, updated: { name, description } })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "delete_project",
    {
      title: "删除项目",
      description:
        "删除项目及其全部节点与评论，不可恢复。管理员可删任意项目，项目经理只能删自己创建的。",
      inputSchema: z.object({ projectId: z.string().min(1) }),
      annotations: { destructiveHint: true },
    },
    guard(
      caller,
      "delete_project",
      async ({ projectId }) => {
        await deleteProjectCore(actor, projectId)
        return ok(`项目 ${projectId} 及其全部节点、评论已删除`, { projectId, deleted: true })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "update_project_members",
    {
      title: "设置项目参与成员",
      description:
        "整体覆盖项目的参与成员列表。不存在的 memberId 会被自动过滤，项目创建者始终保留。先用 list_members 拿到 memberId。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        memberIds: z.array(z.string()).describe("完整的成员 id 列表，覆盖式写入"),
      }),
    },
    guard(
      caller,
      "update_project_members",
      async ({ projectId, memberIds }) => {
        const next = await updateProjectMembersCore(actor, projectId, memberIds)
        return ok(`项目 ${projectId} 现有 ${next.length} 名成员`, { projectId, memberIds: next })
      },
      (a) => a.projectId,
    ),
  )

  // ---- 节点树 ----

  server.registerTool(
    "list_nodes",
    {
      title: "列出节点",
      description:
        "返回项目下的扁平节点列表，可按父节点、状态、负责人过滤。适合增量读取大树：先 parentId=null 拿根，再逐层下钻。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        parentId: z
          .string()
          .nullable()
          .optional()
          .describe("按父节点过滤；传 null 只返回根节点；不传返回全部"),
        status: nodeStatusSchema.optional().describe("按状态过滤"),
        assigneeId: z.string().optional().describe("按负责人 memberId 过滤"),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(
      caller,
      "list_nodes",
      async ({ projectId, parentId, status, assigneeId }) => {
        const nodes = await listNodes(projectId, { parentId, status, assigneeId })
        return ok(`匹配到 ${nodes.length} 个节点`, { nodes, count: nodes.length })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "get_node",
    {
      title: "获取节点详情",
      description: "返回单个节点的全部字段、直接子节点 id 列表与全部评论。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        nodeId: z.string().min(1),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(
      caller,
      "get_node",
      async ({ projectId, nodeId }) => {
        const node = await getNodeDetail(projectId, nodeId)
        return ok(`节点「${node.title}」，状态 ${node.status}，进度 ${node.progress}%`, { node })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "add_node",
    {
      title: "新增单个节点",
      description: "在指定父节点下追加一个节点。需要 node:manage 权限。要一次挂多层结构请用 add_subtree。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        parentId: z.string().min(1).describe("父节点 id；根节点 id 可用 list_nodes 取得"),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        type: nodeTypeSchema.optional(),
        status: nodeStatusSchema.optional(),
        priority: prioritySchema.optional(),
        assigneeIds: z.array(z.string()).optional(),
        startDate: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        estimateHours: z.number().int().min(0).optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
    guard(
      caller,
      "add_node",
      async ({ projectId, parentId, ...input }) => {
        const nodeId = await addNodeCore(actor, projectId, parentId, input)
        return ok(`已新增节点「${input.title}」，nodeId=${nodeId}`, { nodeId, projectId })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "add_subtree",
    {
      title: "挂载子树",
      description: `在指定父节点下一次性挂载整棵嵌套子树，用于批量补充规划。单次上限 ${MAX_TREE_NODES} 个节点、${MAX_TREE_DEPTH} 层。需要 node:manage 权限。`,
      inputSchema: z.object({
        projectId: z.string().min(1),
        parentId: z.string().min(1),
        tree: treeNodeInputSchema.describe("子树根节点及其后代"),
      }),
    },
    guard(
      caller,
      "add_subtree",
      async ({ projectId, parentId, tree }) => {
        const { rootId, nodeCount } = await addSubtreeCore(actor, projectId, parentId, tree)
        return ok(`已挂载 ${nodeCount} 个节点，子树根 nodeId=${rootId}`, {
          rootId,
          nodeCount,
          projectId,
        })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "update_node",
    {
      title: "更新节点",
      description:
        "更新节点字段。持有 node:manage 可改全部字段；仅有 node:updateOwn 时只能改指派给自己的节点的 status 与 progress，其余字段会被忽略。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        nodeId: z.string().min(1),
        patch: nodePatchSchema.describe("只传需要修改的字段"),
      }),
    },
    guard(
      caller,
      "update_node",
      async ({ projectId, nodeId, patch }) => {
        const fields = await updateNodeCore(actor, projectId, nodeId, patch)
        return ok(`节点 ${nodeId} 已更新字段：${fields.join("、")}`, {
          nodeId,
          projectId,
          updatedFields: fields,
        })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "update_progress",
    {
      title: "批量推进进度",
      description:
        "一次提交多个节点的 status / progress，避免多次往返。逐条独立判权，返回每条的成功与失败原因，部分失败不影响其余。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        updates: z
          .array(
            z.object({
              nodeId: z.string().min(1),
              status: nodeStatusSchema.optional(),
              progress: z.number().int().min(0).max(100).optional(),
            }),
          )
          .min(1)
          .max(200)
          .describe("每项至少提供 status 或 progress 之一"),
      }),
    },
    guard(
      caller,
      "update_progress",
      async ({ projectId, updates }) => {
        const results = await updateProgressCore(actor, projectId, updates)
        const okCount = results.filter((r) => r.ok).length
        return ok(`成功 ${okCount} 条，失败 ${results.length - okCount} 条`, {
          projectId,
          results,
          okCount,
          failedCount: results.length - okCount,
        })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "delete_node",
    {
      title: "删除节点",
      description:
        "删除节点及其全部子孙节点与相关评论，不可恢复。根节点不可删除（请用 delete_project）。需要 node:manage 权限。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        nodeId: z.string().min(1),
      }),
      annotations: { destructiveHint: true },
    },
    guard(
      caller,
      "delete_node",
      async ({ projectId, nodeId }) => {
        const removed = await deleteNodeCore(actor, projectId, nodeId)
        return ok(`已删除 ${removed} 个节点（含子孙）`, { projectId, nodeId, removed })
      },
      (a) => a.projectId,
    ),
  )

  // ---- 成员与评论 ----

  server.registerTool(
    "list_members",
    {
      title: "列出成员",
      description:
        "返回成员列表（id、姓名、邮箱、角色）。传 projectId 时只返回该项目的参与成员。用于把人名解析成 memberId 后填入 assigneeIds。",
      inputSchema: z.object({
        projectId: z.string().optional().describe("只列出该项目的参与成员"),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(
      caller,
      "list_members",
      async ({ projectId }) => {
        const list = await listMembers(projectId)
        return ok(`共 ${list.length} 名成员：${list.map((m) => `${m.name}(${m.id})`).join("、")}`, {
          members: list,
          count: list.length,
        })
      },
      (a) => a.projectId,
    ),
  )

  server.registerTool(
    "add_comment",
    {
      title: "发表评论",
      description: "在指定节点下发表评论，作者为密钥归属成员。需要 comment:write 权限。",
      inputSchema: z.object({
        projectId: z.string().min(1),
        nodeId: z.string().min(1),
        content: z.string().min(1).max(4000),
      }),
    },
    guard(
      caller,
      "add_comment",
      async ({ projectId, nodeId, content }) => {
        const comment = await addCommentCore(actor, projectId, nodeId, content)
        return ok(`已在节点 ${nodeId} 发表评论`, { comment, projectId })
      },
      (a) => a.projectId,
    ),
  )

  // ---- 自省 ----

  server.registerTool(
    "whoami",
    {
      title: "查看当前身份与权限",
      description:
        "返回当前密钥对应的成员、角色与生效权限。接入调试时先调这个确认鉴权是否打通、权限是否够用。",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(caller, "whoami", async () => {
      const effective =
        actor.scopes === null
          ? "全部（会话身份）"
          : actor.scopes.join("、") || "（无写权限，只读）"
      return ok(
        `密钥「${caller.keyName}」以成员 ${actor.memberId} 身份调用，角色 ${actor.roleKey}，生效权限：${effective}`,
        {
          keyName: caller.keyName,
          memberId: actor.memberId,
          roleKey: actor.roleKey,
          scopes: actor.scopes ?? [],
          limits: { maxTreeNodes: MAX_TREE_NODES, maxTreeDepth: MAX_TREE_DEPTH },
        },
      )
    }),
  )
}
