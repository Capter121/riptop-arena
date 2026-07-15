# Phase 2B-R1 人工盲评录入说明

状态：仅准备人工盲评，不代表 Phase 2B 已批准。

## 评审者与匿名规则

- 使用 `R01` 至 `R05`，不得填写姓名、邮箱、账号或其他身份信息。
- 至少 3 名、最多 5 名评审者。
- 每位已参与的评审者必须完成全部 8 项；不得查看其他评审者的答案后再作答。
- 建议由同一名协调者按相同顺序展示图片，保持相同缩放和观看时间。
- 评审者只接收无标签图片和自己的录入表；不得查看模板 JSON 中的匹配题答案。

## CSV录入

录入文件：`reports/validation/phase2b-r1-blind-review-input.csv`

列定义：

- `reviewer_id`：匿名编号。
- `item_id`：固定评审项，不得修改。
- `selection`：仅用于 `AS01` 至 `AS03`，填写 `A`、`B` 或 `C`。
- `response`：用于 `DC01` 至 `DC04` 和 `UX01`，填写 `PASS`、`LOCAL_REVISION`、`REDESIGN`、`NOT_VISIBLE`、`NEEDS_COMPARISON` 或 `UX_COMPENSATION`。
- `confidence`：可选，填写 `LOW`、`MEDIUM` 或 `HIGH`。
- `notes`：可选，只记录观察，不要填写个人身份。

匹配题的 `PASS` 由脚本依据 `selection` 自动计算，协调者无需填写 `response`。定性题不得由脚本或协调者代替评审者填写。

## 方案A门槛

- 每项通过率必须 `>= 0.67`。
- 3 人时每项需 3 票 PASS；4 人时需 3 票；5 人时需 4 票。
- `LOCAL_REVISION`、`REDESIGN`、`NOT_VISIBLE`、`UX_COMPENSATION` 计为未通过。
- 空值或 `NEEDS_COMPARISON` 计为未完成。
- 人数不足、人数超过 5、存在部分完成记录或数据错误时，结果为 `INSUFFICIENT_REVIEWERS`。
- 人数和完整性合格但任一项目未达门槛时，结果为 `CHANGES_REQUESTED`。
- 所有项目达到门槛时，结果为 `PASS`。

## 生成汇总

```powershell
python scripts/summarize_phase2b_r1_blind_review.py
```

输出：

- `reports/validation/phase2b-r1-blind-review-summary.csv`
- `reports/validation/phase2b-r1-blind-review-summary.json`
- `reports/validation/phase2b-r1-blind-review-summary.md`

即使自动结果为 `PASS`，也必须等待明确确认后，才能批准 Phase 2B 视觉评审、冻结 `v0.2.0-modular-parts-baseline` 或编写 Phase 2C 实施计划。
