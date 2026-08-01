# NSS 属性装配界面实施计划

日期：2026-08-02

关联规格：`docs/superpowers/specs/2026-08-02-affinity-customizer-ui-design.md`

## 目标

在现有 Web Customizer 的五层零件选择流程中加入属性徽章、七属性选择条和共鸣摘要。实现只消费上一阶段已有的属性状态与确定性结算结果，不修改 3D 模型、战斗规则或竞技场流程。

## 成功标准

- 每张候选零件卡显示当前层属性的图形、中文名称和颜色。
- 玩家可为当前分类选择七种属性中的任意一种。
- 共鸣面板即时显示七属性数量、主属性、共鸣、加成、克制和弱点。
- 纯属性变化不触发 3D 模型重新加载，并继续支持撤销、重做和本地保存。
- 桌面端与手机端无覆盖、裁切或不可达按钮，手机属性按钮触控尺寸至少约 44 CSS 像素。
- 属性专项单元测试、完整定制器单元测试、生产构建和定制器 E2E 通过。

## 约束与假设

- `resolveAffinityProfile` 和 `createAffinityViewModel` 是唯一规则与文案结果来源，React 组件不得重算相克或加成。
- 属性属于五层装配槽位，因此同一分类下所有候选零件卡显示该层当前属性；更换零件不会自动更换属性。
- 属性图形使用内联 Unicode 几何符号，不增加图片或图标依赖。
- 不修改、不暂存 `battle-top-designer/web-customizer/src/i18n/zhCN.ts`。该文件是用户已有的未跟踪文件，且当前应用没有导入它。
- 不顺便调整现有英文或中文文案，不重构与属性界面无关的 `App` 逻辑。

## 【步骤 1】先建立组件失败测试

目标：

- 新增 `battle-top-designer/web-customizer/tests/unit/affinityComponents.test.tsx`。
- 使用项目现有的 `jsdom`、`createRoot` 和 `act` 测试方式，不引入 Testing Library。
- 为 `AffinityBadge` 定义七属性展示契约：属性图形 `aria-hidden`、可见中文名称、稳定的 `data-affinity`。
- 为 `AffinityPanel` 定义以下契约：
  - 七个属性按钮全部存在。
  - 当前分类的属性按钮拥有 `aria-pressed="true"`，且只有一个按钮被选中。
  - 点击按钮回调收到正确的属性。
  - 七属性计数、主属性、进攻共鸣、协调共鸣、无共鸣、克制和弱点均可读。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
npm run test:unit -- affinityComponents.test.tsx
```

预期：测试因组件尚不存在而失败。只有确认失败原因与目标一致后进入步骤 2。

## 【步骤 2】实现纯展示组件

目标：

- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityBadge.tsx`。
- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityPanel.tsx`。
- `AffinityBadge` 保存七属性的图形与 CSS 主题键，只负责展示。
- `AffinityPanel` 接收：
  - 当前分类名称。
  - 当前层属性。
  - `AffinityViewModel`。
  - 属性选择回调。
- `AffinityPanel` 通过 `AFFINITIES` 保持固定顺序，并复用 `AffinityBadge`，不复制标签和规则计算。
- 无共鸣时显示“未形成共鸣”，无加成列表时不渲染空占位符。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
npm run test:unit -- affinityComponents.test.tsx affinityViewModel.test.ts
```

预期：新增组件测试与既有展示模型测试全部通过。

## 【步骤 3】把属性 UI 接入现有装配流程

目标：

- 修改 `battle-top-designer/web-customizer/src/App.tsx`。
- 用 `useMemo` 从已有 `state.affinityProfile` 创建展示模型。
- 在每个候选零件卡中加入当前 `selectedFamily` 对应的 `AffinityBadge`。
- 在零件横向列表后加入 `AffinityPanel`。
- 属性选择直接调用 `state.setAffinity(state.selectedFamily, affinity)`。
- 给零件卡现有名称和新增徽章保留清晰 DOM 分组，避免改变原有 `data-testid="part-*"` 和点击行为。
- 不调用 `beginPartSwitch`，不修改 `combination`，不设置 `loadState`。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
npm run test:unit -- affinity store.test.ts
```

人工代码检查：属性点击路径中不存在模型切换、场景调用或加载状态写入。

## 【步骤 4】实现响应式与无障碍样式

目标：

- 修改 `battle-top-designer/web-customizer/src/styles.css`。
- 为属性图形定义七个有限主题色，保持现有深色竞技装配风格。
- 零件卡中的徽章保持紧凑，不挤压零件名称。
- 共鸣面板位于 `part-strip` 之后、`lower-grid` 之前，桌面采用紧凑分区，手机改为单列。
- 属性选择条在桌面填充可用宽度；在手机端横向滚动，每个按钮宽高至少约 44 CSS 像素。
- 增加 hover、focus-visible、pressed 状态；在 `prefers-reduced-motion` 下禁用反馈动画。
- 不改变 3D `viewer`、五分类标签和原有操作区的定位规则。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
npm run build
```

预期：目录检查、TypeScript 检查和 Vite 生产构建通过，仅允许已有的 bundle 体积提示。

## 【步骤 5】增加属性装配 E2E

目标：

- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`，加入一个聚焦的属性装配场景，不新建重复启动成本较高的测试文件。
- 验证初始五层属性徽章和共鸣摘要存在。
- 切换分类后，属性选择条反映该层当前属性。
- 把当前层切换为另一属性后验证：
  - `aria-pressed` 转移到新按钮。
  - 零件卡徽章与共鸣摘要即时更新。
  - `load-status` 始终保持 `ready`，没有新的模型加载周期。
  - 撤销和重做恢复正确属性。
- 在项目现有 desktop 与 mobile 两个 Playwright project 中运行同一场景。
- 手机断言属性按钮尺寸不小于约 44 CSS 像素，选择条可横向滚动，共鸣面板与五分类、零件列表的边界不重叠。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
npm run test:e2e -- customizer.spec.ts
```

预期：desktop 与 mobile 专项用例全部通过，页面无控制台异常。

## 【步骤 6】完整回归和视觉验收

目标：

- 运行定制器完整单元测试，确保现有零件选择、历史、分享和展示功能不受影响。
- 运行生产构建。
- 再运行定制器专项 E2E；如完整 E2E 总耗时超出外层工具限制，记录专项结果并明确说明，不把超时误报为断言失败。
- 截取桌面端和手机端属性装配页面，检查：
  - 文字未裁切。
  - 七属性按钮可达。
  - 共鸣面板不覆盖 3D 视图与五层选择。
  - 颜色不是唯一信息。
- 检查 Git diff，确认未暂存用户已有的 `i18n/`、`referse/`、VFX 纹理或测试产物。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
npm run test:unit
npm run build
npm run test:e2e -- customizer.spec.ts
Set-Location ../..
git diff --check
git status --short
```

完成门禁：所有成功标准均有自动化或截图证据，且修改范围只包含本计划列出的产品与测试文件。

## 预计修改文件

- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityBadge.tsx`
- 新增 `battle-top-designer/web-customizer/src/affinity/AffinityPanel.tsx`
- 新增 `battle-top-designer/web-customizer/tests/unit/affinityComponents.test.tsx`
- 修改 `battle-top-designer/web-customizer/src/App.tsx`
- 修改 `battle-top-designer/web-customizer/src/styles.css`
- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`

不修改 `battle-top-designer/web-customizer/src/i18n/zhCN.ts`。

## 推荐实现提交

`feat(customizer): show affinity badges and resonance`
