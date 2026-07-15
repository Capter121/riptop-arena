"""Validate all Phase 2C combinations in memory without exporting assemblies."""

from __future__ import annotations

import argparse
import csv
import hashlib
import itertools
import json
import math
import sys
import time
from datetime import date
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "scripts"))

from lib import assembly  # noqa: E402
from lib.collision import staged_overlap  # noqa: E402
from phase2c_matrix import FAMILIES, enumerate_combinations, load_specs, select_combination  # noqa: E402
from validate_phase2c_waiver import AUDIT_NOTE, DEFAULT_WAIVER, validate as validate_waiver  # noqa: E402


VALIDATION = ROOT / "reports" / "validation"
BASELINE_PATH = ROOT / "docs" / "baselines" / "v0.2.0-rc1-technical-baseline.json"
MATRIX_PATH = ROOT / "reports" / "assembly_matrix.csv"
MATRIX_REPORT = VALIDATION / "phase2c-combination-matrix.json"
COLLISION_REPORT = VALIDATION / "phase2c-collision-summary.json"
DETERMINISM_REPORT = VALIDATION / "phase2c-determinism.json"
ROLE_ORDER = [role for role, _part_type, _count in FAMILIES]
TRIANGLE_LIMIT = 150000
MATERIAL_LIMIT = 6
HEIGHT_RANGE_MM = (15.0, 40.0)
DIAMETER_RANGE_MM = (40.0, 90.0)


def script_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--combination-id")
    parser.add_argument("--expected-digest")
    parser.add_argument("--dry-run-load", action="store_true")
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_authorization_and_baseline() -> dict:
    waiver = validate_waiver(DEFAULT_WAIVER)
    if waiver["result"] != "PASS":
        raise RuntimeError("WAIVER_INVALID:" + ",".join(waiver["errors"]))
    baseline = load_json(BASELINE_PATH)
    errors = []
    if baseline.get("baseline_id") != "v0.2.0-rc1-technical-baseline":
        errors.append("BASELINE_ID_INVALID")
    if baseline.get("baseline_status") != "PROVISIONAL_NOT_FINAL":
        errors.append("BASELINE_STATUS_INVALID")
    if date.today() > date.fromisoformat(baseline["expires_on"]):
        errors.append("BASELINE_EXPIRED")
    if baseline["waiver"]["sha256"] != waiver["waiver_sha256"]:
        errors.append("WAIVER_BASELINE_MISMATCH")
    interface_path = ROOT / baseline["interface"]["path"]
    if sha256(interface_path) != baseline["interface"]["sha256"]:
        errors.append("NSS_V1_DRIFT")
    if len(baseline.get("parts", [])) != 16:
        errors.append("BASELINE_PART_COUNT_INVALID")
    for part in baseline.get("parts", []):
        if sha256(ROOT / part["glb_path"]) != part["raw_sha256"]:
            errors.append(f"BINARY_DRIFT:{part['part_id']}")
        if sha256(ROOT / part["spec_path"]) != part["spec_sha256"]:
            errors.append(f"SPEC_DRIFT:{part['part_id']}")
    if errors:
        raise RuntimeError("BASELINE_INVALID:" + ",".join(errors))
    return baseline


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def preload_parts(specs: list[dict]) -> dict[str, dict]:
    collection = bpy.data.collections.new("PHASE2C_IN_MEMORY_PARTS")
    bpy.context.scene.collection.children.link(collection)
    loaded = {}
    for spec in sorted(specs, key=lambda item: item["id"]):
        part_id = spec["id"]
        blend_path = ROOT / "build" / "blend" / f"{part_id}.blend"
        if not blend_path.is_file():
            raise FileNotFoundError(f"FROZEN_BLEND_MISSING:{part_id}")
        root, part_collection = assembly.append_part(part_id, blend_path, collection)
        render_meshes = [
            obj for obj in part_collection.all_objects
            if obj.type == "MESH" and not obj.name.startswith("COLLIDER_") and obj.get("export_exclude") is not True
        ]
        colliders = [obj for obj in part_collection.all_objects if obj.name == f"COLLIDER_{part_id}"]
        top = part_collection.all_objects.get(f"MOUNT_{part_id}_TOP")
        bottom = part_collection.all_objects.get(f"MOUNT_{part_id}_BOTTOM")
        if not render_meshes or len(colliders) != 1 or top is None or bottom is None:
            raise RuntimeError(f"PART_LOAD_INCOMPLETE:{part_id}")
        loaded[part_id] = {
            "root": root,
            "collection": part_collection,
            "meshes": render_meshes,
            "collider": colliders[0],
            "top": top,
            "bottom": bottom,
            "spec": spec,
        }
    bpy.context.view_layer.update()
    if len(loaded) != 16:
        raise RuntimeError(f"PRELOAD_COUNT_INVALID:{len(loaded)}")
    return loaded


def shortest_angle_degrees(value: float) -> float:
    return abs((value + 180.0) % 360.0 - 180.0)


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    if not corners:
        raise RuntimeError("ASSEMBLY_HAS_NO_RENDER_MESH")
    return (
        Vector(tuple(min(point[axis] for point in corners) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in corners) for axis in range(3))),
    )


def validate_combination(
    combination: dict[str, str],
    loaded: dict[str, dict],
    interface_catalog: dict,
) -> dict:
    started = time.perf_counter()
    interface = interface_catalog["interfaces"][0]
    allowed_connections = {
        (item["from"], item["to"])
        for item in interface_catalog["allowed_connections"]
    }
    selected = {role: loaded[combination[role]] for role in ROLE_ORDER}
    for item in selected.values():
        item["root"].matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()

    errors = []
    connections = []
    maximum_axis_error_mm = 0.0
    maximum_datum_error_mm = 0.0
    maximum_phase_error_deg = 0.0
    for index in range(1, len(ROLE_ORDER)):
        upper_role, lower_role = ROLE_ORDER[index - 1], ROLE_ORDER[index]
        upper, lower = selected[upper_role], selected[lower_role]
        source = lower["top"]
        target = upper["bottom"]
        assembly.align_mounts(lower["root"], source, target)
        delta = target.matrix_world.translation - source.matrix_world.translation
        axis_error_mm = math.hypot(delta.x, delta.y) * 1000.0
        datum_error_mm = abs(delta.z) * 1000.0
        phase_error_deg = shortest_angle_degrees(math.degrees(
            target.matrix_world.to_euler().z - source.matrix_world.to_euler().z
        ))
        maximum_axis_error_mm = max(maximum_axis_error_mm, axis_error_mm)
        maximum_datum_error_mm = max(maximum_datum_error_mm, datum_error_mm)
        maximum_phase_error_deg = max(maximum_phase_error_deg, phase_error_deg)
        connection = (
            f"{upper['spec']['part_type']}.bottom",
            f"{lower['spec']['part_type']}.top",
        )
        roles = (target.get("interface_role"), source.get("interface_role"))
        if connection not in allowed_connections:
            errors.append("CONNECTION_NOT_ALLOWED")
        if target.get("interface_id") != "NSS-V1" or source.get("interface_id") != "NSS-V1":
            errors.append("INTERFACE_VERSION_MISMATCH")
        if roles != ("male", "female"):
            errors.append("ROLE_MISMATCH")
        connections.append({
            "from": target.name,
            "to": source.name,
            "allowed_connection": list(connection),
            "roles": list(roles),
            "axis_error_mm": axis_error_mm,
            "datum_error_mm": datum_error_mm,
            "phase_error_deg": phase_error_deg,
        })
    if maximum_axis_error_mm > interface["alignment_tolerance_mm"]:
        errors.append("AXIS_MISALIGNED")
    if maximum_datum_error_mm > interface["alignment_tolerance_mm"]:
        errors.append("DATUM_MISALIGNED")
    if maximum_phase_error_deg > interface["angular_tolerance_deg"]:
        errors.append("PHASE_MISALIGNED")

    collisions = []
    for first_role, second_role in itertools.combinations(ROLE_ORDER, 2):
        result = staged_overlap(
            selected[first_role]["collider"],
            selected[second_role]["collider"],
            interface_catalog["collision_policy"]["max_unexpected_overlap_volume_mm3"],
        )
        result["roles"] = [first_role, second_role]
        result["parts"] = [combination[first_role], combination[second_role]]
        collisions.append(result)
    collision_failures = sum(item["result"] == "FAIL" for item in collisions)
    contact_reviews = sum(item["result"] == "CONTACT_REVIEW" for item in collisions)
    if collision_failures:
        errors.append("UNEXPECTED_COLLISION")
    if contact_reviews:
        errors.append("CONTACT_REVIEW_UNRESOLVED")

    meshes = [obj for role in ROLE_ORDER for obj in selected[role]["meshes"]]
    minimum, maximum = world_bounds(meshes)
    total_height_mm = (maximum.z - minimum.z) * 1000.0
    total_diameter_mm = max(maximum.x - minimum.x, maximum.y - minimum.y) * 1000.0
    triangle_count = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
    materials = {
        material.get("material_id", material.name)
        for obj in meshes
        for material in obj.data.materials
        if material is not None
    }
    if triangle_count > TRIANGLE_LIMIT:
        errors.append("TRIANGLE_LIMIT_EXCEEDED")
    if len(materials) > MATERIAL_LIMIT:
        errors.append("MATERIAL_LIMIT_EXCEEDED")
    if not (HEIGHT_RANGE_MM[0] <= total_height_mm <= HEIGHT_RANGE_MM[1]):
        errors.append("HEIGHT_OUT_OF_RANGE")
    if not (DIAMETER_RANGE_MM[0] <= total_diameter_mm <= DIAMETER_RANGE_MM[1]):
        errors.append("DIAMETER_OUT_OF_RANGE")

    if collision_failures or any(error != "CONTACT_REVIEW_UNRESOLVED" for error in errors):
        result = "FAIL" if errors else "PASS"
    elif contact_reviews:
        result = "CONTACT_REVIEW"
    else:
        result = "PASS"
    return {
        **combination,
        "result": result,
        "error_code": "|".join(sorted(set(errors))),
        "axis_error_mm": maximum_axis_error_mm,
        "datum_error_mm": maximum_datum_error_mm,
        "phase_error_deg": maximum_phase_error_deg,
        "unexpected_overlap_mm3": sum(item.get("overlap_volume_mm3", 0.0) for item in collisions),
        "total_height_mm": total_height_mm,
        "total_diameter_mm": total_diameter_mm,
        "triangle_count": triangle_count,
        "material_count": len(materials),
        "validation_duration_ms": (time.perf_counter() - started) * 1000.0,
        "connections": connections,
        "collisions": collisions,
    }


def normalized_digest(results: list[dict]) -> str:
    excluded = {"validation_duration_ms"}
    normalized = [
        {key: value for key, value in result.items() if key not in excluded}
        for result in results
    ]
    encoded = json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def write_full_reports(results: list[dict], digest: str, baseline: dict) -> None:
    MATRIX_PATH.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "combination_id", "core", "blade", "assist", "gear", "tip", "result", "error_code",
        "axis_error_mm", "datum_error_mm", "phase_error_deg", "unexpected_overlap_mm3",
        "total_height_mm", "total_diameter_mm", "triangle_count", "material_count",
        "validation_duration_ms", "audit_note",
    ]
    with MATRIX_PATH.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for result in results:
            writer.writerow({**{key: result[key] for key in fields if key != "audit_note"}, "audit_note": AUDIT_NOTE})

    counts = {name: sum(result["result"] == name for result in results) for name in ("PASS", "CONTACT_REVIEW", "FAIL")}
    matrix_report = {
        "phase": "Phase 2C",
        "baseline_id": baseline["baseline_id"],
        "baseline_status": baseline["baseline_status"],
        "visual_review_status": "Phase 2B visual review deferred pending real reviewers",
        "combination_count": len(results),
        "duplicate_count": len(results) - len({result["combination_id"] for result in results}),
        "missing_count": 288 - len(results),
        "counts": counts,
        "normalized_digest": digest,
        "assembled_glb_exports": 0,
        "results": results,
        "audit_note": AUDIT_NOTE,
    }
    MATRIX_REPORT.write_text(json.dumps(matrix_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    all_collisions = [collision for result in results for collision in result["collisions"]]
    collision_report = {
        "result": "PASS" if counts["FAIL"] == 0 and counts["CONTACT_REVIEW"] == 0 else "FAIL",
        "combination_count": len(results),
        "pair_check_count": len(all_collisions),
        "fail_count": sum(item["result"] == "FAIL" for item in all_collisions),
        "contact_review_count": sum(item["result"] == "CONTACT_REVIEW" for item in all_collisions),
        "maximum_overlap_mm3": max((item.get("overlap_volume_mm3", 0.0) for item in all_collisions), default=0.0),
        "affected_combinations": [result["combination_id"] for result in results if result["result"] != "PASS"],
        "audit_note": AUDIT_NOTE,
    }
    COLLISION_REPORT.write_text(json.dumps(collision_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    args = script_args()
    baseline = verify_authorization_and_baseline()
    specs = load_specs()
    combinations = enumerate_combinations(specs)
    clear_scene()
    loaded = preload_parts(specs)
    if args.dry_run_load:
        print(f"NSS_PHASE2C_PRELOADED_PARTS={len(loaded)}")
        return
    interface_catalog = load_json(ROOT / "specs" / "interfaces.json")
    selected = [select_combination(args.combination_id, combinations)] if args.combination_id else combinations
    results = [validate_combination(item, loaded, interface_catalog) for item in selected]
    if args.combination_id:
        output = VALIDATION / f"phase2c-reproduction-{args.combination_id}.json"
        report = {
            "combination_count": 1,
            "visual_review_status": "Phase 2B visual review deferred pending real reviewers",
            "result": results[0],
            "audit_note": AUDIT_NOTE,
        }
        output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"NSS_PHASE2C_REPRODUCTION={results[0]['result']}")
        print(f"NSS_PHASE2C_REPRODUCTION_REPORT={output}")
        return
    digest = normalized_digest(results)
    write_full_reports(results, digest, baseline)
    if args.expected_digest:
        determinism = {
            "result": "PASS" if digest == args.expected_digest else "FAIL",
            "expected_digest": args.expected_digest,
            "actual_digest": digest,
            "combination_count": len(results),
            "audit_note": AUDIT_NOTE,
        }
        DETERMINISM_REPORT.write_text(json.dumps(determinism, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if determinism["result"] != "PASS":
            raise RuntimeError("DETERMINISM_MISMATCH")
    print(f"NSS_PHASE2C_MATRIX_COMBINATIONS={len(results)}")
    print(f"NSS_PHASE2C_MATRIX_DIGEST={digest}")
    print(f"NSS_PHASE2C_MATRIX_PASS={sum(result['result'] == 'PASS' for result in results)}")
    print(f"NSS_PHASE2C_MATRIX_CONTACT_REVIEW={sum(result['result'] == 'CONTACT_REVIEW' for result in results)}")
    print(f"NSS_PHASE2C_MATRIX_FAIL={sum(result['result'] == 'FAIL' for result in results)}")


if __name__ == "__main__":
    main()
