# NSS 建模器与 RIPTOP Arena 完整接入设计

## 1. 背景与目标

当前仓库包含两个独立产品：

- Nova Spin Web Customizer 使用 NSS-V1 五层结构：`core / blade / assist / gear / tip`，加载 16 个正式 GLB，并能枚举 288 种合法组合。
- RIPTOP Arena 使用旧三槽结构：`attackRing / core / driver`，战斗视觉主要由程序化几何生成，战斗属性、存档和联机协议也围绕旧结构建立。

本设计的目标是在同一网站中提供 `/customizer/` 和 `/arena/` 两个入口，使玩家从建模页选择的五层 NSS-V1 组合能够以相同零件 ID、相同正式 GLB 和确定性战斗属性进入单机及联机战斗。

本阶段不包含账号系统、云端库存、服务端永久存档、旧零件升级自动迁移，也不修改正式 GLB、NSS-V1 接口、建模器概念属性或已冻结视觉资产。

## 2. 已确认的产品决策

1. 两个应用保持独立代码边界，通过共享契约和统一静态站点发布。
2. 正式产品路由为 `/customizer/` 与 `/arena/`。
3. NSS 战斗数值使用独立权威目录，不直接复用建模器概念属性，也不从几何实时推导。
4. NSS 模式保留玩家已有的全局攻击、防御和持久升级；旧三槽零件升级不作用于 NSS。
5. 战斗中使用五层正式 GLB，但碰撞继续使用确定性物理代理，不使用逐三角形碰撞。
6. 旧三槽存档和旧敌人在迁移期通过明确的 `legacy` 类型保留。
7. 联机协议升级后交换 NSS 零件 ID，不传输 GLB 或客户端计算出的最终属性。

## 3. 共享载荷契约

共享载荷只包含稳定事实：版本、接口和五个零件 ID。

```ts
type NssFamily = 'core' | 'blade' | 'assist' | 'gear' | 'tip';

type NssCombination = Record<NssFamily, string>;

type NSSBattleLoadoutV1 = {
  schemaVersion: 1;
  interfaceId: 'NSS-V1';
  combination: NssCombination;
};
```

中文名称、计算后的属性、GLB 路径、展示镜头和建模器交互状态不进入载荷。消费者根据权威目录自行解析这些信息，避免 URL 伪造战斗属性，也保证平衡调整后旧组合链接继续有效。

共享验证器必须确认：

- 对象仅包含规定字段；
- 五个 family 完整且无多余字段；
- 每个零件 ID 存在并属于正确 family；
- `interfaceId` 为 `NSS-V1`；
- 组合编号与五个零件 ID 能够双向一致还原。

## 4. 页面路由与组合传递

建模器已有稳定的 288 组合编号，例如 `nss-p2c-0001`。统一站点使用紧凑 URL：

```text
/customizer/?combo=nss-p2c-0001
/arena/?combo=nss-p2c-0001&loadoutVersion=1
```

建模页新增“进入竞技场”主操作，只传递组合编号和载荷版本。战斗页启动时按以下优先级解析组合：

1. 合法 URL 组合；
2. 上一次成功使用的 NSS 组合；
3. 默认 NSS 组合；
4. 旧三槽存档仅由兼容入口读取。

非法 URL 不进入战斗。应用回退到默认 NSS 组合，并在车库显示明确提示。

开发环境通过 `VITE_ARENA_URL` 配置跳转目标；生产环境使用同源相对路由，不在产品代码中写死端口或域名。

## 5. 正式 GLB 战斗视觉

视觉模型和战斗物理保持独立：

```text
TopEntity
├─ BattleTopVisual
│  ├─ Core GLB
│  ├─ Blade GLB
│  ├─ Assist GLB
│  ├─ Gear GLB
│  └─ Tip GLB
└─ BattleTopPhysics
   ├─ collisionRadius
   ├─ weight
   ├─ spin
   ├─ integrity
   └─ combat stats
```

车库阶段使用 `GLTFLoader` 预加载组合需要的五个 GLB。`NssAssembler` 读取现有 `MOUNT_<partId>_TOP/BOTTOM` 节点及 `interface_id`，复用建模器已验证的装配矩阵算法，将五层装配为单一 `THREE.Group`。

只有资源加载、接口验证和装配全部成功后才允许发射。战斗中不动态加载 GLB。每种资源只加载一次，战斗实例从缓存安全 clone；重开、返回车库和销毁实例时必须正确释放实例引用，不销毁仍由共享缓存使用的资源。

正式 GLB 的 Geometry、Material、Texture、节点变换和 mount 数据不得被修改。若竞技场单位不同，只允许在装配完成后的视觉根组施加一个统一固定尺度，禁止逐组合人工校正。

Blade 子组保留独立引用，用于现有高速旋转效果；其他层随主体旋转、倾斜、位移和受击反馈同步。建模器运行时身份层不通过 URL 传递，战斗项目根据对应零件自动启用一致的身份视觉。

碰撞继续使用简化圆形代理。碰撞半径、重量和行为参数来自战斗目录，而不是运行时扫描 GLB 三角形，从而保持性能和联机确定性。

## 6. 独立战斗数值目录

每个 NSS 零件由独立战斗目录定义：

```ts
type NssBattlePart = {
  id: string;
  family: NssFamily;
  stats: {
    attack: number;
    defense: number;
    stamina: number;
    mobility: number;
    burstResist: number;
  };
  physics: {
    weight: number;
    collisionRadius?: number;
  };
};
```

各层主要职责：

| 层级 | 主要职责 |
|---|---|
| Core | 综合能力、抗爆、基础稳定性 |
| Blade | 攻击、碰撞半径、暴击倾向 |
| Assist | 防御、重量、抗爆 |
| Gear | 转速传递、机动、重量 |
| Tip | 持久、机动和抓地稳定性 |

第一版只接入现有战斗可以稳定消费的数值，不新增复杂摩擦曲线、随机词条或零件专属技能。五个零件的基础贡献相加，再叠加玩家全局攻击、防御和持久升级，最后交给纯函数生成 `BattleStats`。

旧三槽 `partUpgrades` 不参与 NSS 计算。身份 SVG 和显示开关不提供隐藏战斗加成。所有派生属性由客户端和服务端共享的确定性规则生成，不接受 URL 或网络消息中的最终属性值。

## 7. 车库与旧系统兼容

迁移期统一使用明确联合类型：

```ts
type PlayerBuild =
  | { kind: 'legacy'; build: BuildSelection }
  | { kind: 'nss-v1'; loadout: NSSBattleLoadoutV1 };
```

新建模页入口只生成 `nss-v1`。旧存档和未迁移敌人继续使用 `legacy`，不重写用户现有存档。

NSS 车库第一版只负责确认，不重复实现建模功能。它展示五个零件名称、装配模型、汇总战斗属性、加载状态、“返回定制”和“进入竞技场”。需要编辑组合时返回 `/customizer/`。

模型缺失、mount 错误、接口不匹配或数值目录缺失时，车库阻止发射并指出具体零件，不携带错误模型进入战斗。

## 8. 联机协议 V2

联机载荷升级为：

```ts
type OnlineLoadout =
  | {
      kind: 'legacy';
      build: BuildSelection;
      upgrades: UpgradeLevels;
      partUpgrades: PartUpgradeLevels;
    }
  | {
      kind: 'nss-v1';
      comboId: string;
      combination: NssCombination;
    };
```

服务端验证组合编号、五个字段、family、零件白名单和当前目录版本。客户端不能提交最终攻击力、重量、血量或暴击率。

匹配成功后双方只交换载荷。GLB 由浏览器从统一静态资源路径本地加载。双方加载并装配自己和对手的模型后才发送 `CLIENT_READY`；只有双方 ready 后才开始倒计时。

协议 V1 与 V2 不静默互配。版本不一致时返回明确错误。服务端不降级或猜测载荷结构。

## 9. 构建与发布结构

两个应用独立构建，再组装为统一静态站点：

```text
dist/site/
├─ index.html
├─ customizer/
│  ├─ index.html
│  └─ assets/
├─ arena/
│  ├─ index.html
│  └─ assets/
└─ assets/nss/parts/
   └─ 16 个正式 GLB
```

16 个正式 GLB 只发布一份。建模器和竞技场读取同一资源目录，避免重复体积和版本漂移。统一发布检查必须验证共享契约版本、战斗目录哈希、16 个 GLB 清单和两个应用的资源引用。

## 10. 分阶段实施

### 阶段 1：共享契约与战斗目录

- 建立载荷类型、验证器、组合编号双向映射和 16 零件战斗目录。
- 实现 `buildNssBattleStats()`。
- 保留旧 `BuildSelection`。

门禁：16 个目录条目 family 正确；288 种组合全部可解析；属性有限、非负、确定；全局升级正确叠加；旧零件升级不影响 NSS；客户端与服务端目录哈希一致。

### 阶段 2：单机 GLB 垂直切片

先使用 Solar Wolf、Storm Fang、Heavy、Low Gear、Flat Attack 默认组合，完成预加载、装配、车库确认、发射、旋转、碰撞、受击、结果和重开。

门禁：五层装配与建模器一致；原始材质不变；Blade 旋转正常；Tip 不穿场地；碰撞稳定；失败资源不能进入战斗；无重复资源泄漏。

### 阶段 3：288 组合与页面闭环

- 建模页增加“进入竞技场”。
- 战斗车库解析 URL、显示正式模型和战斗属性。
- 支持返回定制和本地恢复。
- 覆盖全部 288 种组合。

门禁：建模页、车库、战斗模型和属性输入使用同一组合；刷新不丢失；非法参数安全回退；16 个正式 GLB 字节零变化。

### 阶段 4：联机协议 V2

- 服务端验证 NSS 载荷。
- 匹配双方加载对手模型。
- 双方资源 ready 后开始战斗。

门禁：非法 ID 被拒绝；V1/V2 不误配；派生属性不可伪造；断线、加载失败和 ready timeout 有明确终态；双方目录版本和属性一致。

### 阶段 5：统一发布

- 生成 `/customizer/` 与 `/arena/`。
- 共享单份正式 GLB。
- 完成统一构建、静态资源和路由检查。

最终不变量：

```text
Customizer combination
= Arena garage combination
= Player battle visual
= Battle stats input
= Online transmitted loadout
```

## 11. 测试策略

单元测试覆盖契约解析、组合编号、16 个目录条目、288 种属性计算、全局升级、URL 非法输入、协议 V2 和客户端/服务端目录哈希。

Three.js 集成测试覆盖 mount 节点、装配矩阵、缓存与 clone、销毁生命周期、GLB 字节保护以及视觉模型与物理代理分离。

浏览器专项覆盖建模页跳转、车库一致性、完整单局、返回定制、刷新恢复和双端联机模型一致。

阶段 1 至 4 使用范围匹配的专项测试；阶段 5 完成后再执行一次新的正式全量质量门禁，避免在每个小步骤重复运行完整 Stage 8。

## 12. 风险与控制

- `Game` 类体积过大：资源加载、NSS 验证、装配和数值计算必须放入独立模块，`Game` 只编排状态。
- `TopEntity` 依赖旧 Mesh 结构：通过 `BattleTopVisual` 提供稳定引用，不让战斗逻辑读取 GLB 内部实现细节。
- 模型单位差异：只在视觉根组使用一个固定比例，不允许逐组合校正。
- 联机加载速度差异：双方完成资源准备后才开始倒计时。
- 旧存档迁移风险：保留 `legacy` 分支，不原地改写旧存档。
- 平衡与模型耦合风险：战斗目录独立，禁止修改建模 JSON 和 GLB 来调数值。

## 13. 回滚策略

迁移期保留旧三槽入口、旧存档读取和 `legacy` 战斗路径。若 NSS 接入出现阻断问题，可以关闭 NSS 路由入口并继续使用旧战斗流程，无需回滚建模器、正式 GLB 或用户旧存档。

失败的 NSS 载荷不得自动转换成旧三槽组合。协议 V1 和 V2 分开匹配，禁止以隐式降级掩盖版本错误。

## 14. 完成定义

功能完成必须同时满足：

- 建模器可将当前组合送入竞技场；
- 竞技场车库显示相同的五层组合和正式模型；
- 战斗使用独立且确定的 NSS 数值；
- 单机和联机均能完成完整战斗；
- 288 种组合全部合法可装配；
- 正式 16 个 GLB、NSS-V1 和建模数据零修改；
- 旧存档仍可通过 `legacy` 路径使用；
- 统一站点可从 `/customizer/` 与 `/arena/` 访问；
- 专项测试和最终全量质量门禁通过。
