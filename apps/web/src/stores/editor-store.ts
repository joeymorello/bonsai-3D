import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActiveTool = "orbit" | "style" | "clipper";

export interface ViewerState {
  cameraPosition: [number, number, number];
  showSkeleton: boolean;
  showWireframe: boolean;
  showFoliage: boolean;
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

export interface EditorStore {
  viewer: ViewerState;
  selection: SelectionState;
  tool: ToolState;
  variation: VariationState;
  history: OperationHistory;

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

  // Branch operations
  bendBranch: (branchId: string, handleIndex: number, delta: [number, number, number]) => void;
  rotateBranch: (branchId: string, axis: [number, number, number], angle: number) => void;
  pruneBranch: (branchId: string) => void;
  pruneCluster: (clusterId: string) => void;

  // History
  undo: () => void;
  redo: () => void;

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

  // ---- Branch operations --------------------------------------------------

  bendBranch: (branchId, handleIndex, delta) => {
    const op: OperationRecord = {
      type: "bend",
      branchId,
      params: { handleIndex, delta },
      inverse: {
        handleIndex,
        delta: [-delta[0], -delta[1], -delta[2]],
      },
    };
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
    const op: OperationRecord = {
      type: "prune",
      branchId,
      params: {},
      inverse: {},
    };
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

  saveVariation: () => {
    // In a real app this would persist to the API
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
