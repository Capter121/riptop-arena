"""Verify Phase 3C-A material profiles in Blender without exporting assets."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import materials  # noqa: E402


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    profiles = load_json(ROOT / "specs" / "visual-profiles.json")
    seen_archetypes = set()
    material_count = 0
    for part_path in sorted((ROOT / "specs" / "parts").glob("*.json")):
        part = load_json(part_path)
        slots = materials.build_material_slots(part, profiles)
        if len(slots) != len(part["material_slots"]):
            raise RuntimeError(f"slot count mismatch: {part['id']}")
        for index, material in enumerate(slots):
            if material["part_id"] != part["id"] or material["slot_index"] != index:
                raise RuntimeError(f"material metadata mismatch: {part['id']} slot {index}")
            if material["source_material_id"] != part["material_slots"][index]:
                raise RuntimeError(f"source slot mismatch: {part['id']} slot {index}")
            node = material.node_tree.nodes.get("Principled BSDF")
            if node is None or node.inputs["Base Color"].default_value is None:
                raise RuntimeError(f"missing Principled material: {material.name}")
            seen_archetypes.add(material["archetype"])
            material_count += 1
    expected = {"painted_metal", "polished_metal", "engineering_plastic", "transparent_polycarbonate", "rubber", "energy_accent"}
    if seen_archetypes != expected:
        raise RuntimeError(f"archetype coverage mismatch: {sorted(seen_archetypes)}")
    print(f"PHASE3C_MATERIAL_TEST=PASS materials={material_count} archetypes={len(seen_archetypes)}")


if __name__ == "__main__":
    main()
