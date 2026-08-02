# NSS 七属性战斗接入实施计划

日期：2026-08-02
状态：待批准
对应规格：`docs/superpowers/specs/2026-08-02-affinity-battle-integration-design.md`
对应总计划：`docs/superpowers/plans/2026-08-01-nss-arena-complete-expansion-implementation.md` 阶段 3

## 1. 需求理解

本阶段把已经存在的 NSS 五层七属性档案接入 RIPTOP Arena 的现有博弈战斗。装配、发射、回合按钮、AI 行动、QTE、实时碰撞和胜负流程保持不变；属性只影响已经批准的主动伤害、协调护甲、自然转速衰减和倾斜增长，并通过战前、战中、战后信息解释结果。

实施按六个独立提交完成：

1. 统一 NSS、legacy 和中立战斗属性档案。
2. 把主动伤害拆成 80% 物理与 20% 元素。
3. 接入协调护甲、自然转速和倾斜稳定性。
4. 分离技能表现流派和实际攻击属性。
5. 增加 VS、HUD、日志和结算信息。
6. 建立全组合、全属性和平衡保护门禁。

## 2. 目标与成功标准

目标：让七属性真实参与现有战斗，但不替换或重做战斗模式。

成功标准：

- `BattleStats.affinity` 对所有构筑必填，NSS V1/V2、legacy 和合法中立构筑均有确定结果。
- legacy 原基础数值不漂移、永不获得五层共鸣；原 `attributes` 兼容字段继续工作。
- 主动命中的中立无共鸣结果与旧伤害完全一致，物理与元素分项始终加总为最终伤害。
- 协调共鸣只应用在派生护甲、自然转速衰减、低转速倾斜新增量和碰撞倾斜新增量各一个位置。
- 技能名称、按钮、等级、消耗、状态效果和视觉不因构筑属性改变。
- 房主权威结算，客机只镜像扩展结果，不重新计算属性伤害。
- 玩家能在 VS、HUD、日志和结算中看懂主属性、克制、共鸣与伤害贡献。
- 288 套 NSS 模型组合、全部 `7^5 = 16,807` 种五层属性分布及 15% 构筑差距保护门禁通过。
- 根单测、NSS 契约、服务端测试、构建、统一站点验证和浏览器专项测试通过。

## 3. 假设、约束与明确边界

### 3.1 已确认假设

- legacy 映射固定为 `ROCK → EARTH`、`LIGHTNING → WIND`、`DIVINE → LIGHT`；其余同名七属性直接保留。
- legacy 主属性并列顺序固定为 `WIND, FIRE, WATER, WOOD, EARTH, LIGHT, DARK`，不使用部件槽位破同分。
- 只有合法 legacy 无属性构筑是中立；异常 NSS 输入继续抛错。
- 反射返回伤害保留原攻击者主属性；反射者冲击余波是独立的中立物理结果。
- `battleRulesVersion` 升为 `2`，WebSocket `PROTOCOL_VERSION` 保持 `2`。
- 当前根 Vitest 使用 Node 环境且没有 DOM 模拟器。UI 采用纯展示模型单测和 Playwright 真实 DOM 测试，不新增 `jsdom`。

### 3.2 新确认的碰撞倾斜规则

当前代码没有直接的碰撞倾斜，只有碰撞转速损失后触发的低转速倾斜。按批准补充以下确定性规则：

```text
collisionTiltGain = clamp(impulseMagnitude × 0.0025, 0, 0.04)
appliedCollisionTiltGain = collisionTiltGain × defender.affinity.modifiers.tiltGrowthMultiplier
```

- 只在一次有效、未屏蔽的实时碰撞中增加倾斜。
- 护盾完全挡住该侧碰撞时，该侧不增加碰撞倾斜。
- `suppressDamage` 只抑制伤害，不改变既有碰撞运动；新增倾斜与现有伤害分支放在一起，因此被抑制的演出碰撞不增加倾斜。
- 每次增量上限为 `0.04`，最终 `tilt` 仍使用现有 `0..1.3` 限制。
- 不修改碰撞冲量、速度、转速损失、碰撞伤害或碰撞次数。

### 3.3 不实施

- 不新增技能、属性、按钮、战斗动作或 AI 决策。
- 不让实时碰撞、墙壁、场地危险、自然衰减或状态伤害获得元素伤害。
- 不修改定制器分享 V2、本地存档 schema、邀请身份或公网服务。
- 不引入新的全局状态库、DOM 测试依赖或通用战斗框架。
- 不借本阶段重构 `src/app/game.ts`、`src/gameplay/battlePhysics.ts` 的无关逻辑。
- 不自动调整已批准的共享倍率；若平衡测试失败，停止实施并报告具体反例。

## 4. 执行纪律与通用验证

每项任务严格采用红灯—绿灯顺序：

1. 先检查目标文件是否存在用户未提交修改。
2. 先增加最小失败测试并运行，确认失败原因正是待实现行为。
3. 实现最少代码使专项测试通过。
4. 运行相关回归测试、构建或浏览器用例。
5. 只暂存本任务列出的文件，检查暂存 diff 后独立提交。

禁止使用 `git add .`、`git add -A`、`git commit -am`，不得暂存 `referse/`、素材、Playwright 输出或其他用户未跟踪文件。

根最终门禁：

```powershell
npm run test:unit
npm run test:nss-contract
npm run test:server
npm run build
npm run verify:site
npm run test:e2e -- affinity-battle.spec.ts
npm run test:e2e -- baseline.spec.ts
git diff --check
```

定制器契约门禁：

```powershell
Set-Location battle-top-designer\web-customizer
npm run test:unit -- nssSharedContract nssBattleStats
npm run build
```

完整 Playwright 套件只在六项任务全部通过后运行一次；如果无关旧用例超时，保留专项结果并单独记录，不扩大当前修改范围。

## 5. 【步骤 1】建立统一战斗属性档案

### 目标

让每个 `BattleStats` 都携带唯一、已解析的 `BattleAffinityProfile`，后续伤害、物理和 UI 只消费该档案。

### 文件

- 新增 `src/gameplay/battleAffinity.ts`
- 修改 `src/gameplay/build.ts`
- 修改 `src/nss/buildStats.ts`
- 修改 `battle-top-designer/shared/nss/versions.json`
- 修改 `scripts/test-nss-contract.mjs`
- 修改 `tests/unit/battle-baseline.test.ts`
- 新增 `tests/unit/battle-affinity-profile.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/unit/nssBattleStats.test.ts`

不修改 `src/nss/types.ts`：V1/V2 和五层属性类型已经完整。

### 红灯测试

在 `battle-affinity-profile.test.ts` 先覆盖：

- V2 五层属性档案与 `resolveAffinityProfile()` 深度相等。
- V1 先走 `migrateNssBattleLoadout()`，再产生默认五层档案。
- legacy 的同名属性、三项迁移、数量计数、固定并列顺序。
- legacy 有属性时 `source: legacy`，无属性时 `source: neutral` 且 `primary: null`。
- legacy/neutral 的共鸣为 `none`，四项倍率全为 `1`。
- NSS 缺层或未知属性继续拒绝，不降级为中立。
- 添加档案后，黄金样例的 attack、defense、stamina、mobility、burstResist、maxSpin、maxIntegrity、weight、armor、evasion 和旧伤害均不漂移。
- 版本清单的 `battleRulesVersion` 必须为 `2`，其他版本不变。

先运行并确认失败：

```powershell
npm run test:unit -- battle-affinity-profile battle-baseline
npm run test:nss-contract
```

### 最小实现

- 在 `battleAffinity.ts` 定义 `BattleAffinityProfile`、冻结的中立档案、NSS 适配函数和 legacy 适配函数。
- NSS 适配只调用现有迁移器和共享 `resolveAffinityProfile()`，不复制五层统计规则。
- legacy 适配只消费 `attributes` 计数，执行显式映射和固定顺序裁定，不产生共鸣。
- 将 `affinity` 增加为 `BattleStats` 必填字段；`buildStats()` 和 `buildNssBattleStats()` 在返回对象时各解析一次。
- 保留 `attributes`、`hasStealthEffect` 和所有旧基础数值公式。
- 将共享版本清单的 `battleRulesVersion` 从 `1` 改为 `2`，同步两端契约断言。

### 验证

```powershell
npm run test:unit -- battle-affinity-profile battle-baseline affinity-profile nss-affinity-loadout
npm run test:nss-contract
Set-Location battle-top-designer\web-customizer
npm run test:unit -- nssSharedContract nssBattleStats
npm run build
```

检查点：共享五层档案仍由唯一核心计算；legacy 没有伪造五层字段；黄金基础数值不漂移。

### 提交

`feat(arena): attach affinity profiles to battle stats`

## 6. 【步骤 2】拆分主动攻击的物理与元素伤害

### 目标

在不改变旧攻击前半段的前提下，实现 80/20 分项、进攻共鸣、属性关系、统一护甲和可解释贡献。

### 文件

- 新增 `src/gameplay/affinityDamage.ts`
- 修改 `src/gameplay/damage.ts`
- 修改 `src/gameplay/battlePhysics.ts`
- 新增 `tests/unit/elemental-damage.test.ts`
- 修改 `tests/unit/battle-baseline.test.ts`

### 红灯测试

先在纯函数层覆盖：

- 七属性 `7×7` 的优势、劣势、中立关系，包括光暗双向优势。
- 任一方 `primary: null` 时为中立。
- 3、4、5 件进攻共鸣分别只放大元素部分。
- 无共鸣中立命中与旧护甲公式逐点一致。
- 普通命中、暴击、攻击型反击、QTE/同级拼刀沿用原 `rawDamage` 前半段。
- 格挡和未命中时 `finalDamage`、`physicalDamage`、`elementalDamage` 及贡献均为零。
- `physicalDamage + elementalDamage === finalDamage`。
- `resonanceContribution` 和 `relationContribution` 等于三个反事实最终值之差。
- `armorReduced` 使用元素调整后的合并伤害减最终伤害，`rawDamage` 仍保持旧语义。
- 反射返回伤害保留原攻击者属性；缩放后分项和贡献重新平衡整数余数。
- 反射者冲击余波是独立中立结果，属性字段与贡献为中立值。
- 实时碰撞入口没有调用属性伤害纯函数。

先运行并确认失败：

```powershell
npm run test:unit -- elemental-damage battle-baseline
```

### 最小实现

- `affinityDamage.ts` 只负责无随机的分项计算、关系倍率、护甲结算、反事实贡献和整数分项平衡。
- `calculateTurnDamage()` 保留技能基础伤害、攻击加成、上下文、暴击、反击、拼刀、闪避、格挡及随机调用顺序；只把有效命中的旧 `rawDamage` 交给新纯函数。
- 扩展 `DamageResult`：`physicalDamage`、`elementalDamage`、双方主属性、关系、共鸣贡献和关系贡献。
- 统一使用共享 `AFFINITY_DAMAGE_RULES`，不在根项目复制 `0.8/0.2/1.25/0.8`。
- 重写 `scaleDamageResult()` 使最终值、分项、贡献同步缩放，并把舍入余数放到元素分项。
- 新增一个只供反射余波使用的中立结果构造路径；不把原反射结果的属性字段复制给余波。

### 验证

```powershell
npm run test:unit -- elemental-damage battle-baseline affinity-rules
npm run build
git diff --check
```

检查点：主动攻击之外没有元素化；随机调用次数和先后不变；最终伤害只舍入一次。

### 提交

`feat(combat): apply affinity to elemental damage share`

## 7. 【步骤 3】接入协调护甲与稳定性

### 目标

让协调共鸣在四个批准位置各生效一次：派生护甲、自然转速衰减、低转速倾斜新增量、实时碰撞倾斜新增量。

### 文件

- 新增 `src/gameplay/affinityPhysics.ts`
- 修改 `src/nss/buildStats.ts`
- 修改 `src/gameplay/battlePhysics.ts`
- 新增 `tests/unit/harmony-stability.test.ts`
- 修改 `tests/unit/battle-baseline.test.ts`

经代码核查，`src/gameplay/top.ts` 不需要修改：`tilt` 状态及 `0..1.3` 上限已经由 `BattlePhysicsSystem` 管理，保持最小改动。

### 红灯测试

- 三种协调分布的 NSS `armor = baseArmor × defenseMultiplier`。
- 基础 `defense`、`maxIntegrity`、weight、collisionRadius 不变。
- 进攻共鸣、legacy 和 neutral 的护甲不变。
- 自然 `spinLoss` 只乘一次 `spinDrainMultiplier`；stamina 继续跟随已经调整后的自然损耗。
- 技能转速消耗、墙壁损失和碰撞转速损失不获得协调减免。
- 低转速倾斜公式只对正向新增部分乘 `tiltGrowthMultiplier`，已有倾斜的恢复项不乘。
- 碰撞倾斜严格使用 `clamp(impulse × 0.0025, 0, 0.04)`，然后只乘防守方倍率一次。
- 护盾侧和 `suppressDamage` 碰撞不增加碰撞倾斜。
- 两侧倾斜分别读取各自档案，不读取攻击者档案。
- 任何路径最终倾斜仍限制在 `0..1.3`。

先运行并确认失败：

```powershell
npm run test:unit -- harmony-stability battle-baseline
```

### 最小实现

- 在 `affinityPhysics.ts` 提供无状态的自然损耗、低速倾斜新增量和碰撞倾斜新增量函数，方便测试且不引入新类。
- `buildNssBattleStats()` 先计算未加成护甲，再在唯一返回位置乘协调防御倍率。
- `integrateTop()` 将自然转速损耗乘 `spinDrainMultiplier`；其他转速损失保持原式。
- 把低速倾斜表达式拆为“正向增长”和“恢复”两项，只缩放正向增长。
- 在 `resolveCollision()` 的有效伤害分支中，为未护盾侧增加确定性碰撞倾斜；不改变现有碰撞数值。

### 验证

```powershell
npm run test:unit -- harmony-stability elemental-damage battle-baseline
npm run build
git diff --check
```

检查点：四项倍率各只有一个应用点；协调与进攻共鸣仍互斥；没有意外修改实时碰撞伤害。

### 提交

`feat(combat): apply harmony defense and stability`

## 8. 【步骤 4】分离技能表现流派与攻击属性

### 目标

明确技能只控制表现与既有状态，实际伤害属性始终取攻击者战斗档案。

### 文件

- 修改 `src/types/battle.ts`
- 修改 `src/gameplay/skills.ts`
- 修改 `src/app/game.ts`
- 修改 `src/ui/turnPanel.ts`
- 新增 `tests/unit/skill-affinity.test.ts`

### 红灯测试

- 每个现有 `ELEMENT_ATTACKS` 项都有 `visualSchool`。
- 技能 ID、名称、图标、颜色、tier、精神消耗和枚举顺序保持不变。
- 同一技能由不同主属性攻击者使用时，动作、状态和视觉流派相同，`DamageResult.attackerAffinity` 与关系不同。
- `frost_bite`、闪电锁定、分身等非直接伤害行为不读取构筑主属性。
- `TurnPanel` 仍渲染原五个按钮，顺序和禁用条件不变。

先运行并确认失败：

```powershell
npm run test:unit -- skill-affinity elemental-damage
```

### 最小实现

- 为 `ElementAttackMeta` 增加表现专用 `visualSchool` 联合类型。
- 给五个现有技能填入其当前表现流派；不更名、不重排。
- `game.ts` 和 `SkillManager` 的视觉调用读取 `visualSchool`，伤害调用不接收技能元素。
- `TurnPanel` 继续使用原元数据，仅适配新增必填字段的类型。

### 验证

```powershell
npm run test:unit -- skill-affinity elemental-damage
npm run build
git diff --check
```

检查点：代码中不存在“由 skillId 推断实际攻击属性”的路径。

### 提交

`refactor(combat): separate skill visuals from affinity damage`

## 9. 【步骤 5】增加可解释的战斗属性信息

### 目标

在不让 UI 重算规则的前提下，展示双方主属性、克制方向、共鸣类型和本局伤害贡献。

### 文件

- 新增 `src/ui/affinityPresentation.ts`
- 修改 `src/ui/hud.ts`
- 修改 `src/ui/results.ts`
- 修改 `src/ui/combatLog.ts`
- 修改 `src/app/game.ts`
- 修改 `src/style.css`
- 新增 `tests/unit/affinity-presentation.test.ts`
- 新增 `tests/e2e/affinity-battle.spec.ts`

### 红灯测试

Node 单测先覆盖纯展示模型：

- 七属性和中立的名称、短标签、颜色及 `data-affinity` 值。
- 优势、劣势、中立和光暗“双向克制”的对局文案。
- 进攻、协调、无共鸣文案。
- 有效命中日志只根据 `DamageResult` 生成优势、劣势和进攻共鸣说明。
- 结算聚合物理伤害、元素伤害、共鸣贡献和关系贡献；未命中不计伤害。
- 汇总同时支持玩家造成与玩家承受，且整数总和与逐次结果一致。

Playwright 先覆盖真实页面：

- QA 战斗入口显示双方属性徽章和对局关系。
- HUD 小徽章在 1280×800 下不遮挡生命、转速和能量条。
- 强制固定属性命中后，日志出现对应关系说明。
- 强制结束战斗后，结算出现四项属性伤害汇总。
- 复用同一用例的 390×844 viewport 验证徽章、日志和结算无横向溢出。
- 页面无未捕获异常。

先运行并确认失败：

```powershell
npm run test:unit -- affinity-presentation
npm run test:e2e -- affinity-battle.spec.ts
```

### 最小实现

- `affinityPresentation.ts` 只把已经解析的 `BattleAffinityProfile`、关系和 `DamageResult` 转成安全文本与展示模型，不重新调用克制或共鸣计算。
- 复用现有 `introCard` 作为 VS 信息容器，不新增第二套模态框。
- `RoundHud` 接收双方档案展示模型，替换或并列现有小属性文本；中立显示灰色“中立”。
- `CombatLog` 保持通用日志容器，只增加接收已格式化属性行所需的最小调用，不内置伤害公式。
- `game.ts` 在有效命中时累计本局分项与贡献，并在 `startBattleWithPlayer()` 清零。
- `ResultRenderMeta` 增加属性伤害汇总字段，`ResultPanel` 只渲染传入数据。
- 开局只记录一次协调共鸣；不在每帧 `hud.update()` 写日志。
- 客机使用房主传来的 `DamageResult` 聚合，镜像时只交换 defender，所有数值和属性关系原样保留。
- 样式只增加局部 affinity 类和现有移动断点规则，不改全局主题。

### 验证

```powershell
npm run test:unit -- affinity-presentation elemental-damage skill-affinity
npm run build
npm run test:e2e -- affinity-battle.spec.ts
git diff --check
```

需要人工检查两张专项截图：桌面 1280×800、移动 390×844；截图仅作验证产物，不暂存。

检查点：UI 不导入共享属性规则；日志不刷屏；联机客机没有第二次伤害计算。

### 提交

`feat(ui): explain affinity matchup and damage`

## 10. 【步骤 6】建立确定性、联机和平衡门禁

### 目标

用穷举和协议回归证明已批准规则稳定，完成阶段 3 的总体验收。

### 文件

- 新增 `tests/unit/affinity-balance-matrix.test.ts`
- 新增 `tests/unit/affinity-network-mirror.test.ts`
- 仅在发现遗漏时最小修改 `src/app/game.ts` 或 `src/network/protocol.ts`
- 仅在契约断言遗漏时修改 `scripts/test-match-server.mjs`

不得在本任务静默修改 `battle-top-designer/shared/nss/affinity-rules.json`。倍率问题必须先报告并重新批准规格。

### 红灯测试

平衡矩阵：

- `enumerateNssCombinations()` 恰好返回 288 个唯一组合，每套都能生成含档案的战斗数值。
- 穷举 `7^5 = 16,807` 个五层属性选择，断言主属性合法、进攻/协调互斥、倍率在共享规则范围内且输出确定。
- 每种关系的固定攻击样例关闭暴击与闪避、使用同一中立护甲目标。
- 最差属性影响约为 `-4%`，五件同属性且优势约为 `+8.75%`，整数结果允许 1 点误差。
- 对所有满足 `neutralA >= neutralB × 1.15` 的比较，验证 A 在劣势时不低于最大共鸣且优势的 B；允许相等。

联机镜像：

- `TURN_RESOLVED` JSON 往返保留全部新增 `DamageResult` 字段。
- 房主结果镜像到客机后只翻转 defender；物理/元素分项、双方属性、关系和贡献完全相同。
- 客机处理路径不调用 `calculateTurnDamage()`。
- 扩展字段不增加消息类型、不提高 `PROTOCOL_VERSION`，消息仍满足 16 KiB 上限。
- 房主投影快照与扩展伤害结果对应，不发生重复扣血。

先运行并确认失败：

```powershell
npm run test:unit -- affinity-balance-matrix affinity-network-mirror
npm run test:server
```

### 最小实现

- 测试直接复用公开枚举器、共享属性核心和纯伤害管线，不复制生产公式。
- 如客机镜像遗漏字段，只修正现有对象展开/defender 翻转逻辑。
- 如协议测试缺少扩展结果样例，只扩充现有测试消息，不新增网络消息。
- 若 15% 门禁失败，输出最小反例（两套构筑、双方中立伤害、极端属性伤害和关系），停止提交规则修改。

### 专项验证

```powershell
npm run test:unit -- affinity-balance-matrix affinity-network-mirror
npm run test:server
npm run test:nss-contract
```

### 阶段最终验证

```powershell
npm run test:unit
npm run test:nss-contract
npm run test:server
npm run build
npm run verify:site
npm run test:e2e -- affinity-battle.spec.ts
npm run test:e2e -- baseline.spec.ts
Set-Location battle-top-designer\web-customizer
npm run test:unit
npm run build
git diff --check
```

最后检查：

- 搜索所有 `BattleStats` 字面量，确认都提供 `affinity`。
- 搜索所有 `calculateTurnDamage()` 调用，确认攻击者和防守者档案来源正确。
- 搜索 `AFFINITY_DAMAGE_RULES` 和协调倍率使用位置，确认无重复应用。
- 搜索客机 `TURN_RESOLVED` 路径，确认没有重新计算。
- 检查工作区状态，确保没有暂存用户素材、截图、`referse/` 或测试产物。

### 提交

`test(balance): validate affinity battle matrix`

## 11. 风险与停止条件

- 碰撞倾斜是新增的确定性微行为。若专项浏览器检查发现连续子步导致肉眼过快失稳，先报告实测数据；不得自行扩大上限或改变冲量公式。
- `DamageResult` 扩展会增加联机消息体积。若最坏消息接近 16 KiB，优先减少一次回合中重复的展示字段；不提高消息上限。
- 当前部分旧源码文本存在编码显示问题。本阶段只编辑必要行，不顺便重写整文件或统一编码。
- UI 测试依赖 WebGL 浏览器环境；沙箱或浏览器启动失败时，保留单测与构建结果并请求运行权限，不用 DOM 模拟结果替代真实体验验证。
- 15% 门禁是硬停止条件。失败时不能为了让测试变绿而静默改倍率、物理/元素占比或基础构筑数值。
- 任一阶段发现目标文件含无法安全合并的用户改动时，停止该阶段并报告冲突文件。

## 12. 完成清单

- [ ] 六个任务均按先测试后实现完成。
- [ ] 六个专项提交边界清晰，无无关文件。
- [ ] NSS V1/V2、legacy、中立档案全部覆盖。
- [ ] 中立伤害与旧黄金样例一致。
- [ ] 物理、元素、贡献和最终伤害不变量成立。
- [ ] 协调倍率在四个批准位置各应用一次。
- [ ] 技能表现和实际攻击属性完全解耦。
- [ ] VS、HUD、日志、结算桌面与移动端可读。
- [ ] 房主与客机看到一致的扩展结果。
- [ ] 288 构筑、16,807 属性分布和 15% 保护门禁通过。
- [ ] 根项目、定制器、服务端、构建、站点和浏览器门禁通过。
- [ ] 风险、限制、截图与任何未通过的无关测试已如实记录。

阶段 3 全部通过后，才进入总计划阶段 4；本计划不提前实施邀请身份、SQLite 或统一门户。
