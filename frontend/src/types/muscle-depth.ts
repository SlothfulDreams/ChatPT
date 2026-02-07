// ============================================
// Depth Layer Classification
// ============================================

export type MuscleDepth = "superficial" | "intermediate" | "deep";

const SUPERFICIAL_PATTERNS = [
  "deltoid",
  "pectoralis major",
  "trapezius",
  "latissimus dorsi",
  "gastrocnemius",
  "rectus abdominis",
  "external oblique",
  "biceps brachii",
  "triceps brachii",
  "rectus femoris",
  "sartorius",
  "tibialis anterior",
  "gluteus maximus",
  "external abdominal oblique",
  "tensor fasciae latae",
  "extensor digitorum",
  "extensor carpi",
  "flexor carpi",
  "brachioradialis",
  "palmaris longus",
  "vastus lateralis",
  "vastus medialis",
  "peroneus longus",
  "fibularis longus",
  "gracilis",
  "adductor longus",
  "serratus anterior",
];

const DEEP_PATTERNS = [
  "supraspinatus",
  "infraspinatus",
  "teres minor",
  "subscapularis",
  "multifidus",
  "rotatores",
  "psoas",
  "iliacus",
  "transversus abdominis",
  "internal oblique",
  "internal abdominal oblique",
  "popliteus",
  "obturator internus",
  "obturator externus",
  "gemellus",
  "quadratus femoris",
  "piriformis",
  "longus colli",
  "longus capitis",
  "scalene",
  "scalenus",
  "pronator quadratus",
  "flexor digitorum profundus",
  "flexor pollicis longus",
  "supinator",
  "vastus intermedius",
  "adductor brevis",
  "pectineus",
  "tibialis posterior",
  "flexor hallucis longus",
  "diaphragm",
  "subclavius",
  "gluteus minimus",
  "quadratus lumborum",
  // Deep spinal
  "interspinales",
  "intertransversarii",
  "obliquus capitis",
  "rectus capitis",
  // Pelvic floor
  "coccygeus",
  "iliococcygeus",
  "pubococcygeus",
  "pubo-analis",
  "levator ani",
  // Innermost chest wall
  "innermost intercostal",
  "transversus thoracis",
  // Hand/foot deep intrinsics
  "interossei",
  "adductor pollicis",
  "adductor hallucis",
  "quadratus plantae",
];

export function getMuscleDepth(muscleName: string): MuscleDepth {
  const lower = muscleName.toLowerCase();
  if (SUPERFICIAL_PATTERNS.some((p) => lower.includes(p))) return "superficial";
  if (DEEP_PATTERNS.some((p) => lower.includes(p))) return "deep";
  return "intermediate";
}

export function shouldShowDepth(
  muscleName: string,
  selectedDepths: Set<MuscleDepth>,
): boolean {
  if (selectedDepths.size === 0) return true;
  return selectedDepths.has(getMuscleDepth(muscleName));
}
