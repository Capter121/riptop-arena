# Phase 3B focus presentation exit trigger

状态：Phase 3B changes requested

## 唯一业务事件

`active → exiting` 的唯一业务事件是当前 readout 的 CSS 展示动画 `focus-presentation-cycle` 完成后，由 `FocusReadout` 发出的 `presentation-complete(sessionId)`。该动画只在当前 session 同时满足 `phase=active` 与 `activeFramePainted=true` 时挂载，持续 1200 ms。`animationend` 必须来自 readout 自身且动画名必须精确匹配；其他动画、子元素动画和旧 session 回调均无效。

## Pulse 与 presentation complete 的分离

- 800 ms pulse 由 `scheduleFocusPulseEnd` 结束，只派发 `pulse-ended(sessionId)`。
- `pulse-ended` 只把 `pulseActive` 从 `true` 改为 `false`，不改变 `phase`。
- pulse 结束不会调用 `completeFocusPresentation`、`completeFocusExit` 或任何等价退出入口。
- 1200 ms presentation 动画独立于 pulse，因此最后约 400 ms 为 pulse 已结束但 readout 仍稳定挂载的展示时间。

## 发出 presentation complete 前的条件

1. session 仍是当前 session；
2. `phase=active`；
3. `modelReady=true`；
4. readout 已完成 React commit，`readoutCommitted=true`；
5. Scene 中目标零件已到达聚焦偏移；
6. 相机已到达该零件的聚焦预设；
7. readout 与聚焦场景至少完成一个真实渲染帧，`activeFramePainted=true`；
8. `focus-presentation-cycle` 动画在当前 readout 上真实完成。

状态机再次校验上述前置条件。任何 sessionId 不匹配、前置条件缺失或已经请求完成的事件都返回原状态对象，不产生副作用。

## exiting → idle

进入 `exiting` 后，Scene 把聚焦偏移恢复为零。`FocusExitFrameGate` 必须连续观察到两帧实际恢复位置后，才派发当前 session 的 `exit-complete` 并进入 `idle`。因此 exiting 后至少绘制一帧真实恢复画面，不会在请求恢复的同一逻辑时刻卸载 readout。

## Readout 生命周期

- `entering`：挂载；
- `active`：持续挂载，包括 pulse 已结束的时段；
- `exiting`：持续挂载，直到恢复帧门通过；
- `idle`：仅当前 session 完成退出后卸载。

新聚焦会创建递增 sessionId 和新不可变状态对象。所有 pulse、presentation 和 exit 事件均携带 sessionId；旧 session 的事件不能修改新 session。

## Reduced motion 与低性能模式

两种模式使用相同的 `presentation-complete` 事件与 1200 ms readout 展示动画。它们只改变 Scene 位置插值方式，不跳过 readout commit、真实绘制帧、presentation complete 或恢复帧门。

## 自动验证证据

- focus 单元与 React/Zustand 组件测试：40/40 PASS；
- TypeScript：PASS；
- production build：PASS；
- 移动端完整流程单次验证：1/1 PASS；
- 顺序执行器 PASS/FAIL/ABORTED/不可覆盖夹具：4/4 PASS；
- 执行器真实 dry-run：`reports/validation/focus-batches/runner-smoke-b-20260716/summary.json`，PASS 1/1；
- 执行器启动故障审计：`reports/validation/focus-batches/runner-smoke-a-20260716/summary.json`，ABORTED，不计入通过证据。

旧移动短批固定为 `ABORTED_INFRASTRUCTURE`。它不是 PASS，也不是产品 FAIL，且不会继续、补写或计入后续通过数量。
