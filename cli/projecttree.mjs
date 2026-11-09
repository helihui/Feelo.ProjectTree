#!/usr/bin/env node
/**
 * projecttree.mjs — ProjectTree 零依赖命令行客户端
 * ------------------------------------------------------------------
 * 让任意项目通过一份声明式清单（.projecttree/tasks.yaml|json）接入
 * ProjectTree，并把本地清单实时同步成远端「项目-节点树」。
 *
 * 通信：标准 MCP Streamable HTTP（单端点 JSON-RPC，x-api-key 鉴权）。
 * 运行：Node >= 18（内置 fetch / fs.watch），无任何第三方依赖。
 *
 * 命令：
 *   init [--name 名称] [--dir .]            生成 .projecttree/ 骨架与示例清单
 *   login                                   保存 API Key（也可用环境变量）
 *   whoami                                  校验密钥、身份与权限
 *   link [projectId]                        把本地清单关联到已存在的远端项目
 *   push        [--name] [--dry-run]        清单首次创建为新项目（整棵写入）
 *   sync        [--dry-run] [--prune] [--yes]  按清单做增/改同步（--prune 才删除）
 *   diff                                    仅展示本地清单与远端的差异计划
 *   pull        [projectId] [--force]       拉取远端树生成本地清单（反向脚手架）
 *   status                                  显示关联与本地/远端摘要
 *   watch       [--interval 秒] [--prune]   监听清单变化，防抖后自动 sync
 *
 * 退出码：0 成功；1 运行错误；2 参数/配置错误；3 远端拒绝（鉴权/校验）。
 * ------------------------------------------------------------------
 */
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// ----------------------------- 常量 -----------------------------

const APP_DIR_NAME = ".projecttree"
const MANIFEST_BASENAMES = ["tasks.yaml", "tasks.yml", "tasks.json"]
const CONFIG_FILE = "config.json"
const STATE_FILE = ".state.json"
const DEFAULT_BASE_URL = "https://projecttree.feelo.top"
const MCP_PATH = "/api/mcp"
const MCP_PROTOCOL_VERSION = "2025-06-18"
const SERVER_LIMIT_NODES = 500
const SERVER_LIMIT_DEPTH = 8

const NODE_TYPES = new Set(["milestone", "phase", "epic", "module", "task", "subtask"])
const NODE_STATUSES = new Set(["todo", "progress", "done", "blocked", "paused"])
const NODE_PRIORITIES = new Set(["low", "medium", "high", "urgent"])
// 受清单管理、参与 diff 的字段
const MANAGED_FIELDS = [
  "title",
  "description",
  "type",
  "status",
  "priority",
  "progress",
  "startDate",
  "dueDate",
  "estimateHours",
  "tags",
]

// ----------------------------- 工具 -----------------------------

function die(msg, code = 1) {
  process.stderr.write(`\x1b[31m✗ ${msg}\x1b[0m\n`)
  process.exit(code)
}
function info(msg) {
  process.stdout.write(`${msg}\n`)
}
function dim(msg) {
  return `\x1b[2m${msg}\x1b[0m`
}
function green(msg) {
  return `\x1b[32m${msg}\x1b[0m`
}
function yellow(msg) {
  return `\x1b[33m${msg}\x1b[0m`
}
function red(msg) {
  return `\x1b[31m${msg}\x1b[0m`
}
function cyan(msg) {
  return `\x1b[36m${msg}\x1b[0m`
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}
function writeJsonAtomic(file, obj) {
  const tmp = file + ".tmp-" + process.pid
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8")
  fs.renameSync(tmp, file)
}
function exists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

// 命令行参数极简解析：--flag、--key=value、--key value、位置参数
function parseArgs(argv) {
  const flags = {}
  const positionals = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) {
      const body = a.slice(2)
      const eq = body.indexOf("=")
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1)
      } else if (
        i + 1 < argv.length &&
        !argv[i + 1].startsWith("--") &&
        !looksBooleanFlag(body)
      ) {
        flags[body] = argv[++i]
      } else {
        flags[body] = true
      }
    } else {
      positionals.push(a)
    }
  }
  return { flags, positionals }
}
function looksBooleanFlag(name) {
  return new Set([
    "dry-run",
    "prune",
    "yes",
    "force",
    "watch",
    "help",
    "h",
    "version",
    "v",
  ]).has(name)
}

// ----------------------------- 路径定位 -----------------------------

/** 从 cwd 向上查找含 .projecttree 的目录，定位「项目根」 */
function findProjectRoot(startDir) {
  let dir = path.resolve(startDir)
  for (;;) {
    if (exists(path.join(dir, APP_DIR_NAME))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function pathsFor(rootDir) {
  const app = path.join(rootDir, APP_DIR_NAME)
  return {
    root: rootDir,
    app,
    config: path.join(app, CONFIG_FILE),
    state: path.join(app, STATE_FILE),
  }
}

function findManifest(appDir) {
  for (const base of MANIFEST_BASENAMES) {
    const p = path.join(appDir, base)
    if (exists(p)) return { path: p, format: base.endsWith(".json") ? "json" : "yaml" }
  }
  return null
}

// ----------------------- 极简 YAML（受控子集） -----------------------
// 仅支持本 CLI 清单需要的形态：
//   - 缩进（2 空格）表示层级；'- ' 列表项
//   - '- 标题' 直接作为一个节点的 title
//   - '- [key] 标题' 同时指定稳定 key
//   - 节点下的 key: value 标量字段（description 为多行 | 块或单行）
//   - tags: [a, b] 行内数组
// 不支持锚点/复杂流式/引用。需要更复杂结构请改用 tasks.json。

function yamlEscapeScalar(s) {
  if (s === null || s === undefined) return '""'
  const str = String(s)
  if (str === "") return '""'
  if (/[:#\[\]{},&*?|>%@'"`\n]/.test(str) || /^\s|\s$/.test(str)) {
    return JSON.stringify(str)
  }
  return str
}

/** 把清单树序列化为 YAML（供 pull / init 模板，输出即本解析器可读的子集） */
function treeToYaml(project) {
  const lines = []
  lines.push(`# ProjectTree 声明式任务清单 —— 由 projecttree CLI 管理`)
  lines.push(`# 此文件是唯一事实源；\`projecttree sync\` 会把它同步到远端项目树。`)
  lines.push(`# 节点行：- 标题 或 - [稳定key] 标题；缩进 2 空格表示父子层级（最多 8 层）。`)
  lines.push(`# 字段：title/type/status/priority/progress/startDate/dueDate/estimateHours/tags/description`)
  lines.push(``)
  lines.push(`name: ${yamlEscapeScalar(project.name)}`)
  if (project.description) lines.push(`description: ${yamlEscapeScalar(project.description)}`)
  lines.push(`tree:`)
  // depth=0 为顶层节点（"- " 位于 2 空格缩进）；字段相对 "- " 再缩进 2 空格；
  // 子节点列表相对父列表再缩进 2 空格。
  const walkChildren = (children, depth) => {
    for (const node of children || []) {
      const indent = "  ".repeat(depth + 1)
      const keyPart = node.key ? `[${node.key}] ` : ""
      lines.push(`${indent}- ${keyPart}${yamlEscapeScalar(node.title)}`)
      const fieldIndent = "  ".repeat(depth + 2)
      const scalarFields = ["type", "status", "priority", "progress", "startDate", "dueDate", "estimateHours"]
      for (const f of scalarFields) {
        if (node[f] !== undefined && node[f] !== null) {
          lines.push(`${fieldIndent}${f}: ${node[f]}`)
        }
      }
      if (Array.isArray(node.tags) && node.tags.length) {
        lines.push(`${fieldIndent}tags: [${node.tags.map(yamlEscapeScalar).join(", ")}]`)
      }
      if (node.description) {
        const desc = String(node.description)
        if (desc.includes("\n")) {
          lines.push(`${fieldIndent}description: |`)
          for (const ln of desc.replace(/\s+$/, "").split("\n")) {
            lines.push(`${fieldIndent}  ${ln}`)
          }
        } else {
          lines.push(`${fieldIndent}description: ${yamlEscapeScalar(desc)}`)
        }
      }
      if (node.children && node.children.length) walkChildren(node.children, depth + 1)
    }
  }
  walkChildren(project.tree, 0)
  return lines.join("\n") + "\n"
}

/**
 * 解析清单 YAML 子集。返回 { name, description, tree: [node...] }
 * 节点内部统一为 { key?, title, ...fields, children? }
 */
function parseManifestYaml(text) {
  const rawLines = text.split(/\r?\n/)
  // 预处理：去掉注释与空行（仅整行/行尾未加引号的 #；本子集不深入处理引号内 #）
  const lines = []
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i]
    // 折叠 description: | 多行块
    lines.push({ no: i + 1, text: line })
  }

  const top = {}
  const roots = []
  // 栈元素：{ indent, node }
  const stack = []
  let rootIndent = null // 首个顶层列表项的缩进（允许顶格或任意统一缩进）
  let pendingBlockDesc = null // { node, indent } 收集多行描述

  const setField = (node, key, valStr, lineNo) => {
    const v = parseScalar(key, valStr, lineNo)
    node[key] = v
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const { no, text } = lines[idx]
    // 多行描述块收集
    if (pendingBlockDesc) {
      const baseIndent = pendingBlockDesc.indent
      const m = text.match(/^(\s*)(.*)$/)
      const curIndent = m[1].length
      if (m[2].length === 0) {
        pendingBlockDesc.node.description += "\n"
        continue
      }
      if (curIndent > baseIndent) {
        pendingBlockDesc.node.description += (pendingBlockDesc.node.description ? "\n" : "") + m[2]
        continue
      } else {
        pendingBlockDesc.node.description = pendingBlockDesc.node.description.replace(/\n+$/,"")
        pendingBlockDesc = null
        // 落到下面继续处理本行
      }
    }

    const stripped = text.trim()
    if (stripped === "" ) continue
    if (stripped.startsWith("#")) continue

    // 顶层标量 name:/description:（无缩进、且不是 tree）
    const topScalar = text.match(/^([A-Za-z_][\w]*):\s*(.*)$/)
    if (topScalar && !text.startsWith(" ") && topScalar[1] !== "tree") {
      const [, k, v] = topScalar
      if (k === "name" || k === "description") top[k] = parsePlainOrQuoted(v)
      continue
    }
    if (/^tree:\s*$/.test(text)) {
      continue
    }

    // 节点行：缩进 + '- '
    const itemMatch = text.match(/^(\s*)-\s+(.*)$/)
    if (itemMatch) {
      const indent = itemMatch[1].length
      let rest = itemMatch[2].trim()

      // 去掉行内未加引号的注释
      rest = stripTrailingComment(rest)

      const node = { children: [] }
      // [key] title
      const keyMatch = rest.match(/^\[([A-Za-z0-9_.:-]+)\]\s*(.*)$/)
      if (keyMatch) {
        node.key = keyMatch[1]
        rest = keyMatch[2].trim()
      }
      node.title = parsePlainOrQuoted(rest)
      if (!node.title) throw new ParseError(`第 ${no} 行：节点标题为空`)

      // 找父：弹栈到 indent 严格更小的最近节点
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
      if (stack.length === 0) {
        // 顶层节点：以首个列表项缩进为准，其余顶层节点必须与其一致
        if (rootIndent === null) rootIndent = indent
        if (indent !== rootIndent) {
          throw new ParseError(`第 ${no} 行：顶层节点缩进与首个节点（${rootIndent} 空格）不一致`)
        }
        roots.push(node)
      } else {
        stack[stack.length - 1].node.children.push(node)
      }
      stack.push({ indent, node })
      continue
    }

    // 字段行（相对某节点缩进）
    const fieldMatch = text.match(/^(\s*)([A-Za-z_][\w]*):\s*(.*)$/)
    if (fieldMatch && stack.length) {
      const indent = fieldMatch[1].length
      const key = fieldMatch[2]
      let val = fieldMatch[3]
      const owner = stack[stack.length - 1].node
      // 字段必须比所属节点更深
      if (indent <= stack[stack.length - 1].indent) {
        throw new ParseError(`第 ${no} 行：字段 "${key}" 缩进不足，无法归属到节点`)
      }
      if (key === "description" && val.trim() === "|") {
        owner.description = ""
        pendingBlockDesc = { node: owner, indent }
        continue
      }
      setField(owner, key, stripTrailingComment(val), no)
      continue
    }

    throw new ParseError(`第 ${no} 行：无法解析 "${text}"`)
  }
  if (pendingBlockDesc) {
    pendingBlockDesc.node.description = pendingBlockDesc.node.description.replace(/\n+$/,"")
  }

  return {
    name: top.name || "",
    description: top.description || "",
    tree: roots,
  }
}

class ParseError extends Error {}

function stripTrailingComment(s) {
  // 仅在检测到未被引号包裹的 # 时截断（简化处理）
  let inSingle = false, inDouble = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"' && !inSingle) inDouble = !inDouble
    else if (c === "'" && !inDouble) inSingle = !inSingle
    else if (c === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(s[i - 1])) return s.slice(0, i).trimEnd()
    }
  }
  return s.trimEnd()
}
function parsePlainOrQuoted(s) {
  s = s.trim()
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    try { return JSON.parse(s) } catch { return s.slice(1, -1) }
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
    return s.slice(1, -1)
  }
  return s
}
function parseScalar(key, val, lineNo) {
  val = val.trim()
  if (key === "tags") {
    const inner = val.replace(/^\[/, "").replace(/\]$/, "")
    if (inner.trim() === "") return []
    return inner.split(",").map((x) => parsePlainOrQuoted(x.trim())).filter(Boolean)
  }
  if (key === "progress" || key === "estimateHours") {
    const n = Number(val)
    if (!Number.isFinite(n)) throw new ParseError(`第 ${lineNo} 行：${key} 必须是数字`)
    return n
  }
  if (key === "type" && !NODE_TYPES.has(val)) throw new ParseError(`第 ${lineNo} 行：非法 type "${val}"`)
  if (key === "status" && !NODE_STATUSES.has(val)) throw new ParseError(`第 ${lineNo} 行：非法 status "${val}"`)
  if (key === "priority" && !NODE_PRIORITIES.has(val)) throw new ParseError(`第 ${lineNo} 行：非法 priority "${val}"`)
  if ((key === "startDate" || key === "dueDate") && val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    throw new ParseError(`第 ${lineNo} 行：${key} 格式必须是 yyyy-MM-dd`)
  }
  return parsePlainOrQuoted(val)
}

function loadManifest(manifest) {
  const text = fs.readFileSync(manifest.path, "utf8")
  let doc
  if (manifest.format === "json") {
    doc = JSON.parse(text)
    if (!doc || typeof doc !== "object") throw new ParseError("tasks.json 顶层必须是对象")
    doc.tree = Array.isArray(doc.tree) ? doc.tree : []
  } else {
    doc = parseManifestYaml(text)
  }
  if (!doc.name || !String(doc.name).trim()) throw new ParseError("缺少项目名称 name")
  normalizeTree(doc.tree, 1)
  return doc
}

/**
 * 校验 + 默认值 + 统计。
 * depth 从清单顶层节点 = 1 开始；服务端项目根占第 1 层，故清单最多
 * SERVER_LIMIT_DEPTH - 1 层（顶层节点在服务端是第 2 层）。
 */
function normalizeTree(nodes, depth) {
  if (depth > SERVER_LIMIT_DEPTH - 1) {
    throw new ParseError(`清单嵌套超过 ${SERVER_LIMIT_DEPTH - 1} 层（服务端含项目根共限 ${SERVER_LIMIT_DEPTH} 层）`)
  }
  for (const n of nodes) {
    if (!n.title || !String(n.title).trim()) throw new ParseError("存在无 title 的节点")
    n.title = String(n.title)
    n.description = n.description ? String(n.description) : undefined
    n.type = n.type || (depth >= SERVER_LIMIT_DEPTH ? "task" : "epic")
    if (!NODE_TYPES.has(n.type)) throw new ParseError(`节点「${n.title}」type 非法：${n.type}`)
    n.status = n.status || "todo"
    if (!NODE_STATUSES.has(n.status)) throw new ParseError(`节点「${n.title}」status 非法`)
    n.priority = n.priority || "medium"
    if (!NODE_PRIORITIES.has(n.priority)) throw new ParseError(`节点「${n.title}」priority 非法`)
    n.progress = clampInt(n.progress ?? 0, 0, 100)
    n.estimateHours = n.estimateHours != null ? clampInt(n.estimateHours, 0, 100000) : undefined
    n.tags = Array.isArray(n.tags) ? n.tags.map(String) : undefined
    n.children = Array.isArray(n.children) ? n.children : []
    normalizeTree(n.children, depth + 1)
  }
}
function clampInt(v, lo, hi) {
  v = Math.floor(Number(v))
  if (!Number.isFinite(v)) v = lo
  return Math.max(lo, Math.min(hi, v))
}
function countNodes(nodes) {
  let n = 0
  for (const x of nodes) n += 1 + countNodes(x.children || [])
  return n
}

// ----------------------------- MCP 客户端 -----------------------------

class McpError extends Error {
  constructor(code, message, rpcCode) {
    super(message)
    this.code = code
    this.rpcCode = rpcCode
  }
}

class McpClient {
  constructor(baseUrl, apiKey) {
    this.url = baseUrl.replace(/\/+$/, "") + MCP_PATH
    this.apiKey = apiKey
    this.nextId = 0
    this.inited = false
  }

  /** 解析 SSE 响应：取最后一条 event:message 的 data JSON */
  static parseSse(text) {
    const dataLines = []
    const blocks = text.split(/\r?\n\r?\n/)
    for (const block of blocks) {
      const lines = block.split(/\r?\n/)
      const isEvent = lines.some((l) => l.startsWith("event:"))
      const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart())
      if (data.length && (isEvent || true)) {
        dataLines.length = 0
        dataLines.push(...data)
      }
    }
    // 兜底：直接抽全部 data: 行
    if (!dataLines.length) {
      for (const l of text.split(/\r?\n/)) {
        if (l.startsWith("data:")) dataLines.push(l.slice(5).trimStart())
      }
    }
    const payload = dataLines.join("\n")
    return payload ? JSON.parse(payload) : null
  }

  async rpc(method, params = {}) {
    const body = { jsonrpc: "2.0", id: ++this.nextId, method, params }
    const headers = {
      "x-api-key": this.apiKey,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    }
    if (method === "initialize") headers["mcp-protocol-version"] = MCP_PROTOCOL_VERSION

    let res
    try {
      res = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) })
    } catch (e) {
      throw new McpError("network", `无法连接 ${this.url}：${e.message}`)
    }

    const text = await res.text()
    let json
    try {
      json = res.headers.get("content-type")?.includes("text/event-stream")
        ? McpClient.parseSse(text)
        : JSON.parse(text)
    } catch {
      throw new McpError("bad_response", `服务端返回无法解析（HTTP ${res.status}）：${text.slice(0, 200)}`)
    }
    if (!json) throw new McpError("empty_response", `服务端返回空（HTTP ${res.status}）`)

    if (res.status === 401) {
      throw new McpError("unauthorized", json?.error?.message || "API Key 无效或已停用", json?.error?.code)
    }
    if (json.error) {
      const msg = json.error.message || "MCP 调用失败"
      // 工具级业务错误通常 code=-32000，具体码放在 structuredContent 或文本 [code]
      throw new McpError("tool_error", msg, json.error.code)
    }
    return json.result
  }

  async initialize() {
    if (this.inited) return
    await this.rpc("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "projecttree-cli", version: "1.0.0" },
    })
    this.inited = true
  }

  /** 调用一个工具，返回 structuredContent；若工具标记 isError，抛出 */
  async call(tool, args = {}) {
    await this.initialize()
    const result = await this.rpc("tools/call", { name: tool, arguments: args })
    const sc = result.structuredContent
    if (result.isError === true || (sc && sc.error)) {
      const code = sc?.error?.code || "tool_error"
      const message = sc?.error?.message || result.content?.[0]?.text || "工具返回错误"
      throw new McpError(code, message)
    }
    return sc ?? { text: result.content?.map((c) => c.text).join("") }
  }
}

// ----------------------------- 配置 / 凭据 -----------------------------

function loadConfig(rootDir) {
  const P = pathsFor(rootDir)
  let cfg = {}
  if (exists(P.config)) {
    try {
      cfg = readJson(P.config)
    } catch {
      die(`${P.config} 不是合法 JSON，请修正后重试`, 2)
    }
  }
  const baseUrl = process.env.PROJECTTREE_BASE_URL || cfg.baseUrl || DEFAULT_BASE_URL
  // 凭据优先级：环境变量 > 本地凭据文件 > config（不推荐把 key 写 config）
  let apiKey = process.env.PROJECTTREE_API_KEY || cfg.apiKey || null
  const credFile = path.join(os.homedir(), ".projecttree", "credentials.json")
  if (!apiKey && exists(credFile)) {
    try {
      const cred = JSON.parse(fs.readFileSync(credFile, "utf8"))
      apiKey = cred.apiKey || null
    } catch { /* 忽略损坏凭据 */ }
  }
  return { P, cfg, baseUrl, apiKey }
}

function requireClient(rootDir) {
  const { P, cfg, baseUrl, apiKey } = loadConfig(rootDir)
  if (!apiKey) {
    die(
      `未找到 API Key。请先运行 ${cyan("projecttree login")}，或设置环境变量 PROJECTTREE_API_KEY。\n` +
      `Key 在 ProjectTree 网页「设置 → API 密钥」签发，形如 pt_live_...`,
      3,
    )
  }
  return { client: new McpClient(baseUrl, apiKey), P, cfg, baseUrl }
}

// ----------------------------- key / 路径身份 -----------------------------

/**
 * 清单节点必须有稳定身份。优先用显式 key；否则用「父路径 + 标题」派生 slug。
 * 路径 key 在同一父节点内唯一即可，重名自动加序号。
 */
function assignKeys(nodes, parentPath, seenByParent) {
  for (const n of nodes) {
    let key = n.key ? String(n.key) : slug(n.title)
    let candidate = key
    let i = 2
    while (seenByParent.has(candidate)) candidate = `${key}-${i++}`
    seenByParent.add(candidate)
    n._key = candidate
    n._path = parentPath ? `${parentPath}/${candidate}` : candidate
    assignKeys(n.children, n._path, new Set())
  }
}
function slug(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^a-z0-9\-.\u4e00-\u9fa5]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "node"
}

/** 给远端嵌套树计算 pathKey（与本地同一规则：父路径 + 标题 slug），用于无 key 对齐 */
function annotateRemote(nodes, parentPath) {
  const seen = new Set()
  for (const n of nodes) {
    let key = slug(n.title)
    let candidate = key
    let i = 2
    while (seen.has(candidate)) candidate = `${key}-${i++}`
    seen.add(candidate)
    n._path = parentPath ? `${parentPath}/${candidate}` : candidate
    annotateRemote(n.children || [], n._path)
  }
}

// ----------------------------- diff 引擎 -----------------------------

/**
 * 比较本地清单树与远端嵌套树。
 * 身份对齐优先级：
 *   1) state.keyToNodeId 中记录的显式/路径 key -> nodeId
 *   2) 远端节点标题 slug 路径（link/pull 的首次对齐）
 * 输出操作计划：create（按父分组为 subtree）/ update / delete / move（仅告警）
 */
function buildPlan(localNodes, remoteTree, state, opts = {}) {
  const prune = !!opts.prune
  const ops = { create: [], update: [], delete: [], move: [], note: [] }

  // 远端建立两个索引：nodeId -> remote node；key(path) -> remote
  const remoteById = new Map()
  const remoteByPath = new Map()
  const indexRemote = (nodes, parent) => {
    for (const n of nodes) {
      n._parent = parent
      remoteById.set(n.id, n)
      remoteByPath.set(n._path, n)
      indexRemote(n.children || [], n)
    }
  }
  indexRemote(remoteTree, null)

  // keyToNodeId：state 映射；若缺失则用 path 对齐
  const keyMap = new Map(Object.entries(state.keyToNodeId || {}))

  const resolveRemote = (local) => {
    const mapped = keyMap.get(local._path)
    if (mapped && remoteById.has(mapped)) return remoteById.get(mapped)
    const byPath = remoteByPath.get(local._path)
    return byPath || null
  }

  // 待创建项收集：{ node, parentPath(本地父 path), parentRemoteId|null }
  const pendingCreate = []

  const walk = (localList, remoteList, parentLocalPath) => {
    // 本轮远端参与匹配集合
    const matchedRemoteIds = new Set()
    for (const local of localList) {
      const r = resolveRemote(local)
      if (r) {
        matchedRemoteIds.add(r.id)
        // 父级变化检测
        const expectedParentPath = parentLocalPath || null
        const actualParentPath = r._parent ? r._parent._path : null
        if (expectedParentPath !== actualParentPath) {
          ops.move.push({ title: local.title, path: local._path, from: actualParentPath, to: expectedParentPath })
        }
        // 字段比较
        const patch = diffFields(local, r)
        if (patch) ops.update.push({ nodeId: r.id, title: local.title, path: local._path, patch })
        // 递归子节点
        walk(local.children || [], r.children || [], local._path)
      } else {
        pendingCreate.push({ node: local, parentPath: parentLocalPath })
      }
    }
    // 远端多出的节点：在本父节点范围内
    if (prune) {
      for (const rn of remoteList) {
        if (!matchedRemoteIds.has(rn.id)) {
          ops.delete.push({ nodeId: rn.id, title: rn.title, path: rn._path })
        }
      }
    } else {
      // 只统计、不删
      for (const rn of remoteList) {
        if (!matchedRemoteIds.has(rn.id)) {
          ops.note.push({ kind: "remote-extra", title: rn.title, path: rn._path })
        }
      }
    }
  }

  walk(localNodes, remoteTree, null)

  // 待创建项按「挂载到已存在祖先」分组。
  // 关键：若某节点的本地祖先本身也在待创建集合中，则它已包含在祖先的整棵
  // subtree 里，不能再单独挂一次，否则会重复创建。只保留「新建子树根」。
  const pendingPaths = new Set(pendingCreate.map((i) => i.node._path))
  const isUnderPendingAncestor = (p) => {
    let cur = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : null
    while (cur) {
      if (pendingPaths.has(cur)) return true
      cur = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/")) : null
    }
    return false
  }
  // parentRemoteId：null 表示挂项目根（执行时替换为根节点 id）；
  // 父本身也是新建时，沿路径上溯到最近的已存在祖先。
  const groups = new Map()
  for (const item of pendingCreate) {
    if (isUnderPendingAncestor(item.node._path)) continue
    const parentId = resolveCreateParentId(item.parentPath, keyMap, remoteByPath)
    if (!groups.has(parentId)) groups.set(parentId, [])
    groups.get(parentId).push(item.node)
  }
  for (const [parentId, nodes] of groups) {
    ops.create.push({ parentId, nodes })
  }
  return ops
}

/** 找到新建节点的挂载点：沿父路径向上找第一个已存在的远端节点（根返回 null） */
function resolveCreateParentId(parentPath, keyMap, remoteByPath) {
  if (!parentPath) return null
  const mapped = keyMap.get(parentPath)
  if (mapped) {
    // 该 id 是否仍在远端（remoteByPath 不按 id 索引，调用方保证映射有效）
    return mapped
  }
  const byPath = remoteByPath.get(parentPath)
  if (byPath) return byPath.id
  // 父也新建：上溯
  const upper = parentPath.includes("/") ? parentPath.slice(0, parentPath.lastIndexOf("/")) : null
  return resolveCreateParentId(upper, keyMap, remoteByPath)
}

function diffFields(local, remote) {
  const patch = {}
  let changed = false
  for (const f of MANAGED_FIELDS) {
    const lv = local[f]
    let rv = remote[f]
    if (f === "tags") {
      const la = JSON.stringify([...(lv || [])].sort())
      const ra = JSON.stringify([...(rv || [])].map(String).sort())
      if (la !== ra) { patch.tags = (lv || []).map(String); changed = true }
      continue
    }
    if (f === "description") {
      if ((lv || "") !== (rv || "")) { patch.description = lv || ""; changed = true }
      continue
    }
    if (f === "progress" || f === "estimateHours") {
      const ln = lv ?? 0
      const rn = rv ?? 0
      if (Number(ln) !== Number(rn)) { patch[f] = Number(ln); changed = true }
      continue
    }
    if (lv !== undefined && lv !== rv) { patch[f] = lv; changed = true }
  }
  return changed ? patch : null
}

// ----------------------------- 命令实现 -----------------------------

async function cmdInit(args) {
  const targetDir = path.resolve(args.flags.dir || ".")
  const app = path.join(targetDir, APP_DIR_NAME)
  const P = pathsFor(targetDir)
  fs.mkdirSync(app, { recursive: true })

  if (!exists(P.config)) {
    writeJsonAtomic(P.config, {
      baseUrl: DEFAULT_BASE_URL,
      // apiKey 不写在这里；用 `projecttree login` 或 PROJECTTREE_API_KEY
    })
  }
  const manifest = findManifest(app)
  if (manifest && !args.flags.force) {
    info(yellow(`清单已存在：${manifest.path}（加 --force 可覆盖示例，不影响已有关联）`))
  } else {
    const projName = args.flags.name || path.basename(targetDir)
    const sample = {
      name: projName,
      description: "",
      tree: [
        {
          title: "里程碑 1：MVP",
          type: "milestone",
          children: [
            { title: "需求梳理", type: "task", status: "todo", priority: "high", tags: ["规划"] },
            { title: "核心功能开发", type: "task", status: "todo", estimateHours: 16 },
            { title: "联调与验收", type: "task", status: "todo" },
          ],
        },
        {
          title: "里程碑 2：发布",
          type: "milestone",
          children: [{ title: "打包与部署", type: "task", status: "todo" }],
        },
      ],
    }
    const yamlPath = path.join(app, "tasks.yaml")
    fs.writeFileSync(yamlPath, treeToYaml(sample), "utf8")
    info(green(`已创建清单：${yamlPath}`))
  }

  // 提醒忽略 state
  const gi = path.join(targetDir, ".gitignore")
  const ignoreLine = `${APP_DIR_NAME}/${STATE_FILE}`
  if (exists(gi)) {
    const cur = fs.readFileSync(gi, "utf8")
    if (!cur.split(/\r?\n/).includes(ignoreLine)) {
      fs.appendFileSync(gi, `\n# ProjectTree CLI 本地状态（含远端节点 id 映射），不入库\n${ignoreLine}\n`)
    }
  } else {
    fs.writeFileSync(gi, `${ignoreLine}\n`, "utf8")
  }
  info(``)
  info(`下一步：`)
  info(`  1) 编辑 ${cyan(APP_DIR_NAME + "/tasks.yaml")}，按你的项目拆解里程碑/模块/任务`)
  info(`  2) ${cyan("projecttree login")}          保存 API Key（pt_live_...）`)
  info(`  3) ${cyan("projecttree push")}           首次创建远端项目并整棵写入`)
  info(`  之后改完清单运行 ${cyan("projecttree sync")}，或 ${cyan("projecttree watch")} 保存即同步。`)
}

async function cmdLogin() {
  const existing = process.env.PROJECTTREE_API_KEY
  // 环境变量已给（CI）：直接落盘校验，不交互；否则隐藏输入
  const input = existing || (await readHidden("API Key (pt_live_...)："))
  const key = (input || "").trim()
  if (!/^pt_live_\S+$/.test(key)) die("Key 格式不正确，应以 pt_live_ 开头", 2)
  const dir = path.join(os.homedir(), ".projecttree")
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, "credentials.json")
  writeJsonAtomic(file, { apiKey: key })
  try { fs.chmodSync(file, 0o600) } catch {}
  info(green("已保存到 ") + file)
  // 立即验证
  const client = new McpClient(DEFAULT_BASE_URL, key)
  try {
    const me = await client.call("whoami")
    info(green(`鉴权成功：${me.memberId} / 角色 ${me.roleKey}`))
  } catch (e) {
    info(red(`已保存，但校验失败：${e.message}`))
    process.exitCode = 3
  }
}

function readHidden(prompt = "") {
  return new Promise((resolve) => {
    const stdin = process.stdin
    if (!stdin.isTTY) {
      // 管道输入：读一行
      let data = ""
      stdin.resume()
      stdin.setEncoding("utf8")
      stdin.on("data", (d) => {
        data += d
        if (data.includes("\n")) {
          stdin.pause()
          resolve(data.split(/\r?\n/)[0].trim())
        }
      })
      stdin.on("end", () => resolve(data.trim()))
      return
    }
    if (prompt) process.stdout.write(prompt)
    let out = ""
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding("utf8")
    stdin.on("data", (s) => {
      const code = s.charCodeAt(0)
      // 回车 / LF 提交
      if (s === "\r" || s === "\n" || code === 13 || code === 10) {
        stdin.setRawMode(false)
        stdin.pause()
        process.stdout.write("\n")
        resolve(out)
      } else if (code === 3) {
        // Ctrl+C
        stdin.setRawMode(false)
        process.exit(2)
      } else if (code === 127 || code === 8) {
        // 退格 / 删除
        if (out.length) {
          out = out.slice(0, -1)
          process.stdout.write("\b \b")
        }
      } else if (code >= 32) {
        out += s
        process.stdout.write("*")
      }
    })
  })
}

async function cmdWhoami(rootDir) {
  const { client } = requireClient(rootDir)
  const me = await client.call("whoami")
  info(`Key 名称 : ${me.keyName}`)
  info(`成员 ID  : ${me.memberId}`)
  info(`角色     : ${me.roleKey}`)
  info(`权限     : ${(me.scopes || []).join("、") || "（只读）"}`)
  info(`树上限   : ${me.limits?.maxTreeNodes} 节点 / ${me.limits?.maxTreeDepth} 层`)
}

function readState(P) {
  if (exists(P.state)) {
    try { return readJson(P.state) } catch { return freshState() }
  }
  return freshState()
}
function freshState() {
  return { version: 1, projectId: null, projectName: null, keyToNodeId: {}, syncedAt: null }
}
function saveState(P, state) {
  fs.mkdirSync(P.app, { recursive: true })
  writeJsonAtomic(P.state, state)
}

async function cmdPush(rootDir, args) {
  const { client, P } = requireClient(rootDir)
  const manifest = findManifest(P.app)
  if (!manifest) die(`未找到清单（${APP_DIR_NAME}/tasks.yaml|json）。先运行 projecttree init`, 2)
  const doc = loadManifest(manifest)
  assignKeys(doc.tree, "", new Set())
  const total = countNodes(doc.tree)
  if (total > SERVER_LIMIT_NODES) die(`节点数 ${total} 超过单次上限 ${SERVER_LIMIT_NODES}`, 2)

  const state = readState(P)
  if (state.projectId && !args.flags.force) {
    die(`已关联项目 ${state.projectId}。请用 ${cyan("projecttree sync")} 更新，或加 --force 忽略本地关联（不会删远端）`, 2)
  }

  const treeInput = toTreeInput(doc.tree)
  if (args.flags["dry-run"]) {
    info(cyan(`[dry-run] 将创建项目「${doc.name}」并写入 ${total} 个节点`))
    return
  }

  const res = await client.call("create_project", {
    name: args.flags.name || doc.name,
    description: doc.description || undefined,
    tree: { title: args.flags.name || doc.name, children: treeInput },
  })
  const projectId = res.projectId
  // 拉回整棵树按标题路径建立映射
  const projectName = args.flags.name || doc.name
  await rebuildState(client, P, projectId, projectName, doc.tree, freshState())
  info(green(`已创建项目「${projectName}」projectId=${projectId}，写入 ${res.nodeCount} 节点`))
  info(dim(`项目地址：${baseUrlOf(P)}/projects/${projectId}`))
}

/** 首次创建/link 后：按 path 对齐本地与远端，填 keyToNodeId（已存在的映射不覆盖） */
function alignMappings(localList, remoteList, state) {
  const remoteByPath = new Map()
  const walkIndex = (nodes) => {
    for (const n of nodes) {
      remoteByPath.set(n._path, n)
      walkIndex(n.children || [])
    }
  }
  walkIndex(remoteList)
  const walkLocal = (nodes) => {
    for (const n of nodes) {
      // 显式稳定 key 的节点：既有映射优先，避免重命名后标题路径对齐错位
      if (n.key && state.keyToNodeId[n._path]) {
        walkLocal(n.children || [])
        continue
      }
      const rn = remoteByPath.get(n._path)
      if (rn) state.keyToNodeId[n._path] = rn.id
      walkLocal(n.children || [])
    }
  }
  walkLocal(localList)
}

/**
 * 同步后重建状态：重拉远端整树，按标题路径重新对齐；同时保留旧 state 中
 * 仍指向现存远端节点的映射（覆盖重命名等标题路径变化的情况）。
 */
async function rebuildState(client, P, projectId, projectName, localTree, prevState) {
  const after = await client.call("get_project", { projectId })
  const afterChildren = after.project.root.children || []
  annotateRemote(afterChildren, "")
  const liveIds = new Set()
  const collect = (nodes) => {
    for (const n of nodes) { liveIds.add(n.id); collect(n.children || []) }
  }
  collect(afterChildren)
  liveIds.add(after.project.root.id)

  const ns = freshState()
  ns.projectId = projectId
  ns.projectName = projectName
  // 保留旧映射中仍然存活的（重命名后显式 key 关联靠它延续）
  for (const [k, id] of Object.entries(prevState?.keyToNodeId || {})) {
    if (liveIds.has(id)) ns.keyToNodeId[k] = id
  }
  alignMappings(localTree, afterChildren, ns)
  ns.syncedAt = new Date().toISOString()
  saveState(P, ns)
  return ns
}

function baseUrlOf(P) {
  let cfg = {}
  try { if (exists(P.config)) cfg = readJson(P.config) } catch {}
  return process.env.PROJECTTREE_BASE_URL || cfg.baseUrl || DEFAULT_BASE_URL
}

function toTreeInput(nodes) {
  return nodes.map((n) => {
    const obj = { title: n.title }
    for (const f of MANAGED_FIELDS) {
      if (n[f] !== undefined && n[f] !== null && !(f === "tags" && (!n.tags || !n.tags.length))) {
        obj[f] = n[f]
      }
    }
    if (n.children && n.children.length) obj.children = toTreeInput(n.children)
    return obj
  })
}

async function cmdLink(rootDir, args) {
  const { client, P } = requireClient(rootDir)
  const manifest = findManifest(P.app)
  if (!manifest) die(`未找到清单，先运行 projecttree init`, 2)
  const doc = loadManifest(manifest)
  assignKeys(doc.tree, "", new Set())

  let projectId = args.positionals[0]
  if (!projectId) {
    const list = await client.call("list_projects", { limit: 50 })
    info("可用项目：")
    for (const p of list.projects || []) info(`  ${cyan(p.id)}  ${p.name}`)
    die("请提供 projectId：projecttree link <projectId>", 2)
  }

  const detail = await client.call("get_project", { projectId })
  if (!detail.project) die(`项目 ${projectId} 不存在`, 3)
  const remoteChildren = detail.project.root.children || []
  annotateRemote(remoteChildren, "")

  const state = freshState()
  state.projectId = projectId
  state.projectName = detail.project.name
  alignMappings(doc.tree, remoteChildren, state)
  state.syncedAt = new Date().toISOString()
  saveState(P, state)

  const localCount = countNodes(doc.tree)
  const mapped = Object.keys(state.keyToNodeId).length
  info(green(`已关联到「${detail.project.name}」(${projectId})`))
  info(`本地 ${localCount} 节点，按标题路径自动匹配到 ${mapped} 个远端节点。`)
  info(`运行 ${cyan("projecttree sync")} 将新增未匹配的节点；网页端手工改动默认保留，加 --prune 才删除。`)
}

async function loadLinked(rootDir, client, P) {
  const state = readState(P)
  if (!state.projectId) die(`尚未关联项目。先 ${cyan("projecttree push")} 或 ${cyan("projecttree link <id>")}`, 2)
  const detail = await client.call("get_project", { projectId: state.projectId })
  if (!detail.project) die(`远端项目 ${state.projectId} 已不存在`, 3)
  return { state, detail }
}

async function cmdDiff(rootDir) {
  const { client, P } = requireClient(rootDir)
  const manifest = findManifest(P.app)
  if (!manifest) die(`未找到清单`, 2)
  const doc = loadManifest(manifest)
  assignKeys(doc.tree, "", new Set())
  const { state, detail } = await loadLinked(rootDir, client, P)
  const remoteChildren = detail.project.root.children || []
  annotateRemote(remoteChildren, "")
  const ops = buildPlan(doc.tree, remoteChildren, state, { prune: false })
  printPlan(ops, false)
  return ops
}

async function cmdSync(rootDir, args) {
  const { client, P } = requireClient(rootDir)
  const manifest = findManifest(P.app)
  if (!manifest) die(`未找到清单`, 2)
  const doc = loadManifest(manifest)
  assignKeys(doc.tree, "", new Set())
  const total = countNodes(doc.tree)
  if (total > SERVER_LIMIT_NODES) die(`节点数 ${total} 超过上限 ${SERVER_LIMIT_NODES}`, 2)

  const { state, detail } = await loadLinked(rootDir, client, P)
  const remoteChildren = detail.project.root.children || []
  annotateRemote(remoteChildren, "")
  const prune = !!args.flags.prune
  const ops = buildPlan(doc.tree, remoteChildren, state, { prune })

  const changeCount = ops.create.length + ops.update.length + ops.delete.length
  printPlan(ops, prune)

  if (ops.move.length) {
    info(yellow(`\n注意：检测到 ${ops.move.length} 个节点的父级发生变化，服务端暂不支持移动节点。`))
    info(yellow("如需移动，请在网页端调整，或手动删除后重新创建（移动项本次未处理）。"))
  }
  if (changeCount === 0) {
    info(green("\n已是最新，无需同步。"))
    state.syncedAt = new Date().toISOString()
    saveState(P, state)
    return
  }
  if (args.flags["dry-run"]) {
    info(cyan("\n[dry-run] 未实际写入。去掉 --dry-run 执行同步。"))
    return
  }
  if (ops.delete.length && !args.flags.yes) {
    const ok = await confirm(`将删除 ${ops.delete.length} 个远端节点（含子孙，不可恢复）。确认？输入 y 继续：`)
    if (!ok) die("已取消", 2)
  }

  // 1) 新建：按分组逐棵挂 subtree。add_subtree 的 parentId 必填：
  //    parentId 为 null 表示挂到项目根，执行时替换为项目根节点 id。
  const rootId = detail.project.root.id
  for (const grp of ops.create) {
    // 同组多个根节点：逐个挂（add_subtree 一次只接受一个子树根）
    for (const rootNode of grp.nodes) {
      await client.call("add_subtree", {
        projectId: state.projectId,
        parentId: grp.parentId || rootId,
        tree: toTreeInputOne(rootNode),
      })
    }
  }

  // 2) 更新：逐条 update_node（字段级）
  for (const u of ops.update) {
    await client.call("update_node", {
      projectId: state.projectId,
      nodeId: u.nodeId,
      patch: u.patch,
    })
  }

  // 3) 删除：从最深的开始（叶子先删，避免父删后子 id 失效）
  const deletesSorted = [...ops.delete].sort((a, b) => b.path.length - a.path.length)
  for (const d of deletesSorted) {
    await client.call("delete_node", { projectId: state.projectId, nodeId: d.nodeId })
  }

  // 4) 重新拉取，重建映射并保留既有显式 key 映射，落 state
  await rebuildState(client, P, state.projectId, state.projectName, doc.tree, state)
  info(green(`\n同步完成：新增子树 ${ops.create.length} 棵、更新 ${ops.update.length}、删除 ${ops.delete.length}`))
}

function toTreeInputOne(node) {
  const obj = { title: node.title }
  for (const f of MANAGED_FIELDS) {
    if (node[f] !== undefined && node[f] !== null && !(f === "tags" && (!node.tags || !node.tags.length))) {
      obj[f] = node[f]
    }
  }
  if (node.children && node.children.length) obj.children = toTreeInput(node.children)
  return obj
}

function printPlan(ops, prune) {
  info(cyan("同步计划："))
  let createNodes = 0
  for (const grp of ops.create) {
    const n = countNodes(grp.nodes)
    createNodes += n
    const where = grp.parentId ? `节点 ${grp.parentId} 下` : "项目根"
    for (const rootNode of grp.nodes) {
      info(`  ${green("+ 新增")} 「${rootNode.title}」-> ${where}（含子树 ${countNodes([rootNode])} 节点）`)
    }
  }
  for (const u of ops.update) {
    const fields = Object.keys(u.patch).join("、")
    info(`  ${yellow("~ 更新")} 「${u.title}」 字段：${fields}`)
  }
  for (const d of ops.delete) {
    info(`  ${red("- 删除")} 「${d.title}」(${d.nodeId}) ${dim("含子孙")}`)
  }
  for (const n of ops.note) {
    info(`  ${dim("· 保留")} 远端多出「${n.title}」${prune ? "" : dim("（默认不删，加 --prune 才删除）")}`)
  }
  if (!ops.create.length && !ops.update.length && !ops.delete.length && !ops.note.length) {
    info(`  ${dim("（无差异）")}`)
  }
}

function confirm(question) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    stdin.resume()
    stdin.setEncoding("utf8")
    stdin.once("data", (d) => resolve(d.trim().toLowerCase() === "y"))
  })
}

async function cmdPull(rootDir, args) {
  const { client, P } = requireClient(rootDir)
  let projectId = args.positionals[0]
  if (!projectId) {
    const state = readState(P)
    projectId = state.projectId
  }
  if (!projectId) die("请提供 projectId，或先在本项目 link", 2)
  const detail = await client.call("get_project", { projectId })
  if (!detail.project) die(`项目 ${projectId} 不存在`, 3)

  fs.mkdirSync(P.app, { recursive: true })
  const manifest = findManifest(P.app)
  const outPath = path.join(P.app, "tasks.yaml")
  if (exists(outPath) && !args.flags.force) die(`${outPath} 已存在，加 --force 覆盖`, 2)

  // 远端 -> 本地节点（剥掉内部字段；省略服务端默认值，输出更干净）
  const convert = (nodes) =>
    (nodes || []).map((n) => {
      const o = { title: n.title }
      if (n.type && n.type !== "task" && n.type !== "root") o.type = n.type
      if (n.status && n.status !== "todo") o.status = n.status
      if (n.priority && n.priority !== "medium") o.priority = n.priority
      if (n.progress) o.progress = n.progress
      if (n.startDate) o.startDate = n.startDate
      if (n.dueDate) o.dueDate = n.dueDate
      if (n.estimateHours) o.estimateHours = n.estimateHours
      if (n.description) o.description = n.description
      if (Array.isArray(n.tags) && n.tags.length) o.tags = n.tags
      if (n.children && n.children.length) o.children = convert(n.children)
      return o
    })

  const doc = {
    name: detail.project.name,
    description: detail.project.description || "",
    tree: convert(detail.project.root.children || []),
  }
  fs.writeFileSync(outPath, treeToYaml(doc), "utf8")

  // 保存关联与映射
  assignKeys(doc.tree, "", new Set())
  annotateRemote(detail.project.root.children || [], "")
  const state = freshState()
  state.projectId = projectId
  state.projectName = detail.project.name
  alignMappings(doc.tree, detail.project.root.children || [], state)
  state.syncedAt = new Date().toISOString()
  saveState(P, state)

  info(green(`已拉取项目「${detail.project.name}」-> ${outPath}`))
  info(`共 ${countNodes(doc.tree)} 节点，并已建立关联。可直接 ${cyan("projecttree sync")}。`)
}

async function cmdStatus(rootDir) {
  const { client, P } = requireClient(rootDir)
  const manifest = findManifest(P.app)
  if (!manifest) die(`未找到清单`, 2)
  const doc = loadManifest(manifest)
  assignKeys(doc.tree, "", new Set())
  info(`清单     : ${manifest.path}`)
  info(`本地节点 : ${countNodes(doc.tree)}`)
  const state = readState(P)
  if (!state.projectId) {
    info(yellow(`关联     : 未关联（projecttree push 创建，或 link/pull 关联已有项目）`))
    return
  }
  info(`关联项目 : ${state.projectName || ""} ${cyan(state.projectId)}`)
  info(`上次同步 : ${state.syncedAt || "—"}`)
  try {
    const detail = await client.call("get_project", { projectId: state.projectId })
    info(`远端节点 : ${countNodes(detail.project.root.children || [])}`)
  } catch (e) {
    info(red(`远端读取失败：${e.message}`))
  }
}

async function cmdWatch(rootDir, args) {
  const { P } = requireClient(rootDir)
  const manifest = findManifest(P.app)
  if (!manifest) die(`未找到清单，先 projecttree init`, 2)
  const intervalMs = Math.max(1, Number(args.flags.interval || 2)) * 1000
  let timer = null
  let running = false

  const doSync = async () => {
    if (running) return
    running = true
    try {
      info(cyan(`\n[watch ${new Date().toLocaleTimeString()}] 检测到变化，开始同步…`))
      await cmdSync(rootDir, { flags: { prune: !!args.flags.prune, yes: true } })
    } catch (e) {
      info(red(`[watch] 同步失败：${e.message}`))
    } finally {
      running = false
    }
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(doSync, intervalMs)
  }

  // 启动先全量同步一次
  await doSync()
  info(cyan(`watch 已启动，监听 ${manifest.path}（防抖 ${intervalMs / 1000}s）。Ctrl+C 退出。`))
  fs.watch(manifest.path, { persistent: true }, (eventType) => {
    if (eventType === "change" || eventType === "rename") schedule()
  })
  // 某些编辑器写临时文件再 rename，监听目录更稳
  fs.watch(P.app, { persistent: true }, (_event, filename) => {
    if (filename && MANIFEST_BASENAMES.includes(filename)) schedule()
  })

  // 优雅退出
  process.on("SIGINT", () => { info("\n已停止 watch"); process.exit(0) })
  // 保活
  setInterval(() => {}, 1 << 30)
}

// ----------------------------- 帮助 -----------------------------

function printHelp() {
  info(`ProjectTree CLI — 把任意项目的任务清单实时同步到 ProjectTree

用法: projecttree <命令> [选项]
  也可直接运行: node projecttree.mjs <命令>

配置:
  init [--name X] [--dir .] [--force]   生成 .projecttree/ 骨架与示例清单
  login                                 保存 API Key（~/.projecttree/credentials.json）
  whoami                                查看当前密钥身份/权限

项目接入:
  push [--name X] [--dry-run] [--force] 首次把清单创建为远端项目（整棵写入）
  link <projectId>                      关联到已存在的远端项目（按标题路径自动匹配）
  pull <projectId> [--force]            反向拉取远端树生成本地清单

实时同步:
  sync [--dry-run] [--prune] [--yes]    清单 -> 远端（增/改；--prune 才删）
  diff                                  只看差异计划，不写入
  status                                查看关联与本地/远端摘要
  watch [--interval 2] [--prune]        监听清单变化，防抖后自动 sync

环境变量:
  PROJECTTREE_API_KEY    优先于本地凭据文件
  PROJECTTREE_BASE_URL   覆盖服务地址（默认 ${DEFAULT_BASE_URL}）

清单: ${APP_DIR_NAME}/tasks.yaml（或 tasks.json）
身份: 节点用标题派生稳定 key；可写 '- [my-key] 标题' 固定，重命名也不丢关联。
规则: 网页端手工改动默认保留；只有 sync --prune 才删除清单里没有的远端节点。
`)
}

// ----------------------------- 入口 -----------------------------

async function main() {
  const argv = process.argv.slice(2)
  if (!argv.length || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    printHelp()
    return
  }
  if (argv[0] === "--version" || argv[0] === "-v") {
    info("projecttree-cli 1.0.0")
    return
  }
  const command = argv[0]
  const args = parseArgs(argv.slice(1))
  const cwd = process.cwd()
  // 需要在项目内执行的命令：定位根；init/login/whoami 可在任意位置
  const needsRoot = new Set(["push", "link", "sync", "diff", "pull", "status", "watch"])

  try {
    if (command === "init") return await cmdInit(args)
    if (command === "login") return await cmdLogin()
    if (command === "whoami") {
      const root = findProjectRoot(cwd) || cwd
      return await cmdWhoami(root)
    }
    if (needsRoot.has(command)) {
      const root = findProjectRoot(cwd)
      if (!root) die(`当前目录及其父级找不到 ${APP_DIR_NAME}/，先在项目根运行 projecttree init`, 2)
      switch (command) {
        case "push": return await cmdPush(root, args)
        case "link": return await cmdLink(root, args)
        case "sync": return await cmdSync(root, args)
        case "diff": return await cmdDiff(root)
        case "pull": return await cmdPull(root, args)
        case "status": return await cmdStatus(root)
        case "watch": return await cmdWatch(root, args)
      }
    }
    die(`未知命令：${command}。运行 projecttree help 查看用法`, 2)
  } catch (e) {
    if (e instanceof ParseError) die(`清单解析失败：${e.message}`, 2)
    if (e instanceof McpError) {
      if (e.code === "unauthorized") die(`鉴权失败：${e.message}`, 3)
      die(`远端错误[${e.code}]：${e.message}`, 3)
    }
    die(e && e.stack && process.env.DEBUG ? e.stack : e.message || String(e), 1)
  }
}

main()
