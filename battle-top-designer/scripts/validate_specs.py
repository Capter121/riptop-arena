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

    expected_types = {
        "core": "emblem_core",
        "blade": "main_blade",
        "assist": "assist_ring",
        "gear": "height_gear",
        "tip": "performance_tip",
    }
    if assemblies:
        for assembly_index, assembly in enumerate(assemblies.get("assemblies", [])):
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
            for key in ("blade_count", "base_radius_mm", "outer_radius_mm", "height_mm", "blade_angle_deg", "contact_profile"):
                part["geometry"].pop(key, None)
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

    missing_material = copy.deepcopy(parts)
    missing_material[1]["material_slots"] = ["missing_material"]
    errors = semantic_errors(interfaces, materials, missing_material, assemblies)
    record("missing_material_reference_fails", any("unknown material" in e["message"] for e in errors), f"errors={len(errors)}")

    wrong_assembly = copy.deepcopy(assemblies)
    wrong_assembly["assemblies"][0]["core"] = "blade_test"
    errors = semantic_errors(interfaces, materials, parts, wrong_assembly)
    record("wrong_assembly_part_type_fails", any("expected emblem_core" in e["message"] for e in errors), f"errors={len(errors)}")
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
