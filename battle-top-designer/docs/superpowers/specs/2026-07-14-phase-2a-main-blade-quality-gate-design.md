# Nova Spin System Phase 2A：Main Blade 设计质量门

日期：2026-07-14
状态：已批准，等待实施计划
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

`docs/baselines/v0.1.0-vertical-slice.json` 保存：

- 现有五个零件 GLB 的 SHA-256；
- `assembly_storm_attack.glb` 的 SHA-256；
- Blender 4.5.11 LTS 和构建哈希；
- glTF Validator 2.0.0-dev.3.10；
- Schema、规格文件哈希；
- 构建和测试 PASS 状态。

Phase 2A 修改共享生成器后，必须重新生成并测试 Storm Attack。现有五个零件和 Storm Attack 的 GLB 必须与基线哈希一致；任何未批准的变化均为回归失败。

## 3. JSON 与几何策略

采用“明确策略函数”架构。Main Blade JSON 使用严格枚举字段 `profile_family` 分派到四个独立算法；尺寸、节奏、宽度、高度、窗口和辐条参数只存在于 JSON。共享代码只提供网格构造、材质、接口、法线和导出能力。

### 3.1 Storm Fang

保留现有偏峰极坐标轮廓：三枚前缘陡、后缘缓的 Upper 刃，外伸明显且顶部高度随刃峰上升。该算法作为攻击型基准，不改动可见几何。

### 3.2 Iron Bastion

使用连续圆环和八段宽圆弧阻尼区。外缘只允许浅幅、连续的径向起伏，顶部增加内向加厚带，主要视觉体量集中在内圈。不得出现 Storm Fang 式尖锐外伸刃。

### 3.3 Orbit Halo

使用四段独立流线环段、真实镂空窗口和细辐条。外缘保持接近连续圆形，但环段与辐条分别构造成闭合流形网格，不使用渲染网格布尔运算制造孔洞。

### 3.4 Dual Comet

使用三组等距重复单元。每组包含一段倾斜攻击坡面和一段宽圆弧卸力面；两类接触面分别改变半径、顶部高度和曲率，形成明确双重节奏，同时通过三组等距分布表达动平衡。

## 4. 碰撞代理

每个现有零件和四枚 Main Blade 都生成一个闭合低面数代理：

```text
COLLIDER_<PART_ID>
```

碰撞代理与 `GEO_*` 渲染网格分离，默认隐藏，并设置明确的 `export_exclude` 自定义属性。exporter 同时按名称和属性排除代理；GLB 重导入测试必须确认不存在 `COLLIDER_*`。

代理不覆盖 NSS-V1 中央合法插入区、凸耳锁定区和基准面接触区。非接口代理表面按规格中的数字间隙轻微内缩，避免把共面接触当作体积重叠。

检测固定按以下顺序执行：

1. 零件级 AABB 快速筛选；
2. 对候选代理建立 BVH；
3. BVH 三角面相交确定候选区域；
4. 使用固定精度体素采样估算重叠体积；
5. 输出重叠 AABB、近似中心坐标和 `overlap_volume_mm3`。

体素尺寸、采样数量和允许阈值必须写入报告。合法接口接触不进入代理，因此不依靠扩大碰撞白名单掩盖穿模。

## 5. 四套装配

实际生成和验证：

- `assembly_storm_attack`
- `assembly_iron_defense`
- `assembly_orbit_stamina`
- `assembly_dual_balance`

四套装配只替换 Main Blade。每套均导出 assembled GLB，并检查 NSS-V1 版本、角色、完整安装变换、轴线误差、基准误差、相位误差、总尺寸、三角面、碰撞代理和 GLB 重导入结果。

## 6. 视觉质量门

四枚 Blade 使用相同 512×512 输出尺寸、固定正交比例、固定模型中心、相同灯光、背景、曝光和色彩管理。每枚输出：

- top；
- perspective_45；
- side；
- silhouette；
- contact_sheet。

额外输出：

- `reports/renders/all_blades_silhouette.png`；
- `reports/renders/all_blades_comparison.png`；
- `reports/validation/blade-silhouette-overlap.json`。

剪影报告计算标准化二值剪影的两两 IoU。报告必须声明该数值仅为内部设计启发式指标，不构成法律意义上的原创性证明。

## 7. 完全离线 GLB 预览

预览使用项目内静态 Three.js 依赖：

```text
preview/
├── index.html
├── app.js
├── styles.css
└── vendor/
    ├── three.module.js
    ├── GLTFLoader.js
    ├── OrbitControls.js
    └── LICENSE.txt
```

页面只实现四枚 Blade 切换、鼠标旋转、滚轮缩放、重置视角、材质显示、中心轴和加载状态。页面明确说明 glTF Y-up 中心轴对应 Blender 导出前的 Z 旋转轴。不实现定制器、配色器或装配编辑器。

浏览器验证使用本地静态服务器，检查四个 GLB 请求均为 200、四次切换成功、拖动和缩放生效、Canvas 正常渲染、控制台错误为 0、失败网络请求为 0。

第三方静态依赖必须保留版本信息和许可证。

## 8. 验证流水线

Phase 2A 固定执行：

1. Schema 和语义规格验证；
2. Blender 生成四枚 Blade 与碰撞代理；
3. 渲染网格和代理几何验证；
4. Blade GLB 导出及代理排除检查；
5. GLB 空场景重导入；
6. Khronos glTF Validator；
7. 四套装配生成与接口验证；
8. AABB、BVH 和体素碰撞验证；
9. 标准化视觉渲染及剪影指标；
10. 完全离线预览浏览器验证；
11. 基线哈希核对；
12. Storm Attack 完整回归测试。

任一步骤失败立即以非零退出码停止，不继续生成成功汇总。

## 9. 完成条件

Phase 2A 只有在以下条件全部满足时完成：

1. 四枚 Blade 全部生成；
2. 四枚 Blade 进入不同 `profile_family` 几何策略；
3. 所有导出 GLB 的 Validator error 和 warning 均为 0；
4. Storm Attack 基线测试和哈希回归通过；
5. 四套装配的意外碰撞均为 0；
6. 所有视觉质量输出生成；
7. 完全离线预览可切换四枚 Blade，浏览器控制台无错误；
8. 未生成本阶段范围外零件；
9. 未宣称全部 MVP 完成；
10. 最终状态标记为 `Phase 2A awaiting visual review`。

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
