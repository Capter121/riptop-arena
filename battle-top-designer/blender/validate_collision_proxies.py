"""Validate closed collision proxies in a generated part or assembly blend."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.collision import inspect_proxy  # noqa: E402
from lib.reporting import write_json  # noqa: E402


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--part", required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def main() -> None:
    part_id = args().part
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / "build" / "blend" / f"{part_id}.blend"))
    proxies = [obj for obj in bpy.data.objects if obj.name == f"COLLIDER_{part_id}"]
    records = [inspect_proxy(obj) for obj in proxies]
    errors = []
    if len(records) != 1:
        errors.append("COLLIDER_COUNT_INVALID")
    for record in records:
        if record["non_manifold_edges"] or record["boundary_edges"]:
            errors.append("COLLIDER_NON_MANIFOLD")
        if record["zero_area_faces"]:
            errors.append("COLLIDER_ZERO_AREA_FACE")
        if record["duplicate_vertices"]:
            errors.append("COLLIDER_DUPLICATE_VERTICES")
        if not record["normals_outward"]:
            errors.append("COLLIDER_NORMALS_INVALID")
        if not record["export_exclude"]:
            errors.append("COLLIDER_EXPORT_EXCLUDE_MISSING")
        if not record["hidden_render"] or not record["hidden_viewport"]:
            errors.append("COLLIDER_NOT_HIDDEN")
    report = {"part_id": part_id, "result": "PASS" if not errors else "FAIL", "errors": errors, "colliders": records}
    path = ROOT / "reports" / "validation" / f"collider-{part_id.replace('_', '-')}.json"
    write_json(path, report)
    print(f"NSS_COLLIDER_VALIDATION={report['result']}")
    print(f"NSS_COLLIDER_REPORT={path}")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
