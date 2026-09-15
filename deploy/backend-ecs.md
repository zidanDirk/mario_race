# ECS 纯后端部署

本部署只运行 `backend.zhangzidan.com`：Caddy 终止 HTTPS，Node 提供 `/api/*`，SQLite 数据保存在 Docker 命名卷。游戏 HTML、JavaScript、CSS 和图片不进入 ECS 镜像。

## 环境变量

- `DOMAIN`：Caddy 对外域名，当前为 `backend.zhangzidan.com`。
- `API_ORIGIN`：API 的完整 HTTPS Origin，决定 Google/微信回调地址。
- `APP_ORIGIN`：Kodo 静态网站最终 HTTPS Origin，只允许这一个来源带凭据访问 API，OAuth 完成后也回到这里。
- `COOKIE_SAME_SITE`：前后端使用同一主域名下的子域名时保持 `Lax`。若使用无关的七牛测试域名，浏览器可能阻止第三方 Cookie；正式环境应为 Kodo 绑定 `zhangzidan.com` 下的自定义前端域名。
- `SERVE_STATIC=false`：关闭 ECS 静态文件服务。
- OAuth Secret 只保存在 ECS 的 `.env.production`，不进入镜像和前端构建。

## 启动

```sh
cp .env.production.example .env.production
chmod 600 .env.production
# 编辑 APP_ORIGIN 和 OAuth 凭据
sudo docker compose --env-file .env.production up -d --build
sudo docker compose --env-file .env.production ps
curl --fail https://backend.zhangzidan.com/api/health
```

没有 OAuth 凭据也能先启动并验证健康检查、空排行榜和数据库；登录按钮会保持未配置状态。

## 查看状态

```sh
sudo docker compose --env-file .env.production logs --tail=100 game caddy
curl -i https://backend.zhangzidan.com/api/config
curl -i https://backend.zhangzidan.com/api/leaderboard
```

根路径应返回 404，因为 ECS 不承载游戏页面。`/api/health` 应返回 `{"ok":true}`。不要公开 3001 端口，安全组只需公开 80/443；数据库没有公网端口。

## 更新与回滚准备

更新前先用 `scripts/backup.mjs` 生成 SQLite 一致性备份。不要执行 `docker compose down -v`，`-v` 会删除用户和成绩卷。
