"""Initialize and summarize anonymous Phase 2B-R1 blind-review records."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "reports" / "validation" / "phase2b-r1-blind-review-template.json"
DEFAULT_INPUT = ROOT / "reports" / "validation" / "phase2b-r1-blind-review-input.csv"
DEFAULT_OUTPUT_DIR = ROOT / "reports" / "validation"
CSV_FIELDS = ("reviewer_id", "item_id", "selection", "response", "confidence", "notes")
AUDIT_NOTE = (
    "Human visual review remains pending. Technical continuation was authorized by "
    "documented provisional exception, not by fabricated review data."
)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def template_rows(config: dict) -> list[dict[str, str]]:
    return [
        {field: (reviewer_id if field == "reviewer_id" else item["item_id"] if field == "item_id" else "") for field in CSV_FIELDS}
        for reviewer_id in config["reviewer_slots"]
        for item in config["items"]
    ]


def write_csv(path: Path, rows: list[dict], fields: tuple[str, ...] | list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def initialize(config: dict, input_path: Path, force: bool) -> None:
    if input_path.exists() and not force:
        raise FileExistsError(f"Review input already exists; refusing to overwrite: {input_path}")
    write_csv(input_path, template_rows(config), CSV_FIELDS)
    print(f"NSS_PHASE2B_R1_BLIND_REVIEW_INPUT={input_path}")


def read_rows(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != CSV_FIELDS:
            return [], [f"CSV_HEADER_MISMATCH:{reader.fieldnames}"]
        return [
            {field: (value or "").strip() for field, value in row.items()}
            for row in reader
        ], []


def summarize_rows(rows: list[dict[str, str]], config: dict) -> dict:
    items = {item["item_id"]: item for item in config["items"]}
    slots = set(config["reviewer_slots"])
    allowed_responses = set(config["response_statuses"])
    allowed_confidence = set(config["confidence_values"])
    incomplete = set(config["gate"]["incomplete_statuses"])
    threshold = config["gate"]["item_pass_rate_minimum"]
    records: dict[str, dict[str, dict]] = defaultdict(dict)
    validation_errors = []

    for row_number, row in enumerate(rows, start=2):
        reviewer_id = row.get("reviewer_id", "")
        item_id = row.get("item_id", "")
        if reviewer_id not in slots or not re.fullmatch(r"R0[1-5]", reviewer_id):
            validation_errors.append(f"ROW_{row_number}:INVALID_ANONYMOUS_REVIEWER_ID:{reviewer_id}")
            continue
        if item_id not in items:
            validation_errors.append(f"ROW_{row_number}:UNKNOWN_ITEM_ID:{item_id}")
            continue
        if item_id in records[reviewer_id]:
            validation_errors.append(f"ROW_{row_number}:DUPLICATE_REVIEW:{reviewer_id}:{item_id}")
            continue
        if row.get("confidence", "") not in allowed_confidence:
            validation_errors.append(f"ROW_{row_number}:INVALID_CONFIDENCE:{row.get('confidence', '')}")
        item = items[item_id]
        selection = row.get("selection", "").upper()
        response = row.get("response", "").upper()
        normalized = ""
        if item["mode"] == "matching":
            if response:
                validation_errors.append(f"ROW_{row_number}:MATCHING_RESPONSE_MUST_BE_EMPTY:{item_id}")
            if selection:
                if selection not in {"A", "B", "C"}:
                    validation_errors.append(f"ROW_{row_number}:INVALID_SELECTION:{selection}")
                else:
                    normalized = "PASS" if selection == item["expected_selection"] else "LOCAL_REVISION"
        else:
            if selection:
                validation_errors.append(f"ROW_{row_number}:QUALITATIVE_SELECTION_MUST_BE_EMPTY:{item_id}")
            if response and response not in allowed_responses:
                validation_errors.append(f"ROW_{row_number}:INVALID_RESPONSE:{response}")
            elif response:
                normalized = response
        records[reviewer_id][item_id] = {
            "selection": selection,
            "response": response,
            "normalized_result": normalized,
            "confidence": row.get("confidence", "").upper(),
            "notes": row.get("notes", ""),
        }

    reviewer_summaries = []
    submitted_ids = []
    complete_ids = []
    partial_ids = []
    for reviewer_id in config["reviewer_slots"]:
        reviewer_records = records.get(reviewer_id, {})
        submitted = any(
            record["selection"] or record["response"] or record["confidence"] or record["notes"]
            for record in reviewer_records.values()
        )
        answered = sum(
            1 for item_id in items
            if item_id in reviewer_records and reviewer_records[item_id]["normalized_result"] not in incomplete
        )
        complete = submitted and answered == len(items)
        if submitted:
            submitted_ids.append(reviewer_id)
            (complete_ids if complete else partial_ids).append(reviewer_id)
        reviewer_summaries.append({
            "reviewer_id": reviewer_id,
            "submitted": submitted,
            "answered_item_count": answered,
            "required_item_count": len(items),
            "complete": complete,
        })

    item_summaries = []
    for item_id, item in items.items():
        normalized = [records[reviewer_id][item_id]["normalized_result"] for reviewer_id in complete_ids]
        pass_count = sum(result == "PASS" for result in normalized)
        reviewer_count = len(complete_ids)
        pass_rate = pass_count / reviewer_count if reviewer_count else 0.0
        if not reviewer_count:
            item_result = "INSUFFICIENT_REVIEWERS"
        else:
            item_result = "PASS" if pass_rate >= threshold else "CHANGES_REQUESTED"
        item_summaries.append({
            "item_id": item_id,
            "category": item["category"],
            "prompt": item["prompt"],
            "pass_count": pass_count,
            "non_pass_count": reviewer_count - pass_count,
            "eligible_reviewer_count": reviewer_count,
            "pass_rate": round(pass_rate, 6),
            "threshold": threshold,
            "result": item_result,
        })

    minimum = config["reviewer_count"]["minimum"]
    maximum = config["reviewer_count"]["maximum"]
    insufficient = (
        bool(validation_errors)
        or bool(partial_ids)
        or len(complete_ids) < minimum
        or len(complete_ids) > maximum
    )
    if insufficient:
        final_result = "INSUFFICIENT_REVIEWERS"
    elif all(item["result"] == "PASS" for item in item_summaries):
        final_result = "PASS"
    else:
        final_result = "CHANGES_REQUESTED"

    return {
        "schema_version": "1.0",
        "phase": config["phase"],
        "source_commit": config["source_commit"],
        "result": final_result,
        "thresholds": {
            "minimum_reviewers": minimum,
            "maximum_reviewers": maximum,
            "item_pass_rate_minimum": threshold,
        },
        "reviewer_counts": {
            "submitted": len(submitted_ids),
            "complete": len(complete_ids),
            "partial": len(partial_ids),
        },
        "complete_reviewer_ids": complete_ids,
        "partial_reviewer_ids": partial_ids,
        "reviewers": reviewer_summaries,
        "anonymous_records": {
            reviewer_id: records[reviewer_id]
            for reviewer_id in submitted_ids
        },
        "items": item_summaries,
        "validation_errors": validation_errors,
        "human_decisions_recorded": len(complete_ids) > 0,
        "audit_note": AUDIT_NOTE,
        "next_actions_require_explicit_confirmation": config["next_actions_require_explicit_confirmation"],
        "constraints": {
            "models_modified": False,
            "specs_modified": False,
            "generator_modified": False,
            "nss_v1_modified": False,
            "full_288_matrix_executed": False
        }
    }


def write_outputs(summary: dict, output_dir: Path) -> None:
    json_path = output_dir / "phase2b-r1-blind-review-summary.json"
    csv_path = output_dir / "phase2b-r1-blind-review-summary.csv"
    markdown_path = output_dir / "phase2b-r1-blind-review-summary.md"
    json_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    csv_rows = [{
        "item_id": item["item_id"],
        "category": item["category"],
        "pass_count": item["pass_count"],
        "non_pass_count": item["non_pass_count"],
        "eligible_reviewer_count": item["eligible_reviewer_count"],
        "pass_rate": f"{item['pass_rate']:.2%}",
        "threshold": f"{item['threshold']:.2%}",
        "result": item["result"],
        "audit_note": summary["audit_note"],
    } for item in summary["items"]]
    write_csv(csv_path, csv_rows, tuple(csv_rows[0].keys()))
    item_rows = "\n".join(
        f"| {item['item_id']} | {item['pass_count']} | {item['non_pass_count']} | {item['eligible_reviewer_count']} | {item['pass_rate']:.2%} | {item['result']} |"
        for item in summary["items"]
    )
    reviewer_rows = "\n".join(
        f"| {reviewer['reviewer_id']} | {'YES' if reviewer['submitted'] else 'NO'} | {reviewer['answered_item_count']}/{reviewer['required_item_count']} | {'YES' if reviewer['complete'] else 'NO'} |"
        for reviewer in summary["reviewers"]
    )
    errors = "\n".join(f"- `{error}`" for error in summary["validation_errors"]) or "- 无"
    markdown = f"""# Phase 2B-R1 人工盲评汇总

最终自动判定：`{summary['result']}`

本文件只汇总人工录入，不替代审美判断，也不会自动批准 Phase 2B、冻结基线或进入 Phase 2C。

> {summary['audit_note']}

## 评审者完整性

| 匿名编号 | 已提交 | 完成项目 | 完整 |
|---|---|---:|---|
{reviewer_rows}

完整评审者：{summary['reviewer_counts']['complete']}；部分完成：{summary['reviewer_counts']['partial']}；要求：3 至 5 名。

## 项目通过率

| 项目 | PASS | 未通过 | 有效评审者 | 通过率 | 判定 |
|---|---:|---:|---:|---:|---|
{item_rows}

方案 A 门槛：每项通过率 `>= 67.00%`。

## 数据错误

{errors}

## 后续限制

必须等待明确确认后，才能批准 Phase 2B 视觉评审、冻结 `v0.2.0-modular-parts-baseline` 或编写 Phase 2C 实施计划。
"""
    markdown_path.write_text(markdown, encoding="utf-8")
    print(f"NSS_PHASE2B_R1_BLIND_REVIEW_RESULT={summary['result']}")
    print(f"NSS_PHASE2B_R1_BLIND_REVIEW_JSON={json_path}")
    print(f"NSS_PHASE2B_R1_BLIND_REVIEW_CSV={csv_path}")
    print(f"NSS_PHASE2B_R1_BLIND_REVIEW_MARKDOWN={markdown_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--init", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = load_json(args.config)
    if args.init:
        initialize(config, args.input, args.force)
        return
    rows, header_errors = read_rows(args.input)
    summary = summarize_rows(rows, config)
    summary["validation_errors"] = header_errors + summary["validation_errors"]
    if header_errors:
        summary["result"] = "INSUFFICIENT_REVIEWERS"
    write_outputs(summary, args.output_dir)


if __name__ == "__main__":
    main()
