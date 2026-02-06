"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import type { MuscleState, MuscleStates } from "@/types/muscle";
import { createDefaultMuscleState } from "@/types/muscle";
import { api } from "../../convex/_generated/api";

export function useBodyState() {
  const user = useQuery(api.users.current);
  const body = useQuery(
    api.body.getByUser,
    user ? { userId: user._id } : "skip",
  );
  const muscles = useQuery(
    api.muscles.getByBody,
    body ? { bodyId: body._id } : "skip",
  );
  const allKnots = useQuery(
    api.knots.getByBody,
    body ? { bodyId: body._id } : "skip",
  );

  const muscleStates: MuscleStates = useMemo(() => {
    if (!muscles) return {};

    const states: MuscleStates = {};
    for (const m of muscles) {
      const muscleKnots = allKnots?.filter((k) => k.muscleId === m._id) ?? [];
      const state: MuscleState = {
        id: m._id,
        condition: m.condition as MuscleState["condition"],
        metrics: {
          pain: m.pain,
          strength: m.strength,
          mobility: m.mobility,
        },
        lastStrengthValue: m.lastStrengthValue ?? undefined,
        lastStrengthUnit: m.lastStrengthUnit ?? undefined,
        lastRomDegrees: m.lastRomDegrees ?? undefined,
        expectedRomDegrees: m.expectedRomDegrees ?? undefined,
        lastUpdated: new Date(m.updatedAt),
        notes: m.notes ?? undefined,
        summary: m.summary ?? undefined,
        knots: muscleKnots.map((k) => ({
          id: k._id,
          position: { x: k.positionX, y: k.positionY, z: k.positionZ } as any,
          severity: k.severity,
          type: k.type as "trigger_point" | "adhesion" | "spasm",
        })),
      };
      states[m.meshId] = state;
    }
    return states;
  }, [muscles, allKnots]);

  return {
    user,
    body,
    muscleStates,
    isLoading: user === undefined || (user && body === undefined),
    isAuthenticated: user !== null && user !== undefined,
  };
}
