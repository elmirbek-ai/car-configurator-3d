"""Render exact existing Three.js rim geometry with topology-split Camry center caps."""
import json
import os
from collections import defaultdict

import bpy
from mathutils import Vector

bpy.ops.import_scene.gltf(filepath=os.path.abspath('public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb'))
with open('codex-reports/visuals/stage-5-3/wheel-replacement-geometry.json', encoding='utf-8') as stream:
    designs = json.load(stream)
with open('codex-reports/camry-geometry-audit.json', encoding='utf-8') as stream:
    audit = json.load(stream)

cover_map = {
    'WHEEL_LF': 'Object037_hubcaps_0', 'WHEEL_LR': 'Object038_hubcaps_0',
    'WHEEL_RR': 'Object039_hubcaps_0', 'WHEEL_RF': 'Object040_hubcaps_0',
}

def retain_center_cap(obj, wheel_name):
    mesh = obj.data
    parent = list(range(len(mesh.vertices)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for polygon in mesh.polygons:
        first = polygon.vertices[0]
        for vertex in polygon.vertices[1:]:
            a, b = find(first), find(vertex)
            if a != b:
                parent[b] = a
    groups = defaultdict(list)
    for polygon in mesh.polygons:
        groups[find(polygon.vertices[0])].append(polygon)
    center = audit['wheels'][wheel_name]['rim']['bounds']['center']
    center_blender = Vector((center[0], -center[2], center[1]))
    retained = []
    for polygons in groups.values():
        vertices = {vertex for polygon in polygons for vertex in polygon.vertices}
        radius = max((Vector((0, (obj.matrix_world @ mesh.vertices[vertex].co).y - center_blender.y,
                              (obj.matrix_world @ mesh.vertices[vertex].co).z - center_blender.z))).length for vertex in vertices)
        if radius <= 0.05:
            retained.extend(polygons)
    assert len(retained) == 1534, (wheel_name, len(retained))
    vertices = []
    faces = []
    for polygon in retained:
        face = []
        for vertex in polygon.vertices:
            face.append(len(vertices))
            vertices.append(obj.matrix_world @ mesh.vertices[vertex].co)
        faces.append(face)
    center_mesh = bpy.data.meshes.new(f'{wheel_name}-center-cap')
    center_mesh.from_pydata(vertices, [], faces)
    center_mesh.update()
    result = bpy.data.objects.new(f'{wheel_name}-center-cap', center_mesh)
    bpy.context.scene.collection.objects.link(result)
    result.color = (0.94, 0.67, 0.10, 1)
    obj.hide_render = True
    return result

for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    obj.color = (0.52, 0.56, 0.59, 1)
    if 'GreyWheel_0' in obj.name:
        obj.hide_render = True
    elif 'Tyre_0' in obj.name:
        obj.color = (0.14, 0.17, 0.20, 1)
    elif 'hubcaps_0' in obj.name:
        obj.color = (0.94, 0.67, 0.10, 1)
for wheel_name, cover_name in cover_map.items():
    retain_center_cap(bpy.data.objects[cover_name], wheel_name)

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
camera_data = bpy.data.cameras.new('Replacement close-up camera')
camera = bpy.data.objects.new('Replacement close-up camera', camera_data)
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

for design_name, wheels in designs.items():
    replacements = []
    for wheel_name, record in wheels.items():
        raw = record['positions']
        vertices = [Vector((raw[i], -raw[i + 2], raw[i + 1])) for i in range(0, len(raw), 3)]
        faces = [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)]
        mesh = bpy.data.meshes.new(f'{wheel_name}-{design_name}')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(f'{wheel_name}-{design_name}', mesh)
        scene.collection.objects.link(obj)
        obj.color = (0.12, 0.39, 0.94, 1)
        replacements.append(obj)
    for name, target, position in views:
        camera.location = position
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.abspath(f'codex-reports/visuals/stage-5-3/{name}-{design_name}-candidate.png')
        bpy.ops.render.render(write_still=True)
        print('RIM_RENDER', scene.render.filepath)
    for obj in replacements:
        bpy.data.objects.remove(obj, do_unlink=True)
