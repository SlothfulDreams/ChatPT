export function formatMuscleName(meshId: string): string {
  return meshId
    .replace(/_1$/, "")
    .replace(/\./g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
