// Exports existing runtime rim geometry to a local Blender validation artifact.
import { readFileSync, writeFileSync } from 'node:fs'
import { loadProjectModule } from './vehicle-test-loader.mjs'

const { createRimGeometry } = loadProjectModule('src/components/WheelRims.ts')
const { placeReplacementRim } = loadProjectModule('src/vehicleWheelFitment.ts')
const THREE = (await import('three'))
const audit = JSON.parse(readFileSync('codex-reports/camry-geometry-audit.json', 'utf8'))
const result = {}
for (const design of ['sport', 'multi', 'forged']) {
  const geometry = createRimGeometry(design)
  const wheels = {}
  for (const [name, wheel] of Object.entries(audit.wheels)) {
    const center = new THREE.Vector3(...wheel.rim.bounds.center)
    const outward = new THREE.Vector3(name.startsWith('WHEEL_L') ? 1 : -1, 0, 0)
    const placement = { center, quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), outward),
      radius: Math.max(wheel.rim.bounds.size[1], wheel.rim.bounds.size[2]) / 2, depth: wheel.rim.bounds.size[0] }
    const mesh = new THREE.Mesh(geometry)
    placeReplacementRim(mesh, placement, geometry)
    mesh.updateMatrix()
    const positions = geometry.getAttribute('position')
    const point = new THREE.Vector3()
    const world = []
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrix)
      world.push(point.x, point.y, point.z)
    }
    wheels[name] = { positions: world, triangleCount: positions.count / 3 }
  }
  result[design] = wheels
  geometry.dispose()
}
writeFileSync('codex-reports/visuals/stage-5-3/wheel-replacement-geometry.json', JSON.stringify(result))
console.log(Object.fromEntries(Object.entries(result).map(([design, wheels]) => [design, Object.values(wheels)[0].triangleCount])))
