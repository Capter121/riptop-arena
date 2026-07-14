"""JSON-driven mesh construction for Nova Spin System parts."""

from __future__ import annotations

import math

import bpy


MM = 0.001


def _smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def _blade_profile(local_phase: float, peak_phase: float) -> float:
    before_peak = local_phase / peak_phase
    after_peak = (1.0 - local_phase) / (1.0 - peak_phase)
    return _smoothstep(before_peak if local_phase <= peak_phase else after_peak)


def create_radial_blade(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    count = geometry["blade_count"]
    segments = geometry["segments"]
    inner_radius = geometry.get("inner_radius_mm", spec["dimensions"].get("inner_radius_mm", 0.0)) * MM
    base_radius = geometry["base_radius_mm"] * MM
    outer_radius = geometry["outer_radius_mm"] * MM
    half_height = geometry["height_mm"] * MM * 0.5
    upper_rise = geometry.get("upper_rise_mm", 0.0) * MM
    phase = math.radians(geometry.get("phase_deg", 0.0))
    peak_phase = max(0.2, min(0.8, 0.5 - geometry.get("blade_angle_deg", 0.0) / 180.0))

    vertices: list[tuple[float, float, float]] = []
    profiles: list[float] = []
    for index in range(segments):
        angle = math.tau * index / segments + phase
        local_phase = ((angle - phase) / math.tau * count) % 1.0
        profile = _blade_profile(local_phase, peak_phase)
        profiles.append(profile)
        radius = base_radius + (outer_radius - base_radius) * profile
        vertices.extend([
            (inner_radius * math.cos(angle), inner_radius * math.sin(angle), -half_height),
            (radius * math.cos(angle), radius * math.sin(angle), -half_height),
            (inner_radius * math.cos(angle), inner_radius * math.sin(angle), half_height),
            (radius * math.cos(angle), radius * math.sin(angle), half_height + upper_rise * profile),
        ])

    faces: list[tuple[int, int, int, int]] = []
    material_indices: list[int] = []
    for index in range(segments):
        next_index = (index + 1) % segments
        bi, bo, ti, to = index * 4, index * 4 + 1, index * 4 + 2, index * 4 + 3
        nbi, nbo, nti, nto = next_index * 4, next_index * 4 + 1, next_index * 4 + 2, next_index * 4 + 3
        faces.extend([
            (ti, to, nto, nti),
            (bi, nbi, nbo, bo),
            (bo, nbo, nto, to),
            (bi, ti, nti, nbi),
        ])
        material_indices.extend([1 if len(materials) > 1 else 0, 0, 0, 2 if len(materials) > 2 else 0])

    mesh = bpy.data.meshes.new(f"GEO_{spec['id']}_BODY")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.clear()
    for material in materials:
        mesh.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.material_index = material_index
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)

    obj = bpy.data.objects.new(f"GEO_{spec['id']}_BODY", mesh)
    collection.objects.link(obj)
    obj["part_id"] = spec["id"]
    obj["geometry_kind"] = geometry["kind"]
    return [obj]


def create_profiled_annulus(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    segments = geometry["segments"]
    inner_radius = geometry.get("inner_radius_mm", spec["dimensions"].get("inner_radius_mm", 0.0)) * MM
    outer_radius = geometry["outer_radius_mm"] * MM
    half_height = geometry["height_mm"] * MM * 0.5
    phase = math.radians(geometry.get("phase_deg", 0.0))
    if geometry["kind"] == "radial_gear":
        feature_count = geometry["tooth_count"]
        depth_ratio = 0.1
    else:
        feature_count = geometry.get("node_count", geometry.get("spoke_count", 1))
        depth_ratio = 0.025 + (1.0 - geometry.get("roundness", 0.5)) * 0.075

    vertices = []
    for index in range(segments):
        angle = math.tau * index / segments + phase
        modulation = 0.5 + 0.5 * math.cos(feature_count * (angle - phase))
        radius = outer_radius * (1.0 - depth_ratio * (1.0 - modulation))
        vertices.extend([
            (inner_radius * math.cos(angle), inner_radius * math.sin(angle), -half_height),
            (radius * math.cos(angle), radius * math.sin(angle), -half_height),
            (inner_radius * math.cos(angle), inner_radius * math.sin(angle), half_height),
            (radius * math.cos(angle), radius * math.sin(angle), half_height),
        ])

    faces = []
    material_indices = []
    for index in range(segments):
        nxt = (index + 1) % segments
        bi, bo, ti, to = index * 4, index * 4 + 1, index * 4 + 2, index * 4 + 3
        nbi, nbo, nti, nto = nxt * 4, nxt * 4 + 1, nxt * 4 + 2, nxt * 4 + 3
        faces.extend([(ti, to, nto, nti), (bi, nbi, nbo, bo), (bo, nbo, nto, to), (bi, ti, nti, nbi)])
        material_indices.extend([1 if len(materials) > 1 else 0, 0, 0, 0])

    mesh = bpy.data.meshes.new(f"GEO_{spec['id']}_BODY")
    mesh.from_pydata(vertices, [], faces)
    for material in materials:
        mesh.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.material_index = material_index
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(f"GEO_{spec['id']}_BODY", mesh)
    collection.objects.link(obj)
    obj["part_id"] = spec["id"]
    obj["geometry_kind"] = geometry["kind"]
    return [obj]


def create_revolved_tip(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    segments = geometry["segments"]
    profile = [(radius * MM, z * MM) for radius, z in geometry["profile_points_mm"]]
    vertices = []
    for radius, z in profile:
        for index in range(segments):
            angle = math.tau * index / segments
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    bottom_center = len(vertices)
    vertices.append((0.0, 0.0, profile[0][1]))
    top_center = len(vertices)
    vertices.append((0.0, 0.0, profile[-1][1]))

    faces = []
    for ring in range(len(profile) - 1):
        lower = ring * segments
        upper = (ring + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((lower + index, lower + nxt, upper + nxt, upper + index))
    top_ring = (len(profile) - 1) * segments
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((bottom_center, nxt, index))
        faces.append((top_center, top_ring + index, top_ring + nxt))

    mesh = bpy.data.meshes.new(f"GEO_{spec['id']}_BODY")
    mesh.from_pydata(vertices, [], faces)
    for material in materials:
        mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.material_index = 1 if len(materials) > 1 and polygon.index >= (len(profile) - 1) * segments else 0
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(f"GEO_{spec['id']}_BODY", mesh)
    collection.objects.link(obj)
    obj["part_id"] = spec["id"]
    obj["geometry_kind"] = geometry["kind"]
    return [obj]


def create_part(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    kind = spec["geometry"]["kind"]
    if kind == "radial_blade":
        return create_radial_blade(spec, collection, materials)
    if kind in {"radial_core", "annular_ring", "radial_gear"}:
        return create_profiled_annulus(spec, collection, materials)
    if kind == "revolved_tip":
        return create_revolved_tip(spec, collection, materials)
    raise ValueError(f"Unsupported geometry kind: {kind}")
