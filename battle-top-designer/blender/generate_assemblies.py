"""Generate one assembled and exploded Nova Spin System model."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import assembly, exporter  # noqa: E402


def script_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assembly", required=True)
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
    catalog = load_json(ROOT / "specs" / "assemblies.json")
    assembly_spec = next((item for item in catalog["assemblies"] if item["id"] == args.assembly), None)
    if assembly_spec is None:
        raise ValueError(f"Assembly not found: {args.assembly}")

    clear_scene()
    main_collection = bpy.data.collections.new(f"ASSEMBLY_{args.assembly}")
    bpy.context.scene.collection.children.link(main_collection)
    order = ["core", "blade", "assist", "gear", "tip"]
    roots = []
    collections = []
    for field in order:
        part_id = assembly_spec[field]
        blend_path = ROOT / "build" / "blend" / f"{part_id}.blend"
        if not blend_path.is_file():
            raise FileNotFoundError(f"Generated part is missing: {blend_path}")
        root, part_collection = assembly.append_part(part_id, blend_path, main_collection)
        root["assembly_id"] = args.assembly
        root["assembly_role"] = field
        roots.append(root)
        collections.append(part_collection)

    bpy.context.view_layer.update()
    for index in range(1, len(roots)):
        previous_id = assembly_spec[order[index - 1]]
        current_id = assembly_spec[order[index]]
        target = assembly.mount(collections[index - 1], previous_id, "bottom")
        source = assembly.mount(collections[index], current_id, "top")
        assembly.align_mounts(roots[index], source, target)

    glb_path = ROOT / "public" / "models" / "assemblies" / f"{args.assembly}.glb"
    exporter.export_collection_glb(main_collection, glb_path)
    assembled_blend = ROOT / "build" / "blend" / f"{args.assembly}.blend"
    assembled_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(assembled_blend))

    for index, root in enumerate(roots):
        root.location.z -= index * 0.008
    exploded_blend = ROOT / "build" / "blend" / f"exploded_{args.assembly.removeprefix('assembly_')}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(exploded_blend))
    print(f"NSS_GENERATED_ASSEMBLY={args.assembly}")
    print(f"NSS_ASSEMBLY_GLB={glb_path}")
    print(f"NSS_ASSEMBLY_BLEND={assembled_blend}")
    print(f"NSS_EXPLODED_BLEND={exploded_blend}")


if __name__ == "__main__":
    main()
