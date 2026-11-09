"""Render the descriptor plate brackets on the unmodified Camry asset."""
import json
import os

import bpy
from mathutils import Matrix, Vector

ASSET = os.path.abspath('public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb')
OUT = os.path.abspath('codex-reports/visuals/stage-5-4')
os.makedirs(OUT, exist_ok=True)
bpy.ops.import_scene.gltf(filepath=ASSET)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'OBJECT'
scene.display.shading.light = 'STUDIO'
scene.display.shading.show_cavity = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.color = (0.49, 0.52, 0.55, 1)


def b(point):
    return Vector((point[0], -point[2], point[1]))


def oriented_box(name, center, right, up, normal, width, height, depth, color):
    vertices = [center + right*x*width/2 + up*y*height/2 + normal*z*depth/2
                for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0, 1, 3, 2), (4, 6, 7, 5),
                                    (0, 4, 5, 1), (2, 3, 7, 6),
                                    (0, 2, 6, 4), (1, 5, 7, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.color = color
    return obj


def post(name, surface, frame, radius):
    span = frame - surface
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=span.length,
                                        location=(surface + frame) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = Vector((0, 0, 1)).rotation_difference(span.normalized()).to_euler()
    obj.color = (0.035, 0.045, 0.055, 1)


mounts = {
    'front': {'center': [0, 0.44, 2.405], 'normal': [0, 0, 1], 'up': [0, 1, 0],
              'radius': 0.005, 'contacts': [
                  [-0.18, 0.46, 2.3404691], [0.18, 0.46, 2.3405035],
                  [-0.18, 0.5000001, 2.3480222], [0.18, 0.5000001, 2.3480568]]},
    'rear': {'center': [0.000072, 0.7792668, -2.3719314],
             'normal': [0, 0.2340538, -0.9722236], 'up': [0, 0.9722236, 0.2340538],
             'radius': 0.004, 'contacts': [
                 [-0.18, 0.7500001, -2.360359], [0.18, 0.7500001, -2.3603756],
                 [-0.18, 0.8100001, -2.3442376], [0.18, 0.8100001, -2.3442547]]},
}
for name, mount in mounts.items():
    center, normal, up = b(mount['center']), b(mount['normal']).normalized(), b(mount['up']).normalized()
    right = up.cross(normal).normalized()
    frame_center = center - normal * 0.005
    oriented_box(name+'-frame', frame_center, right, up, normal, 0.49, 0.15, 0.006,
                 (0.035, 0.045, 0.055, 1))
    oriented_box(name+'-plate', center, right, up, normal, 0.48, 0.14, 0.0005,
                 (0.95, 0.95, 0.92, 1))
    for index, source in enumerate(mount['contacts']):
        surface = b(source)
        relative = surface - center
        on_frame = center + right * relative.dot(right) + up * relative.dot(up) - normal * 0.008
        post(name+'-post-'+str(index), surface, on_frame, mount['radius'])
    text_curve = bpy.data.curves.new(name+'-KG-text', 'FONT')
    text_curve.body = '01 KG 777 AAB'
    text_curve.align_x = 'CENTER'
    text_curve.align_y = 'CENTER'
    text_curve.size = 0.042
    text_obj = bpy.data.objects.new(name+'-KG-text', text_curve)
    scene.collection.objects.link(text_obj)
    text_obj.location = center + normal * 0.001
    text_obj.rotation_euler = Matrix((right, up, normal)).transposed().to_quaternion().to_euler()
    text_obj.color = (0.015, 0.015, 0.015, 1)

camera_data = bpy.data.cameras.new('Plate inspection camera')
camera = bpy.data.objects.new('Plate inspection camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
views = [
    ('front', (0, -5, 1.0), (0, -2.4, 0.48), 2.0),
    ('front-three-quarter', (2.0, -4.3, 1.2), (0, -2.4, 0.48), 2.1),
    ('rear', (0, 5, 1.2), (0, 2.4, 0.78), 2.0),
    ('rear-three-quarter', (-2.0, 4.3, 1.35), (0, 2.4, 0.78), 2.1),
    ('front-side-close', (1.1, -3.3, 0.57), (0.12, -2.37, 0.44), 0.83),
    ('rear-side-close', (-1.1, 3.3, 0.9), (-0.1, 2.35, 0.78), 0.83),
]
for name, position, target, scale in views:
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.ortho_scale = scale
    scene.render.filepath = os.path.join(OUT, name+'.png')
    bpy.ops.render.render(write_still=True)
print('PLATE_RENDER_COMPLETE', json.dumps([name for name, *_ in views]))
