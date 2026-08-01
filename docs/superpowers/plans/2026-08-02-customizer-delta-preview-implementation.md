# NSS 装配差值预览实施计划

日期：2026-08-02

关联规格：`docs/superpowers/specs/2026-08-02-customizer-delta-preview-design.md`

## 目标

为 Web Customizer 的零件候选和属性候选增加只读差值预览。桌面使用鼠标悬停或键盘焦点，手机使用约 350ms 长按；正式选择行为、3D 模型加载、历史和战斗规则保持不变。

## 成功标准

- 零件预览只显示六项概念属性中实际变化的差值。
- 属性预览只显示实际变化的属性数量、主属性、共鸣和加成。
- 预览不修改组合、属性、历史、本地保存或模型加载状态。
- 鼠标、键盘、触摸长按以及所有取消路径行为确定且可测试。
- 手机短按继续直接选择，横向滑动不会误触长按或选择。
- desktop/mobile 页面无裁切、遮挡或布局跳动。
- 专项与完整单元测试、TypeScript、生产构建和定制器 E2E 通过。

## 约束与假设

- 只调用现有 `conceptAttributes`、`resolveAffinityProfile` 和 `createAffinityViewModel`，不复制计算规则。
- 预览状态只存在于 `App` 的本地 React 状态中，不新增 Zustand 字段。
- 键盘预览只在 `:focus-visible` 生效，指针点击造成的普通焦点不能额外启动键盘预览。
- 所有结束预览操作携带候选键；旧候选的迟到结束事件不能清除新候选预览。
- 不修改未跟踪的 `battle-top-designer/web-customizer/src/i18n/zhCN.ts`。
- 不新增图标、手势或状态管理依赖。

## 【步骤 1】先建立纯比较模型失败测试

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/comparisonModel.test.ts`。
- 为零件比较定义固定输出：标题、非零属性差值、正负方向和稳定顺序。
- 为属性比较定义固定输出：数量变化、主属性变化、共鸣变化和加成变化。
- 覆盖相同候选、未知零件、分类不匹配候选和无可展示变化时返回 `null`。
- 冻结或深拷贝输入，验证比较前后输入对象未被修改。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:unit -- comparisonModel.test.ts
```

预期：测试因模块尚不存在而失败。确认失败原因正确后进入步骤 2。

## 【步骤 2】实现确定性比较模型

目标：

- 新增 `battle-top-designer/web-customizer/src/comparison/comparisonModel.ts`。
- 定义最小展示模型：
  - 比较类型和稳定候选键。
  - 中文标题。
  - 数值差值项目。
  - 状态转换项目。
- `comparePartCandidate` 构造只替换一个分类的临时组合，并比较 `conceptAttributes`。
- `compareAffinityCandidate` 构造只替换一个分类的临时属性映射，比较两个 `AffinityViewModel`。
- 数值差值统一保存原始整数；组件负责显示 `+` 或 `−`。
- 共鸣比较同时考虑标签和加成列表，避免只看 resonance kind 漏掉 `3→4` 件等变化。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:unit -- comparisonModel.test.ts affinityViewModel.test.ts attributes.test.ts
```

预期：比较模型、原有属性展示模型和概念属性测试全部通过。

## 【步骤 3】测试并实现统一预览按钮

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/previewableButton.test.tsx`。
- 新增 `battle-top-designer/web-customizer/src/comparison/PreviewableButton.tsx`。
- 保持原生 `<button>` 语义和现有 `onClick` 行为。
- 使用 Pointer Events：
  - `pointerenter` / `pointerleave` 只处理鼠标。
  - 触摸 `pointerdown` 启动 350ms 计时。
  - 移动距离超过 8px 清理计时并交还滚动。
  - `pointerup`、`pointercancel`、`lostpointercapture` 清理计时和活动预览。
- 焦点仅在元素匹配 `:focus-visible` 时开始键盘预览。
- 长按成功后只抑制同一次指针序列产生的 click；下一次短按必须正常触发。
- 组件卸载时清理计时器。

测试覆盖：

- 鼠标进入/离开。
- 键盘可见焦点与指针普通焦点的区别。
- 假计时器下 349ms、350ms 边界。
- 移动阈值以下和以上。
- 松手、取消、丢失捕获、卸载。
- 长按 click 抑制一次和后续短按恢复。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:unit -- previewableButton.test.tsx
```

预期：全部交互组件测试通过，无卸载后状态更新警告。

## 【步骤 4】测试并实现独立差值轨

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/affinityComparison.test.tsx`。
- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityComparison.tsx`。
- 数值上涨显示 `+N`，下降显示 `−N`，状态变化显示 `旧值 → 新值`。
- 使用文字类别和符号区分上涨、下降与规则变化，颜色仅作为辅助。
- 根容器使用 `aria-live="polite"` 和稳定 `data-testid`。
- `comparison` 为 `null` 时不渲染空轨道。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:unit -- affinityComparison.test.tsx comparisonModel.test.ts
```

预期：数值格式、状态转换、空状态和可访问性测试通过。

## 【步骤 5】接入零件与属性候选

目标：

- 修改 `battle-top-designer/web-customizer/src/App.tsx`。
- 修改 `battle-top-designer/web-customizer/src/affinity/AffinityPanel.tsx`。
- 修改 `battle-top-designer/web-customizer/tests/unit/affinityComponents.test.tsx`。
- `App` 保存 `{ key, kind, family, candidate } | null` 临时预览描述。
- 候选开始时设置预览；候选结束时仅在键匹配时清除。
- `useMemo` 根据临时描述调用对应纯比较函数。
- 零件差值轨放在 `part-strip` 后。
- 属性差值轨放在 `AffinityPanel` 的选择条后、正式摘要前。
- 正式选择前先清除预览，再调用现有 `choosePart` 或 `setAffinity`。
- 切换分类时先清除预览。
- 监听窗口 `blur` 和文档 `visibilitychange`，统一清除过期预览；卸载时移除监听器。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:unit -- affinity comparison previewable store.test.ts
```

代码检查：预览路径中不得调用 `beginPartSwitch`、`selectPart`、`setAffinity`、`setLoadState` 或本地存储写入。

## 【步骤 6】加入响应式样式

目标：

- 修改 `battle-top-designer/web-customizer/src/styles.css`。
- 差值轨使用现有深色装配面板语言和细青色状态边，不增加大型嵌套卡片。
- 差值项目使用固定数字宽度，避免 `+9` 与 `−12` 引起布局跳动。
- 桌面端紧凑横排并允许换行；手机端自然换行，始终位于触发控件附近。
- 候选预览状态提供清晰描边，但不改变按钮尺寸。
- 保持属性与零件横向滚动；不在整个列表设置 `touch-action: none`。
- `prefers-reduced-motion` 下不加入预览动画。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run build
```

预期：目录检查、TypeScript 和 Vite 生产构建通过，仅允许已有 bundle 体积提示。

## 【步骤 7】增加 desktop/mobile E2E

目标：

- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`，扩展现有完整流程，避免新增重复 3D 启动测试文件。
- 桌面验证：
  - 悬停候选零件出现差值轨，移出消失。
  - 候选获得键盘可见焦点后出现差值轨，Enter 仍选择并加载模型。
  - 属性候选预览显示数量、主属性和共鸣变化。
- 手机验证：
  - 短按仍直接选择。
  - 触摸按压超过 350ms 显示预览，松手后消失且不选择。
  - 移动超过 8px 不显示预览，也不选择。
- 预览期间断言组合、属性、历史深度和 `load-status` 不变。
- 正式选择后断言现有撤销/重做和模型加载流程通过。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:e2e -- customizer.spec.ts
```

预期：desktop 与 mobile 两个 project 全部通过，页面无新增控制台错误。

## 【步骤 8】完整回归与视觉验收

目标：

- 运行定制器完整单元测试和生产构建。
- 运行根项目单元测试与 TypeScript 检查。
- 捕获 desktop/mobile 的零件预览和属性预览截图。
- 检查长标签、最大差值、多个变化项目和手机换行。
- 检查差值轨不覆盖 3D 视图、零件分类、属性按钮和正式共鸣摘要。
- 检查浏览器控制台错误。
- 精确审计 Git diff，保护 `i18n/`、`referse/`、VFX 资源、截图和测试产物。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:unit
& npm.cmd run build
& npm.cmd run test:e2e -- customizer.spec.ts
Set-Location ../..
& npm.cmd run test:unit
& node.exe node_modules/typescript/bin/tsc
git diff --check
git status --short
```

完成门禁：所有成功标准均有自动化或截图证据；产品修改范围仅包含本计划列出的文件。

## 预计修改文件

- 新增 `battle-top-designer/web-customizer/src/comparison/comparisonModel.ts`
- 新增 `battle-top-designer/web-customizer/src/comparison/PreviewableButton.tsx`
- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityComparison.tsx`
- 新增 `battle-top-designer/web-customizer/tests/unit/comparisonModel.test.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/previewableButton.test.tsx`
- 新增 `battle-top-designer/web-customizer/tests/unit/affinityComparison.test.tsx`
- 修改 `battle-top-designer/web-customizer/src/App.tsx`
- 修改 `battle-top-designer/web-customizer/src/affinity/AffinityPanel.tsx`
- 修改 `battle-top-designer/web-customizer/src/styles.css`
- 修改 `battle-top-designer/web-customizer/tests/unit/affinityComponents.test.tsx`
- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`

不修改 `battle-top-designer/web-customizer/src/i18n/zhCN.ts`。

## 推荐实现提交

`feat(customizer): preview part and resonance deltas`
