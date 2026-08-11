# NSS Arena 阶段 6：八名对手战役实施计划

> 依据：`docs/superpowers/specs/2026-08-11-eight-rival-campaign-design.md`

## 需求理解

把 RIPTOP Arena 现有三轮锦标赛升级为八名固定对手的顺序战役，复用当前五层 NSS 装配、七属性、确定性博弈战斗、发射、QTE、碰撞与结算，不修改战斗规则。玩家首胜解锁下一关，失败停留当前关；三星可跨多次胜利累计；关间允许自由换装；服务器持久化进度、最佳成绩、奖励和冠军次数。

## 目标

- 建立唯一的 `campaign-v1` 权威目录，包含八名对手、17 套合法装配、八种 AI Profile、固定升级、场地、三星与奖励。
- 用轻量战役控制器把门户、定制器、Arena 和结果服务串成完整闭环，不把战役规则堆入 `game.ts`。
- 用 SQLite 迁移 `005` 持久化进度与尝试，以事务和稳定 UUID 保证开始、结果与奖励幂等。
- 保持快速战斗、好友幽灵挑战、真人房间、身份、进度同步、备份和统一构建行为不变。

## 成功标准

- 八名对手只能按顺序首胜解锁；失败不退关，三星不阻挡主线。
- 17 套装配全部通过现有 NSS 目录、五层结构和核心属性约束校验，并按尝试次数确定性轮换。
- 八种 AI Profile 只改变现有行动权重；相同种子和状态产生相同选择。
- 三星可跨胜局累计，最佳成绩按已批准比较元组确定性合并。
- 基础胜利金币、首胜、补星、零件解锁或等价转换、冠军皇冠均由服务端最多发放一次。
- 开战后断网仍可完成本地战斗；结果按本地身份隔离排队，联网后幂等补交。
- 玩家能从门户进入档案、查看关卡、换装安全返回、挑战、重赛、进入下一关并最终达到 `24/24`。
- TypeScript、单元、服务端、数据库、浏览器、统一构建和既有核心回归全部通过。

## 假设与已确定边界

1. `campaign-v1` 是首个且当前唯一配置版本；不在本阶段制作远程热更新后台。
2. 服务器严格验证请求结构、身份、关卡、冻结装配和结果边界，但按已批准的私人朋友服模型信任合法客户端的规范化结果，不重跑整场模拟。
3. 浏览器与 Node 需要读取同一份规则。采用根目录 `shared/campaign/` 下的 JSON 配置和无浏览器依赖的纯 JavaScript 规则模块；客户端 TypeScript 仅提供类型化适配，服务器不直接导入 `src/*.ts`。
4. 战役奖励沿用现有 progression 与 wallet 事务，不新增第二套金币或库存系统。
5. 不新增人物立绘、剧情动画、配音、新模型、新属性、新技能或新物理规则。
6. 不全面重构 `game.ts`；只增加战役模式所需的选项、结果摘要和控制器接点。
7. 不覆盖当前 `dist/site`。正式构建前先把现有目录移动为带时间戳的明确备份；不批量删除任何目录。

## 修改边界

预计新增：

- `shared/campaign/campaign-v1.json`
- `shared/campaign/campaign-rules.js`
- `shared/campaign/campaign-rules.d.ts`
- `src/data/campaign/opponents.ts`
- `src/data/campaign/objectives.ts`
- `src/data/campaign/campaignRules.ts`
- `src/gameplay/aiProfiles.ts`
- `src/campaign/campaignClient.ts`
- `src/campaign/campaignBootstrap.ts`
- `src/campaign/campaignController.ts`
- `src/campaign/campaignReturn.ts`
- `src/campaign/pendingCampaignResult.ts`
- `src/ui/campaignArchive.ts`
- `server/storage/migrations/005_campaign_progress.sql`
- `server/campaign/campaign-catalog.mjs`
- `server/campaign/campaign-contract.mjs`
- `server/campaign/campaign-service.mjs`
- `scripts/test-campaign-contract.mjs`
- `scripts/test-campaign-service.mjs`
- `scripts/test-campaign-http.mjs`
- `tests/unit/campaign-catalog.test.ts`
- `tests/unit/campaign-rules.test.ts`
- `tests/unit/campaign-ai.test.ts`
- `tests/unit/campaign-client.test.ts`
- `tests/unit/campaign-return.test.ts`
- `tests/unit/pending-campaign-result.test.ts`
- `tests/unit/campaign-archive.test.ts`
- `tests/e2e/campaign.spec.ts`

预计最小修改：

- `src/main.ts`
- `src/ui/portal.ts`
- `src/style.css`
- `src/app/game.ts`
- `src/gameplay/ai.ts`
- 定制器当前返回链接的接入文件（实施时以实际入口为准，不扩大定制器模型）
- `server/http-server.mjs`
- `scripts/test-database.mjs`
- `scripts/test-http-server.mjs`
- `scripts/test-private-server-archive.mjs`
- `scripts/build-unified-site.mjs` 或 `scripts/verify-unified-site.mjs`（仅在现有构建未覆盖 `/campaign/` 时）
- `package.json`

明确不修改：

- 物理、伤害、属性克制、QTE、碰撞、蓄能粒子与战斗回合公式。
- 好友挑战和真人联机协议的既有语义。
- `server/storage/migrations/001` 至 `004`。
- 用户已有未跟踪素材、备份和参考项目。

## 实施步骤

### 【步骤1】建立可重复基线与约束账本

目标：

- 在任何功能修改前记录工作树、现有测试和玩法实施约束。
- 把用户已有未跟踪文件与本阶段文件分开管理。

操作：

1. 读取实施时适用的 Three.js 玩法系统说明，只加载与确定性 AI、模式接入相关的参考；本阶段不改物理，因此物理调参标记为“不适用”。
2. 记录 `git status --short`、当前 Node 版本和迁移清单。
3. 运行直接相关基线：

```powershell
npx tsc --noEmit
npx vitest run
npm run test:server
npm run test:nss-contract
```

验证：

- 基线全部通过；若存在既有失败，先记录并确认与战役无关，不把无关修复混入本阶段。
- 用户已有未跟踪文件未被删除、移动、暂存或改写。

### 【步骤2】先测试并建立唯一权威战役目录

目标：

- 把已批准的八名对手、17 套装配、升级、AI、场地、三星和奖励固化为单一数据源。

测试先行：

1. 新增 `tests/unit/campaign-catalog.test.ts` 和 `scripts/test-campaign-contract.mjs`。
2. 先写失败用例，覆盖：
   - 配置版本严格为 `campaign-v1`；
   - 对手恰好八名，顺序、ID 和展示名唯一；
   - 装配恰好 17 套，每套恰好五层；
   - 所有零件 ID、属性、升级、场地、AI Profile 和奖励 ID 合法；
   - 核心属性仅为 `LIGHT` 或 `DARK`；
   - 前七关各两套、Atlas 三套；
   - 已批准的固定数值逐项快照匹配。
3. 确认测试因目录尚不存在而失败。

实现：

- 新增 `shared/campaign/campaign-v1.json` 作为机器可读权威目录。
- 新增 `src/data/campaign/opponents.ts`，把 JSON 解析为客户端只读类型，开发／测试时立即拒绝非法配置。
- 新增 `server/campaign/campaign-catalog.mjs`，服务启动时使用相同 JSON 和服务端约束完成一次校验。
- 不在客户端或服务端复制第二份八关数据表。

验证：

```powershell
npx vitest run tests/unit/campaign-catalog.test.ts
node scripts/test-campaign-contract.mjs
npx tsc --noEmit
```

建议提交：`feat(campaign): add versioned opponent catalog`

### 【步骤3】先测试并实现共享纯规则

目标：

- 用无 I/O 的确定性函数统一轮换、顺序解锁、三星、奖励键、稳定 UUID、最佳成绩和基础胜利金币。

测试先行：

1. 新增 `tests/unit/campaign-rules.test.ts`。
2. 增加 JS 契约测试，确保 Node 与浏览器使用同一函数。
3. 覆盖边界：
   - `attemptCount` 为 0 时使用招牌装配，之后按模确定性轮换；
   - 相同开始请求重试不推进轮换；
   - 失败不解锁，首胜只解锁相邻下一关；
   - 三个星位独立按位合并且只在胜利时生效；
   - 完整度阈值恰好 50%／40%、倾斜恰好 0.6、回合恰好 5／6 的边界；
   - 主属性、协调共鸣和 finish 类型目标；
   - 最佳结果依次比较回合、完整度、tick 和 finish 排名；
   - 基础金币公式及四类 finishBonus；
   - 同一逻辑奖励键总是映射到同一 RFC 4122 格式 36 字符 UUID，不同键不冲突。
4. 先确认测试失败。

实现：

- 新增 `shared/campaign/campaign-rules.js` 与对应声明文件，保持纯函数、无 DOM、无数据库、无随机全局状态。
- `src/data/campaign/campaignRules.ts` 和 `objectives.ts` 只做客户端类型化、文案和最小适配。
- 服务器直接复用共享纯规则，只在服务层执行入账。

验证：

```powershell
npx vitest run tests/unit/campaign-rules.test.ts
node scripts/test-campaign-contract.mjs
npx tsc --noEmit
```

建议提交：`feat(campaign): add deterministic campaign rules`

### 【步骤4】先测试并接入八种确定性 AI Profile

目标：

- 只改变现有 AI 行动的权重分布，不改变行动集合、付费规则或技能选择规则。

测试先行：

1. 新增 `tests/unit/campaign-ai.test.ts`。
2. 覆盖八种权重精确匹配、不可负担行动先过滤、剩余权重归一化、相同种子可复现、所有行动不可用时沿用现有安全退路。
3. 覆盖普通战斗未传 Profile 时行为与当前基线一致。

实现：

- 新增 `src/gameplay/aiProfiles.ts`，从权威目录读取八种只读权重。
- 对 `src/gameplay/ai.ts` 做一个可选 Profile 接点；继续使用现有确定性随机流和技能选择。
- 不添加读心、隐藏属性、临场换装或专属技能。

验证：

```powershell
npx vitest run tests/unit/campaign-ai.test.ts
npx vitest run tests/unit/ai*.test.ts
npx tsc --noEmit
```

建议提交：`feat(campaign): add deterministic rival ai profiles`

### 【步骤5】先测试并新增 SQLite 迁移 005

目标：

- 持久化每个玩家的对手进度和每次冻结尝试，不修改已有迁移。

测试先行：

1. 扩展 `scripts/test-database.mjs`，从仅含 `001` 至 `004` 的数据库升级到 `005`。
2. 覆盖 `campaign_progress` 与 `campaign_attempts` 的表、主键、外键、唯一约束、范围 CHECK、索引和默认值。
3. 覆盖同一玩家同一 `start_request_id`、非空 `result_request_id` 的唯一性。
4. 扩展备份测试，确认迁移 005、战役表和数据能被备份检查识别并恢复。
5. 先确认测试因迁移缺失而失败。

实现：

- 新增不可变迁移 `server/storage/migrations/005_campaign_progress.sql`。
- `campaign_progress` 主键为 `(player_id, opponent_id)`。
- `campaign_attempts` 保存配置／模拟版本、种子、轮换索引、场地、AI、双方冻结装配与升级、请求 ID、结果和结算快照。
- 只增加必要索引：玩家档案读取、未完成尝试和幂等请求查询。

验证：

```powershell
node scripts/test-database.mjs
node scripts/test-private-server-archive.mjs
```

建议提交：`feat(campaign): persist progress and attempts`

### 【步骤6】先测试并实现服务端战役服务

目标：

- 在事务内完成档案读取、原子开战、结果合并、奖励入账和完整响应快照。

测试先行：

1. 新增 `scripts/test-campaign-service.mjs`。
2. 档案测试覆盖空档案、八关规范化、总星、下一关、冠军次数和奖励状态。
3. 开战测试覆盖：
   - 首关可进入，锁定关拒绝；
   - 当前 NSS 装配和升级被完整冻结；
   - `attempt_count` 的旧值决定轮换，然后只增加一次；
   - 相同 `(player, start_request_id)` 返回完全相同尝试；
   - 不同玩家可复用相同 request ID；
   - 非法装配、未知对手和错误配置拒绝且不增加计数。
4. 结果测试覆盖：
   - 只有尝试所有者可提交；
   - 严格结果契约和数值边界；
   - 失败记录但不退关、不发胜利奖励；
   - 首胜、补星、最佳成绩和顺序解锁；
   - 重复结果请求返回原结算快照；
   - 已完成尝试的不同结果返回冲突；
   - 同时重试只发一次钱包事件；
   - 已有零件转为目录当前价格的金币；
   - Atlas 冠军皇冠每个成功完成周期只加一次；
   - 任一步骤抛错时事务整体回滚。

实现：

- 新增 `server/campaign/campaign-contract.mjs`，严格解析开始请求、结果请求、数据库 JSON 与公开响应。
- 新增 `server/campaign/campaign-service.mjs`，依赖现有数据库和 progression 服务。
- 开战事务先查询幂等记录；只有新尝试才读取旧计数、冻结数据并加一。
- 结果事务由服务端计算三星、金币、转换和稳定钱包 UUID；客户端不能提交奖励数值。
- 返回权威 progression 和 campaign 快照，客户端只应用快照。

验证：

```powershell
node scripts/test-campaign-service.mjs
node scripts/test-progression.mjs
node scripts/test-database.mjs
```

建议提交：`feat(campaign): settle campaign progress on server`

### 【步骤7】先测试并开放认证 HTTP API

目标：

- 提供已批准的三个身份隔离接口，并保持静态站点与既有 API 不变。

测试先行：

1. 新增 `scripts/test-campaign-http.mjs`，扩展 `scripts/test-http-server.mjs`。
2. 覆盖：
   - `GET /api/campaign`；
   - `POST /api/campaign/attempts`；
   - `POST /api/campaign/attempts/:attemptId/result`；
   - 缺失／错误身份、未知对手、锁关、请求体过大、畸形 JSON、错误 Content-Type、方法不允许、冲突和内部错误映射；
   - `/campaign` 与 `/campaign/` 的门户 SPA 回退；
   - `/api/*` 永不落入静态回退。
3. 先确认新路由返回 404。

实现：

- 在 `server/http-server.mjs` 初始化一次 campaign service，并增加三条明确路由。
- 复用现有认证头、JSON body 上限、错误响应和缓存策略。
- 只把 `/campaign`、`/campaign/` 加入门户回退白名单。
- 在 `package.json` 增加独立战役测试脚本并纳入 `test:server`。

验证：

```powershell
node scripts/test-campaign-http.mjs
node scripts/test-http-server.mjs
npm run test:server
```

建议提交：`feat(campaign): expose authenticated campaign api`

### 【步骤8】先测试并实现严格客户端 API 与身份隔离队列

目标：

- 浏览器严格解析服务端数据，并在结果提交失败时可靠、隔离地保存待处理项。

测试先行：

1. 新增 `tests/unit/campaign-client.test.ts` 和 `tests/unit/pending-campaign-result.test.ts`。
2. API 测试覆盖正常响应、缺字段、未知配置版本、错误枚举、超范围数值、服务端错误码和网络失败。
3. 队列测试覆盖：
   - 项目结构 `{ playerId, requestId, attemptId, outcome }`；
   - 同身份按创建顺序重试；
   - 身份变化不读取或提交别人的队列；
   - 只有权威成功／幂等成功才删除；
   - 冲突标记为需人工返回档案，不无限重试；
   - localStorage 异常不阻止当前战斗显示本地结果。

实现：

- 新增 `src/campaign/campaignClient.ts`，提供最少的 `getArchive/startAttempt/submitResult`。
- 新增 `src/campaign/pendingCampaignResult.ts`，沿用好友挑战队列的成熟模式，但使用独立 key 和严格 playerId 分区。
- UUID 请求 ID 在首次动作时生成并持久化；重试复用同一 ID。

验证：

```powershell
npx vitest run tests/unit/campaign-client.test.ts tests/unit/pending-campaign-result.test.ts
npx tsc --noEmit
```

建议提交：`feat(campaign): add client api and offline result queue`

### 【步骤9】先测试并开放门户战役档案

目标：

- 把门户中的锁定“八人战役”改为可进入模式，提供清晰、轻量的八关档案。

测试先行：

1. 新增 `tests/unit/campaign-archive.test.ts`，扩展现有 portal 测试。
2. 覆盖锁定／已解锁／已击败卡片、总星、冠军次数、待提交角标、当前关定位、错误与重试状态。
3. 覆盖详情中核心属性、可能轮换属性、固定升级、AI 倾向、场地、教学、三星、最佳成绩和奖励文案。
4. 验证只为当前展开详情建立预览挂载点，关闭详情后释放资源；列表本身不创建八个 Three.js renderer。

实现：

- 新增 `src/ui/campaignArchive.ts`，负责 `/campaign/` 单页档案，不承载战斗规则。
- 修改 `src/ui/portal.ts`：开放入口，显示进度／待提交摘要并路由到档案。
- 在 `src/style.css` 增加战役档案所需的最小响应式样式，复用现有门户颜色、按钮和焦点样式。
- 档案加载失败显示重试与返回；不伪造本地解锁状态。

验证：

```powershell
npx vitest run tests/unit/campaign-archive.test.ts tests/unit/portal*.test.ts
npx tsc --noEmit
```

手工检查桌面与窄屏：无水平溢出、键盘可操作、锁定原因和星级可读。

建议提交：`feat(campaign): add eight-rival campaign archive`

### 【步骤10】先测试并实现定制器安全返回

目标：

- 玩家从某个对手详情进入 NSS 定制器后，保存或取消都能安全返回原对手，且不能注入外部跳转。

测试先行：

1. 新增 `tests/unit/campaign-return.test.ts`。
2. 覆盖合法 opponentId、未知 ID、重复参数、错误来源类型、外部 URL、编码异常、装配返回成功和取消返回。
3. 先确认当前定制器只理解普通／挑战返回，战役用例失败。

实现：

- 新增 `src/campaign/campaignReturn.ts`，只接受固定来源类型和目录中存在的 opponentId。
- 复用现有 NSS 装配回传格式；不创建第二份装配存储。
- 对定制器入口做最小接点，返回 `/campaign/?opponent=<id>`。
- 返回后由门户正常同步 authoritative progression，再重新打开对应详情。

验证：

```powershell
npx vitest run tests/unit/campaign-return.test.ts
npm run test:nss-contract
npx tsc --noEmit
```

建议提交：`feat(campaign): return safely from customizer`

### 【步骤11】先测试并接入 Arena 战役控制器

目标：

- Arena 只有在获得服务器冻结信封后才启动指定对手，并继续使用现有确定性战斗。

测试先行：

1. 新增战役 bootstrap／controller 单元测试。
2. 覆盖缺失身份、非法 opponentId、锁关、离线开战、未知版本、资源失败、成功冻结、普通 Arena 不受影响。
3. 覆盖服务器提供的玩家装配、对手 NSS 装配、升级、AI Profile、场地和种子被逐项传给 Game。

实现：

- 新增 `src/campaign/campaignBootstrap.ts`：严格解析 `?campaign=<opponentId>` 并请求开始信封。
- 新增 `src/campaign/campaignController.ts`：持有尝试、规范化战斗摘要、提交状态和返回动作。
- 修改 `src/main.ts`，在 challenge 分支之外增加互斥的 campaign 分支；同时出现多个模式参数时显示非法链接，不猜测优先级。
- 对 `src/app/game.ts` 增加最小 `GameCampaignOptions` 接点，复用当前 NSS 对手装配创建、升级应用、场地加载和 AI 流程。
- 将 Arena 原“锦标赛”入口改为“八人战役”并导航 `/campaign/`；不保留第二套旧锦标赛进度。
- 资源加载失败时返回档案并说明原因，不静默替换普通 AI。

验证：

```powershell
npx vitest run tests/unit/campaign-*.test.ts
npx tsc --noEmit
npm run test:nss-contract
```

手工验证普通快速战斗、好友挑战和真人房间仍走原分支。

建议提交：`feat(campaign): bootstrap frozen arena attempts`

### 【步骤12】先测试并实现战后结算闭环

目标：

- 将现有战斗结果规范化后只提交一次，并展示权威三星、奖励、最佳成绩和后续动作。

测试先行：

1. 扩展 controller 和 Game 结果测试，覆盖胜／负、四种 finish、补星、无新增星、最佳成绩更新、不更新和 Atlas 通关。
2. 覆盖提交成功、网络失败入队、刷新后重试、身份变化隔离、冲突提示和服务端快照应用。
3. 断言战役模式不会再走本地基础金币入账路径，避免双发。

实现：

- 战斗结束后由 controller 生成已批准的规范化摘要并调用结果 API。
- 成功时以服务端响应更新 progression 和战役档案；显示旧星、新星、目标原因、奖励、最佳成绩和下一关。
- 失败提交时保存队列并明确显示“待确认”；确认前不提前显示奖励到账或下一关已解锁。
- 提供“下一名对手”“重赛”“换装”“返回档案”；失败时“下一名”不可用。
- 每次进入门户／档案时按顺序重试当前身份的待处理结果并刷新权威快照。

验证：

```powershell
npx vitest run tests/unit/campaign-*.test.ts
npx tsc --noEmit
```

建议提交：`feat(campaign): settle battles and render rewards`

### 【步骤13】完整浏览器闭环与双尺寸验证

目标：

- 用真实 HTTP、SQLite、门户、定制器和 Arena 验证完整八关，不只验证孤立组件。

测试先行：

- 新增 `tests/e2e/campaign.spec.ts`，使用独立临时数据库和端口，不干扰当前朋友服。
- 通过现有测试／QA 快速结算能力覆盖：
  1. 新身份只开放 Blaze；
  2. 失败后仍停在 Blaze；
  3. 首胜解锁 Sky；
  4. 从详情进入定制器、调整装配并安全返回；
  5. 重复胜利分别补齐不同星；
  6. 依次通关八人并达到 `24/24`；
  7. Atlas 冠军皇冠与奖励只发一次；
  8. 页面刷新和服务重启后档案保持；
  9. 断网结算进入队列，恢复后只结算一次；
  10. 另一个浏览器身份看不到前一身份的进度或队列。
- 在桌面和移动视口验证档案、详情、战前状态和结算操作。
- 捕获 `pageerror`、控制台错误、关键状态截图和非零 Canvas 尺寸。

验证：

```powershell
node node_modules/@playwright/test/cli.js test tests/e2e/campaign.spec.ts
```

建议提交：`test(campaign): cover eight-rival progression flow`

### 【步骤14】全量回归、生产构建与部署前检查

目标：

- 证明阶段 6 不破坏现有系统，并生成可部署产物；不未经确认重启公网朋友服。

回归：

```powershell
npx tsc --noEmit
npx vitest run
npm run test:server
npm run test:nss-contract
npm run test:e2e
```

构建：

1. 明确解析 `dist/site` 的绝对路径。
2. 若已存在，把该单一目录移动为新的带时间戳备份；不覆盖、不递归删除。
3. 执行：

```powershell
npm run build
npm run verify:site
```

最终检查：

- `/`、`/campaign/`、`/arena/?campaign=blaze-fang` 和定制器资源均存在且使用同源路径。
- 八关、17 套装配、24 星和全部奖励契约测试通过。
- 快速战斗、好友挑战、真人房间、身份认领、进度同步、备份与恢复全部回归通过。
- `git diff --check` 通过。
- `git status --short` 中用户原有未跟踪文件保持原样。
- 检查当前 Node 服务和 Tunnel 状态，但不自动停止或替换公网进程。

建议最终功能提交：`feat(campaign): complete eight-rival campaign`

## 测试矩阵

| 层级 | 主要证明 |
|---|---|
| 共享规则 | 目录、轮换、三星、奖励、UUID、最佳成绩完全确定 |
| AI 单元 | 八种 Profile 权重、过滤和种子可复现 |
| 数据库 | 001–004 升级到 005、约束、重启、备份恢复 |
| 服务层 | 开战与结果事务、身份隔离、幂等、冲突、回滚 |
| HTTP | 三个 API、认证、错误映射、body 上限、SPA 回退 |
| 客户端 | 严格解析、模式互斥、定制器返回、离线队列 |
| 浏览器 | 失败留关、首胜解锁、补星、八关、24 星、双身份 |
| 回归 | 快速战斗、好友挑战、真人房间、NSS、构建与备份 |

## 提交与工作树策略

- 每一步测试先失败、再做最小实现、再通过对应测试。
- 不使用 `git add --all`；每次只显式暂存该步骤的文件。
- 不暂存、不移动、不格式化用户已有未跟踪文件。
- 迁移一经落地不再修改旧迁移；若实施期发现错误，在上线前修正尚未发布的 `005`，发布后则新增后续迁移。
- 公网服务重启、Tunnel 切换和数据库替换属于部署动作，功能完成后单独说明影响并征得确认。

## 风险与限制

- 客户端结果按私人朋友服信任模型提交，严格校验能防止格式错误和误操作，但不能防止主动篡改客户端。
- `campaign-v1` 更新必须提升配置版本；已开始尝试继续使用数据库中的冻结快照。
- 17 套装配复用现有模型和材质，本阶段不会为八名对手增加独立角色美术。
- 全量 24 星 E2E 依赖现有 QA 快速结算接口；该能力只用于测试，不开放为普通玩家入口。
- 本阶段只做必要的 `game.ts` 接点，历史体积和更大范围模式抽象留给后续独立重构。

## 完成检查清单

- [ ] 完全满足已批准规格，没有新增未批准玩法。
- [ ] 共享规则只有一个权威来源，没有客户端／服务端数据漂移。
- [ ] 只修改战役所需文件，未顺便重构相邻代码。
- [ ] 所有奖励均由服务端幂等发放，客户端不会双重入账。
- [ ] 全部成功标准均有自动化或明确手工验证。
- [ ] 用户已有文件与公网运行服务均未被意外影响。

