"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import type { GeneratedPlan } from "@/lib/generate-workout";
import { formatMuscleName } from "@/lib/muscle-utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface GeneratedExercisesPreviewProps {
  plan: GeneratedPlan;
  planId: Id<"workoutPlans">;
  onSaved: () => void;
  onRegenerate: () => void;
  onDismiss: () => void;
}

export function GeneratedExercisesPreview({
  plan,
  planId,
  onSaved,
  onRegenerate,
  onDismiss,
}: GeneratedExercisesPreviewProps) {
  const addExercise = useMutation(api.workouts.addExercise);
  const [saving, setSaving] = useState(false);

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      for (const ex of plan.exercises) {
        await addExercise({
          planId,
          name: ex.name,
          sets: ex.sets ?? undefined,
          reps: ex.reps ?? undefined,
          durationSecs: ex.durationSecs ?? undefined,
          weight: ex.weight ?? undefined,
          weightUnit: ex.weightUnit ?? undefined,
          notes: ex.notes ?? undefined,
          targetMeshIds: ex.targetMeshIds,
        });
      }
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Plan header */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
        <h4 className="text-xs font-semibold text-blue-400">{plan.title}</h4>
        {plan.notes && (
          <p className="mt-1 text-xs text-white/40">{plan.notes}</p>
        )}
        <p className="mt-1 text-xs text-white/30">
          {plan.exercises.length} exercises generated
        </p>
      </div>

      {/* Exercise list */}
      <div className="flex flex-col gap-2">
        {plan.exercises.map((ex, i) => {
          const summary: string[] = [];
          if (ex.sets && ex.reps) summary.push(`${ex.sets}x${ex.reps}`);
          else if (ex.sets) summary.push(`${ex.sets} sets`);
          else if (ex.reps) summary.push(`${ex.reps} reps`);
          if (ex.durationSecs) summary.push(`${ex.durationSecs}s`);
          if (ex.weight) summary.push(`${ex.weight}${ex.weightUnit ?? "kg"}`);

          const uniqueTargets = ex.targetMeshIds.filter(
            (id) => !id.endsWith("_1"),
          );

          return (
            <div
              key={`${ex.name}-${i}`}
              className="rounded-lg border border-white/5 bg-white/5 p-2.5"
            >
              <div className="flex items-start gap-2">
                {/* Image thumbnail */}
                {ex.imageUrl && (
                  <img
                    src={ex.imageUrl}
                    alt={ex.name}
                    className="h-10 w-10 shrink-0 rounded bg-white/10 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{ex.name}</span>
                  {summary.length > 0 && (
                    <span className="text-xs text-white/40">
                      {summary.join(" / ")}
                    </span>
                  )}
                </div>
              </div>

              {/* Target muscles */}
              {uniqueTargets.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {uniqueTargets.map((meshId) => (
                    <span
                      key={meshId}
                      className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400/70"
                    >
                      {formatMuscleName(meshId)}
                    </span>
                  ))}
                </div>
              )}

              {/* Notes / evidence reasoning */}
              {ex.notes && (
                <p className="mt-1.5 text-xs leading-relaxed text-white/30">
                  {ex.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onDismiss}
          disabled={saving}
          className="mosaic-btn flex-1 py-2 text-xs font-medium"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={saving}
          className="mosaic-btn flex-1 py-2 text-xs font-medium"
        >
          Regenerate
        </button>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saving}
          className="mosaic-btn-primary flex-1 py-2 text-xs font-medium"
        >
          {saving ? "Saving..." : "Save All"}
        </button>
      </div>
    </div>
  );
}
