import type { Vector3, Matrix4 } from "three";

/** A single branch in the skeleton tree. */
export interface BranchNode {
  /** Unique identifier for this branch. */
  id: string;
  /** Parent branch ID, null for the root/trunk. */
  parentId: string | null;
  /** Ordered control points defining the branch curve in world space. */
  curvePoints: Vector3[];
  /** Average radius of the branch cross-section. */
  radius: number;
  /** Rest-pose transform relative to the parent attachment point. */
  restTransform: Matrix4;
  /** Whether this branch has been pruned (hidden). */
  isPruned: boolean;
  /** IDs of child branches attached to this branch. */
  childIds: string[];
}

/** Complete branch skeleton for a bonsai model. */
export interface BranchGraph {
  /** Map of branch ID to branch node. */
  nodes: Map<string, BranchNode>;
  /** ID of the root/trunk branch. */
  rootId: string;
  /** Metadata from the extraction process. */
  metadata: Record<string, unknown>;
}

/** Types of deformation operations. */
export type DeformationType = "bend" | "rotate" | "translate" | "prune";

/** A single deformation operation to apply to the skeleton. */
export interface DeformationOp {
  /** Type of deformation. */
  type: DeformationType;
  /** Target branch ID. */
  branchId: string;
  /** Operation-specific parameters. */
  params: {
    /** For bend: index of the control point handle being dragged. */
    handleIndex?: number;
    /** For bend/translate: displacement vector [x, y, z]. */
    delta?: [number, number, number];
    /** For rotate: rotation axis [x, y, z]. */
    axis?: [number, number, number];
    /** For rotate: rotation angle in radians. */
    angle?: number;
  };
}

/** A cluster of foliage geometry attached to a branch. */
export interface FoliageCluster {
  /** Unique identifier for this cluster. */
  id: string;
  /** Branch this cluster is attached to. */
  branchId: string;
  /** Position along the branch curve (world space). */
  position: Vector3;
  /** Scale factor for the foliage cluster. */
  scale: Vector3;
  /** Indices of vertices in the mesh belonging to this cluster. */
  vertices: number[];
}
