import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";
import { useEditorStore } from "@/stores/editor-store";
import { ModelViewer } from "./model-viewer";
import { SkeletonOverlay } from "./skeleton-overlay";
import { ClipPlane } from "./clip-plane";
import type { BranchNodeData } from "./skeleton-overlay";

interface SceneProps {
  modelUrl: string;
  branchNodes?: BranchNodeData[];
}

function SceneContent({ modelUrl, branchNodes = [] }: SceneProps) {
  const showSkeleton = useEditorStore((s) => s.viewer.showSkeleton);
  const showWireframe = useEditorStore((s) => s.viewer.showWireframe);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <Environment preset="forest" background={false} />

      {/* Ground grid */}
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

      {/* 3D Model */}
      <Suspense
        fallback={
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="#888" wireframe />
          </mesh>
        }
      >
        <ModelViewer url={modelUrl} wireframe={showWireframe} />
      </Suspense>

      {/* Skeleton overlay */}
      {showSkeleton && <SkeletonOverlay branchNodes={branchNodes} />}

      {/* Clip plane for pruning tool */}
      <ClipPlane />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={0.5}
        maxDistance={20}
        maxPolarAngle={Math.PI * 0.9}
      />
    </>
  );
}

export function Scene({ modelUrl, branchNodes = [] }: SceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [3, 3, 3], fov: 50, near: 0.1, far: 100 }}
      className="h-full w-full"
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={["#1a1a2e"]} />
      <SceneContent modelUrl={modelUrl} branchNodes={branchNodes} />
    </Canvas>
  );
}
