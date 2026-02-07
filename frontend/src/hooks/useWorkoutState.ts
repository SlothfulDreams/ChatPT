"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";

export function useWorkoutState() {
  const user = useQuery(api.users.current);

  const plans = useQuery(
    api.workouts.getPlans,
    user ? { userId: user._id } : "skip",
  );

  const [selectedPlanId, setSelectedPlanId] = useState<Id<"workoutPlans"> | null>(null);

  // Default to the first active plan if none selected
  const activePlan = plans?.find((p) => p.isActive) ?? null;
  const viewingPlanId = selectedPlanId ?? activePlan?._id ?? null;

  const exercises = useQuery(
    api.workouts.getExercises,
    viewingPlanId ? { planId: viewingPlanId } : "skip",
  );

  return {
    user,
    plans: plans ?? [],
    activePlan,
    selectedPlanId: viewingPlanId,
    setSelectedPlanId,
    exercises: exercises ?? [],
    isLoading: user === undefined || (user !== null && plans === undefined),
  };
}
