"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

useGLTF.preload("/models/skeletal_body.gltf");

interface SkeletonModelProps {
  visible?: boolean;
  isFrontView: boolean;
}

export function SkeletonModel({
  visible = true,
  isFrontView,
}: SkeletonModelProps) {
  const { scene } = useGLTF("/models/skeletal_body.gltf");

  const clonedScene = useMemo(() => {
    scene.updateMatrixWorld(true);
    return SkeletonUtils.clone(scene) as THREE.Group;
  }, [scene]);

  // Apply bone material and disable raycasting
  useMemo(() => {
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e8d0,
      metalness: 0.1,
      roughness: 0.9,
      transparent: true,
      opacity: 0.3,
    });

    const toRemove: THREE.Object3D[] = [];
    clonedScene.traverse((child) => {
      const obj = child as any;
      // Only keep actual meshes -- hide everything else (bones, lines, helpers, etc.)
      if (!obj.isMesh) {
        if (
          child.type !== "Group" &&
          child.type !== "Scene" &&
          child.type !== "Object3D"
        ) {
          toRemove.push(child);
        }
        return;
      }
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry as THREE.BufferGeometry;
      const vertexCount = geo.getAttribute("position")?.count ?? 0;
      // Tiny meshes are bone indicators / axis helpers
      if (vertexCount < 75) {
        toRemove.push(child);
        return;
      }
      mesh.material = boneMaterial;
      mesh.raycast = () => {};
    });
    for (const obj of toRemove) {
      obj.removeFromParent();
    }
  }, [clonedScene]);

  const groupRef = useRef<THREE.Group>(null);
  const targetRotationY = isFrontView ? 0 : Math.PI;

  useFrame(() => {
    if (!groupRef.current) return;
    const current = groupRef.current.rotation.y;
    const diff = targetRotationY - current;
    if (Math.abs(diff) > 0.001) {
      groupRef.current.rotation.y += diff * 0.08;
    }
  });

  return (
    <group ref={groupRef} visible={visible}>
      <primitive object={clonedScene} />
    </group>
  );
}
