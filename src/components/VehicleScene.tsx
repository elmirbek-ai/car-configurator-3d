import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { CarConfiguration } from '../types'
import type { VehicleId } from '../vehicleRegistry'
import CarScene from './CarScene'

const CamryScene = lazy(() => import('./CamryScene'))
const BMWScene = lazy(() => import('./BMWScene'))

class SceneErrorBoundary extends Component<{ vehicleId: VehicleId; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error) { console.error('Vehicle 3D scene failed:', error) }

  render() {
    if (this.state.error) return <div className="canvas-wrapper">
      <div className="viewer-overlay"><div className="model-error" role="alert">
        <strong>3D көрүнүшүндө ката чыкты</strong>
        <span>{this.props.vehicleId}: {this.state.error.message}</span>
        <button type="button" onClick={() => this.setState({ error: null })}>Кайра аракет кылуу</button>
      </div></div>
    </div>
    return this.props.children
  }
}

/** Keep the Concept cache and KTX2 loader inside its existing adapter. */
export default function VehicleScene({ vehicleId, config }: { vehicleId: VehicleId; config: CarConfiguration }) {
  if (vehicleId === 'concept-gt') return <SceneErrorBoundary key={vehicleId} vehicleId={vehicleId}><CarScene config={config} /></SceneErrorBoundary>
  if (vehicleId === 'bmw-m5-f90') {
    return <SceneErrorBoundary key={vehicleId} vehicleId={vehicleId}><Suspense fallback={<div className="canvas-wrapper" role="status">BMW M5 F90 жүктөлүүдө…</div>}>
      <BMWScene config={config} />
    </Suspense></SceneErrorBoundary>
  }
  if (vehicleId === 'toyota-camry-2018') {
    return <SceneErrorBoundary key={vehicleId} vehicleId={vehicleId}><Suspense fallback={<div className="canvas-wrapper" role="status">Toyota Camry жүктөлүүдө…</div>}>
      <CamryScene embedded config={config} />
    </Suspense></SceneErrorBoundary>
  }
  return <div role="alert">Белгисиз унаа модели.</div>
}
