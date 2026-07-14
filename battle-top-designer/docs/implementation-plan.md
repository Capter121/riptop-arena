# Nova Spin System MVP：垂直切片实施计划

## 1. 计划目标

先打通一个可复现、可验证的最小闭环，再决定是否扩展到全部 16 个零件。

本计划只实施：

- 第一枚代表性零件：`blade_storm_fang`。
- 第一套完整组合：`assembly_storm_attack`。
- 组成该组合所需的 5 个零件规格与低细节生产几何。
- Schema、NSS-V1、材质、生成、装配、碰撞、GLB、重新导入和目录渲染的最小闭环。
- 实际运行 Blender 并保存终端日志和验证报告。

本计划不实施：

- 其余 11 个零件。
- 其余 3 套正式组合。
- 288 种全组合矩阵。
- 全量目录渲染。
- 动力学、制造公差、安全认证或复杂浮雕。

垂直切片通过并经用户复审后，另建全量扩展计划。

## 2. 权威来源与优先级

实现依据按以下优先级解释：

1. `docs/nova-spin-system-mvp-design.md`
2. 用户后续明确批准的变更
3. `docs/originality-checklist.md`
4. `docs/design-language.md`
5. `docs/reference-analysis.md`

封板规格已把主刃改为 Storm Fang 三刃、Iron Bastion 八刃、Orbit Halo 四刃、Dual Comet 六区交替。旧文档仍有五区/七湾/九脉/`2+3` 描述；实施前必须先消除该冲突。

## 3. 当前环境基线

- 工作目录：`E:\战斗陀螺项目\battle-top-designer`
- Python：3.12.10
- `jsonschema`：4.26.0，已安装
- Blender：`D:\Program Files\Blender Foundation\Blender 4.5\blender.exe`，已确认存在
- Node.js：v22.20.0
- npm：11.7.0
- Khronos `gltf_validator.exe`：未安装
- `gltf-validator` NPM 包：未安装

Validator 采用官方 `gltf-validator@2.0.0-dev.3.10`，安装到 `battle-top-designer/build/tools/gltf-validator/`，不得修改根项目的 `package.json` 或 `package-lock.json`。如果网络安装失败，则停止在 Validator 依赖闸门，报告官方 EXE 与 NPM 两种安装方式，不得跳过验证。

## 4. 全局执行规则

- 严格按步骤执行；当前步骤验证成功后才能进入下一步。
- 每个阶段都保存命令、退出码、标准输出和错误输出到 `build/logs/`。
- 任一必需测试失败即停止，不得把任务标记为完成。
- 不批量删除任何目录或文件；只允许逐个覆盖明确目标文件。
- 不修改工作区中与 `battle-top-designer` 无关的现有改动。
- 不把参考图片、文件名、Logo、徽章或贴图导入 Blender 或 GLB。
- 规格中的毫米在进入 Blender 时统一乘以 `0.001`。
- 所有生成必须确定性；随机数只能使用 JSON 中的 `generation.seed`。
- Blender 发现顺序遵循封板规格；找不到时输出检查过的路径并失败。

## 5. 分步实施

【步骤 1】消除设计文档冲突

目标：

- 修订 `docs/design-language.md` 和 `docs/originality-checklist.md` 中旧的五区、七湾、九脉和 `2+3` 专用约束。
- 改为封板规格中的三枚 Upper 刃、八枚圆滑防御刃、四枚低阻流线刃和六区攻击/卸力交替。
- 保留通用原创性规则，不改动参考分析事实。

涉及文件：

- `docs/design-language.md`
- `docs/originality-checklist.md`

验证：

```powershell
Select-String -Path docs\design-language.md,docs\originality-checklist.md -Pattern '五个非等宽|七段低幅|九个低幅|2\+3'
```

接受标准：

- 旧专用约束匹配数为 0。
- 四款主刃的新刃数和接触语义与封板规格一致。
- 通用原创性禁止项未被削弱。

停止条件：

- 任一文档仍要求互斥的刃数或轮廓。

【步骤 2】建立最小目录和依赖闸门

目标：

- 仅创建垂直切片必需的目录。
- 建立 README 与项目级 AGENTS 约束，明确禁止批量删除、禁止参考素材进入模型。
- 固定 Validator 的项目本地安装路径。

涉及路径：

- `AGENTS.md`
- `README.md`
- `schemas/`
- `specs/parts/`
- `blender/lib/`
- `build/blend/`
- `build/temporary/`
- `build/logs/`
- `reports/renders/`
- `reports/validation/`
- `public/models/parts/`
- `public/models/assemblies/`

依赖命令：

```powershell
python -c "import jsonschema; print('jsonschema available')"
npm install --prefix build/tools/gltf-validator --no-save --package-lock=false gltf-validator@2.0.0-dev.3.10
```

验证：

- Python Schema 库可导入。
- 项目本地 Validator 包版本严格为 `2.0.0-dev.3.10`。
- 根项目 `package.json` 与 `package-lock.json` 不因本步骤产生新差异。
- Blender 可执行文件存在。

停止条件：

- Validator 不能安装且没有可用官方 EXE。
- 安装命令意外修改根项目依赖文件。

【步骤 3】创建严格 Schema 与规格验证器

目标：

- 创建四份严格 JSON Schema。
- 创建 `scripts/validate_specs.py`，执行 Schema 和跨文件语义验证。
- 先只支持当前垂直切片中存在的规格，不硬编码最终必须有 16 个零件。

涉及文件：

- `schemas/part.schema.json`
- `schemas/interface.schema.json`
- `schemas/material.schema.json`
- `schemas/assembly.schema.json`
- `scripts/validate_specs.py`

Schema 要求：

- 所有对象层级使用 `additionalProperties: false`。
- 明确 `required`、`enum`、`const`、`pattern`、数组长度和数值范围。
- `schema_version` 固定为 `1.0`。
- ID 匹配 `^[a-z][a-z0-9_]*$`。
- `part_type`、`spin_direction`、接口角色和 alpha 模式使用枚举。
- 颜色值限制在 0–1，尺寸必须为正值，角度使用明确范围。

语义验证：

- ID 唯一。
- 材质、接口和组合引用存在。
- `mounts.top.position_mm[2] > mounts.bottom.position_mm[2]`。
- 公母角色、允许连接关系和零件层级正确。
- 刃数为正整数。
- 组合的五类零件各且仅有一个。

验证：

```powershell
python scripts\validate_specs.py --self-test
```

接受标准：

- 内置有效样本通过。
- 拼错字段、字符串刃数、缺失引用和错误连接顺序都被拒绝。
- 报告写入 `reports/validation/spec-self-test.json`。

停止条件：

- 任一已知无效样本被错误接受。

【步骤 4】创建 NSS-V1、材质和 Storm Fang 规格

目标：

- 用 JSON 建立公共接口和最小材质目录。
- 创建第一枚生产零件 `blade_storm_fang` 的完整规格。
- 造型参数只存在于 JSON，不写入 Blender 生成器。

涉及文件：

- `specs/interfaces.json`
- `specs/materials.json`
- `specs/parts/blade_storm_fang.json`

Storm Fang 必需参数：

- 右旋、三枚等距 Upper 刃。
- 基准半径 27 mm，最大半径 36 mm，高 4.8 mm。
- 刃角 24°。
- `NSS-V1` 顶部和底部安装完整变换。
- 原创性禁止项、工程状态、seed 与生成器版本。

验证：

```powershell
python scripts\validate_specs.py --scope blade_storm_fang
```

接受标准：

- Schema 错误、重复 ID、缺失引用和非法数值均为 0。
- 报告写入 `reports/validation/spec-blade_storm_fang.json`。
- JSON 不包含参考产品名称、图片路径或贴图字段。

停止条件：

- Blender 代码必须提供任何零件专属默认值才能解释规格。

【步骤 5】实现共享几何、材质、接口和导出最小库

目标：

- 实现支持 Storm Fang 的最小通用库。
- 直接构造封闭网格，不使用布尔修改器。
- 生成全局唯一安装点、自定义属性和非导出碰撞代理。

涉及文件：

- `blender/lib/geometry.py`
- `blender/lib/materials.py`
- `blender/lib/interfaces.py`
- `blender/lib/exporter.py`
- `blender/lib/reporting.py`
- `blender/generate_parts.py`
- `blender/validate_geometry.py`

最小 API：

- `create_radial_mesh(spec)`
- `finalize_mesh(obj)`
- `create_principled_material(material_spec)`
- `create_nss_v1_mounts(part_spec, interface_spec)`
- `validate_part_geometry(part_collection)`
- `export_part_glb(part_collection, output_path)`

验证：

- Python 文件可以由 Blender 加载，无循环导入。
- 搜索 Blender 代码不得出现 Storm Fang 的 `3`、`27`、`36`、`4.8`、`24` 作为零件造型常量。
- 所有生产对象位于 `PART_blade_storm_fang` Collection。
- 安装点命名为 `MOUNT_blade_storm_fang_TOP/BOTTOM`。

停止条件：

- 需要使用破坏性布尔才能闭合网格。
- 生成器依赖参考图片或零件专属硬编码。

【步骤 6】实际生成并验证第一枚零件

目标：

- 使用本机 Blender 后台模式实际生成 `blade_storm_fang.glb`。
- 完成几何、变换、重新导入和 Khronos Validator 测试。

执行命令：

```powershell
& 'D:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python blender/generate_parts.py -- --part blade_storm_fang
& 'D:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python blender/validate_geometry.py -- --part blade_storm_fang --reimport public/models/parts/blade_storm_fang.glb
```

Khronos Validator 由 `scripts/test_all.ps1 -Scope Part -Id blade_storm_fang` 调用项目本地官方包的 `validateBytes` API。

输出：

- `public/models/parts/blade_storm_fang.glb`
- `reports/validation/geometry-blade_storm_fang.json`
- `reports/validation/gltf-blade_storm_fang.json`
- `build/logs/generate-blade_storm_fang.log`
- `build/logs/validate-blade_storm_fang.log`

验证：

- 检查两个 Blender 命令和 Validator 的退出码。
- 读取几何、重新导入和 glTF JSON 报告。
- 核对 GLB 文件头、字节数、对象名、尺寸、法线、变换、三角面和材质数。

接受标准：

- Blender 两个命令退出码均为 0。
- GLB 文件大于 0，官方 Validator errors = 0。
- 有效网格对象至少 1。
- 非流形边、重复顶点、松散顶点和零面积面为 0。
- 法线正确，Scale 为 1，Rotation 为 0。
- 三角面不超过 50,000，材质不超过 6。
- GLB 重新导入后尺寸、Z 轴、对象名和材质数不变。

停止条件：

- 任一接受标准失败。
- 不允许通过关闭验证或降低硬上限继续。

【步骤 7】完成 Storm Attack 所需的四个剩余零件

目标：

- 只补齐第一套组合需要的 `core_solar_wolf`、`assist_heavy`、`gear_low` 和 `tip_flat_attack`。
- 扩展通用生成器以支持放射核心、环形件和旋转剖面。

涉及文件：

- `specs/parts/core_solar_wolf.json`
- `specs/parts/assist_heavy.json`
- `specs/parts/gear_low.json`
- `specs/parts/tip_flat_attack.json`
- `blender/lib/geometry.py`

验证：

```powershell
python scripts\validate_specs.py --scope assembly_storm_attack
& 'D:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python blender/generate_parts.py -- --assembly-parts assembly_storm_attack
```

接受标准：

- 5 个垂直切片零件分别生成独立 GLB。
- 每个零件通过与步骤 6 相同的几何和重新导入检查。
- 各零件满足本类型建议预算；任何零件不超过 50,000 三角面和 6 个材质。

停止条件：

- 为新增零件复制整套生成函数而不是扩展通用算法。

【步骤 8】生成并验证第一套完整组合

目标：

- 创建 Storm Attack 组合规格。
- 按完整 mount 变换、角色和定向键装配五个零件。
- 使用 AABB、低面数碰撞代理和合法嵌合白名单进行检测。

涉及文件：

- `specs/assemblies.json`
- `blender/lib/assembly.py`
- `blender/lib/collision.py`
- `blender/generate_assemblies.py`
- `blender/validate_assemblies.py`

执行命令：

```powershell
& 'D:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python blender/generate_assemblies.py -- --assembly assembly_storm_attack
& 'D:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python blender/validate_assemblies.py -- --assembly assembly_storm_attack
```

输出：

- `public/models/assemblies/assembly_storm_attack.glb`
- `build/blend/exploded_storm_attack.blend`
- `reports/assembly_matrix.csv`，垂直切片阶段只有一行组合结果
- `reports/validation/assembly-storm-attack.json`

验证：

- 读取装配报告和 `assembly_matrix.csv` 的 Storm Attack 行。
- 重新导入 assembled GLB，核对五个零件、安装点、自定义属性和包络。
- 运行官方 Validator 并保存 JSON 报告。

接受标准：

- 接口均为 NSS-V1，连接顺序和公母角色正确。
- 中心轴偏差 ≤ 0.02 mm。
- 安装面误差 ≤ 0.02 mm。
- 相位误差 ≤ 0.1°。
- 合法嵌合区排除后，意外重叠体积 ≤ 0.5 mm³。
- 总三角面建议 ≤ 120,000，硬上限 ≤ 150,000。
- assembled GLB 重新导入成功且官方 Validator errors = 0。

停止条件：

- 通过放宽接口容差或把非接口区域加入白名单掩盖穿模。

【步骤 9】生成最小视觉复审产物

目标：

- 渲染第一枚主刃和第一套组合的固定视图。
- 用纯黑剪影检查 Storm Fang 是否只是参考轮廓换色。

涉及文件：

- `blender/render_catalog.py`

执行命令：

```powershell
& 'D:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python blender/render_catalog.py -- --part blade_storm_fang --assembly assembly_storm_attack
```

输出：

- Storm Fang 俯视、45°、侧视和黑色剪影 PNG。
- Storm Attack 45°、俯视、侧视和九宫格。
- `reports/renders/assembly_storm_attack_exploded.png`。

验证：

- 检查所有预期 PNG 存在、尺寸为 1024×1024 且非空。
- 检查渲染场景没有参考图片、外部纹理、相机透视误用或透明背景。
- 对 Storm Fang 黑色剪影执行原创性清单人工复审。

接受标准：

- 1024×1024 PNG、浅灰背景、AgX、固定三点光、阴影开启。
- 目录视图使用正交相机；拆解图允许轻微透视。
- 无参考贴图、Logo 或角色徽章。
- 黑色剪影满足原创性清单；若无法明确区分，暂停并修改 JSON 轮廓参数。

停止条件：

- 需要靠颜色而非一级轮廓区分设计。

【步骤 10】运行垂直切片总构建与总测试

目标：

- 创建只针对垂直切片的 PowerShell 编排入口。
- 从空 Blender 场景重复执行同一闭环并生成可追踪清单。

涉及文件：

- `scripts/build_all.ps1`
- `scripts/test_all.ps1`
- `reports/validation/build-manifest.json`
- `reports/validation/summary.json`
- `reports/validation/full-report.md`

执行命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_all.ps1 -Scope VerticalSlice
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope VerticalSlice
```

验证：

- 检查两个 PowerShell 入口的退出码和完整日志。
- 交叉核对 summary、full report、manifest、GLB、PNG 和 assembly matrix。
- 对 manifest 中的规格哈希和输出哈希重新计算抽查。

接受标准：

- 两个脚本退出码均为 0。
- Manifest 标明 `build_scope: vertical_slice`，不得伪报 16/4/288 已完成。
- Manifest 记录 5 个零件、1 套组合、规格 SHA-256、输出 SHA-256、Blender 版本和生成器版本。
- 当前预期输出、实际输出和上一轮输出完成比较。
- 无未处理的 `STALE` 文件。
- 完整终端输出保存在 `build/logs/` 并在最终报告中摘要列出。

停止条件：

- 报告把垂直切片标成完整 MVP PASS。
- 任一子命令失败但编排脚本仍返回 0。

## 6. 垂直切片完成标准

本计划只有满足以下全部条件才算完成：

1. 文档中的四款主刃定义不再互相矛盾。
2. 严格 Schema 和语义验证器通过自测。
3. NSS-V1 由 JSON 生成，没有复制现有接口。
4. Storm Fang 及 Storm Attack 的另外四个零件成功生成。
5. 5 个零件 GLB 和 1 个 assembled GLB 通过几何、重新导入和官方 Validator。
6. 第一套组合的轴线、安装面、相位和碰撞检查通过。
7. Storm Attack 拆解 `.blend` 与 PNG 生成。
8. Storm Fang 黑色剪影通过原创性复审。
9. VerticalSlice 构建和测试脚本退出码均为 0。
10. 报告明确本阶段不是完整 16/4/288 MVP。

## 7. 垂直切片之后

本计划完成后暂停，向用户提交：

- 实际 Blender 终端输出。
- 5 个零件与 1 个组合的验证摘要。
- Storm Fang 剪影和 Storm Attack 九宫格。
- 失败、警告、STALE 和尚未验证项。

只有用户确认垂直切片后，才创建下一份全量扩展计划，覆盖其余 11 个零件、3 套组合、288 种装配矩阵、20 个最终 GLB 和全量目录渲染。
