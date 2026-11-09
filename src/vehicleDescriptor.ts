/** Asset metadata for a vehicle whose geometry and usage rights have been verified. */
export type Vec3 = readonly [number, number, number]
export type Quaternion = readonly [number, number, number, number]
export type SignedAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'
export type NonEmptyArray<T> = readonly [T, ...T[]]
export type WheelCorner = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'

/** Path starts at the glTF scene root; primitive indices refer to the target mesh. */
export interface MeshBinding {
  readonly nodePath: NonEmptyArray<string>
  readonly primitiveIndices: NonEmptyArray<number>
  readonly expectedMaterialNames?: readonly string[]
}

/** An absent part must be documented; it must never be guessed from another model. */
export type PartMapping =
  | { readonly status: 'mapped'; readonly meshes: NonEmptyArray<MeshBinding> }
  | { readonly status: 'unavailable'; readonly reason: string }

export interface WheelMeshMapping {
  readonly rim: PartMapping
  readonly tire: PartMapping
  readonly brakeDisc: PartMapping
  readonly brakeCaliper: PartMapping
}

export interface VehicleMeshMap {
  readonly paintPanels: PartMapping
  readonly hood: PartMapping
  readonly bumpers: {
    readonly front: PartMapping
    readonly rear: PartMapping
  }
  readonly doors: {
    readonly frontLeft: PartMapping
    readonly frontRight: PartMapping
    readonly rearLeft: PartMapping
    readonly rearRight: PartMapping
  }
  readonly glass: {
    readonly windshield: PartMapping
    readonly rearWindow: PartMapping
    readonly leftSide: PartMapping
    readonly rightSide: PartMapping
  }
  readonly wheels: Readonly<Record<WheelCorner, WheelMeshMapping>>
  readonly lights: {
    readonly frontLeft: PartMapping
    readonly frontRight: PartMapping
    readonly rearLeft: PartMapping
    readonly rearRight: PartMapping
  }
}

/** Viewer coordinates use +X right, +Y up and +Z toward the vehicle front. */
export interface VehicleOrientation {
  readonly sourceForward: SignedAxis
  readonly sourceUp: SignedAxis
  readonly metersPerSourceUnit: number
  readonly rootTranslationMeters: Vec3
  readonly rootRotation: Quaternion
}

export interface Bounds3 {
  readonly min: Vec3
  readonly max: Vec3
}

export interface Pose3 {
  readonly positionMeters: Vec3
  readonly rotation: Quaternion
}

export interface PlateAnchor {
  readonly pose: Pose3
  readonly mountWidthMeters: number
  readonly mountHeightMeters: number
}

/** Viewer-space attachment for legacy assets whose physical meter scale is unknown. */
export interface SourcePlateMount {
  readonly position: Vec3
  readonly outwardNormal: Vec3
  readonly up: Vec3
  readonly widthSourceUnits: number
  readonly heightSourceUnits: number
  /** Optional measured surface contacts for a plate carried ahead of curved bodywork. */
  readonly bracket?: {
    readonly widthSourceUnits: number
    readonly heightSourceUnits: number
    readonly depthSourceUnits: number
    readonly faceGapSourceUnits: number
    readonly postRadiusSourceUnits: number
    readonly surfaceContacts: readonly Vec3[]
  }
}

export interface SourceSpoilerMount {
  readonly leftContact: Vec3
  readonly rightContact: Vec3
  readonly wingSpanSourceUnits: number
  readonly wingLiftSourceUnits: number
  readonly rearOffsetSourceUnits: number
  readonly supportBaseRiseSourceUnits?: number
  readonly footLiftSourceUnits?: number
}

export interface SpoilerAnchor {
  readonly pose: Pose3
  readonly leftMountMeters: Vec3
  readonly rightMountMeters: Vec3
  readonly usableWidthMeters: number
}

export interface WheelFitment {
  readonly centerMeters: Vec3
  readonly outwardAxle: Vec3
  readonly rimRadiusMeters: number
  readonly rimWidthMeters: number
  readonly tireOuterRadiusMeters: number
}

/** Source-unit fitment for an audited, visually approved rim swap. */
export interface SourceWheelReplacementMount {
  readonly rim: MeshBinding
  readonly cover?: MeshBinding
  readonly center: Vec3
  readonly outwardAxle: Vec3
  readonly rimRadiusSourceUnits: number
  readonly rimDepthSourceUnits: number
  readonly tireOuterRadiusSourceUnits: number
  readonly hubcapDisposition: 'retained-with-clearance' | 'split-cover-preserve-center'
  readonly coverTopology?: {
    readonly expectedFaces: number
    readonly spokeIslandFaces: number
    readonly retainedCenterFaces: number
    readonly maxCenterRadiusSourceUnits: number
  }
}

export interface VehicleFeatureFlags {
  readonly bodyPaint: boolean
  readonly bodyFinish: boolean
  readonly frontBumper: boolean
  readonly rearBumper: boolean
  readonly carbonHood: boolean
  readonly windowTint: boolean
  readonly wheelFinish: boolean
  readonly wheelDesign: boolean
  readonly frontPlate: boolean
  readonly rearPlate: boolean
  readonly spoiler: boolean
}

export interface VehicleLicense {
  readonly sourceUrl: string
  readonly termsUrl: string
  readonly licenseName: string
  readonly rightsHolder: string
  readonly author: string
  readonly attributionText: string
  readonly commercialUseVerified: boolean
  readonly modificationVerified: boolean
  readonly redistributionVerified: boolean
  readonly trademarkStatus: 'cleared' | 'requires-removal' | 'not-present'
  readonly verifiedAtISO: string
}

export interface VehicleAssetMetrics {
  readonly downloadBytes: number
  readonly triangles: number
  readonly drawCalls: number
  readonly decodedTextureBytes: number
  readonly largestTextureEdgePixels: number
}

/** Populate only after inspecting the licensed asset and validating all coordinates. */
export interface VehicleDescriptor {
  readonly id: string
  readonly make: string
  readonly model: string
  readonly generation: string
  readonly modelYears: readonly [number, number]
  readonly market: string
  readonly variant: string
  readonly glbUrl: string
  readonly sha256: string
  readonly orientation: VehicleOrientation
  readonly sourceBounds: Bounds3
  readonly viewerBoundsMeters: Bounds3
  readonly meshes: VehicleMeshMap
  readonly plateAnchors: {
    readonly front: PlateAnchor | null
    readonly rear: PlateAnchor | null
  }
  readonly spoilerAnchor: SpoilerAnchor | null
  readonly wheelFitment: Readonly<Record<WheelCorner, WheelFitment>>
  readonly features: VehicleFeatureFlags
  readonly metrics: VehicleAssetMetrics
  readonly license: VehicleLicense
}
