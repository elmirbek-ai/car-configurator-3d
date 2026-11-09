import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { WheelDesign, WheelFinish } from '../types'

const customDesigns = ['sport', 'multi', 'forged'] as const
const wheelNodes = [
  { rim: 'WheelFrontLRim', side: 'left' },
  { rim: 'WheelFrontRRim', side: 'right' },
  { rim: 'WheelRearLRim', side: 'left' },
  { rim: 'WheelRearRRim', side: 'right' },
] as const
const finishColors: Record<WheelFinish, string> = {
  silver: '#cbd4dc', graphite: '#535b65', black: '#171b22',
}

type CustomDesign = typeof customDesigns[number]
type WheelEntry = { original: THREE.Object3D; replacements: Map<CustomDesign, THREE.Mesh> }
type RimResources = { entries: WheelEntry[]; geometries: Map<CustomDesign, THREE.BufferGeometry>; material: THREE.MeshStandardMaterial }

// The GLB rims use local X as the axle and YZ as the radial plane.
function spoke(innerRadius: number, outerRadius: number, innerWidth: number, outerWidth: number, innerOffset = 0, outerOffset = 0, depth = 0.02) {
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
  return geometry
}

export function createRimGeometry(design: CustomDesign): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (geometry: THREE.BufferGeometry) => {
    const unindexed = geometry.index ? geometry.toNonIndexed() : geometry
    if (unindexed !== geometry) geometry.dispose()
    parts.push(unindexed)
  }
  try {
    const barrel = new THREE.CylinderGeometry(0.26, 0.26, 0.19, 48, 1, true)
    barrel.rotateZ(Math.PI / 2)
    add(barrel)

    const lip = new THREE.TorusGeometry(0.286, 0.013, 8, 48)
    lip.rotateY(Math.PI / 2)
    lip.translate(0.122, 0, 0)
    add(lip)

    const innerRing = new THREE.TorusGeometry(0.22, 0.007, 6, 36)
    innerRing.rotateY(Math.PI / 2)
    innerRing.translate(0.108, 0, 0)
    add(innerRing)

    const hub = new THREE.CylinderGeometry(0.055, 0.055, 0.026, 24)
    hub.rotateZ(Math.PI / 2)
    hub.translate(0.112, 0, 0)
    add(hub)

    if (design === 'sport' || design === 'multi') {
      const count = design === 'sport' ? 5 : 12
      for (let i = 0; i < count; i++) {
        const beam = design === 'sport'
          ? spoke(0.052, 0.279, 0.021, 0.036, 0, 0, 0.023)
          : spoke(0.052, 0.277, 0.008, 0.011, 0, 0, 0.018)
        beam.rotateX(i * Math.PI * 2 / count)
        add(beam)
      }
    } else {
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
    }

    const merged = mergeGeometries(parts, false)
    if (!merged) throw new Error(`Could not build ${design} wheel rim`)
    merged.computeBoundingSphere()
    return merged
  } finally {
    parts.forEach((part) => part.dispose())
  }
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
    const material = new THREE.MeshStandardMaterial({ color: finishColors[finish], metalness: 0.85, roughness: 0.22, envMapIntensity: 1.1, side: THREE.DoubleSide })
    const entries: WheelEntry[] = []
    for (const wheel of wheelNodes) {
      const original = originals.get(wheel.rim)
      if (!original?.parent) continue
      const replacements = new Map<CustomDesign, THREE.Mesh>()
      for (const kind of customDesigns) {
        const geometry = geometries.get(kind)
        if (!geometry) continue
        const mesh = new THREE.Mesh(geometry, material)
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
    resources.current = { entries, geometries, material }
    invalidate()
    return () => {
      for (const entry of entries) {
        entry.original.visible = true
        entry.replacements.forEach((mesh) => mesh.parent?.remove(mesh))
      }
      geometries.forEach((geometry) => geometry.dispose())
      material.dispose()
      resources.current = null
    }
  }, [root, invalidate])

  useEffect(() => {
    const current = resources.current
    if (!current) return
    current.material.color.set(finishColors[finish])
    for (const entry of current.entries) {
      entry.original.visible = design === 'original'
      for (const [kind, mesh] of entry.replacements) mesh.visible = kind === design
    }
    invalidate()
  }, [design, finish, root, invalidate])

  return null
}
