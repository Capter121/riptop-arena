# NSS Arena 阶段 5B：异步好友装配幽灵挑战实施计划

日期：2026-08-10

关联规格：`docs/superpowers/specs/2026-08-10-async-friend-ghost-challenges-design.md`

## 1. 需求理解

在现有邀请码身份、服务端 progression 同步、NSS 五件装配和阶段 5A 确定性战斗基础之上，实现邀请链接认领式的异步好友装配幽灵挑战。

创建者分享挑战邀请。另一名已认证玩家主动认领后，使用认领时冻结的自身装配，对战由确定性 AI 控制的创建者装配幽灵。每条正式挑战只保存一个最终结果；浏览器断网、刷新或响应丢失后可以幂等重试。已完成挑战可以创建角色互换的定向回挑战。

本阶段是业务流程和战斗编排扩展，不是战斗规则重做。

## 2. 修改目标

1. 新增不可变邀请和正式挑战持久化契约。
2. 新增创建、查看、认领、撤销、列表、详情、结算和回挑战 API。
3. 新增挑战中心、邀请页和门户待处理角标。
4. 新增定制器调整装配后返回挑战的 V2 装配传递流程。
5. 新增 Arena `challenge` 模式，加载双方快照并复用现有确定性战斗。
6. 新增先本地保存、后联网提交的离线结果恢复。
7. 验证数据库升级、备份恢复、双浏览器流程和全部既有回归。

## 3. 成功标准

- 未认领邀请在服务端创建后 24 小时内可认领，边界时刻起过期。
- 打开链接不绑定；第一名点击认领的其他玩家成功，其他并发请求失败。
- 公平模式清零有效永久升级；全力模式在创建和认领两个时点分别冻结双方升级。
- Arena 的玩家是应战者，AI 敌人是创建者装配幽灵，种子和竞技场来自服务端快照。
- 挑战战斗不更新金币、解锁、关卡、冠军次数或任何 progression 成长。
- 第一份合法结果完成挑战；相同提交可重复，任何其他结果都不能覆盖。
- 请求成功但响应丢失时，刷新后可从本地待提交记录恢复并得到原结果。
- “等待我”“等待朋友”“历史战报”分组、游标分页和待处理角标正确。
- 回挑战角色互换、目标固定、种子更新、父链正确，并且同一来源幂等。
- 当前单人战斗、在线模式、属性、装配、确定性回放、构建和备份恢复全部通过。

## 4. 已验证的当前状态

验证日期：2026-08-10。

| 能力 | 当前实现 | 本阶段缺口 |
| --- | --- | --- |
| 本地身份 | `src/auth/localIdentity.ts` | 无；直接复用 |
| 服务端认证 | `server/auth/auth-middleware.mjs` | 无；所有挑战 API 复用 |
| progression 同步 | `src/progression/progressionClient.ts`、`server/progression/progression-service.mjs` | 需要导出只读、规范化的服务端快照读取入口 |
| NSS 装配 | `src/nss/loadout.ts`、`src/nss/loadoutController.ts` | 需要挑战返回 URL 的 V2 装配解析 |
| 确定性记录 | `src/sim/battleRecord.ts` | 需要等价的服务端严格运行时校验 |
| 确定性种子 | `src/sim/battleSeed.ts` | 创建邀请时改由服务端生成并冻结 |
| 门户 | `src/ui/portal.ts` | 好友挑战目前仍锁定 |
| Arena 模式 | `src/app/game.ts` | 当前只有 `single`、`online` |
| 结果 UI | `src/ui/results.ts` | 缺少挑战提交状态、重试和回挑战动作 |
| 数据库 | 迁移 001 至 003；`002` 已有 `challenges` | 需要增量迁移 004 和邀请表 |
| 静态路由 | `server/http-server.mjs` 仅把 `/join` 回退到门户入口 | 需要 `/challenge/<id>` 与 `/challenges/` 回退 |
| 定制器返回 | `web-customizer/src/integration/arenaLink.ts` | 只传组合 V1，不会直接同步服务器 |

### 4.1 已确认的升级约束

当前 NSS `NssLoadoutController.createTop()` 只接收整机 `UpgradeLevels`。现有 `partUpgrades` 只对应旧三件式零件，不会作用到 NSS 五件装配。

因此本阶段：

- 快照仍按批准规则冻结服务器 progression 中现有 `upgrades` 和 `partUpgrades`。
- 公平模式把两者都规范化为零。
- 全力模式保留两者，但当前 NSS 战斗只应用 `upgrades`。
- 不在本阶段发明 NSS 零件升级映射；未来如果新增，应独立设计并提升规则版本。

## 5. 范围限制与不应修改的能力

- 不改变 `affinity-rules.json`、伤害公式、流派判定、AI 权重、QTE、碰撞、倾斜或胜负规则。
- 不修改既有迁移 001、002、003。
- 不引入 WebSocket、推送、公开匹配、好友列表或排行榜。
- 不实现服务端 Three.js 或无界面战斗复算。
- 不发放挑战奖励，不写 wallet events。
- 不实现玩家可见回放、纹章、AI 图片生成或多套装配收藏。
- 不重构 `Game` 为新引擎，只增加挑战入口和必要分支。
- 不把 `battleMode === 'online'` 的网络分支错误扩展到 challenge；挑战仍走现有单人确定性 AI 路径。
- 不修改或暂存工作区已有未跟踪素材。
- 禁止批量删除文件或目录。

## 6. 依赖顺序

```text
步骤 0 基线
  -> 步骤 1 数据库迁移
      -> 步骤 2 共享契约与服务端校验
          -> 步骤 3 邀请服务
              -> 步骤 4 原子认领、列表与回挑战
                  -> 步骤 5 单次结果与幂等结算
                      -> 步骤 6 HTTP API 与静态路由
                          -> 步骤 7 客户端 API 与离线队列
                              -> 步骤 8 门户邀请页与挑战中心
                                  -> 步骤 9 定制器返回桥接
                                      -> 步骤 10 Arena 挑战模式与结算
                                          -> 步骤 11 双浏览器 E2E 与完整回归
```

顺序原因：数据库和运行时契约先锁定，服务层才有稳定输入；HTTP 只包裹已验证服务；UI 只调用稳定 API；Arena 最后接入，避免在持久化和幂等尚未成立时把网络状态混入战斗主循环。

---

## 【步骤 0】建立实施前基线

### 目标

证明阶段 5B 开始前的核心门禁仍通过，并记录已有未跟踪资源，避免误处理用户素材。

### 修改文件

无。

### 执行

```powershell
git status --short
npm run test:unit
npm run test:server
npm run test:nss-contract
npm run build
```

任一测试或构建失败则停止，不进入步骤 1。现有未跟踪资源只记录，不清理、不移动、不暂存。

### 验证

- 四条测试/构建命令退出码均为 0。
- 已跟踪工作区无意外修改。
- 保存基线测试数和失败截图目录状态。

---

## 【步骤 1】新增迁移 004 和数据库约束

### 目标

先用数据库测试锁定邀请、单次认领、创建幂等、结果幂等和回挑战父链的持久化边界。

### 文件

新增：

- `server/storage/migrations/004_challenge_offers.sql`

修改：

- `scripts/test-database.mjs`
- `scripts/test-private-server-archive.mjs`

### 先写失败测试

更新 `scripts/test-database.mjs`，先确认以下断言因迁移 004 不存在而失败：

1. 首次迁移返回 `[1, 2, 3, 4]`，重复迁移返回 `[]`。
2. 表清单增加 `challenge_offers`。
3. 既有 challenge 行在升级后保持可读，新列为空。
4. 创建请求唯一性为 `(creator_player_id, creation_request_id)`。
5. `claimed_challenge_id`、`challenges.offer_id`、`result_submission_id` 均唯一且允许空。
6. 同一 `parent_challenge_id` 只能创建一条回挑战邀请。
7. 非法状态、损坏 JSON 和无效外键被数据库拒绝。
8. 失败迁移不泄漏表、列或索引。

更新备份测试中的迁移版本断言：

- 当前备份为 `[1, 2, 3, 4]`。
- 旧 001 备份恢复后自动补迁移 `[2, 3, 4]`。
- 恢复后的邀请、正式挑战、结果和父链可读。

```powershell
npm run test:database
npm run test:backup
```

### 最小迁移

迁移创建：

```sql
CREATE TABLE challenge_offers (
  id TEXT PRIMARY KEY,
  creator_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  parent_challenge_id TEXT REFERENCES challenges(id) ON DELETE RESTRICT,
  creation_request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'revoked')),
  offer_json TEXT NOT NULL CHECK (json_valid(offer_json)),
  expires_at TEXT NOT NULL,
  claimed_challenge_id TEXT REFERENCES challenges(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (creator_player_id, creation_request_id),
  UNIQUE (parent_challenge_id),
  UNIQUE (claimed_challenge_id)
);
```

再为现有 `challenges` 增加：

- `offer_id TEXT REFERENCES challenge_offers(id) ON DELETE RESTRICT`
- `parent_challenge_id TEXT REFERENCES challenges(id) ON DELETE RESTRICT`
- `result_submission_id TEXT`
- 三个必要唯一索引与挑战中心查询索引。

不为旧行补造邀请或结果 ID，不重建既有表。

### 验证

```powershell
npm run test:database
npm run test:backup
```

### 推荐提交

```text
feat(challenges): add immutable challenge offer storage
```

---

## 【步骤 2】建立挑战契约与服务端严格规范化器

### 目标

把版本、装配、升级、邀请、正式输入和结果校验放在不依赖 HTTP 的纯模块中。

### 文件

新增：

- `battle-top-designer/shared/nss/challenge.schema.json`
- `server/challenges/challenge-contract.mjs`
- `tests/fixtures/challenge-contract-v1.json`
- `scripts/test-challenge-contract.mjs`
- `tests/unit/challenge-contract.test.ts`

修改：

- `server/progression/progression-service.mjs`
- `scripts/test-progression.mjs`
- `scripts/test-nss-contract.mjs`
- `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`
- `package.json`

### 先写失败测试

服务端和浏览器测试共同读取同一 fixture，覆盖：

1. 合法 `fair` 和 `full_power` 邀请快照。
2. 合法正式挑战输入，角色固定为应战者 `player`、创建者 `enemy`。
3. NSS V2 精确键、五槽位零件所属关系和七属性值。
4. 当前 `catalogVersion`、catalog SHA-256、`affinityRulesVersion`、`battleRulesVersion`、`challengeSchemaVersion`、`simulationVersion`。
5. UUID、128 位小写十六进制种子、竞技场白名单和唯一 AI 配置 `deterministic-v1`。
6. 留言去首尾空白且最多 120 字符。
7. 公平模式的两个升级对象全为零；全力模式使用规范化服务器值。
8. `BattleInputLogV1` 与 `BattleOutcomeSummaryV1` 的精确键和当前约束。
9. 回合最多 256、语音帧最多 360,000、每帧 `0..255`。
10. 日志与摘要种子相等、`turnCount` 等于回合数、`tickCount` 等于语音帧数。
11. 缺字段、额外字段、未知动作、未知技能、错误版本和非有限数值被拒绝。
12. 规范化输出固定字段顺序，相同语义输入得到相同 JSON。

### 最小实现

`challenge-contract.mjs`：

- 使用 Node `readFileSync` 读取共享 catalog、versions 和属性规则。
- 使用 `createHash('sha256')` 对规范化换行后的权威战斗 catalog 计算现有 SHA-256，不复制常量。
- 导出规范化请求、邀请、正式输入、日志、摘要和结果 envelope 的小函数。
- 导出 `ChallengeError`，携带 `status`、`code`、`message`。
- 只验证可以证明的结构、范围和一致性，不假装复算 AI、伤害或物理。

`progression-service.mjs` 只做两项必要提取：

- 导出已有 NSS 装配规范化函数，保持原同步行为不变。
- 导出只读 `readPlayerProgression(database, playerId)`，继续返回规范化快照。

共享 schema 用于版本化文档和契约检查；服务端运行时仍使用显式规范化函数，不引入 JSON Schema 依赖。

在 `package.json` 增加 `test:challenge-contract`，并把它加入 `test:server`。

### 验证

```powershell
npm run test:challenge-contract
npm run test:progression
npm run test:nss-contract
npm run test:unit -- challenge-contract
Set-Location battle-top-designer\web-customizer
npm run test:unit -- nssSharedContract
Set-Location ..\..
```

### 推荐提交

```text
feat(challenges): add versioned challenge contracts
```

---

## 【步骤 3】实现邀请创建、查看与撤销服务

### 目标

先完成无需跨玩家写入的邀请生命周期，并证明创建只读取服务端 progression。

### 文件

新增：

- `server/challenges/challenge-service.mjs`
- `scripts/test-challenges.mjs`

修改：

- `package.json`

### 先写失败测试

使用内存 SQLite、固定时钟和固定种子生成器：

1. 有 NSS 装配的玩家创建默认公平邀请。
2. 缺少 NSS 装配返回 `NSS_LOADOUT_REQUIRED`。
3. 请求携带额外字段、未知模式、未知竞技场或超长留言失败。
4. 种子只由注入的服务端生成器产生。
5. `expiresAt` 精确等于创建时间加 24 小时。
6. 相同创建者、相同 `requestId`、相同规范化请求返回原邀请。
7. 相同 ID、不同内容返回 `IDEMPOTENCY_MISMATCH`。
8. 公平模式快照清零升级，全力模式冻结创建时升级。
9. 查看普通开放邀请需要认证，但不认领、不改变状态。
10. 定向邀请只有创建者和目标可查看。
11. 只有创建者能撤销开放邀请；重复撤销返回当前状态。
12. 已认领邀请不能撤销。

### 最小实现

`challenge-service.mjs`：

- 构造函数或函数参数注入 `now()` 和 `createSeed()`，生产默认分别使用 `Date` 与 `randomBytes(16).toString('hex')`。
- 从 `readPlayerProgression()` 读取创建者装配和升级。
- 服务器重新构造 `offer_json`，不接受客户端装配、升级、派生属性或种子。
- 通过创建者和 `creation_request_id` 查找幂等记录，并比较规范化请求语义。
- `getOffer()` 返回最小展示数据、派生状态和当前身份允许动作。
- `revokeOffer()` 只更新 `open` 邀请。

不要在本步骤实现 HTTP、认领、列表、结果或 UI。

### 验证

```powershell
npm run test:challenges
```

### 推荐提交

```text
feat(challenges): add challenge offer lifecycle
```

---

## 【步骤 4】实现原子认领、详情、分组列表与回挑战

### 目标

完成邀请到正式挑战的原子转换，以及挑战中心所需只读查询。

### 文件

修改：

- `server/challenges/challenge-service.mjs`
- `scripts/test-challenges.mjs`

### 先写失败测试

1. 创建者不能认领自己的普通邀请。
2. 定向邀请只能由目标认领。
3. `now < expiresAt` 成功，`now >= expiresAt` 返回 `OFFER_EXPIRED`。
4. 认领时读取应战者最新服务器 NSS 装配。
5. 公平模式把双方有效升级冻结为零。
6. 全力模式保留创建者创建时升级和应战者认领时升级。
7. 认领生成一条不可变 `pending` challenge，并更新 offer 关联。
8. 任一写入失败时两张表都回滚。
9. 两个玩家依次模拟竞争认领时只有第一人成功，数据库只有一条正式 challenge。
10. challenge 详情只允许两个参与者读取。
11. `waiting_me` 返回目标开放邀请和本人未完成的应战 challenge。
12. `waiting_friend` 返回本人创建的开放/已认领待完成项。
13. `history` 返回本人参与的完成项。
14. 默认 limit 20、最大 50，不透明游标稳定翻页且无重复。
15. `pendingCount` 与完整 `waiting_me` 查询一致。
16. 只有已完成挑战的原应战者能创建定向回挑战。
17. 回挑战交换角色、生成新种子、关联父挑战；同一父挑战重复调用返回原邀请。

### 最小实现

- `claimOffer()` 使用单个 `BEGIN IMMEDIATE` 事务。
- 正式输入只由邀请快照与认领者服务器 progression 组合。
- 条件更新必须包含 `WHERE id = ? AND status = 'open'`，受影响行数不是 1 就回滚。
- 列表使用 `(updated_at, id)` 键集分页，不使用 offset。
- 游标只包含版本、时间和 ID，经过 base64url 编码；损坏游标返回 `INVALID_CHALLENGE_REQUEST`。
- 普通开放分享邀请不主动出现在所有人的 `waiting_me`，必须通过链接访问；避免把私人链接变成公开挑战广场。
- 过期状态通过时间推导，不写 `expired` 状态，不新增后台任务。

### 验证

```powershell
npm run test:challenges
```

### 推荐提交

```text
feat(challenges): claim and browse ghost challenges
```

---

## 【步骤 5】实现单次结果、幂等结算和服务端信任边界

### 目标

只接受第一份合法结果，同时可靠处理相同请求重试和响应丢失。

### 文件

修改：

- `server/challenges/challenge-service.mjs`
- `server/challenges/challenge-contract.mjs`
- `scripts/test-challenges.mjs`
- `scripts/test-challenge-contract.mjs`

### 先写失败测试

1. 只有正式挑战应战者能提交。
2. 日志、摘要和 challenge 的种子、版本必须一致。
3. 请求体规范化后保存 `{ submissionId, inputLog, outcome }`。
4. 第一次合法提交把 challenge 更新为 `completed` 并设置 `completed_at`。
5. 相同 `submissionId`、相同规范化内容返回原结果。
6. 相同 ID、不同内容返回 `IDEMPOTENCY_MISMATCH`。
7. 不同 ID 提交到已完成 challenge 返回 `CHALLENGE_ALREADY_COMPLETED`。
8. 非法结果不会改变 challenge 状态或写入半份 JSON。
9. 同一内容仅键顺序和空白不同仍视为幂等。
10. 不能用第二份结果覆盖胜者、终结方式或最终状态。

### 最小实现

- `submitChallengeResult()` 在事务中读取 challenge、检查身份和状态。
- 对日志和摘要调用步骤 2 的严格规范化器。
- 只比较和保存规范化 JSON，不新增没有必要的 payload hash 列。
- 首次结果写入 `result_json`、`result_submission_id`、`status='completed'`、`completed_at` 和 `updated_at`。
- 明确注释信任边界：服务端不验证 AI 行为和物理演算，只验证契约。

### 验证

```powershell
npm run test:challenge-contract
npm run test:challenges
```

### 推荐提交

```text
feat(challenges): persist one idempotent battle result
```

---

## 【步骤 6】接入挑战 HTTP API 和生产静态路由

### 目标

用薄路由暴露已验证服务，并让公网生产服务器能直接打开挑战深链接。

### 文件

新增：

- `scripts/test-challenge-http.mjs`

修改：

- `server/http-server.mjs`
- `scripts/test-http-server.mjs`
- `package.json`

### 先写失败测试

使用真实 HTTP 服务器、内存 SQLite 和两个有效身份覆盖：

1. 八个已批准端点的方法、状态码和响应体。
2. 缺少身份、错误 token、`X-Player-Id` 不匹配。
3. 损坏 JSON、错误 Content-Type 和额外字段。
4. 普通 JSON 请求继续使用 64 KiB 上限。
5. 只有结果接口使用 2 MiB 上限，超过返回 `BODY_TOO_LARGE`。
6. UUID 路径匹配严格，错误路径不进入服务。
7. 业务错误稳定映射为错误码，不依赖英文消息。
8. `/challenge/<uuid>`、`/challenges` 和 `/challenges/` 在 production 返回门户 `index.html`。
9. `/arena/` 继续返回 Arena，未知路径继续 404。
10. GET/HEAD 静态回退行为一致。

### 最小实现

新增路由：

- `POST /api/challenge-offers`
- `GET /api/challenge-offers/:id`
- `POST /api/challenge-offers/:id/claim`
- `POST /api/challenge-offers/:id/revoke`
- `GET /api/challenges`
- `GET /api/challenges/:id`
- `POST /api/challenges/:id/results`
- `POST /api/challenges/:id/rematch`

实现要求：

- 每个路由先 `authenticateRequest()`，再调用 challenge service。
- 路由只提取路径、查询参数、身份和 JSON，不复制业务判断。
- 为结果路由把 `readJsonBody()` 上限显式设为 `2 * 1024 * 1024`；其他路由沿用默认上限。
- catch 分支增加 `ChallengeError` 映射。
- 静态回退只允许已知门户路由，不把所有未知路径变成 200。

### 验证

```powershell
npm run test:http
npm run test:challenge-http
npm run test:server
```

### 推荐提交

```text
feat(challenges): expose authenticated challenge APIs
```

---

## 【步骤 7】实现客户端 API 和身份隔离的离线提交队列

### 目标

建立不依赖 UI 的浏览器客户端层，并先证明结果在联网前已可靠保存。

### 文件

新增：

- `src/challenges/challengeClient.ts`
- `src/challenges/pendingChallengeResult.ts`
- `tests/unit/challenge-client.test.ts`
- `tests/unit/pending-challenge-result.test.ts`

### 先写失败测试

`challenge-client.test.ts`：

1. 每个请求携带 Bearer 和 `X-Player-Id`。
2. 请求与响应执行严格的最小客户端解析。
3. 非 JSON、缺字段、额外状态和错误响应映射为 `ChallengeApiError`。
4. 游标保持不透明，不在客户端解析。
5. 创建、认领、撤销、列表、详情、结果和回挑战 URL 正确。

`pending-challenge-result.test.ts`：

1. storage key 包含 `playerId` 和 `challengeId`。
2. 保存后能恢复同一 `submissionId`、日志和摘要。
3. 写入失败返回明确结果，不假装已经可重试。
4. 损坏、错误版本、错误身份记录被隔离并安全忽略。
5. 只有服务端成功或确认相同提交已存在时删除。
6. 单一页面会话自动重试每条记录最多一次。
7. 手动重试不生成新的 `submissionId`。

### 最小实现

`challengeClient.ts`：

- 只做 fetch、认证 headers、JSON 解析、响应形状和错误映射。
- 不访问 DOM，不保存 localStorage，不包含业务状态机。

`pendingChallengeResult.ts`：

- 版本固定为 1。
- 使用显式注入的 Storage 便于测试。
- 单条 challenge 只保留一份待提交 envelope。
- 提供 `savePendingResult()`、`loadPendingResult()`、`removePendingResult()`、`listPendingResultsForPlayer()`。
- 不实现定时器、后台同步或无限重试。

### 验证

```powershell
npm run test:unit -- challenge-client pending-challenge-result
```

### 推荐提交

```text
feat(challenges): add client and offline result queue
```

---

## 【步骤 8】实现门户邀请页和三分组挑战中心

### 目标

让玩家可以在统一门户创建、查看、认领、撤销和浏览挑战。

### 文件

新增：

- `src/ui/challengeCenter.ts`
- `src/ui/challengeOffer.ts`
- `tests/unit/challenge-center.test.ts`
- `tests/unit/challenge-offer.test.ts`

修改：

- `src/ui/portal.ts`
- `src/main.ts`
- `src/style.css`
- `tests/unit/portal.test.ts`
- `tests/e2e/portal.spec.ts`

### 先写失败测试

1. 门户好友挑战由 locked 改为 open，链接 `/challenges/`。
2. `waiting_me` 非零时模式卡显示角标。
3. `/challenge/<id>` 在无身份时显示现有邀请身份门，成功后保留路径并继续挑战。
4. 打开邀请不调用 claim。
5. 创建者看到复制链接和撤销，不看到认领。
6. 其他玩家看到双方规则信息、“调整我的装配”和“认领并应战”。
7. 无 NSS 装配时创建按钮禁用并引导 `/customizer/`。
8. 创建表单默认公平模式，竞技场只允许三个现有 ID，留言最多 120 字符。
9. 三分组独立加载，最近项优先，“加载更多”只使用返回游标。
10. 动作成功后刷新当前分组和角标。
11. 所有昵称、留言和动态文本使用 `textContent`，不进入 `innerHTML`。
12. 过期、撤销、已认领、目标不符、版本不支持和离线状态有明确操作。
13. 挑战中心进入时触发步骤 7 的单次待提交恢复。

### 最小实现

- `portal.ts` 继续负责身份恢复和 progression 同步，然后按 pathname 分派：门户首页、邀请页或挑战中心。
- `challengeOffer.ts` 只渲染单个邀请流程并调用客户端。
- `challengeCenter.ts` 渲染创建区和三个分组，不引入前端路由库或状态管理库。
- 使用事件监听和 `replaceChildren()` 保持现有原生 DOM 风格。
- 门户首页只请求一页 `waiting_me` 获取 `pendingCount`；失败时不阻断其他模式入口。
- 分享先尝试 Clipboard API，失败时保留只读链接供手工复制。

### 验证

```powershell
npm run test:unit -- portal challenge-center challenge-offer
npx playwright test tests/e2e/portal.spec.ts --project=arena-desktop
```

### 推荐提交

```text
feat(challenges): add portal challenge center
```

---

## 【步骤 9】实现定制器调整后返回挑战

### 目标

保证玩家在认领前修改的五件装配和五层属性真正同步到服务器，再由认领事务冻结。

### 文件

新增：

- `battle-top-designer/web-customizer/src/integration/challengeReturn.ts`
- `battle-top-designer/web-customizer/tests/unit/challengeReturn.test.ts`
- `src/challenges/challengeReturn.ts`
- `tests/unit/challenge-return.test.ts`

修改：

- `battle-top-designer/web-customizer/src/sharing/combinationUrl.ts`
- `battle-top-designer/web-customizer/src/App.tsx`
- `battle-top-designer/web-customizer/tests/unit/combinationUrl.test.ts`
- `src/ui/portal.ts`

### 数据流

```text
邀请页当前服务器装配
  -> /customizer/?returnTo=/challenge/<id>&sv=2&cv=...&rv=...&combo=...&a=...
  -> 玩家修改零件与属性
  -> “返回挑战”
  -> /challenge/<id>?sv=2&cv=...&rv=...&combo=...&a=...
  -> 门户严格解析 V2 装配
  -> 写入本地 progression
  -> 调用现有 progression sync
  -> 清理 URL 中装配参数
  -> 重新显示邀请，等待主动认领
```

### 先写失败测试

1. 只接受同源、格式为 `/challenge/<uuid>` 的 `returnTo`。
2. `http://`、`//host`、路径穿越、非 challenge 路由和重复参数失败。
3. customizer 允许现有 V2 share 参数与一个 `returnTo` 共存，不放宽其他额外参数。
4. 返回链接复用现有 `sv/cv/rv/combo/a` 编码，不创建第二套 loadout 格式。
5. 五层属性能往返，不退回默认属性。
6. 门户解析器与定制器 `buildToSearch()` 对同一 fixture 结论一致。
7. 门户只在身份有效后写 progression 和同步服务器。
8. 同步成功后 URL 只保留 `/challenge/<id>`；同步失败保留可重试状态，不静默认领旧装配。
9. 普通打开 customizer 时现有“进入竞技场”按钮和分享链接不变。

### 最小实现

- `combinationUrl.ts` 只把 `returnTo` 加入允许参数，并要求最多一个；现有 V2 必填参数不变。
- `challengeReturn.ts` 解析安全返回路径，使用 `buildToSearch()` 生成当前完整装配参数。
- `App.tsx` 仅在有效 `returnTo` 存在时显示“返回挑战”，不替换普通“进入竞技场”。
- 根客户端的 `challengeReturn.ts` 使用相同版本和槽位顺序严格解析当前 V2 参数，并用共享测试 fixture 防止漂移。
- `portal.ts` 在调用 claim 前确保这次 progression sync 已成功；失败时禁止认领并提示重试。

不让定制器直接持有设备 token，也不从独立 React 应用直接调用私人服务器。

### 验证

```powershell
npm run test:unit -- challenge-return
Set-Location battle-top-designer\web-customizer
npm run test:unit -- challengeReturn combinationUrl
Set-Location ..\..
npm run build
```

### 推荐提交

```text
feat(challenges): return customizer loadouts to offers
```

---

## 【步骤 10】接入 Arena challenge 模式、结算和离线重试

### 目标

用挑战不可变输入创建双方 NSS 陀螺，完成战斗后先保存再提交，并在结算页提供恢复动作。

### 文件

新增：

- `src/challenges/challengeBootstrap.ts`
- `tests/unit/challenge-bootstrap.test.ts`
- `tests/unit/challenge-game-boundaries.test.ts`

修改：

- `src/main.ts`
- `src/app/game.ts`
- `src/nss/loadoutController.ts`
- `src/ui/results.ts`
- `src/style.css`
- `tests/unit/game-simulation-boundaries.test.ts`
- `tests/unit/battle-record.test.ts`

### 先写失败测试

#### 启动与快照

1. `/arena/?challenge=<uuid>` 缺本地身份时不创建 Game，显示返回身份门提示。
2. 非法 ID、无权限、已完成、版本不支持和离线状态有独立提示。
3. bootstrap 只接受服务端不可变 challenge 输入，不回退本地当前装配。
4. `player` 使用应战者 loadout，`enemy` 使用创建者 loadout。
5. 两个 `TopEntity` 都通过现有 NSS 模型缓存创建。
6. 公平模式传入零升级；全力模式传入冻结的系统升级。
7. Arena 使用服务端竞技场 ID和种子。

#### 战斗边界

8. `battleMode` 扩展为 `'single' | 'online' | 'challenge'`。
9. challenge 的行动、AI、QTE、语音、固定 tick 和结果记录继续走单人确定性分支。
10. challenge 不触发 `applyProgressionResult()`、`saveProgression()` 或 wallet 事件。
11. challenge 不连接 match server，不发送在线快照。
12. `startBattleWithPlayer()` 的可选 NSS enemy 不影响单人旧敌人创建。
13. 相同 challenge 输入在两个初始化中产生相同 battle seed 和初始统计。

#### 结算与重试

14. `showResult()` 首次冻结日志和摘要后，先写 pending storage，再调用 API。
15. localStorage 写入失败时不发送结果，并显示无法安全提交。
16. 提交成功删除 pending；网络失败保留。
17. 手动“重新提交”复用同一 `submissionId`。
18. 服务器已完成且确认同一提交时视为成功。
19. 结果 UI 显示规则、双方昵称/装配、提交状态和返回挑战中心。
20. 提交成功后原应战者可点击回挑战；失败时保留重试按钮。
21. 多次 `showResult()` 不创建新 submission 或重复 progression 变更。

### 最小实现

`challengeBootstrap.ts`：

- 解析唯一 challenge UUID。
- 加载本地身份并调用详情 API。
- 严格检查版本和参与者角色。
- 返回 `GameChallengeOptions`，或可展示的错误状态。

`main.ts`：

- 普通 Arena 保持现有同步构造。
- challenge URL 先 bootstrap；失败时渲染轻量状态页，不创建 WebGL。
- 成功时把 challenge options 传给 `Game`。

`game.ts`：

- 构造参数增加可选 challenge，不引入全局单例。
- 新增 `startChallengeBattle()`，并行创建玩家和敌方 NSS top 后调用最小扩展的 `startBattleWithPlayer(player, seed, enemy?)`。
- challenge 使用静态 AI 配置 `deterministic-v1`；回合 AI 继续由现有 `pickAiTurnAction()` 和 battle `ai` 随机流驱动。
- 所有 `online` 判断保持只用于实时网络；只有结算成长判断使用 `battleMode !== 'single'` 或明确 challenge 分支。
- 为结果提交维护单一 challenge settlement 状态，避免重复提交竞态。

`results.ts`：

- 增加纯文本挑战提交状态区域。
- challenge 模式把主按钮设为“返回挑战中心”。
- 次按钮按状态显示“重新提交”或“发起回挑战”。
- 不把服务端昵称、留言或装配文本插入 HTML 字符串。

### 验证

```powershell
npm run test:unit -- challenge-bootstrap challenge-game-boundaries game-simulation-boundaries battle-record
npm run build
npx playwright test tests/e2e/deterministic-battle.spec.ts --project=arena-desktop
```

### 推荐提交

```text
feat(challenges): play and settle ghost battles
```

---

## 【步骤 11】完成双浏览器端到端验证与完整回归

### 目标

证明两个独立本地身份能够完成完整异步挑战和回挑战链，并且阶段 5B 没有破坏既有玩法。

### 文件

新增：

- `tests/e2e/friend-challenge.spec.ts`
- `scripts/start-challenge-e2e-server.mjs`
- `playwright.challenge.config.ts`

修改：

- `scripts/verify-unified-site.mjs`
- 仅限测试暴露的必要修正文件

### E2E 环境

挑战 E2E 需要真实统一站点和 SQLite 服务，而不是当前只启动 Vite 的普通配置。使用独立配置：

1. `scripts/start-challenge-e2e-server.mjs` 创建内存 SQLite、执行迁移并插入固定测试邀请码 `E2E-FRIENDS`。
2. 脚本从 `dist/site` 提供正式统一构建，并通过 `createArenaHttpServer()` 启动独立端口。
3. 验证命令先运行 `npm run build`；`playwright.challenge.config.ts` 校验 `dist/site` 已存在，并以该脚本作为唯一 webServer 命令。
4. 两个独立 BrowserContext 保存玩家 A、B 的本地身份；一个 APIRequestContext 创建玩家 C，用于竞争认领边界。
5. 数据库只存在于测试服务器进程内，进程退出后无需删除数据库文件。

### 先写失败测试

完整黄金路径：

1. 玩家 A、B 分别通过邀请码建立身份并同步 NSS 装配。
2. A 创建默认公平邀请并取得分享链接。
3. B 打开链接，只查看时服务端仍为 open。
4. B 进入定制器，修改至少一个零件和一个属性，返回挑战并成功同步。
5. B 点击认领，玩家 C 随后的竞争认领收到已认领错误。
6. B 进入 Arena，QA 路径缩短战斗但仍通过正式挑战初始化、记录和提交。
7. 提交前后 B 的金币、升级、解锁、关卡和冠军次数完全相同。
8. 模拟首次结果响应丢失，刷新后相同 submission 幂等恢复。
9. A 刷新挑战中心，在历史战报看到唯一结果。
10. B 创建回挑战；A 是唯一目标并成功认领。
11. 父挑战结果保持不变，新挑战使用不同种子且角色互换。
12. 收集 `pageerror`、console error 和失败网络请求，除测试主动模拟项外必须为空。

边界路径：

13. 24 小时过期使用服务测试覆盖，浏览器不等待真实时间。
14. 撤销邀请后链接不可认领。
15. 无 NSS 装配时创建被引导到定制器。
16. 直接访问生产 `/challenge/<id>` 返回门户而不是 404。

### 统一构建验证

更新 `verify-unified-site.mjs`：

- 保持既有 `/`、`/customizer/`、`/arena/` 资产检查。
- 验证门户 bundle 包含挑战中心入口。
- 验证 customizer bundle 包含安全 returnTo 入口。
- 不要求磁盘生成 `/challenge/<id>/index.html`；该路径由生产服务器回退门户入口。

### 完整验证顺序

```powershell
npm run test:unit
npm run test:server
npm run test:nss-contract
Set-Location battle-top-designer\web-customizer
npm run test:unit
Set-Location ..\..
npm run build
npm run verify:site
npx playwright test tests/e2e/baseline.spec.ts tests/e2e/affinity-ui.spec.ts tests/e2e/deterministic-battle.spec.ts --project=arena-desktop
npx playwright test tests/e2e/friend-challenge.spec.ts --config playwright.challenge.config.ts
```

如时间和环境允许，再执行：

```powershell
npm run test:e2e
```

### 静态检查

```powershell
git diff --check
git status --short
rg -n "innerHTML" src/ui/challengeCenter.ts src/ui/challengeOffer.ts src/ui/results.ts
rg -n "applyProgressionResult|awardCoins|wallet" src/challenges src/app/game.ts
```

逐条审查匹配：动态服务端文本必须走 `textContent`；challenge 结算不得调用成长函数。

### 完成清单

- [ ] 所有成功标准均有自动化证据。
- [ ] 第一认领者、单次结果和父挑战唯一性由事务及索引双重约束。
- [ ] 服务端种子、双方装配和升级快照不可由客户端覆盖。
- [ ] 本地待提交数据先于 HTTP 写入，且按身份隔离。
- [ ] 公平/全力模式只改变挑战有效升级，不修改正常存档。
- [ ] challenge AI 使用阶段 5A 随机流与固定 tick。
- [ ] challenge 不修改 progression 或 wallet。
- [ ] 深链接在生产服务器正常回退。
- [ ] 备份恢复包含迁移 004 和全部挑战数据。
- [ ] 现有单人、online、属性、装配和确定性回放回归通过。
- [ ] 未修改、删除或暂存已有未跟踪资源。

### 推荐提交

若 E2E 和回归新增必要文件：

```text
test(challenges): verify async friend challenge journey
```

若只有测试执行结果而无文件修改，不创建空提交。

## 7. 测试层级与预计新增覆盖

以下为实施目标，不是当前已通过数量：

| 层级 | 目标覆盖 | 预计新增 |
| --- | --- | --- |
| 共享契约 | 邀请、正式输入、日志、摘要、版本和边界 | 约 20 个断言场景 |
| 数据库 | 迁移、索引、旧数据兼容、备份恢复 | 约 12 个场景 |
| 服务 | 创建、认领、列表、结果、回挑战、身份和时间边界 | 约 35 个场景 |
| HTTP | 8 个端点、身份、body 限制、错误映射、静态路由 | 约 20 个场景 |
| 客户端单元 | API 解析、离线队列、返回 URL、UI 状态 | 约 30 个场景 |
| Arena 边界 | 双 NSS 初始化、第三模式、零成长、结算幂等 | 约 20 个场景 |
| E2E | 双身份黄金路径、响应丢失、回挑战、撤销 | 2 个主流程 |

实际测试数以最小完整覆盖为准，不为了达到数字复制无价值测试。

## 8. 预计文件范围

### 新增

- 1 个迁移文件。
- 2 个服务端 challenge 模块。
- 1 个共享 challenge schema。
- 3 个客户端 challenge 模块，加 1 个 Arena bootstrap。
- 2 个门户 UI 模块。
- 2 个定制器/门户 returnTo 模块。
- 3 个服务测试脚本。
- 约 9 个根 Vitest 测试文件。
- 2 个定制器单元测试文件。
- 1 个双浏览器 E2E 文件及 `playwright.challenge.config.ts`。

### 修改

- `server/http-server.mjs`
- `server/progression/progression-service.mjs`
- `src/main.ts`
- `src/ui/portal.ts`
- `src/app/game.ts`
- `src/ui/results.ts`
- `src/nss/loadoutController.ts`
- `src/style.css`
- `battle-top-designer/web-customizer/src/App.tsx`
- `battle-top-designer/web-customizer/src/sharing/combinationUrl.ts`
- 构建、契约、数据库、备份和既有回归测试入口。

实现中如果发现需要大面积修改此范围之外的战斗文件，应停止并重新评估，而不是顺便重构。

## 9. 回滚策略

### 代码回滚

- 按推荐提交逐步回滚 UI、Arena、HTTP、服务和迁移之后的代码。
- 迁移 004 一旦在包含真实挑战数据的数据库运行，不通过删除表回滚。
- 若功能需要临时关闭，先从门户隐藏入口并让挑战写 API 返回维护状态，保留只读数据和数据库结构。

### 数据保护

- 部署迁移 004 前使用现有 `npm run backup:server` 创建完整备份。
- 恢复旧二进制前确认它可以忽略新表和 challenge 新列；当前旧查询使用显式列，预期兼容，但必须在测试中证明。
- 不手工编辑 SQLite 文件，不批量删除挑战记录。
- 如果迁移本身失败，`migrateDatabase()` 的事务必须保留 003 状态。

## 10. 主要风险与控制

### 风险 1：循环外键和 SQLite 原子认领

控制：迁移测试先证明外键、唯一索引和条件更新；认领使用单个 `BEGIN IMMEDIATE`，任何一步失败都回滚。

### 风险 2：服务端与 TypeScript 战斗记录校验漂移

控制：共同 fixture、相同版本入口和正反样本同时跑 Node 与 Vitest；规则变化时必须同步提升契约测试。

### 风险 3：把 challenge 当成 online 导致等待网络裁决

控制：实时网络判断继续只比较 `battleMode === 'online'`；challenge 仅在初始化、成长隔离和结算提交处增加明确分支。

### 风险 4：定制器返回后认领了旧装配

控制：返回装配先通过 V2 参数严格解析，再完成 progression sync；同步失败时禁用认领，不允许静默回退。

### 风险 5：结果响应丢失导致重复覆盖

控制：先保存本地 envelope，再提交；服务端使用 `result_submission_id` 和规范化 `result_json` 判定相同重试。

### 风险 6：用户文本进入 HTML

控制：昵称、留言和服务端动态值全部使用 `textContent`；静态检查和包含 HTML 字符的测试样本共同验证。

### 风险 7：2 MiB 结果日志造成内存压力

控制：只在结果路由放宽上限，其他接口保持 64 KiB；同时限制 tick 和回合数组，私人规模不提前引入压缩协议。

### 风险 8：现有 NSS 零件升级不存在

控制：忠实保存当前 progression 升级字段，但只应用现有 NSS 构造器支持的系统升级；不暗自发明新数值映射。

## 11. 最终自检要求

每完成一步并准备提交前，必须确认：

- 修改只服务当前步骤。
- 失败测试先出现，最小实现后通过。
- 没有新增推测性扩展接口。
- 没有更改战斗数值或装配属性。
- 没有把用户文本插入 HTML。
- 没有读取或输出设备 token。
- 没有修改旧迁移。
- 没有触碰已有未跟踪资源。
- 当前步骤的验证命令退出码均为 0。
- `git diff --check` 通过。

只有当前步骤验证成功，才能进入下一步。
