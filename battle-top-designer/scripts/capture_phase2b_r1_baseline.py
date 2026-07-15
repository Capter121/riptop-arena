"""Capture the immutable pre-revision evidence for Phase 2B-R1."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BLENDER = Path(r"D:\Program Files\Blender Foundation\Blender 4.5\blender.exe")
PARTS = (
    "core_solar_wolf", "core_void_falcon",
    "blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet",
    "assist_heavy", "assist_guard", "assist_air",
    "gear_low", "gear_medium", "gear_high",
    "tip_flat_attack", "tip_ball_defense", "tip_needle_stamina", "tip_taper_balance",
)
TARGETS = ("blade_dual_comet", "assist_heavy", "assist_guard")
SOURCE_MODEL_COMMIT = "9ba51508ebbfb3e878a678ac73369c33a6148505"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(path: Path) -> Path:
    if not path.is_file() or path.stat().st_size == 0:
        raise FileNotFoundError(path)
    return path


def semantic_fingerprint(part_id: str) -> str:
    input_path = require(ROOT / "public" / "models" / "parts" / f"{part_id}.glb")
    work = ROOT / "build" / "fingerprint-work" / f"phase2b-r1-before-{part_id}.json"
    command = [
        str(BLENDER), "--background", "--python", str(ROOT / "blender" / "fingerprint_glb.py"), "--",
        "--input", str(input_path), "--output", str(work),
    ]
    subprocess.run(command, cwd=ROOT, check=True)
    return json.loads(require(work).read_text(encoding="utf-8"))["semantic_fingerprint"]


def copy_before_visuals() -> list[str]:
    source = ROOT / "reports" / "renders" / "human-review" / "blade-family" / "blade_dual_comet"
    destination = ROOT / "reports" / "renders" / "phase2b-r1" / "dual-comet" / "before"
    destination.mkdir(parents=True, exist_ok=True)
    copied = []
    for name in ("top_512.png", "perspective_45_512.png", "side_512.png", "silhouette_512.png", "thumbnail_128.png"):
        target = destination / name
        shutil.copy2(require(source / name), target)
        copied.append(target.relative_to(ROOT).as_posix())
    return copied


def target_stats(part_id: str, part_fingerprint: dict) -> dict:
    report_path = require(ROOT / "reports" / "validation" / f"geometry-{part_id.replace('_', '-')}.json")
    report = json.loads(report_path.read_text(encoding="utf-8-sig"))
    return {
        "spec_sha256": part_fingerprint["spec_sha256"],
        "raw_sha256": part_fingerprint["raw_sha256"],
        "semantic_fingerprint": part_fingerprint["semantic_fingerprint"],
        "geometry_report": report,
    }


def main() -> None:
    if not BLENDER.is_file():
        raise FileNotFoundError(BLENDER)
    all_parts = {}
    for part_id in PARTS:
        spec = require(ROOT / "specs" / "parts" / f"{part_id}.json")
        glb = require(ROOT / "public" / "models" / "parts" / f"{part_id}.glb")
        all_parts[part_id] = {
            "spec_sha256": sha256(spec),
            "raw_sha256": sha256(glb),
            "semantic_fingerprint": semantic_fingerprint(part_id),
        }
    result = {
        "result": "PASS",
        "phase": "Phase 2B-R1",
        "source_model_commit": SOURCE_MODEL_COMMIT,
        "interface_id": "NSS-V1",
        "target_part_count": len(TARGETS),
        "unchanged_part_count": len(PARTS) - len(TARGETS),
        "targets": {part_id: target_stats(part_id, all_parts[part_id]) for part_id in TARGETS},
        "parts": all_parts,
        "before_visuals": copy_before_visuals(),
        "constraints": {
            "approved_baselines_modified": False,
            "cartesian_product_executed": False,
            "full_288_matrix_executed": False,
        },
    }
    output = ROOT / "reports" / "validation" / "phase2b-r1-baseline.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"NSS_PHASE2B_R1_BASELINE={output}")
    print("NSS_PHASE2B_R1_BASELINE_RESULT=PASS")


if __name__ == "__main__":
    main()
