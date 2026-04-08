import { useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group, Mesh, Material } from "three";
import { MeshStandardMaterial } from "three";
import { useEditorStore } from "@/stores/editor-store";

interface ModelViewerProps {
  url: string;
  wireframe?: boolean;
}

export function ModelViewer({ url, wireframe = false }: ModelViewerProps) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const showFoliage = useEditorStore((s) => s.viewer.showFoliage);

  useEffect(() => {
    if (!groupRef.current) return;

    groupRef.current.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];

        for (const mat of materials as Material[]) {
          if (mat instanceof MeshStandardMaterial) {
            mat.wireframe = wireframe;

            // Detect foliage by green-ish color or name
            const isLeaf =
              mat.name?.toLowerCase().includes("leaf") ||
              mat.name?.toLowerCase().includes("foliage") ||
              (mat.color && mat.color.g > 0.3 && mat.color.g > mat.color.r * 1.2);

            if (isLeaf) {
              mat.transparent = true;
              mat.opacity = showFoliage ? 1.0 : 0.1;
              mat.depthWrite = showFoliage;
            }
          }
        }
      }
    });
  }, [wireframe, showFoliage]);

  if (!url) return null;

  return (
    <primitive
      ref={groupRef}
      object={scene.clone(true)}
      dispose={null}
    />
  );
}
