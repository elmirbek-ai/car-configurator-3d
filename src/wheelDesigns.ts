import type { WheelDesign } from './types'
import type { VehicleId } from './vehicleRegistry'

export const WHEEL_DESIGNS: readonly { value: WheelDesign; label: string; vehicles: readonly VehicleId[] }[] = [
  { value: 'original', label: 'Original', vehicles: ['concept-gt', 'toyota-camry-2018', 'bmw-m5-f90'] },
  { value: 'sport', label: 'Sport 5-Spoke', vehicles: ['concept-gt', 'toyota-camry-2018'] },
  { value: 'multi', label: 'Multi-Spoke', vehicles: ['concept-gt', 'toyota-camry-2018'] },
  { value: 'forged', label: 'Forged', vehicles: ['concept-gt', 'toyota-camry-2018'] },
  { value: 'deepConcave', label: 'Deep Concave', vehicles: ['concept-gt', 'bmw-m5-f90'] },
  { value: 'doubleSpoke', label: 'Double-Spoke', vehicles: ['concept-gt', 'toyota-camry-2018', 'bmw-m5-f90'] },
  { value: 'ySpoke', label: 'Y-Spoke', vehicles: ['concept-gt', 'toyota-camry-2018', 'bmw-m5-f90'] },
  { value: 'luxurySplit', label: 'Luxury Split-Spoke', vehicles: ['toyota-camry-2018'] },
  { value: 'turbine', label: 'Turbine', vehicles: ['concept-gt'] },
  { value: 'mesh', label: 'Mesh', vehicles: ['concept-gt', 'toyota-camry-2018'] },
]

export function availableWheelDesigns(vehicleId: VehicleId) {
  return WHEEL_DESIGNS.filter((option) => option.vehicles.includes(vehicleId))
}

export function resolvedWheelDesign(vehicleId: VehicleId, design: WheelDesign): WheelDesign {
  return availableWheelDesigns(vehicleId).some((option) => option.value === design) ? design : 'original'
}
