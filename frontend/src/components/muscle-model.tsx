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
  getMuscleGroups,
  type MuscleGroup,
  shouldShowMuscle,
} from "@/types/muscle-groups";
import type { RenderingSettings } from "@/types/rendering";
import type { MuscleVisualOverride } from "./structure-edit-panel-3d";

useGLTF.preload("/models/myological_body.gltf");

// ============================================
// Hidden mesh patterns: face muscles, non-muscle structures
// ============================================

const HIDDEN_MESH_PATTERNS = [
  // Face muscles (from MUSCLE_LIST.txt)
  "temporoparietalis",
  "frontalis",
  "orbicularis oculi",
  "orbicularis oris",
  "depressor labii",
  "mentalis",
  "depressor anguli",
  "zygomaticus",
  "risorius",
  "nasalis",
  "levator nasolabialis",
  "levator anguli oris",
  "bucinator",
  "corrugator supercilii",
  "depressor septi",
  "levator labii",
  "procerus",
  // Additional face/head muscles
  "platysma",
  "masseter",
  "temporalis",
  "occipitalis",
  "masseteric",
  "auricular",
  // Eye muscles
  "levator palpebrae",
  "inferior oblique",
  "superior oblique",
  "inferior rectus",
  "superior rectus",
  "lateral rectus",
  "medial rectus",
  "trochlea of superior oblique",
  "superior tarsus",
  "inferior tarsus",
  "common tendinous ring",
  // Scalp/head
  "epicranial aponeurosis",
  // Mastication
  "pterygoid",
  // Neck muscles
  "digastric",
  "genioglossus",
  "geniohyoid",
  "mylohyoid",
  "sternocleidomastoid",
  "omohyoid",
  "sternohyoid",
  "sternothyroid",
  "thyrohyoid",
  "stylohyoid",
  "stylopharyngeus",
  // Tongue
  "hyoglossus",
  "styloglossus",
  // Throat/larynx/pharynx
  "pharyngeal constrictor",
  "palatopharyngeus",
  "arytenoid",
  "cricothyroid",
  "crico-arytenoid",
  "thyro-arytenoid",
  "thyro-epiglottic",
  // Non-muscle structures
  "fascia",
  "bursa",
  "tendon",
  "sheath",
  "ligament",
  "cartilage",
  "articular capsule",
  "aponeurosis",
  "retinaculum",
  "septum",
  "linea alba",
  "iliotibial tract",
  "tract",
  "arch",
  "diaphragm",
  // Skeletal structures
  "bone",
  "skeleton",
  "skeletal",
  // Debug/visualization geometry
  "cross section",
  "scene",
  // Helper/debug geometry that could cause spikes
  "helper",
  "wire",
  "outline",
  "line",
  "edge",
  "axis",
  "grid",
  "arrow",
];

function shouldHideMesh(name: string): boolean {
  const lower = name.toLowerCase().replace(/_/g, " ");
  if (lower.endsWith(".g")) return true;
  // Classified muscles override hidden patterns (e.g. "tensor fasciae latae" contains "fascia")
  if (getMuscleGroups(name).length > 0) return false;
  return HIDDEN_MESH_PATTERNS.some((p) => lower.includes(p));
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
  visualOverrides?: Record<string, MuscleVisualOverride>;
  onMeshIdsExtracted?: (meshIds: string[]) => void;
  onMeshPositionsExtracted?: (posMap: Map<string, THREE.Vector3>) => void;
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
  visualOverrides,
  onMeshIdsExtracted,
  onMeshPositionsExtracted,
}: MuscleModelProps) {
  const { scene } = useGLTF("/models/myological_body.gltf");
  const groupRef = useRef<THREE.Group>(null);
  const meshIdsExtractedRef = useRef(false);
  const targetRotationY = isFrontView ? 0 : Math.PI;

  const clonedScene = useMemo(() => {
    scene.updateMatrixWorld(true);
    return SkeletonUtils.clone(scene) as THREE.Group;
  }, [scene]);

  // Extract all valid mesh IDs and world positions from the GLTF scene
  useEffect(() => {
    if (meshIdsExtractedRef.current) return;
    const ids: string[] = [];
    const posMap = new Map<string, THREE.Vector3>();
    clonedScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      if (shouldHideMesh(child.name)) return;
      ids.push(child.name);
      const pos = new THREE.Vector3();
      (child as THREE.Mesh).getWorldPosition(pos);
      posMap.set(child.name, pos);
    });
    if (ids.length > 0) {
      meshIdsExtractedRef.current = true;
      onMeshIdsExtracted?.(ids);
      onMeshPositionsExtracted?.(posMap);
    }
  }, [clonedScene, onMeshIdsExtracted, onMeshPositionsExtracted]);

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

    clonedScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;

      // Visibility filters
      if (shouldHideMesh(mesh.name)) {
        mesh.visible = false;
        mesh.raycast = () => {};
        return;
      }
      if (!shouldShowDepth(mesh.name, selectedDepths)) {
        mesh.visible = false;
        return;
      }

      mesh.visible = true;
      const inActiveGroup = shouldShowMuscle(mesh.name, activeGroups);

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

      // Dimming: muscles outside active group or outside selection get dulled
      const isHighlighted =
        (selectedMuscles.has(mesh.name) || !hasSelection) && inActiveGroup;
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

      // Apply visual override if present
      const vo = visualOverrides?.[mesh.name];
      if (vo && isHighlighted) {
        finalColor = new THREE.Color(vo.color[0], vo.color[1], vo.color[2]);
        finalOpacity = vo.opacity;
        emissiveColor = finalColor.clone();
        emissiveIntensity = vo.emissiveIntensity;
      }

      mesh.material = new THREE.MeshStandardMaterial({
        color: finalColor,
        transparent: true,
        opacity: finalOpacity,
        metalness: vo?.metalness ?? renderingSettings.metalness,
        roughness: vo?.roughness ?? renderingSettings.roughness,
        wireframe: renderingSettings.wireframe,
        emissive: emissiveColor,
        emissiveIntensity,
      });
    });
  }, [
    clonedScene,
    muscleStates,
    activeGroups,
    selectedDepths,
    renderingSettings,
    selectedMuscles,
    selectedGroup,
    workoutHighlightMeshIds,
    visualOverrides,
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
