"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMuscleName, getSideLabel } from "@/lib/muscle-utils";
import type { MuscleCondition, MuscleState } from "@/types/muscle";
import { getMuscleDepth } from "@/types/muscle-depth";
import { getMuscleGroup, MUSCLE_GROUP_LABELS } from "@/types/muscle-groups";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ============================================
// Color interpolation for severity slider
// ============================================

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const GREEN_RGB = hexToRgb("#22c55e");

function lerpColor(accent: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(accent);
  return rgbToHex(
    GREEN_RGB[0] + (ar - GREEN_RGB[0]) * t,
    GREEN_RGB[1] + (ag - GREEN_RGB[1]) * t,
    GREEN_RGB[2] + (ab - GREEN_RGB[2]) * t,
  );
}

// ============================================
// Feelings catalog
// ============================================

interface FeelingDef {
  label: string;
  condition: MuscleCondition;
  accent: string;
  description: string;
  affectsMobility?: boolean;
}

/**
 * Exhaustive condition display map -- every MuscleCondition must have an entry.
 * `selectable` = shown in the "How does it feel?" grid.
 * Non-selectable conditions (torn, recovering, healthy) appear as status badges.
 */
interface ConditionDisplay {
  label: string;
  accent: string;
  description: string;
  selectable: boolean;
  affectsMobility?: boolean;
}

const CONDITION_DISPLAY: Record<MuscleCondition, ConditionDisplay> = {
  healthy: {
    label: "Healthy",
    accent: "#22c55e",
    description: "No issues",
    selectable: false,
  },
  fatigued: {
    label: "Soreness",
    accent: "#a855f7",
    description: "Dull ache",
    selectable: true,
  },
  strained: {
    label: "Sharp Pain",
    accent: "#ef4444",
    description: "Acute, sudden",
    selectable: true,
  },
  tight: {
    label: "Stiffness",
    accent: "#f97316",
    description: "Restricted movement",
    selectable: true,
    affectsMobility: true,
  },
  knotted: {
    label: "Numbness",
    accent: "#818cf8",
    description: "Loss of sensation",
    selectable: true,
  },
  inflamed: {
    label: "Burning",
    accent: "#f43f5e",
    description: "Hot, irritated",
    selectable: true,
  },
  weak: {
    label: "Weakness",
    accent: "#60a5fa",
    description: "Lack of strength",
    selectable: true,
  },
  torn: {
    label: "Torn",
    accent: "#b91c1c",
    description: "Severe muscle tear",
    selectable: true,
  },
  recovering: {
    label: "Recovering",
    accent: "#38bdf8",
    description: "Healing in progress",
    selectable: true,
  },
};

/** Additional user-selectable feelings that map to existing conditions (aliases) */
const EXTRA_FEELINGS: FeelingDef[] = [
  {
    label: "Cramping",
    condition: "tight",
    accent: "#ec4899",
    description: "Involuntary contraction",
    affectsMobility: true,
  },
  {
    label: "Throbbing",
    condition: "inflamed",
    accent: "#dc2626",
    description: "Pulsating pain",
  },
  {
    label: "Tenderness",
    condition: "strained",
    accent: "#fb7185",
    description: "Painful to touch",
  },
];

/** All selectable feelings for the grid: primary conditions + aliases */
const FEELINGS: FeelingDef[] = [
  ...Object.entries(CONDITION_DISPLAY)
    .filter(([_, d]) => d.selectable)
    .map(
      ([condition, d]): FeelingDef => ({
        label: d.label,
        condition: condition as MuscleCondition,
        accent: d.accent,
        description: d.description,
        affectsMobility: d.affectsMobility,
      }),
    ),
  ...EXTRA_FEELINGS,
];

function conditionToFeeling(
  condition: MuscleCondition,
): FeelingDef | undefined {
  // Check user-selectable feelings first (handles aliases like Cramping -> tight)
  const feeling = FEELINGS.find((f) => f.condition === condition);
  if (feeling) return feeling;
  // Fall back to the exhaustive condition display map
  const display = CONDITION_DISPLAY[condition];
  if (display && condition !== "healthy") {
    return {
      label: display.label,
      condition,
      accent: display.accent,
      description: display.description,
      affectsMobility: display.affectsMobility,
    };
  }
  return undefined;
}

/** Derive the "saved" feeling + severity from the current muscleState */
function stateToLocal(ms: MuscleState | null) {
  if (!ms || ms.condition === "healthy")
    return { feeling: null, severity: 0, isSystemState: false };
  const isSystemState = !CONDITION_DISPLAY[ms.condition].selectable;
  return {
    feeling: conditionToFeeling(ms.condition) ?? null,
    severity: ms.metrics.pain,
    isSystemState,
  };
}

// ============================================
// Severity Slider — track + thumb color matches the green-to-accent interpolation
// ============================================

function SeveritySlider({
  muscleId,
  accent,
  severity,
  onChange,
}: {
  muscleId: string;
  accent: string;
  severity: number;
  onChange: (v: number) => void;
}) {
  const t = severity / 10;
  const currentColor = lerpColor(accent, t);

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <label
          htmlFor={`severity-${muscleId}`}
          className="text-xs text-white/50"
        >
          Severity
        </label>
        <span className="text-xs font-medium" style={{ color: currentColor }}>
          {severity.toFixed(0)} / 10
        </span>
      </div>
      <div className="relative h-4 flex items-center">
        {/* Full track: green (mild) -> accent (severe) */}
        <div
          className="absolute inset-x-0 h-1.5 rounded-full"
          style={{
            background: `linear-gradient(to right, #22c55e, ${accent})`,
          }}
        />
        {/* Native range input (transparent, captures interaction) */}
        <input
          id={`severity-${muscleId}`}
          type="range"
          min={0}
          max={10}
          step={1}
          value={severity}
          onChange={(e) => onChange(Number(e.target.value))}
          className="severity-slider absolute inset-0 w-full cursor-pointer appearance-none bg-transparent"
          style={
            {
              "--thumb-color": currentColor,
            } as React.CSSProperties
          }
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-white/30">
        <span>Mild</span>
        <span>Severe</span>
      </div>
    </div>
  );
}

// ============================================
// Component
// ============================================

interface MuscleFeelingsP {
  muscleId: string;
  muscleState: MuscleState | null;
  bodyId: Id<"bodies">;
  onClose: () => void;
}

export function MuscleFeelingsPanel({
  muscleId,
  muscleState,
  bodyId,
  onClose,
}: MuscleFeelingsP) {
  const upsert = useMutation(api.muscles.upsert);
  const displayName = formatMuscleName(muscleId);
  const side = getSideLabel(muscleId);
  const group = getMuscleGroup(muscleId);
  const depth = getMuscleDepth(muscleId);

  // Local (uncommitted) state
  const [selectedFeeling, setSelectedFeeling] = useState<FeelingDef | null>(
    () => stateToLocal(muscleState).feeling,
  );
  const [severity, setSeverity] = useState<number>(
    () => stateToLocal(muscleState).severity,
  );

  // Track what's currently saved in DB to detect dirty state
  const savedRef = useRef(stateToLocal(muscleState));

  // Confirm animation
  const [justSaved, setJustSaved] = useState(false);

  // Sync when switching to a different muscle
  const prevMuscleIdRef = useRef(muscleId);
  useEffect(() => {
    if (muscleId !== prevMuscleIdRef.current) {
      prevMuscleIdRef.current = muscleId;
      const init = stateToLocal(muscleState);
      setSelectedFeeling(init.feeling);
      setSeverity(init.severity);
      savedRef.current = init;
      setJustSaved(false);
    }
  }, [muscleId, muscleState]);

  // Detect unsaved changes
  const isDirty =
    selectedFeeling?.label !== savedRef.current.feeling?.label ||
    severity !== savedRef.current.severity;

  const handleFeelingSelect = useCallback(
    (feeling: FeelingDef) => {
      if (selectedFeeling?.label === feeling.label) {
        // Toggle off
        setSelectedFeeling(null);
        setSeverity(0);
      } else {
        setSelectedFeeling(feeling);
        if (severity === 0) setSeverity(3);
      }
      setJustSaved(false);
    },
    [selectedFeeling, severity],
  );

  const handleSeverityChange = useCallback((value: number) => {
    setSeverity(value);
    setJustSaved(false);
  }, []);

  const handleConfirm = useCallback(() => {
    const condition: MuscleCondition = selectedFeeling?.condition ?? "healthy";
    const pain = selectedFeeling ? severity : 0;
    const strength = selectedFeeling ? 1 - pain * 0.06 : 1;
    const mobility = selectedFeeling?.affectsMobility ? 1 - pain * 0.04 : 1;

    upsert({
      bodyId,
      meshId: muscleId,
      condition,
      pain,
      strength: Math.max(0.4, strength),
      mobility: Math.max(0.6, mobility),
    });

    // Update saved snapshot
    savedRef.current = {
      feeling: selectedFeeling,
      severity,
      isSystemState: false,
    };
    setJustSaved(true);
  }, [bodyId, muscleId, upsert, selectedFeeling, severity]);

  const handleClear = useCallback(() => {
    setSelectedFeeling(null);
    setSeverity(0);

    upsert({
      bodyId,
      meshId: muscleId,
      condition: "healthy",
      pain: 0,
      strength: 1,
      mobility: 1,
    });

    savedRef.current = { feeling: null, severity: 0, isSystemState: false };
    setJustSaved(false);
  }, [bodyId, muscleId, upsert]);

  return (
    <div
      className="mosaic-panel pointer-events-auto w-72 p-4 text-white shadow-2xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            {displayName}
            {side && ` (${side})`}
          </h3>
          <div className="flex gap-2 text-xs text-white/60">
            {group && <span>{MUSCLE_GROUP_LABELS[group]}</span>}
            <span className="capitalize">{depth}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* How does it feel? */}
      <p className="mb-2 text-xs text-white/50">How does it feel?</p>

      {/* Feeling buttons grid */}
      <div className="mb-3 grid max-h-24 grid-cols-3 gap-1.5 overflow-y-auto">
        {FEELINGS.map((f) => {
          const isActive = selectedFeeling?.label === f.label;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => handleFeelingSelect(f)}
              className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                isActive
                  ? "ring-1 ring-white/30 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white/80"
              }`}
              style={
                isActive
                  ? { backgroundColor: `${f.accent}33`, color: f.accent }
                  : { backgroundColor: "rgba(255,255,255,0.05)" }
              }
              title={f.description}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Severity slider — shown when a feeling is selected */}
      {selectedFeeling && (
        <SeveritySlider
          muscleId={muscleId}
          accent={selectedFeeling.accent}
          severity={severity}
          onChange={handleSeverityChange}
        />
      )}

      {/* Action row: Confirm + Clear */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isDirty && !justSaved}
          className="flex-1 rounded px-2 py-1.5 text-xs font-medium transition-all"
          style={
            justSaved
              ? {
                  backgroundColor: "rgba(34,197,94,0.2)",
                  color: "#4ade80",
                }
              : isDirty
                ? {
                    background: selectedFeeling
                      ? `linear-gradient(135deg, ${selectedFeeling.accent}99, ${selectedFeeling.accent}66)`
                      : "rgba(59,130,246,0.5)",
                    color: "#fff",
                  }
                : {
                    backgroundColor: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.25)",
                  }
          }
        >
          {justSaved ? "Saved" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded bg-white/20 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/30 hover:text-white"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
