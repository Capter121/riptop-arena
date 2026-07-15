# Phase 2B-R1 局部视觉修订实施计划

日期：2026-07-15  
依据：`docs/superpowers/specs/2026-07-15-phase-2b-r1-local-visual-revision-design.md`  
状态：已批准，等待顺序执行

## 1. 范围控制

只允许修改三个目标零件的规格、专属几何分支、R1 专用测试与视觉脚本，以及最小 Assist Focus 预览。不得修改 NSS-V1、其他零件可见几何、批准基线或 288 组合逻辑。

所有 Stage 顺序执行。任一命令非零退出、出现 `FAIL`、未解决 `CONTACT_REVIEW`、未确认 `BINARY_DRIFT` 或 `SEMANTIC_REGRESSION` 时立即停止。

## 2. Stage 0：冻结修订前证据

### Task 0.1 捕获 R1 前状态

- 目标：保存起点提交、工具版本、三个目标规格、GLB 双指纹、统计和 before 视觉材料。
- 修改文件：无现有实现文件。
- 新增文件：`reports/validation/phase2b-r1-baseline.json`、`reports/renders/phase2b-r1/before/`。
- 前置条件：工作树中 `battle-top-designer` 无未提交修改，起点为 `9eed2cb560a7f86c43b5334fb1f41a01b76c552e`。
- 实现：编写只读捕获脚本，复制当前批准产物并记录 SHA-256；不得重新生成 before 模型。
- 命令：`python scripts/capture_phase2b_r1_baseline.py`。
- 自动测试：JSON 可解析、三个目标和全部未修改零件指纹齐全、before 图片存在且非空。
- 预期：`result=PASS`，目标零件数 3，未修改零件数 13。
- 停止条件：缺失 GLB、指纹或修订前图片。
- 恢复：删除单个错误输出后重新捕获；不得批量删除目录。

## 3. Stage 1：Dual Comet

### Task 1.1 扩展规格与语义校验

- 修改文件：`specs/parts/blade_dual_comet.json`、`schemas/part.schema.json`、`scripts/validate_specs.py`。
- 实现：加入明确角宽和内环顶部参数，验证三单元、角宽合计和半径/高度顺序。
- 命令：`python scripts/validate_specs.py --scope phase2a`。
- 预期：Schema 和语义错误均为 0。
- 停止条件：任何非目标规格变化或验证失败。

### Task 1.2 实现严格周期几何

- 修改文件：`blender/lib/geometry.py`。
- 实现：用同一局部 120°采样复制三次；不修改其他 profile 分支。
- 命令：Blender 仅生成 `blade_dual_comet` 和 `assembly_phase2a_dual_comet`。
- 自动测试：几何、代理、装配、GLB 重导入和 Validator。
- 预期：非流形 0、Validator error/warning 0、碰撞 0。
- 停止条件：任何几何、碰撞或导出失败。

### Task 1.3 对称与视觉门

- 新增文件：`scripts/analyze_phase2b_r1_symmetry.py`、R1 Dual 视觉输出和对称 JSON。
- 实现：2048²剪影计算质心、120°和 240° IoU，生成 before/after 与旋转重叠图。
- 命令：R1 渲染后运行分析脚本。
- 预期：偏移 ≤0.25 mm；两项 IoU ≥0.97。
- 停止条件：任一指标不达标。

### Task 1.4 回归门

- 命令：Storm Attack、Phase 2A 批准基线和三枚未修改 Blade 回归。
- 预期：语义指纹不变，未确认漂移 0。
- 停止条件：任何未批准变化。

## 4. Stage 2：Heavy

### Task 2.1 Heavy 规格和专属函数

- 修改文件：`specs/parts/assist_heavy.json`、Schema、语义校验、`blender/lib/geometry.py`。
- 实现：新增 `heavy_continuous_mass_band`；外半径 34.2 mm、连续质量带、完整侧壁，高度与安装点不变。
- 命令：仅生成 Heavy 和 `assembly_storm_attack`。
- 自动测试：规格、几何、代理、装配、GLB、Validator。
- 预期：全部 PASS，非目标零件语义不变。
- 停止条件：碰撞、CONTACT_REVIEW、Storm Attack 非目标回归或不可见质量带。

## 5. Stage 3：Guard

### Task 3.1 Guard 规格和专属函数

- 修改文件：`specs/parts/assist_guard.json`、Schema、语义校验、`blender/lib/geometry.py`。
- 实现：8 个等距圆角缓冲块和 2.8 mm 真实凹槽，不复用 Heavy 外形。
- 命令：仅生成 Guard 和 `assembly_phase2b_assist_guard`。
- 自动测试：规格、几何、代理、装配、GLB、Validator、去色侧视对比。
- 预期：全部 PASS，Heavy 与 Guard 侧视节奏不同。
- 停止条件：浅刻线式结果、碰撞或验证失败。

## 6. Stage 4：Air 和未修改零件回归

### Task 4.1 Air 不变验证

- 修改文件：无 Air 规格或几何文件。
- 命令：验证 Air 规格、GLB、碰撞、视觉和语义指纹。
- 预期：Air `semantic_fingerprint` 与 R1 前一致。
- 停止条件：Air 发生任何未批准变化。

### Task 4.2 全部未修改零件回归

- 命令：核对 13 个未修改零件、Phase 2A 基线和 Storm Attack 非目标对象。
- 预期：语义回归 0、未确认二进制漂移 0。
- 停止条件：任一回归失败。

## 7. Stage 5：最小 Assist Focus

### Task 5.1 实现聚焦交互

- 修改文件：`preview/index.html`、`preview/main.js`、必要的 `preview/styles.css`。
- 实现：三个 Assist fixture 切换、上移 6 mm、Blade 0.22 透明度、800 ms 高亮、固定 45°、恢复、补光、默认隐藏坐标轴。
- 限制：不增加完整定制器、配色器或任意装配编辑。
- 停止条件：需要扩大预览架构或修改 GLB 才能实现。

### Task 5.2 Playwright 量化测试

- 新增文件：`tests/browser/phase2b-r1-assist-focus.spec.mjs`。
- 命令：本地 Playwright CLI 只运行 R1 测试。
- 预期：位移、透明度、高亮、相机、恢复和错误断言全部通过；截图 3 张。
- 停止条件：任何浏览器错误、失败请求、外部请求或恢复误差超限。

## 8. Stage 6：视觉材料与最终门禁

### Task 6.1 R1 视觉包

- 新增文件：R1 专用 Blender 渲染脚本和合成脚本。
- 输出：设计文档第 8 节全部视觉材料与 `reports/renders/phase2b-r1/index.md`。
- 自动测试：文件存在、非空、尺寸正确，相机和渲染条件一致。
- 停止条件：任何必需视图缺失。

### Task 6.2 汇总报告

- 新增文件：`reports/phase2b-r1-validation-summary.md`、`reports/validation/phase2b-r1-summary.json`、`reports/validation/phase2b-r1-human-review.json`。
- 内容：参数、统计、对称、碰撞、双指纹、浏览器、视觉索引和盲评待办。
- 预期状态：`Phase 2B-R1 awaiting visual re-review`。
- 停止条件：出现批准、完成、Phase 2C、制造或安全认证声明。

### Task 6.3 最终审计与提交

- 检查：范围差异、NSS-V1、批准基线、288 逻辑、未修改零件、JSON、Markdown、图片和全部命令退出码。
- Git：只暂存 R1 文件，创建独立提交并报告完整哈希。
- 恢复：使用独立提交反向恢复；禁止 destructive reset。
