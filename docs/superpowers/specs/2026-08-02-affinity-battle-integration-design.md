# NSS 七属性战斗接入设计

日期：2026-08-02
状态：已批准，待实施计划
对应总设计：`docs/superpowers/specs/2026-08-01-nss-arena-complete-expansion-design.md` 阶段 3

## 1. 目标

把已经在 NSS 定制器中完成的五层七属性、主属性、进攻共鸣和协调共鸣接入现有博弈战斗，同时保持发射、回合动作、QTE、实时物理碰撞、技能等级和胜负流程不变。

完成后：

- 主动攻击按 80% 物理和 20% 元素结算。
- 属性克制和进攻共鸣只修改元素部分。
- 协调共鸣只提高护甲、降低自然转速消耗并减缓倾斜增长。
- 技能表现形式与实际攻击属性彻底分离。
- VS、HUD、日志和结算能够解释属性影响。
- legacy 三件式构筑继续可玩，不伪造五层共鸣。

## 2. 明确不做

- 不改变现有博弈模式、战斗按钮、AI 行动集合或 QTE。
- 不给实时陀螺碰撞、墙壁、场地危险和自然衰减增加元素伤害。
- 不新增技能、属性或共鸣类型。
- 不修改定制器分享 V2、本地存档 schema、邀请码或公网服务。
- 不提前实现异步挑战、战役、生存、纹章加载或服务端 AI。
- 不进行与属性接入无关的 `game.ts` 重构。

## 3. 战斗属性档案

战斗层新增统一的 `BattleAffinityProfile`，并作为 `BattleStats.affinity` 的必填字段。

档案包含：

- `source`：`nss`、`legacy` 或 `neutral`。
- `primary`：七属性之一；中立档案为 `null`。
- `resonance`：共享核心产生的进攻/协调共鸣，或无共鸣。
- `modifiers.elementalPower`：元素进攻倍率。
- `modifiers.defenseMultiplier`：协调护甲倍率。
- `modifiers.spinDrainMultiplier`：自然转速消耗倍率。
- `modifiers.tiltGrowthMultiplier`：倾斜增长倍率。

共享五层 `AffinityProfile` 继续保持原职责。战斗适配层负责把 NSS、legacy 和中立输入转换成 `BattleAffinityProfile`，不让伤害、物理或 UI 重复统计属性。

## 4. NSS 与 legacy 适配

### 4.1 NSS

- V2 配装直接调用共享五层属性核心。
- V1 配装先按现有规则迁移为五层默认属性，再调用共享核心。
- NSS 主属性、共鸣和倍率必须与定制器完全一致。

### 4.2 legacy

- 旧属性先按既有迁移表转换：`ROCK → EARTH`、`LIGHTNING → WIND`、`DIVINE → LIGHT`。
- 按当前构筑已有属性数量确定主属性。
- 数量并列时按风、火、水、木、土、光、暗的固定顺序裁定。
- 有合法属性时生成 `source: legacy` 的档案。
- 没有属性时生成 `source: neutral`、`primary: null` 的中立档案。
- legacy 档案永远无进攻或协调共鸣，四项倍率均为 `1`。
- 原 `attributes` 字段继续保留，供现有技能、特效和兼容逻辑使用。

只有合法的 legacy 无属性构筑可以成为中立。未知 NSS 属性或缺失五层字段必须拒绝，不能静默转成中立。当前同步战斗配装不新增规则版本字段；运行时规则版本来自受契约测试保护的共享版本清单。分享入口继续在构造配装前验证自身携带的属性规则版本。

## 5. 主动伤害公式

主动攻击沿用原技能基础伤害、攻击加成、上下文倍率、暴击、反击、拼刀、闪避和格挡规则。

未经过护甲的旧公式结果记为 `rawDamage`。有效命中按以下顺序计算：

```text
physicalRaw = rawDamage × 0.8
elementalBaseRaw = rawDamage × 0.2
elementalResonantRaw = elementalBaseRaw × attacker.elementalPower
elementalAdjustedRaw = elementalResonantRaw × relationMultiplier
combinedRaw = physicalRaw + elementalAdjustedRaw
armorReduction = effectiveArmor / (effectiveArmor + 30)
finalDamage = round(combinedRaw × (1 - armorReduction) + 现有舍入 epsilon)，下限为 1
```

关系倍率固定来自共享规则：

- 优势：`1.25`
- 劣势：`0.8`
- 中立：`1`

任一方主属性为 `null`、双方同属性或不存在直接克制边时，关系为中立。光与暗互相克制，因此光暗对局中双方主动攻击均为优势。

护甲只在合并后统一应用，元素伤害不穿透护甲。最终伤害只舍入一次。中立且无进攻共鸣时，`combinedRaw` 等于原 `rawDamage`，最终结果必须与旧公式一致。

为保持兼容，现有 `DamageResult.rawDamage` 继续表示属性接入前、尚未经过护甲的旧公式结果；`armorReduced` 改为以应用元素后的 `combinedRaw` 与 `finalDamage` 之差计算。元素后的合并值只在伤害纯函数内部使用，不增加第二个含义相近的公开 raw 字段。

## 6. DamageResult 与分项不变量

`DamageResult` 保留现有字段并增加：

- `physicalDamage`
- `elementalDamage`
- `attackerAffinity`
- `defenderAffinity`
- `affinityRelation`
- `resonanceContribution`
- `relationContribution`

分项规则：

1. 先计算 `finalDamage`。
2. 物理分项按护甲前物理占合并伤害的比例舍入。
3. 元素分项取 `finalDamage - physicalDamage`。
4. 始终满足 `physicalDamage + elementalDamage === finalDamage`。
5. 未命中或格挡时最终伤害和两个分项均为零。

贡献使用反事实结果计算，避免浮点解释歧义：

- `neutralFinal`：不应用共鸣和关系倍率的最终伤害。
- `resonanceFinal`：只应用进攻共鸣的最终伤害。
- `resonanceContribution = resonanceFinal - neutralFinal`。
- `relationContribution = finalDamage - resonanceFinal`。

因此正数表示增伤，负数表示减伤，二者之和等于属性系统相对中立结果的净变化。

## 7. 伤害来源边界

携带攻击者主属性：

- 普通主动攻击。
- 抓住蓄能空档的攻击型反击。
- 攻击对攻和 QTE 拼刀伤害。
- 成功反射后返回给原攻击者的伤害；它保留原攻击者主属性。

保持中立物理：

- 反射者承受的冲击余波。
- 实时陀螺碰撞伤害。
- 墙壁和场地危险。
- 自然衰减和非攻击状态伤害。

反射缩放必须同步缩放最终伤害、物理/元素分项和贡献字段，并在缩放后重新平衡整数余数。冲击余波生成独立中立结果，不能继承反弹伤害的属性字段。

## 8. 协调防御与稳定性

### 8.1 护甲

- NSS 派生 `armor` 乘以协调共鸣的 `defenseMultiplier`。
- 不修改基础 `defense`、`maxIntegrity`、重量或实时碰撞伤害。
- legacy、中立和进攻共鸣档案的护甲倍率为 `1`。

### 8.2 自然转速

- 每帧自然转速衰减乘以 `spinDrainMultiplier`。
- 技能消耗、墙壁惩罚和直接伤害导致的转速损失不享受协调减免。

### 8.3 倾斜增长

- 实时碰撞新增倾斜和低转速失控新增倾斜乘以 `tiltGrowthMultiplier`。
- 只减少新增量，不恢复已有倾斜。
- 不改变碰撞冲量、移动速度、碰撞半径或视觉摇晃阈值。

每项倍率只在一个计算位置应用。进攻与协调共鸣继续互斥。

## 9. 技能表现与攻击属性

技能元数据增加 `visualSchool`，只描述现有表现形式，例如风刃、水波、闪电、火焰、分身或冰霜。

- 技能继续决定名称、图标、颜色、等级、精神消耗、动作和状态效果。
- 实际攻击属性只读取攻击者的 `BattleAffinityProfile.primary`。
- 同一技能由不同主属性构筑使用时，行为和视觉不变，元素关系可以不同。
- `frost_bite` 等非直接攻击状态保持原行为，不凭空获得元素伤害。
- 不增加、删除或重新排列战斗按钮。

## 10. 战斗信息

- VS 页面显示双方主属性徽章、克制方向和共鸣类型。
- HUD 为双方显示小型主属性徽章；中立使用灰色“中立”。
- 战斗日志在有效命中时说明优势、劣势和进攻共鸣。
- 协调共鸣只在开局或档案变化时说明一次，避免逐帧刷屏。
- 结算汇总物理伤害、元素伤害、共鸣贡献和克制净影响。
- 光暗对局显示“双向克制”。

UI 只读取战斗档案和 `DamageResult`，不得自行重算主属性、共鸣或伤害。

## 11. 确定性、版本与联机

- `battleRulesVersion` 从 `1` 升级到 `2`。
- 属性计算不新增随机数；暴击、闪避和反射比例继续使用现有可注入随机源。
- 联机房主继续负责权威回合结算，并把扩展后的 `TurnResolution` 和 `DamageResult` 发给客机。
- 客机镜像时只交换攻防身份，不重新计算属性伤害。
- 新字段扩展现有回合结果，不新增消息类型。客户端与服务端整体部署，本阶段不提升 WebSocket 协议版本。
- 后续异步挑战必须记录 `battleRulesVersion: 2`，但本阶段不实现挑战持久化。

## 12. 测试策略

### 12.1 战斗档案

- NSS V1/V2、legacy 迁移、主属性并列和中立档案。
- legacy 永不获得共鸣。
- 仅附加档案时，原攻击、防御、生命、转速等基础数值不漂移。
- NSS 档案与定制器共享核心结果一致。

### 12.2 伤害

- 七属性 `7×7` 全关系和中立关系。
- 三档进攻共鸣。
- 普通命中、暴击、攻击型反击、拼刀、格挡、未命中、成功和失败反射。
- 中立结果严格等于旧公式。
- 分项与贡献不变量在所有路径成立。
- 环境和实时物理伤害不应用属性。

### 12.3 协调稳定性

- `2-2-1`、`2-1-1-1`、`1-1-1-1-1` 三种分布。
- 护甲、自然转速和两类倾斜增长分别只应用一次。
- 墙壁、技能消耗、实时碰撞伤害和进攻共鸣不错误获得减免。

### 12.4 技能、UI 与联机

- 同一技能使用不同主属性时视觉和行为不变，关系改变。
- VS、HUD、日志和结算 DOM 测试。
- 房主结果与客机镜像后的分项、贡献和关系一致。
- 桌面与移动端浏览器战斗流程。

## 13. 第一轮平衡门禁

- 枚举全部 288 套 NSS 模型组合。
- 枚举全部五层属性分布，确认进攻与协调共鸣互斥、倍率不越界。
- 同一构筑在固定攻击样例下，最差属性影响约为 `-4%`，五件同属性且克制时最高约为 `+8.75%`；整数舍入允许一个伤害点误差。
- 若构筑 A 的中立基础伤害至少为构筑 B 的 `115%`，则 A 在劣势、B 在最大进攻共鸣与优势时，A 的最终伤害不得低于 B；允许持平，不允许倒置。
- 测试使用固定技能、固定上下文、关闭暴击和闪避，并使用同一护甲目标，避免把随机数或防御差异混入门禁。

## 14. 交付顺序与完成标准

按六个可独立验证的提交实施：

1. 战斗属性适配层和 `BattleStats.affinity`。
2. 80/20 物理与元素伤害。
3. 协调护甲、自然转速和倾斜稳定性。
4. 技能 `visualSchool` 与攻击属性分离。
5. VS、HUD、日志和结算信息。
6. 288 构筑和五层属性平衡门禁。

完成标准：

- NSS 五层属性真实影响主动攻击、护甲和稳定性。
- legacy 继续可玩且基础数值兼容。
- 中立伤害保持旧结果。
- 联机双方看到一致结果。
- 玩家能在战前、战中和结算理解属性影响。
- 15% 构筑差距保护门禁通过。
- 根项目单元测试、NSS 契约、服务端测试、构建、联机协议测试和浏览器烟雾测试通过。

全部完成后才进入阶段 4：邀请身份、SQLite 和统一门户。
