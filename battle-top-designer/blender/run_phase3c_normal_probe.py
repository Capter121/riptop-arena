"""Run isolated normal-buffer probes without modifying authoritative GLBs."""

from __future__ import annotations

import json
from pathlib import Path

from postprocess_glb_normals import rewrite_file


ROOT = Path(__file__).resolve().parent.parent
PARTS = ("core_void_falcon", "blade_storm_fang", "gear_high", "tip_taper_balance")
OUTPUT = ROOT / "reports" / "validation" / "phase3c-stage4b-normal-probe.json"


def main() -> None:
    records = []
    for part_id in PARTS:
        source = ROOT / "public" / "models" / "parts" / f"{part_id}.glb"
        target = ROOT / "build" / f"phase3c-stage4b-{part_id}-normal-probe.glb"
        records.append({"asset": part_id, **rewrite_file(source, target)})
    passed = all(
        record["file_length_identical"] and record["json_chunk_byte_identical"]
        and record["position_accessors_identical"] and record["index_accessors_identical"]
        and record["deterministic"] and record["all_changed_bytes_subset_of_normal_ranges"]
        for record in records
    )
    OUTPUT.write_text(json.dumps({"result": "PASS" if passed else "FAIL", "crease_angle_degrees": 30.0, "records": records}, indent=2) + "\n", encoding="utf-8")
    print(f"PHASE3C_STAGE4B_NORMAL_PROBE={'PASS' if passed else 'FAIL'}")
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
