# Nova Spin System Phase 2B Remaining Modules Quality Gate 实施计划

状态：待批准，禁止实施

日期：2026-07-15

依据：`docs/superpowers/specs/2026-07-15-phase-2b-remaining-modules-quality-gate-design.md`

## 1. 目标、边界与执行原则

本计划只实现 Phase 2B 已批准的八个剩余模块、八个单变量夹具和四个代表性组合。NSS-V1 保持冻结，不新增或修改 Main Blade，不运行 288 组合，不实现完整定制器，不将自动验证描述为物理、制造、安全或法律证明。

执行原则：

1. 每个任务只完成一个可验证变化。
2. 每个 Stage 的全部停止条件清零后才允许创建该 Stage 提交。
3. 修改共享生成器后立即重跑 Phase 2A 的 13 GLB 批准基线和 Storm Attack 回归。
4. 未批准 `SEMANTIC_REGRESSION` 为硬失败；`BINARY_DRIFT` 未经人工确认前阻止继续。
5. 未解决 `CONTACT_REVIEW` 阻止 Stage 通过；所有实际复审必须保存处理人、日期、依据和结论。
6. 所有命令必须实际执行并保存报告；不得用“代码已编写”替代运行证据。
7. 每个 Stage 独立提交；不暂存项目根目录中与本计划无关的现有修改。

固定 Blender 命令前缀：

```powershell
$Blender = "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
```

## 2. Stage 0：环境与 Phase 2A 批准基线

### Task 0.1：扩展环境只读预检

- **目标：** 确认 Blender 4.5.11、glTF Validator、Node、Python、Playwright、Three.js 许可证和 Phase 2A 人工批准记录可用。
- **修改文件：** `scripts/check_phase2a_environment.ps1`，只增加 Phase 2B 所需的只读检查和报告字段。
- **新增文件：** `reports/validation/phase2b-environment.json`（运行产物）。
- **前置条件：** 提交 `06ef7d7880de1e6b1845995856082b375714c722` 可读；工作区中的无关修改已识别但未暂存。
- **具体实现步骤：** 校验工具版本、`phase2a-visual-review-disposition.json` 的 APPROVED 状态、Three.js VERSION/LICENSE、现有 13 个基线 GLB 和四枚 Blade 视觉输出；禁止写入模型。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/check_phase2a_environment.ps1 -Scope Phase2B`。
- **自动测试：** 所有路径存在；版本精确匹配；批准记录 JSON 可解析；Blender 进程未启动。
- **预期输出：** `phase2b-environment.json` 为 PASS，列出 Blender 4.5.11、Validator 2.0.0-dev.3.10、Three.js 0.185.1 和 Playwright 1.61.1。
- **失败停止条件：** 工具版本漂移、批准记录缺失、许可证缺失、13 个 GLB 不齐或脚本启动 Blender 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 0 提交。
- **回滚或恢复方法：** `git restore -- scripts/check_phase2a_environment.ps1`，删除运行产物时只处理其明确路径。

### Task 0.2：建立 13 GLB 双指纹批准基线

- **目标：** 冻结 Phase 2A 已批准输出，供所有 Phase 2B 共享生成器修改回归。
- **修改文件：** `scripts/verify_phase2a_baseline.py`。
- **新增文件：** `docs/baselines/v0.2.0-phase2a-approved.json`、`reports/validation/phase2b-baseline-capture.json`。
- **前置条件：** Task 0.1 通过；不得重新生成任何 GLB。
- **具体实现步骤：** 移除脚本中固定 6 GLB 列表的限制，改为从 manifest 的 artifact 路径读取；增加互斥的显式 capture/verify 模式；对当前 8 个零件、4 个 `assembly_phase2a_*` 和 `assembly_storm_attack` 保存 raw SHA-256、canonical semantic record 和 semantic fingerprint；记录来源提交 `c8e73436906edb85c07b44b6adfc433172a1b9c2`。
- **实际执行命令：** `python scripts/verify_phase2a_baseline.py --manifest docs/baselines/v0.2.0-phase2a-approved.json --blender "$Blender" --capture --report reports/validation/phase2b-baseline-capture.json`；随后使用 `--verify-only` 再核验一次。
- **自动测试：** manifest 恰含 13 个唯一 GLB；raw 和 semantic 字段均非空；捕获后立即核验 PASS。
- **预期输出：** 基线报告 PASS，二进制漂移和语义回归均为 0。
- **失败停止条件：** 数量不是 13、重复路径、任一指纹为空或捕获与复核不一致时停止。
- **Git提交建议：** 通过后创建 Stage 0 提交 `chore: establish Phase 2B approved baseline gate`。
- **回滚或恢复方法：** 恢复 Stage 0 起点的环境脚本和 `verify_phase2a_baseline.py`，逐个处理新增 manifest 和报告；不得改动基线 GLB。

## 3. Stage 1：规格、Schema 与夹具语义

### Task 1.1：增加 Phase 2B 严格枚举

- **目标：** 将五种新 `profile_family` 和三种 Tip `contact_profile` 限定为显式枚举。
- **修改文件：** `schemas/part.schema.json`、`scripts/validate_specs.py`。
- **新增文件：** 无。
- **前置条件：** Stage 0 通过；NSS-V1 不变。
- **具体实现步骤：** 增加 `void_falcon_split_arc`、`guard_cushion_ring`、`air_truss_windows`、`medium_chevron_rib`、`high_tower_buttress` 与 `ball`、`needle`、`taper`；增加负向自测，拒绝拼写错误和未知值。
- **实际执行命令：** `python scripts/validate_specs.py --self-test`。
- **自动测试：** 新枚举合法；未知枚举硬失败；Phase 2A 全部规格仍通过。
- **预期输出：** 自测 PASS，不启动 Blender，不生成 GLB。
- **失败停止条件：** Schema 放宽为任意字符串、Phase 2A 回归失败或 NSS-V1 diff 非空时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 1 提交。
- **回滚或恢复方法：** `git restore -- schemas/part.schema.json scripts/validate_specs.py`。

### Task 1.2：新增八份零件 JSON

- **目标：** 将设计文档中的八个包络、几何语言、材质和安装点表达为数据。
- **修改文件：** 无。
- **新增文件：** `specs/parts/core_void_falcon.json`、`assist_guard.json`、`assist_air.json`、`gear_medium.json`、`gear_high.json`、`tip_ball_defense.json`、`tip_needle_stamina.json`、`tip_taper_balance.json`。
- **前置条件：** Task 1.1 通过；现有材料 ID 可满足设计。
- **具体实现步骤：** 写入设计批准的初始包络、profile/contact family、剖面或结构参数、NSS-V1 角色、零件限定安装点、原创性规则和 concept-only 工程状态；不得把参数写入 Blender 脚本。
- **实际执行命令：** `python scripts/validate_specs.py --scope phase2b_parts`。
- **自动测试：** 恰有 8 个新 ID；接口均为 NSS-V1；材料引用存在；尺寸、接触半径和分段数满足 Schema；无参考品牌字段。
- **预期输出：** `reports/validation/spec-phase2b-parts.json` 为 PASS，无 Blender 进程。
- **失败停止条件：** 缺少任一零件、参数需要代码硬编码、引用未知材料或接口字段变化时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 1 提交。
- **回滚或恢复方法：** 对八个新增文件逐个明确路径处理，不批量删除目录。

### Task 1.3：新增十二套装配规格并关闭规格门

- **目标：** 建立 8 个单变量夹具和 4 个非官方代表性组合，严格阻止扩展为 288。
- **修改文件：** `schemas/assembly.schema.json`、`specs/assemblies.json`、`scripts/validate_specs.py`。
- **新增文件：** `reports/validation/spec-phase2b.json`（运行产物）。
- **前置条件：** Task 1.2 通过。
- **具体实现步骤：** 写入设计文档第 6、7 节的精确组合；验证 purpose、official_configuration、baseline_fixture 和 variable_part_type；增加总数为 12 的范围断言。
- **实际执行命令：** `python scripts/validate_specs.py --self-test`；`python scripts/validate_specs.py --scope phase2b`。
- **自动测试：** 新装配数恰为 12；8 个夹具一次只替换一个零件；4 个代表性组合精确匹配设计；全部 official=false。
- **预期输出：** `spec-phase2b.json` 为 PASS，未生成模型。
- **失败停止条件：** 数量错误、组合语义漂移、出现范围外零件、官方配置误标或命令启动 Blender 时停止。
- **Git提交建议：** 通过后创建 Stage 1 提交 `feat: define Phase 2B remaining module specs`。
- **回滚或恢复方法：** `git restore -- schemas/assembly.schema.json specs/assemblies.json scripts/validate_specs.py`，八份零件 JSON 逐个处理。

## 4. Stage 2：Void Falcon Core 质量门

### Task 2.1：实现 split-arc Core 独立生成器

- **目标：** 生成两组相位错开的闭合弧骨架和中央负空间，不形成动物徽章。
- **修改文件：** `blender/lib/geometry.py`。
- **新增文件：** 无。
- **前置条件：** Stage 1 通过；规格中的 `void_falcon_split_arc` 参数完整。
- **具体实现步骤：** 增加独立 dispatch 和闭合弧段构造；不调用 Solar Wolf 的节点调制函数伪装新轮廓；所有局部尺寸来自 JSON。
- **实际执行命令：** `python -m py_compile blender/lib/geometry.py`；`& $Blender --background --python blender/generate_parts.py -- --part core_void_falcon`。
- **自动测试：** AST 调用关系证明未复用 Solar 节点轮廓；渲染实体闭合；对象和 mesh data 使用 `GEO_`。
- **预期输出：** `core_void_falcon.glb` 与对应 blend 非空，轮廓具有真实负空间。
- **失败停止条件：** 负空间靠纹理伪造、出现动物图案、非流形或参数硬编码时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 2 提交。
- **回滚或恢复方法：** `git restore -- blender/lib/geometry.py`，恢复 Stage 1 后重新运行规格门。

### Task 2.2：验证 Core 代理、几何、GLB 与单变量夹具

- **目标：** 证明 Core 可导出、可装配且没有意外重叠。
- **修改文件：** `blender/lib/collision.py`、`blender/validate_collision_proxies.py`、`scripts/test_all.ps1`（仅在现有通用逻辑不足时最小修改）。
- **新增文件：** Core collider/geometry/Validator 报告、`assembly_phase2b_core_void_falcon.glb` 及装配报告。
- **前置条件：** Task 2.1 生成成功。
- **具体实现步骤：** 生成闭合 `COLLIDER_core_void_falcon`；验证 export_exclude；生成单变量夹具；执行接口与 AABB/BVH/体素流程。
- **实际执行命令：** Blender collider、geometry、assembly validator 命令分别以 `core_void_falcon` 和 `assembly_phase2b_core_void_falcon` 为目标；对两个 GLB 运行 `scripts/validate_gltf.mjs`。
- **自动测试：** 非流形、重复点、零面积面均为 0；GLB 重导入无 COLLIDER；装配 PASS、碰撞 0、CONTACT_REVIEW 0；Validator 0/0。
- **预期输出：** Core 和夹具全部报告 PASS。
- **失败停止条件：** 合法接口被判碰撞、代理未闭合、GLB 含代理或任一 Validator issue 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 2 提交。
- **回滚或恢复方法：** 恢复本任务改动的明确文件，保留失败报告用于诊断。

### Task 2.3：Core 视觉、预览与批准基线回归

- **目标：** 输出 Core 视觉证据并证明共享生成器未破坏 Phase 2A。
- **修改文件：** `blender/render_catalog.py`、`scripts/make_contact_sheets.py`、`preview/index.html`、`preview/main.js`、`preview/package.json`。
- **新增文件：** `tests/browser/phase2b-preview.spec.mjs`、Core 四视图、contact sheet、预览截图、`stage2b-core-regression.json`。
- **前置条件：** Task 2.2 通过。
- **具体实现步骤：** 增加 Core 预览目标；渲染 top/45°/side/silhouette；运行 Playwright；核验 13 GLB 批准基线和 Storm Attack。
- **实际执行命令：** Blender render 目标 `core_void_falcon`；`python scripts/make_contact_sheets.py --target core_void_falcon`；`npm.cmd --prefix preview test`；baseline verify-only 命令。
- **自动测试：** 图像尺寸正确；浏览器错误通道全 0；BINARY_DRIFT、SEMANTIC_REGRESSION 和未解决 CONTACT_REVIEW 均为 0。
- **预期输出：** Stage 2 质量门 PASS。
- **失败停止条件：** 视觉文件缺失、浏览器错误、任何回归阻断或轮廓无法与 Solar Wolf 区分时停止并等待人工判断。
- **Git提交建议：** 通过后创建 Stage 2 提交 `feat: add Void Falcon core quality slice`。
- **回滚或恢复方法：** 按 Stage 2 起点提交恢复明确文件，并重新验证 Stage 1。

## 5. Stage 3：Guard 与 Air Assist 质量门

### Task 3.1：实现 Guard Cushion Ring

- **目标：** 生成连续圆滑外带、十二段缓冲肩和内侧承力环。
- **修改文件：** `blender/lib/geometry.py`。
- **新增文件：** 无。
- **前置条件：** Stage 2 通过；`assist_guard.json` 已验证。
- **具体实现步骤：** 增加 `guard_cushion_ring` 独立 dispatch；使用连续曲率外轮廓和独立内环，不调用 Heavy Assist 的通用正弦节点调制。
- **实际执行命令：** Python compile；Blender 生成 `assist_guard`。
- **自动测试：** 外轮廓无尖齿；十二段节奏存在；AST 不调用 Heavy 轮廓路径；网格闭合。
- **预期输出：** Guard GLB 和 blend 非空。
- **失败停止条件：** 只是 Heavy 的半径、颜色或正弦幅度变化，或出现尖锐外伸时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 3 提交。
- **回滚或恢复方法：** 恢复 `geometry.py` 至 Stage 2 提交。

### Task 3.2：实现 Air Truss Windows

- **目标：** 生成六个真实窗口、六段闭合弧桥和细辐条。
- **修改文件：** `blender/lib/geometry.py`。
- **新增文件：** 无。
- **前置条件：** Task 3.1 可回归；`assist_air.json` 已验证。
- **具体实现步骤：** 增加 `air_truss_windows` 独立 dispatch；使用闭合分件创建窗口和辐条；不对渲染网格使用布尔运算。
- **实际执行命令：** Python compile；Blender 生成 `assist_air`。
- **自动测试：** 六窗口全部贯通；每个分件闭合；无非流形孔边；与 Guard/Heavy 的对象层级和轮廓不同。
- **预期输出：** Air GLB 和 blend 非空。
- **失败停止条件：** 窗口为贴图或假凹槽、使用布尔残面、细辐条断开或退化时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 3 提交。
- **回滚或恢复方法：** 恢复 Task 3.2 的明确 diff，保留 Guard 已验证状态。

### Task 3.3：Assist 代理、单变量夹具与 GLB 验证

- **目标：** 验证两枚 Assist 与 Storm Attack 基准的装配兼容性。
- **修改文件：** 仅在通用逻辑不足时最小修改 `blender/lib/collision.py`、`scripts/test_all.ps1`。
- **新增文件：** 两枚 Assist GLB、两个单变量夹具 GLB 及 collider/geometry/assembly/Validator 报告。
- **前置条件：** Task 3.1、3.2 均生成成功。
- **具体实现步骤：** 为 Guard/Air 建立闭合代理；验证导出排除；生成 `assembly_phase2b_assist_guard` 和 `assembly_phase2b_assist_air`；执行全部碰撞阶段。
- **实际执行命令：** 对两个 part 和两个 assembly 分别运行 Blender validator 与 glTF Validator。
- **自动测试：** 四个 GLB Validator 0/0；两个装配 PASS；碰撞 0；未解决 CONTACT_REVIEW 0；GLB 无 COLLIDER。
- **预期输出：** Assist 几何和装配质量门 PASS。
- **失败停止条件：** 任一代理错误、接口误判、意外重叠或 GLB issue 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 3 提交。
- **回滚或恢复方法：** 恢复通用碰撞改动，逐个保留失败报告。

### Task 3.4：Assist 同族视觉、预览与回归

- **目标：** 证明 Heavy、Guard、Air 在轮廓、负空间和视觉重量上可区分。
- **修改文件：** `blender/render_catalog.py`、`scripts/make_contact_sheets.py`、preview 文件和 `tests/browser/phase2b-preview.spec.mjs`。
- **新增文件：** `scripts/analyze_phase2b_visuals.py`、两款单件视觉、contact sheet、`all_assists_comparison.png`、剪影指标和预览截图。
- **前置条件：** Task 3.3 通过。
- **具体实现步骤：** 使用统一正交相机输出 2048×1024 对比；预览增加 Guard/Air；重跑 13 GLB 基线与 Storm Attack。
- **实际执行命令：** Blender render 两目标；contact sheet scope；`python scripts/analyze_phase2b_visuals.py --family assist`；Playwright；baseline verify-only。
- **自动测试：** 视觉尺寸正确；三款顺序固定；指标带免责声明；浏览器错误 0；全部回归无阻断。
- **预期输出：** Stage 3 质量门 PASS。
- **失败停止条件：** 两款看起来只是 Heavy 改色/变薄、视觉条件不一致或任何回归失败时停止。
- **Git提交建议：** 通过后创建 Stage 3 提交 `feat: add Guard and Air assist quality slices`。
- **回滚或恢复方法：** 按 Stage 3 起点提交恢复本阶段文件并重跑 Stage 2。

## 6. Stage 4：Medium 与 High Gear 质量门

### Task 4.1：实现 Medium Chevron Rib

- **目标：** 生成十二组矮 V 形加强肋、中段收腰和 5.0 mm 高度轮廓。
- **修改文件：** `blender/lib/geometry.py`。
- **新增文件：** 无。
- **前置条件：** Stage 3 通过；Medium 规格有效。
- **具体实现步骤：** 增加 `medium_chevron_rib` 独立生成分支；轴向剖面和周向 V 肋均来自 JSON。
- **实际执行命令：** Python compile；Blender 生成 `gear_medium`。
- **自动测试：** V 肋数量 12；存在中段收腰；不是 Low Gear 的 Z 缩放；网格闭合。
- **预期输出：** Medium Gear GLB 和 blend 非空。
- **失败停止条件：** 只改变高度、复用 Low 齿形或出现退化面时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 4 提交。
- **回滚或恢复方法：** 恢复 `geometry.py` 至 Stage 3 提交。

### Task 4.2：实现 High Tower Buttress

- **目标：** 生成八组纵向扶壁、双层台肩和 6.0 mm 高位轮廓。
- **修改文件：** `blender/lib/geometry.py`。
- **新增文件：** 无。
- **前置条件：** Task 4.1 可回归；High 规格有效。
- **具体实现步骤：** 增加 `high_tower_buttress` 独立分支；不得调用 Medium V 肋函数；保持 NSS-V1 安装面不变。
- **实际执行命令：** Python compile；Blender 生成 `gear_high`。
- **自动测试：** 扶壁数量 8；双台肩可检测；与 Low/Medium 侧面签名不同；网格闭合。
- **预期输出：** High Gear GLB 和 blend 非空。
- **失败停止条件：** 仅拉高 Medium、安装面漂移或侧面轮廓无法区分时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 4 提交。
- **回滚或恢复方法：** 恢复 Task 4.2 的明确 diff，保留 Medium 已验证结果。

### Task 4.3：Gear 代理、夹具与 GLB 验证

- **目标：** 证明 Medium/High 与基准装配兼容，且高位结构不穿模。
- **修改文件：** 通用碰撞或测试脚本仅在需要时最小修改。
- **新增文件：** 两 Gear、两个单变量夹具 GLB 及验证报告。
- **前置条件：** Task 4.1、4.2 成功。
- **具体实现步骤：** 建立两个闭合代理；生成 `assembly_phase2b_gear_medium`、`assembly_phase2b_gear_high`；检查总高度、轴线和外径。
- **实际执行命令：** 两 part、两 assembly 的 Blender validator 与 glTF Validator 命令。
- **自动测试：** Validator 0/0；装配 PASS；轴线误差在现有阈值内；碰撞和未解决接触均为 0。
- **预期输出：** Gear 几何与装配报告 PASS。
- **失败停止条件：** 高位结构与相邻件重叠、悬空间隙异常、尺寸异常或接口漂移时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 4 提交。
- **回滚或恢复方法：** 恢复本任务通用代码并保留失败产物。

### Task 4.4：Gear 侧面比较、预览与回归

- **目标：** 以统一侧面正交条件证明 Low、Medium、High 不只是高度变化。
- **修改文件：** render/contact/analyze 脚本、preview 数据和浏览器测试。
- **新增文件：** 两款单件视觉、contact sheet、`all_gears_comparison.png`、指标和预览截图。
- **前置条件：** Task 4.3 通过。
- **具体实现步骤：** 对三 Gear 输出材质侧视和 side_silhouette；预览增加 Medium/High；执行批准基线和 Storm 回归。
- **实际执行命令：** Gear render；`analyze_phase2b_visuals.py --family gear`；Playwright；baseline verify-only。
- **自动测试：** 对比图 2048×1024；同一相机/比例/光照；三款侧面签名不相同；回归阻断数 0。
- **预期输出：** Stage 4 质量门 PASS。
- **失败停止条件：** 差异只来自高度、视觉尺寸不一致、浏览器或回归失败时停止。
- **Git提交建议：** 通过后创建 Stage 4 提交 `feat: add Medium and High gear quality slices`。
- **回滚或恢复方法：** 按 Stage 4 起点提交恢复并重跑 Stage 3。

## 7. Stage 5：Ball、Needle 与 Taper Tip 质量门

### Task 5.1：强化 Tip 剖面语义验证

- **目标：** 在生成前量化三类 Tip 的终端接触半径、曲率和剖面顺序。
- **修改文件：** `scripts/validate_specs.py`。
- **新增文件：** `reports/validation/tip-profile-contract.json`（运行产物）。
- **前置条件：** Stage 4 通过；三份 Tip JSON 已通过 Schema。
- **具体实现步骤：** 验证剖面半径非负、Z 单调、终端非零、Ball=3.2 mm、Needle=0.6 mm、Taper=1.6 mm，且 Needle < Taper < Flat。
- **实际执行命令：** `python scripts/validate_specs.py --scope phase2b_tips`。
- **自动测试：** 合法剖面通过；零半径尖点、逆序点、重复点和错误接触顺序均被拒绝。
- **预期输出：** Tip profile contract PASS，不启动 Blender。
- **失败停止条件：** 只能在生成后发现剖面错误、验证允许数学尖点或改变 NSS-V1 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 5 提交。
- **回滚或恢复方法：** 恢复剖面验证相关明确文件。

### Task 5.2：生成并验证 Ball Defense Tip

- **目标：** 生成球冠接触面和宽圆滑过渡肩。
- **修改文件：** `blender/lib/geometry.py`（仅共享旋转体确有缺口时）。
- **新增文件：** Ball GLB、blend、collider/geometry/Validator 报告。
- **前置条件：** Task 5.1 通过。
- **具体实现步骤：** 用 JSON 剖面生成闭合旋转体和代理；检查球冠曲率与终端面积。
- **实际执行命令：** Blender generate/validate `tip_ball_defense`；glTF Validator。
- **自动测试：** 非流形和零面积为 0；接触半径 3.2 mm；Validator 0/0；GLB 无代理。
- **预期输出：** Ball 单件质量门 PASS。
- **失败停止条件：** 底部出现尖点、球冠折线不连续或回归失败时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 5 提交。
- **回滚或恢复方法：** 恢复共享旋转体改动并重跑 Flat Tip 回归。

### Task 5.3：生成并验证 Needle Stamina Tip

- **目标：** 生成非零圆头针尖、细颈和稳定肩。
- **修改文件：** 同 Task 5.2，仅在共享旋转体不足时最小修改。
- **新增文件：** Needle GLB、blend 和验证报告。
- **前置条件：** Ball 已通过且 Flat 回归正常。
- **具体实现步骤：** 解释 Needle JSON 剖面；验证 0.6 mm 圆头、细颈最小壁厚和闭合端面。
- **实际执行命令：** Blender generate/validate `tip_needle_stamina`；glTF Validator。
- **自动测试：** 接触半径正确；无数学尖点、重复点或零面积面；Validator 0/0。
- **预期输出：** Needle 单件质量门 PASS。
- **失败停止条件：** 接触面退化、细颈断裂或共享修改破坏 Ball/Flat 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 5 提交。
- **回滚或恢复方法：** 恢复本任务 diff，保留 Ball 已验证状态。

### Task 5.4：生成并验证 Taper Balance Tip

- **目标：** 生成连续锥面、小圆角接触台和缓和肩。
- **修改文件：** 同前两项，仅在必要时最小修改。
- **新增文件：** Taper GLB、blend 和验证报告。
- **前置条件：** Task 5.2、5.3 通过。
- **具体实现步骤：** 解释 Taper JSON；验证 1.6 mm 接触半径位于 Needle 与 Flat 之间；检查锥面连续性。
- **实际执行命令：** Blender generate/validate `tip_taper_balance`；glTF Validator。
- **自动测试：** 接触顺序、曲率、法线、流形和 Validator 全部通过。
- **预期输出：** Taper 单件质量门 PASS。
- **失败停止条件：** 接触半径顺序错误、锥面折返或共享回归失败时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 5 提交。
- **回滚或恢复方法：** 恢复 Taper 相关明确 diff。

### Task 5.5：Tip 夹具、同族视觉、预览与回归

- **目标：** 完成三 Tip 的装配验证，并证明 Flat/Ball/Needle/Taper 侧面意图可辨认。
- **修改文件：** 测试、render、contact、analyze、preview 与浏览器测试文件。
- **新增文件：** 三个单变量夹具 GLB/报告、三款视觉/contact sheet、`all_tips_comparison.png`、指标和截图。
- **前置条件：** Task 5.2–5.4 全部通过。
- **具体实现步骤：** 生成三个 tip fixture；执行碰撞；统一侧面渲染四 Tip；预览增加三款；运行 13 GLB 基线和 Storm 回归。
- **实际执行命令：** 三 assembly generate/validate；视觉分析 `--family tip`；Playwright；baseline verify-only。
- **自动测试：** 三夹具 PASS；碰撞/未解决接触为 0；对比图 2048×1024；浏览器和回归阻断数 0。
- **预期输出：** Stage 5 质量门 PASS。
- **失败停止条件：** 任一 Tip 意图仅靠标签区分、夹具异常、浏览器错误或回归失败时停止。
- **Git提交建议：** 通过后创建 Stage 5 提交 `feat: add Phase 2B performance tip quality slices`。
- **回滚或恢复方法：** 按 Stage 5 起点提交恢复并重跑 Stage 4。

## 8. Stage 6：代表性组合与 16 目标离线预览

### Task 6.1：生成四套代表性组合

- **目标：** 生成设计批准的 Attack、Defense、Stamina、Balance 非官方代表性组合。
- **修改文件：** `scripts/build_all.ps1`（增加严格 Phase2BRepresentative scope）。
- **新增文件：** 四套 assembly GLB、blend 和 exploded blend。
- **前置条件：** Stage 5 通过；八个新零件全部可用。
- **具体实现步骤：** 按 `specs/assemblies.json` 精确生成四套组合；不得推导或遍历其他组合。
- **实际执行命令：** 对四个 `assembly_phase2b_*_representative` 分别运行 `generate_assemblies.py`，或运行严格列表化 build scope。
- **自动测试：** 生成数恰为 4；每套零件 ID 精确匹配设计；输出非空；没有额外 assembly。
- **预期输出：** 四套组合和拆解场景生成成功。
- **失败停止条件：** 组合数量不为 4、出现自动笛卡尔积、官方配置误标或范围外输出时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 6 提交。
- **回滚或恢复方法：** 恢复 build scope；逐个处理四套运行产物。

### Task 6.2：代表性组合接口、碰撞与 GLB 总验证

- **目标：** 检查跨模块组合的接口一致性、意外重叠、总尺寸和导出质量。
- **修改文件：** `scripts/test_all.ps1`、`blender/validate_assemblies.py`（仅增加严格 scope 汇总）。
- **新增文件：** 四份 assembly 报告、四份 Validator 报告、`phase2b-representative-collision-summary.json`。
- **前置条件：** Task 6.1 输出齐全。
- **具体实现步骤：** 对四套组合执行 NSS-V1 接口验证和完整碰撞流水线；汇总轴误差、直径、高度、三角面和 CONTACT_REVIEW。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2BRepresentatives`。
- **自动测试：** 4/4 PASS；碰撞 0；未解决 CONTACT_REVIEW 0；Validator 0/0；组合三角面小于 150,000。
- **预期输出：** 代表性组合碰撞汇总 PASS。
- **失败停止条件：** 任一 FAIL、合法接触误判、尺寸异常、未处理复审或 Validator issue 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 6 提交。
- **回滚或恢复方法：** 恢复验证 scope，保留失败报告和人工复审记录。

### Task 6.3：扩展为 16 目标离线预览并关闭 Stage 6

- **目标：** 在不实现定制器的前提下预览四 Blade、八新零件和四代表性组合。
- **修改文件：** `preview/index.html`、`preview/main.js`、`preview/styles.css`、`tests/browser/phase2b-preview.spec.mjs`、`preview/package.json`。
- **新增文件：** 12 张新截图、更新的 `browser-test-phase2b.json`、Stage 6 回归报告。
- **前置条件：** Task 6.2 通过；本地依赖许可证完整。
- **具体实现步骤：** 增加分组选择，不增加自由组合控件；数据驱动遍历 16 个 ID；验证拖动、缩放、重置、中心轴和加载状态；运行批准基线。
- **实际执行命令：** `npm.cmd --prefix preview test -- phase2b-preview.spec.mjs`；baseline verify-only；Storm Attack regression scope。
- **自动测试：** 16/16 加载；Canvas 一致；交互断言通过；console/page/failed request 均为 0；外部请求为 0。
- **预期输出：** Stage 6 质量门 PASS，预览仍完全离线。
- **失败停止条件：** 任一目标缺失、浏览器错误、外部网络请求、许可证缺失或回归阻断时停止。
- **Git提交建议：** 通过后创建 Stage 6 提交 `feat: add Phase 2B representative preview gate`。
- **回滚或恢复方法：** 按 Stage 6 起点提交恢复 preview 和测试文件，并重跑 Stage 5。

## 9. Stage 7：最终自动门与人工评审交接

### Task 7.1：执行严格 Phase 2B 总流水线

- **目标：** 一次实际执行覆盖规格、16 个代理、8 个新零件、12 套新装配、GLB、视觉、浏览器和批准基线。
- **修改文件：** `scripts/build_all.ps1`、`scripts/test_all.ps1`。
- **新增文件：** `reports/validation/phase2b-quality-gate.json`。
- **前置条件：** Stage 6 通过；所有人工 CONTACT_REVIEW 已有结论。
- **具体实现步骤：** 增加固定列表 `Scope Phase2B`；构建范围仅为现有 8 零件依赖、新 8 零件和 12 新装配；测试所有阻断计数；禁止笛卡尔积。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/build_all.ps1 -Scope Phase2B`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2B`；随后执行 StormAttackRegression。
- **自动测试：** 新零件 8、单变量夹具 8、代表性组合 4、唯一代理 16；FAIL/未解决接触/未确认漂移/语义回归/Validator issues/Playwright failures 均为 0。
- **预期输出：** `phase2b-quality-gate.json` 为 PASS，但不宣称完整组合阶段已完成。
- **失败停止条件：** 任一计数不为 0、范围外产物、288 组合执行、NSS-V1 diff 或实际命令缺失时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 7 提交。
- **回滚或恢复方法：** 恢复两个脚本到 Stage 6，保留失败报告并从具体失败任务重试。

### Task 7.2：生成最终统计、视觉索引和人工清单

- **目标：** 形成可追溯的 Phase 2B 自动证据与人工复审入口。
- **修改文件：** `blender/lib/reporting.py`（仅在现有报告函数不足时）。
- **新增文件：** `reports/phase2b-validation-summary.md`、`reports/validation/phase2b-summary.json`、`reports/validation/phase2b-human-review.json`、`reports/renders/phase2b-visual-index.md`。
- **前置条件：** Task 7.1 通过，原始报告齐全。
- **具体实现步骤：** 汇总八新零件尺寸/三角面/材质/GLB、十二装配碰撞、13 GLB 回归、浏览器、四张同族对比和所有人工处理结论。
- **实际执行命令：** `python scripts/verify_phase2a_baseline.py --manifest docs/baselines/v0.2.0-phase2a-approved.json --blender "$Blender" --glb-only --verify-only --report reports/validation/phase2b-final-baseline.json`；`test_all.ps1 -Scope Phase2BReport`。
- **自动测试：** JSON 与 Markdown 数据一致；8、12、13、16 四个关键计数完整；文件索引路径存在；阻断数全 0。
- **预期输出：** 汇总和人工清单完整，状态为 `Phase 2B awaiting visual review`。
- **失败停止条件：** 统计缺失、报告矛盾、人工结论缺失或状态使用禁止声明时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 7 提交。
- **回滚或恢复方法：** 恢复 reporting 改动，逐个处理四份新增报告。

### Task 7.3：范围终审并交接人工视觉评审

- **目标：** 证明实施没有修改 NSS-V1、Main Blade 或进入 288 组合阶段。
- **修改文件：** 无。
- **新增文件：** `reports/validation/phase2b-final-audit.json`。
- **前置条件：** Task 7.2 通过。
- **具体实现步骤：** 比较 Phase 2B 起点提交；检查 `specs/interfaces.json` 和四 Blade 规格/语义无变化；枚举 public GLB；扫描禁止声明、占位符和未闭合报告；确认许可证。
- **实际执行命令：** `git diff --name-only 06ef7d7880de1e6b1845995856082b375714c722..HEAD`；接口与 Blade 专项 diff；`python scripts/validate_specs.py --scope phase2b`；`test_all.ps1 -Scope Phase2BFinalAudit`。
- **自动测试：** NSS-V1 diff 空；Main Blade 语义基线不变；范围外零件和 288 执行计数为 0；最终状态精确匹配。
- **预期输出：** `phase2b-final-audit.json` PASS，交给人工视觉评审。
- **失败停止条件：** 任一范围违规、批准基线漂移、许可证缺失、禁止声明或证据缺失时停止，不创建提交。
- **Git提交建议：** 通过后创建 Stage 7 提交 `docs: hand off Phase 2B visual review`。
- **回滚或恢复方法：** 保持 Stage 6 已验证提交，恢复最终报告的明确路径后重新准备交接。

## 10. 阶段提交序列

1. Stage 0：`chore: establish Phase 2B approved baseline gate`
2. Stage 1：`feat: define Phase 2B remaining module specs`
3. Stage 2：`feat: add Void Falcon core quality slice`
4. Stage 3：`feat: add Guard and Air assist quality slices`
5. Stage 4：`feat: add Medium and High gear quality slices`
6. Stage 5：`feat: add Phase 2B performance tip quality slices`
7. Stage 6：`feat: add Phase 2B representative preview gate`
8. Stage 7：`docs: hand off Phase 2B visual review`

任一 Stage 未通过时不得创建该 Stage 提交，也不得跳过质量门进入下一阶段。

## 11. 计划自身范围审计

实施前必须再次确认：

1. 计划只包含八个批准的新零件。
2. 单变量夹具恰为八个，代表性组合恰为四个。
3. 没有修改 NSS-V1 的任务。
4. 没有新增或修改 Main Blade 的任务。
5. 每次共享生成器修改后都有 13 GLB 批准基线和 Storm Attack 回归。
6. 所有实际 `CONTACT_REVIEW` 都要求人工处理结论。
7. Three.js 版本和离线许可证保持固定。
8. 没有运行 288 组合或实现完整定制器的任务。
9. 最终状态只允许 `Phase 2B awaiting visual review`。
10. 本计划获人工批准前禁止开始实施。
