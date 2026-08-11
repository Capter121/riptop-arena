# NSS Arena 阶段 6：八名对手战役设计

## 1. 目标

将 RIPTOP Arena 现有三轮锦标赛升级为八名对手的顺序战役。战役复用现有 NSS 五层装配、七属性、确定性战斗、发射、回合博弈、QTE、碰撞与胜负流程，不修改战斗规则。

阶段 6 完成后，受邀玩家可以从统一门户进入战役档案，依次挑战八名对手，在每场战斗之间自由换装，通过重复挑战补齐三星，并在服务端持久保存解锁、最佳成绩、一次性奖励和冠军次数。

## 2. 已批准的产品规则

1. 现有“锦标赛”升级为“八人战役”，不保留第二套重复锦标赛。
2. 失败后停留在当前对手，不重置战役进度。
3. 三星目标可以通过多次胜利分别完成。
4. 首次击败当前对手立即解锁下一名，星级不阻挡主线。
5. 奖励沿用现有金币、传统零件解锁与冠军皇冠，不在阶段 6 引入 NSS 零件锁定、纹章、称号或涂装系统。
6. 每名对手首次使用招牌配装，后续挑战按固定顺序轮换另外的合法配装。
7. 三星采用“击败对手＋对手专属策略目标＋表现目标”的统一骨架。
8. 对手使用公开、固定的攻击、防御、持久升级阶梯，不根据玩家当前升级动态追平。
9. 每场战斗之间可以进入定制器换装；战斗开始后锁定本场装配。
10. 保留烈焰獠牙、裂隙漂移和阿特拉斯守卫，并重新编排到八关教学曲线中。
11. 采用轻量战役控制器，`game.ts` 只接入模式控制，不承载八名对手的具体规则。

## 3. 范围

### 3.1 包含

- 八名数据化 NSS 对手和 17 套固定轮换配装。
- 八种确定性 AI Profile。
- 顺序解锁、三星、最佳成绩、首次奖励、补星奖励与冠军皇冠。
- 服务端开战信封、结果结算、SQLite 持久化和幂等重试。
- 门户战役入口、战役档案、对手详情、战前说明和战后结算。
- 定制器安全返回当前对手。
- 身份隔离的离线结果队列。
- 单元、服务端、客户端与双尺寸浏览器回归。

### 3.2 不包含

- 新战斗规则、新技能、新属性或克制表调整。
- NSS 零件解锁、稀有度、套装或动态掉落。
- 角色立绘、剧情动画、配音或新 3D 模型。
- 服务端重新执行整场战斗或商业级反作弊。
- 生存模式、纹章工坊、朋友展厅、AI 纹章和阶段 11 视听打磨。
- 全面重构 `game.ts` 或把所有游戏模式改造成插件系统。

## 4. 架构

### 4.1 战役数据目录

新增 `src/data/campaign/`：

- `opponents.ts`：对手身份、台词、场地、固定升级、配装轮换、AI Profile 和奖励。
- `objectives.ts`：三星目标定义、显示文本和纯函数评价。
- `campaignRules.ts`：顺序解锁、轮换下标、奖励事件 ID 和配置版本。

所有配装必须通过现有 NSS 目录和属性校验。核心属性只能是 `LIGHT` 或 `DARK`。

### 4.2 轻量控制器

新增 `src/campaign/campaignController.ts`：

- 读取 URL 中的对手 ID。
- 获取服务端冻结的战斗信封。
- 将玩家和对手装配交给现有 `Game`。
- 接收现有规范化战斗摘要。
- 提交结果、维护身份隔离的待提交队列并返回结算状态。

普通快速战斗、好友挑战、真人联机和生存模式不得依赖该控制器。

### 4.3 路由

- 门户战役入口：`/campaign/`。
- Arena 战役入口：`/arena/?campaign=<opponentId>`。
- 定制器返回参数必须包含来源类型和对手 ID，并沿用严格解析与安全回跳规则。
- 原 Arena“锦标赛”按钮改名为“八人战役”，导航到 `/campaign/`。

## 5. 八名对手

配置版本初始值为 `campaign-v1`。升级写为攻击/防御/持久。

| 顺序 | ID | 名称 | 主题 | 升级 | AI Profile | 场地 | 配装数 |
|---:|---|---|---|---|---|---|---:|
| 1 | `blaze-fang` | 烈焰獠牙 | 火属性强攻 | 0/0/0 | `assault` | `neon_magma` | 2 |
| 2 | `sky-gale` | 苍穹风刃 | 风属性机动 | 1/0/1 | `skirmisher` | `classic_grid` | 2 |
| 3 | `abyss-tide` | 碧潮回旋 | 水属性消耗 | 1/1/1 | `control` | `absolute_zero` | 2 |
| 4 | `forest-crown` | 森罗根冠 | 木属性持久 | 2/1/2 | `sustain` | `classic_grid` | 2 |
| 5 | `rift-drift` | 裂隙漂移 | 土属性稳定与边缘控制 | 2/2/3 | `ringout` | `neon_magma` | 2 |
| 6 | `dawn-verdict` | 曙光裁决 | 光属性反击 | 3/3/3 | `counter` | `classic_grid` | 2 |
| 7 | `night-eclipse` | 永夜蚀翼 | 暗属性压制 | 4/4/4 | `mixup` | `absolute_zero` | 2 |
| 8 | `atlas-guardian` | 阿特拉斯守卫 | 五属性协调共鸣 | 5/5/5 | `fortress` | 按尝试次数在三场地间固定轮换 | 3 |

## 6. 固定配装轮换

每个配装按 `core / blade / assist / gear / tip` 记录。属性也按相同顺序记录。服务端在创建尝试前读取旧 `attempt_count` 作为从 0 开始的 `attemptOrdinal`，使用 `attemptOrdinal % loadouts.length` 选择配装，然后在同一事务中把 `attempt_count` 增加 1。相同开始请求的幂等重试不得再次增加计数。

| 对手 | 轮换 | 零件 ID | 属性 |
|---|---:|---|---|
| 烈焰獠牙 | 0 | `core_solar_wolf / blade_storm_fang / assist_air / gear_low / tip_flat_attack` | `LIGHT / FIRE / FIRE / FIRE / EARTH` |
| 烈焰獠牙 | 1 | `core_solar_wolf / blade_dual_comet / assist_air / gear_medium / tip_flat_attack` | `LIGHT / FIRE / FIRE / WIND / FIRE` |
| 苍穹风刃 | 0 | `core_void_falcon / blade_storm_fang / assist_air / gear_low / tip_flat_attack` | `DARK / WIND / WIND / WIND / EARTH` |
| 苍穹风刃 | 1 | `core_solar_wolf / blade_dual_comet / assist_air / gear_medium / tip_taper_balance` | `LIGHT / WIND / WIND / WATER / WIND` |
| 碧潮回旋 | 0 | `core_solar_wolf / blade_orbit_halo / assist_guard / gear_high / tip_needle_stamina` | `LIGHT / WATER / WATER / WATER / EARTH` |
| 碧潮回旋 | 1 | `core_void_falcon / blade_dual_comet / assist_guard / gear_medium / tip_needle_stamina` | `DARK / WATER / WATER / WIND / WATER` |
| 森罗根冠 | 0 | `core_solar_wolf / blade_orbit_halo / assist_guard / gear_high / tip_needle_stamina` | `LIGHT / WOOD / WOOD / EARTH / WOOD` |
| 森罗根冠 | 1 | `core_void_falcon / blade_iron_bastion / assist_heavy / gear_high / tip_taper_balance` | `DARK / WOOD / EARTH / WOOD / WOOD` |
| 裂隙漂移 | 0 | `core_void_falcon / blade_dual_comet / assist_heavy / gear_low / tip_taper_balance` | `DARK / EARTH / WIND / EARTH / EARTH` |
| 裂隙漂移 | 1 | `core_void_falcon / blade_orbit_halo / assist_air / gear_medium / tip_ball_defense` | `DARK / EARTH / EARTH / WATER / EARTH` |
| 曙光裁决 | 0 | `core_solar_wolf / blade_dual_comet / assist_guard / gear_medium / tip_taper_balance` | `LIGHT / LIGHT / LIGHT / WIND / EARTH` |
| 曙光裁决 | 1 | `core_solar_wolf / blade_storm_fang / assist_air / gear_low / tip_flat_attack` | `LIGHT / LIGHT / WIND / LIGHT / FIRE` |
| 永夜蚀翼 | 0 | `core_void_falcon / blade_storm_fang / assist_air / gear_low / tip_flat_attack` | `DARK / DARK / DARK / WIND / EARTH` |
| 永夜蚀翼 | 1 | `core_void_falcon / blade_dual_comet / assist_guard / gear_medium / tip_taper_balance` | `DARK / DARK / WATER / DARK / EARTH` |
| 阿特拉斯守卫 | 0 | `core_solar_wolf / blade_iron_bastion / assist_heavy / gear_high / tip_ball_defense` | `LIGHT / EARTH / WATER / WIND / WOOD` |
| 阿特拉斯守卫 | 1 | `core_void_falcon / blade_orbit_halo / assist_guard / gear_medium / tip_needle_stamina` | `DARK / WATER / EARTH / WOOD / FIRE` |
| 阿特拉斯守卫 | 2 | `core_solar_wolf / blade_dual_comet / assist_guard / gear_high / tip_taper_balance` | `LIGHT / WOOD / FIRE / WATER / EARTH` |

## 7. 三星目标

第一星统一为玩家获胜。第二星读取开战时冻结的玩家装配；第三星只读取规范化结果摘要。

| 对手 | 第二星 | 第三星 |
|---|---|---|
| 烈焰獠牙 | 玩家主属性为 `WATER` 并获胜 | 6 回合内获胜 |
| 苍穹风刃 | 玩家主属性为 `WOOD` 并获胜 | 获胜时玩家完整度不少于最大完整度的 50% |
| 碧潮回旋 | 玩家主属性为 `EARTH` 并获胜 | 以 `spin finish` 获胜 |
| 森罗根冠 | 玩家主属性为 `FIRE` 并获胜 | 以 `burst finish` 获胜 |
| 裂隙漂移 | 玩家主属性为 `WIND` 并获胜 | 以 `ring out` 获胜 |
| 曙光裁决 | 玩家主属性为 `DARK` 并获胜 | 5 回合内获胜 |
| 永夜蚀翼 | 玩家主属性为 `LIGHT` 并获胜 | 获胜时玩家最终倾斜不高于 `0.6` |
| 阿特拉斯守卫 | 玩家装配为任一协调共鸣并获胜 | 获胜时玩家完整度不少于最大完整度的 40% |

完整度百分比需要开战信封中的玩家最大完整度。服务器不相信客户端直接提交的百分比，而是用结果摘要中的最终完整度除以冻结装配重新计算的最大完整度。

## 8. 奖励

现有每场胜利基础金币公式继续保留，但战役模式下由结果 API 在服务端事务中计算和入账；客户端不得再为同一场战役调用本地金币入账路径。战役每胜基础金币固定为：

`120 + opponentIndex * 35 + finishBonus + atlasBonus`

其中 `opponentIndex` 为 `0..7`；`finishBonus` 为场外 35、旋转 25、爆裂 50、超时 20；仅阿特拉斯胜利的 `atlasBonus` 为 180，其他关为 0。该公式提取为客户端和服务端共用的纯规则函数，但只有服务端执行入账。以下奖励均为服务端一次性奖励。

| 对手 | 首胜额外金币 | 第二/三星各奖励 | 额外奖励 |
|---|---:|---:|---|
| 烈焰獠牙 | 100 | 40 | 解锁 `slash` |
| 苍穹风刃 | 125 | 50 | 解锁 `drift` |
| 碧潮回旋 | 150 | 60 | 解锁 `light` |
| 森罗根冠 | 175 | 70 | 解锁 `bulwark` |
| 裂隙漂移 | 225 | 90 | 解锁 `heavy` |
| 曙光裁决 | 275 | 110 | 解锁 `rush` |
| 永夜蚀翼 | 350 | 140 | 无 |
| 阿特拉斯守卫 | 500 | 200 | 冠军皇冠 `+1` |

若传统零件已经拥有，则改为发放该零件当前目录价格等额金币。奖励使用以下稳定逻辑键：

- `campaign:<opponentId>:first-win`
- `campaign:<opponentId>:star:2`
- `campaign:<opponentId>:star:3`
- `campaign:<opponentId>:part-conversion`
- `campaign:atlas-guardian:championship`

现有 `wallet_events.event_id` 要求 36 字符。战役服务必须使用固定的战役命名空间，把逻辑键确定性映射为 RFC 4122 格式的 36 字符 UUID；不得把上述可读键直接写入 `event_id`，也不得在重试时生成新 UUID。同一玩家的同一逻辑键只能成功一次。

## 9. AI Profile

AI Profile 只为现有行动提供非负整数权重，并使用现有确定性 AI 随机流选择。Profile 不读取玩家未来输入，不临场换装，不增加隐藏属性。`campaign-v1` 固定权重如下：

| Profile | 攻击 | 闪避 | 防御 | 蓄能 | 轻反射 | 重反射 |
|---|---:|---:|---:|---:|---:|---:|
| `assault` | 50 | 10 | 10 | 20 | 5 | 5 |
| `skirmisher` | 20 | 30 | 10 | 25 | 10 | 5 |
| `control` | 15 | 10 | 25 | 20 | 20 | 10 |
| `sustain` | 10 | 10 | 30 | 30 | 10 | 10 |
| `ringout` | 35 | 25 | 10 | 15 | 10 | 5 |
| `counter` | 10 | 10 | 20 | 15 | 25 | 20 |
| `mixup` | 25 | 15 | 15 | 15 | 15 | 15 |
| `fortress` | 10 | 5 | 30 | 20 | 10 | 25 |

选择前应用现有行动可负担规则：不可负担的攻击从候选中移除；没有 Spirit 且没有免费防御次数时，闪避和防御也从候选中移除；蓄能、轻反射和重反射按现有规则保持可选。随后对剩余权重归一化。攻击被选中后，具体技能继续从可负担技能中使用现有确定性技能选择规则。

## 10. 数据库

新增不可变迁移 `server/storage/migrations/005_campaign_progress.sql`，不得编辑 `001–004`。

### 10.1 `campaign_progress`

主键为 `(player_id, opponent_id)`，字段包含：

- `stars_mask`：`0..7`。
- `defeated`：`0|1`。
- `attempt_count`：非负整数。
- `best_outcome_json`：可空且为规范化胜利摘要 JSON。
- `updated_at`：UTC 文本时间。

最佳结果只在玩家胜利时比较。比较元组依次为：更少回合、更高最终完整度、更少 tick；仍相同时按终结稳定顺序 `burst finish`、`ring out`、`spin finish`、`timeout` 选择。这样重复提交和不同浏览器会得到相同最佳结果。

### 10.2 `campaign_attempts`

- `attempt_id`：UUID 主键。
- `player_id`、`opponent_id` 外键。
- `config_version`、`simulation_version`。
- `seed`、`loadout_index`、`arena`、`ai_profile_id`。
- 冻结的玩家装配、玩家升级、对手装配和对手升级 JSON。
- `start_request_id`，并对 `(player_id, start_request_id)` 唯一。
- 可空 `result_request_id`、结果摘要 JSON 和完整结算响应 JSON；非空结果请求对 `(player_id, result_request_id)` 唯一。
- `started_at`、可空 `completed_at`。

完成结果的同一尝试不可被不同结果覆盖。

## 11. API

### 11.1 `GET /api/campaign`

返回 `campaign-v1` 公共档案、当前身份的八关进度、总星数、下一名对手、冠军次数和奖励状态。

### 11.2 `POST /api/campaign/attempts`

请求：`{ requestId, opponentId }`。

服务端验证身份、解锁状态和当前 NSS 装配，原子创建尝试并增加该对手的 `attempt_count`。响应返回 `attemptId`、配置版本、模拟版本、种子、双方冻结装配与升级、AI Profile、场地、目标和展示信息。

相同身份与 `requestId` 重试必须返回同一尝试。

### 11.3 `POST /api/campaign/attempts/:attemptId/result`

请求：`{ requestId, outcome }`，其中 `outcome` 是现有规范化战斗摘要。

同一 SQLite 事务内完成：授权、契约校验、目标评价、最佳成绩合并、顺序解锁、现有基础金币、稳定一次性钱包事件、零件解锁或转换、最终皇冠、结果和响应快照保存。响应包含新的权威 progression 快照，客户端只应用该快照，不再次执行本地战役金币奖励。

相同结果重试返回原响应；已完成尝试提交不同结果返回 `409 CAMPAIGN_RESULT_CONFLICT`。

## 12. 客户端体验

### 12.1 门户

门户“八人战役”开放并显示当前进度、总星数、待提交角标和冠军次数。

### 12.2 战役档案

`/campaign/` 单页显示八张对手卡。卡片状态为锁定、已解锁或已击败。只为当前展开的对手加载 3D 预览，关闭详情后释放资源。

详情显示核心属性、可能轮换的属性、固定升级、AI 倾向、场地、教学、三星、最佳成绩和奖励。可执行“挑战”“进入定制器”“返回档案”。

### 12.3 Arena 与结算

Arena 在获得服务端冻结信封后才开始战役。现有战斗结束后，结算区域展示旧星、新增星、完成原因、奖励、最佳成绩和下一关。操作包括下一名、重赛、换装和返回档案。

## 13. 离线与错误处理

- 战前离线：不开始战役，显示重试和返回。
- 未解锁、未知对手或不支持配置版本：拒绝进入。
- 战斗中断网：本地战斗继续。
- 结果提交失败：以身份为分区保存 `{ playerId, requestId, attemptId, outcome }`。
- 待确认期间不提前解锁下一关或显示奖励到账。
- 恢复联网后按创建顺序重试；确认后才移除队列项。
- 本地身份变化时不得提交另一身份的队列。
- 对手资源加载失败时返回档案，不替换成普通 AI。

## 14. 测试门禁

### 14.1 单元

- 恰好八名对手、17 套配装，ID 和奖励事件唯一。
- 所有零件、属性、核心属性、升级、场地和目标合法。
- 轮换顺序稳定。
- 八种 AI Profile 固定种子可复现。
- 三星边界、解锁、最佳成绩与奖励合并正确。

### 14.2 服务端

- 从现有 `001–004` 数据库升级到 `005`。
- 身份、锁定关、请求形状与配置版本校验。
- 开始和结果幂等。
- 不同结果冲突。
- 失败不退关，首胜只解锁一次，补星只发新增奖励。
- 已有零件转换金币，最终皇冠只增加一次。
- 服务重启后进度存在，备份检查识别迁移 `005`。

### 14.3 客户端与 E2E

- 严格解析响应和身份隔离离线队列。
- 门户到首胜闭环。
- 失败留关、换装返回、重复挑战补星。
- 使用 QA 快速结算依次打通八关并达到 `24/24`。
- 桌面与手机尺寸均可完成档案、详情和结算操作。
- 快速战斗、好友挑战、真人联机、进度同步、备份和统一构建全部回归。

## 15. 完成标准

1. 八名对手可按顺序完整通关。
2. 教学顺序、固定难度、配装轮换和 AI 行为符合 `campaign-v1`。
3. 三星可以跨重复胜利累计，主线只依赖首胜。
4. 所有一次性奖励在重复、断线和重试下最多发放一次。
5. 场间换装安全返回当前对手。
6. 服务重启后战役进度和奖励状态不丢失。
7. 阶段 6 全量测试和既有核心回归通过。

## 16. 已接受限制

- 私人朋友服信任合法客户端结果；服务端不重新运行整场模拟。
- 第一版无角色立绘、剧情过场和语音。
- 战役配置更新必须提升配置版本，已开始尝试继续按冻结的旧版本结算。
- 阶段 6 不解决 `game.ts` 的整体历史体积，只提取战役必须的控制逻辑。
