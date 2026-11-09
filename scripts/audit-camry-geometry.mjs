import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three'

const path = 'public/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb'
const data = readFileSync(path)
const jsonLength = data.readUInt32LE(12)
const gltf = JSON.parse(data.toString('utf8', 20, 20 + jsonLength))
const binOffset = 20 + jsonLength + 8
const matrices = new Map()
const paths = new Map()
const nodeWorld = new Map()
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
function readComponent(type, offset) {
  if (type === 5126) return data.readFloatLE(offset)
  if (type === 5125) return data.readUInt32LE(offset)
  if (type === 5123) return data.readUInt16LE(offset)
  if (type === 5122) return data.readInt16LE(offset)
  if (type === 5121) return data.readUInt8(offset)
  return data.readInt8(offset)
}
function accessor(index) {
  const item = gltf.accessors[index]
  const view = gltf.bufferViews[item.bufferView]
  const elements = item.type === 'VEC3' ? 3 : item.type === 'VEC2' ? 2 : 1
  const start = binOffset + (view.byteOffset ?? 0) + (item.byteOffset ?? 0)
  const stride = view.byteStride ?? componentBytes[item.componentType] * elements
  return { count: item.count, get: (i, k = 0) => readComponent(item.componentType, start + i * stride + k * componentBytes[item.componentType]) }
}
function walk(index, parentMatrix, parentPath) {
  const node = gltf.nodes[index]
  const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
  )
  const world = parentMatrix.clone().multiply(local)
  const name = node.name ?? `#${index}`
  const fullPath = [...parentPath, name]
  matrices.set(index, world)
  paths.set(index, fullPath.join('/'))
  nodeWorld.set(fullPath.join('/'), index)
  for (const child of node.children ?? []) walk(child, world, fullPath)
}
for (const scene of gltf.scenes) for (const index of scene.nodes ?? []) walk(index, new THREE.Matrix4(), [])

function geometryInfo(nodeIndex) {
  const node = gltf.nodes[nodeIndex]
  if (node.mesh === undefined) return null
  const world = matrices.get(nodeIndex)
  const bounds = new THREE.Box3().makeEmpty()
  const localBounds = new THREE.Box3().makeEmpty()
  let triangles = 0
  let vertexCount = 0
  const materials = []
  const uvRange = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] }
  const primitives = gltf.meshes[node.mesh].primitives
  for (const primitive of primitives) {
    const position = accessor(primitive.attributes.POSITION)
    if (primitive.attributes.TEXCOORD_0 !== undefined) {
      const uv = accessor(primitive.attributes.TEXCOORD_0)
      for (let i = 0; i < uv.count; i++) for (let axis = 0; axis < 2; axis++) {
        const value = uv.get(i, axis)
        uvRange.min[axis] = Math.min(uvRange.min[axis], value)
        uvRange.max[axis] = Math.max(uvRange.max[axis], value)
      }
    }
    vertexCount += position.count
    const count = primitive.indices === undefined ? position.count : accessor(primitive.indices).count
    if (primitive.mode === undefined || primitive.mode === 4) triangles += count / 3
    materials.push(gltf.materials[primitive.material]?.name ?? null)
    const point = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) {
      point.set(position.get(i, 0), position.get(i, 1), position.get(i, 2)).applyMatrix4(world)
      bounds.expandByPoint(point)
      point.set(position.get(i, 0), position.get(i, 1), position.get(i, 2))
      localBounds.expandByPoint(point)
    }
  }
  const worldQuaternion = new THREE.Quaternion()
  world.decompose(new THREE.Vector3(), worldQuaternion, new THREE.Vector3())
  return { path: paths.get(nodeIndex), meshIndex: node.mesh, triangles, vertices: vertexCount, materials,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), center: bounds.getCenter(new THREE.Vector3()).toArray(), size: bounds.getSize(new THREE.Vector3()).toArray() },
    localBounds: { min: localBounds.min.toArray(), max: localBounds.max.toArray(), size: localBounds.getSize(new THREE.Vector3()).toArray() },
    worldTranslation: new THREE.Vector3().setFromMatrixPosition(world).toArray(),
    worldScale: new THREE.Vector3().setFromMatrixScale(world).toArray(),
    worldQuaternion: worldQuaternion.toArray(),
    worldMatrix: world.toArray(),
    worldLocalXDirection: new THREE.Vector3(1, 0, 0).transformDirection(world).toArray(),
    worldAxleDirectionFromLocalY: new THREE.Vector3(0, 1, 0).transformDirection(world).toArray(),
    hasNormals: primitives.every((primitive) => primitive.attributes.NORMAL !== undefined),
    hasUv0: primitives.every((primitive) => primitive.attributes.TEXCOORD_0 !== undefined),
    uvRange: uvRange.min[0] === Infinity ? null : uvRange,
  }
}

function topologyInfo(nodeIndex) {
  const primitive = gltf.meshes[gltf.nodes[nodeIndex].mesh].primitives[0]
  const positions = accessor(primitive.attributes.POSITION)
  const indices = primitive.indices === undefined ? null : accessor(primitive.indices)
  const parents = Array.from({ length: positions.count }, (_, index) => index)
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]))
  const union = (a, b) => { const left = find(a); const right = find(b); if (left !== right) parents[right] = left }
  const triangleCount = (indices?.count ?? positions.count) / 3
  for (let i = 0; i < triangleCount; i++) {
    const a = indices ? indices.get(i * 3) : i * 3
    const b = indices ? indices.get(i * 3 + 1) : i * 3 + 1
    const c = indices ? indices.get(i * 3 + 2) : i * 3 + 2
    union(a, b); union(a, c)
  }
  const components = new Map()
  const point = new THREE.Vector3()
  for (let i = 0; i < positions.count; i++) {
    const key = find(i)
    if (!components.has(key)) components.set(key, { vertices: 0, bounds: new THREE.Box3().makeEmpty() })
    const component = components.get(key)
    component.vertices++
    point.set(positions.get(i, 0), positions.get(i, 1), positions.get(i, 2)).applyMatrix4(matrices.get(nodeIndex))
    component.bounds.expandByPoint(point)
  }
  return [...components.values()].sort((a, b) => b.vertices - a.vertices).map((part) => ({
    vertices: part.vertices, min: part.bounds.min.toArray(), max: part.bounds.max.toArray(),
  }))
}

function surfaceSample(nodeName, filter, expectedNormal) {
  const entry = [...paths.entries()].find(([index]) => gltf.nodes[index].name === nodeName)
  if (!entry) return { status: 'unresolved', reason: `node ${nodeName} missing` }
  const [nodeIndex] = entry
  const primitive = gltf.meshes[gltf.nodes[nodeIndex].mesh].primitives[0]
  const position = accessor(primitive.attributes.POSITION)
  const indices = primitive.indices === undefined ? null : accessor(primitive.indices)
  const matrix = matrices.get(nodeIndex)
  const bounds = new THREE.Box3().makeEmpty()
  const center = new THREE.Vector3()
  const normalSum = new THREE.Vector3()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const normal = new THREE.Vector3(), centroid = new THREE.Vector3()
  let count = 0, area = 0, agreement = 0
  for (let i = 0, total = (indices?.count ?? position.count) / 3; i < total; i++) {
    const ids = [0, 1, 2].map((corner) => indices ? indices.get(i * 3 + corner) : i * 3 + corner)
    for (const [point, id] of [[a, ids[0]], [b, ids[1]], [c, ids[2]]])
      point.set(position.get(id, 0), position.get(id, 1), position.get(id, 2)).applyMatrix4(matrix)
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3)
    normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    const faceArea = normal.length() / 2
    if (faceArea < 1e-10) continue
    normal.normalize()
    if (!filter(centroid, normal)) continue
    count++
    area += faceArea
    agreement += faceArea * normal.dot(expectedNormal)
    center.addScaledVector(centroid, faceArea)
    normalSum.addScaledVector(normal, faceArea)
    bounds.expandByPoint(centroid)
  }
  if (!count) return { status: 'unresolved', reason: 'no triangles met the geometric filter' }
  center.divideScalar(area)
  return { status: 'inferred-candidate', node: paths.get(nodeIndex), triangleCount: count, area, center: center.toArray(),
    meanNormal: normalSum.normalize().toArray(), normalAgreement: agreement / area,
    centroidBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    limitation: 'heuristic triangle sample; no verified plate size, tangent frame, contact clearance, or spoiler contact pair',
  }
}

const names = new Set([
  'Body01_Carpaint_0', 'Body02_Carpaint_0', 'Body014_Carpaint_0', 'Body09_Carpaint_0',
  'alt05_GreyWheel_0', 'alt011_GreyWheel_0', 'alt017_GreyWheel_0', 'alt023_GreyWheel_0',
  'Object037_hubcaps_0', 'Object038_hubcaps_0', 'Object039_hubcaps_0', 'Object040_hubcaps_0', 'Object058_hubcaps_0',
  'front_window_Glass_0', 'rear_window_Glass_0',
])
const selected = [...paths.entries()].filter(([index]) => names.has(gltf.nodes[index].name)).map(([index]) => geometryInfo(index))
const wheels = {}
for (const group of ['WHEEL_LF', 'WHEEL_LR', 'WHEEL_RR', 'WHEEL_RF']) {
  const members = [...paths.entries()].filter(([, pathName]) => pathName.includes(`/${group}/`) && gltf.nodes[[...paths.entries()].find(([, p]) => p === pathName)[0]].mesh !== undefined)
  const parts = members.map(([index]) => geometryInfo(index))
  const tires = parts.filter((part) => part.materials.includes('Tyre'))
  const rim = parts.find((part) => part.materials.includes('GreyWheel'))
  const tireBox = new THREE.Box3().makeEmpty()
  for (const tire of tires) tireBox.union(new THREE.Box3(new THREE.Vector3().fromArray(tire.bounds.min), new THREE.Vector3().fromArray(tire.bounds.max)))
  wheels[group] = { partCount: parts.length, totalTriangles: parts.reduce((sum, part) => sum + part.triangles, 0),
    tireTriangles: tires.reduce((sum, part) => sum + part.triangles, 0), rim,
    tireBounds: { center: tireBox.getCenter(new THREE.Vector3()).toArray(), size: tireBox.getSize(new THREE.Vector3()).toArray() },
    fitmentCandidate: {
      center: tireBox.getCenter(new THREE.Vector3()).toArray(),
      outwardAxle: group.startsWith('WHEEL_L') ? [1, 0, 0] : [-1, 0, 0],
      tireOuterRadius: Math.max(tireBox.getSize(new THREE.Vector3()).y, tireBox.getSize(new THREE.Vector3()).z) / 2,
      rimOuterRadius: Math.max(rim.bounds.size[1], rim.bounds.size[2]) / 2,
      rimDepth: rim.bounds.size[0],
      confidence: 'measurement-only; brake and hubcap clearance unverified',
    },
    materials: [...new Set(parts.flatMap((part) => part.materials))],
    partNames: parts.map((part) => part.path.split('/').at(-1)),
  }
}
const topology = Object.fromEntries([...paths.entries()].filter(([index]) =>
  ['Body01_Carpaint_0', 'Body02_Carpaint_0', 'Body014_Carpaint_0', 'alt05_GreyWheel_0'].includes(gltf.nodes[index].name))
  .map(([index]) => [gltf.nodes[index].name, topologyInfo(index)]))
const surfaceCandidates = {
  frontPlate: surfaceSample('Body02_Carpaint_0', (p, n) => Math.abs(p.x) < 0.34 && p.y > 0.32 && p.y < 0.76 && p.z > 2.15 && n.z > 0.6, new THREE.Vector3(0, 0, 1)),
  rearPlate: surfaceSample('Body09_Carpaint_0', (p, n) => Math.abs(p.x) < 0.34 && p.y > 0.62 && p.y < 0.92 && p.z < -2.28 && n.z < -0.6, new THREE.Vector3(0, 0, -1)),
  spoilerLeft: surfaceSample('Body09_Carpaint_0', (p, n) => p.x < -0.30 && p.x > -0.56 && p.y > 1.00 && p.z < -1.95 && p.z > -2.35 && n.y > 0.6, new THREE.Vector3(0, 1, 0)),
  spoilerRight: surfaceSample('Body09_Carpaint_0', (p, n) => p.x > 0.30 && p.x < 0.56 && p.y > 1.00 && p.z < -1.95 && p.z > -2.35 && n.y > 0.6, new THREE.Vector3(0, 1, 0)),
}
const result = { asset: path, sha256: createHash('sha256').update(data).digest('hex'), sourceForward: '+z', sourceUp: '+y', selected, wheels, topology, surfaceCandidates }
writeFileSync('codex-reports/camry-geometry-audit.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ sha256: result.sha256, wheelTriangles: Object.fromEntries(Object.entries(wheels).map(([name, wheel]) => [name, wheel.totalTriangles])), mappedParts: selected.length, topologyComponents: Object.fromEntries(Object.entries(topology).map(([name, parts]) => [name, parts.length])) }, null, 2))
