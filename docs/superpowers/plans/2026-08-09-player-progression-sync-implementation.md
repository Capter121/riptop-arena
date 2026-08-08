# 邀请玩家进度与金币同步实施计划

日期：2026-08-09
状态：计划草案，待批准
对应设计：`docs/superpowers/specs/2026-08-09-player-progression-sync-design.md`
对应总计划：`docs/superpowers/plans/2026-08-01-nss-arena-complete-expansion-implementation.md` 任务 4.5

## 1. 需求理解

把现有 `riptop-progression-v1` 本地存档迁移到邀请玩家对应的 SQLite 进度记录。玩家断网时继续正常战斗、领奖和消费；浏览器记录带 UUID 的金币差值事件，回到门户后通过单一认证接口顺序同步。服务端负责首次金币导入、事件幂等、非金币进度合并、负余额回滚和权威状态返回。

本任务不修改战斗模式、属性、物理、AI、零件数值、奖励金额、商店价格或现有身份模型。

## 2. 成功标准

- 空数据库应用 `003_player_progression.sql` 后出现 `player_progression` 和 `wallet_events`，重复迁移无变化。
- 首次认证只导入一次本地金币；重复请求不重复加减。
- 解锁取并集，永久升级与历史成绩取最大值。
- 当前关卡、传统配装和 NSS 配装使用当前浏览器值。
- 离线金币变化按 UUID 和数组顺序幂等同步。
- 任一扣款导致负余额时，整次请求回滚并返回权威状态。
- 服务端响应回写不会生成新的金币事件。
- 门户明确显示已同步、待同步和冲突恢复状态。
- 现有单元、服务端、NSS 契约、构建、站点验证和 E2E 全部通过。

## 3. 假设与边界

- 使用已批准的 `POST /api/progression/sync`，不拆分金币与快照接口。
- 使用 `Authorization: Bearer` 和 `X-Player-Id`，复用 `authenticateRequest()`。
- 每个浏览器身份对应一个玩家；不增加跨浏览器账号合并。
- 单请求最多 400 个事件，超长队列按最旧优先顺序分批。
- 服务端做格式、范围、重复 ID 和负余额校验，但不回放离线战斗。
- `003` 只包含玩家进度和钱包事件；战役和成绩使用后续新迁移。
- 不引入 ORM、同步框架、状态管理库或新 npm 依赖。

## 4. 执行规则

- 每一步先补能稳定失败的测试，再写最小实现，再运行该步验证。
- 当前步骤验证通过后才进入下一步。
- 每次提交只暂存该步骤列出的文件，不使用 `git add .`、`git add -A` 或 `git commit -am`。
- 开始前检查目标文件 diff，保留用户现有未跟踪素材、截图、翻译目录、`referse/` 和测试产物。
- 服务器写入必须置于显式事务；任何冲突都先回滚，再读取权威状态。
- 不顺带重构 `src/app/game.ts`。现有奖励和消费调用通过统一 `saveProgression()` 自动接入日志。

---

## 【步骤 1】建立玩家进度与钱包事件迁移

目标：

先用数据库约束锁定一玩家一快照、玩家级事件幂等键、非负金币和级联删除。

文件：

- 新增 `server/storage/migrations/003_player_progression.sql`
- 修改 `scripts/test-database.mjs`

先写失败测试：

1. 首次迁移版本从 `[1, 2]` 变为 `[1, 2, 3]`，再次迁移返回 `[]`。
2. 表清单增加 `player_progression` 和 `wallet_events`。
3. 同一玩家不能插入第二条 `player_progression`。
4. `snapshot_json` 非法、金币为负、非法 kind、零 delta、符号不匹配或绝对值超过 10000 时由 SQLite 拒绝。
5. 同一玩家的相同 `event_id` 被拒绝；不同玩家可使用相同 `event_id`。
6. 删除玩家后对应进度和事件级联删除。

最小实现：

1. 按批准规格创建两张表，不创建当前查询不需要的额外索引。
2. 使用复合主键 `(player_id, event_id)`，不把事件 ID 设为全局唯一。
3. 保持迁移只向前；不修改 `001` 或 `002`。

验证：

```powershell
npm run test:database
node --check server/storage/migrate.mjs
git diff --check
```

预期：新增迁移和全部约束测试通过，二次执行迁移无变化。

推荐提交：`feat(storage): add player progression tables`

---

## 【步骤 2】实现进度校验、规范化与纯合并规则

目标：

先把所有不依赖数据库事务的规则写成可直接测试的纯函数，固定合法载荷和字段合并语义。

文件：

- 新增 `server/progression/progression-service.mjs`
- 新增 `scripts/test-progression.mjs`

先写失败测试：

1. 合法 V1 请求被规范化，根对象和嵌套对象的额外键被拒绝。
2. 传统 9 个零件按槽位校验，未知零件和错槽零件被拒绝。
3. 整机升级只接受 `0..5`，零件升级只接受 `0..4`。
4. NSS V2 只接受共享目录中对应家族的零件和七种合法属性。
5. 解锁数组去重并按字符串排序。
6. 解锁取并集；升级、零件升级、最佳关卡和冠军次数取最大值。
7. `ladderIndex = 0` 能覆盖服务端高值；传统配装、NSS 配装和 `null` 使用本地值。
8. 非法 UUID、重复 UUID、零 delta、错误符号、超限 delta、非法时间和超过 400 个事件被拒绝。

最小实现：

1. 在服务模块中定义 `ProgressionError`，只携带安全的 `status`、`code`、`message` 和可选冲突信息。
2. 加载 `battle-top-designer/shared/nss/parts.catalog.json` 构建 NSS 家族 ID 集，不复制 16 件清单。
3. 为传统 9 件零件、升级上限和关卡上限定义当前版本校验常量，并由测试对照客户端常量。
4. 导出最少的测试目标：请求校验/规范化函数和快照合并函数。
5. 规范 JSON 键顺序和解锁顺序，使用字符串比较判断快照是否真正变化。
6. 不在本步骤访问数据库或 HTTP。

验证：

```powershell
node scripts/test-progression.mjs
node --check server/progression/progression-service.mjs
npm run test:nss-contract
git diff --check
```

预期：合法快照产生稳定规范结果，所有边界和已批准合并规则均由纯测试固定。

推荐提交：`feat(progression): define validated merge rules`

---

## 【步骤 3】实现首次迁移、幂等钱包与原子同步事务

目标：

让 `syncProgression()` 在一次 SQLite 事务内完成首次金币导入、事件应用、快照合并和 revision 更新。

文件：

- 修改 `server/progression/progression-service.mjs`
- 修改 `scripts/test-progression.mjs`

先写失败测试：

1. 第一次同步创建玩家进度并导入 `initialCoins`，第二次请求忽略新的 `initialCoins`。
2. credit/debit 按数组顺序应用，成功响应确认全部新事件。
3. 数据库中已存在的请求事件不重复计算，但仍进入确认列表。
4. 相同请求重试后的余额、快照和 revision 不变。
5. 新事件批次即使净额为 0，revision 只增加一次。
6. 任一 debit 导致负余额时，事件、余额、快照和 revision 全部回滚。
7. 首次记录创建也被回滚时，冲突返回默认快照、0 金币和 revision 0。
8. 实际无变化的同步不更新 `updated_at`。

最小实现：

1. 校验完成后执行 `BEGIN IMMEDIATE`。
2. 不存在记录时插入服务端默认快照、0 金币和 revision 0。
3. 仅在 `initial_coins_imported = 0` 时应用 `initialCoins`。
4. 每个未见事件先计算预计余额，再插入事件；余额不得小于 0。
5. 把 `source`、`createdAt` 规范化后写入 `metadata_json`。
6. 每次请求最多让 revision 增加 1；完全重复请求不写进度行。
7. 使用 `try/catch` 保证 `COMMIT` 或 `ROLLBACK` 成对结束。
8. 409 所需权威状态只能在回滚后读取。

验证：

```powershell
node scripts/test-progression.mjs
npm run test:database
node --check server/progression/progression-service.mjs
git diff --check
```

预期：首次、重复、净零、负余额和事务回滚测试全部通过，数据库不存在部分写入。

推荐提交：`feat(progression): sync wallet events atomically`

---

## 【步骤 4】接入认证 HTTP 同步接口

目标：

把服务能力暴露为一个受现有邀请身份保护的 JSON API，并固定成功、校验错误和 409 冲突响应。

文件：

- 修改 `server/http-server.mjs`
- 修改 `scripts/test-progression.mjs`
- 修改 `package.json`

先写失败测试：

1. 无身份请求返回 401。
2. Token 与 `X-Player-Id` 不匹配时返回现有认证错误。
3. 合法请求返回 200、完整权威 progression 和确认 ID。
4. 请求内重复事件 ID 返回 `400 DUPLICATE_EVENT_ID`。
5. 超过 400 条返回 `400 TOO_MANY_WALLET_EVENTS`。
6. 负余额返回 409、`rejectedEventId` 和回滚后的权威状态。
7. 非 JSON、非法 JSON 和超过 64 KiB 继续分别返回现有 415、400、413。
8. 响应和捕获日志不包含设备令牌或邀请码。

最小实现：

1. 在未知 `/api/*` 兜底之前增加 `POST /api/progression/sync`。
2. 先确认数据库存在，再调用 `authenticateRequest()`，再读取和校验 Body。
3. 成功使用现有 `sendJson()` 返回 200。
4. 扩展安全错误处理，使 `ProgressionError` 的普通错误沿用 `{ error }`，409 可额外携带 `progression`。
5. 不改变 `/api/invites/redeem`、`/api/me` 或静态路由顺序。
6. 增加 `test:progression`，并把它接入现有 `test:server` 链。

验证：

```powershell
npm run test:progression
npm run test:server
node --check server/http-server.mjs
git diff --check
```

预期：接口认证、Body 上限、成功响应和 409 响应全部通过，现有服务端测试无回归。

推荐提交：`feat(server): expose authenticated progression sync`

---

## 【步骤 5】实现每玩家本地金币日志与同步客户端

目标：

让现有所有 `saveProgression()` 调用自动记录金币差值，同时提供不会回声记账的服务端状态写回路径。

文件：

- 新增 `src/progression/progressionClient.ts`
- 修改 `src/app/progression.ts`
- 新增 `tests/unit/progression-client.test.ts`
- 视测试复用需要最小修改 `tests/unit/save-migration.test.ts`

先写失败测试：

1. 无身份保存只写现有进度 Key，不创建同步 Key。
2. 第一次为玩家建立同步状态时冻结当前金币，不生成事件。
3. 金币增加生成 credit，减少生成 debit，不变不生成。
4. 事件是 UUID v4，符号、金额、source 和 UTC 时间正确。
5. 两个玩家使用不同 Key，旧队列不会发送给新玩家。
6. 网络失败保留全部事件。
7. 成功响应只删除明确确认的 ID。
8. 服务端已成功但本地确认保存失败时，重试发送同一 ID。
9. 服务端权威回写不生成反向事件或空事件。
10. 409 清空当前玩家未确认事件并返回可直接保存的权威状态。
11. 超过 400 条时按最旧优先分批；任一批失败后停止，剩余事件保留。
12. 同一页面并发调用复用一个进行中的 Promise。

最小实现：

1. 同步 Key 固定为 `nss.progressionSync.v1.<playerId>`。
2. `progressionClient.ts` 只在运行时依赖身份存储；对 progression 使用 type-only import，避免与 `progression.ts` 形成运行时循环。
3. `saveProgression()` 增加默认开启的金币观察选项；所有现有调用保持不变。
4. `progression.ts` 导出一个把服务端快照和 coins 转成已清洗 `ProgressionState` 的窄函数。
5. 服务端回写调用 `saveProgression(state, { trackWallet: false })`，再更新 `lastObservedCoins`。
6. 同步客户端返回结果，不直接渲染 DOM；门户决定提示文本。
7. 每批最多 400 个事件。中间批只持久化确认 ID；最后一批成功后才返回最终权威状态供主存档写回。
8. 不改变 `awardCoins()`、`spendCoins()` 或 `src/app/game.ts` 调用点。

验证：

```powershell
npm run test:unit -- progression-client save-migration
npx tsc --noEmit
git diff --check
```

预期：本地日志、分批、重试和无回声写回全部通过，现有存档迁移测试保持通过。

推荐提交：`feat(progression): journal offline wallet changes`

---

## 【步骤 6】把同步接入邀请门户

目标：

在身份首次保存和 `/api/me` 恢复成功后同步进度，让门户展示权威金币、配装和确定的同步状态。

文件：

- 修改 `src/ui/portal.ts`
- 修改 `tests/unit/portal.test.ts`
- 修改 `tests/e2e/portal.spec.ts`

先写失败测试：

1. 邀请兑换并保存身份后调用同步接口，再渲染认证门户。
2. 已认证刷新严格先调用 `/api/me`，成功后再调用同步接口。
3. 同步成功显示权威金币和配装，并显示“进度已同步”。
4. 同步网络错误或 5xx 保留身份、本地进度和队列，显示“进度待同步”，开放入口仍可进入。
5. 同步 401/403 清除身份并返回邀请入口。
6. 同步 409 保存权威状态、清除未确认队列并显示“金币冲突已恢复”。
7. 刷新和重复同步不产生双倍金币。
8. 兑换成功但同步失败时不再次调用兑换 API。

最小实现：

1. 让认证门户渲染函数显式接收 progression 和同步状态，不在函数内部再次隐式加载旧存档。
2. 首次兑换保存身份后建立同步状态并同步；同步失败不重复兑换邀请码。
3. 身份恢复沿用现有 `/api/me` 错误分类；只有 `/api/me` 成功后才同步。
4. 网络/5xx 使用本地进度渲染带待同步状态的认证门户，不清除身份。
5. 400 显示安全错误文本并保留队列；409 使用客户端返回的权威状态。
6. 不增加 Arena 轮询，不修改模式入口或现有邀请表单。

验证：

```powershell
npm run test:unit -- portal progression-client
npm run test:e2e -- portal.spec.ts
npx tsc --noEmit
git diff --check
```

预期：首次迁移、刷新、离线、身份失效和 409 恢复流程全部通过，门户入口行为不变。

推荐提交：`feat(portal): sync invited player progression`

---

## 【步骤 7】执行完整回归与交付检查

目标：

证明进度同步没有改变战斗、属性、配装数值、奖励、认证或统一构建，并确认提交中没有混入用户文件。

文件：

- 原则上不新增产品文件；仅修复本任务导致的失败。

自动验证：

```powershell
npm run test:unit
npm run test:nss-contract
npm run test:server
npm run build
npm run verify:site
npm run test:e2e
npx tsc --noEmit
node --check server/progression/progression-service.mjs
node --check server/http-server.mjs
git diff --check
```

定制器回归：

```powershell
Set-Location battle-top-designer\web-customizer
npm run test:unit
npm run build
Set-Location ..\..
```

完成检查：

1. 对比任务前后 `src/app/game.ts`、战斗、属性、物理和奖励文件，确认无修改。
2. 用临时数据库完成首次同步、重复同步、服务重启后读取和负余额回滚。
3. 搜索设备令牌和邀请码是否进入响应、DOM、URL、日志或测试快照。
4. 确认所有任务提交只包含计划列出的文件。
5. 确认未暂存 `.playwright-cli/`、`test-results/`、现有截图、翻译目录、`referse/` 或未跟踪 VFX 素材。
6. 记录朋友服信任模型、无跨浏览器账号和 409 丢弃未确认本地变化的限制。

预期：全部门禁通过，阶段 4 的玩家进度在服务重启后仍存在，现有游戏玩法和数值不变。

本步骤无独立提交；若只产生验证结果，则直接交付。

## 5. 风险与控制

- 风险：服务端响应被本地保存逻辑再次记成金币事件。控制：明确的 `trackWallet: false` 回写路径和单元测试。
- 风险：重复请求导致双倍金币。控制：玩家级复合事件主键、已存在事件确认和重试测试。
- 风险：负余额请求部分写入快照或事件。控制：`BEGIN IMMEDIATE`、整批回滚和回滚后权威读取测试。
- 风险：`ladderIndex` 错误取最大值导致锦标赛无法重置。控制：单独测试本地 0 覆盖服务端高值，同时 `bestLadder` 保持最大值。
- 风险：超长离线队列超过单请求限制。控制：最旧优先分批、每批确认持久化、最终批后才回写主存档。
- 风险：客户端与服务端零件校验漂移。控制：NSS 读取共享 JSON，传统零件与升级上限增加契约断言。
- 风险：同步失败让已兑换邀请码被重复消耗。控制：身份保存完成后只重试同步，不重调兑换接口。
- 风险：过度扩展成通用云存档。控制：只有一个快照、一个钱包事件表和一个同步接口，不加入账号、后台任务或事件溯源框架。

## 6. 最终交付物

- `003_player_progression.sql` 玩家进度和钱包事件迁移。
- 经过校验的原子进度同步服务。
- 认证 `POST /api/progression/sync`。
- 每玩家本地金币事件日志和安全分批重试。
- 门户首次迁移、刷新同步和冲突恢复。
- 数据库、服务、客户端、门户 E2E 和完整回归证据。
- 不改变战斗模式及任何现有数值规则。
