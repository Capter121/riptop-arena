"""Validate mount alignment, bounds, collisions, and GLB re-import."""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.collision import staged_overlap  # noqa: E402
from lib.reporting import write_json  # noqa: E402


def script_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assembly", required=True)
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners))),
        Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners))),
    )


def main() -> None:
    args = script_args()
    spec_catalog = load_json(ROOT / "specs" / "assemblies.json")
    interface_catalog = load_json(ROOT / "specs" / "interfaces.json")
    spec = next(item for item in spec_catalog["assemblies"] if item["id"] == args.assembly)
    interface = next(item for item in interface_catalog["interfaces"] if item["id"] == "NSS-V1")
    blend_path = ROOT / "build" / "blend" / f"{args.assembly}.blend"
    glb_path = ROOT / "public" / "models" / "assemblies" / f"{args.assembly}.glb"
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))

    order = ["core", "blade", "assist", "gear", "tip"]
    roots = {obj.get("assembly_role"): obj for obj in bpy.data.objects if obj.get("assembly_id") == args.assembly}
    meshes_by_role = {
        role: [
            child for child in roots[role].children_recursive
            if child.type == "MESH" and not child.name.startswith("COLLIDER_")
        ]
        for role in order if role in roots
    }
    colliders_by_role = {
        role: next((child for child in roots[role].children_recursive if child.name.startswith("COLLIDER_")), None)
        for role in order if role in roots
    }
    errors = []
    if set(roots) != set(order):
        errors.append("ASSEMBLY_PARTS_MISSING")

    connections = []
    maximum_axis_error_mm = 0.0
    maximum_phase_error_deg = 0.0
    expected_roles = [("male", "female")] * 4
    for index in range(1, len(order)):
        upper_id = spec[order[index - 1]]
        lower_id = spec[order[index]]
        upper = bpy.data.objects.get(f"MOUNT_{upper_id}_BOTTOM")
        lower = bpy.data.objects.get(f"MOUNT_{lower_id}_TOP")
        if upper is None or lower is None:
            errors.append("MOUNT_NOT_FOUND")
            continue
        delta = upper.matrix_world.translation - lower.matrix_world.translation
        axis_error_mm = math.hypot(delta.x, delta.y) * 1000.0
        datum_error_mm = abs(delta.z) * 1000.0
        phase_error_deg = abs(math.degrees(upper.matrix_world.to_euler().z - lower.matrix_world.to_euler().z))
        maximum_axis_error_mm = max(maximum_axis_error_mm, axis_error_mm, datum_error_mm)
        maximum_phase_error_deg = max(maximum_phase_error_deg, phase_error_deg)
        roles = (upper.get("interface_role"), lower.get("interface_role"))
        if upper.get("interface_id") != "NSS-V1" or lower.get("interface_id") != "NSS-V1":
            errors.append("INTERFACE_VERSION_MISMATCH")
        if roles != expected_roles[index - 1]:
            errors.append("ROLE_MISMATCH")
        connections.append({
            "from": upper.name,
            "to": lower.name,
            "axis_error_mm": axis_error_mm,
            "datum_error_mm": datum_error_mm,
            "phase_error_deg": phase_error_deg,
            "roles": list(roles),
        })
    if maximum_axis_error_mm > interface["alignment_tolerance_mm"]:
        errors.append("AXIS_MISALIGNED")
    if maximum_phase_error_deg > interface["angular_tolerance_deg"]:
        errors.append("PHASE_MISALIGNED")

    collisions = []
    for first_index, first_role in enumerate(order):
        for second_role in order[first_index + 1:]:
            first = colliders_by_role.get(first_role)
            second = colliders_by_role.get(second_role)
            if first is None or second is None:
                continue
            collision_result = staged_overlap(
                first,
                second,
                interface_catalog["collision_policy"]["max_unexpected_overlap_volume_mm3"],
            )
            collision_result["parts"] = [first_role, second_role]
            collisions.append(collision_result)
    if any(item["result"] == "FAIL" for item in collisions):
        errors.append("UNEXPECTED_COLLISION")
    if any(item["result"] == "CONTACT_REVIEW" for item in collisions):
        errors.append("CONTACT_REVIEW_UNRESOLVED")

    all_meshes = [obj for objects in meshes_by_role.values() for obj in objects]
    overall_min, overall_max = world_bounds(all_meshes)
    total_height_mm = (overall_max.z - overall_min.z) * 1000.0
    total_diameter_mm = max(overall_max.x - overall_min.x, overall_max.y - overall_min.y) * 1000.0
    triangle_count = 0
    for obj in all_meshes:
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
    if triangle_count > 150000:
        errors.append("TRIANGLE_LIMIT_EXCEEDED")
    if not (15.0 <= total_height_mm <= 40.0 and 40.0 <= total_diameter_mm <= 90.0):
        errors.append("DIMENSION_OUT_OF_RANGE")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    imported_mesh_count = sum(1 for obj in bpy.data.objects if obj.type == "MESH")
    imported_collider_count = sum(1 for obj in bpy.data.objects if obj.name.startswith("COLLIDER_"))
    if imported_mesh_count == 0:
        errors.append("GLB_REIMPORT_FAILED")
    if imported_collider_count:
        errors.append("GLB_REIMPORT_CONTAINS_COLLIDER")

    result = "PASS" if not errors else "FAIL"
    report = {
        "assembly_id": args.assembly,
        "result": result,
        "errors": errors,
        "collision_count": sum(1 for item in collisions if item["result"] == "FAIL"),
        "contact_review_count": sum(1 for item in collisions if item["result"] == "CONTACT_REVIEW"),
        "collisions": collisions,
        "axis_error_mm": maximum_axis_error_mm,
        "phase_error_deg": maximum_phase_error_deg,
        "total_height_mm": total_height_mm,
        "total_diameter_mm": total_diameter_mm,
        "triangle_count": triangle_count,
        "glb_file_size_bytes": glb_path.stat().st_size,
        "glb_reimport_mesh_count": imported_mesh_count,
        "glb_reimport_collider_count": imported_collider_count,
        "connections": connections,
    }
    report_path = ROOT / "reports" / "validation" / f"assembly-{args.assembly.removeprefix('assembly_').replace('_', '-')}.json"
    write_json(report_path, report)

    matrix_path = ROOT / "reports" / "assembly_matrix.csv"
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    with matrix_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "assembly_id", "core", "blade", "assist", "gear", "tip", "result", "error_code",
            "axis_error_mm", "phase_error_deg", "unexpected_overlap_mm3", "total_height_mm", "total_diameter_mm",
        ])
        writer.writeheader()
        writer.writerow({
            "assembly_id": args.assembly,
            "core": spec["core"], "blade": spec["blade"], "assist": spec["assist"],
            "gear": spec["gear"], "tip": spec["tip"], "result": result,
            "error_code": "|".join(errors), "axis_error_mm": maximum_axis_error_mm,
            "phase_error_deg": maximum_phase_error_deg,
            "unexpected_overlap_mm3": sum(item["overlap_volume_mm3"] for item in collisions),
            "total_height_mm": total_height_mm, "total_diameter_mm": total_diameter_mm,
        })
    print(f"NSS_ASSEMBLY_VALIDATION={result}")
    print(f"NSS_ASSEMBLY_REPORT={report_path}")
    print(f"NSS_ASSEMBLY_MATRIX={matrix_path}")
    if errors:
        print("NSS_ASSEMBLY_ERRORS=" + ",".join(errors))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
