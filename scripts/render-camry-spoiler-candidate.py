"""Fixed-camera renders and triangle intersection counts for the shared spoiler candidate."""
import json
import os

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

bpy.ops.import_scene.gltf(filepath=os.path.abspath('public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb'))
with open('codex-reports/visuals/stage-5-3/spoiler-candidate-geometry.json', encoding='utf-8') as stream:
    record = json.load(stream)
scene = bpy.context.scene
original_meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.color = (0.53, 0.56, 0.59, 1)

def bvh_world(obj):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.transform(obj.matrix_world)
    tree = BVHTree.FromBMesh(mesh)
    return tree, mesh

trunk = bpy.data.objects['Body09_Carpaint_0']
trunk_tree, trunk_bmesh = bvh_world(trunk)
summary = []
for index, item in enumerate(record['pieces']):
    raw = item['positions']
    vertices = [Vector((raw[i], -raw[i + 2], raw[i + 1])) for i in range(0, len(raw), 3)]
    faces = [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)]
    mesh = bpy.data.meshes.new(f"candidate-{item['name']}-{index}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"candidate-{item['name']}-{index}", mesh)
    scene.collection.objects.link(obj)
    obj.color = (0.12, 0.32, 0.45, 1) if item['name'] != 'foot' else (0.07, 0.68, 0.85, 1)
    piece_tree, piece_bmesh = bvh_world(obj)
    hits = trunk_tree.overlap(piece_tree)
    other_hits = {}
    piece_min = Vector([min(v[i] for v in vertices) for i in range(3)])
    piece_max = Vector([max(v[i] for v in vertices) for i in range(3)])
    for target in original_meshes:
        if target == trunk:
            continue
        corners = [target.matrix_world @ Vector(corner) for corner in target.bound_box]
        if any(max(v[i] for v in corners) < piece_min[i] or min(v[i] for v in corners) > piece_max[i] for i in range(3)):
            continue
        target_tree, target_bmesh = bvh_world(target)
        overlap = target_tree.overlap(piece_tree)
        if overlap:
            other_hits[target.name] = len(overlap)
        target_bmesh.free()
    summary.append({'piece': obj.name, 'triangles': len(faces), 'trunkTriangleIntersections': len(hits),
                    'otherGeometryIntersections': other_hits})
    piece_bmesh.free()
trunk_bmesh.free()
with open('codex-reports/camry-spoiler-clearance.json', 'w', encoding='utf-8') as stream:
    json.dump({'mount': record['mount'], 'intersections': summary}, stream, indent=2)
print('SPOILER_INTERSECTIONS', summary)

scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'OBJECT'
scene.display.shading.light = 'STUDIO'
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'WORLD'
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
camera_data = bpy.data.cameras.new('Spoiler candidate camera')
camera = bpy.data.objects.new('Spoiler candidate camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
for name, pos, target, scale in [
    ('rear', (0, 5.0, 1.8), (0, 2.16, 1.22), 2.2),
    ('side', (3.6, 1.9, 1.8), (0, 2.16, 1.22), 2.7),
    ('top', (0, 2.1, 4.2), (0, 2.16, 1.22), 2.4),
    ('rear-angle', (-3.0, 4.2, 1.8), (0, 2.16, 1.22), 2.7),
]:
    camera_data.ortho_scale = scale
    camera.location = pos
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.abspath(f'codex-reports/visuals/stage-5-3/spoiler-{name}-shared-geometry.png')
    bpy.ops.render.render(write_still=True)
    print('SPOILER_RENDER', scene.render.filepath)
