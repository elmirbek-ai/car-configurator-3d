import * as THREE from 'three'
import type { SourceWheelReplacementMount } from './vehicleDescriptor'

export function validateWheelReplacementMounts(mounts: readonly SourceWheelReplacementMount[]) {
  if (mounts.length !== 4 || new Set(mounts.map((mount) => mount.rim.nodePath.join('/'))).size !== 4) {
    throw new Error('Wheel replacement requires four distinct rim bindings')
  }
  return mounts.map((mount) => {
    const values = [...mount.center, ...mount.outwardAxle, mount.rimRadiusSourceUnits,
      mount.rimDepthSourceUnits, mount.tireOuterRadiusSourceUnits]
    const axle = new THREE.Vector3(...mount.outwardAxle)
    if (values.some((value) => !Number.isFinite(value)) ||
        Math.abs(axle.length() - 1) > 0.01 ||
        mount.rimRadiusSourceUnits <= 0 || mount.rimDepthSourceUnits <= 0 ||
        mount.tireOuterRadiusSourceUnits <= mount.rimRadiusSourceUnits ||
        !['retained-with-clearance', 'split-cover-preserve-center'].includes(mount.hubcapDisposition) ||
        (mount.hubcapDisposition === 'split-cover-preserve-center' && (!mount.cover || !mount.coverTopology ||
          mount.coverTopology.expectedFaces <= 0 || mount.coverTopology.spokeIslandFaces <= 0 ||
          mount.coverTopology.retainedCenterFaces <= 0 || mount.coverTopology.maxCenterRadiusSourceUnits <= 0))) {
      throw new Error(`Invalid wheel fitment: ${mount.rim.nodePath.join('/')}`)
    }
    return {
      rim: mount.rim,
      center: new THREE.Vector3(...mount.center),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axle),
      radius: mount.rimRadiusSourceUnits,
      depth: mount.rimDepthSourceUnits,
    }
  })
}

/** Retain only audited disconnected center-cap islands; all source attributes remain intact. */
export function extractCenterCapGeometry(cover: THREE.Mesh, wheelCenterWorld: THREE.Vector3,
  outwardAxle: THREE.Vector3, topology: NonNullable<SourceWheelReplacementMount['coverTopology']>): THREE.BufferGeometry {
  const source = cover.geometry
  const index = source.getIndex()
  const position = source.getAttribute('position')
  if (!index || !position || index.count / 3 !== topology.expectedFaces) {
    throw new Error(`Unexpected cover topology: ${cover.name}`)
  }
  const parent = Array.from({ length: position.count }, (_, i) => i)
  const find = (start: number): number => {
    let current = start
    while (parent[current] !== current) { parent[current] = parent[parent[current]]; current = parent[current] }
    return current
  }
  const merge = (a: number, b: number) => {
    const left = find(a), right = find(b)
    if (left !== right) parent[right] = left
  }
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i)
    merge(a, index.getX(i + 1)); merge(a, index.getX(i + 2))
  }
  const components = new Map<number, { faces: number; vertices: Set<number>; triangles: number[] }>()
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    const id = find(triangle[0])
    let component = components.get(id)
    if (!component) { component = { faces: 0, vertices: new Set(), triangles: [] }; components.set(id, component) }
    component.faces++
    triangle.forEach((vertex) => component?.vertices.add(vertex))
    component.triangles.push(...triangle)
  }
  if (!Array.from(components.values()).some((component) => component.faces === topology.spokeIslandFaces)) {
    throw new Error(`Spoke cover island is missing: ${cover.name}`)
  }
  cover.updateWorldMatrix(true, false)
  const point = new THREE.Vector3()
  const radial = new THREE.Vector3()
  const selected: number[] = []
  for (const component of components.values()) {
    let radius = 0
    for (const vertex of component.vertices) {
      point.fromBufferAttribute(position, vertex).applyMatrix4(cover.matrixWorld)
      radial.subVectors(point, wheelCenterWorld).addScaledVector(outwardAxle, -radial.dot(outwardAxle))
      radius = Math.max(radius, radial.length())
    }
    if (radius <= topology.maxCenterRadiusSourceUnits) selected.push(...component.triangles)
  }
  if (selected.length / 3 !== topology.retainedCenterFaces) {
    throw new Error(`Center-cap islands differ from audit: ${cover.name}`)
  }
  const owned = source.clone()
  owned.setIndex(selected)
  owned.clearGroups()
  owned.computeBoundingBox()
  owned.computeBoundingSphere()
  return owned
}

/** Fits the full generated geometry envelope inside the audited rim radius and depth. */
export function placeReplacementRim(mesh: THREE.Mesh,
  placement: Pick<ReturnType<typeof validateWheelReplacementMounts>[number], 'center' | 'quaternion' | 'radius' | 'depth'>,
  geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds) throw new Error('Replacement rim geometry has no bounds')
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const radius = Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y), Math.abs(bounds.min.z), Math.abs(bounds.max.z))
  if (size.x <= 0 || radius <= 0 || !Number.isFinite(size.x) || !Number.isFinite(radius)) {
    throw new Error('Replacement rim geometry is invalid')
  }
  const depthScale = placement.depth / size.x
  const radialScale = placement.radius / radius
  mesh.geometry = geometry
  mesh.scale.set(depthScale, radialScale, radialScale)
  mesh.quaternion.copy(placement.quaternion)
  mesh.position.copy(placement.center).sub(center.multiply(mesh.scale).applyQuaternion(mesh.quaternion))
}
