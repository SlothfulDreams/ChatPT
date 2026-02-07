"use client";

import confetti from "canvas-confetti";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBodyState } from "@/hooks/useBodyState";
import { useWorkoutState } from "@/hooks/useWorkoutState";
import { type GeneratedPlan, generateWorkout } from "@/lib/generate-workout";
import { formatMuscleName } from "@/lib/muscle-utils";
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/types/muscle-groups";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { GeneratedExercisesPreview } from "./generated-exercises-preview";

type WorkoutView =
  | "plan-list"
  | "plan-detail"
  | "exercise-form"
  | "generate-config";

type WorkoutExercise = Doc<"workoutExercises">;
type WorkoutPlan = Doc<"workoutPlans">;

interface GenerateConfig {
  goals: string;
  durationMinutes: number;
  equipment: string[];
  focusGroups: MuscleGroup[];
}

const DEFAULT_CONFIG: GenerateConfig = {
  goals: "general fitness",
  durationMinutes: 45,
  equipment: [],
  focusGroups: [],
};

const GOAL_OPTIONS = [
  "rehabilitation",
  "flexibility",
  "strength",
  "endurance",
  "general fitness",
] as const;

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180] as const;

const EQUIPMENT_OPTIONS = [
  "dumbbells",
  "barbell",
  "kettlebell",
  "bands",
  "machine",
  "pull-up bar",
  "bench",
  "foam roller",
] as const;

const EQUIPMENT_ICONS: Record<string, string> = {
  dumbbells: "\u2742",
  barbell: "\u2505",
  kettlebell: "\u25C9",
  bands: "\u223F",
  machine: "\u2699",
  "pull-up bar": "\u2502",
  bench: "\u25AC",
  "foam roller": "\u25CB",
};

const FOCUS_REGIONS: { label: string; groups: MuscleGroup[] }[] = [
  {
    label: "Upper Body",
    groups: [
      "neck",
      "chest",
      "shoulders",
      "rotator_cuff",
      "upper_back",
      "biceps",
      "triceps",
      "forearms",
    ],
  },
  { label: "Core", groups: ["core", "lower_back", "hip_flexors"] },
  {
    label: "Lower Body",
    groups: ["glutes", "quads", "hamstrings", "adductors", "calves", "shins"],
  },
];

interface WorkoutPanelProps {
  isWorkoutMode: boolean;
  onSetWorkoutMode: (mode: boolean) => void;
  workoutTargetMeshIds: Set<string>;
  onWorkoutTargetMeshIdsChange: (ids: Set<string>) => void;
  onHoverExercise: (meshIds: string[] | null) => void;
  onClose: () => void;
  activeGroups: Set<MuscleGroup>;
}

export function WorkoutPanel({
  isWorkoutMode,
  onSetWorkoutMode,
  workoutTargetMeshIds,
  onWorkoutTargetMeshIdsChange,
  onHoverExercise,
  onClose,
  activeGroups,
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
  const [generateConfig, setGenerateConfig] =
    useState<GenerateConfig>(DEFAULT_CONFIG);
  const [focusExpanded, setFocusExpanded] = useState(false);

  const { body, muscleStates } = useBodyState();

  // Mutations
  const createPlan = useMutation(api.workouts.createPlan);
  const updatePlan = useMutation(api.workouts.updatePlan);
  const deletePlan = useMutation(api.workouts.deletePlan);
  const addExercise = useMutation(api.workouts.addExercise);
  const updateExercise = useMutation(api.workouts.updateExercise);
  const deleteExercise = useMutation(api.workouts.deleteExercise);
  const reorderExercises = useMutation(api.workouts.reorderExercises);
  const toggleComplete = useMutation(api.workouts.toggleExerciseComplete);

  // Drag-to-reorder state
  const [draggedExId, setDraggedExId] = useState<Id<"workoutExercises"> | null>(
    null,
  );
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const handleExDragStart = useCallback(
    (exerciseId: Id<"workoutExercises">) => {
      setDraggedExId(exerciseId);
    },
    [],
  );

  const handleExDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetIdx(idx);
  }, []);

  const handleExDrop = useCallback(
    (targetIdx: number) => {
      if (draggedExId === null || !selectedPlanId) return;
      const draggedIdx = exercises.findIndex((e) => e._id === draggedExId);
      if (draggedIdx === -1 || draggedIdx === targetIdx) {
        setDraggedExId(null);
        setDropTargetIdx(null);
        return;
      }
      const newOrder = [...exercises];
      const [dragged] = newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, dragged);
      reorderExercises({
        planId: selectedPlanId,
        exerciseIds: newOrder.map((e) => e._id),
      });
      setDraggedExId(null);
      setDropTargetIdx(null);
    },
    [draggedExId, selectedPlanId, exercises, reorderExercises],
  );

  const handleExDragEnd = useCallback(() => {
    setDraggedExId(null);
    setDropTargetIdx(null);
    dragCounter.current = 0;
  }, []);

  const currentPlan = plans.find((p) => p._id === selectedPlanId) ?? null;
  const completedCount = exercises.filter((e) => e.completed).length;
  const isWorkoutComplete =
    completedCount === exercises.length && exercises.length > 0;

  // Fire confetti once when the user completes the last exercise
  const prevCompletedRef = useRef(completedCount);
  const prevLengthRef = useRef(exercises.length);
  useEffect(() => {
    const prevCompleted = prevCompletedRef.current;
    const prevLength = prevLengthRef.current;
    prevCompletedRef.current = completedCount;
    prevLengthRef.current = exercises.length;

    // Only fire when exercise list didn't change (not a data load / remount)
    // and completed count just reached the total
    if (
      isWorkoutComplete &&
      prevCompleted < exercises.length &&
      prevLength === exercises.length
    ) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        angle: 120,
      });
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        angle: 60,
      });
    }
  }, [completedCount, isWorkoutComplete, exercises.length]);

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

  const handleOpenGenerateConfig = useCallback(() => {
    setGenerateConfig((prev) => ({
      ...prev,
      focusGroups: activeGroups.size > 0 ? [...activeGroups] : prev.focusGroups,
    }));
    setFocusExpanded(false);
    setView("generate-config");
  }, [activeGroups]);

  const handleBack = useCallback(() => {
    if (view === "exercise-form") {
      handleCancelExercise();
    } else if (view === "generate-config") {
      setView("plan-detail");
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

  const handleRunGeneration = useCallback(async () => {
    if (!selectedPlanId) return;
    setView("plan-detail");
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
        goals: generateConfig.goals,
        durationMinutes: generateConfig.durationMinutes,
        equipment: generateConfig.equipment,
        focusGroups: generateConfig.focusGroups,
      });

      setGeneratedPlan(result);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Generation failed",
      );
    } finally {
      setGenerating(false);
    }
  }, [selectedPlanId, muscleStates, body, generateConfig]);

  // Deduplicate bilateral pairs for display
  const uniqueTargets = [...workoutTargetMeshIds].filter(
    (id) => !id.endsWith("_1"),
  );

  // ---- Render ----

  if (isLoading || !user) {
    return (
      <div className="pointer-events-auto mosaic-panel w-full p-4 text-white">
        <p className="text-xs text-white/40">Loading...</p>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto mosaic-panel animate-slide-in-left flex min-h-0 w-full shrink flex-col overflow-hidden text-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        {view !== "plan-list" && (
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-white/50 transition-colors hover:text-white"
            aria-label="Go back"
          >
            &larr;
          </button>
        )}
        <h3 className="flex-1 text-sm font-semibold">
          {view === "plan-list" && "Workout Plans"}
          {view === "plan-detail" && (currentPlan?.title ?? "Plan")}
          {view === "exercise-form" &&
            (editingExerciseId ? "Edit Exercise" : "Add Exercise")}
          {view === "generate-config" && "Generate Workout"}
        </h3>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close panel"
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
                className="flex-1 rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
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
              <p className="py-4 text-center text-xs text-white/50">
                No workout plans yet
              </p>
            ) : (
              plans.map((plan) => (
                <PlanCard
                  key={plan._id}
                  plan={plan}
                  isComplete={plan._id === selectedPlanId && isWorkoutComplete}
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
                {isWorkoutComplete && (
                  <div className="mt-2 animate-fade-in rounded-lg bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-3 py-2 text-center">
                    <span className="text-xs font-semibold text-emerald-400">
                      &#x2714; Workout Complete!
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Exercise list */}
            {exercises.length === 0 ? (
              <p className="py-3 text-center text-xs text-white/50">
                No exercises yet
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {exercises.map((exercise, idx) => (
                  <ExerciseRow
                    key={exercise._id}
                    exercise={exercise}
                    isDragging={draggedExId === exercise._id}
                    isDropTarget={dropTargetIdx === idx}
                    onDragStart={() => handleExDragStart(exercise._id)}
                    onDragOver={(e) => handleExDragOver(e, idx)}
                    onDrop={() => handleExDrop(idx)}
                    onDragEnd={handleExDragEnd}
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
            {!generating && (
              <button
                type="button"
                onClick={handleOpenGenerateConfig}
                className="w-full rounded border border-blue-500/20 bg-blue-500/10 py-2 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
              >
                Generate with AI
              </button>
            )}

            {/* Generation loading */}
            {generating && (
              <div className="animate-fade-up mosaic-section relative overflow-hidden border-blue-500/15">
                {/* Pulsing progress bar */}
                <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
                  <div className="mosaic-progress h-full w-full animate-pulse" />
                </div>
                <div className="flex flex-col items-center gap-2.5 pt-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                    Generating workout
                    <span className="inline-flex gap-px text-blue-400">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    <span className="mosaic-tag rounded-full px-2 py-0.5 text-xs">
                      {generateConfig.goals}
                    </span>
                    <span className="mosaic-tag rounded-full px-2 py-0.5 text-xs">
                      {generateConfig.durationMinutes}min
                    </span>
                    {generateConfig.equipment.length > 0 && (
                      <span className="mosaic-tag rounded-full px-2 py-0.5 text-xs">
                        {generateConfig.equipment.length} equipment
                      </span>
                    )}
                    {generateConfig.focusGroups.length > 0 && (
                      <span className="mosaic-tag rounded-full px-2 py-0.5 text-xs">
                        {generateConfig.focusGroups.length} focus areas
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

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
                onRegenerate={handleOpenGenerateConfig}
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
                className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
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
                  className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
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
                  className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
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
                  className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
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
                    className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
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
                className="w-full resize-none rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
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
                <p className="text-xs text-white/50">No muscles selected</p>
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

        {/* ============ GENERATE CONFIG ============ */}
        {view === "generate-config" && (
          <div className="animate-fade-up flex flex-col gap-3">
            {/* Goal */}
            <div
              className="mosaic-section animate-fade-up"
              style={{ animationDelay: "0ms" }}
            >
              <div className="mosaic-section-label">Goal</div>
              <div className="flex flex-wrap gap-1.5">
                {GOAL_OPTIONS.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() =>
                      setGenerateConfig((prev) => ({ ...prev, goals: goal }))
                    }
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      generateConfig.goals === goal
                        ? "mosaic-chip-active"
                        : "mosaic-chip"
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div
              className="mosaic-section animate-fade-up"
              style={{ animationDelay: "60ms" }}
            >
              <div className="mosaic-section-label">Duration</div>
              <div className="grid grid-cols-4 gap-1.5">
                {DURATION_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() =>
                      setGenerateConfig((prev) => ({
                        ...prev,
                        durationMinutes: mins,
                      }))
                    }
                    className={`text-center ${
                      generateConfig.durationMinutes === mins
                        ? "mosaic-chip-active"
                        : "mosaic-chip"
                    }`}
                  >
                    {mins >= 60
                      ? `${mins % 60 === 0 ? mins / 60 : (mins / 60).toFixed(1)}hr`
                      : `${mins}m`}
                  </button>
                ))}
              </div>
            </div>

            {/* Equipment */}
            <div
              className="mosaic-section animate-fade-up"
              style={{ animationDelay: "120ms" }}
            >
              <div className="mosaic-section-label">Equipment</div>
              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENT_OPTIONS.map((item) => {
                  const isSelected = generateConfig.equipment.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() =>
                        setGenerateConfig((prev) => ({
                          ...prev,
                          equipment: isSelected
                            ? prev.equipment.filter((e) => e !== item)
                            : [...prev.equipment, item],
                        }))
                      }
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        isSelected ? "mosaic-chip-active" : "mosaic-chip"
                      }`}
                    >
                      <span className="mr-1 opacity-60">
                        {EQUIPMENT_ICONS[item]}
                      </span>
                      {item}
                    </button>
                  );
                })}
              </div>
              {generateConfig.equipment.length === 0 && (
                <span className="mt-1.5 inline-block rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/30">
                  Bodyweight only
                </span>
              )}
            </div>

            {/* Focus Areas */}
            <div
              className="mosaic-section animate-fade-up"
              style={{ animationDelay: "180ms" }}
            >
              <button
                type="button"
                onClick={() => setFocusExpanded((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <div className="mosaic-section-label mb-0">
                  Focus Areas
                  {generateConfig.focusGroups.length > 0 && (
                    <span className="ml-1 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-400">
                      {generateConfig.focusGroups.length}
                    </span>
                  )}
                </div>
                <svg
                  className={`h-3.5 w-3.5 text-white/30 transition-transform ${focusExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {!focusExpanded && generateConfig.focusGroups.length === 0 && (
                <span className="mt-1.5 inline-block rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/30">
                  Full body
                </span>
              )}

              {!focusExpanded && generateConfig.focusGroups.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {generateConfig.focusGroups.map((g) => (
                    <span
                      key={g}
                      className="mosaic-tag rounded-full px-2 py-0.5 text-xs"
                    >
                      {MUSCLE_GROUP_LABELS[g]}
                    </span>
                  ))}
                </div>
              )}

              {focusExpanded && (
                <div className="mt-2 flex flex-col gap-3">
                  {FOCUS_REGIONS.map((region) => (
                    <div key={region.label}>
                      <p className="mb-1.5 text-xs font-medium text-white/55">
                        {region.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {region.groups.map((group) => {
                          const isSelected =
                            generateConfig.focusGroups.includes(group);
                          return (
                            <button
                              key={group}
                              type="button"
                              onClick={() =>
                                setGenerateConfig((prev) => ({
                                  ...prev,
                                  focusGroups: isSelected
                                    ? prev.focusGroups.filter(
                                        (g) => g !== group,
                                      )
                                    : [...prev.focusGroups, group],
                                }))
                              }
                              className={`rounded-full px-2.5 py-1 text-xs ${
                                isSelected
                                  ? "mosaic-chip-active"
                                  : "mosaic-chip"
                              }`}
                            >
                              {MUSCLE_GROUP_LABELS[group]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {generateConfig.focusGroups.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setGenerateConfig((prev) => ({
                          ...prev,
                          focusGroups: [],
                        }))
                      }
                      className="self-start text-xs text-white/40 transition-colors hover:text-white/60"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div
              className="flex flex-col items-center gap-2 animate-fade-up"
              style={{ animationDelay: "240ms" }}
            >
              <button
                type="button"
                onClick={handleRunGeneration}
                className="mosaic-btn-generate flex items-center justify-center gap-2"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                  />
                </svg>
                Generate Workout
              </button>
              <button
                type="button"
                onClick={() => setView("plan-detail")}
                className="text-xs text-white/40 transition-colors hover:text-white/60"
              >
                Cancel
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
  isComplete,
  onSelect,
  onDelete,
  onToggleActive,
}: {
  plan: WorkoutPlan;
  isComplete: boolean;
  onSelect: (id: Id<"workoutPlans">) => void;
  onDelete: (id: Id<"workoutPlans">) => void;
  onToggleActive: (plan: WorkoutPlan) => void;
}) {
  return (
    <div
      className={`group cursor-pointer rounded-lg border p-3 transition-colors hover:bg-white/10 ${
        plan.isActive
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-white/5 bg-white/5"
      }`}
      onClick={() => onSelect(plan._id)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(plan._id)}
    >
      <div className="flex items-center gap-2">
        {plan.isActive && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        )}
        <span className="flex-1 text-xs font-medium">{plan.title}</span>
        {isComplete && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            &#x2714; Done
          </span>
        )}
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
      {plan.notes && <p className="mt-1 text-xs text-white/50">{plan.notes}</p>}
    </div>
  );
}

function ExerciseRow({
  exercise,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleComplete,
  onEdit,
  onDelete,
  onHover,
}: {
  exercise: WorkoutExercise;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
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
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5 ${
        isDragging ? "opacity-30" : ""
      } ${isDropTarget && !isDragging ? "border-t border-blue-400/50" : ""}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Drag handle */}
      <span className="shrink-0 cursor-grab text-[10px] text-white/20 transition-colors group-hover:text-white/40 active:cursor-grabbing">
        &#x2630;
      </span>

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
          <span className="text-xs leading-none">&#x2714;</span>
        )}
      </button>

      {/* Info */}
      <div className="min-w-0 flex-1">
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
