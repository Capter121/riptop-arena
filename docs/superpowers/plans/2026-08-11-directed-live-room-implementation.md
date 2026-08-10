# 指定好友真人房间实施计划

> 依据：`docs/superpowers/specs/2026-08-11-directed-live-room-design.md`

## 目标

以最小改动扩展现有 WebSocket 真人匹配：修复公网 WSS 自动地址、接入正式／游客昵称、增加只在创建者在线等待期间有效的一次性指定好友房间链接，并保持随机匹配和战斗规则不变。

## 成功标准

- HTTPS 页面默认得到同源 `wss://` 地址，不附加错误的 `:8080`。
- 正式身份昵称优先；无身份玩家可填写并复用本地游客昵称。
- 创建者可生成临时链接，一位朋友确认后加入，链接随后失效。
- 创建者取消或断线后链接失效。
- 私人等待与随机队列互不串队。
- 双端匹配后继续复用当前装配、准备、倒计时和确定性博弈战斗。
- TypeScript、单元、服务端、浏览器和生产构建回归通过。

## 修改边界

允许修改或新增：

- `src/network/protocol.ts`
- `src/network/networkClient.ts`
- `src/network/onlineIdentity.ts`（新增）
- `src/ui/lanModal.ts`
- `src/app/game.ts`
- `server/match-server.mjs`
- `scripts/test-match-server.mjs`
- `tests/unit/network-client.test.ts`（新增）
- `tests/unit/online-identity.test.ts`（新增）
- `tests/e2e/live-room.spec.ts`（新增）
- 仅在真人联机界面确有需要时修改 `src/style.css`

不修改装配目录、物理、伤害、属性、战斗回合算法、幽灵挑战、SQLite 表或现有未跟踪素材。

## 实施步骤

### 【步骤1】建立基线并加载玩法实施约束

目标：

- 确认开始实施时工作树状态，记录用户已有未跟踪文件。
- 按 `threejs-gameplay-systems` 要求读取玩法工作流参考；本任务不改变物理，因此记录物理参考为“不需要”。
- 运行与本功能直接相关的现有测试，确认基线。

操作：

1. 读取 `references/gameplay-workflows.md` 并建立 reference ledger。
2. 运行：

```powershell
npx vitest run tests/unit/local-identity.test.ts
node scripts/test-match-server.mjs
npx tsc --noEmit
```

验证：

- 三项基线均通过；若失败，先判断是否为既有问题，不带病修改功能。
- `git status --short` 中用户已有文件不被删除、暂存或改写。

### 【步骤2】先测试并修复 WebSocket URL 推导

目标：

- 固化公网 HTTPS 和本地 HTTP/LAN 的地址规则。

测试先行：

1. 新增 `tests/unit/network-client.test.ts`。
2. 覆盖：
   - `https://example.com/arena/` → `wss://example.com/`；
   - HTTPS 显式非默认端口保持端口；
   - `http://127.0.0.1:8080/arena/` → 同端口 WS；
   - `http://192.168.1.42:4176/arena/` → `ws://192.168.1.42:8080/`；
   - 清除 path、search 和 hash。
3. 先运行测试，确认当前 HTTPS 用例因 `:8080` 失败。

实现：

- 只修改 `deriveWebSocketUrl()`：HTTPS 使用当前公开端口；HTTP 非 8080 页面使用 8080。
- 保持 `VITE_WS_URL` 优先级不变。

验证：

```powershell
npx vitest run tests/unit/network-client.test.ts
```

### 【步骤3】先测试并实现联机昵称解析

目标：

- 将正式身份与游客昵称规则隔离成小型纯工具，不扩展认证模型。

测试先行：

1. 新增 `tests/unit/online-identity.test.ts`。
2. 覆盖正式身份优先、游客昵称读取、首尾空格归一化、保存成功、空白／超长／存储异常拒绝。
3. 先运行测试并确认因模块不存在而失败。

实现：

- 新增 `src/network/onlineIdentity.ts`。
- 复用 `loadLocalIdentity()`；使用独立 localStorage key 保存游客昵称。
- 暴露最少的读取、校验和保存函数。

验证：

```powershell
npx vitest run tests/unit/online-identity.test.ts tests/unit/local-identity.test.ts
```

### 【步骤4】先扩展协议类型与解析测试

目标：

- 在协议 v2 中加入创建／加入私人房间及创建成功消息。

测试先行：

- 在 `tests/unit/network-client.test.ts` 增加 `PRIVATE_ROOM_CREATED` 的合法解析，以及未知／畸形消息拒绝测试。
- 先确认新增测试失败。

实现：

- 在 `src/network/protocol.ts` 增加：
  - `CREATE_PRIVATE_ROOM`；
  - `JOIN_PRIVATE_ROOM`；
  - `PRIVATE_ROOM_CREATED`。
- 严格限定字段类型；不改现有战斗消息。

验证：

```powershell
npx vitest run tests/unit/network-client.test.ts
npx tsc --noEmit
```

### 【步骤5】先测试并实现服务端私人等待生命周期

目标：

- 在服务器内存中实现一次性定向等待，不影响随机 FIFO 匹配。

测试先行：

在 `scripts/test-match-server.mjs` 增加以下场景，并先确认失败：

1. 创建者收到合法 `PRIVATE_ROOM_CREATED`。
2. 加入者凭令牌配对，双方昵称、装配、角色和 `roomId` 正确。
3. 已使用令牌返回 `PRIVATE_ROOM_NOT_FOUND`。
4. 创建者取消后令牌失效。
5. 创建者断线后令牌失效。
6. 非法令牌返回 `INVALID_ROOM_TOKEN`。
7. 重复等待返回 `ALREADY_WAITING`。
8. 创建者不能用自己的令牌加入。
9. 私人等待者不会与随机排队者配对。

实现：

- `server/match-server.mjs` 从 `node:crypto` 增加高熵 URL 安全令牌生成。
- 增加 `privateRooms` 映射和统一的等待清理函数。
- 客户端元数据只记录一种等待状态。
- 创建和加入均复用现有昵称／装配校验。
- 加入成功前先删除令牌，再调用现有 `createRoom()`。
- `CANCEL_QUEUE`、`close` 和进入房间都清理等待状态。

验证：

```powershell
node scripts/test-match-server.mjs
```

要求现有随机匹配、准备、回合、超时和混合装配测试同时通过。

### 【步骤6】先测试并扩展 NetworkClient 状态

目标：

- 客户端能创建、加入、取消私人房间并暴露令牌，不复制战斗路径。

测试先行：

- 在 `tests/unit/network-client.test.ts` 使用可控的 WebSocket 假对象验证发送消息、状态变化、令牌保存和断开重置。
- 先确认新增行为失败。

实现：

- `NetworkClient` 新增 `createPrivateRoom()` 和 `joinPrivateRoom()`。
- 连接状态增加明确的私人等待状态。
- 处理 `PRIVATE_ROOM_CREATED`；`MATCHED` 之后继续进入原流程。
- `cancelQueue()`、`disconnect()` 和会话重置清除私人令牌。

验证：

```powershell
npx vitest run tests/unit/network-client.test.ts
npx tsc --noEmit
```

### 【步骤7】改造真人联机窗口

目标：

- 在现有弹窗内完成随机、创建、分享和链接加入四种状态，不新增页面。

实现：

- 更新 `src/ui/lanModal.ts` 的过时局域网文案。
- 增加昵称区域；正式昵称只读，游客昵称可输入。
- 增加“随机匹配”和“创建好友房间”按钮。
- 创建成功后显示只读邀请链接、复制按钮、等待状态和取消按钮。
- 加入链接模式仅显示昵称确认、“加入对战”和服务器地址。
- 复制失败时显示提示并保留可手动复制的文本。
- 仅当现有内联样式无法清晰表达状态时，对 `src/style.css` 做最小补充。

验证：

- TypeScript 通过。
- 键盘可聚焦所有输入和按钮；按钮文案明确；移动端不产生水平溢出。

### 【步骤8】接入 Game，保持战斗路径不变

目标：

- Arena 能解析 `?room=`，使用正确昵称和当前装配调用三种匹配入口。

实现：

- 在 `src/app/game.ts` 启动时读取房间令牌并打开加入确认状态。
- 提取或复用一处 `OnlineLoadout` 构造逻辑，避免随机／创建／加入产生三份装配代码。
- 将写死的 `Player` 替换为昵称解析结果。
- 将弹窗回调分别连接随机匹配、创建房间、加入房间和取消。
- 收到 `PRIVATE_ROOM_CREATED` 时使用当前页面 origin 生成 `/arena/?room=<token>` 完整链接。
- 错误码映射为中文提示；私人房间错误不调用随机匹配。
- `MATCHED` 后继续使用现有 `prepareOnlineBattle()`，不修改战斗分支。

验证：

```powershell
npx tsc --noEmit
npx vitest run tests/unit/network-client.test.ts tests/unit/online-identity.test.ts
node scripts/test-match-server.mjs
```

### 【步骤9】双浏览器真实流程验证

目标：

- 通过真实浏览器输入路径和真实 WebSocket 服务证明指定链接可用。

测试先行与实现：

- 新增 `tests/e2e/live-room.spec.ts`。
- 测试启动独立端口的 `server/match-server.mjs`，避免使用或干扰当前朋友服。
- 浏览器 A 预置合法正式身份，打开 Arena、创建房间并读取链接。
- 隔离浏览器 B 以游客身份打开链接，填写昵称、指定测试 WS 地址并加入。
- 断言双方进入匹配／战斗状态，显示正确对手昵称。
- 再用第三个隔离上下文打开同一链接，断言显示已失效且没有随机排队。
- 捕获页面错误，并保留一张成功匹配截图作为验证产物。

验证：

```powershell
node node_modules/@playwright/test/cli.js test tests/e2e/live-room.spec.ts
```

### 【步骤10】完整回归与生产构建

目标：

- 确认功能没有破坏既有系统，并生成可部署站点。

验证：

```powershell
npx tsc --noEmit
npx vitest run
npm run test:server
npm run test:e2e
npm run build
npm run verify:site
```

补充检查：

- 浏览器控制台无未处理异常。
- Arena Canvas 尺寸非零。
- 公网 HTTPS 推导结果不含 `:8080`。
- `git diff --check` 通过。
- `git status --short` 中原有未跟踪文件保持不变。

### 【步骤11】部署前交付检查

目标：

- 明确哪些运行进程需要重启，避免未经授权直接替换朋友服。

操作：

- 汇总代码、测试和构建结果。
- 检查当前 Node 朋友服与 Cloudflare Tunnel 状态，但不自动中断或替换运行中的公网服务。
- 如需让公网地址使用新代码，单独向用户说明重启 Node 服务的影响并获得确认。

验证：

- 提供创建链接、朋友加入和随机匹配的最终操作步骤。
- 列出仍存在的限制：临时 Tunnel 域名、内存房间、链接持有者授权和游客昵称非唯一。

## 提交策略

- 实施过程中不暂存用户已有未跟踪文件。
- 功能完成并通过验证后，只暂存上述允许修改范围内的文件。
- 建议单个功能提交：`feat(online): add directed live room links`。
- 是否重启当前公网服务属于部署动作，需单独确认。
