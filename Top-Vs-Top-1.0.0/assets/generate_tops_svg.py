#!/usr/bin/env python3
"""Generate SVG sprites for tops and pickups."""
import os

SVG_TPL = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  {elements}
</svg>'''

PICKUP_TPL = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  {elements}
</svg>'''

R = 24


def make_top(body_color, ring_color, accent_color):
    elements = []
    elements.append(f'<circle cx="32" cy="32" r="{R}" fill="{body_color}" stroke="{ring_color}" stroke-width="0.8"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R + 3}" fill="none" stroke="{accent_color}" stroke-width="0.5" opacity="0.15"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.75}" fill="none" stroke="{ring_color}" stroke-width="1.0" opacity="0.4"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.45}" fill="none" stroke="{accent_color}" stroke-width="1.2" opacity="0.6"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.25}" fill="{accent_color}" stroke="{ring_color}" stroke-width="0.6"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.1}" fill="#ffffff" opacity="0.85"/>')
    return SVG_TPL.format(elements='\n  '.join(elements))


def make_pickup(glow_color, core_color):
    """Concentric circles pickup."""
    elements = []
    # outer halo
    elements.append(f'<circle cx="16" cy="16" r="14" fill="none" stroke="{glow_color}" stroke-width="1.0" opacity="0.25"/>')
    # main ring
    elements.append(f'<circle cx="16" cy="16" r="10" fill="none" stroke="{glow_color}" stroke-width="1.8" opacity="0.5"/>')
    # inner ring
    elements.append(f'<circle cx="16" cy="16" r="6" fill="none" stroke="{core_color}" stroke-width="1.2" opacity="0.7"/>')
    # center dot
    elements.append(f'<circle cx="16" cy="16" r="3" fill="{glow_color}" stroke="{core_color}" stroke-width="0.5"/>')
    # spark
    elements.append(f'<circle cx="16" cy="14" r="1.0" fill="#ffffff" opacity="0.8"/>')
    return PICKUP_TPL.format(elements='\n  '.join(elements))


def make_elite_top(body_color, ring_color, accent_color, extra_color):
    elements = []
    elements.append(f'<circle cx="32" cy="32" r="{R}" fill="{body_color}" stroke="{ring_color}" stroke-width="1.0"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R + 4}" fill="none" stroke="{accent_color}" stroke-width="0.6" opacity="0.2"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.75}" fill="none" stroke="{ring_color}" stroke-width="1.2" opacity="0.5"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.6}" fill="none" stroke="{extra_color}" stroke-width="0.8" opacity="0.5"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.45}" fill="none" stroke="{accent_color}" stroke-width="1.4" opacity="0.7"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.25}" fill="{accent_color}" stroke="{ring_color}" stroke-width="0.8"/>')
    elements.append(f'<circle cx="32" cy="32" r="{R * 0.1}" fill="#ffffff" opacity="0.9"/>')
    return SVG_TPL.format(elements='\n  '.join(elements))


OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "svg")

def main():
    # Player top
    with open(os.path.join(OUT_DIR, "top_player.svg"), "w") as f:
        f.write(make_top(body_color="#1a4a7a", ring_color="#4499ff", accent_color="#88ddff"))
    print("Generated top_player.svg")

    # Enemy top (red — normal)
    with open(os.path.join(OUT_DIR, "top_enemy.svg"), "w") as f:
        f.write(make_top(body_color="#7a1a1a", ring_color="#ff4444", accent_color="#ff8844"))
    print("Generated top_enemy.svg")

    # Elite enemy top (purple — bigger, more stamina)
    with open(os.path.join(OUT_DIR, "top_elite.svg"), "w") as f:
        f.write(make_elite_top(body_color="#3a0a5a", ring_color="#aa44ff", accent_color="#dd88ff", extra_color="#cc66ff"))
    print("Generated top_elite.svg")

    # Spin pickup
    with open(os.path.join(OUT_DIR, "pickup.svg"), "w") as f:
        f.write(make_pickup(glow_color="#88ddff", core_color="#4a9eff"))
    print("Generated pickup.svg")


if __name__ == "__main__":
    main()
