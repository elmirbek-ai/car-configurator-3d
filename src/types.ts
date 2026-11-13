export type WheelFinish = 'silver' | 'graphite' | 'black' | 'bronze' | 'champagneGold' | 'gunmetal' | 'titanium' | 'polishedAlloy'
export type WheelDesign = 'original' | 'sport' | 'multi' | 'forged' | 'deepConcave' | 'doubleSpoke' | 'ySpoke' | 'luxurySplit' | 'turbine' | 'mesh'
export type TintLevel = 'clear' | 'light' | 'medium' | 'dark'
export type BodyFinish = 'glossy' | 'matte' | 'satin' | 'metallic'
export type BumperFinish = 'body' | BodyFinish
export type CarConfiguration = {
  color: string
  bodyFinish: BodyFinish
  frontBumperFinish: BumperFinish
  rearBumperFinish: BumperFinish
  carbonHood: boolean
  wheelFinish: WheelFinish
  wheelDesign: WheelDesign
  tint: TintLevel
  plate: string
  spoiler: boolean
}
export const DEFAULT_CONFIG: CarConfiguration = {
  color: '#a5b6c5', bodyFinish: 'glossy', frontBumperFinish: 'body', rearBumperFinish: 'body', carbonHood: false, wheelFinish: 'graphite', wheelDesign: 'original', tint: 'clear', plate: '01 KG 777 AAB', spoiler: false,
}
export const PAINTS = [
  { label: 'Arctic Silver', value: '#a5b6c5' },
  { label: 'Midnight Black', value: '#15191e' },
  { label: 'Pearl White', value: '#e9e8e3' },
  { label: 'Crimson Red', value: '#a31325' },
  { label: 'Electric Blue', value: '#174cc1' },
  { label: 'Forest Green', value: '#22564b' },
  { label: 'Graphite Grey', value: '#515b64' },
  { label: 'Titanium Silver', value: '#b9bec1' },
  { label: 'Champagne', value: '#b8a58b' },
  { label: 'Copper Bronze', value: '#8c5b43' },
  { label: 'Deep Burgundy', value: '#592633' },
  { label: 'Sunset Orange', value: '#c65f2c' },
  { label: 'Racing Yellow', value: '#d8ac24' },
  { label: 'Lagoon Blue', value: '#267b91' },
  { label: 'Navy Blue', value: '#243b67' },
  { label: 'Sage Green', value: '#788b72' },
  { label: 'Olive Green', value: '#4e5a38' },
  { label: 'Ice Blue', value: '#a7cbd4' },
  { label: 'Midnight Purple', value: '#332544' },
  { label: 'Racing Green', value: '#174434' },
  { label: 'Desert Sand', value: '#bfa984' },
  { label: 'Deep Teal', value: '#175b60' },
  { label: 'Satin Steel', value: '#89969a' },
  { label: 'Storm Blue', value: '#526b83' },
] as const

export const REGIONS = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0'))

const storedPlatePattern = /^(0[1-9]|10) KG \d{0,3} [A-Z]{0,3}$/
const storedColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function validateStoredConfig(value: unknown): CarConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_CONFIG

  const stored = value as Record<string, unknown>
  return {
    color: typeof stored.color === 'string' && storedColorPattern.test(stored.color)
      ? stored.color : DEFAULT_CONFIG.color,
    bodyFinish: stored.bodyFinish === 'glossy' || stored.bodyFinish === 'matte' || stored.bodyFinish === 'satin' || stored.bodyFinish === 'metallic'
      ? stored.bodyFinish : DEFAULT_CONFIG.bodyFinish,
    frontBumperFinish: stored.frontBumperFinish === 'body' || stored.frontBumperFinish === 'glossy' || stored.frontBumperFinish === 'matte' || stored.frontBumperFinish === 'satin' || stored.frontBumperFinish === 'metallic'
      ? stored.frontBumperFinish : DEFAULT_CONFIG.frontBumperFinish,
    rearBumperFinish: stored.rearBumperFinish === 'body' || stored.rearBumperFinish === 'glossy' || stored.rearBumperFinish === 'matte' || stored.rearBumperFinish === 'satin' || stored.rearBumperFinish === 'metallic'
      ? stored.rearBumperFinish : DEFAULT_CONFIG.rearBumperFinish,
    carbonHood: typeof stored.carbonHood === 'boolean' ? stored.carbonHood : DEFAULT_CONFIG.carbonHood,
    wheelFinish: stored.wheelFinish === 'silver' || stored.wheelFinish === 'graphite' || stored.wheelFinish === 'black' || stored.wheelFinish === 'bronze' || stored.wheelFinish === 'champagneGold' || stored.wheelFinish === 'gunmetal' || stored.wheelFinish === 'titanium' || stored.wheelFinish === 'polishedAlloy'
      ? stored.wheelFinish : DEFAULT_CONFIG.wheelFinish,
    wheelDesign: stored.wheelDesign === 'original' || stored.wheelDesign === 'sport' || stored.wheelDesign === 'multi' || stored.wheelDesign === 'forged' || stored.wheelDesign === 'deepConcave' || stored.wheelDesign === 'doubleSpoke' || stored.wheelDesign === 'ySpoke' || stored.wheelDesign === 'luxurySplit' || stored.wheelDesign === 'turbine' || stored.wheelDesign === 'mesh'
      ? stored.wheelDesign : DEFAULT_CONFIG.wheelDesign,
    tint: stored.tint === 'clear' || stored.tint === 'light' || stored.tint === 'medium' || stored.tint === 'dark'
      ? stored.tint : DEFAULT_CONFIG.tint,
    plate: typeof stored.plate === 'string' && storedPlatePattern.test(stored.plate)
      ? stored.plate : DEFAULT_CONFIG.plate,
    spoiler: typeof stored.spoiler === 'boolean' ? stored.spoiler : DEFAULT_CONFIG.spoiler,
  }
}

export function parsePlate(value: string) {
  const normalized = value.toUpperCase().trim()
  const region = normalized.match(/^(0[1-9]|10)/)?.[1] ?? '01'
  const remainder = normalized.replace(/^(0[1-9]|10)\s*/, '').replace(/^KG\s*/, '')
  const digits = remainder.match(/\d{1,3}/)?.[0] ?? ''
  const letters = remainder.match(/[A-Z]{1,3}/)?.[0] ?? ''
  return { region, digits, letters }
}

export function formatPlate(region: string, digits: string, letters: string) {
  return `${region} KG ${digits} ${letters}`
}
