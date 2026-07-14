"""NSS-V1 interface geometry and mount metadata."""

from __future__ import annotations

import math

import bpy


MM = 0.001


def _create_annular_collar(part_id: str, interface: dict, collection: bpy.types.Collection, material: bpy.types.Material) -> bpy.types.Object:
    segments = interface["lug_count"] * 12
    inner_radius = interface["center_bore_mm"] * MM * 0.5
    outer_radius = (interface["mount_diameter_mm"] * 0.5 - interface["digital_clearance_mm"] * 2.0) * MM
    half_height = interface["core_height_mm"] * MM * 0.18
    vertices = []
    for index in range(segments):
        angle = math.tau * index / segments
        cos_angle, sin_angle = math.cos(angle), math.sin(angle)
        vertices.extend([
            (inner_radius * cos_angle, inner_radius * sin_angle, -half_height),
            (outer_radius * cos_angle, outer_radius * sin_angle, -half_height),
            (inner_radius * cos_angle, inner_radius * sin_angle, half_height),
            (outer_radius * cos_angle, outer_radius * sin_angle, half_height),
        ])
    faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        bi, bo, ti, to = index * 4, index * 4 + 1, index * 4 + 2, index * 4 + 3
        nbi, nbo, nti, nto = nxt * 4, nxt * 4 + 1, nxt * 4 + 2, nxt * 4 + 3
        faces.extend([(ti, to, nto, nti), (bi, nbi, nbo, bo), (bo, nbo, nto, to), (bi, ti, nti, nbi)])
    mesh = bpy.data.meshes.new(f"MESH_{part_id}_NSS_V1")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(f"GEO_{part_id}_NSS_V1_COLLAR", mesh)
    collection.objects.link(obj)
    obj["interface_id"] = interface["id"]
    obj["lug_count"] = interface["lug_count"]
    return obj


def create_mounts_and_interface(
    part_spec: dict,
    interface: dict,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects = [_create_annular_collar(part_spec["id"], interface, collection, material)]
    for role_name, mount_spec in part_spec["mounts"].items():
        name = f"MOUNT_{part_spec['id']}_{role_name.upper()}"
        mount = bpy.data.objects.new(name, None)
        mount.empty_display_type = "CIRCLE"
        mount.empty_display_size = mount_spec["datum_radius_mm"] * MM
        mount.location = tuple(value * MM for value in mount_spec["position_mm"])
        mount.rotation_euler = tuple(math.radians(value) for value in mount_spec["rotation_deg"])
        mount["mount_role"] = role_name
        mount["interface_id"] = part_spec["interface_id"]
        mount["interface_role"] = mount_spec["interface_role"]
        mount["orientation_key_deg"] = mount_spec["orientation_key_deg"]
        mount["datum_radius_mm"] = mount_spec["datum_radius_mm"]
        collection.objects.link(mount)
        objects.append(mount)
    return objects
