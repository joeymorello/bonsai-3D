import { useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group, Mesh, Material } from "three";
import { MeshStandardMaterial } from "three";

interface ModelViewerProps {
  url: string;
  wireframe?: boolean;
}

export function ModelViewer({ url, wireframe = false }: ModelViewerProps) {
  const { scene } = useGLTF(url);
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

  if (!url) return null;

  return (
    <primitive
      ref={groupRef}
      object={scene.clone(true)}
      dispose={null}
    />
  );
}
