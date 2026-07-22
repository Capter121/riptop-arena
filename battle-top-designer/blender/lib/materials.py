"""Create deterministic Blender Principled BSDF materials from visual profiles."""

from __future__ import annotations

import bpy


def set_input(node: bpy.types.Node, names: tuple[str, ...], value) -> None:
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def profile_for_part(part_spec: dict, visual_profiles: dict) -> dict:
    matches = [profile for profile in visual_profiles["profiles"] if profile["part_id"] == part_spec["id"]]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one visual profile for {part_spec['id']}")
    profile = matches[0]
    expected_slots = part_spec["material_slots"]
    slots = profile["slots"]
    if len(slots) != len(expected_slots):
        raise ValueError(f"Visual profile slot count mismatch for {part_spec['id']}")
    for index, slot in enumerate(slots):
        if slot["slot_index"] != index or slot["source_material_id"] != expected_slots[index]:
            raise ValueError(f"Visual profile slot mapping mismatch for {part_spec['id']} slot {index}")
    return profile


def create_principled_material(part_id: str, slot: dict) -> bpy.types.Material:
    material = bpy.data.materials.new(f"MAT_{part_id}_{slot['slot_index']:02d}_{slot['archetype']}")
    material.use_nodes = True
    material.diffuse_color = slot["base_color"]
    material.use_backface_culling = True
    node = material.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = slot["base_color"]
    node.inputs["Metallic"].default_value = slot["metallic"]
    node.inputs["Roughness"].default_value = slot["roughness"]
    node.inputs["Alpha"].default_value = slot["base_color"][3]
    set_input(node, ("Transmission Weight", "Transmission"), slot.get("transmission", 0.0))
    if "ior" in slot:
        set_input(node, ("IOR",), slot["ior"])
    if "emissive_color" in slot:
        set_input(node, ("Emission Color", "Emission"), slot["emissive_color"])
        set_input(node, ("Emission Strength",), slot["emissive_strength"])
    if slot["archetype"] == "transparent_polycarbonate" and hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    material["part_id"] = part_id
    material["slot_index"] = slot["slot_index"]
    material["source_material_id"] = slot["source_material_id"]
    material["surface_role"] = slot["surface_role"]
    material["archetype"] = slot["archetype"]
    material["alpha_mode"] = "BLEND" if slot["archetype"] == "transparent_polycarbonate" else "OPAQUE"
    return material


def build_material_slots(part_spec: dict, visual_profiles: dict) -> list[bpy.types.Material]:
    profile = profile_for_part(part_spec, visual_profiles)
    return [create_principled_material(part_spec["id"], slot) for slot in profile["slots"]]
