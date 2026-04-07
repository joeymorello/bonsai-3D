import { useEditorStore } from "@/stores/editor-store";

export function Inspector() {
  const selectedBranchId = useEditorStore(
    (s) => s.selection.selectedBranchId,
  );
  const pruneBranch = useEditorStore((s) => s.pruneBranch);

  if (!selectedBranchId) {
    return (
      <div className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Inspector
        </h3>
        <p className="mt-4 text-center text-xs text-gray-500">
          Select a branch to see its properties.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Inspector
      </h3>

      {/* Branch info */}
      <section>
        <h4 className="mb-2 text-xs font-medium text-gray-300">Branch</h4>
        <div className="space-y-2">
          <PropertyRow label="ID" value={selectedBranchId} />
          <PropertyRow label="Name" value={`branch_${selectedBranchId.slice(0, 6)}`} />
          <PropertyRow label="Parent" value="--" />
        </div>
      </section>

      {/* Transform */}
      <section>
        <h4 className="mb-2 text-xs font-medium text-gray-300">Transform</h4>
        <div className="space-y-1.5">
          <TransformInput label="Pos X" value={0} />
          <TransformInput label="Pos Y" value={0} />
          <TransformInput label="Pos Z" value={0} />
        </div>
        <div className="mt-2 space-y-1.5">
          <TransformInput label="Rot X" value={0} />
          <TransformInput label="Rot Y" value={0} />
          <TransformInput label="Rot Z" value={0} />
        </div>
      </section>

      {/* Properties */}
      <section>
        <h4 className="mb-2 text-xs font-medium text-gray-300">Properties</h4>
        <div className="space-y-2">
          <PropertyRow label="Radius" value="0.02" />
          <PropertyRow label="Curvature" value="0.15" />
          <PropertyRow label="Length" value="0.34" />
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

function TransformInput({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-xs text-gray-500">{label}</span>
      <input
        type="number"
        step={0.01}
        defaultValue={value}
        className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-green-500 focus:outline-none"
      />
    </div>
  );
}
