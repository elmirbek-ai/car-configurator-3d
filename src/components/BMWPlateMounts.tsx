import { useMemo } from 'react'
import type { SourcePlateMount } from '../vehicleDescriptor'
import { getPlateQuaternion } from './VehicleAttachments'
import * as calibration from './bmwPlateMounts.json'

type Side = 'front' | 'rear'

/** Two measured pads behind each plate; the shared KG plate and artwork stay unchanged. */
export function getBMWPlatePadLayout(side: Side, mount: SourcePlateMount) {
  const profile = calibration.mounts[side]
  const close = (a: number, b: number) => Math.abs(a - b) < 0.000002
  if (!close(mount.widthSourceUnits, profile.width) || !close(mount.heightSourceUnits, profile.height) ||
      !mount.position.every((value, index) => close(value, profile.position[index])) ||
      !mount.outwardNormal.every((value, index) => close(value, profile.outwardNormal[index])) ||
      !mount.up.every((value, index) => close(value, profile.up[index])) ||
      mount.bracket || profile.pads.length !== 2) {
    throw new Error(`BMW ${side} plate mount does not match its measured geometry`)
  }
  return profile.pads.map((pad) => {
    if (![pad.offsetX, pad.offsetY, pad.width, pad.height, pad.length, pad.minDepth].every(Number.isFinite) ||
        pad.width <= 0 || pad.height <= 0 || pad.length <= 0 ||
        !close(calibration.frontOffset + pad.length + 0.0005, pad.minDepth)) {
      throw new Error(`BMW ${side} plate pad is invalid`)
    }
    return {
      position: [pad.offsetX, pad.offsetY, -(calibration.frontOffset + pad.length / 2)] as const,
      size: [pad.width, pad.height, pad.length] as const,
    }
  })
}

function PlatePads({ side, mount }: { side: Side; mount: SourcePlateMount }) {
  const rotation = useMemo(() => getPlateQuaternion(mount), [mount])
  const pads = useMemo(() => getBMWPlatePadLayout(side, mount), [side, mount])
  return <group position={mount.position} quaternion={rotation}>
    {pads.map((pad, index) => <mesh key={index} position={pad.position} castShadow receiveShadow>
      <boxGeometry args={pad.size} />
      <meshStandardMaterial color="#25282b" metalness={0.05} roughness={0.82} />
    </mesh>)}
  </group>
}

export function BMWPlateMounts({ front, rear }: {
  front: SourcePlateMount; rear: SourcePlateMount
}) {
  return <>
    <PlatePads side="front" mount={front} />
    <PlatePads side="rear" mount={rear} />
  </>
}
