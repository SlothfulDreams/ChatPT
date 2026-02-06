"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface CameraControllerProps {
  focusTarget: THREE.Vector3 | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  zoomDistance?: number;
}

const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 1.1, 2.0);
const DEFAULT_TARGET = new THREE.Vector3(0, 1.0, 0);

export function CameraController({
  focusTarget,
  controlsRef,
  zoomDistance = 0.6,
}: CameraControllerProps) {
  const { camera } = useThree();

  const isAnimating = useRef(false);
  const progress = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const endTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    if (focusTarget) {
      // Zoom in: move toward the muscle
      startPos.current.copy(camera.position);
      startTarget.current.copy(controlsRef.current?.target ?? DEFAULT_TARGET);

      const direction = new THREE.Vector3()
        .subVectors(camera.position, focusTarget)
        .normalize();
      endPos.current
        .copy(focusTarget)
        .add(direction.multiplyScalar(zoomDistance));
      endTarget.current.copy(focusTarget);
    } else {
      // Zoom out: return to default
      startPos.current.copy(camera.position);
      startTarget.current.copy(controlsRef.current?.target ?? DEFAULT_TARGET);
      endPos.current.copy(DEFAULT_CAMERA_POS);
      endTarget.current.copy(DEFAULT_TARGET);
    }

    progress.current = 0;
    isAnimating.current = true;
  }, [focusTarget, camera, controlsRef, zoomDistance]);

  useFrame(() => {
    if (!isAnimating.current) return;

    progress.current += 0.025; // ~40 frames at 60fps
    if (progress.current >= 1) {
      progress.current = 1;
      isAnimating.current = false;
    }

    // Cubic ease-in-out
    const p = progress.current;
    const t = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

    camera.position.lerpVectors(startPos.current, endPos.current, t);

    if (controlsRef.current) {
      const target = new THREE.Vector3().lerpVectors(
        startTarget.current,
        endTarget.current,
        t,
      );
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }
  });

  return null;
}
