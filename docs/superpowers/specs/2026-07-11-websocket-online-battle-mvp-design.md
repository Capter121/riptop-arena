# WebSocket 真人联机对战 MVP 设计

## 1. 目标

在不重写现有物理引擎、不加入预测或插值算法的前提下，为当前单机陀螺对战增加可在本机两个浏览器标签页中跑通的真人联机体验。

首版采用混合权威模型：

- 每个客户端权威同步自己陀螺的运动状态。
- 房主统一裁决回合、伤害、暴击、闪避、灵力和胜负。
- Node.js WebSocket 服务器负责匹配、房间、回合提交和超时，不运行游戏物理。

目标是快速验证匹配、自动开战、20Hz 状态同步、双人回合选择、暴击事件、占位换人事件、超时与断线流程。

## 2. MVP 范围

### 2.1 包含

- 主菜单“真人联机”入口、排队与取消匹配。
- 本机 `ws://127.0.0.1:8080` 双标签页匹配。
- FIFO 双人房间，分配 Host 和 Guest。
- 双方当前车库配装与升级数据交换。
- 匹配成功后固定出生点、固定发射参数和统一倒计时自动开战。
- 本地陀螺 20Hz 运动状态发送，远端陀螺收到后直接覆盖。
- 双方提交回合动作，房主使用现有 `TurnArbitrator` 统一裁决。
- 房主广播权威伤害结果、属性快照、暴击和胜负。
- `CRIT_TRIGGERED` 即时事件与远端暴击表现。
- `SUBSTITUTE_HERO` 占位事件及退场再入场表现。
- 15 秒回合超时判负。
- 对手断线后立即结束本局并返回菜单。
- 原单机快速战斗、锦标赛和生存模式继续可用。

### 2.2 不包含

- 公网部署、TLS、账号系统、观战、聊天或排行榜。
- 服务端物理、反作弊、客户端预测、快照插值或回滚。
- 断线重连、房间恢复、局内再战或联机战绩保存。
- 真正的双陀螺队伍和队员属性切换。
- 二进制协议或状态压缩。

`SUBSTITUTE_HERO` 在本 MVP 中只是协议和视觉占位：触发后陀螺缩小淡出，约 0.35 秒后从原位置重新出现，并播放飘字和冲击波；HP、配装和属性不变。

## 3. 架构与权威边界

### 3.1 新增模块

#### `src/network/protocol.ts`

定义协议版本、消息联合类型、角色类型、在线配装 DTO、运动快照 DTO，以及客户端需要的轻量运行时校验函数。协议中的玩家身份使用 `host` 和 `guest`，不直接使用本地 `player` 和 `enemy`。

#### `src/network/networkClient.ts`

负责 WebSocket 生命周期、排队、发送限频、消息解析、序号与事件去重、连接状态和类型化回调。它不引用 Three.js，也不直接修改 `TopEntity`。

#### `server/match-server.mjs`

使用 `ws` 管理等待队列、双人房间、成员角色、配装握手、当前回合、动作集合和 15 秒计时器。除协议控制消息外，状态和表现事件原样转发。

### 3.2 权威职责

| 数据 | 权威方 | 规则 |
| --- | --- | --- |
| 本地位置、速度、转速 | 各自客户端 | 20Hz 发送，对端直接覆盖远端陀螺 |
| HP、灵力、锁扣稳定度 | Host | Guest 不自行裁决，不用自报 HP 覆盖 Host 状态 |
| 回合动作 | 各自客户端 | 每回合只允许提交一次，由服务器收集 |
| 伤害、暴击、闪避、胜负 | Host | 只调用一次现有随机裁决逻辑 |
| 匹配、成员关系、回合超时 | 服务器 | 客户端不能自行宣告超时结果 |
| 占位换人事件 | 事件发起方 | 只触发表现，不改变战斗属性 |

双方客户端都继续把自己的陀螺映射为 `player`，把对方映射为 `enemy`。Host 裁决结果在 Guest 上通过角色适配器镜像，禁止把 Host 内部的 `player/enemy` 语义直接泄漏到线上协议。

## 4. 消息协议

所有消息使用 JSON。房间内消息包含 `v: 1`、`type` 和 `roomId`。服务器拒绝超过 16KB 的消息。

### 4.1 匹配与生命周期

| 消息 | 方向 | 主要字段 | 用途 |
| --- | --- | --- | --- |
| `JOIN_QUEUE` | C -> S | `loadout`, `displayName` | 进入等待队列 |
| `CANCEL_QUEUE` | C -> S | 无 | 取消排队 |
| `MATCHED` | S -> C | `roomId`, `peerId`, `role`, `opponentLoadout` | 分配房间和角色 |
| `CLIENT_READY` | C -> S | `roomId` | 模型和场景已准备 |
| `ALL_READY` | S -> Host | `roomId` | 通知 Host 可发起开战 |
| `MATCH_START` | Host -> S -> Guest | `startAt`, `launchConfig` | 统一出生点、发射参数和倒计时 |
| `PEER_DISCONNECTED` | S -> C | `reason` | 对手离开，立即结束本局 |
| `ERROR` | S -> C | `code`, `message` | 可恢复或不可恢复的协议错误 |

在线配装只提交当前 `BuildSelection`、系统升级和部件升级数据。Host 使用现有 `buildStats()` 重建双方属性；协议不接受客户端直接提交最终 HP、护甲或暴击率。

### 4.2 运动状态

`STATE` 字段为：

```text
seq, x, z, vx, vz, spin, hp, alive
```

- `seq` 为每个发送方单调递增整数，接收方丢弃不大于最近序号的包。
- 项目内部平面坐标是 `x/z`，对应 `TopEntity.position.x/y`。
- `hp` 保留在包中用于诊断，并允许 Guest 用 Host 的 HP 更新远端血条。
- Host 收到 Guest 状态时忽略其中的 `hp` 和 `alive`，因为 Guest 自身 HP 由 Host 的权威回合快照决定。
- 收到状态后直接覆盖 `enemy.position`、`enemy.velocity` 和 `enemy.spin`，不做插值、预测或回滚。

### 4.3 回合与表现事件

| 消息 | 方向 | 主要字段 | 用途 |
| --- | --- | --- | --- |
| `TURN_OPEN` | Host -> S -> Both | `turnId` | 请求并广播新回合及服务器截止时间 |
| `TURN_ACTION` | C -> S | `turnId`, `action` | 提交本回合动作 |
| `TURN_ACTION_SET` | S -> Host | `turnId`, `hostAction`, `guestAction` | 收齐后交给 Host 裁决 |
| `TURN_RESOLVED` | Host -> S -> Guest | `turnId`, `resolution`, `snapshot` | 权威结果和双方最终属性快照 |
| `CRIT_TRIGGERED` | Host -> S -> Guest | `eventId`, `turnId`, `attacker`, `target`, `damage`, `position` | 播放远端暴击表现，不重复扣血 |
| `SUBSTITUTE_HERO` | C -> S -> Peer | `eventId`, `actor`, `position` | 播放占位换人表现 |
| `TURN_TIMEOUT` | S -> Both | `turnId`, `loser`, `winner` | 15 秒未提交直接判负 |

服务器在 `TURN_OPEN` 后启动 15 秒计时器。每位玩家每回合只能提交一次动作。收齐双方动作后清除计时器并只向 Host 发送 `TURN_ACTION_SET`。Host 裁决后广播结果；当前回合表现完成并进入新的 `awaiting` 状态时，再开启下一回合。

Host 收到 `TURN_ACTION_SET` 后立即调用裁决器，并根据当前属性和 `damageResults` 计算不含随机过程的“回合后权威快照”。`TURN_RESOLVED` 在接近动画开始前发送，使两端能使用同一结果驱动表现；两端只在现有碰撞落点应用伤害和该快照，不在收到消息时提前改变血条。Guest 不重新调用裁决器。

## 5. 前端插桩设计

所有加入现有单机代码的插桩使用以下统一注释：

```ts
// [ONLINE HOOK] 描述该处网络职责。
```

### 5.1 `src/ui/menus.ts`

- 增加 `online` 按钮和一行连接状态。
- 按钮文案依次为“真人联机”“匹配中...（点击取消）”“对手已找到”。
- 不创建独立联机页面。

### 5.2 `src/app/game.ts` 构造与生命周期

- 增加 `NetworkClient` 实例和 `battleMode: 'single' | 'online'`。
- 注册匹配、开战、状态、动作集合、回合结果、暴击、换人、超时和断线回调。
- 单机入口显式取消排队并清理在线会话。
- 提取小型公共战斗初始化方法，供单机和联机复用，避免复制整个 `startBattle()`。
- 联机战斗不随机选择 AI，也不发放金币、天梯、生存或冠军奖励。
- 联机暂停键禁用。

### 5.3 `submitTurnAction()`

在线模式下，本地验证动作可支付后发送 `TURN_ACTION` 并锁定面板，不调用 `pickAiTurnAction()`。Host 收到 `TURN_ACTION_SET` 后调用现有 `TurnArbitrator.executeTurnResolution()`；Guest 只消费 Host 返回的结果。

当前 `submitTurnAction()` 内部开始表现的 `proceed()` 逻辑提取为一个接收双方动作或已裁决结果的私有入口。单机继续走 AI 动作，联机 Host 走双人动作，Guest 走远端结果，三条路径复用同一套接近、碰撞和回合表现。

### 5.4 `update(dt)` 高频状态钩子

本地模拟和属性更新完成后、`syncMesh()` 前调用网络更新：

```ts
// [ONLINE HOOK] 固定 20Hz 发送本地运动快照。
this.network.update(dt, this.createLocalState());
```

`NetworkClient` 使用时间累加器，每累计 0.05 秒发送一个最新快照。掉帧时最多发送一个最新包，不补发积压历史包。仅在连接已匹配、联机战斗已开始、页面未结束时发送。

### 5.5 状态接收器

`socket.onmessage` 只做解析、校验和分发。`Game.applyRemoteState()` 负责映射：

```text
enemy.position <- x/z
enemy.velocity <- vx/vz
enemy.spin <- spin
enemy.integrity <- 仅接受 Host 权威来源
```

坐标、速度、spin 和 HP 必须是有限数值，并限制在合理范围内。异步消息不会修改物理系统内部集合，也不会在 `BattlePhysicsSystem` 中加入网络分支。

### 5.6 暴击与占位换人

- Host 在权威伤害落地时发送 `CRIT_TRIGGERED`。
- Guest 的处理器只播放一次 CRIT 飘字、能量效果和镜头震动，不能再次扣血。
- 最近 64 个 `eventId` 用于去重。
- 在线模式下 `T` 键调用占位换人表现并发送 `SUBSTITUTE_HERO`。
- 单机模式继续调用现有 `executeTagSubstitution()`。

## 6. 自动开战流程

1. 两端进入队列，服务器创建房间并发送 `MATCHED`。
2. 两端用对方配装构建 `enemy`，完成后发送 `CLIENT_READY`。
3. 两端均准备好后，服务器向 Host 发送 `ALL_READY`。
4. Host 发送包含统一 `startAt` 和固定参数的 `MATCH_START`。本机 MVP 使用 `Date.now() + 固定倒计时毫秒数` 作为绝对时间戳。
5. 两端设置相同出生点，按 `startAt` 执行倒计时并自动发射。
6. 服务器在 `startAt` 到达后开启 `turnId = 1` 并启动 15 秒计时器，双方进入可提交状态；开场倒计时不占用回合操作时间。

首版不同步现有手动蓄力与发射角度操作。

## 7. 服务器行为

服务器维护：

```text
waitingPlayer
clients: Map<WebSocket, ClientMeta>
rooms: Map<roomId, Room>
```

`Room` 保存 Host、Guest、双方配装、准备状态、当前 `turnId`、动作集合和超时计时器。匹配按 FIFO 进行。状态和表现事件只转发给同一房间的另一方；房主结果只能由该房间 Host 发送。

连接关闭时：

- 排队玩家从队列移除。
- 房间玩家触发 `PEER_DISCONNECTED`。
- 清除回合计时器并删除房间。
- 留下的一方清理网络战斗状态、显示提示并返回主菜单。

## 8. 错误处理与限制

- WebSocket URL 默认 `ws://127.0.0.1:8080`，允许通过 Vite 环境变量覆盖。
- 连接状态为 `idle`、`connecting`、`queued`、`matched`、`in_battle`、`closed`。
- JSON 解析失败、版本错误、消息过大、错误房间、错误发送角色或错误回合返回 `ERROR`。
- 网络错误不会回退为 AI 接管，也不会尝试自动重连。
- 后台标签页节流可能降低状态包频率；MVP 接受由此产生的瞬移。
- Host 断线立即结束比赛，不迁移 Host。
- 本机 MVP 不处理恶意客户端伪造运动和配装数据，但不允许 Guest 提交最终战斗属性或裁决结果。

## 9. 依赖与运行方式

安装 `ws`，并在 `package.json` 增加：

```json
"server": "node server/match-server.mjs"
```

开发时分别运行：

```powershell
npm run server
npm run dev
```

## 10. 验证计划

### 10.1 协议与服务器测试

- 使用两个 `ws` 测试客户端验证 FIFO 匹配、角色分配和房间隔离。
- 验证非法 JSON、错误版本、超大消息和跨房间消息被拒绝。
- 验证每回合重复提交被拒绝。
- 验证收齐动作后只向 Host 发送一次 `TURN_ACTION_SET`。
- 验证 15 秒未提交时双方收到同一 `TURN_TIMEOUT`。
- 验证关闭任一连接后房间和计时器被清理。

### 10.2 浏览器端到端测试

- 用 Playwright 打开两个页面，点击“真人联机”，确认自动匹配、不同角色和统一开战。
- 统计战斗期间状态发送频率，正常前台运行时应约为每秒 18 至 22 个包。
- 确认收到状态后远端位置、速度和转速直接更新。
- 双方分别提交动作，确认收齐前不裁决，且只有 Host 产生随机伤害结果。
- 每回合结束后比较双方 HP、灵力、锁扣稳定度、回合编号和胜负。
- 强制暴击，确认只扣一次血且 Guest 只播放一次暴击特效。
- 按 `T`，确认对端播放约 0.35 秒的退场再入场效果，属性不变。
- 保持一方不操作，确认 15 秒后判负。
- 关闭一侧页面，确认另一侧提示断线并返回菜单。
- 回归单机快速战斗、锦标赛和生存模式。

### 10.3 构建验收

- `npm run build` 必须通过。
- 浏览器控制台无未处理异常。
- 现有物理公式和 `BattlePhysicsSystem` 不包含网络逻辑。

## 11. 成功标准

在本机启动一个 Vite 前端和一个 Node WebSocket 服务后，两个标签页可以完成从匹配、自动开战、回合选择、状态同步、伤害与暴击一致、占位换人、超时或断线，到结果返回菜单的完整闭环。联机实现不依赖预测、插值或服务端物理，并且不破坏现有单机模式。
