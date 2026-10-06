"""The dashboard's scroll track: a railway seen from directly above, as a vertically tileable strip.

Standard gauge (1,435 mm between the rails), concrete sleepers every 600 mm on crushed-stone
ballast, rail clips at each crossing. Three tiles are modeled and the middle one rendered, so
shadows and textures wrap without a seam. Output: .renders/rail-track.png (8 sleepers tall).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c  # noqa: E402

PERIOD = 4.8  # metres: eight sleepers
GAUGE = 1.435
SLEEPER = (2.6, 0.28, 0.2)
WIDTH = 3.6  # metres shown across the strip

scene = c.reset()
c.world_hdri("kloofendal_48d_partly_cloudy_puresky_2k.hdr", strength=0.9, visible=False)
c.sun((52, 125), strength=3.2, color=(1.0, 0.96, 0.9), angle_deg=1.5)

# Ballast: the texture repeats exactly once per tile in Y so the strip tiles.
ballast = c.pbr("Gravel040", scale=(1 / 2.4, 1 / 2.4, 1 / 2.4), tint=(0.74, 0.72, 0.7, 1), bump=2.2)
c.box("Ballast", (WIDTH * 2, PERIOD * 3, 0.1), (0, PERIOD / 2, -0.05), ballast)

concrete = c.pbr("Concrete034", scale=(1.2, 1.2, 1.2), tint=(0.6, 0.59, 0.56, 1), bump=1.0)
clip_mat = c.principled("Clip", color=(0.05, 0.05, 0.055, 1), metallic=0.6, roughness=0.45)
steel = c.principled("Railhead", color=(0.72, 0.73, 0.75, 1), metallic=1.0, roughness=0.22)
rust = c.pbr("Metal041B", scale=(2, 2, 2), tint=(0.62, 0.42, 0.3, 1), bump=0.4)

for i in range(-8, 16):
    y = (i + 0.5) * PERIOD / 8
    c.box(f"Sleeper{i}", SLEEPER, (0, y, SLEEPER[2] / 2 - 0.08), concrete, bevel=0.012)
    for side in (-1, 1):
        x = side * (GAUGE / 2 + 0.036)
        for dx in (-0.09, 0.09):
            c.box(f"Clip{i}{side}{dx}", (0.07, 0.11, 0.035), (x + dx, y, SLEEPER[2] - 0.06), clip_mat, bevel=0.006)

for side in (-1, 1):
    x = side * (GAUGE / 2 + 0.036)
    length = PERIOD * 3
    c.box(f"RailFoot{side}", (0.15, length, 0.014), (x, PERIOD / 2, SLEEPER[2] - 0.073), rust)
    c.box(f"RailWeb{side}", (0.017, length, 0.11), (x, PERIOD / 2, SLEEPER[2] - 0.01), rust)
    c.box(f"RailHead{side}", (0.072, length, 0.045), (x, PERIOD / 2, SLEEPER[2] + 0.065), steel, bevel=0.008)

# Straight down, framing exactly one tile.
c.ortho_camera((0, PERIOD / 2, 10), (0, 0, 0), ortho_scale=PERIOD)
scale = int(c.args()[0]) if c.args() else 160  # pixels per metre
c.render("rail-track", int(WIDTH * scale), int(PERIOD * scale), samples=96, transparent=False)
