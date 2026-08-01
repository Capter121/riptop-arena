# Nova Spin System × RIPTOP Arena 完整扩展实施计划

对应设计：`docs/superpowers/specs/2026-08-01-nss-arena-complete-expansion-design.md`

## 执行边界

- 本计划只实现已批准的 A、B、C 方案、七属性装配、邀请身份和公网私密部署。
- 保留现有五层装配、发射、回合行动、QTE、物理碰撞、技能和胜负流程。
- 不实现 Steam、密码/邮箱账号、公共注册、评论、私信、关注、每日任务或多服务器扩容。
- 每个任务先补失败测试，再实现最小代码使测试通过。
- 每个任务只暂存列出的文件；禁止 `git add -A`、`git add .` 和 `git commit -am`。
- 当前工作区已有用户改动。任何任务开始前都要检查目标文件 diff，并保留不属于本任务的变化。
- 当前阶段验证失败时停止扩展范围，先修复本阶段问题。

## 通用验证命令

根项目最终门禁：

```powershell
npm run test:unit
npm run test:nss-contract
npm run test:server
npm run build
npm run verify:site
npm run test:e2e
git diff --check
```

定制器最终门禁：

```powershell
Set-Location battle-top-designer\web-customizer
npm run test:unit
npm run build
npm run test:e2e
```

浏览器测试只在对应功能需要时运行专项用例；里程碑结束时再运行完整 E2E。

---

## 阶段 0：建立干净基线和测试支撑

### 任务 0.1：确认现有工作区改动归属

文件：无产品文件修改。

工作：

1. 运行 `git status --short`。
2. 对 `src/app/game.ts`、`src/gameplay/battlePhysics.ts`、`src/types/battle.ts`、`battle-top-designer/web-customizer/src/App.tsx` 等重叠文件逐个查看 diff。
3. 将现有改动归类为“用户基线”“未完成工作”或“可独立提交工作”。
4. 未得到用户明确指示前，不暂存、提交或改写这些既有变化。
5. 只有在重叠改动已提交、转移或被明确批准为实施基线后，才进入任务 0.2。

验证：

- 新计划没有误暂存现有用户修改。
- 目标文件的基线提交可明确追踪。

提交：无。

### 任务 0.2：增加根项目 TypeScript 单元测试入口

文件：

- 修改 `package.json`
- 修改 `package-lock.json`
- 新增 `vitest.config.ts`
- 新增 `tests/unit/baseline.test.ts`

工作：

1. 在根项目使用与定制器一致的 Vitest 主版本。
2. 增加 `test:unit` 脚本。
3. 配置 Node 测试环境和 `tests/unit/**/*.test.ts` 范围。
4. 添加一个只验证测试环境和共享 JSON 导入的基线测试。

验证：

```powershell
npm run test:unit
npm run build
```

推荐提交：`test: add root TypeScript unit test harness`

### 任务 0.3：冻结战斗黄金样例

文件：

- 新增 `tests/unit/battle-baseline.test.ts`
- 新增 `tests/fixtures/battle-baseline.json`

工作：

1. 为一个 legacy 配装和两个 NSS 配装记录当前基础属性。
2. 固定攻击方、防御方、技能等级、暴击关闭、反击关闭的伤害输入。
3. 记录当前 maxSpin、maxIntegrity、armor、evasion 和基础伤害结果。
4. 测试只冻结公开计算结果，不复制 Three.js 场景状态。

验证：

```powershell
npm run test:unit -- battle-baseline
```

推荐提交：`test: freeze pre-affinity battle baseline`

### 任务 0.4：定义版本清单

文件：

- 新增 `battle-top-designer/shared/nss/versions.json`
- 修改 `scripts/test-nss-contract.mjs`
- 修改 `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`

工作：

1. 定义 `catalogVersion`、`affinityRulesVersion`、`battleRulesVersion`、`challengeSchemaVersion` 和 `saveSchemaVersion`。
2. 共享契约测试拒绝缺失和未知版本。
3. 不在多个源码文件中重复硬编码版本。

验证：

```powershell
npm run test:nss-contract
Set-Location battle-top-designer\web-customizer
npm run test:unit -- nssSharedContract
```

推荐提交：`feat(nss): add shared version manifest`

### 任务 0.5：建立根应用 Playwright 专项入口

文件：

- 新增 `playwright.config.ts`
- 新增 `tests/e2e/baseline.spec.ts`
- 修改 `package.json`

工作：

1. 增加根应用 `test:e2e` 脚本。
2. 配置独立端口、Web Server 启动、桌面 Chromium 和测试产物目录。
3. 基线用例只验证统一门户/竞技场当前入口、Canvas 创建和无致命控制台错误。
4. 不复用定制器的 Stage 7/8 evidence 配置和产物目录。

验证：

```powershell
npm run test:e2e -- baseline.spec.ts
```

推荐提交：`test: add root arena Playwright harness`

阶段 0 门禁：根构建、现有服务端测试、NSS 契约和定制器单元测试全部通过。

---

## 阶段 1：共享七属性核心

### 任务 1.1：定义属性规则数据和类型

文件：

- 新增 `battle-top-designer/shared/nss/affinity-rules.json`
- 新增 `battle-top-designer/shared/nss/affinity.ts`
- 新增 `tests/unit/affinity-rules.test.ts`

工作：

1. 定义 `WIND | FIRE | WATER | WOOD | EARTH | LIGHT | DARK`。
2. 定义风克土、土克水、水克火、火克木、木克风和光暗互克。
3. 定义 20% 元素伤害占比、`1.25/0.8` 克制倍率和共鸣阈值。
4. 实现 `getAffinityRelation()`，不访问 DOM、Three.js、存储或随机数。

测试：

- 49 种攻击/防御组合。
- 光暗互克。
- 自然属性对光暗中立。
- 非法属性被拒绝。

验证：`npm run test:unit -- affinity-rules`

推荐提交：`feat(nss): define seven-affinity rules`

### 任务 1.2：实现 A2 可附加属性配装和 V1 迁移

文件：

- 新增 `battle-top-designer/shared/nss/loadout-v2.schema.json`
- 修改 `src/nss/types.ts`
- 修改 `src/nss/loadout.ts`
- 修改配装消费端类型和本地存档读取
- 新增 `tests/unit/nss-affinity-loadout.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`

工作：

1. 保持 16 件模型目录和 288 个模型组合 ID 不变。
2. V2 配装为五层分别保存一个七属性枚举；五层均允许全部七属性。
3. V1 旧配装按核心模型确定光暗，其余四层依次迁移为风、火、水、土。
4. 缺失、未知或多余属性字段被拒绝，V1 和 V2 均可读取并统一为 V2。
5. 本任务不把属性接入战斗数值，黄金基础属性必须保持不变。

验证：

```powershell
npm run test:nss-contract
npm run test:unit
Set-Location battle-top-designer\web-customizer
npm run test:unit -- nssSharedContract
```

推荐提交：`feat(nss): add attachable affinity loadouts`

### 任务 1.3：实现主属性和共鸣纯函数

文件：

- 修改 `battle-top-designer/shared/nss/affinity.ts`
- 新增 `tests/unit/affinity-profile.test.ts`

工作：

1. 实现五层属性计数。
2. 并列时优先使用候选中的战魂核心属性；核心不在候选中时按七属性固定顺序裁定。
3. 实现 3/4/5 件进攻共鸣。
4. 实现 2-2-1、2-1-1-1、1-1-1-1-1 协调共鸣。
5. 确保进攻和协调互斥。
6. 返回不可变 `AffinityProfile`。

测试：

- 覆盖五层分布的全部整数分区。
- 覆盖主属性平局。
- 覆盖输入顺序变化不影响结果。
- 覆盖输入少于或多于五件时拒绝。

验证：`npm run test:unit -- affinity-profile`

推荐提交：`feat(nss): calculate deterministic affinity profiles`

### 任务 1.4：迁移旧属性名称

文件：

- 新增 `src/app/saveMigration.ts`
- 修改 `src/app/progression.ts`
- 修改 `battle-top-designer/shared/nss/versions.json`
- 修改 `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`
- 新增 `tests/unit/save-migration.test.ts`

工作：

1. 将旧 `ROCK` 映射到 `EARTH`。
2. 将旧 `LIGHTNING` 映射到 `WIND`。
3. 将旧 `DIVINE` 映射到 `LIGHT`。
4. 保存结构升级为 `saveSchemaVersion: 2`，迁移成功后立即回写且只执行一次。
5. 未知属性使单个 NSS 配装或实例物品无效并给出诊断，不随机赋值。
6. 提供独立的旧实例物品转换函数，但暂不移除现有 `LIGHTNING`、`DIVINE` 战斗与视觉行为。

验证：`npm run test:unit -- save-migration`

推荐提交：`feat(save): migrate legacy element attributes`

阶段 1 门禁：共享规则、16 件零件、全部共鸣分布和旧存档迁移测试通过。

---

## 阶段 2：定制器元素装配体验

### 任务 2.1：把元素结果接入定制器状态

文件：

- 修改 `battle-top-designer/web-customizer/src/domain.ts`
- 修改 `battle-top-designer/web-customizer/src/store.ts`
- 修改 `battle-top-designer/web-customizer/src/sharing/combinationUrl.ts`
- 新增 `battle-top-designer/web-customizer/src/affinity/affinityViewModel.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/affinityViewModel.test.ts`
- 修改定制器状态、历史和 URL 单元测试

工作：

1. 五层属性变化时调用共享 `resolveAffinityProfile()`；单独更换模型不改变已附加属性。
2. 状态保存五件零件 ID 和五层属性选择，不持久化派生共鸣。
3. 生成中文展示模型：主属性、数量、共鸣、克制、弱点和加成。
4. 模型与属性共同进入撤销/重做历史；纯属性撤销不触发 3D 模型重载。
5. V1 本地组合补齐兼容默认属性；非法 V2 保存恢复安全默认状态。

验证：定制器单元测试和 TypeScript 构建通过。

推荐提交：`feat(customizer): derive affinity profile from combination`

### 任务 2.2：增加零件属性徽章和共鸣面板

文件：

- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityBadge.tsx`
- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityPanel.tsx`
- 修改 `battle-top-designer/web-customizer/src/App.tsx`
- 修改 `battle-top-designer/web-customizer/src/styles.css`
- 修改 `battle-top-designer/web-customizer/src/i18n/zhCN.ts`
- 新增组件单元测试和 `tests/e2e/customizer.spec.ts` 专项用例

工作：

1. 零件选项显示属性图标、名称和颜色。
2. 共鸣面板显示七属性计数、主属性、共鸣、克制和弱点。
3. 颜色不是唯一信息，同时显示文本和图标。
4. 移动端不遮挡五层选择器。

验证：

```powershell
npm run test:unit -- affinity
npm run build
npm run test:e2e -- customizer.spec.ts
```

推荐提交：`feat(customizer): show affinity badges and resonance`

### 任务 2.3：增加替换前后差异

文件：

- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityComparison.tsx`
- 修改 `battle-top-designer/web-customizer/src/App.tsx` 中现有五层零件选择器渲染
- 新增 `battle-top-designer/web-customizer/tests/unit/affinityComparison.test.ts`

工作：

1. 悬停或聚焦候选零件时构造临时组合。
2. 显示基础属性差值、属性数量差值和共鸣得失。
3. 键盘和触摸设备提供等价预览入口。
4. 候选离开后恢复当前组合，不写入历史记录。

验证：专项单元测试、键盘 E2E 和移动端 E2E 通过。

推荐提交：`feat(customizer): preview part and resonance deltas`

### 任务 2.4：增加构筑流派、规则校验和受约束随机

文件：

- 新增 `battle-top-designer/shared/nss/build-profile.ts`
- 新增 `battle-top-designer/shared/nss/build-rules.ts`
- 新增 `battle-top-designer/web-customizer/src/build/BuildProfilePanel.tsx`
- 新增 `battle-top-designer/web-customizer/src/build/RuleViolations.tsx`
- 新增 `battle-top-designer/web-customizer/tests/unit/buildProfile.test.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/buildRules.test.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/ruleAwareRandomizer.test.ts`

工作：

1. 实现强袭、堡垒、耐久、反击、爆裂、均衡六种解释标签。
2. 标签不增加战斗属性。
3. 实现禁用零件、重量、稀有度、属性、重复套装和公平模式规则。
4. 随机配装只从已解锁零件中选择，并在有限次数内返回合法结果或明确失败。

验证：每种流派有固定样例；所有规则有正反例；随机器不会返回非法组合。

推荐提交：`feat(customizer): add build profiles and rule-aware randomizer`

### 任务 2.5：升级分享载荷

文件：

- 修改 `battle-top-designer/web-customizer/src/sharing/combinationUrl.ts`
- 修改 `battle-top-designer/web-customizer/src/store.ts`
- 修改 `battle-top-designer/web-customizer/tests/unit/combinationUrl.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/e2e/sharing.spec.ts`
- 修改 `battle-top-designer/web-customizer/tests/e2e/png-card.spec.ts`

工作：

1. 分享载荷加入目录、规则和 schema 版本。
2. 只保存零件 ID、五层属性选择和可选纹章 ID。
3. 不保存派生属性、流派和共鸣。
4. 旧链接按明确版本迁移；非法链接显示提示并恢复默认组合。

验证：旧、新链接双向测试及二维码/PNG 回归通过。

推荐提交：`feat(sharing): version NSS build links`

阶段 2 门禁：定制器单元、构建、关键 E2E、分享、二维码和 PNG 测试通过。

---

## 阶段 3：元素接入现有战斗

### 任务 3.1：扩展 BattleStats

文件：

- 修改 `src/gameplay/build.ts`
- 修改 `src/nss/buildStats.ts`
- 修改 `src/nss/types.ts`
- 修改 `battle-top-designer/web-customizer/tests/unit/nssBattleStats.test.ts`
- 新增 `tests/unit/nss-affinity-stats.test.ts`

工作：

1. `BattleStats` 增加 `affinity: AffinityProfile`。
2. NSS 五层计算调用共享属性核心。
3. legacy 路径使用迁移后的简化属性结果，保持原基础数值。
4. 旧 `attributes` 字段在本任务保留兼容，不立即删除。

验证：原黄金样例基础数值不漂移，NSS 属性结果与定制器一致。

推荐提交：`feat(arena): attach affinity profiles to battle stats`

### 任务 3.2：拆分物理和元素伤害

文件：

- 修改 `src/gameplay/damage.ts`
- 修改 `src/gameplay/battlePhysics.ts`
- 修改 `src/types/battle.ts`
- 新增 `tests/unit/elemental-damage.test.ts`

工作：

1. 保留当前伤害公式前半段。
2. 主动攻击有效伤害拆分为 80% 物理和 20% 元素。
3. 元素部分应用进攻共鸣和克制。
4. 环境、墙壁、自然衰减保持中立。
5. `DamageResult` 返回两部分伤害和关系标签。

测试：

- 中立、优势、劣势和光暗。
- 暴击、反击、格挡与克制组合。
- 总伤害影响约束。
- 非主动伤害不应用元素。

验证：`npm run test:unit -- elemental-damage`

推荐提交：`feat(combat): apply affinity to elemental damage share`

### 任务 3.3：接入协调稳定性

文件：

- 修改 `src/nss/buildStats.ts`
- 修改 `src/gameplay/battlePhysics.ts`
- 修改 `src/gameplay/top.ts`
- 新增 `tests/unit/harmony-stability.test.ts`

工作：

1. 防御倍率只在派生防御计算的一个位置应用。
2. 自然转速消耗应用 `spinDrainMultiplier`。
3. 碰撞和低转速倾斜增长应用 `tiltGrowthMultiplier`。
4. 不修改移动速度、碰撞半径、QTE 或回合时间。

验证：协调分布的防御、转速和倾斜测试通过；进攻共鸣无稳定加成。

推荐提交：`feat(combat): apply harmony defense and stability`

### 任务 3.4：分离技能形式和攻击属性

文件：

- 修改 `src/types/battle.ts`
- 修改 `src/gameplay/skills.ts`
- 修改 `src/app/game.ts`
- 修改 `src/ui/turnPanel.ts`
- 新增 `tests/unit/skill-affinity.test.ts`

工作：

1. 技能元数据增加 `visualSchool`。
2. 技能继续决定等级、消耗、状态和视觉。
3. 伤害属性始终取攻击者主属性。
4. 不增加或删除任何战斗按钮。

验证：不同主属性使用同一技能时，技能行为不变但元素关系变化。

推荐提交：`refactor(combat): separate skill visuals from affinity damage`

### 任务 3.5：增加元素战斗信息

文件：

- 新增 `src/ui/affinityBadge.ts`
- 新增 `src/ui/affinityMatchup.ts`
- 修改 `src/ui/hud.ts`
- 修改 `src/ui/results.ts`
- 修改 `src/ui/combatLog.ts`
- 修改 `src/app/game.ts`，仅接入组件调用
- 修改 `src/style.css`

工作：

1. VS 页面显示主属性和克制关系。
2. HUD 显示小型属性徽章。
3. 战斗日志说明克制和协调。
4. 结算显示物理、元素和共鸣贡献。
5. `game.ts` 不包含元素展示 HTML 模板。

验证：专项 DOM 单元测试、浏览器战斗流程和移动端布局通过。

推荐提交：`feat(ui): explain affinity matchup and damage`

### 任务 3.6：完成第一轮平衡门禁

文件：

- 新增 `tests/unit/affinity-balance-matrix.test.ts`
- 仅在测试证明需要时调整 `affinity-rules.json`

工作：

1. 遍历全部合法 NSS 组合。
2. 对每组属性关系运行固定攻击样例。
3. 检查克制不能覆盖基础构筑差异。
4. 检查协调构筑不会同时获得进攻共鸣。

验证：根测试、NSS 契约、构建和浏览器战斗烟雾测试通过。

推荐提交：`test(balance): validate affinity battle matrix`

阶段 3 门禁：M1 元素改装实验室可完整游玩，战斗操作与原版一致。

---

## 阶段 4：邀请身份、SQLite 和统一门户

### 任务 4.1：建立 HTTP 服务外壳

文件：

- 新增 `server/http-server.mjs`
- 修改 `server/match-server.mjs`
- 修改 `package.json`
- 修改 `scripts/test-match-server.mjs`
- 新增 `scripts/test-http-server.mjs`

工作：

1. 同一 Node 进程启动 HTTP 和 WebSocket。
2. 保留现有 WebSocket 协议行为。
3. 增加 JSON body 上限、统一错误格式和 `/health`。
4. 生产环境提供统一站点静态文件。

验证：现有服务端测试和新增 HTTP 健康检查通过。

推荐提交：`feat(server): add HTTP API shell beside WebSocket`

### 任务 4.2：建立 SQLite 和迁移器

文件：

- 新增 `server/storage/database.mjs`
- 新增 `server/storage/migrate.mjs`
- 新增 `server/storage/migrations/001_identity.sql`
- 新增 `server/storage/migrations/002_builds_and_challenges.sql`
- 新增迁移测试

工作：

1. 使用 Node 内置 SQLite 接口。
2. 启用外键、busy timeout 和 WAL。
3. 迁移器按版本只执行一次并置于事务内。
4. 测试使用独立临时数据库，不接触生产数据。

验证：空库迁移、重复迁移、失败回滚和重启读取测试通过。

推荐提交：`feat(server): add SQLite migrations`

### 任务 4.3：实现邀请码和本地设备身份

文件：

- 新增 `server/auth/invite-service.mjs`
- 新增 `server/auth/auth-middleware.mjs`
- 修改 `server/storage/migrations/001_identity.sql`
- 新增 `src/auth/localIdentity.ts`
- 新增 `src/auth/inviteClient.ts`
- 新增服务端和前端单元测试

工作：

1. 邀请码验证 enabled、maxUses 和 useCount。
2. 创建 playerId 和安全随机设备令牌。
3. 数据库只保存令牌哈希。
4. 浏览器本地保存身份。
5. 停用邀请码不使现有设备令牌失效。

验证：有效、无效、停用、超限、重复兑换和伪造令牌测试通过。

推荐提交：`feat(auth): add invite-only local identity`

### 任务 4.4：实现统一门户和访问门禁

文件：

- 新增 `src/ui/portal.ts`
- 新增 `src/ui/inviteGate.ts`
- 修改 `src/main.ts`
- 修改 `src/style.css`
- 新增浏览器 E2E

工作：

1. 未认证玩家只能看到邀请入口。
2. 认证后显示昵称、金币、当前配装和六个模式入口。
3. 暂未开放的入口显示解锁条件，不跳到空页面。
4. 保持 customizer 和 arena 的现有相对路径。

验证：首次进入、刷新、无效令牌和移动端入口 E2E 通过。

推荐提交：`feat(portal): gate unified game hub by invite identity`

### 任务 4.5：迁移和同步进度

文件：

- 新增 `server/progression/progression-service.mjs`
- 新增 `server/storage/migrations/003_campaign_and_scores.sql`
- 新增 `src/progression/progressionClient.ts`
- 修改 `src/app/progression.ts`
- 新增进度合并测试

工作：

1. 首次登录上传本地进度。
2. 解锁集合取并集，最佳成绩取更高值。
3. 当前配装以本机为准。
4. 金币首次迁移后以服务端为准，禁止重复累加。
5. 后续每次奖励由服务端幂等记录。

验证：首次迁移、重复迁移、断网恢复和冲突测试通过。

推荐提交：`feat(progression): sync invited player progress`

### 任务 4.6：基础备份和恢复脚本

文件：

- 新增 `scripts/backup-private-server.mjs`
- 新增 `scripts/restore-private-server.mjs`
- 修改 `.gitignore`
- 新增脚本测试或 dry-run 验证

工作：

1. 备份 SQLite 和上传目录到带时间戳的单一目录。
2. 恢复前验证目标路径和清单，不覆盖未知目录。
3. 提供 dry-run。
4. 记录备份版本和校验值。

验证：使用临时目录完成一次备份和空目录恢复。

推荐提交：`ops: add private server backup and restore`

阶段 4 门禁：受邀玩家可进入门户，服务器重启后身份和进度存在，备份可恢复。

---

## 阶段 5：确定性异步挑战

### 任务 5.1：建立种子随机数服务

文件：

- 新增 `src/sim/rng.ts`
- 新增 `tests/unit/rng.test.ts`
- 新增 `src/sim/battleSeed.ts`

工作：

1. 实现小型、稳定、无依赖的种子 PRNG。
2. 定义 seed 序列化和无符号整数边界。
3. 同一 seed 在浏览器和 Node 测试中产生相同序列。

验证：固定向量、边界 seed 和重复调用测试通过。

推荐提交：`feat(sim): add deterministic battle RNG`

### 任务 5.2：迁移所有结果随机数

文件：

- 修改 `src/gameplay/damage.ts`
- 修改 `src/gameplay/ai.ts`
- 修改 `src/gameplay/clashAI.ts`
- 修改 `src/gameplay/battlePhysics.ts`
- 修改 `src/app/game.ts` 的比赛初始化
- 新增确定性回归测试

工作：

1. 暴击、AI 行动、伤害浮动、爆裂和出界使用比赛 RNG。
2. 粒子、烟雾、纯视觉抖动继续使用 `Math.random()`。
3. 禁止结果逻辑直接调用全局随机数。
4. 黄金样例加入固定 seed。

验证：相同输入和 seed 的完整结果摘要字节一致。

推荐提交：`refactor(sim): seed all outcome randomness`

### 任务 5.3：定义挑战 schema 和持久化

文件：

- 新增 `battle-top-designer/shared/nss/challenge.schema.json`
- 新增 `server/challenges/challenge-service.mjs`
- 完成 `002_builds_and_challenges.sql`
- 新增 schema 和服务测试

工作：

1. 保存挑战者、构筑、纹章、竞技场、规则、版本、seed 和挑战语。
2. 服务端重新验证零件和版本。
3. 不接受客户端提交共鸣、最终属性或任意结果值。
4. 历史挑战保存不可变快照。

验证：合法、缺字段、未知零件、错误版本和重复创建测试通过。

推荐提交：`feat(challenge): persist versioned challenge snapshots`

### 任务 5.4：实现挑战 API 和收件箱

文件：

- 修改 `server/http-server.mjs`
- 新增 `src/challenges/challengeClient.ts`
- 新增 `src/ui/challengeInbox.ts`
- 新增 API 和 UI 测试

工作：

1. 实现创建、收件箱、详情和结果提交。
2. 结果按挑战 ID、应战者 ID 幂等。
3. 收件箱分页按最近时间排序。
4. 损坏或过期挑战返回明确状态。

验证：双身份 API 集成测试通过。

推荐提交：`feat(challenge): add inbox and idempotent results`

### 任务 5.5：实现 VS、应战和回挑战流程

文件：

- 新增 `src/ui/challengeIntro.ts`
- 修改 `src/ui/results.ts`
- 修改 `src/app/game.ts`，只编排挑战状态
- 新增 `src/challenges/challengeShare.ts`
- 新增 `tests/e2e/async-challenge.spec.ts`

工作：

1. 显示挑战者、纹章、主属性和规则。
2. 应战者选择配装后进入现有发射和战斗流程。
3. 结算提交战报并提供回挑战。
4. 公平/全力规则有醒目标识。

验证：两个独立浏览器上下文完成创建、应战、结算和回挑战。

推荐提交：`feat(challenge): complete asynchronous friend battle flow`

阶段 5 门禁：M2 朋友挑战版可在公网邀请身份下完整运行。

---

## 阶段 6：八名对手战役

### 任务 6.1：定义数据化对手和目标

文件：

- 新增 `src/data/campaign/opponents.ts`
- 新增 `src/data/campaign/objectives.ts`
- 新增 `src/data/campaign/campaignRules.ts`
- 新增数据验证测试

工作：

1. 定义八名对手、属性主题、2–3 套配装、AI 权重、竞技场、规则和台词。
2. 定义三星目标和首次奖励。
3. 对手只能引用共享目录中的合法零件和规则。

验证：所有对手配置通过 schema，奖励 ID 唯一。

推荐提交：`feat(campaign): define eight data-driven rivals`

### 任务 6.2：实现战役进度和奖励幂等

文件：

- 新增 `server/progression/campaign-service.mjs`
- 完成 `003_campaign_and_scores.sql`
- 新增 `src/campaign/campaignClient.ts`
- 新增服务测试

工作：

1. 保存星级、最佳结果和首次奖励状态。
2. 重复通关可更新最佳成绩，但不重复发放首次奖励。
3. 星级条件由可信战斗摘要计算。

验证：重复提交、提高星级和断线重试测试通过。

推荐提交：`feat(campaign): persist stars and idempotent rewards`

### 任务 6.3：实现对手档案和关卡流程

文件：

- 新增 `src/ui/campaignArchive.ts`
- 新增 `src/ui/campaignOpponent.ts`
- 修改 `src/ui/menus.ts`
- 修改 `src/app/game.ts`，只接入模式控制器
- 新增 `tests/e2e/campaign.spec.ts`

工作：

1. 展示锁定、已解锁、星级和奖励。
2. 进入关卡前显示属性教学和特殊规则。
3. 结算后刷新星级与下一名对手。

验证：从第一名对手到最终 BOSS 的完整导航测试通过。

推荐提交：`feat(campaign): add rival archive and battle flow`

### 任务 6.4：实现数据驱动 AI 权重

文件：

- 修改 `src/gameplay/ai.ts`
- 新增 `src/gameplay/aiProfiles.ts`
- 新增 `tests/unit/campaign-ai.test.ts`

工作：

1. AI profile 只控制现有行动的选择权重。
2. AI 不读取玩家未来输入，不在战斗中更换配装。
3. 固定 seed 下行为可复现。

验证：八种 profile 的行动分布和确定性测试通过。

推荐提交：`feat(ai): add deterministic campaign profiles`

阶段 6 门禁：八名对手可完整通关，教学顺序和奖励正确。

---

## 阶段 7：完整生存模式

### 任务 7.1：提取生存运行状态

文件：

- 新增 `src/gameplay/survival/survivalRun.ts`
- 修改 `src/app/game.ts`
- 新增 `tests/unit/survival-run.test.ts`

工作：

1. 将 wave、score、multiplier、临时强化和敌人摘要移出 `game.ts`。
2. `game.ts` 只持有一个 `SurvivalRun`。
3. 重开、退出和失败都走明确状态迁移。

验证：状态机单元测试通过，普通模式不受影响。

推荐提交：`refactor(survival): extract run state from game`

### 任务 7.2：实现波次生成

文件：

- 新增 `src/gameplay/survival/waveGenerator.ts`
- 新增 `tests/unit/wave-generator.test.ts`

工作：

1. 1–2 波普通敌人，3–4 波加入精英，5 波 BOSS。
2. 后续每五波循环提升复杂度。
3. 使用运行 seed 生成敌人配装和属性主题。
4. 限制同时存在的敌人数。

验证：前 20 波快照和固定 seed 测试通过。

推荐提交：`feat(survival): generate deterministic waves`

### 任务 7.3：实现波次后三选一

文件：

- 新增 `src/gameplay/survival/survivalRewards.ts`
- 新增 `src/ui/survivalRewardPanel.ts`
- 新增 `tests/unit/survival-rewards.test.ts`

工作：

1. 提供恢复、进攻、协调、拾取和风险倍率奖励。
2. 奖励只修改当前 `SurvivalRun`。
3. 同一波不出现重复选项。
4. 选择期间暂停战斗模拟。

验证：奖励生命周期、重复限制和退出清理测试通过。

推荐提交：`feat(survival): add between-wave choices`

### 任务 7.4：实现成绩和排行榜

文件：

- 新增 `src/gameplay/survival/survivalScoring.ts`
- 新增 `server/progression/score-service.mjs`
- 新增 `src/ui/survivalResults.ts`
- 新增服务和 UI 测试

工作：

1. 统一计算波次、击杀、精英、连杀和风险倍率。
2. 提交运行摘要，不直接信任任意最终分数。
3. 保存个人最佳和朋友排行榜。

验证：相同摘要得分一致，伪造不可能字段被拒绝。

推荐提交：`feat(survival): persist verified scores`

阶段 7 门禁：M3 单人完整版可完整游玩，战役和生存进度可恢复。

---

## 阶段 8：纹章工坊

### 任务 8.1：建立安全图片存储

文件：

- 修改 `package.json` 和 `package-lock.json`，加入 `sharp`
- 新增 `server/storage/uploads.mjs`
- 新增 `server/storage/migrations/004_emblems_and_gallery.sql`
- 新增上传服务测试

工作：

1. 限制 MIME、文件大小和解码后像素。
2. 移除元数据并输出固定 WebP。
3. 使用 playerId/emblemId 明确路径。
4. 原始文件只存在于单次处理临时路径。
5. 每位玩家最多 20 个纹章。

验证：PNG/JPEG/WebP、伪造扩展名、超大图和损坏文件测试通过。

推荐提交：`feat(emblem): add safe image processing storage`

### 任务 8.2：实现客户端纹章渲染核心

文件：

- 新增 `battle-top-designer/web-customizer/src/emblem/emblemRenderer.ts`
- 新增 `battle-top-designer/web-customizer/src/emblem/types.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/emblemRenderer.test.ts`

工作：

1. 实现裁剪、缩放、90 度旋转、滤镜、遮罩和边框。
2. 相同 recipe 输出确定尺寸结果。
3. 预览不修改原图对象。

验证：像素级或结构化 Canvas 测试通过。

推荐提交：`feat(emblem): render deterministic emblem recipes`

### 任务 8.3：实现纹章编辑器 UI

文件：

- 新增 `battle-top-designer/web-customizer/src/emblem/EmblemEditor.tsx`
- 新增 `battle-top-designer/web-customizer/src/emblem/CropStage.tsx`
- 新增 `battle-top-designer/web-customizer/src/emblem/FilterPanel.tsx`
- 新增 `battle-top-designer/web-customizer/src/emblem/FrameSelector.tsx`
- 新增 `battle-top-designer/web-customizer/src/emblem/EmblemPreview.tsx`
- 修改 `battle-top-designer/web-customizer/src/App.tsx`
- 修改 `battle-top-designer/web-customizer/src/styles.css`
- 新增 `battle-top-designer/web-customizer/tests/unit/emblemEditor.test.tsx`
- 新增 `battle-top-designer/web-customizer/tests/e2e/emblem-editor.spec.ts`

工作：

1. 上传后依次完成裁剪、滤镜、边框和 3D 预览。
2. 六种滤镜、六种遮罩/边框和七属性主题边框。
3. 键盘和触摸均可完成编辑。

验证：桌面和移动端完整编辑流程通过。

推荐提交：`feat(customizer): add emblem workshop`

### 任务 8.4：在五层模型上显示纹章

文件：

- 新增 `src/nss/emblemVisual.ts`
- 修改 `src/nss/battleTopVisual.ts`
- 修改 `battle-top-designer/web-customizer/src/Scene.tsx`
- 新增 Three.js 资源生命周期测试

工作：

1. 使用独立圆形覆盖网格，不修改正式 GLB UV。
2. 定制器和 Arena 使用同一尺寸、朝向和纹理设置。
3. 更换纹章时释放旧纹理，销毁实例不释放共享模型资源。

验证：代表组合视觉检查和纹理计数稳定性测试通过。

推荐提交：`feat(nss): display custom emblems on battle tops`

### 任务 8.5：完成上传、保存和应用

文件：

- 新增 `server/gallery/emblem-service.mjs`
- 新增 `battle-top-designer/web-customizer/src/emblem/emblemClient.ts`
- 新增 `src/emblems/emblemLoader.ts`
- 修改 `battle-top-designer/web-customizer/src/emblem/EmblemEditor.tsx`
- 修改 `src/nss/loadoutController.ts`
- 修改 `src/nss/battleTopVisual.ts`
- 新增 `battle-top-designer/web-customizer/tests/e2e/emblem-save.spec.ts`
- 新增 `tests/e2e/emblem-arena.spec.ts`

工作：

1. 服务端重新生成最终图片，不信任客户端成品。
2. 保存 recipe 和标准图片路径。
3. 选择纹章更新当前构筑，不影响战斗数值。
4. 删除纹章保留历史挑战快照引用所需缩略图。

验证：上传、应用、刷新恢复和删除测试通过。

推荐提交：`feat(emblem): persist and apply player emblems`

阶段 8 门禁：备份已验证，纹章在定制器、Arena 和分享卡显示一致。

---

## 阶段 9：朋友展厅和活动

### 任务 9.1：实现展厅查询和收藏

文件：

- 新增 `server/gallery/gallery-service.mjs`
- 完成 `004_emblems_and_gallery.sql`
- 修改 `server/http-server.mjs`
- 新增 API 测试

工作：

1. 分页返回受邀玩家的发布作品。
2. 支持属性和流派筛选。
3. 收藏创建和删除保持幂等。

验证：权限、分页、筛选和重复收藏测试通过。

推荐提交：`feat(gallery): add invited-player gallery API`

### 任务 9.2：实现作品列表和详情

文件：

- 新增 `src/ui/gallery.ts`
- 新增 `src/ui/galleryCard.ts`
- 新增 `src/ui/galleryDetail.ts`
- 修改 `src/ui/portal.ts`
- 修改 `src/style.css`
- 新增 `tests/e2e/gallery.spec.ts`

工作：

1. 展示作者、纹章、五层零件、主属性、共鸣、流派和纪录。
2. 提供收藏、复制配装、挑战和战报入口。
3. 复制配装不复制强化等级。

验证：浏览、筛选、复制和发起挑战 E2E 通过。

推荐提交：`feat(gallery): add friend showcase UI`

### 任务 9.3：实现高价值活动流

文件：

- 新增 `server/gallery/activity-service.mjs`
- 新增 `server/storage/migrations/005_activity.sql`
- 新增 `src/ui/activityFeed.ts`
- 新增 `tests/unit/activity-service.test.ts`
- 新增 `tests/unit/activity-feed.test.ts`

工作：

1. 只记录 BOSS 首胜、生存纪录、纹章发布、挑战完成和稀有解锁。
2. 相同领域事件只生成一条活动。
3. 门户只展示最近三条。

验证：事件去重和无低价值刷屏测试通过。

推荐提交：`feat(social): add compact friend activity feed`

阶段 9 门禁：M4 创作社区版完成，作品、构筑和挑战形成闭环。

---

## 阶段 10：实时好友公平规则

### 任务 10.1：WebSocket 身份认证

文件：

- 修改 `src/network/networkClient.ts`
- 修改 `src/network/protocol.ts`
- 修改 `server/match-server.mjs`
- 修改 `scripts/test-match-server.mjs`

工作：

1. 握手携带 playerId 和设备令牌。
2. 未认证连接不能加入匹配。
3. 房间广播昵称和纹章摘要，不广播设备令牌。

验证：认证、伪造、过期和重连测试通过。

推荐提交：`feat(network): authenticate invited players`

### 任务 10.2：公平竞技和全力乱斗

文件：

- 修改 `battle-top-designer/shared/nss/challenge.schema.json`
- 新增 `battle-top-designer/shared/nss/room.schema.json`
- 修改 `src/network/protocol.ts`
- 修改 `src/gameplay/build.ts`
- 修改 `server/match-server.mjs`
- 修改 `src/ui/lanModal.ts`
- 新增 `tests/unit/fair-room-rules.test.ts`

工作：

1. 公平模式忽略永久整机和零件强化。
2. 全力模式使用真实强化。
3. 只有公平模式计入公平战绩。
4. 双方房间 UI 显示规则。

验证：同一配装在公平模式产生相同基础属性；全力模式保留成长差异。

推荐提交：`feat(network): add fair and full-power rooms`

### 任务 10.3：版本一致和战报

文件：

- 修改 `src/network/protocol.ts`
- 修改 `server/match-server.mjs`
- 修改 `scripts/test-match-server.mjs`
- 修改 `src/ui/results.ts`
- 新增 `tests/e2e/realtime-fair-match.spec.ts`

工作：

1. 匹配前校验目录、元素和战斗规则版本。
2. 版本不同不得开始正式战斗。
3. 结束后生成与异步挑战相同格式的战报。

验证：版本不一致、断线、重复 ready 和重复结算测试通过。

推荐提交：`feat(network): validate rules and share match reports`

阶段 10 门禁：现有局域网流程和公网实时公平战斗均可完成一局。

---

## 阶段 11：背景、音乐和体验打磨

### 任务 11.1：重构音频状态管理

文件：

- 修改 `src/audio/synth.ts`
- 新增 `src/audio/musicState.ts`
- 新增音频状态测试

工作：

1. 定义菜单、配装、发射、战斗、危险、必杀、生存高波次、胜利和失败状态。
2. 状态切换交叉淡化，不重叠创建无限 AudioNode。
3. 保留现有合成碰撞音效。

验证：快速切换、静音和页面隐藏测试通过。

推荐提交：`feat(audio): add dynamic music state machine`

### 任务 11.2：增加音乐和分层音效

文件：

- 新增 `public/audio/music/menu.ogg`
- 新增 `public/audio/music/customizer.ogg`
- 新增 `public/audio/music/battle.ogg`
- 新增 `public/audio/music/survival.ogg`
- 新增 `public/audio/music/ATTRIBUTION.md`
- 修改 `src/audio/synth.ts`
- 修改 `src/audio/musicState.ts`
- 新增 `src/settings/audioSettings.ts`
- 新增 `src/ui/audioSettings.ts`
- 修改 `src/ui/portal.ts`
- 新增 `tests/unit/audio-settings.test.ts`

工作：

1. 按状态加载和复用音乐。
2. 区分轻擦、中撞、重击、低转速、克制和波次事件。
3. 设置写入本地存储。

验证：无重复播放、刷新保留设置、音频资源缺失可降级。

推荐提交：`feat(audio): layer battle music and impact sounds`

### 任务 11.3：增加门户能量束背景

文件：

- 新增 `src/scene/portalBeams.ts`
- 修改 `src/ui/portal.ts`
- 修改 `src/scene/postProcessing.ts`
- 新增 `tests/unit/portal-beams.test.ts`
- 新增 `tests/e2e/portal-performance.spec.ts`

工作：

1. 原创实现能量束概念，不复制参考项目 shader。
2. 离开门户后停止动画和释放场景实例。
3. 低性能模式不创建动态背景。

验证：门户进入/离开 20 次后资源计数稳定。

推荐提交：`feat(portal): add performance-aware energy background`

### 任务 11.4：统一画质和低性能模式

文件：

- 新增 `src/settings/graphicsSettings.ts`
- 修改 `src/scene/postProcessing.ts`
- 修改 `src/fx/sparks.ts`
- 修改 `src/fx/trails.ts`
- 修改 `src/fx/shockwave.ts`
- 修改 `src/app/game.ts` 中 renderer 像素比和阴影配置
- 新增 `tests/unit/graphics-settings.test.ts`
- 新增 `tests/e2e/graphics-settings.spec.ts`

工作：

1. 提供高、中、低预设。
2. 低档关闭门户背景，降低粒子/Bloom，限制像素比。
3. 不改变战斗计算频率和结果。

验证：设置持久化、资源开关和性能专项 E2E 通过。

推荐提交：`feat(settings): add graphics quality profiles`

阶段 11 门禁：M5 联机与视听版完成；完整浏览器性能门禁通过。

---

## 阶段 12：服务端 AI 纹章

### 任务 12.1：增加 AI 使用配额数据

文件：

- 新增 `server/storage/migrations/006_ai_usage.sql`
- 新增配额服务和测试

工作：

1. 按玩家和日期记录调用次数。
2. 请求开始前原子预留一次额度；明确失败时归还。
3. 不记录用户设备令牌或外部 API Key。

验证：并发、超额、失败归还和日期切换测试通过。

推荐提交：`feat(ai): track invited-player generation quotas`

### 任务 12.2：实现服务端 OpenAI 纹章生成

文件：

- 新增 `server/gallery/ai-emblem-service.mjs`
- 修改 `server/http-server.mjs`
- 修改环境变量示例和部署文档
- 新增带伪造客户端的服务测试

工作：

1. API Key 仅从服务端环境读取。
2. 输入为上传图片、七属性主题、预设风格和短描述。
3. 设置超时，只对安全的瞬时错误重试一次。
4. 输出进入阶段 8 的标准图片处理链路。

验证：前端 bundle 无密钥；超时、超额、外部失败均不创建空作品。

推荐提交：`feat(ai): generate emblems through server proxy`

### 任务 12.3：把 AI 输出接回编辑器

文件：

- 修改 `battle-top-designer/web-customizer/src/emblem/EmblemEditor.tsx`
- 新增 `battle-top-designer/web-customizer/src/emblem/aiEmblemClient.ts`
- 新增 `battle-top-designer/web-customizer/tests/e2e/ai-emblem.spec.ts`

工作：

1. AI 生成是上传入口旁的可选入口。
2. 输出必须继续经过裁剪、滤镜和边框编辑。
3. AI 失败不影响本地上传功能。

验证：成功、失败、超额和取消流程 E2E 通过。

推荐提交：`feat(emblem): edit AI-generated emblem drafts`

阶段 12 门禁：AI 是可关闭增强项，关闭后 M1–M5 功能全部正常。

---

## 阶段 13：公网交付和最终质量门禁

### 任务 13.1：生产服务器入口

文件：

- 修改 `scripts/build-unified-site.mjs`
- 新增 `server/start-production.mjs`
- 修改 `package.json`
- 新增 `scripts/verify-production-layout.mjs`

工作：

1. 单 Node 进程提供静态站点、REST、WebSocket 和上传资源。
2. 不暴露数据库、备份和原始上传路径。
3. `/customizer/`、`/arena/` 和门户可直接刷新。

验证：生产构建和本地生产烟雾测试通过。

推荐提交：`build: serve complete private arena site`

### 任务 13.2：HTTPS 和反向代理说明

文件：

- 新增 `docs/deployment/private-server.md`
- 新增示例 Caddy 配置

工作：

1. 记录域名、HTTPS、WebSocket 转发和上传大小限制。
2. 配置不包含真实域名、密钥或绝对用户路径。
3. 记录 Node 和磁盘要求。

验证：配置语法检查和公网测试环境 WebSocket 连接通过。

推荐提交：`docs: add private server deployment guide`

### 任务 13.3：自动备份、健康检查和日志

文件：

- 扩展阶段 4 备份脚本
- 新增计划任务示例
- 新增结构化日志模块
- 修改 `/health`

工作：

1. 每日备份数据库、纹章和版本清单。
2. 保留期按明确数量轮换，不在程序中批量删除未知目录。
3. 日志覆盖认证失败、挑战、房间、图片和数据库错误。
4. 日志不得包含明文令牌和 API Key。

验证：一次自动备份、一次空目录恢复、日志脱敏和健康检查通过。

推荐提交：`ops: harden backups health checks and logs`

### 任务 13.4：管理员命令

文件：

- 新增 `scripts/admin-invites.mjs`
- 新增 `scripts/admin-emblems.mjs`
- 新增脚本测试

工作：

1. 创建、查看和停用邀请码。
2. 查看使用次数。
3. 禁用单个明确作品。
4. 不建设网页管理后台。

验证：所有命令支持 dry-run；不会批量删除文件。

推荐提交：`ops: add minimal private server admin commands`

### 任务 13.5：最终全量验收

文件：

- 修改 `tests/e2e/baseline.spec.ts`
- 修改 `tests/e2e/campaign.spec.ts`
- 修改 `tests/e2e/async-challenge.spec.ts`
- 新增 `tests/e2e/survival.spec.ts`
- 修改 `tests/e2e/gallery.spec.ts`
- 修改 `tests/e2e/realtime-fair-match.spec.ts`
- 新增 `tests/e2e/restart-recovery.spec.ts`
- 新增 `scripts/verify-complete-expansion.mjs`
- 修改 `README.md`
- 修改 `docs/deployment/private-server.md`

工作：

1. 新玩家邀请码进入。
2. 完成第一场战役。
3. 创建纯属性和协调配装。
4. 双浏览器完成异步挑战和回挑战。
5. 完成生存结算和排行榜。
6. 上传、发布、复制纹章配装。
7. 完成实时公平战斗。
8. 重启服务器并恢复数据。
9. 运行性能、资源生命周期和完整构建门禁。

验证：通用验证命令与完整 E2E 全部通过，`git diff --check` 无错误。

推荐提交：`test: add complete expansion release gate`

阶段 13 门禁：M6 AI 与稳定版完成，可部署给受邀朋友使用。

---

## 里程碑交付顺序

| 里程碑 | 阶段 | 用户可见成果 |
|---|---|---|
| M1 元素改装实验室 | 0–3 | 七属性配装、共鸣解释和战斗生效 |
| M2 朋友挑战版 | 4–5 | 邀请身份、异步挑战和回挑战 |
| M3 单人完整版 | 6–7 | 八名对手战役和完整生存 |
| M4 创作社区版 | 8–9 | 纹章工坊和朋友展厅 |
| M5 联机与视听版 | 10–11 | 公平实时战斗和动态音画 |
| M6 AI 与稳定版 | 12–13 | AI 纹章和公网稳定运行 |

每个里程碑完成后先交付试玩和验收报告，再继续下一里程碑。实现时默认从任务 0.1 开始，不跨阶段并行修改同一文件。
