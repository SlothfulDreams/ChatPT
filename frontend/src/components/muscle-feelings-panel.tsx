"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMuscleName, getSideLabel } from "@/lib/muscle-utils";
import type { MuscleCondition, MuscleState } from "@/types/muscle";
import { getMuscleDepth } from "@/types/muscle-depth";
import { getMuscleGroup, MUSCLE_GROUP_LABELS } from "@/types/muscle-groups";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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

const FEELINGS: FeelingDef[] = [
  {
    label: "Soreness",
    condition: "fatigued",
    accent: "#a855f7",
    description: "Dull ache",
  },
  {
    label: "Sharp Pain",
    condition: "strained",
    accent: "#ef4444",
    description: "Acute, sudden",
  },
  {
    label: "Stiffness",
    condition: "tight",
    accent: "#f97316",
    description: "Restricted movement",
    affectsMobility: true,
  },
  {
    label: "Numbness",
    condition: "knotted",
    accent: "#6366f1",
    description: "Loss of sensation",
  },
  {
    label: "Burning",
    condition: "inflamed",
    accent: "#f43f5e",
    description: "Hot, irritated",
  },
  {
    label: "Weakness",
    condition: "weak",
    accent: "#3b82f6",
    description: "Lack of strength",
  },
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

function conditionToFeeling(
  condition: MuscleCondition,
): FeelingDef | undefined {
  return FEELINGS.find((f) => f.condition === condition);
}

/** Derive the "saved" feeling + severity from the current muscleState */
function stateToLocal(ms: MuscleState | null) {
  if (!ms || ms.condition === "healthy") return { feeling: null, severity: 0 };
  return {
    feeling: conditionToFeeling(ms.condition) ?? null,
    severity: ms.metrics.pain,
  };
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
    savedRef.current = { feeling: selectedFeeling, severity };
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

    savedRef.current = { feeling: null, severity: 0 };
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
      <div className="mb-3 grid grid-cols-3 gap-1.5">
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
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <label
              htmlFor={`severity-${muscleId}`}
              className="text-xs text-white/50"
            >
              Severity
            </label>
            <span
              className="text-xs font-medium"
              style={{ color: selectedFeeling.accent }}
            >
              {severity.toFixed(0)} / 10
            </span>
          </div>
          <input
            id={`severity-${muscleId}`}
            type="range"
            min={0}
            max={10}
            step={1}
            value={severity}
            onChange={(e) => handleSeverityChange(Number(e.target.value))}
            className="w-full"
            style={{
              accentColor: selectedFeeling.accent,
              background: `linear-gradient(to right, #22c55e, ${selectedFeeling.accent})`,
              borderRadius: "4px",
              height: "6px",
            }}
          />
          <div className="mt-0.5 flex justify-between text-[10px] text-white/30">
            <span>Mild</span>
            <span>Severe</span>
          </div>
        </div>
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
