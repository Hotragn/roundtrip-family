"""The safety and privacy pages' banner: calm open water with soft sun reflections.

Early morning: the low sun sits a little left of straight ahead, so its glitter path runs down
the water toward the viewer.

Blender's Ocean modifier (a calm sea: light wind, low choppiness) tiled out to two kilometres,
with flat water beyond to the horizon. The mid-morning sun is just above and left of the frame,
so its glitter falls on the water in front of the camera. Output: .renders/sea-banner.png.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import common as c  # noqa: E402

HDRI = "kloppenheim_06_puresky_4k.hdr"  # a low morning sun, so its glitter path runs down the water
VIEW_AZIMUTH = 90.0  # the camera looks along +y
ROT = None  # set below so the sun sits a little left of the view direction

scene = c.reset()
scene.view_settings.look = "AgX - Base Contrast"
scene.view_settings.exposure = 0.15
alpha_t, _ = None, None
el0, yaw0 = c.hdri_sun(HDRI, 0.0)
sun_tex_azimuth = yaw0 - 90.0
target = VIEW_AZIMUTH + 9.0  # a little left of the view direction
ROT = sun_tex_azimuth - target
c.world_hdri(HDRI, strength=1.0, rotation_deg=ROT)
elev, yaw = c.hdri_sun(HDRI, ROT)
c.sun((max(elev, 3.0), yaw), strength=4.0, color=(1.0, 0.86, 0.68), angle_deg=0.8)
print("SUN", elev, yaw - 90)

water = c.principled(
    "Water",
    color=(0.006, 0.05, 0.06, 1),
    roughness=0.035,
    **{"IOR": 1.333, "Specular IOR Level": 0.6, "Coat Weight": 0.0},
)

bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
sea = bpy.context.active_object
ocean = sea.modifiers.new("Ocean", "OCEAN")
ocean.geometry_mode = "GENERATE"
ocean.resolution = 14
ocean.spatial_size = 60
ocean.size = 1
ocean.repeat_x = 34
ocean.repeat_y = 34
ocean.wave_scale = 0.45
ocean.choppiness = 0.8
ocean.wind_velocity = 5.0
ocean.wave_alignment = 0.35
ocean.wave_direction = 0.4
ocean.random_seed = 7
sea.location = (-60 * 17, -150, 0)  # tiles run forward from just behind the camera
sea.data.materials.append(water)
c.smooth(sea)

# Flat water beyond the ocean tiles, out to the horizon.
bpy.ops.mesh.primitive_plane_add(size=40000, location=(0, 21000, -0.05))
far = bpy.context.active_object
far.data.materials.append(water)

c.mist_composite(color=(0.9, 0.88, 0.86), start=300, depth=7000, amount=0.45)

c.persp_camera(location=(0, -140, 4.0), look_at=(0, 600, -9.0), lens=32)
scale = float(c.args()[0]) if c.args() else 1.0
c.render("sea-banner", int(3200 * scale), int(1100 * scale), samples=128, transparent=False)
