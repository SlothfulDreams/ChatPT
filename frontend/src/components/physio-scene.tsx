"use client";

import {
  Grid,
  OrbitControls,
  PerspectiveCamera,
  Stars,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useBodyState } from "@/hooks/useBodyState";
import { getOtherSide } from "@/lib/muscle-utils";
import type { MuscleDepth } from "@/types/muscle-depth";
import type { MuscleGroup } from "@/types/muscle-groups";
import {
  DEFAULT_RENDERING_SETTINGS,
  type RenderingSettings,
} from "@/types/rendering";
import { CameraController } from "./camera-controller";
import { ChatPanel } from "./chat-panel";
import { MuscleFilter } from "./muscle-filter";
import { MuscleModel } from "./muscle-model";
import { SkeletonModel } from "./skeleton-model";
import {
  DEFAULT_VISUAL,
  type MuscleVisualOverride,
  StructureEditPanel3D,
} from "./structure-edit-panel-3d";
import { ViewControls } from "./view-controls";
import { WorkoutPanel } from "./workout-panel";

/** Projects a 3D world position to 2D screen coordinates. Runs inside Canvas. */
function WorldToScreen({
  position,
  onProject,
}: {
  position: THREE.Vector3;
  onProject: (x: number, y: number) => void;
}) {
  const { camera, size } = useThree();
  useEffect(() => {
    const projected = position.clone().project(camera);
    const x = (projected.x * 0.5 + 0.5) * size.width;
    const y = (-projected.y * 0.5 + 0.5) * size.height;
    onProject(x, y);
  }, [position, camera, size, onProject]);
  return null;
}

export function PhysioScene() {
  const { muscleStates, isLoading } = useBodyState();

  // Selection state
  const [selectedMuscles, setSelectedMuscles] = useState<Set<string>>(
    new Set(),
  );
  const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null);
  const [editingMuscle, setEditingMuscle] = useState<string | null>(null);
  const [editPosition, setEditPosition] = useState<THREE.Vector3 | null>(null);
  const [editScreenPos, setEditScreenPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Filter state
  const [activeGroups, setActiveGroups] = useState<Set<MuscleGroup>>(new Set());
  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup | null>(null);
  const [selectedDepths, setSelectedDepths] = useState<Set<MuscleDepth>>(
    new Set(),
  );

  // View state
  const [isFrontView, setIsFrontView] = useState(true);
  const [renderingSettings] = useState<RenderingSettings>(
    DEFAULT_RENDERING_SETTINGS,
  );
  const [focusTarget, setFocusTarget] = useState<THREE.Vector3 | null>(null);

  // Visual overrides (per-muscle material playground)
  const [visualOverrides, setVisualOverrides] = useState<
    Record<string, MuscleVisualOverride>
  >({});

  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatHighlightMeshIds, setChatHighlightMeshIds] = useState<Set<string>>(
    new Set(),
  );

  // Workout state
  const [isWorkoutOpen, setIsWorkoutOpen] = useState(false);
  const [isWorkoutMode, setIsWorkoutMode] = useState(false);
  const [workoutTargetMeshIds, setWorkoutTargetMeshIds] = useState<Set<string>>(
    new Set(),
  );
  const [workoutHighlightMeshIds, setWorkoutHighlightMeshIds] = useState<
    Set<string>
  >(new Set());

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const selectBothSides = true;

  // Merge all highlight sets for the 3D model
  const mergedSelectedMuscles = useMemo(() => {
    const merged = new Set(selectedMuscles);
    for (const id of workoutTargetMeshIds) merged.add(id);
    for (const id of workoutHighlightMeshIds) merged.add(id);
    for (const id of chatHighlightMeshIds) merged.add(id);
    return merged;
  }, [
    selectedMuscles,
    workoutTargetMeshIds,
    workoutHighlightMeshIds,
    chatHighlightMeshIds,
  ]);

  // ---- Handlers ----

  const handleMuscleClick = useCallback(
    (muscleId: string, worldPos: THREE.Vector3, _event: PointerEvent) => {
      const otherSide = getOtherSide(muscleId);

      // Workout mode: toggle target muscles instead of opening edit panel
      if (isWorkoutMode) {
        setWorkoutTargetMeshIds((prev) => {
          const next = new Set(prev);
          if (next.has(muscleId)) {
            next.delete(muscleId);
            next.delete(otherSide);
          } else {
            next.add(muscleId);
            next.add(otherSide);
          }
          return next;
        });
        return;
      }

      // Normal mode: bilateral selection + edit panel
      setSelectedMuscles((prev) => {
        const next = new Set(prev);
        if (next.has(muscleId)) {
          next.delete(muscleId);
          if (selectBothSides) next.delete(otherSide);
          setEditingMuscle(null);
          setEditPosition(null);
          setFocusTarget(null);
        } else {
          next.clear();
          next.add(muscleId);
          if (selectBothSides) next.add(otherSide);
          setEditingMuscle(muscleId);
          setEditPosition(worldPos.clone());
          setFocusTarget(worldPos.clone());
        }
        return next;
      });
    },
    [selectBothSides, isWorkoutMode],
  );

  const handleMuscleHover = useCallback((muscleId: string | null) => {
    setHoveredMuscle(muscleId);
  }, []);

  const handleCloseEdit = useCallback(() => {
    setEditingMuscle(null);
    setEditPosition(null);
    setFocusTarget(null);
    setSelectedMuscles(new Set());
  }, []);

  const handleToggleGroup = useCallback((group: MuscleGroup) => {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const handleClearGroups = useCallback(() => {
    setActiveGroups(new Set());
    setSelectedGroup(null);
  }, []);

  const handleToggleDepth = useCallback((depth: MuscleDepth) => {
    setSelectedDepths((prev) => {
      const next = new Set(prev);
      if (next.has(depth)) next.delete(depth);
      else next.add(depth);
      return next;
    });
  }, []);

  const handleSelectGroup = useCallback((group: MuscleGroup | null) => {
    setSelectedGroup(group);
    if (group) {
      setActiveGroups(new Set([group]));
    }
  }, []);

  const handleScreenProject = useCallback((x: number, y: number) => {
    setEditScreenPos({ x, y });
  }, []);

  const handleCloseWorkout = useCallback(() => {
    setIsWorkoutOpen(false);
    setIsWorkoutMode(false);
    setWorkoutTargetMeshIds(new Set());
    setWorkoutHighlightMeshIds(new Set());
  }, []);

  const handleHoverExercise = useCallback((meshIds: string[] | null) => {
    setWorkoutHighlightMeshIds(new Set(meshIds ?? []));
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <Canvas>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[0, 1.1, 2.0]} fov={50} />

          <CameraController
            focusTarget={focusTarget}
            controlsRef={controlsRef}
          />

          {/* Environment */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <directionalLight position={[-3, 3, -3]} intensity={0.3} />
          <Stars
            radius={100}
            depth={50}
            count={1000}
            factor={3}
            fade
            speed={0.5}
          />
          <Grid
            position={[0, -1.05, 0]}
            args={[10, 10]}
            cellSize={0.2}
            cellThickness={0.5}
            cellColor="#333"
            sectionSize={1}
            sectionThickness={1}
            sectionColor="#555"
            fadeDistance={8}
            fadeStrength={1}
            infiniteGrid
          />

          {/* Models */}
          <SkeletonModel isFrontView={isFrontView} />
          <MuscleModel
            muscleStates={muscleStates}
            selectedMuscles={mergedSelectedMuscles}
            activeGroups={activeGroups}
            selectedDepths={selectedDepths}
            selectedGroup={selectedGroup}
            renderingSettings={renderingSettings}
            isFrontView={isFrontView}
            onMuscleClick={handleMuscleClick}
            onMuscleHover={handleMuscleHover}
            workoutHighlightMeshIds={
              workoutTargetMeshIds.size > 0 || workoutHighlightMeshIds.size > 0
                ? new Set([...workoutTargetMeshIds, ...workoutHighlightMeshIds])
                : undefined
            }
            visualOverrides={visualOverrides}
          />

          <OrbitControls
            ref={controlsRef}
            target={[0, 1.0, 0]}
            enabled={!editingMuscle || isWorkoutMode}
            enableZoom
            enablePan
            minDistance={0.5}
            maxDistance={5}
            enableDamping
            dampingFactor={0.05}
          />

          {/* Project 3D muscle position to screen coords */}
          {editPosition && (
            <WorldToScreen
              position={editPosition}
              onProject={handleScreenProject}
            />
          )}
        </Suspense>
      </Canvas>

      {/* Floating edit panel at projected muscle position */}
      {!isWorkoutOpen && editingMuscle && editScreenPos && (
        <div
          className="pointer-events-auto absolute z-10"
          style={{
            left: editScreenPos.x,
            top: editScreenPos.y,
            transform: "translate(12px, -50%)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <StructureEditPanel3D
            muscleId={editingMuscle}
            visual={visualOverrides[editingMuscle] ?? DEFAULT_VISUAL}
            onVisualChange={(v) =>
              setVisualOverrides((prev) => ({ ...prev, [editingMuscle]: v }))
            }
            onClose={handleCloseEdit}
          />
        </div>
      )}

      {/* UI Overlays */}
      <div className="pointer-events-none absolute inset-0 flex">
        {/* Left: Filters */}
        <div className="flex flex-col gap-3 p-4">
          <MuscleFilter
            activeGroups={activeGroups}
            onToggleGroup={handleToggleGroup}
            onClearGroups={handleClearGroups}
            selectedDepths={selectedDepths}
            onToggleDepth={handleToggleDepth}
            selectedGroup={selectedGroup}
            onSelectGroup={handleSelectGroup}
          />
        </div>

        {/* Right: Workout panel + chat */}
        <div className="ml-auto flex flex-col gap-3 p-4">
          {isWorkoutOpen && (
            <WorkoutPanel
              isWorkoutMode={isWorkoutMode}
              onSetWorkoutMode={setIsWorkoutMode}
              workoutTargetMeshIds={workoutTargetMeshIds}
              onWorkoutTargetMeshIdsChange={setWorkoutTargetMeshIds}
              onHoverExercise={handleHoverExercise}
              onClose={handleCloseWorkout}
            />
          )}
          {isChatOpen && (
            <ChatPanel
              onClose={() => setIsChatOpen(false)}
              onHighlightMuscles={(meshIds) =>
                setChatHighlightMeshIds(new Set(meshIds))
              }
            />
          )}
        </div>

        {/* Bottom center: View controls + mode toggles */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          <ViewControls
            isFrontView={isFrontView}
            onToggleView={() => setIsFrontView((v) => !v)}
          />
          <button
            type="button"
            onClick={() =>
              isWorkoutOpen ? handleCloseWorkout() : setIsWorkoutOpen(true)
            }
            className={`pointer-events-auto mosaic-btn px-4 py-2 text-xs font-medium text-white transition-colors ${
              isWorkoutOpen ? "mosaic-btn-active" : ""
            }`}
          >
            Workout
          </button>
          <button
            type="button"
            onClick={() => setIsChatOpen((v) => !v)}
            className={`pointer-events-auto mosaic-btn px-4 py-2 text-xs font-medium text-white transition-colors ${
              isChatOpen ? "mosaic-btn-active" : ""
            }`}
          >
            Chat
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <p className="text-sm text-white/60">Loading...</p>
        </div>
      )}
    </div>
  );
}
