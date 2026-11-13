import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { getVehicleById } from '../vehicleRegistry'
import { DEFAULT_CONFIG, type CarConfiguration } from '../types'
import { applyBodyFinish, applyCarbonHood, applyRimFinish, applyWindowTint, createCarbonWeaveTexture, resolveBoundMesh, resolveTuningMeshes } from '../vehicleTuning'
import { createCorrectedMaterial, disposeLoadedScene } from './camryAssets'
import { camryViews, getCamryCameraPose, type CamryView } from './camryCamera'
import { VehicleWheelSystem } from './VehicleWheelSystem'
import { VehiclePlates, VehicleSpoiler } from './VehicleAttachments'
import { resolvedWheelDesign } from '../wheelDesigns'

type LoadStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }
type PaintRole = 'body' | 'hood' | 'frontBumper' | 'rearBumper'
type PaintPair = { material: THREE.MeshPhysicalMaterial; source: THREE.MeshPhysicalMaterial; role: PaintRole }
type AnchorInspection = { part: string; point: [number, number, number]; normal: [number, number, number] }
type LoadMetrics = { bytes: number; transferBytes: number | null; fetchMs: number; parseMs: number; readyMs: number; triangles: number; startedAt: number }
type FrameMetrics = { fps: number; frameMs: number; drawCalls: number; geometries: number; textures: number }
const candidateUrl = '/models/candidates/ToyotaCamry2018_WebCandidate_v3.glb'
const vec3 = (vector: THREE.Vector3): [number, number, number] => [vector.x, vector.y, vector.z]
type CamryOwnedModel = {
  root: THREE.Group
  paint: PaintPair[]
  glass: { material: THREE.MeshPhysicalMaterial; source: THREE.MeshPhysicalMaterial }[]
  rims: THREE.MeshStandardMaterial[]
  carbonTexture: THREE.CanvasTexture
  debugBounds: { part: string; center: [number, number, number]; size: [number, number, number] }[]
}

// parseAsync cannot be cancelled; queue retries so an old parse is disposed before the next starts.
let loadQueue: Promise<void> = Promise.resolve()

function CamryModel({ url, config, debug, onInspect, onReady, onStatus, onMetrics }: {
  url: string
  config: CarConfiguration
  debug: boolean
  onInspect: (inspection: AnchorInspection) => void
  onReady: (bounds: THREE.Box3) => void
  onStatus: (status: LoadStatus) => void
  onMetrics: (metrics: LoadMetrics) => void
}) {
  const vehicle = getVehicleById('toyota-camry-2018')
  const invalidate = useThree((state) => state.invalidate)
  const [model, setModel] = useState<CamryOwnedModel | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let owned: THREE.Group | null = null
    const sourceMaterials = new Set<THREE.Material>()
    const correctedMaterials = new Map<THREE.Material, THREE.Material>()
    let carbonTexture: THREE.CanvasTexture | null = null
    onStatus({ kind: 'loading' })

    async function load() {
      if (!active) return
      let parsed: THREE.Group | null = null
      try {
        const startedAt = performance.now()
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
        const buffer = await response.arrayBuffer()
        const fetchDone = performance.now()
        if (!active) return
        parsed = (await new GLTFLoader().parseAsync(buffer, url.slice(0, url.lastIndexOf('/') + 1))).scene
        const parseDone = performance.now()
        if (!active) {
          disposeLoadedScene(parsed)
          parsed = null
          return
        }
        const vehicle = getVehicleById('toyota-camry-2018')
        if (!vehicle) throw new Error('Camry descriptor is unavailable')
        const paintMeshes = resolveTuningMeshes(parsed, vehicle, 'paintedMeshes')
        const glassMeshes = resolveTuningMeshes(parsed, vehicle, 'windowGlass')
        const rimMeshes = resolveTuningMeshes(parsed, vehicle, 'rimMeshes')
        // Validate original covers before correction; WheelSystem later checks stable identity.
        if (vehicle.wheelReplacement.status === 'verified') {
          for (const mount of vehicle.wheelReplacement.mounts) {
            if (!mount.cover) throw new Error('Camry replacement wheel is missing a cover mapping')
            resolveBoundMesh(parsed, mount.cover, vehicle.id)
          }
        }
        const hood = resolveTuningMeshes(parsed, vehicle, 'hoodSurface')[0]
        const frontBumper = resolveTuningMeshes(parsed, vehicle, 'frontBumperPaint')[0]
        const rearBumper = resolveTuningMeshes(parsed, vehicle, 'rearBumperPaint')[0]
        const trunk = resolveTuningMeshes(parsed, vehicle, 'trunkPaint')[0]
        if (rimMeshes.length !== 4 || !paintMeshes.includes(hood) || !paintMeshes.includes(frontBumper) || !paintMeshes.includes(rearBumper)) {
          throw new Error('Camry advanced tuning mappings are incomplete')
        }
        parsed.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          const correct = (source: THREE.Material) => {
            sourceMaterials.add(source)
            let copy = correctedMaterials.get(source)
            if (!copy) {
              copy = createCorrectedMaterial(source) ?? source
              if (copy !== source) correctedMaterials.set(source, copy)
            }
            return copy
          }
          const original = Array.isArray(object.material) ? object.material : [object.material]
          object.castShadow = original.some((material) => material.name === 'Carpaint' || material.name === 'Tyre')
          object.receiveShadow = true
          object.material = Array.isArray(object.material) ? object.material.map(correct) : correct(object.material)
        })
        // The GLB shares one Carpaint material. Only these three meshes need independent copies.
        for (const mesh of [hood, frontBumper, rearBumper]) {
          if (!(mesh.material instanceof THREE.MeshPhysicalMaterial)) throw new Error(`Unexpected painted mesh: ${mesh.name}`)
          const copy = mesh.material.clone()
          correctedMaterials.set(copy, copy)
          mesh.material = copy
        }
        const bounds = new THREE.Box3().setFromObject(parsed)
        if (bounds.isEmpty()) throw new Error('Camry GLB has no visible geometry')
        let triangles = 0
        parsed.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          const geometry = object.geometry
          triangles += Math.floor((geometry.index?.count ?? geometry.attributes.position.count) / 3)
        })
        const debugBounds = (debug ? [
          { part: 'Front plate candidate fascia', mesh: frontBumper },
          { part: 'Rear plate and spoiler candidate trunk', mesh: trunk },
        ] : []).map(({ part, mesh }) => {
          const box = new THREE.Box3().setFromObject(mesh)
          return { part, center: vec3(box.getCenter(new THREE.Vector3())), size: vec3(box.getSize(new THREE.Vector3())) }
        })
        const paint = [...new Set(paintMeshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
        const glass = [...new Set(glassMeshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
        const rims = [...new Set(rimMeshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
        if (!paint.every((material) => material instanceof THREE.MeshPhysicalMaterial) ||
            !glass.every((material) => material instanceof THREE.MeshPhysicalMaterial) ||
            !rims.every((material) => material instanceof THREE.MeshStandardMaterial)) {
          throw new Error('Camry paint or glass material is incompatible with the tuning adapter')
        }
        carbonTexture = createCarbonWeaveTexture()
        if (!active) {
          disposeLoadedScene(parsed, [...sourceMaterials, ...correctedMaterials.values()], carbonTexture ? [carbonTexture] : [])
          parsed = null
          return
        }
        owned = parsed
        parsed = null
        const paintPairs = paint.map((material) => ({ material, source: material.clone(), role: material === hood.material ? 'hood' : material === frontBumper.material ? 'frontBumper' : material === rearBumper.material ? 'rearBumper' : 'body' } satisfies PaintPair))
        const glassPairs = glass.map((material) => ({ material, source: material.clone() }))
        for (const pair of [...paintPairs, ...glassPairs]) correctedMaterials.set(pair.source, pair.source)
        setModel({ root: owned, paint: paintPairs, glass: glassPairs, rims, carbonTexture, debugBounds })
        onReady(bounds)
        const resource = performance.getEntriesByName(new URL(url, window.location.href).href, 'resource').at(-1)
        const transferBytes = typeof PerformanceResourceTiming !== 'undefined' && resource instanceof PerformanceResourceTiming ? resource.transferSize : null
        onMetrics({ bytes: buffer.byteLength, transferBytes, fetchMs: fetchDone - startedAt, parseMs: parseDone - fetchDone,
          readyMs: performance.now() - startedAt, triangles, startedAt })
        onStatus({ kind: 'ready' })
        invalidate()
      } catch (error) {
        if (parsed) disposeLoadedScene(parsed, [...sourceMaterials, ...correctedMaterials.values()], carbonTexture ? [carbonTexture] : [])
        if (active && !controller.signal.aborted) {
          onStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      }
    }

    const work = loadQueue.then(load)
    loadQueue = work.catch(() => undefined)
    return () => {
      active = false
      controller.abort()
      if (owned) disposeLoadedScene(owned, [...sourceMaterials, ...correctedMaterials.values()], carbonTexture ? [carbonTexture] : [])
    }
  }, [url, onReady, onStatus, onMetrics, invalidate])

  useEffect(() => {
    if (!model) return
    for (const { material, source, role } of model.paint) {
      const selectedFinish = role === 'frontBumper' ? config.frontBumperFinish : role === 'rearBumper' ? config.rearBumperFinish : 'body'
      applyBodyFinish(material, source, config.color, selectedFinish === 'body' ? config.bodyFinish : selectedFinish, 'camry')
      if (role === 'hood') {
        if (config.carbonHood) applyCarbonHood(material, model.carbonTexture)
        else if (material.map !== source.map) { material.map = source.map; material.needsUpdate = true }
      }
    }
    for (const { material, source } of model.glass) applyWindowTint(material, source, config.tint)
    for (const rim of model.rims) applyRimFinish(rim, config.wheelFinish)
    invalidate()
  }, [model, config.color, config.bodyFinish, config.frontBumperFinish, config.rearBumperFinish, config.carbonHood, config.tint, config.wheelFinish, invalidate])

  const inspect = (event: ThreeEvent<PointerEvent>) => {
    if (!debug) return
    const names = new Set(['Body02_Carpaint_0', 'Body014_Carpaint_0', 'Body09_Carpaint_0'])
    let object: THREE.Object3D | null = event.object
    while (object && object !== model?.root && !names.has(object.userData.name)) object = object.parent
    if (!object || !names.has(object.userData.name)) return
    const normal = event.face?.normal.clone().transformDirection(event.object.matrixWorld) ?? new THREE.Vector3()
    onInspect({ part: object.userData.name, point: vec3(event.point), normal: vec3(normal) })
  }

  return model ? <>
    <primitive object={model.root} dispose={null} onPointerDown={debug ? inspect : undefined} />
    {vehicle?.features.wheelDesign && vehicle.wheelReplacement.status === 'verified' &&
      <VehicleWheelSystem root={model.root} vehicleId={vehicle.id} mounts={vehicle.wheelReplacement.mounts} design={resolvedWheelDesign(vehicle.id, config.wheelDesign)} finish={config.wheelFinish} />}
    {(vehicle?.features.frontPlate || vehicle?.features.rearPlate) &&
      <VehiclePlates text={config.plate} front={vehicle.features.frontPlate ? vehicle.attachmentAnchors.frontPlate : null}
        rear={vehicle.features.rearPlate ? vehicle.attachmentAnchors.rearPlate : null} />}
    {config.spoiler && vehicle?.features.spoiler && vehicle.attachmentAnchors.spoilerMounts &&
      <VehicleSpoiler mount={vehicle.attachmentAnchors.spoilerMounts} />}
    {debug && model.debugBounds.map(({ part, center, size }) => <mesh key={part} position={center} scale={size} raycast={() => {}}>
      <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={part.startsWith('Spoiler') ? '#66d9ff' : '#ffad66'} wireframe depthTest={false} />
    </mesh>)}
  </> : null
}

export function CamryStudio() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const previousExposure = gl.toneMappingExposure
    const previousEnvironment = scene.environment
    const previousIntensity = scene.environmentIntensity
    gl.toneMappingExposure = 0.85
    let room: RoomEnvironment | null = null
    let generator: THREE.PMREMGenerator | null = null
    let environment: THREE.WebGLRenderTarget | null = null
    try {
      room = new RoomEnvironment()
      generator = new THREE.PMREMGenerator(gl)
      environment = generator.fromScene(room)
      scene.environment = environment.texture
      scene.environmentIntensity = 0.7
    } catch (error) {
      console.warn('Camry local studio reflections unavailable:', error)
    } finally {
      generator?.dispose()
      room?.dispose()
    }
    invalidate()
    return () => {
      gl.toneMappingExposure = previousExposure
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousIntensity
      environment?.dispose()
    }
  }, [gl, scene, invalidate])

  return <>
    <ambientLight intensity={0.4} />
    <directionalLight position={[5, 8, 6]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} shadow-normalBias={0.02} />
    <directionalLight position={[-5, 4, -5]} intensity={0.55} />
  </>
}

export function CamryCameraRig({ bounds, request, activeView, onManualChange }: {
  bounds: THREE.Box3 | null
  request: { view: CamryView; sequence: number }
  activeView: CamryView
  onManualChange: () => void
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const controls = useRef<OrbitControlsImpl>(null)
  const transition = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const initialized = useRef(false)
  const manual = useRef(false)
  const lastRequest = useRef(-1)

  useEffect(() => {
    if (!bounds || !controls.current || !(camera instanceof THREE.PerspectiveCamera)) return
    if (request.sequence !== lastRequest.current) {
      manual.current = false
      lastRequest.current = request.sequence
    } else if (manual.current && activeView === 'free') {
      return
    }
    const pose = getCamryCameraPose(bounds, request.view, camera.fov, size.width / Math.max(1, size.height))
    camera.near = pose.near
    camera.far = pose.far
    camera.updateProjectionMatrix()
    controls.current.minDistance = pose.minDistance
    controls.current.maxDistance = pose.maxDistance
    if (!initialized.current) {
      camera.position.copy(pose.position)
      controls.current.target.copy(pose.target)
      controls.current.update()
      initialized.current = true
    } else {
      transition.current = { position: pose.position, target: pose.target }
    }
    invalidate()
  }, [bounds, request, activeView, camera, size.width, size.height, invalidate])

  useFrame((_, delta) => {
    const next = transition.current
    if (!next || !controls.current) return
    const blend = 1 - Math.exp(-5 * delta)
    camera.position.lerp(next.position, blend)
    controls.current.target.lerp(next.target, blend)
    controls.current.update()
    if (camera.position.distanceTo(next.position) < 0.01 && controls.current.target.distanceTo(next.target) < 0.01) {
      camera.position.copy(next.position)
      controls.current.target.copy(next.target)
      controls.current.update()
      transition.current = null
    } else {
      invalidate()
    }
  })

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.06} enablePan={false}
    maxPolarAngle={Math.PI / 2 - 0.03}
    onStart={() => { transition.current = null; manual.current = true; onManualChange() }} />
}

function WebGLFailure({ onFailure }: { onFailure: (status: LoadStatus) => void }) {
  useEffect(() => { onFailure({ kind: 'error', message: 'Бул түзмөктө WebGL жеткиликтүү эмес.' }) }, [onFailure])
  return <div className="canvas-fallback" role="alert">Бул түзмөктө WebGL жеткиликтүү эмес.</div>
}

function CamryDiagnostics({ enabled, ready, startedAt, onFrame, onFirstFrame }: {
  enabled: boolean; ready: boolean; startedAt: number | null
  onFrame: (metrics: FrameMetrics) => void; onFirstFrame: (elapsedMs: number) => void
}) {
  const invalidate = useThree((state) => state.invalidate)
  const samples = useRef({ count: 0, duration: 0, firstReported: false })
  useEffect(() => { samples.current = { count: 0, duration: 0, firstReported: false } }, [startedAt])
  useFrame(({ gl }, delta) => {
    if (!enabled || !ready || startedAt === null) return
    const current = samples.current
    if (!current.firstReported) {
      current.firstReported = true
      onFirstFrame(performance.now() - startedAt)
      invalidate()
      return
    }
    current.count += 1
    current.duration += delta
    if (current.count >= 30) {
      const frameMs = current.duration * 1000 / current.count
      onFrame({ fps: 1000 / frameMs, frameMs, drawCalls: gl.info.render.calls,
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures })
      current.count = 0
      current.duration = 0
    }
    invalidate()
  })
  return null
}

export default function CamryScene({ config = DEFAULT_CONFIG, embedded = false }: { config?: CarConfiguration; embedded?: boolean } = {}) {
  const vehicle = getVehicleById('toyota-camry-2018')
  const [bounds, setBounds] = useState<THREE.Box3 | null>(null)
  const [status, setStatus] = useState<LoadStatus>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState<CamryView>('free')
  const [request, setRequest] = useState<{ view: CamryView; sequence: number }>({ view: 'free', sequence: 0 })
  const onReady = useCallback((next: THREE.Box3) => setBounds(next), [])
  const onManualChange = useCallback(() => setView('free'), [])
  const [inspection, setInspection] = useState<AnchorInspection | null>(null)
  const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('camry-anchors')
  const compare = import.meta.env.DEV && new URLSearchParams(window.location.search).has('camry-compare')
  const [variant, setVariant] = useState<'current' | 'candidate'>('current')
  const [loadMetrics, setLoadMetrics] = useState<LoadMetrics | null>(null)
  const [frameMetrics, setFrameMetrics] = useState<FrameMetrics | null>(null)
  const [firstFrameMs, setFirstFrameMs] = useState<number | null>(null)
  const onMetrics = useCallback((next: LoadMetrics) => setLoadMetrics(next), [])
  const onFrame = useCallback((next: FrameMetrics) => setFrameMetrics(next), [])
  const onFirstFrame = useCallback((elapsed: number) => setFirstFrameMs(elapsed), [])
  const onInspect = useCallback((next: AnchorInspection) => setInspection(next), [])

  if (!vehicle || vehicle.cameraOrientation.sourceForward !== '+z' || vehicle.cameraOrientation.sourceUp !== '+y') {
    return <main role="alert">Camry registry metadata is unavailable or has an unsupported orientation.</main>
  }

  const modelUrl = compare && variant === 'candidate' ? candidateUrl : vehicle.glbUrl
  const switchVariant = (next: 'current' | 'candidate') => {
    if (next === variant) return
    setVariant(next)
    setBounds(null)
    setStatus({ kind: 'loading' })
    setLoadMetrics(null)
    setFrameMetrics(null)
    setFirstFrameMs(null)
  }

  return <div className={embedded ? 'embedded-camry' : 'app-shell'}>
    <header className="topbar">
      <div className="brand"><div className="brand-icon" aria-hidden="true">F<span>.</span></div><span>FORM<span className="brand-muted"> / AUTOMOTIVE</span></span></div>
      <a href="/">Concept GT конфигураторуна кайтуу</a>
    </header>
    <main className="viewer-pane camry-adapter-page">
      <div className="viewer-heading"><h1>{vehicle.displayName}</h1><span>DEVELOPMENT SCENE</span></div>
      <div className="canvas-wrapper">
        <Canvas camera={{ fov: 37, near: 0.05, far: 150, position: [0, 2, 8] }} dpr={[1, 1.5]} frameloop="demand" shadows
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
          fallback={<WebGLFailure onFailure={setStatus} />}>
          <color attach="background" args={['#202932']} />
          <CamryStudio />
          {bounds && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, bounds.min.y - 0.015, 0]} receiveShadow>
            <planeGeometry args={[30, 30]} /><meshStandardMaterial color="#4a535c" roughness={0.95} />
          </mesh>}
          <CamryModel key={`${modelUrl}:${retry}`} url={modelUrl} config={config} debug={debug} onInspect={onInspect} onReady={onReady} onStatus={setStatus} onMetrics={onMetrics} />
          {debug && inspection && <mesh position={inspection.point} raycast={() => {}}>
            <sphereGeometry args={[0.018, 12, 8]} /><meshBasicMaterial color="#00efff" depthTest={false} />
          </mesh>}
          <CamryCameraRig bounds={bounds} request={request} activeView={view} onManualChange={onManualChange} />
          {compare && <CamryDiagnostics enabled={compare} ready={status.kind === 'ready'} startedAt={loadMetrics?.startedAt ?? null}
            onFrame={onFrame} onFirstFrame={onFirstFrame} />}
        </Canvas>
        {debug && <div className="camry-anchor-readout" role="status">Anchor inspector: select the front/rear fascia or trunk. Wire boxes are guides only.{inspection && <div>{inspection.part}: point {inspection.point.map((value) => value.toFixed(4)).join(', ')}; normal {inspection.normal.map((value) => value.toFixed(3)).join(', ')}</div>}</div>}
        {status.kind !== 'ready' && <div className="viewer-overlay" role={status.kind === 'error' ? 'alert' : 'status'}>
          {status.kind === 'loading' ? <div className="loading">Toyota Camry 2018 жүктөлүүдө…</div>
            : <div className="model-error"><strong>3D модель жүктөлгөн жок</strong><span>{status.message}</span>
              <button type="button" onClick={() => { setBounds(null); setStatus({ kind: 'loading' }); setRetry((value) => value + 1) }}>Кайра жүктөө</button></div>}
        </div>}
        <div className="viewer-hint">Сүйрөңүз — айландыруу · Scroll — масштаб</div>
      </div>
      <div className="camera-controls" role="group" aria-label="Camry камера көрүнүшү">
        {camryViews.map((item) => <button key={item.id} type="button" aria-pressed={view === item.id}
          onClick={() => { setView(item.id); setRequest((previous) => ({ view: item.id, sequence: previous.sequence + 1 })) }}>{item.label}</button>)}
      </div>
      <p className="note">Иштеп чыгуудагы сахна. Camry конфигурациясы жана жалпы тандоо азырынча жеткиликтүү эмес.</p>
      {compare && <section className="camry-comparison" aria-label="Camry model comparison">
        <div className="camry-comparison-switch" role="group" aria-label="GLB version">
          <button type="button" aria-pressed={variant === 'current'} onClick={() => switchVariant('current')}>Current WheelLOD</button>
          <button type="button" aria-pressed={variant === 'candidate'} onClick={() => switchVariant('candidate')}>WebCandidate v3</button>
        </div>
        <div className="camry-comparison-metrics" aria-live="polite">
          <span>GLB body bytes: {loadMetrics?.bytes.toLocaleString() ?? '—'}</span>
          <span>Network transfer bytes: {loadMetrics?.transferBytes?.toLocaleString() ?? 'unavailable'}</span>
          <span>Fetch + body: {loadMetrics ? `${loadMetrics.fetchMs.toFixed(1)} ms` : '—'}</span>
          <span>Parse: {loadMetrics ? `${loadMetrics.parseMs.toFixed(1)} ms` : '—'}</span>
          <span>CPU ready: {loadMetrics ? `${loadMetrics.readyMs.toFixed(1)} ms` : '—'}</span>
          <span>First frame callback: {firstFrameMs === null ? '—' : `${firstFrameMs.toFixed(1)} ms`}</span>
          <span>Model triangles: {loadMetrics?.triangles.toLocaleString() ?? '—'}</span>
          <span>Draw calls: {frameMetrics?.drawCalls ?? '—'}</span>
          <span>Frame: {frameMetrics ? `${frameMetrics.frameMs.toFixed(1)} ms` : '—'}</span>
          <span>Approx. FPS: {frameMetrics ? frameMetrics.fps.toFixed(1) : '—'}</span>
          <span>Renderer geometry / textures: {frameMetrics ? `${frameMetrics.geometries} / ${frameMetrics.textures}` : '—'}</span>
        </div>
        <p>Development diagnostics run continuous frames. Fetch includes response body transfer and may use browser cache; transfer bytes include headers and can be zero for cache. Draw calls are from the previous frame; FPS is an approximate 30-frame average. Renderer memory shows resource counts, not GPU bytes.</p>
      </section>}
    </main>
    <footer className="footer"><span>FORM / AUTOMOTIVE</span><span>“Toyota Camry 2018” by {vehicle.license.author}, <a href={vehicle.license.sourceUrl} target="_blank" rel="noreferrer">Sketchfab</a> · <a href={vehicle.license.termsUrl} target="_blank" rel="noreferrer">CC BY 4.0</a> · Wheel LOD прототиби өзгөртүлгөн.</span></footer>
  </div>
}
