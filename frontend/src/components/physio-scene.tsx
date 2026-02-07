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
import { formatMuscleName, getOtherSide } from "@/lib/muscle-utils";
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
import { WorkoutPanel } from "./workout-panel";

// ============================================
// Onboarding hint — dismissible, shown once
// ============================================
function OnboardingHint() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("chatpt-onboarded");
  });

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem("chatpt-onboarded", "1");
  }, []);

  if (!visible) return null;

  return (
    <div className="animate-fade-in absolute bottom-16 left-1/2 z-20 -translate-x-1/2">
      <div className="mosaic-panel pointer-events-auto flex items-center gap-3 px-5 py-3">
        <span className="text-xs leading-relaxed text-white/60">
          Click a muscle to inspect it &middot; Use the chat to describe pain or
          injuries &middot; Orbit with drag, zoom with scroll
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-xs text-white/30 transition-colors hover:text-white/70"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

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

/** Positions the edit panel near a screen point, clamped to stay in viewport. */
function EditPanelPositioner({
  screenX,
  screenY,
  children,
}: {
  screenX: number;
  screenY: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    left: screenX + 12,
    top: screenY,
    transform: "translateY(-50%)",
    visibility: "hidden" as const,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Preferred: right of the point, vertically centered
    let x = screenX + 12;
    let y = screenY - h / 2;

    // If overflows right, flip to left side
    if (x + w + pad > vw) {
      x = screenX - w - 12;
    }
    // Clamp left
    if (x < pad) x = pad;
    // Clamp top/bottom
    if (y < pad) y = pad;
    if (y + h + pad > vh) y = vh - h - pad;

    setStyle({ left: x, top: y, visibility: "visible" });
  }, [screenX, screenY]);

  return (
    <div
      ref={ref}
      className="pointer-events-auto absolute z-10"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
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

  // Selection mode
  const [selectBothSides, setSelectBothSides] = useState(true);

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
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  // Auto-open chat when muscles are selected (unless in workout mode)
  useEffect(() => {
    if (selectedMuscles.size > 0 && !isWorkoutMode) {
      setIsChatOpen(true);
    }
  }, [selectedMuscles.size, isWorkoutMode]);

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
    (muscleId: string, worldPos: THREE.Vector3, event: PointerEvent) => {
      const otherSide = getOtherSide(muscleId);
      // Alt/Option key overrides the toggle
      const bothSides = event.altKey ? !selectBothSides : selectBothSides;

      // Workout mode: toggle target muscles instead of opening edit panel
      if (isWorkoutMode) {
        setWorkoutTargetMeshIds((prev) => {
          const next = new Set(prev);
          if (next.has(muscleId)) {
            next.delete(muscleId);
            if (bothSides) next.delete(otherSide);
          } else {
            next.add(muscleId);
            if (bothSides) next.add(otherSide);
          }
          return next;
        });
        return;
      }

      // Cmd (Mac) / Ctrl (Win) for multi-select
      const isMultiSelect = event.metaKey || event.ctrlKey;

      if (isMultiSelect) {
        // Multi-select: toggle without clearing, no edit panel
        setSelectedMuscles((prev) => {
          const next = new Set(prev);
          if (next.has(muscleId)) {
            next.delete(muscleId);
            if (bothSides) next.delete(otherSide);
          } else {
            next.add(muscleId);
            if (bothSides) next.add(otherSide);
          }
          return next;
        });
        setEditingMuscle(null);
        setEditPosition(null);
      } else {
        // Normal mode: bilateral selection + edit panel
        setSelectedMuscles((prev) => {
          const next = new Set(prev);
          if (next.has(muscleId)) {
            next.delete(muscleId);
            if (bothSides) next.delete(otherSide);
            setEditingMuscle(null);
            setEditPosition(null);
            setFocusTarget(null);
          } else {
            next.clear();
            next.add(muscleId);
            if (bothSides) next.add(otherSide);
            setEditingMuscle(muscleId);
            setEditPosition(worldPos.clone());
            setFocusTarget(worldPos.clone());
          }
          return next;
        });
      }
    },
    [isWorkoutMode, selectBothSides],
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
      <Canvas
        onPointerDown={(e) => {
          pointerDownPos.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMissed={(event) => {
          if (!isWorkoutMode && editingMuscle) {
            // Only close on a true click, not after a drag/orbit
            const down = pointerDownPos.current;
            if (down) {
              const dx = event.clientX - down.x;
              const dy = event.clientY - down.y;
              if (dx * dx + dy * dy < 25) {
                handleCloseEdit();
              }
            }
          }
        }}
      >
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
            enabled
            enableZoom
            enablePan
            minDistance={0.5}
            maxDistance={3}
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
      {!isWorkoutMode && editingMuscle && editScreenPos && (
        <EditPanelPositioner
          screenX={editScreenPos.x}
          screenY={editScreenPos.y}
        >
          <StructureEditPanel3D
            muscleId={editingMuscle}
            visual={visualOverrides[editingMuscle] ?? DEFAULT_VISUAL}
            onVisualChange={(v) =>
              setVisualOverrides((prev) => ({ ...prev, [editingMuscle]: v }))
            }
            onClose={handleCloseEdit}
          />
        </EditPanelPositioner>
      )}

      {/* UI Overlays */}
      <div className="pointer-events-none absolute inset-0 flex">
        {/* Left: Filters + Workout */}
        <div className="flex h-full min-h-0 w-72 flex-col gap-3 p-3 pb-14">
          <MuscleFilter
            activeGroups={activeGroups}
            onToggleGroup={handleToggleGroup}
            onClearGroups={handleClearGroups}
            selectedDepths={selectedDepths}
            onToggleDepth={handleToggleDepth}
            selectedGroup={selectedGroup}
            onSelectGroup={handleSelectGroup}
          />
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
        </div>

        {/* Right: Chat — flush to edge, fill height */}
        <div className="ml-auto flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2 pb-14">
          {isChatOpen && (
            <ChatPanel
              onClose={() => setIsChatOpen(false)}
              onHighlightMuscles={(meshIds) =>
                setChatHighlightMeshIds(new Set(meshIds))
              }
              selectedMuscles={selectedMuscles}
              onDeselectMuscle={(meshId) => {
                setSelectedMuscles((prev) => {
                  const next = new Set(prev);
                  next.delete(meshId);
                  return next;
                });
                // Close edit panel if we deselected the muscle being edited
                if (editingMuscle === meshId) {
                  setEditingMuscle(null);
                  setEditPosition(null);
                }
              }}
            />
          )}
        </div>

        {/* Bottom center: Unified pill bar */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <div className="pointer-events-auto mosaic-panel flex items-center rounded-full px-1 py-1">
            {/* Bilateral toggle */}
            <button
              type="button"
              onClick={() => setSelectBothSides((v) => !v)}
              className={`relative flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                selectBothSides
                  ? "text-white/70 hover:text-white"
                  : "bg-gradient-to-r from-blue-500/20 to-teal-500/15 text-white"
              }`}
              title={
                selectBothSides ? "Selecting both sides" : "Selecting one side"
              }
            >
              {!selectBothSides && (
                <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-teal-400" />
              )}
              {selectBothSides ? "L+R" : "L/R"}
            </button>

            <div className="h-5 w-px bg-white/10" />

            {/* Front/Back View */}
            <button
              type="button"
              onClick={() => setIsFrontView((v) => !v)}
              className="relative rounded-full px-4 py-2 text-xs font-medium text-white/70 transition-colors hover:text-white"
            >
              {isFrontView ? "Back View" : "Front View"}
            </button>

            <div className="h-5 w-px bg-white/10" />

            {/* Workout */}
            <button
              type="button"
              onClick={() =>
                isWorkoutOpen ? handleCloseWorkout() : setIsWorkoutOpen(true)
              }
              className={`relative rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                isWorkoutOpen
                  ? "bg-gradient-to-r from-blue-500/20 to-teal-500/15 text-white"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {isWorkoutOpen && (
                <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-teal-400" />
              )}
              Workout
            </button>

            <div className="h-5 w-px bg-white/10" />

            {/* Chat */}
            <button
              type="button"
              onClick={() => setIsChatOpen((v) => !v)}
              className={`relative rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                isChatOpen
                  ? "bg-gradient-to-r from-blue-500/20 to-teal-500/15 text-white"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {isChatOpen && (
                <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-teal-400" />
              )}
              Chat
            </button>
          </div>
        </div>

        {/* Hovered muscle tooltip */}
        {hoveredMuscle && (
          <div className="animate-fade-in-fast pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2">
            <span className="mosaic-tag px-3 py-1.5 text-xs font-medium">
              {formatMuscleName(hoveredMuscle)}
            </span>
          </div>
        )}
      </div>

      {/* Onboarding hint — shown once */}
      <OnboardingHint />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/40 border-t-teal-400" />
          <p className="mt-3 text-xs text-white/40">Loading...</p>
        </div>
      )}
    </div>
  );
}
