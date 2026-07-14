"""Closed collision proxies and staged overlap tests for NSS parts."""

from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


MM = 0.001


def create_proxy(part_spec: dict, interface: dict, collection: bpy.types.Collection, render_objects: list[bpy.types.Object]) -> bpy.types.Object:
    mesh_objects = [obj for obj in render_objects if obj.type == "MESH"]
    points = [Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
    clearance = interface["digital_clearance_mm"] * MM
    outer_radius = max(math.hypot(point.x, point.y) for point in points) - clearance
    inner_radius = interface["center_bore_mm"] * MM * 0.5 + clearance
    bottom = min(point.z for point in points) + clearance
    top = max(point.z for point in points) - clearance
    segments = max(24, interface["lug_count"] * 8)

    vertices = []
    for index in range(segments):
        angle = math.tau * index / segments
        c, s = math.cos(angle), math.sin(angle)
        vertices.extend([
            (inner_radius * c, inner_radius * s, bottom),
            (outer_radius * c, outer_radius * s, bottom),
            (inner_radius * c, inner_radius * s, top),
            (outer_radius * c, outer_radius * s, top),
        ])
    faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        bi, bo, ti, to = index * 4, index * 4 + 1, index * 4 + 2, index * 4 + 3
        nbi, nbo, nti, nto = nxt * 4, nxt * 4 + 1, nxt * 4 + 2, nxt * 4 + 3
        faces.extend([(ti, to, nto, nti), (bi, nbi, nbo, bo), (bo, nbo, nto, to), (bi, ti, nti, nbi)])

    name = f"COLLIDER_{part_spec['id']}"
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.hide_render = True
    obj.hide_set(True)
    obj["export_exclude"] = True
    obj["part_id"] = part_spec["id"]
    obj["interface_id"] = part_spec["interface_id"]
    obj["interface_exclusion_radius_mm"] = inner_radius / MM
    obj["proxy_clearance_mm"] = interface["digital_clearance_mm"]
    return obj


def inspect_proxy(obj: bpy.types.Object) -> dict:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    coordinates = [tuple(round(value, 9) for value in vertex.co) for vertex in obj.data.vertices]
    result = {
        "object": obj.name,
        "vertices": len(bm.verts),
        "triangles": sum(max(0, len(face.verts) - 2) for face in bm.faces),
        "non_manifold_edges": sum(1 for edge in bm.edges if not edge.is_manifold),
        "boundary_edges": sum(1 for edge in bm.edges if edge.is_boundary),
        "zero_area_faces": sum(1 for face in bm.faces if face.calc_area() <= 1e-12),
        "duplicate_vertices": len(coordinates) - len(set(coordinates)),
        "signed_volume_m3": bm.calc_volume(signed=True),
        "normals_outward": bm.calc_volume(signed=True) > 0.0,
        "export_exclude": obj.get("export_exclude") is True,
        "hidden_render": obj.hide_render,
        "hidden_viewport": obj.hide_get(),
    }
    bm.free()
    return result


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
    )


def aabb_overlap(first: bpy.types.Object, second: bpy.types.Object) -> tuple[Vector, Vector] | None:
    first_min, first_max = world_bounds(first)
    second_min, second_max = world_bounds(second)
    minimum = Vector(tuple(max(first_min[axis], second_min[axis]) for axis in range(3)))
    maximum = Vector(tuple(min(first_max[axis], second_max[axis]) for axis in range(3)))
    return (minimum, maximum) if all(maximum[axis] > minimum[axis] for axis in range(3)) else None


def world_bvh(obj: bpy.types.Object) -> BVHTree:
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    polygons = [tuple(polygon.vertices) for polygon in obj.data.polygons]
    return BVHTree.FromPolygons(vertices, polygons, all_triangles=False)


def point_inside(bvh: BVHTree, point: Vector) -> bool:
    direction = Vector((1.0, 0.173, 0.071)).normalized()
    origin = point.copy()
    intersections = 0
    for _ in range(128):
        location, _normal, _index, _distance = bvh.ray_cast(origin, direction)
        if location is None:
            break
        intersections += 1
        origin = location + direction * 1e-7
    return intersections % 2 == 1


def staged_overlap(first: bpy.types.Object, second: bpy.types.Object, threshold_mm3: float) -> dict:
    overlap = aabb_overlap(first, second)
    if overlap is None:
        return {"result": "PASS", "stage": "AABB", "overlap_volume_mm3": 0.0}
    first_bvh, second_bvh = world_bvh(first), world_bvh(second)
    triangle_pairs = first_bvh.overlap(second_bvh)
    if not triangle_pairs:
        return {"result": "PASS", "stage": "BVH", "overlap_volume_mm3": 0.0}
    voxel_size_mm = 0.5
    voxel_size = voxel_size_mm * MM
    counts = [max(1, math.ceil((overlap[1][axis] - overlap[0][axis]) / voxel_size)) for axis in range(3)]
    occupied = 0
    sample_count = math.prod(counts)
    for x_index in range(counts[0]):
        for y_index in range(counts[1]):
            for z_index in range(counts[2]):
                point = Vector((
                    overlap[0].x + (x_index + 0.5) * voxel_size,
                    overlap[0].y + (y_index + 0.5) * voxel_size,
                    overlap[0].z + (z_index + 0.5) * voxel_size,
                ))
                if point_inside(first_bvh, point) and point_inside(second_bvh, point):
                    occupied += 1
    estimated_volume = occupied * voxel_size_mm ** 3
    center = (overlap[0] + overlap[1]) * 0.5 / MM
    return {
        "result": "CONTACT_REVIEW" if estimated_volume <= threshold_mm3 else "FAIL",
        "stage": "VOXEL_ESTIMATE",
        "overlap_volume_mm3": estimated_volume,
        "overlap_center_mm": list(center),
        "overlap_aabb_mm": [list(overlap[0] / MM), list(overlap[1] / MM)],
        "triangle_pair_count": len(triangle_pairs),
        "voxel_size_mm": voxel_size_mm,
        "sample_count": sample_count,
        "occupied_voxel_count": occupied,
    }
