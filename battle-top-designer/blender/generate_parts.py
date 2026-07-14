"""Generate one Nova Spin System part from its JSON specification."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import exporter, geometry, interfaces, materials  # noqa: E402


def script_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--part", required=True)
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def main() -> None:
    args = script_args()
    part_path = ROOT / "specs" / "parts" / f"{args.part}.json"
    if not part_path.is_file():
        raise FileNotFoundError(f"Part specification not found: {part_path}")

    part_spec = load_json(part_path)
    interface_catalog = load_json(ROOT / "specs" / "interfaces.json")
    material_catalog = load_json(ROOT / "specs" / "materials.json")
    interface_by_id = {item["id"]: item for item in interface_catalog["interfaces"]}

    clear_scene()
    collection = bpy.data.collections.new(f"PART_{part_spec['id']}")
    bpy.context.scene.collection.children.link(collection)
    part_materials = materials.build_material_slots(part_spec, material_catalog)
    objects = geometry.create_part(part_spec, collection, part_materials)
    objects += interfaces.create_mounts_and_interface(
        part_spec,
        interface_by_id[part_spec["interface_id"]],
        collection,
        part_materials[0],
    )
    for obj in objects:
        obj["part_id"] = part_spec["id"]
        obj["part_type"] = part_spec["part_type"]
        obj["interface_id"] = part_spec["interface_id"]

    output_path = ROOT / "public" / "models" / "parts" / f"{part_spec['id']}.glb"
    exporter.export_collection_glb(collection, output_path)
    blend_path = ROOT / "build" / "blend" / f"{part_spec['id']}.blend"
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(f"NSS_GENERATED_PART={part_spec['id']}")
    print(f"NSS_GLB={output_path}")
    print(f"NSS_BLEND={blend_path}")


if __name__ == "__main__":
    main()
