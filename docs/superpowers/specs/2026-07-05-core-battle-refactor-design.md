# RIPTOP Arena 核心战斗逻辑重构设计

日期：2026-07-05

## 1. 目标

本设计定义 RIPTOP Arena 第一阶段的核心战斗重构方案。该阶段采用“分阶段上线 + 逻辑优先”的策略，目标是：

- 为现有战斗系统引入战术方针、必杀技、独立 Spirit 资源和增强版碰撞/爆裂判定
- 保持现有 `Game`、`TopEntity`、`BattlePhysicsSystem` 主骨架可用，不进行整套战斗架构推倒重来
- 为第二阶段的 `Tag Team` 接力系统预留接口和状态字段，但不在本阶段实现完整接力流程
- 通过快捷键和诊断接口实现可测试、可调试的底层版本

本阶段不是最终可游玩完整版本，而是“可调试的战斗底层版本”。

## 2. 范围

### 2.1 本阶段包含

- 常驻战术方针系统
- 独立 Spirit 资源系统
- 技能管理器和 4 个技能的逻辑实现
- 运行时属性修正解析层
- 增强版碰撞、爆裂、护盾、橡胶底、边缘回冲逻辑
- 调试快捷键和 QA 诊断暴露
- `Tag Team` 的接口预留

### 2.2 本阶段不包含

- 完整技能 UI 面板
- 完整 `Tag Team` 切换流程
- 后台待机回复逻辑
- 多陀螺队列战斗
- 商城、升级树或联网对战

## 3. 总体架构

第一阶段采用“薄重构，外挂式战斗层”方案。

保留现有主结构：

- `src/app/game.ts` 继续负责主循环、场景协调、输入分发、模式切换和 UI 协调
- `src/gameplay/top.ts` 继续表示单个战斗陀螺实体
- `src/gameplay/battlePhysics.ts` 继续负责 2D 积分和双体碰撞

新增或增强的模块：

- `src/types/battle.ts`
  - 定义 `TacticalMode`、`SkillId`、`PhysicsModifiers`、`SpiritState`、`TimedStatusEffect`、`QueuedTagState` 等强类型
- `src/gameplay/modifiers.ts`
  - 负责解析“基础属性 + 常驻方针 + 临时技能 + 一次性状态”的当帧有效修正值
- `src/gameplay/skills.ts`
  - 负责技能施放、Spirit 消耗、状态挂载、持续时间推进、结束回收
- `src/gameplay/spirit.ts`
  - 独立管理 Spirit 资源，与现有 `EnergySystem` 解耦

关键原则：

- 技能效果不直接永久污染基础 `stats`
- 所有运行时增益通过状态和解析器生效
- 物理系统只消费“当前有效修正值”和状态标记，不负责管理技能生命周期

## 4. 数据模型

### 4.1 `TopEntity` 新增字段

- `tacticalMode: TacticalMode`
- `spirit: number`
- `maxSpirit: number`
- `lockStability: number`
- `shieldHits: number`
- `hasRubberTip: boolean`
- `invulnerableUntil: number`
- `statusEffects: TimedStatusEffect[]`
- `queuedTagState: QueuedTagState | null`
- `flags`
  - `ignoreNextWallSlowdown`
  - `ignoreNextCollisionDamage`
  - `burstResolvedThisFrame`

### 4.2 既有字段的使用方式

- `stats` 继续代表由部件组合得到的基础属性模板
- `burst` 保留，主要用于现有表现层兼容
- `lockStability` 作为新爆裂算法的主判定资源

### 4.3 `hasRubberTip` 判定

`hasRubberTip` 基于当前 `build.driver` 派生。第一阶段不额外引入新装备表结构，直接在构造 `TopEntity` 时根据 `driver` 类型或映射表赋值。

## 5. 运行时修正解析

`src/gameplay/modifiers.ts` 负责生成当帧有效修正值。建议的输出字段：

- `attackMultiplier`
- `defenseMultiplier`
- `staminaDrainMultiplier`
- `burstResistanceMultiplier`
- `collisionImpulseMultiplier`
- `wallGripMultiplier`
- `damageMultiplier`
- `spinLossMultiplier`
- `dashImpulseMultiplier`
- `lockStabilityLossMultiplier`

解析顺序固定为：

1. 基础部件属性
2. 当前战术方针
3. 当前持续性技能效果
4. 一次性状态标记

该顺序保证：

- 技能结束后无需手工回退基础属性
- `RETREAT_REVERSE` 这类单次消费状态可由物理层安全清理
- 同时存在方针与技能时，结果稳定可推导

## 6. 战术方针设计

第一阶段只实现 3 个常驻方针：

### 6.1 `ASSAULT`

- 提高 `collisionImpulseMultiplier`
- 提高 `damageMultiplier`
- 略微降低 `burstResistanceMultiplier`

适合攻击和击飞压制。

### 6.2 `FORTRESS`

- 提高 `defenseMultiplier`
- 提高 `burstResistanceMultiplier`
- 略微降低机动相关效率，例如 `dashImpulseMultiplier`

适合防守和拖长战斗。

### 6.3 `BALANCE`

- 中性模板
- 不提供显著偏科修正

适合作为默认或回稳状态。

### 6.4 切换方式

战斗阶段按 `Q` 循环切换。发射阶段原有 `Q/E` 调角逻辑保留，按阶段分流输入，不做全局抢占。

## 7. Spirit 系统

Spirit 为独立资源，不复用 `EnergySystem`。

### 7.1 规则

- 初始值：100
- 上限：100
- 仅用于技能释放
- 不影响现有冲刺、对撞能量或 clash 能量

### 7.2 系统职责

`src/gameplay/spirit.ts` 提供：

- `get(top)`
- `set(top, value)`
- `canAfford(top, cost)`
- `spend(top, cost)`
- `update(top, dt)`

第一阶段 Spirit 回复规则可保持保守，优先服务调试。默认建议为缓慢自然恢复，外加调试快捷键回满，以便验证技能逻辑。

## 8. 技能系统

`src/gameplay/skills.ts` 导出 `SkillManager`，由 `game.ts` 驱动。

### 8.1 `NUCLEAR_IMPACT`

- 消耗：20 Spirit
- 若当前速度足够大，沿当前速度方向施加一次高强度速度脉冲
- 若当前速度过小，则改为朝敌人方向施加脉冲
- 可附加极短时 `collisionImpulseMultiplier` 提升

目的：在现有 2D 物理下模拟“强制爆发冲击”，避免必须引入真实刚体冲量。

### 8.2 `ABSOLUTE_DEFENSE`

- 消耗：20 Spirit
- 生成护盾表现
- 设置 `shieldHits = 5`

护盾在碰撞中优先结算，免除当次主要位移和爆裂伤害，但可保留轻量命中反馈，避免视觉完全失真。

### 8.3 `INFINITE_STORM`

- 消耗：20 Spirit
- 挂载 3 秒持续效果
- 提高 `damageMultiplier`
- 提高压制相关系数，例如 `spinLossMultiplier` 或 `collisionImpulseMultiplier`
- 提升辉光或拖尾表现

### 8.4 `RETREAT_REVERSE`

- 消耗：20 Spirit
- 挂状态而不是立即改物理
- 设置 `ignoreNextWallSlowdown = true`
- 存储目标引用或目标侧标识

当物理系统检测到“下一次有效触墙”时：

- 跳过该次边缘减速/常规回拉
- 改为朝敌人方向施加一次高速反冲
- 立即消费该状态

## 9. 物理与爆裂重构

### 9.1 基本原则

- 继续使用现有 2D `position + velocity` 积分
- 不引入 Ammo.js、Rapier 或 3D 刚体库
- 所有技能和碰撞增强均等效为向量叠加、倍率修正和状态消费

### 9.2 碰撞计数

`BattlePhysicsSystem` 增加：

- `collisionCount`

仅在有效碰撞时递增。

### 9.3 开局爆裂判定

开局前 3 次有效碰撞额外执行 `burstChance` 判定，公式基于：

- 双方当前转速差
- 目标的 `lockStability`
- 当前攻击相关修正值

若成功：

- 立即对目标执行等价爆裂结算
- 设置 `alive = false`
- 标记 `burstResolvedThisFrame = true`
- 立刻终止本次碰撞后续结算

### 9.4 防多段碰撞死锁

`resolveCollision` 顶层必须先判断：

- `!a.alive || !b.alive`
- `collisionLock > 0`

当爆裂在本帧发生后，不允许残骸继续触发伤害、粒子或音效。

### 9.5 常规碰撞增强

每次有效常规碰撞：

- 继续计算 `impulseMagnitude`
- 根据强度扣减 `lockStability`
- 继续结算 `integrity`、`spin` 和现有 `burst` 表现值
- 应用解析后的攻击、防御、爆裂抗性修正

### 9.6 50 次碰撞强制收束

当 `collisionCount >= 50` 时，触发强制胜负收束规则，避免长局拖死。

### 9.7 护盾结算顺序

碰撞和伤害结算建议顺序：

1. 存活检查
2. 护盾检查
3. 一次性技能标记检查
4. 常规碰撞与伤害
5. 爆裂判定

若 `shieldHits > 0`：

- 抵消当次主要碰撞伤害
- 抵消当次爆裂伤害
- 消耗 1 次护盾

### 9.8 橡胶底边缘逻辑

`integrateTop` 中检测边缘区域时：

- 若 `hasRubberTip` 为真，则应用更强的边缘补正与抓地效果
- 暴露 `triggerEdgeGrind()` 给实体或视觉层，用于摩擦火花、拖尾和音效

### 9.9 回旋伪退截断

若实体处于 `ignoreNextWallSlowdown` 状态且发生有效触墙：

- 跳过该次常规触墙减速
- 计算朝敌方向量
- 强制写入高强度回冲速度
- 清除该状态

## 10. `game.ts` 编排与输入

### 10.1 每帧顺序

战斗循环建议按以下顺序运行：

1. 处理输入与快捷键
2. 更新 Spirit
3. 更新技能持续时间和状态清理
4. 解析当前有效修正值
5. 执行物理更新
6. 执行胜负规则更新
7. 更新特效、HUD、诊断信息

这样可避免“本帧已开技能但物理仍读取旧状态”的时序问题。

### 10.2 快捷键

第一阶段采用调试型快捷键：

- `Q`：战斗阶段切换战术方针
- `1`：技能 1
- `2`：技能 2
- `3`：技能 3
- `4`：技能 4
- `R`：回满玩家 Spirit
- `Y`：回满敌方 Spirit
- `T`：调用占位 `executeTagSubstitution()`

要求：

- 发射阶段保留原有 `Q/E` 调角逻辑
- 快捷键按战斗阶段分流，避免互相冲突

### 10.3 对外调试接口

`game.ts` 应暴露：

- `castSkill(skillId)`
- `switchTacticalMode(mode)`
- `executeTagSubstitution()`

同时更新 `__RIPTOP_QA__`，暴露战斗状态、Spirit、当前方针、护盾次数和技能状态，方便自动化或手动验证。

## 11. `Tag Team` 预留设计

本阶段不实现完整接力系统，但必须预留接口。

### 11.1 预留项

- `playerTeam: TopEntity[]`
- `activePlayerIndex`
- `queuedTagState`
- `executeTagSubstitution()`
- `invulnerableUntil`

### 11.2 本阶段行为

- `T` 键允许调用占位接口
- 可记录日志或更新诊断信息
- 不执行真实换位逻辑

### 11.3 第二阶段约束

后续接力实现时应提供：

- 登场坐标继承
- 指向中心的登场初速度
- 0.3s 到 0.5s 保护期
- 后台待命恢复

## 12. 验证方案

第一阶段验证优先级按风险排序：

### 12.1 爆裂短路验证

- 前 3 次碰撞触发爆裂时
- 不重复喷粒子
- 不重复播放 burst 音效
- 不重复结算伤害

### 12.2 护盾消费验证

- `shieldHits` 每次只扣 1
- 被护盾挡住时不进入爆裂
- 视觉仍保留轻量命中反馈

### 12.3 回旋伪退验证

- 技能激活后仅下一次有效触墙生效
- 生效后立刻清除状态
- 不可无限连锁

### 12.4 方针与技能叠层验证

- `ASSAULT + INFINITE_STORM` 叠加时数值符合预期
- 技能结束后属性完全回到方针基线

### 12.5 Spirit 独立性验证

- 技能不会扣现有 `Energy`
- 冲刺不会扣 `Spirit`

### 12.6 接力接口预留验证

- `playerTeam`
- `executeTagSubstitution()`
- `invulnerableUntil`

这些接口在代码中已经存在，第二阶段无需再改公共签名。

## 13. 风险与控制

### 13.1 风险

- `game.ts` 继续承担较强编排职责
- 新状态字段增多后，若没有统一解析层，极易出现状态串线
- 碰撞、护盾、爆裂和技能若顺序错误，会产生难查的边缘 bug

### 13.2 控制措施

- 所有运行时增益必须经 `modifiers.ts` 统一解析
- 技能生命周期只由 `SkillManager` 管理
- 物理系统只消费状态，不创造技能状态
- 爆裂判定必须短路，避免同帧重复结算

## 14. 结论

本设计以最小必要重构为原则，在不推翻现有 2D 自研物理和单主循环结构的前提下，为 RIPTOP Arena 建立：

- 可扩展的方针系统
- 可控的技能系统
- 独立 Spirit 资源
- 更稳定的碰撞/爆裂逻辑
- 面向第二阶段 `Tag Team` 的接口基础

第一阶段完成后，项目将拥有稳定的“战斗规则层”，后续再实现接力、多陀螺编排和完整技能 UI 时，返工成本会显著降低。
