import * as THREE from 'three'

export type CamryView = 'front' | 'rear' | 'left' | 'right' | 'top' | 'free'

export const camryViews: readonly { id: CamryView; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
  { id: 'free', label: 'Free 360' },
]

/** Source orientation is +Z forward and +Y up; distances remain in source units. */
export function getCamryCameraPose(bounds: THREE.Box3, view: CamryView, fov: number, aspect: number) {
  const target = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const directions: Record<CamryView, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.1, 1),
    rear: new THREE.Vector3(0, 0.1, -1),
    left: new THREE.Vector3(1, 0.1, 0),
    right: new THREE.Vector3(-1, 0.1, 0),
    top: new THREE.Vector3(0, 1, 0.015),
    free: new THREE.Vector3(1, 0.42, 1),
  }
  const halfVertical = THREE.MathUtils.degToRad(fov) / 2
  const verticalTan = Math.tan(halfVertical)
  const horizontalTan = verticalTan * Math.max(0.25, aspect)
  const width = view === 'left' || view === 'right' ? size.z : view === 'free' ? Math.hypot(size.x, size.z) : size.x
  const height = view === 'top' ? size.z : size.y
  const depth = view === 'front' || view === 'rear' ? size.z : view === 'left' || view === 'right' ? size.x : size.length() / 2
  const distance = Math.max(width / (2 * horizontalTan), height / (2 * verticalTan), size.length() * 0.35)
    * 1.25 + depth / 2
  return {
    target,
    position: target.clone().addScaledVector(directions[view].normalize(), distance),
    minDistance: Math.max(0.35, size.length() * 0.18),
    maxDistance: Math.max(30, size.length() * 8),
    near: Math.max(0.01, distance / 200),
    far: Math.max(100, distance * 20),
  }
}
