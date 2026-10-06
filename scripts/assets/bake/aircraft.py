"""The flight path's handle: a modern narrow-body twin jet in flight, seen from the side and a
little below, nose to the right.

Built to A320-family proportions (37.6 m long, 3.95 m wide, 34 m span): a lathed fuselage with a
rounded nose and an upswept tail cone, NACA-section wings with sweep, taper and dihedral, wingtip
fences, a belly fairing, lathed CFM56-style nacelles on pylons, and a sectioned tailplane and
fin. The livery (cabin windows, doors, cockpit glass, grey belly) is drawn into a texture that
is UV-mapped along the fuselage. Output: .renders/aircraft.png (transparent).
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
import common as c  # noqa: E402

L = 37.6  # fuselage length
R = 1.98  # fuselage radius

scene = c.reset()
c.world_hdri("kloofendal_48d_partly_cloudy_puresky_2k.hdr", strength=1.0, rotation_deg=40, visible=False)
# Sun from the camera side and a little ahead, so the side the viewer sees is lit.
c.sun((42, 205), strength=4.2, color=(1.0, 0.97, 0.93), angle_deg=0.8)

# ---------------------------------------------------------------- materials
WHITE = (0.93, 0.935, 0.945, 1)
BELLY = (0.68, 0.7, 0.73, 1)
paint = c.principled("Paint", color=WHITE, roughness=0.22, **{"Coat Weight": 0.7, "Coat Roughness": 0.04})
grey = c.principled("Grey", color=BELLY, metallic=0.25, roughness=0.32, **{"Coat Weight": 0.4})
fin_paint = c.principled("Fin", color=(0.11, 0.36, 0.66, 1), roughness=0.25, **{"Coat Weight": 0.7, "Coat Roughness": 0.04})
lip = c.principled("Lip", color=(0.8, 0.81, 0.83, 1), metallic=1.0, roughness=0.15)
fan_mat = c.principled("Fan", color=(0.025, 0.025, 0.03, 1), metallic=0.7, roughness=0.35)
exhaust = c.principled("Exhaust", color=(0.32, 0.31, 0.3, 1), metallic=0.9, roughness=0.45)


def airfoil(n: int = 18, t: float = 0.12) -> list[tuple[float, float]]:
    """A closed NACA 00xx section, upper surface leading edge to trailing edge, then back."""
    xs = [0.5 * (1 - math.cos(math.pi * i / n)) for i in range(n + 1)]
    yt = [5 * t * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4) for x in xs]
    upper = list(zip(xs, yt))
    lower = [(x, -y) for x, y in zip(xs[::-1], yt[::-1])][1:-1]
    return upper + lower


def lifting_surface(name, stations, material, vertical=False):
    """stations: (span, lead_x, chord, thickness, z_offset) from root to tip."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for span, lead, chord, thick, dz in stations:
        ring = []
        for px, pz in airfoil(t=thick):
            x = lead + px * chord
            if vertical:
                ring.append(bm.verts.new((x, pz * chord, span)))
            else:
                ring.append(bm.verts.new((x, span, dz + pz * chord)))
        rings.append(ring)
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def lathe(name, profile, material, axis_point=(0, 0, 0), seg=48, uv=False):
    """Revolve [(x, radius, centre_z)] around the x axis through axis_point."""
    ox, oy, oz = axis_point
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new() if uv else None
    rings = []
    for x, r, zc in profile:
        r = max(r, 0.01)
        rings.append([bm.verts.new((ox + x, oy + r * math.cos(2 * math.pi * j / seg), oz + zc + r * math.sin(2 * math.pi * j / seg))) for j in range(seg)])
    for i in range(len(rings) - 1):
        for j in range(seg):
            f = bm.faces.new((rings[i][j], rings[i][(j + 1) % seg], rings[i + 1][(j + 1) % seg], rings[i + 1][j]))
            if uv_layer:
                u0, u1 = profile[i][0] / L, profile[i + 1][0] / L
                v0, v1 = j / seg, (j + 1) / seg
                for loop, (u, v) in zip(f.loops, ((u0, v0), (u0, v1), (u1, v1), (u1, v0))):
                    loop[uv_layer].uv = (u, v)
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


# ---------------------------------------------------------------- fuselage
def fuselage_profile(x: float) -> tuple[float, float]:
    nose, tail = 6.0, 12.8
    if x < nose:
        k = x / nose
        r = R * (1 - (1 - k) ** 2.4) ** 0.5
        return r, -0.42 * (1 - k) ** 2.2  # the nose sits a little low, as on the real aircraft
    if x > L - tail:
        k = (x - (L - tail)) / tail
        r = R * (1 - 0.84 * k**1.35)
        return r, R * 0.72 * k**1.55  # the underside sweeps up toward the tail cone
    return R, 0.0


stations = [L * (i / 120) for i in range(121)]
fus = lathe("Fuselage", [(x, *fuselage_profile(x)) for x in stations], paint, seg=64, uv=True)


def livery(w: int = 4096, h: int = 1024) -> tuple[bpy.types.Image, bpy.types.Image]:
    """Colour and window-mask textures. u runs nose to tail, v around the fuselage (0 = right
    side facing +y, 0.25 = top, 0.75 = bottom)."""
    u = (np.arange(w) + 0.5) / w * L
    v = (np.arange(h) + 0.5) / h * 2 * math.pi
    X, A = np.meshgrid(u, v)
    S = np.sin(A)
    col = np.empty((h, w, 4), np.float32)
    col[...] = WHITE
    belly = np.clip((-S - 0.42) / 0.06, 0, 1)[..., None]
    col[..., :3] = col[..., :3] * (1 - belly) + np.array(BELLY[:3]) * belly
    mask = np.zeros((h, w), np.float32)

    def rrect(cx, ca, half_x, half_a, radius):
        dx = np.maximum(np.abs(X - cx) - (half_x - radius), 0)
        da = np.maximum(np.abs(A - ca) * R - (half_a - radius), 0)
        return np.sqrt(dx**2 + da**2) <= radius

    for side in (0.0, math.pi):  # both sides; angles measured from the side midline
        ca = side + (0.22 if side == 0 else -0.22)
        x = 6.2
        while x < L - 12.4:
            if not (15.3 < x < 16.9):  # overwing exits interrupt the row
                mask[rrect(x, ca, 0.12, 0.18, 0.08)] = 1
            x += 0.533
        # Cockpit: windscreen and two side windows, the lower edge sloping toward the nose.
        for x0, x1 in ((1.45, 2.15), (2.22, 2.78), (2.85, 3.25)):
            for xi in np.linspace(x0, x1, 12):
                low = 0.08 + 0.1 * (3.3 - xi)
                band = (np.abs(X - xi) < (x1 - x0) / 22) & (S * (1 if side == 0 else 1) > low) & (S < low + 0.33)
                band &= (np.cos(A) > 0) if side == 0 else (np.cos(A) < 0)
                mask[band] = 1
        # Door outlines: thin grey lines.
        for dx0, wd in ((3.7, 0.82), (L - 11.3, 0.82), (15.45, 0.5), (16.25, 0.5)):
            ring = rrect(dx0 + wd / 2, ca - 0.05, wd / 2, 0.95, 0.1) & ~rrect(dx0 + wd / 2, ca - 0.05, wd / 2 - 0.025, 0.925, 0.08)
            col[ring, :3] = (0.6, 0.62, 0.65)
    col_img = bpy.data.images.new("Livery", w, h, alpha=False)
    col_img.pixels.foreach_set(col.ravel())
    col_img.pack()
    m = np.zeros((h, w, 4), np.float32)
    m[..., 0] = m[..., 1] = m[..., 2] = mask
    m[..., 3] = 1
    # Created as data: changing the colour space after writing pixels would regenerate a blank image.
    mask_img = bpy.data.images.new("Windows", w, h, alpha=False, is_data=True)
    mask_img.pixels.foreach_set(m.ravel())
    mask_img.pack()
    return col_img, mask_img


col_img, mask_img = livery()
mat = bpy.data.materials.new("FuselageLivery")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
body = nt.nodes.new("ShaderNodeBsdfPrincipled")
body.inputs["Roughness"].default_value = 0.22
body.inputs["Coat Weight"].default_value = 0.7
body.inputs["Coat Roughness"].default_value = 0.04
glass = nt.nodes.new("ShaderNodeBsdfPrincipled")
glass.inputs["Base Color"].default_value = (0.01, 0.014, 0.022, 1)
glass.inputs["Roughness"].default_value = 0.1
glass.inputs["Coat Weight"].default_value = 0.4
tcol = nt.nodes.new("ShaderNodeTexImage")
tcol.image = col_img
tmask = nt.nodes.new("ShaderNodeTexImage")
tmask.image = mask_img
mix = nt.nodes.new("ShaderNodeMixShader")
nt.links.new(tcol.outputs["Color"], body.inputs["Base Color"])
nt.links.new(tmask.outputs["Color"], mix.inputs["Fac"])
nt.links.new(body.outputs["BSDF"], mix.inputs[1])
nt.links.new(glass.outputs["BSDF"], mix.inputs[2])
nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
fus.data.materials.clear()
fus.data.materials.append(mat)

# Belly fairing where the wings meet the fuselage.
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(16.2, 0, -1.25))
fairing = bpy.context.active_object
fairing.scale = (7.6, 2.05, 1.05)
fairing.data.materials.append(grey)
c.smooth(fairing)

# ---------------------------------------------------------------- wings
SWEEP = math.tan(math.radians(27))
DIHEDRAL = math.tan(math.radians(5.5))
for side in (1, -1):
    st = []
    for span, chord, thick in ((0.0, 6.6, 0.15), (2.0, 6.1, 0.14), (6.0, 4.0, 0.12), (17.0, 1.55, 0.1)):
        st.append((span, 12.2 + span * SWEEP, chord, thick, -1.15 + span * DIHEDRAL))
    wing = lifting_surface(f"Wing{side}", st, paint)
    wing.scale.y = side
    # Wingtip fence (sharklet): canted up and back from the tip.
    tip_x = 12.2 + 17.0 * SWEEP
    fence = lifting_surface(
        f"Fence{side}",
        [(0.0, tip_x + 0.05, 1.45, 0.09, 0), (2.3, tip_x + 1.25, 0.55, 0.08, 0)],
        paint,
        vertical=True,
    )
    fence.location = (0, side * 17.0, -1.15 + 17.0 * DIHEDRAL)
    fence.rotation_euler = (math.radians(-14 * side), 0, 0)
    # Flap-track fairings: slim canoes under the trailing edge.
    for span in (6.5, 10.5):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(12.2 + span * SWEEP + 3.4, side * span, -1.15 + span * DIHEDRAL - 0.28))
        canoe = bpy.context.active_object
        canoe.scale = (1.7, 0.18, 0.22)
        canoe.data.materials.append(grey)
        c.smooth(canoe)

    # Engine: a lathed nacelle with a polished intake lip, the fan face and an exhaust cone.
    ex, ey, ez = 9.7, side * 5.75, -2.25
    nacelle = [(0.0, 0.86, 0), (0.08, 0.95, 0), (0.3, 1.02, 0), (1.2, 1.06, 0), (2.6, 1.0, 0), (3.6, 0.82, 0), (4.3, 0.62, 0)]
    lathe(f"Nacelle{side}", nacelle, paint, axis_point=(ex, ey, ez))
    lathe(f"Lip{side}", [(-0.02, 0.78, 0), (0.05, 0.9, 0), (0.16, 0.97, 0)], lip, axis_point=(ex, ey, ez))
    lathe(f"FanFace{side}", [(0.25, 0.01, 0), (0.25, 0.8, 0), (0.3, 0.82, 0)], fan_mat, axis_point=(ex, ey, ez))
    lathe(f"Cone{side}", [(4.1, 0.55, 0), (4.6, 0.42, 0), (5.3, 0.05, 0)], exhaust, axis_point=(ex, ey, ez))
    c.box(f"Pylon{side}", (3.6, 0.32, 1.0), (ex + 2.6, ey, ez + 1.15), paint, bevel=0.12)

# ---------------------------------------------------------------- tail
tail_root_x = L - 6.6
for side in (1, -1):
    st = [(0.0, tail_root_x, 3.7, 0.1, 1.05), (6.2, tail_root_x + 6.2 * math.tan(math.radians(31)), 1.3, 0.09, 1.05 + 6.2 * math.tan(math.radians(6)))]
    tp = lifting_surface(f"Tailplane{side}", st, paint)
    tp.scale.y = side
fin = lifting_surface(
    "Fin",
    [(1.2, L - 8.2, 5.9, 0.1, 0), (7.6, L - 8.2 + 6.4 * math.tan(math.radians(38)), 1.9, 0.09, 0)],
    fin_paint,
    vertical=True,
)

# ---------------------------------------------------------------- camera
# On the +y side, a little below and ahead: screen right is -x, so the nose leads to the right.
c.persp_camera(location=(-26, 160, -18), look_at=(19.5, 0, 0.6), lens=88)
scale = int(c.args()[0]) if c.args() else 1
c.render("aircraft", 1600 * scale, 560 * scale, samples=160, transparent=True)
