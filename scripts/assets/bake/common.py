"""Shared helpers for the Blender bake scripts (run headless: blender -b --factory-startup -P x.py).

Each script builds one scene from primitives and CC0 materials, renders it with Cycles, and
writes a PNG to scripts/assets/.renders/. scripts/assets/export.mjs turns those into WebP.
Blender Python API: https://docs.blender.org/api/current/
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
DL = ROOT / ".downloads"
RENDERS = ROOT / ".renders"
RENDERS.mkdir(parents=True, exist_ok=True)


def reset() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "16"
    return scene


def args() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def world_hdri(name: str, strength: float = 1.0, rotation_deg: float = 0.0, visible: bool = True) -> None:
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(rotation_deg))
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(DL / name))
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    world.cycles_visibility.camera = visible


def principled(name: str, color=(0.8, 0.8, 0.8, 1), metallic=0.0, roughness=0.5, **extra) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    for key, value in extra.items():
        bsdf.inputs[key].default_value = value
    return mat


def pbr(asset: str, scale: tuple[float, float, float] = (1, 1, 1), tint=None, bump: float = 1.0) -> bpy.types.Material:
    """An ambientCG material, mapped by object coordinates so tiles line up across objects."""
    folder = DL / asset
    mat = bpy.data.materials.new(asset)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = scale
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def tex(kind: str, non_color: bool):
        files = sorted(folder.glob(f"*_{kind}.jpg"))
        if not files:
            return None
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(files[0]), check_existing=True)
        if non_color:
            node.image.colorspace_settings.name = "Non-Color"
        # Box projection: each face takes the texture from its own axis, so the sides of boxes
        # (sleepers, ballast shoulders) don't streak.
        node.projection = "BOX"
        node.projection_blend = 0.25
        nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    color = tex("Color", False)
    if color:
        if tint:
            # The Mix node has float, vector and colour sockets that share names; use the
            # colour ones by identifier.
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            sock = {i.identifier: i for i in mix.inputs}
            sock["Factor_Float"].default_value = 1.0
            sock["B_Color"].default_value = tint
            nt.links.new(color.outputs["Color"], sock["A_Color"])
            nt.links.new({o.identifier: o for o in mix.outputs}["Result_Color"], bsdf.inputs["Base Color"])
        else:
            nt.links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
    rough = tex("Roughness", True)
    if rough:
        nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    normal = tex("NormalGL", True)
    if normal:
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = bump
        nt.links.new(normal.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def box(name: str, size, location, material=None, bevel: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    if material:
        obj.data.materials.append(material)
    return obj


def smooth(obj: bpy.types.Object, subdiv: int = 0) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if subdiv:
        mod = obj.modifiers.new("Subsurf", "SUBSURF")
        mod.levels = subdiv
        mod.render_levels = subdiv


def sun(direction_deg: tuple[float, float], strength: float = 3.0, color=(1, 1, 1), angle_deg: float = 1.0) -> bpy.types.Object:
    """direction_deg: (elevation, azimuth) of the sun in degrees."""
    light = bpy.data.lights.new("Sun", "SUN")
    light.energy = strength
    light.color = color
    light.angle = math.radians(angle_deg)
    obj = bpy.data.objects.new("Sun", light)
    bpy.context.collection.objects.link(obj)
    elev, azim = map(math.radians, direction_deg)
    obj.rotation_euler = (math.pi / 2 - elev, 0, azim)
    return obj


def ortho_camera(location, rotation_deg, ortho_scale: float) -> bpy.types.Object:
    cam = bpy.data.cameras.new("Camera")
    cam.type = "ORTHO"
    cam.ortho_scale = ortho_scale
    obj = bpy.data.objects.new("Camera", cam)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = tuple(math.radians(a) for a in rotation_deg)
    bpy.context.scene.camera = obj
    return obj


def persp_camera(location, look_at, lens: float = 50.0, sensor: float = 36.0) -> bpy.types.Object:
    from mathutils import Vector

    cam = bpy.data.cameras.new("Camera")
    cam.lens = lens
    cam.sensor_width = sensor
    cam.clip_end = 20000
    obj = bpy.data.objects.new("Camera", cam)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    direction = Vector(look_at) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = obj
    return obj


def render(name: str, width: int, height: int, samples: int, transparent: bool) -> Path:
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.cycles.samples = samples
    path = RENDERS / f"{name}.png"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {path}")
    return path


def hdri_sun(name: str, rotation_deg: float = 0.0) -> tuple[float, float]:
    """Where the sun sits in an equirectangular HDRI, as (elevation, azimuth) for sun()."""
    import numpy as np

    img = bpy.data.images.load(str(DL / name), check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    lum = px.reshape(h, w, 4)[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    row, col = np.unravel_index(int(np.argmax(lum)), lum.shape)  # row 0 is the bottom
    u, v = (col + 0.5) / w, (row + 0.5) / h
    elevation = (v - 0.5) * 180.0
    # Cycles samples the HDRI at R(rotation) * direction, so the world sun turns the other way.
    azimuth = 180.0 - 360.0 * u - rotation_deg  # world direction the sun is in
    return elevation, azimuth + 90.0  # sun() takes the lamp's yaw, a quarter turn from that


def mist_composite(color=(0.98, 0.86, 0.7), start: float = 30.0, depth: float = 900.0, amount: float = 0.55) -> None:
    """Aerial perspective: blend distant things toward a haze colour using the mist pass.
    Blender 5 compositing: a CompositorNodeTree with shared Mix and Math nodes and a group output."""
    scene = bpy.context.scene
    scene.view_layers[0].use_pass_mist = True
    scene.world.mist_settings.start = start
    scene.world.mist_settings.depth = depth
    scene.world.mist_settings.falloff = "QUADRATIC"
    tree = bpy.data.node_groups.new("Compositing", "CompositorNodeTree")
    scene.compositing_node_group = tree
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    rl = tree.nodes.new("CompositorNodeRLayers")
    mul = tree.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = amount
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MIX"
    sock = {i.identifier: i for i in mix.inputs}
    sock["B_Color"].default_value = (*color, 1)
    out = tree.nodes.new("NodeGroupOutput")
    # The sky has a mist value of 1: keep haze to geometry so the sky keeps its colour.
    ground_only = tree.nodes.new("ShaderNodeMath")
    ground_only.operation = "LESS_THAN"
    ground_only.inputs[1].default_value = 0.999
    masked = tree.nodes.new("ShaderNodeMath")
    masked.operation = "MULTIPLY"
    tree.links.new(rl.outputs["Mist"], ground_only.inputs[0])
    tree.links.new(rl.outputs["Mist"], masked.inputs[0])
    tree.links.new(ground_only.outputs[0], masked.inputs[1])
    tree.links.new(masked.outputs[0], mul.inputs[0])
    tree.links.new(mul.outputs[0], sock["Factor_Float"])
    tree.links.new(rl.outputs["Image"], sock["A_Color"])
    result = {o.identifier: o for o in mix.outputs}["Result_Color"]
    tree.links.new(result, out.inputs[0])
