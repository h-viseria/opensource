"""Generate simple PNG app icons without extra deps."""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "icons"


def png(size: int, paint) -> bytes:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(paint(x, y, size))
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def color(x, y, size):
    # forest square, teal arc, pale coin
    r = (x - size * 0.5) ** 2 + (y - size * 0.4) ** 2
    coin = (size * 0.12) ** 2
    if r < coin:
        return (243, 246, 244, 255)
    # arc band
    cx, cy = size * 0.5, size * 0.62
    d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
    if size * 0.22 < d < size * 0.28 and y > cy - size * 0.02:
        return (125, 206, 192, 255)
    return (20, 51, 43, 255)


def main():
    ROOT.mkdir(exist_ok=True)
    for s in (192, 512):
        (ROOT / f"icon-{s}.png").write_bytes(png(s, color))
    print("icons written")


if __name__ == "__main__":
    main()
