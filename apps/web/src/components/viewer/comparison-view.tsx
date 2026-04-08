import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";
import { ModelViewer } from "./model-viewer";
import { SkeletonOverlay } from "./skeleton-overlay";
import type { BranchNodeData } from "./skeleton-overlay";

interface ComparisonViewProps {
  modelUrl: string;
  leftBranches: BranchNodeData[];
  rightBranches: BranchNodeData[];
  leftLabel: string;
  rightLabel: string;
  onClose: () => void;
}

function ComparisonScene({
  modelUrl,
  branchNodes,
}: {
  modelUrl: string;
  branchNodes: BranchNodeData[];
}) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1} />
      <Environment preset="forest" background={false} />
      <Grid
        position={[0, -0.01, 0]}
        args={[10, 10]}
        cellSize={0.5}
        cellColor="#4a4a5a"
        sectionSize={2}
        sectionColor="#6a6a7a"
        fadeDistance={15}
        fadeStrength={1}
        infiniteGrid
      />
      <Suspense
        fallback={
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="#888" wireframe />
          </mesh>
        }
      >
        <ModelViewer url={modelUrl} />
      </Suspense>
      <SkeletonOverlay branchNodes={branchNodes} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={0.5}
        maxDistance={20}
      />
    </>
  );
}

export function ComparisonView({
  modelUrl,
  leftBranches,
  rightBranches,
  leftLabel,
  rightLabel,
  onClose,
}: ComparisonViewProps) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-2">
        <h3 className="text-sm font-semibold text-white">
          Variation Comparison
        </h3>
        <button
          onClick={onClose}
          className="rounded bg-gray-700 px-3 py-1 text-xs text-gray-300 transition hover:bg-gray-600"
        >
          Close
        </button>
      </div>
      <div className="flex flex-1">
        {/* Left viewport */}
        <div className="relative flex-1 border-r border-gray-700">
          <div className="absolute left-3 top-3 z-10 rounded bg-gray-800/80 px-2 py-1 text-xs font-medium text-white">
            {leftLabel}
          </div>
          <Canvas
            shadows
            camera={{ position: [3, 3, 3], fov: 50 }}
            className="h-full w-full"
            gl={{ antialias: true, alpha: false }}
          >
            <color attach="background" args={["#1a1a2e"]} />
            <ComparisonScene modelUrl={modelUrl} branchNodes={leftBranches} />
          </Canvas>
        </div>

        {/* Right viewport */}
        <div className="relative flex-1">
          <div className="absolute left-3 top-3 z-10 rounded bg-gray-800/80 px-2 py-1 text-xs font-medium text-white">
            {rightLabel}
          </div>
          <Canvas
            shadows
            camera={{ position: [3, 3, 3], fov: 50 }}
            className="h-full w-full"
            gl={{ antialias: true, alpha: false }}
          >
            <color attach="background" args={["#1a1a2e"]} />
            <ComparisonScene modelUrl={modelUrl} branchNodes={rightBranches} />
          </Canvas>
        </div>
      </div>
    </div>
  );
}
