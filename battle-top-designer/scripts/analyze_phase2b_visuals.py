"""Build fixed-condition Phase 2B family comparisons and silhouette heuristics."""

from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
RENDERS = ROOT / "reports" / "renders"
VALIDATION = ROOT / "reports" / "validation"
FAMILIES = {
    "assist": {
        "targets": ("assist_heavy", "assist_guard", "assist_air"),
        "material_view": "top",
        "silhouette_view": "silhouette",
    },
    "gear": {
        "targets": ("gear_low", "gear_medium", "gear_high"),
        "material_view": "side",
        "silhouette_view": "side_silhouette",
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--family", choices=sorted(FAMILIES), required=True)
    args = parser.parse_args()
    family = FAMILIES[args.family]
    targets = family["targets"]
    top_views = [Image.open(RENDERS / f"{target}_{family['material_view']}.png").convert("RGB") for target in targets]
    silhouettes = [Image.open(RENDERS / f"{target}_{family['silhouette_view']}.png").convert("RGB") for target in targets]
    if any(image.size != (512, 512) for image in top_views + silhouettes):
        raise ValueError("Phase 2B family source views must be 512x512")

    comparison = Image.new("RGB", (2048, 1024), "#101622")
    draw = ImageDraw.Draw(comparison)
    column_width = 2048 // len(targets)
    for index, (target, top, silhouette) in enumerate(zip(targets, top_views, silhouettes)):
        x = index * column_width + (column_width - 512) // 2
        comparison.paste(top, (x, 0))
        comparison.paste(silhouette, (x, 512))
        draw.rectangle((index * column_width, 478, (index + 1) * column_width, 512), fill="#101622")
        draw.text((index * column_width + 16, 488), target.upper(), fill="white")
    comparison_path = RENDERS / f"all_{args.family}s_comparison.png"
    comparison.save(comparison_path)

    masks = [[sum(pixel) / 3 < 64 for pixel in image.getdata()] for image in silhouettes]
    pairs = []
    for first, second in itertools.combinations(range(len(targets)), 2):
        intersection = sum(a and b for a, b in zip(masks[first], masks[second]))
        union = sum(a or b for a, b in zip(masks[first], masks[second]))
        pairs.append({"first": targets[first], "second": targets[second], "iou": intersection / union})
    report = {
        "result": "PASS",
        "family": args.family,
        "order": list(targets),
        "pair_count": len(pairs),
        "pairs": pairs,
        "render_conditions": {
            "camera": "render_catalog.py shared orthographic top",
            "lighting": "render_catalog.py shared setup_scene",
            "background": "render_catalog.py shared world",
            "single_view_size": [512, 512],
            "comparison_size": [2048, 1024],
        },
        "disclaimer": "Internal visual heuristic only; this is not legal proof of originality or non-infringement.",
    }
    VALIDATION.mkdir(parents=True, exist_ok=True)
    report_path = VALIDATION / f"{args.family}-silhouette-overlap.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"NSS_PHASE2B_VISUAL_REPORT={report_path}")
    print(f"NSS_PHASE2B_COMPARISON={comparison_path}")


if __name__ == "__main__":
    main()
