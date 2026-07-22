# NSS 建模器与 RIPTOP Arena 接入实施计划

对应设计：`docs/superpowers/specs/2026-07-22-nss-customizer-arena-integration-design.md`

## 执行边界

- 从提交 `e3efa765d0c5ab3ed3c4c2f99e57a9b131e971db` 创建独立 `codex/nss-arena-integration` 分支和隔离 worktree；不得直接在当前脏 `main` 工作区实施。
- 不修改 16 个正式 GLB、NSS-V1 mount、Blender 生成器、建模器概念属性、已冻结视觉身份资源或历史 Stage 7/8 evidence。
- 不迁移账号、云端库存、旧零件升级或商店经济。
- 每个阶段仅在前一阶段门禁通过后开始；失败时保留证据并停止扩大修改范围。

## 阶段 0：建立隔离实施现场与保护快照

### 文件

- 不修改产品文件。
- 在隔离 worktree 外记录当前基线信息，证据文件路径在实施开始时明确批准。

### 工作

1. 确认基线提交包含已批准设计。
2. 创建 `codex/nss-arena-integration` 隔离分支和 worktree。
3. 确认隔离 worktree 暂存区和工作区为空。
4. 记录 16 个正式零件 GLB 的逐文件 SHA-256、文件数和总字节。
5. 记录 NSS 零件规格、历史 Stage 7/8 evidence 和根用户工作区摘要。
6. 记录根游戏与 Web Customizer 当前 Node、npm、TypeScript 和 Three.js 版本。

### 验证

- 新 worktree HEAD 等于批准基线。
- 正式 GLB 为 16 个且哈希清单完整。
- 根用户工作区在创建前后无漂移。
- 新 worktree staging 为空。

## 阶段 1：建立共享 NSS 数据契约

### 文件

- 新增 `battle-top-designer/shared/nss/loadout.schema.json`
- 新增 `battle-top-designer/shared/nss/parts.catalog.json`
- 新增 `battle-top-designer/shared/nss/battle-parts.schema.json`
- 修改 `battle-top-designer/web-customizer/scripts/build-product-catalog.mjs`
- 修改 `battle-top-designer/web-customizer/src/domain.ts`
- 新增 `battle-top-designer/web-customizer/tests/unit/nssSharedContract.test.ts`
- 新增根游戏 `src/nss/types.ts`
- 新增根游戏 `src/nss/catalog.ts`
- 新增根游戏 `src/nss/loadout.ts`
- 新增根游戏测试文件，路径服从根项目现有测试约定。

### 工作

1. 将 `NssFamily`、`NssCombination` 和 `NSSBattleLoadoutV1` 的字段约束写入共享 JSON Schema。
2. 扩展现有 catalog 生成器，使 Web Customizer 的生成目录和共享目录由同一批受保护零件规格确定性生成。
3. 保持 `comboId` 的现有 `nss-p2c-0001` 至 `nss-p2c-0288` 排序算法不变。
4. 在根游戏实现类型安全的目录读取、组合编号双向映射和严格载荷验证。
5. Web Customizer 继续保留现有 API，但由共享目录验证其 16 个零件和 288 个组合未漂移。
6. 服务端暂不接入；本阶段只固定可被三个消费者共同验证的数据形状。

### 验证

- 16 个零件的 ID、family、`NSS-V1` 和规格哈希全部匹配。
- 288 个组合编号正向、反向映射一一对应。
- 缺字段、多字段、family 错配、未知 ID、错误版本和错误接口全部拒绝。
- Web Customizer 现有组合 URL 单元测试保持通过。
- catalog 生成两次输出字节完全一致。
- `git diff --check` 通过。

## 阶段 2：建立独立 NSS 战斗数值目录

### 文件

- 新增 `battle-top-designer/shared/nss/battle-parts.json`
- 新增根游戏 `src/nss/battleCatalog.ts`
- 新增根游戏 `src/nss/buildStats.ts`
- 修改 `src/gameplay/build.ts`
- 修改 `src/data/parts.ts`，仅增加明确的 legacy/NSS 联合类型边界。
- 新增 `src/nss/buildStats.test.ts` 或根项目等价测试文件。

### 工作

1. 为 16 个 NSS 零件定义 `attack / defense / stamina / mobility / burstResist / weight`，仅 Blade 定义碰撞半径来源。
2. 建立 `PlayerBuild = legacy | nss-v1`，不重写旧 `BuildSelection`。
3. 实现纯函数 `buildNssBattleStats(loadout, globalUpgrades)`。
4. 五层基础数值求和后叠加全局攻击、防御和持久升级。
5. 明确忽略旧 `partUpgrades`，并通过测试证明其不能影响 NSS 结果。
6. 复用现有 `BattleStats` 派生规则；不新增技能、随机词条或复杂摩擦曲线。
7. 为目录生成稳定 SHA-256，供客户端和服务端版本一致性检查。

### 验证

- 16 个数值条目与共享零件目录一一对应，无遗漏和孤儿条目。
- 288 种组合均产生有限、非负、可战斗的属性。
- 同一输入重复计算结果完全一致。
- 全局升级只影响对应全局维度。
- 任意旧零件升级输入不改变 NSS 输出。
- 数值目录不修改建模器概念属性和零件规格。
- 根游戏 TypeScript、数值单元测试和 `git diff --check` 通过。

## 阶段 3：实现建模页到竞技场的 URL 交接

### 文件

- 修改 `battle-top-designer/web-customizer/src/App.tsx`
- 新增 `battle-top-designer/web-customizer/src/integration/arenaLink.ts`
- 修改 `battle-top-designer/web-customizer/src/i18n/zhCN.ts`，若中文分支合并策略要求。
- 新增 `battle-top-designer/web-customizer/tests/unit/arenaLink.test.ts`
- 修改 `battle-top-designer/web-customizer/tests/e2e/customizer.spec.ts`，仅在后续浏览器专项阶段启用。

### 工作

1. 新增“进入竞技场”主操作。
2. 使用当前组合的稳定 `comboId` 生成 `/arena/?combo=<id>&loadoutVersion=1`。
3. 开发环境从 `VITE_ARENA_URL` 读取竞技场基础地址；生产环境使用同源相对路由。
4. 不传递中文名称、战斗属性、GLB 路径、镜头、爆炸状态或身份开关。
5. 保留现有分享 URL 行为，两类链接分别由独立函数生成。

### 验证

- 288 种组合都生成唯一且可逆的 Arena URL。
- 配置开发地址与相对生产地址均正确。
- URL 不包含派生属性或展示状态。
- 现有分享、二维码、导入导出和本地库测试无回归。
- Web Customizer 单元、TypeScript、catalog、build 和 `git diff --check` 通过。

## 阶段 4：实现 NSS 模型缓存与装配器

### 文件

- 新增 `src/nss/modelCache.ts`
- 新增 `src/nss/assembler.ts`
- 新增 `src/nss/battleTopVisual.ts`
- 新增 `src/nss/modelPaths.ts`
- 新增相应非浏览器 Three.js 单元测试。
- 修改根 `vite.config.ts`，仅配置共享 GLB 的稳定资源路径。

### 工作

1. 使用 `GLTFLoader` 预加载五个零件；资源路径由零件 ID 和统一资源根确定。
2. 缓存原始 GLTF，每个战斗实例安全 clone 场景，不重复网络加载。
3. 从场景读取 `MOUNT_<partId>_TOP/BOTTOM`，验证 `interface_id === 'NSS-V1'`。
4. 移植建模器已验证的矩阵装配顺序：Core → Blade → Assist → Gear → Tip。
5. 装配完成后只在视觉根组应用一个固定单位比例。
6. 暴露 Blade 和整体根组的稳定引用，不让消费者依赖 GLB 内部 Mesh 名称。
7. 定义实例销毁与共享缓存的所有权：销毁实例不得 dispose 仍由缓存拥有的资源。
8. 模型缺失、mount 缺失、接口错误和 family 错配返回结构化错误。

### 验证

- 默认组合五层装配矩阵与 Web Customizer 结果等价。
- 重复加载命中缓存，实例之间对象变换互不影响。
- 销毁一个实例不破坏其他实例。
- Blade 引用可独立旋转，其余层保持装配关系。
- 原始 GLB Geometry、Material、Texture 和节点数据零修改。
- 正式 16 个 GLB SHA-256 与阶段 0 完全一致。
- 资源错误均在发射前终止。

## 阶段 5：接入单机 TopEntity 垂直切片

### 文件

- 修改 `src/gameplay/top.ts`
- 修改 `src/gameplay/build.ts`
- 修改 `src/app/game.ts`，仅增加状态编排调用。
- 修改 `src/ui/garage.ts`
- 新增 `src/nss/loadoutController.ts`
- 新增或修改单机相关测试。

### 工作

1. `TopEntity` 接受 `PlayerBuild`，legacy 继续使用程序化模型，NSS 使用 `BattleTopVisual`。
2. NSS 视觉根组复用现有位置、倾斜、受击和销毁生命周期。
3. Blade 子组接入现有高速旋转表现；物理继续使用目录提供的简化碰撞半径和重量。
4. 先只开放批准的默认 NSS 组合作为垂直切片。
5. 车库增加模型加载、装配、属性摘要和错误状态。
6. 模型未 ready 时禁用发射；失败时停留车库。
7. `Game` 只调用 `loadoutController`，不得包含 GLTF、mount 或目录解析细节。
8. NSS 模式应用全局升级，忽略旧零件升级；legacy 行为保持不变。

### 验证

- 默认 NSS 组合完成车库、发射、移动、碰撞、受击、胜负、返回和重开。
- Tip 不穿场地，主体不发生尺度跳变。
- NSS 和 legacy 分别运行，不互相污染存档。
- 重开多次无模型、材质或纹理实例持续增长。
- 根游戏既有伤害、战斗物理和服务器测试通过。
- 根 TypeScript、build 和 `git diff --check` 通过。

## 阶段 6：扩展至 288 组合与完整车库闭环

### 文件

- 修改 `src/nss/loadoutController.ts`
- 修改 `src/ui/garage.ts`
- 修改 `src/app/game.ts`，仅接入 URL 初始状态与返回跳转。
- 修改 `src/app/progression.ts`，仅增加版本化的最近 NSS 组合存储。
- 新增 URL、持久化、装配矩阵和资源组合测试。

### 工作

1. 解析 `combo` 和 `loadoutVersion`，生成严格的 `NSSBattleLoadoutV1`。
2. 优先使用合法 URL，其次最近 NSS 组合，再次默认 NSS 组合。
3. 非法 URL 回退默认组合并显示提示，禁止静默采用部分字段。
4. 在车库显示五个零件、正式模型、属性摘要、“返回定制”和“进入竞技场”。
5. 返回定制时保留同一个 `comboId`。
6. 遍历验证 288 种组合的资源存在性、装配和属性计算。
7. 根据当前零件自动启用已批准身份视觉，不从 URL 读取身份开关。

### 验证

- Customizer、Arena URL、Garage、TopEntity 和属性计算的组合 ID 完全一致。
- 刷新、返回和再次进入不丢失组合。
- 288 种组合均能在加载门禁中完成装配。
- 非法、重复、未知或错误版本参数均产生确定回退。
- legacy 存档未被改写。
- 正式 GLB 与阶段 0 哈希完全一致。

## 阶段 7：升级联机协议 V2

### 文件

- 修改 `src/network/protocol.ts`
- 修改 `src/network/networkClient.ts`
- 修改 `server/match-server.mjs`
- 修改 `scripts/test-match-server.mjs`
- 修改 `src/app/game.ts`，仅编排双方模型 ready 和比赛开始。
- 新增服务端 NSS 目录加载与验证模块。
- 新增协议解析、非法载荷、版本不一致和双端属性一致性测试。

### 工作

1. 将协议版本升级为 2，并增加 `legacy | nss-v1` 联合载荷。
2. 服务端从共享目录读取合法零件、组合编号和数值目录哈希。
3. `JOIN_QUEUE` 验证 `comboId` 与五个 ID 一致，不接受任何派生战斗属性。
4. `MATCHED` 返回对手 NSS 载荷和目录版本。
5. 双方加载自己与对手模型后才发送 `CLIENT_READY`。
6. 保留 ready timeout、断线和房间清理终态。
7. 协议 V1 客户端收到明确版本错误，不与 V2 房间混配。
8. Host 权威战斗逻辑保持不变，Guest 不重新随机计算回合结果。

### 验证

- 合法 NSS 双端匹配并完成一局。
- 未知 ID、family 错配、combo 不一致、目录版本不一致和伪造属性全部被拒绝。
- 一端模型加载失败时比赛不开始，双方收到明确终态。
- 断线、ready timeout、重复 ready 和重连边界测试通过。
- 相同组合在双方产生相同基础属性和目录哈希。
- `npm run test:server`、协议单元、根 build 和 `git diff --check` 通过。

## 阶段 8：统一静态站点发布

### 文件

- 新增根级统一构建脚本，具体路径按现有 `scripts/` 规范确定。
- 修改根 `package.json`，仅增加统一构建命令。
- 修改两个 Vite 配置的生产 base/资源根。
- 新增统一站点入口和静态发布验证脚本。
- 更新部署与本地运行文档。

### 工作

1. 分别构建 Web Customizer 和 Arena。
2. 组装 `dist/site/customizer/` 与 `dist/site/arena/`。
3. 将 16 个正式 GLB 发布到唯一的 `dist/site/assets/nss/parts/`。
4. 检查两个应用均引用共享 GLB 路径，不产生第二份模型副本。
5. 生成统一首页，提供“定制陀螺”和“进入竞技场”入口。
6. 验证相对路径可在静态服务器和生产子路径下工作。

### 验证

- 两个应用构建成功。
- 发布目录只包含 16 个正式零件 GLB 副本。
- `/customizer/` 到 `/arena/` 再返回的组合编号不变。
- 直接刷新两个子路由均可加载。
- 发布模型哈希与阶段 0 完全一致。
- 无开发端口或本机绝对路径进入生产 bundle。

## 阶段 9：专项浏览器验证与最终质量门禁

### 工作

1. 在获得明确授权后运行 Customizer → Arena 的专项浏览器流程。
2. 验证默认组合和至少覆盖所有 16 个零件的代表组合。
3. 验证 288 组合的非视觉机器装配矩阵；人工视觉不要求逐个检查 288 组合。
4. 验证桌面和移动端车库、发射、完整单局、返回定制和刷新恢复。
5. 使用两个独立浏览器上下文验证联机双方模型和属性一致。
6. 运行根项目单元、服务器测试、TypeScript 和生产构建。
7. 运行 Web Customizer 单元、TypeScript、catalog、生产构建和既有受保护证据检查。
8. 重新计算正式 GLB、NSS 规格和历史 evidence 保护摘要。
9. 专项全部通过后，再申请运行一次新的正式全量 Stage 8；不得复用历史 PASS。

### 最终成功标准

- 建模器当前组合、竞技场车库组合、玩家战斗视觉、战斗属性输入和联机载荷完全一致。
- 288 种组合全部合法、确定且可装配。
- 单机和联机均可完成完整战斗生命周期。
- 正式 16 个 GLB、NSS-V1、建模规格和历史 evidence 零变化。
- legacy 存档和旧战斗路径保持可用。
- 统一站点 `/customizer/` 与 `/arena/` 可独立刷新并相互跳转。
- 所有专项验证通过，最终全量质量门禁形成新的独立 evidence。

## 推荐提交边界

1. `feat(nss): add shared loadout contract`
2. `feat(nss): add deterministic battle catalog`
3. `feat(customizer): link combinations to arena`
4. `feat(arena): load and assemble NSS models`
5. `feat(arena): battle with NSS loadouts`
6. `feat(arena): support all NSS combinations`
7. `feat(network): validate NSS online loadouts`
8. `build: assemble unified NSS site`

每次提交只包含对应阶段文件。不得使用 `git add .`、`git add -A` 或 `git commit -am`，不得混入当前用户工作区已有修改。
