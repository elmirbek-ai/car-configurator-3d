import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SourcePlateMount, SourceSpoilerMount } from '../vehicleDescriptor'
import { parsePlate } from '../types'

/** +Z is the front of the plate. The up vector fixes readable text orientation. */
export function getPlateQuaternion(mount: SourcePlateMount): THREE.Quaternion {
  const values = [...mount.position, ...mount.outwardNormal, ...mount.up, mount.widthSourceUnits, mount.heightSourceUnits]
  const normal = new THREE.Vector3(...mount.outwardNormal)
  const givenUp = new THREE.Vector3(...mount.up)
  if (values.some((value) => !Number.isFinite(value)) || Math.abs(normal.length() - 1) > 0.01 ||
      Math.abs(givenUp.length() - 1) > 0.01 || mount.widthSourceUnits <= 0 || mount.heightSourceUnits <= 0) {
    throw new Error('Plate mount has an invalid orientation or size')
  }
  const up = givenUp.addScaledVector(normal, -givenUp.dot(normal)).normalize()
  if (up.lengthSq() < 0.99) throw new Error('Plate mount up vector is parallel to its normal')
  const right = new THREE.Vector3().crossVectors(up, normal).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal))
}

function createPlateTexture(text: string) {
  const { region, digits, letters } = parsePlate(text)
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not supported')
  // Same visual layout as the existing Concept GT plate.
  ctx.fillStyle = '#f8f8f4'
  ctx.fillRect(0, 0, 1024, 300)
  ctx.strokeStyle = '#222222'
  ctx.lineWidth = 11
  ctx.strokeRect(6, 6, 1012, 288)
  ctx.beginPath()
  ctx.moveTo(275, 8)
  ctx.lineTo(275, 292)
  ctx.lineWidth = 6
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#101010'
  ctx.font = 'bold 136px Arial, sans-serif'
  ctx.fillText(region, 138, 112, 235)
  ctx.fillStyle = '#e3262e'
  ctx.fillRect(57, 198, 75, 46)
  ctx.fillStyle = '#ffdb28'
  ctx.beginPath()
  ctx.arc(94, 220, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#151515'
  ctx.font = 'bold 73px Arial, sans-serif'
  ctx.fillText('KG', 201, 225, 120)
  ctx.fillStyle = '#111111'
  ctx.textAlign = 'center'
  ctx.font = 'bold 165px Arial, sans-serif'
  ctx.fillText(`${digits || '   '} ${letters || '   '}`, 645, 155, 724)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function PlateMesh({ mount, texture }: { mount: SourcePlateMount; texture: THREE.CanvasTexture }) {
  const rotation = useMemo(() => getPlateQuaternion(mount), [mount])
  const bracket = useMemo(() => getPlateBracketLayout(mount), [mount])
  return <>
    {bracket && <>
      <mesh position={bracket.frameCenter} quaternion={rotation} castShadow receiveShadow>
        <boxGeometry args={[mount.bracket!.widthSourceUnits, mount.bracket!.heightSourceUnits, mount.bracket!.depthSourceUnits]} />
        <meshStandardMaterial color="#1b2025" metalness={0.25} roughness={0.58} />
      </mesh>
      {bracket.posts.map((post, index) => <mesh key={index} position={post.center} quaternion={post.rotation} castShadow>
        <cylinderGeometry args={[mount.bracket!.postRadiusSourceUnits, mount.bracket!.postRadiusSourceUnits, post.length, 8]} />
        <meshStandardMaterial color="#1b2025" metalness={0.25} roughness={0.58} />
      </mesh>)}
    </>}
    <mesh position={mount.position} quaternion={rotation} castShadow>
      <planeGeometry args={[mount.widthSourceUnits, mount.heightSourceUnits]} />
      <meshStandardMaterial map={texture} metalness={0.06} roughness={0.65} side={THREE.DoubleSide} />
    </mesh>
  </>
}

/** Positions every post between a measured body contact and the back of the mounting frame. */
export function getPlateBracketLayout(mount: SourcePlateMount) {
  const bracket = mount.bracket
  if (!bracket) return null
  const { widthSourceUnits: width, heightSourceUnits: height, depthSourceUnits: depth,
    faceGapSourceUnits: gap, postRadiusSourceUnits: radius, surfaceContacts } = bracket
  if (![width, height, depth, gap, radius, ...surfaceContacts.flat()].every(Number.isFinite) ||
      width < mount.widthSourceUnits || height < mount.heightSourceUnits || depth <= 0 || gap <= 0 ||
      radius <= 0 || surfaceContacts.length < 2) throw new Error('Invalid plate bracket dimensions or contacts')
  const rotation = getPlateQuaternion(mount)
  const center = new THREE.Vector3(...mount.position)
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)
  const backOffset = gap + depth
  const frameCenter = center.clone().addScaledVector(normal, -(gap + depth / 2))
  const posts = surfaceContacts.map((tuple) => {
    const surface = new THREE.Vector3(...tuple)
    const relative = surface.clone().sub(center)
    const x = relative.dot(right)
    const y = relative.dot(up)
    const inward = -relative.dot(normal)
    if (Math.abs(x) > width / 2 - radius || Math.abs(y) > height / 2 - radius ||
        inward <= backOffset || inward > 0.15) throw new Error('Plate bracket contact is outside its measured mounting range')
    const frame = center.clone().addScaledVector(right, x).addScaledVector(up, y).addScaledVector(normal, -backOffset)
    const span = frame.sub(surface)
    return {
      center: surface.clone().addScaledVector(span, 0.5),
      rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize()),
      length: span.length(),
    }
  })
  return { frameCenter, posts }
}

export function VehiclePlates({ text, front, rear }: { text: string; front: SourcePlateMount | null; rear: SourcePlateMount | null }) {
  const texture = useMemo(() => front || rear ? createPlateTexture(text) : null, [text, front, rear])
  useEffect(() => () => texture?.dispose(), [texture])
  if (!texture) return null
  return <>
    {front && <PlateMesh mount={front} texture={texture} />}
    {rear && <PlateMesh mount={rear} texture={texture} />}
  </>
}

/** The wing geometry is sized from verified source-unit contacts; no mount is guessed. */
export function getSpoilerLayout(mount: SourceSpoilerMount) {
  if ([...mount.leftContact, ...mount.rightContact, mount.wingSpanSourceUnits,
    mount.wingLiftSourceUnits, mount.rearOffsetSourceUnits,
    mount.supportBaseRiseSourceUnits ?? 0, mount.footLiftSourceUnits ?? 0].some((value) => !Number.isFinite(value))) {
    throw new Error('Spoiler mount has non-finite coordinates')
  }
  const left = new THREE.Vector3(...mount.leftContact)
  const right = new THREE.Vector3(...mount.rightContact)
  const span = right.distanceTo(left)
  if (span < 0.1 || right.x <= left.x || Math.abs(right.y - left.y) > 0.005 || Math.abs(right.z - left.z) > 0.005 || mount.wingSpanSourceUnits < span || mount.wingLiftSourceUnits <= 0 ||
      (mount.supportBaseRiseSourceUnits ?? 0) < 0 || (mount.supportBaseRiseSourceUnits ?? 0) >= mount.wingLiftSourceUnits ||
      (mount.footLiftSourceUnits ?? 0) < 0) {
    throw new Error('Spoiler mount contacts or dimensions are invalid')
  }
  const center = left.add(right).multiplyScalar(0.5)
  return { center, span, left: -span / 2, right: span / 2,
    wingY: center.y + mount.wingLiftSourceUnits,
    wingZ: center.z + mount.rearOffsetSourceUnits,
    wingSpan: mount.wingSpanSourceUnits }
}

export const wingProfile = new THREE.Shape()
wingProfile.moveTo(-0.15, -0.012)
wingProfile.bezierCurveTo(-0.04, -0.035, 0.07, -0.028, 0.14, -0.012)
wingProfile.bezierCurveTo(0.16, -0.002, 0.15, 0.009, 0.115, 0.016)
wingProfile.bezierCurveTo(0.02, 0.034, -0.11, 0.012, -0.15, -0.012)

export const supportProfile = new THREE.Shape()
supportProfile.moveTo(-0.04, -0.04)
supportProfile.lineTo(0.08, 0.025)
supportProfile.lineTo(0.025, 0.265)
supportProfile.lineTo(-0.08, 0.265)
supportProfile.closePath()

export const endplateProfile = new THREE.Shape()
endplateProfile.moveTo(-0.16, -0.055)
endplateProfile.quadraticCurveTo(0, -0.06, 0.145, -0.035)
endplateProfile.lineTo(0.13, 0.04)
endplateProfile.quadraticCurveTo(-0.02, 0.065, -0.16, 0.055)
endplateProfile.closePath()

export function VehicleSpoiler({ mount }: { mount: SourceSpoilerMount }) {
  const layout = useMemo(() => getSpoilerLayout(mount), [mount])
  const carbon = { color: '#192128', metalness: 0.28, roughness: 0.32, clearcoat: 0.65, clearcoatRoughness: 0.2 }
  const centerZ = layout.center.z
  const centerY = layout.center.y
  const baseRise = mount.supportBaseRiseSourceUnits ?? 0
  const footLift = mount.footLiftSourceUnits ?? 0
  return <group>
    <mesh position={[layout.wingSpan / 2, layout.wingY, layout.wingZ]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
      <extrudeGeometry args={[wingProfile, { depth: layout.wingSpan, steps: 1, curveSegments: 8, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.004, bevelThickness: 0.004 }]} />
      <meshPhysicalMaterial {...carbon} />
    </mesh>
    {[layout.left, layout.right].map((x) => <group key={x}>
      <mesh position={[layout.center.x + x + 0.026, centerY + baseRise, centerZ - 0.02]} rotation={[0, -Math.PI / 2, 0]} scale={[1, (layout.wingY - centerY - baseRise) / 0.28, 1]} castShadow receiveShadow>
        <extrudeGeometry args={[supportProfile, { depth: 0.052, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.005, bevelThickness: 0.005 }]} />
        <meshPhysicalMaterial {...carbon} roughness={0.38} />
      </mesh>
      <mesh position={[layout.center.x + x, centerY + footLift, centerZ]} rotation={[-0.3, 0, 0]} scale={[0.11, 0.018, 0.07]} castShadow receiveShadow>
        <sphereGeometry args={[1, 12, 6]} /><meshPhysicalMaterial {...carbon} roughness={0.38} />
      </mesh>
    </group>)}
    {[-layout.wingSpan / 2 - 0.005, layout.wingSpan / 2 + 0.005].map((x) => <mesh key={x} position={[layout.center.x + x + 0.007, layout.wingY, layout.wingZ]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
      <extrudeGeometry args={[endplateProfile, { depth: 0.014, steps: 1, bevelEnabled: false }]} /><meshPhysicalMaterial {...carbon} roughness={0.36} />
    </mesh>)}
  </group>
}
