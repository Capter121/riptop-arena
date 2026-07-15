"""Compose rendered catalog PNG files into review sheets."""

import argparse

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
RENDERS = ROOT / "reports" / "renders"


def contact_sheet(target: str, names: list[str], output_name: str) -> None:
    tile_size = 512
    sheet = Image.new("RGB", (tile_size * 3, tile_size * 3), "#101622")
    draw = ImageDraw.Draw(sheet)
    for index, name in enumerate(names[:8]):
        path = RENDERS / f"{target}_{name}.png"
        image = Image.open(path).convert("RGB").resize((tile_size, tile_size))
        x = index % 3 * tile_size
        y = index // 3 * tile_size
        sheet.paste(image, (x, y))
        draw.rectangle((x, y + 478, x + tile_size, y + tile_size), fill="#101622")
        draw.text((x + 14, y + 488), name.upper(), fill="white")
    draw.text((tile_size + 32, tile_size * 2 + 230), target.upper(), fill="white")
    output = RENDERS / output_name
    sheet.save(output)
    print(f"NSS_CONTACT_SHEET={output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target")
    parser.add_argument("--scope")
    args = parser.parse_args()
    if args.scope == "phase2a":
        for target in ("blade_storm_fang", "blade_iron_bastion", "blade_orbit_halo", "blade_dual_comet"):
            contact_sheet(target, ["top", "perspective_45", "side", "silhouette"], f"{target}_contact_sheet.png")
        return
    if args.target:
        names = ["top", "perspective_45", "side", "silhouette"]
        if args.target.startswith(("gear_", "tip_")):
            names = ["perspective_45", "side", "bottom", "side_silhouette"]
        contact_sheet(
            args.target,
            names,
            f"{args.target}_contact_sheet.png",
        )
        return
    contact_sheet(
        "assembly_storm_attack",
        ["top", "angle", "front", "side", "bottom", "rotated", "exploded", "silhouette"],
        "assembly_storm_attack_contact_sheet.png",
    )
    contact_sheet(
        "blade_storm_fang",
        ["top", "angle", "front", "side", "bottom", "rotated", "silhouette"],
        "storm_fang_contact_sheet.png",
    )
    silhouette = Image.open(RENDERS / "blade_storm_fang_silhouette.png").convert("RGB")
    silhouette.save(RENDERS / "all_blades_silhouette.png")
    print(f"NSS_SILHOUETTE_OVERVIEW={RENDERS / 'all_blades_silhouette.png'}")


if __name__ == "__main__":
    main()
