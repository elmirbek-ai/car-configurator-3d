"""Read-only Blender visualization of verified Camry node boundaries."""
import os
import sys
import bpy
from mathutils import Vector

bpy.ops.import_scene.gltf(filepath=os.path.abspath('public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb'))
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'OBJECT'
scene.display.shading.light = 'STUDIO'
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'WORLD'
scene.render.resolution_x = 1100
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.world.color = (0.12, 0.15, 0.19)

colors = {
    'Body01_Carpaint_0': (0.84, 0.10, 0.07, 1),
    'Body02_Carpaint_0': (0.10, 0.68, 0.20, 1),
    'Body014_Carpaint_0': (0.14, 0.36, 0.92, 1),
    'Body09_Carpaint_0': (0.91, 0.57, 0.10, 1),
}
wheel_mode = '--wheel-isolation' in sys.argv
hide_rims = '--hide-rims' in sys.argv
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.color = colors.get(obj.name, (0.51, 0.55, 0.59, 1))
        if wheel_mode:
            if 'GreyWheel_0' in obj.name:
                obj.color = (0.15, 0.38, 0.96, 1)
                obj.hide_render = hide_rims
            elif 'hubcaps_0' in obj.name:
                obj.color = (0.95, 0.67, 0.10, 1)
            elif 'Tyre_0' in obj.name:
                obj.color = (0.15, 0.18, 0.21, 1)

camera_data = bpy.data.cameras.new('Part audit orthographic camera')
camera = bpy.data.objects.new('Part audit camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 5.7
target = Vector((0, 0, 0.65))
output = os.path.abspath('codex-reports/visuals/stage-5-2' if wheel_mode else 'codex-reports/visuals/stage-5-1')
os.makedirs(output, exist_ok=True)
views = [
    ('front-three-quarter', (3.4, -5.6, 2.15)),
    ('rear-three-quarter', (-3.4, 5.6, 2.15)),
    ('front-top', (0, -2.6, 5.5)),
]
if wheel_mode:
    views = [('left-side', (5.5, 0, 1.45)), ('right-side', (-5.5, 0, 1.45))]
for name, position in views:
    camera.location = position
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(output, f'camry-{name}{"-rims-hidden" if hide_rims else "-original"}.png')
    bpy.ops.render.render(write_still=True)
    print('AUDIT_RENDER', scene.render.filepath)
