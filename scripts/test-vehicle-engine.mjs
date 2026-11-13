import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { loadProjectModule } from './vehicle-test-loader.mjs'
import { validateAllVehicles, validateGlb } from './validate-vehicle-assets.mjs'
import { verifyCamryCandidate } from './verify-camry-candidate.mjs'

const registry = loadProjectModule('src/vehicleRegistry.ts')
const THREE = createRequire(import.meta.url)('three')
const storage = loadProjectModule('src/vehicleStorage.ts')
const { DEFAULT_CONFIG, PAINTS, validateStoredConfig, REGIONS, parsePlate, formatPlate } = loadProjectModule('src/types.ts')
const tuning = loadProjectModule('src/vehicleTuning.ts')
const fitment = loadProjectModule('src/vehicleWheelFitment.ts')
const attachments = loadProjectModule('src/components/VehicleAttachments.tsx')
const bmwMounts = loadProjectModule('src/components/BMWPlateMounts.tsx')
const wheelSystem = loadProjectModule('src/components/VehicleWheelSystem.tsx')
const wheelRims = loadProjectModule('src/components/WheelRims.ts')
const wheelDesigns = loadProjectModule('src/wheelDesigns.ts')
const wheelFinishes = loadProjectModule('src/wheelFinishes.ts')
const bmwWheels = loadProjectModule('src/bmwWheelFitment.ts')
const camryAssets = loadProjectModule('src/components/camryAssets.ts')

function memoryStorage() {
  const records = new Map()
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    records,
  }
}

test('registry resolves three unique selectable model paths and conservative features', () => {
  const vehicles = registry.listAvailableVehicles()
  assert.deepEqual(vehicles.map((vehicle) => vehicle.id), ['concept-gt', 'toyota-camry-2018', 'bmw-m5-f90'])
  assert.equal(new Set(vehicles.map((vehicle) => vehicle.glbUrl)).size, 3)
  for (const vehicle of vehicles) assert.ok(existsSync(resolve(`public${vehicle.glbUrl}`)))
  const camry = registry.getVehicleById('toyota-camry-2018')
  assert.equal(camry.availability, 'limited-ready')
  assert.equal(camry.features.bodyPaint, true)
  assert.equal(camry.features.bodyFinish, true)
  assert.equal(camry.features.windowTint, true)
  for (const feature of ['wheelFinish', 'carbonHood', 'frontBumper', 'rearBumper']) assert.equal(camry.features[feature], true, feature)
  assert.equal(camry.features.wheelDesign, true)
  assert.equal(camry.features.spoiler, true)
  for (const feature of ['frontPlate', 'rearPlate']) {
    assert.equal(camry.features[feature], true, feature)
  }
  const bmw = registry.getVehicleById('bmw-m5-f90')
  assert.equal(bmw.availability, 'limited-ready')
  for (const feature of ['bodyPaint', 'bodyFinish', 'wheelFinish']) assert.equal(bmw.features[feature], true)
  for (const feature of ['frontPlate', 'rearPlate']) assert.equal(bmw.features[feature], false, feature)
  assert.equal(bmw.features.wheelDesign, true)
  assert.equal(bmw.wheelReplacement.status, 'verified-combined')
  for (const feature of ['windowTint', 'carbonHood', 'frontBumper', 'rearBumper', 'spoiler']) {
    assert.equal(bmw.features[feature], false, feature)
  }
})

test('v1 migration is idempotent and preserves Concept data', () => {
  const browser = memoryStorage()
  const legacy = { ...DEFAULT_CONFIG, color: '#a31325' }
  delete legacy.frontBumperFinish
  delete legacy.rearBumperFinish
  browser.setItem(storage.V1_STORAGE_KEY, JSON.stringify(legacy))
  assert.equal(storage.migrateV1ToV2(browser), true)
  assert.equal(storage.migrateV1ToV2(browser), false)
  assert.equal(storage.readVehicleSession(browser).configurations['concept-gt'].color, '#a31325')
  assert.equal(storage.readVehicleSession(browser).configurations['concept-gt'].frontBumperFinish, 'body')
  assert.ok(browser.getItem(storage.V1_STORAGE_KEY))
})

test('vehicle switching, save, reset and export keep configurations independent', () => {
  const browser = memoryStorage()
  const concept = { ...DEFAULT_CONFIG, color: '#a31325' }
  const camry = { ...DEFAULT_CONFIG, color: '#174cc1', tint: 'dark', wheelFinish: 'black', wheelDesign: 'forged', spoiler: true, carbonHood: true, frontBumperFinish: 'satin', rearBumperFinish: 'matte', plate: '07 KG 777 AAB' }
  storage.saveVehicleConfig(browser, 'concept-gt', concept)
  storage.saveVehicleConfig(browser, 'toyota-camry-2018', camry)
  const bmw = { ...DEFAULT_CONFIG, color: '#e9e8e3', wheelFinish: 'graphite', plate: '10 KG 123 XYZ' }
  storage.saveVehicleConfig(browser, 'bmw-m5-f90', bmw)
  let session = storage.readVehicleSession(browser)
  assert.equal(session.activeVehicleId, 'bmw-m5-f90')
  assert.equal(storage.getSessionConfig(session).wheelFinish, 'graphite')
  assert.equal(storage.getSessionConfig(session).plate, '10 KG 123 XYZ')
  assert.equal(storage.createConfigurationExport('bmw-m5-f90', bmw).vehicleId, 'bmw-m5-f90')
  assert.equal(storage.createConfigurationExport('bmw-m5-f90', bmw).configuration.plate, '10 KG 123 XYZ')
  session = storage.activateVehicle(session, 'concept-gt')
  assert.equal(storage.getSessionConfig(session).color, concept.color)
  assert.equal(storage.activateVehicle(session, 'unknown'), session)
  session = storage.activateVehicle(session, 'toyota-camry-2018')
  assert.equal(storage.getSessionConfig(session).tint, 'dark')
  assert.equal(storage.getSessionConfig(session).frontBumperFinish, 'satin')
  assert.equal(storage.getSessionConfig(session).rearBumperFinish, 'matte')
  assert.equal(storage.getSessionConfig(session).wheelFinish, 'black')
  assert.equal(storage.getSessionConfig(session).wheelDesign, 'forged')
  assert.equal(storage.getSessionConfig(session).spoiler, true)
  assert.equal(storage.getSessionConfig(session).carbonHood, true)
  assert.equal(storage.getSessionConfig(session).plate, '07 KG 777 AAB')
  assert.equal(storage.createConfigurationExport('toyota-camry-2018', camry).schemaVersion, 2)
  assert.equal(storage.createConfigurationExport('toyota-camry-2018', camry).configuration.frontBumperFinish, 'satin')
  assert.equal(storage.createConfigurationExport('toyota-camry-2018', camry).configuration.wheelDesign, 'forged')
  assert.equal(storage.createConfigurationExport('toyota-camry-2018', camry).configuration.spoiler, true)
  assert.equal(storage.createConfigurationExport('toyota-camry-2018', camry).configuration.plate, '07 KG 777 AAB')
  assert.throws(() => storage.saveVehicleConfig(browser, 'unknown', camry))
  storage.resetVehicleConfig(browser, 'toyota-camry-2018')
  const after = storage.readVehicleSession(browser)
  assert.equal(after.configurations['toyota-camry-2018'], undefined)
  assert.equal(after.configurations['concept-gt'].color, concept.color)
  assert.equal(after.configurations['bmw-m5-f90'].wheelFinish, 'graphite')
  assert.equal(after.configurations['bmw-m5-f90'].plate, '10 KG 123 XYZ')
  assert.deepEqual(storage.getSessionConfig(after), storage.getDefaultVehicleConfig('toyota-camry-2018'))
  assert.equal(storage.createConfigurationExport('concept-gt', storage.getSessionConfig(storage.activateVehicle(after, 'concept-gt'))).vehicleId, 'concept-gt')
  storage.resetVehicleConfig(browser, 'bmw-m5-f90')
  const afterBMW = storage.readVehicleSession(browser)
  assert.equal(afterBMW.configurations['bmw-m5-f90'], undefined)
  assert.equal(afterBMW.configurations['concept-gt'].color, concept.color)
  assert.deepEqual(storage.getSessionConfig(afterBMW), storage.getDefaultVehicleConfig('bmw-m5-f90'))
})

test('expanded finishes and colors survive storage and export without changing old values', () => {
  const browser = memoryStorage()
  assert.equal(PAINTS.length, 24)
  assert.equal(new Set(PAINTS.map((paint) => paint.value)).size, PAINTS.length)
  assert.ok(PAINTS.some((paint) => paint.label === 'Pearl White' && paint.value === '#e9e8e3'))
  const expanded = { ...DEFAULT_CONFIG, color: '#332544', bodyFinish: 'metallic',
    frontBumperFinish: 'metallic', wheelFinish: 'champagneGold', wheelDesign: 'mesh' }
  storage.saveVehicleConfig(browser, 'toyota-camry-2018', expanded)
  assert.deepEqual(storage.readVehicleSession(browser).configurations['toyota-camry-2018'], expanded)
  assert.deepEqual(storage.createConfigurationExport('toyota-camry-2018', expanded).configuration, expanded)
  const old = { ...DEFAULT_CONFIG, color: '#174cc1', bodyFinish: 'satin', wheelFinish: 'black' }
  storage.saveVehicleConfig(browser, 'concept-gt', old)
  assert.deepEqual(storage.readVehicleSession(browser).configurations['concept-gt'], old)
  const source = new THREE.MeshPhysicalMaterial({ color: '#ffffff', clearcoat: 0.4 })
  const owned = source.clone()
  tuning.applyBodyFinish(owned, source, expanded.color, 'metallic')
  assert.equal(owned.color.getHexString(), '332544')
  assert.ok(owned.metalness > 0.6)
  assert.ok(owned.roughness < 0.3)
  assert.equal(source.color.getHexString(), 'ffffff')
  owned.dispose(); source.dispose()
})

test('new rim styles stay within the Concept envelope and expose alloy, barrel and hub groups', () => {
  const supported = wheelRims.customDesigns
  assert.equal(supported.length, 9)
  for (const design of supported) {
    const geometry = wheelRims.createRimGeometry(design)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    assert.ok(box.min.x >= -0.134384 && box.max.x <= 0.144139, design)
    assert.ok(Math.max(Math.abs(box.min.y), Math.abs(box.max.y), Math.abs(box.min.z), Math.abs(box.max.z)) < 0.303297, design)
    assert.deepEqual(new Set(geometry.groups.map((group) => group.materialIndex)), new Set([0, 1, 2]))
    geometry.dispose()
  }
  assert.equal(wheelDesigns.resolvedWheelDesign('concept-gt', 'luxurySplit'), 'original')
  assert.equal(wheelDesigns.resolvedWheelDesign('toyota-camry-2018', 'deepConcave'), 'original')
  assert.deepEqual(wheelDesigns.availableWheelDesigns('bmw-m5-f90').map((item) => item.value),
    ['original', 'deepConcave', 'doubleSpoke', 'ySpoke'])
})

test('eight rim finishes have distinct alloy colors and PBR settings', () => {
  const order = wheelFinishes.WHEEL_FINISH_ORDER
  const presets = wheelFinishes.WHEEL_FINISHES
  assert.equal(order.length, 8)
  assert.equal(new Set(order.map((finish) => presets[finish].color)).size, 8)
  const alloy = new THREE.MeshStandardMaterial()
  for (const finish of order) {
    tuning.applyRimFinish(alloy, finish)
    assert.equal(alloy.color.getHexString(), presets[finish].color.slice(1))
    assert.equal(alloy.metalness, presets[finish].metalness)
    assert.equal(alloy.roughness, presets[finish].roughness)
  }
  alloy.dispose()
})

test('BMW four-wheel fitment, safe designs and original rim visibility are reversible', () => {
  const audit = JSON.parse(readFileSync('tests/fixtures/stage-7-2-bmw-fitment.json', 'utf8'))
  assert.equal(createHash('sha256').update(readFileSync(audit.asset)).digest('hex'), audit.assetSha256)
  assert.deepEqual(bmwWheels.BMW_WHEEL_DESIGNS, ['doubleSpoke', 'ySpoke', 'deepConcave'])
  assert.equal(bmwWheels.BMW_WHEEL_FITMENTS.length, 4)
  for (const role of ['tire', 'rimBadge', 'auxiliaryRim', 'mainRim', 'rimNoTint', 'rimAccent', 'rimBlurred']) {
    const node = audit.nodes[role]
    assert.equal(node.crossingPolygons, 0, role)
    assert.equal(node.crossCornerComponents, 0, role)
    assert.ok(Object.values(node.cornerFaces).every((corner) => corner.triangles > 0), role)
    assert.ok(Object.values(node.connectedComponents).every((islands) => islands.length > 0), role)
    assert.ok(Object.values(node.cornerFaces).every((corner) => corner.outwardNormalRange.length === 2), role)
  }
  for (const fitment of bmwWheels.BMW_WHEEL_FITMENTS) {
    const measured = audit.wheels[fitment.corner]
    assert.ok(measured)
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(measured.center[axis] - fitment.centerBlender[axis]) < 0.000002)
    assert.ok(Math.abs(measured.parts.mainRim.radiusRange[1] - fitment.rimRadius) < 0.000002)
    for (const design of bmwWheels.BMW_WHEEL_DESIGNS) {
      assert.ok(Object.values(measured.replacementProbes[design].selectedFit.surfaceTriangleIntersections).every((count) => count === 0))
    }
  }
  const root = new THREE.Group()
  const sourceMeshes = bmwWheels.BMW_ORIGINAL_RIM_MESHES.map(({ leaf, material }) => {
    const ownedMaterial = new THREE.MeshStandardMaterial()
    ownedMaterial.name = material
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), ownedMaterial)
    mesh.userData.name = leaf
    root.add(mesh)
    return mesh
  })
  const tire = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  tire.name = 'retained tire'
  const brake = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  brake.name = 'retained brake'
  root.add(tire, brake)
  const resources = bmwWheels.createBMWWheelResources(root)
  let releasedResources = 0
  for (const geometry of resources.geometries.values()) geometry.addEventListener('dispose', () => { releasedResources++ })
  for (const material of resources.materials) material.addEventListener('dispose', () => { releasedResources++ })
  bmwWheels.applyBMWWheelSelection(resources, 'original', 'silver')
  assert.ok(sourceMeshes.every((mesh) => mesh.visible))
  assert.ok(resources.replacements.every((mesh) => !mesh.visible))
  for (const design of bmwWheels.BMW_WHEEL_DESIGNS) {
    bmwWheels.applyBMWWheelSelection(resources, design, 'gunmetal')
    assert.ok(sourceMeshes.every((mesh) => !mesh.visible))
    assert.ok(resources.replacements.every((mesh) => mesh.visible))
    assert.equal(resources.materials[0].color.getHexString(), wheelFinishes.WHEEL_FINISHES.gunmetal.color.slice(1))
    for (const [index, mesh] of resources.replacements.entries()) {
      const placement = bmwWheels.bmwWheelPlacement(bmwWheels.BMW_WHEEL_FITMENTS[index])
      const box = new THREE.Box3().setFromObject(mesh)
      assert.ok(box.getCenter(new THREE.Vector3()).distanceTo(placement.center) < 0.00001)
      assert.ok(mesh.geometry.groups.some((group) => group.materialIndex === 2))
    }
    assert.equal(tire.visible, true)
    assert.equal(brake.visible, true)
  }
  assert.throws(() => bmwWheels.applyBMWWheelSelection(resources, 'mesh', 'silver'))
  bmwWheels.applyBMWWheelSelection(resources, 'original', 'bronze')
  assert.ok(sourceMeshes.every((mesh) => mesh.visible))
  const childCount = root.children.length
  resources.dispose()
  assert.equal(root.children.length, childCount - 4)
  assert.equal(releasedResources, 6)
  assert.ok(sourceMeshes.every((mesh) => mesh.visible))
  for (const mesh of sourceMeshes) { mesh.geometry.dispose(); mesh.material.dispose() }
  tire.geometry.dispose(); tire.material.dispose(); brake.geometry.dispose(); brake.material.dispose()
})

test('BMW rim and paint bindings are isolated from tire, brake and mixed glass geometry', () => {
  const bmw = registry.getVehicleById('bmw-m5-f90')
  const paths = (role) => bmw.knownMeshes.find((part) => part.role === role).bindings.map((binding) => binding.nodePath.join('/'))
  const rims = paths('rimMeshes')
  assert.equal(rims.length, 3)
  assert.equal(new Set(rims).size, 3)
  assert.equal(paths('paintedMeshes').length, 1)
  for (const path of [...paths('tireMeshes'), ...paths('brakeMeshes')]) assert.ok(!rims.includes(path))
  assert.equal(bmw.knownMeshes.some((part) => part.role === 'windowGlass'), false)
  const source = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.8, roughness: 0.2 })
  const tire = new THREE.MeshStandardMaterial({ color: '#222222' })
  const owned = source.clone()
  for (const finish of ['silver', 'graphite', 'black', 'bronze']) {
    tuning.applyRimFinish(owned, finish)
    assert.notEqual(owned.color.getHexString(), tire.color.getHexString())
    assert.equal(source.color.getHexString(), 'ffffff')
  }
  owned.dispose(); source.dispose(); tire.dispose()
})

test('BMW audited paint atlas cannot mask color on the owned material', () => {
  const bmw = registry.getVehicleById('bmw-m5-f90')
  const bytes = readFileSync(resolve(`public${bmw.glbUrl}`))
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
  const paintMesh = gltf.meshes.find((mesh) => mesh.name === 'f_bmw_f90_m5_119_Carpaint_0')
  assert.ok(paintMesh)
  const primitive = paintMesh.primitives[0]
  const uv = gltf.accessors[primitive.attributes.TEXCOORD_0]
  assert.deepEqual(uv.min, [0, 0])
  assert.deepEqual(uv.max, [0, 0])
  const paintMaterial = gltf.materials[primitive.material]
  assert.equal(paintMaterial.name, 'Carpaint')
  assert.ok(paintMaterial.pbrMetallicRoughness.baseColorTexture)

  const baseMap = new THREE.DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1)
  const normalMap = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1)
  const source = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: baseMap, normalMap, clearcoat: 1 })
  const owned = tuning.clonePaintWithoutBaseColorMap(source)
  assert.equal(source.map, baseMap)
  assert.equal(owned.map, null)
  assert.equal(owned.normalMap, normalMap)
  const colors = new Set()
  for (const finish of ['glossy', 'matte', 'satin']) {
    for (const paint of PAINTS) {
      tuning.applyBodyFinish(owned, source, paint.value, finish, 'camry')
      assert.equal(owned.color.getHexString(), new THREE.Color(paint.value).getHexString())
      assert.equal(owned.map, null)
      colors.add(owned.color.getHexString())
    }
  }
  assert.equal(colors.size, PAINTS.length)
  assert.equal(source.color.getHexString(), 'ffffff')
  assert.equal(source.map, baseMap)
  owned.dispose(); source.dispose(); baseMap.dispose(); normalMap.dispose()
})

test('BMW plate calibration remains available while release controls are disabled', () => {
  const bmw = registry.getVehicleById('bmw-m5-f90')
  const footprint = JSON.parse(readFileSync('tests/fixtures/bmw-full-base-prototype-calibration.json', 'utf8'))
  const calibration = JSON.parse(readFileSync('tests/fixtures/bmw-minimal-plate-calibration.json', 'utf8'))
  const runtime = JSON.parse(readFileSync('src/components/bmwPlateMounts.json', 'utf8'))
  const hash = createHash('sha256').update(readFileSync(resolve(`public${bmw.glbUrl}`))).digest('hex')
  assert.equal(hash, '87fa667a173f3cc13a3f7375bfa2ce64be7d6c22aa886dc0b83de099b09b6c59')
  assert.equal(hash, runtime.assetSha256)
  assert.equal(hash, calibration.assetSha256)
  assert.equal(hash, footprint.assetSha256)
  for (const side of ['front', 'rear']) {
    const mount = bmw.attachmentAnchors[`${side}Plate`]
    const audit = calibration[side]
    const profile = runtime.mounts[side]
    assert.equal(bmw.features[`${side}Plate`], false)
    assert.deepEqual(footprint[side].materials, ['Carpaint'])
    assert.ok(footprint[side].minDepth > 0.002)
    assert.equal(audit.pads.length, 2)
    assert.equal(mount.bracket, undefined)
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(mount.position[axis] - profile.position[axis]) < 0.000002)
      assert.ok(Math.abs(mount.outwardNormal[axis] - profile.outwardNormal[axis]) < 0.000002)
      assert.ok(Math.abs(mount.up[axis] - profile.up[axis]) < 0.000002)
    }
    assert.ok(Math.abs(mount.widthSourceUnits / mount.heightSourceUnits - 1024 / 300) < 0.03)
    assert.equal(mount.widthSourceUnits, profile.width)
    assert.equal(mount.heightSourceUnits, profile.height)
    assert.ok(mount.widthSourceUnits >= 0.4)
    assert.equal(mount.widthSourceUnits, footprint[side].plateWidth)
    assert.equal(mount.heightSourceUnits, footprint[side].plateHeight)
    assert.equal(attachments.getPlateBracketLayout(mount), null)
    const rotation = attachments.getPlateQuaternion(mount)
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)
    assert.ok(front.distanceTo(new THREE.Vector3(...mount.outwardNormal)) < 0.000002)
    assert.ok(up.distanceTo(new THREE.Vector3(...mount.up)) < 0.000002)
    const pads = bmwMounts.getBMWPlatePadLayout(side, mount)
    assert.equal(pads.length, 2)
    for (const [index, pad] of profile.pads.entries()) {
      assert.equal(audit.pads[index].samples.length, 81)
      assert.ok(audit.pads[index].samples.every((sample) => sample.material === 'Carpaint'))
      assert.ok(audit.pads[index].samples.every((sample) => sample.mesh.includes('119_Carpaint_0')))
      assert.ok(pad.minDepth > runtime.frontOffset + pad.length)
      assert.ok(Math.abs(pad.offsetX) + pad.width / 2 < mount.widthSourceUnits / 2)
      assert.ok(Math.abs(pad.offsetY) + pad.height / 2 < mount.heightSourceUnits / 2)
      assert.ok(Math.abs(pads[index].position[2] + runtime.frontOffset + pad.length / 2) < 0.000001)
      assert.deepEqual(pads[index].size, [pad.width, pad.height, pad.length])
    }
  }
  assert.deepEqual(registry.getVehicleById('concept-gt').attachmentAnchors.frontPlate.position, [0, 0.40, 2.42])
  assert.equal(registry.getVehicleById('toyota-camry-2018').features.frontPlate, true)
  assert.equal(registry.getVehicleById('toyota-camry-2018').features.rearPlate, true)
  for (const region of REGIONS) {
    const value = formatPlate(region, '123', 'XYZ')
    assert.deepEqual(parsePlate(value), { region, digits: '123', letters: 'XYZ' })
  }
})

test('GLB structure, feature dependencies and mapped mesh materials are valid', () => {
  const reports = validateAllVehicles()
  assert.equal(reports.length, 3)
  for (const report of reports) {
    assert.deepEqual(report.errors, [])
    assert.ok(report.mappings.length > 0)
    assert.ok(report.mappings.every((mapping) => mapping.valid))
  }
  assert.equal(reports.find((report) => report.vehicleId === 'toyota-camry-2018').triangles, 875294)
  assert.equal(reports.find((report) => report.vehicleId === 'bmw-m5-f90').triangles, 259936)
  const camry = registry.getVehicleById('toyota-camry-2018')
  const unsafe = validateGlb({ ...camry, wheelReplacement: { status: 'unverified', reason: 'test' },
    attachmentAnchors: { frontPlate: null, rearPlate: null, spoilerMounts: null },
    features: { ...camry.features, frontPlate: true, rearPlate: true, spoiler: true } })
  assert.ok(unsafe.errors.some((error) => error.includes('wheelDesign requires verified fitment')))
  assert.ok(unsafe.errors.some((error) => error.includes('frontPlate requires')))
  assert.ok(unsafe.errors.some((error) => error.includes('rearPlate requires')))
  assert.ok(unsafe.errors.some((error) => error.includes('spoiler requires')))
})

test('tuning targets exact audited hierarchy and changes owned materials only', () => {
  const root = new THREE.Group()
  const parent = new THREE.Group()
  parent.userData.name = 'VerifiedParent'
  root.add(parent)
  const original = new THREE.MeshPhysicalMaterial({ color: '#65737d', clearcoat: 0.7, transmission: 0.72 })
  original.name = 'Carpaint'
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), original)
  mesh.userData.name = 'VerifiedPaint'
  parent.add(mesh)
  const descriptor = { id: 'test', knownMeshes: [{ role: 'paintedMeshes', certainty: 'verified-mesh', bindings: [{ nodePath: ['VerifiedParent', 'VerifiedPaint'], primitiveIndices: [0], expectedMaterialNames: ['Carpaint'] }] }] }
  assert.deepEqual(tuning.resolveTuningMeshes(root, descriptor, 'paintedMeshes'), [mesh])
  const owned = original.clone()
  tuning.applyBodyFinish(owned, original, '#a31325', 'matte', 'camry')
  assert.equal(original.color.getHexString(), '65737d')
  assert.equal(owned.color.getHexString(), 'a31325')
  assert.equal(owned.roughness, 0.78)
  mesh.userData.name = 'OtherPaint'
  assert.throws(() => tuning.resolveTuningMeshes(root, descriptor, 'paintedMeshes'))
  mesh.geometry.dispose(); original.dispose(); owned.dispose()
})

test('four wheel rim mappings are exact, and tires and hubcaps remain separate', () => {
  const camry = registry.getVehicleById('toyota-camry-2018')
  const rims = camry.knownMeshes.find((part) => part.role === 'rimMeshes')
  const tires = camry.knownMeshes.find((part) => part.role === 'tireMeshes')
  const hubcaps = camry.knownMeshes.find((part) => part.role === 'hubcapMeshes')
  assert.equal(rims.bindings.length, 4)
  assert.deepEqual(rims.bindings.map((binding) => binding.nodePath.at(-1)), ['alt05_GreyWheel_0', 'alt011_GreyWheel_0', 'alt017_GreyWheel_0', 'alt023_GreyWheel_0'])
  assert.ok(rims.bindings.every((binding) => binding.expectedMaterialNames[0] === 'GreyWheel'))
  assert.equal(tires.bindings.length, 25)
  assert.equal(hubcaps.bindings.length, 5)
  assert.ok(tires.bindings.every((binding) => binding.expectedMaterialNames[0] === 'Tyre'))
  assert.ok(hubcaps.bindings.every((binding) => binding.expectedMaterialNames[0] === 'hubcaps'))
  const bytes = readFileSync(resolve(`public${camry.glbUrl}`))
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
  const usedBy = (materialName) => {
    const index = gltf.materials.findIndex((material) => material.name === materialName)
    assert.ok(index >= 0)
    return gltf.nodes.filter((node) => node.mesh !== undefined &&
      gltf.meshes[node.mesh].primitives.some((primitive) => primitive.material === index))
      .map((node) => node.name).sort()
  }
  assert.deepEqual(usedBy('GreyWheel'), rims.bindings.map((binding) => binding.nodePath.at(-1)).sort())
  assert.deepEqual(usedBy('hubcaps'), hubcaps.bindings.map((binding) => binding.nodePath.at(-1)).sort())
  assert.equal(camry.features.wheelDesign, true)
  assert.equal(camry.wheelReplacement.status, 'verified')
  assert.deepEqual(camry.wheelReplacement.mounts.map((mount) => mount.cover.nodePath.at(-1)),
    ['Object037_hubcaps_0', 'Object038_hubcaps_0', 'Object039_hubcaps_0', 'Object040_hubcaps_0'])
})

test('replacement fitment requires four distinct measured rims and outward unit axles', () => {
  const camry = registry.getVehicleById('toyota-camry-2018')
  const mounts = camry.wheelReplacement.mounts
  const placements = fitment.validateWheelReplacementMounts(mounts)
  assert.equal(placements.length, 4)
  const audit = JSON.parse(readFileSync('tests/fixtures/camry-geometry-audit.json', 'utf8'))
  for (const [index, name] of ['WHEEL_LF', 'WHEEL_LR', 'WHEEL_RR', 'WHEEL_RF'].entries()) {
    const measured = audit.wheels[name]
    assert.ok(placements[index].center.distanceTo(new THREE.Vector3(...measured.rim.bounds.center)) < 0.000002)
    assert.ok(Math.abs(mounts[index].rimRadiusSourceUnits - Math.max(measured.rim.bounds.size[1], measured.rim.bounds.size[2]) / 2) < 0.000002)
    assert.ok(Math.abs(mounts[index].rimDepthSourceUnits - measured.rim.bounds.size[0]) < 0.000002)
  }
  const geometry = new THREE.BoxGeometry(0.27, 0.5, 0.5)
  const replacement = new THREE.Mesh(geometry)
  fitment.placeReplacementRim(replacement, placements[0], geometry)
  const fitted = new THREE.Box3().setFromObject(replacement)
  assert.ok(Math.abs(fitted.getSize(new THREE.Vector3()).x - mounts[0].rimDepthSourceUnits) < 1e-8)
  assert.ok(Math.abs(fitted.getSize(new THREE.Vector3()).y - 2 * mounts[0].rimRadiusSourceUnits) < 1e-8)
  assert.ok(fitted.getCenter(new THREE.Vector3()).distanceTo(placements[0].center) < 1e-8)
  geometry.dispose()
  assert.throws(() => fitment.validateWheelReplacementMounts([mounts[0], mounts[0], mounts[2], mounts[3]]))
  assert.throws(() => fitment.validateWheelReplacementMounts(mounts.map((mount, i) => i === 0 ? { ...mount, outwardAxle: [0, 0, 0] } : mount)))
  assert.throws(() => fitment.validateWheelReplacementMounts(mounts.slice(0, 3)))
  assert.equal(camry.features.wheelDesign, true)
})

test('corrected Camry rim and hubcap materials still resolve to the exact wheels', () => {
  const camry = registry.getVehicleById('toyota-camry-2018')
  const audit = JSON.parse(readFileSync('tests/fixtures/camry-geometry-audit.json', 'utf8'))
  const bytes = readFileSync(audit.asset)
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
  const binOffset = 20 + jsonLength + 8
  function geometryFor(name) {
    const node = gltf.nodes.find((entry) => entry.name === name)
    const primitive = gltf.meshes[node.mesh].primitives[0]
    const readAccessor = (id, countPerVertex) => {
      const accessor = gltf.accessors[id], view = gltf.bufferViews[accessor.bufferView]
      const offset = binOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      const stride = view.byteStride ?? (accessor.componentType === 5126 ? 4 : 2) * countPerVertex
      const values = []
      for (let i = 0; i < accessor.count; i++) for (let axis = 0; axis < countPerVertex; axis++) {
        const at = offset + i * stride + axis * (accessor.componentType === 5126 ? 4 : 2)
        values.push(accessor.componentType === 5126 ? bytes.readFloatLE(at) : bytes.readUInt16LE(at))
      }
      return values
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(readAccessor(primitive.attributes.POSITION, 3), 3))
    geometry.setIndex(readAccessor(primitive.indices, 1))
    return geometry
  }
  const root = new THREE.Group()
  const originals = [], covers = []
  const rimSource = new THREE.MeshStandardMaterial(), coverSource = new THREE.MeshStandardMaterial()
  rimSource.name = 'GreyWheel'
  coverSource.name = 'hubcaps'
  const makePath = (binding, geometry, materialName, matrix, sharedMaterial) => {
    let parent = root
    for (const segment of binding.nodePath.slice(0, -1)) {
      let child = parent.children.find((item) => item.userData.name === segment)
      if (!child) { child = new THREE.Group(); child.userData.name = segment; parent.add(child) }
      parent = child
    }
    const material = sharedMaterial ?? new THREE.MeshStandardMaterial()
    material.name = materialName
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.name = binding.nodePath.at(-1)
    if (matrix) new THREE.Matrix4().fromArray(matrix).decompose(mesh.position, mesh.quaternion, mesh.scale)
    parent.add(mesh)
    return mesh
  }
  for (const mount of camry.wheelReplacement.mounts) {
    originals.push(makePath(mount.rim, new THREE.BoxGeometry(0.1, 0.1, 0.1), 'GreyWheel', undefined, rimSource))
    const name = mount.cover.nodePath.at(-1)
    const measured = audit.selected.find((part) => part.path.endsWith(`/${name}`))
    covers.push(makePath(mount.cover, geometryFor(name), 'hubcaps', measured.worldMatrix, coverSource))
  }
  const otherHubcapBinding = camry.knownMeshes.find((part) => part.role === 'hubcapMeshes').bindings
    .find((binding) => binding.nodePath.at(-1) === 'Object058_hubcaps_0')
  const otherHubcap = makePath(otherHubcapBinding, new THREE.BoxGeometry(0.01, 0.01, 0.01), 'hubcaps', undefined, coverSource)
  const tire = new THREE.Mesh(new THREE.SphereGeometry(0.32), new THREE.MeshStandardMaterial())
  root.add(tire)
  const unrelated = ['Brake', 'Carpaint', 'Glass'].map((name) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshStandardMaterial({ color: '#777777' }))
    mesh.material.name = name
    root.add(mesh)
    return mesh
  })
  const sourceMaterials = new Set([...originals, ...covers].map((mesh) => mesh.material))
  const correctedMaterials = new Map()
  for (const [index, mesh] of [...originals, ...covers].entries()) {
    const binding = index < 4 ? camry.wheelReplacement.mounts[index].rim : camry.wheelReplacement.mounts[index - 4].cover
    assert.equal(tuning.resolveBoundMesh(root, binding, camry.id), mesh)
    assert.equal(mesh.material.name, index < 4 ? 'GreyWheel' : 'hubcaps')
    let corrected = correctedMaterials.get(mesh.material)
    if (!corrected) {
      corrected = camryAssets.createCorrectedMaterial(mesh.material)
      correctedMaterials.set(mesh.material, corrected)
    }
    assert.ok(corrected && corrected !== mesh.material)
    mesh.material = corrected
    assert.match(mesh.material.name, index < 4 ? /^GreyWheel.*preview corrected$/ : /^hubcaps.*preview corrected$/)
    assert.throws(() => tuning.resolveBoundMesh(root, binding, camry.id), /unexpected materials/)
    assert.equal(tuning.resolveBoundMeshIdentity(root, binding, camry.id), mesh)
    if (index === 0) {
      assert.throws(() => tuning.resolveBoundMeshIdentity(root, { ...binding, nodePath: ['WHEEL_LF', 'wrong'] }, camry.id), /expected one/)
      assert.throws(() => tuning.resolveBoundMeshIdentity(root, { ...binding, primitiveIndices: [0, 1] }, camry.id), /unexpected material count/)
    }
  }
  otherHubcap.material = correctedMaterials.get(coverSource)
  const resources = wheelSystem.createVehicleWheelResources(root, camry.wheelReplacement.mounts, camry.id)
  assert.deepEqual(resources.originals.map(({ mesh }) => mesh), originals)
  assert.deepEqual(resources.covers.map(({ mesh }) => mesh), covers)
  assert.equal(resources.replacements.length, 4)
  assert.equal(resources.covers.length, 4)
  assert.equal(resources.coverFinishMaterials.size, 1)
  const correctedCoverMaterial = resources.covers[0].originalMaterial
  assert.ok(covers.every((mesh) => mesh.material !== correctedCoverMaterial))
  assert.ok(resources.covers.every(({ center }) => center.material === correctedCoverMaterial))
  assert.ok(resources.replacements.every((mesh) => mesh.geometry === resources.replacements[0].geometry))
  assert.ok(resources.covers.every(({ center }) => center.geometry.getIndex().count / 3 === 1534))
  assert.ok(originals.every((mesh) => mesh.visible))
  assert.ok(covers.every((mesh) => mesh.visible))
  assert.equal(tire.visible, true)
  const finishColors = { silver: 'cbd4dc', graphite: '535b65', black: '171b22', bronze: '8b6848',
    champagneGold: 'baa174', gunmetal: '42494e', titanium: '89969d', polishedAlloy: 'dce3e8' }
  const designs = ['original', 'sport', 'multi', 'forged', 'deepConcave', 'doubleSpoke', 'ySpoke', 'luxurySplit', 'turbine', 'mesh']
  for (const design of designs) for (const [finish, hex] of Object.entries(finishColors)) {
    for (const rim of originals) tuning.applyRimFinish(rim.material, finish)
    wheelSystem.applyVehicleWheelSelection(resources, design, finish)
    assert.ok(originals.every((mesh) => mesh.visible === (design === 'original')))
    assert.ok(covers.every((mesh) => mesh.visible === (design === 'original')))
    assert.ok(originals.every((mesh) => mesh.material.color.getHexString() === hex))
    assert.ok(covers.every((mesh) => mesh.material.color.getHexString() === hex))
    assert.ok(resources.covers.every(({ center }) => center.visible === (design !== 'original')))
    assert.ok(resources.covers.every(({ center }) => center.material.color.getHexString() === '929ba2'))
    assert.ok(resources.replacements.every((mesh) => mesh.visible === (design !== 'original')))
    if (design !== 'original') assert.ok(resources.replacements.every((mesh) => mesh.geometry === resources.geometries.get(design)))
    assert.equal(resources.material.color.getHexString(), hex)
    assert.equal(tire.visible, true)
    assert.equal(otherHubcap.material.color.getHexString(), '929ba2')
    assert.ok(unrelated.every((mesh) => mesh.material.color.getHexString() === '777777'))
  }
  wheelSystem.applyVehicleWheelSelection(resources, 'sport', 'black')
  wheelSystem.applyVehicleWheelSelection(resources, 'original', 'black')
  assert.ok(covers.every((mesh) => mesh.visible && mesh.material.color.getHexString() === '171b22'))
  assert.ok(resources.replacements.every((mesh) => !mesh.visible))
  const finishDisposals = new Map([...resources.coverFinishMaterials].map((material) => {
    let count = 0
    material.addEventListener('dispose', () => { count++ })
    return [material, () => count]
  }))
  resources.dispose()
  assert.ok(originals.every((mesh) => mesh.visible))
  assert.ok(covers.every((mesh) => mesh.visible))
  assert.ok(covers.every((mesh) => mesh.material === correctedCoverMaterial))
  assert.ok(resources.covers.every(({ center }) => center.parent === null))
  assert.ok(resources.replacements.every((mesh) => mesh.parent === null))
  assert.ok([...finishDisposals.values()].every((count) => count() === 1))
  assert.equal(tire.visible, true)
  const remounted = wheelSystem.createVehicleWheelResources(root, camry.wheelReplacement.mounts, camry.id)
  wheelSystem.applyVehicleWheelSelection(remounted, 'forged', 'graphite')
  assert.ok(remounted.covers.every(({ mesh, center }) => !mesh.visible && center.visible))
  remounted.dispose()
  assert.ok(covers.every((mesh) => mesh.visible && mesh.material === correctedCoverMaterial))
  assert.ok(root.children.every((mesh) => !mesh.name.startsWith('replacement-')))
  for (const mesh of [...originals, ...covers, otherHubcap, tire, ...unrelated]) mesh.geometry.dispose()
  tire.material.dispose()
  for (const mesh of unrelated) mesh.material.dispose()
  for (const material of sourceMaterials) material.dispose()
  for (const material of correctedMaterials.values()) material.dispose()
  assert.equal(correctedMaterials.size, 2)
})

test('geometry audit confirms independent hood and bumper meshes plus measured wheel bounds', () => {
  const audit = JSON.parse(readFileSync('tests/fixtures/camry-geometry-audit.json', 'utf8'))
  const assetHash = createHash('sha256').update(readFileSync(audit.asset)).digest('hex')
  assert.equal(audit.sha256, assetHash)
  const byName = Object.fromEntries(audit.selected.map((part) => [part.path.split('/').at(-1), part]))
  assert.equal(new Set(['Body01_Carpaint_0', 'Body02_Carpaint_0', 'Body014_Carpaint_0'].map((name) => byName[name].meshIndex)).size, 3)
  assert.ok(byName.Body01_Carpaint_0.bounds.min[1] > byName.Body02_Carpaint_0.bounds.min[1])
  assert.ok(byName.Body01_Carpaint_0.bounds.min[1] > byName.Body014_Carpaint_0.bounds.min[1])
  for (const [name, wheel] of Object.entries(audit.wheels)) {
    assert.equal(wheel.rim.triangles, 24587)
    assert.deepEqual(wheel.materials.sort(), ['GreyWheel', 'Tyre', 'hubcaps'].sort())
    assert.ok(Math.abs(wheel.tireBounds.size[1] - 0.64837) < 0.001)
    assert.ok(Math.abs(wheel.rim.bounds.size[0] - 0.18964) < 0.001)
    assert.ok(Math.abs(wheel.rim.bounds.size[1] - 0.43145) < 0.001)
    assert.ok(Math.abs(Math.abs(wheel.rim.worldAxleDirectionFromLocalY[0]) - 1) < 0.001)
    assert.ok(Math.abs(wheel.rim.worldAxleDirectionFromLocalY[1]) < 0.001)
    assert.ok(Math.abs(wheel.rim.worldAxleDirectionFromLocalY[2]) < 0.001)
    assert.ok(name.startsWith('WHEEL_L') ? wheel.tireBounds.center[0] > 0 : wheel.tireBounds.center[0] < 0)
  }
  assert.ok(audit.wheels.WHEEL_LF.tireBounds.center[2] > 0)
  assert.ok(audit.wheels.WHEEL_LR.tireBounds.center[2] < 0)
  for (const [left, right] of [['WHEEL_LF', 'WHEEL_RF'], ['WHEEL_LR', 'WHEEL_RR']]) {
    const a = audit.wheels[left], b = audit.wheels[right]
    assert.ok(Math.abs(a.rim.bounds.center[2] - b.rim.bounds.center[2]) < 0.0001)
    assert.ok(Math.abs(a.rim.bounds.center[1] - b.rim.bounds.center[1]) < 0.002)
    assert.ok(Math.abs(a.rim.bounds.center[0] + b.rim.bounds.center[0]) < 0.001)
    assert.ok(Math.abs(a.rim.worldAxleDirectionFromLocalY[0] + b.rim.worldAxleDirectionFromLocalY[0]) < 0.001)
  }
  for (const candidate of Object.values(audit.surfaceCandidates)) assert.equal(candidate.status, 'inferred-candidate')
  assert.equal(audit.surfaceCandidates.frontPlate.node.split('/').at(-1), 'Body02_Carpaint_0')
  assert.equal(audit.surfaceCandidates.rearPlate.node.split('/').at(-1), 'Body09_Carpaint_0')
  assert.ok(audit.surfaceCandidates.spoilerLeft.center[0] < 0)
  assert.ok(audit.surfaceCandidates.spoilerRight.center[0] > 0)
})

test('carbon hood and bumper finish mutate only independent owned copies', () => {
  const source = new THREE.MeshPhysicalMaterial({ color: '#65737d', roughness: 0.3, clearcoat: 0.7 })
  const body = source.clone(), hood = source.clone(), front = source.clone(), rear = source.clone()
  const weave = new THREE.Texture()
  tuning.applyCarbonHood(hood, weave)
  tuning.applyBodyFinish(front, source, '#a31325', 'matte', 'camry')
  tuning.applyBodyFinish(rear, source, '#a31325', 'satin', 'camry')
  assert.equal(hood.map, weave)
  assert.equal(body.map, null)
  assert.equal(front.roughness, 0.78)
  assert.equal(rear.roughness, 0.46)
  assert.equal(source.roughness, 0.3)
  assert.equal(body.roughness, 0.3)
  for (const material of [source, body, hood, front, rear]) material.dispose()
  weave.dispose()
})

test('Camry paint finishes, bumper overrides and tint transitions keep source materials isolated', () => {
  const sourcePaint = new THREE.MeshPhysicalMaterial({ color: '#65737d', roughness: 0.3, clearcoat: 0.7 })
  const body = sourcePaint.clone(), hood = sourcePaint.clone(), front = sourcePaint.clone(), rear = sourcePaint.clone()
  const finishes = [['glossy', 0.3], ['satin', 0.46], ['matte', 0.78]]
  for (const [finish, roughness] of finishes) {
    tuning.applyBodyFinish(body, sourcePaint, '#174cc1', finish, 'camry')
    assert.equal(body.color.getHexString(), '174cc1')
    assert.equal(body.roughness, roughness)
  }
  tuning.applyBodyFinish(front, sourcePaint, '#174cc1', 'matte', 'camry')
  tuning.applyBodyFinish(rear, sourcePaint, '#174cc1', 'satin', 'camry')
  assert.equal(front.roughness, 0.78)
  assert.equal(rear.roughness, 0.46)
  assert.equal(body.roughness, 0.78)
  const carbon = new THREE.Texture()
  tuning.applyCarbonHood(hood, carbon)
  assert.equal(hood.map, carbon)
  assert.equal(body.map, null)
  tuning.applyBodyFinish(hood, sourcePaint, '#174cc1', 'satin', 'camry')
  hood.map = sourcePaint.map
  assert.equal(hood.color.getHexString(), '174cc1')
  assert.equal(hood.roughness, 0.46)
  assert.equal(hood.map, null)
  assert.equal(sourcePaint.color.getHexString(), '65737d')
  assert.equal(sourcePaint.roughness, 0.3)
  const sourceGlass = new THREE.MeshPhysicalMaterial({ color: '#a9bfca', transmission: 0.72 })
  const glass = sourceGlass.clone()
  const transmissions = []
  for (const level of ['light', 'medium', 'dark']) {
    tuning.applyWindowTint(glass, sourceGlass, level)
    transmissions.push(glass.transmission)
  }
  assert.ok(transmissions[0] > transmissions[1] && transmissions[1] > transmissions[2])
  tuning.applyWindowTint(glass, sourceGlass, 'clear')
  assert.equal(glass.transmission, sourceGlass.transmission)
  assert.equal(glass.color.getHexString(), sourceGlass.color.getHexString())
  for (const material of [sourcePaint, body, hood, front, rear, sourceGlass, glass]) material.dispose()
  carbon.dispose()
})

test('rim finish utility leaves tire, brake, paint and neutral cap source untouched', () => {
  const originals = ['GreyWheel', 'Tyre', 'Brake', 'Carpaint', 'hubcaps'].map((name) => {
    const material = new THREE.MeshStandardMaterial({ color: '#777777' })
    material.name = name
    return material
  })
  const [rim, tire, brake, paint, hubcap] = originals.map((material) => material.clone())
  tuning.applyRimFinish(rim, 'black')
  assert.equal(rim.color.getHexString(), '171b22')
  for (const material of [tire, brake, paint, hubcap]) assert.equal(material.color.getHexString(), '777777')
  for (const material of [...originals, rim, tire, brake, paint, hubcap]) material.dispose()
})

test('KG plate validation, measured bracket contacts and full footprints', () => {
  assert.deepEqual(REGIONS, ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
  for (const region of REGIONS) assert.equal(parsePlate(formatPlate(region, '777', 'AAB')).region, region)
  assert.equal(validateStoredConfig({ plate: '11 KG 777 AAB' }).plate, DEFAULT_CONFIG.plate)
  assert.equal(validateStoredConfig({ plate: '01 KG 777 ААБ' }).plate, DEFAULT_CONFIG.plate)
  assert.equal(validateStoredConfig({ frontBumperFinish: 'invalid' }).frontBumperFinish, 'body')
  const camry = registry.getVehicleById('toyota-camry-2018')
  for (const feature of ['frontPlate', 'rearPlate']) assert.equal(camry.features[feature], true)
  const calibration = JSON.parse(readFileSync('tests/fixtures/camry-anchor-calibration.json', 'utf8'))
  assert.equal(calibration.frontPlate.hits, 44)
  assert.equal(calibration.frontPlate.totalSamples, 77)
  assert.equal(calibration.rearPlate.hits, 77)
  assert.ok(calibration.rearPlate.maxGapAtSafePlane > 0.015)
  const probe = JSON.parse(readFileSync('tests/fixtures/camry-plate-bracket-probe.json', 'utf8'))
  for (const side of ['front', 'rear']) {
    const mount = camry.attachmentAnchors[`${side}Plate`]
    const footprint = probe.mountCandidates[side]
    assert.equal(footprint.sampleCount, 153)
    assert.equal(footprint.hitCount, 153)
    assert.equal(mount.bracket.surfaceContacts.length, 4)
    const layout = attachments.getPlateBracketLayout(mount)
    assert.equal(layout.posts.length, 4)
    assert.ok(layout.posts.every((post) => post.length > 0 && post.length < 0.15))
    const normal = new THREE.Vector3(...mount.outwardNormal)
    const up = new THREE.Vector3(...mount.up)
    assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(attachments.getPlateQuaternion(mount)).distanceTo(normal) < 1e-6)
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(attachments.getPlateQuaternion(mount)).distanceTo(up) < 1e-6)
    const found = new Set(probe[side].flatMap((row) => row.samples.filter((sample) => sample.hits.length).map((sample) => sample.hits[0][2].join(','))))
    for (const contact of mount.bracket.surfaceContacts) assert.ok(found.has(contact.map((value) => Math.round(value * 1e7) / 1e7).join(',')))
    const clearances = footprint.points.map((point) => {
      const surface = new THREE.Vector3(...point.point)
      return new THREE.Vector3(...mount.position).sub(surface).dot(normal)
    })
    assert.ok(Math.min(...clearances) > mount.bracket.faceGapSourceUnits + mount.bracket.depthSourceUnits)
    const frameFootprint = probe.frameCandidates[side]
    assert.equal(frameFootprint.hitCount, frameFootprint.sampleCount)
    const frameClearances = frameFootprint.points.map((point) =>
      new THREE.Vector3(...mount.position).sub(new THREE.Vector3(...point.point)).dot(normal))
    assert.ok(Math.min(...frameClearances) > mount.bracket.faceGapSourceUnits + mount.bracket.depthSourceUnits)
  }
  assert.deepEqual(probe.mountCandidates.front.meshCounts, { Grey04_Grey_0: 93, Silver01_Silver_INT_0: 60 })
  assert.deepEqual(probe.mountCandidates.rear.meshCounts, { Body09_Carpaint_0: 153 })
  assert.ok(camry.attachmentAnchors.frontPlate.position[1] < calibration.frontPlate.candidatePlaneCenterGltf[1])
  assert.ok(camry.attachmentAnchors.rearPlate.position[2] < calibration.rearPlate.candidatePlaneCenterGltf[2])
  const concept = registry.getVehicleById('concept-gt')
  assert.deepEqual(concept.attachmentAnchors.frontPlate.position, [0, 0.40, 2.42])
  assert.deepEqual(concept.attachmentAnchors.rearPlate.position, [0, 0.31, -1.94])
  assert.deepEqual(concept.attachmentAnchors.spoilerMounts.leftContact, [-0.47, 0.9, -1.78])
  const front = attachments.getPlateQuaternion(concept.attachmentAnchors.frontPlate)
  const rear = attachments.getPlateQuaternion(concept.attachmentAnchors.rearPlate)
  assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(front).distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-8)
  assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(rear).distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-8)
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(rear).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-8)
  const layout = attachments.getSpoilerLayout(concept.attachmentAnchors.spoilerMounts)
  assert.deepEqual(layout.center.toArray(), [0, 0.9, -1.78])
  assert.ok(Math.abs(layout.wingY - 1.18) < 1e-10)
  assert.ok(Math.abs(layout.wingZ + 1.85) < 1e-10)
  assert.throws(() => attachments.getPlateQuaternion({ ...concept.attachmentAnchors.frontPlate, up: [0, 0, 1] }))
  assert.throws(() => attachments.getSpoilerLayout({ ...concept.attachmentAnchors.spoilerMounts, rightContact: [0.47, 1.1, -1.78] }))
  assert.equal(concept.features.frontPlate, true)
  assert.equal(concept.features.wheelDesign, true)
})

test('Camry spoiler contacts and rendered geometry satisfy audited clearance limits', () => {
  const camry = registry.getVehicleById('toyota-camry-2018')
  const calibration = JSON.parse(readFileSync('tests/fixtures/camry-anchor-calibration.json', 'utf8'))
  const clearance = JSON.parse(readFileSync('tests/fixtures/camry-spoiler-clearance.json', 'utf8'))
  const mount = camry.attachmentAnchors.spoilerMounts
  assert.equal(camry.features.spoiler, true)
  assert.ok(mount)
  for (const [side, contact] of [['Left', mount.leftContact], ['Right', mount.rightContact]]) {
    const measured = calibration[`spoiler${side}`]
    assert.equal(measured.hits, 63)
    assert.equal(measured.missing, 0)
    assert.ok(Math.abs(contact[1] - measured.centerHeightGltf) < 0.000002)
    assert.ok(measured.normalUpRange[0] > 0.98)
  }
  const layout = attachments.getSpoilerLayout(mount)
  assert.ok(Math.abs(layout.wingSpan - 1.45) < 1e-8)
  for (const piece of clearance.intersections) {
    assert.deepEqual(piece.otherGeometryIntersections, {})
    if (piece.piece.includes('foot')) assert.ok(piece.trunkTriangleIntersections > 0)
    else assert.equal(piece.trunkTriangleIntersections, 0)
  }
})

test('optimized Camry candidate preserves mapped tuning meshes and runtime center-cap extraction', {
  skip: !existsSync('public/models/candidates/ToyotaCamry2018_WebCandidate_v3.glb'),
}, () => {
  const report = verifyCamryCandidate()
  assert.deepEqual(report.structuralErrors, [])
  assert.equal(report.wheelCount, 4)
  assert.equal(report.validMappings, 54)
  for (const wheel of report.wheels) {
    assert.equal(wheel.before.rimTriangles, wheel.after.rimTriangles)
    assert.equal(wheel.before.coverTriangles, wheel.after.coverTriangles)
    assert.equal(wheel.after.retainedCenterTriangles, 1534)
  }
  const probes = JSON.parse(readFileSync('codex-reports/camry-candidate-mount-verification.json', 'utf8'))
  for (const [key, url] of [['current', report.currentUrl], ['candidate', report.candidateUrl]]) {
    const hash = createHash('sha256').update(readFileSync(resolve(`public${url}`))).digest('hex')
    assert.equal(probes[key].assetSha256, hash, `${key} surface probe is stale`)
    for (const side of ['frontPlate', 'rearPlate']) {
      assert.equal(probes[key][side].samples, 153)
      assert.equal(probes[key][side].bodySampleHits, 153)
      assert.equal(probes[key][side].sampledBodyClearancePass, true)
      assert.ok(probes[key][side].contactDistances.every((contact) => contact.distance < 0.0001))
    }
    for (const contact of probes[key].spoiler) {
      assert.ok(contact.contactDistance < 0.0001)
      assert.equal(contact.patchHits, 25)
      assert.ok(contact.patchMinNormalUp > 0.98)
    }
  }
})
