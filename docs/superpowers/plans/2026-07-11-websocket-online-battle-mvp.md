# WebSocket 真人联机对战 MVP 实施计划

## 实施原则

- 保留现有单机路径和 `BattlePhysicsSystem`。
- 网络运动状态不进入伤害裁决。
- Host 唯一调用随机回合裁决；Guest 只应用线上的结果。
- 现有脏工作区中的用户改动必须保留，提交时按文件和职责精确暂存。
- 每个阶段先完成可独立验证的最小闭环，再接入下一个阶段。

## 阶段 1：协议模型与运行时校验

### 文件

- 新增 `src/network/protocol.ts`

### 工作

1. 定义 `PROTOCOL_VERSION = 1`、`OnlineRole`、`ConnectionState`。
2. 定义在线配装 DTO，只包含 `BuildSelection`、系统升级和部件升级。
3. 定义 `STATE`、匹配、Ready、回合、暴击、占位换人、超时、断线和错误消息联合类型。
4. 为浏览器入站消息提供轻量校验：对象、版本、类型、字符串、整数和有限数值。
5. 提供角色映射辅助函数，协议层只暴露 `host/guest`。
6. 将运动状态范围限制和消息大小限制常量集中在协议模块中。

### 验证

- TypeScript 构建通过。
- 合法消息能缩窄为具体联合类型，非法消息返回明确错误而不抛出。

## 阶段 2：轻量匹配与转发服务器

### 文件

- 新增 `server/match-server.mjs`
- 新增 `scripts/test-match-server.mjs`
- 修改 `package.json`
- 修改 `package-lock.json`

### 工作

1. 安装运行时依赖 `ws`。
2. 实现客户端元数据、FIFO 等待位和房间 Map。
3. 实现 `JOIN_QUEUE`、`CANCEL_QUEUE` 和 `MATCHED`。
4. 保存双方 Loadout，并只把对方 Loadout 发送给客户端。
5. 实现 `CLIENT_READY`、10 秒 Ready 超时、`ALL_READY`。
6. 仅允许 Host 发送 `MATCH_START` 和 `TURN_RESOLVED`。
7. 实现首回合开启、`TURN_OPEN`、每回合单次动作、`TURN_ACTION_SET` 和 15 秒超时判负。
8. 原样转发房间内 `STATE`、`CRIT_TRIGGERED` 和 `SUBSTITUTE_HERO`。
9. 实现消息大小、协议版本、房间成员和发送角色检查。
10. 实现 2 秒 Ping、5 秒失活终止以及统一房间清理。
11. 增加 `npm run server` 和 `npm run test:server`。

### 验证

- 两个脚本客户端可匹配并获得 Host/Guest。
- Ready 收齐后 Host 收到 `ALL_READY`。
- 动作收齐后仅 Host 收到一份 `TURN_ACTION_SET`。
- Ready 超时、回合超时和断线均清理房间。
- 非 Host 权威消息被拒绝。

## 阶段 3：浏览器 NetworkClient

### 文件

- 新增 `src/network/networkClient.ts`

### 工作

1. 封装连接状态、Socket 生命周期和环境变量 URL。
2. 提供 `joinQueue(loadout)`、`cancelQueue()`、`sendReady()`、`sendMatchStart()`、`sendTurnAction()`、`openTurn()`、`sendTurnResolved()` 和表现事件方法。
3. 使用类型化事件监听接口把入站消息交给 `Game`。
4. `update(dt, stateFactory)` 使用 0.05 秒累加器发送最新状态，掉帧不补历史包。
5. 维护状态递增序号、远端最近序号和最近 64 个表现事件 ID。
6. 对解析错误和连接错误返回结构化状态，不让异常逃逸到主循环。
7. 提供 `resetSession()` 清理房间、角色、序号、计时器和回调状态。

### 验证

- 独立连接服务器可完成排队、取消和断线。
- 60 FPS 下发送频率约 20Hz，20/30 FPS 下不出现突发补包。
- 旧 `seq` 和重复 `eventId` 被丢弃。

## 阶段 4：主菜单联机入口

### 文件

- 修改 `src/ui/menus.ts`
- 修改 `src/style.css`

### 工作

1. 增加“真人联机”按钮和紧凑状态行。
2. 支持 idle、connecting、queued、matched 和错误文案。
3. 排队时再次点击按钮取消。
4. 保持现有菜单信息层级和移动端布局，不新增营销式页面或嵌套卡片。

### 验证

- 桌面和移动视口中文字不溢出、不遮挡现有按钮。
- 连接状态切换不会改变按钮尺寸导致布局跳动。

## 阶段 5：Game 联机生命周期适配

### 文件

- 修改 `src/app/game.ts`
- 必要时修改 `src/utils/events.ts`

### 工作

1. 增加 `NetworkClient`、`battleMode`、在线角色、对方配装和在线回合状态。
2. 为菜单按钮绑定排队/取消；单机入口先清理在线会话。
3. 提取战斗实体和 UI 的公共初始化，保留现有 `startBattle()` 行为。
4. 新增联机初始化：本地当前配装、远端在线配装、固定出生点、固定发射参数和自动倒计时。
5. Ready 收齐后由 Host 发送 `MATCH_START`；Guest 只消费该消息。
6. 联机模式禁用暂停、手动发射和 AI 动作选择。
7. 在主循环模拟完成后、`syncMesh()` 前加入 20Hz 本地状态钩子。
8. `applyRemoteState()` 直接覆盖 enemy 的位置、速度和 spin；Host 忽略 Guest 自报 HP，Guest 接受 Host 的权威 HP。
9. 联机结果不进入单机金币、天梯、生存或冠军奖励逻辑。

### 验证

- 单机三种模式启动和结算行为不变。
- 两页面匹配后使用双方真实车库配装创建模型和属性。
- 固定开战时间和出生参数一致。

## 阶段 6：房主回合裁决与 Guest 镜像

### 文件

- 修改 `src/app/game.ts`
- 新增或扩展 `src/network/protocol.ts` 的 DTO 适配辅助函数

### 工作

1. 从 `submitTurnAction()` 提取可复用的回合表现启动入口。
2. 单机继续映射 `playerAction + aiAction` 并走原逻辑。
3. 联机双方提交后锁定面板，只发送 `TURN_ACTION`。
4. Host 收到动作集合后固定映射 `hostAction -> playerAction`、`guestAction -> aiAction`。
5. Host 调用现有 `TurnArbitrator` 一次，生成协议 DTO 和回合后属性快照。
6. Host 和 Guest 使用相同裁决结果开始接近动画；Guest 不调用随机裁决。
7. Guest 将 Host 视角的动作、视觉、伤害目标和胜负镜像到本地 `player/enemy`。
8. 双方只在现有碰撞落点应用伤害和权威快照。
9. 回合表现结束后 Host 发送下一次 `TURN_OPEN`。
10. 处理 `TURN_TIMEOUT`，双方显示同一胜负并返回结果页。

### 验证

- Guest 主动攻击时伤害目标正确，不发生主体反转。
- 强制暴击/闪避时两端结果完全一致。
- 收到结果时不提前扣血，碰撞落点才更新血条。
- 连续多个回合的 turnId、HP、Spirit 和锁扣稳定度一致。

## 阶段 7：暴击与占位换人事件

### 文件

- 修改 `src/app/game.ts`
- 必要时扩展 `src/ui/floatingTextManager.ts`

### 工作

1. Host 在权威暴击落点发送 `CRIT_TRIGGERED`。
2. Guest 播放一次暴击飘字、能量效果和镜头震动，不再次应用伤害。
3. 在线模式把 `T` 分流到占位换人事件。
4. 实现约 0.35 秒缩小/淡出/复入、飘字和冲击波，属性保持不变。
5. 单机 `executeTagSubstitution()` 不改变。

### 验证

- 重复 eventId 不重复播放。
- 暴击只扣一次 HP。
- 占位换人前后配装、HP、Spirit 和位置保持一致。

## 阶段 8：断线、诊断与端到端验收

### 文件

- 修改 `src/app/game.ts` 的 QA diagnostics
- 必要时扩展 `scripts/test-match-server.mjs`

### 工作

1. 暴露连接状态、角色、roomId、turnId、发送/接收包计数和最后远端序号。
2. 处理 `PEER_DISCONNECTED`、`READY_TIMEOUT`、Socket 错误和服务器关闭。
3. 清理在线实体、面板锁、倒计时、事件去重和房间状态后返回菜单。
4. 使用 Playwright 双页面验证匹配、自动开战、回合、暴击、换人、超时和断线。
5. 两页面使用并排可见窗口验证 18-22Hz 状态发送和视觉表现。
6. 执行最终 `npm run test:server`、`npm run build` 和 `git diff --check`。

## 完成定义

- 设计文档中的端到端闭环全部可在本机两个可见页面复现。
- Host 是唯一随机战斗裁决者，两端权威属性一致。
- 远端运动按 20Hz 状态直接覆盖，不含预测、插值或服务端物理。
- Ready 超时、回合超时、普通关闭和失活连接均有确定清理路径。
- 单机模式无行为回归。
- 构建、服务器烟测和浏览器双页面验收通过。
