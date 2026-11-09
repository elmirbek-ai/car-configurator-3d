"""Measure candidate mounting footprints on the imported Camry; do not edit the GLB."""
import json
import math
import os

import bpy
from mathutils import Vector

ASSET = os.path.abspath('public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb')
OUT = os.path.abspath('codex-reports/visuals/stage-5-3')
os.makedirs(OUT, exist_ok=True)
bpy.ops.import_scene.gltf(filepath=ASSET)

def blender_point(point):
    return Vector((point[0], -point[2], point[1]))

def gltf_point(point):
    return [point.x, point.z, -point.y]

def raycast(obj, origin, direction):
    inv = obj.matrix_world.inverted()
    start = inv @ origin
    local_direction = (inv.to_3x3() @ direction).normalized()
    hit, point, normal, face = obj.ray_cast(start, local_direction)
    if not hit:
        return None
    return obj.matrix_world @ point, (obj.matrix_world.to_3x3().inverted().transposed() @ normal).normalized(), face

def plane_sample(obj, source_center, source_normal, width, height):
    center = blender_point(source_center)
    normal = blender_point(source_normal).normalized()
    up = Vector((0, 0, 1))
    up = (up - normal * up.dot(normal)).normalized()
    right = up.cross(normal).normalized()
    distances, normals, hits = [], [], []
    missing = []
    for row in range(7):
        for col in range(11):
            u = (col / 10 - 0.5) * width
            v = (row / 6 - 0.5) * height
            sample = center + right * u + up * v
            result = raycast(obj, sample + normal * 0.35, -normal)
            if not result:
                missing.append((col, row))
                continue
            point, face_normal, face = result
            distances.append((point - sample).dot(normal))
            normals.append(face_normal.dot(normal))
            hits.append((point, face))
    if not distances:
        return {'status': 'no-hits', 'missing': len(missing)}
    front = max(distances) + 0.005
    return {
        'status': 'measured-candidate', 'surface': obj.name, 'width': width, 'height': height,
        'totalSamples': 77, 'hits': len(hits), 'missing': len(missing),
        'depthRange': [min(distances), max(distances)], 'maxGapAtSafePlane': max(distances) - min(distances) + 0.005,
        'normalAgreementRange': [min(normals), max(normals)],
        'candidatePlaneCenterGltf': gltf_point(center + normal * front),
        'candidateNormalGltf': gltf_point(normal), 'candidateUpGltf': gltf_point(up),
        'sampledFaceIndices': sorted(set(face for _, face in hits)),
        'limitation': 'ray grid on one mesh; full model occlusion, text readability and visual fit still require review',
    }

def trunk_contact(obj, source_x, source_z):
    # z is glTF forward; Blender Y is -z.
    values = []
    missing = 0
    normals = []
    for row in range(7):
        for col in range(9):
            x = source_x + (col / 8 - 0.5) * 0.11
            z = source_z + (row / 6 - 0.5) * 0.07
            result = raycast(obj, Vector((x, -z, 1.4)), Vector((0, 0, -1)))
            if not result:
                missing += 1
                continue
            point, normal, _ = result
            values.append(point.z)
            normals.append(normal.z)
    center_hit = raycast(obj, Vector((source_x, -source_z, 1.4)), Vector((0, 0, -1)))
    return {'samples': 63, 'hits': len(values), 'missing': missing,
            'centerHeightGltf': center_hit[0].z if center_hit else None,
            'centerNormalGltf': gltf_point(center_hit[1]) if center_hit else None,
            'heightRangeGltf': [min(values), max(values)] if values else None,
            'normalUpRange': [min(normals), max(normals)] if normals else None,
            'heightSpread': max(values) - min(values) if values else None}

front = bpy.data.objects.get('Body02_Carpaint_0')
trunk = bpy.data.objects.get('Body09_Carpaint_0')
assert front and trunk
report = {
    'frontPlate': plane_sample(front, (0.000135, 0.60866, 2.36548), (0, 0.250, 0.968), 0.48, 0.14),
    'rearPlate': plane_sample(trunk, (0.000072, 0.77755, -2.35980), (0, 0.234, -0.972), 0.48, 0.14),
    'spoilerLeft': trunk_contact(trunk, -0.42795, -2.14259),
    'spoilerRight': trunk_contact(trunk, 0.42822, -2.14259),
}
front_search = []
for y in [0.34 + 0.02 * index for index in range(26)]:
    for width in (0.40, 0.44, 0.48):
        for height in (0.11, 0.14):
            trial = plane_sample(front, (0, y, 2.25), (0, 0, 1), width, height)
            if trial['status'] == 'measured-candidate':
                front_search.append({'y': round(y, 3), 'width': width, 'height': height,
                                     'hits': trial['hits'], 'maxGap': trial['maxGapAtSafePlane'],
                                     'minNormal': trial['normalAgreementRange'][0], 'center': trial['candidatePlaneCenterGltf']})
report['frontSearch'] = sorted(front_search, key=lambda item: (-item['hits'], item['maxGap']))[:20]
with open('codex-reports/camry-anchor-calibration.json', 'w', encoding='utf-8') as stream:
    json.dump(report, stream, indent=2)
print('ANCHOR_MEASUREMENTS', json.dumps({key: {k: v for k, v in item.items() if k != 'sampledFaceIndices'} if isinstance(item, dict) else item for key, item in report.items()}))
if '--scan-only' in __import__('sys').argv:
    raise SystemExit(0)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'OBJECT'
scene.display.shading.light = 'STUDIO'
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'WORLD'
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.color = (0.53, 0.56, 0.59, 1)

def candidate_plate(item, name):
    center = blender_point(item['candidatePlaneCenterGltf'])
    normal = blender_point(item['candidateNormalGltf']).normalized()
    up = blender_point(item['candidateUpGltf']).normalized()
    right = up.cross(normal).normalized()
    points = [center + right * x + up * y for x, y in [(-0.24,-0.07),(0.24,-0.07),(0.24,0.07),(-0.24,0.07)]]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], [(0,1,2,3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.color = (0.96, 0.84, 0.12, 1)
    return obj

plates = [candidate_plate(report['frontPlate'], 'front-footprint-candidate'), candidate_plate(report['rearPlate'], 'rear-footprint-candidate')]
for side, x in [('left', -0.42795), ('right', 0.42822)]:
    item = report[f'spoiler{side.title()}']
    if item['heightRangeGltf']:
        height = max(item['heightRangeGltf'])
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 2.14259, height + 0.01))
        foot = bpy.context.object
        foot.name = f'{side}-spoiler-footprint-candidate'
        foot.dimensions = (0.11, 0.07, 0.02)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        foot.color = (0.06, 0.62, 0.96, 1)

camera_data = bpy.data.cameras.new('Anchor camera')
camera = bpy.data.objects.new('Anchor camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
for name, pos, target, scale in [
    ('front-plate', (0, -5, 1.0), (0, -2.3, 0.6), 2.0),
    ('front-plate-angle', (2.3, -4.5, 1.4), (0, -2.3, 0.6), 2.0),
    ('rear-plate', (0, 5, 1.2), (0, 2.35, 0.78), 2.0),
    ('rear-plate-angle', (-2.3, 4.5, 1.5), (0, 2.35, 0.78), 2.0),
    ('spoiler-rear', (0, 4.6, 1.8), (0, 2.14, 1.08), 2.0),
    ('spoiler-side', (3.4, 1.8, 1.7), (0, 2.14, 1.08), 2.7),
    ('spoiler-top', (0, 2.1, 4.0), (0, 2.14, 1.08), 2.4),
]:
    camera_data.ortho_scale = scale
    camera.location = pos
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, f'{name}-candidate.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER', scene.render.filepath)
