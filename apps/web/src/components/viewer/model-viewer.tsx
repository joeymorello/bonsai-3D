import { useEffect, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Group, Mesh, Material } from "three";
import { MeshStandardMaterial } from "three";

interface ModelViewerProps {
  url: string;
  wireframe?: boolean;
}

export function ModelViewer({ url, wireframe = false }: ModelViewerProps) {
  const gltf = useLoader(GLTFLoader, url);
  const groupRef = useRef<Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;

    groupRef.current.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Apply wireframe toggle
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];

        for (const mat of materials as Material[]) {
          if (mat instanceof MeshStandardMaterial) {
            mat.wireframe = wireframe;
          }
        }
      }
    });
  }, [wireframe]);

  return (
    <primitive
      ref={groupRef}
      object={gltf.scene.clone(true)}
      dispose={null}
    />
  );
}
