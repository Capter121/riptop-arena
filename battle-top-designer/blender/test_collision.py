"""Exercise AABB, BVH, and voxel collision result paths."""

from __future__ import annotations

import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.collision import staged_overlap  # noqa: E402
from lib.reporting import write_json  # noqa: E402


def cube(name: str, location_mm: tuple[float, float, float]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=0.001, location=tuple(value * 0.001 for value in location_mm))
    obj = bpy.context.object
    obj.name = name
    return obj


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    origin = cube("TEST_ORIGIN", (0.0, 0.0, 0.0))
    separated = cube("TEST_SEPARATED", (2.0, 0.0, 0.0))
    slight = cube("TEST_SLIGHT", (0.9, 0.0, 0.0))
    overlap = cube("TEST_OVERLAP", (0.25, 0.0, 0.0))
    slight.rotation_euler.z = 0.17
    overlap.rotation_euler.z = 0.31
    bpy.context.view_layer.update()
    cases = {
        "aabb_separated": staged_overlap(origin, separated, 0.5),
        "contact_review": staged_overlap(origin, slight, 0.5),
        "volume_fail": staged_overlap(origin, overlap, 0.5),
    }
    expected = {"aabb_separated": "PASS", "contact_review": "CONTACT_REVIEW", "volume_fail": "FAIL"}
    errors = [name for name, result in cases.items() if result["result"] != expected[name]]
    report = {"result": "PASS" if not errors else "FAIL", "errors": errors, "cases": cases}
    path = ROOT / "reports" / "validation" / "collision-self-test.json"
    write_json(path, report)
    print(f"NSS_COLLISION_SELF_TEST={report['result']}")
    print(f"NSS_COLLISION_SELF_TEST_REPORT={path}")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
