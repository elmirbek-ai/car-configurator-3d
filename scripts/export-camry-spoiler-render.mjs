// Exports the existing shared spoiler geometry at measured Camry contacts for Blender review.
import { writeFileSync, readFileSync } from 'node:fs'
import { loadProjectModule } from './vehicle-test-loader.mjs'
const THREE = await import('three')
const { wingProfile, supportProfile, endplateProfile, getSpoilerLayout } = loadProjectModule('src/components/VehicleAttachments.tsx')
const calibration = JSON.parse(readFileSync('codex-reports/camry-anchor-calibration.json', 'utf8'))
const mount = {
  leftContact: [-0.42795, calibration.spoilerLeft.centerHeightGltf, -2.14259],
  rightContact: [0.42822, calibration.spoilerRight.centerHeightGltf, -2.14259],
  wingSpanSourceUnits: 1.45,
  wingLiftSourceUnits: 0.25,
  rearOffsetSourceUnits: -0.08,
  supportBaseRiseSourceUnits: 0.04,
  footLiftSourceUnits: 0.008,
}
const layout = getSpoilerLayout(mount)
const pieces = []
function add(name, geometry, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  mesh.scale.set(...scale)
  mesh.updateMatrix()
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  const attribute = source.getAttribute('position')
  const point = new THREE.Vector3()
  const positions = []
  for (let index = 0; index < attribute.count; index++) {
    point.fromBufferAttribute(attribute, index).applyMatrix4(mesh.matrix)
    positions.push(point.x, point.y, point.z)
  }
  pieces.push({ name, positions })
  if (source !== geometry) source.dispose()
  geometry.dispose()
}
add('wing', new THREE.ExtrudeGeometry(wingProfile, { depth: layout.wingSpan, steps: 1, curveSegments: 8, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.004, bevelThickness: 0.004 }),
  [layout.wingSpan / 2, layout.wingY, layout.wingZ], [0, -Math.PI / 2, 0])
for (const x of [layout.left, layout.right]) {
  add('support', new THREE.ExtrudeGeometry(supportProfile, { depth: 0.052, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.005, bevelThickness: 0.005 }),
    [layout.center.x + x + 0.026, layout.center.y + mount.supportBaseRiseSourceUnits, layout.center.z - 0.02], [0, -Math.PI / 2, 0], [1, (layout.wingY - layout.center.y - mount.supportBaseRiseSourceUnits) / 0.28, 1])
  add('foot', new THREE.SphereGeometry(1, 12, 6), [layout.center.x + x, layout.center.y + mount.footLiftSourceUnits, layout.center.z], [-0.3, 0, 0], [0.11, 0.018, 0.07])
}
for (const x of [-layout.wingSpan / 2 - 0.005, layout.wingSpan / 2 + 0.005]) {
  add('endplate', new THREE.ExtrudeGeometry(endplateProfile, { depth: 0.014, steps: 1, bevelEnabled: false }),
    [layout.center.x + x + 0.007, layout.wingY, layout.wingZ], [0, -Math.PI / 2, 0])
}
writeFileSync('codex-reports/visuals/stage-5-3/spoiler-candidate-geometry.json', JSON.stringify({ mount, pieces }))
console.log(mount, pieces.map((piece) => [piece.name, piece.positions.length / 9]))
