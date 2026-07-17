# Phase 3B Playwright Artifact 隔离 Smoke

状态：`PASS`

## 运行

- Run A：`stage7-smoke-20260717T050500Z-a-72eca1e`，1/1 PASS。
- Run B：`stage7-smoke-20260717T050500Z-b-72eca1e`，1/1 PASS。
- 两次运行使用不同目录，JSON reporter、HTML报告和 `test-results` 均位于各自 run 目录。

## 隔离结论

- Run B 启动及完成后，Run A 仍存在。
- Run A 的 `manifest.json`、HTML报告、JSON reporter 和 `.last-run.json` 四项 SHA-256 全部不变。
- Run B 生成独立证据。
- 共享默认 `test-results` 的最后修改时间未被两次 smoke 改变，正式证据不再由该目录承载。
- Artifact 隔离单元测试：9/9 PASS。

两次 smoke 仅执行不加载产品运行时的最小 fixture；未重跑产品长门。
