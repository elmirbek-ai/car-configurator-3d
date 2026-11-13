import { useCallback, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import type { CarConfiguration } from '../types'
import type { SourcePlateMount } from '../vehicleDescriptor'
import { getVehicleById } from '../vehicleRegistry'
import { applyBodyFinish, applyRimFinish, clonePaintWithoutBaseColorMap, resolveTuningMeshes } from '../vehicleTuning'
import { disposeLoadedScene } from './camryAssets'
import { CamryCameraRig, CamryStudio } from './CamryScene'
import { camryViews, type CamryView } from './camryCamera'
import { VehiclePlates } from './VehicleAttachments'
import { BMWPlateMounts } from './BMWPlateMounts'
import { applyBMWWheelSelection, createBMWWheelResources, type BMWWheelResources } from '../bmwWheelFitment'
import { resolvedWheelDesign } from '../wheelDesigns'

type Status = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }
type OwnedModel = {
  root: THREE.Group
  paint: { owned: THREE.MeshPhysicalMaterial; source: THREE.MeshPhysicalMaterial }
  rims: THREE.MeshStandardMaterial[]
  wheels: BMWWheelResources | null
}

type BMWVariant = 'original' | 'plate-ready'
const candidateUrl = '/models/candidates/bmw-m5-f90/bmw_m5_f90_plate_ready.glb'
// Candidate audit centers translated by the same fitted offset as the original model.
const candidateAnchors: { frontPlate: SourcePlateMount; rearPlate: SourcePlateMount } = {
  frontPlate: {
    position: [0.030631, 0.4539738, 2.4350744], outwardNormal: [0, 0, 1], up: [0, 1, 0],
    widthSourceUnits: 0.45, heightSourceUnits: 0.132,
  },
  rearPlate: {
    position: [0.030631, 0.7764448, -2.3674887],
    outwardNormal: [0, 0.260665852, -0.965429083],
    up: [0, 0.965429083, 0.260665852],
    widthSourceUnits: 0.45, heightSourceUnits: 0.132,
  },
}

function WebGLFailure({ onFailure }: { onFailure: (status: Status) => void }) {
  useEffect(() => { onFailure({ kind: 'error', message: 'WebGL жеткиликсиз.' }) }, [onFailure])
  return <div className="canvas-fallback" role="alert">WebGL жеткиликсиз.</div>
}

function BMWModel({ config, variant, onBounds, onStatus }: {
  config: CarConfiguration
  variant: BMWVariant
  onBounds: (bounds: THREE.Box3) => void
  onStatus: (status: Status) => void
}) {
  const invalidate = useThree((state) => state.invalidate)
  const [model, setModel] = useState<OwnedModel | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let owned: THREE.Group | null = null
    let wheelResources: BMWWheelResources | null = null
    const extraMaterials = new Set<THREE.Material>()
    onStatus({ kind: 'loading' })

    async function load() {
      let parsed: THREE.Group | null = null
      try {
        const descriptor = getVehicleById('bmw-m5-f90')
        if (!descriptor) throw new Error('BMW registry entry is unavailable')
        const url = import.meta.env.DEV && variant === 'plate-ready' ? candidateUrl : descriptor.glbUrl
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
        const bytes = await response.arrayBuffer()
        if (!active) return
        parsed = (await new GLTFLoader().parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1))).scene
        if (!active) { disposeLoadedScene(parsed); parsed = null; return }

        // Check the original glTF material bindings before any material replacement.
        const paintMeshes = resolveTuningMeshes(parsed, descriptor, 'paintedMeshes')
        const rimMeshes = resolveTuningMeshes(parsed, descriptor, 'rimMeshes')
        resolveTuningMeshes(parsed, descriptor, 'tireMeshes')
        resolveTuningMeshes(parsed, descriptor, 'brakeMeshes')
        if (paintMeshes.length !== 1 || !(paintMeshes[0].material instanceof THREE.MeshPhysicalMaterial)) {
          throw new Error('BMW paint mesh has unexpected material geometry')
        }
        const paintSource = paintMeshes[0].material
        extraMaterials.add(paintSource)
        const paintOwned = clonePaintWithoutBaseColorMap(paintSource)
        extraMaterials.add(paintOwned)
        paintMeshes[0].material = paintOwned
        const rims: THREE.MeshStandardMaterial[] = []
        for (const mesh of rimMeshes) {
          if (!(mesh.material instanceof THREE.MeshStandardMaterial)) throw new Error(`BMW rim material is unsupported: ${mesh.name}`)
          extraMaterials.add(mesh.material)
          const copy = mesh.material.clone()
          // The original dark rim base-color texture masks finish swatches; retain its geometry and other maps.
          copy.map = null
          copy.needsUpdate = true
          extraMaterials.add(copy)
          mesh.material = copy
          rims.push(copy)
        }

        const root = new THREE.Group()
        root.rotation.y = -Math.PI / 2 // Verified BMW +X forward → viewer +Z forward.
        root.add(parsed)
        root.updateWorldMatrix(true, true)
        const bodyBounds = new THREE.Box3()
        parsed.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          // Six stray gauge triangles reach X=-8.34; exclude them from camera fit, not from the model.
          if (object.userData.name === 'f_bmw_f90_m5_099_gauge_emissive_001_0') return
          bodyBounds.expandByObject(object)
          object.castShadow = object === paintMeshes[0] || rimMeshes.includes(object)
          object.receiveShadow = true
        })
        if (bodyBounds.isEmpty()) throw new Error('BMW body has no renderable geometry')
        const center = bodyBounds.getCenter(new THREE.Vector3())
        root.position.set(-center.x, -bodyBounds.min.y, -center.z)
        root.updateWorldMatrix(true, true)
        const fittedBounds = bodyBounds.clone().translate(root.position)
        if (!active) { disposeLoadedScene(root, extraMaterials); parsed = null; return }
        if (variant === 'original') wheelResources = createBMWWheelResources(parsed)
        owned = root
        parsed = null
        setModel({ root, paint: { owned: paintOwned, source: paintSource }, rims, wheels: wheelResources })
        onBounds(fittedBounds)
        onStatus({ kind: 'ready' })
        invalidate()
      } catch (error) {
        wheelResources?.dispose()
        if (parsed) disposeLoadedScene(parsed, extraMaterials)
        if (active && !controller.signal.aborted) onStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
      wheelResources?.dispose()
      if (owned) disposeLoadedScene(owned, extraMaterials)
    }
  }, [invalidate, onBounds, onStatus, variant])

  useEffect(() => {
    if (!model) return
    applyBodyFinish(model.paint.owned, model.paint.source, config.color, config.bodyFinish, 'camry')
    for (const rim of model.rims) applyRimFinish(rim, config.wheelFinish)
    if (model.wheels) applyBMWWheelSelection(model.wheels, resolvedWheelDesign('bmw-m5-f90', config.wheelDesign), config.wheelFinish)
    invalidate()
  }, [model, config.color, config.bodyFinish, config.wheelFinish, config.wheelDesign, invalidate])

  const vehicle = getVehicleById('bmw-m5-f90')
  const anchors = import.meta.env.DEV && variant === 'plate-ready' ? candidateAnchors : vehicle?.attachmentAnchors
  return model ? <>
    <primitive object={model.root} dispose={null} />
    {vehicle?.features.frontPlate && vehicle.features.rearPlate &&
      <>
        {variant === 'original' && anchors?.frontPlate && anchors.rearPlate &&
          <BMWPlateMounts front={anchors.frontPlate} rear={anchors.rearPlate} />}
        <VehiclePlates text={config.plate} front={anchors?.frontPlate ?? null} rear={anchors?.rearPlate ?? null} />
      </>}
  </> : null
}

export default function BMWScene({ config }: { config: CarConfiguration }) {
  const [variant, setVariant] = useState<BMWVariant>('original')
  const [bounds, setBounds] = useState<THREE.Box3 | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState<CamryView>('free')
  const [request, setRequest] = useState<{ view: CamryView; sequence: number }>({ view: 'free', sequence: 0 })
  const onManualChange = useCallback(() => setView('free'), [])
  const onBounds = useCallback((next: THREE.Box3) => setBounds(next), [])

  return <div className="embedded-camry">
    <div className="canvas-wrapper">
      <Canvas camera={{ fov: 37, near: 0.05, far: 150, position: [0, 2, 8] }} dpr={[1, 1.5]} frameloop="demand" shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
        fallback={<WebGLFailure onFailure={setStatus} />}>
        <color attach="background" args={['#202932']} />
        <CamryStudio />
        {bounds && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, bounds.min.y - 0.015, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} /><meshStandardMaterial color="#4a535c" roughness={0.95} />
        </mesh>}
        <BMWModel key={`${variant}-${retry}`} config={config} variant={variant} onBounds={onBounds} onStatus={setStatus} />
        <CamryCameraRig bounds={bounds} request={request} activeView={view} onManualChange={onManualChange} />
      </Canvas>
      {status.kind !== 'ready' && <div className="viewer-overlay" role={status.kind === 'error' ? 'alert' : 'status'}>
        {status.kind === 'loading' ? <div className="loading">BMW M5 F90 жүктөлүүдө…</div>
          : <div className="model-error"><strong>BMW модели жүктөлгөн жок</strong><span>{status.message}</span>
            <button type="button" onClick={() => { setBounds(null); setStatus({ kind: 'loading' }); setRetry((value) => value + 1) }}>Кайра жүктөө</button></div>}
      </div>}
      <div className="viewer-hint">Сүйрөңүз — айландыруу · Scroll — масштаб</div>
    </div>
    {import.meta.env.DEV && <div className="bmw-model-compare" role="group" aria-label="BMW model comparison">
      <span>BMW model preview</span>
      <button type="button" aria-pressed={variant === 'original'} onClick={() => { if (variant === 'original') return; setBounds(null); setStatus({ kind: 'loading' }); setVariant('original') }}>Original</button>
      <button type="button" aria-pressed={variant === 'plate-ready'} onClick={() => { if (variant === 'plate-ready') return; setBounds(null); setStatus({ kind: 'loading' }); setVariant('plate-ready') }}>Plate ready</button>
    </div>}
    <div className="camera-controls" role="group" aria-label="BMW камера көрүнүшү">
      {camryViews.map((item) => <button key={item.id} type="button" aria-pressed={view === item.id}
        onClick={() => { setView(item.id); setRequest((previous) => ({ view: item.id, sequence: previous.sequence + 1 })) }}>{item.label}</button>)}
    </div>
  </div>
}
