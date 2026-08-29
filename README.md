# Feelo.ProjectTree

ProjectTree 是一个以 **树形结构** 管理项目的 AI 工作台：输入一句项目目标，AI 将其拆解为「里程碑 / 阶段 / 模块 / 任务 / 子任务」的多层任务树，并支持指派成员、跟踪进度、生成进度报告。

![项目详情](./detail.png)
![思维导图](./detail2.png)

## 功能特性

- **工作台概览**：项目卡片、整体统计、我的任务、动态流。
- **AI 创建项目**：填写目标与场景模板，生成任务树预览后再确认落库（当前使用 `lib/mock-ai.ts` 的本地蓝图模拟生成）。
- **项目树视图**：树形列表 / 思维导图双视图，支持增删节点、状态与进度更新、优先级、标签、工期、评论。
- **进度自动汇总**：叶子节点填写进度，父节点自动加权汇总（见 `lib/tree-utils.ts`）。
- **成员管理**：维护团队成员，作为节点负责人被指派，并为成员生成邀请链接开通登录账号。
- **权限体系**：管理员 / 项目经理 / 成员 / 访客四级角色，页面守卫与 Server Action 双层校验。
- **AI 模型 / Prompt 模板**：多模型供应商、默认与备用策略、场景化提示词模板配置页。
- **进度报告**：基于项目树实时数据生成可导出的报告。
- **账号体系**：基于 better-auth 的邮箱密码注册登录，`proxy.ts` 做全站路由保护。

## 技术栈

| 分层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router + Turbopack）、React 19 |
| 语言 | TypeScript 5.7 |
| 样式 | Tailwind CSS v4、tw-animate-css、next-themes |
| 组件 | shadcn 风格组件（`components/ui`）、@base-ui/react、lucide-react、sonner |
| 数据库 | PostgreSQL（自建，服务器 `mcp-hub-postgres` 容器）+ Drizzle ORM + node-postgres |
| 认证 | better-auth（邮箱密码，7 天会话） |

## 目录结构

```
app/
  actions/projects.ts     Server Actions：项目、节点、评论、成员的读写（含权限校验）
  actions/invitations.ts  邀请校验与接受邀请（注册并绑定成员）
  api/auth/[...all]/      better-auth 路由处理器
  api/db/stats|tables/    数据库统计与表结构查询接口（可带 ?seed=1 触发播种）
  (app)/                  登录后受保护区域（路由组）
    layout.tsx            侧边栏 + 登录校验，切菜单时不重渲染
    loading.tsx           内容区骨架屏，点击后立即出现
    create/               AI 创建项目流程页
    projects/[id]/        项目树详情页
    members|models|prompts|reports|profile/
  invite/[token]/         成员通过邀请链接设置密码开通账号
  sign-in|sign-up/        登录 / 注册
components/
  page-header.tsx sidebar.tsx skeletons.tsx   全局布局、导航与骨架屏
  dashboard/ project/ create/ members/ profile/   业务组件
  invite-form.tsx         邀请注册表单
  ui/                     基础 UI 组件
lib/
  db/index.ts             连接池 + ensureSchema()（启动时幂等建表）
  db/schema.ts            Drizzle 表定义（业务表 + better-auth 表）
  db/seed.ts              ensureSeeded()：幂等补齐示例数据
  auth.ts auth-client.ts session.ts   认证服务端 / 客户端 / 会话工具
  permissions.ts          四级角色与能力（Permission）映射
  mock-ai.ts              AI 拆解蓝图（模拟生成）
  tree-utils.ts types.ts data.ts      树工具、类型、示例数据
proxy.ts                  未登录访问受保护页面重定向到 /sign-in
scripts/reset-ghelihui.mjs 指定项目数据重置脚本
.oss/                     对象存储（七牛云）凭证，见「部署与外部资源」
.ssh/                     服务器 SSH 密钥、Nginx 证书与运维记录，见「部署与外部资源」
```

### 数据模型

- `members`：成员（姓名、缩写、颜色、岗位、邮箱、`roleKey` 权限角色、`userId` 绑定的登录账号）
- `invitations`：成员邀请（token、过期时间、是否已接受）
- `projects`：项目（名称、描述、拥有者、成员 ID 列表）
- `nodes`：任务节点，通过 `parentId` 自关联成树，根节点 `parentId` 为 `null`
- `node_comments`：节点评论
- `user` / `session` / `account` / `verification`：better-auth 认证表

首次请求时 `ensureSchema()` 会自动执行 `CREATE TABLE IF NOT EXISTS` 建表并创建索引，**无需手动执行迁移**。

## 快速开始

### 1. 环境要求

- Node.js 20+（已在 v24 验证）
- 一个可访问的 PostgreSQL 数据库（推荐 Neon）

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

在项目根目录创建 `.env`：

```bash
# PostgreSQL 连接串
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
# better-auth 密钥，可用 openssl rand -base64 32 生成
BETTER_AUTH_SECRET=your-random-secret
# 站点地址，本地开发填 http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
```

> 部署到 Vercel 时可省略 `BETTER_AUTH_URL`，会自动读取 `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`。

### 4. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:3000 。首次访问会跳转到 `/sign-in`。系统中还没有管理员时，`/sign-up` 开放注册，**第一个注册的用户自动成为管理员**；之后注册入口关闭，新成员一律通过管理员发放的邀请链接开通账号。

### 5. 初始化示例数据（可选）

访问一次以下地址即可幂等写入内置示例项目与成员：

```
http://localhost:3000/api/db/stats?seed=1
```

返回各表行数与是否已播种。不带 `seed=1` 时仅查询统计，不写入数据。

## 权限与成员账号

### 角色能力矩阵

| 能力 | 管理员 admin | 项目经理 manager | 成员 member | 访客 guest |
| --- | :---: | :---: | :---: | :---: |
| `member:manage` 成员管理与角色分配 | ✅ | — | — | — |
| `ai:configure` 模型 / Prompt 配置 | ✅ | — | — | — |
| `project:create` 创建项目 | ✅ | ✅ | — | — |
| `node:manage` 增删节点、改标题/描述/负责人/优先级 | ✅ | ✅ | — | — |
| `node:updateOwn` 更新自己负责节点的状态与进度 | ✅ | ✅ | ✅ | — |
| `comment:write` 发表评论 | ✅ | ✅ | ✅ | — |

角色与能力的映射定义在 `lib/permissions.ts`，是唯一真源；新增能力只需在此扩展。

### 成员开通登录账号

1. 管理员进入 `/members`，新建成员时填写**邮箱**（必填，作为登录账号）。
2. 在成员卡片点击「生成邀请链接」，得到形如 `http://localhost:3000/invite/<token>` 的链接，**有效期 7 天**。
3. 把链接发给成员，成员打开后自行设置密码（≥8 位），提交即完成注册、自动登录，并与该成员记录绑定。
4. 成员卡片会显示账号状态：未开通 / 邀请中 / 已开通。已开通的成员可在 `/profile` 自行修改密码。

> 管理员不会也不需要知道成员密码；密码由成员本人在邀请页设置。

### 校验层次

- **页面级守卫**：`lib/session.ts` 的 `requireMember()` / `requirePermission()`，未登录跳 `/sign-in`，权限不足跳 `/`。
- **Server Action 校验**：`assertPermission()` / `assertNodeEditable()` 在写库前再校验一次，直接抛出「没有操作权限」，防止绕过 UI 调用。
- **UI 收敛**：侧边栏按角色过滤导航，节点详情面板按 `canManageNodes` / `canEdit` / `canComment` 禁用对应控件。

## 部署与外部资源

以下两个目录存放部署相关的凭证与配置，**均包含敏感信息，切勿提交到公共仓库**。

### `.oss/` — 对象存储（七牛云）

存放文件上传所用的七牛云凭证。

```
.oss/
  qiniu/credentials.json   access_key / secret_key / bucket / domain / prefix
```

| 字段 | 说明 |
| --- | --- |
| `bucket` | 存储空间名 `linghui-soft` |
| `domain` | 外链域名 `http://linghui-soft.feelo.top` |
| `prefix` | 上传路径前缀 `soft` |
| `access_key` / `secret_key` | 七牛云 API 密钥对 |

### `.ssh/` — 发布目标服务器（阿里云 Ubuntu）

存放部署到线上服务器所需的 SSH 密钥、HTTPS 证书与运维记录。

```
.ssh/
  config                   SSH 连接配置，主机别名 aliyun-ubuntu
  aliyun-ubuntu.pem        登录私钥
  ssl/nginx/feelo.top.pem  Nginx HTTPS 证书
  ssl/nginx/feelo.top.key  证书私钥
  运维踩坑记录.md          部署故障根因与操作手册
```

服务器信息：`root@116.62.148.75`（阿里云 Ubuntu）。连接方式：

```bash
# 若已将 config 合并到 ~/.ssh/config
ssh aliyun-ubuntu

# 或显式指定本仓库内的配置文件
ssh -F .ssh/config aliyun-ubuntu
```

> `.ssh/config` 中的 `IdentityFile` 目前指向 `LingHuiCodexManager` 项目下的同名私钥，
> 若要独立使用本仓库的 `.ssh/aliyun-ubuntu.pem`，需相应修改该路径。

> `.ssh/运维踩坑记录.md` 记录了「部署脚本退出码为 0 但线上仍是旧镜像」等真实故障的
> 根因与永久修复，以及升级基础镜像的操作手册。远程部署出问题时建议先查阅。

### 生产部署（projecttree.feelo.top）

线上以 Docker 容器运行，复用服务器上已有的 `mcp-hub` 基础设施（PostgreSQL、Nginx、docker 网络）。

| 项 | 值 |
| --- | --- |
| 域名 | `https://projecttree.feelo.top`（泛域名证书 `*.feelo.top`） |
| 应用容器 | `projecttree-app`（镜像 `projecttree:prod`），不映射宿主机端口 |
| 数据库 | `mcp-hub-postgres` 容器内的 `projecttree` 库，角色 `projecttree` |
| Docker 网络 | `mcp-hub-net`（external），Nginx 通过容器名解析上游 |
| 反向代理 | `mcp-hub-nginx`，配置在 `/opt/mcp-hub/nginx/nginx.conf` |
| 生产环境变量 | `/opt/projecttree/secrets/app.env`（权限 600，不入库） |

部署（本地构建 → 上传产物 → 服务器构建镜像并启动）：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1

# 已构建过、只想重新发布时跳过构建
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -SkipBuild
```

相关文件：根目录 `Dockerfile`（仅打包 standalone 产物，不在容器内构建）、
`docker-compose.projecttree.yml`（接入 `mcp-hub-net`、healthcheck）、`deploy.ps1`。

> 注意：`/opt/mcp-hub/nginx/nginx.conf` 是**单文件 bind mount**。改配置后若用编辑器或
> `mv` 替换了文件，容器内看到的仍是旧 inode，`nginx -s reload` 无效，必须
> `docker restart mcp-hub-nginx`。

本地开发连线上库需先开 SSH 隧道（`.env` 顶部有完整命令）：

```bash
ssh -i .ssh/aliyun-ubuntu.pem -o IdentitiesOnly=yes -N -L 15432:172.18.0.3:5432 root@116.62.148.75
```

### 凭证安全

`.oss/` 与 `.ssh/` 已加入 `.gitignore`。若这些文件曾被提交过，仅添加忽略规则**不会**移除
历史记录中的明文凭证，需要先轮换密钥，再清理提交历史。

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（Turbopack） |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | ESLint 检查 |
| `node scripts/reset-ghelihui.mjs --dry` | 重置指定项目数据（`--dry` 为演练模式，不写库） |

## 说明

- `next.config.mjs` 开启了 `output: "standalone"` 用于容器部署；`experimental.cpus: 2` 用于限制构建 worker 数（默认 18 个会在本机 OOM）。
- AI 拆解目前为本地蓝图模拟（`lib/mock-ai.ts`），接入真实模型时替换 `mockGenerateTree` 即可，模型与 Prompt 配置页已预留。
- `package.json` 的 `overrides` 把 `kysely` 钉在 `0.28.17`：`@better-auth/kysely-adapter` 引用了 kysely 0.29 已移除的 `DEFAULT_MIGRATION_TABLE` 导出，升 kysely 会直接构建失败。
- `.env` 含数据库与认证密钥，请勿提交到公共仓库。
