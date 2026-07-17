# Phase 3B Stage 7 证据保全事件

- Incident ID：`STAGE7-TRACE-LOSS-001`
- 状态：`ACCEPTED_WITH_DOCUMENTED_EVIDENCE_LOSS`
- 原始制品可用性：`UNAVAILABLE_AFTER_PLAYWRIGHT_OUTPUT_CLEANUP`
- 接受方：`PROJECT_OWNER`

## 原因

后续 Playwright 运行复用了共享的默认 `test-results` 输出目录。Playwright 启动清理移除了未纳入版本控制的历史失败 `trace.zip`。

## 已丢失证据

原始历史失败 `trace.zip` 字节文件当前不可用。其历史 SHA-256 记录为 `d27fb0bdce9750b9b8f5b4c14f990f33000358942fef3994ddef752d20363e65`，但无法重新进行字节级核验。

## 仍可核验的证据

- 原失败 JSON 及其 SHA-256。
- 原 trace 的历史 SHA-256 记录。
- readout 诊断 Markdown 与 JSON。
- collection-boundary 诊断与抽取的精确事件时间线。
- 修复后的正式测试结果。
- 治理、临时基线和 Phase 2C 证据冻结结果。
- Git 提交历史与工作区审计记录。

## 无法重新证明的内容

- 原 trace 压缩包的字节级完整性。
- 原 trace 内部资源的再次独立读取。

诊断报告不是原 trace 的完整替代副本，也不证明原 trace 已恢复。

## 接受限制

`PROJECT_OWNER` 接受本次有文档记录的历史证据遗失，范围仅限 `STAGE_7_HISTORICAL_TRANSIENT_READOUT_FAILURE_ONLY`。该决定不允许未来丢失正式证据，不提升人工视觉评审状态，不把临时基线升级为最终基线，也不允许声称原 trace 已恢复。
