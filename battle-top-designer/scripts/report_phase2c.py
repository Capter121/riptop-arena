"""Evaluate and summarize the Phase 2C provisional technical gate."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from validate_phase2c_waiver import AUDIT_NOTE, DEFAULT_WAIVER, validate as validate_waiver


ROOT = Path(__file__).resolve().parent.parent
VALIDATION = ROOT / "reports" / "validation"
MATRIX_CSV = ROOT / "reports" / "assembly_matrix.csv"
MATRIX_JSON = VALIDATION / "phase2c-combination-matrix.json"
COLLISION_JSON = VALIDATION / "phase2c-collision-summary.json"
DETERMINISM_JSON = VALIDATION / "phase2c-determinism.json"
BASELINE_VERIFY_JSON = VALIDATION / "phase2c-baseline-verification.json"
REPRODUCTION_JSON = VALIDATION / "phase2c-reproduction-nss-p2c-0001.json"
FINAL_JSON = VALIDATION / "phase2c-final-gate.json"
SUMMARY_MD = ROOT / "reports" / "phase2c-validation-summary.md"
REQUIRED_COLUMNS = (
    "combination_id", "core", "blade", "assist", "gear", "tip", "result", "error_code",
    "axis_error_mm", "datum_error_mm", "phase_error_deg", "unexpected_overlap_mm3",
    "total_height_mm", "total_diameter_mm", "triangle_count", "material_count",
    "validation_duration_ms", "audit_note",
)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main() -> int:
    errors = []
    waiver = validate_waiver(DEFAULT_WAIVER)
    if waiver["result"] != "PASS":
        errors.extend(waiver["errors"])
    required = (MATRIX_CSV, MATRIX_JSON, COLLISION_JSON, DETERMINISM_JSON, BASELINE_VERIFY_JSON, REPRODUCTION_JSON)
    for path in required:
        if not path.is_file() or path.stat().st_size == 0:
            errors.append(f"REPORT_MISSING:{path.name}")
    if errors:
        return write_result(errors, {}, [], {})

    matrix = load_json(MATRIX_JSON)
    collision = load_json(COLLISION_JSON)
    determinism = load_json(DETERMINISM_JSON)
    baseline = load_json(BASELINE_VERIFY_JSON)
    reproduction = load_json(REPRODUCTION_JSON)
    with MATRIX_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        if tuple(reader.fieldnames or ()) != REQUIRED_COLUMNS:
            errors.append("MATRIX_CSV_HEADER_INVALID")

    ids = [row.get("combination_id") for row in rows]
    if len(rows) != 288:
        errors.append(f"COMBINATION_COUNT_INVALID:{len(rows)}")
    if len(ids) != len(set(ids)):
        errors.append("DUPLICATE_COMBINATIONS")
    if ids != sorted(ids):
        errors.append("COMBINATION_ORDER_UNSTABLE")
    if any(row.get("audit_note") != AUDIT_NOTE for row in rows):
        errors.append("MATRIX_AUDIT_NOTE_MISSING")
    if matrix.get("combination_count") != 288 or matrix.get("missing_count") != 0 or matrix.get("duplicate_count") != 0:
        errors.append("MATRIX_SCOPE_INVALID")
    if matrix.get("counts", {}).get("FAIL") != 0:
        errors.append("MATRIX_FAILURES_PRESENT")
    if matrix.get("counts", {}).get("CONTACT_REVIEW") != 0:
        errors.append("CONTACT_REVIEW_UNRESOLVED")
    if matrix.get("assembled_glb_exports") != 0:
        errors.append("ASSEMBLED_GLB_BATCH_EXPORTED")
    if collision.get("fail_count") != 0 or collision.get("contact_review_count") != 0:
        errors.append("COLLISION_GATE_FAILED")
    if determinism.get("result") != "PASS":
        errors.append("DETERMINISM_FAILED")
    if baseline.get("result") != "PASS":
        errors.append("BASELINE_REGRESSION")
    if reproduction.get("combination_count") != 1 or reproduction.get("result", {}).get("result") != "PASS":
        errors.append("SINGLE_COMBINATION_REPRODUCTION_FAILED")
    if any(path.name.startswith("nss-p2c-") for path in (ROOT / "public" / "models" / "assemblies").glob("*.glb")):
        errors.append("PHASE2C_ASSEMBLY_GLB_FOUND")
    for document in (matrix, collision, determinism, baseline, reproduction):
        if document.get("audit_note") != AUDIT_NOTE:
            errors.append("SUMMARY_AUDIT_NOTE_MISSING")
    return write_result(errors, matrix, rows, collision)


def write_result(errors: list[str], matrix: dict, rows: list[dict], collision: dict) -> int:
    technical_status = (
        "Phase 2C technical validation PASS under provisional waiver"
        if not errors else
        "Phase 2C technical validation changes requested"
    )
    numeric = lambda key: [float(row[key]) for row in rows] if rows else []
    report = {
        "result": "PASS" if not errors else "FAIL",
        "technical_status": technical_status,
        "visual_review_status": "Phase 2B visual review deferred pending real reviewers",
        "baseline_id": "v0.2.0-rc1-technical-baseline",
        "baseline_status": "PROVISIONAL_NOT_FINAL",
        "errors": errors,
        "combination_count": len(rows),
        "pass_count": sum(row.get("result") == "PASS" for row in rows),
        "contact_review_count": sum(row.get("result") == "CONTACT_REVIEW" for row in rows),
        "fail_count": sum(row.get("result") == "FAIL" for row in rows),
        "metrics": {
            "maximum_axis_error_mm": max(numeric("axis_error_mm"), default=0.0),
            "maximum_datum_error_mm": max(numeric("datum_error_mm"), default=0.0),
            "maximum_phase_error_deg": max(numeric("phase_error_deg"), default=0.0),
            "maximum_overlap_mm3": collision.get("maximum_overlap_mm3", 0.0),
            "minimum_height_mm": min(numeric("total_height_mm"), default=0.0),
            "maximum_height_mm": max(numeric("total_height_mm"), default=0.0),
            "minimum_diameter_mm": min(numeric("total_diameter_mm"), default=0.0),
            "maximum_diameter_mm": max(numeric("total_diameter_mm"), default=0.0),
            "maximum_triangle_count": max((int(row["triangle_count"]) for row in rows), default=0),
            "maximum_material_count": max((int(row["material_count"]) for row in rows), default=0),
            "total_validation_duration_ms": sum(numeric("validation_duration_ms")),
        },
        "normalized_digest": matrix.get("normalized_digest"),
        "human_visual_review_pending": True,
        "production_release_allowed": False,
        "audit_note": AUDIT_NOTE,
    }
    FINAL_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    metrics = report["metrics"]
    error_lines = "\n".join(f"- `{error}`" for error in errors) or "- None"
    markdown = f"""# Phase 2C technical validation summary

Technical status: **{technical_status}**

Visual-review status: **{report['visual_review_status']}**

Baseline: `{report['baseline_id']}` (`{report['baseline_status']}`)

> {AUDIT_NOTE}

## Matrix

- Combinations: {report['combination_count']}
- PASS: {report['pass_count']}
- CONTACT_REVIEW: {report['contact_review_count']}
- FAIL: {report['fail_count']}
- Normalized digest: `{report['normalized_digest']}`
- Assembled Phase 2C GLB exports: 0

## Maximum measurements

- Axis error: {metrics['maximum_axis_error_mm']:.9f} mm
- Datum error: {metrics['maximum_datum_error_mm']:.9f} mm
- Phase error: {metrics['maximum_phase_error_deg']:.9f} degrees
- Unexpected overlap: {metrics['maximum_overlap_mm3']:.6f} mm3
- Triangle count: {metrics['maximum_triangle_count']}
- Material count: {metrics['maximum_material_count']}

## Errors

{error_lines}

## Limitations

This is a provisional digital technical result only. Human visual review remains open. It provides no public-release, manufacturing, material-certification, physical battle-safety, or legal-originality conclusion.
"""
    SUMMARY_MD.write_text(markdown, encoding="utf-8")
    print(f"NSS_PHASE2C_FINAL_GATE={report['result']}")
    print(f"NSS_PHASE2C_TECHNICAL_STATUS={technical_status}")
    print(f"NSS_PHASE2C_FINAL_REPORT={FINAL_JSON}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
