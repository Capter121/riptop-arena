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
│   └── lib/
│       ├── geometry.py
│       ├── materials.py
│       ├── interfaces.py
│       └── exporter.py
├── specs/
│   ├── interfaces.json
│   ├── materials.json
│   ├── assemblies.json
│   └── <16 part JSON files>
├── scripts/
│   ├── build_all.ps1
│   └── test_all.ps1
├── public/models/
│   ├── parts/
│   └── assemblies/
└── reports/
    ├── renders/
    └── validation/
```

## 4. 数据契约

### 4.1 公共目录

`interfaces.json` 保存单位、接口版本和 NSS-V1 参数。`materials.json` 保存 Principled BSDF 所需的 PBR 参数。零件文件只引用接口和材质 ID，不复制目录数据。

### 4.2 零件 JSON

每个文件只描述一个零件，并显式包含：

- `schema_version`、`id`、`display_name`、`part_type`
- `interface_id`、`spin_direction`
- `dimensions`、`geometry`
- `mounts.top_z_mm`、`mounts.bottom_z_mm`
- `interface_roles.top`、`interface_roles.bottom`
- `material_slots`
- `originality_rules`
- `engineering_status`

零件专属的刃数、角度、半径、高度、圆角、辐条、镂空、剖面和相位只存在 JSON 中。Blender 代码只实现通用算法和验证阈值。

### 4.3 单位

所有 JSON 长度使用毫米、角度使用度。Blender 写入前统一乘以 `0.001` 转换为米。Blender 使用 Z 轴向上，所有零件围绕 `X=0,Y=0` 生成。

## 5. NSS-V1 接口

NSS-V1 是原创五凸耳定向旋锁概念接口：

- 安装直径 21.6 mm
- 核心高度 3.0 mm
- 5 个凸耳
- 标准凸耳宽 4.2 mm
- 定位凸耳宽 5.0 mm
- 凸耳径向深度 1.4 mm
- 凸耳轴向高度 1.0 mm
- 旋锁角度 20°
- 边缘倒角 0.4 mm
- 概念间隙 0.25 mm

一个加宽定位凸耳用于防反装。接口标记为 `concept_only`，不声明兼容现有产品，也不作为生产公差。

每个零件具有 `PART_ROOT`、`MOUNT_TOP` 和 `MOUNT_BOTTOM`。终端零件也保留两个挂载空对象，以维持统一协议。

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
- 透明塑料使用轻微 transmission 和 alpha，不追求完全玻璃效果。
- 结构塑料使用非金属 PBR 参数。
- 每个模型最多使用 6 个材质。
- 不加载参考图片或任何外部纹理。

## 8. 入口脚本

### 8.1 `generate_parts.py`

读取 16 个零件 JSON，逐个清空 Blender 场景、生成、验证并导出到 `public/models/parts/`。统计结果写入 `reports/validation/parts.json`。

### 8.2 `generate_assemblies.py`

读取 `specs/assemblies.json`，使用共享库重新生成零件，通过相邻挂载点沿 Z 轴对齐，导出 4 个正式组合和 `nss_v1_exploded.glb`。统计结果写入 `reports/validation/assemblies.json`。

### 8.3 `render_catalog.py`

导入已生成 GLB，使用正交相机、中性背景和三点灯光渲染。每套正式组合输出正面、俯视、45°、侧面、底部、拆解、旋转轮廓、纯黑剪影和材质预览九宫格。额外生成 `all_blades_silhouette.png`。

## 9. 构建入口

`build_all.ps1` 按以下顺序定位 Blender：

1. `BLENDER_EXE` 环境变量
2. `PATH` 中的 `blender.exe`
3. 用户提供的 Blender 4.5 路径
4. C 盘标准 Blender 安装目录
5. D 盘标准 Blender 安装目录

找不到时打印已检查路径和可能安装目录，并以非零退出码终止。找到后按零件、组合、渲染顺序调用 Blender `--background --python`。任一步失败即停止。

## 10. 四层测试

### 10.1 几何测试

对 16 个零件检查：

- 模型、网格和非零 GLB 存在。
- 非流形边、重复顶点和零面积面为 0。
- 法线一致且朝外。
- Scale 为 `(1,1,1)`，Rotation 为 `(0,0,0)`。
- 每个零件三角面不超过 50,000，材质不超过 6。
- `MOUNT_TOP`、`MOUNT_BOTTOM` 存在。

### 10.2 288 组合接口测试

所有组合在内存中自动装配，检查：

- 接口 ID 一致。
- 相邻挂载点存在并对齐。
- 中心轴偏移在允许范围。
- 零件未倒置。
- 无明显网格穿模。
- 挂载间隙、总高度和最大直径在系统包络内。
- 组合三角面不超过 150,000。

输出 `reports/assembly_matrix.csv`，包含 core、blade、assist、gear、tip、result、collision_count、failure_reason、axis_offset_mm、mount_gap_mm、total_height_mm 和 max_diameter_mm。

### 10.3 GLB 格式测试

对 16 个零件、4 个正式组合和 1 个拆解 GLB 运行 Khronos 官方 [glTF Validator](https://github.com/KhronosGroup/glTF-Validator)。官方工具支持 glTF 2.0、GLB 二进制缓冲、内部引用和资源验证，并输出 JSON 报告；错误应产生非零退出码。

接受标准：

- Validator errors = 0
- Missing buffer = 0
- Invalid accessor = 0
- Invalid material reference = 0
- Missing texture = 0

警告记录但不自动阻止发布，除非后续将特定警告升级为错误。

实现优先使用本地 `gltf_validator.exe`；如果不存在，则使用项目可用的官方 `gltf-validator` NPM 包。两者都不可用时测试必须明确失败并报告安装方式，不静默跳过。

### 10.4 视觉测试

288 种组合不全部渲染。视觉测试覆盖 4 套正式组合和 4 个主刃：

- 4 张组合九宫格。
- `all_blades_silhouette.png` 统一中心、比例和纯黑材质排列四个主刃。
- 若四款主刃一级轮廓无法明显区分，则测试报告标为需要设计复审。

## 11. 导出规则

- GLB 使用 glTF 2.0。
- 导出前应用网格缩放和旋转。
- 保留挂载空对象。
- 法线必须正确。
- 单零件不超过 50,000 三角面和 6 个材质。
- 正式组合不超过 150,000 三角面。
- 输出路径由项目根和 JSON ID 计算，不由零件脚本硬编码造型参数。

## 12. 错误处理

以下情况立即失败：

- JSON 语法错误、必需字段缺失或未知引用。
- 参数越界、角区重叠或非正尺寸。
- 非流形、零面积面、法线、变换、面数或材质数验证失败。
- 接口 ID、挂载点或中心轴不一致。
- Blender、glTF Validator 或输出文件缺失。
- 任一外部命令返回非零退出码。

不批量删除输出目录；同名目标文件由生成器逐个覆盖。

## 13. 成功标准

- 16 个零件 GLB 全部生成并通过几何测试。
- 4 个正式组合和 1 个拆解 GLB 全部生成。
- 288 种内存组合全部写入装配矩阵。
- 21 个 GLB 的 Khronos Validator 错误数为 0。
- 4 张九宫格和主刃剪影总览生成。
- Blender 命令实际执行并返回 0。
- 构建和测试终端输出被完整报告。
