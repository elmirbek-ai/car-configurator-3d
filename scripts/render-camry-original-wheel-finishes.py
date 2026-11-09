"""Read-only Workbench comparison of the four original wheel covers and three finishes."""
import json
import os

import bpy
from mathutils import Vector

ASSET = os.path.abspath('public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb')
OUT = os.path.abspath('codex-reports/visuals/stage-5-5')
os.makedirs(OUT, exist_ok=True)
bpy.ops.import_scene.gltf(filepath=ASSET)
with open('codex-reports/camry-geometry-audit.json', encoding='utf-8') as stream:
    audit = json.load(stream)

cover_names = {
    'WHEEL_LF': 'Object037_hubcaps_0',
    'WHEEL_LR': 'Object038_hubcaps_0',
    'WHEEL_RR': 'Object039_hubcaps_0',
    'WHEEL_RF': 'Object040_hubcaps_0',
}
finishes = {
    'silver': (0.796, 0.831, 0.863, 1),
    'graphite': (0.325, 0.357, 0.396, 1),
    'black': (0.09, 0.106, 0.133, 1),
}
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    obj.color = (0.51, 0.54, 0.57, 1)
    if 'Tyre_0' in obj.name:
        obj.color = (0.13, 0.15, 0.17, 1)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'OBJECT'
scene.display.shading.light = 'STUDIO'
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'WORLD'
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
camera_data = bpy.data.cameras.new('Original wheel comparison camera')
camera = bpy.data.objects.new('Original wheel comparison camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 0.84


def set_view(wheel_name):
    center = audit['wheels'][wheel_name]['rim']['bounds']['center']
    target = Vector((center[0], -center[2], center[1]))
    outward = 1 if wheel_name.endswith('LF') or wheel_name.endswith('LR') else -1
    camera.location = target + Vector((outward * 1.4, 0, 0.15))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()


def render(name):
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)


# Reproduce the defect: GreyWheel changes but the visible spoke cover remains silver.
for obj in bpy.data.objects:
    if obj.type == 'MESH' and 'GreyWheel_0' in obj.name:
        obj.color = finishes['black']
set_view('WHEEL_LF')
render('before-black-WHEEL_LF')

for finish, color in finishes.items():
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and ('GreyWheel_0' in obj.name or obj.name in cover_names.values()):
            obj.color = color
    for wheel_name in cover_names:
        set_view(wheel_name)
        render(f'original-{finish}-{wheel_name}')
print('FINISH_RENDERS', len(finishes) * len(cover_names) + 1)
