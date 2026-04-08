import { useEditorStore } from "@/stores/editor-store";
import type { BranchNodeData } from "@/components/viewer/skeleton-overlay";
import { STYLE_PRESETS } from "@/lib/style-presets";

interface InspectorProps {
  branches?: BranchNodeData[];
}

export function Inspector({ branches = [] }: InspectorProps) {
  const selectedBranchId = useEditorStore(
    (s) => s.selection.selectedBranchId,
  );
  const activeTool = useEditorStore((s) => s.tool.activeTool);
  const clipHeight = useEditorStore((s) => s.viewer.clipHeight);
  const setClipHeight = useEditorStore((s) => s.setClipHeight);
  const pruneAboveClip = useEditorStore((s) => s.pruneAboveClip);
  const pruneBelowClip = useEditorStore((s) => s.pruneBelowClip);
  const pruneBranch = useEditorStore((s) => s.pruneBranch);
  const bendBranch = useEditorStore((s) => s.bendBranch);
  const rotateBranch = useEditorStore((s) => s.rotateBranch);

  // Clipper tool inspector
  if (activeTool === "clipper") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Clipper Tool
        </h3>
        <section>
          <h4 className="mb-2 text-xs font-medium text-gray-300">Clip Plane Height</h4>
          <input
            type="range"
            min={-0.1}
            max={1.0}
            step={0.01}
            value={clipHeight}
            onChange={(e) => setClipHeight(parseFloat(e.target.value))}
            className="w-full accent-red-500"
          />
          <p className="mt-1 text-center font-mono text-xs text-gray-400">
            {clipHeight.toFixed(2)}
          </p>
        </section>
        <section>
          <h4 className="mb-2 text-xs font-medium text-gray-300">Actions</h4>
          <div className="space-y-2">
            <button
              onClick={pruneAboveClip}
              className="w-full rounded bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
            >
              Prune Above Plane
            </button>
            <button
              onClick={pruneBelowClip}
              className="w-full rounded bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
            >
              Prune Below Plane
            </button>
          </div>
        </section>
        <section>
          <p className="text-xs text-gray-500">
            Drag the red plane in the viewport or use the slider to position.
            Then prune branches above or below.
          </p>
        </section>
      </div>
    );
  }

  const applyStylePreset = useEditorStore((s) => s.applyStylePreset);

  if (!selectedBranchId) {
    return (
      <div className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Inspector
        </h3>
        <p className="mt-4 text-center text-xs text-gray-500">
          Select a branch to see its properties.
        </p>
        <div className="mt-6">
          <h4 className="mb-2 text-xs font-medium text-gray-400">Summary</h4>
          <PropertyRow label="Branches" value={String(branches.length)} />
        </div>

        {/* Style Presets */}
        <div className="mt-6">
          <h4 className="mb-2 text-xs font-medium text-gray-400">Style Presets</h4>
          <div className="space-y-1.5">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyStylePreset(preset.apply)}
                className="w-full rounded border border-gray-600 px-2 py-1.5 text-left text-xs text-gray-300 transition hover:border-green-500 hover:bg-gray-700"
              >
                <span className="font-medium">{preset.name}</span>
                <br />
                <span className="text-[10px] text-gray-500">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const branch = branches.find((b) => b.id === selectedBranchId);
  const pts = branch?.curvePoints ?? [];
  const startPt = pts[0]?.position;
  const endPt = pts[pts.length - 1]?.position;
  const branchLength = branch
    ? pts.reduce((sum, cp, i) => {
        if (i === 0) return 0;
        const prev = pts[i - 1]!.position;
        const dx = cp.position[0] - prev[0];
        const dy = cp.position[1] - prev[1];
        const dz = cp.position[2] - prev[2];
        return sum + Math.sqrt(dx * dx + dy * dy + dz * dz);
      }, 0)
    : 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Inspector
      </h3>

      {/* Branch info */}
      <section>
        <h4 className="mb-2 text-xs font-medium text-gray-300">Branch</h4>
        <div className="space-y-2">
          <PropertyRow label="ID" value={selectedBranchId.slice(0, 8)} />
          <PropertyRow label="Points" value={String(pts.length)} />
          <PropertyRow label="Parent" value={branch?.parentId?.slice(0, 8) ?? "root"} />
        </div>
      </section>

      {/* Position (start point) */}
      {startPt && (
        <section>
          <h4 className="mb-2 text-xs font-medium text-gray-300">Start Point</h4>
          <div className="space-y-1.5">
            <TransformInput
              label="X"
              value={startPt[0]}
              onChange={(v) => bendBranch(selectedBranchId, 0, [v - startPt[0], 0, 0])}
            />
            <TransformInput
              label="Y"
              value={startPt[1]}
              onChange={(v) => bendBranch(selectedBranchId, 0, [0, v - startPt[1], 0])}
            />
            <TransformInput
              label="Z"
              value={startPt[2]}
              onChange={(v) => bendBranch(selectedBranchId, 0, [0, 0, v - startPt[2]])}
            />
          </div>
        </section>
      )}

      {/* Rotation */}
      <section>
        <h4 className="mb-2 text-xs font-medium text-gray-300">Rotate</h4>
        <div className="space-y-1.5">
          <TransformInput
            label="Rot X"
            value={0}
            onChange={(v) => rotateBranch(selectedBranchId, [1, 0, 0], v * Math.PI / 180)}
          />
          <TransformInput
            label="Rot Y"
            value={0}
            onChange={(v) => rotateBranch(selectedBranchId, [0, 1, 0], v * Math.PI / 180)}
          />
          <TransformInput
            label="Rot Z"
            value={0}
            onChange={(v) => rotateBranch(selectedBranchId, [0, 0, 1], v * Math.PI / 180)}
          />
        </div>
      </section>

      {/* Properties */}
      <section>
        <h4 className="mb-2 text-xs font-medium text-gray-300">Properties</h4>
        <div className="space-y-2">
          <PropertyRow label="Radius" value={(branch?.radius ?? 0).toFixed(4)} />
          <PropertyRow label="Length" value={branchLength.toFixed(4)} />
        </div>
      </section>

      {/* Actions */}
      <section>
        <h4 className="mb-2 text-xs font-medium text-gray-300">Actions</h4>
        <button
          onClick={() => pruneBranch(selectedBranchId)}
          className="w-full rounded bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
        >
          Prune Branch
        </button>
      </section>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-300">{value}</span>
    </div>
  );
}

function TransformInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange?: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-xs text-gray-500">{label}</span>
      <input
        type="number"
        step={0.01}
        defaultValue={Number(value.toFixed(4))}
        onBlur={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && onChange) onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = parseFloat((e.target as HTMLInputElement).value);
            if (!isNaN(v) && onChange) onChange(v);
          }
        }}
        className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-green-500 focus:outline-none"
      />
    </div>
  );
}
