"""The rail track's handle: the front of a modern electric train, seen from directly above,
heading down the page. Same scale, sun and sky as rail_track.py so it sits on the rails.
Output: .renders/train-front.png (transparent).
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import common as c  # noqa: E402

WIDTH = 3.6  # same strip width as the track
LENGTH = 10.0  # metres of train shown
BODY_W = 2.9

scene = c.reset()
c.world_hdri("kloofendal_48d_partly_cloudy_puresky_2k.hdr", strength=0.9, visible=False)
c.sun((52, 125), strength=3.2, color=(1.0, 0.96, 0.9), angle_deg=1.5)

paint = c.principled("Paint", color=(0.86, 0.87, 0.89, 1), roughness=0.28, **{"Coat Weight": 0.6, "Coat Roughness": 0.08})
roof = c.principled("Roof", color=(0.62, 0.64, 0.67, 1), metallic=0.4, roughness=0.45)
glass = c.principled("Glass", color=(0.015, 0.02, 0.03, 1), roughness=0.04, **{"Coat Weight": 1.0})
ink = c.principled("Ink", color=(0.06, 0.08, 0.14, 1), roughness=0.35, **{"Coat Weight": 0.5})
grey = c.principled("Equipment", color=(0.42, 0.44, 0.47, 1), metallic=0.5, roughness=0.5)


def nose_and_body() -> bpy.types.Object:
    """One smooth shell: a rounded box body that narrows and drops into a long, rounded nose."""
    mesh = bpy.data.meshes.new("Train")
    bm = bmesh.new()
    rings = []
    stations = 40
    segments = 28
    nose_len = 5.2
    for i in range(stations + 1):
        t = i / stations
        y = -nose_len + t * (LENGTH + nose_len) * 0.92  # nose tip at y=-nose_len, body runs back
        if y < 0:
            k = (y + nose_len) / nose_len  # 0 at the tip, 1 where the body starts
            half_w = BODY_W / 2 * math.sqrt(max(k, 0)) ** 0.85
            top = 1.1 + 2.9 * (1 - (1 - k) ** 2)
        else:
            half_w = BODY_W / 2
            top = 4.0
        ring = []
        for j in range(segments):
            a = 2 * math.pi * j / segments
            # A superellipse cross-section: flat sides, rounded roof edges.
            cx, cz = math.cos(a), math.sin(a)
            px = math.copysign(abs(cx) ** 0.35, cx) * max(half_w, 0.02)
            pz = 0.4 + (top - 0.4) * (0.5 + 0.5 * math.copysign(abs(cz) ** 0.35, cz))
            ring.append(bm.verts.new((px, y, pz)))
        rings.append(ring)
    for i in range(stations):
        for j in range(segments):
            a, b = rings[i][j], rings[i][(j + 1) % segments]
            d, e = rings[i + 1][j], rings[i + 1][(j + 1) % segments]
            bm.faces.new((a, b, e, d))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Train", mesh)
    bpy.context.collection.objects.link(obj)
    for m in (paint, glass, ink, roof):
        obj.data.materials.append(m)
    # Windscreen: a band across the nose, set back from the tip. Ink: the lower nose.
    # Roof: a grey strip down the middle, as on real electric trains.
    for poly in obj.data.polygons:
        cx, cy, cz = poly.center.x, poly.center.y, poly.center.z
        if -2.7 < cy < -1.1 and cz > 2.5:
            poly.material_index = 1
        elif cy < -1.0 and cz < 1.9:
            poly.material_index = 2
        elif cy > 0.3 and cz > 3.8 and abs(cx) < 0.95:
            poly.material_index = 3
        poly.use_smooth = True
    c.smooth(obj, subdiv=1)
    return obj


nose_and_body()
# Roof equipment: two air-conditioning units and a pantograph base, set back from the nose.
c.box("AC1", (1.7, 1.9, 0.34), (0, 2.6, 4.12), roof, bevel=0.12)
c.box("AC2", (1.7, 1.6, 0.3), (0, 6.2, 4.1), roof, bevel=0.12)
c.box("PantoBase", (1.2, 0.9, 0.18), (0, 8.4, 4.05), grey, bevel=0.05)
for x in (-0.45, 0.45):
    arm = c.box(f"Panto{x}", (0.06, 1.6, 0.06), (x, 8.4, 4.25), grey)
    arm.rotation_euler = (math.radians(12), 0, math.radians(18 if x > 0 else -18))

c.ortho_camera((0, LENGTH / 2 - 5.3, 20), (0, 0, 0), ortho_scale=LENGTH + 0.4)
scale = int(c.args()[0]) if c.args() else 120
c.render("train-front", int(WIDTH * scale), int((LENGTH + 0.4) * scale), samples=128, transparent=True)
