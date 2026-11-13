import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { loadProjectModule } from './vehicle-test-loader.mjs'
import { validateGlb } from './validate-vehicle-assets.mjs'

const candidateUrl = '/models/candidates/ToyotaCamry2018_WebCandidate_v3.glb'
const THREE = createRequire(import.meta.url)('three')
const vehicle = loadProjectModule('src/vehicleRegistry.ts').getVehicleById('toyota-camry-2018')
const { extractCenterCapGeometry, validateWheelReplacementMounts } = loadProjectModule('src/vehicleWheelFitment.ts')
const { createVehicleWheelResources, applyVehicleWheelSelection } = loadProjectModule('src/components/VehicleWheelSystem.tsx')

function documentFor(url) {
  const raw = readFileSync(`public${url}`)
  const jsonLength = raw.readUInt32LE(12)
  const json = JSON.parse(raw.toString('utf8', 20, 20 + jsonLength))
  const binaryStart = 28 + jsonLength
  const nodes = new Map()
  function visit(index, parentPath, parentWorld) {
    const node = json.nodes[index]
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale ?? [1, 1, 1])))
    const world = parentWorld.clone().multiply(local)
    const path = [...parentPath, node.name].join('/')
    nodes.set(path, { node, world })
    for (const child of node.children ?? []) visit(child, [...parentPath, node.name], world)
  }
  for (const scene of json.scenes) for (const node of scene.nodes ?? []) visit(node, [], new THREE.Matrix4())
  function accessor(index) {
    const item = json.accessors[index]
    const view = json.bufferViews[item.bufferView]
    const width = item.type === 'VEC3' ? 3 : 1
    const element = width * ([5125, 5126].includes(item.componentType) ? 4 : 2)
    const stride = view.byteStride ?? element
    const offset = binaryStart + (view.byteOffset ?? 0) + (item.byteOffset ?? 0)
    const values = []
    for (let i = 0; i < item.count; i++) for (let component = 0; component < width; component++) {
      const at = offset + i * stride + component * (element / width)
      values.push(item.componentType === 5126 ? raw.readFloatLE(at) :
        item.componentType === 5125 ? raw.readUInt32LE(at) : raw.readUInt16LE(at))
    }
    return values
  }
  function meshFor(binding) {
    const resolved = nodes.get(binding.nodePath.join('/'))
    assert.ok(resolved?.node.mesh !== undefined, `missing ${binding.nodePath.join('/')}`)
    const primitive = json.meshes[resolved.node.mesh].primitives[binding.primitiveIndices[0]]
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(accessor(primitive.attributes.POSITION), 3))
    geometry.setIndex(accessor(primitive.indices))
    const mesh = new THREE.Mesh(geometry)
    mesh.name = resolved.node.name
    mesh.matrix.copy(resolved.world)
    mesh.matrixAutoUpdate = false
    mesh.updateWorldMatrix(true, false)
    return mesh
  }
  return { json, meshFor }
}

export function verifyCamryCandidate() {
  const current = documentFor(vehicle.glbUrl)
  const candidate = documentFor(candidateUrl)
  const structural = validateGlb({ ...vehicle, glbUrl: candidateUrl })
  assert.deepEqual(structural.errors, [])
  assert.ok(structural.mappings.every((mapping) => mapping.valid))
  const placements = validateWheelReplacementMounts(vehicle.wheelReplacement.mounts)
  const wheels = vehicle.wheelReplacement.mounts.map((mount, index) => {
    const center = new THREE.Vector3(...mount.center)
    const axle = new THREE.Vector3(...mount.outwardAxle)
    const side = (asset) => {
      const rim = asset.meshFor(mount.rim)
      const cover = asset.meshFor(mount.cover)
      const retained = extractCenterCapGeometry(cover, center, axle, mount.coverTopology)
      const rimPoints = rim.geometry.getAttribute('position')
      const world = new THREE.Vector3()
      const radial = new THREE.Vector3()
      let maxRadius = 0
      let minAxial = Infinity
      let maxAxial = -Infinity
      for (let i = 0; i < rimPoints.count; i++) {
        world.fromBufferAttribute(rimPoints, i).applyMatrix4(rim.matrixWorld)
        radial.subVectors(world, center)
        const axial = radial.dot(axle)
        maxRadius = Math.max(maxRadius, radial.addScaledVector(axle, -axial).length())
        minAxial = Math.min(minAxial, axial)
        maxAxial = Math.max(maxAxial, axial)
      }
      const result = { rimTriangles: rim.geometry.index.count / 3, coverTriangles: cover.geometry.index.count / 3,
        retainedCenterTriangles: retained.index.count / 3, maxRadius, minAxial, maxAxial }
      retained.dispose()
      rim.geometry.dispose()
      cover.geometry.dispose()
      return result
    }
    const before = side(current)
    const after = side(candidate)
    assert.equal(before.rimTriangles, after.rimTriangles)
    assert.equal(before.coverTriangles, after.coverTriangles)
    assert.equal(after.retainedCenterTriangles, mount.coverTopology.retainedCenterFaces)
    for (const key of ['maxRadius', 'minAxial', 'maxAxial']) assert.ok(Math.abs(before[key] - after[key]) < 0.0001, `${index} ${key}`)
    assert.ok(placements[index].radius < mount.tireOuterRadiusSourceUnits)
    return { wheel: index, before, after }
  })
  const root = new THREE.Group()
  const groups = new Map()
  for (const mount of vehicle.wheelReplacement.mounts) for (const binding of [mount.rim, mount.cover]) {
    let parent = root
    for (let i = 0; i < binding.nodePath.length - 1; i++) {
      const key = binding.nodePath.slice(0, i + 1).join('/')
      let group = groups.get(key)
      if (!group) {
        group = new THREE.Group()
        group.userData.name = binding.nodePath[i]
        parent.add(group)
        groups.set(key, group)
      }
      parent = group
    }
    const mesh = candidate.meshFor(binding)
    mesh.userData.name = binding.nodePath.at(-1)
    mesh.material.dispose()
    mesh.material = new THREE.MeshStandardMaterial({ name: binding.expectedMaterialNames[0] })
    parent.add(mesh)
  }
  const resources = createVehicleWheelResources(root, vehicle.wheelReplacement.mounts, vehicle.id)
  const modes = []
  for (const design of ['original', 'sport', 'multi', 'forged']) for (const finish of ['silver', 'graphite', 'black']) {
    applyVehicleWheelSelection(resources, design, finish)
    const originalVisible = resources.originals.filter((item) => item.mesh.visible).length
    const coverVisible = resources.covers.filter((item) => item.mesh.visible).length
    const centerVisible = resources.covers.filter((item) => item.center.visible).length
    const replacementVisible = resources.replacements.filter((item) => item.visible).length
    assert.deepEqual([originalVisible, coverVisible, centerVisible, replacementVisible],
      design === 'original' ? [4, 4, 0, 0] : [0, 0, 4, 4])
    modes.push({ design, finish, originalVisible, coverVisible, centerVisible, replacementVisible })
  }
  resources.dispose()
  root.traverse((item) => {
    if (item instanceof THREE.Mesh) { item.geometry.dispose(); item.material.dispose() }
  })
  const report = { currentUrl: vehicle.glbUrl, candidateUrl, structuralErrors: structural.errors,
    validMappings: structural.mappings.length, wheelCount: wheels.length, wheels, modes,
    featureFlags: vehicle.features, sourceTriangleCount: validateGlb(vehicle).triangles, candidateTriangleCount: structural.triangles }
  return report
}

if (process.argv[1]?.endsWith('verify-camry-candidate.mjs')) {
  const report = verifyCamryCandidate()
  writeFileSync('codex-reports/camry-candidate-wheel-verification.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ structuralErrors: report.structuralErrors, validMappings: report.validMappings,
    wheelCount: report.wheelCount, wheels: report.wheels }, null, 2))
}
