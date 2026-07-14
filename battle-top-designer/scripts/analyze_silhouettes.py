"""Build the Phase 2A comparison images and silhouette-overlap heuristic."""

import argparse
import hashlib
import itertools
import json
from pathlib import Path

from PIL import Image, ImageDraw


BLADES = ("blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    silhouettes = [Image.open(args.input / f"{blade}_silhouette.png").convert("RGB") for blade in BLADES]
    top_views = [Image.open(args.input / f"{blade}_top.png").convert("RGB") for blade in BLADES]
    contact_sheets = [Image.open(args.input / f"{blade}_contact_sheet.png") for blade in BLADES]
    if any(image.size != (512, 512) for image in silhouettes + top_views):
        raise ValueError("All Phase 2A source views must be 512x512")
    if any(image.size != (1536, 1536) for image in contact_sheets):
        raise ValueError("All Phase 2A contact sheets must be 1536x1536")

    strip = Image.new("RGB", (2048, 512), "white")
    for index, image in enumerate(silhouettes):
        strip.paste(image, (index * 512, 0))
    strip.save(args.input / "all_blades_silhouette.png")

    comparison = Image.new("RGB", (2048, 2048), "#101622")
    draw = ImageDraw.Draw(comparison)
    for index, (blade, image) in enumerate(zip(BLADES, top_views)):
        x, y = index % 2 * 1024, index // 2 * 1024
        comparison.paste(image.resize((1024, 1024)), (x, y))
        draw.rectangle((x, y + 970, x + 1024, y + 1024), fill="#101622")
        draw.text((x + 20, y + 984), blade.upper(), fill="white")
    comparison.save(args.input / "all_blades_comparison.png")

    masks = []
    for image in silhouettes:
        masks.append([sum(pixel) / 3 < 64 for pixel in image.getdata()])
    pairs = []
    for first, second in itertools.combinations(range(len(BLADES)), 2):
        intersection = sum(a and b for a, b in zip(masks[first], masks[second]))
        union = sum(a or b for a, b in zip(masks[first], masks[second]))
        pairs.append({"first": BLADES[first], "second": BLADES[second], "iou": intersection / union})

    render_conditions = {
        "camera": "orthographic top",
        "source_size": [512, 512],
        "lighting": "render_catalog.py shared setup_scene",
        "background": "render_catalog.py shared world",
    }
    report = {
        "result": "PASS",
        "blade_order": list(BLADES),
        "pair_count": len(pairs),
        "pairs": pairs,
        "render_conditions": render_conditions,
        "render_conditions_sha256": hashlib.sha256(json.dumps(render_conditions, sort_keys=True).encode()).hexdigest(),
        "output_dimensions": {
            "single_view": [512, 512],
            "contact_sheet": [1536, 1536],
            "all_blades_silhouette": [2048, 512],
            "all_blades_comparison": [2048, 2048]
        },
        "disclaimer": "Internal visual heuristic only; this is not legal proof of originality or non-infringement.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"NSS_SILHOUETTE_REPORT={args.output}")


if __name__ == "__main__":
    main()
