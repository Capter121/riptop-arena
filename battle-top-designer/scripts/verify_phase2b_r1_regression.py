"""Verify that Phase 2B-R1 drift is confined to explicitly authorized parts."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BLENDER = Path(r"D:\Program Files\Blender Foundation\Blender 4.5\blender.exe")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fingerprint(part_id: str) -> str:
    output = ROOT / "build" / "fingerprint-work" / f"phase2b-r1-current-{part_id}.json"
    subprocess.run([
        str(BLENDER), "--background", "--python", str(ROOT / "blender" / "fingerprint_glb.py"), "--",
        "--input", str(ROOT / "public" / "models" / "parts" / f"{part_id}.glb"),
        "--output", str(output),
    ], cwd=ROOT, check=True)
    return json.loads(output.read_text(encoding="utf-8"))["semantic_fingerprint"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allowed", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    allowed = set(args.allowed)
    baseline = json.loads((ROOT / "reports" / "validation" / "phase2b-r1-baseline.json").read_text(encoding="utf-8"))
    vertical = json.loads((ROOT / "docs" / "baselines" / "v0.1.0-vertical-slice.json").read_text(encoding="utf-8-sig"))
    records = []
    errors = []
    for part_id, expected in baseline["parts"].items():
        spec = ROOT / "specs" / "parts" / f"{part_id}.json"
        glb = ROOT / "public" / "models" / "parts" / f"{part_id}.glb"
        current_raw = sha256(glb)
        current_spec = sha256(spec)
        is_allowed = part_id in allowed
        raw_changed = current_raw != expected["raw_sha256"]
        spec_changed = current_spec != expected["spec_sha256"]
        if not is_allowed and (raw_changed or spec_changed):
            errors.append(f"UNAUTHORIZED_DRIFT:{part_id}")
        current_semantic = fingerprint(part_id) if is_allowed else expected["semantic_fingerprint"]
        records.append({
            "part_id": part_id,
            "authorized": is_allowed,
            "raw_sha256_before": expected["raw_sha256"],
            "raw_sha256_after": current_raw,
            "raw_changed": raw_changed,
            "semantic_fingerprint_before": expected["semantic_fingerprint"],
            "semantic_fingerprint_after": current_semantic,
            "semantic_changed": current_semantic != expected["semantic_fingerprint"],
            "spec_sha256_before": expected["spec_sha256"],
            "spec_sha256_after": current_spec,
            "spec_changed": spec_changed,
        })
    interface_path = ROOT / "specs" / "interfaces.json"
    interface_key = "specs/interfaces.json"
    interface_expected = vertical["raw_sha256"][interface_key]
    interface_actual = sha256(interface_path)
    if interface_actual != interface_expected:
        errors.append("NSS_V1_INTERFACE_DRIFT")
    result = {
        "result": "PASS" if not errors else "FAIL",
        "allowed_parts": sorted(allowed),
        "unchanged_part_count": sum(1 for record in records if not record["authorized"]),
        "interface_id": "NSS-V1",
        "interface_sha256_expected": interface_expected,
        "interface_sha256_actual": interface_actual,
        "errors": errors,
        "parts": records,
        "constraints": {"cartesian_product_executed": False, "full_288_matrix_executed": False},
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"NSS_PHASE2B_R1_REGRESSION={result['result']}")
    print(f"NSS_PHASE2B_R1_REGRESSION_REPORT={output}")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
