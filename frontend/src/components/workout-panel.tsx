"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { useBodyState } from "@/hooks/useBodyState";
import { useWorkoutState } from "@/hooks/useWorkoutState";
import { type GeneratedPlan, generateWorkout } from "@/lib/generate-workout";
import { formatMuscleName } from "@/lib/muscle-utils";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { GeneratedExercisesPreview } from "./generated-exercises-preview";

type WorkoutView = "plan-list" | "plan-detail" | "exercise-form";

type WorkoutExercise = Doc<"workoutExercises">;
type WorkoutPlan = Doc<"workoutPlans">;

interface WorkoutPanelProps {
  isWorkoutMode: boolean;
  onSetWorkoutMode: (mode: boolean) => void;
  workoutTargetMeshIds: Set<string>;
  onWorkoutTargetMeshIdsChange: (ids: Set<string>) => void;
  onHoverExercise: (meshIds: string[] | null) => void;
  onClose: () => void;
}

export function WorkoutPanel({
  isWorkoutMode,
  onSetWorkoutMode,
  workoutTargetMeshIds,
  onWorkoutTargetMeshIdsChange,
  onHoverExercise,
  onClose,
}: WorkoutPanelProps) {
  const {
    user,
    plans,
    selectedPlanId,
    setSelectedPlanId,
    exercises,
    isLoading,
  } = useWorkoutState();

  const [view, setView] = useState<WorkoutView>("plan-list");
  const [newPlanTitle, setNewPlanTitle] = useState("");

  // Exercise form state
  const [exName, setExName] = useState("");
  const [exSets, setExSets] = useState("");
  const [exReps, setExReps] = useState("");
  const [exDuration, setExDuration] = useState("");
  const [exWeight, setExWeight] = useState("");
  const [exWeightUnit, setExWeightUnit] = useState("kg");
  const [exNotes, setExNotes] = useState("");
  const [editingExerciseId, setEditingExerciseId] =
    useState<Id<"workoutExercises"> | null>(null);

  // AI generation state
  const [generating, setGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(
    null,
  );
  const [generateError, setGenerateError] = useState<string | null>(null);

  const { body, muscleStates } = useBodyState();

  // Mutations
  const createPlan = useMutation(api.workouts.createPlan);
  const updatePlan = useMutation(api.workouts.updatePlan);
  const deletePlan = useMutation(api.workouts.deletePlan);
  const addExercise = useMutation(api.workouts.addExercise);
  const updateExercise = useMutation(api.workouts.updateExercise);
  const deleteExercise = useMutation(api.workouts.deleteExercise);
  const toggleComplete = useMutation(api.workouts.toggleExerciseComplete);

  const currentPlan = plans.find((p) => p._id === selectedPlanId) ?? null;
  const completedCount = exercises.filter((e) => e.completed).length;

  // ---- Handlers ----

  const handleCreatePlan = useCallback(async () => {
    if (!user || !newPlanTitle.trim()) return;
    const id = await createPlan({
      userId: user._id,
      title: newPlanTitle.trim(),
      isActive: plans.length === 0,
    });
    setNewPlanTitle("");
    setSelectedPlanId(id);
    setView("plan-detail");
  }, [user, newPlanTitle, plans.length, createPlan, setSelectedPlanId]);

  const handleSelectPlan = useCallback(
    (planId: Id<"workoutPlans">) => {
      setSelectedPlanId(planId);
      setView("plan-detail");
    },
    [setSelectedPlanId],
  );

  const handleDeletePlan = useCallback(
    async (planId: Id<"workoutPlans">) => {
      await deletePlan({ planId });
      if (selectedPlanId === planId) {
        setSelectedPlanId(null);
        setView("plan-list");
      }
    },
    [deletePlan, selectedPlanId, setSelectedPlanId],
  );

  const handleToggleActive = useCallback(
    async (plan: WorkoutPlan) => {
      await updatePlan({
        planId: plan._id,
        isActive: !plan.isActive,
      });
    },
    [updatePlan],
  );

  const resetExerciseForm = useCallback(() => {
    setExName("");
    setExSets("");
    setExReps("");
    setExDuration("");
    setExWeight("");
    setExWeightUnit("kg");
    setExNotes("");
    setEditingExerciseId(null);
    onWorkoutTargetMeshIdsChange(new Set());
    onSetWorkoutMode(false);
  }, [onWorkoutTargetMeshIdsChange, onSetWorkoutMode]);

  const handleOpenExerciseForm = useCallback(
    (exercise?: WorkoutExercise) => {
      if (exercise) {
        setExName(exercise.name);
        setExSets(exercise.sets?.toString() ?? "");
        setExReps(exercise.reps?.toString() ?? "");
        setExDuration(exercise.durationSecs?.toString() ?? "");
        setExWeight(exercise.weight?.toString() ?? "");
        setExWeightUnit(exercise.weightUnit ?? "kg");
        setExNotes(exercise.notes ?? "");
        setEditingExerciseId(exercise._id);
        onWorkoutTargetMeshIdsChange(new Set(exercise.targetMeshIds));
      } else {
        resetExerciseForm();
      }
      onSetWorkoutMode(true);
      setView("exercise-form");
    },
    [onSetWorkoutMode, onWorkoutTargetMeshIdsChange, resetExerciseForm],
  );

  const handleSaveExercise = useCallback(async () => {
    if (!selectedPlanId || !exName.trim()) return;

    const targetMeshIds = [...workoutTargetMeshIds];
    const sets = exSets ? Number(exSets) : undefined;
    const reps = exReps ? Number(exReps) : undefined;
    const durationSecs = exDuration ? Number(exDuration) : undefined;
    const weight = exWeight ? Number(exWeight) : undefined;
    const notes = exNotes.trim() || undefined;

    if (editingExerciseId) {
      await updateExercise({
        exerciseId: editingExerciseId,
        name: exName.trim(),
        sets,
        reps,
        durationSecs,
        weight,
        weightUnit: weight ? exWeightUnit : undefined,
        notes,
        targetMeshIds,
      });
    } else {
      await addExercise({
        planId: selectedPlanId,
        name: exName.trim(),
        sets,
        reps,
        durationSecs,
        weight,
        weightUnit: weight ? exWeightUnit : undefined,
        notes,
        targetMeshIds,
      });
    }

    resetExerciseForm();
    setView("plan-detail");
  }, [
    selectedPlanId,
    exName,
    exSets,
    exReps,
    exDuration,
    exWeight,
    exWeightUnit,
    exNotes,
    workoutTargetMeshIds,
    editingExerciseId,
    addExercise,
    updateExercise,
    resetExerciseForm,
  ]);

  const handleCancelExercise = useCallback(() => {
    resetExerciseForm();
    setView("plan-detail");
  }, [resetExerciseForm]);

  const handleBack = useCallback(() => {
    if (view === "exercise-form") {
      handleCancelExercise();
    } else if (view === "plan-detail") {
      setView("plan-list");
      onHoverExercise(null);
      onSetWorkoutMode(false);
      onWorkoutTargetMeshIdsChange(new Set());
    }
  }, [
    view,
    handleCancelExercise,
    onHoverExercise,
    onSetWorkoutMode,
    onWorkoutTargetMeshIdsChange,
  ]);

  const handleClose = useCallback(() => {
    resetExerciseForm();
    onHoverExercise(null);
    onClose();
  }, [resetExerciseForm, onHoverExercise, onClose]);

  const handleRemoveTarget = useCallback(
    (meshId: string) => {
      const next = new Set(workoutTargetMeshIds);
      next.delete(meshId);
      // Also remove bilateral pair
      const pair = meshId.endsWith("_1") ? meshId.slice(0, -2) : `${meshId}_1`;
      next.delete(pair);
      onWorkoutTargetMeshIdsChange(next);
    },
    [workoutTargetMeshIds, onWorkoutTargetMeshIdsChange],
  );

  const handleGenerate = useCallback(async () => {
    if (!selectedPlanId) return;
    setGenerating(true);
    setGenerateError(null);
    setGeneratedPlan(null);

    try {
      // Build muscle states for the API
      const apiMuscleStates = Object.entries(muscleStates)
        .filter(([, s]) => s.condition !== "healthy" || s.metrics.pain > 0)
        .map(([meshId, s]) => ({
          meshId,
          condition: s.condition,
          pain: s.metrics.pain,
          strength: s.metrics.strength,
          mobility: s.metrics.mobility,
        }));

      const availableMeshIds = Object.keys(muscleStates);

      // Placeholder RAG summaries until the RAG agent is built
      const ragSummaries = [
        "For general fitness: 2-4 sets of 8-15 reps per exercise, 60-90s rest between sets. Include both compound and isolation movements.",
        "Begin each session with 5-10 minutes of dynamic warm-up targeting the primary muscle groups. Include mobility work for any restricted areas.",
        "Progressive overload principle: gradually increase load, volume, or intensity over time. Start conservatively for deconditioned or injured muscles.",
        "For rehabilitation: focus on controlled eccentric movements, lighter loads (40-60% 1RM), higher reps (12-20), and full range of motion.",
      ];

      const result = await generateWorkout({
        ragSummaries,
        muscleStates: apiMuscleStates,
        availableMeshIds,
        sex: body?.sex ?? undefined,
        goals: "general fitness",
        durationMinutes: 45,
        equipment: [],
      });

      setGeneratedPlan(result);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Generation failed",
      );
    } finally {
      setGenerating(false);
    }
  }, [selectedPlanId, muscleStates, body]);

  // Deduplicate bilateral pairs for display
  const uniqueTargets = [...workoutTargetMeshIds].filter(
    (id) => !id.endsWith("_1"),
  );

  // ---- Render ----

  if (isLoading || !user) {
    return (
      <div className="pointer-events-auto mosaic-panel w-96 p-4 text-white">
        <p className="text-xs text-white/40">Loading...</p>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto mosaic-panel flex min-h-0 w-96 shrink flex-col text-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        {view !== "plan-list" && (
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-white/50 transition-colors hover:text-white"
          >
            &larr;
          </button>
        )}
        <h3 className="flex-1 text-sm font-semibold">
          {view === "plan-list" && "Workout Plans"}
          {view === "plan-detail" && (currentPlan?.title ?? "Plan")}
          {view === "exercise-form" &&
            (editingExerciseId ? "Edit Exercise" : "Add Exercise")}
        </h3>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* ============ PLAN LIST ============ */}
        {view === "plan-list" && (
          <div className="flex flex-col gap-3">
            {/* Create plan */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newPlanTitle}
                onChange={(e) => setNewPlanTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreatePlan()}
                placeholder="New plan name..."
                className="flex-1 rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              <button
                type="button"
                onClick={handleCreatePlan}
                disabled={!newPlanTitle.trim()}
                className="mosaic-btn-primary px-3 py-1.5 text-xs font-medium"
              >
                Create
              </button>
            </div>

            {plans.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/30">
                No workout plans yet
              </p>
            ) : (
              plans.map((plan) => (
                <PlanCard
                  key={plan._id}
                  plan={plan}
                  onSelect={handleSelectPlan}
                  onDelete={handleDeletePlan}
                  onToggleActive={handleToggleActive}
                />
              ))
            )}
          </div>
        )}

        {/* ============ PLAN DETAIL ============ */}
        {view === "plan-detail" && currentPlan && (
          <div className="flex flex-col gap-3">
            {/* Active toggle */}
            <button
              type="button"
              onClick={() => handleToggleActive(currentPlan)}
              className={`self-start rounded-full px-2.5 py-1 text-xs transition-all ${
                currentPlan.isActive
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              {currentPlan.isActive ? "Active" : "Set Active"}
            </button>

            {/* Progress */}
            {exercises.length > 0 && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-white/50">
                  <span>Progress</span>
                  <span>
                    {completedCount}/{exercises.length}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="mosaic-progress"
                    style={{
                      width: `${(completedCount / exercises.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Exercise list */}
            {exercises.length === 0 ? (
              <p className="py-3 text-center text-xs text-white/30">
                No exercises yet
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {exercises.map((exercise) => (
                  <ExerciseRow
                    key={exercise._id}
                    exercise={exercise}
                    onToggleComplete={() =>
                      toggleComplete({ exerciseId: exercise._id })
                    }
                    onEdit={() => handleOpenExerciseForm(exercise)}
                    onDelete={() =>
                      deleteExercise({ exerciseId: exercise._id })
                    }
                    onHover={(hovering) =>
                      onHoverExercise(
                        hovering && exercise.targetMeshIds.length > 0
                          ? exercise.targetMeshIds
                          : null,
                      )
                    }
                  />
                ))}
              </div>
            )}

            {/* Add exercise button */}
            <button
              type="button"
              onClick={() => handleOpenExerciseForm()}
              className="mosaic-btn-primary w-full py-2 text-xs font-medium"
            >
              + Add Exercise
            </button>

            {/* Generate with AI */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="w-full rounded border border-blue-500/20 bg-blue-500/10 py-2 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate with AI"}
            </button>

            {/* Generation error */}
            {generateError && (
              <p className="text-xs text-red-400">{generateError}</p>
            )}

            {/* Generated exercises preview */}
            {generatedPlan && selectedPlanId && (
              <GeneratedExercisesPreview
                plan={generatedPlan}
                planId={selectedPlanId}
                onSaved={() => setGeneratedPlan(null)}
                onRegenerate={handleGenerate}
                onDismiss={() => setGeneratedPlan(null)}
              />
            )}
          </div>
        )}

        {/* ============ EXERCISE FORM ============ */}
        {view === "exercise-form" && (
          <div className="flex flex-col gap-3">
            {/* Name */}
            <div>
              <label className="mb-1 block text-xs text-white/60">Name</label>
              <input
                type="text"
                value={exName}
                onChange={(e) => setExName(e.target.value)}
                placeholder="e.g. Bench Press"
                className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>

            {/* Sets / Reps */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-white/60">Sets</label>
                <input
                  type="number"
                  value={exSets}
                  onChange={(e) => setExSets(e.target.value)}
                  placeholder="3"
                  min="0"
                  className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/60">Reps</label>
                <input
                  type="number"
                  value={exReps}
                  onChange={(e) => setExReps(e.target.value)}
                  placeholder="12"
                  min="0"
                  className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
            </div>

            {/* Duration / Weight */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-white/60">
                  Duration (sec)
                </label>
                <input
                  type="number"
                  value={exDuration}
                  onChange={(e) => setExDuration(e.target.value)}
                  placeholder="60"
                  min="0"
                  className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/60">
                  Weight
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={exWeight}
                    onChange={(e) => setExWeight(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setExWeightUnit((u) => (u === "kg" ? "lb" : "kg"))
                    }
                    className="shrink-0 rounded bg-white/10 px-2 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/20"
                  >
                    {exWeightUnit}
                  </button>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-xs text-white/60">Notes</label>
              <textarea
                value={exNotes}
                onChange={(e) => setExNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="w-full resize-none rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>

            {/* Target Muscles */}
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Target Muscles
              </label>
              {isWorkoutMode && (
                <p className="mb-2 text-xs text-blue-400/70">
                  Click muscles on the 3D model to add targets
                </p>
              )}
              {uniqueTargets.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {uniqueTargets.map((meshId) => (
                    <span
                      key={meshId}
                      className="mosaic-tag inline-flex items-center gap-1 px-2 py-0.5 text-xs"
                    >
                      {formatMuscleName(meshId)}
                      <button
                        type="button"
                        onClick={() => handleRemoveTarget(meshId)}
                        className="text-blue-300/50 hover:text-blue-300"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/30">No muscles selected</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelExercise}
                className="mosaic-btn flex-1 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveExercise}
                disabled={!exName.trim()}
                className="mosaic-btn-primary flex-1 py-2 text-xs font-medium"
              >
                {editingExerciseId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function PlanCard({
  plan,
  onSelect,
  onDelete,
  onToggleActive,
}: {
  plan: WorkoutPlan;
  onSelect: (id: Id<"workoutPlans">) => void;
  onDelete: (id: Id<"workoutPlans">) => void;
  onToggleActive: (plan: WorkoutPlan) => void;
}) {
  return (
    <div
      className="group cursor-pointer rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:bg-white/10"
      onClick={() => onSelect(plan._id)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(plan._id)}
    >
      <div className="flex items-center gap-2">
        {plan.isActive && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        )}
        <span className="flex-1 text-xs font-medium">{plan.title}</span>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive(plan);
            }}
            className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
              plan.isActive
                ? "text-emerald-400/50 hover:text-emerald-400"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {plan.isActive ? "Active" : "Activate"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(plan._id);
            }}
            className="rounded px-1.5 py-0.5 text-xs text-red-400/50 transition-colors hover:text-red-400"
          >
            Del
          </button>
        </div>
      </div>
      {plan.notes && <p className="mt-1 text-xs text-white/30">{plan.notes}</p>}
    </div>
  );
}

function ExerciseRow({
  exercise,
  onToggleComplete,
  onEdit,
  onDelete,
  onHover,
}: {
  exercise: WorkoutExercise;
  onToggleComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const summary: string[] = [];
  if (exercise.sets && exercise.reps) {
    summary.push(`${exercise.sets}x${exercise.reps}`);
  } else if (exercise.sets) {
    summary.push(`${exercise.sets} sets`);
  } else if (exercise.reps) {
    summary.push(`${exercise.reps} reps`);
  }
  if (exercise.durationSecs) {
    summary.push(`${exercise.durationSecs}s`);
  }
  if (exercise.weight) {
    summary.push(`${exercise.weight}${exercise.weightUnit ?? "kg"}`);
  }

  return (
    <div
      className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggleComplete}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          exercise.completed
            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
            : "border-white/20 hover:border-white/40"
        }`}
      >
        {exercise.completed && (
          <span className="text-xs leading-none">&check;</span>
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <span
          className={`block truncate text-xs font-medium ${
            exercise.completed ? "text-white/30 line-through" : ""
          }`}
        >
          {exercise.name}
        </span>
        {summary.length > 0 && (
          <span className="text-xs text-white/40">{summary.join(" / ")}</span>
        )}
      </div>

      {/* Target count badge */}
      {exercise.targetMeshIds.length > 0 && (
        <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-xs text-blue-400/70">
          {/* Count unique (non _1) targets */}
          {exercise.targetMeshIds.filter((id) => !id.endsWith("_1")).length}
        </span>
      )}

      {/* Actions */}
      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="rounded px-1 py-0.5 text-xs text-white/30 transition-colors hover:text-white/60"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded px-1 py-0.5 text-xs text-red-400/50 transition-colors hover:text-red-400"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
