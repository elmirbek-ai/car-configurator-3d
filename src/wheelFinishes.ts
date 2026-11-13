import type { WheelFinish } from './types'

/** Alloy-only colors and PBR values; rubber, brakes and retained badges stay untouched. */
export const WHEEL_FINISHES: Readonly<Record<WheelFinish, { label: string; color: string; metalness: number; roughness: number }>> = {
  silver: { label: 'Silver', color: '#cbd4dc', metalness: 0.82, roughness: 0.27 },
  graphite: { label: 'Graphite', color: '#535b65', metalness: 0.78, roughness: 0.32 },
  black: { label: 'Black', color: '#171b22', metalness: 0.64, roughness: 0.38 },
  bronze: { label: 'Bronze', color: '#8b6848', metalness: 0.76, roughness: 0.30 },
  champagneGold: { label: 'Champagne Gold', color: '#baa174', metalness: 0.81, roughness: 0.25 },
  gunmetal: { label: 'Gunmetal', color: '#42494e', metalness: 0.84, roughness: 0.29 },
  titanium: { label: 'Titanium', color: '#89969d', metalness: 0.88, roughness: 0.23 },
  polishedAlloy: { label: 'Polished Alloy', color: '#dce3e8', metalness: 0.93, roughness: 0.13 },
}

export const WHEEL_FINISH_ORDER: readonly WheelFinish[] = [
  'silver', 'graphite', 'black', 'bronze', 'champagneGold', 'gunmetal', 'titanium', 'polishedAlloy',
]
