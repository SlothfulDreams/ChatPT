// ============================================
// 17 Anatomical Muscle Groups
// Source: @/data/muscle_groups.json
// ============================================

import muscleGroupData from "@/data/muscle_groups.json";

export type MuscleGroup = keyof typeof muscleGroupData;

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  neck: "Neck",
  upper_back: "Upper Back",
  lower_back: "Lower Back",
  chest: "Chest",
  shoulders: "Shoulders",
  rotator_cuff: "Rotator Cuff",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  hip_flexors: "Hip Flexors",
  glutes: "Glutes",
  quads: "Quads",
  adductors: "Adductors",
  hamstrings: "Hamstrings",
  calves: "Calves",
  shins: "Shins",
};

// Patterns matched against GLTF mesh names (case-insensitive includes).
export const MUSCLE_GROUP_PATTERNS: Record<MuscleGroup, string[]> =
  muscleGroupData;

/**
 * Returns all muscle groups a mesh name belongs to.
 * A muscle can belong to multiple groups (e.g. levator scapulae → neck + upper_back).
 */
export function getMuscleGroups(meshName: string): MuscleGroup[] {
  const lower = meshName.toLowerCase().replace(/_/g, " ");
  const groups: MuscleGroup[] = [];
  for (const group of Object.keys(MUSCLE_GROUP_PATTERNS) as MuscleGroup[]) {
    if (MUSCLE_GROUP_PATTERNS[group].some((p) => lower.includes(p))) {
      groups.push(group);
    }
  }
  return groups;
}

/**
 * Returns the primary muscle group (first match) for display purposes.
 */
export function getMuscleGroup(meshName: string): MuscleGroup | null {
  const groups = getMuscleGroups(meshName);
  return groups.length > 0 ? groups[0] : null;
}

/**
 * Returns true if the muscle should be visible given the active group filters.
 * If no groups are active, all muscles are visible.
 * A muscle is visible if ANY of its groups is in the active set.
 */
export function shouldShowMuscle(
  meshName: string,
  activeGroups: Set<MuscleGroup>,
): boolean {
  if (activeGroups.size === 0) return true;
  const groups = getMuscleGroups(meshName);
  return groups.some((g) => activeGroups.has(g));
}
