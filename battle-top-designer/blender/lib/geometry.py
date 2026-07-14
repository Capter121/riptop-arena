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


def create_iron_bastion(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    segments = geometry["segments"]
    phase = math.radians(geometry.get("phase_deg", 0.0))
    inner_radius = geometry.get("inner_radius_mm", spec["dimensions"]["inner_radius_mm"]) * MM
    weight_radius = geometry["inner_weight_radius_mm"] * MM
    base_radius = geometry["base_radius_mm"] * MM
    outer_radius = geometry["outer_radius_mm"] * MM
    amplitude = geometry["radial_amplitude_mm"] * MM
    bottom = -geometry["height_mm"] * MM * 0.5
    outer_top = geometry["height_mm"] * MM * 0.5
    inner_top = outer_top + geometry["inner_band_width_mm"] * MM * 0.1
    rings = (inner_radius, weight_radius, base_radius)

    vertices = []
    for index in range(segments):
        angle = math.tau * index / segments + phase
        damper = 0.5 + 0.5 * math.cos(geometry["damper_count"] * (angle - phase))
        radii = rings + (outer_radius - amplitude * (1.0 - damper),)
        tops = (inner_top, inner_top, outer_top + 0.15 * MM, outer_top)
        for radius, top in zip(radii, tops):
            vertices.extend([
                (radius * math.cos(angle), radius * math.sin(angle), bottom),
                (radius * math.cos(angle), radius * math.sin(angle), top),
            ])

    faces = []
    material_indices = []
    ring_count = 4
    for index in range(segments):
        nxt = (index + 1) % segments
        for ring in range(ring_count - 1):
            lower = index * ring_count * 2 + ring * 2
            upper = lower + 2
            next_lower = nxt * ring_count * 2 + ring * 2
            next_upper = next_lower + 2
            faces.extend([
                (lower + 1, upper + 1, next_upper + 1, next_lower + 1),
                (lower, next_lower, next_upper, upper),
            ])
            material_indices.extend([1 if ring == 0 and len(materials) > 1 else 0, 0])
        inner = index * ring_count * 2
        next_inner = nxt * ring_count * 2
        outer = inner + (ring_count - 1) * 2
        next_outer = next_inner + (ring_count - 1) * 2
        faces.extend([
            (inner, inner + 1, next_inner + 1, next_inner),
            (outer, next_outer, next_outer + 1, outer + 1),
        ])
        material_indices.extend([2 if len(materials) > 2 else 0, 0])

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
    obj["profile_family"] = spec["profile_family"]
    return [obj]


def _closed_sector(
    name: str,
    inner_radius: float,
    outer_radius: float,
    bottom: float,
    top: float,
    start_angle: float,
    end_angle: float,
    steps: int,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices = []
    for index in range(steps + 1):
        phase = index / steps
        angle = start_angle + (end_angle - start_angle) * phase
        streamlined_outer = outer_radius - math.sin(math.pi * phase) * 0.2 * MM
        vertices.extend([
            (inner_radius * math.cos(angle), inner_radius * math.sin(angle), bottom),
            (streamlined_outer * math.cos(angle), streamlined_outer * math.sin(angle), bottom),
            (inner_radius * math.cos(angle), inner_radius * math.sin(angle), top),
            (streamlined_outer * math.cos(angle), streamlined_outer * math.sin(angle), top),
        ])
    faces = []
    for index in range(steps):
        bi, bo, ti, to = index * 4, index * 4 + 1, index * 4 + 2, index * 4 + 3
        nbi, nbo, nti, nto = bi + 4, bo + 4, ti + 4, to + 4
        faces.extend([(ti, to, nto, nti), (bi, nbi, nbo, bo), (bo, nbo, nto, to), (bi, ti, nti, nbi)])
    last = steps * 4
    faces.extend([(0, 1, 3, 2), (last, last + 2, last + 3, last + 1)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def _closed_annulus(
    name: str,
    inner_radius: float,
    outer_radius: float,
    bottom: float,
    top: float,
    segments: int,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices = []
    for index in range(segments):
        angle = math.tau * index / segments
        vertices.extend([
            (inner_radius * math.cos(angle), inner_radius * math.sin(angle), bottom),
            (outer_radius * math.cos(angle), outer_radius * math.sin(angle), bottom),
            (inner_radius * math.cos(angle), inner_radius * math.sin(angle), top),
            (outer_radius * math.cos(angle), outer_radius * math.sin(angle), top),
        ])
    faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        bi, bo, ti, to = index * 4, index * 4 + 1, index * 4 + 2, index * 4 + 3
        nbi, nbo, nti, nto = nxt * 4, nxt * 4 + 1, nxt * 4 + 2, nxt * 4 + 3
        faces.extend([(ti, to, nto, nti), (bi, nbi, nbo, bo), (bo, nbo, nto, to), (bi, ti, nti, nbi)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def create_void_falcon(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    arc_count = geometry["arc_count"]
    if arc_count % 2:
        raise ValueError("void_falcon_split_arc requires an even arc_count")
    group_count = arc_count // 2
    inner_radius = geometry["inner_radius_mm"] * MM
    outer_radius = geometry["outer_radius_mm"] * MM
    short_radius = outer_radius - geometry["arc_width_mm"] * MM
    hub_radius = inner_radius + geometry["arc_width_mm"] * MM * 0.5
    bottom = -geometry["height_mm"] * MM * 0.5
    top = geometry["height_mm"] * MM * 0.5
    half_span = math.radians(geometry["arc_span_deg"]) * 0.5
    phase_offset = math.radians(geometry["phase_offset_deg"])
    steps = max(4, geometry["segments"] // arc_count)
    objects = [_closed_annulus(
        f"GEO_{spec['id']}_HUB", inner_radius, hub_radius, bottom, top,
        geometry["segments"], collection, materials[1 if len(materials) > 1 else 0],
    )]
    for index in range(group_count):
        base = math.tau * index / group_count
        objects.append(_closed_sector(
            f"GEO_{spec['id']}_INNER_ARC_{index + 1}", hub_radius, short_radius, bottom, top,
            base - half_span, base + half_span, steps, collection, materials[1 if len(materials) > 1 else 0],
        ))
        outer_center = base + phase_offset
        objects.append(_closed_sector(
            f"GEO_{spec['id']}_OUTER_ARC_{index + 1}", hub_radius, outer_radius, bottom, top,
            outer_center - half_span, outer_center + half_span, steps, collection, materials[0],
        ))
    for obj in objects:
        obj["part_id"] = spec["id"]
        obj["geometry_kind"] = geometry["kind"]
        obj["profile_family"] = spec["profile_family"]
    return objects


def create_guard_assist(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    segments = geometry["segments"]
    inner_radius = geometry["inner_radius_mm"] * MM
    bearing_radius = geometry["inner_bearing_radius_mm"] * MM
    outer_radius = geometry["outer_radius_mm"] * MM
    amplitude = geometry["shoulder_amplitude_mm"] * MM
    half_height = geometry["height_mm"] * MM * 0.5
    vertices = []
    for index in range(segments):
        angle = math.tau * index / segments
        shoulder = 0.5 - 0.5 * math.cos(geometry["shoulder_count"] * angle)
        cushioned_radius = outer_radius - amplitude * shoulder
        for radius in (inner_radius, bearing_radius, cushioned_radius):
            vertices.extend([
                (radius * math.cos(angle), radius * math.sin(angle), -half_height),
                (radius * math.cos(angle), radius * math.sin(angle), half_height),
            ])
    faces = []
    material_indices = []
    ring_count = 3
    for index in range(segments):
        nxt = (index + 1) % segments
        for ring in range(ring_count - 1):
            lower = index * ring_count * 2 + ring * 2
            upper = lower + 2
            next_lower = nxt * ring_count * 2 + ring * 2
            next_upper = next_lower + 2
            faces.extend([
                (lower + 1, upper + 1, next_upper + 1, next_lower + 1),
                (lower, next_lower, next_upper, upper),
            ])
            material_indices.extend([1 if ring == 0 and len(materials) > 1 else 0, 0])
        inner = index * ring_count * 2
        next_inner = nxt * ring_count * 2
        outer = inner + (ring_count - 1) * 2
        next_outer = next_inner + (ring_count - 1) * 2
        faces.extend([(inner, inner + 1, next_inner + 1, next_inner), (outer, next_outer, next_outer + 1, outer + 1)])
        material_indices.extend([1 if len(materials) > 1 else 0, 0])
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
    obj["profile_family"] = spec["profile_family"]
    return [obj]


def create_air_assist(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    count = geometry["window_count"]
    inner_radius = geometry["inner_radius_mm"] * MM
    window_inner = geometry["window_inner_radius_mm"] * MM
    window_outer = geometry["window_outer_radius_mm"] * MM
    outer_radius = geometry["outer_radius_mm"] * MM
    half_height = geometry["height_mm"] * MM * 0.5
    bridge_span = math.radians(min(geometry["bridge_width_deg"], 360.0 / count - geometry["window_width_deg"]))
    spoke_half_angle = geometry["spoke_width_mm"] * MM * 0.5 / ((window_inner + window_outer) * 0.5)
    objects = [_closed_annulus(
        f"GEO_{spec['id']}_HUB", inner_radius, window_inner, -half_height, half_height,
        geometry["segments"], collection, materials[1 if len(materials) > 1 else 0],
    )]
    for index in range(count):
        center = math.tau * index / count
        objects.append(_closed_sector(
            f"GEO_{spec['id']}_BRIDGE_{index + 1}", window_outer, outer_radius, -half_height, half_height,
            center - bridge_span * 0.5, center + bridge_span * 0.5,
            max(4, geometry["segments"] // count), collection, materials[0],
        ))
        objects.append(_closed_sector(
            f"GEO_{spec['id']}_SPOKE_{index + 1}", window_inner, window_outer, -half_height, half_height,
            center - spoke_half_angle, center + spoke_half_angle, 2,
            collection, materials[1 if len(materials) > 1 else 0],
        ))
    for obj in objects:
        obj["part_id"] = spec["id"]
        obj["geometry_kind"] = geometry["kind"]
        obj["profile_family"] = spec["profile_family"]
    return objects


def create_orbit_halo(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    count = geometry["window_count"]
    bottom = -geometry["height_mm"] * MM * 0.5
    top = geometry["height_mm"] * MM * 0.5
    window_inner = geometry["window_inner_radius_mm"] * MM
    window_outer = geometry["window_outer_radius_mm"] * MM
    outer = geometry["outer_radius_mm"] * MM
    inner = geometry["inner_radius_mm"] * MM
    gap = math.radians(8.0)
    objects = [_closed_annulus(
        f"GEO_{spec['id']}_HUB", inner, window_inner, bottom, top + 0.2 * MM,
        geometry["segments"], collection, materials[1 if len(materials) > 1 else 0],
    )]
    sector_span = math.tau / count - gap
    spoke_half_angle = (geometry["spoke_width_mm"] * MM * 0.5) / ((window_inner + window_outer) * 0.5)
    for index in range(count):
        center = math.tau * index / count + math.radians(geometry["streamline_sweep_deg"])
        objects.append(_closed_sector(
            f"GEO_{spec['id']}_RING_{index + 1}", window_outer, outer, bottom, top,
            center - sector_span * 0.5, center + sector_span * 0.5,
            max(8, geometry["segments"] // count), collection, materials[0],
        ))
        spoke_center = math.tau * index / count
        objects.append(_closed_sector(
            f"GEO_{spec['id']}_SPOKE_{index + 1}", window_inner, window_outer, bottom + 0.2 * MM, top - 0.2 * MM,
            spoke_center - spoke_half_angle, spoke_center + spoke_half_angle,
            2, collection, materials[2 if len(materials) > 2 else 0],
        ))
    for obj in objects:
        obj["part_id"] = spec["id"]
        obj["geometry_kind"] = geometry["kind"]
        obj["profile_family"] = spec["profile_family"]
    return objects


def create_dual_comet(spec: dict, collection: bpy.types.Collection, materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    geometry = spec["geometry"]
    segments = geometry["segments"]
    units = geometry["unit_count"]
    phase = math.radians(geometry.get("phase_deg", 0.0))
    inner_radius = geometry["inner_radius_mm"] * MM
    base_radius = geometry["base_radius_mm"] * MM
    attack_radius = geometry["attack_radius_mm"] * MM
    damper_radius = geometry["damper_radius_mm"] * MM
    bottom = -geometry["height_mm"] * MM * 0.5

    vertices = []
    contact_types = []
    for index in range(segments):
        angle = math.tau * index / segments + phase
        unit_phase = ((angle - phase) / math.tau * units) % 1.0
        if unit_phase < 0.42:
            contact_phase = unit_phase / 0.42
            attack = math.sin(math.pi * contact_phase) ** 1.35
            radius = base_radius + 0.15 * MM + (attack_radius - base_radius - 0.15 * MM) * attack
            top = (geometry["attack_height_mm"] * 0.5 + 0.35 * contact_phase) * MM
            contact_types.append("attack")
        else:
            contact_phase = (unit_phase - 0.42) / 0.58
            damper = math.sin(math.pi * contact_phase) ** 2
            radius = base_radius + 0.15 * MM + (damper_radius - base_radius - 0.15 * MM) * damper
            top = geometry["damper_height_mm"] * MM * 0.5
            contact_types.append("damper")
        for ring_radius, ring_top in ((inner_radius, top + 0.15 * MM), (base_radius, top), (radius, top)):
            vertices.extend([
                (ring_radius * math.cos(angle), ring_radius * math.sin(angle), bottom),
                (ring_radius * math.cos(angle), ring_radius * math.sin(angle), ring_top),
            ])

    faces = []
    material_indices = []
    ring_count = 3
    for index in range(segments):
        nxt = (index + 1) % segments
        for ring in range(ring_count - 1):
            lower = index * ring_count * 2 + ring * 2
            upper = lower + 2
            next_lower = nxt * ring_count * 2 + ring * 2
            next_upper = next_lower + 2
            faces.extend([
                (lower + 1, upper + 1, next_upper + 1, next_lower + 1),
                (lower, next_lower, next_upper, upper),
            ])
            material_indices.extend([1 if ring == 0 and len(materials) > 1 else 0, 0])
        inner = index * ring_count * 2
        next_inner = nxt * ring_count * 2
        outer = inner + (ring_count - 1) * 2
        next_outer = next_inner + (ring_count - 1) * 2
        outer_material = 2 if contact_types[index] == "attack" and len(materials) > 2 else 0
        faces.extend([
            (inner, inner + 1, next_inner + 1, next_inner),
            (outer, next_outer, next_outer + 1, outer + 1),
        ])
        material_indices.extend([0, outer_material])

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
    obj["profile_family"] = spec["profile_family"]
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
    if kind == "radial_core" and spec.get("profile_family") == "void_falcon_split_arc":
        return create_void_falcon(spec, collection, materials)
    if kind == "annular_ring" and spec.get("profile_family") == "guard_cushion_ring":
        return create_guard_assist(spec, collection, materials)
    if kind == "annular_ring" and spec.get("profile_family") == "air_truss_windows":
        return create_air_assist(spec, collection, materials)
    if kind == "radial_blade":
        if spec.get("profile_family") == "iron_bastion_damper":
            return create_iron_bastion(spec, collection, materials)
        if spec.get("profile_family") == "orbit_halo_streamline":
            return create_orbit_halo(spec, collection, materials)
        if spec.get("profile_family") == "dual_comet_alternating":
            return create_dual_comet(spec, collection, materials)
        return create_radial_blade(spec, collection, materials)
    if kind in {"radial_core", "annular_ring", "radial_gear"}:
        return create_profiled_annulus(spec, collection, materials)
    if kind == "revolved_tip":
        return create_revolved_tip(spec, collection, materials)
    raise ValueError(f"Unsupported geometry kind: {kind}")
