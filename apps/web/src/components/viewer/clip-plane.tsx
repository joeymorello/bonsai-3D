import { useState } from "react";
import { DoubleSide } from "three";
import { useEditorStore } from "@/stores/editor-store";

/**
 * A draggable horizontal cutting plane for the clipper tool.
 * Drag up/down to position, then use inspector actions to prune.
 */
export function ClipPlane() {
  const activeTool = useEditorStore((s) => s.tool.activeTool);
  const clipHeight = useEditorStore((s) => s.viewer.clipHeight);
  const setClipHeight = useEditorStore((s) => s.setClipHeight);
  const [dragging, setDragging] = useState(false);

  if (activeTool !== "clipper") return null;

  return (
    <group position={[0, clipHeight, 0]}>
      {/* Visible plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDragging(true);
          (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          e.stopPropagation();
          // Map pointer Y (-1..1) to height range (-0.1..1.0)
          const mappedHeight = (1 - (e.pointer.y + 1) / 2) * 1.2 - 0.1;
          setClipHeight(Math.max(-0.1, Math.min(1.0, mappedHeight)));
        }}
        onPointerUp={(e) => {
          setDragging(false);
          (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
        }}
      >
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial
          color={dragging ? "#ff4444" : "#ff6666"}
          transparent
          opacity={dragging ? 0.4 : 0.25}
          side={DoubleSide}
          depthTest={false}
        />
      </mesh>

      {/* Edge ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.74, 0.75, 32]} />
        <meshBasicMaterial
          color="#ff4444"
          transparent
          opacity={0.6}
          side={DoubleSide}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}
