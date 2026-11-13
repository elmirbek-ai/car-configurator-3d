import * as THREE from 'three'
import type { WheelDesign, WheelFinish } from './types'
import { applyRimFinish } from './vehicleTuning'
import { createRimGeometry, createRimMaterials } from './components/WheelRims'
import { placeReplacementRim } from './vehicleWheelFitment'

export const BMW_WHEEL_DESIGNS = ['doubleSpoke', 'ySpoke', 'deepConcave'] as const
type BMWDesign = typeof BMW_WHEEL_DESIGNS[number]

/** Exact mesh leaves from the original F90 GLB; all six are wheel-only, four-corner meshes. */
export const BMW_ORIGINAL_RIM_MESHES = [
  { leaf: 'f_bmw_f90_m5_131_M_RimBadge_Max_0', material: 'M_Rim_Main_Max' },
  { leaf: 'f_bmw_f90_m5_132_M_Rim_Secondary_Max_0', material: 'M_Rim_Main_Max' },
  { leaf: 'f_bmw_f90_m5_133_M_Rim_Main_Max_0', material: 'M_Rim_Main_Max_0' },
  { leaf: 'f_bmw_f90_m5_134_M_Rim_NoTint_Max_0', material: 'sticker_0' },
  { leaf: 'f_bmw_f90_m5_135_rimsiulver_0', material: 'M_Rim_Main_Max_0' },
  { leaf: 'f_bmw_f90_m5_137_Rim_Blurred_0', material: 'Rim_Blurred_0' },
] as const

/** Blender X-forward/Y-left/Z-up measurements, mapped into glTF X-forward/Y-up/Z-right. */
export const BMW_WHEEL_FITMENTS = [
  { corner: 'frontLeft', centerBlender: [1.588817, 0.773968, 0.377049], outwardSign: 1,
    rimRadius: 0.285748, outwardDepth: [0.627722, 0.924644] },
  { corner: 'frontRight', centerBlender: [1.588707, -0.834543, 0.379622], outwardSign: -1,
    rimRadius: 0.285582, outwardDepth: [0.688574, 0.985496] },
  { corner: 'rearLeft', centerBlender: [-1.381135, 0.755323, 0.369325], outwardSign: 1,
    rimRadius: 0.287714, outwardDepth: [0.604856, 0.909572] },
  { corner: 'rearRight', centerBlender: [-1.38125, -0.821194, 0.370361], outwardSign: -1,
    rimRadius: 0.287472, outwardDepth: [0.671855, 0.976572] },
] as const
export const BMW_SAFE_RADIUS_FACTOR = 0.96
export const BMW_SAFE_DEPTH_FACTOR = 0.82

export function bmwWheelPlacement(fitment: typeof BMW_WHEEL_FITMENTS[number]) {
  const [x, , z] = fitment.centerBlender
  const [depthMin, depthMax] = fitment.outwardDepth
  return {
    center: new THREE.Vector3(x, z, -fitment.outwardSign * (depthMin + depthMax) / 2),
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -fitment.outwardSign)),
    radius: fitment.rimRadius * BMW_SAFE_RADIUS_FACTOR,
    depth: (depthMax - depthMin) * BMW_SAFE_DEPTH_FACTOR,
  }
}

function exactOriginalRims(root: THREE.Object3D) {
  return BMW_ORIGINAL_RIM_MESHES.map(({ leaf, material }) => {
    const matches: THREE.Mesh[] = []
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.name === leaf) matches.push(object)
    })
    if (matches.length !== 1 || !(matches[0].material instanceof THREE.MeshStandardMaterial) ||
        matches[0].material.name !== material) {
      throw new Error(`BMW wheel source differs from fitment audit: ${leaf}`)
    }
    return { mesh: matches[0], visible: matches[0].visible }
  })
}

export function createBMWWheelResources(root: THREE.Group) {
  const originals = exactOriginalRims(root)
  const geometries = new Map<BMWDesign, THREE.BufferGeometry>()
  const materials = createRimMaterials('silver')
  const replacements: THREE.Mesh[] = []
  try {
    for (const design of BMW_WHEEL_DESIGNS) {
      geometries.set(design, createRimGeometry(design,
        design === 'deepConcave' ? { deepConcaveDish: 0.024 } : {}))
    }
    for (const fitment of BMW_WHEEL_FITMENTS) {
      const geometry = geometries.get('doubleSpoke')
      if (!geometry) throw new Error('BMW wheel geometry is missing')
      const mesh = new THREE.Mesh(geometry, materials)
      mesh.name = `BMW replacement ${fitment.corner}`
      placeReplacementRim(mesh, bmwWheelPlacement(fitment), geometry)
      mesh.visible = false
      mesh.castShadow = true
      mesh.receiveShadow = true
      root.add(mesh)
      replacements.push(mesh)
    }
  } catch (error) {
    replacements.forEach((mesh) => mesh.removeFromParent())
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    throw error
  }
  return {
    originals, geometries, materials, replacements,
    dispose: () => {
      originals.forEach(({ mesh, visible }) => { mesh.visible = visible })
      replacements.forEach((mesh) => mesh.removeFromParent())
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
    },
  }
}

export type BMWWheelResources = ReturnType<typeof createBMWWheelResources>

export function applyBMWWheelSelection(resources: BMWWheelResources, design: WheelDesign, finish: WheelFinish) {
  if (design !== 'original' && !BMW_WHEEL_DESIGNS.includes(design as BMWDesign)) {
    throw new Error(`Unsupported BMW wheel design: ${design}`)
  }
  applyRimFinish(resources.materials[0], finish)
  const geometry = design === 'original' ? null : resources.geometries.get(design as BMWDesign)
  resources.originals.forEach(({ mesh, visible }) => { mesh.visible = geometry ? false : visible })
  resources.replacements.forEach((mesh, index) => {
    if (geometry) placeReplacementRim(mesh, bmwWheelPlacement(BMW_WHEEL_FITMENTS[index]), geometry)
    mesh.visible = Boolean(geometry)
  })
}
