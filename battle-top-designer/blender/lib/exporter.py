"""GLB export helpers."""

from __future__ import annotations

from pathlib import Path

import bpy


def export_collection_glb(collection: bpy.types.Collection, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
        if obj.type == "MESH":
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
    )
