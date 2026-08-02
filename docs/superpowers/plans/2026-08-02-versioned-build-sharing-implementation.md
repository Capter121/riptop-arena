# NSS 定制器完整装配分享协议 V2 实施计划

日期：2026-08-02

关联规格：`docs/superpowers/specs/2026-08-02-versioned-build-sharing-design.md`

## 目标

把当前只分享组合 ID 的 URL 升级为严格版本化的 V2 协议，使文本链接、剪贴板、页面二维码和 PNG 二维码能够无损恢复五件零件与五层附加属性。旧链接继续读取并显示迁移提示；可选纹章 ID 只作为分享会话元数据转发，不进入历史、存档、Arena 或战斗。

## 成功标准

- 新链接固定输出 `sv, cv, rv, combo, a`，可选输出 `emblem`，参数顺序稳定。
- 288 种零件组合和任意合法五层属性能够 V2 往返。
- V1 `combo` 链接继续恢复默认属性并显示迁移提示。
- 缺失、重复、额外、错误版本、非法属性和非法纹章全部回退，不部分载入。
- 合法纹章在手动编辑和撤销/重做后保留，在整套来源替换时清除。
- 分享文本、复制、页面 QR 和 PNG QR 内容一致。
- 分享载荷不包含共鸣、流派、概念属性或规则预设。
- 定制器单元、构建、desktop/mobile sharing E2E、PNG E2E、根测试和 NSS 契约全部通过。

## 约束与假设

- 本地存档继续使用现有 `schemaVersion: 2` 和 storage key。
- Arena 继续使用 `combo + loadoutVersion=1`，本计划不修改 `arenaLink.ts` 或 Arena 控制器。
- V2 URL 使用显式参数，不引入 Base64、压缩或新依赖。
- `URLSearchParams` 负责逗号编码；协议校验作用于解码后的字符串。
- 纹章只验证 `^emblem_[a-z0-9_-]{1,48}$`，不发起图片或服务端请求。
- 不修改未跟踪的 `battle-top-designer/web-customizer/src/i18n/`、`referse/`、VFX 素材、截图和测试产物。

## 【步骤 1】先建立版本与 V2 编解码失败测试

目标：

- 修改 `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`，要求 `versions.json` 包含 `shareSchemaVersion: 2`。
- 修改根 `scripts/test-nss-contract.mjs`，将该键纳入严格版本集合。
- 扩展 `battle-top-designer/web-customizer/tests/unit/combinationUrl.test.ts`，从尚未实现的 V2 API 固定：
  - 288 种组合使用代表性属性完整往返。
  - 七种属性可以出现在任意五层槽位。
  - 规范参数顺序为 `sv, cv, rv, combo, a, emblem`。
  - 无纹章不输出空参数；合法纹章正确往返。
  - 最大合法纹章和超长非法纹章边界。
  - 生成器删除原地址 query、hash 和 `test=1`。
  - 同一输入重复生成相同字符串。
  - 输出键集合不含派生属性和规则预设。
- 保留 `combinationFromId()` 的 288 组合映射测试，不创建第二套目录排序。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/combinationUrl.test.ts tests/unit/nssSharedContract.test.ts
```

预期：测试因 `shareSchemaVersion` 和 V2 API 尚不存在而失败。

## 【步骤 2】实现纯 V1/V2 URL 编解码器

目标：

- 修改 `battle-top-designer/shared/nss/versions.json`，增加 `shareSchemaVersion: 2`。
- 修改 `battle-top-designer/web-customizer/src/sharing/combinationUrl.ts`。
- 定义最小结构：
  - `ShareBuild`：`combination + affinities`。
  - `SharePayload`：`ShareBuild + emblemId`。
  - `ParsedShareSearch`：`none | legacy | current | invalid` 判别联合。
  - `InitialCombinationResolution`：增加 `affinities`、`emblemId` 和 `legacyUrl`。
- 实现 `parseShareSearch(search)`，供启动解析、卡片校验和测试共同使用。
- V2 校验要求每个必需参数恰好一次、版本精确、五层属性恰好五项、允许参数无重复。
- V1 只允许 `combo` 和可选 `test=1`；`combo + emblem` 或部分版本参数必须无效。
- 实现规范化 `buildToSearch(payload)`；使用 `versions.json` 的三个版本值和现有 `combinationId()`。
- 修改 `createShareLink(payload, currentLocation, configuredBase?)`，输出 V2 并保持现有 `deviceOnly`。
- 用户可构造的格式错误返回 `invalid`，生成器内部非法输入明确抛错。
- 不读取 React、Zustand、DOM、历史或战斗状态。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/combinationUrl.test.ts tests/unit/nssSharedContract.test.ts tests/unit/affinityViewModel.test.ts

Set-Location ../..
& npm.cmd run test:nss-contract
```

预期：V1/V2 编解码和两层版本契约全部通过。

## 【步骤 3】补齐所有非法 URL 与迁移失败测试

目标：

- 继续扩展 `combinationUrl.test.ts`，覆盖：
  - 必需参数逐项缺失。
  - 任意参数重复。
  - 额外参数。
  - `sv/cv/rv` 当前值以外的过去或未来版本。
  - 未知、大小写错误和重复组合 ID。
  - `a` 空项、四项、六项、空格、小写、混合大小写和未知属性。
  - 非法纹章前缀、字符、空后缀和长度。
  - V1/V2 混搭。
  - 合法 V1 标记 `legacyUrl: true` 并生成核心默认属性。
  - 非法 URL不读取合法本地存档。
  - 无 URL 时本地 V1/V2 和 fallback 优先级保持。
- 验证 `test=1` 只影响解析结果，不出现在生成输出。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/combinationUrl.test.ts
```

预期：全部正反例通过，非法输入不抛出未捕获异常。

## 【步骤 4】先建立 store 分享元数据失败测试

目标：

- 修改 `battle-top-designer/web-customizer/tests/unit/store.test.ts`，固定：
  - V2 hydrate 同时恢复零件、五层属性和纹章。
  - V1 hydrate 恢复默认属性、设置迁移提示且不创建历史。
  - 非法 V2 恢复 Storm Attack、默认属性、无效提示和空纹章。
  - 本地 V1/V2 hydrate 结果保持且纹章为空。
  - 手动换件、改属性、`replaceBuild()`、撤销和重做保留纹章。
  - `reset()`、`replaceCombination()`、`restoreSaved()` 清除纹章。
  - `save()` 输出仍只有 schemaVersion、combination、affinities。
  - `currentSnapshot()` 暴露 `shareEmblemId` 供 E2E 观察。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/store.test.ts
```

预期：测试因 store 尚未消费完整解析结果和分享纹章字段而失败。

## 【步骤 5】实现启动恢复与纹章会话生命周期

目标：

- 修改 `battle-top-designer/web-customizer/src/store.ts`。
- 新增 `shareEmblemId: string | null`，不加入 `BuildSnapshot`、`buildSnapshot()` 或 `sameBuild()`。
- `hydrate()` 直接使用 URL 解析结果中的 `combination + affinities`，不再在 URL 路径丢失属性。
- startup notice 优先级：无效链接提示优先，其次旧链接迁移提示，否则为空。
- `selectPart()`、`setAffinity()`、`replaceBuild()`、`undo()`、`redo()` 不修改纹章。
- `replaceCombination()`、`reset()`、成功 `restoreSaved()` 清除纹章；App 的导入和组合库恢复自然复用该行为。
- `save()` 和现有本地解析不加入纹章字段。
- `currentSnapshot()` 增加只读观测值。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/store.test.ts tests/unit/history.test.ts tests/unit/combinationUrl.test.ts
```

预期：启动、历史、本地存档和纹章生命周期测试全部通过。

## 【步骤 6】接入 App 的完整分享派生

目标：

- 修改 `battle-top-designer/web-customizer/src/App.tsx`。
- `createShareLink()` 输入改为当前 `combination`、`affinities` 和 `shareEmblemId`。
- `useMemo` 依赖包含五件零件、五层属性和纹章；只修改属性时链接立即更新。
- 继续让文本框、复制、页面 QR 和 PNG 导出共享同一个 `share.url`。
- 旧链接迁移提示复用现有 notice 区；无效链接仍显示清除按钮。
- 迁移提示不能错误显示“清除无效 URL”动作；只在 `invalidUrl` 时显示该按钮。
- 不修改分享面板布局、二维码组件、规则 UI 或 Arena link。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd tsc --noEmit
& npx.cmd vitest run tests/unit/combinationUrl.test.ts tests/unit/store.test.ts tests/unit/shareLink.test.ts
```

静态审计：分享构造调用不接收 `affinityProfile`、`buildProfile`、`attributes` 或 `rulePreset`。

预期：属性变化会更新 V2 分享 URL，现有分享 UI 和 Arena link 测试保持通过。

## 【步骤 7】先建立 PNG 卡片完整载荷失败测试

目标：

- 修改 `battle-top-designer/web-customizer/tests/unit/cardRenderer.test.ts`。
- `CardInput` 增加五层属性。
- 固定校验行为：
  - V2 URL 的组合和五层属性都与卡片输入一致时合法。
  - 相同组合但任一属性不同时返回 `SHARE_URL`。
  - V1、非法 V2、额外参数或错误版本返回 `SHARE_URL`。
  - 合法可选纹章不影响基础装配一致性。
  - 像素长度错误与分享错误可以同时返回。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/cardRenderer.test.ts
```

预期：测试因卡片仍只比较组合 ID 而失败。

## 【步骤 8】实现 PNG V2 校验并保持版式

目标：

- 修改 `battle-top-designer/web-customizer/src/sharing/cardRenderer.ts`。
- `CardInput` 接收当前 `affinities`。
- 使用 `parseShareSearch()` 校验 URL 必须是合法 V2，并深比较组合与五层属性。
- 修改 App 的 `renderCombinationCard()` 调用传入属性。
- 不改变 1200×630 尺寸、画面、文字、文件名或二维码位置。
- 不把纹章或属性徽章绘制到卡片正文。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npx.cmd vitest run tests/unit/cardRenderer.test.ts tests/unit/qrCode.test.ts
& npm.cmd run build
```

预期：卡片和 QR 单元测试通过，生产构建只允许既有 Scene 分包提示。

## 【步骤 9】升级 sharing desktop/mobile E2E

目标：

- 修改 `battle-top-designer/web-customizer/tests/e2e/sharing.spec.ts`。
- 在当前装配设置确定的非默认属性后打开分享面板。
- 断言文本 URL参数、顺序和版本正确，不含 `test` 或派生字段。
- 复制链接并断言剪贴板与文本框完全一致。
- 在同一浏览器新页面打开复制链接，断言五件零件和五层属性完整恢复。
- 打开带合法纹章的 V2 URL，修改属性后再次分享，断言纹章继续存在。
- 打开 V1 URL，断言默认属性、迁移提示和新生成 V2 URL。
- 打开非法 V2 URL，断言 Storm Attack、默认属性、无效提示和清除 URL。
- desktop/mobile 两个 project 均检查 0 console/page/request/external error。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& node node_modules/@playwright/test/cli.js test tests/e2e/sharing.spec.ts --project=desktop --project=mobile
```

预期：两种视口完整分享流程通过。

## 【步骤 10】升级 PNG 二维码 E2E

目标：

- 修改 `battle-top-designer/web-customizer/tests/e2e/png-card.spec.ts`。
- 从 V2 URL或页面操作建立非默认属性装配。
- 导出 PNG，保持 1200×630、PNG 签名、有效像素和现有文件名断言。
- 解码二维码并严格比较页面分享文本 URL。
- 解析二维码 URL，断言零件和五层属性等于导出前快照。
- 导出前后断言组合、属性、相机和永久矩阵不变。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& node node_modules/@playwright/test/cli.js test tests/e2e/png-card.spec.ts --project=desktop --project=mobile
```

预期：desktop/mobile PNG 卡片和 V2 QR 解码全部通过。

## 【步骤 11】完整回归与协议边界审计

目标：

- 运行定制器完整单元、生产构建、sharing 和 PNG E2E。
- 运行根项目测试、TypeScript 和 NSS 契约。
- 确认 Arena link 单元测试仍输出 `loadoutVersion=1`。
- 确认战斗基线、属性共鸣、构筑流派和规则随机器没有变化。
- 静态审计 V2 参数只在分享与卡片路径中出现。
- 捕获分享面板 desktop/mobile 截图，检查长 V2 URL不撑破输入框、二维码完整、迁移和无效提示不重叠。
- 执行 `git diff --check` 和精确文件审计，保留所有用户未跟踪文件。

验证：

```powershell
Set-Location battle-top-designer/web-customizer
& npm.cmd run test:unit
& npm.cmd run build
& node node_modules/@playwright/test/cli.js test tests/e2e/sharing.spec.ts tests/e2e/png-card.spec.ts --project=desktop --project=mobile

Set-Location ../..
& npm.cmd run test:unit
& npm.cmd run test:nss-contract
& node.exe node_modules/typescript/bin/tsc --noEmit

git diff --check
git status --short
```

完成门禁：所有 V1/V2、纹章、二维码和 PNG 成功标准都有自动化证据；Arena 与战斗基线不变；未跟踪用户文件未被暂存或修改。

预期：全部自动化、视觉和边界审计通过后，才允许提交实现。

## 预计修改文件

- 修改 `battle-top-designer/shared/nss/versions.json`
- 修改 `scripts/test-nss-contract.mjs`
- 修改 `battle-top-designer/web-customizer/src/sharing/combinationUrl.ts`
- 修改 `battle-top-designer/web-customizer/src/sharing/cardRenderer.ts`
- 修改 `battle-top-designer/web-customizer/src/store.ts`
- 修改 `battle-top-designer/web-customizer/src/App.tsx`
- 修改 `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/unit/combinationUrl.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/unit/store.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/unit/cardRenderer.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/e2e/sharing.spec.ts`
- 修改 `battle-top-designer/web-customizer/tests/e2e/png-card.spec.ts`

不修改 `arenaLink.ts`、Arena 控制器、战斗模块、本地存档 schema、规则预设、属性共鸣或构筑流派评分。

## 推荐实现提交

`feat(sharing): version NSS build links`
