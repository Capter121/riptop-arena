"""Validate the pinned provisional exception authorizing Phase 2C."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WAIVER = ROOT / "reports" / "validation" / "phase2b-r1-provisional-review-waiver.csv"
DEFAULT_REPORT = ROOT / "reports" / "validation" / "phase2c-waiver-validation.json"
EXPECTED_SHA256 = "8512e6dda0fb9301e2d3912768dfe5c09d1ca66eceef0617d5a5f77a99ce6a06"
AUDIT_NOTE = (
    "Human visual review remains pending. Technical continuation was authorized by "
    "documented provisional exception, not by fabricated review data."
)
EXPECTED_FIELDS = (
    "exception_id", "project", "requested_by_role", "approval_basis",
    "visual_review_status", "technical_continuation_status", "phase2c_allowed",
    "baseline_status", "production_release_allowed", "manufacturing_claims_allowed",
    "safety_claims_allowed", "scope", "conditions", "expires_on", "notes",
)
EXPECTED_VALUES = {
    "visual_review_status": "DEFERRED_PENDING_REAL_REVIEW",
    "technical_continuation_status": "AUTHORIZED_WITH_CONDITIONS",
    "phase2c_allowed": "true",
    "baseline_status": "PROVISIONAL_NOT_FINAL",
    "production_release_allowed": "false",
    "manufacturing_claims_allowed": "false",
    "safety_claims_allowed": "false",
    "expires_on": "2026-08-14",
}
EXPECTED_SCOPE = "Allow Phase 2C 288-combination in-memory technical validation only"


def validate(path: Path, today: date | None = None, expected_sha256: str | None = EXPECTED_SHA256) -> dict:
    errors: list[str] = []
    record: dict[str, str] = {}
    actual_sha256 = None
    if not path.is_file():
        errors.append("WAIVER_MISSING")
    else:
        raw = path.read_bytes()
        actual_sha256 = hashlib.sha256(raw).hexdigest()
        if expected_sha256 and actual_sha256 != expected_sha256:
            errors.append("WAIVER_SHA256_MISMATCH")
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                if tuple(reader.fieldnames or ()) != EXPECTED_FIELDS:
                    errors.append("WAIVER_HEADER_MISMATCH")
                rows = list(reader)
            if len(rows) != 1:
                errors.append("WAIVER_ROW_COUNT_INVALID")
            elif tuple(reader.fieldnames or ()) == EXPECTED_FIELDS:
                record = {key: (value or "").strip() for key, value in rows[0].items()}
        except (csv.Error, UnicodeError):
            errors.append("WAIVER_MALFORMED")

    if record:
        for key, expected in EXPECTED_VALUES.items():
            if record.get(key) != expected:
                errors.append(f"WAIVER_VALUE_INVALID:{key}")
        if record.get("scope") != EXPECTED_SCOPE:
            errors.append("WAIVER_SCOPE_INVALID")
        try:
            expires_on = date.fromisoformat(record["expires_on"])
            if (today or date.today()) > expires_on:
                errors.append("WAIVER_EXPIRED")
        except (KeyError, ValueError):
            errors.append("WAIVER_EXPIRATION_INVALID")

    return {
        "result": "PASS" if not errors else "FAIL",
        "errors": errors,
        "waiver_path": path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path),
        "waiver_sha256": actual_sha256,
        "expected_sha256": expected_sha256,
        "expires_on": record.get("expires_on"),
        "visual_review_status": "Phase 2B visual review deferred pending real reviewers",
        "technical_continuation_status": record.get("technical_continuation_status"),
        "phase2c_allowed": record.get("phase2c_allowed") == "true",
        "baseline_status": record.get("baseline_status"),
        "production_release_allowed": record.get("production_release_allowed") == "true",
        "audit_note": AUDIT_NOTE,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--waiver", type=Path, default=DEFAULT_WAIVER)
    parser.add_argument("--output", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = validate(args.waiver.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"NSS_PHASE2C_WAIVER={report['result']}")
    print(f"NSS_PHASE2C_WAIVER_SHA256={report['waiver_sha256']}")
    print(f"NSS_PHASE2C_WAIVER_REPORT={args.output}")
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
