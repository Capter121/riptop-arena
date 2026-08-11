# NSS Arena 阶段 7：确定性无尽生存模式实施计划

日期：2026-08-12

对应规格：`docs/superpowers/specs/2026-08-12-deterministic-survival-mode-design.md`

## 目标

在现有确定性 1v1 Arena、邀请身份、SQLite 进度和统一门户上实现完整无尽生存模式：冻结 NSS 装配、公平零升级、五波章节、完全继承结构状态、波次后三选一、风险契约、服务器检查点、朋友最佳榜和一次性里程碑金币。

## 成功标准

- 普通、精英、BOSS 和无尽章节由固定种子稳定生成。
- 每波胜利后只能从服务器冻结的三个有效奖励中选择一个。
- 完整度、爆裂风险和持续负面效果跨波继承；转速、能量和位置重置。
- 每位身份最多一局活动运行，可跨刷新、设备和服务器重启恢复。
- 断网可完成当前波，但未经服务器确认不能推进。
- 第 5、10、15、20 波金币只发一次，局内强化不写入永久进度。
- 每位受邀玩家在朋友榜只保留一条最佳成绩。
- 快速战斗、八人战役、好友挑战、真人房间和定制器契约无回归。

## 实施原则与假设

- 测试先行：每步先添加会失败的目标测试，再做最小实现。
- 共享规则只有一个权威来源；客户端和服务端不复制公式。
- 不修改迁移 `001–005`，新增 `006_survival.sql`。
- 不修改永久进度 snapshot schema；生存运行和最佳成绩保存在独立表，金币仍走现有权威钱包事务。
- 数据库只保存 `wave_ready`、`reward_pending`、`completed` 三种权威状态；“战斗中”是客户端对 `wave_ready` 信封的临时展示状态。
- 每个步骤只暂存列出的文件，不纳入用户已有未跟踪文件。
- 公网备份、迁移和服务重启不属于功能实施，最终单独申请授权。

---

## 【步骤 1】建立生存配置版本与目录契约

目标：

- 建立 `survival-v1` 的唯一配置来源，锁定波次、强化、倍率、积分和里程碑数值。

测试先行：

- 新增 `tests/unit/survival-catalog.test.ts`。
- 断言配置版本、三种波次类型、八种 AI Profile、三个场地、奖励 ID、三级上限、风险表和四个里程碑完整且唯一。
- 断言配置只引用正式 NSS 目录中存在的零件、合法属性和当前战斗版本。

实现：

- 新增 `shared/survival/survival-v1.json`。
- 新增 `shared/survival/survival-rules.js` 和 `shared/survival/survival-rules.d.ts` 的最小公共类型与配置读取函数。
- 新增 `src/data/survival/survivalConfig.ts` 作为浏览器类型化入口。
- 新增 `server/survival/survival-config.mjs` 作为服务端入口。
- 不在客户端或服务端再定义第二份数值常量。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-catalog.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): add versioned survival catalog`

---

## 【步骤 2】实现确定性波次生成

目标：

- 使用运行种子和波次号生成唯一的普通、精英或 BOSS 信封。

测试先行：

- 新增 `tests/unit/survival-wave.test.ts`。
- 快照覆盖固定种子的前 20 波，并对前 100 波执行边界断言。
- 覆盖 1–2 普通、3–4 精英、5 BOSS、章节 +8%、风险强度和 200% 上限。
- 断言同种子同波次完全一致，不同种子或波次产生可预期变化。
- 断言每波只有一个敌人，所有装配、属性、场地和 AI Profile 合法。

实现：

- 在 `shared/survival/survival-rules.js` 增加纯函数 `generateSurvivalWave`。
- 复用当前种子解析和确定性 RNG，不调用 `Math.random()`、当前时间或浏览器状态。
- 信封包含波次、章节、类型、敌人 NSS V2 装配、属性、场地、AI Profile 和生存强度修正。
- 数值达到硬上限后只继续确定性轮换内容，不无限增加物理参数。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-wave.test.ts tests/unit/outcome-random-guard.test.ts
```

建议提交：`feat(survival): generate deterministic waves`

---

## 【步骤 3】实现局内奖励候选与应用规则

目标：

- 每波生成三个唯一、有效、不可刷新重抽的奖励，并确定性应用。

测试先行：

- 新增 `tests/unit/survival-rewards.test.ts`。
- 覆盖四种三级成长强化、满级退出、维修、泄压、临时超频和三级风险契约。
- 覆盖满完整度、零爆裂风险、无负面效果时无效即时奖励不会出现。
- 覆盖接近全部成长满级时仍能产生三个有效选项。
- 断言属性调谐只增强冻结装配已有属性，不增加或替换属性。
- 断言风险只影响选择确认后的下一波，不追溯已结算分数。

实现：

- 在共享规则中增加 `generateSurvivalRewards`、`applySurvivalReward` 和严格运行强化状态规范化。
- 奖励候选输入只包含运行种子、波次和服务器当前检查点。
- 将下一波临时超频与永久到本局结束的三级强化分开保存。
- 固定数值为：进攻每级 +6%；协调每级稳定 +6%、消耗效率 +5%；属性每级 +8%；拾取每级 +15%；维修 18%；泄压 15 点；下一波超频输出与机动 +10%。
- 风险三级固定为得分 `1.25/1.55/1.90`、敌人强度 `+8%/+16%/+24%`。
- 所有百分比和取整规则在共享模块中固定。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-rewards.test.ts
```

建议提交：`feat(survival): add deterministic reward choices`

---

## 【步骤 4】实现计分、最佳成绩和排名比较规则

目标：

- 服务端能由规范化波次摘要重算分数，并稳定比较朋友最佳成绩。

测试先行：

- 新增 `tests/unit/survival-scoring.test.ts`。
- 覆盖基础分、三种波次加分、四种终结、无伤、五波连击上限和风险取整。
- 覆盖总分累加、BOSS 计数、完成波次定义和主动放弃摘要。
- 覆盖总分、波次、BOSS、剩余完整度、达成时间五级排序。
- 覆盖同一成绩不能无意义覆盖旧最佳。

实现：

- 在共享规则中增加 `scoreSurvivalWave`、`createSurvivalSummary` 和 `compareSurvivalBest`。
- 固定实现基础 `100 + 25 × (wave - 1)`、精英 75、BOSS 200、爆裂 50、环外 35、旋转 25、超时 15、无伤 100、连续无伤每波 40 且最多五波。
- 客户端结果契约不包含可被信任的最终总分；服务端累加共享计分结果。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-scoring.test.ts
```

建议提交：`feat(survival): score runs deterministically`

---

## 【步骤 5】新增迁移 006 与数据库约束

目标：

- 持久化活动运行、波次审计和每位玩家的最佳成绩。

测试先行：

- 扩展 `scripts/test-database.mjs`。
- 覆盖空数据库应用 `001–006`，以及已有 `001–005` 数据库升级到 `006`。
- 覆盖 `survival_runs`、`survival_wave_results`、`survival_best_scores` 表、索引和外键。
- 覆盖每位玩家最多一局未完成运行、每运行每波一条结果、请求 ID 唯一和 JSON 有效性。
- 覆盖迁移重复运行、事务回滚和旧战役数据保持不变。

实现：

- 新增 `server/storage/migrations/006_survival.sql`。
- `survival_runs` 保存冻结装配、检查点、当前信封和最终摘要。
- `survival_wave_results` 保存结果请求、计分、候选、奖励请求和选择后检查点。
- `survival_best_scores` 每位玩家一行，保存全部排名字段和装配摘要。
- 使用部分唯一索引约束活动运行，不依赖应用层扫描。

验证：

```powershell
npm.cmd run test:database
npm.cmd run test:backup
```

建议提交：`feat(survival): persist runs and best scores`

---

## 【步骤 6】建立严格服务端契约

目标：

- 在进入事务前拒绝非法开局、结果、奖励、放弃和分页请求。

测试先行：

- 新增 `scripts/test-survival-contract.mjs`。
- 覆盖精确键集合、UUID V4、运行/波次范围、NSS V2 装配、合法状态继承、终结方式和版本字段。
- 覆盖额外字段、NaN、Infinity、负数、未知属性、未知奖励、非法负面效果和任意总分被拒绝。
- 覆盖排行榜 `limit` 和 cursor 上限。

实现：

- 新增 `server/survival/survival-contract.mjs`。
- 规范化创建、波次结果、奖励选择、放弃和排行榜查询。
- 明确错误类型、HTTP 状态和错误代码。
- 将玩家最大完整度、结果中继承字段和信封版本绑定，不能由客户端改写。

验证：

```powershell
node scripts/test-survival-contract.mjs
```

建议提交：`feat(survival): validate survival contracts`

---

## 【步骤 7】实现运行创建、恢复和放弃服务

目标：

- 以事务创建唯一活动运行，返回已有运行，并能明确放弃。

测试先行：

- 新增 `scripts/test-survival-service.mjs` 的创建与恢复部分。
- 覆盖缺失 NSS 装配、创建成功、公平零升级、冻结装配、固定种子和第 1 波。
- 覆盖相同请求幂等、不同请求但已有活动运行返回同一快照、跨身份隔离和服务器重启恢复。
- 覆盖放弃完成运行、重复放弃、放弃不覆盖更好成绩。

实现：

- 新增 `server/survival/survival-service.mjs`。
- `startRun` 从权威 progression 读取当前 NSS 装配，只冻结装配和零级升级。
- 新运行返回 `201` 语义；已有活动运行返回 `200` 语义和 `created: false`。
- `getHub` 返回活动运行、个人最佳、里程碑状态和排行榜摘要。
- `abandonRun` 原子完成运行并生成主动结束摘要。

验证：

```powershell
node scripts/test-survival-service.mjs
```

建议提交：`feat(survival): create and resume runs`

---

## 【步骤 8】实现波次结算、奖励、里程碑与排行榜事务

目标：

- 原子推进 `wave_ready → reward_pending → wave_ready`，失败进入 `completed`。

测试先行：

- 扩展 `scripts/test-survival-service.mjs`。
- 覆盖胜利计分、冻结三个奖励、失败完成、奖励选择和下一波生成。
- 覆盖完整度、爆裂风险、负面效果、强化、临时超频和风险等级继承。
- 覆盖同请求重试、请求 ID 内容冲突、旧波次、跳过奖励、非法候选、并发双提交和事务回滚。
- 覆盖第 5、10、15、20 波当波发奖、重复运行不重复发奖和权威 progression 返回。
- 覆盖最佳成绩更新、保持和朋友榜五级排序、游标分页、当前排名。

实现：

- 在生存服务中实现 `submitWaveResult`、`selectReward` 和 `listLeaderboard`。
- 结果事务写波次审计、累加分数、更新检查点、发放新里程碑并返回权威 progression。
- 首次击败第 5、10、15、20 波分别发放 `100/200/350/500` 金币，第 20 波后不再发永久金币。
- 奖励事务只接受该波已冻结候选，写选择后检查点并生成下一波信封。
- 使用确定性钱包事件 ID 和现有钱包唯一约束，不修改 progression snapshot schema。

验证：

```powershell
node scripts/test-survival-service.mjs
npm.cmd run test:progression
```

建议提交：`feat(survival): settle waves and rankings`

---

## 【步骤 9】暴露认证 HTTP API

目标：

- 用现有 HTTP 服务和身份中间件暴露六个生存端点。

测试先行：

- 新增 `scripts/test-survival-http.mjs`。
- 覆盖 `GET /api/survival`、创建、结果、奖励、放弃和排行榜。
- 覆盖新建 `201`、恢复 `200`、认证、403、404、409、body 上限、错误映射和 JSON content type。
- 覆盖 `/survival/` SPA 深链接和未知 `/api/` 不回退 HTML。

实现：

- 修改 `server/http-server.mjs`，创建生存服务并增加严格路径正则。
- 修改 `package.json`，增加 `test:survival-contract`、`test:survival-service`、`test:survival-http` 并接入 `test:server`。
- 不增加公网管理端点。

验证：

```powershell
npm.cmd run test:survival-contract
npm.cmd run test:survival-service
npm.cmd run test:survival-http
npm.cmd run test:server
```

建议提交：`feat(survival): expose authenticated api`

---

## 【步骤 10】实现严格客户端 API 与身份隔离队列

目标：

- 客户端严格解析服务端快照，并在断网失败时安全重试同一结果。

测试先行：

- 新增 `tests/unit/survival-client.test.ts` 和 `tests/unit/pending-survival-result.test.ts`。
- 覆盖合法 hub、运行、波次结算、奖励和排行榜响应。
- 覆盖额外字段、未知版本、非法装配、非法候选和非法排序字段。
- 覆盖先落盘再发送、存储失败不发送、身份隔离、 malformed 清理、一次会话只重试一次和冲突标记。

实现：

- 新增 `src/survival/survivalClient.ts`。
- 新增 `src/survival/pendingSurvivalResult.ts`，键包含版本、playerId、runId 和 wave。
- 只给失败结果建立离线队列；奖励选择不离线排队，也不允许离线推进。
- 服务端权威响应清除相应队列并应用返回的 progression。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-client.test.ts tests/unit/pending-survival-result.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): add client api and result queue`

---

## 【步骤 11】实现生存中心和定制器安全返回

目标：

- 从门户查看运行、排名和里程碑，并在缺少装配时安全进入定制器。

测试先行：

- 新增 `tests/unit/survival-center.test.ts` 和 `tests/unit/survival-return.test.ts`。
- 新增定制器 `tests/unit/survivalReturn.test.ts`。
- 覆盖无装配、有活动运行、无活动运行、排行榜离线、放弃确认、返回装配同步和活动运行不被新装配改变。
- 更新 `tests/unit/portal.test.ts`，断言生存入口开放、纹章工坊仍锁定。

实现：

- 新增 `src/ui/survivalCenter.ts`，渲染装配摘要、活动运行、个人最佳、里程碑和前 20 榜单。
- 新增 `src/survival/survivalReturn.ts`，严格处理 `/survival/?return=survival&...`。
- 修改 `src/ui/portal.ts`，开放 `/survival/`、应用返回装配并重试当前身份待提交结果。
- 新增 `battle-top-designer/web-customizer/src/integration/survivalReturn.ts`，最小修改 `App.tsx` 增加保存/取消返回按钮。
- 修改 `src/style.css`，实现桌面与 390px 移动端布局；不增加持续 3D 预览。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-center.test.ts tests/unit/survival-return.test.ts tests/unit/portal.test.ts
npm.cmd run test:nss-contract
node node_modules/typescript/bin/tsc --noEmit
```

在 `battle-top-designer/web-customizer` 目录运行：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survivalReturn.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): add hub and safe loadout return`

---

## 【步骤 12】接入 Arena 生存 bootstrap 与控制器

目标：

- Arena 只有在获得服务器当前波信封后才启动，并保持其他模式互斥。

测试先行：

- 新增 `tests/unit/survival-bootstrap.test.ts` 和 `tests/unit/survival-controller.test.ts`。
- 覆盖缺失身份、非法 runId、跨身份、已完成、reward_pending、离线、未知版本、资源失败和成功恢复。
- 覆盖 `challenge`、`campaign`、`survival` 任意两个同时出现都判非法。
- 断言冻结装配、零级升级、场地、AI、种子、强度、继承状态和局内强化逐项传给 Game。

实现：

- 新增 `src/survival/survivalBootstrap.ts` 和 `src/survival/survivalController.ts`。
- 新增 `src/gameplay/survival/survivalRun.ts`，只负责将权威检查点转换为 Game 可使用的纯运行修正，不保存第二份权威进度。
- 修改 `src/main.ts`，增加互斥 survival 分支和明确错误页。
- 修改 `src/ui/menus.ts`，Arena 生存按钮导航 `/survival/`，不直接启动旧占位逻辑。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-bootstrap.test.ts tests/unit/survival-controller.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): bootstrap frozen waves`

---

## 【步骤 13】把继承状态和局内强化接入现有战斗

目标：

- 最小修改 `game.ts`，正确应用生存检查点，普通战斗逻辑保持不变。

测试先行：

- 新增 `tests/unit/survival-game-boundaries.test.ts`。
- 扩展 `tests/unit/game-simulation-boundaries.test.ts`，锁定普通、挑战、战役和真人分支。
- 覆盖完整度、爆裂风险、负面效果继承，转速、能量、位置重置。
- 覆盖公平零升级、章节/风险强度、三级强化、属性调谐、拾取强化和单波临时超频。
- 覆盖模型失败不提交结果、不消耗波次并返回中心。
- 断言生存模式不走本地快速战斗金币路径。

实现：

- 修改 `src/app/game.ts`，增加最小 `GameSurvivalOptions` 接点和独立 `battleKind: 'survival'` 分支。
- 修改必要的 `src/gameplay/top.ts`、`modifiers.ts`、`pickups.ts` 或属性修正入口，只添加当前规则需要的显式生存修正。
- 移除旧 `survivalWave`、`survivalScore` 占位状态，由 controller/checkpoint 提供。
- 不重构无关的 `game.ts` 代码。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-game-boundaries.test.ts tests/unit/game-simulation-boundaries.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): apply persistent run state`

---

## 【步骤 14】实现生存 HUD、奖励面板和最终摘要

目标：

- 完成待确认、三选一、下一波、失败、放弃和排名反馈。

测试先行：

- 新增 `tests/unit/survival-presentation.test.ts`。
- 覆盖 HUD 的波次类型、分数、倍率、继承提示、强化和网络状态。
- 覆盖三个奖励卡、无效选择禁止、提交中锁定、提交成功和失败重试。
- 覆盖最终分数明细、最佳更新、排名变化、里程碑、装配和强化路线。
- 覆盖移动端按钮标签和可访问名称。

实现：

- 修改 `src/ui/hud.ts`，替换旧生存占位文本为权威生存 HUD。
- 新增 `src/ui/survivalRewardPanel.ts` 和 `src/ui/survivalResults.ts`，保持各组件职责单一。
- 对 `src/ui/results.ts` 只增加必要的生存详情接点，或由独立摘要组件承接，避免继续扩大通用 ResultPanel。
- 修改 `src/app/game.ts`，胜利后先提交、再显示冻结奖励；奖励确认后才启用下一波。
- 修改 `src/style.css`，确保奖励卡移动端纵向排列、44px 触控和无横向溢出。

验证：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/survival-presentation.test.ts tests/unit/survival-controller.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

建议提交：`feat(survival): render rewards and run summary`

---

## 【步骤 15】完成真实浏览器闭环与双身份验证

目标：

- 使用真实 HTTP、SQLite、门户和 Arena 证明完整生存闭环。

测试先行：

- 新增 `tests/e2e/survival.spec.ts`，使用随机临时数据库和端口，不连接当前朋友服。
- 新增定制器 `tests/e2e/survival-return.spec.ts`。

浏览器场景：

1. 新身份从门户进入生存中心，入口为开放状态。
2. 缺少 NSS 装配时进入定制器并安全返回。
3. 创建运行，实际启动第 1 波非零 Canvas。
4. 快速结算前五波，验证普通、精英、BOSS 和每波三选一。
5. 验证完整度、爆裂风险、强化和风险契约跨波继承。
6. 波次中刷新恢复同一敌人，不重抽奖励。
7. 断网胜利停在确认页，恢复后只推进一次。
8. 重启真实 HTTP 服务后继续同一活动运行。
9. 失败完成运行并更新个人最佳。
10. 第二浏览器身份拥有独立运行和待提交队列，并出现在朋友榜。
11. 使用仅测试可用的快速结算推进至第 20 波，验证四个里程碑。
12. 第二次运行重复到第 20 波，金币不重复发放。
13. 桌面和 390×844 移动端无溢出，奖励卡和主要按钮可操作。
14. 捕获 `pageerror`、控制台错误、关键截图和 Canvas 尺寸。

验证：

```powershell
node node_modules/@playwright/test/cli.js test tests/e2e/survival.spec.ts
```

在 `battle-top-designer/web-customizer` 目录运行：

```powershell
node node_modules/@playwright/test/cli.js test tests/e2e/survival-return.spec.ts --project=desktop
```

建议提交：`test(survival): cover endless run recovery flow`

---

## 【步骤 16】全量回归、生产构建与部署前检查

目标：

- 证明阶段 7 不破坏既有系统，并生成新的可部署统一站点。

回归：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
npm.cmd run test:server
npm.cmd run test:nss-contract
node node_modules/@playwright/test/cli.js test
```

在 `battle-top-designer/web-customizer` 目录执行：

```powershell
npm.cmd run test:unit
npm.cmd run build
node node_modules/@playwright/test/cli.js test tests/e2e/campaign-return.spec.ts tests/e2e/survival-return.spec.ts --project=desktop
```

构建：

1. 解析并验证 `dist/site` 的绝对路径位于工作区。
2. 若存在，将该单一目录移动为新的 `dist/site-before-survival-<timestamp>`；不覆盖、不递归删除。
3. 执行：

```powershell
npm.cmd run build
npm.cmd run verify:site
```

最终检查：

- `/`、`/survival/`、`/arena/?survival=<runId>` 和 `/customizer/` 使用同源资源。
- 迁移 `001–006`、备份恢复、四个里程碑和排行榜契约通过。
- 快速战斗、八人战役、好友挑战、真人房间、身份认领和进度同步全部回归。
- `git diff --check` 通过。
- 已跟踪工作树干净；用户原有未跟踪文件保持原样。
- 只读检查当前 Node 和 Tunnel 状态，不自动停止、迁移或替换公网服务。

建议最终提交：`feat(survival): complete deterministic endless mode`

## 测试矩阵

| 层级 | 主要证明 |
|---|---|
| 共享规则 | 波次、奖励、倍率、计分和排名可复现 |
| 数据库 | 006 升级、约束、活动运行唯一、重启和恢复 |
| 服务层 | 状态机、事务、幂等、金币和最佳成绩 |
| HTTP | 六个端点、身份、严格错误和 SPA 深链接 |
| 客户端 | 严格解析、模式互斥、冻结装配和离线结果队列 |
| Game | 状态继承、公平零升级、强化和无本地奖励 |
| UI | 生存中心、HUD、三选一、摘要和移动端适配 |
| 浏览器 | 五波循环、20 波里程碑、刷新、重启和双身份 |
| 回归 | 战役、挑战、真人房间、NSS、备份与构建 |

## 提交与工作树策略

- 每一步先看到目标测试失败，再做最小实现并通过对应测试。
- 不使用 `git add --all`；只显式暂存当前步骤文件。
- 不暂存、不移动、不格式化用户已有未跟踪文件。
- 迁移 `006` 一旦部署后不再修改；上线后发现错误使用新迁移修复。
- 避免为阶段 8 及以后预留接口、配置或通用框架。
- 公网备份、数据库迁移、Node 重启和 Tunnel 切换单独说明影响并征得确认。

## 风险与限制

- 客户端战斗结果遵循私人朋友服信任模型；严格契约不等于防作弊。
- `game.ts` 体积较大，本阶段只提取生存运行适配，不做无关重构。
- 无尽难度在 200% 处封顶，后期挑战来自持续损伤、奖励机会成本、AI 和装配轮换。
- 奖励、倍率和金币数值必须与批准规格一致；任何平衡调整都需单独说明并更新规格。
- 完整 E2E 耗时较长，必须使用独立临时数据库，不能操作朋友服生产数据。

## 完成检查清单

- [ ] 规格中的所有玩法规则均有实现和测试。
- [ ] 没有新增未批准的复活、赛季、观战或离线多波能力。
- [ ] 共享规则只有一个权威来源。
- [ ] 服务端状态机和所有奖励事务幂等。
- [ ] 生存局内强化不会污染永久进度。
- [ ] 已有四种主要玩法没有回归。
- [ ] 移动端和桌面端均完成真实浏览器验证。
- [ ] 构建、备份和部署边界符合项目安全规则。
