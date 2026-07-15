"""Render the fixed high-resolution silhouette used by the Phase 2B-R1 symmetry gate."""

from __future__ import annotations

import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import render_catalog  # noqa: E402


def main() -> None:
    blend_path = ROOT / "build" / "blend" / "blade_dual_comet.blend"
    r1_dir = ROOT / "reports" / "renders" / "phase2b-r1" / "dual-comet"
    after_dir = r1_dir / "after"
    metrics_dir = r1_dir / "metrics"
    after_dir.mkdir(parents=True, exist_ok=True)
    metrics_dir.mkdir(parents=True, exist_ok=True)
    render_catalog.OUTPUT_DIR = after_dir
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    camera, center, span = render_catalog.setup_scene(ortho_scale=0.084)
    for target, direction in (
        ("top", (0.0, 0.0, 1.0)),
        ("perspective_45", (1.0, -1.0, 0.8)),
        ("side", (1.0, 0.0, 0.12)),
    ):
        render_catalog.render_view(target, "512", direction, camera, center, span)
    render_catalog.apply_silhouette_material()
    render_catalog.render_view("silhouette", "512", (0.0, 0.0, 1.0), camera, center, span)
    bpy.context.scene.render.resolution_x = 2048
    bpy.context.scene.render.resolution_y = 2048
    render_catalog.OUTPUT_DIR = metrics_dir
    render_catalog.render_view(
        "dual_comet_symmetry_2048", "silhouette", (0.0, 0.0, 1.0), camera, center, span,
    )


if __name__ == "__main__":
    main()
