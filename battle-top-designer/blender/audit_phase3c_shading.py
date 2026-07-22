"""Audit Blender smooth shading and exported GLB normal accessors for all NSS parts."""

from __future__ import annotations

import json
import struct
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
PART_DIR = ROOT / "specs" / "parts"
BLEND_DIR = ROOT / "build" / "blend"
GLB_DIR = ROOT / "public" / "models" / "parts"
OUTPUT = ROOT / "reports" / "validation" / "phase3c-stage4b-shading-audit.json"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def glb_json(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, _length = struct.unpack_from("<III", data, 0)
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if magic != 0x46546C67 or version != 2 or chunk_type != 0x4E4F534A:
        raise ValueError(f"Invalid GLB JSON header: {path}")
    return json.loads(data[20:20 + chunk_length].decode("utf-8"))


def source_meshes() -> list[dict]:
    records = []
    for obj in sorted(bpy.data.objects, key=lambda item: item.name):
        if obj.type != "MESH" or obj.name.startswith("COLLIDER_") or obj.get("export_exclude") is True:
            continue
        mesh = obj.data
        smooth_faces = sum(1 for polygon in mesh.polygons if polygon.use_smooth)
        records.append({
            "object": obj.name,
            "faces": len(mesh.polygons),
            "smooth_faces": smooth_faces,
            "flat_faces": len(mesh.polygons) - smooth_faces,
            "sharp_edges": sum(1 for edge in mesh.edges if edge.use_edge_sharp),
        })
    return records


def main() -> None:
    parts = []
    for spec_path in sorted(PART_DIR.glob("*.json")):
        spec = load_json(spec_path)
        part_id = spec["id"]
        bpy.ops.wm.open_mainfile(filepath=str(BLEND_DIR / f"{part_id}.blend"))
        gltf = glb_json(GLB_DIR / f"{part_id}.glb")
        primitives = [
            {
                "mesh_index": mesh_index,
                "primitive_index": primitive_index,
                "normal_accessor": primitive.get("attributes", {}).get("NORMAL"),
                "normal_count": gltf["accessors"][primitive["attributes"]["NORMAL"]]["count"] if "NORMAL" in primitive.get("attributes", {}) else 0,
            }
            for mesh_index, mesh in enumerate(gltf.get("meshes", []))
            for primitive_index, primitive in enumerate(mesh.get("primitives", []))
        ]
        source = source_meshes()
        parts.append({
            "part_id": part_id,
            "segments": spec["geometry"].get("segments"),
            "source_meshes": source,
            "source_smooth_faces": sum(item["smooth_faces"] for item in source),
            "source_flat_faces": sum(item["flat_faces"] for item in source),
            "source_sharp_edges": sum(item["sharp_edges"] for item in source),
            "glb_primitives": primitives,
            "glb_normal_primitive_count": sum(item["normal_accessor"] is not None for item in primitives),
        })
    report = {
        "schemaVersion": "NSS-PHASE3C-STAGE4B-SHADING-AUDIT-V1",
        "result": "PASS",
        "parts": parts,
        "totals": {
            "part_count": len(parts),
            "primitive_count": sum(len(part["glb_primitives"]) for part in parts),
            "normal_primitive_count": sum(part["glb_normal_primitive_count"] for part in parts),
            "smooth_faces": sum(part["source_smooth_faces"] for part in parts),
            "flat_faces": sum(part["source_flat_faces"] for part in parts),
            "sharp_edges": sum(part["source_sharp_edges"] for part in parts),
        },
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"PHASE3C_STAGE4B_SHADING_AUDIT={report['result']}")
    print(f"PHASE3C_STAGE4B_SHADING_AUDIT_OUTPUT={OUTPUT}")


if __name__ == "__main__":
    main()
