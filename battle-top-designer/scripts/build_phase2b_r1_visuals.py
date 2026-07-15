"""Collect and compose the fixed Phase 2B-R1 human re-review images."""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
RENDERS = ROOT / "reports" / "renders"
R1 = RENDERS / "phase2b-r1"
ASSISTS = ("assist_heavy", "assist_guard", "assist_air")
FIXTURES = {
    "assist_heavy": "assembly_storm_attack",
    "assist_guard": "assembly_phase2b_assist_guard",
    "assist_air": "assembly_phase2b_assist_air",
}
VIEWS = ("top", "perspective_45", "side")


def compose(paths: list[Path], output: Path, tile_size: int) -> None:
    sheet = Image.new("RGB", (tile_size * len(paths), tile_size), "white")
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB").resize((tile_size, tile_size), Image.Resampling.LANCZOS)
        sheet.paste(image, (index * tile_size, 0))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def main() -> None:
    independent_root = R1 / "assists" / "independent"
    fixture_root = R1 / "assists" / "storm-fang-fixtures"
    comparison_root = R1 / "assists" / "comparisons"
    for assist in ASSISTS:
        (independent_root / assist).mkdir(parents=True, exist_ok=True)
        (fixture_root / assist).mkdir(parents=True, exist_ok=True)
        for view in (*VIEWS, "silhouette"):
            shutil.copy2(
                RENDERS / f"{assist}_{view}.png",
                independent_root / assist / f"{view}_512.png",
            )
        for view in VIEWS:
            shutil.copy2(
                RENDERS / f"{FIXTURES[assist]}_{view}.png",
                fixture_root / assist / f"{view}_512.png",
            )
    for view in (*VIEWS, "silhouette"):
        compose(
            [independent_root / assist / f"{view}_512.png" for assist in ASSISTS],
            comparison_root / f"independent_{view}_unlabeled.png",
            512,
        )
    for view in VIEWS:
        compose(
            [fixture_root / assist / f"{view}_512.png" for assist in ASSISTS],
            comparison_root / f"storm_fang_fixture_{view}_unlabeled.png",
            512,
        )
    compose(
        [fixture_root / assist / "perspective_45_512.png" for assist in ASSISTS],
        comparison_root / "storm_fang_fixture_thumbnail_128_unlabeled.png",
        128,
    )
    expected = [
        *R1.glob("dual-comet/before/*.png"),
        *R1.glob("dual-comet/after/*.png"),
        *R1.glob("dual-comet/before-after/*.png"),
        *R1.glob("dual-comet/metrics/*.png"),
        *R1.glob("assists/**/*.png"),
        *R1.glob("assist-focus/*.png"),
    ]
    relative = sorted(path.relative_to(ROOT).as_posix() for path in expected if path.is_file() and path.stat().st_size > 0)
    index = R1 / "index.md"
    index.write_text(
        "# Phase 2B-R1 视觉复审材料\n\n"
        "状态：Phase 2B-R1 awaiting visual re-review\n\n"
        "以下文件仅用于人工视觉复审，不构成原创性、制造或安全认证。\n\n"
        + "\n".join(f"- `{path}`" for path in relative)
        + "\n",
        encoding="utf-8",
    )
    print(f"NSS_PHASE2B_R1_VISUAL_COUNT={len(relative)}")
    print(f"NSS_PHASE2B_R1_VISUAL_INDEX={index}")


if __name__ == "__main__":
    main()
