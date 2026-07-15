# Nova Spin System Phase 2B-R1 局部视觉修订设计

日期：2026-07-15  
状态：已批准，实施中  
起点提交：`9ba51508ebbfb3e878a678ac73369c33a6148505`

## 1. 目标与范围

Phase 2B-R1 只修订以下三个零件及其专属生成策略：

- `blade_dual_comet`
- `assist_heavy`
- `assist_guard`

同时增加最小离线 Assist 聚焦预览、R1 专用自动测试、报告和视觉材料。`assist_air` 只做回归，不修改规格、几何或材质。

本阶段不得修改 NSS-V1、Storm Fang、Iron Bastion、Orbit Halo、Core、Gear、Tip、其余已批准零件的可见几何、288 组合逻辑或任何已批准基线。不得进入 Phase 2C，也不得将 Phase 2B 标记为已批准。

## 2. 修订前证据与回归边界

修改前从起点提交保存以下证据：

- 三个目标零件的规格 SHA-256、GLB `raw_sha256` 和 `semantic_fingerprint`；
- 三个目标零件的尺寸、三角面、材质和安装点统计；
- Dual Comet 的 top、45°、side、silhouette 和 128×128 缩略图；
- Heavy、Guard、Air 的独立图和 Storm Fang 单变量夹具图；
- NSS-V1、Phase 2A 批准基线和所有未修改零件的语义指纹。

三个目标零件允许发生已记录的规格、拓扑、尺寸和语义指纹变化。其余零件的 `semantic_fingerprint` 必须保持一致；任何未批准变化均为 `SEMANTIC_REGRESSION` 并立即停止。未修改 GLB 的 `raw_sha256` 变化记为 `BINARY_DRIFT`，未经人工确认不得通过。

## 3. Dual Comet 专属几何

### 3.1 周期结构

`blade_dual_comet` 保持 `profile_family=dual_comet_alternating`，但使用新的严格周期轮廓算法。三个重复单元的基准角只能由下式生成：

```text
unit_angle = phase_deg + unit_index × 120°
unit_index ∈ {0, 1, 2}
```

每个单元从同一组局部采样生成，不允许为三个方向分别写参数或修形。`segments` 必须能被 3 整除，每个单元使用完全相同的顶点、面和材质分配顺序。

### 3.2 单元接触节奏

每个 120° 单元依次包含：

1. 短而快速外伸的攻击坡面；
2. 明确的半径回落过渡；
3. 较长、宽而圆滑的卸力弧面；
4. 回到下一单元基准半径的缓和段。

R1 规格使用以下目标参数：

| 参数 | 修订前 | R1 目标 |
| --- | ---: | ---: |
| `base_radius_mm` | 28.0 | 27.5 |
| `attack_radius_mm` | 36.0 | 36.0 |
| `damper_radius_mm` | 33.0 | 32.5 |
| `attack_height_mm` | 5.0 | 5.2 |
| `damper_height_mm` | 4.4 | 3.9 |
| 攻击段角宽 | 隐含 50.4° | 28° |
| 卸力段角宽 | 隐含 69.6° | 62° |
| 过渡和缓和总角宽 | 0° | 30° |

上层内环的可见顶部不得高于卸力弧面的主要顶部，不得遮盖攻击与卸力轮廓的高度差。最大外径保持 72 mm，不改变接口和安装点。

### 3.3 对称指标

标准化 top 剪影使用固定正交相机、固定世界比例和 2048×2048 二值掩膜计算：

- `silhouette_centroid_offset_mm`：二值剪影面积质心到旋转轴的世界距离；
- `rotational_similarity_120_deg`：原掩膜与绕中心旋转 120° 后掩膜的 IoU；
- `rotational_similarity_240_deg`：原掩膜与绕中心旋转 240° 后掩膜的 IoU。

门禁固定为：

```text
silhouette_centroid_offset_mm <= 0.25
rotational_similarity_120_deg >= 0.97
rotational_similarity_240_deg >= 0.97
```

报告同时保存掩膜尺寸、像素到毫米换算、面积、质心坐标和旋转重叠图。该指标是内部几何一致性检查，不是法律意义上的原创性证明。

## 4. Heavy Assist 专属几何

`assist_heavy` 新增 `profile_family=heavy_continuous_mass_band`，不再走通用 `annular_ring` 轮廓。几何由一个封闭、流形的连续轴向环生成，视觉结构包含：

- 连续无断口的外圈；
- 从 `band_inner_radius_mm=29.0` 延伸到 `outer_radius_mm=34.2` 的连续质量带；
- 完整高度的厚重外侧壁；
- 内承载环与外质量带之间的单一低台阶，不增加辐条、缓冲块或浅刻线。

零件高度保持 3.4 mm，安装点保持不变，避免改变装配层高。外圈半径由 31.0 mm 增至 34.2 mm，使连续侧壁在 Storm Fang 夹具的统一 45°和 side 视图中稳定露出。可见性必须来自几何轮廓，去色渲染后仍应成立。

## 5. Guard Assist 专属几何

`assist_guard` 保持 `profile_family=guard_cushion_ring`，将连续正弦肩部替换为 8 个严格等距的圆角缓冲块。每个缓冲块由同一局部轮廓旋转复制，中心角位于：

```text
0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
```

R1 使用：

- `block_count=8`；
- `outer_radius_mm=34.0`；
- `recess_radius_mm=31.2`；
- `groove_depth_mm=2.8`；
- `groove_width_deg=12`；
- `block_corner_roundness=0.82`；
- `inner_bearing_radius_mm=20.0`；
- `height_mm=3.2`。

凹槽必须由真实径向回落形成，深度不小于 2.5 mm；不得通过材质、法线或浅刻线伪造。缓冲块顶部与侧壁形成分段节奏，去色侧视必须与 Heavy 的连续侧壁明显不同。安装点保持不变。

## 6. 碰撞代理与导出

三个目标零件的 `COLLIDER_<PART_ID>` 必须随新外形重新生成，并保持封闭、流形、法线朝外及 `export_exclude=true`。GLB 重导入不得出现 `COLLIDER_` 对象。

碰撞仍按 AABB、BVH、三角面相交、体素重叠估算和报告输出的现有顺序执行。合法 NSS-V1 插入区、锁定区和基准面接触区保持原有排除规则，不得扩大白名单掩盖新外圈碰撞。

## 7. 最小 Assist 聚焦预览

现有离线 Three.js 预览增加独立的 Assist Focus 控制区，只使用以下三个现有单变量装配：

- Heavy：`assembly_storm_attack`
- Guard：`assembly_phase2b_assist_guard`
- Air：`assembly_phase2b_assist_air`

聚焦流程固定为：

1. 加载所选单变量装配；
2. 按 GLB 节点的 `part_id` 找到 Assist 和 `blade_storm_fang`；
3. Assist 沿 glTF 世界上轴上移 6 mm；
4. Blade 材质克隆后设置 `opacity=0.22`、`transparent=true`、`depthWrite=false`；
5. Assist 材质克隆后短暂设置琥珀色 emissive 高亮，800 ms 后仅关闭 emissive，保持拆解位置；
6. 相机移动到统一 45°位置并对准模型中心；
7. `Restore Assembly` 恢复节点位置、全部原始材质参数、相机和控制目标。

默认不创建坐标轴。环境光提高到能够区分黑色塑料、金属和透明材料的水平，并增加一盏柔和补光；不修改 GLB 内材质，不增加完整定制器、配色器或装配编辑能力。

Playwright 必须验证 Assist 位移、Blade 不透明度、Blade `depthWrite`、高亮开始与结束、相机变化、恢复误差、Canvas 尺寸，以及 `console.error`、`pageerror`、failed request 和外部请求均为 0。

## 8. 视觉输出

所有 R1 输出写入 `reports/renders/phase2b-r1/`，不得覆盖 Phase 2A、Phase 2B 或人工评审包的既有图片。

必须包含：

- Dual Comet 修订前后 top、45°、side、silhouette、thumbnail_128；
- Dual Comet 120°旋转重叠图；
- Heavy、Guard、Air 独立无标签和有标签对比；
- 三款 Assist 在同一 Storm Fang 夹具下的 top、45°、side 对比；
- Assist 三款 128×128 无标签对比；
- 三款 Assist 聚焦模式浏览器截图；
- `reports/renders/phase2b-r1/index.md`。

同组图使用相同正交相机、世界比例、灯光、曝光、背景、色彩管理和输出尺寸。修订前证据必须来自起点提交或修改前保存的产物，不得在修订后用新算法伪造“before”。

## 9. 顺序质量门

### Stage 1：Dual Comet

只生成和验证 Dual Comet、`assembly_phase2a_dual_comet` 及相关视觉材料。对称指标、规格、几何、碰撞代理、装配、GLB 重导入、Validator、Storm Attack 和 Phase 2A 未修改 Blade 回归全部通过后才允许继续。

### Stage 2：Heavy

只生成和验证 Heavy、`assembly_storm_attack` 和 Heavy 专项视觉材料。连续质量带必须在统一 45°或 side 图中稳定可见，去色后仍成立。

### Stage 3：Guard

只生成和验证 Guard、`assembly_phase2b_assist_guard` 和 Guard 专项视觉材料。8 个缓冲块、真实凹槽和侧视分段节奏必须可见，并与 Heavy 不同。

### Stage 4：Air 和未修改零件

不得重新设计 Air。验证 Air 的规格、几何、碰撞、GLB 和语义指纹无回归；随后核对所有未修改零件、Phase 2A 批准基线和 Storm Attack 中非目标零件。

### Stage 5：Assist Focus

执行完全离线 Playwright 测试，生成三款聚焦截图和浏览器报告。任何交互断言或浏览器错误失败均停止。

### Stage 6：完整 R1 门禁

执行 Schema 与语义验证、Blender 生成、碰撞代理、装配、GLB 重导入、Khronos Validator、Playwright、Storm Attack、Phase 2A、Phase 2B 未修改零件回归和视觉完整性检查。不得运行 288 组合。

## 10. 报告与完成条件

生成：

- `reports/phase2b-r1-validation-summary.md`
- `reports/validation/phase2b-r1-summary.json`
- `reports/validation/phase2b-r1-human-review.json`
- `reports/renders/phase2b-r1/index.md`

最终报告必须记录三个目标零件修订前后参数、三角面、尺寸、材质、Dual Comet 对称指标、碰撞结果、双指纹回归、浏览器测试、视觉索引及仍需 3 至 5 人盲评的项目。

自动门禁只有在以下条件全部满足时通过：

1. Dual Comet 三项对称指标达到阈值；
2. 三个目标零件的规格、几何、碰撞、装配、GLB 和 Validator 通过；
3. Validator error 和 warning 均为 0；
4. 所有碰撞 FAIL 和未解决 CONTACT_REVIEW 均为 0；
5. Storm Attack、Phase 2A 和所有未修改 Phase 2B 零件无语义回归；
6. 所有 Playwright 断言通过，浏览器错误和外部请求均为 0；
7. 所有规定视觉材料存在、非空且尺寸正确；
8. 没有运行 288 组合，没有修改已批准基线和 NSS-V1。

通过后状态只能写为：

```text
Phase 2B-R1 awaiting visual re-review
```

不得写为 Phase 2B approved、Phase 2B complete、进入 Phase 2C、可制造或高速战斗安全认证通过。最终是否接受 R1 仍由 3 至 5 名人员的盲评决定。
