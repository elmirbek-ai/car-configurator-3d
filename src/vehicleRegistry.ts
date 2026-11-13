import type {
  MeshBinding,
  NonEmptyArray,
  SignedAxis,
  VehicleAssetMetrics,
  VehicleDescriptor,
  VehicleFeatureFlags,
  VehicleLicense,
  SourcePlateMount,
  SourceSpoilerMount,
  SourceWheelReplacementMount,
} from './vehicleDescriptor'

export const DEFAULT_VEHICLE_ID = 'concept-gt'
export type VehicleId = typeof DEFAULT_VEHICLE_ID | 'toyota-camry-2018' | 'bmw-m5-f90'

type KnownMesh = {
  readonly role: string
  readonly certainty: 'verified-mesh' | 'inferred-part'
  readonly bindings: NonEmptyArray<MeshBinding>
}

type RegistryLicense = Pick<VehicleLicense, 'sourceUrl' | 'termsUrl' | 'licenseName' | 'attributionText'> & {
  readonly author: string | null
  readonly evidence: 'existing-app-attribution' | 'glb-asset-metadata'
  readonly thirdPartyRightsVerified: boolean
}

type RegistryPerformance = {
  readonly [K in keyof VehicleAssetMetrics]: VehicleAssetMetrics[K] | null
} & { readonly textureCount: number | null }

type RegistryBase = Pick<VehicleDescriptor, 'id' | 'glbUrl' | 'features'> & {
  readonly id: VehicleId
  readonly displayName: string
  readonly knownMeshes: readonly KnownMesh[]
  readonly cameraOrientation: {
    readonly sourceForward: SignedAxis
    readonly sourceUp: SignedAxis
    readonly metersPerSourceUnit: null
    readonly evidence: 'existing-scene' | 'asset-audit'
  }
  readonly license: RegistryLicense
  readonly performance: RegistryPerformance
  readonly unavailableReasons: readonly string[]
  readonly featureNotes: Partial<Readonly<Record<keyof VehicleFeatureFlags, string>>>
  readonly attachmentAnchors: {
    readonly frontPlate: SourcePlateMount | null
    readonly rearPlate: SourcePlateMount | null
    readonly spoilerMounts: SourceSpoilerMount | null
  }
  readonly wheelReplacement:
    | { readonly status: 'unverified' | 'legacy-adapter'; readonly reason: string }
    | { readonly status: 'verified-combined'; readonly evidence: 'stage-7-2-bmw-fitment' }
    | { readonly status: 'verified'; readonly mounts: readonly [SourceWheelReplacementMount, SourceWheelReplacementMount, SourceWheelReplacementMount, SourceWheelReplacementMount] }
}

/** A ready descriptor requires verified anchors, fitment, scale, rights, and runtime metrics. */
type LegacyReadyVehicle = RegistryBase & { readonly availability: 'legacy-ready'; readonly id: 'concept-gt' }
type CandidateVehicle = RegistryBase & { readonly availability: 'candidate'; readonly id: 'toyota-camry-2018' }
type LimitedReadyVehicle = RegistryBase & { readonly availability: 'limited-ready'; readonly id: 'toyota-camry-2018' | 'bmw-m5-f90' }
type ReadyVehicle = RegistryBase & { readonly availability: 'ready'; readonly descriptor: VehicleDescriptor }

export type VehicleRegistryEntry = LegacyReadyVehicle | LimitedReadyVehicle | CandidateVehicle | ReadyVehicle
export type AvailableVehicle = LegacyReadyVehicle | LimitedReadyVehicle | ReadyVehicle

const conceptRoot = ['BodyUnderside'] as const
const camryRoot = ['Sketchfab_model', 'toyota camry 2018.fbx', 'RootNode'] as const

function conceptMesh(path: readonly string[], materials: readonly string[], primitiveIndices: NonEmptyArray<number> = [0]): MeshBinding {
  return { nodePath: [...conceptRoot, ...path], primitiveIndices, expectedMaterialNames: materials }
}

function camryMesh(path: readonly string[], material: string): MeshBinding {
  return { nodePath: [...camryRoot, ...path], primitiveIndices: [0], expectedMaterialNames: [material] }
}

function camryBindings(paths: NonEmptyArray<readonly string[]>, material: string): NonEmptyArray<MeshBinding> {
  const [first, ...rest] = paths
  return [camryMesh(first, material), ...rest.map((path) => camryMesh(path, material))]
}

const bmwRoot = ['Sketchfab_model', 'USDRoot', 'scene', 'Meshes', 'Sketchfab_model', '_e7d93b943224cbc9cc88b06ab9d34ed_fbx', 'RootNode'] as const
function bmwMesh(index: string, suffix: string, material: string): MeshBinding {
  const parent = `f_bmw_f90_m5_${index}`
  const leaf = `${parent}_${suffix}_0`
  return { nodePath: [...bmwRoot, parent, leaf, leaf], primitiveIndices: [0], expectedMaterialNames: [material] }
}

const conceptFeatures = {
  bodyPaint: true,
  bodyFinish: true,
  frontBumper: false,
  rearBumper: false,
  carbonHood: true,
  windowTint: true,
  wheelFinish: true,
  wheelDesign: true,
  frontPlate: true,
  rearPlate: true,
  spoiler: true,
} satisfies VehicleFeatureFlags

// Enable only roles with audited mesh identity and an owned runtime material adapter.
const camryFeatures = {
  bodyPaint: true,
  bodyFinish: true,
  frontBumper: true,
  rearBumper: true,
  carbonHood: true,
  windowTint: true,
  wheelFinish: true,
  wheelDesign: true,
  frontPlate: true,
  rearPlate: true,
  spoiler: true,
} satisfies VehicleFeatureFlags

const concept: VehicleRegistryEntry = {
  id: DEFAULT_VEHICLE_ID,
  displayName: 'Concept GT',
  glbUrl: '/models/CarConcept.glb',
  availability: 'legacy-ready',
  attachmentAnchors: {
    frontPlate: { position: [0, 0.40, 2.42], outwardNormal: [0, 0, 1], up: [0, 1, 0], widthSourceUnits: 0.52, heightSourceUnits: 0.153 },
    rearPlate: { position: [0, 0.31, -1.94], outwardNormal: [0, 0, -1], up: [0, 1, 0], widthSourceUnits: 0.36, heightSourceUnits: 0.105 },
    spoilerMounts: { leftContact: [-0.47, 0.9, -1.78], rightContact: [0.47, 0.9, -1.78], wingSpanSourceUnits: 1.55, wingLiftSourceUnits: 0.28, rearOffsetSourceUnits: -0.07 },
  },
  wheelReplacement: { status: 'legacy-adapter', reason: 'Concept GT retains its existing verified wheel geometry adapter.' },
  features: conceptFeatures,
  knownMeshes: [
    {
      role: 'frontBodyAssembly', certainty: 'verified-mesh',
      bindings: [conceptMesh(['BodyHood'], ['Paint 1 Carmine'])],
    },
    {
      role: 'windowGlass', certainty: 'verified-mesh',
      bindings: [
        conceptMesh(['BodyWindshield'], ['Glass']),
        conceptMesh(['BodyRearPanelsColor1', 'BodyWindowsRearSides'], ['Glass']),
        conceptMesh(['BodyRearPanelsColor1', 'BodyRearwindow'], ['Glass']),
        conceptMesh(['BodyDoorRColor1', 'BodyDoorRWindow'], ['Glass']),
        conceptMesh(['BodyDoorLColor1', 'BodyDoorLWindow'], ['Glass']),
      ],
    },
    {
      role: 'rimMeshes', certainty: 'verified-mesh',
      bindings: [
        conceptMesh(['WheelFrontL', 'WheelFrontLRim'], ['Rim2', 'Rim1'], [0, 1]),
        conceptMesh(['WheelFrontR', 'WheelFrontRRim'], ['Rim2', 'Rim1'], [0, 1]),
        conceptMesh(['WheelRearL', 'WheelRearLRim'], ['Rim2', 'Rim1'], [0, 1]),
        conceptMesh(['WheelRearR', 'WheelRearRRim'], ['Rim2', 'Rim1'], [0, 1]),
      ],
    },
  ],
  cameraOrientation: {
    sourceForward: '+z', sourceUp: '+y', metersPerSourceUnit: null, evidence: 'existing-scene',
  },
  license: {
    sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept',
    termsUrl: 'https://creativecommons.org/licenses/by/4.0/',
    licenseName: 'CC BY 4.0',
    attributionText: 'Khronos CarConcept · CC BY 4.0',
    author: null,
    evidence: 'existing-app-attribution',
    thirdPartyRightsVerified: false,
  },
  performance: {
    downloadBytes: 10_267_996,
    triangles: 213_347,
    drawCalls: null,
    decodedTextureBytes: null,
    largestTextureEdgePixels: null,
    textureCount: 15,
  },
  unavailableReasons: ['A complete VehicleDescriptor has not been audited for the existing scene.'],
  featureNotes: {
    carbonHood: 'The existing toggle works, but BodyHood also contains front fascia geometry.',
    frontBumper: 'No independent bumper control exists in the current application.',
    rearBumper: 'No independent bumper control exists in the current application.',
  },
}

const camryPaint = [
  ['Body00', 'Body00_Carpaint_0'],
  ['Body01', 'Body01_Carpaint_0'],
  ['Body03', 'Body03_Carpaint_0'],
  ['Body09', 'Body09_Carpaint_0'],
  ['9damFront', 'Body02', 'Body02_Carpaint_0'],
  ['9DamRear', 'Body014', 'Body014_Carpaint_0'],
  ['DOOR_L', 'Body04', 'Body04_Carpaint_0'],
  ['DOOR_LR', 'Body05', 'Body05_Carpaint_0'],
  ['DOOR_R', 'Body06', 'Body06_Carpaint_0'],
  ['DOOR_RR', 'Body07', 'Body07_Carpaint_0'],
] as const

const camryWindow = [
  ['front_window', 'front_window_Glass_0'],
  ['rear_window', 'rear_window_Glass_0'],
  ['DOOR_L', 'Glass', 'Object012', 'Object012_Glass_0'],
  ['DOOR_LR', 'Object013', 'Object013_Glass_0'],
  ['DOOR_R', 'Object014', 'Object014_Glass_0'],
  ['DOOR_RR', 'Object015', 'Object015_Glass_0'],
] as const

const camryRims = [
  ['WHEEL_LF', 'alt05', 'alt05_GreyWheel_0'],
  ['WHEEL_LR', 'alt011', 'alt011_GreyWheel_0'],
  ['WHEEL_RR', 'alt017', 'alt017_GreyWheel_0'],
  ['WHEEL_RF', 'alt023', 'alt023_GreyWheel_0'],
] as const

// Blender 5.2.3: each outer cover has 11,364 faces; 9,715 form its spokes and
// 1,534 disconnected center-cap/logo faces remain inside a 0.05 source-unit radius.
const camryCoverTopology = {
  expectedFaces: 11364, spokeIslandFaces: 9715, retainedCenterFaces: 1534,
  maxCenterRadiusSourceUnits: 0.05,
} as const
const camryWheelMounts = [
  { rim: camryMesh(camryRims[0], 'GreyWheel'), cover: camryMesh(['WHEEL_LF', 'Object037', 'Object037_hubcaps_0'], 'hubcaps'), center: [0.789492, 0.319922, 1.435915], outwardAxle: [1, 0, 0], rimRadiusSourceUnits: 0.215727, rimDepthSourceUnits: 0.189640, tireOuterRadiusSourceUnits: 0.324185, hubcapDisposition: 'split-cover-preserve-center', coverTopology: camryCoverTopology },
  { rim: camryMesh(camryRims[1], 'GreyWheel'), cover: camryMesh(['WHEEL_LR', 'Object038', 'Object038_hubcaps_0'], 'hubcaps'), center: [0.789492, 0.319921, -1.361200], outwardAxle: [1, 0, 0], rimRadiusSourceUnits: 0.215727, rimDepthSourceUnits: 0.189640, tireOuterRadiusSourceUnits: 0.324185, hubcapDisposition: 'split-cover-preserve-center', coverTopology: camryCoverTopology },
  { rim: camryMesh(camryRims[2], 'GreyWheel'), cover: camryMesh(['WHEEL_RR', 'rSlim', 'Object039', 'Object039_hubcaps_0'], 'hubcaps'), center: [-0.789221, 0.321468, -1.361200], outwardAxle: [-1, 0, 0], rimRadiusSourceUnits: 0.215728, rimDepthSourceUnits: 0.189642, tireOuterRadiusSourceUnits: 0.324185, hubcapDisposition: 'split-cover-preserve-center', coverTopology: camryCoverTopology },
  { rim: camryMesh(camryRims[3], 'GreyWheel'), cover: camryMesh(['WHEEL_RF', 'Object040', 'Object040_hubcaps_0'], 'hubcaps'), center: [-0.789221, 0.321468, 1.435915], outwardAxle: [-1, 0, 0], rimRadiusSourceUnits: 0.215728, rimDepthSourceUnits: 0.189642, tireOuterRadiusSourceUnits: 0.324185, hubcapDisposition: 'split-cover-preserve-center', coverTopology: camryCoverTopology },
] as const satisfies readonly [SourceWheelReplacementMount, SourceWheelReplacementMount, SourceWheelReplacementMount, SourceWheelReplacementMount]

const camryTires: NonEmptyArray<readonly string[]> = [
  ['WHEEL_LF', 'alt02', 'alt02_Tyre_0'],
  ...['alt01', 'alt06', 'alt03', 'alt04'].map((name) => ['WHEEL_LF', name, `${name}_Tyre_0`]),
  ...['alt009', 'alt010', 'alt008', 'alt012', 'alt007'].map((name) => ['WHEEL_LR', name, `${name}_Tyre_0`]),
  ...['alt034', 'alt033', 'alt032', 'alt031', 'alt030'].map((name) => ['WHEEL_RR', 'MNFGR', name, `${name}_Tyre_0`]),
  ...['alt018', 'alt016', 'alt015', 'alt014', 'alt013'].map((name) => ['WHEEL_RR', 'Slim', name, `${name}_Tyre_0`]),
  ...['alt021', 'alt022', 'alt020', 'alt024', 'alt019'].map((name) => ['WHEEL_RF', name, `${name}_Tyre_0`]),
] as const

const camry: VehicleRegistryEntry = {
  id: 'toyota-camry-2018',
  displayName: 'Toyota Camry 2018',
  glbUrl: '/models/candidates/ToyotaCamry2018_WheelLOD_v1.glb',
  availability: 'limited-ready',
  attachmentAnchors: {
    frontPlate: {
      position: [0, 0.44, 2.405], outwardNormal: [0, 0, 1], up: [0, 1, 0],
      widthSourceUnits: 0.48, heightSourceUnits: 0.14,
      bracket: {
        widthSourceUnits: 0.49, heightSourceUnits: 0.15, depthSourceUnits: 0.006,
        faceGapSourceUnits: 0.002, postRadiusSourceUnits: 0.005,
        surfaceContacts: [
          [-0.18, 0.46, 2.3404691], [0.18, 0.46, 2.3405035],
          [-0.18, 0.5000001, 2.3480222], [0.18, 0.5000001, 2.3480568],
        ],
      },
    },
    rearPlate: {
      position: [0.000072, 0.7792668, -2.3719314],
      outwardNormal: [0, 0.2340538, -0.9722236], up: [0, 0.9722236, 0.2340538],
      widthSourceUnits: 0.48, heightSourceUnits: 0.14,
      bracket: {
        widthSourceUnits: 0.49, heightSourceUnits: 0.15, depthSourceUnits: 0.006,
        faceGapSourceUnits: 0.002, postRadiusSourceUnits: 0.004,
        surfaceContacts: [
          [-0.18, 0.7500001, -2.360359], [0.18, 0.7500001, -2.3603756],
          [-0.18, 0.8100001, -2.3442376], [0.18, 0.8100001, -2.3442547],
        ],
      },
    },
    spoilerMounts: {
      leftContact: [-0.42795, 1.079181, -2.14259],
      rightContact: [0.42822, 1.079181, -2.14259],
      wingSpanSourceUnits: 1.45,
      wingLiftSourceUnits: 0.25,
      rearOffsetSourceUnits: -0.08,
      supportBaseRiseSourceUnits: 0.04,
      footLiftSourceUnits: 0.008,
    },
  },
  wheelReplacement: { status: 'verified', mounts: camryWheelMounts },
  features: camryFeatures,
  knownMeshes: [
    {
      role: 'paintedMeshes', certainty: 'verified-mesh',
      bindings: camryBindings(camryPaint, 'Carpaint'),
    },
    { role: 'hoodSurface', certainty: 'verified-mesh', bindings: [camryMesh(['Body01', 'Body01_Carpaint_0'], 'Carpaint')] },
    { role: 'trunkPaint', certainty: 'verified-mesh', bindings: [camryMesh(['Body09', 'Body09_Carpaint_0'], 'Carpaint')] },
    { role: 'frontBumperPaint', certainty: 'verified-mesh', bindings: [camryMesh(['9damFront', 'Body02', 'Body02_Carpaint_0'], 'Carpaint')] },
    { role: 'rearBumperPaint', certainty: 'verified-mesh', bindings: [camryMesh(['9DamRear', 'Body014', 'Body014_Carpaint_0'], 'Carpaint')] },
    {
      role: 'windowGlass', certainty: 'verified-mesh',
      bindings: camryBindings(camryWindow, 'Glass'),
    },
    {
      role: 'rimMeshes', certainty: 'verified-mesh',
      bindings: camryBindings(camryRims, 'GreyWheel'),
    },
    {
      role: 'tireMeshes', certainty: 'verified-mesh',
      bindings: camryBindings(camryTires, 'Tyre'),
    },
    {
      role: 'hubcapMeshes', certainty: 'verified-mesh',
      bindings: [
        camryMesh(['WHEEL_LF', 'Object037', 'Object037_hubcaps_0'], 'hubcaps'),
        camryMesh(['WHEEL_LR', 'Object038', 'Object038_hubcaps_0'], 'hubcaps'),
        camryMesh(['WHEEL_RR', 'rSlim', 'Object039', 'Object039_hubcaps_0'], 'hubcaps'),
        camryMesh(['WHEEL_RR', 'rMNfgr', 'Object058', 'Object058_hubcaps_0'], 'hubcaps'),
        camryMesh(['WHEEL_RF', 'Object040', 'Object040_hubcaps_0'], 'hubcaps'),
      ],
    },
  ],
  cameraOrientation: {
    sourceForward: '+z', sourceUp: '+y', metersPerSourceUnit: null, evidence: 'asset-audit',
  },
  license: {
    sourceUrl: 'https://sketchfab.com/3d-models/toyota-camry-2018-7d0eef6770dc42759b8b232a02879158',
    termsUrl: 'https://creativecommons.org/licenses/by/4.0/',
    licenseName: 'CC BY 4.0',
    attributionText: '“Toyota Camry 2018” by DR1KING100K, Sketchfab, CC BY 4.0; wheel LOD prototype modified for inspection.',
    author: 'DR1KING100K',
    evidence: 'glb-asset-metadata',
    thirdPartyRightsVerified: false,
  },
  performance: {
    downloadBytes: 34_196_580,
    triangles: 875_294,
    drawCalls: null,
    decodedTextureBytes: null,
    largestTextureEdgePixels: 2048,
    textureCount: 14,
  },
  unavailableReasons: [
    'The user confirmed the Camry renders on the main website; newly added tuning materials still need browser review.',
    'Physical meter scale remains unverified; Camry plate brackets use measured source-unit contacts.',
    'Asset size and triangle count exceed the proposed web budgets; third-party trademark rights remain unverified.',
  ],
  featureNotes: {
    bodyPaint: 'Ten Carpaint meshes are mapped and receive owned runtime materials; visual validation remains.',
    bodyFinish: 'Ten Carpaint meshes use owned runtime materials; browser PBR validation remains.',
    frontBumper: 'Body02 is a separate front fascia paint mesh; independent material finish is available.',
    rearBumper: 'Body014 is a separate rear fascia paint mesh; independent material finish is available.',
    carbonHood: 'Body01 is a separate upper-front mesh; carbon styling is confined to this mesh. Visual boundary review remains.',
    windowTint: 'Six Glass meshes use owned runtime materials; browser tint validation remains.',
    wheelFinish: 'Four GreyWheel rims and four visible original spoke covers receive isolated finish materials; tires, brake details and retained custom center caps stay separate.',
    wheelDesign: 'Four rim centers, cover topology and replacement geometry were checked in Blender; browser appearance remains unverified.',
    frontPlate: 'Lower grille Grey04 contacts and complete plate footprint were measured and checked in Blender; WebGL appearance remains unverified.',
    rearPlate: 'Trunk Body09 contacts and tilted plate footprint were measured and checked in Blender; WebGL appearance remains unverified.',
    spoiler: 'Two trunk contacts and shared wing geometry were checked with Blender raycasts, overlap tests and fixed-camera renders; browser appearance remains unverified.',
  },
}

const bmw: VehicleRegistryEntry = {
  id: 'bmw-m5-f90', displayName: 'BMW M5 F90',
  glbUrl: '/models/candidates/bmw-m5-f90/bmw_m5_f90.glb',
  availability: 'limited-ready',
  features: { bodyPaint: true, bodyFinish: true, windowTint: false, wheelFinish: true,
    wheelDesign: true, carbonHood: false, frontBumper: false, rearBumper: false,
    frontPlate: false, rearPlate: false, spoiler: false },
  knownMeshes: [
    { role: 'paintedMeshes', certainty: 'verified-mesh', bindings: [bmwMesh('119', 'Carpaint', 'Carpaint')] },
    { role: 'rimMeshes', certainty: 'verified-mesh', bindings: [
      bmwMesh('132', 'M_Rim_Secondary_Max', 'M_Rim_Main_Max'),
      bmwMesh('133', 'M_Rim_Main_Max', 'M_Rim_Main_Max_0'),
      bmwMesh('135', 'rimsiulver', 'M_Rim_Main_Max_0'),
    ] },
    { role: 'tireMeshes', certainty: 'verified-mesh', bindings: [bmwMesh('130', 'EXT_Tyre', 'EXT_Tyre')] },
    { role: 'brakeMeshes', certainty: 'verified-mesh', bindings: [
      bmwMesh('041', 'Brake_Caliper_001', 'Brake_Caliper_001'),
      bmwMesh('044', 'Brake_Disk_rear_001', 'Brake_Disk_rear_001'),
      bmwMesh('045', 'Brake_Disk_001', 'Brake_Disk_001'),
    ] },
  ],
  cameraOrientation: { sourceForward: '+x', sourceUp: '+y', metersPerSourceUnit: null, evidence: 'asset-audit' },
  attachmentAnchors: {
    frontPlate: {
      position: [0.030631, 0.453974, 2.447644], outwardNormal: [0, 0, 1], up: [0, 1, 0],
      widthSourceUnits: 0.450, heightSourceUnits: 0.132,
    },
    rearPlate: {
      position: [0.030631, 0.777670, -2.372028],
      outwardNormal: [0, 0.260665834, -0.965429008],
      up: [0, 0.965429008, 0.260665834],
      widthSourceUnits: 0.450, heightSourceUnits: 0.132,
    },
    spoilerMounts: null,
  },
  wheelReplacement: { status: 'verified-combined', evidence: 'stage-7-2-bmw-fitment' },
  license: {
    sourceUrl: 'https://sketchfab.com/3d-models/bmw-m5-f90-5478e978bd634337adc8e3dc413fbfa3',
    termsUrl: 'https://creativecommons.org/licenses/by/4.0/', licenseName: 'CC BY 4.0',
    attributionText: 'Bmw M5 F90 by RES1N, Sketchfab, CC BY 4.0', author: 'RES1N',
    evidence: 'glb-asset-metadata', thirdPartyRightsVerified: false,
  },
  performance: { downloadBytes: 39_385_104, triangles: 259_936, textureCount: 74,
    drawCalls: null, decodedTextureBytes: null, largestTextureEdgePixels: 1024 },
  unavailableReasons: ['Physical meter scale and spoiler contacts are unverified.', 'BMW front and rear KG plate mounts failed visual acceptance; release controls are disabled.'],
  featureNotes: {
    bodyPaint: 'One verified Carpaint mesh covers the painted body; independent panels are unavailable.',
    bodyFinish: 'The same isolated Carpaint material supports finish changes.',
    wheelFinish: 'Three verified rim-only meshes cover four wheels; tires and brakes remain separate.',
    wheelDesign: 'Three designs use four individually measured placements; Blender tire, brake and body intersection probes passed. Browser appearance remains unverified.',
    windowTint: 'EXt_GLASS also contains headlight glazing; whole-mesh tint would affect lights.',
    carbonHood: 'Hood geometry is merged with the painted body.',
    frontBumper: 'Front bumper is not an independently verified painted mesh.',
    rearBumper: 'Rear bumper is not an independently verified painted mesh.',
    frontPlate: 'Disabled for release: the front KG plate mount did not pass visual acceptance. Geometry and calibration remain for future work.',
    rearPlate: 'Disabled for release: the rear KG plate mount did not pass visual acceptance. Geometry and calibration remain for future work.',
    spoiler: 'Rear contact points and clearance are unverified.',
  },
}

const vehicles: readonly VehicleRegistryEntry[] = [concept, camry, bmw]

export function listVehicles(): readonly VehicleRegistryEntry[] {
  return vehicles
}

export function getVehicleById(id: string): VehicleRegistryEntry | undefined {
  return vehicles.find((vehicle) => vehicle.id === id)
}

export function listAvailableVehicles(): readonly AvailableVehicle[] {
  return vehicles.filter((vehicle): vehicle is AvailableVehicle =>
    vehicle.availability === 'legacy-ready' || vehicle.availability === 'limited-ready' || vehicle.availability === 'ready')
}

export function getVehicleFeatures(id: string): VehicleFeatureFlags | undefined {
  return getVehicleById(id)?.features
}
