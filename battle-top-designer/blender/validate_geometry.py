"""Validate source geometry and GLB re-import for one NSS part."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bmesh
import bpy


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.reporting import write_json  # noqa: E402


def script_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--part", required=True)
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def near(value: float, target: float, tolerance: float = 1e-6) -> bool:
    return abs(value - target) <= tolerance


def inspect_mesh(obj: bpy.types.Object) -> dict:
    mesh = obj.data
    mesh.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    loose_vertices = sum(1 for vertex in bm.verts if not vertex.link_edges)
    zero_area = sum(1 for face in bm.faces if face.calc_area() <= 1e-12)
    signed_volume = bm.calc_volume(signed=True)
    bm.free()

    seen = set()
    duplicate_vertices = 0
    for vertex in mesh.vertices:
        key = tuple(round(component, 9) for component in vertex.co)
        if key in seen:
            duplicate_vertices += 1
        seen.add(key)
    return {
        "object": obj.name,
        "vertices": len(mesh.vertices),
        "triangles": len(mesh.loop_triangles),
        "materials": len(mesh.materials),
        "non_manifold_edges": non_manifold,
        "duplicate_vertices": duplicate_vertices,
        "loose_vertices": loose_vertices,
        "zero_area_faces": zero_area,
        "signed_volume_m3": signed_volume,
        "scale_applied": all(near(value, 1.0) for value in obj.scale),
        "rotation_applied": all(near(value, 0.0) for value in obj.rotation_euler),
    }


def main() -> None:
    args = script_args()
    blend_path = ROOT / "build" / "blend" / f"{args.part}.blend"
    glb_path = ROOT / "public" / "models" / "parts" / f"{args.part}.glb"
    if not blend_path.is_file() or not glb_path.is_file():
        raise FileNotFoundError(f"Missing generated input for {args.part}")

    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    meshes = [inspect_mesh(obj) for obj in bpy.data.objects if obj.type == "MESH"]
    mount_names = {obj.name for obj in bpy.data.objects if obj.type == "EMPTY"}
    required_mounts = {f"MOUNT_{args.part}_TOP", f"MOUNT_{args.part}_BOTTOM"}
    unique_materials = {
        material.name
        for obj in bpy.data.objects if obj.type == "MESH"
        for material in obj.data.materials if material is not None
    }
    triangle_count = sum(item["triangles"] for item in meshes)

    errors = []
    if not meshes:
        errors.append("MODEL_HAS_NO_MESH")
    if any(item["non_manifold_edges"] for item in meshes):
        errors.append("NON_MANIFOLD_EDGES")
    if any(item["duplicate_vertices"] for item in meshes):
        errors.append("DUPLICATE_VERTICES")
    if any(item["loose_vertices"] for item in meshes):
        errors.append("LOOSE_VERTICES")
    if any(item["zero_area_faces"] for item in meshes):
        errors.append("ZERO_AREA_FACES")
    if any(item["signed_volume_m3"] <= 0.0 for item in meshes):
        errors.append("NORMALS_OR_VOLUME_INVALID")
    if any(not item["scale_applied"] for item in meshes):
        errors.append("SCALE_NOT_APPLIED")
    if any(not item["rotation_applied"] for item in meshes):
        errors.append("ROTATION_NOT_APPLIED")
    if triangle_count > 50000:
        errors.append("TRIANGLE_LIMIT_EXCEEDED")
    if len(unique_materials) > 6:
        errors.append("MATERIAL_LIMIT_EXCEEDED")
    if not required_mounts.issubset(mount_names):
        errors.append("MOUNT_NOT_FOUND")
    if glb_path.stat().st_size <= 0:
        errors.append("GLB_EMPTY")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    imported_meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    imported_names = {obj.name for obj in bpy.data.objects}
    if not imported_meshes:
        errors.append("GLB_REIMPORT_HAS_NO_MESH")
    if not required_mounts.issubset(imported_names):
        errors.append("GLB_REIMPORT_MOUNT_NOT_FOUND")

    report = {
        "part_id": args.part,
        "result": "PASS" if not errors else "FAIL",
        "errors": errors,
        "mesh_count": len(meshes),
        "triangle_count": triangle_count,
        "material_count": len(unique_materials),
        "glb_file_size_bytes": glb_path.stat().st_size,
        "mounts_present": sorted(required_mounts.intersection(mount_names)),
        "glb_reimport_mesh_count": len(imported_meshes),
        "meshes": meshes,
    }
    report_path = ROOT / "reports" / "validation" / f"geometry-{args.part.replace('_', '-')}.json"
    write_json(report_path, report)
    print(f"NSS_GEOMETRY_VALIDATION={report['result']}")
    print(f"NSS_GEOMETRY_REPORT={report_path}")
    if errors:
        print("NSS_GEOMETRY_ERRORS=" + ",".join(errors))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
