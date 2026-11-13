import * as THREE from 'three'
import type { BodyFinish, TintLevel, WheelFinish } from './types'
import { WHEEL_FINISHES } from './wheelFinishes'
import type { VehicleRegistryEntry } from './vehicleRegistry'
import type { MeshBinding } from './vehicleDescriptor'

/** Stable identity for an already validated mesh after owned runtime materials are installed. */
export function resolveBoundMeshIdentity(root: THREE.Object3D, binding: MeshBinding, id: string): THREE.Mesh {
    const leaf = binding.nodePath[binding.nodePath.length - 1]
    const matches: THREE.Mesh[] = []
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.name !== leaf) return
      const path: string[] = []
      let current: THREE.Object3D | null = object
      while (current && current !== root) {
        if (typeof current.userData.name === 'string') path.unshift(current.userData.name)
        current = current.parent
      }
      if (path.join('/') === binding.nodePath.join('/')) matches.push(object)
    })
    if (matches.length !== 1) throw new Error(`${id}: expected one ${leaf} mesh, found ${matches.length}`)
    const mesh = matches[0]
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (materials.length !== binding.primitiveIndices.length) throw new Error(`${id}: unexpected material count on ${leaf}`)
    return mesh
}

/** Strictly validate original glTF material names before runtime customization. */
export function resolveBoundMesh(root: THREE.Object3D, binding: MeshBinding, id: string): THREE.Mesh {
  const mesh = resolveBoundMeshIdentity(root, binding, id)
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  if (binding.expectedMaterialNames?.some((name) => !materials.some((material) => material.name === name))) {
    throw new Error(`${id}: unexpected materials on ${binding.nodePath.at(-1)}`)
  }
  return mesh
}

/** Verify audited leaf names and original material names before enabling a role. */
export function resolveTuningMeshes(root: THREE.Object3D, vehicle: VehicleRegistryEntry, role: string): THREE.Mesh[] {
  const mapping = vehicle.knownMeshes.find((part) => part.role === role && part.certainty === 'verified-mesh')
  if (!mapping) throw new Error(`${vehicle.id}: no verified ${role} mesh mapping`)
  return mapping.bindings.map((binding) => resolveBoundMesh(root, binding, vehicle.id))
}

/** Operates only on owned material copies. The Concept profile retains its existing values. */
export function applyBodyFinish(material: THREE.MeshStandardMaterial, source: THREE.MeshStandardMaterial,
  color: string, finish: BodyFinish, profile: 'concept' | 'camry' = 'concept') {
  material.color.set(color)
  material.metalness = finish === 'metallic' ? 0.68 : finish === 'glossy' ? (profile === 'camry' ? 0.25 : 0.42) : finish === 'satin' ? 0.2 : 0.06
  material.roughness = finish === 'metallic' ? 0.27 : finish === 'glossy' ? (profile === 'camry' ? 0.3 : 0.24) : finish === 'satin' ? 0.46 : 0.78
  if (material instanceof THREE.MeshPhysicalMaterial && source instanceof THREE.MeshPhysicalMaterial) {
    material.clearcoat = finish === 'metallic' ? Math.max(0.5, source.clearcoat) : finish === 'glossy' ? source.clearcoat : finish === 'satin' ? Math.max(0.08, source.clearcoat * 0.35) : 0.04
    material.clearcoatRoughness = finish === 'metallic' ? 0.18 : finish === 'glossy' ? source.clearcoatRoughness : finish === 'satin' ? 0.38 : 0.65
  }
}

/** Use when audited paint UVs collapse onto one dark base-color texel. Keep all other PBR maps. */
export function clonePaintWithoutBaseColorMap(source: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
  const owned = source.clone()
  owned.map = null
  owned.needsUpdate = true
  return owned
}

export function applyWindowTint(material: THREE.MeshPhysicalMaterial, source: THREE.MeshPhysicalMaterial, tint: TintLevel) {
  const settings = {
    light: { color: '#a9bac7', transmission: 0.82 },
    medium: { color: '#60798d', transmission: 0.56 },
    dark: { color: '#293d50', transmission: 0.28 },
  } as const
  if (tint === 'clear') {
    material.color.copy(source.color)
    material.transmission = source.transmission
  } else {
    material.color.set(settings[tint].color)
    material.transmission = settings[tint].transmission
  }
}

export function applyRimFinish(material: THREE.MeshStandardMaterial, finish: WheelFinish) {
  const preset = WHEEL_FINISHES[finish]
  material.color.set(preset.color)
  material.metalness = preset.metalness
  material.roughness = preset.roughness
}

/** Small repeating weave; owned by the scene adapter and never written to the GLB cache. */
export function createCarbonWeaveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.fillStyle = '#25292b'
  context.fillRect(0, 0, 32, 32)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    context.fillStyle = (x + y) % 2 ? '#222628' : '#282c2e'
    context.fillRect(x * 4, y * 4, 4, 4)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(40, 40)
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  return texture
}

export function applyCarbonHood(material: THREE.MeshPhysicalMaterial, texture: THREE.Texture) {
  if (material.map !== texture) { material.map = texture; material.needsUpdate = true }
  material.color.set('#909799')
  material.metalness = 0.06
  material.roughness = 0.49
  material.clearcoat = 0.24
  material.clearcoatRoughness = 0.38
}
