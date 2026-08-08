# 邀请制统一门户实施计划

日期：2026-08-08
状态：已完成
对应设计：`docs/superpowers/specs/2026-08-08-invite-gated-unified-portal-design.md`
对应总计划：`docs/superpowers/plans/2026-08-01-nss-arena-complete-expansion-implementation.md` 任务 4.4

## 1. 需求理解

把任务 4.3 已完成的邀请码兑换和本地设备身份接入统一游戏门户。未认证玩家只能看到邀请入口；认证玩家看到昵称、金币、当前配装和六个模式入口。NSS 定制器与 RIPTOP Arena 保持开放，其余入口显示阶段条件且不可导航。

本任务同时把根应用拆成门户与 Arena 两次 Vite 构建，并为生产 HTTP 服务增加明确的 `/join`、`/join/` 门户映射。现有战斗、属性、物理、AI、零件、奖励与 WebSocket 协议不变。

## 2. 成功标准

- `/?invite=<code>` 和 `/join?invite=<code>` 能预填邀请码，玩家只需填写昵称。
- 没有 URL 邀请码时，邀请入口同时显示邀请码和昵称输入。
- 兑换成功后身份写入现有本地身份存储，URL 中的 `invite` 参数被移除。
- 刷新通过 `/api/me` 恢复身份，不重复兑换邀请码。
- `/api/me` 返回 401 或 403 时清除本地身份；网络错误和 5xx 保留身份并允许重试。
- 本地存储不可写时不发送兑换请求；兑换后保存失败时不重复消耗邀请码。
- 认证门户显示昵称、金币、当前配装和固定六入口。
- 开放入口保持 `./customizer/`、`./arena/`；锁定入口没有可导航 URL。
- 门户构建不启动 Three.js；`/arena/` 仍启动非空 Canvas。
- 1280×800 与 390×844 视口无横向溢出，主要交互目标至少 44px。
- 单元、服务端、构建、统一站点验证和专项 E2E 全部通过。

## 3. 假设与边界

- 沿用任务 4.3 的 `LocalIdentity`、`redeemInvite()`、`fetchCurrentPlayer()` 和认证请求头，不创建第二套身份模型。
- 门户金币和配装只读取 `loadProgression()`；任务 4.5 前不做服务端进度同步。
- NSS 配装摘要显示 `nssCombinationId()`；没有 NSS 配装时显示三层旧配装的中文零件名。
- 门户使用原生 DOM 与现有 CSS，不引入 React、UI 框架、图标包、图片或字体依赖。
- `/join` 是明确别名，不增加任意未知路径的 SPA 回退。
- WebSocket 认证、好友挑战、战役、生存和纹章编辑不在本任务实现。
- 旧 `site/index.html` 暂时保留但不再参与生产构建，避免无关删除。

## 4. 执行规则

- 每个任务先补失败测试，再写最小实现，再执行该任务验证。
- 每一步验证成功后才进入下一步。
- 每次只暂存任务列出的文件，不使用 `git add .`、`git add -A` 或 `git commit -am`。
- 开始修改前检查目标文件 diff，保留现有未跟踪素材、截图、翻译目录和测试产物。
- 不为未来模式预留插件系统、路由框架或通用状态机。

---

## 【步骤 1】增加身份存储探针与门户只读模型

目标：

用可单元测试的最小纯函数固定六个模式入口、配装摘要、身份错误分类和本地存储可写性，不创建第二套业务规则。

文件：

- 修改 `src/auth/localIdentity.ts`
- 新增 `src/ui/portal.ts`
- 修改 `tests/unit/local-identity.test.ts`
- 新增 `tests/unit/portal.test.ts`

先写失败测试：

1. `probeIdentityStorage()` 能完成临时写入和移除，且不覆盖身份键。
2. 存储抛错时探针返回 `false`。
3. 门户模式定义恰好六项，只有 NSS 定制器和 Arena 为开放状态。
4. 开放入口分别为 `./customizer/`、`./arena/`，锁定入口没有 `href`。
5. NSS 配装显示组合 ID；旧配装显示三个中文零件名；生成摘要前后 progression 对象不变。
6. 401/403 分类为身份失效，网络错误与 5xx 分类为临时离线。

最小实现：

1. 在 `localIdentity.ts` 增加使用独立临时键的可写探针，使用 `try/finally` 删除探针值。
2. 在 `portal.ts` 定义固定的六模式只读数组。
3. 增加只读配装摘要函数，复用 `nssCombinationId()`、`PARTS` 和现有 progression 类型。
4. 增加仅区分 `invalid-identity` 与 `offline` 的错误分类函数。
5. 暂不渲染 DOM，不加入额外状态管理库。

验证：

```powershell
npm run test:unit -- local-identity portal
npx tsc --noEmit
git diff --check
```

预期：新增测试先失败，最小实现后通过；现有身份测试保持通过。

推荐提交：`feat(portal): define invite hub state and summaries`

---

## 【步骤 2】增加生产 `/join` 明确映射

目标：

让邀请链接在生产 HTTP 服务中进入门户首页，同时保持未知路径 404 和现有静态目录行为。

文件：

- 修改 `scripts/test-http-server.mjs`
- 修改 `server/http-server.mjs`

先写失败测试：

1. `GET /join` 返回根 `index.html`。
2. `HEAD /join/` 返回 200 且没有响应体。
3. `GET /unknown-route` 继续返回 JSON 404。
4. `/arena/` 继续返回 Arena 首页。

最小实现：

1. 在进入 `serveStatic()` 前，仅把 `/join` 和 `/join/` 转换为 `/index.html`。
2. 不修改 API 路由顺序，不增加通配 SPA 回退。
3. 保留现有路径解码和目录越界保护。

验证：

```powershell
npm run test:http
node --check server/http-server.mjs
git diff --check
```

预期：`/join` 两种形式通过，未知路径仍为 404。

推荐提交：`feat(server): route invite links to portal`

---

## 【步骤 3】实现邀请入口和门户身份编排

目标：

实现 `checking → guest/offline/authenticated` 页面流程，并确保敏感设备令牌不进入 DOM、URL或日志。

文件：

- 新增 `src/ui/inviteGate.ts`
- 修改 `src/ui/portal.ts`
- 修改 `src/main.ts`
- 修改 `src/style.css`
- 修改 `tests/e2e/baseline.spec.ts`
- 新增 `tests/e2e/portal.spec.ts`

先写失败测试：

1. `?invite=VALID01` 只显示昵称输入，未认证时不显示模式入口。
2. 无 URL 邀请码时同时显示邀请码与昵称输入。
3. 兑换成功后保存身份、清除 `invite` 查询参数并显示玩家昵称。
4. 刷新调用 `/api/me`，兑换接口调用次数保持一次。
5. 401/403 清除身份并返回邀请入口。
6. 网络错误或 5xx 保留身份，显示“重试连接”，重试成功后进入门户。
7. localStorage 探针失败时兑换 API 调用次数为零。
8. 兑换后保存失败时出现“重试保存”，点击重试不再次请求兑换 API。
9. `/arena/` 仍创建尺寸非零的 Three.js Canvas；根路径不创建 Canvas。

最小实现：

1. `inviteGate.ts` 只负责表单 DOM、可见标签、提交禁用、`role="alert"` 和 `role="status"`。
2. `portal.ts` 持有当前页面状态和一次性的待保存身份，调用现有认证客户端与 progression 读取函数。
3. 恢复身份时使用服务端返回昵称；只在 401/403 清除本地身份。
4. 兑换前运行存储探针；最终保存失败时保留内存身份并只重试 `saveLocalIdentity()`。
5. 保存成功后用 `history.replaceState()` 只移除 `invite` 参数，保留其他查询参数和当前路径。
6. `main.ts` 使用 `VITE_APP_MODE` 选择动态导入；开发环境没有该变量时仅 `/arena/` 启动 `Game`，其他路径启动门户。
7. 给根元素增加门户或 Arena 模式类，用模式类控制页面滚动；不重写既有 Arena 样式。

验证：

```powershell
npm run test:unit
npx tsc --noEmit
npm run test:e2e -- portal.spec.ts baseline.spec.ts
git diff --check
```

预期：身份四状态、保存失败恢复和 Arena 回归全部通过，页面错误监听为空。

推荐提交：`feat(portal): gate game hub by invite identity`

---

## 【步骤 4】完成认证门户布局与六模式入口

目标：

把认证状态做成可用的私人竞技据点，并在桌面、窄屏和移动端保持清晰可操作。

文件：

- 修改 `src/ui/portal.ts`
- 修改 `src/style.css`
- 修改 `tests/e2e/portal.spec.ts`

先写失败测试：

1. 玩家摘要显示服务端昵称、本地金币和当前配装。
2. 页面恰好显示六个模式入口。
3. 两个开放入口的相对 URL 正确。
4. 四个锁定入口分别显示阶段 5、6、7、8，点击后 URL 不变。
5. 键盘焦点能到达邀请表单、重试按钮和开放入口；锁定项不伪装成链接。
6. 1280×800 与 390×844 都满足 `scrollWidth <= clientWidth`。
7. 移动端主要输入、按钮和开放链接高度至少 44px，长锁定说明不裁切。

最小实现：

1. 桌面采用玩家摘要加 2×3 模式区，移动端切为单列。
2. 使用 `portal-`、`invite-gate-` 类名前缀，避免覆盖 Arena 组件。
3. 使用深色金属面、青蓝状态线和少量暖金重点，不新增图片资产。
4. 为开放、锁定、hover、pressed、focus-visible、loading、error 和 offline 提供清晰状态。
5. 使用 `env(safe-area-inset-*)`、`clamp()` 和稳定网格约束；不依赖纯视口字号缩放。
6. 在 `prefers-reduced-motion: reduce` 下关闭非必要装饰动画。

验证：

```powershell
npm run test:e2e -- portal.spec.ts
npx tsc --noEmit
git diff --check
```

人工视觉核对：

- 桌面：1280×800，邀请入口和认证门户。
- 移动：390×844，邀请入口、认证门户和离线重试。
- 检查无横向溢出、文字裁切、焦点丢失和页面异常。
- 如需截图，只写入现有 `output/playwright/`，不创建新的顶层目录。

预期：门户具有游戏大厅层级，不呈现为通用后台卡片墙；移动端内容均可滚动到达。

推荐提交：`feat(portal): add responsive private arena hub`

---

## 【步骤 5】改造双 Vite 统一构建与站点验证

目标：

让生产根目录构建门户、`/arena/` 构建 Arena、`/customizer/` 保持现状，并继续只复制一份 NSS 模型。

文件：

- 修改 `scripts/build-unified-site.mjs`
- 修改 `scripts/verify-unified-site.mjs`
- 视实际构建结果最小修改 `vite.config.ts`

先建立失败验证：

1. 统一站点验证要求根首页包含门户入口标记。
2. 验证 `/arena/index.html` 与 `/customizer/index.html` 仍存在。
3. 验证根首页没有直接引用 Arena/Three.js 启动块。
4. 继续验证 16 个 GLB 只有一份、哈希一致、相对互链存在且无开发端口泄漏。

最小实现：

1. 首先以 `VITE_APP_MODE=portal` 构建到 `dist/site/`。
2. 再以 `VITE_APP_MODE=arena` 构建到 `dist/site/arena/`。
3. 定制器继续构建到 `dist/site/customizer/`。
4. 门户构建完成后再复制公共资源和 16 个 NSS 模型，避免根构建清空预建目录。
5. 移除构建脚本中复制 `site/index.html` 的步骤，但不删除源文件。
6. 只有实际相对资源路径失败时才调整 `vite.config.ts`；不提前增加多入口 Rollup 配置。

验证：

```powershell
npm run build
npm run verify:site
npx tsc --noEmit
git diff --check
```

预期：生产输出包含 `/`、`/arena/`、`/customizer/`，16 个 GLB 无重复，门户入口不会初始化 Three.js。

推荐提交：`build(site): split portal and arena bundles`

---

## 【步骤 6】执行完整回归与交付检查

目标：

证明门户改造没有改变战斗、NSS 契约、认证服务或定制器，并清理本任务产生的临时问题。

文件：

- 原则上不新增产品文件；仅修复本任务导致的失败。

自动验证：

```powershell
npm run test:unit
npm run test:nss-contract
npm run test:server
npm run build
npm run verify:site
npm run test:e2e
npx tsc --noEmit
node --check server/http-server.mjs
git diff --check
```

定制器回归：

```powershell
Set-Location battle-top-designer\web-customizer
npm run test:unit
npm run build
Set-Location ..\..
```

完成检查：

1. 对比任务前后的战斗相关文件，确认没有修改战斗、属性、物理和 AI 规则。
2. 搜索设备令牌是否出现在 DOM 模板、URL、日志或测试截图文本中。
3. 确认本任务提交没有包含 `.playwright-cli/`、`test-results/`、现有截图、翻译目录、`referse/` 或未跟踪 VFX 素材。
4. 确认没有新增依赖、通用路由框架、插件系统或未来模式实现。
5. 记录 HTTPS、客户端门禁和本地身份清除后不可恢复的既有限制。

预期：全部门禁通过，工作区只保留用户原有未跟踪内容和明确的本任务提交。

本步骤无独立提交；若只产生验证结果，则直接交付。

## 5. 风险与控制

- 风险：全局 `overflow: hidden` 阻止移动门户滚动。控制：仅通过根模式类覆盖门户的 `html/body/#app` 溢出，Arena 保持原样。
- 风险：双构建顺序删除已复制资源。控制：门户根构建最先执行，公共资源和模型最后复制。
- 风险：401 与网络错误混淆导致朋友被迫重新兑换。控制：单元与 E2E 分别固定 401/403、5xx 和网络失败行为。
- 风险：保存失败后重复调用兑换接口消耗邀请码。控制：在内存保留已兑换身份，重试按钮只执行本地保存。
- 风险：门户 bundle 意外加载 Three.js。控制：编译期模式分支使用动态导入，并在构建验证和浏览器 Canvas 断言中检查。
- 风险：静态门禁被误认为安全边界。控制：继续明确静态资源公开，数据安全只由认证 API 提供。

## 6. 最终交付物

- 邀请入口与四状态身份编排。
- 认证后的响应式六模式私人门户。
- `/join`、`/join/` 生产入口。
- 门户、Arena、定制器统一双构建输出。
- 身份、HTTP、构建、桌面和移动端回归测试。
- 不改变现有战斗模式与任何数值规则。
