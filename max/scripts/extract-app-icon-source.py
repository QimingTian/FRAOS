#!/usr/bin/env python3
"""Extract the Borean mark (no wordmark) from BOREAN LOGO.png into shared/app-icon-source.png."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LOGO = ROOT / 'BOREAN LOGO.png'
OUT = Path(__file__).resolve().parents[1] / 'shared' / 'app-icon-source.png'

CROP_WIDTH_RATIO = 0.42
MIN_COMPONENT_PIXELS = 200


def is_ink(r: int, g: int, b: int) -> bool:
    return not (r > 240 and g > 240 and b > 240)


def remove_small_components(icon: Image.Image, min_pixels: int) -> Image.Image:
    """Drop stray wordmark fragments (e.g. em-dash specks) while keeping B + orbit + star."""
    rgba = icon.convert('RGBA')
    w, h = rgba.size
    mask = [[rgba.getpixel((x, y))[3] > 0 for x in range(w)] for y in range(h)]
    seen = [[False] * w for _ in range(h)]
    keep = [[False] * w for _ in range(h)]

    for sy in range(h):
        for sx in range(w):
            if not mask[sy][sx] or seen[sy][sx]:
                continue
            queue: deque[tuple[int, int]] = deque([(sx, sy)])
            seen[sy][sx] = True
            cells: list[tuple[int, int]] = []
            while queue:
                x, y = queue.popleft()
                cells.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        queue.append((nx, ny))

            if len(cells) >= min_pixels:
                for x, y in cells:
                    keep[y][x] = True

    cleaned = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    cpx = cleaned.load()
    src = rgba.load()
    for y in range(h):
        for x in range(w):
            if keep[y][x]:
                cpx[x, y] = src[x, y]

    return cleaned


def main() -> None:
    im = Image.open(LOGO).convert('RGBA')
    w, h = im.size
    px = im.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if is_ink(*px[x, y][:3]):
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)

    icon_right = minx + int((maxx - minx + 1) * CROP_WIDTH_RATIO)
    icon = im.crop((minx, miny, icon_right, maxy))

    transparent: list[tuple[int, int, int, int]] = []
    for r, g, b, _a in icon.getdata():
        if is_ink(r, g, b):
            transparent.append((r, g, b, 255))
        else:
            transparent.append((0, 0, 0, 0))
    icon.putdata(transparent)

    icon = remove_small_components(icon, MIN_COMPONENT_PIXELS)

    if icon.getbbox():
        icon = icon.crop(icon.getbbox())

    pad = int(max(icon.size) * 0.08)
    canvas = max(icon.size) + pad * 2
    square = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    ox = (canvas - icon.width) // 2
    oy = (canvas - icon.height) // 2
    square.paste(icon, (ox, oy), icon)

    master = square.resize((1024, 1024), Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    master.save(OUT)
    print(f'Wrote {OUT}')


if __name__ == '__main__':
    main()
