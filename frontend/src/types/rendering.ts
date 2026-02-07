export interface RenderingSettings {
  opacity: number;
  edgeThickness: number;
  edgeColor: string;
  enableEdges: boolean;
  metalness: number;
  roughness: number;
  wireframe: boolean;
}

export const DEFAULT_RENDERING_SETTINGS: RenderingSettings = {
  opacity: 1.0,
  edgeThickness: 0.5,
  edgeColor: "#000000",
  enableEdges: false,
  metalness: 0.15,
  roughness: 0.7,
  wireframe: false,
};
