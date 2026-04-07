import { useRef, useCallback } from "react";
import { TransformControls } from "@react-three/drei";
import type { Mesh } from "three";
import { useEditorStore } from "@/stores/editor-store";

interface BranchControlsProps {
  branchId: string;
  handleIndex: number;
  position: [number, number, number];
}

export function BranchControls({
  branchId,
  handleIndex,
  position,
}: BranchControlsProps) {
  const objRef = useRef<Mesh>(null);
  const activeTool = useEditorStore((s) => s.tool.activeTool);
  const bendBranch = useEditorStore((s) => s.bendBranch);

  const handleDragEnd = useCallback(() => {
    if (!objRef.current) return;

    const delta: [number, number, number] = [
      objRef.current.position.x - position[0],
      objRef.current.position.y - position[1],
      objRef.current.position.z - position[2],
    ];

    if (
      Math.abs(delta[0]) > 0.001 ||
      Math.abs(delta[1]) > 0.001 ||
      Math.abs(delta[2]) > 0.001
    ) {
      bendBranch(branchId, handleIndex, delta);
    }
  }, [branchId, handleIndex, position, bendBranch]);

  if (activeTool !== "style") return null;

  return (
    <>
      <mesh ref={objRef} position={position}>
        <sphereGeometry args={[0.02, 12, 12]} />
        <meshBasicMaterial
          color="#ff9900"
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </mesh>
      {objRef.current && (
        <TransformControls
          object={objRef.current}
          mode="translate"
          size={0.5}
          onMouseUp={handleDragEnd}
        />
      )}
    </>
  );
}
