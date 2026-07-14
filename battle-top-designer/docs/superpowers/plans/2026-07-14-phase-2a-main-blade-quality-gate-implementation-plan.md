# Nova Spin System Phase 2A：Main Blade 设计质量门实施计划

日期：2026-07-14

状态：待确认，尚未实施

依据：纵向切片基线 `f55e260`、Phase 2A 设计 `caaa0ce`、设计加固 `c649bd213b4a0e9dc10891502abcecba9fed33bb`、文档清理 `ea15f8df7a241611a883612cc9a92f4a44ef1b67`、指纹规则修正 `3221c462f123494a3564cf4c2ffe9baf24d5745a`。

## 1. 目标、边界与执行原则

本计划把已批准的 Phase 2A 设计拆成九个可独立验证的阶段。实施范围仅包括四枚 Main Blade、现有纵向切片五个零件所需的碰撞代理、四套 Blade 测试夹具、离线 GLB 预览、自动验证和人工视觉评审交接。

固定边界如下：

- `specs/interfaces.json` 和 NSS-V1 的尺寸、角色、方向、容差均只读；发现接口缺陷时立即停止并单独报告，不在 Phase 2A 中修改。
- 不生成 Phase 2A 范围外的 Core、Assist Ring、Height Gear 或 Performance Tip，不进入全部 16 零件或 288 组合阶段。
- 共享生成器每次发生变化后，必须执行 Storm Attack 双指纹与完整回归。
- `raw_sha256` 单独变化记为 `BINARY_DRIFT`，未经人工确认不得通过；未批准的 `semantic_fingerprint` 变化记为 `SEMANTIC_REGRESSION` 并硬失败。
- `CONTACT_REVIEW` 必须保存人工处理结论；未解决数量不为零时不得通过阶段门。
- 每个阶段只在本阶段自动测试全部通过后提交一个独立 Git 提交。命令必须真实执行并保存输出，不得用“代码已编写”代替运行结果。
- 回滚只使用显式文件路径的 `git restore`；新增文件如需移除，逐个明确路径处理，不执行批量删除。

默认工作目录为 `E:\战斗陀螺项目\battle-top-designer`。Blender 候选路径固定先检查 `D:\Program Files\Blender Foundation\Blender 4.5\blender.exe`，确认版本必须为 4.5.11 LTS。

## 2. Stage 0：环境与基线确认

### Task 0.1：环境只读预检

- **目标：** 验证 Blender 4.5.11、glTF Validator、Node、Python、Three.js 0.185.1 和 Playwright 环境，不生成或修改模型。
- **修改文件：** 无。
- **新增文件：** `scripts/check_phase2a_environment.ps1`、`reports/validation/phase2a-environment.json`（运行产物）。
- **前置条件：** HEAD 包含提交 `3221c462f123494a3564cf4c2ffe9baf24d5745a`；工作区中的现有 GLB 可读。
- **具体实现步骤：** 编写只读预检脚本；优先验证指定 Blender 路径；记录工具绝对路径、精确版本和退出码；只解析依赖，不启动 Blender 建模任务。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/check_phase2a_environment.ps1`。
- **自动测试：** JSON 必须可解析；Blender 为 4.5.11 LTS；Validator 为基线记录的 `2.0.0-dev.3.10`；Node、Python、Three.js 与 Playwright 均可解析。
- **预期输出：** `reports/validation/phase2a-environment.json`，总体结果为 `PASS`。
- **失败停止条件：** Blender 未找到或版本不符、Validator 版本漂移、任一必需运行时不可用时停止 Stage 0，不修改模型。
- **Git提交建议：** 暂不单独提交，纳入 Stage 0 提交 `chore: establish Phase 2A environment and fingerprint gate`。
- **回滚或恢复方法：** `git restore -- scripts/check_phase2a_environment.ps1`；运行报告为未跟踪文件时逐个移除该明确路径后重跑。

### Task 0.2：建立并验证双指纹基线

- **目标：** 对现有五个零件和 `assembly_storm_attack.glb` 验证 `raw_sha256`，并建立设计要求的规范化 `semantic_fingerprint`，不重写 GLB。
- **修改文件：** `docs/baselines/v0.1.0-vertical-slice.json`，不修改任何模型文件。
- **新增文件：** `blender/fingerprint_glb.py`、`scripts/verify_phase2a_baseline.py`、`reports/validation/phase2a-baseline-check.json`（运行产物）。
- **前置条件：** Task 0.1 通过；六个基线 GLB 的原始哈希与 `f55e260` 清单可比对。
- **具体实现步骤：** 用 Blender 重导入每个 GLB；规范化记录网格、尺寸、材质、安装点、对象层级和接口信息；排序后计算语义哈希；把现有 `sha256` 明确迁移为 `raw_sha256`，并在同一清单中增加 `semantic_fingerprint`、来源提交和规范化数据版本，不重写任何 GLB。
- **实际执行命令：** `python scripts/verify_phase2a_baseline.py --manifest docs/baselines/v0.1.0-vertical-slice.json --blender "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe"`。
- **自动测试：** 六个 `raw_sha256` 全匹配；规范化 JSON 键排序稳定；连续运行两次得到相同语义哈希；安装点名符合 `MOUNT_<PART_ID>_TOP/BOTTOM`。
- **预期输出：** 统一双指纹清单和 `phase2a-baseline-check.json` 均为 `PASS`，现有 GLB 的修改时间和字节不变。
- **失败停止条件：** 任一原始哈希不匹配、重导入失败、语义指纹不稳定或基线文件被写回时停止，不建立新基线覆盖差异。
- **Git提交建议：** 测试通过后创建 Stage 0 独立提交 `chore: establish Phase 2A environment and fingerprint gate`。
- **回滚或恢复方法：** `git restore -- docs/baselines/v0.1.0-vertical-slice.json`；新增的 `blender/fingerprint_glb.py`、`scripts/verify_phase2a_baseline.py` 和运行报告逐个明确路径处理，基线标签保持不变。

## 3. Stage 1：规格和 Schema 扩展

### Task 1.1：增加四种 `profile_family` 严格枚举

- **目标：** 让 Main Blade 规格只能选择四个已批准的独立轮廓族。
- **修改文件：** `schemas/part.schema.json`、`scripts/validate_specs.py`。
- **新增文件：** 无。
- **前置条件：** Stage 0 提交已完成；NSS-V1 只读。
- **具体实现步骤：** 为 Main Blade 增加 `profile_family` 必填约束，枚举 `storm_fang_upper`、`iron_bastion_damper`、`orbit_halo_streamline`、`dual_comet_alternating`；非 Main Blade 不强制该字段；加入未知值和缺失值反例。
- **实际执行命令：** `python scripts/validate_specs.py --self-test`。
- **自动测试：** 四个合法值通过；缺失值、第五个值和错误零件类型组合失败；现有非 Blade 规格继续通过。
- **预期输出：** `reports/validation/spec-self-test.json` 为 `PASS`。
- **失败停止条件：** 枚举可被任意字符串绕过、影响非 Blade 规格或触及 `specs/interfaces.json` 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 1 提交 `feat: define Phase 2A blade and fixture specs`。
- **回滚或恢复方法：** `git restore -- schemas/part.schema.json scripts/validate_specs.py`。

### Task 1.2：扩展测试夹具 Schema 与语义规则

- **目标：** 约束四套装配只能被解释为 Phase 2A Blade 测试夹具，而非官方配置。
- **修改文件：** `schemas/assembly.schema.json`、`scripts/validate_specs.py`。
- **新增文件：** 无。
- **前置条件：** Task 1.1 通过。
- **具体实现步骤：** 为夹具要求 `purpose=phase2a_blade_test_fixture`、`official_configuration=false`、`baseline_fixture=storm_attack_vertical_slice`、`variable_part_type=main_blade`；验证五个槽位和 NSS-V1 接口 ID 一致，但不修改接口定义。
- **实际执行命令：** `python scripts/validate_specs.py --self-test`。
- **自动测试：** 每个字段缺失、值错误或错误标记为官方配置的反例均失败；纵向切片正式装配仍按原规则通过。
- **预期输出：** Schema 自测为 `PASS`，错误消息能定位具体字段。
- **失败停止条件：** 夹具可被标记为官方配置、旧装配被误判或验证器需要修改 NSS-V1 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 1 提交。
- **回滚或恢复方法：** `git restore -- schemas/assembly.schema.json scripts/validate_specs.py`。

### Task 1.3：增加三枚 Blade 规格

- **目标：** 用 JSON 完整描述 Iron Bastion、Orbit Halo 和 Dual Comet，几何参数不硬编码进 Blender 脚本。
- **修改文件：** `specs/materials.json`（仅在批准材质缺失时增加所需原创材质）。
- **新增文件：** `specs/parts/blade_iron_bastion.json`、`specs/parts/blade_orbit_halo.json`、`specs/parts/blade_dual_comet.json`。
- **前置条件：** Task 1.1 和 1.2 通过；已核对设计文档中的轮廓、材质数和原创性约束。
- **具体实现步骤：** 分别写入独立 `profile_family`、尺寸、接触节奏、窗口或辐条参数、材质引用及原创性规则；禁止只靠刃数、半径、颜色或单一角度区分。
- **实际执行命令：** `python scripts/validate_specs.py --scope phase2a`。
- **自动测试：** 三份 JSON 可解析并通过 Schema；所有材质引用存在；`interface_id` 均为 NSS-V1；单模型材质上限不超过 6。
- **预期输出：** 三份规格验证记录为 `PASS`，不产生 GLB。
- **失败停止条件：** 参数必须依赖脚本硬编码、出现范围外零件、现有产品名称或接口字段变化时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 1 提交。
- **回滚或恢复方法：** `git restore -- specs/materials.json`；三个新增 JSON 逐个明确路径处理。

### Task 1.4：增加四套 Phase 2A 测试夹具并关闭规格门

- **目标：** 定义只替换 Main Blade 的四套固定夹具并完成纯规格验证。
- **修改文件：** `specs/assemblies.json`、`scripts/validate_specs.py`。
- **新增文件：** `reports/validation/spec-phase2a.json`（运行产物）。
- **前置条件：** Task 1.3 通过；本任务不得启动 Blender。
- **具体实现步骤：** 增加 `assembly_phase2a_storm_fang`、`assembly_phase2a_iron_bastion`、`assembly_phase2a_orbit_halo`、`assembly_phase2a_dual_comet`；四者复用现有 Core、Assist、Gear、Tip 并包含四个夹具语义字段；加入唯一 ID 与唯一变量槽验证。
- **实际执行命令：** `python scripts/validate_specs.py --self-test`；`python scripts/validate_specs.py --scope phase2a`。
- **自动测试：** 自测和 Phase 2A 规格验证均通过；夹具数严格为 4；可变零件类型严格为 Main Blade；没有范围外零件。
- **预期输出：** `reports/validation/spec-phase2a.json` 为 `PASS`，无 Blender 进程和新 GLB。
- **失败停止条件：** 任一夹具缺少语义字段、夹具数不是 4、规格测试失败或命令启动 Blender 时停止。
- **Git提交建议：** 测试通过后创建 Stage 1 独立提交 `feat: define Phase 2A blade and fixture specs`。
- **回滚或恢复方法：** `git restore -- specs/assemblies.json scripts/validate_specs.py`；新增报告逐个明确路径处理。

## 4. Stage 2：碰撞代理基础设施

### Task 2.1：建立碰撞代理命名、导出排除与验证契约

- **目标：** 分离 `GEO_` 渲染网格和 `COLLIDER_` 碰撞代理，并保证代理默认不进入 GLB。
- **修改文件：** `blender/lib/exporter.py`、`blender/validate_geometry.py`。
- **新增文件：** `blender/lib/collision.py`。
- **前置条件：** Stage 1 提交已完成；Stage 0 双指纹可用。
- **具体实现步骤：** 定义 `COLLIDER_<PART_ID>` 唯一命名和 `export_exclude=true` 属性；导出时显式过滤代理；验证器检查渲染对象只使用 `GEO_`、代理不计入渲染材质与三角面统计。
- **实际执行命令：** `python -m py_compile blender/lib/collision.py blender/lib/exporter.py blender/validate_geometry.py`。
- **自动测试：** 语法检查通过；命名和排除属性单元自测覆盖合法与错误对象名。
- **预期输出：** 形成统一代理契约，不生成模型。
- **失败停止条件：** 导出器无法可靠排除代理、引入第二种渲染前缀或改变可见几何时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 2 提交 `feat: add closed collision proxy validation`。
- **回滚或恢复方法：** `git restore -- blender/lib/exporter.py blender/validate_geometry.py`；新增文件逐个明确路径处理。

### Task 2.2：为现有五个零件生成闭合代理

- **目标：** 只为 `core_solar_wolf`、`blade_storm_fang`、`assist_heavy`、`gear_low`、`tip_flat_attack` 创建封闭、流形、外向法线代理。
- **修改文件：** `blender/generate_parts.py`、`blender/lib/geometry.py`、`blender/lib/interfaces.py`。
- **新增文件：** 无。
- **前置条件：** Task 2.1 通过；现有五个零件的语义基线已冻结。
- **具体实现步骤：** 用低面数解析几何构造八个唯一代理中的前五个；合法插入区、凸耳锁定区和基准接触区使用简化封盖闭合；接口验证继续由 NSS-V1 验证器独立负责。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/generate_parts.py -- --part blade_storm_fang`，随后对其余四个现有零件逐个执行同一命令。
- **自动测试：** 每个代理非流形边为 0、边界边为 0、零面积面为 0、法线朝外、对象名唯一且 `export_exclude=true`。
- **预期输出：** 五个 `.blend` 内含有效代理；最终 GLB 暂由后续任务验证排除；Storm Fang 可见几何语义不变。
- **失败停止条件：** 任一代理非闭合、接口排除区留下开口、代理修改渲染网格或生成范围外零件时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 2 提交。
- **回滚或恢复方法：** `git restore -- blender/generate_parts.py blender/lib/geometry.py blender/lib/interfaces.py`，再从 Stage 0 基线重新生成验证现有产物。

### Task 2.3：实现 AABB、BVH 与体素重叠检测

- **目标：** 按批准顺序实现意外重叠检测并输出位置和近似体积。
- **修改文件：** `blender/lib/collision.py`、`blender/validate_assemblies.py`、`blender/lib/reporting.py`。
- **新增文件：** `blender/validate_collision_proxies.py`。
- **前置条件：** Task 2.2 的五个代理全部通过闭合验证。
- **具体实现步骤：** 依次执行 AABB 快筛、BVH 建立、BVH 三角面相交、排除区裁定、体素重叠估算和报告；实现 `PASS`、`CONTACT_REVIEW`、`FAIL`，低于阈值但存在 BVH 相交时不得自动判定为 PASS。
- **实际执行命令：** `python -m py_compile blender/lib/collision.py blender/validate_collision_proxies.py blender/validate_assemblies.py blender/lib/reporting.py`。
- **自动测试：** 使用相离、合法接触、轻微交叠和明显交叠四种解析夹具，分别得到 PASS、PASS 或 CONTACT_REVIEW、CONTACT_REVIEW、FAIL；报告包含坐标、对象对和近似体积。
- **预期输出：** 碰撞检测框架的自测全部通过，不生成新增 Blade。
- **失败停止条件：** 跳过任一步骤、合法接口接触被直接判 FAIL、低体积相交被静默忽略或报告缺少位置/体积时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 2 提交。
- **回滚或恢复方法：** `git restore -- blender/lib/collision.py blender/validate_assemblies.py blender/lib/reporting.py`；新增验证脚本逐个明确路径处理。

### Task 2.4：验证代理不进入 GLB

- **目标：** 重新导入现有五个零件 GLB，证明不存在 `COLLIDER_` 对象且 GLB 格式有效。
- **修改文件：** `blender/validate_geometry.py`、`scripts/test_all.ps1`。
- **新增文件：** `reports/validation/collider-export-exclusion.json`（运行产物）。
- **前置条件：** Task 2.3 通过；五个零件已重新生成。
- **具体实现步骤：** 在 GLB 重导入验证中枚举对象名；任何 `COLLIDER_` 均硬失败；逐个运行 Khronos Validator 并记录 error、warning 和资源统计。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope ExistingVerticalSliceColliders`。
- **自动测试：** 五个 GLB 重导入成功；`COLLIDER_` 数量为 0；Validator error=0、warning=0；每个文件大小大于 0。
- **预期输出：** `collider-export-exclusion.json` 为 `PASS`，五份 Validator 报告无错误和警告。
- **失败停止条件：** GLB 含代理、重导入失败、Validator 出现任一 error/warning 或导出文件为空时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 2 提交。
- **回滚或恢复方法：** `git restore -- blender/validate_geometry.py scripts/test_all.ps1`，并从基线提交恢复受影响 GLB 的明确路径后调查。

### Task 2.5：执行 Storm Attack 完整回归并关闭 Stage 2

- **目标：** 证明碰撞基础设施没有改变 Storm Fang 可见几何、现有五零件语义或 Storm Attack 装配语义。
- **修改文件：** `scripts/test_all.ps1`。
- **新增文件：** `reports/validation/stage2-storm-regression.json`（运行产物）。
- **前置条件：** Task 2.4 通过；所有 `CONTACT_REVIEW` 已有人工处理结论。
- **具体实现步骤：** 完整构建 Storm Attack；执行规格、几何、接口、碰撞、GLB 重导入、Validator 和双指纹；将原始漂移与语义漂移分开判定。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/build_all.ps1 -Scope StormAttackRegression`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope StormAttackRegression`。
- **自动测试：** `semantic_fingerprint` 全匹配；FAIL=0；未解决 CONTACT_REVIEW=0；Validator error=0、warning=0；Storm Fang 可见几何统计不变。
- **预期输出：** Stage 2 回归报告为 `PASS`；若仅有原始哈希变化则明确记录 `BINARY_DRIFT` 及人工确认。
- **失败停止条件：** 出现 `SEMANTIC_REGRESSION`、未确认 `BINARY_DRIFT`、未解决 `CONTACT_REVIEW` 或任一自动测试失败时停止，不进入 Stage 3。
- **Git提交建议：** 质量门通过后创建 Stage 2 独立提交 `feat: add closed collision proxy validation`。
- **回滚或恢复方法：** 阶段开始时先记录 `$Stage2Start = git rev-parse HEAD`；需要恢复时对每个明确文件执行 `git restore --source=$Stage2Start -- path/to/file`，然后重新运行 Stage 0 基线检查。

## 5. Stage 3：Iron Bastion 最小纵向切片

### Task 3.1：实现 Iron Bastion 独立轮廓生成器

- **目标：** 实现八段圆滑防御、内重心和连续卸力轮廓，不复用 Storm Fang 尖刃轮廓函数伪装新算法。
- **修改文件：** `blender/generate_parts.py`、`blender/lib/geometry.py`。
- **新增文件：** 无。
- **前置条件：** Stage 2 质量门通过；`blade_iron_bastion.json` 已通过规格验证。
- **具体实现步骤：** 为 `iron_bastion_damper` 建立独立分派函数；从 JSON 读取八段圆滑接触面、内圈体量和连续包络参数；共享代码仅限通用网格、法线、材质和导出工具。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/generate_parts.py -- --part blade_iron_bastion`。
- **自动测试：** 对象存在且有网格；非流形边、重复顶点和零面积面为 0；变换已应用；三角面≤50000；材质≤6；外缘无 Storm Fang 式尖锐外伸刃。
- **预期输出：** `public/models/parts/blade_iron_bastion.glb` 和对应 `.blend` 成功生成。
- **失败停止条件：** 调用 Storm Fang 轮廓函数、仅通过数量/半径/颜色/单角度变化、几何测试失败或超限时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 3 提交 `feat: add Iron Bastion quality slice`。
- **回滚或恢复方法：** `git restore -- blender/generate_parts.py blender/lib/geometry.py`；生成产物逐个明确路径处理。

### Task 3.2：实现并验证 Iron Bastion 碰撞代理

- **目标：** 创建第六个唯一闭合代理，正确封盖接口排除区。
- **修改文件：** `blender/lib/collision.py`、`blender/generate_parts.py`。
- **新增文件：** `reports/validation/collider-blade-iron-bastion.json`（运行产物）。
- **前置条件：** Task 3.1 几何验证通过。
- **具体实现步骤：** 基于 Iron Bastion 的连续圆滑包络创建低面数闭合代理；标记 `export_exclude`；独立运行流形、法线和排除区封盖检查。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/validate_collision_proxies.py -- --part blade_iron_bastion`。
- **自动测试：** 非流形边=0、边界边=0、法线朝外、代理数量=1、GLB 重导入后代理数量=0。
- **预期输出：** Iron Bastion 代理报告为 `PASS`。
- **失败停止条件：** 代理开口、法线错误、合法插入区未排除或代理进入 GLB 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 3 提交。
- **回滚或恢复方法：** `git restore -- blender/lib/collision.py blender/generate_parts.py`。

### Task 3.3：生成并验证 Iron Bastion 测试夹具

- **目标：** 生成 `assembly_phase2a_iron_bastion` 并验证接口、轴线、方向、间隙、尺寸和意外重叠。
- **修改文件：** `blender/generate_assemblies.py`、`blender/validate_assemblies.py`。
- **新增文件：** `reports/validation/assembly-phase2a-iron-bastion.json`（运行产物）。
- **前置条件：** Task 3.2 通过；夹具规格字段完整。
- **具体实现步骤：** 仅替换 Main Blade；保留现有四个固定零件；分离 NSS-V1 接口验证和非接口碰撞验证；记录所有 CONTACT_REVIEW。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/generate_assemblies.py -- --assembly assembly_phase2a_iron_bastion`；`& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/validate_assemblies.py -- --assembly assembly_phase2a_iron_bastion`。
- **自动测试：** 中心轴误差、安装方向、总高度和直径在设计阈值内；FAIL=0；未解决 CONTACT_REVIEW=0。
- **预期输出：** 夹具 GLB 和验证 JSON；明确标记 `official_configuration=false`。
- **失败停止条件：** 接口 ID 不一致、倒置、悬空间隙、异常尺寸、意外碰撞或缺少人工结论时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 3 提交。
- **回滚或恢复方法：** `git restore -- blender/generate_assemblies.py blender/validate_assemblies.py`；夹具产物逐个明确路径处理。

### Task 3.4：执行 Iron Bastion GLB 与单款视觉验证

- **目标：** 完成 GLB 重导入、官方 Validator 和五类单款视觉输出。
- **修改文件：** `blender/render_catalog.py`、`scripts/make_contact_sheets.py`。
- **新增文件：** Iron Bastion 的 `top`、`perspective_45`、`side`、`silhouette`、1536×1536 `contact_sheet` 运行产物。
- **前置条件：** Task 3.3 通过。
- **具体实现步骤：** 以固定正交相机和材质设置渲染四个 512×512 单视图；生成高分辨率 contact sheet；重导入 Blade 与夹具 GLB 并运行 Validator。
- **实际执行命令：** `node scripts/validate_gltf.mjs --input public/models/parts/blade_iron_bastion.glb --output reports/validation/gltf-blade-iron-bastion.json`；`& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/render_catalog.py -- --target blade_iron_bastion`；`python scripts/make_contact_sheets.py --target blade_iron_bastion`。
- **自动测试：** Validator error=0、warning=0；重导入无代理；单图 512×512；contact sheet 1536×1536；输出均非空。
- **预期输出：** `reports/renders/blade_iron_bastion_*` 和对应验证报告全部生成。
- **失败停止条件：** 任一验证错误/警告、尺寸错误、图像缺失或材质显示异常时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 3 提交。
- **回滚或恢复方法：** `git restore -- blender/render_catalog.py scripts/make_contact_sheets.py`；渲染产物逐个明确路径处理。

### Task 3.5：Storm Attack 回归与 Iron Bastion 独立质量门

- **目标：** 在进入离线预览前关闭 Iron Bastion 最小纵向切片质量门。
- **修改文件：** `scripts/test_all.ps1`。
- **新增文件：** `reports/validation/stage3-quality-gate.json`（运行产物）。
- **前置条件：** Task 3.4 通过；所有 CONTACT_REVIEW 已保存人工处理结论。
- **具体实现步骤：** 执行 Phase 2A 规格、Iron 几何/接口/碰撞/GLB/渲染验证及 Storm Attack 完整回归；汇总三种阻断状态。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope IronBastionGate`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope StormAttackRegression`。
- **自动测试：** `BINARY_DRIFT` 未确认数=0、`CONTACT_REVIEW` 未解决数=0、`SEMANTIC_REGRESSION`=0，其他测试全部 PASS。
- **预期输出：** `stage3-quality-gate.json` 为 `PASS`，Storm Attack 语义基线不变。
- **失败停止条件：** 上述任一阻断数非 0 或任一回归失败时停止，不进入 Stage 4。
- **Git提交建议：** 质量门通过后创建 Stage 3 独立提交 `feat: add Iron Bastion quality slice`。
- **回滚或恢复方法：** 按 Stage 3 起点提交显式恢复本阶段文件，并重新执行 Stage 2 质量门。

## 6. Stage 4：完全离线 GLB 预览

### Task 4.1：固定并留存 Three.js 0.185.1 依赖

- **目标：** 在项目内提供可审计、完全离线的 Three.js、GLTFLoader 和 OrbitControls，不使用 Draco。
- **修改文件：** 无。
- **新增文件：** `preview/package.json`、`preview/package-lock.json`、`preview/vendor/three/0.185.1/VERSION`、`preview/vendor/three/0.185.1/LICENSE`、`preview/vendor/three/0.185.1/build/three.module.js`、`preview/vendor/three/0.185.1/examples/jsm/loaders/GLTFLoader.js`、`preview/vendor/three/0.185.1/examples/jsm/controls/OrbitControls.js`、`scripts/vendor_three.ps1`。
- **前置条件：** Stage 3 质量门通过；网络依赖只能用于固定版本安装，运行预览不得联网。
- **具体实现步骤：** 使用精确版本 `three@0.185.1`；复制最小静态模块、VERSION 和许可证；核对 loader/controls 相对导入路径；不复制 Draco loader 或解码器。
- **实际执行命令：** `npm install --prefix preview --save-exact three@0.185.1`；`powershell -ExecutionPolicy Bypass -File scripts/vendor_three.ps1`。
- **自动测试：** `package-lock.json` 解析到 0.185.1；三个模块文件存在；VERSION 与 LICENSE 非空；源代码不引用 Draco 或外部 URL。
- **预期输出：** 可离线加载的最小静态依赖树及许可证记录。
- **失败停止条件：** 版本不是精确 0.185.1、许可证缺失、模块路径解析失败或出现网络/Draco 运行依赖时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 4 提交 `feat: add offline Phase 2A GLB preview`。
- **回滚或恢复方法：** 对新增文件逐个明确路径处理，不批量删除目录；恢复后重新运行依赖审计。

### Task 4.2：实现双 Blade 最小预览页

- **目标：** 支持 Storm Fang 与 Iron Bastion 切换、拖动旋转、缩放、重置、中心轴和加载状态。
- **修改文件：** 无。
- **新增文件：** `preview/index.html`、`preview/import-map.json`、`preview/main.js`、`preview/styles.css`、`scripts/serve_preview.mjs`。
- **前置条件：** Task 4.1 通过；两个 Blade GLB 均已验证。
- **具体实现步骤：** 使用 import map 和已验证的相对模块路径；按模型 ID 切换本地 GLB；显示中心轴、加载中/成功/失败状态；记录重置目标相机姿态；不实现定制器 UI。
- **实际执行命令：** `node scripts/serve_preview.mjs --root . --port 4173`。
- **自动测试：** 离线请求只命中本地 127.0.0.1；两个模型中心在 X=0、Y=0；交互控件可访问；无 Draco 请求。
- **预期输出：** `http://127.0.0.1:4173/preview/` 可切换两款 Blade 并显示材质。
- **失败停止条件：** 任一模块或 GLB 依赖公网、模型轴偏移、加载状态不可观测或出现完整定制器范围扩张时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 4 提交。
- **回滚或恢复方法：** 对五个新增文件逐个明确路径处理，保留已固定许可证供审计。

### Task 4.3：实现量化 Playwright 验证

- **目标：** 自动验证模型 ID、Canvas、旋转、缩放、重置和浏览器错误通道。
- **修改文件：** `preview/package.json`、`preview/package-lock.json`。
- **新增文件：** `preview/playwright.config.mjs`、`tests/browser/phase2a-preview.spec.mjs`。
- **前置条件：** Task 4.2 的本地页面可用；Stage 0 已记录 Playwright 版本。
- **具体实现步骤：** 为每个模型断言当前 ID；记录 Canvas 宽高；模拟鼠标拖动并验证相机矩阵变化；滚轮缩放并验证距离变化；重置后验证位置/目标误差；监听 console error、pageerror 和 failed request。
- **实际执行命令：** `npm install --prefix preview --save-dev --save-exact @playwright/test@1.61.1`；`npm --prefix preview exec playwright test`。
- **自动测试：** 两款 Blade 全部断言通过；Canvas 尺寸符合设计；旋转和缩放产生非零变化；重置误差低于设计阈值；三类错误计数均为 0。
- **预期输出：** Playwright 退出码 0。
- **失败停止条件：** 版本未固定、任一交互不可量化、重置超差或任一错误通道非 0 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 4 提交。
- **回滚或恢复方法：** `git restore -- preview/package.json preview/package-lock.json`；两个新增测试文件逐个明确路径处理。

### Task 4.4：保存双 Blade 浏览器证据并关闭 Stage 4

- **目标：** 留存两款预览截图和机器可读浏览器测试报告，并再次执行 Storm Attack 回归。
- **修改文件：** `scripts/test_all.ps1`。
- **新增文件：** `reports/renders/preview_blade_storm_fang.png`、`reports/renders/preview_blade_iron_bastion.png`、`reports/validation/browser-test.json`（运行产物）。
- **前置条件：** Task 4.3 通过。
- **具体实现步骤：** 在统一视口保存两张截图；汇总每款模型 ID、Canvas、相机变化、重置误差和错误计数；执行完整 Storm Attack 回归。
- **实际执行命令：** `npm --prefix preview exec playwright test -- --reporter=json`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope StormAttackRegression`。
- **自动测试：** 两张截图非空；`browser-test.json` 可解析且全部 PASS；Storm Attack 无语义回归、未确认二进制漂移或未解决接触复审。
- **预期输出：** 浏览器证据齐全，Stage 4 质量门为 `PASS`。
- **失败停止条件：** 截图缺失、浏览器报告错误、failed request 非 0 或 Storm 回归失败时停止。
- **Git提交建议：** 质量门通过后创建 Stage 4 独立提交 `feat: add offline Phase 2A GLB preview`。
- **回滚或恢复方法：** `git restore -- scripts/test_all.ps1`；运行产物逐个明确路径处理，再重跑 Stage 3 质量门。

## 7. Stage 5：Orbit Halo

### Task 5.1：实现 Orbit Halo 独立轮廓生成器

- **目标：** 实现四段闭合低阻流线环段、接近连续外缘、真实窗口和细辐条。
- **修改文件：** `blender/generate_parts.py`、`blender/lib/geometry.py`。
- **新增文件：** 无。
- **前置条件：** Stage 4 通过；Orbit Halo 规格有效。
- **具体实现步骤：** 为 `orbit_halo_streamline` 建立独立分派；直接构造窗口边界、内外环面和细辐条的封闭拓扑；不得用渲染网格布尔运算制造孔洞。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/generate_parts.py -- --part blade_orbit_halo`。
- **自动测试：** 四段对称；窗口真实贯通；非流形边和零面积面为 0；三角面≤50000；材质≤6；轮廓不等同于 Storm 或 Iron。
- **预期输出：** `blade_orbit_halo.glb` 和对应 `.blend`。
- **失败停止条件：** 复用其他 Blade 轮廓函数、使用布尔孔洞、窗口不贯通或几何超限时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 5 提交 `feat: add Orbit Halo quality slice`。
- **回滚或恢复方法：** `git restore -- blender/generate_parts.py blender/lib/geometry.py`；产物逐个明确路径处理。

### Task 5.2：Orbit Halo 代理与测试夹具

- **目标：** 创建第七个唯一代理并验证 `assembly_phase2a_orbit_halo`。
- **修改文件：** `blender/lib/collision.py`、`blender/generate_assemblies.py`、`blender/validate_assemblies.py`。
- **新增文件：** Orbit Halo 碰撞与装配验证 JSON（运行产物）。
- **前置条件：** Task 5.1 通过。
- **具体实现步骤：** 用闭合低面数代理近似环段和辐条；封盖排除区；只替换夹具 Main Blade；执行 AABB、BVH、体素和人工接触结论流程。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/validate_collision_proxies.py -- --part blade_orbit_halo`；`& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/generate_assemblies.py -- --assembly assembly_phase2a_orbit_halo`；`& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/validate_assemblies.py -- --assembly assembly_phase2a_orbit_halo`。
- **自动测试：** 代理闭合且不导出；夹具轴线、方向、尺寸和接口通过；FAIL=0；未解决 CONTACT_REVIEW=0。
- **预期输出：** Orbit Halo 代理和夹具报告均通过。
- **失败停止条件：** 代理开口、合法接口误判、意外重叠或缺少人工结论时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 5 提交。
- **回滚或恢复方法：** `git restore -- blender/lib/collision.py blender/generate_assemblies.py blender/validate_assemblies.py`。

### Task 5.3：Orbit Halo GLB、视觉与预览

- **目标：** 验证 GLB，生成单款视觉输出，并加入离线预览清单。
- **修改文件：** `blender/render_catalog.py`、`scripts/make_contact_sheets.py`、`preview/main.js`、`tests/browser/phase2a-preview.spec.mjs`。
- **新增文件：** Orbit Halo 单视图、contact sheet 和浏览器截图（运行产物）。
- **前置条件：** Task 5.2 通过。
- **具体实现步骤：** 重导入并运行 Validator；渲染四个 512×512 单视图和 1536×1536 contact sheet；加入模型 ID；扩展 Playwright 数据驱动用例。
- **实际执行命令：** `node scripts/validate_gltf.mjs --input public/models/parts/blade_orbit_halo.glb --output reports/validation/gltf-blade-orbit-halo.json`；`& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/render_catalog.py -- --target blade_orbit_halo`；`python scripts/make_contact_sheets.py --target blade_orbit_halo`；`npm --prefix preview exec playwright test`。
- **自动测试：** Validator error=0、warning=0；无代理对象；图像尺寸正确；三款预览全部断言通过且浏览器错误为 0。
- **预期输出：** Orbit Halo 视觉和浏览器证据完整。
- **失败停止条件：** 任一 GLB 警告、视觉缺失、加载失败或浏览器错误非 0 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 5 提交。
- **回滚或恢复方法：** 显式 `git restore` 四个修改文件；运行产物逐个明确路径处理。

### Task 5.4：执行全部现有回归并关闭 Stage 5

- **目标：** 验证 Storm、Iron、Orbit 及其夹具，同时保持 Storm Attack 语义基线。
- **修改文件：** `scripts/test_all.ps1`。
- **新增文件：** `reports/validation/stage5-quality-gate.json`（运行产物）。
- **前置条件：** Task 5.3 通过；所有接触复审有结论。
- **具体实现步骤：** 运行 Phase 2A 当前范围的规格、几何、接口、碰撞、重导入、Validator、渲染、浏览器与双指纹回归。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2AThroughOrbit`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope StormAttackRegression`。
- **自动测试：** 所有测试 PASS；FAIL=0；未解决 CONTACT_REVIEW=0；未确认 BINARY_DRIFT=0；SEMANTIC_REGRESSION=0。
- **预期输出：** Stage 5 质量门通过。
- **失败停止条件：** 任一阻断计数非 0 或任一回归失败时停止，不进入 Stage 6。
- **Git提交建议：** 质量门通过后创建 Stage 5 独立提交 `feat: add Orbit Halo quality slice`。
- **回滚或恢复方法：** 按 Stage 5 起点提交显式恢复本阶段文件，并重跑 Stage 4 门。

## 8. Stage 6：Dual Comet

### Task 6.1：实现 Dual Comet 独立轮廓生成器

- **目标：** 实现三组等距单元，让攻击坡面与圆弧卸力面交替形成双重节奏并保持视觉动平衡。
- **修改文件：** `blender/generate_parts.py`、`blender/lib/geometry.py`。
- **新增文件：** 无。
- **前置条件：** Stage 5 通过；Dual Comet 规格有效。
- **具体实现步骤：** 为 `dual_comet_alternating` 建立独立分派；每个等距单元包含一处攻击坡面和一处圆滑卸力面；参数全部来自 JSON；不复用 Storm 或 Iron 轮廓函数。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/generate_parts.py -- --part blade_dual_comet`。
- **自动测试：** 三组单元角间距一致；两类接触面交替；重心视觉平衡；非流形和零面积面为 0；三角面≤50000；材质≤6。
- **预期输出：** `blade_dual_comet.glb` 和对应 `.blend`。
- **失败停止条件：** 双重节奏不可辨、轮廓等同 Storm/Iron、依赖其他 Blade 轮廓函数或几何超限时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 6 提交 `feat: add Dual Comet quality slice`。
- **回滚或恢复方法：** `git restore -- blender/generate_parts.py blender/lib/geometry.py`；产物逐个明确路径处理。

### Task 6.2：Dual Comet 代理与测试夹具

- **目标：** 创建第八个且最后一个唯一代理并验证 `assembly_phase2a_dual_comet`。
- **修改文件：** `blender/lib/collision.py`、`blender/generate_assemblies.py`、`blender/validate_assemblies.py`。
- **新增文件：** Dual Comet 碰撞与装配验证 JSON（运行产物）。
- **前置条件：** Task 6.1 通过。
- **具体实现步骤：** 代理覆盖交替接触节奏并保持闭合；只替换 Main Blade；按五步碰撞流程验证并保存人工处理结论。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/validate_collision_proxies.py -- --part blade_dual_comet`；`& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/generate_assemblies.py -- --assembly assembly_phase2a_dual_comet`；`& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/validate_assemblies.py -- --assembly assembly_phase2a_dual_comet`。
- **自动测试：** 唯一代理总数达到 8；代理闭合且不导出；夹具 FAIL=0、未解决 CONTACT_REVIEW=0。
- **预期输出：** Dual Comet 代理与夹具报告通过。
- **失败停止条件：** 代理总数重复或不是 8、接口误判、意外重叠或缺少人工结论时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 6 提交。
- **回滚或恢复方法：** `git restore -- blender/lib/collision.py blender/generate_assemblies.py blender/validate_assemblies.py`。

### Task 6.3：Dual Comet GLB、视觉与预览

- **目标：** 验证 GLB，生成单款视觉输出，并把第四款 Blade 加入离线预览。
- **修改文件：** `blender/render_catalog.py`、`scripts/make_contact_sheets.py`、`preview/main.js`、`tests/browser/phase2a-preview.spec.mjs`。
- **新增文件：** Dual Comet 单视图、contact sheet 和浏览器截图（运行产物）。
- **前置条件：** Task 6.2 通过。
- **具体实现步骤：** 运行重导入与 Validator；渲染四个 512×512 单视图及 1536×1536 contact sheet；加入第四个模型 ID 和 Playwright 用例。
- **实际执行命令：** `node scripts/validate_gltf.mjs --input public/models/parts/blade_dual_comet.glb --output reports/validation/gltf-blade-dual-comet.json`；`& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/render_catalog.py -- --target blade_dual_comet`；`python scripts/make_contact_sheets.py --target blade_dual_comet`；`npm --prefix preview exec playwright test`。
- **自动测试：** Validator error=0、warning=0；无代理对象；图像尺寸正确；四款预览断言和错误通道检查全部通过。
- **预期输出：** Dual Comet 视觉、GLB 和浏览器证据完整。
- **失败停止条件：** 任一验证警告、视觉缺失、模型切换失败或浏览器错误非 0 时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 6 提交。
- **回滚或恢复方法：** 显式恢复四个修改文件，逐个处理新增运行产物。

### Task 6.4：执行全部回归并关闭 Stage 6

- **目标：** 在进入四款总质量门前，验证四枚 Blade 和四套夹具的当前状态。
- **修改文件：** `scripts/test_all.ps1`。
- **新增文件：** `reports/validation/stage6-quality-gate.json`（运行产物）。
- **前置条件：** Task 6.3 通过；所有 CONTACT_REVIEW 已处理。
- **具体实现步骤：** 运行当前全部 Phase 2A 自动验证和 Storm Attack 完整回归；汇总双指纹与阻断状态。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2AFourBlades`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope StormAttackRegression`。
- **自动测试：** FAIL=0；未解决 CONTACT_REVIEW=0；未确认 BINARY_DRIFT=0；SEMANTIC_REGRESSION=0；Validator error/warning=0。
- **预期输出：** Stage 6 质量门为 `PASS`。
- **失败停止条件：** 任一计数不为 0 或 Storm Attack 语义基线变化时停止，不进入 Stage 7。
- **Git提交建议：** 质量门通过后创建 Stage 6 独立提交 `feat: add Dual Comet quality slice`。
- **回滚或恢复方法：** 按 Stage 6 起点提交显式恢复本阶段文件，并重跑 Stage 5 门。

## 9. Stage 7：四款 Blade 质量门

### Task 7.1：统一生成四款单视图和 contact sheet

- **目标：** 用相同相机、比例、光照、背景和尺寸生成四款 Blade 的完整视觉证据。
- **修改文件：** `blender/render_catalog.py`、`scripts/make_contact_sheets.py`。
- **新增文件：** 四款 `top`、`perspective_45`、`side`、`silhouette` 和 `contact_sheet` 运行产物。
- **前置条件：** Stage 6 通过；固定视觉参数已写入脚本。
- **具体实现步骤：** 逐款重新渲染四个 512×512 单视图；生成四张 1536×1536 contact sheet；验证相机与渲染配置哈希一致。
- **实际执行命令：** `& "D:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/render_catalog.py -- --target phase2a_all_blades`；`python scripts/make_contact_sheets.py --scope phase2a`。
- **自动测试：** 20 个要求输出全部存在且尺寸正确；四款相机、比例、光照和背景参数一致；文件非空。
- **预期输出：** 四款单视图和四份 contact sheet 完整生成。
- **失败停止条件：** 任一视图缺失、分辨率错误或比较条件不一致时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 7 提交 `test: enforce four-blade Phase 2A quality gate`。
- **回滚或恢复方法：** `git restore -- blender/render_catalog.py scripts/make_contact_sheets.py`；输出逐个明确路径处理。

### Task 7.2：生成总剪影、对比图和重叠启发式

- **目标：** 生成四款轮廓并排证据及两两剪影重叠率，不把指标表述为法律原创性证明。
- **修改文件：** `scripts/make_contact_sheets.py`。
- **新增文件：** `scripts/analyze_silhouettes.py`、`reports/renders/all_blades_silhouette.png`、`reports/renders/all_blades_comparison.png`、`reports/validation/blade-silhouette-overlap.json`（运行产物）。
- **前置条件：** Task 7.1 通过。
- **具体实现步骤：** 生成 2048×512 总剪影和 2048×2048 对比图；对二值剪影计算六组两两重叠率；报告中固定标注“内部启发式，非法律证明”。
- **实际执行命令：** `python scripts/analyze_silhouettes.py --input reports/renders --output reports/validation/blade-silhouette-overlap.json`。
- **自动测试：** 两张总图尺寸正确；六组配对齐全且数值在 0 到 1；免责声明存在；四款顺序固定。
- **预期输出：** 三个总质量门视觉文件可供人工复审。
- **失败停止条件：** 配对缺失、图像条件不一致、指标越界或缺少免责声明时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 7 提交。
- **回滚或恢复方法：** `git restore -- scripts/make_contact_sheets.py`；新增脚本和运行产物逐个明确路径处理。

### Task 7.3：执行四套夹具碰撞总验证

- **目标：** 对四个 Phase 2A 测试夹具执行统一接口与碰撞代理验证。
- **修改文件：** `scripts/test_all.ps1`、`blender/validate_collision_proxies.py`。
- **新增文件：** `reports/assembly_matrix.csv` 更新内容、`reports/validation/phase2a-collision-summary.json`（运行产物）。
- **前置条件：** Task 7.2 通过；八个唯一代理全部闭合。
- **具体实现步骤：** 逐夹具执行 NSS-V1 接口验证；再执行 AABB、BVH、三角面相交、体素估算和报告；逐条保存 CONTACT_REVIEW 人工结论。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2AFixtures`。
- **自动测试：** 夹具数=4；FAIL=0；未解决 CONTACT_REVIEW=0；每条复审都有处理人、时间、依据和结论；代理唯一零件数=8。
- **预期输出：** 装配矩阵四条 Phase 2A 记录和碰撞汇总均通过。
- **失败停止条件：** 夹具数错误、合法接口误判、FAIL 非 0、未解决 CONTACT_REVIEW 非 0 或结论字段不完整时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 7 提交。
- **回滚或恢复方法：** `git restore -- scripts/test_all.ps1 blender/validate_collision_proxies.py reports/assembly_matrix.csv`；新增汇总逐个明确路径处理。

### Task 7.4：执行四款浏览器总验证

- **目标：** 量化验证四款 Blade 切换与全部交互，并保存四张预览截图和总报告。
- **修改文件：** `tests/browser/phase2a-preview.spec.mjs`。
- **新增文件：** 四款预览截图及更新后的 `reports/validation/browser-test.json`（运行产物）。
- **前置条件：** Task 7.3 通过；离线服务可启动。
- **具体实现步骤：** 数据驱动遍历四个模型 ID；断言 Canvas、拖动、缩放和重置；监听三类浏览器错误；阻断任何外部请求。
- **实际执行命令：** `npm --prefix preview exec playwright test`。
- **自动测试：** 四款全部通过；console error=0、pageerror=0、failed request=0；截图各一张且尺寸一致。
- **预期输出：** `browser-test.json` 总体结果为 `PASS`。
- **失败停止条件：** 任一模型、交互、截图或错误通道断言失败时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 7 提交。
- **回滚或恢复方法：** `git restore -- tests/browser/phase2a-preview.spec.mjs`；运行产物逐个明确路径处理。

### Task 7.5：执行最终自动质量门并提交 Stage 7

- **目标：** 汇总规格、生成、几何、接口、碰撞、重导入、Validator、视觉、浏览器和 Storm Attack 双指纹回归。
- **修改文件：** `scripts/build_all.ps1`、`scripts/test_all.ps1`。
- **新增文件：** `reports/validation/phase2a-quality-gate.json`（运行产物）。
- **前置条件：** Task 7.1 至 7.4 全部通过。
- **具体实现步骤：** 执行严格限定为四枚 Blade 和四套夹具的总流水线；检查所有阻断计数；验证 Storm Attack 语义基线不变；不生成范围外零件或 288 组合。
- **实际执行命令：** `powershell -ExecutionPolicy Bypass -File scripts/build_all.ps1 -Scope Phase2A`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2A`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope StormAttackRegression`。
- **自动测试：** 四枚 Blade 生成成功；四套夹具通过；FAIL=0；未解决 CONTACT_REVIEW=0；未确认 BINARY_DRIFT=0；SEMANTIC_REGRESSION=0；Validator error=0、warning=0；Playwright 全通过。
- **预期输出：** `phase2a-quality-gate.json` 为 `PASS`，但不宣称 Phase 2A 完成。
- **失败停止条件：** 任一验收计数不为 0、Storm Attack 语义变化、出现范围外产物或任何实际命令未执行时停止。
- **Git提交建议：** 质量门通过后创建 Stage 7 独立提交 `test: enforce four-blade Phase 2A quality gate`。
- **回滚或恢复方法：** 按 Stage 7 起点提交显式恢复两个脚本和本阶段文件，再逐项重跑 Stage 6 门。

## 10. Stage 8：最终报告与人工评审交接

### Task 8.1：汇总 Phase 2A 验证与统计

- **目标：** 形成可追溯的自动验证总报告。
- **修改文件：** `blender/lib/reporting.py`。
- **新增文件：** `reports/validation/phase2a-summary.json`、`reports/phase2a-validation-summary.md`（运行产物）。
- **前置条件：** Stage 7 通过，所有原始报告可读。
- **具体实现步骤：** 汇总四枚 Blade 的尺寸、三角面、材质；四套夹具碰撞；双指纹；Validator；Playwright；人工 CONTACT_REVIEW/BINARY_DRIFT 处理结论；记录每条实际命令和退出码。
- **实际执行命令：** `python scripts/verify_phase2a_baseline.py --report-only`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2AReport`。
- **自动测试：** JSON 和 Markdown 数据一致；四枚 Blade、四套夹具和六个基线 GLB 均有记录；阻断计数全为 0。
- **预期输出：** 两份汇总报告完整且可追溯。
- **失败停止条件：** 任一统计缺失、报告互相矛盾、处理结论缺失或命令证据不完整时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 8 提交 `docs: hand off Phase 2A visual review`。
- **回滚或恢复方法：** `git restore -- blender/lib/reporting.py`；两个运行产物逐个明确路径处理。

### Task 8.2：生成视觉文件索引和人工评审清单

- **目标：** 明确列出全部视觉证据与尚需人工判断的问题。
- **修改文件：** 无。
- **新增文件：** `reports/renders/phase2a-visual-index.md`、`reports/validation/phase2a-human-review.json`（运行产物）。
- **前置条件：** Task 8.1 通过；所有视觉文件存在。
- **具体实现步骤：** 索引四款单视图、contact sheet、总剪影、总对比和浏览器截图；列出轮廓差异、接触节奏、视觉动平衡、材质层级和原创性观感等人工判断项；引用所有人工处理结论。
- **实际执行命令：** `python scripts/analyze_silhouettes.py --verify-index reports/renders/phase2a-visual-index.md`。
- **自动测试：** 索引链接全部存在；每款至少五个设计渲染和一个浏览器截图；人工问题未被自动指标替代。
- **预期输出：** 评审者可从索引访问全部证据，状态仍为等待人工评审。
- **失败停止条件：** 文件索引断链、人工问题遗漏或把剪影重叠率宣称为原创性法律证明时停止。
- **Git提交建议：** 暂不单独提交，纳入 Stage 8 提交。
- **回滚或恢复方法：** 两个新增文件逐个明确路径处理，不影响模型产物。

### Task 8.3：范围终审、状态交接与 Stage 8 提交

- **目标：** 确认实施未越界，并将唯一最终状态标记为 `Phase 2A awaiting visual review`。
- **修改文件：** `reports/phase2a-validation-summary.md`。
- **新增文件：** 无。
- **前置条件：** Task 8.1 和 8.2 通过；所有自动门已关闭。
- **具体实现步骤：** 审计是否修改 NSS-V1、是否生成其他零件、是否运行 288 组合、是否遗漏 Storm 回归/CONTACT_REVIEW/许可证；写入唯一允许的最终状态和禁止声明清单。
- **实际执行命令：** `git diff --name-only f55e260..HEAD`；`git diff -- specs/interfaces.json`；`python scripts/validate_specs.py --scope phase2a`；`powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2AFinalAudit`。
- **自动测试：** NSS-V1 diff 为空；范围外零件与 288 组合计数为 0；许可证存在；回归和人工结论齐全；最终状态精确匹配。
- **预期输出：** 状态为 `Phase 2A awaiting visual review`，不出现 `Phase 2A complete`、全部 MVP 完成、可用于实体高速战斗、可制造或安全认证通过等声明。
- **失败停止条件：** 任何范围违规、NSS-V1 修改、遗漏证据或禁止声明出现时停止，不创建提交。
- **Git提交建议：** 终审通过后创建 Stage 8 独立提交 `docs: hand off Phase 2A visual review`，然后等待人工视觉评审。
- **回滚或恢复方法：** `git restore -- reports/phase2a-validation-summary.md`，保持 Stage 7 已验证状态并重新准备交接。

## 11. 阶段提交序列

实施时只在对应阶段全部通过后按顺序创建以下九个独立提交：

1. Stage 0：`chore: establish Phase 2A environment and fingerprint gate`
2. Stage 1：`feat: define Phase 2A blade and fixture specs`
3. Stage 2：`feat: add closed collision proxy validation`
4. Stage 3：`feat: add Iron Bastion quality slice`
5. Stage 4：`feat: add offline Phase 2A GLB preview`
6. Stage 5：`feat: add Orbit Halo quality slice`
7. Stage 6：`feat: add Dual Comet quality slice`
8. Stage 7：`test: enforce four-blade Phase 2A quality gate`
9. Stage 8：`docs: hand off Phase 2A visual review`

任何阶段失败时不得创建该阶段提交，也不得跳到下一阶段。

## 12. 计划自身范围审计

执行前必须再次确认：

1. 计划只覆盖四枚 Main Blade、现有五零件的碰撞代理、四套测试夹具、离线预览、验证和评审交接。
2. 没有修改 `specs/interfaces.json` 或 NSS-V1 参数的任务。
3. Stage 2、3、4、5、6、7 均包含 Storm Attack 回归要求。
4. 所有 `CONTACT_REVIEW` 都必须保存人工处理结论，未解决项阻止通过。
5. 离线 Three.js 固定为 0.185.1，并保留 VERSION、LICENSE、GLTFLoader 和 OrbitControls；不使用 Draco。
6. 没有生成其他 Core、Assist Ring、Height Gear、Performance Tip、全部 16 零件或 288 组合的任务。
7. 每个任务都要求实际命令、自动测试、预期输出和失败停止条件，实施结果不能以代码存在代替。

本计划获确认前不开始 Stage 0；本计划的编写不代表任何实现、Blender 运行、模型生成或 GLB 验证已经完成。
