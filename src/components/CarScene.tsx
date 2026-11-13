import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { KTX2Loader, type OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { CarConfiguration } from '../types'
import { getVehicleById } from '../vehicleRegistry'
import WheelRims from './WheelRims'
import { VehiclePlates, VehicleSpoiler } from './VehicleAttachments'
import { applyBodyFinish, applyRimFinish, applyWindowTint } from '../vehicleTuning'
import { resolvedWheelDesign } from '../wheelDesigns'

const MODEL_URL = '/models/CarConcept.glb'
const conceptAnchors = getVehicleById('concept-gt')?.attachmentAnchors
const isPaintMaterial = (name: string) => /^paint(?:\b|\s|_)/i.test(name)
const isRimMaterial = (name: string) => /^rim(?:\b|\d|_)/i.test(name)
const windowGlassMeshes = new Set(['BodyWindshield', 'BodyWindowsRearSides', 'BodyRearwindow', 'BodyDoorRWindow', 'BodyDoorLWindow'])
function createCarbonTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not supported')
  ctx.fillStyle = '#202426'
  ctx.fillRect(0, 0, 64, 64)
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      const x = column * 8
      const y = row * 8
      const vertical = (row + column) % 2 === 0
      ctx.fillStyle = vertical ? '#24282a' : '#222729'
      ctx.fillRect(x, y, 8, 8)
      ctx.fillStyle = '#292d2f'
      if (vertical) ctx.fillRect(x + 3, y, 1, 8)
      else ctx.fillRect(x, y + 3, 8, 1)
      ctx.fillStyle = '#1d2224'
      if (vertical) ctx.fillRect(x + 6, y, 1, 8)
      else ctx.fillRect(x, y + 6, 8, 1)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(36, 36)
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  return texture
}
const ktx2Loaders = new WeakMap<THREE.WebGLRenderer, KTX2Loader>()

function getKtx2Loader(gl: THREE.WebGLRenderer) {
  let loader = ktx2Loaders.get(gl)
  if (!loader) {
    loader = new KTX2Loader().setTranscoderPath('/basis/')
    loader.detectSupport(gl)
    ktx2Loaders.set(gl, loader)
  }
  return loader
}

function releaseKtx2Loader(gl: THREE.WebGLRenderer) {
  const loader = ktx2Loaders.get(gl)
  if (loader) {
    ktx2Loaders.delete(gl)
    loader.dispose()
  }
}

type CameraView = 'front' | 'rear' | 'left' | 'right' | 'top' | 'free'
const cameraViews: { id: CameraView; label: string; position: [number, number, number] }[] = [
  { id: 'front', label: 'Front', position: [0, 1.5, 6.8] },
  { id: 'rear', label: 'Rear', position: [0, 1.5, -6.8] },
  { id: 'left', label: 'Left', position: [6.8, 1.7, 0] },
  { id: 'right', label: 'Right', position: [-6.8, 1.7, 0] },
  { id: 'top', label: 'Top', position: [0, 8, 0.5] },
  { id: 'free', label: 'Free 360', position: [5, 2.5, 7] },
]

function CameraRig({ request, activeView, onManualChange }: { request: { view: CameraView }; activeView: CameraView; onManualChange: () => void }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const controls = useRef<OrbitControlsImpl>(null)
  const destination = useRef<THREE.Spherical | null>(null)
  const offset = useRef(new THREE.Vector3())
  const spherical = useRef(new THREE.Spherical())

  useEffect(() => {
    const view = cameraViews.find((item) => item.id === request.view)
    if (view && controls.current && activeView === request.view) {
      const aspect = size.width / Math.max(size.height, 1)
      const frameScale = Math.min(1.35, Math.max(1, 1 / aspect))
      offset.current.set(...view.position).sub(controls.current.target).multiplyScalar(frameScale)
      destination.current = new THREE.Spherical().setFromVector3(offset.current)
      invalidate()
    }
  }, [request, activeView, size.width, size.height, invalidate])

  useFrame((_, delta) => {
    if (!destination.current || !controls.current) return
    const target = destination.current
    const current = spherical.current.setFromVector3(offset.current.copy(camera.position).sub(controls.current.target))
    const angle = Math.atan2(Math.sin(target.theta - current.theta), Math.cos(target.theta - current.theta))
    const blend = 1 - Math.exp(-5 * delta)
    current.radius = THREE.MathUtils.lerp(current.radius, target.radius, blend)
    current.phi = THREE.MathUtils.lerp(current.phi, target.phi, blend)
    current.theta += angle * blend
    camera.position.setFromSpherical(current).add(controls.current.target)
    controls.current.update()
    if (Math.abs(current.radius - target.radius) < 0.01 && Math.abs(current.phi - target.phi) < 0.002 && Math.abs(angle) < 0.002) {
      camera.position.setFromSpherical(target).add(controls.current.target)
      controls.current.update()
      destination.current = null
    } else {
      invalidate()
    }
  })

  return <OrbitControls ref={controls} makeDefault target={[0, 0.6, 0]} minDistance={3.5} maxDistance={12} maxPolarAngle={Math.PI / 2 - 0.07} enablePan={false} enableDamping dampingFactor={0.06} onStart={() => { destination.current = null; onManualChange() }} />
}

function StudioEnvironment() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    let room: RoomEnvironment | null = null
    let generator: THREE.PMREMGenerator | null = null
    let environment: THREE.WebGLRenderTarget | null = null
    try {
      room = new RoomEnvironment()
      generator = new THREE.PMREMGenerator(gl)
      environment = generator.fromScene(room)
    } catch (error) {
      console.warn('Local studio environment unavailable:', error)
    } finally {
      generator?.dispose()
      room?.dispose()
    }
    if (!environment) return

    const map = environment
    const previous = scene.environment
    const previousIntensity = scene.environmentIntensity
    scene.environment = map.texture
    scene.environmentIntensity = 0.65
    invalidate()
    return () => {
      scene.environment = previous
      scene.environmentIntensity = previousIntensity
      map.dispose()
    }
  }, [gl, scene, invalidate])

  return null
}

function CarModel({ config, onReady }: { config: CarConfiguration; onReady: (ready: boolean) => void }) {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const { scene } = useGLTF(MODEL_URL, false, false, (loader) => {
    loader.setKTX2Loader(getKtx2Loader(gl))
  })

  useEffect(() => { onReady(true) }, [onReady])
  useEffect(() => () => releaseKtx2Loader(gl), [gl])

  const carbonTexture = useRef<THREE.CanvasTexture | null>(null)
  const { cloned, ownedMaterials, paintMaterials, hoodMaterial, glassMaterials } = useMemo(() => {
    const root = scene.clone(true)
    const copies = new Map<THREE.Material, THREE.Material>()
    const owned = new Set<THREE.Material>()
    const paintSources = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>()
    const glassSources = new Map<THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial>()
    const hoodMaterials: { material: THREE.MeshPhysicalMaterial; source: THREE.MeshPhysicalMaterial }[] = []
    const copyMutableMaterial = (material: THREE.Material, meshName: string) => {
      if (meshName === 'BodyHood' && material.name === 'Paint 1 Carmine' && material instanceof THREE.MeshPhysicalMaterial) {
        const copy = material.clone()
        owned.add(copy)
        paintSources.set(copy, material)
        hoodMaterials.push({ material: copy, source: material })
        return copy
      }
      const isWindowGlass = windowGlassMeshes.has(meshName) && material.name === 'Glass' && material instanceof THREE.MeshPhysicalMaterial
      if (!isPaintMaterial(material.name) && !isRimMaterial(material.name) && !isWindowGlass) return material
      let copy = copies.get(material)
      if (!copy) {
        copy = material.clone()
        copies.set(material, copy)
        owned.add(copy)
      }
      if (isPaintMaterial(material.name) && copy instanceof THREE.MeshStandardMaterial && material instanceof THREE.MeshStandardMaterial) {
        paintSources.set(copy, material)
      }
      if (isWindowGlass && copy instanceof THREE.MeshPhysicalMaterial && material instanceof THREE.MeshPhysicalMaterial) {
        glassSources.set(copy, material)
      }
      return copy
    }
    root.traverse((object) => {
      if (object.userData.name === 'License Plate') object.visible = false
      if (!(object instanceof THREE.Mesh)) return
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => copyMutableMaterial(material, object.name))
        : copyMutableMaterial(object.material, object.name)
      object.castShadow = object.visible && /^(Body|Wheel)/.test(object.name)
      object.receiveShadow = true
    })
    return {
      cloned: root,
      ownedMaterials: [...owned],
      paintMaterials: [...paintSources].map(([material, source]) => ({ material, source })),
      hoodMaterial: hoodMaterials[0],
      glassMaterials: [...glassSources].map(([material, source]) => ({ material, source })),
    }
  }, [scene])

  useEffect(() => {
    for (const { material, source } of paintMaterials) {
      applyBodyFinish(material, source, config.color, config.bodyFinish)
    }
    invalidate()
  }, [paintMaterials, config.color, config.bodyFinish, config.carbonHood, invalidate])

  useEffect(() => {
    cloned.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue
        if (isRimMaterial(material.name)) {
          applyRimFinish(material, config.wheelFinish)
        }
      }
    })
    invalidate()
  }, [cloned, config.wheelFinish, invalidate])

  useEffect(() => {
    for (const { material, source } of glassMaterials) {
      applyWindowTint(material, source, config.tint)
    }
    invalidate()
  }, [glassMaterials, config.tint, invalidate])

  useEffect(() => {
    if (!hoodMaterial) return
    const { material, source } = hoodMaterial
    const map = config.carbonHood ? (carbonTexture.current ??= createCarbonTexture()) : source.map
    if (material.map !== map) {
      material.map = map
      material.needsUpdate = true
    }
    if (config.carbonHood) {
      material.color.set('#9ea4a6')
      material.metalness = 0.08
      material.roughness = 0.58
      material.clearcoat = 0.16
      material.clearcoatRoughness = 0.44
    }
    invalidate()
  }, [hoodMaterial, config.carbonHood, config.color, config.bodyFinish, invalidate])

  useEffect(() => () => ownedMaterials.forEach((material) => material.dispose()), [ownedMaterials])
  useEffect(() => () => {
    carbonTexture.current?.dispose()
    carbonTexture.current = null
  }, [])

  return (
    <group>
      <primitive object={cloned} />
      <WheelRims root={cloned} design={resolvedWheelDesign('concept-gt', config.wheelDesign)} finish={config.wheelFinish} />
      <VehiclePlates text={config.plate} front={conceptAnchors?.frontPlate ?? null} rear={conceptAnchors?.rearPlate ?? null} />
      {config.spoiler && conceptAnchors?.spoilerMounts && <VehicleSpoiler mount={conceptAnchors.spoilerMounts} />}
    </group>
  )
}

class ModelErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) {
    console.error('3D model error:', error)
    this.props.onError()
  }
  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

function LoadingStatus({ ready }: { ready: boolean }) {
  const progress = useProgress((state) => state.progress)
  if (ready) return null
  return <div className="viewer-overlay" role="status" aria-live="polite"><div className="loading">3D модель жүктөлүүдө… {Math.min(99, Math.max(0, Math.round(progress)))}%</div></div>
}

export default function CarScene({ config }: { config: CarConfiguration }) {
  const [view, setView] = useState<CameraView>('free')
  const [request, setRequest] = useState<{ view: CameraView }>({ view: 'free' })
  const [modelReady, setModelReady] = useState(false)
  const [modelError, setModelError] = useState(false)
  return (
    <>
      <div className="canvas-wrapper">
      <Canvas fallback={<div className="canvas-fallback" role="alert">Бул түзмөктө 3D көрүнүшүн ачуу мүмкүн болгон жок.</div>} frameloop="demand" shadows camera={{ position: [5, 2.5, 7], fov: 37, near: 0.1, far: 100 }} dpr={[1, 1.5]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <color attach="background" args={['#10161e']} />
        <fog attach="fog" args={['#10161e', 14, 30]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 6]} intensity={2.8} castShadow shadow-mapSize={[1024, 1024]} shadow-normalBias={0.02} />
        <directionalLight position={[-5, 4, -4]} intensity={1.4} color="#b9d3ff" />
        <directionalLight position={[2, 5, -6]} intensity={1.2} color="#ffe4cf" />
        <StudioEnvironment />
        <Suspense fallback={null}>
          <ModelErrorBoundary onError={() => setModelError(true)}><CarModel config={config} onReady={setModelReady} /></ModelErrorBoundary>
          <ContactShadows key={config.spoiler ? 'spoiler' : 'plain'} frames={1} resolution={256} opacity={0.6} scale={12} blur={2.2} far={4} position={[0, -0.06, 0]} />
        </Suspense>
        <gridHelper args={[20, 20, '#35404b', '#242d36']} position={[0, -0.09, 0]} />
        <CameraRig request={request} activeView={view} onManualChange={() => setView('free')} />
      </Canvas>
      {modelError
        ? <div className="viewer-overlay"><div className="model-error" role="alert"><strong>3D модель жүктөлгөн жок</strong><span>CarConcept.glb жана KTX2 файлдарын текшериңиз.</span><button type="button" onClick={() => window.location.reload()}>Кайра жүктөө</button></div></div>
        : <LoadingStatus ready={modelReady} />}
      <div className="viewer-hint">Сүйрөңүз — айландыруу · Scroll — масштаб</div>
      </div>
      <div className="camera-controls" role="group" aria-label="Камера көрүнүшү">
        {cameraViews.map((item) => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => { setView(item.id); setRequest({ view: item.id }) }}>{item.label}</button>)}
      </div>
    </>
  )
}
