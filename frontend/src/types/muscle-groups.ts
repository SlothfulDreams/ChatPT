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

// ============================================
// Explicit mesh-name-to-group mapping.
// Keys are GLTF base names (without .l/.r/.g suffix).
// Every muscle mesh must be listed here or it will be hidden.
// ============================================

export const MESH_TO_GROUP: Record<string, MuscleGroup> = {
  // --- Neck ---
  "Scalenus anterior muscle": "neck",
  "Scalenus medius muscle": "neck",
  "Scalenus posterior muscle": "neck",
  "Longus colli muscle": "neck",
  "Longus capitis muscle": "neck",
  "Splenius capitis muscle": "neck",
  "Splenius colli muscle": "neck",
  "Levator scapulae": "neck",
  "Semispinalis colli muscle": "neck",
  "Obliquus inferior capitis muscle": "neck",
  "Obliquus superior capitis muscle": "neck",
  "Rectus anterior capitis muscle": "neck",
  "Rectus lateralis capitis muscle": "neck",
  "Rectus posterior major capitis muscle": "neck",
  "Rectus posterior minor capitis muscle": "neck",

  // --- Upper Back ---
  "Ascending part of trapezius muscle": "upper_back",
  "Descending part of trapezius muscle": "upper_back",
  "Transverse part of trapezius muscle": "upper_back",
  "Rhomboid major muscle": "upper_back",
  "Rhomboid minor muscle": "upper_back",
  "Latissimus dorsi muscle": "upper_back",
  "Serratus posterior superior muscle": "upper_back",
  "Serratus anterior muscle": "upper_back",

  // --- Lower Back ---
  "Iliocostalis colli muscle": "lower_back",
  "Iliocostalis lumborum muscle": "lower_back",
  "Iliocostalis thoracis muscle": "lower_back",
  "Longissimus capitis muscle": "lower_back",
  "Longissimus colli muscle": "lower_back",
  "Longissimus thoracis muscle": "lower_back",
  "Spinalis capitis muscle": "lower_back",
  "Spinalis colli muscle": "lower_back",
  "Spinalis thoracis muscle": "lower_back",
  "Multifidus colli muscle": "lower_back",
  "Multifidus lumborum muscle": "lower_back",
  "Multifidus thoracis muscle": "lower_back",
  Rotatores: "lower_back",
  "Quadratus lumborum muscle": "lower_back",
  "Serratus posterior inferior muscle": "lower_back",
  "Interspinales colli muscles": "lower_back",
  "Interspinales lumborum muscles": "lower_back",
  "Interspinales thoracis muscles": "lower_back",
  "Dorsal parts of lateral intertransversarii lumborum muscles": "lower_back",
  "Ventral parts of lateral intertransversarii lumborum muscles": "lower_back",
  "Semispinalis thoracis muscle": "lower_back",

  // --- Chest ---
  "(Abdominal part of pectoralis major muscle)": "chest",
  "Clavicular head of pectoralis major muscle": "chest",
  "Sternocostal head of pectoralis major muscle": "chest",
  "Pectoralis minor muscle": "chest",
  "Subclavius muscle": "chest",

  // --- Shoulders ---
  "Acromial part of deltoid muscle": "shoulders",
  "Clavicular part of deltoid muscle": "shoulders",
  "Scapular spinal part of deltoid muscle": "shoulders",

  // --- Rotator Cuff ---
  "Supraspinatus muscle": "rotator_cuff",
  "Infraspinatus muscle": "rotator_cuff",
  "Teres minor muscle": "rotator_cuff",
  "Subscapularis muscle": "rotator_cuff",
  "Teres major muscle": "rotator_cuff",

  // --- Biceps ---
  "Long head of biceps brachii": "biceps",
  "Short head of biceps brachii": "biceps",
  "Brachialis muscle": "biceps",
  "Coracobrachialis muscle": "biceps",

  // --- Triceps ---
  "Long head of triceps brachii": "triceps",
  "Lateral head of triceps brachii": "triceps",
  "Medial head of triceps brachii": "triceps",
  "Anconeus muscle": "triceps",

  // --- Forearms ---
  "Brachioradialis muscle": "forearms",
  "Deep head of pronator teres": "forearms",
  "Superficial head of pronator teres": "forearms",
  "Flexor carpi radialis": "forearms",
  "Palmaris longus muscle": "forearms",
  "Humeral head of flexor carpi ulnaris": "forearms",
  "Ulnar head of flexor carpi ulnaris": "forearms",
  "Humero-ulnar head of flexor digitorum superficialis": "forearms",
  "Radial head of flexor digitorum superficialis": "forearms",
  "Flexor digitorum profundus": "forearms",
  "Flexor pollicis longus": "forearms",
  "Pronator quadratus": "forearms",
  "Extensor carpi radialis longus": "forearms",
  "Extensor carpi radialis brevis": "forearms",
  "Extensor digitorum": "forearms",
  "Extensor digiti minimi": "forearms",
  "Humeral head of extensor carpi ulnaris": "forearms",
  "Ulnar head of extensor carpi ulnaris": "forearms",
  Supinator: "forearms",
  "Abductor pollicis longus": "forearms",
  "Extensor pollicis brevis": "forearms",
  "Extensor pollicis longus": "forearms",
  "Extensor indicis": "forearms",
  // Hand intrinsics
  "Dorsal interossei muscles of hand": "forearms",
  "Palmar interossei muscles": "forearms",
  "Lumbrical muscles of hand": "forearms",
  "Abductor pollicis brevis": "forearms",
  "Deep head of flexor pollicis brevis": "forearms",
  "Superficial head of flexor pollicis brevis": "forearms",
  "Opponens pollicis muscle": "forearms",
  "Oblique head of adductor pollicis": "forearms",
  "Transverse head of adductor pollicis": "forearms",
  "Abductor digiti minimi of hand": "forearms",
  "Flexor digiti minimi of hand": "forearms",
  "Opponens digiti minimi muscle of hand": "forearms",

  // --- Core ---
  "Rectus abdominis muscle": "core",
  "External abdominal oblique muscle": "core",
  "Internal abdominal oblique muscle": "core",
  "Transversus abdominis muscle": "core",
  "Pyramidalis muscle": "core",
  "External intercostal muscles": "core",
  "Internal intercostal muscles": "core",
  "Innermost intercostal muscles": "core",
  "Levatores breves costarum": "core",
  "Levatores longi costarum": "core",
  "Transversus thoracis muscle": "core",
  "Coccygeus muscle": "core",
  "Iliococcygeus muscle": "core",
  "Pubococcygeus muscle": "core",
  "Pubo-analis muscle": "core",
  "External anal sphincter": "core",

  // --- Hip Flexors ---
  "Psoas major": "hip_flexors",
  "Iliacus muscle": "hip_flexors",
  "Tensor fasciae latae": "hip_flexors",
  "Sartorius muscle": "hip_flexors",

  // --- Glutes ---
  "Gluteus maximus muscle": "glutes",
  "Gluteus medius muscle": "glutes",
  "Gluteus minimus muscle": "glutes",
  "Piriformis muscle": "glutes",
  "Obturator internus": "glutes",
  "Obturator externus": "glutes",
  "Inferior gemellus muscle": "glutes",
  "Superior gemellus muscle": "glutes",
  "Quadratus femoris muscle": "glutes",

  // --- Quads ---
  "Rectus femoris muscle": "quads",
  "Vastus lateralis muscle": "quads",
  "Vastus medialis muscle": "quads",
  "Vastus intermedius muscle": "quads",

  // --- Adductors ---
  "Adductor longus": "adductors",
  "Adductor brevis": "adductors",
  "Adductor magnus": "adductors",
  "(Adductor minimus)": "adductors",
  "Gracilis muscle": "adductors",
  "Pectineus muscle": "adductors",

  // --- Hamstrings ---
  "Long head of biceps femoris": "hamstrings",
  "Short head of biceps femoris": "hamstrings",
  "Semitendinosus muscle": "hamstrings",
  "Semimembranosus muscle": "hamstrings",

  // --- Calves ---
  "Lateral head of gastrocnemius": "calves",
  "Medial head of gastrocnemius": "calves",
  "Soleus muscle": "calves",
  "Plantaris muscle": "calves",
  "Popliteus muscle": "calves",
  "Flexor digitorum longus": "calves",
  "Flexor hallucis longus": "calves",
  "Tibialis posterior muscle": "calves",
  // Foot intrinsics
  "Dorsal interossei muscles of foot": "calves",
  "Plantar interossei muscles": "calves",
  "Lumbrical muscles of foot": "calves",
  "Abductor hallucis": "calves",
  "Oblique head of adductor hallucis": "calves",
  "Transverse head of adductor hallucis": "calves",
  "Lateral head of flexor hallucis brevis": "calves",
  "Medial head of flexor hallucis brevis": "calves",
  "Abductor digiti minimi of foot": "calves",
  "Flexor digiti minimi of foot": "calves",
  "(Opponens digiti minimi muscle of foot)": "calves",
  "Flexor digitorum brevis": "calves",
  "Quadratus plantae muscle": "calves",
  "Extensor digitorum brevis": "calves",
  "Extensor hallucis brevis": "calves",

  // --- Shins ---
  "Tibialis anterior muscle": "shins",
  "Extensor digitorum longus": "shins",
  "Extensor hallucis longus": "shins",
  "Fibularis longus muscle": "shins",
  "Fibularis brevis muscle": "shins",
  "Fibularis tertius muscle": "shins",
};

// ============================================
// Lookup helpers
// ============================================

/** Strip .l / .r / .g / .001 / .002 suffixes from GLTF mesh names. */
function getBaseName(meshName: string): string {
  return meshName.replace(/\.(l|r|g|\d+)$/, "");
}

/**
 * Returns the muscle group for a mesh, or null if unclassified.
 */
export function getMuscleGroup(meshName: string): MuscleGroup | null {
  return MESH_TO_GROUP[getBaseName(meshName)] ?? null;
}

/**
 * Returns all muscle groups for a mesh (currently always 0 or 1).
 * Kept as array for API compatibility.
 */
export function getMuscleGroups(meshName: string): MuscleGroup[] {
  const group = getMuscleGroup(meshName);
  return group ? [group] : [];
}

/**
 * Returns true if the mesh is a classified muscle (exists in the map).
 */
export function isClassifiedMuscle(meshName: string): boolean {
  return getBaseName(meshName) in MESH_TO_GROUP;
}

/**
 * Returns true if the muscle should be visible given the active group filters.
 * If no groups are active, all classified muscles are visible.
 */
export function shouldShowMuscle(
  meshName: string,
  activeGroups: Set<MuscleGroup>,
): boolean {
  if (activeGroups.size === 0) return true;
  const group = getMuscleGroup(meshName);
  return group !== null && activeGroups.has(group);
}
