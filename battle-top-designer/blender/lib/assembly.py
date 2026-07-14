"""Load and align generated NSS part collections."""

from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Matrix


def append_part(part_id: str, blend_path: Path, assembly_collection: bpy.types.Collection) -> tuple[bpy.types.Object, bpy.types.Collection]:
    collection_name = f"PART_{part_id}"
    with bpy.data.libraries.load(str(blend_path), link=False) as (source, target):
        if collection_name not in source.collections:
            raise ValueError(f"Collection {collection_name} not found in {blend_path}")
        target.collections = [collection_name]
    part_collection = target.collections[0]
    assembly_collection.children.link(part_collection)

    root = bpy.data.objects.new(f"INSTANCE_{part_id}", None)
    root.empty_display_type = "PLAIN_AXES"
    root["part_id"] = part_id
    assembly_collection.objects.link(root)
    for obj in part_collection.all_objects:
        obj.parent = root
        obj.matrix_parent_inverse = Matrix.Identity(4)
    return root, part_collection


def mount(collection: bpy.types.Collection, part_id: str, side: str) -> bpy.types.Object:
    name = f"MOUNT_{part_id}_{side.upper()}"
    result = collection.all_objects.get(name)
    if result is None:
        raise ValueError(f"Mount not found: {name}")
    return result


def align_mounts(root: bpy.types.Object, source_mount: bpy.types.Object, target_mount: bpy.types.Object) -> None:
    root.matrix_world = target_mount.matrix_world @ source_mount.matrix_basis.inverted()
    bpy.context.view_layer.update()
