import { DEFAULT_CONFIG, validateStoredConfig, type CarConfiguration } from './types'
import { DEFAULT_VEHICLE_ID, getVehicleById, type AvailableVehicle, type VehicleId } from './vehicleRegistry'

export const V1_STORAGE_KEY = 'car-configurator-mvp-v1'
export const V2_STORAGE_KEY = 'car-configurator-mvp-v2'
export const STORAGE_SCHEMA_VERSION = 2

export interface VehicleStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type SavedVehicleConfiguration = {
  vehicleId: VehicleId
  values: CarConfiguration
}

export type StoredVehicleState = {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION
  activeVehicleId: VehicleId
  configurations: Partial<Record<VehicleId, SavedVehicleConfiguration>>
}

export type VehicleSession = {
  activeVehicleId: VehicleId
  configurations: Partial<Record<VehicleId, CarConfiguration>>
}

const defaults: Readonly<Record<VehicleId, CarConfiguration>> = {
  [DEFAULT_VEHICLE_ID]: DEFAULT_CONFIG,
  // Independent Camry defaults; unsupported properties remain inert in its scene adapter.
  'toyota-camry-2018': { ...DEFAULT_CONFIG },
  'bmw-m5-f90': { ...DEFAULT_CONFIG },
}

export function activateVehicle(session: VehicleSession, id: string): VehicleSession {
  const vehicle = getVehicleById(id)
  if (!vehicle || vehicle.availability === 'candidate' || session.activeVehicleId === vehicle.id) return session
  return { ...session, activeVehicleId: vehicle.id }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null
  try { return JSON.parse(raw) } catch { return null }
}

function readV2(storage: VehicleStorage): StoredVehicleState | null {
  const raw = parseJson(storage.getItem(V2_STORAGE_KEY))
  if (!isRecord(raw) || raw.schemaVersion !== STORAGE_SCHEMA_VERSION || !isRecord(raw.configurations)) return null

  const configurations: StoredVehicleState['configurations'] = {}
  for (const [key, value] of Object.entries(raw.configurations)) {
    const vehicle = getVehicleById(key)
    if (!vehicle || !isRecord(value) || value.vehicleId !== key || !isRecord(value.values)) continue
    configurations[vehicle.id] = { vehicleId: vehicle.id, values: validateStoredConfig(value.values) }
  }

  const active = typeof raw.activeVehicleId === 'string' ? getVehicleById(raw.activeVehicleId) : undefined
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    activeVehicleId: active && active.availability !== 'candidate' ? active.id : DEFAULT_VEHICLE_ID,
    configurations,
  }
}

function readV1(storage: VehicleStorage): CarConfiguration | null {
  const raw = parseJson(storage.getItem(V1_STORAGE_KEY))
  if (!isRecord(raw) || !Object.keys(DEFAULT_CONFIG).some((key) => key in raw)) return null
  return validateStoredConfig(raw)
}

function initialStoredState(storage: VehicleStorage): StoredVehicleState {
  const existing = readV2(storage)
  if (existing) return existing
  const legacy = readV1(storage)
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    activeVehicleId: DEFAULT_VEHICLE_ID,
    configurations: legacy ? { [DEFAULT_VEHICLE_ID]: { vehicleId: DEFAULT_VEHICLE_ID, values: legacy } } : {},
  }
}

export function getDefaultVehicleConfig(id: VehicleId): CarConfiguration {
  return { ...defaults[id] }
}

export function readVehicleSession(storage: VehicleStorage | null): VehicleSession {
  if (!storage) return { activeVehicleId: DEFAULT_VEHICLE_ID, configurations: {} }
  try {
    const saved = initialStoredState(storage)
    const configurations: VehicleSession['configurations'] = {}
    for (const [id, record] of Object.entries(saved.configurations)) {
      const vehicle = getVehicleById(id)
      if (vehicle && record) configurations[vehicle.id] = { ...record.values }
    }
    return { activeVehicleId: saved.activeVehicleId, configurations }
  } catch {
    return { activeVehicleId: DEFAULT_VEHICLE_ID, configurations: {} }
  }
}

export function getSessionConfig(session: VehicleSession): CarConfiguration {
  return session.configurations[session.activeVehicleId] ?? getDefaultVehicleConfig(session.activeVehicleId)
}

/** Called after mount; upgrades v1 or normalizes v2 once, including under StrictMode. */
export function migrateV1ToV2(storage: VehicleStorage | null): boolean {
  if (!storage) return false
  const existing = readV2(storage)
  if (existing) {
    const normalized = JSON.stringify(existing)
    if (storage.getItem(V2_STORAGE_KEY) === normalized) return false
    storage.setItem(V2_STORAGE_KEY, normalized)
    return true
  }
  const legacy = readV1(storage)
  if (!legacy) return false
  storage.setItem(V2_STORAGE_KEY, JSON.stringify({
    schemaVersion: STORAGE_SCHEMA_VERSION,
    activeVehicleId: DEFAULT_VEHICLE_ID,
    configurations: { [DEFAULT_VEHICLE_ID]: { vehicleId: DEFAULT_VEHICLE_ID, values: legacy } },
  } satisfies StoredVehicleState))
  return true
}

function requireAvailableVehicle(id: string): AvailableVehicle {
  const vehicle = getVehicleById(id)
  if (!vehicle || vehicle.availability === 'candidate') throw new Error('Vehicle is unavailable')
  return vehicle
}

export function saveVehicleConfig(storage: VehicleStorage | null, id: string, values: CarConfiguration): void {
  if (!storage) throw new Error('Storage is unavailable')
  const vehicleId = requireAvailableVehicle(id).id
  const current = initialStoredState(storage)
  const next: StoredVehicleState = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    activeVehicleId: vehicleId,
    configurations: {
      ...current.configurations,
      [vehicleId]: { vehicleId, values: validateStoredConfig(values) },
    },
  }
  storage.setItem(V2_STORAGE_KEY, JSON.stringify(next))
}

export function resetVehicleConfig(storage: VehicleStorage | null, id: string): void {
  if (!storage) throw new Error('Storage is unavailable')
  const vehicleId = requireAvailableVehicle(id).id
  const current = initialStoredState(storage)
  const configurations = { ...current.configurations }
  delete configurations[vehicleId]
  storage.setItem(V2_STORAGE_KEY, JSON.stringify({
    schemaVersion: STORAGE_SCHEMA_VERSION,
    activeVehicleId: vehicleId,
    configurations,
  } satisfies StoredVehicleState))
}

export function createConfigurationExport(id: string, values: CarConfiguration) {
  const vehicle = requireAvailableVehicle(id)
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    vehicleId: vehicle.id,
    modelUrl: vehicle.glbUrl,
    configuration: validateStoredConfig(values),
  }
}
