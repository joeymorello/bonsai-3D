import { useMemo } from "react";
import { CatmullRomCurve3, Vector3, TubeGeometry } from "three";
import { useEditorStore } from "@/stores/editor-store";

export interface BranchNodeData {
  id: string;
  curvePoints: Array<{ position: [number, number, number]; radius: number }>;
}

interface SkeletonOverlayProps {
  branchNodes: BranchNodeData[];
}

function BranchTube({
  node,
  isSelected,
}: {
  node: BranchNodeData;
  isSelected: boolean;
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

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={isSelected ? "#ffcc00" : "#00ccff"}
        transparent
        opacity={isSelected ? 0.8 : 0.4}
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

  return (
    <group>
      {branchNodes.map((node) => (
        <group key={node.id}>
          <BranchTube
            node={node}
            isSelected={node.id === selectedBranchId}
          />
          {node.curvePoints.map((cp, i) => (
            <ControlPointHandle
              key={i}
              position={cp.position}
              nodeId={node.id}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
