# 登录、云端成绩与阿里云部署

已实现 Google OAuth、邮箱验证码登录、七天登录会话、用户资料、成绩保存、用户前十排行榜。生产前端位于七牛，账户与成绩 API 以及 SQLite 位于阿里云轻量应用服务器。由于该阿里云节点无法连接 Google 的 token 与 UserInfo 端点，Google 生产登录通过一个最小权限 Cloudflare Worker 完成服务端交换。验证码邮件通过阿里云邮件推送的加密 SMTP 通道发送。

计时挑战与道具竞速按模式独立保存成绩、个人统计和前十用户排行榜。启动时自动为旧数据库添加比赛模式字段，旧记录归入道具竞速；更新部署前按下文备份数据库。幽灵录像仅保存在用户当前浏览器，不上传服务器，现阶段无需对象存储或新增云服务配置。

每日挑战使用现有 SQLite 保存账号经验、每日任务进度及装备，无需额外云服务。启动时自动增加 `user_progression` 表和比赛 `metrics` 字段（数据库版本 3），保留原用户与成绩。前后端都依赖 `shared/progression.mjs`；Dockerfile 和原生后端安装脚本已包含 shared 目录，手工部署时也必须复制。前后端应一起更新。任务按服务器北京时间、开赛日期结算，比赛完成与奖励写入同一事务，重复提交不会重复奖励；这些基础校验不等同于完整防作弊。

## 先在本机使用

需要 Node.js 22.17+（使用内置 SQLite，22.x 会显示实验性提示）。

```sh
npm ci
cp .env.example .env
npm run dev
```

打开 **http://localhost:5173**。Vite 将 `/api` 代理到本机 3001。请统一使用配置中的 `PUBLIC_ORIGIN`，不要混用 localhost 与 127.0.0.1，否则写请求来源校验会拒绝。

缺少服务凭据时，邮箱/Google 入口显示“待配置”，游客游戏正常。若要先验证账户、成绩保存、重启恢复和排行榜，把 `.env` 的 `DEV_AUTH_ENABLED` 改为 `true`，重启服务，在“登录 · 排行榜”里使用“本地开发测试”表单。每次测试登录创建独立测试用户，不代表邮箱或 Google 账号；刷新页面保留会话，退出后再次测试登录属于新用户。

本地数据库默认为 `data/development.sqlite`，请保留此文件及 SQLite 管理的 WAL 文件。生产环境强制禁止开发登录，也不会将 dev 用户列入生产榜单。无需阿里云 AK/SK，也不需要前端直连数据库。

## 需要你提供的资料

| 项目 | 所需信息 |
| --- | --- |
| 阿里云服务器 | ECS 公网 IP、地域、Linux 系统版本、可用资源与磁盘、SSH 用户/端口，以及已授权的连接方式或本机密钥路径。不要把私钥内容发到聊天中。 |
| 域名 | 最终游戏域名、是否可修改 DNS、现有反向代理和 HTTPS 证书安排。示例 `kart.example.com`。 |
| Google | Google Cloud **Web application** OAuth 的 Client ID、Client Secret；授权同意页的应用名称、联系邮箱、主页/隐私政策链接，以及测试用户或发布状态。 |
| 邮箱 | 阿里云邮件推送中验证通过的发信子域名、触发邮件类型发信地址，以及该地址设置的 SMTP 密码。另需生成至少 32 字符的稳定随机 `EMAIL_AUTH_SECRET`。 |
| 数据与运维 | 数据盘位置、备份目标与保留时间、管理员联系邮箱；如果已有 RDS/既定数据库规范，请一并说明，以决定是否替换默认单机 SQLite。 |

Client Secret / AppSecret 只放服务器环境文件或密钥管理中；可告知已配置变量名及位置，不必在聊天里粘贴明文。当前实现不需要阿里云账号密码或主账号访问密钥。

## 第三方登录配置

Google 使用授权码在后端换取访问令牌，令牌只用于读取身份且不存到浏览器。邮箱登录使用六位验证码，验证码五分钟有效、单次使用，连续输错五次失效。数据库只保存带服务端密钥的邮箱 HMAC 标识与短期验证码 HMAC，不保存完整邮箱或验证码明文。Google 与邮箱是两个独立身份，尚未做跨平台账号绑定。

Google 创建 Web application OAuth 客户端，将下面的 URI **完整且精确地**添加到 Authorized redirect URIs。相关要求见 [Google OAuth Web Server 文档](https://developers.google.com/identity/protocols/oauth2/web-server)；用户标识来自 [Google UserInfo](https://developers.google.com/identity/openid-connect/reference)。

```text
https://backend.zhangzidan.com/api/auth/google/callback
```

Google 本地测试可另加 `http://localhost:5173/api/auth/google/callback`。本项目使用 `openid profile` 和 PKCE，服务端处理 code 与 userinfo，不会把 Client Secret 放进 Vite 构建。

生产环境设置 `GOOGLE_CLIENT_ID`、`GOOGLE_RELAY_URL` 和 `GOOGLE_RELAY_SECRET`，不要在阿里云保留 `GOOGLE_CLIENT_SECRET`。中继源码位于 `cloudflare/google-oauth-relay/`，通过 Cloudflare Pages Functions（Workers 运行时）发布；它只接受携带共享密钥的 `POST /google/exchange`，并锁定上面的正式回调地址。Pages production Secrets 为 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`RELAY_SECRET`、`GOOGLE_REDIRECT_URI`；其中 `RELAY_SECRET` 与阿里云的 `GOOGLE_RELAY_SECRET` 必须一致且至少 32 个字符，`GOOGLE_REDIRECT_URI` 使用上面的正式回调地址。用 Cloudflare 官方 Wrangler 部署时，在该目录执行：

```sh
npm install
npx wrangler login
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name mario-google-oauth-relay-pages
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name mario-google-oauth-relay-pages
npx wrangler pages secret put RELAY_SECRET --project-name mario-google-oauth-relay-pages
npx wrangler pages secret put GOOGLE_REDIRECT_URI --project-name mario-google-oauth-relay-pages
npm run deploy
```

密钥只通过 Wrangler 的交互式输入或 Cloudflare Secrets 配置，不写入仓库、命令参数或日志。正式中继地址为 `https://mario-google-oauth-relay-pages.pages.dev/google/exchange`。Google Cloud 已登记的回调 URI 保持为阿里云回调，无需改成 Cloudflare 地址。

邮箱登录推荐使用阿里云邮件推送。开通服务后，为 `zhangzidan.com` 的专用子域名配置控制台给出的 DNS 记录，创建“触发邮件”类型发信地址并设置 SMTP 密码。生产环境配置：

```text
EMAIL_SMTP_HOST=smtpdm.aliyun.com
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=login@你的发信子域名
EMAIL_SMTP_PASSWORD=控制台设置的SMTP密码
EMAIL_AUTH_SECRET=至少32字符的稳定随机密钥
EMAIL_FROM_NAME=游戏星球
EMAIL_DAILY_LIMIT=200
```

`EMAIL_AUTH_SECRET` 用于生成稳定账号标识和验证码摘要，不能提交到仓库，也不要在已有邮箱用户后随意更换。服务端限制同一邮箱每分钟 1 封、每小时 5 封、每天 10 封，同一 IP 每小时 20 封，并设置全站每日上限。阿里云邮件推送不会代替应用实施单地址频控，因此这些限制保留在服务端。

## 七牛静态站点 + 阿里云轻量应用服务器后端

当前架构为 `https://games.zhangzidan.com/marace/` 托管 Vite 静态文件，`https://backend.zhangzidan.com` 运行 Caddy → Node API → SQLite。两个地址属于同一主域名，浏览器请求使用带凭据 CORS，OAuth 完成后返回 `/marace/`。Google token 与 UserInfo 请求由 Cloudflare Pages Function 中继，浏览器不会访问中继。数据库没有公网端口。

构建静态文件前，在 `.env.production` 中保留：

```text
VITE_API_ORIGIN=https://backend.zhangzidan.com
```

运行 `npm run build` 后，将 `dist/` 的内容发布到七牛站点的 `marace/` 目录。`Client Secret` 不会进入前端构建；只有 `VITE_API_ORIGIN` 会写入浏览器代码。

服务器先安装 Docker Engine 与 Compose 插件，然后在项目根目录：

```sh
cp .env.production.example .env.production
chmod 600 .env.production
# 编辑 OAuth 凭据；域名与返回目录使用示例中的正式值

docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
curl --fail https://backend.zhangzidan.com/api/health
```

将 `backend.zhangzidan.com` 的 DNS 指向服务器，开放公网 80/443，让 Caddy 申请和续期 TLS 证书。SSH 仅向管理来源开放；3001 与数据库不需要公网开放。[阿里云安全组说明](https://www.alibabacloud.com/help/zh/ecs/user-guide/start-using-security-groups)介绍了端口规则。`TRUST_PROXY=true` 仅配合随附 Caddy 使用，Caddy 覆盖真实 IP 请求头；若改用其他代理，需同步调整可信代理设置。

本次本机没有 Docker，未实跑镜像/Compose，也未部署到阿里云。拿到 ECS 后需要验证镜像构建、卷权限、证书、真实 OAuth 回调，以及 ECS 到两家 OAuth 端点的网络连通性。

发布更新仍运行同一条 `up -d --build`，命名卷会保留用户和成绩。**不要执行 `docker compose down -v`，这会删除持久化卷。** 该方案适合单实例；多实例/高并发时应迁移到共享数据库，不能将同一 SQLite 文件挂到多个独立服务器。

## 数据、排名与保护

- 赛道固定 `mushroom-circuit`，规则版本 2（机关与双捷径），150cc、完整三圈；游戏物理或赛道发生影响成绩的变化时，更新 `server/store.mjs` 的规则版本隔离历史榜单。
- 每次登录后新开赛，从服务端获取绑定该用户与会话的比赛编号。冲线提交整数毫秒、车手、比赛名次和金币；服务器不会接受客户端传来的 userId 来决定归属。
- 每位用户只取最快一场，按用时、完成时间、比赛编号稳定排序，最多展示十人。自己的排名即使不在前十也能查询。历史有效比赛保存在数据库中。
- 同一比赛重试不会重复记分；内容改变会拒绝。开始失败不能在结束时补造比赛编号。退出/更换登录后必须新开赛。
- 提交接受 30 秒至 30 分钟用时，金币 0–10、名次 1–6；检查用时与服务端启动时间的基本一致性。比赛编号六小时有效以容纳暂停，之后要新开赛。
- Cookie 使用 HttpOnly、SameSite=Lax，HTTPS 下使用 Secure/`__Host-`；会话令牌只在数据库存哈希。写接口要求同源 Origin 与 JSON，登录 state 一次性、浏览器绑定、10 分钟过期，Google 另有 PKCE。
- 查询排行榜只公开昵称、头像、最佳成绩、车手和内部随机用户 ID；不公开第三方账号标识、令牌、密钥或邮箱。当前没有自动关联/合并账号。
- 用户/有效成绩长期保存，过期会话、OAuth state 与未完成比赛自动清理。上线前根据实际运营需要确定删除请求与备份保留流程，并发布隐私政策。
- **当前比赛物理仍在浏览器运行。上述校验是基础防滥用，不是完整反作弊。** 被修改的客户端仍可能伪造成绩；如用于奖励/正式竞技，需追加可验证输入回放或服务端权威模拟。QA 测试模式不会上传成绩，但这不是安全边界。
- 游客仅保留原有本机个人最佳，不补传历史游客成绩。保存失败的有效比赛可在本场结算页重试；关闭页面或重新开赛后不保留待上传队列。

## 备份与恢复

SQLite 开启 WAL。运行时不要直接只复制 `.sqlite` 主文件，使用随附在线备份脚本（[Node SQLite backup 文档](https://nodejs.org/api/sqlite.html)）。

```sh
# 容器内生成一致性快照到持久化备份卷
docker compose --env-file .env.production exec game node scripts/backup.mjs
# 复制备份到本机目录，然后按你的策略另存到异地存储
mkdir -p backups
docker compose --env-file .env.production cp game:/app/backups/. ./backups/
```

备份文件同样包含用户数据，请限制访问。备份周期、保留和异地目标尚未自动配置，待服务器和运维要求明确后设置。

恢复流程：先停服务并备份当前卷；通过运维方式将选定快照替换卷内 `race.sqlite`，清理与旧主文件对应的 `race.sqlite-wal`/`race.sqlite-shm`（务必只在服务停止后），确保 uid/gid 为容器 node 用户 1000，再启动并检查 `/api/health` 与排行榜。先在测试实例演练，再用于正式恢复。

## 验证命令

```sh
npm run test:server
npm run test:unit
npm run build
npm run test:cloud
```

`test:server` 使用真实 HTTP/临时 SQLite、受控模拟 OAuth 上游；`test:cloud` 使用真实本地 API/数据库和 Chrome，验证登录、开赛凭证、保存重试、排行榜、刷新、退出与 QA 禁止上传。浏览器默认使用 macOS Chrome，可用 `CHROME_PATH` 指定其他位置。另有 `tests/cloud-ui-browser.mjs` 检查离线/空榜/响应式及 UI 竞态，其 API 为模拟数据。
