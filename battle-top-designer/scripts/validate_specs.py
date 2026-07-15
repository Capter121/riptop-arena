"""Validate Nova Spin System JSON specifications."""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "schemas"
SPEC_DIR = ROOT / "specs"
REPORT_DIR = ROOT / "reports" / "validation"
PHASE2A_BLADES = {
    "blade_storm_fang": "storm_fang_upper",
    "blade_iron_bastion": "iron_bastion_damper",
    "blade_orbit_halo": "orbit_halo_streamline",
    "blade_dual_comet": "dual_comet_alternating",
}
PHASE2A_FIXTURES = {
    f"assembly_phase2a_{part_id.removeprefix('blade_')}": part_id
    for part_id in PHASE2A_BLADES
}
PHASE2B_PARTS = {
    "core_void_falcon": "void_falcon_split_arc",
    "assist_heavy": "heavy_continuous_mass_band",
    "assist_guard": "guard_cushion_ring",
    "assist_air": "air_truss_windows",
    "gear_medium": "medium_chevron_rib",
    "gear_high": "high_tower_buttress",
    "tip_ball_defense": "ball",
    "tip_needle_stamina": "needle",
    "tip_taper_balance": "taper",
}
PHASE2B_SINGLE_FIXTURES = {
    "assembly_phase2b_core_void_falcon": {"core": "core_void_falcon"},
    "assembly_phase2b_assist_guard": {"assist": "assist_guard"},
    "assembly_phase2b_assist_air": {"assist": "assist_air"},
    "assembly_phase2b_gear_medium": {"gear": "gear_medium"},
    "assembly_phase2b_gear_high": {"gear": "gear_high"},
    "assembly_phase2b_tip_ball_defense": {"tip": "tip_ball_defense"},
    "assembly_phase2b_tip_needle_stamina": {"tip": "tip_needle_stamina"},
    "assembly_phase2b_tip_taper_balance": {"tip": "tip_taper_balance"},
}
PHASE2B_REPRESENTATIVES = {
    "assembly_phase2b_attack_representative": {
        "core": "core_void_falcon", "blade": "blade_storm_fang", "assist": "assist_air",
        "gear": "gear_low", "tip": "tip_flat_attack",
    },
    "assembly_phase2b_defense_representative": {
        "core": "core_solar_wolf", "blade": "blade_iron_bastion", "assist": "assist_guard",
        "gear": "gear_medium", "tip": "tip_ball_defense",
    },
    "assembly_phase2b_stamina_representative": {
        "core": "core_solar_wolf", "blade": "blade_orbit_halo", "assist": "assist_air",
        "gear": "gear_high", "tip": "tip_needle_stamina",
    },
    "assembly_phase2b_balance_representative": {
        "core": "core_void_falcon", "blade": "blade_dual_comet", "assist": "assist_heavy",
        "gear": "gear_medium", "tip": "tip_taper_balance",
    },
}
TIP_CONTACT_RADII_MM = {
    "tip_ball_defense": 3.2,
    "tip_needle_stamina": 0.6,
    "tip_taper_balance": 1.6,
}


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def json_path(parts: object) -> str:
    return "$" + "".join(f"[{part}]" if isinstance(part, int) else f".{part}" for part in parts)


def schema_errors(validator: Draft202012Validator, data: object, source: str) -> list[dict[str, str]]:
    return [
        {
            "source": source,
            "path": json_path(error.absolute_path),
            "message": error.message,
        }
        for error in sorted(validator.iter_errors(data), key=lambda item: list(item.absolute_path))
    ]


def tip_profile_contract(parts: list[object]) -> tuple[list[dict[str, str]], dict[str, dict]]:
    errors: list[dict[str, str]] = []
    profiles: dict[str, dict] = {}
    terminal_radii: dict[str, float] = {}

    def add(source: str, path: str, message: str) -> None:
        errors.append({"source": source, "path": path, "message": message})

    for part in parts:
        if part.get("part_type") != "performance_tip" or part.get("geometry", {}).get("kind") != "revolved_tip":
            continue
        source = part.get("_source", part.get("id", "performance_tip"))
        part_id = part.get("id")
        geometry = part.get("geometry", {})
        points = geometry.get("profile_points_mm", [])
        if len(points) < 2:
            add(source, "$.geometry.profile_points_mm", "revolved tip requires at least two profile points")
            continue
        radii = [point[0] for point in points]
        z_values = [point[1] for point in points]
        if any(radius <= 0 for radius in radii):
            add(source, "$.geometry.profile_points_mm", "profile radii must be positive; mathematical tip points are forbidden")
        if any(right <= left for left, right in zip(z_values, z_values[1:])):
            add(source, "$.geometry.profile_points_mm", "profile Z values must be strictly increasing without duplicates")

        terminal_radius = radii[0]
        terminal_radii[part_id] = terminal_radius
        contact_radius = geometry.get("contact_radius_mm")
        if contact_radius is not None and abs(contact_radius - terminal_radius) > 1e-6:
            add(source, "$.geometry.contact_radius_mm", "must match the first profile point radius")
        expected_radius = TIP_CONTACT_RADII_MM.get(part_id)
        if expected_radius is not None and abs(terminal_radius - expected_radius) > 1e-6:
            add(source, "$.geometry.profile_points_mm[0][0]", f"{part_id} terminal radius must be {expected_radius} mm")

        slopes = []
        if all(right > left for left, right in zip(z_values, z_values[1:])):
            slopes = [
                (radii[index + 1] - radii[index]) / (z_values[index + 1] - z_values[index])
                for index in range(len(points) - 1)
            ]
        if part_id == "tip_ball_defense" and any(
            right > left + 1e-6 for left, right in zip(slopes, slopes[1:])
        ):
            add(source, "$.geometry.profile_points_mm", "ball crown radial slope must decrease monotonically")
        profiles[part_id] = {
            "contact_profile": geometry.get("contact_profile"),
            "terminal_radius_mm": terminal_radius,
            "point_count": len(points),
            "z_strictly_increasing": all(right > left for left, right in zip(z_values, z_values[1:])),
            "minimum_radius_mm": min(radii),
        }

    ordered_ids = ("tip_needle_stamina", "tip_taper_balance", "tip_flat_attack")
    if all(part_id in terminal_radii for part_id in ordered_ids):
        ordered = [terminal_radii[part_id] for part_id in ordered_ids]
        if not ordered[0] < ordered[1] < ordered[2]:
            add("specs/parts", "$.performance_tip", "contact radii must satisfy Needle < Taper < Flat")
    return errors, profiles


def semantic_errors(
    interfaces: object,
    materials: object,
    parts: list[object],
    assemblies: object | None,
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    interface_ids = {item["id"] for item in interfaces.get("interfaces", [])}
    material_ids = {item["id"] for item in materials.get("materials", [])}
    part_by_id: dict[str, object] = {}

    def add(source: str, path: str, message: str) -> None:
        errors.append({"source": source, "path": path, "message": message})

    for index, part in enumerate(parts):
        source = part.get("_source", f"part[{index}]")
        part_id = part.get("id")
        if part_id in part_by_id:
            add(source, "$.id", f"duplicate part id: {part_id}")
        elif part_id:
            part_by_id[part_id] = part

        if part.get("interface_id") not in interface_ids:
            add(source, "$.interface_id", f"unknown interface id: {part.get('interface_id')}")
        for slot_index, material_id in enumerate(part.get("material_slots", [])):
            if material_id not in material_ids:
                add(source, f"$.material_slots[{slot_index}]", f"unknown material id: {material_id}")

        mounts = part.get("mounts", {})
        top = mounts.get("top", {}).get("position_mm", [0, 0, 0])
        bottom = mounts.get("bottom", {}).get("position_mm", [0, 0, 0])
        if len(top) == 3 and len(bottom) == 3 and top[2] <= bottom[2]:
            add(source, "$.mounts", "top mount Z must be greater than bottom mount Z")

        if part.get("part_type") == "main_blade":
            geometry = part.get("geometry", {})
            profile_family = part.get("profile_family")
            expected_contact = {
                "storm_fang_upper": "upper",
                "iron_bastion_damper": "rounded_damper",
                "orbit_halo_streamline": "low_drag",
                "dual_comet_alternating": "alternating",
            }.get(profile_family)
            if expected_contact and geometry.get("contact_profile") != expected_contact:
                add(source, "$.geometry.contact_profile", f"{profile_family} requires {expected_contact}")
            if part.get("dimensions", {}).get("outer_radius_mm") != geometry.get("outer_radius_mm"):
                add(source, "$.geometry.outer_radius_mm", "must match dimensions.outer_radius_mm")
            if part.get("dimensions", {}).get("height_mm") != geometry.get("height_mm"):
                add(source, "$.geometry.height_mm", "must match dimensions.height_mm")
            if profile_family == "iron_bastion_damper" and geometry.get("damper_count") != geometry.get("blade_count"):
                add(source, "$.geometry.damper_count", "must match blade_count")
            if profile_family == "orbit_halo_streamline":
                if geometry.get("window_count") != geometry.get("blade_count"):
                    add(source, "$.geometry.window_count", "must match blade_count")
                if geometry.get("spoke_count") != geometry.get("blade_count"):
                    add(source, "$.geometry.spoke_count", "must match blade_count")
                if geometry.get("window_inner_radius_mm", 0) >= geometry.get("window_outer_radius_mm", 0):
                    add(source, "$.geometry", "window inner radius must be less than outer radius")
            if profile_family == "dual_comet_alternating":
                if geometry.get("blade_count") != geometry.get("unit_count", 0) * 2:
                    add(source, "$.geometry.blade_count", "must equal unit_count * 2")
                if geometry.get("attack_radius_mm", 0) <= geometry.get("damper_radius_mm", 0):
                    add(source, "$.geometry", "attack radius must be greater than damper radius")
                if geometry.get("attack_height_mm", 0) <= geometry.get("damper_height_mm", 0):
                    add(source, "$.geometry", "attack height must be greater than damper height")
                if geometry.get("damper_height_mm", 0) <= geometry.get("inner_cap_height_mm", 0):
                    add(source, "$.geometry", "damper height must be greater than inner cap height")
                span = sum(geometry.get(key, 0) for key in ("attack_span_deg", "damper_span_deg", "transition_span_deg"))
                expected_span = 360.0 / geometry.get("unit_count", 1)
                if abs(span - expected_span) > 1e-6:
                    add(source, "$.geometry", "contact spans must fill exactly one repeated unit")
                if geometry.get("segments", 0) % geometry.get("unit_count", 1) != 0:
                    add(source, "$.geometry.segments", "must be divisible by unit_count")

        if part_id in PHASE2B_PARTS:
            expected_profile = PHASE2B_PARTS[part_id]
            actual_profile = part.get("geometry", {}).get("contact_profile") if part_id.startswith("tip_") else part.get("profile_family")
            if actual_profile != expected_profile:
                add(source, "$.profile_family", f"{part_id} requires {expected_profile}")
            if part.get("interface_id") != "NSS-V1":
                add(source, "$.interface_id", "Phase 2B parts must use NSS-V1")
            if part_id == "assist_heavy":
                geometry = part.get("geometry", {})
                if not geometry.get("inner_radius_mm", 0) < geometry.get("inner_bearing_radius_mm", 0) < geometry.get("band_inner_radius_mm", 0) < geometry.get("outer_radius_mm", 0):
                    add(source, "$.geometry", "Heavy Assist radii must increase from interface bore to mass band")
                if geometry.get("inner_step_height_mm", 0) >= geometry.get("height_mm", 0):
                    add(source, "$.geometry.inner_step_height_mm", "must be lower than the full sidewall height")
            if part_id == "assist_guard":
                geometry = part.get("geometry", {})
                if geometry.get("cushion_count") not in (6, 8):
                    add(source, "$.geometry.cushion_count", "Guard Assist requires 6 or 8 cushions")
                if geometry.get("recess_radius_mm", 0) >= geometry.get("outer_radius_mm", 0):
                    add(source, "$.geometry.recess_radius_mm", "must be smaller than outer_radius_mm")

    expected_types = {
        "core": "emblem_core",
        "blade": "main_blade",
        "assist": "assist_ring",
        "gear": "height_gear",
        "tip": "performance_tip",
    }
    phase2b_part_ids = set(part_by_id) & set(PHASE2B_PARTS)
    if phase2b_part_ids and phase2b_part_ids != set(PHASE2B_PARTS):
        add("specs/parts", "$", "Phase 2B scope must contain exactly the eight approved new part IDs")
    if phase2b_part_ids and len(part_by_id) != 16:
        add("specs/parts", "$", "Phase 2B scope must contain exactly 16 total part specifications")
    if assemblies:
        assembly_ids = set()
        phase2a_seen = {}
        phase2b_seen = {}
        for assembly_index, assembly in enumerate(assemblies.get("assemblies", [])):
            assembly_id = assembly.get("id")
            if assembly_id in assembly_ids:
                add("assemblies.json", f"$.assemblies[{assembly_index}].id", f"duplicate assembly id: {assembly_id}")
            assembly_ids.add(assembly_id)
            if assembly_id in PHASE2A_FIXTURES:
                phase2a_seen[assembly_id] = assembly.get("blade")
            if assembly_id in PHASE2B_SINGLE_FIXTURES or assembly_id in PHASE2B_REPRESENTATIVES:
                phase2b_seen[assembly_id] = assembly
            for field, expected_type in expected_types.items():
                part_id = assembly.get(field)
                part = part_by_id.get(part_id)
                path = f"$.assemblies[{assembly_index}].{field}"
                if part is None:
                    add("assemblies.json", path, f"unknown part id: {part_id}")
                elif part.get("part_type") != expected_type:
                    add(
                        "assemblies.json",
                        path,
                        f"part {part_id} has type {part.get('part_type')}; expected {expected_type}",
                    )
            assembly_parts = [part_by_id.get(assembly.get(field)) for field in expected_types]
            assembly_interfaces = {part.get("interface_id") for part in assembly_parts if part}
            if len(assembly_interfaces) > 1:
                add("assemblies.json", f"$.assemblies[{assembly_index}]", "all parts must use the same interface id")

        if phase2a_seen:
            if phase2a_seen != PHASE2A_FIXTURES:
                add("assemblies.json", "$.assemblies", "Phase 2A fixtures must contain exactly the four approved blade mappings")
            fixed_parts = {
                "core": "core_solar_wolf",
                "assist": "assist_heavy",
                "gear": "gear_low",
                "tip": "tip_flat_attack",
            }
            for assembly_index, assembly in enumerate(assemblies.get("assemblies", [])):
                if assembly.get("id") not in PHASE2A_FIXTURES:
                    continue
                for field, expected_part in fixed_parts.items():
                    if assembly.get(field) != expected_part:
                        add("assemblies.json", f"$.assemblies[{assembly_index}].{field}", f"fixture requires {expected_part}")
        if phase2b_seen:
            expected_ids = set(PHASE2B_SINGLE_FIXTURES) | set(PHASE2B_REPRESENTATIVES)
            if set(phase2b_seen) != expected_ids:
                add("assemblies.json", "$.assemblies", "Phase 2B scope must contain exactly 8 single-variable and 4 representative fixtures")
            baseline = {
                "core": "core_solar_wolf", "blade": "blade_storm_fang", "assist": "assist_heavy",
                "gear": "gear_low", "tip": "tip_flat_attack",
            }
            for assembly_id, replacement in PHASE2B_SINGLE_FIXTURES.items():
                assembly = phase2b_seen.get(assembly_id, {})
                expected = baseline | replacement
                for field, value in expected.items():
                    if assembly.get(field) != value:
                        add("assemblies.json", "$.assemblies", f"{assembly_id} requires {field}={value}")
                metadata = {
                    "purpose": "phase2b_single_variable_fixture", "official_configuration": False,
                    "baseline_fixture": "storm_attack_vertical_slice",
                    "variable_part_type": expected_types[next(iter(replacement))],
                }
                for field, value in metadata.items():
                    if assembly.get(field) != value:
                        add("assemblies.json", "$.assemblies", f"{assembly_id} requires {field}={value}")
            for assembly_id, expected in PHASE2B_REPRESENTATIVES.items():
                assembly = phase2b_seen.get(assembly_id, {})
                for field, value in expected.items():
                    if assembly.get(field) != value:
                        add("assemblies.json", "$.assemblies", f"{assembly_id} requires {field}={value}")
                metadata = {
                    "purpose": "phase2b_representative_fixture", "official_configuration": False,
                    "baseline_fixture": "phase2a_approved", "variable_part_type": "mixed_phase2b_modules",
                }
                for field, value in metadata.items():
                    if assembly.get(field) != value:
                        add("assemblies.json", "$.assemblies", f"{assembly_id} requires {field}={value}")
    contract_errors, _ = tip_profile_contract(parts)
    errors.extend(contract_errors)
    return errors


def validators() -> dict[str, Draft202012Validator]:
    result = {}
    for name in ("interface", "material", "part", "assembly"):
        schema = load_json(SCHEMA_DIR / f"{name}.schema.json")
        Draft202012Validator.check_schema(schema)
        result[name] = Draft202012Validator(schema)
    return result


def valid_fixtures() -> tuple[dict, dict, list[dict], dict]:
    interfaces = {
        "schema_version": "1.0",
        "units": "millimeter",
        "interfaces": [{
            "id": "NSS-V1", "status": "concept_only", "mount_diameter_mm": 21.6,
            "core_height_mm": 3.0, "lug_count": 5, "standard_lug_width_mm": 4.2,
            "index_lug_width_mm": 5.0, "lug_radial_depth_mm": 1.4,
            "lug_axial_height_mm": 1.2, "insertion_depth_mm": 1.6,
            "twist_lock_angle_deg": 18, "lock_direction": "clockwise",
            "lug_fillet_radius_mm": 0.4, "center_bore_mm": 8.0,
            "datum_plane_z_mm": 0.0, "digital_clearance_mm": 0.05,
            "alignment_tolerance_mm": 0.02, "angular_tolerance_deg": 0.1,
        }],
        "allowed_connections": [
            {"from": "emblem_core.bottom", "to": "main_blade.top"},
            {"from": "main_blade.bottom", "to": "assist_ring.top"},
            {"from": "assist_ring.bottom", "to": "height_gear.top"},
            {"from": "height_gear.bottom", "to": "performance_tip.top"},
        ],
        "collision_policy": {
            "allowed_contact_zones": [
                "NSS_V1_INSERTION_ZONE", "NSS_V1_LOCKING_LUG_ZONE", "NSS_V1_DATUM_SURFACE"
            ],
            "max_unexpected_overlap_volume_mm3": 0.5,
        },
    }
    materials = {
        "schema_version": "1.0",
        "materials": [{
            "id": "test_metal", "display_name": "Test Metal", "category": "metal",
            "base_color": [0.2, 0.2, 0.2, 1.0], "metallic": 0.9, "roughness": 0.3,
            "alpha_mode": "OPAQUE", "double_sided": False,
        }],
    }
    base_part = {
        "schema_version": "1.0", "id": "blade_test", "display_name": "Test Blade",
        "part_type": "main_blade", "interface_id": "NSS-V1", "spin_direction": "right",
        "profile_family": "storm_fang_upper",
        "dimensions": {"outer_radius_mm": 36, "inner_radius_mm": 10, "height_mm": 4.8},
        "geometry": {
            "kind": "radial_blade", "segments": 48, "blade_count": 3,
            "base_radius_mm": 27, "outer_radius_mm": 36, "height_mm": 4.8,
            "blade_angle_deg": 24, "contact_profile": "upper",
        },
        "mounts": {
            "top": {
                "position_mm": [0, 0, 2.4], "rotation_deg": [0, 0, 0],
                "datum_radius_mm": 10.8, "interface_role": "female", "orientation_key_deg": 0,
            },
            "bottom": {
                "position_mm": [0, 0, -2.4], "rotation_deg": [0, 0, 0],
                "datum_radius_mm": 10.8, "interface_role": "male", "orientation_key_deg": 0,
            },
        },
        "material_slots": ["test_metal"],
        "originality_rules": {
            "no_existing_logo": True, "no_existing_name": True,
            "no_reference_outline_tracing": True, "no_existing_interface_copy": True,
            "minimum_primary_dimensions_changed": 3,
        },
        "engineering_status": {
            "status": "concept_only", "mass_properties_validated": False,
            "manufacturing_validated": False,
        },
        "generation": {"seed": 1, "generator_version": "0.1.0"},
    }
    part_types = {
        "core_test": ("emblem_core", "radial_core"),
        "blade_test": ("main_blade", "radial_blade"),
        "assist_test": ("assist_ring", "annular_ring"),
        "gear_test": ("height_gear", "radial_gear"),
        "tip_test": ("performance_tip", "revolved_tip"),
    }
    parts = []
    for part_id, (part_type, kind) in part_types.items():
        part = copy.deepcopy(base_part)
        part["id"] = part_id
        part["part_type"] = part_type
        part["geometry"]["kind"] = kind
        if part_type != "main_blade":
            part.pop("profile_family", None)
            for key in ("blade_count", "base_radius_mm", "outer_radius_mm", "height_mm", "blade_angle_deg", "contact_profile"):
                part["geometry"].pop(key, None)
        if part_type == "performance_tip":
            part["geometry"].update({
                "segments": 32,
                "contact_profile": "flat",
                "profile_points_mm": [[2.8, -6.5], [5.6, -3.2], [8.0, -0.65]],
            })
        parts.append(part)
    assemblies = {
        "schema_version": "1.0",
        "assemblies": [{
            "id": "assembly_test", "display_name": "Test Assembly", "core": "core_test",
            "blade": "blade_test", "assist": "assist_test", "gear": "gear_test", "tip": "tip_test",
        }],
    }
    return interfaces, materials, parts, assemblies


def run_self_test(all_validators: dict[str, Draft202012Validator]) -> tuple[bool, list[dict]]:
    interfaces, materials, parts, assemblies = valid_fixtures()
    cases: list[dict] = []

    def record(name: str, passed: bool, detail: str) -> None:
        cases.append({"name": name, "passed": passed, "detail": detail})

    valid_errors = schema_errors(all_validators["interface"], interfaces, "fixture")
    valid_errors += schema_errors(all_validators["material"], materials, "fixture")
    valid_errors += sum((schema_errors(all_validators["part"], item, "fixture") for item in parts), [])
    valid_errors += schema_errors(all_validators["assembly"], assemblies, "fixture")
    valid_errors += semantic_errors(interfaces, materials, parts, assemblies)
    record("valid_fixture_passes", not valid_errors, f"errors={len(valid_errors)}")

    extra = copy.deepcopy(parts[1])
    extra["unexpected"] = True
    errors = schema_errors(all_validators["part"], extra, "fixture")
    record("unknown_property_fails", bool(errors), f"errors={len(errors)}")

    wrong_type = copy.deepcopy(parts[1])
    wrong_type["geometry"]["blade_count"] = "3"
    errors = schema_errors(all_validators["part"], wrong_type, "fixture")
    record("wrong_type_fails", bool(errors), f"errors={len(errors)}")

    missing_profile = copy.deepcopy(parts[1])
    missing_profile.pop("profile_family")
    errors = schema_errors(all_validators["part"], missing_profile, "fixture")
    record("missing_blade_profile_family_fails", bool(errors), f"errors={len(errors)}")

    unknown_profile = copy.deepcopy(parts[1])
    unknown_profile["profile_family"] = "unknown_profile"
    errors = schema_errors(all_validators["part"], unknown_profile, "fixture")
    record("unknown_blade_profile_family_fails", bool(errors), f"errors={len(errors)}")

    unknown_phase2b_profile = copy.deepcopy(parts[0])
    unknown_phase2b_profile["profile_family"] = "void_falcon_split_arcs"
    errors = schema_errors(all_validators["part"], unknown_phase2b_profile, "fixture")
    record("unknown_phase2b_profile_family_fails", bool(errors), f"errors={len(errors)}")

    unknown_tip_profile = copy.deepcopy(parts[4])
    unknown_tip_profile["geometry"]["contact_profile"] = "sharp_point"
    errors = schema_errors(all_validators["part"], unknown_tip_profile, "fixture")
    record("unknown_tip_contact_profile_fails", bool(errors), f"errors={len(errors)}")

    zero_tip = copy.deepcopy(parts[4])
    zero_tip["geometry"]["profile_points_mm"][0][0] = 0
    errors, _ = tip_profile_contract([zero_tip])
    record("zero_radius_tip_fails", bool(errors), f"errors={len(errors)}")

    reversed_tip = copy.deepcopy(parts[4])
    reversed_tip["geometry"]["profile_points_mm"][1][1] = -7.0
    errors, _ = tip_profile_contract([reversed_tip])
    record("reversed_tip_profile_fails", bool(errors), f"errors={len(errors)}")

    duplicate_tip = copy.deepcopy(parts[4])
    duplicate_tip["geometry"]["profile_points_mm"][1] = duplicate_tip["geometry"]["profile_points_mm"][0]
    errors, _ = tip_profile_contract([duplicate_tip])
    record("duplicate_tip_profile_point_fails", bool(errors), f"errors={len(errors)}")

    missing_material = copy.deepcopy(parts)
    missing_material[1]["material_slots"] = ["missing_material"]
    errors = semantic_errors(interfaces, materials, missing_material, assemblies)
    record("missing_material_reference_fails", any("unknown material" in e["message"] for e in errors), f"errors={len(errors)}")

    wrong_assembly = copy.deepcopy(assemblies)
    wrong_assembly["assemblies"][0]["core"] = "blade_test"
    errors = semantic_errors(interfaces, materials, parts, wrong_assembly)
    record("wrong_assembly_part_type_fails", any("expected emblem_core" in e["message"] for e in errors), f"errors={len(errors)}")

    phase_fixture = copy.deepcopy(assemblies)
    phase_fixture["assemblies"][0].update({
        "id": "assembly_phase2a_storm_fang",
        "purpose": "phase2a_blade_test_fixture",
        "official_configuration": False,
        "baseline_fixture": "storm_attack_vertical_slice",
        "variable_part_type": "main_blade",
    })
    errors = schema_errors(all_validators["assembly"], phase_fixture, "fixture")
    record("phase2a_fixture_schema_passes", not errors, f"errors={len(errors)}")

    missing_fixture_field = copy.deepcopy(phase_fixture)
    missing_fixture_field["assemblies"][0].pop("purpose")
    errors = schema_errors(all_validators["assembly"], missing_fixture_field, "fixture")
    record("missing_phase2a_fixture_field_fails", bool(errors), f"errors={len(errors)}")

    official_fixture = copy.deepcopy(phase_fixture)
    official_fixture["assemblies"][0]["official_configuration"] = True
    errors = schema_errors(all_validators["assembly"], official_fixture, "fixture")
    record("official_phase2a_fixture_fails", bool(errors), f"errors={len(errors)}")
    return all(item["passed"] for item in cases), cases


def load_project_specs() -> tuple[object, object, list[dict], object | None, list[dict[str, str]]]:
    errors: list[dict[str, str]] = []
    required = [SPEC_DIR / "interfaces.json", SPEC_DIR / "materials.json"]
    for path in required:
        if not path.is_file():
            errors.append({"source": str(path.relative_to(ROOT)), "path": "$", "message": "required file is missing"})
    if errors:
        return {}, {}, [], None, errors

    interfaces = load_json(required[0])
    materials = load_json(required[1])
    parts = []
    for path in sorted((SPEC_DIR / "parts").glob("*.json")):
        part = load_json(path)
        if isinstance(part, dict):
            part["_source"] = str(path.relative_to(ROOT))
        parts.append(part)
    assemblies_path = SPEC_DIR / "assemblies.json"
    assemblies = load_json(assemblies_path) if assemblies_path.is_file() else None
    return interfaces, materials, parts, assemblies, errors


def validate_project(all_validators: dict[str, Draft202012Validator]) -> tuple[bool, list[dict[str, str]]]:
    interfaces, materials, parts, assemblies, errors = load_project_specs()
    if errors:
        return False, errors
    errors += schema_errors(all_validators["interface"], interfaces, "specs/interfaces.json")
    errors += schema_errors(all_validators["material"], materials, "specs/materials.json")
    clean_parts = []
    for part in parts:
        source = part.pop("_source", "part")
        errors += schema_errors(all_validators["part"], part, source)
        part["_source"] = source
        clean_parts.append(part)
    if assemblies is not None:
        errors += schema_errors(all_validators["assembly"], assemblies, "specs/assemblies.json")
    errors += semantic_errors(interfaces, materials, clean_parts, assemblies)
    return not errors, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="run validator regression fixtures")
    parser.add_argument("--scope", default="all", help="label used in the validation report filename")
    args = parser.parse_args()

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        all_validators = validators()
        if args.self_test:
            passed, details = run_self_test(all_validators)
            report_path = REPORT_DIR / "spec-self-test.json"
            report = {"result": "PASS" if passed else "FAIL", "cases": details}
        else:
            passed, details = validate_project(all_validators)
            slug = re.sub(r"[^a-z0-9]+", "-", args.scope.lower()).strip("-") or "all"
            if slug == "phase2b-tips":
                _, _, parts, _, _ = load_project_specs()
                _, profiles = tip_profile_contract(parts)
                report_path = REPORT_DIR / "tip-profile-contract.json"
                report = {"result": "PASS" if passed else "FAIL", "profiles": profiles, "errors": details}
            else:
                report_path = REPORT_DIR / f"spec-{slug}.json"
                report = {"result": "PASS" if passed else "FAIL", "errors": details}
    except (OSError, json.JSONDecodeError, ValueError) as error:
        passed = False
        report_path = REPORT_DIR / "spec-validator-error.json"
        report = {"result": "FAIL", "errors": [{"source": "validator", "path": "$", "message": str(error)}]}

    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Spec validation: {report['result']}")
    print(f"Report: {report_path}")
    if not passed:
        for detail in report.get("errors", report.get("cases", [])):
            if not detail.get("passed", True):
                print(f"FAIL: {detail}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
