"use client";

import { formatMuscleName, getSideLabel } from "@/lib/muscle-utils";
import type { MuscleState } from "@/types/muscle";
import { getMuscleDepth } from "@/types/muscle-depth";
import { getMuscleGroup, MUSCLE_GROUP_LABELS } from "@/types/muscle-groups";

interface MuscleDetailPanelProps {
  muscleId: string;
  muscleState: MuscleState | null;
}

export function MuscleDetailPanel({
  muscleId,
  muscleState,
}: MuscleDetailPanelProps) {
  const group = getMuscleGroup(muscleId);
  const depth = getMuscleDepth(muscleId);
  const displayName = formatMuscleName(muscleId);

  const side = getSideLabel(muscleId);

  return (
    <div className="pointer-events-auto mosaic-panel w-72 p-4 text-white">
      <h3 className="mb-1 text-sm font-semibold">
        {displayName}
        {side && ` (${side})`}
      </h3>
      <div className="mb-3 flex gap-2 text-xs text-white/50">
        {group && <span>{MUSCLE_GROUP_LABELS[group]}</span>}
        <span className="capitalize">{depth}</span>
      </div>

      {muscleState ? (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-white/60">Condition</span>
            <span className="font-medium capitalize">
              {muscleState.condition}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Pain</span>
            <span className="font-medium">
              {muscleState.metrics.pain.toFixed(1)} / 10
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Strength</span>
            <span className="font-medium">
              {(muscleState.metrics.strength * 100).toFixed(0)}%
              {muscleState.lastStrengthValue != null &&
                ` (${muscleState.lastStrengthValue}${muscleState.lastStrengthUnit ?? ""})`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">ROM</span>
            <span className="font-medium">
              {(muscleState.metrics.mobility * 100).toFixed(0)}%
              {muscleState.lastRomDegrees != null &&
                ` (${muscleState.lastRomDegrees}deg)`}
            </span>
          </div>
          {muscleState.summary && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <span className="text-white/40">AI Assessment</span>
              <p className="mt-1 leading-relaxed text-blue-200/60">
                {muscleState.summary}
              </p>
            </div>
          )}
          {muscleState.notes && (
            <p className="mt-2 border-t border-white/10 pt-2 text-white/50">
              {muscleState.notes}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-white/40">No data recorded</p>
      )}
    </div>
  );
}
