# 私人服务器邀请码管理 CLI 实施计划

日期：2026-08-10

状态：计划草案，待批准

对应设计：`docs/superpowers/specs/2026-08-10-invite-management-cli-design.md`

## 1. 需求理解

为 NSS Arena 公网朋友服增加一个只在服务器终端运行的邀请码管理命令。管理员可以创建随机或自定义邀请码、默认脱敏查看全部邀请码、显式查看完整值，以及幂等停用邀请码。

本任务不增加公网管理 API、网页后台、邀请码删除或恢复启用能力，不改变玩家认领接口、既有身份、战斗、挑战、进度、装配和门户行为。

## 2. 已确认假设

- 入口为单个 `scripts/manage-invites.mjs`，子命令为 `create`、`list`、`disable`。
- `DATABASE_PATH` 未设置时复用 `DEFAULT_DATABASE_PATH`。
- 每次命令运行都先使用 `openDatabase()` 打开数据库，并调用 `migrateDatabase()`。
- 默认邀请码为 `NSS-` 加 20 位大写十六进制字符，默认 `max_uses = 1`。
- 自定义邀请码长度为 6–64，只允许 ASCII 字母、数字、`-` 和 `_`，不裁剪首尾空白。
- `--max-uses` 只接受 JavaScript 安全整数范围内的正整数。
- 默认列表只显示前两位和后两位；`--reveal` 才显示完整值。
- 停用不存在的邀请码失败，重复停用正常退出。
- 测试只操作独立临时数据库；清理时逐个删除已知叶子文件，不递归删除目录。
- 用户已有未跟踪素材和测试截图不暂存、不修改。

## 3. 成功标准

- 空数据库运行 CLI 后自动迁移并创建邀请码。
- 创建、列表和停用的参数、输出和退出码符合已批准规格。
- 列表默认不会输出完整邀请码或玩家数据。
- 停用后拒绝新认领，停用前已建立的身份仍可认证。
- 新增 CLI 测试进入 `test:server` 回归链。
- README、部署手册和发布清单中的命令与实际入口一致。
- 根项目测试、服务端测试、NSS 契约、定制器测试、类型检查、构建和统一站点验证通过。
- 不新增依赖，不修改数据库迁移或现有身份服务代码。

## 4. 执行规则

- 每个功能步骤先写会失败的测试，再添加当前步骤所需的最小实现。
- 只有当前步骤验证通过后才进入下一步。
- 参数解析、数据库操作和输出保持在单一 CLI 文件内，不为未来管理功能提前抽象。
- 所有 SQL 使用参数绑定。
- 不执行真实生产数据库命令；验证统一使用临时路径。
- 每次只暂存计划列出的文件，保留所有无关未跟踪内容。

---

## 【步骤 1】固定 CLI 创建契约

目标：

先用真实子进程调用定义 `create` 命令的参数、迁移、持久化、输出和退出码。

文件：

- 新增 `scripts/test-invite-management-cli.mjs`
- 新增 `scripts/manage-invites.mjs`
- 修改 `package.json`

先写失败测试：

1. 使用 `mkdtemp()` 创建独立临时目录，通过环境变量把 `DATABASE_PATH` 指向其中的明确数据库文件。
2. 在脚本不存在时调用 `node scripts/manage-invites.mjs create`，确认测试稳定失败。
3. 默认创建成功后，直接打开数据库并断言迁移已经应用。
4. 断言默认邀请码匹配 `^NSS-[0-9A-F]{20}$`，且 `max_uses = 1`、`use_count = 0`、`enabled = 1`。
5. 断言创建输出包含完整邀请码、最大次数和数据库路径，退出码为 `0`。
6. 断言 `--max-uses 5` 正确持久化。
7. 断言合法 `--code FRIENDS-2026` 原样持久化。
8. 断言重复邀请码返回非零退出码，原记录不变。
9. 断言短码、长码、空白、非法字符，以及零、负数、小数、非数字和超大次数均失败。
10. 断言未知命令、未知参数和缺少参数打印简短用法并失败。

最小实现：

1. 解析 `process.argv.slice(2)`，只接受规格列出的子命令和参数组合。
2. `create` 默认用 `randomBytes(10).toString('hex').toUpperCase()` 生成邀请码。
3. 严格校验自定义邀请码和最大使用次数，不自动裁剪。
4. 使用 `openDatabase()` 和 `migrateDatabase()` 打开并升级数据库。
5. 使用参数化 `INSERT INTO invites (code, max_uses) VALUES (?, ?)` 写入。
6. 将唯一约束冲突转换为简洁的重复邀请码错误。
7. 顶层捕获预期错误，设置 `process.exitCode = 1`；`finally` 关闭数据库。
8. 在 `package.json` 增加 `invite` 和独立的 `test:invite-management` 命令，暂不接入完整服务端链。

验证：

```powershell
npm run test:invite-management
node --check scripts/manage-invites.mjs
node --check scripts/test-invite-management-cli.mjs
git diff --check
```

预期：创建及输入校验测试通过，临时目录只在逐个删除已知数据库、WAL、SHM 文件后用非递归方式移除。

推荐提交：`feat(server): add invite creation cli`

---

## 【步骤 2】实现安全列表

目标：

增加默认脱敏和显式揭示两种列表输出，不读取玩家数据。

文件：

- 修改 `scripts/test-invite-management-cli.mjs`
- 修改 `scripts/manage-invites.mjs`

先写失败测试：

1. 创建多个启用和停用邀请码，并设置不同的 `use_count`、`max_uses` 和创建时间。
2. `list` 按 `created_at DESC` 输出 `CODE / STATUS / USES / CREATED_AT`。
3. 默认输出包含前两位和后两位，但不包含任何完整邀请码。
4. `list --reveal` 输出完整邀请码。
5. 输出同时包含启用、停用和 `use_count/max_uses`。
6. 数据库没有邀请码时正常退出，并显示空列表提示。
7. 输出中不包含玩家昵称、设备令牌或身份哈希。
8. `list` 不接受 `--code`、`--max-uses` 或未知参数。

最小实现：

1. 查询 `invites` 所需字段，并按 `created_at DESC` 排序。
2. 添加一个局部脱敏函数：保留前两位和后两位，中间替换为同长度星号。
3. 使用稳定的纯文本表头和逐行输出，不引入表格或颜色依赖。
4. 只有精确的 `--reveal` 参数切换为完整值。

验证：

```powershell
npm run test:invite-management
node --check scripts/manage-invites.mjs
git diff --check
```

预期：默认列表不泄露完整值，揭示模式和排序结果正确。

推荐提交：`feat(server): add safe invite listing`

---

## 【步骤 3】实现幂等停用与身份兼容性验证

目标：

完成 `disable`，并证明它只阻止新的邀请码认领，不撤销既有身份。

文件：

- 修改 `scripts/test-invite-management-cli.mjs`
- 修改 `scripts/manage-invites.mjs`

先写失败测试：

1. 停用启用中的邀请码后，数据库 `enabled` 变为 `0`。
2. 成功输出只包含脱敏邀请码，不包含完整值。
3. 第二次停用同一邀请码正常退出并提示已经停用。
4. 停用不存在的邀请码返回非零退出码。
5. `disable` 缺少邀请码或附带额外参数时失败。
6. 先用现有 `redeemInvite()` 创建玩家身份，再通过真实 CLI 停用该邀请码。
7. 停用后新的 `redeemInvite()` 返回 `INVITE_DISABLED`。
8. 停用前获得的凭据仍可通过 `authenticateIdentity()`。

最小实现：

1. 先精确查询目标邀请码状态。
2. 不存在时返回明确错误；已停用时正常退出。
3. 启用时用参数化 `UPDATE invites SET enabled = 0 WHERE code = ?` 更新。
4. 所有停用输出调用同一个局部脱敏函数。
5. 不修改 `server/auth/invite-service.mjs`，由现有逻辑自然兑现兼容性契约。

验证：

```powershell
npm run test:invite-management
npm run test:auth
node --check scripts/manage-invites.mjs
git diff --check
```

预期：新认领被拒绝，既有身份继续有效，身份服务源码没有变化。

推荐提交：`feat(server): add invite disabling`

---

## 【步骤 4】接入服务端回归并更新运维文档

目标：

让 CLI 成为正式的服务器回归和部署流程组成部分。

文件：

- 修改 `package.json`
- 修改 `README.md`
- 修改 `docs/DEPLOYMENT.md`
- 修改 `docs/RELEASE.md`

先写失败检查：

1. 检查 `test:server` 尚未包含 `test:invite-management`。
2. 检查部署手册仍声称邀请码 CLI 尚未实现。
3. 检查发布清单尚未要求创建首个邀请码。

最小实现：

1. 把 `npm run test:invite-management` 接入现有 `test:server` 链。
2. 在 README 增加创建、默认列表、显式揭示和停用的最短命令。
3. 在部署手册的首次启动流程中增加设置 `DATABASE_PATH` 后创建首个邀请码，并说明终端输出保密要求。
4. 从部署阻塞项移除“邀请码创建/停用工具”，保留主机、TLS、持久卷、日志脱敏和真实设备测试等外部事项。
5. 在发布清单增加首个邀请码创建与默认脱敏列表检查。

验证：

```powershell
npm run test:invite-management
npm run test:server
git diff --check
```

预期：服务端回归包含 CLI 测试，文档示例与实际参数完全一致。

推荐提交：`docs(deploy): document invite operations`

---

## 【步骤 5】完整回归与完成检查

目标：

证明新增服务器运维工具没有改变游戏客户端、装配器或现有服务端行为。

文件：

- 原则上不再修改代码；只在发现与本任务直接相关的问题时回到对应步骤修正。

验证：

```powershell
npm run test:unit
npm run test:server
npm run test:nss-contract
node node_modules/typescript/bin/tsc --noEmit

Set-Location battle-top-designer\web-customizer
npm run test:unit
Set-Location ..\..

npm run build
npm run verify:site
git diff --check
git status --short
```

完成检查：

- 只修改计划列出的 CLI、测试、脚本入口和文档。
- 没有新增依赖或迁移。
- 没有修改身份、战斗、挑战、进度、装配和门户业务代码。
- 没有访问真实 `data/arena.sqlite`。
- 没有暂存用户已有未跟踪文件。
- 所有成功标准有对应的自动化验证或明确的文档检查。

预期：全部验证通过；若构建因已有 `dist/site` 拒绝覆盖，只按照现有安全流程把该目录移动到一个明确备份路径，不删除任何目录。

推荐提交：仅在本步骤产生必要修正时提交；否则不创建空提交。

## 5. 风险与回退

- 创建命令完整输出邀请码属于预期行为，但必须避免公共 CI 日志；文档会明确提示。
- 自定义邀请码大小写敏感，CLI 不改变现有认领语义。
- SQLite 被其他进程短暂占用时沿用现有 5 秒 busy timeout，失败后由管理员重试，不增加复杂重试框架。
- 自动随机码发生主键冲突时明确失败，不自动循环；80 位随机空间下该事件可忽略，保持实现简单。
- 功能回退只需停止使用 CLI 并回退相关提交；数据库中的邀请码记录是管理员明确创建的数据，不自动删除。
