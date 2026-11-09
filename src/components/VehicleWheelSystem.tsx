import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SourceWheelReplacementMount } from '../vehicleDescriptor'
import type { WheelDesign, WheelFinish } from '../types'
import { extractCenterCapGeometry, placeReplacementRim, validateWheelReplacementMounts } from '../vehicleWheelFitment'
import { applyRimFinish, resolveBoundMeshIdentity } from '../vehicleTuning'
import { createRimGeometry } from './WheelRims'

type CustomDesign = Exclude<WheelDesign, 'original'>
const designs: readonly CustomDesign[] = ['sport', 'multi', 'forged']
const colors: Record<WheelFinish, string> = {
  silver: '#cbd4dc', graphite: '#535b65', black: '#171b22',
}

type WheelResources = {
  placements: ReturnType<typeof validateWheelReplacementMounts>
  originals: { mesh: THREE.Mesh; visible: boolean }[]
  covers: { mesh: THREE.Mesh; visible: boolean; center: THREE.Mesh; originalMaterial: THREE.MeshStandardMaterial }[]
  coverFinishMaterials: Set<THREE.MeshStandardMaterial>
  replacements: THREE.Mesh[]
  geometries: Map<CustomDesign, THREE.BufferGeometry>
  material: THREE.MeshStandardMaterial
  dispose: () => void
}

/** Runtime swap is gated by the registry's verified fitment and cover disposition. */
export function createVehicleWheelResources(root: THREE.Object3D,
  mounts: readonly SourceWheelReplacementMount[], vehicleId: string): WheelResources {
  const placements = validateWheelReplacementMounts(mounts)
  const originals = placements.map(({ rim }) => {
    const mesh = resolveBoundMeshIdentity(root, rim, vehicleId)
    return { mesh, visible: mesh.visible }
  })
  const covers: WheelResources['covers'] = []
  const coverMaterials = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>()
  const geometries = new Map<CustomDesign, THREE.BufferGeometry>()
  const material = new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.22, envMapIntensity: 1.1, side: THREE.DoubleSide })
  const replacements: THREE.Mesh[] = []
  try {
    root.updateWorldMatrix(true, false)
    mounts.forEach((mount, index) => {
      if (mount.hubcapDisposition !== 'split-cover-preserve-center') return
      if (!mount.cover || !mount.coverTopology) throw new Error(`Missing cover split data: ${vehicleId}`)
      const cover = resolveBoundMeshIdentity(root, mount.cover, vehicleId)
      if (!cover.parent || !(cover.material instanceof THREE.MeshStandardMaterial)) throw new Error(`Unsupported cover: ${cover.name}`)
      const originalMaterial = cover.material
      const centerWorld = root.localToWorld(placements[index].center.clone())
      const outward = new THREE.Vector3(...mount.outwardAxle).transformDirection(root.matrixWorld)
      const centerGeometry = extractCenterCapGeometry(cover, centerWorld, outward, mount.coverTopology)
      const center = new THREE.Mesh(centerGeometry, originalMaterial)
      center.name = `${cover.name}-retained-center`
      center.position.copy(cover.position)
      center.quaternion.copy(cover.quaternion)
      center.scale.copy(cover.scale)
      center.castShadow = cover.castShadow
      center.receiveShadow = cover.receiveShadow
      center.visible = false
      cover.parent.add(center)
      covers.push({ mesh: cover, visible: cover.visible, center, originalMaterial })
      let finishMaterial = coverMaterials.get(originalMaterial)
      if (!finishMaterial) {
        finishMaterial = originalMaterial.clone()
        coverMaterials.set(originalMaterial, finishMaterial)
      }
      cover.material = finishMaterial
    })
    for (const design of designs) geometries.set(design, createRimGeometry(design))
    for (const placement of placements) {
      const geometry = geometries.get('sport')
      if (!geometry) throw new Error('Sport rim geometry missing')
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `replacement-${placement.rim.nodePath.at(-1)}`
      placeReplacementRim(mesh, placement, geometry)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.visible = false
      root.add(mesh)
      replacements.push(mesh)
    }
  } catch (error) {
    replacements.forEach((mesh) => mesh.removeFromParent())
    covers.forEach(({ mesh, center, originalMaterial }) => {
      mesh.material = originalMaterial
      center.removeFromParent()
      center.geometry.dispose()
    })
    coverMaterials.forEach((finishMaterial) => finishMaterial.dispose())
    geometries.forEach((geometry) => geometry.dispose())
    material.dispose()
    throw error
  }
  return { placements, originals, covers, coverFinishMaterials: new Set(coverMaterials.values()), replacements, geometries, material,
    dispose: () => {
      originals.forEach(({ mesh, visible }) => { mesh.visible = visible })
      covers.forEach(({ mesh, visible, center, originalMaterial }) => {
        mesh.visible = visible
        mesh.material = originalMaterial
        center.removeFromParent()
        center.geometry.dispose()
      })
      coverMaterials.forEach((finishMaterial) => finishMaterial.dispose())
      replacements.forEach((mesh) => mesh.removeFromParent())
      geometries.forEach((geometry) => geometry.dispose())
      material.dispose()
    },
  }
}

export function applyVehicleWheelSelection(owned: WheelResources, design: WheelDesign, finish: WheelFinish) {
  owned.material.color.set(colors[finish])
  owned.coverFinishMaterials.forEach((material) => applyRimFinish(material, finish))
  const geometry = design === 'original' ? null : owned.geometries.get(design)
  if (design !== 'original' && !geometry) throw new Error(`Unknown rim design: ${design}`)
  owned.originals.forEach(({ mesh, visible }) => { mesh.visible = design === 'original' && visible })
  owned.covers.forEach(({ mesh, visible, center }) => {
    mesh.visible = design === 'original' && visible
    center.visible = design !== 'original'
  })
  owned.replacements.forEach((mesh, index) => {
    if (geometry) placeReplacementRim(mesh, owned.placements[index], geometry)
    mesh.visible = geometry !== null
  })
}

export function VehicleWheelSystem({ root, vehicleId, mounts, design, finish }: {
  root: THREE.Object3D; vehicleId: string
  mounts: readonly SourceWheelReplacementMount[]
  design: WheelDesign; finish: WheelFinish
}) {
  const invalidate = useThree((state) => state.invalidate)
  const resources = useRef<WheelResources | null>(null)
  useEffect(() => {
    const owned = createVehicleWheelResources(root, mounts, vehicleId)
    resources.current = owned
    invalidate()
    return () => {
      owned.dispose()
      resources.current = null
      invalidate()
    }
  }, [root, mounts, vehicleId, invalidate])

  useEffect(() => {
    const owned = resources.current
    if (!owned) return
    applyVehicleWheelSelection(owned, design, finish)
    invalidate()
  }, [design, finish, root, mounts, vehicleId, invalidate])
  return null
}
