import { useMemo, useState, useCallback } from "react";
import { CatmullRomCurve3, Vector3, TubeGeometry } from "three";
import { useEditorStore } from "@/stores/editor-store";

export interface BranchNodeData {
  id: string;
  parentId: string | null;
  curvePoints: Array<{ position: [number, number, number]; radius: number }>;
  radius: number;
}

interface SkeletonOverlayProps {
  branchNodes: BranchNodeData[];
}

function BranchTube({
  node,
  isSelected,
  isHovered,
  onPointerOver,
  onPointerOut,
  onClick,
}: {
  node: BranchNodeData;
  isSelected: boolean;
  isHovered: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: (e: { stopPropagation: () => void }) => void;
}) {
  const geometry = useMemo(() => {
    if (node.curvePoints.length < 2) return null;

    const points = node.curvePoints.map(
      (cp) => new Vector3(...cp.position),
    );
    const curve = new CatmullRomCurve3(points);

    const avgRadius =
      node.curvePoints.reduce((sum, cp) => sum + cp.radius, 0) /
      node.curvePoints.length;

    return new TubeGeometry(
      curve,
      Math.max(node.curvePoints.length * 4, 8),
      avgRadius * 0.3,
      8,
      false,
    );
  }, [node.curvePoints]);

  if (!geometry) return null;

  const color = isSelected ? "#ffcc00" : isHovered ? "#66ddff" : "#00ccff";
  const opacity = isSelected ? 0.8 : isHovered ? 0.6 : 0.4;

  return (
    <mesh
      geometry={geometry}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthTest={false}
      />
    </mesh>
  );
}

function ControlPointHandle({
  position,
  nodeId,
}: {
  position: [number, number, number];
  nodeId: string;
}) {
  const activeTool = useEditorStore((s) => s.tool.activeTool);
  const selectBranch = useEditorStore((s) => s.selectBranch);

  if (activeTool !== "style") return null;

  return (
    <mesh
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        selectBranch(nodeId);
      }}
    >
      <sphereGeometry args={[0.015, 8, 8]} />
      <meshBasicMaterial color="#ff6600" depthTest={false} />
    </mesh>
  );
}

export function SkeletonOverlay({ branchNodes }: SkeletonOverlayProps) {
  const selectedBranchId = useEditorStore(
    (s) => s.selection.selectedBranchId,
  );
  const selectBranch = useEditorStore((s) => s.selectBranch);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleClick = useCallback(
    (nodeId: string) => (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      selectBranch(nodeId === selectedBranchId ? null : nodeId);
    },
    [selectBranch, selectedBranchId],
  );

  return (
    <group>
      {branchNodes.map((node) => {
        const isSelected = node.id === selectedBranchId;
        return (
          <group key={node.id}>
            <BranchTube
              node={node}
              isSelected={isSelected}
              isHovered={node.id === hoveredId}
              onPointerOver={() => setHoveredId(node.id)}
              onPointerOut={() => setHoveredId(null)}
              onClick={handleClick(node.id)}
            />
            {isSelected &&
              node.curvePoints.map((cp, i) => (
                <ControlPointHandle
                  key={i}
                  position={cp.position}
                  nodeId={node.id}
                />
              ))}
          </group>
        );
      })}
    </group>
  );
}
