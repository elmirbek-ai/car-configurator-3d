import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { createCorrectedMaterial, disposeLoadedScene } from './components/camryAssets'
import './camry-preview.css'

const versions = [
  { id: 'wheelLOD', label: 'Wheel LOD · Stage 3.6', file: 'ToyotaCamry2018_WheelLOD_v1.glb', bytes: 34_196_580, triangles: 875_294 },
  { id: 'wheelOptimized', label: 'Wheel optimized · Stage 3.5', file: 'ToyotaCamry2018_WheelOptimized_v1.glb', bytes: 44_358_772, triangles: 1_194_416 },
  { id: 'lossless', label: 'Lossless · Stage 3.4', file: 'ToyotaCamry2018_Optimized_Prototype.glb', bytes: 46_813_028, triangles: 1_218_930 },
  { id: 'original', label: 'Original · Stage 3.3', file: 'toyota_camry_2018.glb', bytes: 139_569_040, triangles: 1_218_930 },
] as const
type VersionId = (typeof versions)[number]['id']
type MaterialMode = 'original' | 'corrected'
type ViewId = 'front' | 'rear' | 'left' | 'right'
type PartId = 'all' | 'body' | 'hood' | 'frontBumper' | 'rearBumper' | 'wheelLF' | 'wheelLR' | 'wheelRF' | 'wheelRR' | 'windows' | 'interior' | 'underbody'

const parts: { id: PartId; label: string; evidence: string }[] = [
  { id: 'all', label: 'Whole vehicle', evidence: 'All meshes' },
  { id: 'body', label: 'Painted body', evidence: 'Material based group' },
  { id: 'hood', label: 'Hood candidate', evidence: 'Inferred · Body01' },
  { id: 'frontBumper', label: 'Front bumper candidate', evidence: 'Inferred · Body02' },
  { id: 'rearBumper', label: 'Rear bumper candidate', evidence: 'Inferred · Body014' },
  { id: 'wheelLF', label: 'Front wheel · +X', evidence: 'Verified · WHEEL_LF' },
  { id: 'wheelLR', label: 'Rear wheel · +X', evidence: 'Verified · WHEEL_LR' },
  { id: 'wheelRF', label: 'Front wheel · −X', evidence: 'Verified · WHEEL_RF' },
  { id: 'wheelRR', label: 'Rear wheel · −X', evidence: 'Verified · WHEEL_RR' },
  { id: 'windows', label: 'Windows', evidence: 'Verified · six meshes' },
  { id: 'interior', label: 'Interior sample', evidence: 'Partial mapping' },
  { id: 'underbody', label: 'Underbody candidate', evidence: 'Inferred · Grey11' },
]
const windowNames = new Set([
  'front_window_Glass_0', 'rear_window_Glass_0', 'Object012_Glass_0',
  'Object013_Glass_0', 'Object014_Glass_0', 'Object015_Glass_0',
])
const interiorNames = new Set([
  'Object001_Dash_0', 'Leather01_Leahter_0', 'Leather02_Leahter_0',
  'Steer01_Dash_0', 'Steer02_Plastic_0',
])
const wheelRoots: Record<PartId, string | null> = {
  all: null, body: null, hood: null, frontBumper: null, rearBumper: null,
  wheelLF: 'WHEEL_LF', wheelLR: 'WHEEL_LR', wheelRF: 'WHEEL_RF', wheelRR: 'WHEEL_RR',
  windows: null, interior: null, underbody: null,
}
let loadQueue: Promise<void> = Promise.resolve()

function isVersionId(value: string): value is VersionId {
  return versions.some((version) => version.id === value)
}

function isPartId(value: string): value is PartId {
  return parts.some((part) => part.id === value)
}

type LoadedData = { bytes: number; triangles: number; loadMs: number; bounds: THREE.Box3 }
type FrameData = { frameMs: number; fps: number; calls: number }
type FrameKey = `${VersionId}:${MaterialMode}`
type LoadState = { status: 'loading' | 'ready' | 'error'; message?: string }

function formatMiB(bytes: number) {
  return `${(bytes / 1_048_576).toFixed(2)} MiB`
}

function isDescendantOf(object: THREE.Object3D, name: string) {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.name === name) return true
    current = current.parent
  }
  return false
}

function matchesPart(mesh: THREE.Mesh, part: PartId) {
  if (part === 'all') return true
  const wheelRoot = wheelRoots[part]
  if (wheelRoot) return isDescendantOf(mesh, wheelRoot)
  if (part === 'hood') return mesh.name === 'Body01_Carpaint_0'
  if (part === 'frontBumper') return mesh.name === 'Body02_Carpaint_0'
  if (part === 'rearBumper') return mesh.name === 'Body014_Carpaint_0'
  if (part === 'windows') return windowNames.has(mesh.name)
  if (part === 'interior') return interiorNames.has(mesh.name)
  if (part === 'underbody') return mesh.name === 'Grey11_Grey_0'
  if (part === 'body') {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    return materials.some((material) => material.name === 'Carpaint')
  }
  return false
}

function countTriangles(root: THREE.Object3D) {
  let triangles = 0
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
    }
  })
  return Math.round(triangles)
}

function CamryModel({ id, url, part, materialMode, onLoaded, onStatus, onPartCount }: {
  id: VersionId
  url: string
  part: PartId
  materialMode: MaterialMode
  onLoaded: (id: VersionId, data: LoadedData) => void
  onStatus: (state: LoadState) => void
  onPartCount: (count: number) => void
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null)
  const originalVisibility = useRef(new WeakMap<THREE.Object3D, boolean>())
  const originalMaterials = useRef(new Map<THREE.Mesh, THREE.Material | THREE.Material[]>())
  const correctedMaterials = useRef(new Map<THREE.Material, THREE.Material>())

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let owned: THREE.Group | null = null
    const start = performance.now()
    onStatus({ status: 'loading' })

    async function load() {
      if (!active) return
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${url}`)
        const buffer = await response.arrayBuffer()
        if (!active) return
        const gltf = await new GLTFLoader().parseAsync(buffer, '/models/candidates/')
        if (!active) {
          disposeLoadedScene(gltf.scene)
          return
        }
        owned = gltf.scene
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) originalMaterials.current.set(object, object.material)
        })
        const bounds = new THREE.Box3().setFromObject(gltf.scene)
        if (bounds.isEmpty()) throw new Error('Model contains no visible bounds')
        onLoaded(id, { bytes: buffer.byteLength, triangles: countTriangles(gltf.scene), loadMs: performance.now() - start, bounds })
        setScene(gltf.scene)
        onStatus({ status: 'ready' })
      } catch (error) {
        if (!active || controller.signal.aborted) return
        onStatus({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
    const work = loadQueue.then(load)
    loadQueue = work.catch(() => undefined)
    return () => {
      active = false
      controller.abort()
      if (owned) {
        const sources = [...originalMaterials.current.values()].flatMap((material) =>
          Array.isArray(material) ? material : [material])
        disposeLoadedScene(owned, [...sources, ...correctedMaterials.current.values()])
      }
    }
  }, [id, url, onLoaded, onStatus])

  useEffect(() => {
    if (!scene) return
    for (const [mesh, original] of originalMaterials.current) {
      if (materialMode === 'original') {
        mesh.material = original
        continue
      }
      const corrected = (material: THREE.Material) => {
        let copy = correctedMaterials.current.get(material)
        if (!copy) {
          copy = createCorrectedMaterial(material) ?? material
          if (copy !== material) correctedMaterials.current.set(material, copy)
        }
        return copy
      }
      mesh.material = Array.isArray(original) ? original.map(corrected) : corrected(original)
    }
  }, [scene, materialMode])

  useEffect(() => {
    if (!scene) return
    let count = 0
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      if (!originalVisibility.current.has(object)) originalVisibility.current.set(object, object.visible)
      const matches = matchesPart(object, part)
      object.visible = originalVisibility.current.get(object) === true && matches
      if (object.visible) count++
    })
    onPartCount(count)
  }, [scene, part, onPartCount])

  return scene ? <primitive object={scene} dispose={null} /> : null
}

function CameraRig({ bounds, viewRequest, zoomRequest }: {
  bounds: THREE.Box3 | null
  viewRequest: { id: ViewId; sequence: number }
  zoomRequest: { factor: number; sequence: number }
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const controls = useRef<OrbitControlsImpl>(null)

  useEffect(() => {
    if (!bounds || !controls.current) return
    const center = bounds.getCenter(new THREE.Vector3())
    const dimensions = bounds.getSize(new THREE.Vector3())
    const radius = dimensions.length() / 2
    const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null
    if (!perspective) return
    const halfFov = THREE.MathUtils.degToRad(perspective.fov) / 2
    const aspect = size.width / Math.max(size.height, 1)
    const distance = Math.max(
      dimensions.y / (2 * Math.tan(halfFov)),
      dimensions.x / (2 * Math.tan(halfFov) * aspect),
      dimensions.z / (2 * Math.tan(halfFov) * aspect),
      radius,
    ) * 1.35
    const directions: Record<ViewId, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0.12, 1),
      rear: new THREE.Vector3(0, 0.12, -1),
      left: new THREE.Vector3(1, 0.12, 0),
      right: new THREE.Vector3(-1, 0.12, 0),
    }
    controls.current.target.copy(center)
    camera.position.copy(center).addScaledVector(directions[viewRequest.id].normalize(), distance)
    perspective.near = Math.max(0.01, distance / 100)
    perspective.far = Math.max(100, distance * 20)
    perspective.updateProjectionMatrix()
    controls.current.minDistance = Math.max(0.2, radius * 0.35)
    controls.current.maxDistance = Math.max(30, radius * 10)
    controls.current.update()
  }, [bounds, viewRequest, camera, size.width, size.height])

  useEffect(() => {
    if (!controls.current || !bounds || zoomRequest.sequence === 0) return
    const target = controls.current.target
    camera.position.sub(target).multiplyScalar(zoomRequest.factor).add(target)
    controls.current.update()
  }, [zoomRequest, camera, bounds])

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} enablePan />
}

function FrameMeter({ id, materialMode, ready, onSample }: {
  id: VersionId
  materialMode: MaterialMode
  ready: boolean
  onSample: (id: VersionId, mode: MaterialMode, data: FrameData) => void
}) {
  const sample = useRef({ milliseconds: 0, frames: 0, elapsed: 0 })

  useEffect(() => {
    sample.current = { milliseconds: 0, frames: 0, elapsed: 0 }
  }, [id, materialMode])

  useFrame(({ gl, scene, camera }, delta) => {
    gl.info.reset()
    gl.render(scene, camera)
    if (!ready || document.hidden || delta <= 0 || delta > 0.25) return
    const current = sample.current
    current.milliseconds += delta * 1000
    current.elapsed += delta
    current.frames++
    if (current.elapsed >= 0.6) {
      const frameMs = current.milliseconds / current.frames
      onSample(id, materialMode, { frameMs, fps: 1000 / frameMs, calls: gl.info.render.calls })
      sample.current = { milliseconds: 0, frames: 0, elapsed: 0 }
    }
  }, 1)
  return null
}

function PreviewLighting({ mode }: { mode: MaterialMode }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const previousExposure = gl.toneMappingExposure
    gl.toneMappingExposure = mode === 'corrected' ? 0.85 : 1
    return () => { gl.toneMappingExposure = previousExposure }
  }, [gl, mode])

  useEffect(() => {
    if (mode !== 'corrected') return
    let room: RoomEnvironment | null = null
    let generator: THREE.PMREMGenerator | null = null
    let environment: THREE.WebGLRenderTarget | null = null
    try {
      room = new RoomEnvironment()
      generator = new THREE.PMREMGenerator(gl)
      environment = generator.fromScene(room)
    } catch (error) {
      console.warn('Camry preview studio environment unavailable:', error)
    } finally {
      generator?.dispose()
      room?.dispose()
    }
    if (!environment) return
    const previous = scene.environment
    const previousIntensity = scene.environmentIntensity
    scene.environment = environment.texture
    scene.environmentIntensity = 0.7
    return () => {
      scene.environment = previous
      scene.environmentIntensity = previousIntensity
      environment.dispose()
    }
  }, [gl, scene, mode])

  return <>
    <ambientLight intensity={mode === 'corrected' ? 0.4 : 1.6} />
    <directionalLight position={[5, 8, 6]} intensity={mode === 'corrected' ? 1.5 : 2.3} />
    <directionalLight position={[-5, 4, -5]} intensity={mode === 'corrected' ? 0.55 : 1.2} />
  </>
}

function WebGLFallback({ onUnavailable }: { onUnavailable: (state: LoadState) => void }) {
  useEffect(() => {
    onUnavailable({ status: 'error', message: 'WebGL is unavailable in this browser.' })
  }, [onUnavailable])
  return <div className="camry-overlay camry-webgl-fallback" role="alert">WebGL is unavailable in this browser.</div>
}

export default function CamryPreview() {
  const [versionId, setVersionId] = useState<VersionId>('wheelLOD')
  const [materialMode, setMaterialMode] = useState<MaterialMode>('corrected')
  const [retry, setRetry] = useState(0)
  const [part, setPart] = useState<PartId>('all')
  const [partCount, setPartCount] = useState(0)
  const [bounds, setBounds] = useState<THREE.Box3 | null>(null)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [loadedByVersion, setLoadedByVersion] = useState<Partial<Record<VersionId, LoadedData>>>({})
  const [framesByMode, setFramesByMode] = useState<Partial<Record<FrameKey, FrameData>>>({})
  const [rendererInfo, setRendererInfo] = useState('Waiting for WebGL renderer')
  const [viewRequest, setViewRequest] = useState<{ id: ViewId; sequence: number }>({ id: 'front', sequence: 0 })
  const [zoomRequest, setZoomRequest] = useState({ factor: 1, sequence: 0 })
  const selected = versions.find((version) => version.id === versionId)!
  const currentLoad = loadedByVersion[versionId]
  const currentFrame = framesByMode[`${versionId}:${materialMode}`]

  const handleLoaded = useCallback((id: VersionId, data: LoadedData) => {
    setBounds(data.bounds)
    setLoadedByVersion((previous) => ({ ...previous, [id]: data }))
  }, [])
  const handleStatus = useCallback((state: LoadState) => setLoadState(state), [])
  const handlePartCount = useCallback((count: number) => setPartCount(count), [])
  const handleSample = useCallback((id: VersionId, mode: MaterialMode, data: FrameData) => {
    setFramesByMode((previous) => ({ ...previous, [`${id}:${mode}`]: data }))
  }, [])
  const selectVersion = (id: VersionId) => {
    if (id === versionId) return
    setBounds(null)
    setPartCount(0)
    setLoadState({ status: 'loading' })
    setVersionId(id)
  }

  return (
    <main className="camry-preview">
      <header className="camry-header">
        <div><small>LOCAL DEVELOPMENT PREVIEW</small><h1>Toyota Camry 2018 · Asset comparison</h1></div>
        <a href="/">Back to CarConcept configurator</a>
      </header>
      <div className="camry-layout">
        <section className="camry-viewer" aria-label="Camry 3D preview">
          <div className="camry-stage">
            <Canvas camera={{ fov: 35, near: 0.05, far: 150, position: [0, 2, 8] }} dpr={[1, 1.5]} frameloop="always"
              gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
              fallback={<WebGLFallback onUnavailable={handleStatus} />}
              onCreated={({ gl }) => {
                const context = gl.getContext()
                setRendererInfo(`${String(context.getParameter(context.VERSION))} · ${String(context.getParameter(context.RENDERER))}`)
              }}>
              <color attach="background" args={['#202932']} />
              <PreviewLighting mode={materialMode} />
              {bounds && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, bounds.min.y - 0.015, 0]} receiveShadow>
                <planeGeometry args={[30, 30]} /><meshStandardMaterial color="#4a535c" roughness={0.95} />
              </mesh>}
              <CamryModel key={`${versionId}-${retry}`} id={versionId} url={`/models/candidates/${selected.file}`}
                part={part} materialMode={materialMode} onLoaded={handleLoaded} onStatus={handleStatus} onPartCount={handlePartCount} />
              <CameraRig bounds={bounds} viewRequest={viewRequest} zoomRequest={zoomRequest} />
              <FrameMeter id={versionId} materialMode={materialMode} ready={loadState.status === 'ready'} onSample={handleSample} />
            </Canvas>
            {loadState.status !== 'ready' && <div className="camry-overlay" role={loadState.status === 'error' ? 'alert' : 'status'}>
              {loadState.status === 'loading' ? <span>Loading ${selected.label}…</span> : <div>
                <strong>Model could not be loaded</strong><p>{loadState.message}</p>
                <button type="button" onClick={() => { setLoadState({ status: 'loading' }); setRetry((value) => value + 1) }}>Retry</button>
              </div>}
            </div>}
          </div>
          <div className="camry-camera-bar" aria-label="Camera views">
            {(['front', 'rear', 'left', 'right'] as const).map((view) =>
              <button key={view} type="button" aria-pressed={viewRequest.id === view}
                onClick={() => setViewRequest((previous) => ({ id: view, sequence: previous.sequence + 1 }))}>{view}</button>)}
            <button type="button" aria-label="Zoom in" onClick={() => setZoomRequest((previous) => ({ factor: 0.8, sequence: previous.sequence + 1 }))}>Zoom +</button>
            <button type="button" aria-label="Zoom out" onClick={() => setZoomRequest((previous) => ({ factor: 1.25, sequence: previous.sequence + 1 }))}>Zoom −</button>
            <button type="button" onClick={() => setViewRequest((previous) => ({ id: previous.id, sequence: previous.sequence + 1 }))}>Fit view</button>
          </div>
          <p className="camry-hint">Drag to orbit · scroll to zoom. Camera directions use the GLB axes: front +Z, rear −Z, +X/−X sides.</p>
        </section>
        <aside className="camry-panel">
          <section>
            <h2>Model version</h2>
            <label htmlFor="camry-version">Choose one asset</label>
            <select id="camry-version" value={versionId} onChange={(event) => {
              if (isVersionId(event.target.value)) selectVersion(event.target.value)
            }}>
              {versions.map((version) => <option key={version.id} value={version.id}>{version.label} · {formatMiB(version.bytes)}</option>)}
            </select>
            <p>Only the selected model is fetched and mounted. The 133 MiB original loads only after you select it.</p>
          </section>
          <section>
            <h2>Material comparison</h2>
            <div className="camry-material-modes" role="group" aria-label="Material appearance">
              <button type="button" aria-pressed={materialMode === 'original'} onClick={() => setMaterialMode('original')}>Original GLB</button>
              <button type="button" aria-pressed={materialMode === 'corrected'} onClick={() => setMaterialMode('corrected')}>Corrected PBR</button>
            </div>
            <p>Original shows imported materials with the previous preview lights. Corrected uses owned material copies, restrained studio lighting and local reflections. This changes preview appearance only.</p>
          </section>
          <section>
            <h2>Part inspection</h2>
            <label htmlFor="camry-part">Isolate a mapped part</label>
            <select id="camry-part" value={part} onChange={(event) => {
              if (isPartId(event.target.value)) setPart(event.target.value)
            }}>
              {parts.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.evidence}</option>)}
            </select>
            <p>{parts.find((item) => item.id === part)?.evidence}. {loadState.status === 'ready' ? `${partCount} matching mesh(es).` : 'Load a model to inspect.'} Isolation changes visibility only.</p>
          </section>
          <section aria-live="polite">
            <h2>Live diagnostics</h2>
            <dl className="camry-metrics">
              <div><dt>Version</dt><dd>{selected.label}</dd></div>
              <div><dt>File size · loaded bytes</dt><dd>{currentLoad?.bytes && loadState.status === 'ready' ? formatMiB(currentLoad.bytes) : '—'}</dd></div>
              <div><dt>Triangles · loaded scene</dt><dd>{currentLoad?.triangles && loadState.status === 'ready' ? currentLoad.triangles.toLocaleString() : '—'}</dd></div>
              <div><dt>Draw calls · last sampled frame</dt><dd>{currentFrame?.calls !== undefined && loadState.status === 'ready' ? currentFrame.calls : '—'}</dd></div>
              <div><dt>Frame interval · approximate</dt><dd>{currentFrame?.frameMs && loadState.status === 'ready' ? `${currentFrame.frameMs.toFixed(1)} ms` : '—'}</dd></div>
              <div><dt>FPS · approximate</dt><dd>{currentFrame?.fps && loadState.status === 'ready' ? currentFrame.fps.toFixed(1) : '—'}</dd></div>
              <div><dt>Fetch + parse duration</dt><dd>{currentLoad?.loadMs && loadState.status === 'ready' ? `${currentLoad.loadMs.toFixed(0)} ms` : '—'}</dd></div>
              <div><dt>WebGL renderer</dt><dd>{rendererInfo}</dd></div>
            </dl>
            <p>Frame interval/FPS come from browser animation frames, not GPU timing. Draw calls come from Three.js renderer.info; they include the ground. Loading duration excludes GPU upload.</p>
          </section>
          <section>
            <h2>Comparison</h2>
            <div className="camry-table-wrap"><table>
              <thead><tr><th>Version</th><th>Asset size</th><th>Triangles</th><th>Frame ms</th><th>FPS</th><th>Calls</th></tr></thead>
              <tbody>{versions.map((version) => <tr key={version.id} aria-current={version.id === versionId ? 'true' : undefined}>
                <th scope="row">{version.id}</th><td>{formatMiB(version.bytes)}</td><td>{version.triangles.toLocaleString()}</td>
                <td>{framesByMode[`${version.id}:${materialMode}`]?.frameMs?.toFixed(1) ?? '—'}</td>
                <td>{framesByMode[`${version.id}:${materialMode}`]?.fps?.toFixed(1) ?? '—'}</td>
                <td>{framesByMode[`${version.id}:${materialMode}`]?.calls ?? '—'}</td>
              </tr>)}</tbody>
            </table></div>
            <p>Asset sizes and triangle counts above were measured in the asset audits. FPS and calls belong to the selected material mode and appear only after a version has run in this browser session. Compare them under similar camera, viewport and hardware conditions.</p>
          </section>
          <footer className="camry-credit">
            “Toyota Camry 2018” by DR1KING100K, <a href="https://sketchfab.com/3d-models/toyota-camry-2018-7d0eef6770dc42759b8b232a02879158">Sketchfab</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Lossless and wheel geometry prototypes were modified for inspection. Toyota trademarks require separate review.
          </footer>
        </aside>
      </div>
    </main>
  )
}
