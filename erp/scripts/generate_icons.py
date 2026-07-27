"""Generate PicoERP app icons: swastik with +, -, /, x in the four pockets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"

BRAND = (15, 61, 62, 255)  # #0f3d3e
INK = (247, 243, 236, 255)  # cream on brand
ACCENT = (212, 175, 95, 255)  # soft gold for operators


def draw_swastik(draw: ImageDraw.ImageDraw, size: int) -> None:
  """Right-facing (卐) swastik centered in square canvas."""
  m = size * 0.14  # margin
  arm = size * 0.14  # arm thickness
  cx = cy = size / 2
  half = size * 0.5 - m
  # Cross bars
  draw.rectangle([cx - arm / 2, cy - half, cx + arm / 2, cy + half], fill=INK)
  draw.rectangle([cx - half, cy - arm / 2, cx + half, cy + arm / 2], fill=INK)
  # Clockwise hooks (right-facing swastik)
  # Top arm → right
  draw.rectangle([cx - arm / 2, cy - half, cx + half, cy - half + arm], fill=INK)
  # Right arm → down
  draw.rectangle([cx + half - arm, cy - arm / 2, cx + half, cy + half], fill=INK)
  # Bottom arm → left
  draw.rectangle([cx - half, cy + half - arm, cx + arm / 2, cy + half], fill=INK)
  # Left arm → up
  draw.rectangle([cx - half, cy - half, cx - half + arm, cy + arm / 2], fill=INK)


def load_font(size: int) -> ImageFont.ImageFont:
  candidates = [
    "C:/Windows/Fonts/seguisb.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
  ]
  for path in candidates:
    try:
      return ImageFont.truetype(path, size=size)
    except OSError:
      continue
  return ImageFont.load_default()


def draw_ops(draw: ImageDraw.ImageDraw, size: int) -> None:
  """Place +, -, /, x in the four pockets between swastik arms."""
  font = load_font(max(14, int(size * 0.16)))
  # Pockets (approx centers of the open quadrants between hooks)
  # Top-left pocket: -
  # Top-right pocket: +
  # Bottom-right pocket: x
  # Bottom-left pocket: /
  spots = [
    (size * 0.355, size * 0.355, "-"),
    (size * 0.645, size * 0.355, "+"),
    (size * 0.645, size * 0.645, "x"),
    (size * 0.355, size * 0.645, "/"),
  ]
  for x, y, ch in spots:
    bbox = draw.textbbox((0, 0), ch, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x - tw / 2 - bbox[0], y - th / 2 - bbox[1]), ch, font=font, fill=ACCENT)


def make_icon(size: int) -> Image.Image:
  img = Image.new("RGBA", (size, size), BRAND)
  draw = ImageDraw.Draw(img)
  draw_swastik(draw, size)
  draw_ops(draw, size)
  # Slight inset ring for maskable friendliness
  inset = max(2, size // 48)
  draw.rounded_rectangle(
    [inset, inset, size - 1 - inset, size - 1 - inset],
    radius=size // 8,
    outline=(247, 243, 236, 55),
    width=max(1, size // 128),
  )
  return img


def write_svg() -> None:
  svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="PicoERP">
  <rect width="512" height="512" rx="64" fill="#0f3d3e"/>
  <!-- Right-facing swastik -->
  <g fill="#f7f3ec">
    <rect x="220" y="72" width="72" height="368" rx="8"/>
    <rect x="72" y="220" width="368" height="72" rx="8"/>
    <rect x="220" y="72" width="220" height="72" rx="8"/>
    <rect x="368" y="220" width="72" height="220" rx="8"/>
    <rect x="72" y="368" width="220" height="72" rx="8"/>
    <rect x="72" y="72" width="72" height="220" rx="8"/>
  </g>
  <!-- Operators in pockets -->
  <g fill="#d4af5f" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="72" text-anchor="middle" dominant-baseline="central">
    <text x="182" y="182">-</text>
    <text x="330" y="182">+</text>
    <text x="330" y="330">x</text>
    <text x="182" y="330">/</text>
  </g>
</svg>
"""
  OUT.mkdir(parents=True, exist_ok=True)
  (OUT / "icon.svg").write_text(svg, encoding="utf-8")


def main() -> None:
  OUT.mkdir(parents=True, exist_ok=True)
  write_svg()
  for size in (192, 512):
    make_icon(size).save(OUT / f"icon-{size}.png", "PNG")
  # Favicon-friendly 32
  make_icon(32).save(OUT / "favicon.png", "PNG")
  print(f"Wrote icons to {OUT}")


if __name__ == "__main__":
  main()
