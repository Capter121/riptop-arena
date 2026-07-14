"""Create a deterministic semantic fingerprint for one existing GLB."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def script_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def rounded(value: float) -> float:
    result = round(float(value), 9)
    return 0.0 if result == -0.0 else result


def vector_values(values) -> list[float]:
    return [rounded(value) for value in values]


def matrix_values(matrix: Matrix) -> list[float]:
    return [rounded(value) for row in matrix for value in row]


def json_value(value):
    if isinstance(value, (str, int, bool)) or value is None:
        return value
    if isinstance(value, float):
        return rounded(value)
    if hasattr(value, "to_list"):
        return json_value(value.to_list())
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    return str(value)


def custom_properties(item) -> dict:
    return {
        key: json_value(item[key])
        for key in sorted(item.keys())
        if key != "_RNA_UI"
    }


def canonical_topology(mesh: bpy.types.Mesh) -> tuple[str, int]:
    mesh.calc_loop_triangles()
    vertices = [tuple(vector_values(vertex.co)) for vertex in mesh.vertices]
    triangles = []
    for triangle in mesh.loop_triangles:
        points = sorted(vertices[index] for index in triangle.vertices)
        triangles.append(points)
    payload = {
        "vertices": sorted(vertices),
        "triangles": sorted(triangles),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest(), len(mesh.loop_triangles)


def material_record(material: bpy.types.Material) -> dict:
    record = {
        "name": material.name,
        "diffuse_color": vector_values(material.diffuse_color),
        "use_nodes": material.use_nodes,
        "custom_properties": custom_properties(material),
    }
    if material.use_nodes and material.node_tree:
        principled = next(
            (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
            None,
        )
        if principled:
            inputs = {}
            for name in ("Base Color", "Metallic", "Roughness", "Alpha", "IOR"):
                socket = principled.inputs.get(name)
                if socket is not None:
                    inputs[name] = json_value(socket.default_value)
            record["principled_bsdf"] = inputs
    return record


def object_path(obj: bpy.types.Object) -> str:
    names = []
    current = obj
    while current is not None:
        names.append(current.name)
        current = current.parent
    return "/".join(reversed(names))


def mesh_record(obj: bpy.types.Object) -> dict:
    topology_sha256, triangle_count = canonical_topology(obj.data)
    return {
        "object": obj.name,
        "mesh": obj.data.name,
        "vertex_count": len(obj.data.vertices),
        "triangle_count": triangle_count,
        "topology_sha256": topology_sha256,
        "local_bounds_mm": [
            vector_values(Vector(corner) * 1000.0)
            for corner in obj.bound_box
        ],
        "material_slots": [slot.material.name if slot.material else None for slot in obj.material_slots],
    }


def scene_dimensions_mm(mesh_objects: list[bpy.types.Object]) -> list[float]:
    points = [obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
    minimum = Vector(min(point[index] for point in points) for index in range(3))
    maximum = Vector(max(point[index] for point in points) for index in range(3))
    return vector_values((maximum - minimum) * 1000.0)


def main() -> None:
    args = script_args()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path))

    objects = sorted(bpy.data.objects, key=object_path)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh objects found in {input_path}")

    object_records = []
    mount_records = []
    for obj in objects:
        record = {
            "path": object_path(obj),
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "local_matrix": matrix_values(obj.matrix_local),
            "world_matrix": matrix_values(obj.matrix_world),
            "custom_properties": custom_properties(obj),
        }
        if obj.type == "MESH":
            record["mesh_record"] = mesh_record(obj)
        object_records.append(record)
        if obj.name.startswith("MOUNT_"):
            mount_records.append(record)

    materials = [material_record(material) for material in sorted(bpy.data.materials, key=lambda item: item.name)]
    interface_info = sorted(
        {
            (key, json.dumps(value, sort_keys=True))
            for obj in objects
            for key, value in custom_properties(obj).items()
            if key.startswith("interface_") or key in {"orientation_key_deg", "mount_role", "datum_radius_mm", "lug_count"}
        }
    )
    canonical = {
        "schema_version": 1,
        "dimensions_mm": scene_dimensions_mm(meshes),
        "objects": object_records,
        "mounts": mount_records,
        "materials": materials,
        "interface_information": [{"key": key, "value": json.loads(value)} for key, value in interface_info],
    }
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
    result = {
        "input": input_path.name,
        "semantic_fingerprint": hashlib.sha256(encoded).hexdigest(),
        "canonical": canonical,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"SEMANTIC_FINGERPRINT={result['semantic_fingerprint']}")
    print(f"SEMANTIC_FINGERPRINT_OUTPUT={output_path}")


if __name__ == "__main__":
    main()
