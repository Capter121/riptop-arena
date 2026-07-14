"""Create Blender Principled BSDF materials from the JSON catalog."""

from __future__ import annotations

import bpy


def create_principled_material(spec: dict) -> bpy.types.Material:
    material = bpy.data.materials.new(f"MAT_{spec['id']}")
    material.use_nodes = True
    material.diffuse_color = spec["base_color"]
    node = material.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = spec["base_color"]
    node.inputs["Metallic"].default_value = spec["metallic"]
    node.inputs["Roughness"].default_value = spec["roughness"]
    node.inputs["Alpha"].default_value = spec["base_color"][3]
    if spec["category"] == "translucent_plastic":
        transmission = node.inputs.get("Transmission Weight") or node.inputs.get("Transmission")
        if transmission:
            transmission.default_value = 0.12
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
    material["material_id"] = spec["id"]
    material["alpha_mode"] = spec["alpha_mode"]
    return material


def build_material_slots(part_spec: dict, catalog: dict) -> list[bpy.types.Material]:
    by_id = {item["id"]: item for item in catalog["materials"]}
    return [create_principled_material(by_id[material_id]) for material_id in part_spec["material_slots"]]
