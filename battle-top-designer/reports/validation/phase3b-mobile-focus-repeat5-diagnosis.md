# Phase 3B mobile focus repeat5 diagnosis

状态：`ROOT_CAUSE_CONFIRMED`

Human visual review remains pending.
Development continued under a documented provisional internal-prototype decision.

## 结论

`assist-focus-readout` 并非从未挂载。trace 明确记录：

- `364097.784`：readout 已挂载，`data-focus-phase=active`；
- `364471.971`：Zustand 快照为 `focus=assist`、`focusPhase=active`、`focusSession=4`；
- `364863.172`：readout 仍挂载，但已为 `data-focus-phase=exiting`；
- `370050.499`：失败后的 DOM 快照中 readout 已卸载。

直接原因是测试读取 session 4 的 active 快照后，同一 session 已继续走完 `active → exiting → idle`。Playwright 真正完成可见性检查时，App 按 idle 规则正确卸载了 readout。最终错误上下文不能证明 readout 在整个点击后区间都不存在。

## 状态来源核验

| 检查项 | 结论 |
|---|---|
| App 和 Scene 是否订阅同一状态 | 是，均来自同一个 Zustand store |
| 是否使用同一个 session | 是，失败区间为 session 4 |
| readout 是否有独立 boolean | 否；谓词是 target 与 phase |
| 是否存在 App 本地 showReadout | 否 |
| `focusHighlight` 是否决定 readout | 否；它只控制 Assist 高亮与 Blade 淡化 |
| 是否发现旧 session 清除新 session | 否；action 有 session ID 校验 |
| 是否发现 StrictMode 重入 | 否；入口未使用 `StrictMode` |
| Suspense 是否保存第二套 focus 状态 | 否 |
| selector 是否返回不稳定对象 | 否，Scene 使用原子字段 selector；App 订阅整个 store |
| 是否捕获 `focus=assist, phase=idle` | 否 |

## 时间线

以实际执行 click action 的 `363410.500` 为相对零点：

1. `T+0 ms`：Playwright 执行 Assist Guard 点击。
2. `T+0～386.475 ms`：React click handler 调用 `selectPart`；trace 没有应用级 mark，无法给出更窄时间。
3. `T+0～687.284 ms`：store 原子创建 session 4。
4. 同一区间：phase 进入 `entering`，但 trace 未捕获该中间 DOM。
5. 同一区间：target 更新为 `assist`。
6. 最晚 `T+687.284 ms`：App 已收到更新。
7. `T+687.284 ms`：App DOM 已渲染 active readout。
8. `T+687.284 ms`：readout 谓词为 true。
9. readout 最晚在 `T+687.284 ms` 挂载；在 `T+1452.672 ms` 仍处于 exiting；随后于失败结束前卸载。
10. Scene 最晚在 active DOM 提交前后收到同一 focus；trace 不记录精确 R3F commit。
11. `T+1061.471 ms`：快照的目标偏移为 0.021。该值由 store 推导，不是实际 Group Y 测量。
12. 最晚 `T+1061.471 ms`：相机为统一 45°聚焦视角。
13. 最晚 `T+687.284 ms`：模型 ready，因 phase 已变 active。
14. `T+687.284 ms`：已观察到 active。
15. `T+1452.672 ms`：已观察到 exiting。
16. 未观察到旧 session callback；所有 store 回调均要求 session ID 匹配。
17. idle 发生在 `T+1452.672～6639.999 ms`；缺少应用级 mark，尚不能进一步收窄。

## 已确认根因

Scene 当前在每个 `useFrame` 中执行：

```text
position += (target - position) * min(1, delta * 7)
```

移动端长帧会令 `min(1, delta * 7) = 1`，使 exiting 的位置直接吸附到零。随后同一帧满足阈值并调用 `completeFocusExit`，在恢复位置真正完成一个可观察渲染帧前就进入 idle。

预修复专用运行已记录：

- session 5：`delta=217.8 ms`，插值因子为 1，Tip 从 `-0.027` 同帧跳到 0；
- session 7：`delta=163.4 ms`，插值因子为 1，Tip 从 `-0.027` 同帧跳到 0；
- 两次 `scene-complete-exit` 与 store idle transition 都发生在相同时间戳；
- App 随后约 4～5 ms 提交 idle 并卸载 readout。

修复必须保证恢复位置先完成一个实际渲染帧，再允许当前 session 进入 idle；不会延长 800 ms 高亮、放宽测试或修改模型。
