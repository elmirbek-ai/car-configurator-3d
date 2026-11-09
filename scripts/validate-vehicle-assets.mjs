import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadProjectModule } from './vehicle-test-loader.mjs'

const { listVehicles } = loadProjectModule('src/vehicleRegistry.ts')
const componentSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const accessorSizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

export function validateGlb(vehicle) {
  const path = resolve(`public${vehicle.glbUrl}`)
  const errors = []
  const warnings = []
  const file = readFileSync(path)
  if (file.length < 20 || file.toString('ascii', 0, 4) !== 'glTF' || file.readUInt32LE(4) !== 2 || file.readUInt32LE(8) !== file.length) {
    throw new Error(`${path}: invalid GLB 2.0 header or length`)
  }
  let offset = 12
  const chunks = []
  while (offset < file.length) {
    if (offset + 8 > file.length) throw new Error(`${path}: truncated chunk header`)
    const length = file.readUInt32LE(offset)
    const type = file.toString('ascii', offset + 4, offset + 8)
    offset += 8
    if (length % 4 || offset + length > file.length) throw new Error(`${path}: invalid ${type} chunk length`)
    chunks.push({ type, offset, length })
    offset += length
  }
  if (offset !== file.length || chunks[0]?.type !== 'JSON' || chunks[1]?.type !== 'BIN\0' || chunks.length !== 2) {
    throw new Error(`${path}: expected JSON and BIN chunks`)
  }
  const json = JSON.parse(file.toString('utf8', chunks[0].offset, chunks[0].offset + chunks[0].length))
  if (json.asset?.version !== '2.0') errors.push('glTF asset version is not 2.0')
  const binLength = chunks[1].length
  for (const [index, buffer] of (json.buffers ?? []).entries()) {
    if (index !== 0 || buffer.uri || buffer.byteLength > binLength || binLength - buffer.byteLength > 3) errors.push(`buffer ${index}: invalid BIN range`)
  }
  for (const [index, view] of (json.bufferViews ?? []).entries()) {
    if (view.buffer !== 0 || (view.byteOffset ?? 0) + view.byteLength > json.buffers[0].byteLength) errors.push(`bufferView ${index}: out of range`)
  }
  for (const [index, accessor] of (json.accessors ?? []).entries()) {
    const view = json.bufferViews?.[accessor.bufferView]
    const component = componentSizes[accessor.componentType]
    const width = accessorSizes[accessor.type]
    if (!view || !component || !width || accessor.count < 0) { errors.push(`accessor ${index}: invalid metadata`); continue }
    const element = component * width
    const stride = view.byteStride ?? element
    if ((accessor.byteOffset ?? 0) + (accessor.count ? (accessor.count - 1) * stride + element : 0) > view.byteLength) errors.push(`accessor ${index}: out of range`)
  }
  for (const [index, node] of (json.nodes ?? []).entries()) {
    if (node.mesh !== undefined && !json.meshes?.[node.mesh]) errors.push(`node ${index}: missing mesh`)
    for (const child of node.children ?? []) if (!json.nodes?.[child]) errors.push(`node ${index}: missing child ${child}`)
  }
  for (const [index, mesh] of (json.meshes ?? []).entries()) for (const primitive of mesh.primitives) {
    if (primitive.attributes?.POSITION === undefined || !json.accessors?.[primitive.attributes.POSITION]) errors.push(`mesh ${index}: missing position accessor`)
    for (const accessor of Object.values(primitive.attributes ?? {})) if (!json.accessors?.[accessor]) errors.push(`mesh ${index}: invalid attribute accessor`)
    if (primitive.indices !== undefined && !json.accessors?.[primitive.indices]) errors.push(`mesh ${index}: invalid index accessor`)
    if (primitive.material !== undefined && !json.materials?.[primitive.material]) errors.push(`mesh ${index}: invalid material`)
  }
  for (const [index, texture] of (json.textures ?? []).entries()) {
    const imageIndex = texture.extensions?.KHR_texture_basisu?.source ?? texture.source
    if (imageIndex === undefined || !json.images?.[imageIndex]) errors.push(`texture ${index}: invalid image`)
  }
  const paths = new Map()
  const visit = (nodeIndex, ancestors) => {
    const node = json.nodes[nodeIndex]
    const path = [...ancestors, node.name ?? `#${nodeIndex}`]
    paths.set(path.join('/'), node)
    for (const child of node.children ?? []) visit(child, path)
  }
  for (const scene of json.scenes ?? []) for (const nodeIndex of scene.nodes ?? []) visit(nodeIndex, [])
  const mappings = []
  for (const part of vehicle.knownMeshes) for (const binding of part.bindings) {
    const pathName = binding.nodePath.join('/')
    const node = paths.get(pathName)
    const primitives = node?.mesh === undefined ? [] : json.meshes[node.mesh]?.primitives ?? []
    const actualMaterials = binding.primitiveIndices.map((index) => json.materials?.[primitives[index]?.material]?.name ?? null)
    const valid = !!node && binding.primitiveIndices.every((index) => !!primitives[index]) &&
      (!binding.expectedMaterialNames || binding.expectedMaterialNames.every((name) => actualMaterials.includes(name)))
    mappings.push({ role: part.role, path: pathName, primitiveIndices: binding.primitiveIndices, actualMaterials, valid })
    if (!valid) errors.push(`mapping ${part.role}: ${pathName}`)
  }
  const triangles = (json.meshes ?? []).flatMap((mesh) => mesh.primitives).reduce((total, primitive) => {
    const count = primitive.indices === undefined ? json.accessors[primitive.attributes.POSITION].count : json.accessors[primitive.indices].count
    return total + (primitive.mode === undefined || primitive.mode === 4 ? Math.floor(count / 3) : 0)
  }, 0)
  if (vehicle.performance.triangles !== null && triangles !== vehicle.performance.triangles) warnings.push(`registry triangle count ${vehicle.performance.triangles} differs from GLB ${triangles}`)
  if (vehicle.performance.downloadBytes !== null && file.length !== vehicle.performance.downloadBytes) warnings.push(`registry file size ${vehicle.performance.downloadBytes} differs from GLB ${file.length}`)
  if (vehicle.id === 'toyota-camry-2018' && (file.length > 15 * 1024 * 1024 || triangles > 250000)) warnings.push('exceeds proposed desktop transfer or triangle budget')
  const requiredRoles = { bodyPaint: 'paintedMeshes', bodyFinish: 'paintedMeshes', windowTint: 'windowGlass', wheelFinish: 'rimMeshes', carbonHood: 'hoodSurface', frontBumper: 'frontBumperPaint', rearBumper: 'rearBumperPaint' }
  for (const [feature, role] of Object.entries(requiredRoles)) {
    if (vehicle.features[feature] && vehicle.id !== 'concept-gt' && !mappings.some((mapping) => mapping.role === role && mapping.valid)) errors.push(`feature ${feature} lacks valid ${role} mapping`)
  }
  if (vehicle.id !== 'concept-gt' && vehicle.features.wheelFinish && mappings.filter((mapping) => mapping.role === 'rimMeshes' && mapping.valid).length !== 4) errors.push('wheelFinish requires four verified rim meshes')
  if (vehicle.features.frontPlate && !vehicle.attachmentAnchors.frontPlate) errors.push('frontPlate requires a verified front attachment')
  if (vehicle.features.rearPlate && !vehicle.attachmentAnchors.rearPlate) errors.push('rearPlate requires a verified rear attachment')
  if (vehicle.features.spoiler && !vehicle.attachmentAnchors.spoilerMounts) errors.push('spoiler requires verified mounting contacts')
  if (vehicle.features.wheelDesign && vehicle.wheelReplacement.status !== 'verified' && vehicle.wheelReplacement.status !== 'legacy-adapter') {
    errors.push('wheelDesign requires verified fitment and cover clearance')
  }
  if (vehicle.wheelReplacement.status === 'verified') {
    const rims = new Set(mappings.filter((mapping) => mapping.role === 'rimMeshes' && mapping.valid).map((mapping) => mapping.path))
    const covers = new Set(mappings.filter((mapping) => mapping.role === 'hubcapMeshes' && mapping.valid).map((mapping) => mapping.path))
    const mounts = vehicle.wheelReplacement.mounts
    if (mounts.length !== 4 || mounts.some((mount) => !rims.has(mount.rim.nodePath.join('/')))) {
      errors.push('wheel replacement mounts do not match four verified rim meshes')
    }
    if (new Set(mounts.map((mount) => mount.rim.nodePath.join('/'))).size !== 4) errors.push('wheel replacement rim mounts must be distinct')
    for (const mount of mounts) {
      if (mount.hubcapDisposition !== 'split-cover-preserve-center') continue
      const coverPath = mount.cover?.nodePath.join('/')
      const node = paths.get(coverPath)
      const primitive = node?.mesh === undefined ? null : json.meshes[node.mesh]?.primitives[0]
      const faceCount = primitive?.indices === undefined ? null : json.accessors[primitive.indices]?.count / 3
      if (!coverPath || !covers.has(coverPath) || faceCount !== mount.coverTopology?.expectedFaces ||
          !Number.isFinite(mount.coverTopology?.maxCenterRadiusSourceUnits)) {
        errors.push(`wheel cover topology or mapping is invalid: ${coverPath ?? 'missing'}`)
      }
    }
  }
  return {
    vehicleId: vehicle.id, modelUrl: vehicle.glbUrl, path, bytes: statSync(path).size,
    nodes: json.nodes?.length ?? 0, meshes: json.meshes?.length ?? 0,
    primitives: (json.meshes ?? []).reduce((count, mesh) => count + mesh.primitives.length, 0), triangles,
    materials: json.materials?.length ?? 0, textures: json.textures?.length ?? 0,
    extensionsRequired: json.extensionsRequired ?? [], mappings,
    unknownAnchors: [
      ...(['frontPlate', 'rearPlate', 'spoilerMounts'].filter((key) => vehicle.attachmentAnchors[key] === null)),
      ...(vehicle.cameraOrientation.metersPerSourceUnit === null ? ['physicalScale'] : []),
      ...(vehicle.wheelReplacement.status === 'unverified' ? ['wheelReplacementClearance'] : []),
    ],
    browserRuntimeVerified: false,
    errors, warnings,
  }
}

export function validateAllVehicles() { return listVehicles().map(validateGlb) }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const results = validateAllVehicles()
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), vehicles: results }
  writeFileSync('codex-reports/asset-validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(results.map(({ vehicleId, bytes, triangles, errors, warnings }) => ({ vehicleId, bytes, triangles, errors, warnings })), null, 2))
  if (results.some((result) => result.errors.length)) process.exitCode = 1
}
