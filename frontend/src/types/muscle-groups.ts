// ============================================
// 17 Anatomical Muscle Groups
// ============================================

export type MuscleGroup =
  | "neck"
  | "upper_back"
  | "lower_back"
  | "chest"
  | "shoulders"
  | "rotator_cuff"
  | "biceps"
  | "triceps"
  | "forearms"
  | "core"
  | "hip_flexors"
  | "glutes"
  | "quads"
  | "adductors"
  | "hamstrings"
  | "calves"
  | "shins";

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
// Order matters: more specific patterns come first to avoid false matches.
export const MUSCLE_GROUP_PATTERNS: Record<MuscleGroup, string[]> = {
  neck: [
    "scalene",
    "scalenus",
    "longus colli",
    "longus capitis",
    "splenius capitis",
    "splenius cervicis",
    "splenius colli",
    "levator scapulae",
    "semispinalis capitis",
    "semispinalis cervicis",
    "semispinalis colli",
    "obliquus inferior capitis",
    "obliquus superior capitis",
    "rectus anterior capitis",
    "rectus lateralis capitis",
    "rectus posterior major capitis",
    "rectus posterior minor capitis",
  ],
  upper_back: [
    "trapezius",
    "rhomboid major",
    "rhomboid minor",
    "latissimus dorsi",
    "serratus posterior superior",
    "serratus anterior",
  ],
  lower_back: [
    "erector spinae",
    "iliocostalis",
    "longissimus",
    "spinalis",
    "multifidus",
    "rotatores",
    "quadratus lumborum",
    "serratus posterior inferior",
    "interspinales",
    "intertransversarii",
  ],
  chest: ["pectoralis major", "pectoralis minor", "subclavius"],
  shoulders: [
    "deltoid",
    "anterior deltoid",
    "lateral deltoid",
    "posterior deltoid",
  ],
  rotator_cuff: [
    "supraspinatus",
    "infraspinatus",
    "teres minor",
    "subscapularis",
    "teres major",
  ],
  biceps: ["biceps brachii", "brachialis", "coracobrachialis"],
  triceps: ["triceps brachii", "anconeus"],
  forearms: [
    "brachioradialis",
    "pronator teres",
    "flexor carpi radialis",
    "palmaris longus",
    "flexor carpi ulnaris",
    "flexor digitorum superficialis",
    "flexor digitorum profundus",
    "flexor pollicis longus",
    "pronator quadratus",
    "extensor carpi radialis longus",
    "extensor carpi radialis brevis",
    "extensor digitorum",
    "extensor digiti minimi",
    "extensor carpi ulnaris",
    "supinator",
    "abductor pollicis longus",
    "extensor pollicis brevis",
    "extensor pollicis longus",
    "extensor indicis",
    // Hand intrinsics
    "interossei muscles of hand",
    "dorsal interossei muscles of hand",
    "palmar interossei",
    "lumbrical muscles of hand",
    "abductor pollicis brevis",
    "flexor pollicis brevis",
    "opponens pollicis",
    "adductor pollicis",
    "abductor digiti minimi of hand",
    "flexor digiti minimi of hand",
    "opponens digiti minimi muscle of hand",
  ],
  core: [
    "rectus abdominis",
    "external oblique",
    "external abdominal oblique",
    "internal oblique",
    "internal abdominal oblique",
    "transversus abdominis",
    "pyramidalis",
    // Intercostals & chest wall
    "intercostal",
    "levatores",
    "transversus thoracis",
    // Pelvic floor
    "coccygeus",
    "iliococcygeus",
    "pubococcygeus",
    "pubo-analis",
    "levator ani",
    "external anal sphincter",
  ],
  hip_flexors: [
    "psoas major",
    "psoas minor",
    "iliacus",
    "iliopsoas",
    "tensor fasciae latae",
    "sartorius",
  ],
  glutes: [
    "gluteus maximus",
    "gluteus medius",
    "gluteus minimus",
    "piriformis",
    "obturator internus",
    "obturator externus",
    "gemellus superior",
    "gemellus inferior",
    "superior gemellus",
    "inferior gemellus",
    "quadratus femoris",
  ],
  quads: [
    "rectus femoris",
    "vastus lateralis",
    "vastus medialis",
    "vastus intermedius",
  ],
  adductors: [
    "adductor longus",
    "adductor brevis",
    "adductor magnus",
    "adductor minimus",
    "gracilis",
    "pectineus",
  ],
  hamstrings: ["biceps femoris", "semitendinosus", "semimembranosus"],
  calves: [
    "gastrocnemius",
    "soleus",
    "plantaris",
    "popliteus",
    "flexor digitorum longus",
    "flexor hallucis longus",
    "tibialis posterior",
    // Foot intrinsics
    "dorsal interossei muscles of foot",
    "plantar interossei",
    "lumbrical muscles of foot",
    "abductor hallucis",
    "adductor hallucis",
    "flexor hallucis brevis",
    "abductor digiti minimi of foot",
    "flexor digiti minimi of foot",
    "opponens digiti minimi muscle of foot",
    "flexor digitorum brevis",
    "quadratus plantae",
    "extensor digitorum brevis",
    "extensor hallucis brevis",
  ],
  shins: [
    "tibialis anterior",
    "extensor digitorum longus",
    "extensor hallucis longus",
    "peroneus longus",
    "peroneus brevis",
    "peroneus tertius",
    "fibularis longus",
    "fibularis brevis",
    "fibularis tertius",
  ],
};

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
