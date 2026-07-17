# Stage 7 Playwright 报告覆盖事件

- 事件 ID：`STAGE7-PLAYWRIGHT-REPORT-OVERWRITE-001`
- 状态：`RESOLVED_WITH_GIT_OBJECT_RECOVERY`
- 影响范围：仅报告制品
- 批准方：`PROJECT_OWNER`

一次 `playwright --list` collection 命令复用了正式 JSON reporter 路径，将正式 8/8 工作树文件覆盖为 8 条 skipped collection 记录。覆盖后 SHA-256 为 `067d7d4560eb57c4ec7709b266dbf35a1c7500a2c1212f01c42550609a0e1793`，仅登记为 `OVERWRITTEN_COLLECTION_OUTPUT`，不得作为正式结果锚点。

产品执行结果没有改变。原正式报告仍存在于 Git blob `9371800c1ff08a9117d8b2b4d1d97e42d1c56ba2`，已按原字节恢复，SHA-256 为 `16b74303ffc08a9bc8f9d1c1a0bcc4734d49c154d63e26e7d2771b6a0734c8cc`。

修复后，collection 使用 gate `PLAYWRIGHT_COLLECTION`、证据类型 `COLLECTION_ONLY` 和唯一 run-id；reporter 写入该 run 的 `collection-report.json`。已存在的 run-id 会被拒绝，collection 不再写入任何正式或历史证据路径。
