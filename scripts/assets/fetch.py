"""Download the CC0 source assets for the baked renders into scripts/assets/.downloads/.

Poly Haven HDRIs and ambientCG PBR materials only, all CC0 (docs/assets.md lists each one).
Files already downloaded are kept. Run: python scripts/assets/fetch.py
Docs: https://api.polyhaven.com/ (files endpoint), https://docs.ambientcg.com/api/
"""

from __future__ import annotations

import json
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / ".downloads"
UA = {"User-Agent": "Roundtrip asset fetch (github.com/Hotragn/roundtrip-family)"}

# (Poly Haven id, resolution, what it lights)
HDRIS: list[tuple[str, str, str]] = [
    ("spruit_sunrise", "4k", "rail band at golden hour: the real horizon, haze and low sun"),
    ("kloppenheim_06_puresky", "4k", "early rail band drafts"),
    ("kloofendal_48d_partly_cloudy_puresky", "2k", "vehicle renders and track strips"),
    ("qwantani_puresky", "4k", "sea banner and waterline strip"),
]

# (ambientCG id, resolution, what it covers)
MATERIALS: list[tuple[str, str, str]] = [
    ("Gravel040", "1K-JPG", "rail ballast"),
    ("Concrete034", "1K-JPG", "concrete sleepers"),
    ("Grass004", "1K-JPG", "embankment grass"),
    ("Metal041B", "1K-JPG", "rusted rail sides"),
]


# (Poly Haven model id, resolution, what it's for)
MODELS: list[tuple[str, str, str]] = [
    ("island_tree_02", "1k", "tree lines behind the rail band"),
    ("tree_small_02", "1k", "tree lines behind the rail band"),
]


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def fetch_hdri(asset: str, res: str) -> Path:
    target = OUT / f"{asset}_{res}.hdr"
    if target.exists():
        return target
    files = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))
    url = files["hdri"][res]["hdr"]["url"]
    target.write_bytes(get(url))
    return target


def fetch_material(asset: str, res: str) -> Path:
    folder = OUT / asset
    if folder.exists() and any(folder.iterdir()):
        return folder
    folder.mkdir(parents=True, exist_ok=True)
    zip_path = OUT / f"{asset}_{res}.zip"
    zip_path.write_bytes(get(f"https://ambientcg.com/get?file={asset}_{res}.zip"))
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(folder)
    zip_path.unlink()
    return folder


def fetch_model(asset: str, res: str) -> Path:
    """A .blend model and the textures it references, kept at their relative paths."""
    folder = OUT / "models" / asset
    blend = folder / f"{asset}_{res}.blend"
    if blend.exists():
        return blend
    folder.mkdir(parents=True, exist_ok=True)
    files = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))
    entry = files["blend"][res]["blend"]
    for rel, inc in entry.get("include", {}).items():
        target = folder / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(get(inc["url"]))
    blend.write_bytes(get(entry["url"]))
    return blend


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for asset, res, use in HDRIS:
        path = fetch_hdri(asset, res)
        print(f"HDRI {asset} ({res}) for {use}: {path.stat().st_size // 1_000_000} MB")
    for asset, res, use in MATERIALS:
        folder = fetch_material(asset, res)
        print(f"Material {asset} ({res}) for {use}: {len(list(folder.iterdir()))} files")
    for asset, res, use in MODELS:
        blend = fetch_model(asset, res)
        print(f"Model {asset} ({res}) for {use}: {blend.stat().st_size // 1_000_000} MB")


if __name__ == "__main__":
    main()
