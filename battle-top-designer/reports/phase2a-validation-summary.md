# Nova Spin System Phase 2A 验证汇总

状态：Phase 2A awaiting visual review

## 自动质量门

- Phase 2A 规格、8 个唯一碰撞代理、8 个零件几何与 GLB 重导入均通过。
- 四套 Blade 测试夹具均为 PASS；意外碰撞为 0，未解决 CONTACT_REVIEW 为 0。
- 8 个零件 GLB 与 4 个夹具 GLB 的 Khronos glTF Validator 均为 0 error、0 warning。
- Playwright 四款模型全部通过；console error、pageerror 和 failed request 均为 0。
- Storm Attack 六个基线 GLB 的 raw SHA-256 与 semantic fingerprint 均保持不变。
- NSS-V1 相对批准基线无修改。

## Blade 统计

| Blade | 尺寸 X×Y×Z（mm） | 三角面 | 材质 | GLB bytes |
|---|---:|---:|---:|---:|
| Storm Fang | 64.732 × 66.861 × 5.899 | 1,056 | 3 | 52,436 |
| Iron Bastion | 70.000 × 70.000 × 5.400 | 2,016 | 3 | 84,580 |
| Orbit Halo | 70.624 × 70.624 × 4.400 | 2,112 | 3 | 100,304 |
| Dual Comet | 64.303 × 68.819 × 5.489 | 1,632 | 3 | 73,228 |

## 夹具碰撞结果

| 夹具 | 结果 | 意外碰撞 | 待复核接触 | 直径（mm） | 高度（mm） |
|---|---|---:|---:|---:|---:|
| assembly_phase2a_storm_fang | PASS | 0 | 0 | 66.861 | 23.940 |
| assembly_phase2a_iron_bastion | PASS | 0 | 0 | 70.000 | 23.940 |
| assembly_phase2a_orbit_halo | PASS | 0 | 0 | 70.624 | 23.640 |
| assembly_phase2a_dual_comet | PASS | 0 | 0 | 68.819 | 24.040 |

## 已执行的主要命令

```powershell
& .\scripts\build_all.ps1 -Scope Phase2A
& .\scripts\test_all.ps1 -Scope Phase2A
& .\scripts\build_all.ps1 -Scope StormAttackRegression
& .\scripts\test_all.ps1 -Scope StormAttackRegression
npm --prefix preview test
```

## 人工评审重点

- Iron Bastion 与 Dual Comet 的剪影 IoU 为 0.830，Storm Fang 与 Iron Bastion 为 0.803，Storm Fang 与 Dual Comet 为 0.795；这些数值只用于提示人工查看，不构成法律意义上的原创性结论。
- 需要人工确认四款在实际观看距离下是否仍有足够的轮廓辨识度，以及接触面意图和材质层级是否清晰。
- 当前结果是概念模型与软件验证证据，不包含实体高速战斗、量产工艺或安全认证结论。

下一步仅为人工视觉评审；未获确认前不进入 Phase 2B。
