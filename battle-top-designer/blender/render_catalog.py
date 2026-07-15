"""Render catalog views for a generated NSS part or assembly."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "reports" / "renders"


def script_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True)
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def bounds() -> tuple[Vector, Vector]:
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    points = [obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
    return (
        Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))),
        Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))),
    )


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def setup_scene(ortho_scale: float | None = None) -> tuple[bpy.types.Object, Vector, float]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.5
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.035, 0.045, 0.065, 1.0)
    background.inputs["Strength"].default_value = 0.35

    minimum, maximum = bounds()
    center = (minimum + maximum) * 0.5
    span = max(maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z)
    camera_data = bpy.data.cameras.new("CATALOG_CAMERA")
    camera = bpy.data.objects.new("CATALOG_CAMERA", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.clip_start = 0.001
    camera.data.ortho_scale = ortho_scale if ortho_scale is not None else span * 1.35
    camera.data.lens = 55

    for index, (location, energy, size) in enumerate([
        ((0.08, -0.10, 0.12), 8, 0.08),
        ((-0.10, -0.04, 0.07), 5, 0.06),
        ((0.02, 0.11, 0.09), 6, 0.05),
    ]):
        light_data = bpy.data.lights.new(f"CATALOG_LIGHT_{index}", "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light = bpy.data.objects.new(f"CATALOG_LIGHT_{index}", light_data)
        light.location = location
        scene.collection.objects.link(light)
        look_at(light, center)
    return camera, center, span


def render_view(target: str, name: str, direction: tuple[float, float, float], camera: bpy.types.Object, center: Vector, span: float) -> None:
    vector = Vector(direction).normalized()
    camera.location = center + vector * span * 2.4
    look_at(camera, center)
    output = OUTPUT_DIR / f"{target}_{name}.png"
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    print(f"NSS_RENDER={output}")


def apply_silhouette_material() -> None:
    material = bpy.data.materials.new("MAT_SILHOUETTE_BLACK")
    material.diffuse_color = (0.0, 0.0, 0.0, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    principled.inputs["Roughness"].default_value = 1.0
    principled.inputs["Specular IOR Level"].default_value = 0.0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.data.materials.clear()
            obj.data.materials.append(material)
    background = bpy.context.scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = 1.0


def render_file(
    target: str,
    blend_path: Path,
    views: list[tuple[str, tuple[float, float, float]]],
    silhouette: bool = False,
    ortho_scale: float | None = None,
    silhouette_view: tuple[str, tuple[float, float, float]] = ("silhouette", (0.0, 0.0, 1.0)),
) -> None:
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    camera, center, span = setup_scene(ortho_scale)
    for name, direction in views:
        render_view(target, name, direction, camera, center, span)
    if silhouette:
        apply_silhouette_material()
        render_view(target, silhouette_view[0], silhouette_view[1], camera, center, span)


def main() -> None:
    args = script_args()
    target = args.target
    if target == "phase2a_all_blades":
        views = [("top", (0.0, 0.0, 1.0)), ("perspective_45", (1.0, -1.0, 0.8)), ("side", (1.0, 0.0, 0.12))]
        for blade in ("blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet"):
            render_file(blade, ROOT / "build" / "blend" / f"{blade}.blend", views, silhouette=True)
        return
    if target == "phase2b_all_assists":
        views = [("top", (0.0, 0.0, 1.0)), ("perspective_45", (1.0, -1.0, 0.8)), ("side", (1.0, 0.0, 0.12))]
        for assist in ("assist_heavy", "assist_guard", "assist_air"):
            render_file(assist, ROOT / "build" / "blend" / f"{assist}.blend", views, silhouette=True, ortho_scale=0.084)
        return
    if target == "phase2b_all_gears":
        views = [("perspective_45", (1.0, -1.0, 0.8)), ("side", (1.0, 0.0, 0.0)), ("bottom", (0.0, 0.0, -1.0))]
        for gear in ("gear_low", "gear_medium", "gear_high"):
            render_file(
                gear, ROOT / "build" / "blend" / f"{gear}.blend", views,
                silhouette=True, ortho_scale=0.05, silhouette_view=("side_silhouette", (1.0, 0.0, 0.0)),
            )
        return
    if target == "phase2b_all_tips":
        views = [("perspective_45", (1.0, -1.0, 0.8)), ("side", (1.0, 0.0, 0.0)), ("bottom", (0.0, 0.0, -1.0))]
        for tip in ("tip_flat_attack", "tip_ball_defense", "tip_needle_stamina", "tip_taper_balance"):
            render_file(
                tip, ROOT / "build" / "blend" / f"{tip}.blend", views,
                silhouette=True, ortho_scale=0.026, silhouette_view=("side_silhouette", (1.0, 0.0, 0.0)),
            )
        return
    blend_path = ROOT / "build" / "blend" / f"{target}.blend"
    if not blend_path.is_file():
        raise FileNotFoundError(blend_path)
    standard_views = [
        ("top", (0.0, 0.0, 1.0)),
        ("perspective_45", (1.0, -1.0, 0.8)),
        ("angle", (1.0, -1.0, 0.8)),
        ("front", (0.0, -1.0, 0.12)),
        ("side", (1.0, 0.0, 0.12)),
        ("bottom", (0.0, 0.0, -1.0)),
        ("rotated", (-1.0, -1.0, 0.65)),
    ]
    render_file(target, blend_path, standard_views, silhouette=True)
    if target.startswith("assembly_"):
        exploded_path = ROOT / "build" / "blend" / f"exploded_{target.removeprefix('assembly_')}.blend"
        render_file(target, exploded_path, [("exploded", (1.0, -1.0, 0.65))])


if __name__ == "__main__":
    main()
