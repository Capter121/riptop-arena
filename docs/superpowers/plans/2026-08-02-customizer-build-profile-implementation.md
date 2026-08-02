# NSS 定制器构筑流派解释实施计划

日期：2026-08-02

关联规格：`docs/superpowers/specs/2026-08-02-customizer-build-profile-design.md`

## 目标

为 Web Customizer 增加确定性的构筑流派解释：根据现有六项概念属性和属性共鸣，显示一个主流派、最多两个次级倾向和主流派来源。流派只提供打法建议，不产生战斗加成，也不写入任何持久状态或分享载荷。

## 成功标准

- 强袭、堡垒、耐久、反击、爆裂、均衡六种流派均按批准公式确定计算。
- 每套合法输入恰有一个主流派，次级倾向最多两个。
- UI 位于共鸣摘要下方，显示原因和“仅作打法建议，不提供额外加成”。
- 更换零件或附加属性后结果同步更新。
- 流派不进入 Zustand、撤销历史、本地保存、分享链接或 Arena 参数。
- 纯函数、组件、完整单元测试、TypeScript、生产构建和 desktop/mobile E2E 全部通过。
- 根项目战斗黄金样例结果不变。

## 约束与假设

- 本计划只实施任务 2.4A，不实施规则预设、违规提示或受约束随机配装。
- 复用现有 `conceptAttributes()` 和 `AffinityProfile`，不复制概念属性或七属性规则。
- 共享模块返回稳定代码和结构化原因；中文文案只存在于定制器组件。
- 不显示内部评分，不提供流派选择控件。
- 不修改当前可切换的 `balance / assault / fortress` 战术模式及其倍率。
- 不修改未跟踪的 `battle-top-designer/web-customizer/src/i18n/zhCN.ts`、`referse/`、VFX 素材、截图或测试产物。

## 【步骤 1】先建立纯函数失败测试

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/buildProfile.test.ts`。
- 从尚不存在的 `battle-top-designer/shared/nss/build-profile.ts` 导入解析函数和类型。
- 使用合成的六项属性与现有 `resolveAffinityProfile()` 构造确定输入。
- 固定以下行为：
  - 六种流派各有一个明确正例。
  - 强袭、堡垒、耐久和反击使用批准权重。
  - 无进攻共鸣时爆裂不参与排名。
  - 3/4/5 件进攻共鸣分别使用 68/84/100 分。
  - 协调共鸣只为均衡解释分增加 8 点。
  - 完全同分使用爆裂、均衡、反击、耐久、堡垒、强袭的固定顺序。
  - 次级倾向覆盖 55 分门槛和距最高分 6 分边界。
  - 原因顺序稳定且最多三项。
  - 输入不被修改，重复调用结果相等。
  - 缺失、非有限、小于 0 或大于 100 的属性被拒绝。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildProfile.test.ts
```

预期：测试因共享模块尚不存在而失败。确认失败原因正确后进入步骤 2。

## 【步骤 2】实现共享构筑流派解析器

目标：

- 新增 `battle-top-designer/shared/nss/build-profile.ts`。
- 定义最小结构：
  - `BuildProfileAttributes`：六项 0–100 数值。
  - `BuildArchetype`：六个稳定代码。
  - `BuildProfileReason`：属性来源、反击最低项、进攻共鸣、均衡离散度和协调共鸣的判别联合。
  - `BuildProfileResult`：`primary`、`secondary`、`reasons`。
- 在入口校验六项属性完整且为 0–100 的有限数值。
- 按规格实现六类分数，并统一保留两位小数后排序。
- 没有进攻共鸣时不创建爆裂候选。
- 最高分决定主流派；次级只保留分数至少 55 且距最高分不超过 6 的前两个。
- 使用固定顺序处理完全同分。
- 只为主流派构造最多三项结构化原因。
- 不读取零件目录、React、DOM、存储或战斗状态。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildProfile.test.ts tests/unit/affinityViewModel.test.ts tests/unit/attributes.test.ts
```

预期：构筑流派、原有属性档案和概念属性测试全部通过。

## 【步骤 3】先建立展示组件失败测试

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/buildProfilePanel.test.tsx`，使用 `jsdom` 和现有 React `act()` 测试风格。
- 固定以下展示行为：
  - 只显示一个主流派。
  - 次级倾向显示零至两个标签。
  - 强袭、堡垒、耐久、反击原因显示对应原始数值。
  - 爆裂显示属性、件数和现有元素进攻共鸣百分比。
  - 均衡显示四项最大差值；协调共鸣显示现有防御和稳定性百分比。
  - 固定显示“仅作打法建议”和“不提供额外加成”。
  - 不渲染按钮、评分或公式。
  - 输入为 `null` 时不渲染空面板。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildProfilePanel.test.tsx
```

预期：测试因组件尚不存在而失败。

## 【步骤 4】实现紧凑构筑流派面板

目标：

- 新增 `battle-top-designer/web-customizer/src/build/BuildProfilePanel.tsx`。
- 将六个稳定代码映射为中文名称：强袭、堡垒、耐久、反击、爆裂、均衡。
- 将结构化原因映射为简短中文来源，不在组件重新计算评分。
- 使用 `section`、标题、主流派文本和非交互次级标签。
- 根节点提供稳定 `data-testid="build-profile-panel"` 和 `data-profile` 主流派代码。
- 次级标签提供稳定代码属性，方便测试但不暴露内部评分。
- `null` 输入直接返回 `null`。
- 不添加点击、切换、折叠或提示框状态。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/buildProfilePanel.test.tsx tests/unit/buildProfile.test.ts
```

预期：纯函数和组件测试全部通过，无 React `act()` 警告。

## 【步骤 5】接入 App 的只读派生数据

目标：

- 修改 `battle-top-designer/web-customizer/src/App.tsx`。
- 使用现有 `attributes` 和 `state.affinityProfile` 调用共享解析器。
- 使用 `useMemo` 计算，不新增 Zustand 字段。
- 计算意外失败时记录一次明确的 `BUILD_PROFILE_ERROR`，结果降级为 `null`；不得影响零件、属性或共鸣面板。
- 在现有 `AffinityPanel` 之后、`lower-grid` 之前渲染 `BuildProfilePanel`。
- 不修改 `choosePart`、`setAffinity`、撤销/重做、模型加载和本地保存路径。
- 静态检查流派结果没有进入 `createShareLink()`、`createArenaLink()`、`serializeCombination()` 或 store snapshot。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd tsc --noEmit
& npx.cmd vitest run tests/unit/buildProfile.test.ts tests/unit/buildProfilePanel.test.tsx tests/unit/store.test.ts tests/unit/combinationUrl.test.ts
```

代码审计：`BuildProfileResult` 只在共享解析器、展示组件和 `App` 的局部派生路径中出现。

## 【步骤 6】加入方案 A 的响应式样式

目标：

- 修改 `battle-top-designer/web-customizer/src/styles.css`。
- 面板沿用现有深色装配界面和细青色左侧状态边。
- 桌面端采用紧凑横排：标题、主流派、次级倾向、原因保持清晰层级。
- 手机端自然换行，不横向挤压属性按钮或共鸣摘要。
- 次级倾向呈现为非交互标签，不使用按钮视觉。
- 数字使用 `font-variant-numeric: tabular-nums`。
- 不加入动画，不需要新增 reduced-motion 规则。
- 不新增固定高度，允许中文和最大原因文本完整显示。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run build
```

预期：目录检查、TypeScript 和 Vite 构建通过，仅允许既有 Scene chunk 体积提示。

## 【步骤 7】扩展现有 desktop/mobile E2E

目标：

- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`，复用现有完整离线定制流程，不增加第二个重复 3D 启动测试文件。
- 在默认组合加载后断言：
  - 构筑流派面板可见。
  - 主流派、免责声明和原因存在。
  - 面板内没有按钮。
- 使用确定的零件/属性夹具触发一次非爆裂流派变化，断言主流派或原因同步更新。
- 把五层属性设置为同一属性，断言主流派为 `BURST`，并显示 5 件与 15% 来源。
- 恢复测试原本需要的状态，保证现有撤销/重做、分享和模型流程继续通过。
- 流派更新前后断言没有额外模型加载；正式选择产生的历史变化仍只来自原有选择动作。
- mobile project 检查面板位于属性面板之后、概念属性区域之前，宽度不越过视口且文本无裁切。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& node node_modules/@playwright/test/cli.js test tests/e2e/customizer.spec.ts --project=desktop --project=mobile
```

预期：desktop 和 mobile 两个 project 全部通过，浏览器控制台无新增错误。

## 【步骤 8】完整回归、战斗不变证明与视觉验收

目标：

- 运行定制器完整单元测试和生产构建。
- 运行根项目单元测试、NSS 契约和 TypeScript 检查。
- 运行现有战斗黄金样例，确认伤害、战术倍率和共鸣规则未变化。
- 捕获 desktop/mobile 构筑流派面板截图。
- 检查最长原因、两个次级倾向、无次级倾向、爆裂和协调均衡状态。
- 检查面板不覆盖属性选择、共鸣摘要、概念属性或快捷工具。
- 检查浏览器控制台错误。
- 精确审计 Git diff，仅保留本计划文件。

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

完成门禁：所有成功标准均有自动测试或截图证据；现有战斗黄金样例完全一致；未跟踪用户文件未被暂存或修改。

## 预计修改文件

- 新增 `battle-top-designer/shared/nss/build-profile.ts`
- 新增 `battle-top-designer/web-customizer/src/build/BuildProfilePanel.tsx`
- 新增 `battle-top-designer/web-customizer/tests/unit/buildProfile.test.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/buildProfilePanel.test.tsx`
- 修改 `battle-top-designer/web-customizer/src/App.tsx`
- 修改 `battle-top-designer/web-customizer/src/styles.css`
- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`

不修改任务 2.4B 文件，不修改 `battle-top-designer/web-customizer/src/i18n/zhCN.ts`。

## 推荐实现提交

`feat(customizer): explain build profiles`
