"""Apply the verified in-place normal-buffer repair to all 16 authoritative GLBs."""

from __future__ import annotations

import json
from pathlib import Path

from postprocess_glb_normals import immutable_fingerprints, normal_quality, parse_glb, rewrite_bytes, sha256


ROOT = Path(__file__).resolve().parent.parent
PART_DIR = ROOT / "specs" / "parts"
GLB_DIR = ROOT / "public" / "models" / "parts"
OUTPUT = ROOT / "reports" / "validation" / "phase3c-stage4b-normal-buffer-repair.json"


def main() -> None:
    pending = []
    for spec_path in sorted(PART_DIR.glob("*.json")):
        part_id = json.loads(spec_path.read_text(encoding="utf-8"))["id"]
        path = GLB_DIR / f"{part_id}.glb"
        source = path.read_bytes()
        repaired, detail = rewrite_bytes(source, 30.0)
        source_gltf, source_bin, source_json, _source_bin = parse_glb(source)
        output_gltf, output_bin, output_json, _output_bin = parse_glb(repaired)
        repeated, _repeated_detail = rewrite_bytes(source, 30.0)
        pending.append((path, repaired, {
            "asset": part_id,
            "input_sha256": sha256(source),
            "output_sha256": sha256(repaired),
            "file_length_identical": len(source) == len(repaired),
            "json_chunk_byte_identical": source[source_json[0]:source_json[1]] == repaired[output_json[0]:output_json[1]],
            "position_accessors_identical": immutable_fingerprints(source_gltf, source_bin) == immutable_fingerprints(output_gltf, output_bin),
            "index_accessors_identical": immutable_fingerprints(source_gltf, source_bin) == immutable_fingerprints(output_gltf, output_bin),
            "deterministic": repaired == repeated,
            "determinism_sha256": sha256(repeated),
            "normal_quality": normal_quality(output_gltf, output_bin),
            **detail,
        }))
    for path, repaired, _record in pending:
        path.write_bytes(repaired)
    records = [record for _path, _repaired, record in pending]
    passed = all(
        record["file_length_identical"] and record["json_chunk_byte_identical"]
        and record["position_accessors_identical"] and record["index_accessors_identical"]
        and record["deterministic"] and record["all_changed_bytes_subset_of_normal_ranges"]
        for record in records
    )
    OUTPUT.write_text(json.dumps({"result": "PASS" if passed else "FAIL", "crease_angle_degrees": 30.0, "assets": records}, indent=2) + "\n", encoding="utf-8")
    print(f"PHASE3C_STAGE4B_NORMAL_BUFFER_REPAIR={'PASS' if passed else 'FAIL'} assets={len(records)}")
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
