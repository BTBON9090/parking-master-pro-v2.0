import { CarType } from '../types';

/**
 * Per-car source-geometry bands. There is no single sedan-shaped hood: the
 * SUV hood is far forward/low, the SU7/YU7/ZUNJIE procedural front decks are
 * low, and the sedan GLB hood is the measured 0.69–0.71h band. These profiles
 * are used only to classify real paint triangles, not to invent a shell.
 */
export interface CockpitProfile {
  hoodYMin: number;
  hoodYMax: number;
  hoodZMin: number;
  hoodZMax: number;
  /** Keep only the central top hood band; excludes low side/pedal faces. */
  hoodMaxAbsX: number;
  hoodMinNormalY: number;
  /** Eye position inside the measured glass band (0=bottom, 1=top). */
  eyeGlassFraction: number;
  /** Steering-wheel centre and dashboard-top ratios for this body. */
  wheelCenterRatio: number;
  wheelZRatio: number;
  dashFrontYRatio: number;
  dashFrontZRatio: number;
  dashRearYRatio: number;
  dashRearZRatio: number;
  /** Move the generic cowl/dash front to the real hood-rear reference. */
  calibrateCowlToHood: boolean;
}

const PROFILES: Partial<Record<CarType, CockpitProfile>> = {
  [CarType.SEDAN]: {
    hoodYMin: 0.60, hoodYMax: 0.80, hoodZMin: 0.16, hoodZMax: 0.42,
    hoodMaxAbsX: 0.5, hoodMinNormalY: 0.85,
    eyeGlassFraction: 0.63, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.735, dashFrontZRatio: 0.19,
    dashRearYRatio: 0.605, dashRearZRatio: 0.015,
    calibrateCowlToHood: false,
  },
  [CarType.SEAL08]: {
    hoodYMin: 0.58, hoodYMax: 0.78, hoodZMin: 0.17, hoodZMax: 0.46,
    hoodMaxAbsX: 0.5, hoodMinNormalY: 0.88,
    eyeGlassFraction: 0.53, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.72, dashFrontZRatio: 0.20,
    dashRearYRatio: 0.57, dashRearZRatio: 0.015,
    calibrateCowlToHood: false,
  },
  [CarType.TAI7]: {
    hoodYMin: 0.55, hoodYMax: 0.74, hoodZMin: 0.17, hoodZMax: 0.495,
    hoodMaxAbsX: 0.34, hoodMinNormalY: 0.90,
    eyeGlassFraction: 0.45, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.58,
    dashRearYRatio: 0.555, dashRearZRatio: 0.015,
    calibrateCowlToHood: true,
  },  [CarType.LI_I9]: {
    hoodYMin: 0.55, hoodYMax: 0.74, hoodZMin: 0.17, hoodZMax: 0.495,
    hoodMaxAbsX: 0.34, hoodMinNormalY: 0.90,
    eyeGlassFraction: 0.45, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.58,
    dashRearYRatio: 0.555, dashRearZRatio: 0.015,
    calibrateCowlToHood: true,
  },  [CarType.N90]: {
    hoodYMin: 0.55, hoodYMax: 0.74, hoodZMin: 0.17, hoodZMax: 0.495,
    hoodMaxAbsX: 0.34, hoodMinNormalY: 0.90,
    eyeGlassFraction: 0.45, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.58,
    dashRearYRatio: 0.555, dashRearZRatio: 0.015,
    calibrateCowlToHood: true,
  },  [CarType.SUV]: {
    hoodYMin: 0.55, hoodYMax: 0.74, hoodZMin: 0.17, hoodZMax: 0.495,
    hoodMaxAbsX: 0.34, hoodMinNormalY: 0.90,
    eyeGlassFraction: 0.45, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.58,
    dashRearYRatio: 0.555, dashRearZRatio: 0.015,
    calibrateCowlToHood: true,
  },
  [CarType.SPORTS]: {
    hoodYMin: 0.30, hoodYMax: 0.72, hoodZMin: 0.05, hoodZMax: 0.495,
    hoodMaxAbsX: 0.5, hoodMinNormalY: 0.85,
    eyeGlassFraction: 0.50, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.20,
    dashRearYRatio: 0.560, dashRearZRatio: 0.015,
    calibrateCowlToHood: false,
  },
  [CarType.TRUCK]: {
    hoodYMin: 0.28, hoodYMax: 0.72, hoodZMin: 0.05, hoodZMax: 0.495,
    hoodMaxAbsX: 0.5, hoodMinNormalY: 0.85,
    eyeGlassFraction: 0.48, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.20,
    dashRearYRatio: 0.555, dashRearZRatio: 0.015,
    calibrateCowlToHood: false,
  },
  [CarType.SU7]: {
    hoodYMin: 0.44, hoodYMax: 0.66, hoodZMin: 0.17, hoodZMax: 0.495,
    hoodMaxAbsX: 0.34, hoodMinNormalY: 0.88,
    eyeGlassFraction: 0.50, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.20,
    dashRearYRatio: 0.560, dashRearZRatio: 0.015,
    calibrateCowlToHood: true,
  },
  [CarType.YU7]: {
    hoodYMin: 0.48, hoodYMax: 0.68, hoodZMin: 0.16, hoodZMax: 0.495,
    hoodMaxAbsX: 0.34, hoodMinNormalY: 0.88,
    eyeGlassFraction: 0.48, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.20,
    dashRearYRatio: 0.560, dashRearZRatio: 0.015,
    calibrateCowlToHood: true,
  },
  [CarType.ZUNJIE]: {
    hoodYMin: 0.52, hoodYMax: 0.72, hoodZMin: 0.16, hoodZMax: 0.495,
    hoodMaxAbsX: 0.34, hoodMinNormalY: 0.88,
    eyeGlassFraction: 0.50, wheelCenterRatio: 0.66, wheelZRatio: 0.16,
    dashFrontYRatio: 0.700, dashFrontZRatio: 0.20,
    dashRearYRatio: 0.560, dashRearZRatio: 0.015,
    calibrateCowlToHood: true,
  },
};

export function cockpitProfileFor(carType: CarType): CockpitProfile {
  // Taller commercial bodies need the flatter, farther-forward cowl profile;
  // scaling the sedan dash with their height hides the wheel behind it.
  if ([CarType.JEEP,CarType.MIDIBUS,CarType.COACH,CarType.VAN,CarType.LIGHT_TRUCK].includes(carType)) return PROFILES[CarType.SUV]!;
  return PROFILES[carType] ?? PROFILES[CarType.SEDAN]!;
}

export type CockpitTriangleClass = 'hood' | 'frame' | 'discard';

export function classifyCockpitPaintTriangle(
  lx: number,
  ly: number,
  lz: number,
  normalY: number,
  glassMinYNormalized: number,
  glassMaxYNormalized = 1,
  profile: CockpitProfile = PROFILES[CarType.SEDAN],
): CockpitTriangleClass {
  const isHood = lx <= profile.hoodMaxAbsX
    && lz > profile.hoodZMin && lz < profile.hoodZMax
    && ly > profile.hoodYMin && ly < profile.hoodYMax
    && normalY >= profile.hoodMinNormalY;
  if (isHood) return 'hood';
  // Downward hood underside/front-nose paint is not a window frame.
  if (lz > profile.hoodZMin && lz < profile.hoodZMax
    && ly > profile.hoodYMin && ly < profile.hoodYMax
    && normalY < -0.15) return 'discard';
  // A large downward roof/header panel makes the cabin look like a black box.
  // Keep the real upright frame but drop that underside slab.
  if (normalY < -0.25 && ly > glassMaxYNormalized - 0.05) return 'discard';
  if (ly > glassMinYNormalized - 0.035 || (lx > 0.44 && ly > 0.34)) return 'frame';
  return 'discard';
}

/** Fit the generic cowl/front dash to the actual rear edge of the hood. */
export function calibrateCowlProfile(
  profile: CockpitProfile,
  hoodRearYNormalized: number | null,
  hoodRearZNormalized: number | null,
): CockpitProfile {
  if (!profile.calibrateCowlToHood || hoodRearYNormalized === null || hoodRearZNormalized === null) return profile;
  return {
    ...profile,
    // Slightly overlap the real hood rear edge. Moving the dash forward of
    // the edge or lowering it produced the visible road slit under the white
    // hood strip.
    dashFrontYRatio: Math.min(
      profile.dashFrontYRatio,
      Math.max(profile.dashRearYRatio + 0.02, hoodRearYNormalized + 0.004),
    ),
    dashFrontZRatio: Math.min(0.34, Math.max(0.10, hoodRearZNormalized + 0.004)),
  };
}
