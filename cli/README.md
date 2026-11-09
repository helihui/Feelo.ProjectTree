# ProjectTree CLI

把**任意代码仓库**用一份声明式清单（`.projecttree/tasks.yaml`）接入
[ProjectTree](https://projecttree.feelo.top)，并把清单**实时同步**为远端「项目-节点树」。

- **Windows 独立 EXE**：直接运行 `projecttree.exe`，目标电脑无需安装 Node.js。
- **源码零依赖**：也可用 Node ≥ 18 运行 `projecttree.mjs`，无需 `npm install`。
- **声明式单向同步**：清单是唯一事实源，CLI 计算增量后推送到网页端（增 / 改；删除需显式 `--prune`）。
- **通信走标准 MCP**：Streamable HTTP，单端点 JSON-RPC，`x-api-key` 鉴权。

> Windows 用户优先使用 `dist/projecttree.exe`；源码为 [projecttree.mjs](./projecttree.mjs)。

---

## 1. 快速开始

在目标项目根目录执行（也可在任意子目录，CLI 会向上查找 `.projecttree/`）。

Windows 直接使用 EXE。当前构建产物位于：

```text
E:\100.Work\NestCoreProject\WorkLing.ProjectTree\cli\dist\projecttree.exe
```

推荐复制到固定目录并加入用户级 `PATH`：

```powershell
New-Item -ItemType Directory -Force C:\Tools\ProjectTree
Copy-Item "E:\100.Work\NestCoreProject\WorkLing.ProjectTree\cli\dist\projecttree.exe" C:\Tools\ProjectTree\
$oldPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$oldPath;C:\Tools\ProjectTree", "User")
```

重新打开终端后验证并开始使用：

```powershell
projecttree.exe --help
projecttree.exe init --name "我的项目"
projecttree.exe login
projecttree.exe push
projecttree.exe watch
```

不加入 `PATH` 也可以始终通过 EXE 的绝对路径运行。

Node.js 源码版可配置别名；本文后续用 `projecttree` 代指：

```bash
alias projecttree='node /abs/path/to/projecttree.mjs'

# 1) 生成 .projecttree/ 骨架与示例清单
projecttree init --name "我的项目"

# 2) 配置 API Key（pt_live_...，见下一节）
projecttree login

# 3) 编辑清单后，首次创建远端项目并整棵写入
projecttree push

# 4) 之后改完清单，二选一：
projecttree sync        # 手动同步一次（CI 推荐）
projecttree watch       # 常驻监听，保存即自动同步（本地开发推荐）
```

接入一个**已存在**的远端项目（不在网页端新建）：用 `projecttree link <projectId>`，
CLI 会按标题路径自动匹配现有节点。

---

## 2. 获取 API Key

1. 登录 <https://projecttree.feelo.top>，进入 **API Keys** 页面。
2. 创建一个 Key，形如 `pt_live_xxxxxxxx`。
3. 二选一提供给 CLI：
   - 交互式保存（默认）：`projecttree login`，Key 落到
     `~/.projecttree/credentials.json`（权限 600）。
   - 环境变量（CI / 容器）：`PROJECTTREE_API_KEY=pt_live_...`，优先级高于凭据文件。

`projecttree whoami` 可随时验证 Key 是否有效及当前身份/角色。

可选环境变量：

| 变量 | 作用 |
|:--|:--|
| `PROJECTTREE_API_KEY` | API Key，优先于凭据文件 |
| `PROJECTTREE_BASE_URL` | 覆盖服务地址（默认 `https://projecttree.feelo.top`） |

---

## 3. 清单格式 `.projecttree/tasks.yaml`

缩进 **2 个空格**表示父子层级。节点行写法：

- `- 标题`
- `- [稳定key] 标题`（推荐，见 [§5](#5-节点身份与稳定-key)）

字段写在节点行下方、相对 `- ` 再缩进 2 空格。完整示例：

```yaml
name: 我的项目
description: 可选的项目描述

tree:
  - [mvp] 里程碑 1：MVP
    type: milestone
    - [req] 需求梳理
      type: task
      status: progress
      priority: high
      tags: [规划, 一期]
      description: 输出 PRD 与接口清单
    - [dev] 核心功能开发
      type: task
      estimateHours: 16
      dueDate: 2026-11-30
    - 联调与验收
      type: task
  - 里程碑 2：发布
    type: milestone
    - 打包与部署
      type: task
```

也支持 JSON 清单（`.projecttree/tasks.json`）。

### 字段与取值

| 字段 | 类型 | 取值 / 说明 |
|:--|:--|:--|
| `type` | enum | `milestone` `phase` `epic` `module` `task` `subtask`（默认 `task`） |
| `status` | enum | `todo` `progress` `done` `blocked` `paused`（默认 `todo`；**「进行中」是 `progress`，没有 doing**） |
| `priority` | enum | `low` `medium` `high` `urgent`（默认 `medium`） |
| `progress` | number | 0–100 |
| `startDate` / `dueDate` | date | `YYYY-MM-DD` |
| `estimateHours` | number | 预估工时 |
| `tags` | list | 行内数组 `[A, B]` |
| `description` | string | 单行，或 `description: \|` 多行块 |

> 解析器只实现了上述 YAML **子集**：列表项、标量字段、行内数组与 `|` 多行描述。
> 不要使用锚点/别名/流式嵌套映射等高级 YAML 特性。

### 服务端限制

- 单项目最多 **500** 个节点。
- 最深 **8 层**（项目根算第 1 层，因此清单最多嵌 **7** 层）。

---

## 4. 同步语义（重要）

- **唯一事实源是清单**。`sync` 只做三类事：
  - **新增**：清单里有、远端没有的节点（按子树批量创建并挂到正确父节点）。
  - **更新**：同一节点的受管字段变化（字段级 `update_node`，只传变化字段）。
  - **删除**：仅当加 `--prune` 时，删除清单里已不存在的远端节点（含子孙，不可恢复）。
- **网页端手工改动默认保留**：不加 `--prune`，远端多出的节点只会在 `diff` 里以「保留」提示，不会被删。
- `sync` 前可先 `diff` 预览；也可 `sync --dry-run` 只看计划不写入。
- 删除是高危操作，未加 `--yes` 时会二次确认。

```bash
projecttree diff                 # 只看差异计划
projecttree sync --dry-run       # 等价预览
projecttree sync                 # 增 / 改，不删除
projecttree sync --prune --yes   # 增 / 改 / 删，跳过确认（CI）
```

> **重命名 / 移动的限制**：服务端目前没有「移动节点」能力，节点身份来自
> `[key]` 或「父路径 + 标题」。因此：
> - **直接改标题**（且没用 `[key]`）会被当成「删旧节点 + 建新节点」。
>   想安全改名，应在首次 `push` / `link` 建立映射时就为该节点写稳定 `[key]`；之后改标题会原位更新。
> - **改变父级（移动）**暂不支持，`diff` 会给出提示；请在网页端调整，或删除后重建。

---

## 5. 节点身份与稳定 key

CLI 需要识别「本地这条任务对应远端哪个节点」，规则：

1. 节点写了 `[my-key]` → 用该 key（**推荐**，跨重命名稳定）。
2. 否则用「父路径 + 标题」派生 slug（保留中文；空白/下划线转 `-`；重名自动加 `-2` 序号）。

映射记录在 `.projecttree/.state.json`（含 projectId 与 key→nodeId）。
该文件是**本地状态**，`init` 会自动把它加入 `.gitignore`，**不要提交**。
删除它也不会丢数据：`link` / `pull` 能按标题路径重建映射（但没用 `[key]` 的节点若已改名可能对不上）。

> 经验：对长期存在、可能改名的里程碑/模块，一开始就写 `[key]`，最省心。

---

## 6. 实时同步 `watch`

```bash
projecttree watch [--interval 2] [--prune]
```

- 启动时先全量同步一次，随后监听清单文件与 `.projecttree/` 目录（兼容「写临时文件再 rename」的编辑器）。
- **防抖**：默认 2 秒内的连续保存合并成一次同步（`--interval` 可调）。
- 带重入保护（上一次同步未结束不会并发），单次同步失败只报错、不退出监听。
- 默认不删除远端节点；要让保存即删除，加 `--prune`。
- `Ctrl+C` 优雅退出。

---

## 7. 在 CI / Git Hook 中使用

CI 里用环境变量提供 Key，并在清单变更后做非交互同步：

```bash
export PROJECTTREE_API_KEY=pt_live_xxx
node /path/projecttree.mjs sync --prune --yes
```

GitHub Actions 片段：

```yaml
- name: Sync tasks to ProjectTree
  run: node .projecttree/projecttree.mjs sync --prune --yes
  env:
    PROJECTTREE_API_KEY: ${{ secrets.PROJECTTREE_API_KEY }}
```

只在清单变更时才跑，可加路径过滤：

```yaml
on:
  push:
    paths: [".projecttree/tasks.yaml"]
```

可选：post-merge / pre-push 本地钩子（非 `--prune`，避免误删网页端改动）：

```sh
#!/bin/sh
# .git/hooks/post-merge （或 pre-push）：有差异则增量同步，同步失败不阻断 git
node /path/projecttree.mjs sync || true
```

---

## 8. 构建与分发 Windows EXE

在 ProjectTree 仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\cli\build-windows.ps1
```

产物为 `cli/dist/projecttree.exe`，适用于 **Windows x64**。它内置 Node.js 22
运行时，目标电脑无需安装 Node.js，也无需复制其他文件；直接把这一个 EXE 发给使用者即可。

当前交付产物：

| 项目 | 值 |
|:--|:--|
| 文件 | `cli/dist/projecttree.exe` |
| 大小 | 57,659,181 bytes（约 54.99 MB） |
| 架构 | Windows x64 |
| SHA-256 | `5E7F07CC8B8288D6A0B8790AAD0097653DBFC0D289A05DCAF1CB630290511F24` |

```powershell
.\cli\dist\projecttree.exe --help
Get-FileHash .\cli\dist\projecttree.exe -Algorithm SHA256
```

每次重新构建，文件哈希都可能变化，应以构建脚本最后输出的新哈希为准。当前 EXE 未做商业
代码签名，Windows 首次运行时可能显示 SmartScreen 提示；应通过可信渠道分发并核对
SHA-256。`cli/dist/` 是本地构建产物，默认不提交 Git。

---

## 9. 命令完整说明

所有需要项目上下文的命令都可以在项目根目录或任意子目录执行；CLI 会向上查找
`.projecttree/`。以下示例统一使用 `projecttree.exe`。

### `init`：初始化本地接入目录

```powershell
projecttree.exe init --name "订单服务"
projecttree.exe init --name "订单服务" --dir D:\Code\OrderService
projecttree.exe init --force
```

- 创建 `.projecttree/config.json` 和 `.projecttree/tasks.yaml`。
- 自动把 `.projecttree/.state.json` 加入项目 `.gitignore`。
- `--dir` 指定目标项目目录；默认当前目录。
- 已有清单时默认不覆盖；`--force` 仅覆盖清单示例，不删除远端项目。

### `login` / `whoami`：配置和验证身份

```powershell
projecttree.exe login
projecttree.exe whoami
```

`login` 隐藏输入 API Key，保存到当前 Windows 用户目录下的
`%USERPROFILE%\.projecttree\credentials.json`，并立即连接服务端验证。`whoami` 显示
Key 名称、成员 ID、角色、权限和树限制。

CI 或临时执行可不落盘，直接注入环境变量：

```powershell
$env:PROJECTTREE_API_KEY = "pt_live_xxx"
projecttree.exe whoami
```

### `push`：首次创建远端项目

```powershell
projecttree.exe push --dry-run
projecttree.exe push
projecttree.exe push --name "线上展示名称"
```

读取本地清单并调用 `create_project` 创建新项目和整棵节点树。成功后将 `projectId` 与
节点 ID 映射写入 `.projecttree/.state.json`。已经关联项目时应改用 `sync`；`--force`
只忽略本地关联并再建一个新项目，**不会删除旧项目**。

### `link`：关联已有远端项目

```powershell
projecttree.exe link p_xxxxxxxxxxxx
```

不会创建或修改远端节点，只读取指定项目，并按稳定 key/标题路径建立本地映射。
不传 `projectId` 时会列出当前 Key 可见的项目。

### `pull`：从远端生成本地清单

```powershell
projecttree.exe pull p_xxxxxxxxxxxx
projecttree.exe pull
projecttree.exe pull p_xxxxxxxxxxxx --force
```

把远端项目树转换为 `.projecttree/tasks.yaml` 并建立关联。省略 ID 时使用当前 state 中的
关联项目；本地清单已存在时必须显式 `--force` 才覆盖。

### `diff` / `status`：只读检查

```powershell
projecttree.exe status
projecttree.exe diff
```

- `status` 显示清单路径、本地/远端节点数、关联项目和上次同步时间。
- `diff` 展示新增、字段更新及远端额外节点；不执行任何写操作，也不包含删除计划。

### `sync`：执行增量同步

```powershell
projecttree.exe sync --dry-run
projecttree.exe sync
projecttree.exe sync --prune
projecttree.exe sync --prune --yes
```

执行顺序为：创建新子树 → 更新节点字段 → 从深到浅删除节点 → 重新拉取项目树并重建
state。默认只增改；`--prune` 才计划删除，未加 `--yes` 时要求输入 `y` 二次确认。
自动化环境使用 `--prune --yes` 前必须先确认清单是完整事实源。

### `watch`：实时监听清单

```powershell
projecttree.exe watch
projecttree.exe watch --interval 5
projecttree.exe watch --interval 2 --prune
```

启动时先同步一次，然后监听 YAML/JSON 清单；连续保存会按 `--interval` 秒防抖合并。
单次网络或业务错误只输出错误，不会退出常驻进程。按 `Ctrl+C` 停止。

### 命令速查

| 命令 | 说明 |
|:--|:--|
| `init [--name X] [--dir .] [--force]` | 生成 `.projecttree/` 骨架与示例清单 |
| `login` | 保存并验证 API Key |
| `whoami` | 校验 Key、查看身份/角色 |
| `push [--name X] [--dry-run] [--force]` | 创建新远端项目并整棵写入 |
| `link <projectId>` | 关联已有项目并建立节点映射 |
| `pull [projectId] [--force]` | 拉取远端树并生成本地清单 |
| `sync [--dry-run] [--prune] [--yes]` | 清单到远端的增量同步 |
| `diff` | 只展示非删除差异计划 |
| `status` | 查看关联和本地/远端摘要 |
| `watch [--interval 秒] [--prune]` | 监听清单，防抖后自动同步 |

---

## 10. 本地文件与配置优先级

```text
目标项目/
├─ .projecttree/
│  ├─ tasks.yaml       # 声明式任务清单，建议提交 Git
│  ├─ config.json      # 服务地址配置，建议提交 Git
│  └─ .state.json      # projectId 与 key→nodeId 映射，不提交 Git
└─ .gitignore

%USERPROFILE%\.projecttree\
└─ credentials.json    # 当前 Windows 用户的 API Key，不提交 Git
```

`config.json` 默认内容：

```json
{
  "baseUrl": "https://projecttree.feelo.top"
}
```

配置优先级：

1. 服务地址：`PROJECTTREE_BASE_URL` → 项目 `config.json.baseUrl` → 默认线上地址。
2. API Key：`PROJECTTREE_API_KEY` → 项目 `config.json.apiKey` → 用户凭据文件。

不建议把 `apiKey` 写进项目 `config.json`；共享仓库和 CI 一律使用环境变量或用户凭据。
如果删除 `.state.json`，远端数据不会丢失，但需重新运行 `link <projectId>` 或 `pull`
恢复关联和映射。

---

## 11. 技术实现与同步链路

### EXE 打包技术

- 源码是单文件 ESM：[projecttree.mjs](./projecttree.mjs)。
- 只依赖 Node 内置 `fs`、`path`、`os`、`fetch` 和 `fs.watch`，无运行时第三方依赖。
- [build-windows.ps1](./build-windows.ps1) 使用固定版本 `@yao-pkg/pkg@6.24.0`，把源码和
  Node.js 22 Windows x64 运行时封装进一个 PE 可执行文件。
- EXE 不安装服务、不修改注册表、不在项目中安装 npm 包；本地写入仅限配置、凭据和状态文件。

### 通信协议

```text
projecttree.exe
  ├─ 读取 tasks.yaml / config.json / .state.json
  ├─ 计算本地树与远端树的差异
  └─ HTTPS POST https://projecttree.feelo.top/api/mcp
       ├─ MCP Streamable HTTP
       ├─ JSON-RPC 2.0
       ├─ MCP 协议版本 2025-06-18
       ├─ x-api-key: pt_live_...
       └─ text/event-stream（SSE）响应
```

每个进程首次调用时先执行 MCP `initialize`，之后通过 `tools/call` 使用 `whoami`、
`create_project`、`get_project`、`list_projects`、`add_subtree`、`update_node`、
`delete_node` 等工具。API Key 只放在 HTTPS 请求头中。

### 增量同步算法

1. 解析受控 YAML 子集或 JSON，并校验字段枚举、节点数和树深度。
2. 优先使用显式 `[key]`；否则从「父路径 + 标题」派生节点路径 key。
3. 从 MCP 获取最新远端项目树，通过 `.state.json` 的 `keyToNodeId` 对齐节点身份。
4. 对受管字段逐项比较，形成 `create / update / delete / move / note` 计划。
5. 新节点按子树创建；字段变化通过 patch 更新；只有 `--prune` 才执行删除。
6. 写入完成后重新读取远端树，并原子更新 `.state.json`，避免半写状态。

服务端暂未提供移动节点工具，因此父级变化只告警，不自动移动。稳定 `[key]` 可让标题修改
继续对应同一个远端节点，但必须在首次 `push` / `link` 建立映射前就写入。

### 安全与数据边界

- `diff`、`status`、`whoami`、`push --dry-run`、`sync --dry-run` 不修改远端数据。
- 普通 `sync` 不删除远端额外节点。
- `sync --prune` 可能永久删除节点及子孙，交互执行需要二次确认。
- API Key 是用户级凭据；`.state.json` 只含项目和节点 ID 映射，不含 Key。
- 当前 EXE 未代码签名，分发时应核对 SHA-256，并从可信渠道获取。

---

## 12. 退出码与故障排查

| 退出码 | 含义 | 常见处理 |
|:--:|:--|:--|
| `0` | 成功 | 无需处理 |
| `1` | 运行或网络错误 | 检查网络、服务地址、错误文本 |
| `2` | 参数、配置或清单错误 | 修正命令参数、JSON/YAML、字段枚举 |
| `3` | 鉴权或服务端拒绝 | 检查 API Key、权限、项目是否存在 |

常见问题：

- **“未找到 API Key”**：运行 `projecttree.exe login`，或设置 `PROJECTTREE_API_KEY`。
- **“当前目录及其父级找不到 .projecttree/”**：切换到目标仓库后运行 `init`。
- **YAML 解析失败**：只使用 2 空格缩进、标量字段、`[A, B]` 数组和 `|` 描述；复杂内容改用 JSON。
- **重复创建节点**：不要手工编辑 `.state.json`；确认稳定 key 未变化，必要时重新 `link`。
- **改标题后显示新增/删除**：该节点首次映射时没有稳定 `[key]`。恢复原标题后同步，或人工处理后重建映射。
- **移动节点未生效**：当前服务端不支持 CLI 移动；在网页端处理，或明确删除后重建。
- **连接失败**：确认能访问 `https://projecttree.feelo.top`，代理/防火墙允许 HTTPS，系统时间正确。
- **SmartScreen 提示**：当前 EXE 未签名；从可信来源取得并核对文档中的 SHA-256。
- **查看退出码**：PowerShell 执行后运行 `Write-Host $LASTEXITCODE`。

---

## 13. 给 AI 助手的操作约定

当需要把一个项目接入 ProjectTree 时，按此顺序：

1. Windows 优先直接运行 `projecttree.exe <命令>`；若只提供源码，则运行
   `node /path/to/cli/projecttree.mjs <命令>`。两种方式都不要尝试 `npm install`。
2. `init` 生成骨架 → 依据项目实际情况把里程碑/模块/任务写进 `tasks.yaml`，
   层级用 2 空格，状态用英文枚举（进行中=`progress`），重要长期节点给 `[key]`。
3. Key 用环境变量 `PROJECTTREE_API_KEY` 注入，不要把 Key 写进任何入库文件。
4. 首次 `push`；后续改动先 `diff` 确认，再 `sync`。**默认不要加 `--prune`**，
   除非用户明确要求「让远端与清单完全一致 / 删除网页端多余节点」。
5. 实时同步用 `watch`（本地常驻）；CI 用 `sync --prune --yes`。
6. 对可能改名的节点，在首次 `push` / `link` 前写好 `[key]`；不要试图通过 CLI 移动节点。
7. `.projecttree/.state.json` 是本地状态，保持被 git 忽略。
