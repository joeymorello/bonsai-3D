import { useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getWorkspace, getWorkspaceAssets, listVariations } from "@/lib/api";
import { useEditorStore } from "@/stores/editor-store";
import type { EditorBranch } from "@/stores/editor-store";
import { Scene } from "@/components/viewer/scene";
import { Toolbar } from "@/components/toolbar";
import { Inspector } from "@/components/inspector";
import type { BranchNodeData } from "@/components/viewer/skeleton-overlay";

export function Editor() {
  const { id } = useParams<{ id: string }>();

  const { data: workspace } = useQuery({
    queryKey: ["workspace", id],
    queryFn: () => getWorkspace(id!),
    enabled: !!id,
  });

  const { data: wsAssets } = useQuery({
    queryKey: ["workspace-assets", id],
    queryFn: () => getWorkspaceAssets(id!),
    enabled: !!id,
  });

  const { data: variations } = useQuery({
    queryKey: ["variations", id],
    queryFn: () => listVariations(id!),
    enabled: !!id,
  });

  const loadBranches = useEditorStore((s) => s.loadBranches);
  const storeBranches = useEditorStore((s) => s.branches);

  // Load branches from API into the editor store (once)
  useEffect(() => {
    if (!wsAssets?.branches || storeBranches.size > 0) return;
    const editorBranches: EditorBranch[] = wsAssets.branches
      .filter((b) => b.curveData)
      .map((b) => ({
        id: b.id,
        parentId: b.parentId,
        curvePoints: (b.curveData as { curvePoints: Array<{ position: [number, number, number]; radius: number }> }).curvePoints ?? [],
        radius: b.radius ?? 0.01,
        isPruned: b.isPruned ?? false,
      }));
    loadBranches(editorBranches);
  }, [wsAssets?.branches, loadBranches, storeBranches.size]);

  // Derive renderable branch nodes from the store (reactive to edits)
  const branchNodes: BranchNodeData[] = useMemo(() => {
    const result: BranchNodeData[] = [];
    for (const branch of storeBranches.values()) {
      if (branch.isPruned || branch.curvePoints.length < 2) continue;
      result.push({
        id: branch.id,
        parentId: branch.parentId,
        curvePoints: branch.curvePoints,
        radius: branch.radius,
      });
    }
    return result;
  }, [storeBranches]);

  const activeVariationId = useEditorStore((s) => s.variation.activeVariationId);
  const setActiveVariation = useEditorStore((s) => s.setActiveVariation);
  const isDirty = useEditorStore((s) => s.variation.isDirty);
  const saveVariation = useEditorStore((s) => s.saveVariation);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-900">
      {/* Top Toolbar */}
      <header className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            to={`/workspace/${id}`}
            className="text-sm text-gray-400 hover:text-white"
          >
            &larr; Back
          </Link>
          <span className="text-sm font-semibold text-white">
            {workspace?.name ?? "Loading..."}
          </span>
          {isDirty && (
            <span className="rounded bg-yellow-600 px-1.5 py-0.5 text-[10px] text-white">
              unsaved
            </span>
          )}
        </div>
        <Toolbar />
        <button
          onClick={saveVariation}
          disabled={!isDirty}
          className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-40"
        >
          Save
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="flex w-56 flex-col border-r border-gray-700 bg-gray-800">
          <div className="border-b border-gray-700 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Workspace
            </h3>
            <p className="mt-1 truncate text-sm text-gray-200">
              {workspace?.name}
            </p>
            {workspace?.speciesGuess && (
              <p className="text-xs italic text-gray-500">
                {workspace.speciesGuess}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-auto p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Variations
            </h3>
            <div className="space-y-1">
              {variations?.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setActiveVariation(v.id)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm transition ${
                    activeVariationId === v.id
                      ? "bg-green-700 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {v.name}
                </button>
              ))}
              {(!variations || variations.length === 0) && (
                <p className="text-xs text-gray-500">No variations yet</p>
              )}
            </div>
          </div>
        </aside>

        {/* Center - 3D Canvas */}
        <main className="relative flex-1">
          {wsAssets?.meshUrl ? (
            <Scene modelUrl={wsAssets.meshUrl} branchNodes={branchNodes} />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-500">
              Loading 3D model...
            </div>
          )}
        </main>

        {/* Right Sidebar - Inspector */}
        <aside className="w-64 border-l border-gray-700 bg-gray-800">
          <Inspector branches={branchNodes} />
        </aside>
      </div>
    </div>
  );
}
