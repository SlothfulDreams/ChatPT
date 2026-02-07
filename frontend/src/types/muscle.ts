import * as THREE from "three";

// ============================================
// Conditions & Rendering
// ============================================

export type MuscleCondition =
  | "healthy"
  | "tight"
  | "knotted"
  | "strained"
  | "torn"
  | "recovering"
  | "inflamed"
  | "weak"
  | "fatigued";

export interface MuscleState {
  id?: string;
  condition: MuscleCondition;
  metrics: {
    pain: number; // 0-10
    strength: number; // 0-1
    mobility: number; // 0-1
  };
  lastStrengthValue?: number;
  lastStrengthUnit?: string;
  lastRomDegrees?: number;
  expectedRomDegrees?: number;
  lastUpdated?: Date;
  notes?: string;
  summary?: string;
}

export type MuscleStates = Record<string, MuscleState>;

export function createDefaultMuscleState(): MuscleState {
  return {
    condition: "healthy",
    metrics: { pain: 0, strength: 1, mobility: 1 },
  };
}

// ============================================
// Condition Rendering
// ============================================

export interface ConditionRenderingParams {
  baseColor: [number, number, number];
  emissiveColor: [number, number, number];
  emissiveIntensity: number;
  opacity: number;
  pulseSpeed?: number;
  pulseIntensity?: number;
}

export const CONDITION_RENDERING: Record<
  MuscleCondition,
  ConditionRenderingParams
> = {
  healthy: {
    baseColor: [0.05, 0.35, 0.15],
    emissiveColor: [0, 0, 0],
    emissiveIntensity: 0,
    opacity: 0.85,
  },
  tight: {
    baseColor: [0.6, 0.4, 0.1],
    emissiveColor: [0.4, 0.3, 0.05],
    emissiveIntensity: 0.15,
    opacity: 0.88,
  },
  knotted: {
    baseColor: [0.55, 0.25, 0.1],
    emissiveColor: [0.5, 0.2, 0.05],
    emissiveIntensity: 0.2,
    opacity: 0.9,
  },
  strained: {
    baseColor: [0.65, 0.2, 0.1],
    emissiveColor: [0.6, 0.15, 0.1],
    emissiveIntensity: 0.3,
    opacity: 0.88,
  },
  torn: {
    baseColor: [0.8, 0.05, 0.05],
    emissiveColor: [0.9, 0.1, 0.1],
    emissiveIntensity: 0.6,
    opacity: 0.95,
    pulseSpeed: 2.0,
    pulseIntensity: 0.5,
  },
  recovering: {
    baseColor: [0.2, 0.45, 0.6],
    emissiveColor: [0.15, 0.35, 0.5],
    emissiveIntensity: 0.15,
    opacity: 0.8,
  },
  inflamed: {
    baseColor: [0.7, 0.15, 0.1],
    emissiveColor: [0.9, 0.2, 0.15],
    emissiveIntensity: 0.5,
    opacity: 0.9,
    pulseSpeed: 1.5,
    pulseIntensity: 0.4,
  },
  weak: {
    baseColor: [0.35, 0.35, 0.25],
    emissiveColor: [0.2, 0.2, 0.1],
    emissiveIntensity: 0.1,
    opacity: 0.7,
  },
  fatigued: {
    baseColor: [0.4, 0.3, 0.35],
    emissiveColor: [0.3, 0.2, 0.25],
    emissiveIntensity: 0.1,
    opacity: 0.75,
  },
};

// ============================================
// HSL-based condition rendering (strength = primary visual signal)
// ============================================

export const CONDITION_HSL: Record<
  MuscleCondition,
  { hue: number; saturation: number }
> = {
  healthy: { hue: 130, saturation: 0.6 },
  tight: { hue: 40, saturation: 0.65 },
  knotted: { hue: 25, saturation: 0.6 },
  strained: { hue: 10, saturation: 0.65 },
  torn: { hue: 0, saturation: 0.8 },
  recovering: { hue: 200, saturation: 0.5 },
  inflamed: { hue: 5, saturation: 0.75 },
  weak: { hue: 50, saturation: 0.3 },
  fatigued: { hue: 280, saturation: 0.3 },
};

/**
 * Strength-driven color: condition sets hue/saturation, strength drives lightness.
 * strength=0 -> very light (0.85), strength=1 -> dark (0.25).
 */
export function getMuscleMaterialColor(
  condition: MuscleCondition,
  strength: number,
): THREE.Color {
  const { hue, saturation } = CONDITION_HSL[condition];
  const lightness = 0.85 - Math.min(1, Math.max(0, strength)) * 0.6;
  return new THREE.Color().setHSL(hue / 360, saturation, lightness);
}

// ============================================
// Pain Gradient: Green -> Yellow -> Orange -> Red
// ============================================

const PAIN_COLORS = [
  { stop: 0, color: new THREE.Color(0.05, 0.55, 0.15) },
  { stop: 0.33, color: new THREE.Color(0.75, 0.7, 0.1) },
  { stop: 0.66, color: new THREE.Color(0.85, 0.4, 0.08) },
  { stop: 1.0, color: new THREE.Color(0.85, 0.08, 0.08) },
];

export function getPainColor(painLevel: number): THREE.Color {
  const t = Math.min(1, Math.max(0, painLevel / 10));

  for (let i = 0; i < PAIN_COLORS.length - 1; i++) {
    const curr = PAIN_COLORS[i];
    const next = PAIN_COLORS[i + 1];
    if (t >= curr.stop && t <= next.stop) {
      const local = (t - curr.stop) / (next.stop - curr.stop);
      return curr.color.clone().lerp(next.color, local);
    }
  }

  return PAIN_COLORS[PAIN_COLORS.length - 1].color.clone();
}
