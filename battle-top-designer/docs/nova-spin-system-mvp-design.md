# Nova Spin System MVP 实现设计

## 1. 目标

创建一套由 JSON 驱动、使用 Blender Python API 生成的原创模块化战斗陀螺系统。接口版本为 `NSS-V1`。第一阶段生成 16 个零件、4 套正式组合、1 个拆解场景、目录渲染和四层自动验证报告。

本系统只使用从参考资料抽象出的设计规律，不复制现有产品的名称、Logo、徽章、贴图、精确轮廓、配色组合或机械接口。参考图片不进入 Blender 文件、材质或 GLB。

## 2. 范围

### 2.1 第一阶段零件

- Emblem Core：`core_solar_wolf`、`core_void_falcon`
- Main Blade：`blade_storm_fang`、`blade_iron_bastion`、`blade_orbit_halo`、`blade_dual_comet`
- Assist Ring：`assist_heavy`、`assist_guard`、`assist_air`
- Height Gear：`gear_low`、`gear_medium`、`gear_high`
- Performance Tip：`tip_flat_attack`、`tip_ball_defense`、`tip_needle_stamina`、`tip_taper_balance`

### 2.2 正式组合

| 组合 | Core | Blade | Assist | Gear | Tip |
| --- | --- | --- | --- | --- | --- |
| `assembly_storm_attack` | Solar Wolf | Storm Fang | Heavy | Low | Flat Attack |
| `assembly_bastion_defense` | Void Falcon | Iron Bastion | Guard | Medium | Ball Defense |
| `assembly_orbit_stamina` | Solar Wolf | Orbit Halo | Air | High | Needle Stamina |
| `assembly_dual_balance` | Void Falcon | Dual Comet | Guard | Medium | Taper Balance |

只导出以上 4 套 assembled GLB。全部 `2 × 4 × 3 × 3 × 4 = 288` 种组合在 Blender 内存中执行接口测试，不逐一导出。

### 2.3 不在 MVP 范围内

- 动力学仿真、空气动力学仿真和真实战斗性能保证。
- 生产公差、材料疲劳、儿童安全和高速爆裂认证。
- 复杂浮雕、角色头像、外部贴图和商业级表面雕刻。
- Geometry Nodes、跨代接口和模板继承系统。

## 3. 项目结构

```text
battle-top-designer/
├── blender/
│   ├── generate_parts.py
│   ├── generate_assemblies.py
│   ├── render_catalog.py
│   ├── validate_geometry.py
│   ├── validate_assemblies.py
│   └── lib/
│       ├── geometry.py
│       ├── materials.py
│       ├── interfaces.py
│       ├── assembly.py
│       ├── collision.py
│       ├── exporter.py
│       └── reporting.py
├── schemas/
│   ├── part.schema.json
│   ├── interface.schema.json
│   ├── material.schema.json
│   └── assembly.schema.json
├── specs/
│   ├── interfaces.json
│   ├── materials.json
│   ├── assemblies.json
│   └── parts/
│       └── <16 part JSON files>
├── scripts/
│   ├── validate_specs.py
│   ├── build_all.ps1
│   └── test_all.ps1
├── public/models/
│   ├── parts/
│   └── assemblies/
├── build/
│   ├── blend/
│   ├── temporary/
│   └── logs/
└── reports/
    ├── renders/
    ├── validation/
    │   └── build-manifest.json
    └── assembly_matrix.csv
```

`build/` 只保存临时 `.blend`、中间结果和日志。项目不提供批量删除脚本；构建过程只对明确的同名目标逐文件覆盖，以遵守项目的文件删除限制。

## 4. 数据契约

### 4.1 公共目录

`interfaces.json` 保存单位、接口版本和 NSS-V1 参数。`materials.json` 保存 Principled BSDF 所需的 PBR 参数。零件文件只引用接口和材质 ID，不复制目录数据。

`interfaces.json` 还保存 `allowed_connections`，只允许以下层级连接：

```text
emblem_core.bottom → main_blade.top
main_blade.bottom → assist_ring.top
assist_ring.bottom → height_gear.top
height_gear.bottom → performance_tip.top
```

连接时同时验证公母角色、层级顺序、旋转方向和接口版本。不允许 Core 直接连接 Tip，也不允许两个同类主刃直接连接。

### 4.2 零件 JSON

每个文件只描述一个零件，并显式包含：

- `schema_version`、`id`、`display_name`、`part_type`
- `interface_id`、`spin_direction`
- `dimensions`、`geometry`
- `mounts.top`、`mounts.bottom` 的完整位置和旋转
- `material_slots`
- `originality_rules`
- `engineering_status`
- `generation.seed`、`generation.generator_version`

零件专属的刃数、角度、半径、高度、圆角、辐条、镂空、剖面和相位只存在 JSON 中。Blender 代码只实现通用算法和验证阈值。

### 4.3 单位

所有 JSON 长度使用毫米、角度使用度。Blender 写入前统一乘以 `0.001` 转换为米。Blender 使用 Z 轴向上，所有零件围绕 `X=0,Y=0` 生成。

### 4.4 JSON Schema 与语义验证

四份 JSON Schema 分别约束零件、接口、材质和组合。在启动 Blender 前，`scripts/validate_specs.py` 必须完成：

- JSON Schema 错误数为 0。
- 重复 ID、缺失引用和非法数值数量为 0。
- 刃数为正整数，角度和尺寸在允许范围。
- 顶部安装点高于底部安装点。
- 每个组合引用的零件存在且类型正确。
- 每个材质和接口引用存在。

执行顺序固定为：Schema 验证 → 语义验证 → Blender 生成 → GLB 重新导入验证。

### 4.5 安装点数据

每个安装点完整记录：

```json
{
  "position_mm": [0, 0, 5.2],
  "rotation_deg": [0, 0, 0],
  "datum_radius_mm": 10.8,
  "interface_role": "female",
  "orientation_key_deg": 0
}
```

Blender 中的 `MOUNT_TOP`、`MOUNT_BOTTOM` 必须保存对应位置和旋转，而不是只保存 Z 高度。装配对齐以完整变换、基准半径、接口角色和定向键为准。

### 4.6 确定性生成

所有生成必须具有确定性。若算法使用随机数，种子只能来自零件 JSON 的 `generation.seed`。相同规格、相同生成器版本、相同 Blender 版本必须生成相同拓扑和几何结果。

## 5. NSS-V1 接口

NSS-V1 是原创五凸耳定向旋锁概念接口：

- 安装直径 21.6 mm
- 核心高度 3.0 mm
- 5 个凸耳
- 标准凸耳宽 4.2 mm
- 定位凸耳宽 5.0 mm
- 凸耳径向深度 1.4 mm
- 凸耳轴向高度 1.2 mm
- 插入深度 1.6 mm
- 顺时针旋锁角度 18°
- 凸耳圆角半径 0.4 mm
- 中央孔直径 8.0 mm
- 接口基准面 Z=0
- 数字间隙 0.05 mm
- 轴向对齐容差 0.02 mm
- 相位容差 0.1°

一个加宽定位凸耳用于防反装。定位凸耳属于内部装配特征，不影响外部轮廓。接口标记为 `concept_only`，不声明兼容现有产品；`digital_clearance_mm` 只用于避免数字模型视觉穿模，不是生产公差。MVP 不计算真实质量分布，未来实体版本必须进行静态平衡和动平衡验证。

每个零件具有 `PART_<ID>` Collection、主网格、`MOUNT_TOP` 和 `MOUNT_BOTTOM`。终端零件也保留两个挂载空对象，以维持统一协议。

### 5.1 对象命名

```text
零件 Collection：PART_<ID>
主网格：MESH_<ID>
安装点：MOUNT_TOP / MOUNT_BOTTOM
碰撞代理：COLLIDER_<ID>
材质：MAT_<MATERIAL_ID>
临时对象：TMP_<PURPOSE>
目录相机：CAM_CATALOG_<VIEW>
```

导出时排除 `TMP_`、`COLLIDER_`、相机和灯光。所有生产网格必须位于对应 `PART_<ID>` Collection 中。

单零件场景中的安装点严格命名为 `MOUNT_TOP`、`MOUNT_BOTTOM`。多零件装配场景中，Blender 对象名必须全局唯一，因此运行时名称使用 `MOUNT_TOP__<ID>`、`MOUNT_BOTTOM__<ID>`，并通过自定义属性 `mount_role` 保留逻辑角色；验证器不得依赖 Blender 自动生成的 `.001` 后缀。

## 6. 几何生成

### 6.1 通用生成器

`geometry.py` 提供：

- `create_radial_mesh`：从周向半径函数和高度生成核心、主刃和缓冲瓣。
- `create_annular_mesh`：生成连续配重环、窄外环和镂空环。
- `create_revolved_mesh`：从二维剖面旋转生成高度齿轮和轴尖。
- `create_spokes`：生成辐条、拱桥和轻量支撑。
- `finalize_mesh`：合并阈值内重复点、重算法线、检查零面积面和封闭性。

MVP 不使用布尔修改器。一个零件可以由多个彼此独立但各自封闭的网格壳体组成。

### 6.2 四个主刃

- Storm Fang：3 枚等距 Upper 刃，基准半径 27 mm，最大半径 36 mm，高 4.8 mm，刃角 24°。
- Iron Bastion：8 枚圆滑防御刃，基准半径 32 mm，最大半径 36 mm，高 4.2 mm，圆滑度 0.82。
- Orbit Halo：4 枚低阻后掠刃，基准半径 32.5 mm，最大半径 35.5 mm，高 3.8 mm，后掠角 35°。
- Dual Comet：6 区 A/B 交替，3 枚短攻击刃和 3 枚长卸力刃，基准半径 29.5 mm，最大半径 36 mm，高 4.5 mm。

### 6.3 其他零件

- Solar Wolf：8 段不等宽放射槽和断续日轮，不创建角色头像。
- Void Falcon：5 段后掠负空间和偏相位内环，不创建鸟形徽章。
- Heavy：连续外配重环和 12 个低幅质量节点。
- Guard：8 个圆角缓冲瓣。
- Air：6 条弯曲辐条、窄外环和大面积镂空。
- Low/Medium/High：共享 12 齿低幅轮廓，只改变高度。
- 四种 Tip：分别使用平面、球面、针端和中等锥形原创剖面。

## 7. 材质

`materials.py` 从目录创建 Principled BSDF：

- 金属材质使用 `metallic` 接近 1，并使用非镜面的合理 `roughness`。
- 透明塑料默认使用浅色高光形成半透明视觉感；确需透明时显式设置 `alpha_mode`。
- 结构塑料使用非金属 PBR 参数。
- 只使用 glTF 可导出的 Principled BSDF 节点，不使用程序噪声、Blender 专属混合节点、复杂驱动器或负缩放镜像。
- 材质目录显式记录 `base_color`、`metallic`、`roughness`、`alpha_mode` 和 `double_sided`。
- 每个模型最多使用 6 个材质。
- 每个正式组合最多 12 个唯一材质，透明材质不超过 2 个。
- 不加载参考图片或任何外部纹理。

## 8. 入口脚本

### 8.1 `generate_parts.py`

读取 16 个零件 JSON，逐个清空 Blender 场景、生成、验证并导出到 `public/models/parts/`。统计结果写入 `reports/validation/parts.json`。

### 8.2 `generate_assemblies.py`

读取 `specs/assemblies.json`，使用共享库重新生成零件，通过相邻挂载点沿 Z 轴对齐，导出 4 个正式组合和 `nss_v1_exploded.glb`。统计结果写入 `reports/validation/assemblies.json`。

### 8.3 `render_catalog.py`

导入已生成 GLB，使用固定相机和灯光渲染：

- 每个零件：俯视、45°、侧视和黑色剪影。
- 每个正式组合：45°、俯视、侧视和拆解视图。
- 每套正式组合额外合成正面、俯视、45°、侧面、底部、拆解、旋转轮廓、纯黑剪影和材质预览九宫格。
- 额外生成 `all_blades_silhouette.png`。

固定输出为 1024×1024 PNG、浅灰不透明背景、AgX 色彩管理、固定三点光和开启阴影。目录比较图使用正交相机；拆解图可使用轻微透视相机。

## 9. 构建入口

`build_all.ps1` 按以下顺序定位 Blender：

1. `BLENDER_EXE` 环境变量
2. `PATH` 中的 `blender.exe`
3. 用户提供的 Blender 4.5 路径
4. C 盘标准 Blender 安装目录
5. D 盘标准 Blender 安装目录

找不到时打印已检查路径和可能安装目录，并以非零退出码终止。找到后按零件、组合、渲染顺序调用 Blender `--background --python`。任一步失败即停止。

完整流水线顺序为：

1. `validate_specs.py` 执行 Schema 和语义验证。
2. Blender 生成并验证几何。
3. Blender 执行 288 种装配矩阵。
4. 导出 GLB 并重新导入空场景验证。
5. 运行 Khronos glTF Validator。
6. 生成目录渲染和构建清单。

## 10. 四层测试

### 10.1 第一层：规格测试

不启动 Blender。接受标准：

- JSON Schema 错误数 = 0。
- 缺失引用数 = 0。
- 重复 ID 数 = 0。
- 非法数值数 = 0。

### 10.2 第二层：几何测试

对 16 个零件检查：

- 模型、非零 GLB 和至少一个有效网格对象存在。
- 非流形边、重复顶点、松散顶点和零面积面为 0。
- 重复面、内部面、自相交、极短边和极薄区域为 0；无法可靠自动判定的项写为警告并保留人工复审入口。
- 法线一致且朝外。
- Scale 为 `(1,1,1)`，Rotation 为 `(0,0,0)`。
- 每个零件三角面不超过 50,000，材质不超过 6。
- `MOUNT_TOP`、`MOUNT_BOTTOM` 存在。

### 10.3 第三层：288 组合接口测试

所有组合在内存中自动装配，检查：

- 接口 ID 一致，公母角色和允许连接关系正确。
- 中心轴偏差不超过 0.02 mm。
- 安装面高度误差不超过 0.02 mm。
- 安装相位误差不超过 0.1°。
- 零件未倒置。
- 不可接受穿模数量为 0。
- 挂载间隙、总高度和最大直径在系统包络内。
- 组合三角面不超过 150,000。

输出 `reports/assembly_matrix.csv`，包含 core、blade、assist、gear、tip、result、collision_count、failure_reason、axis_offset_mm、mount_gap_mm、phase_error_deg、total_height_mm 和 max_diameter_mm。

碰撞检测先使用 AABB 快速筛选，再使用低面数 `COLLIDER_` 代理做精确检测。`NSS_V1_MATING_SURFACE` 属于允许接触白名单；非白名单重叠体积不得超过 0.5 mm³。包围盒重叠本身不视为穿模。

### 10.4 第四层：导出与 GLB 格式测试

每个 GLB 导出后重新导入空白 Blender 场景，检查：

- 可正常导入，网格和材质数量正确。
- 尺寸不变，Z 轴未翻转。
- 生产对象名称存在。
- 文件大小大于 0。

对 16 个零件、4 个正式组合和 1 个拆解 GLB 运行 Khronos 官方 [glTF Validator](https://github.com/KhronosGroup/glTF-Validator)。官方工具支持 glTF 2.0、GLB 二进制缓冲、内部引用和资源验证，并输出 JSON 报告；错误应产生非零退出码。

接受标准：

- Validator errors = 0
- Missing buffer = 0
- Invalid accessor = 0
- Invalid material reference = 0
- Missing texture = 0

警告记录但不自动阻止发布，除非后续将特定警告升级为错误。实现优先使用本地 `gltf_validator.exe`；如果不存在，则使用项目可用的官方 `gltf-validator` NPM 包。两者都不可用时测试必须明确失败并报告安装方式，不静默跳过。

### 10.5 视觉复审

288 种组合不全部渲染。视觉测试覆盖 4 套正式组合和 4 个主刃：

- 4 张组合九宫格。
- `all_blades_silhouette.png` 统一中心、比例和纯黑材质排列四个主刃。
- 若四款主刃一级轮廓无法明显区分，则测试报告标为需要设计复审。

## 11. 性能预算

| 零件类型 | 三角面建议上限 | GLB 建议上限 |
| --- | ---: | ---: |
| Emblem Core | 15,000 | 1.5 MB |
| Main Blade | 50,000 | 4 MB |
| Assist Ring | 25,000 | 2 MB |
| Height Gear | 15,000 | 1.5 MB |
| Performance Tip | 12,000 | 1 MB |
| 完整组合 | 120,000 | 10 MB |

120,000 是面向移动网页的建议预算；用户原始要求的 150,000 仍是完整组合硬上限。超过建议预算产生警告，超过硬上限构建失败。

## 12. 导出规则

- GLB 使用 glTF 2.0。
- 导出前应用网格缩放和旋转。
- 保留挂载空对象。
- 法线必须正确。
- 单零件不超过 50,000 三角面和 6 个材质。
- 正式组合不超过 150,000 三角面。
- 输出路径由项目根和 JSON ID 计算，不由零件脚本硬编码造型参数。

## 13. 构建清单

每次构建生成 `reports/validation/build-manifest.json`，记录：

- 项目名、NSS-V1、生成器版本、Blender 版本和 ISO-8601 构建时间。
- 16 个零件、4 套组合和 288 种组合测试计数。
- 所有规格文件的 SHA-256。
- 每个输出文件的路径、字节数、SHA-256、三角面、材质数、最大尺寸和来源 JSON。
- 构建与测试最终状态。

构建清单用于区分代码、规格和 Blender 版本造成的输出变化。

## 14. 错误处理

以下情况立即失败：

- JSON 语法错误、必需字段缺失或未知引用。
- 参数越界、角区重叠或非正尺寸。
- 非流形、零面积面、法线、变换、面数或材质数验证失败。
- 接口 ID、挂载点、中心轴、接口角色或允许连接关系不一致。
- Blender、glTF Validator 或输出文件缺失。
- 任一外部命令返回非零退出码。

不批量删除输出目录；同名目标文件由生成器逐个覆盖。

## 15. Definition of Done

MVP 只有满足以下全部条件才算完成：

1. 16 个零件 JSON 全部通过 Schema 和语义验证。
2. Blender 成功生成 16 个独立零件。
3. 4 套正式组合和 1 个拆解场景成功生成 GLB。
4. 288 种组合全部在内存中完成装配验证并写入矩阵。
5. 所有中心轴、安装点、接口角色和允许连接关系正确。
6. 不存在不可接受的非流形几何、错误法线、自相交或穿模。
7. 所有 GLB 通过空场景重新导入测试。
8. 21 个 GLB 的 Khronos Validator 错误数为 0。
9. 目录渲染、四套九宫格、拆解视图和主刃剪影总览生成。
10. build-manifest、assembly_matrix 和完整测试报告生成。
11. `build_all.ps1` 和 `test_all.ps1` 退出码均为 0。
12. 必须实际执行 Blender 构建和测试；仅生成脚本不算完成。
