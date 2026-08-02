# NSS 定制器规则预设与受约束随机装配实施计划

日期：2026-08-02

关联规格：`docs/superpowers/specs/2026-08-02-customizer-rule-aware-randomizer-design.md`

## 目标

为 Web Customizer 增加四个固定规则预设、当前装配的结构化违规说明和受约束随机装配。随机结果同时包含五件零件与五层附加属性，并作为一次历史操作撤销；规则只用于当前定制器会话，不改变战斗、构筑流派、存档、分享或 Arena 载荷。

## 成功标准

- 自由组装、轻量竞技、元素专精、基础零件杯四个预设定义固定。
- 校验器一次返回全部违规，顺序稳定，重量 `2.10` 和三件属性边界正确。
- 元素专精支持风、火、水、木、土、光、暗七种目标属性。
- 随机器从完整合法集合选择，不使用有限次数重试，不返回违规结果。
- 随机零件和属性只产生一条历史，一次撤销完整恢复。
- 规则 UI 内嵌现有“组合快捷工具”，违规不禁用进入竞技场。
- TypeScript、单元测试、生产构建和 desktop/mobile E2E 全部通过。
- 根项目战斗基线和 NSS 契约完全不变。

## 约束与假设

- 本计划只实施禁用零件、总重量上限和目标属性最低件数。
- 当前目录全部 16 个零件视为可用；不创建稀有度、解锁状态或套装占位数据。
- 非元素预设随机后使用现有 `createDefaultAffinityLayers()`。
- 元素专精最低件数固定为三，不开放任意数值输入。
- 规则选择只使用 `App` 会话状态，不写入 Zustand 快照、localStorage、URL 或 Arena。
- 共享模块不依赖 React、Zustand 或定制器 DOM。
- 不修改未跟踪的 `battle-top-designer/web-customizer/src/i18n/`、`referse/`、VFX 素材、截图和测试产物。

## 【步骤 1】先建立规则校验失败测试

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/buildRules.test.ts`。
- 从尚不存在的 `battle-top-designer/shared/nss/build-rules.ts` 导入预设、类型、重量解析和校验函数。
- 固定以下行为：
  - 四个预设代码和公开参数不可变。
  - 自由组装永远不产生额外违规。
  - 轻量竞技恰好 `2.10` 合法，`2.11` 违规，并返回实际、上限和超出值。
  - 七种目标属性分别覆盖三件合法和两件违规。
  - 基础零件杯分别识别 Storm Fang、Iron Bastion、Heavy Assist。
  - 同时存在禁用零件、超重和属性不足时全部返回。
  - 违规顺序固定为槽位顺序的禁用零件、重量、属性。
  - 未知零件、错误槽位、未知预设和无效属性被明确拒绝。
  - 输入组合与属性对象不被修改。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildRules.test.ts
```

预期：测试因共享模块尚不存在而失败。确认失败原因正确后进入步骤 2。

## 【步骤 2】实现共享固定规则和校验器

目标：

- 新增 `battle-top-designer/shared/nss/build-rules.ts`。
- 复用 `parts.catalog.json`、`battle-parts.json`、`AFFINITIES`、`AffinityLayers` 和现有 family 顺序；不复制七属性集合。
- 定义最小类型：
  - `BuildRulePresetId`
  - `BuildRuleSelection`
  - `RuleCombination`
  - `RuleBuild`
  - `BuildRuleViolation`
  - `RandomBuildResult`
- 固定预设参数：
  - `FREE`
  - `LIGHTWEIGHT`，上限 `2.10`
  - `ELEMENT_SPECIALIST`，最低三件
  - `BASIC_PARTS_CUP`，三个明确禁用 ID
- 实现 `buildWeight()`，使用原始物理重量求和，仅在展示字段中保留两位小数。
- 实现 `validateBuild()`，验证输入后完整收集违规，不提前返回。
- 实现 `eligibleParts()`，只负责零件预筛；元素要求不错误地过滤零件。
- 返回只读的预设定义和结构化违规，不在共享模块生成中文文案。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildRules.test.ts tests/unit/affinity-profile.test.ts tests/unit/attributes.test.ts
```

预期：规则校验、原有属性档案和概念属性测试全部通过。

## 【步骤 3】先建立受约束随机失败测试

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/ruleAwareRandomizer.test.ts`。
- 固定以下行为：
  - 随机值 `0` 选择合法集合首项，接近 `1` 选择末项且不越界。
  - 自由、轻量、基础杯结果使用所选核心对应的默认属性。
  - 轻量结果总重始终不超过 `2.10`。
  - 基础杯结果不包含三个禁用零件。
  - 七种元素专精结果的目标属性均不少于三件。
  - 多组固定随机序列的最终结果都通过 `validateBuild()`。
  - 相同随机序列结果一致，输入规则选择不被修改。
  - 通过 Vitest 隔离并模拟空候选目录，覆盖无解失败结果；不为测试增加生产配置入口。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/ruleAwareRandomizer.test.ts
```

预期：测试因 `randomBuild()` 尚未实现而失败。

## 【步骤 4】实现有限枚举随机装配

目标：

- 在 `battle-top-designer/shared/nss/build-rules.ts` 中实现 `randomBuild(selection, random = Math.random)`。
- 按五个 family 的稳定目录顺序枚举现有 288 种零件组合。
- 使用规则校验器筛出完整合法零件集合，再以一个随机索引选择。
- 非元素预设调用现有 `createDefaultAffinityLayers(coreId)`。
- 元素专精按稳定七属性顺序枚举 `7⁵` 种属性层，筛选目标属性不少于三件的集合，再以第二个随机索引选择。
- 组合零件与属性后再次调用 `validateBuild()`；只有零违规才能返回成功。
- 空候选或防御性复核失败返回 `{ ok: false, violations }`，不返回部分结果。
- 随机索引只处理 `0 <= random < 1` 的正常随机值；非有限值或越界值明确拒绝，不静默产生偏差。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildRules.test.ts tests/unit/ruleAwareRandomizer.test.ts tests/unit/combination.test.ts
```

预期：新旧随机与组合测试全部通过。

## 【步骤 5】先建立完整装配历史失败测试

目标：

- 修改 `battle-top-designer/web-customizer/tests/unit/store.test.ts`。
- 为完整装配替换固定以下行为：
  - 一次同时替换 `combination` 和 `affinities`。
  - 相对当前装配发生变化时只创建一条历史。
  - 一次撤销恢复全部零件和五层属性。
  - 一次重做恢复随机结果。
  - 相同完整装配不创建空历史。
  - 非法完整装配被拒绝且状态不变。
- 现有 `replaceCombination()`、零件焦点和模型加载测试继续通过。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/store.test.ts
```

预期：新增断言因完整装配替换动作尚不存在而失败。

## 【步骤 6】实现原子完整装配替换

目标：

- 修改 `battle-top-designer/web-customizer/src/store.ts`。
- 新增最小动作 `replaceBuild(build)`；输入结构复用现有 `BuildSnapshot` 形状。
- 同时验证 `isCombination()` 和 `isAffinitySelection()`。
- 复用现有 `pendingPrevious`、加载状态、焦点取消和 `sameBuild()`，不创建第二套历史机制。
- 模型零件改变时进入现有加载流程；仅属性改变时不制造不必要的模型重载。
- `replaceCombination()` 保持现有行为，避免影响导入、重置或其他调用方。
- 随机失败发生在调用 store 前，因此 store 不增加失败状态或规则错误字段。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/store.test.ts tests/unit/focusLifecycle.test.ts tests/unit/combination.test.ts
```

预期：完整装配历史、原有焦点和组合测试全部通过。

## 【步骤 7】先建立规则面板失败测试

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/buildRulesPanel.test.tsx`。
- 从尚不存在的 `battle-top-designer/web-customizer/src/build/BuildRulesPanel.tsx` 导入受控组件。
- 固定以下展示和交互：
  - 四个固定预设均可选择。
  - 不存在重量、最低件数或禁用零件的自由输入控件。
  - 元素专精选中时显示全部七属性选择，其他预设隐藏它们。
  - 合法状态显示预设名称和对应摘要。
  - 单一违规和多重违规按传入顺序完整显示。
  - “按规则随机”触发回调，不自行修改 store。
  - 违规状态不渲染禁用进入竞技场的控制。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildRulesPanel.test.tsx
```

预期：测试因组件尚不存在而失败。

## 【步骤 8】实现布局 A 的规则面板

目标：

- 新增 `battle-top-designer/web-customizer/src/build/BuildRulesPanel.tsx`。
- 组件保持受控，只接收规则选择、违规项、重量、回调和随机失败文案。
- 稳定代码在组件中映射为中文名称，不在共享规则模块放 UI 文案。
- 元素选择使用现有七属性稳定顺序和名称。
- 合法状态使用文本与语义状态共同表达，不只依赖绿色。
- 违规列表使用 `role="status"` 或等价非打断式语义，不在每次换件时抢占焦点。
- “按规则随机”是面板唯一新增的主要动作；不增加弹窗、折叠或高级编辑。
- 提供稳定 test id 和规则代码属性用于 E2E。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildRulesPanel.test.tsx tests/unit/buildRules.test.ts tests/unit/ruleAwareRandomizer.test.ts
```

预期：规则模块和面板测试全部通过，无 React `act()` 警告。

## 【步骤 9】接入 App 并加入响应式样式

目标：

- 修改 `battle-top-designer/web-customizer/src/App.tsx`。
- 使用局部会话状态保存规则预设和元素目标，初始为 `FREE`，元素默认目标为 `FIRE`。
- 使用 `useMemo` 对当前 `combination + affinities` 调用 `validateBuild()`。
- 在现有“组合快捷工具”标题下渲染 `BuildRulesPanel`。
- 移除旧“随机组合”按钮，由面板“按规则随机”调用 `randomBuild()`。
- 成功时调用 `state.replaceBuild()`；失败时只设置规则面板局部提示，不写全局模型错误。
- 手动换件、改属性或切换规则时清除过期的随机失败提示。
- 不修改 `createShareLink()`、`createArenaLink()`、保存、导入、导出或流派计算。
- 修改 `battle-top-designer/web-customizer/src/styles.css`：
  - 桌面端在快捷工具内紧凑排列规则选项、摘要和按钮。
  - 412px 移动端纵向换行，无固定高度和横向溢出。
  - 合法和违规状态同时使用图标/文字/边框，不只使用颜色。
  - 新按钮保持现有最小点击尺寸和键盘焦点样式。
  - 不新增动画。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd tsc --noEmit
& npx.cmd vitest run tests/unit/buildRules.test.ts tests/unit/ruleAwareRandomizer.test.ts tests/unit/buildRulesPanel.test.tsx tests/unit/store.test.ts tests/unit/combinationUrl.test.ts
& npm.cmd run build
```

静态审计：规则选择和违规结果不出现在 store snapshot、localStorage、URL、Arena 参数或战斗模块中。

## 【步骤 10】扩展 desktop/mobile E2E

目标：

- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`，复用现有完整定制器流程。
- 默认加载后断言自由组装规则状态可见。
- 切换轻量竞技，断言当前重量摘要以及合法或超重文案。
- 选择火元素专精并点击按规则随机，断言五层中至少三层为火，规则状态合法。
- 选择基础零件杯并随机，断言三项禁用零件均未出现。
- 在随机前记录完整零件和属性，随机后一次撤销，断言完整恢复。
- 断言切换规则本身不改变 `historyDepth`。
- 断言违规状态下“进入竞技场”仍可用，但测试不实际离开页面。
- mobile project 检查规则面板位于快捷工具内部，宽度不越过视口，七属性选项和违规文本无裁切。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& node node_modules/@playwright/test/cli.js test tests/e2e/customizer.spec.ts --project=desktop --project=mobile
```

预期：desktop 和 mobile 两个 project 全部通过，浏览器控制台无新增错误。

## 【步骤 11】完整回归、视觉验收和边界审计

目标：

- 运行定制器完整单元测试、生产构建和 desktop/mobile E2E。
- 运行根项目单元测试、NSS 契约和 TypeScript 检查。
- 确认战斗基线、属性共鸣和构筑流派结果未改变。
- 捕获桌面与 412px 移动端规则面板截图。
- 视觉检查最长多重违规、七属性选择、合法摘要和随机按钮状态。
- 检查键盘焦点、语义状态、文本对比度、无横向滚动和浏览器控制台。
- 执行 `git diff --check` 和精确文件审计，只提交本计划涉及文件。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:unit
& npm.cmd run build
& node node_modules/@playwright/test/cli.js test tests/e2e/customizer.spec.ts --project=desktop --project=mobile

Set-Location ../..
& npm.cmd run test:unit
& npm.cmd run test:nss-contract
& node.exe node_modules/typescript/bin/tsc --noEmit

git diff --check
git status --short
```

完成门禁：所有成功标准均有自动测试或视觉证据；战斗基线和 288 种 NSS 装配契约不变；所有用户未跟踪文件保持原样。

## 预计修改文件

- 新增 `battle-top-designer/shared/nss/build-rules.ts`
- 新增 `battle-top-designer/web-customizer/src/build/BuildRulesPanel.tsx`
- 新增 `battle-top-designer/web-customizer/tests/unit/buildRules.test.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/ruleAwareRandomizer.test.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/buildRulesPanel.test.tsx`
- 修改 `battle-top-designer/web-customizer/src/store.ts`
- 修改 `battle-top-designer/web-customizer/src/App.tsx`
- 修改 `battle-top-designer/web-customizer/src/styles.css`
- 修改 `battle-top-designer/web-customizer/tests/unit/store.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`

不修改战斗模块、属性规则、构筑流派评分、存档 schema、分享 schema、Arena 参数或服务端代码。

## 推荐实现提交

`feat(customizer): add rule-aware randomizer`
