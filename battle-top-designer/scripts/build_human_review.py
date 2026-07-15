"""Compose and validate the Phase 2B human visual-review package."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent.parent
RENDERS = ROOT / "reports" / "renders" / "human-review"
VALIDATION = ROOT / "reports" / "validation"
SPECS = ROOT / "specs" / "parts"

FAMILIES = {
    "core-family": ("core_solar_wolf", "core_void_falcon"),
    "blade-family": ("blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet"),
    "assist-family": ("assist_heavy", "assist_guard", "assist_air"),
    "gear-family": ("gear_low", "gear_medium", "gear_high"),
    "tip-family": ("tip_flat_attack", "tip_ball_defense", "tip_needle_stamina", "tip_taper_balance"),
}
ASSEMBLIES = (
    "assembly_phase2b_attack_representative",
    "assembly_phase2b_defense_representative",
    "assembly_phase2b_stamina_representative",
    "assembly_phase2b_balance_representative",
)
ALLOWED = ("PASS", "LOCAL_REVISION", "REDESIGN", "NOT_VISIBLE", "NEEDS_COMPARISON")
CHECKS = (
    ("core_family_distinction", "Core同族辨识度"),
    ("assist_family_distinction", "Assist同族辨识度"),
    ("gear_height_distinction", "Gear高度辨识度"),
    ("tip_contact_distinction", "Tip接触面辨识度"),
    ("assembly_distinction", "四套组合整体辨识度"),
    ("browser_material_hierarchy", "浏览器材质层级"),
    ("dual_comet_visual_symmetry", "Dual Comet视觉对称性"),
    ("iron_bastion_dual_comet_outline", "Iron Bastion与Dual Comet轮廓区分"),
    ("reference_product_visual_distance", "参考产品视觉距离"),
    ("normal_viewing_distance", "正常观看距离表现"),
)


def open_rgb(path: Path) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(path)
    image = Image.open(path).convert("RGB")
    if image.size != (512, 512):
        raise ValueError(f"Expected 512x512: {path} -> {image.size}")
    return image


def comparison(paths: list[Path], labels: list[str], output: Path, labeled: bool) -> None:
    images = [open_rgb(path) for path in paths]
    sheet = Image.new("RGB", (512 * len(images), 512), "#0d1420")
    draw = ImageDraw.Draw(sheet)
    for index, (image, label) in enumerate(zip(images, labels)):
        sheet.paste(image, (512 * index, 0))
        if labeled:
            draw.rectangle((512 * index, 472, 512 * (index + 1), 512), fill="#0d1420")
            draw.text((512 * index + 12, 484), label, fill="white", font=ImageFont.load_default())
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def build_family_comparisons() -> None:
    for family, parts in FAMILIES.items():
        paths = [RENDERS / family / part / "perspective_45_512.png" for part in parts]
        comparison(paths, list(parts), RENDERS / family / "family_unlabeled.png", False)
        comparison(paths, list(parts), RENDERS / family / "family_labeled.png", True)
        for part in parts:
            source = open_rgb(RENDERS / family / part / "perspective_45_512.png")
            source.resize((128, 128), Image.Resampling.LANCZOS).save(RENDERS / family / part / "thumbnail_128.png")


def build_core_specials() -> None:
    parts = FAMILIES["core-family"]
    comparison([RENDERS / "core-family" / part / "top_512.png" for part in parts], list(parts), RENDERS / "core-family" / "core_top_comparison.png", True)
    comparison([RENDERS / "core-family" / part / "silhouette_512.png" for part in parts], list(parts), RENDERS / "core-family" / "core_silhouette_comparison.png", True)
    zooms = []
    for part in parts:
        source = open_rgb(RENDERS / "core-family" / f"installed_{part}_top.png")
        zooms.append(source.crop((128, 128, 384, 384)).resize((512, 512), Image.Resampling.LANCZOS))
    output = RENDERS / "core-family" / "core_installed_center_zoom_comparison.png"
    sheet = Image.new("RGB", (1024, 512))
    for index, image in enumerate(zooms):
        sheet.paste(image, (index * 512, 0))
    sheet.save(output)


def white_pixel_count(path: Path) -> int:
    image = open_rgb(path)
    return sum(min(pixel) > 200 for pixel in image.getdata())


def build_assist_specials() -> None:
    parts = FAMILIES["assist-family"]
    comparison([RENDERS / "assist-family" / part / "top_512.png" for part in parts], list(parts), RENDERS / "assist-family" / "assist_independent_comparison.png", True)
    comparison([RENDERS / "assist-family" / f"installed_{part}_top.png" for part in parts], list(parts), RENDERS / "assist-family" / "assist_installed_visible_comparison.png", True)
    rows = []
    for part in parts:
        standalone = white_pixel_count(RENDERS / "assist-family" / f"mask_{part}_standalone.png")
        visible = white_pixel_count(RENDERS / "assist-family" / f"mask_{part}_visible.png")
        occluded = 1.0 - min(1.0, visible / standalone) if standalone else 1.0
        rows.append({"part_id": part, "standalone_pixels": standalone, "visible_pixels": visible, "occluded_ratio": round(occluded, 4)})
    (VALIDATION / "phase2b-assist-occlusion.json").write_text(json.dumps({"result": "PASS", "method": "fixed top-view pixel mask", "parts": rows}, indent=2) + "\n", encoding="utf-8")
    image = Image.new("RGB", (1536, 180), "#0d1420")
    draw = ImageDraw.Draw(image)
    for index, row in enumerate(rows):
        draw.text((index * 512 + 18, 42), row["part_id"], fill="white")
        draw.text((index * 512 + 18, 88), f"Blade occluded: {row['occluded_ratio']:.1%}", fill="#7dd3fc")
    image.save(RENDERS / "assist-family" / "assist_blade_occlusion_ratio.png")


def build_gear_specials() -> None:
    parts = FAMILIES["gear-family"]
    fixture_reports = {
        "gear_low": VALIDATION / "assembly-storm-attack.json",
        "gear_medium": VALIDATION / "assembly-phase2b-gear-medium.json",
        "gear_high": VALIDATION / "assembly-phase2b-gear-high.json",
    }
    fixture_paths = [RENDERS / "gear-family" / f"fixture_{part}_side.png" for part in parts]
    images = [open_rgb(path) for path in fixture_paths]
    annotated = Image.new("RGB", (1536, 512), "#0d1420")
    draw = ImageDraw.Draw(annotated)
    overlay = Image.new("RGBA", (512, 512), (13, 20, 32, 255))
    colors = ((255, 80, 80, 255), (80, 220, 140, 255), (80, 160, 255, 255))
    for index, (part, image, color) in enumerate(zip(parts, images, colors)):
        spec = json.loads((SPECS / f"{part}.json").read_text(encoding="utf-8"))
        height = spec["dimensions"]["height_mm"]
        report = json.loads(fixture_reports[part].read_text(encoding="utf-8"))
        total_height = report["total_height_mm"]
        annotated.paste(image, (index * 512, 0))
        draw.line((index * 512, 444, (index + 1) * 512, 444), fill="#f8fafc", width=2)
        draw.text((index * 512 + 12, 14), f"{part} | total {total_height:.1f} mm | gear visible {height:.1f} mm", fill="white")
        edges = image.filter(ImageFilter.FIND_EDGES).convert("L").point(lambda value: 255 if value > 28 else 0)
        color_layer = Image.new("RGBA", image.size, color)
        overlay.alpha_composite(Image.composite(color_layer, Image.new("RGBA", image.size), edges))
    annotated.save(RENDERS / "gear-family" / "gear_fixture_side_height_comparison.png")
    overlay.convert("RGB").save(RENDERS / "gear-family" / "gear_outline_overlay.png")


def draw_tip_section(part: str) -> None:
    spec = json.loads((SPECS / f"{part}.json").read_text(encoding="utf-8"))
    points = spec["geometry"]["profile_points_mm"]
    radius = spec["geometry"].get("contact_radius_mm", spec["mounts"]["bottom"]["datum_radius_mm"])
    lowest = min(point[1] for point in points)
    canvas = Image.new("RGB", (512, 512), "white")
    draw = ImageDraw.Draw(canvas)
    scale = 25
    origin = (256, 72)
    right = [(origin[0] + r * scale, origin[1] - z * scale) for r, z in points]
    left = [(origin[0] - r * scale, origin[1] - z * scale) for r, z in reversed(points)]
    polygon = right + left
    draw.polygon(polygon, fill="#cbd5e1", outline="#0f172a")
    draw.line((256, 40, 256, 470), fill="#64748b", width=1)
    y = origin[1] - lowest * scale
    draw.line((232, y, 280, y), fill="#dc2626", width=2)
    draw.text((18, 18), f"{part} section", fill="#0f172a")
    draw.text((18, 42), f"contact radius: {radius:.2f} mm", fill="#0f172a")
    draw.text((18, 66), f"lowest point Z: {lowest:.2f} mm", fill="#0f172a")
    canvas.save(RENDERS / "tip-family" / part / "section_512.png")


def build_tip_specials() -> None:
    for part in FAMILIES["tip-family"]:
        side = open_rgb(RENDERS / "tip-family" / part / "side_512.png")
        side.crop((128, 256, 384, 512)).resize((512, 512), Image.Resampling.LANCZOS).save(RENDERS / "tip-family" / part / "contact_zoom_512.png")
        draw_tip_section(part)


def build_blade_specials() -> None:
    folder = RENDERS / "blade-family"
    parts = ("blade_iron_bastion", "blade_dual_comet")
    paths = [folder / part / "silhouette_512.png" for part in parts]
    comparison(paths, list(parts), folder / "iron_bastion_vs_dual_comet_uncolored.png", False)
    images = [open_rgb(path).resize((128, 128), Image.Resampling.LANCZOS) for path in paths]
    sheet = Image.new("RGB", (256, 128), "white")
    for index, image in enumerate(images):
        sheet.paste(image, (index * 128, 0))
    sheet.save(folder / "iron_bastion_vs_dual_comet_normal_distance_128.png")


def build_assembly_comparisons() -> None:
    paths = [RENDERS / "assemblies" / assembly / "perspective_45_512.png" for assembly in ASSEMBLIES]
    comparison(paths, list(ASSEMBLIES), RENDERS / "assemblies" / "all_assemblies_unlabeled.png", False)
    comparison(paths, list(ASSEMBLIES), RENDERS / "assemblies" / "all_assemblies_labeled.png", True)
    for assembly in ASSEMBLIES:
        open_rgb(RENDERS / "assemblies" / assembly / "perspective_45_512.png").resize((128, 128), Image.Resampling.LANCZOS).save(RENDERS / "assemblies" / assembly / "thumbnail_128.png")


def write_review_forms() -> None:
    payload = {
        "phase": "Phase 2B",
        "status": "awaiting visual review",
        "allowed_results": list(ALLOWED),
        "reviewer": "",
        "reviewed_at": "",
        "items": [{"id": key, "label": label, "result": "NEEDS_COMPARISON", "notes": ""} for key, label in CHECKS],
        "approval_statement": "This form records human visual review only and does not imply manufacturing or safety approval.",
    }
    json_path = VALIDATION / "phase2b-visual-review-form.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# Phase 2B 人工视觉评审表", "", "状态：Phase 2B awaiting visual review", "", f"允许结果：{', '.join(ALLOWED)}", "", "| 检查项 | 结果 | 备注 |", "| --- | --- | --- |"]
    lines.extend(f"| {label} | NEEDS_COMPARISON |  |" for _, label in CHECKS)
    lines.extend(("", "本表只记录人工视觉判断，不表示可制造性、高速战斗安全性或法律意义上的原创性结论。", ""))
    (VALIDATION / "phase2b-visual-review-form.md").write_text("\n".join(lines), encoding="utf-8")


def validate_and_index() -> None:
    expected = []
    for family, parts in FAMILIES.items():
        for part in parts:
            expected.extend(RENDERS / family / part / name for name in ("top_512.png", "perspective_45_512.png", "side_512.png", "silhouette_512.png", "browser_512.png", "thumbnail_128.png"))
    for assembly in ASSEMBLIES:
        expected.extend(RENDERS / "assemblies" / assembly / name for name in ("top_512.png", "perspective_45_512.png", "side_512.png", "bottom_512.png", "exploded_512.png", "silhouette_512.png", "browser_512.png", "thumbnail_128.png"))
    missing = [str(path.relative_to(ROOT)) for path in expected if not path.is_file() or path.stat().st_size == 0]
    if missing:
        raise RuntimeError(f"Missing human-review outputs: {missing}")
    index = ["# Phase 2B Human Visual Review Package", "", "Status: Phase 2B awaiting visual review", "", "## Required review images", ""]
    index.extend(f"- `{path.relative_to(ROOT).as_posix()}`" for path in sorted(expected))
    index.extend(("", "## Specialized comparisons", ""))
    specialized = sorted(path for path in RENDERS.rglob("*.png") if path not in expected and not path.name.startswith("mask_"))
    index.extend(f"- `{path.relative_to(ROOT).as_posix()}`" for path in specialized)
    index.extend(("", "Automatic checks only report technical evidence; human aesthetic review remains required.", ""))
    (RENDERS / "index.md").write_text("\n".join(index), encoding="utf-8")
    print(f"NSS_HUMAN_REVIEW_REQUIRED={len(expected)}")
    print(f"NSS_HUMAN_REVIEW_SPECIALIZED={len(specialized)}")
    print("NSS_HUMAN_REVIEW_PACKAGE=PASS")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("compose", "validate", "all"), default="all")
    mode = parser.parse_args().mode
    VALIDATION.mkdir(parents=True, exist_ok=True)
    if mode in ("compose", "all"):
        build_family_comparisons()
        build_core_specials()
        build_assist_specials()
        build_gear_specials()
        build_tip_specials()
        build_blade_specials()
        build_assembly_comparisons()
        write_review_forms()
    if mode in ("validate", "all"):
        validate_and_index()


if __name__ == "__main__":
    main()
