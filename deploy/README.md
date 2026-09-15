# 登录、云端成绩与阿里云部署

已实现 Google / 微信网站扫码 OAuth、七天登录会话、用户资料、成绩保存、用户前十排行榜。本地可启动完整服务；真实第三方应用与阿里云实例尚未配置，不能把本地测试当成真实登录或云端部署验收。

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

缺少应用凭据时，微信/Google 按钮显示“待配置”，游客游戏正常。若要先验证账户、成绩保存、重启恢复和排行榜，把 `.env` 的 `DEV_AUTH_ENABLED` 改为 `true`，重启服务，在“登录 · 排行榜”里使用“本地开发测试”表单。每次测试登录创建独立测试用户，不代表微信或 Google 账号；刷新页面保留会话，退出后再次测试登录属于新用户。

本地数据库默认为 `data/development.sqlite`，请保留此文件及 SQLite 管理的 WAL 文件。生产环境强制禁止开发登录，也不会将 dev 用户列入生产榜单。无需阿里云 AK/SK，也不需要前端直连数据库。

## 需要你提供的资料

| 项目 | 所需信息 |
| --- | --- |
| 阿里云服务器 | ECS 公网 IP、地域、Linux 系统版本、可用资源与磁盘、SSH 用户/端口，以及已授权的连接方式或本机密钥路径。不要把私钥内容发到聊天中。 |
| 域名 | 最终游戏域名、是否可修改 DNS、现有反向代理和 HTTPS 证书安排。示例 `kart.example.com`。 |
| Google | Google Cloud **Web application** OAuth 的 Client ID、Client Secret；授权同意页的应用名称、联系邮箱、主页/隐私政策链接，以及测试用户或发布状态。 |
| 微信 | 微信开放平台已审核通过的**网站应用** AppID、AppSecret，以及该应用配置的授权回调域名。公众号/小程序 AppID 不能直接替代此网站应用。 |
| 数据与运维 | 数据盘位置、备份目标与保留时间、管理员联系邮箱；如果已有 RDS/既定数据库规范，请一并说明，以决定是否替换默认单机 SQLite。 |

Client Secret / AppSecret 只放服务器环境文件或密钥管理中；可告知已配置变量名及位置，不必在聊天里粘贴明文。当前实现不需要阿里云账号密码或主账号访问密钥。

## 第三方登录配置

应用使用授权码在后端换取访问令牌，令牌只用于读取身份且不存到浏览器；只保留 provider + 稳定用户 ID、昵称、头像和成绩。Google 不请求 email 权限，不按邮箱合并账户。微信和 Google 是两个独立身份，尚未做跨平台账号绑定。

Google 创建 Web application OAuth 客户端，将下面的 URI **完整且精确地**添加到 Authorized redirect URIs。相关要求见 [Google OAuth Web Server 文档](https://developers.google.com/identity/protocols/oauth2/web-server)；用户标识来自 [Google UserInfo](https://developers.google.com/identity/openid-connect/reference)。

```text
https://你的域名/api/auth/google/callback
```

Google 本地测试可另加 `http://localhost:5173/api/auth/google/callback`。本项目使用 `openid profile` 和 PKCE，服务端处理 code 与 userinfo，不会把 Client Secret 放进 Vite 构建。

微信使用开放平台网站应用 `snsapi_login` 扫码流程，跳转到微信页面展示二维码。应用后台设置授权回调域名，实际回调路径为：

```text
https://你的域名/api/auth/wechat/callback
```

配置入口与应用资质以 [微信开放平台](https://open.weixin.qq.com/) 及其 [网站应用微信登录指南](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html) 为准。本次环境无法读取微信指南全文，真实应用的审核状态、回调域名与授权兼容性需凭据到位后联调确认。此版本未实现微信内置浏览器的公众号网页授权；如需该体验，需要额外提供对应公众号资料。

## 部署到单台 ECS

已提供 `Dockerfile`、`compose.yaml` 与 `deploy/Caddyfile`。架构为 Caddy HTTPS → Node API/静态页面 → SQLite 持久化卷。数据库没有公网端口。正式环境将接口与网页放在同一个域名，避免跨域 Cookie 配置。

服务器先安装 Docker Engine 与 Compose 插件，然后在项目根目录：

```sh
cp .env.production.example .env.production
chmod 600 .env.production
# 编辑 DOMAIN、PUBLIC_ORIGIN 和两家登录凭据
# DOMAIN=kart.example.com
# PUBLIC_ORIGIN=https://kart.example.com

docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
curl --fail https://kart.example.com/api/health
```

将域名 DNS 指向服务器，开放公网 80/443，让 Caddy 申请和续期 TLS 证书。SSH 仅向管理来源开放；3001 与数据库不需要公网开放。[阿里云安全组说明](https://www.alibabacloud.com/help/zh/ecs/user-guide/start-using-security-groups)介绍了端口规则。`TRUST_PROXY=true` 仅配合随附 Caddy 使用，Caddy 覆盖真实 IP 请求头；若改用其他代理，需同步调整可信代理设置。

本次本机没有 Docker，未实跑镜像/Compose，也未部署到阿里云。拿到 ECS 后需要验证镜像构建、卷权限、证书、真实 OAuth 回调，以及 ECS 到两家 OAuth 端点的网络连通性。

发布更新仍运行同一条 `up -d --build`，命名卷会保留用户和成绩。**不要执行 `docker compose down -v`，这会删除持久化卷。** 该方案适合单实例；多实例/高并发时应迁移到共享数据库，不能将同一 SQLite 文件挂到多个独立服务器。

## 数据、排名与保护

- 赛道固定 `mushroom-circuit`，规则版本 2（机关与双捷径），150cc、完整三圈；游戏物理或赛道发生影响成绩的变化时，更新 `server/store.mjs` 的规则版本隔离历史榜单。
- 每次登录后新开赛，从服务端获取绑定该用户与会话的比赛编号。冲线提交整数毫秒、车手、比赛名次和金币；服务器不会接受客户端传来的 userId 来决定归属。
- 每位用户只取最快一场，按用时、完成时间、比赛编号稳定排序，最多展示十人。自己的排名即使不在前十也能查询。历史有效比赛保存在数据库中。
- 同一比赛重试不会重复记分；内容改变会拒绝。开始失败不能在结束时补造比赛编号。退出/更换登录后必须新开赛。
- 提交接受 30 秒至 30 分钟用时，金币 0–10、名次 1–6；检查用时与服务端启动时间的基本一致性。比赛编号六小时有效以容纳暂停，之后要新开赛。
- Cookie 使用 HttpOnly、SameSite=Lax，HTTPS 下使用 Secure/`__Host-`；会话令牌只在数据库存哈希。写接口要求同源 Origin 与 JSON，登录 state 一次性、浏览器绑定、10 分钟过期，Google 另有 PKCE。
- 查询排行榜只公开昵称、头像、最佳成绩、车手和内部随机用户 ID；不公开第三方 OpenID、令牌、密钥或邮箱。当前没有自动关联/合并账号。
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
