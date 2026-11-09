"""Read-only Camry front/rear bracket surface probe in glTF source coordinates."""
import json
import os
import sys

import bpy
from mathutils import Vector

ASSET = os.path.abspath('public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb')
OUT = os.path.abspath('codex-reports/camry-plate-bracket-probe.json')
bpy.ops.import_scene.gltf(filepath=ASSET)
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']


def blender(point):
    return Vector((point[0], -point[2], point[1]))


def gltf(point):
    return [round(point.x, 7), round(point.z, 7), round(-point.y, 7)]


def first_surface(origin, direction):
    start, ray = blender(origin), blender(direction).normalized()
    hits = []
    for obj in meshes:
        inv = obj.matrix_world.inverted()
        found, point, normal, face = obj.ray_cast(inv @ start, (inv.to_3x3() @ ray).normalized())
        if found:
            world = obj.matrix_world @ point
            distance = (world - start).dot(ray)
            if distance >= 0:
                world_normal = (obj.matrix_world.to_3x3().inverted().transposed() @ normal).normalized()
                hits.append((distance, obj.name, gltf(world), gltf(world_normal), face))
    hits.sort(key=lambda item: item[0])
    return hits[:3]


result = {'front': [], 'rear': []}
for y in (0.38, 0.42, 0.46, 0.50, 0.54, 0.58, 0.62, 0.66):
    row = {'y': y, 'samples': []}
    for x in (-0.25, -0.18, -0.10, 0, 0.10, 0.18, 0.25):
        row['samples'].append({'x': x, 'hits': first_surface((x, y, 3), (0, 0, -1))})
    result['front'].append(row)
for y in (0.71, 0.75, 0.78, 0.81, 0.85):
    row = {'y': y, 'samples': []}
    for x in (-0.25, -0.18, -0.10, 0, 0.10, 0.18, 0.25):
        row['samples'].append({'x': x, 'hits': first_surface((x, y, -3), (0, 0, 1))})
    result['rear'].append(row)
result['mountCandidates'] = {}
result['frameCandidates'] = {}
for side, center_y, center_z, direction in [('front', 0.44, 3, (0, 0, -1)), ('rear', 0.7792668, -3, (0, 0, 1))]:
  for target, width, height in [('mountCandidates', 0.48, 0.14), ('frameCandidates', 0.49, 0.15)]:
    points = []
    for row in range(9):
        for col in range(17):
            x = (col / 16 - 0.5) * width
            y = center_y + (row / 8 - 0.5) * height
            hits = first_surface((x, y, center_z), direction)
            if hits:
                first = hits[0]
                points.append({'x': round(x, 5), 'y': round(y, 5), 'mesh': first[1], 'point': first[2], 'normal': first[3], 'face': first[4]})
    result[target][side] = {
        'centerY': center_y, 'width': width, 'height': height,
        'sampleCount': 153, 'hitCount': len(points),
        'surfaceZRange': [min(p['point'][2] for p in points), max(p['point'][2] for p in points)],
        'meshCounts': {name: sum(p['mesh'] == name for p in points) for name in sorted({p['mesh'] for p in points})},
        'points': points,
    }
with open(OUT, 'w', encoding='utf-8') as stream:
    json.dump(result, stream, indent=2)
print('PROBE', OUT)
