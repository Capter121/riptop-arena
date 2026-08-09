# 私人服务器基础备份与恢复实施计划

日期：2026-08-09

状态：计划草案，待批准

对应设计：`docs/superpowers/specs/2026-08-09-private-server-backup-restore-design.md`

对应总计划：`docs/superpowers/plans/2026-08-01-nss-arena-complete-expansion-implementation.md` 任务 4.6

## 1. 需求理解

为公网朋友服增加一套基础运维命令：服务器运行期间用 Node 原生 `node:sqlite.backup()`生成一致的 SQLite 快照，并把实际存在的上传文件放入同一个版本化备份目录；恢复前完整校验清单、哈希、数据库和迁移版本，并且只允许停服后恢复到不存在的目标。

本任务不增加自动调度、云上传、压缩、加密、自动删除、在线恢复或覆盖恢复，不修改玩家身份、进度、门户和战斗玩法。

## 2. 已确认假设

- Node.js v24 当前导出 `backup(sourceDb, path, options)`；源数据库必须打开，目标文件存在时会被覆盖，因此实现必须在调用前保证全新的目标目录和目标文件。
- `DatabaseSync` 支持 `readOnly: true`，用于打开已验证存在的源数据库和备份快照，避免路径错误创建空库。
- 数据库来源或恢复目标沿用 `DATABASE_PATH` 与 `DEFAULT_DATABASE_PATH`。
- 备份根目录必须由 `--output` 或 `BACKUP_ROOT` 提供，不建立项目内隐式默认值。
- 上传来源或恢复目标由 `UPLOAD_ROOT` 提供；备份时缺失表示无上传数据，恢复包含上传数据时缺失则失败。
- 测试只使用独立临时目录，并按已知叶子文件逐一清理；不使用递归删除。
- 所有用户已有未跟踪素材保持未暂存。

## 3. 成功标准

- 运行中的 WAL 数据库能够在线备份，快照包含迁移、身份和进度记录。
- `manifest.json` 最后写入，并严格记录数据库、上传文件、字节数、SHA-256、迁移版本和 `quick_check`。
- 上传目录不存在时不创建；存在时只复制普通文件，不跟随符号链接或目录联接。
- dry-run 不打开数据库、不创建目录、不写文件。
- 恢复 dry-run 能发现损坏、路径攻击、未知迁移和目标冲突。
- 正式恢复不覆盖数据库或上传目标，恢复后再次校验哈希与 SQLite 完整性。
- CLI 成功输出单个 JSON 摘要，错误返回非零状态且不泄漏敏感值。
- 服务端、根单元测试、NSS 契约、类型和语法回归全部通过。
- 战斗、属性、物理、奖励、身份和进度实现文件没有变化。

## 4. 执行规则

- 每一步先增加会失败的测试，再写当前步骤所需的最小实现。
- 当前步骤验证通过后才进入下一步。
- 不建立通用归档框架，不增加第三方依赖。
- 不提供 `--force`、自动删除、清空或覆盖路径。
- 失败现场原样保留；测试临时文件按明确路径逐一清理。
- 每个功能步骤独立提交，只暂存计划列出的文件。

---

## 【步骤 1】建立归档边界和 dry-run 契约

目标：

先固定两个核心函数的窄接口、路径来源和无写入 dry-run 行为，不执行真实数据库备份。

文件：

- 新增 `server/storage/private-server-archive.mjs`
- 新增 `scripts/test-private-server-archive.mjs`

先写失败测试：

1. 导入 `backupPrivateServer()` 和 `restorePrivateServer()`。
2. 备份缺少 `backupRoot` 时拒绝。
3. 数据库不存在或不是普通文件时拒绝。
4. 备份目标位于上传来源内部时拒绝。
5. backup dry-run 返回规范化来源、时间戳目标和 `dryRun: true`，但文件系统无新增项。
6. restore 缺少显式 `backupPath` 时拒绝。
7. 路径比较使用解析后的绝对路径，不依赖字符串前缀。

最小实现：

1. 导出 `backupPrivateServer(options)` 和 `restorePrivateServer(options)`。
2. 核心 options 只包含数据库路径、备份根目录、可选上传路径、备份路径、dry-run，以及测试注入时钟。
3. 使用 `resolve()`、`relative()` 和路径分隔符判断包含关系。
4. dry-run 只执行 `lstat` 和目标冲突检查，不打开 `DatabaseSync`。
5. 目录名使用 UTC 紧凑时间戳；已存在时失败，不追加、不覆盖。

验证：

```powershell
node scripts/test-private-server-archive.mjs
node --check server/storage/private-server-archive.mjs
git diff --check
```

预期：路径和 dry-run 测试通过，临时根目录清理后为空。

推荐提交：`feat(storage): define private archive boundaries`

---

## 【步骤 2】实现 SQLite 在线快照和数据库清单

目标：

使用原生备份 API 生成可独立打开的一致快照，并在成功检查后写入数据库清单。

文件：

- 修改 `server/storage/private-server-archive.mjs`
- 修改 `scripts/test-private-server-archive.mjs`

先写失败测试：

1. 建立临时 WAL 数据库，应用 001–003 迁移并插入邀请、玩家和进度。
2. 保持原连接打开时调用备份。
3. 断言备份数据库能只读打开且数据完整。
4. 断言 `PRAGMA quick_check` 为 `ok`。
5. 断言清单包含 `[1, 2, 3]`、数据库字节数和正确 SHA-256。
6. 固定时钟下目标目录已存在时拒绝，既有文件保持不变。
7. 备份 API 失败时不写 `manifest.json`。

最小实现：

1. 在创建目标前再次确认源数据库和目标状态。
2. 以 `DatabaseSync(databasePath, { readOnly: true, timeout: 5000 })` 打开源数据库。
3. 调用 `backup(sourceDatabase, snapshotPath)`，并始终关闭脚本自己的连接。
4. 只读打开快照，执行 `PRAGMA quick_check` 并读取排序后的 `schema_migrations.version`。
5. 流式计算 SHA-256 和字节数，避免把整个数据库读入内存。
6. 先完成全部检查，最后以 UTF-8 写入严格的 `formatVersion: 1` 清单。
7. 结果摘要只返回路径、数量、字节数和状态，不返回数据库内容。

验证：

```powershell
node scripts/test-private-server-archive.mjs
npm run test:database
node --check server/storage/private-server-archive.mjs
git diff --check
```

预期：运行中的 WAL 数据库备份成功，快照可重启读取，失败目录不含有效清单。

推荐提交：`feat(storage): back up live sqlite snapshots`

---

## 【步骤 3】加入可选上传文件和严格清单

目标：

只复制实际存在的普通上传文件，并让清单成为归档内全部文件的完整白名单。

文件：

- 修改 `server/storage/private-server-archive.mjs`
- 修改 `scripts/test-private-server-archive.mjs`

先写失败测试：

1. 未配置或不存在上传目录时清单为 `included: false` 且不生成 `uploads/`。
2. 存在嵌套文件时保持相对路径，大小和 SHA-256 正确。
3. 上传根不是目录时拒绝。
4. 符号链接、目录联接或其他非普通项被拒绝；Windows 无权限创建链接时明确跳过该文件系统夹具，但路径穿越测试仍必须执行。
5. 上传文件名包含 `..` 文本但不是路径段时仍可正常处理，真正的路径穿越被拒绝。
6. `manifest.json` 最后写入，且文件列表按规范路径排序，结果确定。

最小实现：

1. 使用 `readdir(..., { withFileTypes: true })` 配合每项 `lstat` 逐层枚举。
2. 不跟随符号链接；只接受目录和普通文件。
3. 复制前后均通过规范绝对路径确认仍位于来源与目标根目录内。
4. 使用 `copyFile()`逐文件复制，并对目标文件计算哈希。
5. 上传清单条目只包含 `path`、`bytes` 和 `sha256`。
6. 备份目录与文件尽可能设置当前用户权限；不把权限差异作为 Windows 失败条件。

验证：

```powershell
node scripts/test-private-server-archive.mjs
node --check server/storage/private-server-archive.mjs
git diff --check
```

预期：无上传和嵌套上传两条路径通过，归档内没有清单未声明的产品文件。

推荐提交：`feat(storage): include verified upload files in backups`

---

## 【步骤 4】实现只读恢复验证和迁移兼容性

目标：

在写入任何恢复目标前，完整证明备份清单、文件和数据库可信且能被当前程序理解。

文件：

- 修改 `server/storage/private-server-archive.mjs`
- 修改 `scripts/test-private-server-archive.mjs`

先写失败测试：

1. 缺少清单、非 JSON、额外键、缺字段和错误 `formatVersion` 被拒绝。
2. 绝对路径、`..`、反斜杠混淆、重复条目和重复规范路径被拒绝。
3. 未记录文件、未知文件、符号链接和缺失文件被拒绝。
4. 字节数或 SHA-256 被修改时拒绝。
5. 损坏 SQLite 或 `quick_check` 非 `ok` 时拒绝。
6. 清单声明数据库中不存在的迁移版本时拒绝。
7. 备份含当前迁移目录未知的新版本时拒绝。
8. 旧迁移版本的有效备份通过 dry-run，且目标无写入。
9. 备份包含上传文件但恢复未配置 `uploadsPath` 时拒绝；`included: false` 时忽略上传目标。

最小实现：

1. 对清单使用精确键集合和窄类型检查，不宽松清洗未知字段。
2. 枚举归档实际普通文件，与清单声明集合做双向相等比较。
3. 重新计算全部字节数和哈希。
4. 只读检查 SQLite，并把数据库实际迁移版本与清单比较。
5. 从 `server/storage/migrations/` 的 `NNN_name.sql` 文件名读取当前支持版本；不修改现有迁移器。
6. 旧备份允许缺少后续版本，但不得包含当前代码未知的版本。
7. restore dry-run 在验证完成后返回计划摘要，不创建父目录。

验证：

```powershell
node scripts/test-private-server-archive.mjs
npm run test:database
node --check server/storage/private-server-archive.mjs
git diff --check
```

预期：所有损坏和越界样例在目标写入前失败，合法旧备份通过验证。

推荐提交：`feat(storage): validate private server archives`

---

## 【步骤 5】实现非覆盖式恢复

目标：

把已完全验证的归档恢复到不存在的数据库和可选上传目标，并在完成后再次验证。

文件：

- 修改 `server/storage/private-server-archive.mjs`
- 修改 `scripts/test-private-server-archive.mjs`

先写失败测试：

1. 目标数据库存在时拒绝，并验证原字节未变。
2. 备份包含上传时，目标上传目录存在即拒绝，并验证原文件未变。
3. 不含上传时，即使配置路径附近存在其他目录也不创建、不修改上传目标。
4. 正常恢复先产生上传文件，最后产生数据库。
5. 恢复后数据库记录、文件哈希和 `quick_check` 与备份一致。
6. 旧版本数据库恢复后调用当前 `migrateDatabase()` 能升级到 001–003。
7. 模拟复制失败时不放置最终数据库，不自动删除部分上传现场。

最小实现：

1. 在任何写入前完成步骤 4 的全部验证和目标冲突检查。
2. 仅创建明确的目标父目录与上传子目录，不清空既有目录。
3. 上传文件逐项复制并校验。
4. 数据库复制到同一父目录的明确临时文件，校验后以原子改名放置到最终不存在的目标。
5. 最终数据库出现后，再执行一次只读 `quick_check` 和哈希校验。
6. 成功摘要返回文件数、总字节数和最终路径。
7. 任何失败都保留现场并报告，不调用递归删除或回滚式清空。

验证：

```powershell
node scripts/test-private-server-archive.mjs
npm run test:database
node --check server/storage/private-server-archive.mjs
git diff --check
```

预期：空目标完整恢复，冲突目标零修改，失败时最终数据库不可见。

推荐提交：`feat(storage): restore verified private server archives`

---

## 【步骤 6】接入 CLI、npm 命令和 Git 忽略规则

目标：

提供可直接运维使用的两个命令，并确保默认运行数据和误放在项目内的备份不会进入 Git。

文件：

- 新增 `scripts/backup-private-server.mjs`
- 新增 `scripts/restore-private-server.mjs`
- 修改 `scripts/test-private-server-archive.mjs`
- 修改 `package.json`
- 修改 `.gitignore`

先写失败测试：

1. 使用子进程运行两个 CLI 的成功和 dry-run 路径。
2. `--output` 覆盖 `BACKUP_ROOT`。
3. 两者都缺失时备份命令失败。
4. restore 缺少 `--backup`、参数值缺失、未知参数或重复参数时失败。
5. 成功 stdout 是单个 JSON 对象；dry-run 明确标记。
6. 失败返回非零状态，stderr 不包含测试数据库中的邀请码、昵称或令牌哈希。
7. CLI 不输出堆栈和完整 options 对象。

最小实现：

1. 手写窄参数解析，只支持规格明确的参数。
2. 备份 CLI 读取 `DATABASE_PATH`、`UPLOAD_ROOT`、`BACKUP_ROOT`，并应用 `--output` 优先级。
3. 恢复 CLI 读取 `DATABASE_PATH`、`UPLOAD_ROOT` 和显式 `--backup`。
4. 成功 `console.log(JSON.stringify(summary))`；失败输出安全错误文本并设置 `process.exitCode = 1`。
5. `package.json` 增加 `backup:server`、`restore:server`、`test:backup`，并把测试接入 `test:server` 末尾。
6. `.gitignore` 增加根级 `/data/` 和 `/backups/`；不添加无关忽略项。

验证：

```powershell
npm run test:backup
npm run test:server
node --check scripts/backup-private-server.mjs
node --check scripts/restore-private-server.mjs
git diff --check
```

预期：命令可直接使用，服务端测试链包含备份恢复门禁，Git 不跟踪运行数据。

推荐提交：`ops: add private server backup and restore commands`

---

## 【步骤 7】执行阶段 4 完整回归与交付审计

目标：

证明基础备份关闭阶段 4 门禁，且没有改变玩法、身份或进度语义，也没有混入用户文件。

文件：

- 原则上不新增产品文件；只修复本任务导致的失败。

自动验证：

```powershell
npm run test:backup
npm run test:server
npm run test:unit
npm run test:nss-contract
npx tsc --noEmit
node --check server/storage/private-server-archive.mjs
node --check scripts/backup-private-server.mjs
node --check scripts/restore-private-server.mjs
git diff --check
```

完成审计：

1. 在临时 WAL 数据库连接保持打开时完成备份。
2. 从备份恢复到空临时目标，重启数据库并读取身份、进度和迁移记录。
3. 修改一个备份字节后确认 dry-run 在写入前拒绝。
4. 确认数据库或上传目标已存在时不发生覆盖。
5. 搜索 stdout、stderr、清单和测试输出，确认无设备令牌、邀请码或数据库内容。
6. 比较任务前后 `server/auth/`、`server/progression/`、`src/app/game.ts`、战斗、属性、物理和奖励文件，确认无修改。
7. 确认未暂存 `.playwright-cli/`、`test-results/`、截图、翻译目录、`referse/` 或未跟踪 VFX 素材。
8. 记录备份未加密、无自动清理、恢复需停服和同盘备份不能防范整盘故障的限制。

预期：全部门禁通过，阶段 4 达到“身份和进度持久化、备份可验证恢复”的完成条件。

本步骤无独立提交；若仅产生验证结果，则直接交付。

## 5. 计划完成检查

实施结束前逐项确认：

- 是否完全满足已批准规格？
- 是否存在比共享模块加两个窄 CLI 更简单的实现？
- 是否新增了自动调度、压缩、云上传或覆盖恢复等无关能力？
- 是否保持现有 Node ESM、测试脚本和错误文本风格？
- 是否只修改任务列出的文件？
- 是否没有递归删除或自动清理？
- 是否所有成功标准和回归门禁均已验证？
- 是否说明了备份敏感性、同盘风险和停服恢复限制？
- 是否仍有需要用户确认的问题？
