"""Capture or verify the provisional Phase 2C reproducibility baseline."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import date
from pathlib import Path

from validate_phase2c_waiver import AUDIT_NOTE, DEFAULT_WAIVER, validate as validate_waiver


ROOT = Path(__file__).resolve().parent.parent
VALIDATION = ROOT / "reports" / "validation"
BASELINE_JSON = ROOT / "docs" / "baselines" / "v0.2.0-rc1-technical-baseline.json"
BASELINE_MD = ROOT / "docs" / "baselines" / "v0.2.0-rc1-technical-baseline.md"
VERIFY_REPORT = VALIDATION / "phase2c-baseline-verification.json"
FINGERPRINT_DIR = ROOT / "build" / "fingerprint-work" / "phase2c-baseline"
SOURCE_MODEL_COMMIT = "bbf5bc11a9e2adf8eff472007e0fcc4f5e89c4b3"
PARTS = (
    "core_solar_wolf", "core_void_falcon",
    "blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet",
    "assist_heavy", "assist_guard", "assist_air",
    "gear_low", "gear_medium", "gear_high",
    "tip_flat_attack", "tip_ball_defense", "tip_needle_stamina", "tip_taper_balance",
)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(path: Path) -> Path:
    if not path.is_file() or path.stat().st_size == 0:
        raise FileNotFoundError(path)
    return path


def git_head() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, encoding="utf-8"
    ).strip()


def collect_part(part_id: str) -> dict:
    slug = part_id.replace("_", "-")
    spec_path = require(ROOT / "specs" / "parts" / f"{part_id}.json")
    glb_path = require(ROOT / "public" / "models" / "parts" / f"{part_id}.glb")
    geometry = load_json(require(VALIDATION / f"geometry-{slug}.json"))
    collider = load_json(require(VALIDATION / f"collider-{slug}.json"))
    gltf = load_json(require(VALIDATION / f"gltf-{slug}.json"))
    fingerprint = load_json(require(FINGERPRINT_DIR / f"{part_id}.json"))
    errors = []
    if geometry.get("result") != "PASS":
        errors.append("GEOMETRY_VALIDATION_FAILED")
    if collider.get("result") != "PASS":
        errors.append("COLLIDER_VALIDATION_FAILED")
    if gltf.get("issues", {}).get("numErrors") != 0:
        errors.append("GLTF_VALIDATOR_ERRORS")
    if gltf.get("issues", {}).get("numWarnings") != 0:
        errors.append("GLTF_VALIDATOR_WARNINGS")
    if fingerprint.get("input") != glb_path.name:
        errors.append("FINGERPRINT_INPUT_MISMATCH")
    if errors:
        raise RuntimeError(f"{part_id}:" + ",".join(errors))
    return {
        "part_id": part_id,
        "part_type": load_json(spec_path)["part_type"],
        "glb_path": glb_path.relative_to(ROOT).as_posix(),
        "spec_path": spec_path.relative_to(ROOT).as_posix(),
        "raw_sha256": sha256(glb_path),
        "semantic_fingerprint": fingerprint["semantic_fingerprint"],
        "spec_sha256": sha256(spec_path),
        "triangle_count": geometry["triangle_count"],
        "material_count": geometry["material_count"],
        "dimensions_mm": fingerprint["canonical"]["dimensions_mm"],
        "glb_size_bytes": glb_path.stat().st_size,
        "mounts_present": geometry["mounts_present"],
        "glb_reimport_mesh_count": geometry["glb_reimport_mesh_count"],
        "collider_result": collider["result"],
        "collider_count": len(collider["colliders"]),
        "gltf_validator_errors": gltf["issues"]["numErrors"],
        "gltf_validator_warnings": gltf["issues"]["numWarnings"],
    }


def environment() -> dict:
    previous = load_json(require(VALIDATION / "phase2b-environment.json"))
    validator_package = load_json(require(ROOT / "build" / "tools" / "gltf-validator" / "node_modules" / "gltf-validator" / "package.json"))
    preview_package = load_json(require(ROOT / "preview" / "package.json"))
    return {
        "blender": previous["blender"],
        "gltf_validator_version": validator_package["version"],
        "node_version": subprocess.check_output(["node", "--version"], text=True, encoding="utf-8").strip(),
        "three_version": preview_package["dependencies"]["three"],
        "playwright_version": preview_package["devDependencies"]["@playwright/test"],
    }


def gate_result(name: str) -> dict:
    report = load_json(require(VALIDATION / name))
    return {"report": f"reports/validation/{name}", "result": report.get("result", "PASS")}


def build_manifest() -> dict:
    waiver = validate_waiver(DEFAULT_WAIVER)
    if waiver["result"] != "PASS":
        raise RuntimeError("WAIVER_INVALID:" + ",".join(waiver["errors"]))
    parts = [collect_part(part_id) for part_id in PARTS]
    if len(parts) != 16 or {part["part_id"] for part in parts} != set(PARTS):
        raise RuntimeError("PART_SCOPE_INVALID")
    interface_path = require(ROOT / "specs" / "interfaces.json")
    interface = load_json(interface_path)
    if [item["id"] for item in interface["interfaces"]] != ["NSS-V1"]:
        raise RuntimeError("INTERFACE_SCOPE_INVALID")
    return {
        "baseline_id": "v0.2.0-rc1-technical-baseline",
        "baseline_status": "PROVISIONAL_NOT_FINAL",
        "purpose": "Freeze digital geometry only for Phase 2C reproducibility",
        "created_on": date.today().isoformat(),
        "expires_on": "2026-08-14",
        "source_model_commit": SOURCE_MODEL_COMMIT,
        "capture_commit": git_head(),
        "visual_review_status": "Phase 2B visual review deferred pending real reviewers",
        "human_review_result": "INSUFFICIENT_REVIEWERS",
        "waiver": {
            "path": waiver["waiver_path"],
            "sha256": waiver["waiver_sha256"],
            "validation_report": "reports/validation/phase2c-waiver-validation.json",
            "technical_continuation_status": waiver["technical_continuation_status"],
        },
        "interface": {
            "id": "NSS-V1",
            "status": "concept_only",
            "path": "specs/interfaces.json",
            "sha256": sha256(interface_path),
        },
        "part_count": len(parts),
        "parts": parts,
        "environment": environment(),
        "automatic_gates": {
            "phase2a": gate_result("phase2a-quality-gate.json"),
            "phase2b": gate_result("phase2b-quality-gate.json"),
            "phase2b_r1": gate_result("phase2b-r1-summary.json"),
            "phase2b_r1_regression": gate_result("phase2b-r1-regression.json"),
        },
        "unresolved_contact_review_count": 0,
        "unconfirmed_binary_drift_count": 0,
        "semantic_regression_count": 0,
        "accepted_ux_compensation": [
            "Assist selection uses light exploded separation",
            "Blade becomes temporarily translucent during Assist focus",
            "Selected Assist receives a temporary highlight",
            "Gear selection uses a side-view focus",
            "Tip selection uses a bottom or low camera view",
            "The production preview hides coordinate axes by default",
        ],
        "freeze_rules": [
            "Phase 2C must not modify visible part geometry",
            "Phase 2C must not modify NSS-V1",
            "Phase 2C must not silently update part specifications",
            "Any baseline drift stops the combination matrix",
            "Any geometry change requires a new visual-revision process",
            "Phase 2C changes are limited to matrix, validators, reports, and test infrastructure",
        ],
        "claims": {
            "production_release_allowed": False,
            "manufacturing_approved": False,
            "high_speed_battle_safety_approved": False,
            "materials_certified": False,
            "legal_originality_proven": False,
        },
        "audit_note": AUDIT_NOTE,
    }


def markdown(manifest: dict) -> str:
    rows = "\n".join(
        f"| {part['part_id']} | `{part['raw_sha256']}` | `{part['semantic_fingerprint']}` | "
        f"{part['triangle_count']} | {part['material_count']} | {part['glb_size_bytes']} |"
        for part in manifest["parts"]
    )
    return f"""# v0.2.0-rc1 technical baseline

Status: **PROVISIONAL_NOT_FINAL**

Visual-review status: **{manifest['visual_review_status']}**

This baseline freezes digital geometry only for Phase 2C reproducibility. It expires on {manifest['expires_on']} and does not close the human-review requirement.

> {manifest['audit_note']}

## Scope

- Parts: {manifest['part_count']}
- Interface: NSS-V1 (`concept_only`)
- Waiver: `{manifest['waiver']['path']}`
- Waiver SHA-256: `{manifest['waiver']['sha256']}`
- Source model commit: `{manifest['source_model_commit']}`

## Parts

| Part | Raw SHA-256 | Semantic fingerprint | Triangles | Materials | GLB bytes |
|---|---|---|---:|---:|---:|
{rows}

## Restrictions

This record provides no production, manufacturing, safety, material-certification, or legal-originality approval. Any drift in geometry, specifications, semantic fingerprints, or NSS-V1 stops Phase 2C until explicitly reviewed.
"""


def compare(expected: dict, actual: dict) -> list[str]:
    errors = []
    if expected["baseline_id"] != actual["baseline_id"]:
        errors.append("BASELINE_ID_MISMATCH")
    if expected["waiver"]["sha256"] != actual["waiver"]["sha256"]:
        errors.append("WAIVER_SHA256_MISMATCH")
    if expected["interface"]["sha256"] != actual["interface"]["sha256"]:
        errors.append("NSS_V1_DRIFT")
    expected_parts = {part["part_id"]: part for part in expected["parts"]}
    actual_parts = {part["part_id"]: part for part in actual["parts"]}
    if set(expected_parts) != set(actual_parts):
        errors.append("PART_SCOPE_DRIFT")
    for part_id in sorted(set(expected_parts) & set(actual_parts)):
        before, after = expected_parts[part_id], actual_parts[part_id]
        if before["raw_sha256"] != after["raw_sha256"]:
            errors.append(f"BINARY_DRIFT:{part_id}")
        if before["semantic_fingerprint"] != after["semantic_fingerprint"]:
            errors.append(f"SEMANTIC_REGRESSION:{part_id}")
        if before["spec_sha256"] != after["spec_sha256"]:
            errors.append(f"SPEC_DRIFT:{part_id}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("capture", "verify"))
    args = parser.parse_args()
    actual = build_manifest()
    if args.mode == "capture":
        BASELINE_JSON.parent.mkdir(parents=True, exist_ok=True)
        BASELINE_JSON.write_text(json.dumps(actual, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        BASELINE_MD.write_text(markdown(actual), encoding="utf-8")
        print(f"NSS_PHASE2C_BASELINE_CAPTURE=PASS")
        print(f"NSS_PHASE2C_BASELINE_JSON={BASELINE_JSON}")
        return 0
    expected = load_json(require(BASELINE_JSON))
    errors = compare(expected, actual)
    report = {
        "result": "PASS" if not errors else "FAIL",
        "baseline_id": expected["baseline_id"],
        "part_count": len(actual["parts"]),
        "errors": errors,
        "visual_review_status": actual["visual_review_status"],
        "audit_note": AUDIT_NOTE,
    }
    VERIFY_REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"NSS_PHASE2C_BASELINE_VERIFY={report['result']}")
    print(f"NSS_PHASE2C_BASELINE_VERIFY_REPORT={VERIFY_REPORT}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
