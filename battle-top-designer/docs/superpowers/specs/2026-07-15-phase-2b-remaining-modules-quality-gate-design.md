# Nova Spin System Phase 2B Remaining Modules Quality Gate 设计

状态：设计内容已批准，等待书面规格复审

日期：2026-07-15

## 1. 目的

Phase 2B 为 Nova Spin System 的剩余八个模块建立规格、原创几何、碰撞代理、装配验证、GLB 验证、离线预览和视觉质量门。Phase 2B 继承 Phase 2A 已验证的生成与验证基础设施，但不修改 NSS-V1，不新增 Main Blade，也不运行 288 种完整组合。

Phase 2A 的人工视觉评审结论记录在 `reports/validation/phase2a-visual-review-disposition.json`。该结论允许开始 Phase 2B 设计，不代表物理性能、制造、安全或法律原创性已经得到证明。

## 2. 已核验现状

截至 2026-07-15：

- `specs/parts/` 已包含当前八个零件：Solar Wolf、四枚 Main Blade、Heavy Assist、Low Gear 和 Flat Attack Tip。
- 四枚 Main Blade、四套 Phase 2A 单变量夹具和 Storm Attack 纵向切片已经通过自动质量门。
- 离线预览当前支持四枚 Main Blade，Three.js 固定为 0.185.1，Phase 2A 不使用 Draco。
- 碰撞验证已经具备 AABB、BVH、三角面相交、0.5 mm 体素估算和 `CONTACT_REVIEW` 状态。
- 剩余八个零件尚无 `specs/parts/*.json`，不得在规格建立前直接建模。
- `specs/interfaces.json` 中的 NSS-V1 保持冻结。

## 3. 范围

### 3.1 范围内零件

| 零件类型 | 零件 ID | 数量 |
|---|---|---:|
| Emblem Core | `core_void_falcon` | 1 |
| Assist Ring | `assist_guard`、`assist_air` | 2 |
| Height Gear | `gear_medium`、`gear_high` | 2 |
| Performance Tip | `tip_ball_defense`、`tip_needle_stamina`、`tip_taper_balance` | 3 |

### 3.2 范围外事项

- 修改 NSS-V1 的尺寸、角色、凸耳、锁定区或基准面。
- 新增或修改 Main Blade。
- 运行 288 种完整组合矩阵。
- 实现完整定制器 UI。
- 使用参考图片作为纹理或复制名称、Logo、徽章、精确轮廓、精确配色或商业机械接口。
- 物理动力学、材料强度、量产工艺、实体高速战斗和安全认证。

## 4. 总体设计原则

1. 所有造型参数进入 JSON，Blender 脚本只解释规格，不保存零件专属常量。
2. Core、Assist 和 Gear 的新形态必须使用显式 `profile_family`，不得通过现有零件的数量、半径、颜色或单一角度变化伪装成新设计。
3. 三枚 Tip 可共享旋转体生成器，但剖面点、终端接触半径、曲率和接触语义必须不同并可验证。
4. 所有零件使用毫米规格，写入 Blender 时转换为米；Z 轴向上，旋转轴固定为 X=0、Y=0。
5. 所有零件拥有 `MOUNT_<PART_ID>_TOP` 和 `MOUNT_<PART_ID>_BOTTOM`。
6. 渲染网格统一使用 `GEO_` 前缀，碰撞代理统一使用 `COLLIDER_<PART_ID>`。
7. 碰撞代理必须闭合、流形、法线朝外，并通过 `export_exclude` 排除出最终 GLB。
8. 材质继续使用 Principled BSDF。优先复用现有 NSS 材质；只有明确的可读性缺陷才允许先报告后扩展材料库。

## 5. 原创几何设计

### 5.1 Void Falcon Emblem Core

- `profile_family`：`void_falcon_split_arc`。
- 初始包络：外半径 17.5 mm、接口内半径 10.8 mm、高度 3.6 mm。
- 周向语言：两组相位错开的闭合弧形骨架围绕中央负空间，形成抽象的旋向张力。
- 负空间必须由几何间隔形成，不得绘制或挤出鸟头、翅膀、动物徽章、角色图案或 Logo。
- 与 Solar Wolf 的五节点圆润核心相比，必须在节点数量、负空间、相位关系和主轮廓上同时不同。
- 材质优先使用 `cobalt_blue_translucent` 和 `obsidian_polymer`。

### 5.2 Guard Assist Ring

- `profile_family`：`guard_cushion_ring`。
- 初始包络：外半径 30.5 mm、接口内半径 10.8 mm、高度 3.2 mm。
- 周向语言：连续圆滑外带、十二段低幅缓冲肩和内侧实体承力环。
- 外缘曲率必须连续，不允许尖齿、Storm Fang 式外伸刃或简单的正弦缩放 Heavy Assist。
- 视觉重量向内侧承力环集中，外缘只表达卸力和缓冲。

### 5.3 Air Assist Ring

- `profile_family`：`air_truss_windows`。
- 初始包络：外半径 29.5 mm、接口内半径 10.8 mm、高度 3.0 mm。
- 周向语言：六个真实贯通窗口、六段闭合弧桥和连接接口区的细辐条。
- 窗口通过闭合分件生成，不使用渲染网格布尔运算，不留下非流形孔边。
- 不得通过把 Heavy Assist 等比例变薄、缩小或改色实现。

### 5.4 Medium Height Gear

- `profile_family`：`medium_chevron_rib`。
- 初始包络：外半径 17.0 mm、接口内半径 10.8 mm、高度 5.0 mm。
- 结构语言：十二组矮 V 形加强肋、中段收腰和连续上下接口肩。
- 必须在侧面轮廓、肋条方向和轴向节奏上区别于 Low Gear，不得只增加 Z 高度。

### 5.5 High Height Gear

- `profile_family`：`high_tower_buttress`。
- 初始包络：外半径 17.2 mm、接口内半径 10.8 mm、高度 6.0 mm。
- 结构语言：八组纵向扶壁、双层台肩和清晰的高位支撑轮廓。
- 不得复用 Medium Gear 的 V 形肋后仅改变高度；高位结构必须使用独立生成分支。

### 5.6 Ball Defense Tip

- `contact_profile`：`ball`。
- 初始包络：最大半径 8.0 mm、总高度 8.2 mm、球冠曲率半径 3.2 mm。
- 剖面使用球冠接触面和宽圆滑过渡肩，终端不得出现尖点或零面积接触面。

### 5.7 Needle Stamina Tip

- `contact_profile`：`needle`。
- 初始包络：最大半径 8.0 mm、总高度 9.0 mm、终端圆角半径 0.6 mm。
- 剖面使用窄圆头针尖、细颈和上部稳定肩；数学零半径尖点禁止进入网格。

### 5.8 Taper Balance Tip

- `contact_profile`：`taper`。
- 初始包络：最大半径 8.0 mm、总高度 8.5 mm、终端接触半径 1.6 mm。
- 剖面使用连续锥面、小圆角接触台和上部缓和肩；接触半径必须位于 Needle 与 Flat 之间。

## 6. 单变量测试夹具

八个单变量夹具以 `storm_attack_vertical_slice` 为基准，每次只替换一种零件。

| 夹具 ID | 可变零件 | 其余零件 |
|---|---|---|
| `assembly_phase2b_core_void_falcon` | `core_void_falcon` | Storm Fang + Heavy + Low + Flat Attack |
| `assembly_phase2b_assist_guard` | `assist_guard` | Solar Wolf + Storm Fang + Low + Flat Attack |
| `assembly_phase2b_assist_air` | `assist_air` | Solar Wolf + Storm Fang + Low + Flat Attack |
| `assembly_phase2b_gear_medium` | `gear_medium` | Solar Wolf + Storm Fang + Heavy + Flat Attack |
| `assembly_phase2b_gear_high` | `gear_high` | Solar Wolf + Storm Fang + Heavy + Flat Attack |
| `assembly_phase2b_tip_ball_defense` | `tip_ball_defense` | Solar Wolf + Storm Fang + Heavy + Low |
| `assembly_phase2b_tip_needle_stamina` | `tip_needle_stamina` | Solar Wolf + Storm Fang + Heavy + Low |
| `assembly_phase2b_tip_taper_balance` | `tip_taper_balance` | Solar Wolf + Storm Fang + Heavy + Low |

每条规格必须显式包含：

```text
purpose=phase2b_single_variable_fixture
official_configuration=false
baseline_fixture=storm_attack_vertical_slice
variable_part_type=<对应零件类型>
```

## 7. 代表性组合

四套代表性组合用于发现跨模块视觉和几何问题，不是官方产品配置。

| 组合 ID | Core | Blade | Assist | Gear | Tip |
|---|---|---|---|---|---|
| `assembly_phase2b_attack_representative` | Void Falcon | Storm Fang | Air | Low | Flat Attack |
| `assembly_phase2b_defense_representative` | Solar Wolf | Iron Bastion | Guard | Medium | Ball Defense |
| `assembly_phase2b_stamina_representative` | Solar Wolf | Orbit Halo | Air | High | Needle Stamina |
| `assembly_phase2b_balance_representative` | Void Falcon | Dual Comet | Heavy | Medium | Taper Balance |

每条规格必须显式包含：

```text
purpose=phase2b_representative_fixture
official_configuration=false
baseline_fixture=phase2a_approved
variable_part_type=mixed_phase2b_modules
```

Phase 2B 新增装配验证总数固定为 12，不得在本阶段扩展为 288。

## 8. 阶段质量门

### 8.1 Stage 0：Phase 2A 批准基线

- 保存 `phase2a-visual-review-disposition.json`。
- 建立 Phase 2A 批准基线，覆盖当前 8 个零件 GLB、4 个 Phase 2A 夹具 GLB 和 `assembly_storm_attack.glb`，共 13 个 GLB。
- 保存每个文件的 `raw_sha256` 和 `semantic_fingerprint`。
- 不修改或重新生成模型。

### 8.2 Stage 1：规格与 Schema

- 新增 8 份零件 JSON、8 个单变量夹具和 4 个代表性组合。
- 为五个新 `profile_family` 和三个 Tip `contact_profile` 增加严格枚举。
- 验证零件数、夹具数、接口 ID、材质引用、目的字段和范围排除。
- 只运行纯规格测试，不启动 Blender。

### 8.3 Stage 2：Void Falcon Core

- 实现独立 split-arc 生成逻辑、碰撞代理、单变量夹具、GLB、视觉和预览。
- 运行 Phase 2A 批准基线与 Storm Attack 回归。
- 质量门通过后才能进入 Assist。

### 8.4 Stage 3：Guard 与 Air Assist

- 分别实现 cushion-ring 和 truss-window 生成逻辑。
- 每枚 Assist 单独生成、验证和渲染，再执行两个单变量夹具。
- 两枚都通过且没有未解决阻断状态后才能进入 Gear。

### 8.5 Stage 4：Medium 与 High Gear

- 分别实现 chevron-rib 和 tower-buttress 生成逻辑。
- 侧面剪影必须证明 Low、Medium、High 不只是高度变化。
- 两个单变量夹具和全部回归通过后才能进入 Tip。

### 8.6 Stage 5：Ball、Needle 与 Taper Tip

- 使用三套明确的旋转剖面和接触曲率。
- 检查终端非零接触半径、法线、零面积面和侧面剪影。
- 三个单变量夹具和全部回归通过后才能进入代表性组合。

### 8.7 Stage 6：代表性组合与离线预览

- 生成和验证 4 套代表性组合。
- 离线预览保留四枚 Blade，并增加 8 个新零件和 4 套代表性组合，共 16 个可自动选择的预览目标。
- 不实现部件自由组合、购物车、保存配置或完整定制器。

### 8.8 Stage 7：报告与人工评审交接

- 汇总零件尺寸、三角面、材质、GLB 大小、双指纹、碰撞、浏览器和视觉结果。
- 建立人工评审清单。
- 最终状态只能为 `Phase 2B awaiting visual review`。

## 9. 碰撞与接口验证

### 9.1 职责分离

- NSS-V1 接口验证负责安装点、角色、基准半径、相位和方向。
- 非接口碰撞验证负责合法接口排除区之外的意外重叠。
- 合法插入区、凸耳锁定区和基准面接触区不得被判定为碰撞。

### 9.2 碰撞步骤

1. AABB 快速筛选。
2. 为闭合代理建立 BVH。
3. 执行 BVH 三角面相交。
4. 对相交候选执行 0.5 mm 体素重叠估算。
5. 输出位置、零件对、检测阶段和近似体积。

BVH 相交但估算体积低于阈值时输出 `CONTACT_REVIEW`，不得自动当作 PASS。Phase 2B 最终覆盖 16 个唯一零件代理：Phase 2A 当前 8 个，加本阶段 8 个。

## 10. 双指纹回归

Phase 2A 批准基线的 13 个 GLB 包含：

- `core_solar_wolf`
- `blade_storm_fang`
- `blade_iron_bastion`
- `blade_orbit_halo`
- `blade_dual_comet`
- `assist_heavy`
- `gear_low`
- `tip_flat_attack`
- 四个 `assembly_phase2a_*` 夹具
- `assembly_storm_attack`

失败规则：

- 未批准的 `semantic_fingerprint` 变化为 `SEMANTIC_REGRESSION`，硬失败。
- 仅 `raw_sha256` 变化为 `BINARY_DRIFT`，人工确认前阻止通过。
- 两个指纹均未变化时为回归 PASS。
- 共享生成器每次修改后必须重新运行 13 GLB 基线与 Storm Attack 回归。

## 11. 几何与 GLB 验收

每个零件必须满足：

- Non-manifold edges = 0。
- Duplicate vertices = 0。
- Loose vertices = 0。
- Zero-area faces = 0。
- 法线和有符号体积正确。
- Scale = 1,1,1；Rotation = 0,0,0。
- GLB 文件大小大于 0。
- 单零件三角面不超过 50,000。
- 单零件材质不超过 6。
- 组合三角面不超过 150,000。
- `MOUNT_<PART_ID>_TOP` 和 `MOUNT_<PART_ID>_BOTTOM` 均存在。
- GLB 重导入后存在渲染网格和安装点，不存在 `COLLIDER_`。
- Khronos glTF Validator error = 0、warning = 0。

## 12. 视觉质量输出

每个新零件生成 512×512 单视图和 1536×1536 contact sheet。

- Core 与 Assist：top、perspective_45、side、silhouette。
- Gear 与 Tip：perspective_45、side、bottom、side_silhouette。

生成四张 2048×1024 同族对比图：

- `reports/renders/all_cores_comparison.png`
- `reports/renders/all_assists_comparison.png`
- `reports/renders/all_gears_comparison.png`
- `reports/renders/all_tips_comparison.png`

每张对比图必须使用同一族内相同的正交相机、比例、光照、背景和输出尺寸，并同时展示材质视图与剪影。可计算内部剪影重叠指标，但报告必须声明其不是法律原创性证明。

## 13. 离线浏览器验证

- Three.js 继续固定为 0.185.1，保留 VERSION 和 LICENSE。
- 使用现有 import map 和本地相对模块路径。
- 不使用 Draco，除非未来阶段同时提供固定版本的本地解码器。
- 自动预览目标为现有四枚 Blade、八个新零件和四套代表性组合，共 16 个。
- Playwright 验证模型 ID、Canvas 尺寸、拖动后的相机变化、缩放变化和重置误差。
- console error、pageerror、failed request 必须全部为 0。
- 保存 8 个新零件和 4 套代表性组合的截图及更新后的 `browser-test.json`。

## 14. 完成条件

Phase 2B 自动质量门必须同时满足：

1. 八个新零件规格、GLB 和碰撞代理全部生成。
2. Core、Assist 和 Gear 使用已批准的独立 `profile_family`，三枚 Tip 使用不同且可量化的剖面。
3. 八个单变量夹具和四个代表性组合全部 PASS。
4. 十六个唯一零件代理全部闭合且未进入 GLB。
5. `FAIL` 数量为 0。
6. 未解决 `CONTACT_REVIEW` 数量为 0，所有实际出现的复审均保存人工结论。
7. 未确认 `BINARY_DRIFT` 数量为 0，`SEMANTIC_REGRESSION` 数量为 0。
8. 所有相关 GLB 的 Validator error 和 warning 均为 0。
9. Phase 2A 的 13 GLB 批准基线和 Storm Attack 回归继续通过。
10. 离线预览、Playwright、单款视觉输出和四张同族对比图全部通过。
11. 没有生成范围外零件，没有运行 288 组合。
12. 最终状态为 `Phase 2B awaiting visual review`。

## 15. 人工评审重点

- Void Falcon 是否保持抽象负空间，而没有形成动物徽章或 Logo。
- Guard 与 Air 是否在轮廓、负空间和视觉重量上明显不同于 Heavy。
- Low、Medium、High Gear 是否不只是高度变化。
- Ball、Needle、Taper 是否仅凭侧面剪影即可辨认接触意图。
- 四套代表性组合是否存在新的材质层级或轮廓冲突。
- 与参考产品之间是否仍存在需要进一步拉开的视觉联想。

自动化结果和剪影指标不替代人工产品设计判断，也不构成法律、制造或安全结论。人工视觉评审通过后，项目才能决定是否进入后续完整组合阶段。

## 16. 失败与恢复原则

- 任一阶段失败时停止，不生成后续阶段零件。
- 规格失败优先修正规格源，不在最终网格上做不可追溯补丁。
- 共享生成器导致回归时恢复该阶段开始提交，并重新核验 Phase 2A 批准基线。
- 每个 Stage 必须在自动质量门通过后创建独立提交。
- 本设计批准后先编写独立实施计划，不直接开始实现。
