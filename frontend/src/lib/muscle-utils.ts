/**
 * Three.js sanitises GLTF names: spaces → underscores, dots removed.
 * So "Brachialis muscle.l" becomes "Brachialis_musclel" at runtime.
 * The last char is the side indicator: "l" = left, "r" = right.
 */

export function isRightSide(meshId: string): boolean {
  return meshId.endsWith("r");
}

export function isLeftSide(meshId: string): boolean {
  return meshId.endsWith("l");
}

export function getOtherSide(meshId: string): string {
  if (meshId.endsWith("l")) return meshId.slice(0, -1) + "r";
  if (meshId.endsWith("r")) return meshId.slice(0, -1) + "l";
  return meshId;
}

export function getSideLabel(meshId: string): string {
  if (meshId.endsWith("r")) return "Right";
  if (meshId.endsWith("l")) return "Left";
  return "";
}

export function formatMuscleName(meshId: string): string {
  // Strip trailing side indicator (l/r)
  let name = meshId;
  if (name.endsWith("l") || name.endsWith("r")) {
    name = name.slice(0, -1);
  }
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
