"""The waterline track's handle: a modern harbour passenger catamaran in side view, sailing right,
cut at the waterline so it sits on the track.

Modelled on 30 m harbour ferries: a long low hull with a near-vertical bow and a rising sheer,
a navy hull with a sea-teal sheer stripe and a dark boot-top, a main cabin with a continuous
window band and raked front glass, an upper deck and a wheelhouse with raked windows, window
mullions, a radar mast, life-raft canisters, railings, and a white bow wave at the waterline.
Output: .renders/ferry.png (transparent).
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import common as c  # noqa: E402

LEN = 30.0
BEAM = 9.0

scene = c.reset()
c.world_hdri("qwantani_puresky_4k.hdr", strength=1.0, rotation_deg=60, visible=False)
c.sun((40, 205), strength=4.0, color=(1.0, 0.97, 0.92), angle_deg=0.9)

navy = c.principled("Navy", color=(0.035, 0.06, 0.13, 1), roughness=0.25, **{"Coat Weight": 0.7, "Coat Roughness": 0.05})
boot = c.principled("BootTop", color=(0.02, 0.02, 0.025, 1), roughness=0.4)
teal = c.principled("Teal", color=(0.02, 0.44, 0.41, 1), roughness=0.25, **{"Coat Weight": 0.6})
white = c.principled("White", color=(0.92, 0.925, 0.93, 1), roughness=0.25, **{"Coat Weight": 0.5, "Coat Roughness": 0.06})
glass = c.principled("Glass", color=(0.012, 0.02, 0.03, 1), roughness=0.08, **{"Coat Weight": 0.6})
steel = c.principled("Steel", color=(0.8, 0.81, 0.82, 1), metallic=1.0, roughness=0.25)
dark = c.principled("Dark", color=(0.03, 0.03, 0.035, 1), roughness=0.5)


def extrude_profile(name, pts, y0, y1, material, bevel=0.1):
    """Extrude a side profile [(x, z), ...] across the beam from y0 to y1."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts]
    b = [bm.verts.new((x, y1, z)) for x, z in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    return obj


# Hull: waterline at z=0, a near-vertical bow at x=LEN, the sheer rising forward.
hull_pts = [(0.4, -1.4), (0.0, 0.2), (0.0, 2.3), (LEN * 0.5, 2.25), (LEN * 0.85, 2.55), (LEN, 3.05), (LEN - 0.35, 0.2), (LEN - 1.1, -1.4)]
hull = extrude_profile("Hull", hull_pts, -BEAM / 2, BEAM / 2, navy, bevel=0.18)
boot_top = extrude_profile("BootTop", [(0.02, -0.2), (0.02, 0.22), (LEN - 0.33, 0.22), (LEN - 0.42, -0.2)], -BEAM / 2 - 0.03, BEAM / 2 + 0.03, boot, bevel=0)
stripe = extrude_profile("Stripe", [(0.0, 1.9), (LEN * 0.5, 1.85), (LEN * 0.85, 2.15), (LEN - 0.06, 2.62), (LEN - 0.06, 2.88), (LEN * 0.85, 2.42), (LEN * 0.5, 2.12), (0.0, 2.17)], -BEAM / 2 - 0.03, BEAM / 2 + 0.03, teal, bevel=0)
# Narrow the forward hull in plan so the bow reads in the light; the stripe and boot-top follow.
for obj in (hull, boot_top, stripe):
    for v in obj.data.vertices:
        k = max(0.0, (v.co.x - LEN * 0.7) / (LEN * 0.3))
        v.co.y *= 1 - 0.55 * k**2

# Main cabin: raked front, continuous window band with mullions.
cab = [(1.6, 2.25), (1.6, 4.9), (LEN * 0.66, 4.9), (LEN * 0.74, 2.45)]
extrude_profile("Cabin", cab, -(BEAM / 2 - 0.35), BEAM / 2 - 0.35, white, bevel=0.22)
band = [(2.0, 3.25), (2.0, 4.45), (LEN * 0.655, 4.45), (LEN * 0.705, 3.25)]
extrude_profile("CabinGlass", band, -(BEAM / 2 - 0.3), BEAM / 2 - 0.3, glass, bevel=0.05)
x = 3.3
while x < LEN * 0.64:
    c.box(f"Mullion{x:.1f}", (0.12, BEAM - 0.5, 1.2), (x, 0, 3.85), white)
    x += 1.55

# Upper deck and wheelhouse, both with raked glass.
upper = [(5.5, 4.9), (5.5, 6.9), (LEN * 0.55, 6.9), (LEN * 0.6, 4.9)]
extrude_profile("Upper", upper, -(BEAM / 2 - 1.0), BEAM / 2 - 1.0, white, bevel=0.2)
extrude_profile("UpperGlass", [(6.0, 5.5), (6.0, 6.45), (LEN * 0.545, 6.45), (LEN * 0.578, 5.5)], -(BEAM / 2 - 0.95), BEAM / 2 - 0.95, glass, bevel=0.04)
x = 7.3
while x < LEN * 0.53:
    c.box(f"UMullion{x:.1f}", (0.1, BEAM - 1.85, 0.95), (x, 0, 5.98), white)
    x += 1.7
wheel = [(LEN * 0.47, 6.9), (LEN * 0.47, 8.6), (LEN * 0.57, 8.6), (LEN * 0.62, 6.9)]
extrude_profile("Wheelhouse", wheel, -(BEAM / 2 - 1.4), BEAM / 2 - 1.4, white, bevel=0.18)
extrude_profile("WheelGlass", [(LEN * 0.49, 7.55), (LEN * 0.49, 8.25), (LEN * 0.565, 8.25), (LEN * 0.595, 7.55)], -(BEAM / 2 - 1.35), BEAM / 2 - 1.35, glass, bevel=0.03)
c.box("WheelRoof", (LEN * 0.12, BEAM - 2.4, 0.16), (LEN * 0.53, 0, 8.68), white, bevel=0.05)

# Radar mast and bar, navigation light, life-raft canisters on the upper deck aft.
c.box("Mast", (0.22, 0.22, 2.6), (LEN * 0.53, 0, 10.0), steel)
c.box("RadarBar", (2.2, 0.18, 0.12), (LEN * 0.53, 0, 10.6), dark, bevel=0.03)
c.box("MastArm", (0.9, 0.1, 0.1), (LEN * 0.53, 0, 11.1), steel)
for i, xx in enumerate((6.2, 7.5, 8.8)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.38, depth=1.05, location=(xx, -(BEAM / 2 - 1.6), 7.3))
    raft = bpy.context.active_object
    raft.rotation_euler = (0, math.pi / 2, 0)  # lying fore and aft, as canisters sit in their cradles
    raft.data.materials.append(white)
    c.smooth(raft)

# Railings: the open stern deck and the upper deck's open end.
for z, x0, x1, inset in ((2.3, 0.3, 1.5, 0.45), (4.9, 1.8, 5.3, 0.9)):
    y = -(BEAM / 2 - inset)
    for h in (1.0, 0.55):
        c.box(f"Rail{z}{h}", (x1 - x0, 0.05, 0.05), ((x0 + x1) / 2, y, z + h), steel)
    xx = x0
    while xx <= x1 + 0.01:
        c.box(f"Post{z}{xx:.2f}", (0.05, 0.05, 1.0), (xx, y, z + 0.5), steel)
        xx += 0.6

# Bow wave: a thin, frothy white skirt along the forward waterline.
foam = bpy.data.materials.new("Foam")
foam.use_nodes = True
nt = foam.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.95, 0.97, 0.98, 1)
bsdf.inputs["Roughness"].default_value = 0.6
noise = nt.nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 3.5
noise.inputs["Detail"].default_value = 8
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.45
ramp.color_ramp.elements[1].position = 0.62
nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bsdf.inputs["Alpha"])
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(LEN - 3.0, -BEAM / 2 + 1.2, 0.05))
wave = bpy.context.active_object
wave.scale = (5.5, 0.9, 0.55)
wave.data.materials.append(foam)
c.smooth(wave)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(4.0, -BEAM / 2 + 0.6, 0.0))
wake = bpy.context.active_object
wake.scale = (7.5, 0.7, 0.32)
wake.data.materials.append(foam)
c.smooth(wake)

# Waterline cut: a holdout below z=0, so nothing under the water shows.
holdout = bpy.data.materials.new("Holdout")
holdout.use_nodes = True
hn = holdout.node_tree
hn.nodes.clear()
hn.links.new(hn.nodes.new("ShaderNodeHoldout").outputs["Holdout"], hn.nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])
c.box("WaterMask", (400, 400, 20), (LEN / 2, 0, -10.0), holdout)

c.persp_camera(location=(LEN * 0.32, -160, 6.0), look_at=(LEN * 0.5, 0, 4.2), lens=110)
scale = int(c.args()[0]) if c.args() else 1
c.render("ferry", 1400 * scale, 520 * scale, samples=160, transparent=True)
