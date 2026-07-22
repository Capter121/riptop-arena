"""Deterministically rewrite only GLB NORMAL bytes while preserving all geometry bytes."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from collections import defaultdict
from pathlib import Path


MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
FLOAT = 5126
TRIANGLES = 4


class UnsafeNormalLayout(ValueError):
    """Raised when an accessor cannot be safely rewritten in place."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_glb(data: bytes) -> tuple[dict, bytes, tuple[int, int], tuple[int, int]]:
    if len(data) < 20 or struct.unpack_from("<II", data, 0) != (MAGIC, 2):
        raise UnsafeNormalLayout("invalid GLB header")
    if struct.unpack_from("<I", data, 8)[0] != len(data):
        raise UnsafeNormalLayout("GLB length field mismatch")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    json_start = 20
    json_end = json_start + json_length
    if json_type != JSON_CHUNK or json_end + 8 > len(data):
        raise UnsafeNormalLayout("missing JSON chunk")
    bin_length, bin_type = struct.unpack_from("<II", data, json_end)
    bin_start = json_end + 8
    bin_end = bin_start + bin_length
    if bin_type != BIN_CHUNK or bin_end != len(data):
        raise UnsafeNormalLayout("missing or non-terminal BIN chunk")
    return json.loads(data[json_start:json_end].decode("utf-8")), data[bin_start:bin_end], (json_start, json_end), (bin_start, bin_end)


def accessor_layout(gltf: dict, accessor_index: int, bin_length: int) -> dict:
    try:
        accessor = gltf["accessors"][accessor_index]
        view = gltf["bufferViews"][accessor["bufferView"]]
    except (KeyError, IndexError) as error:
        raise UnsafeNormalLayout(f"accessor {accessor_index} has no valid bufferView") from error
    if accessor.get("sparse") is not None:
        raise UnsafeNormalLayout(f"accessor {accessor_index} is sparse")
    if accessor.get("componentType") != FLOAT or accessor.get("type") != "VEC3" or accessor.get("normalized", False):
        raise UnsafeNormalLayout(f"accessor {accessor_index} is not an unpacked FLOAT VEC3")
    count = accessor.get("count")
    if not isinstance(count, int) or count < 0:
        raise UnsafeNormalLayout(f"accessor {accessor_index} has invalid count")
    stride = view.get("byteStride", 12)
    if not isinstance(stride, int) or stride < 12:
        raise UnsafeNormalLayout(f"accessor {accessor_index} has unsupported byteStride")
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    end = start + (count - 1) * stride + 12 if count else start
    if start < 0 or end > bin_length:
        raise UnsafeNormalLayout(f"accessor {accessor_index} range is out of bounds")
    return {"count": count, "stride": stride, "start": start, "end": end, "ranges": [(start + item * stride, start + item * stride + 12) for item in range(count)]}


def index_layout(gltf: dict, accessor_index: int, bin_length: int) -> dict:
    try:
        accessor = gltf["accessors"][accessor_index]
        view = gltf["bufferViews"][accessor["bufferView"]]
    except (KeyError, IndexError) as error:
        raise UnsafeNormalLayout(f"index accessor {accessor_index} has no valid bufferView") from error
    if accessor.get("sparse") is not None or accessor.get("type") != "SCALAR" or accessor.get("normalized", False):
        raise UnsafeNormalLayout(f"index accessor {accessor_index} is unsupported")
    formats = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4)}
    if accessor.get("componentType") not in formats:
        raise UnsafeNormalLayout(f"index accessor {accessor_index} has unsupported component type")
    fmt, width = formats[accessor["componentType"]]
    count = accessor.get("count")
    stride = view.get("byteStride", width)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    end = start + (count - 1) * stride + width if count else start
    if not isinstance(count, int) or stride < width or start < 0 or end > bin_length:
        raise UnsafeNormalLayout(f"index accessor {accessor_index} range is invalid")
    return {"count": count, "stride": stride, "start": start, "format": fmt, "ranges": [(start + item * stride, start + item * stride + width) for item in range(count)]}


def read_vec3(bin_data: bytes, layout: dict) -> list[tuple[float, float, float]]:
    return [struct.unpack_from("<fff", bin_data, layout["start"] + item * layout["stride"]) for item in range(layout["count"])]


def read_position_keys(bin_data: bytes, layout: dict) -> list[bytes]:
    return [bin_data[layout["start"] + item * layout["stride"]:layout["start"] + item * layout["stride"] + 12] for item in range(layout["count"])]


def read_indices(bin_data: bytes, layout: dict) -> list[int]:
    return [struct.unpack_from("<" + layout["format"], bin_data, layout["start"] + item * layout["stride"])[0] for item in range(layout["count"])]


def subtract(left: tuple[float, float, float], right: tuple[float, float, float]) -> tuple[float, float, float]:
    return left[0] - right[0], left[1] - right[1], left[2] - right[2]


def cross(left: tuple[float, float, float], right: tuple[float, float, float]) -> tuple[float, float, float]:
    return left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]


def length(value: tuple[float, float, float]) -> float:
    return math.sqrt(sum(component * component for component in value))


def normalise(value: tuple[float, float, float]) -> tuple[float, float, float]:
    value_length = length(value)
    if value_length <= 1e-20:
        raise UnsafeNormalLayout("degenerate triangle prevents normal reconstruction")
    return value[0] / value_length, value[1] / value_length, value[2] / value_length


class UnionFind:
    def __init__(self, count: int) -> None:
        self.parent = list(range(count))

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        left, right = self.find(left), self.find(right)
        if left != right:
            self.parent[max(left, right)] = min(left, right)


def primitive_normals(bin_data: bytes, position_layout: dict, normal_layout: dict, indices_layout: dict, crease_degrees: float) -> tuple[dict[int, tuple[float, float, float]], dict]:
    if position_layout["count"] != normal_layout["count"]:
        raise UnsafeNormalLayout("NORMAL count does not match POSITION count")
    indices = read_indices(bin_data, indices_layout)
    if len(indices) % 3:
        raise UnsafeNormalLayout("triangle index count is not divisible by three")
    positions = read_vec3(bin_data, position_layout)
    position_keys = read_position_keys(bin_data, position_layout)
    triangles = []
    edge_faces: dict[tuple[bytes, bytes], list[int]] = defaultdict(list)
    vertex_faces: dict[int, list[int]] = defaultdict(list)
    for offset in range(0, len(indices), 3):
        vertices = tuple(indices[offset:offset + 3])
        if any(index >= len(positions) for index in vertices):
            raise UnsafeNormalLayout("index references a missing POSITION")
        first, second, third = (positions[index] for index in vertices)
        face_normal = cross(subtract(second, first), subtract(third, first))
        is_degenerate = length(face_normal) <= 1e-20
        triangles.append({"vertices": vertices, "normal": face_normal, "unit": None if is_degenerate else normalise(face_normal), "degenerate": is_degenerate})
        triangle_index = len(triangles) - 1
        if not is_degenerate:
            for vertex in vertices:
                vertex_faces[vertex].append(triangle_index)
            for left, right in ((0, 1), (1, 2), (2, 0)):
                key = tuple(sorted((position_keys[vertices[left]], position_keys[vertices[right]])))
                edge_faces[key].append(triangle_index)
    components = UnionFind(len(triangles))
    cosine_limit = math.cos(math.radians(crease_degrees))
    hard_edges = 0
    for faces in edge_faces.values():
        connected = False
        for left_index, left_face in enumerate(faces):
            for right_face in faces[left_index + 1:]:
                left, right = triangles[left_face]["unit"], triangles[right_face]["unit"]
                if sum(a * b for a, b in zip(left, right)) >= cosine_limit:
                    components.union(left_face, right_face)
                    connected = True
        if not connected:
            hard_edges += 1
    cluster_normals: dict[int, tuple[float, float, float]] = {}
    for index, triangle in enumerate(triangles):
        if triangle["degenerate"]:
            continue
        root = components.find(index)
        previous = cluster_normals.get(root, (0.0, 0.0, 0.0))
        face_normal = triangle["normal"]
        cluster_normals[root] = tuple(previous[item] + face_normal[item] for item in range(3))
    cancelled_clusters = 0
    for root, value in list(cluster_normals.items()):
        if length(value) <= 1e-20:
            cancelled_clusters += 1
            del cluster_normals[root]
        else:
            cluster_normals[root] = normalise(value)
    normals = {}
    ambiguous_vertices = 0
    for vertex, faces in vertex_faces.items():
        roots = {components.find(face) for face in faces}
        if len(roots) != 1 or not roots <= set(cluster_normals):
            ambiguous_vertices += 1
            continue
        normals[vertex] = cluster_normals[roots.pop()]
    return normals, {"hard_edge_cluster_count": hard_edges, "ambiguous_vertex_count": ambiguous_vertices, "cancelled_cluster_count": cancelled_clusters, "triangle_count": len(triangles), "degenerate_triangle_count": sum(item["degenerate"] for item in triangles)}


def normal_ranges(gltf: dict, bin_length: int) -> list[tuple[int, int]]:
    ranges = []
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            normal = primitive.get("attributes", {}).get("NORMAL")
            if normal is not None:
                ranges.extend(accessor_layout(gltf, normal, bin_length)["ranges"])
    return ranges


def accessor_bytes(bin_data: bytes, layout: dict, width: int) -> bytes:
    return b"".join(bin_data[layout["start"] + item * layout["stride"]:layout["start"] + item * layout["stride"] + width] for item in range(layout["count"]))


def immutable_fingerprints(gltf: dict, bin_data: bytes) -> dict:
    positions, indices = [], []
    for mesh_index, mesh in enumerate(gltf.get("meshes", [])):
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            attributes = primitive.get("attributes", {})
            positions.append({"primitive": [mesh_index, primitive_index], "sha256": sha256(accessor_bytes(bin_data, accessor_layout(gltf, attributes["POSITION"], len(bin_data)), 12))})
            indices.append({"primitive": [mesh_index, primitive_index], "sha256": sha256(accessor_bytes(bin_data, index_layout(gltf, primitive["indices"], len(bin_data)), {"B": 1, "H": 2, "I": 4}[index_layout(gltf, primitive["indices"], len(bin_data))["format"]]))})
    return {"position_accessor_sha256": positions, "index_accessor_sha256": indices}


def normal_quality(gltf: dict, bin_data: bytes) -> dict:
    lengths = []
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            layout = accessor_layout(gltf, primitive["attributes"]["NORMAL"], len(bin_data))
            lengths.extend(length(value) for value in read_vec3(bin_data, layout))
    if not lengths or any(not math.isfinite(value) or value <= 1e-8 for value in lengths):
        raise UnsafeNormalLayout("rewritten normals are non-finite or zero length")
    return {"min_normal_length": min(lengths), "max_normal_length": max(lengths), "mean_normal_length": sum(lengths) / len(lengths)}


def rewrite_bytes(source: bytes, crease_degrees: float = 30.0) -> tuple[bytes, dict]:
    gltf, bin_data, json_range, bin_range = parse_glb(source)
    result = bytearray(source)
    summaries = []
    for mesh_index, mesh in enumerate(gltf.get("meshes", [])):
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            attributes = primitive.get("attributes", {})
            if primitive.get("mode", TRIANGLES) != TRIANGLES or "POSITION" not in attributes or "NORMAL" not in attributes or "indices" not in primitive:
                raise UnsafeNormalLayout(f"primitive {mesh_index}:{primitive_index} is not indexed triangles with POSITION and NORMAL")
            position_layout = accessor_layout(gltf, attributes["POSITION"], len(bin_data))
            normal_layout = accessor_layout(gltf, attributes["NORMAL"], len(bin_data))
            indices_layout = index_layout(gltf, primitive["indices"], len(bin_data))
            normals, quality = primitive_normals(bin_data, position_layout, normal_layout, indices_layout, crease_degrees)
            for vertex, normal in normals.items():
                struct.pack_into("<fff", result, bin_range[0] + normal_layout["start"] + vertex * normal_layout["stride"], *normal)
            summaries.append({
                "mesh_index": mesh_index, "primitive_index": primitive_index, "normal_accessor": attributes["NORMAL"],
                "normal_byte_range": {"start": normal_layout["start"], "end": normal_layout["end"], "byte_stride": normal_layout["stride"], "count": normal_layout["count"]}, "changed_normal_count": len(normals), **quality,
            })
    output = bytes(result)
    changed = [index for index, (before, after) in enumerate(zip(source, output)) if before != after]
    allowed = normal_ranges(gltf, len(bin_data))
    allowed_bytes = {bin_range[0] + offset for start, end in allowed for offset in range(start, end)}
    if any(index not in allowed_bytes for index in changed):
        raise UnsafeNormalLayout("rewrite changed bytes outside NORMAL accessor ranges")
    return output, {"json_sha256": sha256(source[json_range[0]:json_range[1]]), "normal_primitives": summaries, "changed_byte_count": len(changed), "all_changed_bytes_subset_of_normal_ranges": True}


def rewrite_file(input_path: Path, output_path: Path, crease_degrees: float = 30.0) -> dict:
    source = input_path.read_bytes()
    output, report = rewrite_bytes(source, crease_degrees)
    output_path.write_bytes(output)
    input_gltf, input_bin, input_json_range, _input_bin_range = parse_glb(source)
    output_gltf, output_bin, output_json_range, _output_bin_range = parse_glb(output)
    repeat, _repeat_report = rewrite_bytes(source, crease_degrees)
    report.update({
        "input": str(input_path), "output": str(output_path), "input_sha256": sha256(source), "output_sha256": sha256(output),
        "file_length_identical": len(source) == len(output),
        "json_chunk_byte_identical": source[input_json_range[0]:input_json_range[1]] == output[output_json_range[0]:output_json_range[1]],
        "position_accessors_identical": immutable_fingerprints(input_gltf, input_bin) == immutable_fingerprints(output_gltf, output_bin),
        "index_accessors_identical": immutable_fingerprints(input_gltf, input_bin) == immutable_fingerprints(output_gltf, output_bin),
        "determinism_sha256": sha256(repeat),
        "deterministic": output == repeat,
        "normal_quality": normal_quality(output_gltf, output_bin),
    })
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--crease-angle-deg", type=float, default=30.0)
    args = parser.parse_args()
    report = rewrite_file(args.input, args.output, args.crease_angle_deg)
    report["crease_angle_degrees"] = args.crease_angle_deg
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"NORMAL_BUFFER_REWRITE=PASS output={args.output}")


if __name__ == "__main__":
    main()
