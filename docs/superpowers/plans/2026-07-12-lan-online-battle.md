# 局域网跨电脑对战实施计划

## 1. 动态网络地址

### 文件

- 修改 `src/network/networkClient.ts`

### 工作

1. 保留 `VITE_WS_URL` 最高优先级。
2. 使用当前页面 `URL` 派生 WebSocket 协议、主机名和 `8080` 端口。
3. 清理路径、查询参数和哈希。
4. 在 QA 诊断中验证本机 URL 与局域网 URL 的派生结果。

## 2. 相对开战倒计时

### 文件

- 修改 `src/network/protocol.ts`
- 修改 `src/network/networkClient.ts`
- 修改 `server/match-server.mjs`
- 修改 `src/app/game.ts`
- 修改 `scripts/test-match-server.mjs`

### 工作

1. 将 `MATCH_START.startAt` 改为 `startDelayMs`。
2. 服务器校验 500 至 10000 毫秒的整数延迟。
3. 服务器从收到请求时开始安排首回合。
4. 客户端使用 `performance.now()` 计算本地开战目标时间。
5. 更新服务器烟测，证明协议不再依赖客户端绝对时钟。

## 3. 局域网监听与脚本

### 文件

- 修改 `server/match-server.mjs`
- 修改 `package.json`
- 必要时修改 `package-lock.json`

### 工作

1. WebSocketServer 显式绑定 `HOST`，默认 `0.0.0.0`。
2. 日志打印实际监听地址。
3. 增加 `dev:lan`，固定监听 `0.0.0.0:4176`。
4. 保持原 `dev` 和本机访问方式兼容。

## 4. 验证

1. 运行 `npm run test:server`。
2. 运行 `npm run build`。
3. 启动 LAN 服务，通过 `http://192.168.1.42:4176` 获取页面。
4. 通过 `ws://192.168.1.42:8080` 完成 WebSocket 握手和排队。
5. 使用 Playwright 从局域网 URL 打开页面，确认诊断中的 WebSocket URL 为局域网地址。
6. 回归 `http://127.0.0.1:4176`，确认本机双窗口入口仍可用。
7. 执行 `git diff --check`。

## 完成定义

同一局域网中的另一台电脑只需访问主机 IP，即可加载游戏并自动连接同一主机的匹配服务；开战时序不依赖两台电脑系统时间，本机访问继续兼容。
