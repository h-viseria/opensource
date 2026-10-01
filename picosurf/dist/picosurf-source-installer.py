#!/usr/bin/env python3
"""PicoSurf source installer — extracts desktop + Android source trees (no third-party caches).

Usage:
  python picosurf-source-installer.py <destination_folder> [--zip path/to/archive.zip]

Keep picosurf-source-0.1.0.zip in the same folder as this script, or pass --zip explicitly.

Example:
  python picosurf-source-installer.py C:/build/picosurf

Then build desktop:
  cd C:/build/picosurf/desktop
  npm ci
  powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1

Android (separate tree under android/):
  cd C:/build/picosurf/android
  npm ci
  See README.md for JDK, Android SDK, and npm run android:build-apk

See README.md in each folder for prerequisites.
"""

from __future__ import annotations

import argparse
import base64
import io
import sys
import zipfile
from pathlib import Path

DEFAULT_ZIP_NAME = "picosurf-source-0.1.0.zip"
EMBEDDED_ZIP_B64 = ""



def resolve_archive(installer: Path, zip_arg: str | None) -> Path:
    if zip_arg:
        path = Path(zip_arg).expanduser().resolve()
        if not path.is_file():
            raise SystemExit(f"Zip not found: {path}")
        return path
    if EMBEDDED_ZIP_B64:
        return Path()  # sentinel: use embedded bytes
    for candidate in (
        installer.parent / DEFAULT_ZIP_NAME,
        installer.with_suffix(".zip"),
    ):
        if candidate.is_file():
            return candidate
    raise SystemExit(
        f"Source zip not found. Place {DEFAULT_ZIP_NAME} next to this script,\n"
        f"or run: python {installer.name} <dest> --zip path/to/{DEFAULT_ZIP_NAME}"
    )


def read_zip_bytes(archive: Path, installer: Path) -> bytes:
    if EMBEDDED_ZIP_B64:
        return base64.b64decode(EMBEDDED_ZIP_B64)
    return archive.read_bytes()


def verify_extracted_tree(dest: Path) -> None:
    bundle = (dest / "desktop" / "scripts" / "build.ps1").is_file() and (
        dest / "android" / "package.json"
    ).is_file()
    legacy = (dest / "scripts" / "build.ps1").is_file()
    if bundle or legacy:
        return
    raise SystemExit(
        f"Extract finished but expected desktop/scripts/build.ps1 and android/package.json "
        f"under {dest} — archive may be corrupt or an old layout."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract PicoSurf source tree.")
    parser.add_argument("destination", help="Empty or new folder for the source tree")
    parser.add_argument("--zip", dest="zip_path", help="Path to picosurf-source zip")
    args = parser.parse_args()

    dest = Path(args.destination).expanduser()
    try:
        dest = dest.resolve()
    except OSError:
        dest = dest.absolute()

    installer = Path(__file__).resolve()
    archive = resolve_archive(installer, args.zip_path)
    payload = read_zip_bytes(archive, installer)

    if dest.exists():
        if not dest.is_dir():
            raise SystemExit(f"Destination exists and is not a folder: {dest}")
        if any(dest.iterdir()):
            raise SystemExit(
                f"Destination folder is not empty: {dest}\n"
                "Choose an empty folder or a new path."
            )
    else:
        dest.mkdir(parents=True, exist_ok=True)

    print(f"Extracting to {dest} …")
    with zipfile.ZipFile(io.BytesIO(payload), "r") as zf:
        zf.extractall(dest)

    verify_extracted_tree(dest)

    print("Done.")
    print()
    print("Next steps (bundle layout):")
    print(f"  cd {dest / 'desktop'}")
    print(r"  npm ci")
    print(r"  powershell -ExecutionPolicy Bypass -File .\scripts\build.ps1")
    print()
    print(f"  cd {dest / 'android'}")
    print(r"  npm ci")
    print(r"  npm run android:build-apk   # see README.md for Android SDK / Java")


if __name__ == "__main__":
    main()
