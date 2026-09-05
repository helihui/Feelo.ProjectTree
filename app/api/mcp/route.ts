import { createMcpHandler } from "mcp-handler"
import { verifyApiKey, type VerifyFailure } from "@/lib/api-keys"
import { registerTools, type McpCaller } from "@/lib/mcp/tools"

/** MCP 端点必须跑在 Node 运行时：核心层直连 pg */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SERVER_INFO = { name: "feelo-project-tree", version: "1.0.0" }

/** 鉴权失败原因 -> 给调用方的提示 */
const FAILURE_MESSAGE: Record<VerifyFailure, string> = {
  missing: "缺少 x-api-key 请求头",
  invalid: "密钥无效",
  disabled: "密钥已被停用",
  expired: "密钥已过期",
  member_missing: "密钥归属的成员已被删除",
}

/** JSON-RPC 形态的错误响应，便于 MCP 客户端直接解析 */
function rpcError(status: number, code: number, message: string) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: null, error: { code, message } }),
    {
      status,
      headers: {
        "content-type": "application/json",
        // 提示调用方该带哪个头
        ...(status === 401 ? { "www-authenticate": 'ApiKey realm="mcp", header="x-api-key"' } : {}),
      },
    },
  )
}

/**
 * 校验 Origin 防 DNS rebinding。
 * 只有带 Origin 的浏览器请求才检查；服务端 MCP 客户端不带该头，直接放行。
 */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true

  const allowList = (process.env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (allowList.includes(origin)) return true

  // 默认允许自身来源，方便同域调试
  const self = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (self && new URL(origin).host === self.split(",")[0].trim()) return true

  return false
}

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return rpcError(403, -32000, "Origin 不被允许")
  }

  const auth = await verifyApiKey(request.headers.get("x-api-key"))
  if (!auth.ok) {
    return rpcError(401, -32001, FAILURE_MESSAGE[auth.reason])
  }

  const caller: McpCaller = { actor: auth.actor, keyId: auth.keyId, keyName: auth.keyName }

  // 工具闭包持有调用者身份，因此每个请求都要新建一次 handler
  const handler = createMcpHandler((server) => registerTools(server, caller), {
    serverInfo: SERVER_INFO,
    instructions:
      "项目树管理服务。先用 whoami 确认权限，用 list_projects / list_members 拿到 id，再执行读写。创建项目时把拆解好的任务树作为 tree 参数整棵传入。",
  })

  return handler(request)
}

/** 单端点只接受 POST */
function methodNotAllowed() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "MCP 端点只接受 POST" },
    }),
    { status: 405, headers: { "content-type": "application/json", allow: "POST" } },
  )
}

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
