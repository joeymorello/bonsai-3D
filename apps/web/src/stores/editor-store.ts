import { create } from "zustand";
import {
  bendBranch as applyBend,
  type CurvePoint,
} from "@/lib/deformation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActiveTool = "orbit" | "style" | "clipper";

export interface ViewerState {
  cameraPosition: [number, number, number];
  showSkeleton: boolean;
  showWireframe: boolean;
  showFoliage: boolean;
  clipHeight: number;
}

export interface SelectionState {
  selectedBranchId: string | null;
  selectedClusterId: string | null;
}

export interface ToolState {
  activeTool: ActiveTool;
}

export interface VariationState {
  activeVariationId: string | null;
  isDirty: boolean;
}

export interface OperationRecord {
  type: "bend" | "rotate" | "prune" | "prune_cluster";
  branchId: string;
  params: Record<string, unknown>;
  /** Inverse operation for undo. */
  inverse: Record<string, unknown>;
}

export interface OperationHistory {
  undoStack: OperationRecord[];
  redoStack: OperationRecord[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Lightweight branch data as stored in the editor. */
export interface EditorBranch {
  id: string;
  parentId: string | null;
  curvePoints: CurvePoint[];
  radius: number;
  isPruned: boolean;
}

export interface EditorStore {
  viewer: ViewerState;
  selection: SelectionState;
  tool: ToolState;
  variation: VariationState;
  history: OperationHistory;
  branches: Map<string, EditorBranch>;

  // Branch data management
  loadBranches: (branches: EditorBranch[]) => void;
  getBranch: (id: string) => EditorBranch | undefined;

  // Selection
  selectBranch: (branchId: string | null) => void;
  selectCluster: (clusterId: string | null) => void;

  // Tools
  setTool: (tool: ActiveTool) => void;

  // Viewer toggles
  toggleSkeleton: () => void;
  toggleWireframe: () => void;
  toggleFoliage: () => void;
  setCameraPosition: (pos: [number, number, number]) => void;
  setClipHeight: (h: number) => void;
  pruneAboveClip: () => void;
  pruneBelowClip: () => void;

  // Branch operations
  bendBranch: (branchId: string, handleIndex: number, delta: [number, number, number]) => void;
  rotateBranch: (branchId: string, axis: [number, number, number], angle: number) => void;
  pruneBranch: (branchId: string) => void;
  pruneCluster: (clusterId: string) => void;

  // History
  undo: () => void;
  redo: () => void;

  // Style presets
  applyStylePreset: (apply: (branches: Map<string, EditorBranch>) => Map<string, EditorBranch>) => void;

  // Variation
  setActiveVariation: (variationId: string | null) => void;
  markDirty: () => void;
  markClean: () => void;
  saveVariation: () => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  viewer: {
    cameraPosition: [3, 3, 3],
    showSkeleton: true,
    showWireframe: false,
    showFoliage: true,
    clipHeight: 0.3,
  },
  selection: {
    selectedBranchId: null,
    selectedClusterId: null,
  },
  tool: {
    activeTool: "orbit",
  },
  variation: {
    activeVariationId: null,
    isDirty: false,
  },
  history: {
    undoStack: [],
    redoStack: [],
  },
  branches: new Map(),

  // ---- Branch data --------------------------------------------------------

  loadBranches: (branches) =>
    set(() => ({
      branches: new Map(branches.map((b) => [b.id, b])),
    })),

  getBranch: (id) => get().branches.get(id),

  // ---- Selection ----------------------------------------------------------

  selectBranch: (branchId) =>
    set((s) => ({
      selection: { ...s.selection, selectedBranchId: branchId },
    })),

  selectCluster: (clusterId) =>
    set((s) => ({
      selection: { ...s.selection, selectedClusterId: clusterId },
    })),

  // ---- Tools --------------------------------------------------------------

  setTool: (activeTool) =>
    set(() => ({ tool: { activeTool } })),

  // ---- Viewer toggles -----------------------------------------------------

  toggleSkeleton: () =>
    set((s) => ({
      viewer: { ...s.viewer, showSkeleton: !s.viewer.showSkeleton },
    })),

  toggleWireframe: () =>
    set((s) => ({
      viewer: { ...s.viewer, showWireframe: !s.viewer.showWireframe },
    })),

  toggleFoliage: () =>
    set((s) => ({
      viewer: { ...s.viewer, showFoliage: !s.viewer.showFoliage },
    })),

  setCameraPosition: (pos) =>
    set((s) => ({ viewer: { ...s.viewer, cameraPosition: pos } })),

  setClipHeight: (h) =>
    set((s) => ({ viewer: { ...s.viewer, clipHeight: h } })),

  pruneAboveClip: () => {
    const { branches, viewer } = get();
    const updated = new Map(branches);
    for (const [id, branch] of updated) {
      const above = branch.curvePoints.filter((cp) => cp.position[1] > viewer.clipHeight);
      if (above.length > branch.curvePoints.length / 2) {
        updated.set(id, { ...branch, isPruned: true });
      }
    }
    set(() => ({ branches: updated, variation: { ...get().variation, isDirty: true } }));
  },

  pruneBelowClip: () => {
    const { branches, viewer } = get();
    const updated = new Map(branches);
    for (const [id, branch] of updated) {
      const below = branch.curvePoints.filter((cp) => cp.position[1] < viewer.clipHeight);
      if (below.length > branch.curvePoints.length / 2) {
        updated.set(id, { ...branch, isPruned: true });
      }
    }
    set(() => ({ branches: updated, variation: { ...get().variation, isDirty: true } }));
  },

  // ---- Branch operations --------------------------------------------------

  bendBranch: (branchId, handleIndex, delta) => {
    const branch = get().branches.get(branchId);
    if (!branch) return;

    const newPoints = applyBend(branch.curvePoints, handleIndex, delta);
    const updated = new Map(get().branches);
    updated.set(branchId, { ...branch, curvePoints: newPoints });

    const op: OperationRecord = {
      type: "bend",
      branchId,
      params: { handleIndex, delta },
      inverse: {
        handleIndex,
        delta: [-delta[0], -delta[1], -delta[2]],
      },
    };
    set(() => ({ branches: updated }));
    pushOperation(set, get, op);
  },

  rotateBranch: (branchId, axis, angle) => {
    const op: OperationRecord = {
      type: "rotate",
      branchId,
      params: { axis, angle },
      inverse: { axis, angle: -angle },
    };
    pushOperation(set, get, op);
  },

  pruneBranch: (branchId) => {
    const branch = get().branches.get(branchId);
    if (!branch) return;

    const updated = new Map(get().branches);
    updated.set(branchId, { ...branch, isPruned: true });

    const op: OperationRecord = {
      type: "prune",
      branchId,
      params: {},
      inverse: {},
    };
    set(() => ({
      branches: updated,
      selection: { selectedBranchId: null, selectedClusterId: null },
    }));
    pushOperation(set, get, op);
  },

  pruneCluster: (clusterId) => {
    const op: OperationRecord = {
      type: "prune_cluster",
      branchId: clusterId,
      params: {},
      inverse: {},
    };
    pushOperation(set, get, op);
  },

  // ---- Style presets ------------------------------------------------------

  applyStylePreset: (apply) => {
    const result = apply(get().branches);
    set(() => ({ branches: result, variation: { ...get().variation, isDirty: true } }));
  },

  // ---- History ------------------------------------------------------------

  undo: () =>
    set((s) => {
      const stack = [...s.history.undoStack];
      const op = stack.pop();
      if (!op) return s;
      return {
        history: {
          undoStack: stack,
          redoStack: [...s.history.redoStack, op],
        },
        variation: { ...s.variation, isDirty: true },
      };
    }),

  redo: () =>
    set((s) => {
      const stack = [...s.history.redoStack];
      const op = stack.pop();
      if (!op) return s;
      return {
        history: {
          undoStack: [...s.history.undoStack, op],
          redoStack: stack,
        },
        variation: { ...s.variation, isDirty: true },
      };
    }),

  // ---- Variation ----------------------------------------------------------

  setActiveVariation: (variationId) =>
    set((s) => ({
      variation: { ...s.variation, activeVariationId: variationId },
    })),

  markDirty: () =>
    set((s) => ({
      variation: { ...s.variation, isDirty: true },
    })),

  markClean: () =>
    set((s) => ({
      variation: { ...s.variation, isDirty: false },
    })),

  saveVariation: async () => {
    const state = get();
    const variationId = state.variation.activeVariationId;
    if (!variationId) return;

    // Persist each operation from the undo stack that hasn't been saved
    const { addOperation } = await import("@/lib/api");
    for (const op of state.history.undoStack) {
      const apiType = op.type === "bend" ? "bend_branch"
        : op.type === "rotate" ? "rotate_branch"
        : op.type === "prune" ? "prune_segment"
        : op.type === "prune_cluster" ? "hide_leaf_cluster"
        : "translate_branch";

      await addOperation(variationId, {
        type: op.type as "bend" | "rotate" | "prune" | "prune_cluster",
        branchId: op.branchId,
        params: op.params,
      }).catch(() => {/* ignore duplicate saves */});
    }

    set((s) => ({
      variation: { ...s.variation, isDirty: false },
    }));
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushOperation(
  set: (fn: (s: EditorStore) => Partial<EditorStore>) => void,
  _get: () => EditorStore,
  op: OperationRecord,
) {
  set((s) => ({
    history: {
      undoStack: [...s.history.undoStack, op],
      redoStack: [], // clear redo on new operation
    },
    variation: { ...s.variation, isDirty: true },
  }));
}
