"""Build Dual Comet R1 review images and enforce its rotational symmetry gate."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
RENDERS = ROOT / "reports" / "renders"
R1 = RENDERS / "phase2b-r1" / "dual-comet"
VIEWS = ("top", "perspective_45", "side", "silhouette")


def black_mask(image: Image.Image) -> Image.Image:
    gray = image.convert("L")
    return gray.point(lambda value: 255 if value < 128 else 0, mode="1")


def mask_pixels(mask: Image.Image) -> set[tuple[int, int]]:
    return {(x, y) for y in range(mask.height) for x in range(mask.width) if mask.getpixel((x, y))}


def iou(first: set[tuple[int, int]], second: set[tuple[int, int]]) -> float:
    return len(first & second) / len(first | second)


def overlay(first: set[tuple[int, int]], second: set[tuple[int, int]], size: tuple[int, int], output: Path) -> None:
    image = Image.new("RGB", size, "white")
    pixels = image.load()
    for point in first | second:
        pixels[point] = (25, 25, 25) if point in first and point in second else ((220, 55, 55) if point in first else (30, 145, 220))
    image.resize((1024, 1024), Image.Resampling.LANCZOS).save(output)


def main() -> None:
    after = R1 / "after"
    before = R1 / "before"
    comparisons = R1 / "before-after"
    metrics = R1 / "metrics"
    for directory in (after, comparisons, metrics):
        directory.mkdir(parents=True, exist_ok=True)

    for view in VIEWS:
        target = after / f"{view}_512.png"
        old = Image.open(before / f"{view}_512.png").convert("RGB")
        new = Image.open(target).convert("RGB")
        sheet = Image.new("RGB", (1024, 512), "white")
        sheet.paste(old, (0, 0))
        sheet.paste(new, (512, 0))
        sheet.save(comparisons / f"{view}_before_after.png")
    Image.open(after / "perspective_45_512.png").convert("RGB").resize((128, 128), Image.Resampling.LANCZOS).save(after / "thumbnail_128.png")
    old_thumb = Image.open(before / "thumbnail_128.png").convert("RGB")
    new_thumb = Image.open(after / "thumbnail_128.png").convert("RGB")
    thumb_sheet = Image.new("RGB", (256, 128), "white")
    thumb_sheet.paste(old_thumb, (0, 0))
    thumb_sheet.paste(new_thumb, (128, 0))
    thumb_sheet.save(comparisons / "thumbnail_128_before_after.png")

    silhouette_path = metrics / "dual_comet_symmetry_2048_silhouette.png"
    mask = black_mask(Image.open(silhouette_path))
    original = mask_pixels(mask)
    if not original:
        raise RuntimeError("Dual Comet silhouette contains no foreground pixels")
    centroid_x = sum(point[0] for point in original) / len(original)
    centroid_y = sum(point[1] for point in original) / len(original)
    center_x = (mask.width - 1) * 0.5
    center_y = (mask.height - 1) * 0.5
    mm_per_pixel = 84.0 / mask.width
    centroid_offset_mm = (((centroid_x - center_x) ** 2 + (centroid_y - center_y) ** 2) ** 0.5) * mm_per_pixel

    similarities = {}
    rotated_masks = {}
    for angle in (120, 240):
        rotated = mask.rotate(angle, resample=Image.Resampling.NEAREST, center=(center_x, center_y))
        rotated_pixels = mask_pixels(rotated)
        similarities[str(angle)] = iou(original, rotated_pixels)
        rotated_masks[angle] = rotated_pixels
    overlay(original, rotated_masks[120], mask.size, metrics / "dual_comet_rotation_120_overlay.png")

    passed = centroid_offset_mm <= 0.25 and all(value >= 0.97 for value in similarities.values())
    result = {
        "result": "PASS" if passed else "FAIL",
        "source": silhouette_path.relative_to(ROOT).as_posix(),
        "resolution": [mask.width, mask.height],
        "ortho_scale_mm": 84.0,
        "silhouette_centroid_offset_mm": round(centroid_offset_mm, 6),
        "rotational_similarity_120_deg": round(similarities["120"], 6),
        "rotational_similarity_240_deg": round(similarities["240"], 6),
        "thresholds": {"centroid_offset_max_mm": 0.25, "rotational_similarity_min": 0.97},
    }
    output = ROOT / "reports" / "validation" / "phase2b-r1-dual-comet-symmetry.json"
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
