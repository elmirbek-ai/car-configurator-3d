import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { WheelDesign, WheelFinish } from '../types'
import { applyRimFinish } from '../vehicleTuning'

export const customDesigns = ['sport', 'multi', 'forged', 'deepConcave', 'doubleSpoke', 'ySpoke', 'luxurySplit', 'turbine', 'mesh'] as const
const wheelNodes = [
  { rim: 'WheelFrontLRim', side: 'left' },
  { rim: 'WheelFrontRRim', side: 'right' },
  { rim: 'WheelRearLRim', side: 'left' },
  { rim: 'WheelRearRRim', side: 'right' },
] as const
type CustomDesign = typeof customDesigns[number]
type WheelEntry = { original: THREE.Object3D; replacements: Map<CustomDesign, THREE.Mesh> }
type RimResources = { entries: WheelEntry[]; geometries: Map<CustomDesign, THREE.BufferGeometry>; material: THREE.MeshStandardMaterial; materials: THREE.MeshStandardMaterial[] }

// The GLB rims use local X as the axle and YZ as the radial plane.
function spoke(innerRadius: number, outerRadius: number, innerWidth: number, outerWidth: number, innerOffset = 0, outerOffset = 0, depth = 0.02, dish = 0) {
  const profile = new THREE.Shape()
  profile.moveTo(innerRadius, innerOffset - innerWidth)
  profile.lineTo(outerRadius, outerOffset - outerWidth)
  profile.lineTo(outerRadius, outerOffset + outerWidth)
  profile.lineTo(innerRadius, innerOffset + innerWidth)
  profile.closePath()
  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth, steps: 1, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1,
  })
  geometry.applyMatrix4(new THREE.Matrix4().set(
    0, 0, 1, 0,
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  ))
  geometry.translate(0.101, 0, 0)
  if (dish) {
    const positions = geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index++) {
      const radius = Math.hypot(positions.getY(index), positions.getZ(index))
      const factor = THREE.MathUtils.clamp((outerRadius - radius) / (outerRadius - innerRadius), 0, 1)
      positions.setX(index, positions.getX(index) - dish * factor)
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()
  }
  return geometry
}

export function createRimGeometry(design: CustomDesign, options: { deepConcaveDish?: number } = {}): THREE.BufferGeometry {
  const parts: { geometry: THREE.BufferGeometry; material: number }[] = []
  const add = (geometry: THREE.BufferGeometry, material = 0) => {
    const unindexed = geometry.index ? geometry.toNonIndexed() : geometry
    if (unindexed !== geometry) geometry.dispose()
    parts.push({ geometry: unindexed, material })
  }
  try {
    const barrel = new THREE.CylinderGeometry(0.26, 0.26, 0.19, 48, 1, true)
    barrel.rotateZ(Math.PI / 2)
    add(barrel, 1)

    const lip = new THREE.TorusGeometry(0.286, 0.013, 8, 48)
    lip.rotateY(Math.PI / 2)
    lip.translate(0.122, 0, 0)
    add(lip)

    const innerRing = new THREE.TorusGeometry(0.22, 0.007, 6, 36)
    innerRing.rotateY(Math.PI / 2)
    innerRing.translate(0.108, 0, 0)
    add(innerRing, 1)

    const hub = new THREE.CylinderGeometry(0.055, 0.055, 0.026, 24)
    hub.rotateZ(Math.PI / 2)
    hub.translate(0.112, 0, 0)
    add(hub, 2)

    const centerCap = new THREE.CylinderGeometry(0.039, 0.039, 0.005, 24)
    centerCap.rotateZ(Math.PI / 2)
    centerCap.translate(0.129, 0, 0)
    add(centerCap, 1)
    for (let index = 0; index < 5; index++) {
      const angle = index * Math.PI * 2 / 5
      const lug = new THREE.CylinderGeometry(0.007, 0.007, 0.006, 10)
      lug.rotateZ(Math.PI / 2)
      lug.translate(0.127, Math.cos(angle) * 0.076, Math.sin(angle) * 0.076)
      add(lug, 2)
    }

    if (design === 'sport' || design === 'multi') {
      const count = design === 'sport' ? 5 : 12
      for (let i = 0; i < count; i++) {
        const beam = design === 'sport'
          ? spoke(0.052, 0.279, 0.021, 0.036, 0, 0, 0.023)
          : spoke(0.052, 0.277, 0.008, 0.011, 0, 0, 0.018)
        beam.rotateX(i * Math.PI * 2 / count)
        add(beam)
      }
    } else if (design === 'forged') {
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3
        for (const beam of [
          spoke(0.052, 0.163, 0.02, 0.017),
          spoke(0.15, 0.276, 0.011, 0.012, 0.008, 0.03),
          spoke(0.15, 0.276, 0.011, 0.012, -0.008, -0.03),
        ]) {
          beam.rotateX(angle)
          add(beam)
        }
      }
    } else if (design === 'deepConcave') {
      for (let i = 0; i < 7; i++) {
        const beam = spoke(0.052, 0.278, 0.019, 0.035, 0, 0, 0.025, options.deepConcaveDish ?? 0.048)
        beam.rotateX(i * Math.PI * 2 / 7)
        add(beam)
      }
    } else if (design === 'doubleSpoke' || design === 'luxurySplit') {
      const count = design === 'doubleSpoke' ? 5 : 8
      const split = design === 'doubleSpoke' ? 0.026 : 0.016
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count
        const stem = spoke(0.052, 0.15, 0.019, 0.017, 0, 0, 0.021)
        stem.rotateX(angle); add(stem)
        for (const side of [-1, 1]) {
          const branch = spoke(0.14, 0.277, 0.010, 0.012, 0, side * split, 0.022, 0.018)
          branch.rotateX(angle); add(branch)
        }
      }
    } else if (design === 'ySpoke') {
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5
        const stem = spoke(0.052, 0.155, 0.023, 0.021, 0, 0, 0.026, 0.025)
        stem.rotateX(angle); add(stem)
        for (const side of [-1, 1]) {
          const branch = spoke(0.145, 0.278, 0.012, 0.014, 0, side * 0.055, 0.021, 0.018)
          branch.rotateX(angle); add(branch)
        }
      }
    } else if (design === 'turbine') {
      for (let i = 0; i < 12; i++) {
        const blade = spoke(0.06, 0.278, 0.011, 0.018, -0.02, 0.038, 0.018, 0.012)
        blade.rotateX(i * Math.PI / 6); add(blade)
      }
    } else if (design === 'mesh') {
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI / 5
        for (const offset of [-0.033, 0.033]) {
          const beam = spoke(0.055, 0.276, 0.007, 0.009, offset, -offset, 0.016, 0.012)
          beam.rotateX(angle); add(beam)
        }
      }
    }

    const merged = mergeGeometries(parts.map((part) => part.geometry), false)
    if (!merged) throw new Error(`Could not build ${design} wheel rim`)
    merged.clearGroups()
    let start = 0
    for (const part of parts) {
      const count = part.geometry.getAttribute('position').count
      merged.addGroup(start, count, part.material)
      start += count
    }
    merged.computeBoundingSphere()
    return merged
  } finally {
    parts.forEach((part) => part.geometry.dispose())
  }
}

/** Face alloy, recessed barrel and neutral hub use separate PBR materials. */
export function createRimMaterials(finish: WheelFinish): THREE.MeshStandardMaterial[] {
  const alloy = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMapIntensity: 1.1 })
  applyRimFinish(alloy, finish)
  return [
    alloy,
    new THREE.MeshStandardMaterial({ color: '#1d2227', metalness: 0.55, roughness: 0.52, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: '#89949c', metalness: 0.82, roughness: 0.26, side: THREE.DoubleSide }),
  ]
}

export default function WheelRims({ root, design, finish }: { root: THREE.Object3D; design: WheelDesign; finish: WheelFinish }) {
  const invalidate = useThree((state) => state.invalidate)
  const resources = useRef<RimResources | null>(null)

  useEffect(() => {
    const originals = new Map<string, THREE.Object3D>()
    root.traverse((object) => {
      if (wheelNodes.some((wheel) => wheel.rim === object.userData.name)) originals.set(object.userData.name, object)
    })
    if (wheelNodes.some((wheel) => !originals.get(wheel.rim)?.parent)) {
      console.warn('CarConcept rim hierarchy is incomplete; original rims will remain visible')
      return
    }

    const geometries = new Map<CustomDesign, THREE.BufferGeometry>()
    try {
      for (const kind of customDesigns) geometries.set(kind, createRimGeometry(kind))
    } catch (error) {
      geometries.forEach((geometry) => geometry.dispose())
      throw error
    }
    const materials = createRimMaterials(finish)
    const material = materials[0]
    const entries: WheelEntry[] = []
    for (const wheel of wheelNodes) {
      const original = originals.get(wheel.rim)
      if (!original?.parent) continue
      const replacements = new Map<CustomDesign, THREE.Mesh>()
      for (const kind of customDesigns) {
        const geometry = geometries.get(kind)
        if (!geometry) continue
        const mesh = new THREE.Mesh(geometry, materials)
        mesh.name = `${wheel.rim}-${kind}`
        mesh.position.copy(original.position)
        mesh.quaternion.copy(original.quaternion)
        mesh.scale.copy(original.scale)
        if (wheel.side === 'right') mesh.rotateY(Math.PI)
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.visible = false
        original.parent.add(mesh)
        replacements.set(kind, mesh)
      }
      entries.push({ original, replacements })
    }
    resources.current = { entries, geometries, material, materials }
    invalidate()
    return () => {
      for (const entry of entries) {
        entry.original.visible = true
        entry.replacements.forEach((mesh) => mesh.parent?.remove(mesh))
      }
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((owned) => owned.dispose())
      resources.current = null
    }
  }, [root, invalidate])

  useEffect(() => {
    const current = resources.current
    if (!current) return
    applyRimFinish(current.material, finish)
    for (const entry of current.entries) {
      entry.original.visible = design === 'original'
      for (const [kind, mesh] of entry.replacements) mesh.visible = kind === design
    }
    invalidate()
  }, [design, finish, root, invalidate])

  return null
}
