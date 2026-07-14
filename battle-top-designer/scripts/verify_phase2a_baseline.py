"""Verify raw hashes and capture stable semantic fingerprints for the vertical slice."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GLB_PATHS = (
    "public/models/parts/core_solar_wolf.glb",
    "public/models/parts/blade_storm_fang.glb",
    "public/models/parts/assist_heavy.glb",
    "public/models/parts/gear_low.glb",
    "public/models/parts/tip_flat_attack.glb",
    "public/models/assemblies/assembly_storm_attack.glb",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="docs/baselines/v0.1.0-vertical-slice.json")
    parser.add_argument("--blender", required=True)
    parser.add_argument("--glb-only", action="store_true")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--verify-only", action="store_true")
    action.add_argument("--capture", action="store_true")
    parser.add_argument("--report", default="reports/validation/phase2a-baseline-check.json")
    parser.add_argument("--accept-approved-drift", action="store_true")
    parser.add_argument("--disposition")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fingerprint(blender: Path, input_path: Path, output_path: Path) -> dict:
    command = [
        str(blender),
        "--background",
        "--python",
        str(ROOT / "blender" / "fingerprint_glb.py"),
        "--",
        "--input",
        str(input_path),
        "--output",
        str(output_path),
    ]
    completed = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"Fingerprint failed for {input_path}\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
        )
    return json.loads(output_path.read_text(encoding="utf-8"))


def main() -> None:
    args = parse_args()
    manifest_path = (ROOT / args.manifest).resolve()
    blender = Path(args.blender).resolve()
    report_path = (ROOT / args.report).resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected_hashes = manifest.get("raw_sha256", manifest.get("sha256", {}))
    glb_paths = tuple(
        manifest.get("artifacts")
        or sorted(path for path in expected_hashes if path.lower().endswith(".glb"))
        or DEFAULT_GLB_PATHS
    )
    disposition = None
    if args.accept_approved_drift:
        if not args.disposition:
            raise ValueError("--disposition is required with --accept-approved-drift")
        disposition = json.loads((ROOT / args.disposition).read_text(encoding="utf-8"))
        if disposition.get("result") != "CONFIRMED":
            raise ValueError("drift disposition is not CONFIRMED")

    errors = []
    binary_drifts = []
    raw_results = {}
    before_stats = {}
    semantic_results = {}
    paths_to_check = glb_paths if args.glb_only or args.capture else tuple(sorted(expected_hashes))
    for relative_path in paths_to_check:
        expected_hash = expected_hashes.get(relative_path)
        artifact_path = ROOT / relative_path
        if not artifact_path.is_file():
            errors.append(f"MISSING_BASELINE_ARTIFACT:{relative_path}")
            continue
        actual_hash = sha256(artifact_path)
        raw_results[relative_path] = actual_hash
        if not args.capture and actual_hash != expected_hash:
            binary_drifts.append(relative_path)
            if not args.accept_approved_drift:
                error_code = "BINARY_DRIFT" if args.verify_only else "RAW_SHA256_MISMATCH"
                errors.append(f"{error_code}:{relative_path}")

    work_directory = ROOT / "build" / "fingerprint-work"
    work_directory.mkdir(parents=True, exist_ok=True)
    for index, relative_path in enumerate(glb_paths):
        model_path = ROOT / relative_path
        if not model_path.is_file():
            errors.append(f"MISSING_GLB:{relative_path}")
            continue
        before_stats[relative_path] = {
            "size": model_path.stat().st_size,
            "mtime_ns": model_path.stat().st_mtime_ns,
        }
        actual_hash = raw_results.get(relative_path)
        if not args.capture and expected_hashes.get(relative_path) != actual_hash and not (args.verify_only or args.accept_approved_drift):
            continue

        first = fingerprint(blender, model_path, work_directory / f"{index}-first.json")
        second = fingerprint(blender, model_path, work_directory / f"{index}-second.json")
        if first != second:
            errors.append(f"UNSTABLE_SEMANTIC_FINGERPRINT:{relative_path}")
            continue
        semantic_results[relative_path] = {
            "sha256": first["semantic_fingerprint"],
            "canonical": first["canonical"],
        }

        if args.verify_only:
            expected_semantic = manifest.get("semantic_fingerprint", {}).get("artifacts", {}).get(relative_path, {}).get("sha256")
            if first["semantic_fingerprint"] != expected_semantic:
                errors.append(f"SEMANTIC_REGRESSION:{relative_path}")

    for relative_path, before in before_stats.items():
        model_path = ROOT / relative_path
        after = {"size": model_path.stat().st_size, "mtime_ns": model_path.stat().st_mtime_ns}
        if before != after or raw_results[relative_path] != sha256(model_path):
            errors.append(f"GLB_CHANGED_DURING_VERIFICATION:{relative_path}")

    if len(semantic_results) != len(glb_paths):
        errors.append("SEMANTIC_FINGERPRINT_COUNT_MISMATCH")

    report = {
        "result": "PASS" if not errors else "FAIL",
        "errors": errors,
        "baseline": manifest.get("baseline"),
        "source_commit": manifest.get("source_commit", "f55e260"),
        "raw_sha256": raw_results,
        "semantic_fingerprint": {
            path: record["sha256"] for path, record in semantic_results.items()
        },
        "glb_unchanged": not any(error.startswith("GLB_CHANGED_DURING_VERIFICATION") for error in errors),
        "binary_drifts": binary_drifts,
        "disposition": args.disposition if disposition else None,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if errors:
        print("PHASE2A_BASELINE_RESULT=FAIL")
        print("PHASE2A_BASELINE_ERRORS=" + ",".join(errors))
        raise SystemExit(1)

    if not args.verify_only:
        manifest["raw_sha256"] = manifest.pop("sha256", expected_hashes)
        if args.capture or args.accept_approved_drift:
            manifest["raw_sha256"].update({path: raw_results[path] for path in glb_paths})
        manifest["semantic_fingerprint"] = {
            "schema_version": 1,
            "source_commit": manifest.get("source_commit", "f55e260"),
            "artifacts": semantic_results,
        }
        if args.capture:
            manifest["status"] = "PASS"
        if disposition:
            manifest.setdefault("accepted_migrations", []).append(disposition)
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("PHASE2A_BASELINE_RESULT=PASS")
    print(f"PHASE2A_BASELINE_GLBS={len(glb_paths)}")
    print(f"PHASE2A_BASELINE_REPORT={report_path}")


if __name__ == "__main__":
    main()
