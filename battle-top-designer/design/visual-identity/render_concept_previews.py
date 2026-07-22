"""Render deterministic PNG review previews for the Stage 5A SVG concepts."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


SIZE = 1024
ROOT = Path(__file__).resolve().parent


def canvas() -> bytearray:
    return bytearray([8, 13, 22, 255] * SIZE * SIZE)


def pixel(image: bytearray, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < SIZE and 0 <= y < SIZE:
        offset = (y * SIZE + x) * 4
        image[offset:offset + 4] = bytes(color)


def circle(image: bytearray, cx: int, cy: int, radius: int, color: tuple[int, int, int, int]) -> None:
    radius_squared = radius * radius
    for y in range(max(0, cy - radius), min(SIZE, cy + radius + 1)):
        for x in range(max(0, cx - radius), min(SIZE, cx + radius + 1)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius_squared:
                pixel(image, x, y, color)


def line(image: bytearray, start: tuple[int, int], end: tuple[int, int], width: int, color: tuple[int, int, int, int]) -> None:
    dx, dy = end[0] - start[0], end[1] - start[1]
    steps = max(abs(dx), abs(dy), 1)
    for index in range(steps + 1):
        x = round(start[0] + dx * index / steps)
        y = round(start[1] + dy * index / steps)
        circle(image, x, y, max(1, width // 2), color)


def write_png(path: Path, image: bytearray) -> None:
    raw = b''.join(b'\x00' + bytes(image[row * SIZE * 4:(row + 1) * SIZE * 4]) for row in range(SIZE))
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def solar_wolf() -> bytearray:
    image = canvas()
    circle(image, 512, 512, 400, (27, 27, 31, 255))
    circle(image, 512, 512, 370, (246, 184, 59, 255))
    circle(image, 512, 512, 315, (23, 29, 37, 255))
    for start, end in [((512, 110), (512, 260)), ((165, 312), (340, 390)), ((859, 312), (684, 390)), ((250, 810), (395, 680)), ((774, 810), (629, 680))]:
        line(image, start, end, 34, (246, 184, 59, 255))
    for start, end in [((374, 365), (482, 456)), ((650, 365), (542, 456)), ((392, 535), (484, 570)), ((632, 535), (540, 570)), ((512, 555), (512, 730))]:
        line(image, start, end, 48, (54, 64, 76, 255))
    line(image, (424, 510), (472, 535), 22, (216, 31, 53, 255))
    line(image, (600, 510), (552, 535), 22, (216, 31, 53, 255))
    return image


def storm_fang() -> bytearray:
    image = canvas()
    circle(image, 512, 512, 400, (12, 30, 47, 255))
    circle(image, 512, 512, 356, (20, 58, 83, 255))
    for start, end in [((510, 160), (730, 385)), ((820, 610), (562, 620)), ((265, 760), (390, 520))]:
        line(image, start, end, 72, (22, 118, 190, 255))
        line(image, start, end, 20, (78, 227, 242, 255))
    circle(image, 512, 512, 116, (17, 37, 57, 255))
    circle(image, 512, 512, 62, (57, 217, 236, 255))
    return image


write_png(ROOT / 'solar-wolf-preview.png', solar_wolf())
write_png(ROOT / 'storm-fang-preview.png', storm_fang())
