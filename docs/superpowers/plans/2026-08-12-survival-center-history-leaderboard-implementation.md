# 生存中心运行记录、个人最佳与排行榜实施计划

日期：2026-08-12

对应规格：`docs/superpowers/specs/2026-08-12-survival-center-history-leaderboard-design.md`

## 需求理解

在不改变现有生存战斗、结算、奖励和排名比较规则的前提下，完善 `/survival/` 生存中心。页面必须能继续或开始运行，展示权威个人最佳、固定“我的排名”、可继续加载的朋友排行榜，以及当前身份可继续加载的正常战败历史。主动放弃记录不得出现。

## 成功标准

- `/survival/` 使用现有身份和权威服务端快照展示活动运行或开始入口。
- 个人最佳、当前排名和朋友榜来自现有 `survival_best_scores`，客户端不重算。
- 历史接口每页默认 20 条，仅返回当前身份正常战败的已完成运行。
- 排行榜和历史使用互相独立的不透明游标，失败后保留已加载数据并可重试。
- 当前玩家不在首屏榜单时仍能看到固定“我的排名”。
- 桌面与 390×844 手机端无横向溢出，主要按钮不小于 44px。
- 普通、战役、好友挑战、真人房间和现有生存 Arena 行为无回归。

## 假设与修改边界

- 不新增数据库表或迁移，只读取 `survival_runs` 和 `survival_best_scores`。
- 不展示主动放弃、逐波详情、赛季榜、筛选、搜索或玩家主页。
- 不修改共享生存计分、奖励、波次和最佳比较规则。
- 生存中心是轻量 DOM 页面，不创建新的 Three.js 场景。
- 每一步只暂存该步骤列出的文件，不纳入工作区其他未跟踪素材、截图或参考项目。
- 正式统一构建、公网备份和服务重启不在本功能计划内；完成后另行确认。

## 预计文件边界

新增：

- `src/ui/survivalCenter.ts`
- `tests/unit/survival-center.test.ts`
- `tests/e2e/survival-center.spec.ts`

最小修改：

- `server/survival/survival-contract.mjs`
- `server/survival/survival-service.mjs`
- `server/http-server.mjs`
- `src/survival/survivalClient.ts`
- `src/ui/portal.ts`
- `src/style.css`
- `scripts/test-survival-contract.mjs`
- `scripts/test-survival-service.mjs`
- `scripts/test-survival-http.mjs`
- `tests/unit/survival-client.test.ts`
- `tests/e2e/portal.spec.ts`（仅在入口开放状态需要补充时）

明确不修改：

- `shared/survival/survival-rules.js`
- `server/storage/migrations/001–006`
- `src/app/game.ts`
- 物理、伤害、属性、回合、QTE、粒子和联网房间协议。

---

## 【步骤 1】记录基线与现有接口契约

目标：

- 在功能修改前确认现有生存服务、客户端和门户均处于可验证状态。

操作：

1. 记录 `git status --short` 和最近生存提交。
2. 运行 TypeScript、现有生存客户端单测及生存契约/服务/HTTP 测试。
3. 检查 `/survival/` 当前行为，确认尚未存在重复的中心实现。

验证：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/unit/survival-client.test.ts tests/unit/survival-presentation.test.ts
npm.cmd run test:survival-contract
npm.cmd run test:survival-service
npm.cmd run test:survival-http
```

完成条件：

- 基线通过；若发现无关既有失败，只记录，不把无关修复混入本阶段。

---

## 【步骤 2】先测试并建立历史查询契约

目标：

- 在数据库查询前严格规范历史请求参数。

测试先行：

1. 扩展 `scripts/test-survival-contract.mjs`，先添加失败用例。
2. 覆盖：默认 `limit=20`、合法范围 1–50、单一 cursor、未知参数、重复参数、空 cursor、超长 cursor、非整数和越界 limit。
3. 断言非法输入使用稳定错误代码，不进入服务查询。

实现：

- 在 `server/survival/survival-contract.mjs` 新增最小的 `normalizeSurvivalHistoryQuery`。
- 复用排行榜查询的精确键、重复参数和 cursor 长度约束，不引入通用查询框架。

验证：

```powershell
npm.cmd run test:survival-contract
```

建议提交：`feat(survival): validate history queries`

---

## 【步骤 3】实现身份隔离的历史服务分页

目标：

- 从现有 `survival_runs` 返回当前玩家稳定分页的正常战败摘要。

测试先行：

1. 扩展 `scripts/test-survival-service.mjs`，构造两个身份、多条同时间运行、战败和主动放弃数据。
2. 先断言：
   - 只返回当前身份；
   - `abandoned=true` 不出现；
   - 按 `achievedAt DESC, runId DESC` 稳定排序；
   - 默认 20 条并能继续分页；
   - 第二页不重复、不遗漏；
   - 非法、陈旧和其他身份锚点 cursor 被拒绝；
   - 查询不会修改运行或最佳成绩。

实现：

- 在 `server/survival/survival-service.mjs` 增加 `listHistory(playerId, query)`。
- 从完成运行的最终摘要和冻结装配生成最小历史条目。
- cursor 只编码末项 `achievedAt` 与 `runId`，并在当前身份、当前过滤条件内验证锚点。
- 将 `listHistory` 加入服务公开返回对象。

验证：

```powershell
npm.cmd run test:survival-service
npm.cmd run test:database
```

建议提交：`feat(survival): list completed run history`

---

## 【步骤 4】接入认证 HTTP 历史 API

目标：

- 通过现有认证边界公开只读历史接口。

测试先行：

1. 扩展 `scripts/test-survival-http.mjs`。
2. 覆盖未认证 `401`、合法首屏、cursor 续页、limit 边界、未知参数、非法 cursor，以及身份隔离。
3. 断言响应只含 `items` 和 `nextCursor`，不泄漏数据库 JSON 或其他玩家字段。

实现：

- 在 `server/http-server.mjs` 增加 `GET /api/survival/history`。
- 沿用现有 `requireAuthenticatedPlayer`、JSON 响应和 SurvivalError 映射。
- 不增加写请求、缓存或新权限模型。

验证：

```powershell
npm.cmd run test:survival-http
npm.cmd run test:http
```

建议提交：`feat(survival): expose run history api`

---

## 【步骤 5】实现严格客户端解析与分页 API

目标：

- 浏览器只能接收契约完整的 Hub、排行榜和历史数据。

测试先行：

1. 扩展 `tests/unit/survival-client.test.ts`。
2. 覆盖合法历史页和查询字符串编码。
3. 覆盖额外字段、非法 UUID、负数、非整数、风险越界、非法日期、非法 NSS V2 装配、空/超长 cursor。
4. 保留现有 Hub 和排行榜解析回归。

实现：

- 在 `src/survival/survivalClient.ts` 导出明确的 `SurvivalBest`、`SurvivalLeaderboardEntry`、`SurvivalLeaderboardPage`、`SurvivalHistoryEntry` 和 `SurvivalHistoryPage` 类型。
- 将现有匿名 best/leaderboard 解析结果类型化，但不改变响应字段。
- 增加 `getHistory({ limit, cursor })`，严格解析 `items` 和 `nextCursor`。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-client.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): parse history pages`

---

## 【步骤 6】先测试并实现生存中心展示模型

目标：

- 将运行、最佳、排行和历史转换为可测试的纯展示模型，避免 DOM 中复制业务判断。

测试先行：

1. 新增 `tests/unit/survival-center.test.ts`。
2. 覆盖：
   - 有活动运行和无活动运行；
   - 无个人最佳和无排名；
   - 当前玩家在榜内与不在首屏；
   - 长昵称、高分和长零件 ID；
   - 排行榜按 `playerId` 去重；
   - 历史按 `runId` 去重；
   - 空数据、初次失败、追加失败和可重试；
   - 两个 cursor 独立推进；
   - 身份版本改变时拒绝应用旧响应。

实现：

- 新增 `src/ui/survivalCenter.ts`。
- 提供小型纯函数格式化分数、日期、装配摘要和各区域状态。
- 页面状态只保存权威 Hub、已加载分页、忙碌/错误和请求所属身份；不复制排名或最佳比较算法。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-center.test.ts tests/unit/survival-client.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): model center presentation`

---

## 【步骤 7】实现生存中心页面与运行操作

目标：

- 在 `/survival/` 呈现完整中心，并接通继续、开始、定制器和独立分页。

测试先行：

1. 在 `tests/unit/survival-center.test.ts` 增加 DOM 行为测试或可注入依赖的控制器测试。
2. 先覆盖重复点击防抖、分页失败保留 cursor、重试复用 cursor、身份切换丢弃旧响应和空状态按钮。

实现：

- 在 `src/ui/portal.ts` 识别 `/survival/`，创建现有身份对应的 SurvivalClient 并调用生存中心渲染器。
- Hub 成功后立即渲染运行控制、个人最佳和首屏排行榜；历史使用独立请求，不阻塞主操作。
- 有活动运行时跳转 `/arena/?survival=<runId>`。
- 无活动运行时使用现有 `startRun` 创建后跳转 Arena；重复点击只允许一个进行中请求。
- 无合法装配时跳转现有定制器安全返回流程；实现前先复用项目已有返回参数，不新增另一套协议。
- 排行榜和历史各自拥有“加载更多”、忙碌、失败和重试状态。
- 认证失败返回私人竞技据点；Hub 失败保留整页重试。

样式：

- 只在 `src/style.css` 增加生存中心命名空间样式。
- 桌面首屏双栏，手机单列；排行榜使用紧凑行，历史使用摘要条目。
- 分数使用稳定数字宽度；长昵称和零件 ID 可换行。
- 主按钮和加载按钮高度至少 44px，具备 focus、hover、pressed 和 disabled 状态。
- 使用安全区内边距，不添加新图片或持续 3D 背景。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-center.test.ts tests/unit/portal.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): render center and rankings`

---

## 【步骤 8】浏览器闭环与响应式验证

目标：

- 用真实浏览器验证中心的权威数据、交互和手机可用性。

测试先行：

- 新增 `tests/e2e/survival-center.spec.ts`，使用两个独立身份和受控服务端数据。

场景：

1. 无最佳、无历史、无活动运行的空状态。
2. 开始运行后显示活动运行并能继续进入 Arena。
3. 个人最佳和固定“我的排名”正确显示。
4. 当前玩家不在前 20 仍显示自己的排名。
5. 排行榜加载第二页，无重复玩家。
6. 历史加载第二页，无重复运行。
7. 主动放弃记录不显示。
8. 排行榜失败不阻止开始/继续；历史失败不影响排行榜。
9. 分页失败后保留已加载内容并能原 cursor 重试。
10. 第二身份看不到第一身份历史。

视觉和交互验证：

- 1440×900、1024×768 和 390×844。
- 20 行排行榜、20 条历史、长昵称、长零件 ID 和高位数分数。
- `scrollWidth <= innerWidth`。
- 所有主要按钮边界高度 `>= 44`。
- 无文字裁切、控制重叠、不可达内容、页面错误或控制台 error。

验证：

```powershell
node node_modules/@playwright/test/cli.js test tests/e2e/survival-center.spec.ts
```

建议提交：`test(survival): cover center browser flow`

---

## 【步骤 9】完整回归与完成检查

目标：

- 证明新中心没有改变其他模式和部署产物契约。

验证：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --testTimeout=15000
npm.cmd run test:survival-contract
npm.cmd run test:survival-service
npm.cmd run test:survival-http
npm.cmd run test:database
npm.cmd run test:backup
node node_modules/@playwright/test/cli.js test tests/e2e/survival-center.spec.ts tests/e2e/portal.spec.ts tests/e2e/campaign.spec.ts tests/e2e/friend-challenge.spec.ts tests/e2e/live-room.spec.ts
node node_modules/vite/bin/vite.js build --outDir "$env:TEMP\nss-survival-center-build" --emptyOutDir
git diff --check
```

最终检查：

- 逐项核对规格成功标准。
- 确认没有修改迁移、共享战斗规则或 `game.ts`。
- 确认只暂存本阶段文件。
- 不覆盖 `dist/site`，不重启或替换公网服务器。

建议提交：`test(survival): verify center regression`

## 完成定义

只有步骤 1–9 各自验证成功，且规格中的运行、个人最佳、固定排名、排行榜分页、历史过滤、身份隔离和移动端验收全部成立，才可宣布本阶段完成。
