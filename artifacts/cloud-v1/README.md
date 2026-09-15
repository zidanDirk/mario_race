# 账户与云端成绩 — 本地验证

实现：可配置 Google OAuth + PKCE、微信网站扫码 OAuth、HttpOnly 会话、SQLite 持久化、服务端比赛凭证/幂等成绩上传、每用户最快成绩前十、个人资料/排名、离线重试、Docker/Caddy 部署与在线备份。

验证结果：

- `npm run test:server`：10 组真实本地 HTTP/SQLite 测试通过，覆盖两家 OAuth 的受控上游响应、state/会话/CSRF、成绩归属和重复提交、前十去重及数据库重开。
- `npm run test:cloud`：8 组浏览器检查通过，真实 API/临时数据库，包含游戏开赛签发凭证、成绩失败重试只记一次、读取排行榜、刷新保持登录、退出、全屏、手机布局与 QA 模式不上传；无页面异常。比赛结算由原 UI 模块在独立测试夹具中触发，服务端时间可控，不是实跑第三方授权或整场驾驶。
- `tests/cloud-ui-browser.mjs`：10 组模拟接口 UI 检查通过，包括满十人长昵称榜单、320/375px 宽度、纯文本渲染、断网、旧响应与退出竞态。
- `npm run test:unit`：原有游戏驾驶/碰撞/道具/连续性共33项检查通过。
- `npm run build`：通过；现有大 JS 包提示仍存在（约615KB / gzip170KB）。
- `scripts/backup.mjs`：对运行中的本地数据库生成快照，`PRAGMA integrity_check` 返回 `ok`。

实际游戏与真实本地 API 的截图：

- [桌面个人信息与已保存成绩](desktop-account-saved.png)
- [手机个人信息与已保存成绩](mobile-account-saved.png)
- [本地测试账户的空榜](desktop-account-empty.png)

其他 `account-*.png` 截图使用明确的测试接口数据；不代表已有真实线上用户。

当前限制：没有真实 OAuth 凭据，Google/微信需后续授权联调；没有阿里云实例，未部署；本机没有 Docker，镜像/Compose 尚未实跑。浏览器物理与成绩上报仍属于客户端可信模型，基本时间检查不是完整反作弊。详情和所需资料见 [部署指南](../../deploy/README.md)。
