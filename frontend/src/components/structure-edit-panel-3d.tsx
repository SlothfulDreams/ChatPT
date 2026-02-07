"use client";

import { useState } from "react";
import { formatMuscleName, getSideLabel } from "@/lib/muscle-utils";
import { getMuscleDepth } from "@/types/muscle-depth";
import { getMuscleGroup, MUSCLE_GROUP_LABELS } from "@/types/muscle-groups";

export interface MuscleVisualOverride {
  color: [number, number, number]; // RGB 0-1
  opacity: number;
  metalness: number;
  roughness: number;
  emissiveIntensity: number;
}

export const DEFAULT_VISUAL: MuscleVisualOverride = {
  color: [0.03, 0.35, 0.09],
  opacity: 1.0,
  metalness: 0.0,
  roughness: 1.0,
  emissiveIntensity: 0.0,
};

interface StructureEditPanel3DProps {
  muscleId: string;
  visual: MuscleVisualOverride;
  onVisualChange: (v: MuscleVisualOverride) => void;
  onClose: () => void;
}

export function StructureEditPanel3D({
  muscleId,
  visual,
  onVisualChange,
  onClose,
}: StructureEditPanel3DProps) {
  const displayName = formatMuscleName(muscleId);
  const side = getSideLabel(muscleId);
  const group = getMuscleGroup(muscleId);
  const depth = getMuscleDepth(muscleId);

  const [hue, setHue] = useState(() => rgbToScale(visual.color));

  const update = (patch: Partial<MuscleVisualOverride>) => {
    onVisualChange({ ...visual, ...patch });
  };

  const handleHueChange = (h: number) => {
    setHue(h);
    update({ color: scaleToRgb(h) });
  };

  return (
    <div
      className="mosaic-panel pointer-events-auto w-64 p-4 text-white shadow-2xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            {displayName}
            {side && ` (${side})`}
          </h3>
          <div className="flex gap-2 text-xs text-white/50">
            {group && <span>{MUSCLE_GROUP_LABELS[group]}</span>}
            <span className="capitalize">{depth}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/50 hover:text-white"
        >
          X
        </button>
      </div>

      {/* Color (hue) */}
      <label className="mb-1 block text-xs text-white/60">Color</label>
      <div className="mb-1 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={hue}
          onChange={(e) => handleHueChange(Number(e.target.value))}
          className="w-full"
          style={{
            background:
              "linear-gradient(to right, #085917, #807810, #8c400d, #8c0d0d)",
          }}
        />
        <div
          className="h-5 w-5 shrink-0 rounded border border-white/20"
          style={{
            backgroundColor: `rgb(${visual.color.map((c) => Math.round(c * 255)).join(",")})`,
          }}
        />
      </div>

      {/* Opacity */}
      <label className="mb-1 block text-xs text-white/60">
        Opacity: {(visual.opacity * 100).toFixed(0)}%
      </label>
      <input
        type="range"
        min={0.65}
        max={1}
        step={0.05}
        value={visual.opacity}
        onChange={(e) => update({ opacity: Number(e.target.value) })}
        className="mb-3 w-full"
      />

      {/* Metalness */}
      <label className="mb-1 block text-xs text-white/60">
        Metalness: {(visual.metalness * 100).toFixed(0)}%
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={visual.metalness}
        onChange={(e) => update({ metalness: Number(e.target.value) })}
        className="mb-3 w-full"
      />

      {/* Roughness */}
      <label className="mb-1 block text-xs text-white/60">
        Roughness: {(visual.roughness * 100).toFixed(0)}%
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={visual.roughness}
        onChange={(e) => update({ roughness: Number(e.target.value) })}
        className="mb-3 w-full"
      />

      {/* Emissive (glow) */}
      <label className="mb-1 block text-xs text-white/60">
        Glow: {(visual.emissiveIntensity * 100).toFixed(0)}%
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={visual.emissiveIntensity}
        onChange={(e) => update({ emissiveIntensity: Number(e.target.value) })}
        className="mb-3 w-full"
      />

      {/* Reset */}
      <button
        type="button"
        onClick={() => {
          onVisualChange({ ...DEFAULT_VISUAL });
          setHue(rgbToScale(DEFAULT_VISUAL.color));
        }}
        className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/20 hover:text-white"
      >
        Reset to Default
      </button>
    </div>
  );
}

// Color scale: darkened pain gradient
const COLOR_STOPS: [number, number, number][] = [
  [0.03, 0.35, 0.09], // dark green
  [0.5, 0.47, 0.06], // dark yellow
  [0.55, 0.25, 0.05], // dark orange
  [0.55, 0.05, 0.05], // dark red
];

function scaleToRgb(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(100, t));
  const segment = (clamped / 100) * (COLOR_STOPS.length - 1);
  const i = Math.min(Math.floor(segment), COLOR_STOPS.length - 2);
  const frac = segment - i;
  const a = COLOR_STOPS[i];
  const b = COLOR_STOPS[i + 1];
  return [
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac,
  ];
}

function rgbToScale(rgb: [number, number, number]): number {
  let bestT = 0;
  let bestDist = Infinity;
  for (let t = 0; t <= 100; t++) {
    const c = scaleToRgb(t);
    const d =
      (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  return bestT;
}
