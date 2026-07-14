# Nova Spin System Phase 2A：Main Blade 设计质量门

日期：2026-07-14
状态：有条件通过修订版，等待最终复审
基线：`v0.1.0-vertical-slice`（提交 `f55e260`）

## 1. 目标与范围

Phase 2A 只实现和验证四枚 Main Blade：

- `blade_storm_fang`
- `blade_iron_bastion`
- `blade_orbit_halo`
- `blade_dual_comet`

本阶段复用现有 `core_solar_wolf`、`assist_heavy`、`gear_low` 和
`tip_flat_attack`，形成四套测试装配。不生成其他 Core、Assist Ring、Height Gear 或
Performance Tip，不运行 288 组合，不宣称全部 MVP 完成。

NSS-V1 在本阶段冻结。不得修改 `specs/interfaces.json`、接口尺寸、角色、方向或容差；若发现明确缺陷，必须先停止实施并单独报告。

## 2. 基线与回归

`docs/baselines/v0.1.0-vertical-slice.json` 统一记录工具链版本、规格文件原始哈希、构建测试结果，并为每个基线 GLB 保存以下两类指纹：

- `raw_sha256`：直接对 GLB 原始字节计算 SHA-256，用于判断二进制产物是否完全一致；
- `semantic_fingerprint`：将 GLB 重新导入 Blender 后生成排序、规范化 JSON，再对该 JSON 计算 SHA-256；
- Blender 4.5.11 LTS 和构建哈希；
- glTF Validator 2.0.0-dev.3.10；
- Schema、规格文件哈希；
- 构建和测试 PASS 状态。

`semantic_fingerprint` 的规范化 JSON 至少包含：

- 每个渲染网格的顶点数、三角面数、规范化拓扑哈希和包围盒；
- 模型总尺寸和每个对象的局部、世界变换；
- 材质名称、材质槽映射及 Principled BSDF 的有效 PBR 参数；
- `MOUNT_<PART_ID>_TOP`、`MOUNT_<PART_ID>_BOTTOM` 的完整变换和自定义属性；
- 排序后的对象类型、父子层级和对象路径；
- `interface_id`、接口角色、方向键和接口相关自定义属性。

指纹失败规则固定为：

- 两个指纹都相同：`PASS`；
- `raw_sha256` 不同但 `semantic_fingerprint` 相同：`BINARY_DRIFT`，表示二进制序列化变化；必须记录差异原因并经人工确认，未确认前阻止 Phase 2A 通过；
- `semantic_fingerprint` 出现未批准变化：`SEMANTIC_REGRESSION`，无论原始哈希结果如何均为硬失败；
- `raw_sha256` 相同但 `semantic_fingerprint` 不同：`FINGERPRINT_INCONSISTENT`，视为指纹工具缺陷并硬失败。

Phase 2A 修改共享生成器后，必须重新生成并测试 Storm Attack。现有五个零件和 Storm Attack 的 GLB 分别按上述双指纹规则判定；原始字节单独变化只产生 `BINARY_DRIFT`，不自动等同于语义回归。未确认的 `BINARY_DRIFT` 和未批准的语义变化均阻止通过。

## 3. JSON 与几何策略

采用“明确策略函数”架构。Main Blade JSON 使用严格枚举字段 `profile_family` 分派到四个独立算法；尺寸、节奏、宽度、高度、窗口和辐条参数只存在于 JSON。共享代码只提供网格构造、材质、接口、法线和导出能力。

所有可见渲染几何的 Blender 对象名和网格数据名统一使用 `GEO_<PART_ID>_<ROLE>`。`GEO_` 是本设计唯一允许的渲染几何前缀；生成、验证、导出和报告不得引入第二套渲染网格前缀。碰撞代理只使用 `COLLIDER_` 前缀，安装空对象只使用 `MOUNT_` 前缀。

### 3.1 Storm Fang

保留现有偏峰极坐标轮廓：三枚前缘陡、后缘缓的 Upper 刃，外伸明显且顶部高度随刃峰上升。该算法作为攻击型基准，不改动可见几何。

### 3.2 Iron Bastion

使用连续圆环和八段宽圆弧阻尼区。外缘只允许浅幅、连续的径向起伏，顶部增加内向加厚带，主要视觉体量集中在内圈。不得出现 Storm Fang 式尖锐外伸刃。

### 3.3 Orbit Halo

使用四段独立流线环段、真实镂空窗口和细辐条。外缘保持接近连续圆形，但环段与辐条分别构造成闭合流形网格，不使用渲染网格布尔运算制造孔洞。

### 3.4 Dual Comet

使用三组等距重复单元。每组包含一段倾斜攻击坡面和一段宽圆弧卸力面；两类接触面分别改变半径、顶部高度和曲率，形成明确双重节奏，同时通过三组等距分布表达动平衡。

## 4. 碰撞代理

碰撞代理覆盖以下 8 个唯一零件：

- `core_solar_wolf`；
- `blade_storm_fang`；
- `assist_heavy`；
- `gear_low`；
- `tip_flat_attack`；
- `blade_iron_bastion`；
- `blade_orbit_halo`；
- `blade_dual_comet`。

当前 5 个纵向切片零件已经包含 Storm Fang，再加 3 个新增 Blade，共计 8 个；Storm Fang 只生成和统计一次。每个零件生成一个低面数代理：

```text
COLLIDER_<PART_ID>
```

每个 `COLLIDER_*` 必须是封闭、流形、法线朝外的实体网格，且非流形边、零面积面、重复顶点和开放边界均为 0。碰撞代理与 `GEO_*` 渲染网格分离，默认隐藏，并设置明确的 `export_exclude` 自定义属性。exporter 同时按名称和属性排除代理；GLB 重导入测试必须确认不存在 `COLLIDER_*`。

代理不覆盖 NSS-V1 中央合法插入区、凸耳锁定区和基准面接触区。代理在接口排除区域的切口不得保持开放：必须使用简化的内侧壁和封盖面关闭代理实体。封盖面只关闭代理边界，不跨越或占据被排除的接口体积。非接口代理表面按规格中的数字间隙轻微内缩，避免把共面接触当作体积重叠。

NSS-V1 接口验证和非接口碰撞验证职责严格分离：

- 接口验证只检查接口 ID、角色、完整安装变换、轴线、基准面、方向键和容差；
- 非接口碰撞验证只检查已经排除合法接口体积的 `COLLIDER_*`；
- 碰撞验证不得通过扩大接口白名单、修改 NSS-V1 容差或忽略中央区域之外的重叠来获得 PASS。

检测固定按以下顺序执行：

1. 零件级 AABB 快速筛选；
2. 对候选代理建立 BVH；
3. BVH 三角面相交确定候选区域；
4. 使用固定精度体素采样估算重叠体积；
5. 输出重叠 AABB、近似中心坐标和 `overlap_volume_mm3`。

每对零件的碰撞结果只能是：

- `PASS`：AABB 不重叠，或 BVH 未发现实际相交；
- `CONTACT_REVIEW`：BVH 发现相交，但估算体积小于或等于允许阈值；报告必须保存位置、体积和相关三角面，等待人工判断是数值共面接触还是设计问题；
- `FAIL`：估算体积大于允许阈值，记为意外碰撞。

体素尺寸、采样数量和允许阈值必须写入报告。`CONTACT_REVIEW` 不计为已确认意外碰撞，但属于未决状态，未完成人工处理前阻止 Phase 2A 自动通过。合法接口接触不进入代理，因此不依靠扩大碰撞白名单掩盖穿模。

## 5. 四套装配

实际生成和验证以下 Blade 测试夹具：

- `assembly_phase2a_storm_fang`
- `assembly_phase2a_iron_bastion`
- `assembly_phase2a_orbit_halo`
- `assembly_phase2a_dual_comet`

四套装配只替换 Main Blade，并不代表完整的攻击、防御、持久或均衡正式配置。每条装配规格必须显式包含：

```json
{
  "purpose": "phase2a_blade_test_fixture",
  "official_configuration": false,
  "baseline_fixture": "storm_attack_vertical_slice",
  "variable_part_type": "main_blade"
}
```

每套测试夹具均导出 assembled GLB，并检查 NSS-V1 版本、角色、完整安装变换、轴线误差、基准误差、相位误差、总尺寸、三角面、碰撞代理和 GLB 重导入结果。现有 `assembly_storm_attack` 只作为 v0.1.0 回归对象保留，不与 Phase 2A 测试夹具混用，也不重命名。

## 6. 视觉质量门

四枚 Blade 的单视图使用相同 512×512 输出尺寸、固定正交比例、固定模型中心、相同灯光、背景、曝光和色彩管理。每枚输出：

- top；
- perspective_45；
- side；
- silhouette；
- contact_sheet（1536×1536）。

额外输出：

- `reports/renders/all_blades_silhouette.png`（2048×512）；
- `reports/renders/all_blades_comparison.png`（2048×2048）；
- `reports/validation/blade-silhouette-overlap.json`。

剪影报告计算标准化二值剪影的两两 IoU。报告必须声明该数值仅为内部设计启发式指标，不构成法律意义上的原创性证明。

高分辨率组合图不得先缩放各模型再拼接；必须复用同一标准化 512×512 单视图源图，以保证比例和相机一致。

## 7. 完全离线 GLB 预览

预览固定使用 Three.js `0.185.1`，依赖完整保存在项目内，不解析浮动版本：

```text
preview/
├── index.html
├── app.js
├── styles.css
└── vendor/
    └── three/
        └── 0.185.1/
            ├── LICENSE.txt
            ├── VERSION.txt
            ├── build/
            │   └── three.module.js
            └── examples/
                └── jsm/
                    ├── loaders/
                    │   └── GLTFLoader.js
                    └── controls/
                        └── OrbitControls.js
```

`index.html` 使用 import map，将 `three` 映射到固定版本的 `build/three.module.js`，并将 `three/addons/` 映射到同版本的 `examples/jsm/`。`app.js` 只允许通过 `three/addons/loaders/GLTFLoader.js` 和 `three/addons/controls/OrbitControls.js` 导入附加模块；不得混用 CDN、裸相对路径或其他 Three.js 版本。

Phase 2A 导出的 GLB 不使用 Draco 压缩，预览页不加载 `DRACOLoader`。只有未来同时提交匹配版本的本地 Draco 解码器、许可证和离线测试后，才允许启用 Draco。

页面只实现四枚 Blade 切换、鼠标旋转、滚轮缩放、重置视角、材质显示、中心轴和加载状态。页面明确说明 glTF Y-up 中心轴对应 Blender 导出前的 Z 旋转轴。不实现定制器、配色器或装配编辑器。

浏览器自动化固定使用 Playwright，在 1440×1000 浏览器视口和完全离线本地静态服务器上执行。预览页暴露只读测试状态 `window.__NSS_PREVIEW__`，用于读取当前模型 ID、相机位置、相机四元数、OrbitControls target、重置基准和加载状态，不提供修改模型的测试后门。

量化断言包括：

- 依次选择四枚 Blade 后，DOM 当前模型 ID、测试状态模型 ID 和预期规格 ID 完全一致；
- WebGL Canvas 的绘制缓冲尺寸为 1024×768，CSS 尺寸与该基准一致；
- 模拟鼠标拖动后，相机位置或四元数相对操作前的欧氏变化量大于 `1e-4`；
- 模拟滚轮后，相机到 OrbitControls target 的距离变化至少 5%；
- 点击重置后，相机位置、四元数和 target 相对初始基准的最大绝对误差不超过 `1e-4`；
- `console.error`、未捕获 `pageerror` 和 `requestfailed` 数量均为 0；
- 四个 Blade GLB、Three.js 模块和页面静态资源请求全部成功。

浏览器测试保存：

- `reports/renders/preview_blade_storm_fang.png`；
- `reports/renders/preview_blade_iron_bastion.png`；
- `reports/renders/preview_blade_orbit_halo.png`；
- `reports/renders/preview_blade_dual_comet.png`；
- `reports/validation/browser-test.json`，包含每项量化断言、实际数值、控制台错误、pageerror 和失败请求列表。

第三方静态依赖必须保留精确版本信息和原始许可证。

## 8. 验证流水线

Phase 2A 固定执行：

1. Schema 和语义规格验证；
2. Blender 生成四枚 Blade 与碰撞代理；
3. 渲染网格和代理几何验证；
4. Blade GLB 导出及代理排除检查；
5. GLB 空场景重导入；
6. Khronos glTF Validator；
7. 四套 Phase 2A Blade 测试夹具生成与接口验证；
8. AABB、BVH、体素碰撞验证和 `CONTACT_REVIEW` 门禁；
9. 标准化视觉渲染及剪影指标；
10. 完全离线预览 Playwright 量化验证；
11. 基线 `raw_sha256` 和 `semantic_fingerprint` 核对；
12. Storm Attack 完整回归测试。

任一步骤失败立即以非零退出码停止，不继续生成成功汇总。

## 9. 完成条件

Phase 2A 只有在以下条件全部满足时完成：

1. 四枚 Blade 全部生成；
2. 四枚 Blade 进入不同 `profile_family` 几何策略；
3. 所有导出 GLB 的 Validator error 和 warning 均为 0；
4. Storm Attack 基线测试、`raw_sha256` 和 `semantic_fingerprint` 回归通过，且不存在未决 `BINARY_DRIFT`；
5. 所有碰撞报告中的 `FAIL` 数量为 0；
6. 未解决的 `CONTACT_REVIEW` 数量为 0；
7. 每一条曾产生的 `CONTACT_REVIEW` 都保存人工处理结论、处理人、处理时间和最终状态；
8. 所有视觉质量输出生成；
9. 完全离线预览可切换四枚 Blade，全部 Playwright 量化断言通过并生成四张预览截图和浏览器测试报告；
10. 未生成本阶段范围外零件；
11. 未宣称全部 MVP 完成；
12. 最终状态标记为 `Phase 2A awaiting visual review`。

## 10. 人工复审

自动化不能替代以下人工判断：

- 四枚 Blade 的类型感是否清晰；
- 四种轮廓是否存在过度相似；
- Iron Bastion 是否真正避免攻击型尖刃；
- Orbit Halo 的镂空是否轻量且连贯；
- Dual Comet 的双重节奏是否易读；
- 材质层级、透明塑料和金属关系是否达到产品设计质量；
- 参考产品与原创模型之间是否仍存在需要进一步拉开的视觉联想。

通过人工视觉评审后，项目才能进入 Phase 2B。
