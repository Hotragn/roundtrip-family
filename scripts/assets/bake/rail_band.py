"""The dashboard's top band: a railway line across open country at golden hour.

A standard-gauge track on a ballast embankment runs across the frame and away to the right,
with overhead-line masts and wires every 55 m. The low sun sits just beyond the right edge,
behind the line, so the rails catch the light and the masts throw long shadows toward the
viewer. Grassland, distant hills and a warm haze for depth; the sky is the HDRI's own.
Output: .renders/rail-band.png (3200 x 1100; the page shows a horizontal slice).
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy  # noqa: E402
import common as c  # noqa: E402

HDRI = "kloppenheim_06_puresky_4k.hdr"  # sky only: the land is ours, so nothing in the photo looms
ROT = -70.3  # turns the HDRI so its low sun sits in the right part of the frame: backlit, warm
GAUGE = 1.435

scene = c.reset()
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.25
c.world_hdri(HDRI, strength=1.0, rotation_deg=ROT)
elev, yaw = c.hdri_sun(HDRI, ROT)
c.sun((max(elev, 5.0), yaw), strength=7.0, color=(1.0, 0.64, 0.36), angle_deg=1.2)

grass = c.pbr("Grass004", scale=(1 / 3, 1 / 3, 1 / 3), tint=(0.8, 0.74, 0.5, 1), bump=0.9)
# Grass is never a smooth sheet: full roughness and little specular, or at this grazing angle
# the field mirrors the sky like water.
g = grass.node_tree.nodes["Principled BSDF"]
for link in list(g.inputs["Roughness"].links):
    grass.node_tree.links.remove(link)
g.inputs["Roughness"].default_value = 1.0
g.inputs["Specular IOR Level"].default_value = 0.15
ballast = c.pbr("Gravel040", scale=(1 / 2.4, 1 / 2.4, 1 / 2.4), tint=(0.72, 0.68, 0.64, 1), bump=1.8)
concrete = c.pbr("Concrete034", scale=(1.2, 1.2, 1.2), tint=(0.62, 0.6, 0.57, 1), bump=0.8)
steel = c.principled("Railhead", color=(0.78, 0.78, 0.8, 1), metallic=1.0, roughness=0.16)
rust = c.pbr("Metal041B", scale=(2, 2, 2), tint=(0.55, 0.38, 0.27, 1), bump=0.4)
mast_mat = c.principled("Mast", color=(0.2, 0.21, 0.22, 1), metallic=0.8, roughness=0.5)
wire_mat = c.principled("Wire", color=(0.32, 0.22, 0.14, 1), metallic=1.0, roughness=0.35)

# Ground: gently rolling, with hills rising in the distance.
bpy.ops.mesh.primitive_grid_add(x_subdivisions=360, y_subdivisions=360, size=3000, location=(0, 1200, 0))
ground = bpy.context.active_object
tex = bpy.data.textures.new("Rolling", "CLOUDS")
tex.noise_scale = 220
tex.noise_depth = 4
disp = ground.modifiers.new("Displace", "DISPLACE")
disp.texture = tex
disp.texture_coords = "GLOBAL"
disp.strength = 16
disp.mid_level = 0.5
ground.data.materials.append(grass)
c.smooth(ground)
# Keep the land flat near the line: a vertex group that fades the displacement in with distance.
vg = ground.vertex_groups.new(name="Far")
for v in ground.data.vertices:
    d = abs(v.co.y + 1200 - 0)  # distance from the track in metres
    vg.add([v.index], min(1.0, max(0.0, (d - 60) / 500)) ** 1.5, "REPLACE")
disp.vertex_group = "Far"

# The embankment and track, from x=-500 to x=600.
LENGTH = 1100
cx = 50
c.box("Shoulder", (LENGTH, 7.2, 0.5), (cx, 0, 0.12), ballast, bevel=0.0)
bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, 0, 0.55))
bed = bpy.context.active_object
bed.scale = (LENGTH, 4.0, 0.35)
bpy.ops.object.transform_apply(scale=True)
bed.data.materials.append(ballast)
sleeper = c.box("Sleeper", (0.28, 2.6, 0.2), (cx - LENGTH / 2, 0, 0.78), concrete, bevel=0.012)
arr = sleeper.modifiers.new("Array", "ARRAY")
arr.count = int(LENGTH / 0.6)
arr.use_relative_offset = False
arr.use_constant_offset = True
arr.constant_offset_displace = (0.6, 0, 0)
for side in (-1, 1):
    y = side * (GAUGE / 2 + 0.036)
    c.box(f"RailFoot{side}", (LENGTH, 0.15, 0.014), (cx, y, 0.88), rust)
    c.box(f"RailWeb{side}", (LENGTH, 0.017, 0.11), (cx, y, 0.94), rust)
    c.box(f"RailHead{side}", (LENGTH, 0.072, 0.045), (cx, y, 1.02), steel, bevel=0.008)

# Overhead line: masts on the far side, cantilevers over the track, contact and messenger wires.
x = -480.0
while x < 600:
    c.box(f"Mast{x:.0f}", (0.26, 0.26, 8.0), (x, 3.4, 4.6), mast_mat)
    c.box(f"Arm{x:.0f}", (0.08, 3.6, 0.08), (x, 1.7, 7.4), mast_mat)
    c.box(f"Brace{x:.0f}", (0.06, 3.4, 0.06), (x, 1.75, 6.1), mast_mat)
    x += 55.0
for z in (6.15, 7.35):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.012 if z < 7 else 0.009, depth=LENGTH, location=(cx, 0.0, z))
    wire = bpy.context.active_object
    wire.rotation_euler = (0, math.pi / 2, 0)
    wire.data.materials.append(wire_mat)

# Tree lines: Poly Haven's CC0 tree models, instanced along hedgerows at 170 to 650 m.
import random

random.seed(11)


def tree_collection(asset: str) -> bpy.types.Collection:
    path = c.DL / "models" / asset / f"{asset}_1k.blend"
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = list(src.objects)
    col = bpy.data.collections.new(asset)
    lowest = None
    for obj in dst.objects:
        if obj is None or obj.type not in {"MESH", "EMPTY"}:
            continue
        col.objects.link(obj)
        if obj.type == "MESH":
            z = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
            lowest = z if lowest is None else min(lowest, z)
    col.instance_offset = (0, 0, lowest or 0)
    return col


trees = [tree_collection("island_tree_02"), tree_collection("tree_small_02")]
for row_y, spacing, smin, smax in ((150.0, 7.0, 1.0, 1.4), (230.0, 5.0, 1.1, 1.7), (380.0, 4.0, 1.3, 2.1), (600.0, 3.2, 1.6, 2.6), (900.0, 2.6, 1.8, 3.0)):
    x = -700.0
    while x < 800:
        inst = bpy.data.objects.new("Tree", None)
        inst.instance_type = "COLLECTION"
        inst.instance_collection = random.choice(trees)
        k = random.uniform(smin, smax)
        inst.scale = (k, k, k * random.uniform(0.9, 1.15))
        inst.rotation_euler = (0, 0, random.uniform(0, 2 * math.pi))
        inst.location = (x, row_y + random.uniform(-8, 8), 0)
        bpy.context.collection.objects.link(inst)
        x += spacing * random.uniform(0.5, 1.6)

c.mist_composite(color=(0.99, 0.82, 0.6), start=70, depth=1300, amount=0.55)
print("SUN", elev, yaw - 90)

# Camera: low, beside the line, looking across and a little along it toward the sun side.
c.persp_camera(location=(-6, -27, 2.0), look_at=(16, 0, 2.2), lens=30)
scale = float(c.args()[0]) if c.args() else 1.0
c.render("rail-band", int(3200 * scale), int(1100 * scale), samples=128, transparent=False)
