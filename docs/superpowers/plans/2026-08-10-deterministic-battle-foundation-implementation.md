# NSS Arena 阶段 5A：确定性战斗基础实施计划

日期：2026-08-10

关联规格：`docs/superpowers/specs/2026-08-09-deterministic-battle-foundation-design.md`

## 1. 目标

在不改变现有装配属性、博弈动作、发射、QTE、技能、碰撞和胜负规则的前提下，实现以下可验证能力：

1. 使用外部 128 位种子创建版本化比赛上下文。
2. 用 `combat`、`ai`、`physics`、`spawn` 四条互不干扰的随机流替换全部战果随机。
3. 战斗状态按固定 60Hz 推进，视觉和音频仍按真实帧率更新。
4. 记录发射参数、逐 tick 语音值、每回合 `decisionTicks`、动作和 QTE 最终分数。
5. 相同版本、种子、初始状态和记录得到字节一致的结果摘要。

## 2. 成功标准

- 固定 RNG 测试向量在 Node 和浏览器一致。
- 四条随机流互不消费彼此状态。
- 30Hz、60Hz、144Hz 等长渲染时间产生相同战斗 tick 数。
- 战果模块不再隐式调用或回退到 `Math.random()`。
- 持续语音助威保留；玩家值按 tick 量化记录，AI 值确定性生成。
- `decisionTicks` 能复现玩家选择耗时和当前超时规则。
- 两个浏览器上下文执行记录/复验后输出完全相同的摘要字符串。
- 当前单元测试、NSS 契约、构建及相关 Playwright 测试全部通过。

## 3. 范围限制

- 不新增挑战数据库迁移、HTTP API、收件箱或挑战 UI。
- 不提取完整 headless 战斗引擎。
- 不修改伤害、属性、AI 权重、QTE 数值或碰撞调参。
- 不重构无关视觉、音频、网络或装配代码。
- 不处理工作区已有未跟踪资源，不使用批量删除。

---

## 【步骤 0】建立实施前基线

### 目标

证明当前分支在 5A 编码前通过既有核心门禁，避免把旧问题误判为本阶段回归。

### 修改文件

无。

### 执行

```powershell
npm run test:unit
npm run test:nss-contract
npm run build
```

记录单元测试文件数、测试数和构建结果。任一命令失败则停止，不进入步骤 1。

### 验证

- 三条命令退出码均为 0。
- `git status --short` 中只有实施前已存在的未跟踪资源。

---

## 【步骤 1】增加共享模拟版本和确定性 PRNG

### 目标

建立唯一的 `simulationVersion` 来源、种子契约和四条领域随机流。

### 文件

新增：

- `src/sim/rng.ts`
- `src/sim/battleSeed.ts`
- `tests/unit/rng.test.ts`

修改：

- `battle-top-designer/shared/nss/versions.json`
- `scripts/test-nss-contract.mjs`
- `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`

### 先写失败测试

在 `tests/unit/rng.test.ts` 覆盖：

1. 合法 32 位小写十六进制种子。
2. 长度错误、大写、非十六进制和空种子返回 `INVALID_BATTLE_SEED`。
3. `nextUint32()` 固定向量和无符号边界。
4. `nextFloat()` 始终位于 `[0, 1)`。
5. `nextInt(min, maxExclusive)` 的半开区间、空区间和非整数边界。
6. 重建上下文得到相同序列。
7. 单独消费 `ai` 不改变 `combat`、`physics` 或 `spawn` 序列。
8. 非法领域名称被拒绝。

先运行并确认测试因模块不存在而失败：

```powershell
npm run test:unit -- rng
```

### 最小实现

`rng.ts`：

- 定义 `RandomSource`。
- 实现固定 32 位字符串哈希。
- 实现 `mulberry32`。
- 显式使用 `>>> 0` 保持无符号 32 位语义。
- 不引入依赖，不访问全局随机数。

`battleSeed.ts`：

- 从共享 `versions.json` 读取 `simulationVersion`，不得在多个业务文件重复硬编码。
- 导出 `CURRENT_SIMULATION_VERSION`、`BattleSeed`、种子验证和 `createBattleSeed()`。
- 本地种子使用 `crypto.getRandomValues()` 生成。
- 按固定文本 `nss-arena|simulation-v1|<seed>|<domain>` 派生四条流。
- 创建 `BattleSimulationContext`。

共享版本：

- 在 `versions.json` 增加 `simulationVersion: 1`。
- 同步根契约脚本和定制器契约测试的精确对象断言。

### 验证

```powershell
npm run test:unit -- rng
npm run test:nss-contract
Set-Location battle-top-designer\web-customizer
npm run test:unit -- nssSharedContract
Set-Location ..\..
```

### 推荐提交

```text
feat(sim): add versioned deterministic battle RNG
```

---

## 【步骤 2】实现独立固定步进器

### 目标

先在纯单元测试中证明 60Hz 累加、余量保留、补算上限和重置规则，再接触主循环。

### 文件

新增：

- `src/sim/fixedStep.ts`
- `tests/unit/fixed-step.test.ts`

### 先写失败测试

覆盖：

1. 固定时间片为 `1 / 60`。
2. 30Hz、60Hz、144Hz 输入在相同总时长并排空余量后执行相同 tick 数。
3. 单帧最多执行 4 个 tick。
4. 超出当帧上限的余量保留到后续帧。
5. 浮点边界容差不会多执行或少执行一个 tick。
6. `reset()` 清零累加器和 `tickCount`。
7. 负数、`NaN` 和无穷 `dt` 被拒绝。

```powershell
npm run test:unit -- fixed-step
```

### 最小实现

实现 `FixedStepClock`：

- 常量 `FIXED_BATTLE_DT = 1 / 60`。
- 常量 `MAX_BATTLE_STEPS_PER_FRAME = 4`。
- `advance(frameDt, onTick)` 只负责累计和按顺序调用固定 tick。
- 使用固定极小容差比较 tick 边界，并清理扣减后的极小残差。
- 不包含 Game、DOM、Three.js 或随机数逻辑。

### 验证

```powershell
npm run test:unit -- fixed-step
```

### 推荐提交

```text
feat(sim): add fixed battle step clock
```

---

## 【步骤 3】实现战斗记录、结果摘要与语音输入模型

### 目标

建立纯数据层，不直接编排 `Game`。

### 文件

新增：

- `src/sim/battleRecord.ts`
- `src/sim/voiceBoost.ts`
- `tests/unit/battle-record.test.ts`
- `tests/unit/voice-boost.test.ts`

### 先写失败测试

`battle-record.test.ts`：

1. 创建带版本、种子、空语音帧和空回合的记录。
2. 发射力度和角度按现有合法范围规范化。
3. `turnIndex` 必须从 1 连续递增。
4. `decisionTicks` 拒绝负数、非整数、非安全整数和超过回合等待上限的值。
5. 玩家语音帧只接受 `0..255` 整数，并与 `tickCount` 对齐。
6. 动作种类和攻击技能 ID 必须是当前规则支持值。
7. QTE 分数必须为有限数。
8. AI 复验不一致返回 `AI_REPLAY_MISMATCH`。
9. 摘要数值保留三位小数，`-0` 输出为 `0`。
10. `NaN` 和无穷最终状态返回 `INVALID_BATTLE_OUTCOME`。
11. 同一对象经唯一构造函数和 `JSON.stringify()` 得到稳定字段顺序。

`voice-boost.test.ts`：

1. 原始玩家音量裁切并映射到 `0..255`。
2. 回放值稳定还原为 `saved / 255`。
3. 固定 `ai` 流和固定 tick 产生相同 AI 音量序列。
4. 触发 AI shout 后只在 shout 窗口消费规定的随机值。
5. 重置后相同种子复现相同相位、计时和音量。

### 最小实现

`battleRecord.ts`：

- 定义 `BattleInputLogV1`、`BattleTurnInputV1`、`BattleOutcomeSummaryV1` 和 `FinalTopState`。
- 定义稳定错误码及轻量错误类型。
- 提供记录构造、追加语音帧、追加回合、补写 QTE 结果、验证和规范化摘要函数。
- 提供最小 `BattleReplayCursor`：按 tick 返回保存的玩家语音、按 `decisionTicks` 暴露下一动作，并校验重新派生的 AI 发射参数和回合动作。
- 不实现独立战斗引擎，不包含身份、装配、纹章或数据库字段。

`voiceBoost.ts`：

- 提供玩家音量量化/还原函数。
- 实现只由固定 tick 和 `ai` 随机流驱动的 AI 助威状态。
- AI 助威状态不创建音频节点、不访问 DOM。

### 验证

```powershell
npm run test:unit -- battle-record voice-boost
```

### 推荐提交

```text
feat(sim): add deterministic battle records and voice input
```

---

## 【步骤 4】提取并迁移 AI 结果随机

### 目标

把主 Game 和旧对峙 AI 中影响战果的随机选择迁移到显式 `ai` 流，同时保持现有权重和阈值不变。

### 文件

修改：

- `src/gameplay/ai.ts`
- `src/gameplay/clashAI.ts`
- `src/app/game.ts`（仅把 AI 选择调用改为新函数；主循环尚不改）

新增：

- `tests/unit/deterministic-ai.test.ts`

### 先写失败测试

覆盖：

1. 相同状态和 `ai` 序列得到相同 `TurnAction`。
2. 潜行误导、低精神、assault、fortress 和普通权重分支。
3. 技能加权选择不再调用 `utils.pick()` 的全局随机。
4. 敌方发射力度和角度由 `ai` 流产生且保持原范围。
5. AI QTE 初始压力和每 tick 增量使用显式 `ai` 流；正弦相位使用固定 tick 时间，不读取渲染用 `Game.time`。
6. `ClashAI.decide()` 的潜行、攻击力度和普通权重使用注入流。
7. `ArenaAI.update()` 保持原移动公式，不新增随机。

### 最小实现

- 在 `ai.ts` 增加纯函数形式的回合动作、发射参数和 QTE AI 计算。
- 所有函数接收 `RandomSource`，不保存全局状态。
- `ClashAI.decide()` 显式接收 `RandomSource`。
- `Game.pickAiTurnAction()` 删除或缩减为调用纯函数的薄包装。
- 不调整现有概率阈值、技能权重或发射范围。

### 验证

```powershell
npm run test:unit -- deterministic-ai
```

### 推荐提交

```text
refactor(sim): seed AI outcome decisions
```

---

## 【步骤 5】迁移伤害、反射、技能和道具随机

### 目标

完成 `combat`、`physics`、`spawn` 三条流的结果调用迁移。

### 文件

修改：

- `src/gameplay/damage.ts`
- `src/gameplay/battlePhysics.ts`
- `src/gameplay/skills.ts`
- `src/gameplay/pickups.ts`
- `tests/unit/battle-baseline.test.ts`
- `tests/unit/elemental-damage.test.ts`

新增：

- `tests/unit/outcome-randomness.test.ts`
- `tests/unit/outcome-random-guard.test.ts`

### 先写失败测试

1. `calculateTurnDamage()` 缺少 `combat` 随机源时无法通过类型或调用契约，不再默认回退。
2. 固定序列分别覆盖闪避、命中、暴击和普通命中。
3. `TurnArbitrator.executeTurnResolution()` 显式接收 `combat` 与 `physics` 流。
4. 轻反射和重反射的返还、反冲比例保持原范围并可复现。
5. 幻影分身到期位置由 `physics` 流选择；火焰网格抖动仍可使用视觉随机。
6. 道具生成角度和半径由 `spawn` 流产生；动画不消费该流。
7. 静态守卫确认纯结果模块 `damage.ts`、`battlePhysics.ts`、`ai.ts`、`clashAI.ts`、`pickups.ts` 不包含 `Math.random()`。

### 最小实现

- `DamageContext.random` 改为必填 `RandomSource` 或必填随机函数，并更新全部调用点。
- `TurnArbitrator.executeTurnResolution()` 增加显式随机参数对象，不给默认值。
- `SkillManager` 的模拟更新接收 `physics` 流；仅幻影分身结果消费它。
- 将 `SkillManager.update()` 拆为最小的 `updateSimulation()` 与 `updateVisual()`：状态持续时间、吸引、冻结伤害和到期结果走固定时间；Shader、网格抖动和材质动画走视觉时间。
- `PickupManager.update()` 或实际生成入口显式接收 `spawn` 流。
- 用注入测试替换现有 `vi.spyOn(Math, 'random')`。
- 不修改伤害、反射、技能或道具数值。

### 验证

```powershell
npm run test:unit -- battle-baseline elemental-damage outcome-randomness outcome-random-guard
```

### 推荐提交

```text
refactor(sim): seed all non-AI outcome randomness
```

---

## 【步骤 6】把比赛上下文和固定 tick 接入 Game

### 目标

在现有 `Game` 中完成最小编排，使结果状态只在固定 tick 中更新，视觉保持逐渲染帧更新。

### 文件

修改：

- `src/app/game.ts`
- `src/ui/voiceBoostOverlay.ts`
- `src/audio/synth.ts`（只移除被确定性模拟替代的旧 AI 音量状态；其他声音保持不变）

新增：

- `tests/unit/game-simulation-boundaries.test.ts`

### 先写失败测试

对可提取的边界函数覆盖：

1. 新比赛创建新上下文并重置时钟、tick、记录和四条流。
2. 显式种子从 `startBattle(seed)` 贯穿异步 NSS 模型加载路径。
3. 本地未传种子时只在开局生成一次。
4. Hit-stop 秒数转换为固定 tick，暂停 tick 数与渲染帧率无关。
5. `awaiting` 每个 tick 增加当前回合 `decisionTicks`，合法动作接受后停止。
6. 玩家语音每个战斗 tick 记录一次，回放模式不再读取麦克风。
7. 语音爆发窗口固定为 180 tick；UI 读取剩余秒数但不决定加成是否生效。
8. 结果摘要在进度奖励改变外部状态前生成并冻结。

### 最小实现

#### 6.1 生命周期

- `startBattle(seed = createBattleSeed())` 在用户开始一局时确定种子。
- 异步 NSS 模型加载完成后把同一种子传给 `startBattleWithPlayer()`。
- `startBattleWithPlayer()` 创建 `BattleSimulationContext`、`FixedStepClock`、记录器、回放游标和确定性 AI 语音状态。
- `doLaunch()` 记录规范化后的双方发射参数并把战斗 tick 从零开始。
- 返回菜单或开始下一局时不复用旧上下文。

#### 6.2 更新边界

把现有 `update(dt)` 保留为渲染帧入口，并提取：

- `updateBattleTick(FIXED_BATTLE_DT)`：只做会改变战果的状态更新。
- `updateVisualFrame(dt)`：网格、材质、粒子、镜头、音频、HUD 和网络发送节奏。

固定 tick 中包含：

- 回合/QTE/等待计时。
- Hit-stop tick。
- 语音加成和语音窗口。
- `SkillManager.updateSimulation()`。
- `BattlePhysicsSystem.update()`。
- 精神、转速、倾斜、标签替换和后台充能。
- 结果检查及状态转换。

视觉帧中保留：

- 麦克风读取与玩家音量条显示。
- `SkillManager.updateVisual()`。
- `TopEntity.syncMesh()` 和 `updateEffects()`。
- 火花、闪电、尾迹、镜头、Bloom、竞技场和 HUD。
- 纯视觉 `Math.random()`。

#### 6.3 语音

- 每个渲染帧最多读取一次麦克风并缓存量化值；同一渲染帧补算多个 tick 时重复使用该缓存值并逐 tick 记录。
- QA/回放可提供固定量化值，覆盖麦克风但不改变 UI 结构。
- AI 战斗音量由 `DeterministicAiVoiceBoost` 在固定 tick 更新。
- `VoiceBoostOverlay` 接收 Game 提供的权威剩余秒数；内部真实 `dt` 只用于显示动画，不再决定属性加成窗口。
- 原 `AiVoiceSimulator` 不再作为战斗数据源；若完全无调用，只删除这次改动造成的冗余，不调整其他 SynthAudio 行为。

#### 6.4 回合和 QTE 记录

- 动作被接受时记录当前 `decisionTicks`、玩家动作和重新派生的 AI 动作。
- QTE 完成时只补写最终双方分数。
- 回放游标按保存的 `decisionTicks` 自动提交动作，并比较 AI 派生结果。
- 在线 Guest 继续消费 Host 裁决；不在 Guest 重复消费 Host 的战果随机。

#### 6.5 结果

- `showResult()` 首次进入时生成并冻结 `BattleOutcomeSummaryV1`。
- 重复调用不得改变已生成摘要。
- 进度奖励、菜单切换和视觉结算不进入摘要。

### 验证

```powershell
npm run test:unit -- game-simulation-boundaries battle-record fixed-step voice-boost
npm run build
```

### 推荐提交

```text
feat(sim): run battle outcomes on fixed deterministic ticks
```

---

## 【步骤 7】增加 QA 接口和浏览器整场复验

### 目标

证明记录模式与回放模式在独立浏览器上下文和不同渲染节奏下得到同一结果摘要。

### 文件

修改：

- `src/app/game.ts`（只扩展现有 `__RIPTOP_QA__`）

新增：

- `tests/e2e/deterministic-battle.spec.ts`

### QA 接口

在 `?qa=1` 下增加最小测试入口：

- `startBattleWithSeed(seed)`。
- `setVoiceSample(byteOrNull)`。
- `getBattleInputLog()`。
- `startBattleReplay(log)`。
- `getBattleOutcomeSummary()`。

不在正式 UI 暴露种子编辑器或回放按钮。

### 先写失败测试

Playwright 流程：

1. 浏览器 A 使用固定种子、固定装配和固定 QA 语音值开始记录。
2. 通过现有 QA 战斗入口执行一个能自然结束的短黄金战局，并取得完整输入记录和结果摘要字符串。
3. 浏览器 B 使用同一初始状态加载该记录，自动按 `decisionTicks`、语音帧、动作和 QTE 最终分数复验。
4. 两个摘要字符串必须完全相同。
5. 浏览器 A 与 B 分别使用约 30Hz 和 144Hz 的测试 RAF 调度，证明渲染节奏不影响复验。
6. 第三个上下文只改变种子，至少一个结果相关字段必须不同。
7. 收集 `pageerror`，必须为空。

黄金战局只通过现有 QA 能力缩短初始生命或补充精神，不新增正式玩法捷径；两个上下文必须应用完全相同的初始测试状态。

### 验证

```powershell
npx playwright test tests/e2e/deterministic-battle.spec.ts --project=arena-desktop
```

### 推荐提交

```text
test(sim): verify deterministic battle replay in browsers
```

---

## 【步骤 8】执行完整回归与完成检查

### 目标

确认 5A 满足规格且没有改变既有玩法。

### 修改文件

仅在测试确实暴露本阶段回归时修改对应必要文件；不顺便重构。

### 验证顺序

```powershell
npm run test:unit
npm run test:nss-contract
npm run build
npx playwright test tests/e2e/baseline.spec.ts tests/e2e/affinity-ui.spec.ts tests/e2e/deterministic-battle.spec.ts --project=arena-desktop
```

如环境允许，再执行：

```powershell
npm run test:e2e
```

### 静态检查

```powershell
rg -n "Math\.random" src/gameplay/damage.ts src/gameplay/battlePhysics.ts src/gameplay/ai.ts src/gameplay/clashAI.ts src/gameplay/pickups.ts
git diff --check
git status --short
```

第一条命令预期无匹配；`skills.ts`、`game.ts`、`fx`、`scene` 和 `audio` 中经批准的纯视觉随机允许保留。

### 完成清单

- [ ] 所有成功标准均有自动化证据。
- [ ] 现有数值、概率阈值和战斗操作未改变。
- [ ] 结果随机没有隐式全局回退。
- [ ] 视觉随机没有消费比赛随机流。
- [ ] 玩家语音内容未保存，只保存 `0..255` 音量级。
- [ ] `decisionTicks` 与当前回合超时规则一致。
- [ ] 未新增挑战服务、数据库或 UI。
- [ ] 未修改或暂存已有未跟踪资源。
- [ ] 每个提交只包含当前步骤文件。

### 最终提交

若步骤 8 只产生必要测试修正：

```text
test(sim): complete deterministic battle regression coverage
```

若没有文件变化，不创建空提交。

## 4. 主要风险与控制

### 风险 1：`Game.update()` 同时包含表现和战果

控制：只提取 `updateBattleTick()` 和 `updateVisualFrame()` 两个边界，不重写 Game 架构；每移动一类状态先加测试。

### 风险 2：技能更新混合 Shader 与战斗状态

控制：仅把现有 `SkillManager.update()` 按“会否改变战果”拆成两个方法，不改变技能数据或效果公式。

### 风险 3：语音 UI 计时当前决定属性窗口

控制：Game 的固定 tick 成为唯一权威，UI 只显示传入的剩余时间；玩家原始音频不进入记录。

### 风险 4：在线模式随机消费重复

控制：Host 继续负责裁决，Guest 只使用 Host 结果；现有网络消息格式本阶段不扩展。

### 风险 5：混合模块仍保留视觉 `Math.random()`

控制：静态守卫覆盖纯结果模块；`skills.ts` 和 `game.ts` 的剩余调用逐处审查并用结果分支单元测试约束。

### 风险 6：浮点累加造成边界差一 tick

控制：固定容差、残差清理和 30/60/144Hz 测试向量同时约束。

## 5. 预期文件范围

预计新增：

- `src/sim/rng.ts`
- `src/sim/battleSeed.ts`
- `src/sim/fixedStep.ts`
- `src/sim/battleRecord.ts`
- `src/sim/voiceBoost.ts`
- 7 个左右针对性单元测试文件
- `tests/e2e/deterministic-battle.spec.ts`

预计修改：

- 共享版本清单及两个契约测试
- `src/app/game.ts`
- `src/gameplay/ai.ts`
- `src/gameplay/clashAI.ts`
- `src/gameplay/damage.ts`
- `src/gameplay/battlePhysics.ts`
- `src/gameplay/skills.ts`
- `src/gameplay/pickups.ts`
- `src/ui/voiceBoostOverlay.ts`
- `src/audio/synth.ts`
- 少量现有随机注入测试

超出上述范围的修改必须先说明原因；与确定性无关的优化不进入本阶段。
