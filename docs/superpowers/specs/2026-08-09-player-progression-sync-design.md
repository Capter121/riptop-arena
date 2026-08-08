# 邀请玩家进度与金币同步设计

日期：2026-08-09
状态：设计已批准，待用户复核书面规格
对应总规格：`docs/superpowers/specs/2026-08-01-nss-arena-complete-expansion-design.md`
对应总计划：`docs/superpowers/plans/2026-08-01-nss-arena-complete-expansion-implementation.md` 任务 4.5

## 1. 目标

把现有浏览器本地进度安全地迁移到邀请身份对应的 SQLite 记录，并继续允许玩家在断网时获得或花费金币。恢复连接后，客户端通过幂等金币事件和一个原子同步接口与服务器收敛，战斗模式、属性规则、零件数值和奖励算法保持不变。

成功标准：

- 首次认证后只导入一次当前本地金币和进度。
- 重复请求、超时重试或“服务端成功但客户端保存失败”不会重复加减金币。
- 解锁、永久升级和历史成绩不会因同步倒退。
- 当前锦标赛进度、传统三层配装和 NSS 五层配装以当前浏览器为准。
- 离线获得和消费金币仍可用；恢复连接后余额收敛到服务端权威值。
- 任意扣款导致服务端余额小于零时，整次同步回滚，不产生免费升级或部分写入。
- 邀请身份、Arena 战斗操作、属性克制和现有本地存档格式继续可用。

## 2. 已验证的当前状态

核对日期：2026-08-09。

| 组件 | 当前行为 | 本任务缺口 |
|---|---|---|
| `src/app/progression.ts:6-23` | `riptop-progression-v1` 保存解锁、关卡、金币、配装和升级 | 没有玩家归属、同步元数据或金币事件日志 |
| `src/app/progression.ts:116-163` | 加载时迁移并清洗本地存档，保存时直接覆盖 localStorage | 无法区分首次导入、普通保存和服务端回写 |
| `src/app/progression.ts:188-193` | 金币奖励和消费只修改本地余额 | 服务端无法幂等重放离线变化 |
| `src/auth/localIdentity.ts:1-27` | 浏览器保存版本化玩家 ID、昵称和设备令牌 | 可作为进度记录的玩家边界，无需新增账号系统 |
| `src/auth/inviteClient.ts:55-87` | 已有邀请兑换和 `/api/me` 客户端 | 尚无认证进度同步客户端 |
| `src/ui/portal.ts:59-88` | 门户读取本地金币和当前配装 | 认证后尚未先同步权威进度，也无待同步提示 |
| `src/ui/portal.ts:153-174` | 刷新时用 `/api/me` 恢复身份 | 身份恢复成功后没有同步步骤 |
| `server/http-server.mjs:8` | JSON Body 上限为 64 KiB | 新接口必须沿用该上限 |
| `server/http-server.mjs:134-145` | 已有邀请兑换与认证玩家接口 | 尚无 `/api/progression/sync` |
| `server/auth/auth-middleware.mjs:3-10` | Bearer Token 与 `X-Player-Id` 联合认证 | 新接口直接复用，不建立第二套认证 |
| `server/storage/migrate.mjs:39-50` | 迁移按数字版本仅执行一次 | 已执行的迁移不可在未来通过改文件“补完” |
| `server/storage/migrations/001_identity.sql` | 已有 `players` 外键目标 | 进度表应按玩家级联删除 |
| `server/storage/migrations/002_builds_and_challenges.sql` | 已有 JSON 有效性约束的表设计 | 新表沿用 SQLite CHECK 与 JSON 约束风格 |

## 3. 范围与不变量

### 3.1 本任务包含

- 玩家级进度快照和金币余额表。
- 玩家级幂等金币事件表。
- 一个认证、事务化的进度同步接口。
- 首次本地金币迁移。
- 断网金币事件记录和恢复连接同步。
- 门户认证成功后的同步编排及同步状态提示。
- 数据库、服务、客户端和端到端测试。

### 3.2 明确不做

- 不修改战斗模式、伤害、属性克制、共鸣、物理或 AI。
- 不修改奖励金额、商店价格或升级价格。
- 不增加注册、密码、邮箱、跨设备登录或身份找回。
- 不实现完整反作弊，也不回放离线战斗验证金币来源。
- 不在 Arena 内轮询同步；只在保存时记录本地事件，在门户认证或返回门户时联网同步。
- 不实现战役星级、排行榜、成绩表或首次战役奖励。
- 不预建未来表，不修改已经执行过的迁移。

### 3.3 迁移命名修正

总计划原先把 Task 4.5 和未来 Task 6.2 都指向 `003_campaign_and_scores.sql`。由于 `schema_migrations` 按版本只执行一次，本规格以已批准的方案 A 覆盖该旧名称：

- Task 4.5 新增 `server/storage/migrations/003_player_progression.sql`。
- 后续战役、成绩功能必须使用当时尚未占用的新迁移版本，不得修改已部署的 `003`。

## 4. 总体架构

采用一个认证接口：

```text
本地 progression save
  + 每玩家同步元数据
  + 待同步金币事件
          |
          v
POST /api/progression/sync
          |
          v
SQLite 单事务
  首次金币导入 -> 幂等事件 -> 快照合并 -> revision
          |
          v
权威 progression + 已确认 event IDs
          |
          v
客户端删除已确认事件并写回权威本地状态
```

只提供一个同步接口，避免快照和金币分别成功造成跨接口不一致。不引入事件溯源框架、后台队列或通用同步引擎。

## 5. 数据模型

### 5.1 SQLite 迁移

`server/storage/migrations/003_player_progression.sql` 的目标结构为：

```sql
CREATE TABLE player_progression (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  initial_coins_imported INTEGER NOT NULL DEFAULT 0
    CHECK (initial_coins_imported IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE wallet_events (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL CHECK (length(event_id) = 36),
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'debit')),
  delta INTEGER NOT NULL CHECK (
    delta != 0
    AND abs(delta) <= 10000
    AND ((kind = 'credit' AND delta > 0) OR (kind = 'debit' AND delta < 0))
  ),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (player_id, event_id)
);
```

不增加 `wallet_events.player_id` 的单列索引：复合主键已经覆盖按玩家和事件 ID 查重，本任务没有按玩家扫描完整流水的 UI 或 API。

### 5.2 服务端快照

`snapshot_json` 不保存金币，也不保存运行时 `Set`。其规范化结构为：

```ts
interface ProgressionSnapshotV1 {
  saveSchemaVersion: 2;
  unlockedParts: string[];
  ladderIndex: number;
  bestLadder: number;
  championshipCount: number;
  build: {
    attackRing: string;
    core: string;
    driver: string;
  };
  upgrades: {
    attack: number;
    defense: number;
    stamina: number;
  };
  partUpgrades: Record<string, number>;
  latestNssLoadout: NssBattleLoadoutV2 | null;
}
```

规范化要求：

- `unlockedParts` 去重并按字符串升序保存，使相同语义产生相同 JSON。
- 传统零件只接受当前 9 个 ID：`slash`、`round`、`bulwark`、`light`、`balanced`、`heavy`、`rush`、`grip`、`drift`。
- `build` 的三个槽位必须引用各自槽位中的合法零件。
- `upgrades` 只含 `attack`、`defense`、`stamina`，每项为 `0..5` 整数。
- `partUpgrades` 只含当前合法传统零件 ID，每项为 `0..4` 整数；缺失项规范化为 `0`。
- `latestNssLoadout` 为 `null` 或严格 V2：`schemaVersion: 2`、`interfaceId: "NSS-V1"`，恰好包含五个家族零件和五个属性。
- NSS 零件 ID 和家族从 `battle-top-designer/shared/nss/parts.catalog.json` 读取；属性只接受 `WIND`、`FIRE`、`WATER`、`WOOD`、`EARTH`、`LIGHT`、`DARK`。
- 所有对象拒绝额外键，所有计数为非负安全整数。
- `ladderIndex`、`bestLadder` 上限使用当前 `ENEMIES.length`；`championshipCount` 上限为 `1_000_000`，用于阻止异常载荷而不改变正常玩法。

服务端可以读取共享 JSON 目录，但不得复制 NSS 16 件零件清单。传统 9 件零件与 `0..5`、`0..4` 上限暂由服务端定义为对应当前版本的校验常量；契约测试必须与 `src/app/progression.ts:35-47` 保持一致。

## 6. 合并规则

| 字段 | 规则 | 原因 |
|---|---|---|
| `unlockedParts` | 服务端与本地取并集 | 永久解锁不倒退 |
| `bestLadder` | 取最大值 | 历史最佳不倒退 |
| `championshipCount` | 取最大值 | 已获得冠军次数不倒退，也不重复相加 |
| `upgrades.*` | 每项取最大值 | 永久整机强化不倒退 |
| `partUpgrades.*` | 每件每级取最大值 | 永久零件强化不倒退 |
| `ladderIndex` | 本地值覆盖 | `resetRun()` 合法地把进度重置为 0，不能取最大值 |
| `build` | 本地值覆盖 | 当前浏览器的装配选择优先 |
| `latestNssLoadout` | 本地值覆盖，包括 `null` | 当前浏览器的五层配装选择优先 |
| `coins` | 仅首次导入加金币事件 | 禁止快照重复累加余额 |

服务器返回的是合并后的完整权威状态。客户端不得在收到响应后再次本地合并金币。

## 7. 客户端同步状态

每个玩家使用独立 localStorage Key：

```text
nss.progressionSync.v1.<playerId>
```

值结构：

```ts
interface LocalProgressionSyncStateV1 {
  version: 1;
  playerId: string;
  initialCoins: number;
  migrationComplete: boolean;
  lastObservedCoins: number;
  pendingWalletEvents: WalletEventV1[];
}

interface WalletEventV1 {
  eventId: string;
  kind: 'credit' | 'debit';
  delta: number;
  source: 'local_progression';
  createdAt: string;
}
```

规则：

1. 没有本地身份时，`saveProgression()` 继续保存现有存档，但不创建同步状态或金币事件。
2. 身份首次可用并准备同步时，冻结当前 `coins` 为 `initialCoins`，同时把它记为 `lastObservedCoins`；此时不生成金币事件。
3. 同步状态存在且玩家 ID 与当前身份一致时，`saveProgression()` 比较新余额与 `lastObservedCoins`：
   - 增加生成一个 `credit` UUID 事件。
   - 减少生成一个 `debit` UUID 事件。
   - 未变化不生成事件。
   - 保存事件后把 `lastObservedCoins` 更新为新余额。
4. 同一浏览器换成新玩家 ID 时创建新的同步 Key；旧玩家队列不删除、不发送给新玩家。
5. 服务端回写使用明确的“不记录金币变化”保存路径，然后把 `lastObservedCoins` 设置为服务端余额，防止响应被再次记成新事件。
6. 本地队列不截断；单次请求最多提交最旧的 400 条。超过 400 条时顺序分批，每批成功后持久化该批确认 ID，最后一批成功后才把最终权威状态写回主进度存档。

事件不做净额合并，因为合并会丢失原事件 ID 和扣款顺序，破坏幂等与负余额校验。分批期间仍只允许一个同步过程；任一批失败即停止，未确认事件留待下次重试。

## 8. HTTP API

### 8.1 请求

```http
POST /api/progression/sync
Authorization: Bearer <device-token>
X-Player-Id: <player-id>
Content-Type: application/json
```

```json
{
  "schemaVersion": 1,
  "snapshot": {
    "saveSchemaVersion": 2,
    "unlockedParts": ["balanced", "grip", "round"],
    "ladderIndex": 0,
    "bestLadder": 2,
    "championshipCount": 0,
    "build": {
      "attackRing": "round",
      "core": "balanced",
      "driver": "grip"
    },
    "upgrades": {
      "attack": 1,
      "defense": 0,
      "stamina": 0
    },
    "partUpgrades": {},
    "latestNssLoadout": null
  },
  "initialCoins": 1200,
  "walletEvents": [
    {
      "eventId": "d716e26e-ec34-4e46-8814-e0180db7f653",
      "kind": "debit",
      "delta": -300,
      "source": "local_progression",
      "createdAt": "2026-08-09T09:00:00.000Z"
    }
  ]
}
```

请求约束：

- 根对象只接受 `schemaVersion`、`snapshot`、`initialCoins`、`walletEvents`。
- `schemaVersion` 必须为 `1`。
- `initialCoins` 为 `0..1_000_000_000` 的安全整数，只在玩家第一次成功同步时使用。
- `walletEvents` 为数组，最多 400 项。
- 每个事件只接受示例中的五个键。
- `eventId` 必须是 RFC 4122 UUID v4；同一请求内重复 ID 返回 `400 DUPLICATE_EVENT_ID`。
- `delta` 为非零安全整数，绝对值不超过 `10000`；符号必须与 `kind` 一致。
- `source` 只能是 `local_progression`。
- `createdAt` 必须是可解析的 ISO-8601 UTC 时间字符串，长度不超过 40；它只写入 `metadata_json`，不决定处理顺序或权限。
- 事件严格按数组顺序处理。
- 整个请求继续受 `server/http-server.mjs:8` 的 64 KiB 限制。

### 8.2 成功响应

```ts
interface ProgressionSyncResponseV1 {
  progression: {
    schemaVersion: 1;
    revision: number;
    coins: number;
    snapshot: ProgressionSnapshotV1;
  };
  acknowledgedEventIds: string[];
}
```

`acknowledgedEventIds` 必须同时包含本次新写入和数据库中已存在的请求事件。客户端只删除明确确认的 ID。

### 8.3 错误响应

| HTTP | Code | 含义 | 客户端动作 |
|---|---|---|---|
| 400 | `INVALID_PROGRESSION` | 快照、事件或边界无效 | 保留本地进度和队列，门户显示错误 |
| 400 | `DUPLICATE_EVENT_ID` | 同一请求内重复 ID | 保留本地进度和队列 |
| 400 | `TOO_MANY_WALLET_EVENTS` | 超过 400 条 | 保留本地进度和队列 |
| 401/403 | 现有认证错误码 | 身份无效或不匹配 | 清除失效身份，返回邀请入口 |
| 409 | `INSUFFICIENT_COINS` | 某扣款使余额为负 | 恢复响应中的权威进度，清空所有未确认金币事件 |
| 413 | `BODY_TOO_LARGE` | 超过 64 KiB | 保留本地状态，提示请求过大 |
| 500/503 | 现有安全错误码 | 服务或数据库异常 | 保留本地状态，稍后重试 |

`409` 响应：

```ts
interface InsufficientCoinsResponseV1 {
  error: {
    code: 'INSUFFICIENT_COINS';
    message: 'Coin balance would become negative.';
    rejectedEventId: string;
  };
  progression: ProgressionSyncResponseV1['progression'];
}
```

`rejectedEventId` 只用于定位本地冲突，不包含令牌、邀请码或内部 SQL 信息。

## 9. 服务端事务

`syncProgression(database, playerId, input)` 执行以下顺序：

1. HTTP 层先调用现有 `authenticateRequest()`；服务函数只接收认证所得 `playerId`。
2. 在事务外完成纯结构校验和请求内重复 ID 检查。
3. 执行 `BEGIN IMMEDIATE`。
4. 读取该玩家的 `player_progression`；不存在时插入默认快照、0 金币、`initial_coins_imported = 0`、`revision = 0`。
5. 若 `initial_coins_imported = 0`，把 `coins` 设置为请求的 `initialCoins`，并把标志设为 1。以后所有请求忽略 `initialCoins` 的数值。
6. 依请求数组顺序处理事件：
   - `(player_id, event_id)` 已存在：不重复计算，加入确认列表。
   - 不存在：计算预计余额；小于 0 时抛出余额冲突。
   - 通过时插入 `wallet_events`，把 `source` 和 `createdAt` 规范化存入 `metadata_json`，更新事务内余额。
7. 按第 6 节规则合并并规范化快照。
8. 若出现首次导入、新事件、余额变化或快照变化，更新 `player_progression`，`revision` 只增加 1，并刷新 `updated_at`。
9. 完全相同的重试不更新行、不增加 `revision`。
10. `COMMIT` 后返回权威状态和全部确认 ID。

任何错误都执行 `ROLLBACK`。余额冲突在回滚后重新读取当前权威记录并构造 `409`，因此响应不得包含事务内未提交的快照、余额或 revision。若首次同步的记录创建也被回滚，则以服务端默认快照、0 金币和 revision 0 构造权威响应。

新事件即使一批内净余额变化为 0，也算一次实际同步，`revision` 增加 1；相同批次重试不再增加。

## 10. 客户端时序

### 10.1 首次兑换

```text
POST /api/invites/redeem 成功
  -> 保存 LocalIdentity
  -> 建立该 playerId 的同步状态并冻结 initialCoins
  -> POST /api/progression/sync
      -> 成功：保存权威进度，渲染门户
      -> 网络/5xx：保留身份和本地进度，渲染“待同步”门户
      -> 401/403：清除身份，返回邀请入口
```

邀请码兑换成功后不得因进度同步网络失败而重复兑换邀请码。

### 10.2 身份恢复

```text
读取 LocalIdentity
  -> GET /api/me
      -> 200：同步进度，再渲染门户
      -> 401/403：沿用现有逻辑清除身份
      -> 网络/5xx：沿用现有离线身份页，不发同步请求
```

### 10.3 返回门户

每次门户入口初始化都执行同一流程。单个页面生命周期最多允许一个进行中的同步；重复触发复用当前 Promise，不并发提交相同队列。Arena 不轮询、不自动发网络请求。

### 10.4 成功后的本地提交顺序

1. 根据响应构造完整 `ProgressionState`。
2. 以“不记录金币事件”模式写入 `riptop-progression-v1`。
3. 从当前同步队列中只移除 `acknowledgedEventIds`。
4. 设置 `migrationComplete = true` 和 `lastObservedCoins = response.progression.coins`。
5. 保存同步状态。

如果第 2 至第 5 步中的本地写入失败，保留内存中的待同步事件并显示错误。页面刷新后允许重发；服务端依靠事件主键保证不会重复计费。不得先清空队列再尝试保存权威存档。

## 11. 冲突与降级行为

- 网络失败或 5xx：本地游戏继续可用，事件保留，门户显示“进度待同步”。
- 401/403：清除身份；不自动删除本地游戏存档或旧玩家同步 Key。
- 非法事件 400：保留队列并显示服务端错误码，不自动丢弃可能需要诊断的数据。
- 余额不足 409：丢弃当前玩家全部未确认金币事件，使用响应中的权威金币和快照覆盖本地，避免保留未支付升级。
- localStorage 被禁用：沿用邀请入口的现有阻断；已在内存中的身份或响应不得打印到控制台。
- 队列超过 400 条：按最旧事件优先顺序分批；中间批次可以携带同一个本地快照，但客户端只在最后一批成功后应用最终权威响应。若中途断网，已确认批次不会重算，剩余批次下次继续。
- 单批请求过大：保留本地状态并显示请求过大；本任务不增加按字节动态切片协议。

## 12. 文件职责与最小修改范围

| 文件 | 修改 |
|---|---|
| `server/storage/migrations/003_player_progression.sql` | 新增两张表和约束 |
| `server/progression/progression-service.mjs` | 新增校验、规范化、合并和原子事务 |
| `server/http-server.mjs` | 新增认证同步路由和带权威状态的 409 响应 |
| `src/progression/progressionClient.ts` | 新增每玩家同步状态、金币日志、API 客户端和单飞同步 |
| `src/app/progression.ts` | 在现有保存路径接入金币差值记录，并提供不记录事件的服务端回写路径 |
| `src/ui/portal.ts` | 在邀请兑换和 `/api/me` 成功后编排同步，显示已同步、待同步或冲突状态 |
| `scripts/test-progression.mjs` | 新增数据库服务与 HTTP 契约测试 |
| `scripts/test-database.mjs` | 更新迁移版本和表清单断言 |
| `package.json` | 把进度服务测试接入 `test:server`，可增加独立 `test:progression` 命令 |
| `tests/unit/progression-client.test.ts` | 新增本地日志、确认和重试测试 |
| `tests/e2e/portal.spec.ts` | 增加首次迁移、待同步和权威回写流程 |

不得修改 `src/app/game.ts` 中战斗、商店或奖励调用点。所有现有 `saveProgression()` 调用通过统一保存路径自动获得金币日志能力，避免在多个奖励/消费位置重复接线。

## 13. 测试计划

### 13.1 数据库与服务测试，至少 12 个断言场景

1. 迁移 `003` 后每个玩家最多一条进度记录。
2. 首次请求导入本地金币，重复请求不再次导入。
3. 新 credit 和 debit 按顺序应用。
4. 相同事件重复提交不重复加减。
5. 两个玩家可使用相同事件 UUID，互不影响。
6. 同一请求重复 UUID 被拒绝。
7. 任意事件造成负余额时，事件、快照、余额和 revision 全部回滚。
8. 解锁集合取并集。
9. 永久升级与历史成绩取最大值。
10. `ladderIndex`、传统配装和 NSS 配装使用本地值。
11. 完全相同的同步不增加 revision。
12. 新事件净额为 0 时只增加一次 revision，重试不再增加。
13. 删除玩家时进度与钱包事件级联删除。

### 13.2 HTTP 契约测试，至少 8 个场景

1. 无身份返回 401。
2. Bearer Token 与 `X-Player-Id` 不匹配时拒绝。
3. 非 JSON、非法 JSON 和超过 64 KiB 沿用现有错误。
4. 非法 UUID、零金额、错误符号和超限金额返回 400。
5. 超过 400 个事件返回 400。
6. 成功响应返回规范化权威快照和完整确认 ID。
7. 余额冲突返回 409、被拒事件 ID 和回滚后的权威进度。
8. 响应与捕获日志不包含设备令牌或邀请码。

### 13.3 客户端单元测试，至少 10 个场景

1. 无身份保存不建立事件日志。
2. 首次同步状态冻结金币但不生成事件。
3. 金币增加生成 credit；减少生成 debit；不变不生成。
4. UUID、符号、金额和时间字段正确。
5. 不同玩家使用不同同步 Key，队列不串号。
6. 网络失败保留全部事件。
7. 成功响应只删除被确认事件。
8. 服务端成功但本地保存失败后重试不会导致服务端重复计费。
9. 服务端回写不产生空事件或反向事件。
10. 409 清空未确认事件并恢复权威状态。
11. 同一页面的并发调用复用一个同步 Promise。

### 13.4 Playwright，至少 3 条用户流程

1. `?invite=` 兑换身份后首次上传已有本地存档，门户显示服务端返回金币和配装。
2. 已认证玩家刷新时先 `/api/me` 再同步；重复刷新不产生双倍金币。
3. 同步网络失败时保留身份和本地进度，门户显示待同步；重试成功后恢复已同步状态。

### 13.5 回归验证

- 根项目 `test:unit` 全部通过。
- 定制器现有单元测试全部通过。
- `test:server`、`test:nss-contract` 全部通过。
- Playwright 全部通过。
- 统一站点 build 和 verify 通过。
- Arena 可以正常启动，战斗操作和奖励数值不变。

## 14. 验收条件

1. `003_player_progression.sql` 在空数据库只执行一次，二次迁移返回无新版本。
2. 首次同步将本地金币导入一次；相同请求执行两次后的余额与执行一次相同。
3. 服务端已有解锁和本地解锁的并集完整，永久升级和历史成绩不下降。
4. 本地 `ladderIndex = 0` 能覆盖服务端更高的当前关卡，同时不降低 `bestLadder`。
5. 离线 credit/debit 恢复连接后按提交顺序只应用一次。
6. 任意 debit 造成负余额时返回 409，数据库没有该批次的部分写入。
7. 客户端收到 409 后不保留未付款升级对应的本地快照或金币事件。
8. 服务端确认后客户端只删除已确认事件；未确认事件仍可重试。
9. 服务端响应回写本地时不生成新的金币事件。
10. 门户在成功同步、待同步和身份失效三种状态下行为确定且可重试。
11. 设备令牌和邀请码不出现在 API 错误、DOM、URL、控制台或测试快照中。
12. 现有战斗模式、属性系统、配装数值、奖励金额和商店价格没有改动。

## 15. 实施顺序

```text
数据库迁移与约束
        -> 服务端纯校验/合并函数
        -> 原子事务与 HTTP 契约
        -> 客户端同步状态与金币日志
        -> 门户同步编排
        -> E2E 与全量回归
```

排序原因：先用数据库和服务测试锁定权威规则，再让客户端接入；否则客户端可能围绕尚未固定的冲突语义实现两次。门户最后接线，使邀请和 `/api/me` 的现有行为在底层通过前保持不变。

每一步必须先通过对应测试，才能进入下一步。

## 16. 回滚

- 代码回滚：撤销同步路由、客户端同步和门户编排后，现有 `riptop-progression-v1` 仍可继续作为纯本地存档使用。
- 数据回滚：不删除已经部署的 `player_progression` 或 `wallet_events` 表。停用新路由即可；保留表可避免丢失朋友进度。
- 迁移回滚：不重写或降低 `schema_migrations`。如表结构需要修正，新增后续迁移。
- 客户端回滚：同步元数据使用独立 Key，不改变现有进度 Key；旧版本会忽略它。

## 17. 风险与已接受限制

1. 这是朋友服信任模型。服务端阻止重复事件、异常字段和负余额，但不证明离线奖励来自真实战斗。
2. 当前身份是浏览器本地身份，不支持同一玩家跨浏览器合并；换新玩家 ID 会建立新同步记录。
3. 409 会放弃该玩家所有尚未确认的本地金币操作和关联本地进度，这是保证“不免费升级”的简单确定性规则。
4. 单批 400 条和 64 KiB 限制足够当前朋友局规模；超过 400 条只做顺序事件分批，不增加通用批量协议。
5. 服务端和客户端分别运行 JavaScript/TypeScript，传统零件与升级上限存在少量校验常量重复；契约测试负责防止漂移，NSS 零件目录继续读取共享 JSON。

## 18. 完成定义

- 本规格的 12 条验收条件全部有自动化证据。
- 所有新增数据库写入都在明确事务内，并通过回滚测试。
- 所有金币事件都具有玩家级幂等键。
- 所有现有测试、构建和统一站点验证通过。
- 实现 diff 仅包含第 12 节列出的必要文件，没有顺带修改战斗或视觉系统。
