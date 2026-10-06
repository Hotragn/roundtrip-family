"""The sea pages' scroll track: calm water seen from directly above, one Ocean-modifier tile.

The Ocean modifier is periodic over its spatial size, so a render that frames exactly one tile
tiles seamlessly in both directions. The page uses a thin horizontal slice of it as the
waterline the ferry sails along. Output: .renders/water-strip.png (square, tileable).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import common as c  # noqa: E402

TILE = 30.0  # metres

scene = c.reset()
scene.view_settings.look = "AgX - Base Contrast"
c.world_hdri("qwantani_puresky_4k.hdr", strength=0.8, visible=False)
elev, yaw = c.hdri_sun("qwantani_puresky_4k.hdr", 0.0)
c.sun((elev, yaw), strength=2.6, color=(1.0, 0.97, 0.92), angle_deg=0.6)

water = c.principled(
    "Water",
    color=(0.01, 0.2, 0.2, 1),
    roughness=0.06,
    **{"IOR": 1.333, "Specular IOR Level": 0.35},
)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
sea = bpy.context.active_object
ocean = sea.modifiers.new("Ocean", "OCEAN")
ocean.geometry_mode = "GENERATE"
ocean.resolution = 14
ocean.spatial_size = int(TILE)
ocean.size = 1
ocean.repeat_x = 3
ocean.repeat_y = 3
ocean.wave_scale = 0.35
ocean.choppiness = 0.8
ocean.wind_velocity = 4.0
ocean.wave_alignment = 0.3
ocean.random_seed = 3
sea.location = (-TILE * 1.5, -TILE * 1.5, 0)
sea.data.materials.append(water)
c.smooth(sea)

# Straight down over the middle tile.
c.ortho_camera((0, 0, 50), (0, 0, 0), ortho_scale=TILE)
scale = int(c.args()[0]) if c.args() else 1
c.render("water-strip", 1024 * scale, 1024 * scale, samples=96, transparent=False)
