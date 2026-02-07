"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { formatMuscleName, getSideLabel } from "@/lib/muscle-utils";
import type { MuscleState } from "@/types/muscle";
import { getMuscleDepth } from "@/types/muscle-depth";
import { getMuscleGroup, MUSCLE_GROUP_LABELS } from "@/types/muscle-groups";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface MuscleDetailPanelProps {
  muscleId: string;
  muscleState: MuscleState | null;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CONDITION_BADGE_COLORS: Record<string, string> = {
  healthy: "bg-green-500/20 text-green-300",
  tight: "bg-yellow-500/20 text-yellow-300",
  knotted: "bg-orange-500/20 text-orange-300",
  strained: "bg-red-500/20 text-red-300",
  torn: "bg-red-600/30 text-red-200",
  recovering: "bg-blue-500/20 text-blue-300",
  inflamed: "bg-red-500/25 text-red-300",
  weak: "bg-amber-500/20 text-amber-300",
  fatigued: "bg-purple-500/20 text-purple-300",
};

function DiagnosisTimeline({ muscleDbId }: { muscleDbId: Id<"muscles"> }) {
  const history = useQuery(api.muscles.getHistory, { muscleId: muscleDbId });
  const [showAll, setShowAll] = useState(false);

  if (!history || history.length === 0) return null;

  const visible = showAll ? history : history.slice(0, 10);
  const hasMore = !showAll && history.length > 10;

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <span className="text-white/40 text-xs">Diagnosis History</span>
      <div className="mt-1.5 space-y-2">
        {visible.map((entry) => (
          <div
            key={entry._id}
            className="rounded-md bg-white/[0.03] px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {entry.condition && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${CONDITION_BADGE_COLORS[entry.condition] ?? "bg-white/10 text-white/60"}`}
                  >
                    {entry.condition}
                  </span>
                )}
                {entry.painLevel != null && (
                  <span className="text-[10px] text-white/40">
                    pain {entry.painLevel.toFixed(1)}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-white/30">
                {formatTimestamp(entry._creationTime)}
              </span>
            </div>
            {entry.notes && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-blue-200/50">
                {entry.notes}
              </p>
            )}
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1.5 w-full text-center text-[10px] text-white/30 hover:text-white/50 transition-colors"
        >
          Show {history.length - 10} more
        </button>
      )}
    </div>
  );
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
          {muscleState.id && (
            <DiagnosisTimeline muscleDbId={muscleState.id as Id<"muscles">} />
          )}
        </div>
      ) : (
        <p className="text-xs text-white/40">No data recorded</p>
      )}
    </div>
  );
}
