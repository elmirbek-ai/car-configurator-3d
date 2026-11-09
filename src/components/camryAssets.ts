import * as THREE from 'three'

/** Shared preview/adapter recipe; all returned materials are owned by the caller. */
export function createCorrectedMaterial(source: THREE.Material): THREE.Material | null {
  if (!(source instanceof THREE.MeshStandardMaterial)) return null
  if (source.name === 'Carpaint') {
    return new THREE.MeshPhysicalMaterial({
      name: 'Carpaint · preview corrected', color: '#65737d', map: source.map, side: source.side,
      metalness: 0.25, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.16,
      envMapIntensity: 0.8,
    })
  }
  if (source.name === 'Glass') {
    return new THREE.MeshPhysicalMaterial({
      name: 'Glass · preview corrected', color: '#a9bfca', map: source.map, side: source.side,
      metalness: 0, roughness: 0.12, transmission: 0.72, thickness: 0.015, ior: 1.5,
      envMapIntensity: 0.8,
    })
  }
  const presets: Record<string, { color: string; metalness: number; roughness: number }> = {
    GreyWheel: { color: '#858d94', metalness: 0.78, roughness: 0.32 },
    hubcaps: { color: '#929ba2', metalness: 0.5, roughness: 0.36 },
    Tyre: { color: '#202428', metalness: 0.02, roughness: 0.88 },
    Chrome: { color: '#bdc4c9', metalness: 0.9, roughness: 0.18 },
    Grey: { color: '#353c43', metalness: 0.08, roughness: 0.68 },
    Plastic: { color: '#2d3237', metalness: 0.02, roughness: 0.72 },
    Grey_INT: { color: '#3d4349', metalness: 0.02, roughness: 0.8 },
    Silver_INT: { color: '#899198', metalness: 0.55, roughness: 0.38 },
    Leahter: { color: '#34383c', metalness: 0, roughness: 0.83 },
    Mirror: { color: '#aab5bd', metalness: 0.55, roughness: 0.14 },
  }
  const preset = presets[source.name]
  if (!preset) return null
  const copy = source.clone()
  copy.name = `${source.name} · preview corrected`
  copy.color.set(preset.color)
  copy.metalness = preset.metalness
  copy.roughness = preset.roughness
  return copy
}

/** Use only for scenes parsed by a private GLTFLoader, never for useGLTF cache entries. */
export function disposeLoadedScene(root: THREE.Object3D, additionalMaterials: Iterable<THREE.Material> = [], additionalTextures: Iterable<THREE.Texture> = []) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>(additionalMaterials)
  const textures = new Set<THREE.Texture>(additionalTextures)
  const bitmaps = new Set<ImageBitmap>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of meshMaterials) {
      materials.add(material)
    }
  })
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value)
    }
  }
  for (const texture of textures) {
    const image: unknown = texture.source.data
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) bitmaps.add(image)
    texture.dispose()
  }
  for (const bitmap of bitmaps) bitmap.close()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}
