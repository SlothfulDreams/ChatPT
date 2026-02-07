"use client";

import { useGLTF } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { MuscleStates } from "@/types/muscle";
import {
  CONDITION_RENDERING,
  createDefaultMuscleState,
  getPainColor,
} from "@/types/muscle";
import { type MuscleDepth, shouldShowDepth } from "@/types/muscle-depth";
import {
  isClassifiedMuscle,
  type MuscleGroup,
  shouldShowMuscle,
} from "@/types/muscle-groups";
import type { RenderingSettings } from "@/types/rendering";

useGLTF.preload("/models/myological_body.gltf");

// Hide any mesh not explicitly assigned to a muscle group (or .g group nodes).
function shouldHideMesh(name: string): boolean {
  if (name.endsWith(".g")) return true;
  return !isClassifiedMuscle(name);
}

// ============================================
// Props
// ============================================

interface MuscleModelProps {
  muscleStates: MuscleStates;
  selectedMuscles: Set<string>;
  activeGroups: Set<MuscleGroup>;
  selectedDepths: Set<MuscleDepth>;
  selectedGroup: MuscleGroup | null;
  renderingSettings: RenderingSettings;
  isFrontView: boolean;
  onMuscleClick?: (
    muscleId: string,
    worldPos: THREE.Vector3,
    event: PointerEvent,
  ) => void;
  onMuscleHover?: (muscleId: string | null) => void;
  workoutHighlightMeshIds?: Set<string>;
}

// ============================================
// Component
// ============================================

export function MuscleModel({
  muscleStates,
  selectedMuscles,
  activeGroups,
  selectedDepths,
  selectedGroup,
  renderingSettings,
  isFrontView,
  onMuscleClick,
  onMuscleHover,
  workoutHighlightMeshIds,
}: MuscleModelProps) {
  const { scene } = useGLTF("/models/myological_body.gltf");
  const groupRef = useRef<THREE.Group>(null);
  const targetRotationY = isFrontView ? 0 : Math.PI;

  const clonedScene = useMemo(() => {
    scene.updateMatrixWorld(true);
    return SkeletonUtils.clone(scene) as THREE.Group;
  }, [scene]);

  // Rotation lerp
  useFrame(() => {
    if (!groupRef.current) return;
    const current = groupRef.current.rotation.y;
    const diff = targetRotationY - current;
    if (Math.abs(diff) > 0.001) {
      groupRef.current.rotation.y += diff * 0.08;
    }
  });

  // Material application
  useEffect(() => {
    const hasSelection = selectedMuscles.size > 0;

    let debugShown = 0;
    let debugHidden = 0;
    const sampleHidden: string[] = [];
    const sampleShown: string[] = [];
    clonedScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;

      // Visibility filters
      if (shouldHideMesh(mesh.name)) {
        debugHidden++;
        if (sampleHidden.length < 5) sampleHidden.push(mesh.name);
        mesh.visible = false;
        mesh.raycast = () => {};
        return;
      }
      if (!shouldShowMuscle(mesh.name, activeGroups)) {
        mesh.visible = false;
        return;
      }
      if (!shouldShowDepth(mesh.name, selectedDepths)) {
        mesh.visible = false;
        return;
      }

      debugShown++;
      if (sampleShown.length < 5) sampleShown.push(mesh.name);
      mesh.visible = true;

      // Get state for this muscle
      const state = muscleStates[mesh.name] ?? createDefaultMuscleState();
      const condition = state.condition;
      const conditionParams = CONDITION_RENDERING[condition];

      // Determine color
      let finalColor: THREE.Color;
      if (condition !== "healthy") {
        const [r, g, b] = conditionParams.baseColor;
        finalColor = new THREE.Color(r, g, b);
      } else {
        finalColor = getPainColor(state.metrics.pain);
      }

      // Opacity: condition base * strength factor
      const strengthFactor = 0.4 + 0.6 * state.metrics.strength;
      let finalOpacity =
        conditionParams.opacity * strengthFactor * renderingSettings.opacity;

      // Dimming: if other muscles are selected, dim non-selected
      const isHighlighted = selectedMuscles.has(mesh.name) || !hasSelection;
      if (!isHighlighted) {
        finalColor = new THREE.Color(0.25, 0.25, 0.25);
        finalOpacity *= 0.5;
      }

      // Emissive: glow for selected or condition-based
      let emissiveColor: THREE.Color;
      let emissiveIntensity: number;
      if (workoutHighlightMeshIds?.has(mesh.name)) {
        // Distinct blue glow for workout targets
        emissiveColor = new THREE.Color(0.1, 0.4, 0.8);
        emissiveIntensity = 0.5;
      } else if (selectedMuscles.has(mesh.name)) {
        emissiveColor = finalColor.clone();
        emissiveIntensity = 0.4;
      } else {
        const [er, eg, eb] = conditionParams.emissiveColor;
        emissiveColor = new THREE.Color(er, eg, eb);
        emissiveIntensity = conditionParams.emissiveIntensity;
      }

      mesh.material = new THREE.MeshStandardMaterial({
        color: finalColor,
        transparent: true,
        opacity: finalOpacity,
        metalness: renderingSettings.metalness,
        roughness: renderingSettings.roughness,
        wireframe: renderingSettings.wireframe,
        emissive: emissiveColor,
        emissiveIntensity,
      });
    });
    console.log(`[MuscleModel] shown: ${debugShown}, hidden: ${debugHidden}`);
    console.log("[MuscleModel] sampleHidden:", JSON.stringify(sampleHidden));
  }, [
    clonedScene,
    muscleStates,
    activeGroups,
    selectedDepths,
    renderingSettings,
    selectedMuscles,
    selectedGroup,
    workoutHighlightMeshIds,
  ]);

  // Click handler
  const handleClick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const mesh = e.object as THREE.Mesh;
      if (shouldHideMesh(mesh.name)) return;
      if (mesh.name.endsWith(".g")) return;

      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      onMuscleClick?.(mesh.name, worldPos, e.nativeEvent);
    },
    [onMuscleClick],
  );

  // Hover handlers
  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const mesh = e.object as THREE.Mesh;
      if (shouldHideMesh(mesh.name)) return;
      onMuscleHover?.(mesh.name);

      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.emissiveIntensity = Math.max(
          mesh.material.emissiveIntensity,
          0.5,
        );
      }
    },
    [onMuscleHover],
  );

  const handlePointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const mesh = e.object as THREE.Mesh;
      onMuscleHover?.(null);

      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        const isSelected = selectedMuscles.has(mesh.name);
        mesh.material.emissiveIntensity = isSelected ? 0.4 : 0;
      }
    },
    [onMuscleHover, selectedMuscles],
  );

  return (
    <group
      ref={groupRef}
      onPointerDown={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <primitive object={clonedScene} />
    </group>
  );
}
