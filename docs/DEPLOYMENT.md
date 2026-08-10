# 私人朋友服部署手册

## 发布边界

当前统一站点不是纯静态网站。生产环境必须运行 `npm start`，由同一个 Node 进程提供：

- `dist/site` 门户、Arena 和定制器静态资源；
- `/api/*` 邀请、身份、进度和异步挑战接口；
- 同源 WebSocket 实时匹配；
- `/health` 存活检查。

Cloudflare Pages 工作流只保留为手动静态预览，不能作为朋友服生产环境。生产主机必须支持长期运行的 Node 进程、WebSocket 和持久化磁盘。

## 运行要求

- Node.js 24 或更高版本；
- HTTPS 反向代理，并允许 WebSocket Upgrade；
- 单实例运行。SQLite 与内存匹配队列暂不支持多实例横向扩容；
- `DATABASE_PATH` 位于持久化磁盘；
- `BACKUP_ROOT` 最好位于独立持久卷或另一台机器；
- 仅将应用端口暴露给反向代理，不直接公开 SQLite、备份目录或管理终端。

复制 `.env.production.example` 的字段到主机环境配置。不要把真实邀请码、设备令牌、Cloudflare 令牌或其他密钥写进 `.env.production.example`、Git、构建日志或分享链接。

## 部署前门禁

在干净检出的代码上执行：

```powershell
npm ci
npm run test:unit
npm run test:server
npm run test:nss-contract
Set-Location battle-top-designer\web-customizer
npm ci
npm run test:unit
Set-Location ..\..
npm run build
npm run verify:site
```

生产构建输出必须是 `dist/site`。本地重复构建时，构建脚本会拒绝覆盖已有目录；先把旧 `dist/site` 移到一个明确命名的保留目录，不要删除用户文件，也不要在生产主机混用多份构建产物。

## 首次启动

1. 配置 `.env.production.example` 中列出的环境变量。
2. 确认 `DATABASE_PATH`、`BACKUP_ROOT` 和 `SITE_ROOT` 都是绝对路径。
3. 使用同一个 `DATABASE_PATH` 运行 `npm run invite -- create`，创建第一个邀请码；该命令会自动执行缺失迁移。
4. 运行 `npm run invite -- list`，确认邀请码默认显示为脱敏值且状态为 `ENABLED`。
5. 运行 `npm start`。
6. 请求 `GET /health`，必须返回 HTTP 200 和 `{ "status": "ok" }`。
7. 通过 HTTPS 打开 `/`、`/customizer/`、`/arena/` 和一个 `/challenge/<uuid>` 回退路径。
8. 用两个独立浏览器身份完成一次创建、认领、战斗、结果提交和回挑战。

## 邀请码管理

邀请码管理命令只在可信服务器终端运行，不提供公网管理 API：

```powershell
# 默认生成仅可认领一次的随机邀请码
npm run invite -- create

# 创建可供 5 位朋友认领的自定义邀请码
npm run invite -- create --code FRIENDS-2026 --max-uses 5

# 默认脱敏查看全部邀请码
npm run invite -- list

# 明确显示完整邀请码
npm run invite -- list --reveal

# 阻止新的认领，不影响已经认领的玩家
npm run invite -- disable FRIENDS-2026
```

所有命令读取与服务相同的 `DATABASE_PATH`。创建成功和 `list --reveal` 会输出完整邀请码，只能在可信终端执行，不要把输出写入公共 CI 或部署日志。`disable` 不删除记录，也不撤销既有玩家身份。

## 反向代理检查

反向代理需要：

- 将 HTTPS 请求转发到 `HOST:PORT`；
- 保留 `Host`；
- 为 WebSocket 转发 `Upgrade` 和 `Connection`；
- 将最大请求体限制设为不低于 2 MiB；
- 为 `/health` 配置存活检查；
- 不缓存 `/api/*`，不记录 `Authorization` 请求头。

客户端默认从当前页面地址推导 `https`/`wss` 同源地址，因此首个版本不需要设置 `VITE_WS_URL`。只有前后端确实分域时才重新构建并设置该变量。

## 备份

正式备份可以在服务运行时执行：

```powershell
npm run backup:server
```

命令从 `DATABASE_PATH`、`BACKUP_ROOT` 和可选的 `UPLOAD_ROOT` 读取路径。它会新建带 UTC 时间戳的目录、在线复制一致的 SQLite 快照、生成 SHA-256 清单并验证数据库。目标已存在时不会覆盖，也不会自动删除旧备份。

发布前先执行 dry-run：

```powershell
node scripts/backup-private-server.mjs --dry-run
```

随后执行正式备份，并对生成目录执行恢复 dry-run：

```powershell
node scripts/restore-private-server.mjs --backup <生成的备份绝对路径> --dry-run
```

备份未加密，包含昵称、身份哈希、进度和挑战记录，必须按敏感数据保护。同盘备份不能防止整盘故障。

## 更新与回滚

更新前：

1. 完成全部门禁；
2. 创建正式备份并通过恢复 dry-run；
3. 记录当前 Git 提交、构建产物目录和备份目录；
4. 停止旧进程，切换到新代码和唯一一份新 `dist/site`，再启动服务。

回滚时：

1. 停止服务；
2. 切回已记录的旧提交和旧构建产物；
3. 优先复用未损坏的现有数据库；
4. 只有数据库确实需要回退时，手动把现有数据库移动到明确保留路径；
5. 对目标备份执行恢复 dry-run，再恢复到不存在的 `DATABASE_PATH`；
6. 启动服务并检查 `/health` 和双身份挑战链。

恢复命令不会覆盖已有数据库或上传目录，也没有 `--force`。恢复期间必须保持服务停止。

## 公网发布前仍需确认

- 具体主机和生产 URL；
- TLS 域名与证书；
- 独立持久卷和异地备份位置；
- 反向代理访问日志脱敏；
- 至少一次真实手机和家庭网络访问测试。
