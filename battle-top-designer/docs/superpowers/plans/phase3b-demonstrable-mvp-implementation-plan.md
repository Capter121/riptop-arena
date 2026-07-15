# Phase 3B Demonstrable Web Customizer MVP 实施计划

状态：等待实施确认

允许的最终状态：`Phase 3B demonstrable MVP PASS under provisional visual review` 或 `Phase 3B changes requested`

当前治理状态：

- `Phase 2B visual review deferred pending real reviewers`
- `Phase 2C technical validation PASS under provisional waiver`
- `Phase 3A internal prototype PASS under provisional visual review`
- 临时技术基线：`v0.2.0-rc1-technical-baseline`（`PROVISIONAL_NOT_FINAL`）

所有 Phase 3B 正式报告必须包含：

> Human visual review remains pending.
>
> Development continued under a documented provisional internal-prototype decision.

## 目标与成功标准

在不修改 16 个零件可见几何、NSS-V1、安装变换、临时技术基线和 Phase 2C 组合矩阵的前提下，把现有离线工程原型打磨为可演示、可分享、可进行小范围匿名真实用户测试的网页产品。

成功标准：

- 现有 16 个 GLB、288 个稳定组合 ID 和安装结果不变；
- URL 分享、二维码、PNG 组合卡片全部本地生成；
- 收藏、最近使用、昵称、撤销重做和测试模式只使用本地存储；
- 已批准的 Assist、Gear、Tip 聚焦补偿完整保留；
- 首屏、交互和内存指标可复现、可对比，不靠删除核心功能通过；
- 桌面和移动 Playwright 覆盖全部指定流程；
- console error、pageerror、failed request、external request 均为 0；
- 人工视觉评审保持开放，不产生制造、安全或真实战斗性能结论。

## 架构选择

评估三个方案：

1. **推荐：增量模块化现有 `web-customizer/`。** 保留已验证的 React、R3F、Zustand、mount 装配和 GLB 缓存，仅拆分当前职责过重的 `App.tsx`、`Scene.tsx` 和 store。回归面最小，最符合 Phase 3B 的冻结限制。
2. **重写第二个演示应用。** 可以获得更整洁的结构，但会复制 288 组合、装配和错误处理逻辑，增加行为漂移和双重维护风险，不采用。
3. **继续把全部能力堆入现有组件。** 初期文件少，但分享、历史、测试模式和错误状态会互相耦合，难以测试和按需加载，不采用。

新增边界只服务当前需求：

- `sharing`：URL 编解码、二维码和 PNG 卡片；
- `library`：昵称、最近使用和收藏；
- `history`：可撤销组合状态，不记录相机和临时动画；
- `attributes`：可追踪贡献和确定性差值；
- `errors`：用户错误分类、恢复动作和超时；
- `test-mode`：匿名本地任务记录；
- `performance`：构建、交互和内存测量。

## 冻结与回归门

每个 Stage 开始和结束都执行：

```powershell
npm --prefix web-customizer run check:governance
python scripts/manage_phase2c_provisional_baseline.py verify
git diff --name-only v0.2.0-rc1-technical-baseline -- specs public/models reports/validation/phase2c-final-gate.json reports/validation/phase2c-combination-matrix.json
```

任何受保护路径差异、288 ID 顺序变化、安装矩阵变化或治理状态升级均为硬停止。每个 Stage 通过后创建独立提交。

## Stage 0 — Phase 3A 基线确认

### Task 0.1 — 固定 Phase 3A 输入清单

- 目标：记录实施前提交、依赖、16 个 GLB、NSS-V1 和 Phase 2C 证据的只读清单。
- 修改文件：新增 `reports/validation/phase3b-input-manifest.json` 的生成脚本；不修改输入文件。
- 实现步骤：记录 HEAD、Phase 3A 两个提交、基线 tag、依赖锁文件哈希、16 个 GLB SHA-256、`specs/interfaces.json` SHA-256、Phase 2C digest 和 288 CSV digest。
- 执行命令：`npm --prefix web-customizer run phase3b:baseline:capture`。
- 自动测试：重复运行两次并比较规范化 JSON；除生成时间外必须一致。
- 预期结果：输入清单包含 16 个唯一 GLB 和一个 NSS-V1 哈希。
- 失败停止条件：文件缺失、哈希漂移、基线非临时状态或组合数量不是 288。
- Git提交建议：`chore(web): capture Phase 3B input baseline`。
- 回滚方法：只移除新生成的 Phase 3B 清单和命令，不改写任何基线文件。

### Task 0.2 — 运行 Phase 3A 完整回归

- 目标：证明 Phase 3B 从已通过的 Phase 3A 状态开始。
- 修改文件：仅增加 Phase 3B 回归结果记录，不修改测试断言。
- 实现步骤：运行治理、12 个单元断言、构建、桌面/移动 Playwright、288 枚举和旧 preview 43 项回归。
- 执行命令：`npm --prefix web-customizer run test:all`，随后在 `preview/` 执行 `npm test -- --reporter=line`。
- 自动测试：Phase 3A 总门禁和旧 preview 全部通过，浏览器错误与外网请求为 0。
- 预期结果：得到可与 Phase 3B 最终结果比较的基线测试摘要。
- 失败停止条件：任一现有测试失败或旧评审素材出现未恢复的工作区差异。
- Git提交建议：包含在 Task 0.1 提交中。
- 回滚方法：逐文件恢复测试重生成的旧截图和旧报告，保留测试日志。

### Task 0.3 — 采集性能基线

- 目标：量化当前约 324 KB gzip 入口和现有交互耗时，避免无基线优化。
- 修改文件：新增 `web-customizer/scripts/measure-performance.mjs`、性能 Playwright fixture 和原始结果目录。
- 实现步骤：在固定 Chromium、1280×800 桌面和 Pixel 7 模拟环境测量 entry/scene/total JS、gzip、首次交互、首次模型 ready、冷切换、缓存切换和 100 次切换后堆内存。
- 执行命令：`npm --prefix web-customizer run perf:baseline`。
- 自动测试：连续三次运行，报告中位数和 p95；采样条件、CPU/网络配置和浏览器版本完整。
- 预期结果：生成 Phase 3A 可复现性能基线，不改变通过状态。
- 失败停止条件：指标无法稳定采集、误用外网、GC/堆测量不可复现或采集过程改变源码。
- Git提交建议：包含在 Task 0.1 提交中。
- 回滚方法：移除新测量工具和临时原始数据，保留已提交输入清单。

## Stage 1 — 加载与性能优化

### Task 1.1 — 建立性能预算和产物分析

- 目标：把性能目标变成自动门禁，而不是主观判断。
- 修改文件：修改 `vite.config.ts`、`package.json`；新增 bundle 分析脚本和预算配置。
- 实现步骤：记录每个 chunk 的 raw/gzip；设置 shell entry gzip ≤ 120 KB、首次可交互所需总 JS gzip ≤ 360 KB、桌面首次可交互中位数 ≤ 4 秒、移动模拟 ≤ 6 秒、冷切换 p95 ≤ 1.5 秒、缓存切换 p95 ≤ 300 毫秒。
- 执行命令：`npm --prefix web-customizer run analyze:bundle` 和 `npm --prefix web-customizer run perf:check`。
- 自动测试：预算解析、超限 fixture 和缺失指标 fixture 必须分别 PASS/FAIL/FAIL。
- 预期结果：当前基线和目标差异明确写入机器报告。
- 失败停止条件：用提高阈值掩盖回归，或未记录硬件/浏览器/采样条件。
- Git提交建议：`perf(web): establish Phase 3B budgets`。
- 回滚方法：恢复预算配置和 Vite 分块设置，不改业务代码。

### Task 1.2 — 按需加载 Three.js 场景运行时

- 目标：让 UI shell 先出现，再异步加载 R3F、Drei、Three.js 和 GLTFLoader。
- 修改文件：修改 `src/App.tsx`、`src/main.tsx`；拆出 `src/scene/SceneEntry.tsx` 和加载边界。
- 实现步骤：使用 React lazy/import 分离场景 chunk；保留当前 Canvas、mount 装配、缓存和错误边界；shell 先显示稳定占位和治理状态。
- 执行命令：`npm --prefix web-customizer run build`。
- 自动测试：chunk 图不再把 Three.js 放入 shell entry；Storm Attack ready、相机和五层装配回归通过。
- 预期结果：shell entry gzip 达到预算且首次模型仍正确装配。
- 失败停止条件：首屏空白、功能删除、重复加载 GLB、mount 矩阵变化或总首次交互性能恶化超过 10%。
- Git提交建议：`perf(web): lazy-load 3D runtime`。
- 回滚方法：恢复同步场景入口；保留性能测量和失败证据。

### Task 1.3 — 分割非首屏面板

- 目标：延迟加载收藏、分享、导入导出、引导和测试模式面板。
- 修改文件：拆分 `src/ui/` 路由式面板，修改 `App.tsx` 的 Suspense 边界。
- 实现步骤：首屏只保留 3D、当前组合和五类选择；用户首次打开工具时加载对应 chunk；预加载只在浏览器空闲且非低性能模式执行。
- 执行命令：`npm --prefix web-customizer run test:e2e -- lazy-panels`。
- 自动测试：面板打开前 chunk 未请求，打开后本地请求一次，关闭重开命中缓存。
- 预期结果：非首屏功能完整且不增加外部请求。
- 失败停止条件：焦点丢失、面板不可键盘操作、离线 chunk 404 或首屏预算回归。
- Git提交建议：包含在 Task 1.2 提交中。
- 回滚方法：将失败面板恢复同步加载，不删除其功能。

### Task 1.4 — 增加真实加载进度和低性能模式

- 目标：在模型或场景加载期间给用户明确反馈，并允许降低渲染成本。
- 修改文件：修改场景 loader、Zustand UI 状态和设置面板；新增性能模式模块。
- 实现步骤：按场景 chunk、五个 GLB 和首次材质编译计算单调进度；低性能模式降低 DPR、阴影/补光复杂度和自动旋转速率，但不移除零件、材质或交互。
- 执行命令：`npm --prefix web-customizer run test:e2e -- loading-progress low-performance`。
- 自动测试：进度从 0 到 100 不倒退；普通/低性能模式组合、mount 和功能一致。
- 预期结果：慢加载可理解，低性能模式可手动开启并持久化。
- 失败停止条件：伪造进度、低性能模式改变几何/材质含义、默认自动降级且无法恢复。
- Git提交建议：`feat(web): add loading progress and low-performance mode`。
- 回滚方法：恢复默认渲染参数并清除仅属于性能模式的本地键。

### Task 1.5 — 验证缓存与内存释放

- 目标：确保只保留五个活动实例，最多缓存 16 个解析源，展示克隆材质可释放。
- 修改文件：修改 `Scene.tsx`、资源缓存诊断和性能测试。
- 实现步骤：记录活动 roots、解析缓存、几何、材质和 WebGL 资源；循环全部零件 100 次；释放旧实例、临时 outline、导出 render target 和面板引用。
- 执行命令：`npm --prefix web-customizer run perf:memory`。
- 自动测试：活动 roots 恒为 5，缓存 ≤ 16；强制 GC 后保留堆增长 ≤ max(10 MB, 15%)，第二轮不继续单调增长。
- 预期结果：生成包含前后快照和资源计数的内存证据。
- 失败停止条件：缓存源被 dispose、活动实例泄漏、堆持续增长或为了通过而禁用缓存。
- Git提交建议：`perf(web): stabilize GLB lifecycle`。
- 回滚方法：回退资源生命周期变更并恢复已通过的 Phase 3A 缓存行为。

## Stage 2 — URL 分享与恢复纵向切片

### Task 2.1 — 实现稳定 URL 编解码

- 目标：使用 Phase 2C 稳定 `combination_id` 在 URL 中恢复组合。
- 修改文件：新增 `src/sharing/combinationUrl.ts` 和单元测试；修改启动 hydration 顺序。
- 实现步骤：采用 `?combo=nss-p2c-0138`；从 ID 反查五字段组合；优先级为合法 URL、合法 localStorage、Storm Attack；URL 不承载昵称或测试数据。
- 执行命令：`npm --prefix web-customizer run test:unit -- combinationUrl`。
- 自动测试：288 个 ID 双向 round-trip；未知、重复、大小写错误、额外危险参数安全回退。
- 预期结果：任一合法链接离线打开后恢复同一组合和 ID。
- 失败停止条件：出现第二套 ID 顺序、URL 可注入任意零件 ID、非法 URL 导致空白页。
- Git提交建议：`feat(web): add stable combination URLs`。
- 回滚方法：忽略 URL 参数并恢复 Phase 3A hydration 顺序。

### Task 2.2 — 复制链接和本地二维码

- 目标：完全离线生成可复制链接和二维码。
- 修改文件：新增 `src/sharing/shareLink.ts`、`QrCode.tsx`；精确锁定本地二维码依赖并更新许可证清单。
- 实现步骤：使用当前 origin/path 和规范化 combo 参数；优先 Clipboard API，失败时提供可选择文本；二维码只编码同一 URL，不访问外部服务。
- 执行命令：`npm --prefix web-customizer run test:unit -- shareLink qr`。
- 自动测试：固定输入二维码矩阵确定、安静区和纠错级别正确；运行时 external request 仍为 0。
- 预期结果：用户可复制链接并获得可由测试解码器还原的二维码。
- 失败停止条件：依赖未锁版/缺许可证、二维码调用网络、编码内容与显示链接不一致。
- Git提交建议：`feat(web): add offline link and QR sharing`。
- 回滚方法：移除二维码 UI 和新依赖，保留已通过的 URL codec。

### Task 2.3 — 导出组合卡片 PNG

- 目标：导出包含模型、零件列表、组合 ID 和概念属性声明的离线 PNG。
- 修改文件：新增 `src/sharing/cardRenderer.ts`、卡片模板、导出按钮和测试 fixture。
- 实现步骤：用独立 WebGL render target 渲染固定 1200×630 组合图；翻转像素并写入 2D canvas；叠加本地字体、二维码、五个零件名称、ID 和声明；不改变正常 Canvas 的 `preserveDrawingBuffer`。
- 执行命令：`npm --prefix web-customizer run test:e2e -- png-card`。
- 自动测试：下载 MIME、尺寸、非空像素、文本区域、二维码可解码、导出后主场景状态不变。
- 预期结果：桌面和移动端均生成确定尺寸 PNG，过程无外网和资源泄漏。
- 失败停止条件：空图、上下颠倒、缺声明、主渲染变慢、导出后相机/安装变换改变。
- Git提交建议：`feat(web): export offline combination cards`。
- 回滚方法：释放 render target 并移除卡片导出入口，保留分享链接。

### Task 2.4 — 安全处理非法分享输入

- 目标：非法 URL、剪贴板失败和导出失败均提供用户可理解的恢复操作。
- 修改文件：修改 URL hydration、分享面板和错误文案；新增错误测试。
- 实现步骤：非法 combo 回退 Storm Attack，保留非阻塞提示和“清除无效参数”；复制失败显示可手动复制字段；PNG 失败提供重试且不改变组合。
- 执行命令：`npm --prefix web-customizer run test:e2e -- invalid-share-input`。
- 自动测试：非法 URL、禁用剪贴板、canvas 导出异常和无下载权限场景。
- 预期结果：每个错误都有清楚原因和一个确定恢复动作。
- 失败停止条件：错误被静默吞掉、反复重载、污染 localStorage 或控制台输出未处理异常。
- Git提交建议：包含在 Task 2.3 提交中。
- 回滚方法：恢复简单下载流程，但保持非法 URL 安全回退。

## Stage 3 — 组合命名、最近使用与收藏纵向切片

### Task 3.1 — 分离技术 ID、自动名称和用户昵称

- 目标：建立不影响稳定 ID 的三层命名模型。
- 修改文件：新增 `src/library/combinationIdentity.ts`；修改组合标题和分享卡片。
- 实现步骤：技术 ID 永远由五字段计算；自动名称由零件展示名确定生成；昵称为可选本地字段，长度、控制字符和空白规范化受限。
- 执行命令：`npm --prefix web-customizer run test:unit -- combinationIdentity`。
- 自动测试：昵称不改变 ID/URL；空值回退自动名称；恶意文本只作为文本显示。
- 预期结果：三个名称层级清晰且分享卡片可选择显示昵称与技术 ID。
- 失败停止条件：昵称参与哈希、可写入 HTML、或自动名称不确定。
- Git提交建议：`feat(web): add local combination identity`。
- 回滚方法：删除昵称记录并回退自动名称，技术 ID 不变。

### Task 3.2 — 实现版本化最近使用和收藏存储

- 目标：在 localStorage 保存最近组合和收藏，不存个人信息。
- 修改文件：新增 `src/library/localLibrary.ts`、schema 和迁移测试。
- 实现步骤：存储 schemaVersion、五字段组合、ID、可选昵称和本地时间；最近使用去重并限制 12 条；收藏按 ID 唯一，限制 50 条；损坏数据隔离后回退空库。
- 执行命令：`npm --prefix web-customizer run test:unit -- localLibrary`。
- 自动测试：添加、去重、排序、上限、删除、迁移、损坏 JSON、配额异常和 storage denial。
- 预期结果：刷新后收藏和最近使用可恢复且不会影响当前合法组合。
- 失败停止条件：损坏数据阻塞启动、存入模型对象、未限制增长或收集额外个人字段。
- Git提交建议：`feat(web): persist recent and favorite combinations`。
- 回滚方法：只清除 `nova-spin:phase3b:library:v1` 键并保留 Phase 3A 当前组合键。

### Task 3.3 — 完成组合库 UI

- 目标：提供最近使用、收藏、删除收藏、昵称编辑和 Storm Attack 恢复。
- 修改文件：新增懒加载 `src/ui/library/` 面板，修改动作区和可访问性样式。
- 实现步骤：显示自动名称、昵称和 ID；收藏恢复使用同一原子加载事务；删除需明确按钮；默认组合按钮保持可见。
- 执行命令：`npm --prefix web-customizer run test:e2e -- combination-library`。
- 自动测试：保存、刷新、恢复、重命名、删除、最近去重、Storm Attack reset 和键盘操作。
- 预期结果：所有数据只保存在本地且恢复后模型与 ID 一致。
- 失败停止条件：收藏恢复部分成功、删除错误记录、UI 阻塞移动端主流程。
- Git提交建议：`feat(web): add local combination library UI`。
- 回滚方法：隐藏组合库面板并保留底层合法存储，或清除其独立键。

## Stage 4 — 撤销重做与交互体验纵向切片

### Task 4.1 — 实现组合级撤销与重做

- 目标：只对已成功装配的组合变化建立有限历史。
- 修改文件：新增 `src/history/combinationHistory.ts`；修改 store 事务。
- 实现步骤：历史记录五字段和可选昵称，不记录相机、focus、loading 或动画帧；成功替换后提交；上限 50；新分支清除 redo；失败加载不入历史。
- 执行命令：`npm --prefix web-customizer run test:unit -- combinationHistory`。
- 自动测试：单步、多步、边界、分支、快速切换、加载失败和 reset。
- 预期结果：Undo/Redo 恢复同一 ID、mount 和选中 UI。
- 失败停止条件：历史包含非法中间状态、永久变换漂移或失败请求进入历史。
- Git提交建议：`feat(web): add deterministic undo and redo`。
- 回滚方法：关闭历史动作并保留当前合法组合。

### Task 4.2 — 点击 3D 零件选择分类并高亮当前层

- 目标：让用户直接从模型理解五层结构。
- 修改文件：修改 `Scene.tsx` picking、part root 元数据和选中层高亮组件。
- 实现步骤：raycast 可见 mesh 到所属 part root；点击只切换分类，不换零件；使用临时 outline/emissive 高亮当前层；拖动超过阈值不触发点击。
- 执行命令：`npm --prefix web-customizer run test:e2e -- scene-picking`。
- 自动测试：五层命中、空白点击、拖动、Assist 被遮挡时的 focus、材质恢复和 cache source 不变。
- 预期结果：3D 点击与分类标签同步，默认无永久高亮。
- 失败停止条件：误把 OrbitControls 拖动当点击、修改共享材质或 collider 被命中。
- Git提交建议：`feat(web): add layer picking and highlight`。
- 回滚方法：移除 pointer handler 和临时材质，保留标签选择。

### Task 4.3 — 强化拆解、恢复和随机组合动画

- 目标：保持永久安装矩阵不变的同时提高演示可读性。
- 修改文件：修改 presentation sequence、随机动作和诊断测试。
- 实现步骤：沿用五层爆炸方向；随机先轻拆解、逐层替换、再组装；中断时取消旧序列；低性能/减少动态效果时缩短或跳过展示动画但不跳过状态验证。
- 执行命令：`npm --prefix web-customizer run test:e2e -- assembly-motion random-motion`。
- 自动测试：动画前后永久矩阵逐元素相同；连续点击最终只保留最后合法组合。
- 预期结果：演示流畅且快速操作不会产生错层或漂移。
- 失败停止条件：动画写入永久 root、无法中断、随机生成非法组合。
- Git提交建议：`feat(web): polish reversible assembly motion`。
- 回滚方法：snap 到 assembled presentation state 并恢复 Phase 3A 动画参数。

### Task 4.4 — 新手引导、触摸提示和键盘操作

- 目标：首次用户无需说明即可完成选择、旋转、缩放、拆解和分享。
- 修改文件：新增懒加载 onboarding；修改控制按钮快捷键和移动提示。
- 实现步骤：最多四步可跳过引导；只记录完成标志；移动端首次显示拖动/双指缩放提示；键盘支持分类左右移动、零件方向键、Enter 选择、Z/Y 撤销重做、E 拆解、R 重置。
- 执行命令：`npm --prefix web-customizer run test:e2e -- onboarding keyboard touch-hints`。
- 自动测试：首次/再次访问、跳过、焦点顺序、快捷键不劫持文本输入、390×844 无遮挡。
- 预期结果：鼠标、触摸和键盘均可完成核心任务。
- 失败停止条件：引导遮挡发送/操作区域、无法跳过、键盘与昵称输入冲突。
- Git提交建议：`feat(web): add guided and accessible controls`。
- 回滚方法：清除引导完成键并禁用引导层，保留基础控件。

### Task 4.5 — 增加加载失败重试

- 目标：模型失败后无需刷新页面即可恢复。
- 修改文件：修改 Scene error boundary、loader transaction 和错误面板。
- 实现步骤：保留上一个成功组合；提供重试当前零件、恢复上一个组合、恢复 Storm Attack 三个动作；重试使用新 transaction token，不破坏缓存源。
- 执行命令：`npm --prefix web-customizer run test:e2e -- glb-retry`。
- 自动测试：404、连接中断、损坏 GLB、首次失败后成功、快速重试和取消。
- 预期结果：错误可理解且恢复后活动 roots 为 5。
- 失败停止条件：无限自动重试、错误组合入历史/收藏、控制台未处理异常。
- Git提交建议：`fix(web): add recoverable model loading`。
- 回滚方法：恢复上一个成功组合并关闭重试入口，不修改模型 URL。

## Stage 5 — 概念属性数据和计算纵向切片

### Task 5.1 — 建立属性来源与版本清单

- 目标：使 attack、defense、stamina、balance、weight、height 的每个输入可追踪。
- 修改文件：扩展 `src/data/concept-attributes.json` schema；新增来源说明和验证器。
- 实现步骤：为每个零件记录六项贡献、来源类型、理由、数据版本和非物理声明；接口/规格只读；禁止运行时随机数。
- 执行命令：`npm --prefix web-customizer run attributes:validate`。
- 自动测试：16×6 数据完整、范围有效、来源非空、版本固定、未知字段失败。
- 预期结果：任何汇总值可追溯到五个零件贡献。
- 失败停止条件：把概念值描述为测量性能、缺少来源或使用随机数填值。
- Git提交建议：`feat(web): version concept attribute sources`。
- 回滚方法：恢复 Phase 3A 概念值并隐藏贡献视图，不推断缺失值。

### Task 5.2 — 实现确定性汇总和更换差值

- 目标：计算当前总属性、各零件贡献和换件前后 delta。
- 修改文件：修改 `attributes.ts`；新增属性比较模块和测试。
- 实现步骤：固定六项公式和舍入顺序；同一组合永远相同；预览候选零件时计算替换后值但不写 store；weight/height 明确为概念刻度而非克/毫米测量结论。
- 执行命令：`npm --prefix web-customizer run test:unit -- attributes`。
- 自动测试：288 组合确定性、边界、顺序无关、候选 delta、重复计算 digest 一致。
- 预期结果：所有差值可由零件贡献复算。
- 失败停止条件：浮点结果跨运行漂移、候选 hover 改变组合、出现物理性能措辞。
- Git提交建议：`feat(web): expose deterministic attribute deltas`。
- 回滚方法：回退 delta UI，保留已验证汇总公式。

### Task 5.3 — 展示贡献和概念声明

- 目标：让用户理解换件为什么改变属性。
- 修改文件：修改属性面板和零件选择卡片；新增贡献详情面板。
- 实现步骤：显示当前值、候选增减、五层贡献；始终显示 `Concept attributes for prototype use only.`；测试模式导出只记录选择和概念值。
- 执行命令：`npm --prefix web-customizer run test:e2e -- attribute-contributions`。
- 自动测试：六项、正负/零 delta、移动布局、声明可见、分享卡片声明一致。
- 预期结果：属性反馈清晰但没有真实战斗性能暗示。
- 失败停止条件：声明在小屏被隐藏、颜色是唯一表达方式或贡献和汇总不一致。
- Git提交建议：`feat(web): explain concept attribute changes`。
- 回滚方法：恢复简单条形图并保留声明。

## Stage 6 — 错误处理质量门

### Task 6.1 — 建立用户错误分类与恢复动作

- 目标：统一所有已知错误的代码、文案、严重度和恢复动作。
- 修改文件：新增 `src/errors/errorCatalog.ts`、错误视图和测试。
- 实现步骤：定义 GLB_NOT_FOUND、GLB_LOAD_FAILED、WEBGL_UNAVAILABLE、STORAGE_CORRUPT、JSON_INVALID、URL_INVALID、LOAD_SUPERSEDED、LOAD_TIMEOUT、LOW_MEMORY；每类映射一个主恢复动作。
- 执行命令：`npm --prefix web-customizer run test:unit -- errorCatalog`。
- 自动测试：所有代码文案非技术化、恢复动作存在、未知错误安全降级。
- 预期结果：错误面板不显示堆栈，诊断详情只在调试模式可见。
- 失败停止条件：错误无恢复动作、暴露本地路径、静默忽略数据损坏。
- Git提交建议：`feat(web): centralize recoverable errors`。
- 回滚方法：恢复现有通用错误边界并保留错误日志 fixture。

### Task 6.2 — 覆盖 GLB、超时和快速切换

- 目标：让资源错误和竞态保持原子性。
- 修改文件：修改 loader transaction、超时 wrapper、缓存和恢复 UI。
- 实现步骤：为每次加载分配 token；默认 15 秒超时；过期结果丢弃；404/损坏不替换当前实例；快速切换只提交最后请求。
- 执行命令：`npm --prefix web-customizer run test:e2e -- resource-errors rapid-switch timeout`。
- 自动测试：全部 16 URL fixture、延迟、乱序、取消、超时后重试和缓存完整性。
- 预期结果：任何时刻要么显示旧合法组合，要么完整显示新合法组合。
- 失败停止条件：部分装配、活动 roots 非 5、失败状态入历史或缓存源被污染。
- Git提交建议：`fix(web): make model replacement atomic`。
- 回滚方法：取消当前 token 并恢复最后成功快照。

### Task 6.3 — 覆盖 storage、JSON 和 URL 损坏

- 目标：所有本地数据入口先验证后应用。
- 修改文件：统一 storage/library/import/URL validators 和恢复提示。
- 实现步骤：损坏 localStorage 隔离到 debug-only 诊断，不自动回写；JSON/URL 使用同一零件和 family validator；恢复动作清除单个命名空间而非全部站点存储。
- 执行命令：`npm --prefix web-customizer run test:unit -- persistence-errors`。
- 自动测试：语法错误、版本错误、额外字段、错误 family、未知 ID、quota/security exception。
- 预期结果：非法数据不进入 Zustand，默认组合可用。
- 失败停止条件：清除无关 localStorage、部分导入或错误被当成收藏保存。
- Git提交建议：`fix(web): harden local data recovery`。
- 回滚方法：只清除 Phase 3B 新命名空间并恢复 Storm Attack。

### Task 6.4 — 覆盖 WebGL 不可用和移动低内存

- 目标：在无法可靠渲染时提供明确降级，而不是白屏。
- 修改文件：新增 capability 检测、静态 fallback 面板和低内存建议。
- 实现步骤：创建 Canvas 前检查 WebGL2/WebGL；context lost 时停止动画并提供重试；检测 Chromium memory pressure 测试 fixture 或诊断阈值，建议低性能模式并释放非活动导出/面板资源。
- 执行命令：`npm --prefix web-customizer run test:e2e -- webgl-unavailable context-lost low-memory`。
- 自动测试：禁用 WebGL、模拟 context loss、低内存信号、重试成功和无支持 API 场景。
- 预期结果：组合数据和分享/收藏仍可访问，3D 不可用原因清楚。
- 失败停止条件：自动声称设备不兼容、无限重建 context、丢失用户组合。
- Git提交建议：`feat(web): add rendering capability recovery`。
- 回滚方法：关闭能力提示并恢复通用错误面板，保留组合数据。

## Stage 7 — 内部匿名测试模式纵向切片

### Task 7.1 — 建立测试模式和本地会话 schema

- 目标：通过 `?test=1` 或调试开关进入，不影响普通用户。
- 修改文件：新增 `src/test-mode/testSession.ts`、任务定义和 validator。
- 实现步骤：会话只记录匿名 session UUID、开始/结束时间、任务耗时、所选组合 ID、错误步骤和完成状态；不包含姓名、联系方式、IP、UA 全文或自由文本个人资料。
- 执行命令：`npm --prefix web-customizer run test:unit -- testSession`。
- 自动测试：普通 URL 不加载测试面板；schema 禁止未批准字段；刷新可恢复未完成本地会话。
- 预期结果：测试数据只写独立 localStorage 命名空间。
- 失败停止条件：网络上传、收集不必要个人字段、测试模式改变组合合法性。
- Git提交建议：`feat(web): add local anonymous test sessions`。
- 回滚方法：删除测试模式键和入口，不影响收藏与当前组合。

### Task 7.2 — 实现六项任务流程

- 目标：引导评审者完成指定演示任务并记录客观步骤。
- 修改文件：新增懒加载 `src/ui/test-mode/` 面板和任务 reducer。
- 实现步骤：任务依次为攻击型组合、Assist 区别、Gear、Tip、保存、导出或分享；事件由真实动作自动标记；允许跳过并记录错误步骤；不替用户填写审美结论。
- 执行命令：`npm --prefix web-customizer run test:e2e -- usability-test-mode`。
- 自动测试：六任务完成、跳过、刷新恢复、错误步骤、普通模式隔离和移动布局。
- 预期结果：完成耗时和最终组合可导出，主 UI 功能保持一致。
- 失败停止条件：任务自动伪造完成、强迫填写个人信息、遮挡核心控件。
- Git提交建议：`feat(web): add demonstrable usability tasks`。
- 回滚方法：禁用测试面板路由并保留普通定制器。

### Task 7.3 — 导出匿名测试 JSON

- 目标：本地导出结构化、可审计、无个人信息的测试结果。
- 修改文件：新增 `src/test-mode/testExport.ts`、导出按钮和模板测试。
- 实现步骤：输出 schemaVersion、匿名 session ID、任务记录、组合 ID、错误代码和治理声明；导出前显示字段预览；不自动上传。
- 执行命令：`npm --prefix web-customizer run test:unit -- testExport`。
- 自动测试：确定字段白名单、禁止字段、下载 MIME/文件名、JSON round-trip 和清除会话。
- 预期结果：匿名 JSON 可供人工汇总且明确仍待视觉评审。
- 失败停止条件：包含姓名/联系方式/任意自由文本、外部请求或不可删除记录。
- Git提交建议：`feat(web): export anonymous usability evidence`。
- 回滚方法：移除导出入口并允许用户清除本地测试键。

## Stage 8 — 全量自动测试与质量门

### Task 8.1 — 完成单元测试矩阵

- 目标：覆盖 URL、QR、PNG、library、history、attributes、errors、performance 和 test-mode。
- 修改文件：扩展 `web-customizer/tests/unit/` 和 coverage 配置。
- 实现步骤：为每个模块使用确定 fixture；共享 16 零件目录和 288 ordering；错误测试不修改真实模型。
- 执行命令：`npm --prefix web-customizer run test:unit -- --coverage`。
- 自动测试：关键领域模块分支覆盖 ≥ 90%，所有失败 fixture 确实失败。
- 预期结果：单元测试 0 failed、0 skipped critical gates。
- 失败停止条件：通过删除断言、更新错误快照或 mock 掉哈希验证获得 PASS。
- Git提交建议：`test(web): cover Phase 3B domain workflows`。
- 回滚方法：恢复实现或 fixture，不降低已批准断言。

### Task 8.2 — 完成桌面和移动 Playwright

- 目标：用真实 Chromium 验证完整演示路径。
- 修改文件：扩展 `tests/e2e/`、Playwright reporter 和本地 fixture server。
- 实现步骤：覆盖默认加载、五类切换、URL、QR、PNG、收藏、撤销重做、Assist/Gear/Tip、非法 URL、GLB 错误、重试、键盘、触摸和测试模式。
- 执行命令：`npm --prefix web-customizer run test:e2e`。
- 自动测试：桌面和 Pixel 7 项目全部通过；每个测试收集 console、pageerror、requestfailed 和 external request。
- 预期结果：四类错误计数全部为 0，失败只保留本地 trace/screenshot。
- 失败停止条件：任何断言、控制台、页面、请求或外网失败。
- Git提交建议：`test(web): validate Phase 3B desktop and mobile flows`。
- 回滚方法：最小化失败流程并修复实现，不盲目更新截图。

### Task 8.3 — 执行离线和性能预算门

- 目标：证明演示包在断网和普通移动模拟条件下可用。
- 修改文件：扩展离线 request guard、bundle analyzer、性能和内存测试。
- 实现步骤：安装依赖后断网启动；验证所有 chunk、字体、二维码、PNG 和 GLB 都来自本地；运行三次性能采样并生成中位数/p95；比较 Stage 0 基线。
- 执行命令：`npm --prefix web-customizer run test:offline` 和 `npm --prefix web-customizer run perf:check`。
- 自动测试：外网请求 0；shell/total JS、首次交互、切换和内存均在预算内。
- 预期结果：`phase3b-performance.json` 含基线、当前值、差值、环境和 PASS/FAIL。
- 失败停止条件：缺测量条件、性能回归超过预算、通过删除核心功能或放宽预算获得 PASS。
- Git提交建议：`perf(web): validate demonstrable MVP budgets`。
- 回滚方法：回退导致回归的分块或资源变更，保留测量证据。

### Task 8.4 — 运行全部回归和冻结范围审计

- 目标：确认 Phase 3B 没有改变模型、接口、基线、组合矩阵或旧预览。
- 修改文件：扩展最终 gate 脚本，不修改受保护产物。
- 实现步骤：运行治理、baseline verify、288 digest、16 GLB SHA、NSS-V1 SHA、mount matrix snapshot、Phase 3A、旧 preview 43 项和 Phase 3B 全套测试；恢复测试生成的旧截图差异。
- 执行命令：`npm --prefix web-customizer run test:phase3b`。
- 自动测试：受保护差异 0、288/288、GLB 16/16、mount mismatch 0、旧 preview 43/43。
- 预期结果：只有 Phase 3B 代码、测试、指南和报告进入提交。
- 失败停止条件：任何受保护哈希、安装矩阵、Phase 2C digest 或治理状态变化。
- Git提交建议：`test(web): run Phase 3B final quality gate`。
- 回滚方法：回退当前 Stage 的 Web 变更，不更新临时基线。

## Stage 9 — 报告与内部测试交接

### Task 9.1 — 生成 Phase 3B 正式输出

- 目标：生成机器报告、性能报告、匿名测试模板和内部指南。
- 修改文件：新增 `reports/phase3b-validation-summary.md`、`reports/validation/phase3b-summary.json`、`reports/validation/phase3b-performance.json`、`reports/validation/phase3b-usability-test-template.json`、`docs/guides/phase3b-internal-test-guide.md`。
- 实现步骤：报告测试命令、版本、哈希、预算、浏览器结果、已知限制和两行治理声明；模板只含允许的匿名字段；指南说明离线启动、六项任务、导出和数据清除。
- 执行命令：`npm --prefix web-customizer run report:phase3b`。
- 自动测试：JSON schema 可解析、Markdown 链接存在、每份正式报告包含治理声明、禁止状态词扫描为 0。
- 预期结果：五个要求输出完整且相互引用一致。
- 失败停止条件：缺证据、报告与原始结果不一致、出现公开发布/制造/安全/真实性能结论。
- Git提交建议：`docs(web): add Phase 3B validation and test guide`。
- 回滚方法：删除单个 Phase 3B 新报告并重新从通过的原始结果生成。

### Task 9.2 — 设置最终状态并提交交接

- 目标：根据自动门禁给出唯一允许的 Phase 3B 状态。
- 修改文件：仅更新 Phase 3B 汇总状态字段，不修改 Phase 2B、Phase 2C 或基线状态。
- 实现步骤：全部门禁通过时写 `Phase 3B demonstrable MVP PASS under provisional visual review`；任一门禁失败时写 `Phase 3B changes requested` 并列出阻塞项；执行最终工作区和提交范围审计。
- 执行命令：`git diff --check`、范围扫描脚本和 `git status --short -- battle-top-designer`。
- 自动测试：状态精确匹配允许值；人工视觉评审仍 open；受保护差异 0；正式报告治理声明完整。
- 预期结果：创建独立报告提交并交付内部测试，不进入公开发布流程。
- 失败停止条件：状态升级越权、工作区混入无关文件、未解决自动测试失败或人工评审被写成通过。
- Git提交建议：`chore(web): hand off Phase 3B demonstrable MVP`。
- 回滚方法：撤回 Phase 3B 状态/报告提交，保留最后一个通过的 Stage 提交和临时基线。

## 纵向切片执行顺序

实施必须按以下顺序，每一步通过自身质量门后才能继续：

1. URL 分享和恢复；
2. PNG 组合卡片；
3. 收藏和最近使用；
4. 撤销重做；
5. 性能优化；
6. 内部测试模式；
7. 全量质量门。

Stage 编号用于能力分组，实际提交顺序以上述纵向切片为准：Stage 0 后先完成 Task 2.1–2.4，再完成 Stage 3、Task 4.1，然后完成 Stage 1，最后完成 Stage 7 和 Stage 8–9。Stage 4 其余交互、Stage 5 属性和 Stage 6 错误处理在其依赖的纵向切片内就近完成，禁止一次性铺开全部功能后再测试。

## 最终范围检查

- 不修改 16 个零件的可见几何、材质意义或 GLB 源文件；
- 不修改 NSS-V1、任何安装点或已批准的永久安装变换；
- 不修改 `v0.2.0-rc1-technical-baseline` 和 Phase 2C 组合矩阵结果；
- 不运行 Blender，不重新生成模型；
- 二维码、PNG、字体、chunk、测试和分析全部本地运行；
- 不新增登录、云数据库、支付、社交、遥测或服务器端用户数据；
- 不收集姓名、联系方式或其他不必要个人信息；
- 不关闭真实人工视觉评审；
- 不产生制造、高速战斗、安全认证或真实战斗性能结论；
- 不把 Phase 3B 描述为正式公开发布或全部产品完成。
