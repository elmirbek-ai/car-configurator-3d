import { Check } from 'lucide-react'
import { listVehicles, type VehicleId } from '../vehicleRegistry'

export default function VehicleSelector({ activeVehicleId, onSelect }: {
  activeVehicleId: VehicleId
  onSelect: (id: VehicleId) => void
}) {
  return (
    <div className="vehicle-options" role="group" aria-label="Choose a vehicle">
      {listVehicles().map((vehicle) => {
        const available = vehicle.availability !== 'candidate'
        const selected = activeVehicleId === vehicle.id
        return (
          <button key={vehicle.id} type="button" className="model-card vehicle-option"
            disabled={!available} aria-pressed={available ? selected : undefined}
            aria-describedby={!available ? `${vehicle.id}-status` : undefined}
            onClick={() => { if (available) onSelect(vehicle.id) }}>
            <div>
              <span className="model-badge">{vehicle.id === 'concept-gt' ? 'CONCEPT 01' : 'CAMRY 2018'}</span>
              <strong>{vehicle.displayName}</strong>
              <small id={!available ? `${vehicle.id}-status` : undefined}>
                {vehicle.id === 'concept-gt' ? 'Electric concept' : available ? 'Limited tuning · large model' : 'In Development'}
              </small>
            </div>
            <span className={selected ? 'selected-label' : 'candidate-label'}>
              {selected ? <><Check size={14} aria-hidden="true" /> Selected</> : available ? 'Select' : 'Coming Soon'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
