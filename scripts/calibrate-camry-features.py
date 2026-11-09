"""Read-only Camry mesh inspection and fixed-camera evidence renders (Blender 5.2)."""
import json
import math
import os
import sys
from collections import defaultdict

import bpy
from mathutils import Vector

ASSET = os.path.abspath('public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb')
OUTPUT = os.path.abspath('codex-reports/visuals/stage-5-3')
os.makedirs(OUTPUT, exist_ok=True)
bpy.ops.import_scene.gltf(filepath=ASSET)

def component_data(obj):
    mesh = obj.data
    parent = list(range(len(mesh.vertices)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for polygon in mesh.polygons:
        vertices = polygon.vertices
        first = vertices[0]
        for index in vertices[1:]:
            a, b = find(first), find(index)
            if a != b:
                parent[b] = a
    components = defaultdict(lambda: {'faces': 0, 'vertices': set()})
    for polygon in mesh.polygons:
        key = find(polygon.vertices[0])
        components[key]['faces'] += 1
        components[key]['vertices'].update(polygon.vertices)
    results = []
    for component in components.values():
        points = [obj.matrix_world @ mesh.vertices[index].co for index in component['vertices']]
        bounds = [[min(p[axis] for p in points) for axis in range(3)], [max(p[axis] for p in points) for axis in range(3)]]
        results.append({'faces': component['faces'], 'vertices': len(component['vertices']), 'boundsBlender': bounds,
                        'centerBlender': [(bounds[0][axis] + bounds[1][axis]) / 2 for axis in range(3)]})
    return sorted(results, key=lambda item: item['faces'], reverse=True)

objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
report = {}
for obj in objects:
    if any(token in obj.name for token in ('hubcaps_0', 'GreyWheel_0')):
        report[obj.name] = {'materials': [m.name for m in obj.data.materials], 'faces': len(obj.data.polygons),
                            'components': component_data(obj)}
with open('codex-reports/camry-wheel-components.json', 'w', encoding='utf-8') as stream:
    json.dump(report, stream, indent=2)
print('WHEEL_COMPONENTS', {name: (item['faces'], len(item['components'])) for name, item in report.items()})

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
scene.world.color = (0.12, 0.15, 0.19)
for obj in objects:
    obj.color = (0.50, 0.54, 0.58, 1)
    if 'GreyWheel_0' in obj.name:
        obj.color = (0.12, 0.40, 0.95, 1)
    elif 'hubcaps_0' in obj.name:
        obj.color = (0.94, 0.66, 0.08, 1)
    elif 'Tyre_0' in obj.name:
        obj.color = (0.13, 0.16, 0.19, 1)

camera_data = bpy.data.cameras.new('Wheel close-up camera')
camera = bpy.data.objects.new('Wheel close-up camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 0.84

views = [
    ('lf-side', Vector((0.80, -1.4359, 0.321)), Vector((2.2, -1.4359, 0.48))),
    ('lf-angle', Vector((0.80, -1.4359, 0.321)), Vector((1.75, -2.1, 0.73))),
    ('rf-side', Vector((-0.79, -1.4359, 0.321)), Vector((-2.2, -1.4359, 0.48))),
    ('rr-angle', Vector((-0.79, 1.3612, 0.321)), Vector((-1.7, 2.03, 0.70))),
]
for mode in ('original', 'rim-hidden', 'hubcap-hidden', 'rim-and-hubcap-hidden'):
    for obj in objects:
        if 'GreyWheel_0' in obj.name:
            obj.hide_render = mode in ('rim-hidden', 'rim-and-hubcap-hidden')
        elif 'hubcaps_0' in obj.name:
            obj.hide_render = mode in ('hubcap-hidden', 'rim-and-hubcap-hidden')
    for view, target, position in views:
        camera.location = position
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(OUTPUT, f'{view}-{mode}.png')
        bpy.ops.render.render(write_still=True)
        print('RENDER', scene.render.filepath)
