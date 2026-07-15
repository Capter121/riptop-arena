"""Render fixed-condition Phase 2B human-review views without changing source models."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "reports" / "renders" / "human-review"
BLENDS = ROOT / "build" / "blend"

FAMILIES = {
    "core-family": (("core_solar_wolf", "core_void_falcon"), 0.050),
    "blade-family": (("blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet"), 0.090),
    "assist-family": (("assist_heavy", "assist_guard", "assist_air"), 0.084),
    "gear-family": (("gear_low", "gear_medium", "gear_high"), 0.050),
    "tip-family": (("tip_flat_attack", "tip_ball_defense", "tip_needle_stamina", "tip_taper_balance"), 0.026),
}

ASSEMBLIES = (
    "assembly_phase2b_attack_representative",
    "assembly_phase2b_defense_representative",
    "assembly_phase2b_stamina_representative",
    "assembly_phase2b_balance_representative",
)


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", choices=("parts", "assemblies", "fixtures", "all"), default="all")
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def visible_meshes() -> list[bpy.types.Object]:
    return [obj for obj in bpy.data.objects if obj.type == "MESH" and not obj.name.startswith("COLLIDER_") and not obj.hide_render]


def mesh_bounds() -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for obj in visible_meshes() for corner in obj.bound_box]
    if not points:
        raise RuntimeError("No visible review mesh")
    return Vector(map(min, zip(*points))), Vector(map(max, zip(*points)))


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def prepare_scene(ortho_scale: float, resolution: int = 512) -> tuple[bpy.types.Object, Vector]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.5
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.035, 0.045, 0.065, 1.0)
    background.inputs["Strength"].default_value = 0.35

    minimum, maximum = mesh_bounds()
    center = (minimum + maximum) * 0.5
    camera_data = bpy.data.cameras.new("CAM_HUMAN_REVIEW")
    camera = bpy.data.objects.new("CAM_HUMAN_REVIEW", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.clip_start = 0.001
    camera.data.ortho_scale = ortho_scale

    for index, (location, energy, size) in enumerate((
        ((0.08, -0.10, 0.12), 8, 0.08),
        ((-0.10, -0.04, 0.07), 5, 0.06),
        ((0.02, 0.11, 0.09), 6, 0.05),
    )):
        light_data = bpy.data.lights.new(f"LIGHT_HUMAN_REVIEW_{index}", "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light = bpy.data.objects.new(f"LIGHT_HUMAN_REVIEW_{index}", light_data)
        light.location = location
        scene.collection.objects.link(light)
        look_at(light, center)
    return camera, center


def render(path: Path, camera: bpy.types.Object, center: Vector, direction: tuple[float, float, float]) -> None:
    camera.location = center + Vector(direction).normalized() * 0.18
    look_at(camera, center)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"NSS_HUMAN_REVIEW_RENDER={path}")


def silhouette() -> None:
    material = bpy.data.materials.new("MAT_HUMAN_REVIEW_SILHOUETTE")
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    principled.inputs["Roughness"].default_value = 1.0
    principled.inputs["Specular IOR Level"].default_value = 0.0
    for obj in visible_meshes():
        obj.data.materials.clear()
        obj.data.materials.append(material)
    background = bpy.context.scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = 1.0


def open_blend(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(path)
    bpy.ops.wm.open_mainfile(filepath=str(path))
    for obj in bpy.data.objects:
        if obj.name.startswith("COLLIDER_"):
            obj.hide_render = True


def render_part(family: str, part: str, scale: float) -> None:
    open_blend(BLENDS / f"{part}.blend")
    camera, center = prepare_scene(scale)
    folder = OUTPUT / family / part
    render(folder / "top_512.png", camera, center, (0, 0, 1))
    render(folder / "perspective_45_512.png", camera, center, (1, -1, 0.8))
    render(folder / "side_512.png", camera, center, (1, 0, 0))
    if family == "tip-family":
        render(folder / "bottom_512.png", camera, center, (0, 0, -1))
    silhouette()
    silhouette_direction = (1, 0, 0) if family in ("gear-family", "tip-family") else (0, 0, 1)
    render(folder / "silhouette_512.png", camera, center, silhouette_direction)


def render_assembly(assembly: str) -> None:
    open_blend(BLENDS / f"{assembly}.blend")
    camera, center = prepare_scene(0.095)
    folder = OUTPUT / "assemblies" / assembly
    for name, direction in (
        ("top_512", (0, 0, 1)),
        ("perspective_45_512", (1, -1, 0.8)),
        ("side_512", (1, 0, 0)),
        ("bottom_512", (0, 0, -1)),
    ):
        render(folder / f"{name}.png", camera, center, direction)
    silhouette()
    render(folder / "silhouette_512.png", camera, center, (0, 0, 1))

    exploded = BLENDS / f"exploded_{assembly.removeprefix('assembly_')}.blend"
    open_blend(exploded)
    camera, center = prepare_scene(0.12)
    render(folder / "exploded_512.png", camera, center, (1, -1, 0.65))


def show_only(prefixes: tuple[str, ...]) -> None:
    for obj in bpy.data.objects:
        if obj.type == "MESH" and not obj.name.startswith("COLLIDER_"):
            obj.hide_render = not any(obj.name.startswith(f"GEO_{prefix}") for prefix in prefixes)


def render_fixture(
    name: str,
    visible_parts: tuple[str, ...],
    path: Path,
    direction: tuple[float, float, float],
    scale: float,
    ground_y: int | None = None,
) -> None:
    open_blend(BLENDS / f"{name}.blend")
    show_only(visible_parts)
    camera, center = prepare_scene(scale)
    if ground_y is not None:
        minimum, _ = mesh_bounds()
        center.z = minimum.z + (ground_y - 256) / 512 * scale
    render(path, camera, center, direction)


def render_assist_mask(fixture: str, assist: str, include_blade: bool, path: Path) -> None:
    open_blend(BLENDS / f"{fixture}.blend")
    parts = (assist, "blade_storm_fang") if include_blade else (assist,)
    show_only(parts)
    camera, center = prepare_scene(0.090)
    white = bpy.data.materials.new("MAT_REVIEW_MASK_WHITE")
    white.diffuse_color = (1, 1, 1, 1)
    black = bpy.data.materials.new("MAT_REVIEW_MASK_BLACK")
    black.diffuse_color = (0, 0, 0, 1)
    for material, color in ((white, (1, 1, 1, 1)), (black, (0, 0, 0, 1))):
        material.use_nodes = True
        principled = material.node_tree.nodes["Principled BSDF"]
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = 1.0
        principled.inputs["Specular IOR Level"].default_value = 0.0
        principled.inputs["Emission Color"].default_value = color
        principled.inputs["Emission Strength"].default_value = 1.0
    for obj in visible_meshes():
        obj.data.materials.clear()
        obj.data.materials.append(white if obj.name.startswith(f"GEO_{assist}") else black)
    background = bpy.context.scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0, 0, 0, 1)
    background.inputs["Strength"].default_value = 0.0
    render(path, camera, center, (0, 0, 1))


def render_fixtures() -> None:
    core_specs = (
        ("core_solar_wolf", "assembly_storm_attack"),
        ("core_void_falcon", "assembly_phase2b_core_void_falcon"),
    )
    for core, fixture in core_specs:
        render_fixture(fixture, (core, "blade_storm_fang"), OUTPUT / "core-family" / f"installed_{core}_top.png", (0, 0, 1), 0.090)

    assist_specs = (
        ("assist_heavy", "assembly_storm_attack"),
        ("assist_guard", "assembly_phase2b_assist_guard"),
        ("assist_air", "assembly_phase2b_assist_air"),
    )
    for assist, fixture in assist_specs:
        render_fixture(fixture, (assist, "blade_storm_fang"), OUTPUT / "assist-family" / f"installed_{assist}_top.png", (0, 0, 1), 0.090)
        render_assist_mask(fixture, assist, False, OUTPUT / "assist-family" / f"mask_{assist}_standalone.png")
        render_assist_mask(fixture, assist, True, OUTPUT / "assist-family" / f"mask_{assist}_visible.png")

    gear_specs = (
        ("gear_low", "assembly_storm_attack"),
        ("gear_medium", "assembly_phase2b_gear_medium"),
        ("gear_high", "assembly_phase2b_gear_high"),
    )
    for gear, fixture in gear_specs:
        render_fixture(
            fixture,
            ("core_solar_wolf", "blade_storm_fang", "assist_heavy", gear, "tip_flat_attack"),
            OUTPUT / "gear-family" / f"fixture_{gear}_side.png",
            (1, 0, 0), 0.095, ground_y=444,
        )


def main() -> None:
    scope = args().scope
    if scope in ("parts", "all"):
        for family, (parts, scale) in FAMILIES.items():
            for part in parts:
                render_part(family, part, scale)
    if scope in ("assemblies", "all"):
        for assembly in ASSEMBLIES:
            render_assembly(assembly)
    if scope in ("fixtures", "all"):
        render_fixtures()


if __name__ == "__main__":
    main()
