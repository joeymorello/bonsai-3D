import { useEffect, useMemo, useCallback, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorkspace, getWorkspaceAssets, listVariations, createVariation, exportVariation } from "@/lib/api";
import { useEditorStore } from "@/stores/editor-store";
import type { EditorBranch } from "@/stores/editor-store";
import { Scene } from "@/components/viewer/scene";
import { ComparisonView } from "@/components/viewer/comparison-view";
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

  const queryClient = useQueryClient();
  const activeVariationId = useEditorStore((s) => s.variation.activeVariationId);
  const setActiveVariation = useEditorStore((s) => s.setActiveVariation);
  const isDirty = useEditorStore((s) => s.variation.isDirty);
  const saveVariation = useEditorStore((s) => s.saveVariation);
  const [showNewVariation, setShowNewVariation] = useState(false);
  const [newVariationName, setNewVariationName] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<"glb" | "obj">("glb");
  const [showComparison, setShowComparison] = useState(false);

  const exportMutation = useMutation({
    mutationFn: () => {
      if (!activeVariationId) throw new Error("No variation selected");
      return exportVariation(activeVariationId, exportFormat);
    },
    onSuccess: (data) => {
      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      }
      setShowExport(false);
    },
  });

  const createVariationMutation = useMutation({
    mutationFn: (name: string) => createVariation(id!, { name }),
    onSuccess: (v) => {
      queryClient.invalidateQueries({ queryKey: ["variations", id] });
      setActiveVariation(v.id);
      setShowNewVariation(false);
      setNewVariationName("");
    },
  });

  // Auto-select first variation if none selected
  useEffect(() => {
    if (!activeVariationId && variations && variations.length > 0) {
      setActiveVariation(variations[0]!.id);
    }
  }, [activeVariationId, variations, setActiveVariation]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;

      const store = useEditorStore.getState();

      if (e.key === "o" || e.key === "O") { store.setTool("orbit"); return; }
      if (e.key === "s" && !e.ctrlKey && !e.metaKey) { store.setTool("style"); return; }
      if (e.key === "c" || e.key === "C") { store.setTool("clipper"); return; }
      if (e.key === "Escape") { store.selectBranch(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (store.selection.selectedBranchId) {
          store.pruneBranch(store.selection.selectedBranchId);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); store.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveVariation(); return; }
    },
    [saveVariation],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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
        <div className="flex items-center gap-2">
          <button
            onClick={saveVariation}
            disabled={!isDirty}
            className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-40"
          >
            Save
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              disabled={!activeVariationId}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-600 bg-gray-800 p-3 shadow-xl">
                <h4 className="mb-2 text-xs font-medium text-gray-300">Export Format</h4>
                <div className="mb-3 space-y-1">
                  {(["glb", "obj"] as const).map((fmt) => (
                    <label key={fmt} className="flex items-center gap-2 text-xs text-gray-300">
                      <input
                        type="radio"
                        name="format"
                        checked={exportFormat === fmt}
                        onChange={() => setExportFormat(fmt)}
                        className="accent-blue-500"
                      />
                      {fmt.toUpperCase()}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                  className="w-full rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {exportMutation.isPending ? "Exporting..." : "Download"}
                </button>
              </div>
            )}
          </div>
        </div>
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
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Variations
              </h3>
              <button
                onClick={() => setShowNewVariation(true)}
                className="rounded px-1.5 py-0.5 text-xs text-gray-400 transition hover:bg-gray-700 hover:text-white"
                title="New Variation"
              >
                +
              </button>
            </div>
            {showNewVariation && (
              <form
                className="mb-2 flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newVariationName.trim()) {
                    createVariationMutation.mutate(newVariationName.trim());
                  }
                }}
              >
                <input
                  type="text"
                  value={newVariationName}
                  onChange={(e) => setNewVariationName(e.target.value)}
                  placeholder="Name..."
                  autoFocus
                  className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-green-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={createVariationMutation.isPending}
                  className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                >
                  Add
                </button>
              </form>
            )}
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

            {/* Compare button */}
            {variations && variations.length >= 2 && (
              <button
                onClick={() => setShowComparison(true)}
                className="mt-3 w-full rounded border border-gray-600 px-2 py-1.5 text-xs text-gray-400 transition hover:border-blue-500 hover:text-white"
              >
                Compare Variations
              </button>
            )}
          </div>
        </aside>

        {/* Center - 3D Canvas */}
        <main className="relative flex-1">
          {/* Comparison overlay */}
          {showComparison && wsAssets?.meshUrl && (
            <ComparisonView
              modelUrl={wsAssets.meshUrl}
              leftBranches={branchNodes}
              rightBranches={branchNodes}
              leftLabel={variations?.find((v) => v.id === activeVariationId)?.name ?? "Current"}
              rightLabel="Original"
              onClose={() => setShowComparison(false)}
            />
          )}

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
