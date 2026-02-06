"use client";

import { Html } from "@react-three/drei";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import type { MuscleCondition, MuscleState } from "@/types/muscle";
import { createDefaultMuscleState } from "@/types/muscle";
import { api } from "../../convex/_generated/api";

const CONDITIONS: MuscleCondition[] = [
  "healthy",
  "tight",
  "knotted",
  "strained",
  "torn",
  "recovering",
  "inflamed",
  "weak",
  "fatigued",
];

interface StructureEditPanel3DProps {
  muscleId: string;
  bodyId: string;
  muscleState: MuscleState;
  position: THREE.Vector3;
  onClose: () => void;
}

export function StructureEditPanel3D({
  muscleId,
  bodyId,
  muscleState,
  position,
  onClose,
}: StructureEditPanel3DProps) {
  const state = muscleState ?? createDefaultMuscleState();
  const upsertMuscle = useMutation(api.muscles.upsert);

  const [condition, setCondition] = useState<MuscleCondition>(state.condition);
  const [pain, setPain] = useState(state.metrics.pain);
  const [strength, setStrength] = useState(state.metrics.strength);
  const [mobility, setMobility] = useState(state.metrics.mobility);
  const isInitial = useRef(true);

  useEffect(() => {
    setCondition(state.condition);
    setPain(state.metrics.pain);
    setStrength(state.metrics.strength);
    setMobility(state.metrics.mobility);
  }, [state]);

  const debouncedUpdate = useCallback(() => {
    upsertMuscle({
      bodyId: bodyId as any,
      meshId: muscleId,
      condition,
      pain,
      strength,
      mobility,
    });
  }, [bodyId, muscleId, condition, pain, strength, mobility, upsertMuscle]);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    const timer = setTimeout(debouncedUpdate, 400);
    return () => clearTimeout(timer);
  }, [debouncedUpdate]);

  // Offset the panel to the right of the muscle
  const panelPosition: [number, number, number] = [
    position.x + 0.15,
    position.y + 0.05,
    position.z,
  ];

  return (
    <Html position={panelPosition} center distanceFactor={1.0} occlude={false}>
      <div
        className="mosaic-panel w-64 p-4 text-white shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold capitalize">
            {muscleId.replace(/_1$/, " (R)").replace(/\./g, " ")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-white/50 hover:text-white"
          >
            X
          </button>
        </div>

        {/* Condition */}
        <label className="mb-1 block text-xs text-white/60">Condition</label>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as MuscleCondition)}
          className="mb-3 w-full rounded bg-white/10 px-2 py-1 text-xs"
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c} className="bg-black">
              {c}
            </option>
          ))}
        </select>

        {/* Pain 0-10 */}
        <label className="mb-1 block text-xs text-white/60">
          Pain: {pain.toFixed(1)}
        </label>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={pain}
          onChange={(e) => setPain(Number(e.target.value))}
          className="mb-3 w-full"
        />

        {/* Strength 0-1 */}
        <label className="mb-1 block text-xs text-white/60">
          Strength: {(strength * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="mb-3 w-full"
        />

        {/* Mobility 0-1 */}
        <label className="mb-1 block text-xs text-white/60">
          ROM: {(mobility * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={mobility}
          onChange={(e) => setMobility(Number(e.target.value))}
          className="mb-3 w-full"
        />
      </div>
    </Html>
  );
}
