# ProjectTree 部署到阿里云服务器 + 构建修复

## Summary

把 ProjectTree 从「本地开发 + Neon 美东数据库」迁移为「阿里云 Ubuntu 服务器自托管」，包含四件事：

1. 修复 `npm run build` 失败（`@better-auth/kysely-adapter` 与 `kysely` 版本不兼容）
2. 修复 `npx tsc --noEmit` 的 18 个类型错误
3. 把 Neon 数据迁移到服务器 Docker 里的 PostgreSQL 16，切换连接字符串
4. 容器化部署，通过 `projecttree.feelo.top` 访问（HTTPS）

顺序上必须先修构建（否则无法产出部署产物），再迁数据库，最后部署。

---

## Current State Analysis

### 本地项目

| 项 | 值 |
|---|---|
| 框架 | Next.js 16.2.6 (Turbopack) + React 19 + TS 5.7.3 |
| ORM | drizzle-orm 0.45.2 + node-postgres (`pg` 8.21) |
| 认证 | better-auth 1.6.14，`database: pool` 直接传 pg Pool |
| 数据库 | Neon `us-east-1`，单次 RTT ≈ 253ms（上一轮实测） |
| 建表方式 | 无迁移文件，[lib/db/index.ts](file:///e:/100.Work/NestCoreProject/Feelo.ProjectTree/lib/db/index.ts#L24-L237) 的 `ensureSchema()` 用 `CREATE TABLE IF NOT EXISTS` 幂等建表 |
| 构建配置 | [next.config.mjs](file:///e:/100.Work/NestCoreProject/Feelo.ProjectTree/next.config.mjs) 已有 `typescript.ignoreBuildErrors: true`、`serverExternalPackages` 含 better-auth/kysely |
| 中间件 | [middleware.ts](file:///e:/100.Work/NestCoreProject/Feelo.ProjectTree/middleware.ts)，构建时警告「middleware 已废弃，请用 proxy」 |

`.env` 现有三个变量：`DATABASE_URL`（Neon）、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL=http://localhost:3000`。

### 服务器现状（已 SSH 实测）

| 项 | 值 |
|---|---|
| 系统 | Ubuntu 24.04.2 LTS，2 vCPU / 3.4G 内存（已用 875M）/ 磁盘 49G 用 34G（73%） |
| Node | **宿主机未安装**（无 node/npm/pnpm/yarn） |
| Docker | 29.7.2 + Compose v5.5.0 |
| PostgreSQL | 容器 `mcp-hub-postgres`，`postgres:16-alpine`，**PG 16.15**，超级用户 `hub`（无 `postgres` 角色），端口仅容器内网，未映射宿主机 |
| 现有库 | `mcp_hub`（21 张表，SQLx 迁移）、`postgres`、`template0/1` |
| Nginx | **容器** `mcp-hub-nginx`（nginx 1.31.4），占用宿主机 `0.0.0.0:80` 和 `0.0.0.0:443` |
| Nginx 配置 | `/opt/mcp-hub/nginx/nginx.conf` 整份覆盖挂载，含 3 个 server 块（mcphub / mcphub-admin） |
| 证书 | `/opt/mcp-hub/nginx/ssl/feelo.top.pem` + `.key`，**泛域名 feelo.top**，可直接复用 |
| 端口占用 | 22 / 80 / 443 已占；3000、8080、5432、6379 在宿主机层面空闲 |
| DNS | `projecttree.feelo.top` → `116.62.148.75`，**已解析到位，无需改 DNS** |

### 构建失败根因（已实测确认）

`@better-auth/kysely-adapter@1.6.14` 的三个 sqlite dialect 文件（`node-sqlite-dialect.mjs`、`bun-sqlite-dialect-*.mjs`、`d1-sqlite-dialect-*.mjs`）第一行都是：

```js
import { CompiledQuery, DEFAULT_MIGRATION_LOCK_TABLE, DEFAULT_MIGRATION_TABLE, DefaultQueryCompiler, sql } from "kysely";
```

实测结论：

- 本地 `kysely@0.29.2` 的 `dist/index.js` 中 `DEFAULT_MIGRATION_TABLE` 出现次数为 **0**
- 下载 `kysely@0.29.5` 验证，同样为 **0**（0.29.x 根导出不再 re-export `migration/migrator.js`）
- 下载 `kysely@0.28.17` 验证，`dist/esm/index.js` 含 `export * from './migration/migrator.js'`，**该常量存在**
- adapter 的 peer 范围是 `"kysely": "^0.28.17 || ^0.29.0"` —— **声明支持 0.29 但实际不兼容，是上游 bug**

所以 6 个构建错误（3 文件 × 2 常量）**只能靠把 kysely 钉回 0.28.x 解决**，不是配置问题。

补充：`serverExternalPackages` 已包含这三个包，但 Turbopack 仍在 `[externals-tracing]` 阶段做静态导出检查，因此 external 标记挡不住这个错误。

### 18 个 TS 错误分类（已实测确认）

| 类别 | 数量 | 文件 |
|---|---|---|
| A. `revalidateTag` 缺第二参 `profile`（TS2554） | 13 | `app/actions/projects.ts` × 12、`app/actions/invitations.ts` × 1 |
| B. `GenerateInput` 缺 `style` 字段 | 3 | `components/create/create-form.tsx` 59 / 133 / 159 |
| C. base-ui Select `onValueChange` 回调是 `string \| null` | 2 | `create-form.tsx:116`、`models-view.tsx:103` |

A 类根因：Next 16.2.6 的 `revalidate.d.ts:9` 把签名改成 `revalidateTag(tag: string, profile: string | CacheLifeConfig)`。读运行时实现 `revalidate.js:40-47` 确认——**不传第二参不会报错，只打 deprecation warning**，所以是纯类型问题，运行行为不变。Next 内置 profile `"max"` 定义在 `config-shared.js:167-171`（stale 5min / revalidate 30天 / expire 1年）。

B 类根因：[lib/mock-ai.ts](file:///e:/100.Work/NestCoreProject/Feelo.ProjectTree/lib/mock-ai.ts#L153-L158) 的 `GenerateInput` 只有 `name/requirement/template/depth` 四个字段，没有 `style`；而 `create-form.tsx` 已经在收集并提交 `style`。且 `mockGenerateTree` 内部只用了 `input.template`，`style` 目前是**收集了但没被消费**的字段。

---

## Proposed Changes

### 阶段一：修复构建与类型（本地，必须先完成）

#### 1.1 钉住 kysely 版本 — `package.json`

新增 overrides 段，强制所有依赖使用 0.28.x：

```json
"overrides": {
  "kysely": "0.28.17"
}
```

放在 `devDependencies` 之后。之所以选 0.28.17 而不是 0.28 最新，是因为它正好是 adapter peer 范围下界且已实测含所需常量。

执行 `npm install` 让 override 生效，然后用下面命令验证常量确实存在：

```powershell
node -e "import('kysely').then(k=>console.log('OK:', 'DEFAULT_MIGRATION_TABLE' in k))"
```

**为什么不用别的方案**：升级 better-auth 到更高版本无法保证已修（上游 peer 范围本身就是错的）；patch-package 打补丁改 node_modules 太脆弱；降 kysely 是唯一符合 adapter 实际要求的做法。drizzle-orm 只在类型层引用 kysely，降版本无影响。

#### 1.2 修 A 类：`revalidateTag` 补 profile 参数

13 处调用统一改为传 `"max"`。示例：

```ts
revalidateTag(projectTag(projectId), "max")
```

涉及位置（行号来自实测）：
- [app/actions/projects.ts](file:///e:/100.Work/NestCoreProject/Feelo.ProjectTree/app/actions/projects.ts)：248、249、292、293、319、320、342、367、400、425、434、464
- [app/actions/invitations.ts](file:///e:/100.Work/NestCoreProject/Feelo.ProjectTree/app/actions/invitations.ts#L52)：52（顺带把 `revalidateTag("members")` 的裸字符串改成从 `@/lib/cache-tags` 导入的 `MEMBERS_TAG`，与 projects.ts 保持一致）

不改用 `updateTag`：它只能在 Server Action 里调用，而这些函数也可能被其他上下文复用，`revalidateTag` 更安全。

#### 1.3 修 B 类：`GenerateInput` 补 `style` 字段 — `lib/mock-ai.ts`

```ts
export interface GenerateInput {
  name: string
  requirement: string
  template: "product" | "tech" | "marketing"
  depth: number
  style: "balanced" | "agile" | "waterfall"
}
```

三个字面量与 `create-form.tsx:42-46` 的 `STYLE_OPTIONS` 完全对应。`mockGenerateTree` 不动（当前不消费 `style`，补类型即可让三处报错消失）。

#### 1.4 修 C 类：Select `onValueChange` 空值

`@base-ui/react` 的 `onValueChange` 签名是 `(value: string | null, details) => void`。两处改为忽略 null：

- `create-form.tsx:116`：`onValueChange={setDepth}` → `onValueChange={(v) => v && setDepth(v)}`
- `models-view.tsx:103`：`onValueChange={(v) => setModel(p.id, v)}` → `onValueChange={(v) => v && setModel(p.id, v)}`

#### 1.5 `middleware.ts` → `proxy.ts`

构建警告 `The "middleware" file convention is deprecated. Please use "proxy" instead.`。重命名文件为 `proxy.ts`，函数名 `middleware` → `proxy`，`config.matcher` 保持不变。逻辑零改动。

#### 1.6 开启 standalone 输出 — `next.config.mjs`

容器部署需要，加一行：

```js
output: "standalone",
```

同时移除 `typescript.ignoreBuildErrors: true` —— 1.2~1.4 修完后应该能真正通过类型检查，保留这个开关等于让类型错误重新静默积累。

**验收**：`npx tsc --noEmit` 输出 `Found 0 errors`，`npm run build` 退出码 0 且生成 `.next/standalone/`。

---

### 阶段二：数据库迁移（Neon → 服务器容器 PG）

#### 2.1 在服务器容器内建库建角色

本机没有 `psql`/`pg_dump`（已确认），全部操作通过 `docker exec` 在服务器上完成。

```bash
ssh aliyun-ubuntu "docker exec mcp-hub-postgres psql -U hub -d postgres -c \"CREATE DATABASE projecttree;\""
ssh aliyun-ubuntu "docker exec mcp-hub-postgres psql -U hub -d postgres -c \"CREATE ROLE projecttree WITH LOGIN PASSWORD '<随机强密码>';\""
ssh aliyun-ubuntu "docker exec mcp-hub-postgres psql -U hub -d postgres -c \"GRANT ALL PRIVILEGES ON DATABASE projecttree TO projecttree;\""
ssh aliyun-ubuntu "docker exec mcp-hub-postgres psql -U hub -d projecttree -c \"GRANT ALL ON SCHEMA public TO projecttree;\""
```

密码用 `openssl rand -base64 24` 生成，不复用 mcp-hub 的密码（那个已明文暴露在容器 env 里）。最后一条 `GRANT ON SCHEMA public` 在 PG 15+ 是必需的，否则新角色无法建表。

#### 2.2 从 Neon 导出

本机无 pg 客户端工具，用本地 Docker 跑一次性容器导出（镜像版本与服务器一致，避免版本差异）：

```powershell
docker run --rm -e PGPASSWORD=<neon密码> postgres:16-alpine `
  pg_dump "postgresql://neondb_owner:...@ep-gentle-hat-aqdupm35-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require" `
  --no-owner --no-acl --no-privileges > .oss/projecttree-dump.sql
```

`--no-owner --no-acl` 是关键：Neon 的 owner 是 `neondb_owner`，目标库没有这个角色，不去掉会整片报错。

导出后检查文件大小和 `COPY` 段行数，确认 8 张表（`members`/`invitations`/`projects`/`nodes`/`node_comments`/`user`/`session`/`account`/`verification`）都在。

#### 2.3 导入服务器

```powershell
# 上传
scp -F .ssh\config .oss\projecttree-dump.sql aliyun-ubuntu:/tmp/
# 导入（用超级用户 hub 导入，避免权限问题，导完再改归属）
ssh aliyun-ubuntu "docker cp /tmp/projecttree-dump.sql mcp-hub-postgres:/tmp/ && docker exec mcp-hub-postgres psql -U hub -d projecttree -v ON_ERROR_STOP=1 -f /tmp/projecttree-dump.sql"
# 把所有表归属改给 projecttree 角色
ssh aliyun-ubuntu "docker exec mcp-hub-postgres psql -U hub -d projecttree -c \"DO \\\$\\\$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('ALTER TABLE public.%I OWNER TO projecttree', r.tablename); END LOOP; END \\\$\\\$;\""
```

`-v ON_ERROR_STOP=1` 确保任何一条语句失败整个导入非零退出（呼应 `.ssh/运维踩坑记录.md` 里「静默跳过很危险」的教训）。

#### 2.4 校验数据一致性

对两边同时跑行数统计并逐表比对：

```sql
SELECT 'members' t, count(*) FROM members
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'nodes', count(*) FROM nodes
UNION ALL SELECT 'node_comments', count(*) FROM node_comments
UNION ALL SELECT 'user', count(*) FROM "user"
UNION ALL SELECT 'account', count(*) FROM account
UNION ALL SELECT 'session', count(*) FROM session
UNION ALL SELECT 'invitations', count(*) FROM invitations
ORDER BY 1;
```

两边输出必须逐行相同。同时确认索引都在（`ensureSchema` 会补，但先确认 dump 已带上）。

#### 2.5 本地先用新库跑通再部署

为了在部署前就验证连接与数据，需要临时把 5432 暴露到宿主机做一次本地连通测试。有两种做法，**选后者**：

- ~~直接 `-p 5432:5432` 重启容器~~ —— 会中断 mcp-hub 服务，且长期暴露数据库端口有风险
- **SSH 隧道**：`ssh -F .ssh\config -L 15432:localhost:5432 aliyun-ubuntu` 不行（PG 在容器内网，宿主机 localhost 没有 5432）。改为先查出容器 IP，用 `ssh -L 15432:<容器IP>:5432 aliyun-ubuntu` 打隧道

然后本地临时用 `DATABASE_URL=postgresql://projecttree:<pwd>@localhost:15432/projecttree` 跑 `npm run dev`，登录验证看板/项目/成员页数据正确。验证通过后关闭隧道。

这一步的价值：把「数据库问题」和「部署问题」分开验证，避免部署失败时不知道是哪一层坏了。

#### 2.6 更新本地 `.env`

保留 Neon 连接串作为注释备份，`DATABASE_URL` 换成隧道地址（仅本地开发用）。生产环境变量不写进 `.env`，见 3.3。

---

### 阶段三：容器化部署

#### 3.1 新增 `Dockerfile`（项目根目录）

因为选了「本地构建、上传产物」，Dockerfile 只做运行时打包，不含 `npm install` 和 `next build`：

```dockerfile
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY standalone/ ./
COPY static/ ./.next/static/
COPY public/ ./public/
EXPOSE 3000
CMD ["node", "server.js"]
```

基础镜像用固定 tag `node:24-alpine`（与本地 Node 24.18 主版本一致）。按踩坑记录的教训不该用浮动 tag，但 `node:24-alpine` 是主版本锁定的，且这个镜像只有 ~60MB，即使重拉代价也可接受（不同于那个 2.33GB 的 rust 镜像）。若后续想更严格可再钉 digest。

#### 3.2 新增 `docker-compose.projecttree.yml`（部署到 `/opt/projecttree/`）

```yaml
services:
  app:
    image: projecttree:prod
    container_name: projecttree-app
    restart: unless-stopped
    env_file: /opt/projecttree/secrets/app.env
    networks: [mcp-hub_default]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/sign-in"]
      interval: 30s
      timeout: 5s
      retries: 3
networks:
  mcp-hub_default:
    external: true
```

不映射端口到宿主机 —— 只让同网络的 nginx 容器访问，减少暴露面。网络名需在部署时用 `docker network ls` 确认实际名称（可能是 `mcp-hub_default` 或其他）。

健康检查打 `/sign-in`：它是公开页且不查库，最适合做存活探测；打 `/` 会被 proxy 重定向到登录页。

#### 3.3 服务器端环境变量 `/opt/projecttree/secrets/app.env`

```
DATABASE_URL=postgresql://projecttree:<pwd>@mcp-hub-postgres:5432/projecttree
BETTER_AUTH_SECRET=<沿用现有值>
BETTER_AUTH_URL=https://projecttree.feelo.top
NODE_ENV=production
```

主机名用容器名 `mcp-hub-postgres` 走 docker 内网 DNS，不加 `sslmode`（内网无需 TLS）。这个文件 `chmod 600`，**不进 git**。

`BETTER_AUTH_URL` 必须是 https 全域名，否则 [lib/auth.ts](file:///e:/100.Work/NestCoreProject/Feelo.ProjectTree/lib/auth.ts#L16-L23) 的 baseURL 会 fallback 到 undefined，导致 cookie domain 和回调地址错乱。

#### 3.4 修改 `/opt/mcp-hub/nginx/nginx.conf`

**改之前先备份**（`cp nginx.conf nginx.conf.bak.$(date +%F)`），这份配置同时服务着 mcphub 和 mcphub-admin 两个线上站点，改错会一起挂。

两处改动：

1. 现有 `:80` server 块的 `server_name` 加上 `projecttree.feelo.top`（走同一套 ACME + 301 跳转逻辑）
2. 新增一个 `:443` server 块：

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name projecttree.feelo.top;

    ssl_certificate     /etc/nginx/ssl/feelo.top.pem;
    ssl_certificate_key /etc/nginx/ssl/feelo.top.key;

    # Next.js 静态资源长缓存
    location /_next/static/ {
        proxy_pass http://projecttree-app:3000;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://projecttree-app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

证书路径沿用现有 server 块里的写法（容器内挂载点，需部署时确认实际是 `/etc/nginx/ssl/` 还是别的）。`X-Forwarded-Proto` 必须传，否则 better-auth 判断不出 https，secure cookie 会失效。

改完 `docker exec mcp-hub-nginx nginx -t` 验证语法，通过才 `nginx -s reload`（reload 不断连，比 restart 安全）。

#### 3.5 部署脚本 `deploy.ps1`（项目根目录）

按踩坑记录的三条教训编写：每步检查 `$LASTEXITCODE`、失败即 throw、部署后独立复核而非只看退出码。

流程：
1. 本地 `npm run build`，检查 `.next/standalone` 存在
2. 打包 `.next/standalone`、`.next/static`、`public`、`Dockerfile` 到 zip
3. `scp` 上传到 `/opt/projecttree/`
4. SSH 解压 → `docker build -t projecttree:prod` → `docker compose up -d`
5. **独立复核**：`docker inspect` 拿容器实际镜像 ID，与 `projecttree:prod` 当前 ID 比对，不等则 throw
6. 健康检查：`curl -fsS https://projecttree.feelo.top/sign-in` 返回 200

第 4 步的 `docker build` 只是复制文件（无编译），秒级完成，不需要像 mcp-hub 那样 `setsid nohup` 脱离会话。

#### 3.6 更新 `.gitignore` 与 `README.md`

- `.gitignore` 加 `/.oss/projecttree-dump.sql`（数据库转储含用户数据）
- `README.md` 的「部署与外部资源」章节补 ProjectTree 自己的部署信息：域名、容器名、数据库名、compose 文件位置、部署命令

---

## Assumptions & Decisions

| 决策 | 理由 |
|---|---|
| kysely 钉 0.28.17 而非升 better-auth | 实测 0.29.x 根导出确实缺常量，adapter peer 范围声明有误；降 kysely 是唯一确定可行的路径 |
| `revalidateTag` 传 `"max"` 而非 `updateTag` | `updateTag` 限制在 Server Action 内调用；`"max"` 是 Next 内置 profile，语义等价于旧行为 |
| 移除 `ignoreBuildErrors` | 类型错误修完后没有保留必要，留着会让新错误静默积累 |
| 复用 mcp-hub 的 postgres 容器 | 用户已确认。服务器仅剩 13G 磁盘、2.6G 可用内存，多起一个 PG 实例不划算 |
| 新建独立角色 `projecttree` 而非用 `hub` | 权限隔离；`hub` 是超级用户，且其密码已明文暴露在容器 env |
| 本地构建上传产物 | 用户已确认。2 vCPU / 3.4G 跑 `next build` 有 OOM 风险，跨境拉 npm 包也慢 |
| 应用容器不映射宿主机端口 | 只有同 docker 网络的 nginx 需要访问，不暴露到公网 |
| 复用泛域名证书 | `/opt/mcp-hub/nginx/ssl/feelo.top.pem` 是 `*.feelo.top`，覆盖 projecttree 子域，无需申请新证书 |
| 迁移前先用 SSH 隧道本地验证 | 把「数据库问题」与「部署问题」解耦，失败时能立刻定位是哪一层 |

### 待部署时确认的三件事

这些无法在本地静态确定，需要在执行时现场读取：

1. mcp-hub 的 docker 网络实际名称（`docker network ls`）
2. nginx 容器内证书的实际挂载路径（读现有 server 块的 `ssl_certificate` 行）
3. Neon 数据库的实际表清单与行数（导出前 `\dt` 确认）

### 明确不做的事

- 不动 mcp-hub 的任何容器、数据库、业务配置（只在 nginx.conf 追加 server 块）
- 不申请新 SSL 证书
- 不改数据库 schema（`ensureSchema()` 已能幂等处理）
- 不处理 `.env` 已提交到 git 远端的历史泄露问题（上一轮提过，属独立议题；但本次会确保新的服务器密码不进 git）

---

## Verification

### 阶段一

```powershell
npx tsc --noEmit          # 期望：Found 0 errors
npm run build             # 期望：退出码 0，生成 .next/standalone/server.js
node -e "import('kysely').then(k=>console.log('DEFAULT_MIGRATION_TABLE' in k))"   # 期望：true
```

### 阶段二

- 两边 8 张表行数逐行相同
- SSH 隧道下本地 `npm run dev` 登录成功，看板统计数字与 Neon 版本一致
- 项目详情页能正常展开树、改状态能写回

### 阶段三

```powershell
# 语法检查（reload 前必做）
ssh aliyun-ubuntu "docker exec mcp-hub-nginx nginx -t"
# 容器健康
ssh aliyun-ubuntu "docker ps --filter name=projecttree-app --format '{{.Status}}'"
# 镜像 ID 复核（防止跑的是旧镜像）
ssh aliyun-ubuntu "docker inspect --format='{{.Image}}' projecttree-app"
ssh aliyun-ubuntu "docker image inspect projecttree:prod --format='{{.Id}}'"
```

浏览器端：

1. `https://projecttree.feelo.top` → 302 到 `/sign-in`，证书有效无告警
2. 用 `perm.test@example.com` / `Test12345678` 登录成功
3. 看板、项目列表、项目详情、成员、报告页全部正常出数
4. 改一个节点状态，刷新后仍在（写回生效）
5. **回归检查**：`https://mcphub.feelo.top` 和 `https://mcphub-admin.feelo.top` 仍正常（确认没改坏共享 nginx）

### 性能对照

数据库从美东移到同机房后，上一轮实测的 253ms 单次 RTT 应降到 1ms 内。用 dev server 日志里的 `application-code` 耗时对比：改造前各页面 600-1000ms，预期降到 100ms 以内。这是本次迁移最大的实际收益。
