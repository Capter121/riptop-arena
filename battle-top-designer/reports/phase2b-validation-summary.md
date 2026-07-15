# Nova Spin System Phase 2B 验证汇总

状态：Phase 2B awaiting visual review

## 自动质量门

- 8 个新零件、12 套 Phase 2B 装配、16 个唯一碰撞代理均通过验证。
- FAIL、未解决 CONTACT_REVIEW、未确认 BINARY_DRIFT、SEMANTIC_REGRESSION 均为 0。
- Khronos glTF Validator error/warning 均为 0；Playwright 16/16 通过，外部请求为 0。
- Phase 2A 批准基线 13 个 GLB 与 Storm Attack 独立回归均为 PASS。

## 八个新零件统计

| 零件 | 规格包络 直径×高 (mm) | 三角面 | 材质 | GLB bytes |
|---|---:|---:|---:|---:|
| core_void_falcon | 35.00 × 3.60 | 1648 | 2 | 76528 |
| assist_guard | 61.00 × 3.20 | 1632 | 2 | 65236 |
| assist_air | 59.00 × 3.00 | 2160 | 2 | 105784 |
| gear_medium | 34.00 × 5.00 | 2208 | 2 | 96316 |
| gear_high | 34.40 × 6.00 | 2784 | 2 | 113760 |
| tip_ball_defense | 16.00 × 8.20 | 1248 | 2 | 62220 |
| tip_needle_stamina | 16.00 × 9.00 | 1376 | 2 | 69332 |
| tip_taper_balance | 16.00 × 8.50 | 1376 | 2 | 69124 |

## 十二套装配验证

| 装配 | 结果 | 碰撞 | CONTACT_REVIEW | 直径 (mm) | 高度 (mm) | 三角面 |
|---|---|---:|---:|---:|---:|---:|
| assembly_phase2b_core_void_falcon | PASS | 0 | 0 | 66.861 | 23.940 | 5680 |
| assembly_phase2b_assist_guard | PASS | 0 | 0 | 66.861 | 23.740 | 5568 |
| assembly_phase2b_assist_air | PASS | 0 | 0 | 66.861 | 23.540 | 6096 |
| assembly_phase2b_gear_medium | PASS | 0 | 0 | 66.861 | 24.940 | 6240 |
| assembly_phase2b_gear_high | PASS | 0 | 0 | 66.861 | 25.940 | 6816 |
| assembly_phase2b_tip_ball_defense | PASS | 0 | 0 | 66.861 | 25.100 | 5280 |
| assembly_phase2b_tip_needle_stamina | PASS | 0 | 0 | 66.861 | 25.900 | 5408 |
| assembly_phase2b_tip_taper_balance | PASS | 0 | 0 | 66.861 | 25.400 | 5408 |
| assembly_phase2b_attack_representative | PASS | 0 | 0 | 66.861 | 23.540 | 6784 |
| assembly_phase2b_defense_representative | PASS | 0 | 0 | 70.000 | 25.900 | 8064 |
| assembly_phase2b_stamina_representative | PASS | 0 | 0 | 70.624 | 27.200 | 9392 |
| assembly_phase2b_balance_representative | PASS | 0 | 0 | 68.819 | 26.500 | 7920 |

## 已执行命令

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_all.ps1 -Scope Phase2B
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2B
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope StormAttackRegression
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2BReport
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope Phase2BFinalAudit
```

## 人工评审与限制

- 仍需人工判断同族轮廓、材质层级和四套代表性组合的整体视觉质量。
- 剪影重叠率仅为内部启发式，不构成法律意义上的原创性证明。
- 当前为概念模型和软件验证证据，不代表可制造、实体高速战斗安全或安全认证通过。
