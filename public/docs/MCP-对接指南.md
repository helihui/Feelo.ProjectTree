# ProjectTree MCP 对接指南

> 面向第三方开发者 / AI Agent 开发者的完整接入文档。
> 服务名：`feelo-project-tree` · 版本：`1.0.0` · MCP 协议版本：`2026-07-28`
> 最后更新：2026-09-05

---

## 目录

- [1. 这是什么](#1-这是什么)
- [2. 五分钟快速上手](#2-五分钟快速上手)
- [3. 获取 API 密钥](#3-获取-api-密钥)
- [4. 协议细节（必读）](#4-协议细节必读)
- [5. 权限模型](#5-权限模型)
- [6. 工具总览](#6-工具总览)
- [7. 工具详细参考](#7-工具详细参考)
- [8. 数据字典](#8-数据字典)
- [9. 错误处理](#9-错误处理)
- [10. 完整示例：从零创建一个项目](#10-完整示例从零创建一个项目)
- [11. 客户端接入代码](#11-客户端接入代码)
- [12. 最佳实践与限制](#12-最佳实践与限制)
- [13. 常见问题排查](#13-常见问题排查)

---

## 1. 这是什么

ProjectTree 是一个「项目 + 任务树」管理系统。本 MCP 服务把它的核心能力开放出来，让你的 AI Agent 或后端程序可以：

- 创建 / 查询 / 修改 / 删除**项目**
- 增删改查项目下的**任务节点树**（支持任意层级嵌套）
- **批量推进进度**、发表评论
- 查询成员并把任务指派给人

**重要设计前提：任务拆解由你（调用方）完成。**
本服务**不做** AI 拆解。你的模型把需求拆成一棵嵌套的任务树，作为 `tree` 参数**整棵传进来**，服务端只负责校验和落库。这样你可以完全掌控拆解逻辑和提示词。

### 端点

| 项 | 值 |
|---|---|
| 端点 URL | `https://projecttree.feelo.top/api/mcp` |
| 传输方式 | Streamable HTTP（单端点，仅 `POST`） |
| 鉴权 | 请求头 `x-api-key: pt_live_xxx` |
| 协议版本 | `2026-07-28` |
| 工具数量 | 16 |

> 本地开发：`http://localhost:3000/api/mcp`

---

## 2. 五分钟快速上手

### 第 1 步：拿到密钥

登录 ProjectTree 网站 → 左侧边栏 **API 密钥** → **签发密钥** → 复制形如 `pt_live_...` 的原文。
（详见 [第 3 章](#3-获取-api-密钥)。密钥原文只显示一次。）

### 第 2 步：验证连通性

把下面这段直接粘到终端（替换 `YOUR_KEY` 和域名）。这是**能跑通的最小请求**：

```bash
curl -X POST https://projecttree.feelo.top/api/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "x-api-key: YOUR_KEY" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" \
  -H "Mcp-Name: whoami" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "whoami",
      "arguments": {},
      "_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { "name": "my-app", "version": "1.0.0" }
      }
    }
  }'
```

成功会返回：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "密钥「我的密钥」以成员 u_xxx 身份调用，角色 admin，生效权限：project:create、node:manage" }],
    "structuredContent": {
      "keyName": "我的密钥",
      "memberId": "u_mtcvspv7_mzcc",
      "roleKey": "admin",
      "scopes": ["project:create", "node:manage"],
      "limits": { "maxTreeNodes": 500, "maxTreeDepth": 8 }
    }
  }
}
```

看到这个就说明**鉴权已打通**，`scopes` 就是你这把密钥的实际权限。

> Windows PowerShell 用户注意：`curl` 是 `Invoke-WebRequest` 的别名，必须写 `curl.exe`，否则参数会报错。

### 第 3 步：创建第一个项目

```bash
curl -X POST https://projecttree.feelo.top/api/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "x-api-key: YOUR_KEY" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" \
  -H "Mcp-Name: create_project" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "create_project",
      "arguments": {
        "name": "官网改版",
        "description": "2026 Q1 官网重构",
        "tree": {
          "title": "官网改版",
          "children": [
            {
              "title": "设计阶段",
              "type": "phase",
              "children": [
                { "title": "视觉稿", "type": "task", "priority": "high", "estimateHours": 16 },
                { "title": "交互稿", "type": "task" }
              ]
            },
            { "title": "开发阶段", "type": "phase" }
          ]
        }
      },
      "_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {}
      }
    }
  }'
```

返回 `{ "projectId": "p_mtnr9j8h_iknu3", "nodeCount": 5 }`。到这里就已经接入完成了。

---

## 3. 获取 API 密钥

### 签发流程

1. 用你的账号登录 [https://projecttree.feelo.top](https://projecttree.feelo.top)
2. 左侧边栏点 **API 密钥**（所有角色都能看到这个入口）
3. 点 **签发密钥**，填写：

| 字段 | 说明 |
|---|---|
| **名称** | 便于识别的备注，如「客户 A 的 Agent」 |
| **归属成员** | 密钥以哪个成员的身份调用。**只有管理员**能签给别人，普通成员只能签给自己 |
| **权限范围** | 勾选允许的操作，见下表。**一个都不勾 = 只读密钥** |
| **有效期** | 永不过期 / 30 天 / 90 天 / 365 天 |

4. 点确认后弹出**密钥原文**，形如 `pt_live_x8Kd...`。
   **立刻复制保存。关闭弹窗后无法再次查看**（服务端只存 SHA-256 摘要）。

### 可勾选的权限范围

| 权限值 | 界面标签 | 解锁的工具 |
|---|---|---|
| `project:create` | 创建项目 | `create_project` |
| `node:manage` | 管理节点 | `add_node`、`add_subtree`、`update_node`（全字段）、`delete_node` |
| `node:updateOwn` | 更新自己负责的节点 | `update_node`、`update_progress`（仅限指派给本人的节点，且只能改 status/progress） |
| `comment:write` | 发表评论 | `add_comment` |
| `member:manage` | 管理成员 | `update_project_members` |

> 读取类工具（`list_projects`、`get_project`、`list_nodes`、`get_node`、`list_members`、`whoami`）**无需任何 scope**，任何有效密钥都能调用。
> `update_project` / `delete_project` 不需要 scope，但受**角色 + 归属**限制（见下一章）。

### 管理密钥

在 API 密钥页面每张卡片上可以：

- **停用 / 启用**（Power 图标）：停用后调用立即返回 401 `密钥已被停用`，可随时恢复
- **吊销**（垃圾桶图标）：永久删除，不可恢复
- 查看 `keyPrefix`（如 `pt_live_a1b2c3••••••••`）、归属成员、权限、到期时间、**最近使用时间**

管理员能看到全部密钥；普通成员只能看到自己名下的。

### 密钥格式

```
pt_live_ + 48 位 base64url 随机串
```

前缀 `pt_live_` 固定。`keyPrefix` 为原文的前 14 个字符（`pt_live_` + 6 字符），用于在界面上区分不同密钥。

---

## 4. 协议细节（必读）

本服务严格实现 MCP `2026-07-28` 规范。**这一版规范和很多老教程不一样，以下四点是 90% 接入失败的原因。**

### 4.1 没有 `initialize` 握手

`2026-07-28` 取消了 `initialize`。直接发业务请求即可。
如需探测服务端能力，调用 `server/discover`：

```json
{ "jsonrpc": "2.0", "id": 1, "method": "server/discover", "params": { "_meta": { ... } } }
```

实际返回：

```json
{
  "supportedVersions": ["2026-07-28"],
  "capabilities": { "tools": { "listChanged": true } },
  "instructions": "项目树管理服务。先用 whoami 确认权限，用 list_projects / list_members 拿到 id，再执行读写。创建项目时把拆解好的任务树作为 tree 参数整棵传入。",
  "resultType": "complete",
  "ttlMs": 0,
  "cacheScope": "private",
  "_meta": {
    "io.modelcontextprotocol/serverInfo": { "name": "feelo-project-tree", "version": "1.0.0" }
  }
}
```

### 4.2 必需的请求头

| 请求头 | 是否必需 | 值 |
|---|---|---|
| `content-type` | 必需 | `application/json` |
| `accept` | 必需 | `application/json, text/event-stream`（**两个都要**） |
| `x-api-key` | 必需 | 你的密钥原文 |
| `MCP-Protocol-Version` | 必需 | `2026-07-28` |
| `Mcp-Method` | 必需 | 必须与 body 的 `method` 完全一致 |
| `Mcp-Name` | 调 `tools/call` 时必需 | 必须与 body 的 `params.name`（工具名）完全一致 |

头和 body 不一致会返回 **400 / `-32020`**：

```json
{
  "code": -32020,
  "message": "Bad Request: the request headers and body disagree: the body carries params.name=\"whoami\" but the required Mcp-Name header is absent",
  "data": { "mismatch": { "header": "(missing)", "body": "whoami" } }
}
```

### 4.3 每个请求的 `params` 里必须有 `_meta` 信封

这是最容易漏的一点。**缺 `_meta` 直接 400**：

```json
{
  "code": -32602,
  "message": "Invalid params: the MCP-Protocol-Version header names protocol revision 2026-07-28, but the request is missing the required per-request envelope key(s): _meta",
  "data": { "envelope": { "missing": ["_meta"] } }
}
```

`_meta` 的键：

| 键 | 必需 | 类型 | 说明 |
|---|---|---|---|
| `io.modelcontextprotocol/protocolVersion` | **必需** | string | 必须与 `MCP-Protocol-Version` 头一致 |
| `io.modelcontextprotocol/clientCapabilities` | **必需** | object | 没有特殊能力就传 `{}` |
| `io.modelcontextprotocol/clientInfo` | 可选 | `{ name, version }` | 客户端标识 |
| `io.modelcontextprotocol/logLevel` | 可选 | string | 日志级别 |
| `progressToken` | 可选 | string \| number | 进度回传令牌 |

**可以直接复用的常量：**

```js
const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "my-app", version: "1.0.0" },
}
```

### 4.4 只接受 POST

`GET` / `PUT` / `PATCH` / `DELETE` 一律返回 **405**：

```json
{ "jsonrpc": "2.0", "id": null, "error": { "code": -32000, "message": "MCP 端点只接受 POST" } }
```

### 4.5 Origin 校验

不带 `Origin` 头的服务端请求**直接放行**（正常的服务端 MCP 客户端属于这种）。
带 `Origin` 头的浏览器请求会被校验，不在白名单则返回 **403 / `-32000`** `Origin 不被允许`。

白名单通过服务端环境变量 `MCP_ALLOWED_ORIGINS` 配置（逗号分隔），服务自身的域名默认允许。
**如果你从浏览器直连，请联系服务提供方把你的域名加进白名单**（但更推荐由你的后端代理，避免密钥暴露在前端）。

### 4.6 无状态

服务端不维护会话。每个请求独立鉴权、独立执行，不需要携带 session id，也不需要按顺序调用。可以并发。

---

## 5. 权限模型

### 5.1 最终权限 = 成员角色权限 ∩ 密钥 scopes

密钥**只能收窄，不能放大**。即使密钥归属管理员，如果签发时没勾任何权限，也无法写入任何数据。

> 实测：admin 角色 + 空 scopes 调 `create_project` → `[forbidden] 缺少权限：project:create`

### 5.2 四种角色的基础权限

| 权限 | 管理员 admin | 项目经理 manager | 成员 member | 访客 guest |
|---|:-:|:-:|:-:|:-:|
| `project:create` | ✅ | ✅ | ❌ | ❌ |
| `node:manage` | ✅ | ✅ | ❌ | ❌ |
| `node:updateOwn` | ✅ | ✅ | ✅ | ❌ |
| `comment:write` | ✅ | ✅ | ✅ | ❌ |
| `member:manage` | ✅ | ❌ | ❌ | ❌ |
| `ai:configure` | ✅ | ❌ | ❌ | ❌ |

### 5.3 项目归属限制

`update_project`、`delete_project`、`update_project_members` 额外受归属约束：

- **管理员**：可操作任意项目
- **项目经理**：只能操作**自己创建的**项目
- 其他：一律 `forbidden: 没有操作权限`

### 5.4 节点编辑的两档权限

| 你的权限 | `update_node` 能改什么 |
|---|---|
| 有 `node:manage` | 任意节点的**全部字段** |
| 只有 `node:updateOwn` | **仅** `assigneeIds` 包含自己的节点，**且只能改** `status` 和 `progress`，其他字段被静默忽略 |
| 都没有 | `forbidden: 没有操作权限` |

`update_progress` 同理，且它是**逐条独立判权**：无权的那几条失败，其余照常成功。

### 5.5 建议的最小权限配置

| 你的场景 | 建议勾选 |
|---|---|
| 只读看板 / 数据同步 | 不勾任何（只读密钥） |
| AI 规划助手（建项目 + 拆树） | `project:create` + `node:manage` |
| 进度机器人（只推进度） | `node:updateOwn` |
| 全功能 Agent | `project:create` + `node:manage` + `comment:write` |

---

## 6. 工具总览

`tools/list` 返回的 16 个工具（顺序如下）：

| # | 工具名 | 作用 | 所需 scope | 只读 | 破坏性 |
|---|---|---|---|:-:|:-:|
| 1 | `list_projects` | 列出项目摘要 | — | ✅ | |
| 2 | `get_project` | 项目详情 + 嵌套树 | — | ✅ | |
| 3 | `create_project` | 创建项目并整棵写入任务树 | `project:create` | | |
| 4 | `update_project` | 改项目名 / 描述 | 归属限制 | | |
| 5 | `delete_project` | 删项目及全部节点评论 | 归属限制 | | ⚠️ |
| 6 | `update_project_members` | 覆盖式设置参与成员 | `member:manage` | | |
| 7 | `list_nodes` | 扁平节点列表（可过滤） | — | ✅ | |
| 8 | `get_node` | 节点详情 + 子节点 id + 评论 | — | ✅ | |
| 9 | `add_node` | 追加单个节点 | `node:manage` | | |
| 10 | `add_subtree` | 挂载整棵嵌套子树 | `node:manage` | | |
| 11 | `update_node` | 更新节点字段 | `node:manage` 或 `node:updateOwn` | | |
| 12 | `update_progress` | 批量推进 status / progress | `node:manage` 或 `node:updateOwn` | | |
| 13 | `delete_node` | 删节点及全部子孙 | `node:manage` | | ⚠️ |
| 14 | `list_members` | 列出成员 | — | ✅ | |
| 15 | `add_comment` | 在节点下发表评论 | `comment:write` | | |
| 16 | `whoami` | 查看当前身份与生效权限 | — | ✅ | |

### 典型调用顺序

```
whoami                  → 确认鉴权与权限
  ↓
list_members            → 把人名解析成 memberId（要指派任务时）
  ↓
create_project          → 拿到 projectId
  ↓
list_nodes(parentId:null) → 拿到根节点 id
  ↓
add_subtree / add_node  → 补充结构
  ↓
update_progress         → 批量推进
```

---

## 7. 工具详细参考

> 所有工具的返回都是 `{ content: [{type:"text", text:"人类可读摘要"}], structuredContent: {...} }`。
> **程序请读 `structuredContent`**，`content[0].text` 只是给模型看的摘要。

---

### 7.1 `list_projects` — 列出项目

按创建时间**倒序**返回项目摘要。

**入参**

| 参数 | 类型 | 必需 | 约束 | 默认 | 说明 |
|---|---|:-:|---|---|---|
| `limit` | int | | 1–200 | 50 | 返回条数 |
| `offset` | int | | ≥ 0 | 0 | 偏移量 |

**返回 `structuredContent`**

```json
{
  "projects": [
    {
      "id": "p_mtnr9j8h_iknu3",
      "name": "官网改版",
      "description": "2026 Q1 官网重构",
      "ownerId": "u_mtcvspv7_mzcc",
      "memberIds": ["u_mtcvspv7_mzcc"],
      "nodeCount": 5,
      "progress": 20,
      "createdAt": "2026-09-05",
      "updatedAt": "2026-09-05"
    }
  ],
  "count": 1
}
```

`progress` 是该项目下所有节点 `progress` 的算术平均（整数）。

---

### 7.2 `get_project` — 获取项目详情

返回项目完整信息 + **嵌套的**节点树。

**入参**

| 参数 | 类型 | 必需 | 约束 | 默认 | 说明 |
|---|---|:-:|---|---|---|
| `projectId` | string | ✅ | 非空 | | 形如 `p_xxx` |
| `depth` | int | | 1–20 | 全部 | 返回的树层级，根节点算第 1 层 |

**返回 `structuredContent`**

```json
{
  "project": {
    "id": "p_mtnr9j8h_iknu3",
    "name": "官网改版",
    "description": "2026 Q1 官网重构",
    "ownerId": "u_mtcvspv7_mzcc",
    "memberIds": ["u_mtcvspv7_mzcc"],
    "createdAt": "2026-09-05",
    "updatedAt": "2026-09-05",
    "root": {
      "id": "n_mtnr9j8h_0_ab12",
      "title": "官网改版",
      "description": "",
      "type": "root",
      "status": "todo",
      "priority": "medium",
      "progress": 0,
      "assigneeIds": [],
      "startDate": null,
      "dueDate": null,
      "estimateHours": 0,
      "tags": [],
      "comments": [],
      "aiGenerated": false,
      "children": [ /* 同结构递归 */ ]
    }
  }
}
```

> 树很大时（数百节点）建议用 `depth` 限层，或改用 `list_nodes` 逐层下钻，避免单次响应过大。
> 项目不存在 → `{"error":{"code":"not_found","message":"项目不存在"}}` 且 `isError: true`。

---

### 7.3 `create_project` — 创建项目

一次请求创建项目并写入完整任务树。

**入参**

| 参数 | 类型 | 必需 | 约束 | 说明 |
|---|---|:-:|---|---|
| `name` | string | ✅ | 1–120 字符 | 项目名称，**同时作为根节点标题** |
| `description` | string | | ≤ 2000 | 项目描述 |
| `tree` | TreeNodeInput | | ≤ 500 节点 / ≤ 8 层 | 根节点及其嵌套子节点。**不传则只建一个空根节点** |
| `memberIds` | string[] | | | 初始参与成员。不存在的 id 会被过滤；**密钥归属成员始终自动加入** |

`TreeNodeInput` 结构见 [8.4](#84-treenodeinput树输入结构)。

**行为要点**

- 根节点标题**强制覆盖为** `name`，`tree.title` 传什么都会被替换
- 根节点 `type` 强制为 `root`
- 未指定的字段用默认值：`description=""`、`type="task"`、`status="todo"`、`priority="medium"`、`progress=0`

**返回**

```json
{ "projectId": "p_mtnr9j8h_iknu3", "nodeCount": 5 }
```

`nodeCount` 含根节点。

**可能的错误**

| code | 触发条件 |
|---|---|
| `forbidden` | 缺 `project:create` |
| `too_large` | 树超过 500 节点或 8 层 |
| `invalid_input` | 某个节点 `title` 为空 |

---

### 7.4 `update_project` — 更新项目信息

**入参**

| 参数 | 类型 | 必需 | 约束 |
|---|---|:-:|---|
| `projectId` | string | ✅ | 非空 |
| `name` | string | | 1–120 |
| `description` | string | | ≤ 2000 |

`name` 与 `description` **至少提供一个**，否则 `invalid_input`。

**行为**：改名会**同步更新根节点标题**。

**返回**

```json
{ "projectId": "p_xxx", "updated": { "name": "新名字", "description": null } }
```

---

### 7.5 `delete_project` — 删除项目

**不可恢复。** 会级联删除项目下的全部节点与评论。

**入参**

| 参数 | 类型 | 必需 |
|---|---|:-:|
| `projectId` | string | ✅ |

**返回**：`{ "projectId": "p_xxx", "deleted": true }`

标注了 `destructiveHint: true`，建议 MCP 客户端在执行前向用户确认。

---

### 7.6 `update_project_members` — 设置参与成员

**覆盖式**写入，不是增量追加。

**入参**

| 参数 | 类型 | 必需 | 说明 |
|---|---|:-:|---|
| `projectId` | string | ✅ | |
| `memberIds` | string[] | ✅ | **完整**的成员列表 |

**行为**：不存在的 memberId 自动过滤；**项目创建者始终保留**（即使不在传入列表里）。

**返回**：`{ "projectId": "p_xxx", "memberIds": ["u_a","u_b"] }` — 返回的是**过滤后的实际结果**，请以此为准。

---

### 7.7 `list_nodes` — 列出节点（扁平）

**入参**

| 参数 | 类型 | 必需 | 说明 |
|---|---|:-:|---|
| `projectId` | string | ✅ | |
| `parentId` | string \| null | | 按父节点过滤。传 `null` **只返回根节点**；不传返回全部 |
| `status` | NodeStatus | | 按状态过滤 |
| `assigneeId` | string | | 按负责人 memberId 过滤 |

排序：`sortOrder` 升序，其次 `createdAt` 升序。

**返回**

```json
{
  "nodes": [
    {
      "id": "n_mtnr9j8h_0_ab12",
      "parentId": null,
      "title": "官网改版",
      "description": "",
      "type": "root",
      "status": "todo",
      "priority": "medium",
      "progress": 0,
      "assigneeIds": [],
      "startDate": null,
      "dueDate": null,
      "estimateHours": 0,
      "tags": [],
      "sortOrder": 0
    }
  ],
  "count": 1
}
```

> **拿根节点 id 的标准做法**：`list_nodes({ projectId, parentId: null })`，返回数组的第一项就是根。

---

### 7.8 `get_node` — 获取节点详情

**入参**：`projectId`（✅）、`nodeId`（✅）

**返回**

```json
{
  "node": {
    "id": "n_xxx",
    "projectId": "p_xxx",
    "parentId": "n_yyy",
    "title": "视觉稿",
    "description": "",
    "type": "task",
    "status": "progress",
    "priority": "high",
    "progress": 40,
    "assigneeIds": ["u_a"],
    "startDate": "2026-09-01",
    "dueDate": "2026-09-15",
    "estimateHours": 16,
    "tags": ["设计"],
    "aiGenerated": false,
    "childIds": ["n_c1", "n_c2"],
    "comments": [
      { "id": "c_xxx", "authorId": "u_a", "content": "初稿完成", "createdAt": "2026-09-03" }
    ]
  }
}
```

节点不存在 → `not_found: 节点不存在`。

---

### 7.9 `add_node` — 新增单个节点

在指定父节点下**追加**一个节点。要一次挂多层结构请用 `add_subtree`。

**入参**

| 参数 | 类型 | 必需 | 约束 |
|---|---|:-:|---|
| `projectId` | string | ✅ | |
| `parentId` | string | ✅ | 父节点 id（根节点 id 用 `list_nodes` 取） |
| `title` | string | ✅ | 1–200 |
| `description` | string | | ≤ 2000 |
| `type` | NodeType | | 默认 `task` |
| `status` | NodeStatus | | 默认 `todo` |
| `priority` | Priority | | 默认 `medium` |
| `assigneeIds` | string[] | | |
| `startDate` | string \| null | | `yyyy-MM-dd` |
| `dueDate` | string \| null | | `yyyy-MM-dd` |
| `estimateHours` | int | | ≥ 0 |
| `tags` | string[] | | |

**返回**：`{ "nodeId": "n_xxx", "projectId": "p_xxx" }`

需要 `node:manage`。

---

### 7.10 `add_subtree` — 挂载子树

在指定父节点下一次性挂载**整棵嵌套子树**。

**入参**

| 参数 | 类型 | 必需 | 约束 |
|---|---|:-:|---|
| `projectId` | string | ✅ | |
| `parentId` | string | ✅ | 挂载点 |
| `tree` | TreeNodeInput | ✅ | ≤ 500 节点 / ≤ 8 层 |

**返回**

```json
{ "rootId": "n_mtnr9qr8_0_wcns", "nodeCount": 3, "projectId": "p_xxx" }
```

`rootId` 是**你传入的 `tree` 本身**对应的新节点 id（不是 `projectId` 的根）。

需要 `node:manage`。

---

### 7.11 `update_node` — 更新节点

**入参**

| 参数 | 类型 | 必需 | 说明 |
|---|---|:-:|---|
| `projectId` | string | ✅ | |
| `nodeId` | string | ✅ | |
| `patch` | object | ✅ | **只传要改的字段**，见下 |

`patch` 可含字段（全部可选，语义同 `add_node`，但**没有** `type` 和 `children`）：

`title`、`description`、`status`、`priority`、`progress`(0–100)、`assigneeIds`、`startDate`、`dueDate`、`estimateHours`、`tags`

**权限降级行为**：只有 `node:updateOwn` 时，`patch` 里除 `status` / `progress` 之外的字段**被静默丢弃**。请以返回的 `updatedFields` 为准判断实际生效了什么。

**返回**

```json
{ "nodeId": "n_xxx", "projectId": "p_xxx", "updatedFields": ["status", "progress", "tags"] }
```

**错误**

| code | 条件 |
|---|---|
| `invalid_input` | `patch` 里没有任何可更新字段 |
| `forbidden` | 无权编辑该节点 |
| `not_found` | 节点不存在 |

---

### 7.12 `update_progress` — 批量推进进度

一次提交多个节点的状态/进度，避免多次往返。

**入参**

| 参数 | 类型 | 必需 | 约束 |
|---|---|:-:|---|
| `projectId` | string | ✅ | |
| `updates` | array | ✅ | 1–200 项 |
| `updates[].nodeId` | string | ✅ | |
| `updates[].status` | NodeStatus | | 与 `progress` **至少一个** |
| `updates[].progress` | int | | 0–100 |

**行为**：**逐条独立判权与执行**，部分失败不影响其余。

**返回**

```json
{
  "projectId": "p_xxx",
  "results": [
    { "nodeId": "n_a", "ok": true },
    { "nodeId": "n_b", "ok": false, "reason": "没有操作权限" }
  ],
  "okCount": 1,
  "failedCount": 1
}
```

> 注意：只要请求本身合法，即使全部条目都失败，`isError` 也是 `false`。**必须检查 `failedCount`。**

---

### 7.13 `delete_node` — 删除节点

删除节点及其**全部子孙节点**与相关评论，不可恢复。

**入参**：`projectId`（✅）、`nodeId`（✅）

**返回**：`{ "projectId": "p_xxx", "nodeId": "n_xxx", "removed": 4 }` — `removed` 是实际删除的节点总数（含子孙）。

**根节点不可删除**：`forbidden: 根节点不可删除，请改用 delete_project`

需要 `node:manage`。

---

### 7.14 `list_members` — 列出成员

**入参**

| 参数 | 类型 | 必需 | 说明 |
|---|---|:-:|---|
| `projectId` | string | | 传了则只返回该项目的参与成员；不传返回全部成员 |

**返回**

```json
{
  "members": [
    {
      "id": "u_mtcvspv7_mzcc",
      "name": "张三",
      "email": "zhang@example.com",
      "role": "管理员",
      "roleKey": "admin",
      "hasAccount": true
    }
  ],
  "count": 1
}
```

> **把人名指派成任务负责人的正确姿势**：先用本工具按 `name` 找到 `id`，再把 `id` 填进 `assigneeIds`。直接填人名不会生效。

---

### 7.15 `add_comment` — 发表评论

**入参**

| 参数 | 类型 | 必需 | 约束 |
|---|---|:-:|---|
| `projectId` | string | ✅ | |
| `nodeId` | string | ✅ | |
| `content` | string | ✅ | 1–4000 |

作者自动为**密钥归属成员**，无法伪造他人。

**返回**

```json
{
  "comment": { "id": "c_xxx", "authorId": "u_xxx", "content": "已完成", "createdAt": "2026-09-05" },
  "projectId": "p_xxx"
}
```

需要 `comment:write`。

---

### 7.16 `whoami` — 查看身份与权限

**入参**：无（传 `{}`）

**返回**

```json
{
  "keyName": "本地联调",
  "memberId": "u_mtcvspv7_mzcc",
  "roleKey": "admin",
  "scopes": ["project:create", "node:manage", "node:updateOwn", "comment:write", "member:manage"],
  "limits": { "maxTreeNodes": 500, "maxTreeDepth": 8 }
}
```

`scopes` 是**已经和角色权限求过交集的最终生效权限**。接入调试第一步就调它。

---

## 8. 数据字典

### 8.1 NodeStatus（节点状态）

| 值 | 含义 |
|---|---|
| `todo` | 待开始（默认） |
| `progress` | 进行中 |
| `done` | 已完成 |
| `blocked` | 阻塞 |
| `paused` | 暂停 |

### 8.2 NodeType（节点类型）

| 值 | 含义 |
|---|---|
| `root` | 项目根节点（**由系统自动设置，不要手动传**） |
| `milestone` | 里程碑 |
| `phase` | 阶段 |
| `epic` | 史诗 |
| `module` | 模块 |
| `task` | 任务（默认） |
| `subtask` | 子任务 |

`type` 纯粹是语义标签，服务端不校验层级关系（不要求 `phase` 一定在 `milestone` 下）。

### 8.3 Priority（优先级）

`low` · `medium`（默认）· `high` · `urgent`

### 8.4 TreeNodeInput（树输入结构）

`create_project.tree` 和 `add_subtree.tree` 使用的**递归**结构。除 `title` 外全部可选：

```ts
interface TreeNodeInput {
  title: string                 // 必填，1-200 字符
  description?: string          // ≤ 2000
  type?: NodeType               // 默认 task（根节点自动 root）
  status?: NodeStatus           // 默认 todo
  priority?: Priority           // 默认 medium
  progress?: number             // 整数 0-100，默认 0
  assigneeIds?: string[]        // memberId 数组
  startDate?: string | null     // yyyy-MM-dd
  dueDate?: string | null       // yyyy-MM-dd
  estimateHours?: number        // 整数 0-100000
  tags?: string[]               // 每个标签 ≤ 40 字符
  children?: TreeNodeInput[]    // 递归嵌套
}
```

**最小可用形式**（只有标题的三层树）：

```json
{
  "title": "第一期",
  "children": [
    { "title": "需求", "children": [{ "title": "访谈" }] },
    { "title": "开发" }
  ]
}
```

### 8.5 日期格式

所有日期字段**入参与返回都是 `yyyy-MM-dd`**（如 `2026-09-05`），不含时间和时区。
不符合正则 `^\d{4}-\d{2}-\d{2}$` 会被拒绝：`日期格式必须为 yyyy-MM-dd`。
可以显式传 `null` 表示清空。

### 8.6 ID 格式

| 前缀 | 对象 | 示例 |
|---|---|---|
| `p_` | 项目 | `p_mtnr9j8h_iknu3` |
| `n_` | 节点 | `n_mtnr9qr8_0_wcns` |
| `u_` | 成员 | `u_mtcvspv7_mzcc` |
| `c_` | 评论 | `c_mtnr9x1a_kk91` |

ID 是不透明字符串，**不要解析其内部结构**，格式可能变化。

### 8.7 规模上限

| 项 | 上限 |
|---|---|
| 单次 `create_project` / `add_subtree` 节点数 | 500 |
| 树深度 | 8 层 |
| `update_progress` 单次条数 | 200 |
| `list_projects` 单次条数 | 200 |
| 标题长度 | 200 |
| 描述长度 | 2000 |
| 评论长度 | 4000 |

上限值也可从 `whoami` 的 `limits` 动态读取。

---

## 9. 错误处理

错误分**三层**，必须分开处理。

### 9.1 HTTP 层错误（鉴权 / 协议）

以 JSON-RPC error 形式返回，`result` 缺失。

| HTTP | code | message | 原因与对策 |
|---|---|---|---|
| 401 | `-32001` | `缺少 x-api-key 请求头` | 没带头 |
| 401 | `-32001` | `密钥无效` | 密钥错误或已被吊销 |
| 401 | `-32001` | `密钥已被停用` | 到网站上重新启用 |
| 401 | `-32001` | `密钥已过期` | 重新签发 |
| 401 | `-32001` | `密钥归属的成员已被删除` | 重新签发给有效成员 |
| 403 | `-32000` | `Origin 不被允许` | 加白名单，或改由后端代理 |
| 405 | `-32000` | `MCP 端点只接受 POST` | 改用 POST |
| 400 | `-32602` | `missing the required per-request envelope key(s): _meta` | 补 `_meta`（见 [4.3](#43-每个请求的-params-里必须有-_meta-信封)） |
| 400 | `-32020` | `the request headers and body disagree` | `Mcp-Method` / `Mcp-Name` 与 body 不一致 |

401 响应会带 `www-authenticate: ApiKey realm="mcp", header="x-api-key"`。

### 9.2 入参校验错误（HTTP 200 + `isError`）

**注意：不是 JSON-RPC error，而是 200 响应里 `result.isError = true`。**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{
      "type": "text",
      "text": "Input validation error: Invalid arguments for tool update_node: patch.progress: Too big: expected number to be <=100"
    }],
    "isError": true
  }
}
```

这类错误**没有** `structuredContent`。报错文本里带具体字段路径，直接可读。

### 9.3 业务错误（HTTP 200 + `isError` + 结构化 code）

```json
{
  "content": [{ "type": "text", "text": "[forbidden] 缺少权限：project:create" }],
  "structuredContent": { "error": { "code": "forbidden", "message": "缺少权限：project:create" } },
  "isError": true
}
```

业务错误码全集：

| code | 含义 | 常见 message |
|---|---|---|
| `unauthorized` | 未认证 | — |
| `forbidden` | 权限不足 | `缺少权限：project:create`、`没有操作权限`、`根节点不可删除，请改用 delete_project` |
| `not_found` | 对象不存在 | `项目不存在`、`节点不存在` |
| `invalid_input` | 入参语义非法 | `没有可更新的字段`、`updates 不能为空`、`name 与 description 至少提供一个`、`节点 title 不能为空` |
| `too_large` | 超出规模上限 | `树深度超过上限 8 层`、`节点总数超过上限 500 个`、`单次最多更新 200 个节点` |
| `internal_error` | 服务端异常 | `服务端内部错误`（详情只记服务端日志，不外泄） |

### 9.4 推荐的判错代码

```js
function unwrap(rpcResponse) {
  // 第 1 层：协议 / 鉴权
  if (rpcResponse.error) {
    throw new Error(`[rpc ${rpcResponse.error.code}] ${rpcResponse.error.message}`)
  }
  const r = rpcResponse.result
  // 第 2、3 层：工具执行失败
  if (r.isError) {
    const code = r.structuredContent?.error?.code ?? "validation_error"
    throw new Error(`[${code}] ${r.content[0].text}`)
  }
  return r.structuredContent
}
```

### 9.5 审计

每次工具调用都会落审计日志：密钥 id、成员 id、工具名、projectId、成功与否、错误码、耗时。
密钥的 `lastUsedAt` 也会更新。**你的所有操作都是可追溯的。**

---

## 10. 完整示例：从零创建一个项目

以下是一个真实可跑的完整流程（Node.js，无第三方依赖）。

```js
const ENDPOINT = "https://projecttree.feelo.top/api/mcp"
const API_KEY = process.env.PROJECTTREE_KEY

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "demo", version: "1.0.0" },
}

let seq = 0

/** 调用一个工具，返回 structuredContent；失败抛错 */
async function callTool(name, args = {}) {
  const body = {
    jsonrpc: "2.0",
    id: ++seq,
    method: "tools/call",
    params: { name, arguments: args, _meta: META },
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-api-key": API_KEY,
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,          // 必须与 params.name 一致
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (json.error) throw new Error(`[rpc ${json.error.code}] ${json.error.message}`)
  if (json.result.isError) {
    const code = json.result.structuredContent?.error?.code ?? "validation_error"
    throw new Error(`[${code}] ${json.result.content[0].text}`)
  }
  return json.result.structuredContent
}

async function main() {
  // 1. 确认身份与权限
  const me = await callTool("whoami")
  console.log("身份:", me.memberId, "角色:", me.roleKey, "权限:", me.scopes)

  // 2. 找到要指派的人
  const { members } = await callTool("list_members")
  const alice = members.find((m) => m.name === "张三")

  // 3. 创建项目并一次性写入任务树（树由你的模型拆解产出）
  const { projectId, nodeCount } = await callTool("create_project", {
    name: "移动端 App v2",
    description: "2026 上半年迭代",
    memberIds: alice ? [alice.id] : [],
    tree: {
      title: "移动端 App v2",           // 会被 name 覆盖，可省略
      children: [
        {
          title: "需求与设计",
          type: "phase",
          children: [
            {
              title: "用户调研",
              type: "task",
              priority: "high",
              assigneeIds: alice ? [alice.id] : [],
              startDate: "2026-09-08",
              dueDate: "2026-09-19",
              estimateHours: 40,
              tags: ["调研"],
            },
            { title: "原型设计", type: "task", estimateHours: 24 },
          ],
        },
        {
          title: "开发",
          type: "phase",
          children: [
            { title: "登录改造", type: "module", priority: "urgent" },
            { title: "消息中心", type: "module" },
          ],
        },
        { title: "上线", type: "milestone", dueDate: "2026-12-20" },
      ],
    },
  })
  console.log(`创建成功 ${projectId}，共 ${nodeCount} 个节点`)

  // 4. 拿根节点 id（parentId 传 null 只返回根）
  const { nodes: roots } = await callTool("list_nodes", { projectId, parentId: null })
  const rootId = roots[0].id

  // 5. 后补一棵子树
  const { rootId: testPhaseId, nodeCount: added } = await callTool("add_subtree", {
    projectId,
    parentId: rootId,
    tree: {
      title: "测试",
      type: "phase",
      children: [{ title: "功能测试" }, { title: "性能测试" }],
    },
  })
  console.log(`挂载子树 ${testPhaseId}，新增 ${added} 个节点`)

  // 6. 批量推进进度
  const { nodes: all } = await callTool("list_nodes", { projectId, status: "todo" })
  const firstTwo = all.slice(0, 2)
  const r = await callTool("update_progress", {
    projectId,
    updates: firstTwo.map((n) => ({ nodeId: n.id, status: "progress", progress: 30 })),
  })
  console.log(`推进成功 ${r.okCount} 条，失败 ${r.failedCount} 条`)

  // 7. 精细修改单个节点
  await callTool("update_node", {
    projectId,
    nodeId: testPhaseId,
    patch: { priority: "high", tags: ["QA", "重点"], dueDate: "2026-12-10" },
  })

  // 8. 留言
  await callTool("add_comment", {
    projectId,
    nodeId: testPhaseId,
    content: "测试环境已就绪，可以开始。",
  })

  // 9. 读回整棵树（限 3 层）
  const { project } = await callTool("get_project", { projectId, depth: 3 })
  console.log(JSON.stringify(project.root, null, 2))
}

main().catch((e) => {
  console.error("失败:", e.message)
  process.exit(1)
})
```

---

## 11. 客户端接入代码

### 11.1 官方 MCP SDK（推荐）

如果你的客户端库支持自定义请求头，直接配置即可，SDK 会自动处理 `_meta` 和协议头。

```ts
import { Client } from "@modelcontextprotocol/client"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client/streamableHttp"

const transport = new StreamableHTTPClientTransport(
  new URL("https://projecttree.feelo.top/api/mcp"),
  {
    requestInit: {
      headers: { "x-api-key": process.env.PROJECTTREE_KEY! },
    },
  },
)

const client = new Client({ name: "my-agent", version: "1.0.0" })
await client.connect(transport)

const tools = await client.listTools()
const result = await client.callTool({ name: "whoami", arguments: {} })
```

> 请确认你的 SDK 版本支持 MCP `2026-07-28`。老版本 SDK 会尝试 `initialize` 握手并且不发 `_meta`，导致 400。此时请改用 [11.3 的原生 fetch 封装](#113-原生-fetch-最稳妥)。

### 11.2 Claude Desktop / 支持配置文件的客户端

在 MCP 配置里加一项（`mcpServers`）：

```json
{
  "mcpServers": {
    "projecttree": {
      "type": "http",
      "url": "https://projecttree.feelo.top/api/mcp",
      "headers": {
        "x-api-key": "pt_live_你的密钥"
      }
    }
  }
}
```

不同客户端字段名略有差异（有的用 `transport` 而非 `type`），以客户端文档为准。关键是**必须能自定义 `x-api-key` 头**。

> 本服务用的是 `x-api-key` 而**不是** `Authorization: Bearer`。如果客户端只支持 Bearer，请用后端代理转换。

### 11.3 原生 fetch（最稳妥）

不依赖任何 SDK，也不受 SDK 版本影响。完整实现见 [第 10 章](#10-完整示例从零创建一个项目) 的 `callTool`。

TypeScript 版本：

```ts
const PROTOCOL = "2026-07-28"

interface RpcResult<T> {
  content: { type: "text"; text: string }[]
  structuredContent?: T
  isError?: boolean
}

export class ProjectTreeClient {
  private seq = 0
  constructor(
    private endpoint: string,
    private apiKey: string,
    private clientName = "my-app",
  ) {}

  private async rpc<T>(method: string, params: Record<string, unknown>, toolName?: string) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-api-key": this.apiKey,
      "MCP-Protocol-Version": PROTOCOL,
      "Mcp-Method": method,
    }
    if (toolName) headers["Mcp-Name"] = toolName

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.seq,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": PROTOCOL,
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": { name: this.clientName, version: "1.0.0" },
          },
        },
      }),
    })
    const json = await res.json()
    if (json.error) throw new Error(`[rpc ${json.error.code}] ${json.error.message}`)
    return json.result as RpcResult<T>
  }

  /** 调用工具，返回 structuredContent；工具执行失败则抛错 */
  async call<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) {
    const r = await this.rpc<T>("tools/call", { name, arguments: args }, name)
    if (r.isError) {
      const code =
        (r.structuredContent as { error?: { code?: string } } | undefined)?.error?.code ??
        "validation_error"
      throw new Error(`[${code}] ${r.content[0].text}`)
    }
    return r.structuredContent as T
  }

  listTools() {
    return this.rpc("tools/list", {})
  }

  discover() {
    return this.rpc("server/discover", {})
  }
}
```

用法：

```ts
const pt = new ProjectTreeClient("https://projecttree.feelo.top/api/mcp", process.env.PROJECTTREE_KEY!)
const me = await pt.call<{ memberId: string; scopes: string[] }>("whoami")
```

### 11.4 Python

```python
import json, os, itertools, requests

ENDPOINT = "https://projecttree.feelo.top/api/mcp"
API_KEY = os.environ["PROJECTTREE_KEY"]
PROTOCOL = "2026-07-28"
_seq = itertools.count(1)

META = {
    "io.modelcontextprotocol/protocolVersion": PROTOCOL,
    "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": {"name": "py-client", "version": "1.0.0"},
}


def call_tool(name: str, arguments: dict | None = None) -> dict:
    body = {
        "jsonrpc": "2.0",
        "id": next(_seq),
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments or {}, "_meta": META},
    }
    res = requests.post(
        ENDPOINT,
        headers={
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
            "x-api-key": API_KEY,
            "MCP-Protocol-Version": PROTOCOL,
            "Mcp-Method": "tools/call",
            "Mcp-Name": name,
        },
        data=json.dumps(body),
        timeout=30,
    )
    data = res.json()
    if "error" in data:
        raise RuntimeError(f"[rpc {data['error']['code']}] {data['error']['message']}")
    result = data["result"]
    if result.get("isError"):
        code = (result.get("structuredContent") or {}).get("error", {}).get("code", "validation_error")
        raise RuntimeError(f"[{code}] {result['content'][0]['text']}")
    return result.get("structuredContent") or {}


if __name__ == "__main__":
    print(call_tool("whoami"))
    print(call_tool("list_projects", {"limit": 10}))
```

---

## 12. 最佳实践与限制

### 12.1 密钥安全

- **绝不**把密钥放进前端代码、Git 仓库、日志。用环境变量或密钥管理服务
- 一个用途一把密钥，方便按需吊销而不影响其他集成
- 按最小权限勾选 scope（见 [5.5](#55-建议的最小权限配置)）
- 定期在网站上检查 `lastUsedAt`，长期不用的密钥直接吊销
- 怀疑泄露：立刻**停用**（可逆）或**吊销**（不可逆），再签发新的

### 12.2 高效读取

- 大树不要无脑 `get_project`，用 `depth` 限层
- 需要遍历时用 `list_nodes(parentId=...)` 逐层下钻，返回扁平结构更好处理
- 只关心某人的任务：`list_nodes({ projectId, assigneeId })`
- 只关心未完成：`list_nodes({ projectId, status: "todo" })`

### 12.3 高效写入

- **优先整棵传树**：`create_project` 带完整 `tree` 一次搞定，而不是先建空项目再逐个 `add_node`
- 批量改进度用 `update_progress`（单次 200 条），不要循环调 `update_node`
- 树超过 500 节点：先 `create_project` 写前 500，再分批 `add_subtree` 挂剩下的
- 深度超过 8 层：把过深的层级扁平化，或拆成多个项目

### 12.4 幂等性与并发

- **本服务的写操作不幂等**，没有 idempotency key。重复调用 `create_project` 会创建多个同名项目
- 请在你这一侧做去重（比如先 `list_projects` 按名字查一遍）
- 服务无状态，可以并发调用；但**并发写同一棵树**可能导致 `sortOrder` 顺序不确定，建议对同一项目串行写入

### 12.5 缓存

读取接口带服务端缓存，写操作会自动失效相关缓存。极少数情况下写入后立刻读可能拿到旧数据，重试一次即可。

### 12.6 没有的功能

当前**不支持**，请不要依赖：

- 资源（Resources）与提示词（Prompts）能力——只有 Tools
- 服务端推送 / 订阅节点变更（无 webhook）
- 移动节点（改 `parentId`）——需要先 `delete_node` 再 `add_subtree` 重建
- 调整同级节点顺序（`sortOrder` 只读）
- 附件、文件上传
- 服务端 AI 拆解——拆解由调用方负责
- 修改节点的 `type`（`update_node` 的 patch 不含 `type`）
- 成员的增删（只能查询和设置项目参与关系）

---

## 13. 常见问题排查

| 症状 | 原因 | 解决 |
|---|---|---|
| 400 `missing the required per-request envelope key(s): _meta` | `params` 里没有 `_meta` | 加上 `_meta`，含 `protocolVersion` 和 `clientCapabilities` 两个必需键 |
| 400 `-32020` `headers and body disagree` | 缺 `Mcp-Name` 头，或与 `params.name` 不一致 | `tools/call` 必须带 `Mcp-Name: <工具名>` |
| 400，提到 `MCP-Protocol-Version` | 缺协议版本头，或与 `_meta` 里的值不一致 | 两处都写 `2026-07-28` |
| 401 `缺少 x-api-key 请求头` | 用了 `Authorization: Bearer` | 本服务只认 `x-api-key` |
| 401 `密钥无效` | 复制不全、有空格、已被吊销 | 重新复制；确认前缀是 `pt_live_` |
| 401 `密钥已被停用` | 在网站上被停用 | 到 API 密钥页面重新启用 |
| 403 `Origin 不被允许` | 从浏览器直连且域名不在白名单 | 改由后端代理；或让服务方配 `MCP_ALLOWED_ORIGINS` |
| 405 | 用了 GET 探活 | 只能 POST |
| `[forbidden] 缺少权限：project:create` | 密钥签发时没勾「创建项目」 | 重新签发并勾选对应 scope |
| `[forbidden] 没有操作权限` | 角色不够（如 manager 改别人的项目），或改了非自己负责的节点 | 检查项目归属与 `assigneeIds` |
| `[not_found] 项目不存在` | projectId 拼错，或项目已删 | 用 `list_projects` 核对 |
| `[too_large] ...` | 树超 500 节点 / 8 层，或批量超 200 条 | 分批提交 |
| `Input validation error: ... Too big: expected number to be <=100` | `progress` 超过 100 | 改成 0–100 的整数 |
| `日期格式必须为 yyyy-MM-dd` | 传了 ISO 时间戳 | 截成 `2026-09-05` 这种形式 |
| `[invalid_input] 没有可更新的字段` | `patch` 全是 `undefined` | 至少传一个有效字段 |
| `update_node` 返回的 `updatedFields` 少于预期 | 只有 `node:updateOwn`，非 status/progress 字段被丢弃 | 申请 `node:manage` |
| `update_progress` 返回 200 但没生效 | 逐条失败，`isError` 仍为 false | 检查 `failedCount` 和每条的 `reason` |
| `根节点不可删除` | 对 `type=root` 调了 `delete_node` | 用 `delete_project` |
| PowerShell 里 curl 报「缺少参数 SessionVariable」 | `curl` 是 `Invoke-WebRequest` 别名 | 写 `curl.exe` |
| SDK 报 `initialize` 相关错误 | SDK 版本旧于 `2026-07-28` | 升级 SDK，或用原生 fetch 封装 |
| 指派任务后负责人没显示 | `assigneeIds` 填了人名 | 必须填 `list_members` 返回的 `id` |

### 需要人工协助时

请提供：调用的工具名、完整请求体（**去掉密钥**）、完整响应体、密钥的 `keyPrefix`（如 `pt_live_a1b2c3`）和大致时间。服务端有审计日志，凭这些能快速定位。
