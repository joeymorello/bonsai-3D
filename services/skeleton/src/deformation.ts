import { Vector3, Matrix4, Quaternion, Euler } from "three";
import type { BranchGraph, BranchNode, DeformationOp } from "./types.js";

/**
 * Bend a branch by modifying a control point and propagating to children.
 *
 * @param graph - The branch graph to modify (mutated in place).
 * @param branchId - ID of the branch to bend.
 * @param handleIndex - Index of the control point to move.
 * @param delta - Displacement vector [x, y, z].
 * @returns The modified graph.
 */
export function bendBranch(
  graph: BranchGraph,
  branchId: string,
  handleIndex: number,
  delta: [number, number, number],
): BranchGraph {
  const branch = graph.nodes.get(branchId);
  if (!branch || branch.isPruned) return graph;

  const deltaVec = new Vector3(...delta);

  // Move the target control point
  if (handleIndex >= 0 && handleIndex < branch.curvePoints.length) {
    branch.curvePoints[handleIndex].add(deltaVec);

    // Smoothly attenuate the displacement to neighboring control points
    const falloff = 0.5;
    for (let i = 1; i <= 2; i++) {
      const weight = Math.pow(falloff, i);
      const scaledDelta = deltaVec.clone().multiplyScalar(weight);

      if (handleIndex + i < branch.curvePoints.length) {
        branch.curvePoints[handleIndex + i].add(scaledDelta);
      }
      if (handleIndex - i >= 0) {
        branch.curvePoints[handleIndex - i].add(scaledDelta);
      }
    }
  }

  // Propagate to children: shift their base points
  _propagateToChildren(graph, branchId, deltaVec);

  return graph;
}

/**
 * Rotate a branch around its parent attachment point.
 *
 * @param graph - The branch graph to modify (mutated in place).
 * @param branchId - ID of the branch to rotate.
 * @param axis - Rotation axis [x, y, z] (will be normalized).
 * @param angle - Rotation angle in radians.
 * @returns The modified graph.
 */
export function rotateBranch(
  graph: BranchGraph,
  branchId: string,
  axis: [number, number, number],
  angle: number,
): BranchGraph {
  const branch = graph.nodes.get(branchId);
  if (!branch || branch.isPruned) return graph;

  const axisVec = new Vector3(...axis).normalize();
  const quaternion = new Quaternion().setFromAxisAngle(axisVec, angle);

  // Pivot point is the first control point (attachment to parent)
  const pivot = branch.curvePoints[0].clone();

  // Rotate all control points around the pivot
  for (const point of branch.curvePoints) {
    point.sub(pivot);
    point.applyQuaternion(quaternion);
    point.add(pivot);
  }

  // Update rest transform
  const rotMatrix = new Matrix4().makeRotationFromQuaternion(quaternion);
  branch.restTransform.premultiply(rotMatrix);

  // Recursively rotate children
  _rotateChildren(graph, branchId, pivot, quaternion);

  return graph;
}

/**
 * Translate a branch and all its descendants.
 *
 * @param graph - The branch graph to modify (mutated in place).
 * @param branchId - ID of the branch to translate.
 * @param offset - Translation vector [x, y, z].
 * @returns The modified graph.
 */
export function translateBranch(
  graph: BranchGraph,
  branchId: string,
  offset: [number, number, number],
): BranchGraph {
  const branch = graph.nodes.get(branchId);
  if (!branch || branch.isPruned) return graph;

  const offsetVec = new Vector3(...offset);

  // Move all control points
  for (const point of branch.curvePoints) {
    point.add(offsetVec);
  }

  // Propagate to children
  _propagateToChildren(graph, branchId, offsetVec);

  return graph;
}

/**
 * Mark a branch and all its descendants as pruned.
 *
 * @param graph - The branch graph to modify (mutated in place).
 * @param branchId - ID of the branch to prune.
 * @returns The modified graph.
 */
export function pruneBranch(
  graph: BranchGraph,
  branchId: string,
): BranchGraph {
  const branch = graph.nodes.get(branchId);
  if (!branch) return graph;

  branch.isPruned = true;

  // Recursively prune all descendants
  for (const childId of branch.childIds) {
    pruneBranch(graph, childId);
  }

  return graph;
}

/**
 * Apply a list of deformation operations to produce the final skeleton state.
 *
 * @param graph - The branch graph to modify (mutated in place).
 * @param ops - Ordered list of deformation operations.
 * @returns The modified graph.
 */
export function applyOperations(
  graph: BranchGraph,
  ops: DeformationOp[],
): BranchGraph {
  for (const op of ops) {
    switch (op.type) {
      case "bend":
        if (op.params.handleIndex !== undefined && op.params.delta) {
          bendBranch(graph, op.branchId, op.params.handleIndex, op.params.delta);
        }
        break;

      case "rotate":
        if (op.params.axis && op.params.angle !== undefined) {
          rotateBranch(graph, op.branchId, op.params.axis, op.params.angle);
        }
        break;

      case "translate":
        if (op.params.delta) {
          translateBranch(graph, op.branchId, op.params.delta);
        }
        break;

      case "prune":
        pruneBranch(graph, op.branchId);
        break;
    }
  }

  return graph;
}

// --- Internal helpers ---

function _propagateToChildren(
  graph: BranchGraph,
  branchId: string,
  offset: Vector3,
): void {
  const branch = graph.nodes.get(branchId);
  if (!branch) return;

  for (const childId of branch.childIds) {
    const child = graph.nodes.get(childId);
    if (!child || child.isPruned) continue;

    for (const point of child.curvePoints) {
      point.add(offset);
    }

    _propagateToChildren(graph, childId, offset);
  }
}

function _rotateChildren(
  graph: BranchGraph,
  branchId: string,
  pivot: Vector3,
  quaternion: Quaternion,
): void {
  const branch = graph.nodes.get(branchId);
  if (!branch) return;

  for (const childId of branch.childIds) {
    const child = graph.nodes.get(childId);
    if (!child || child.isPruned) continue;

    for (const point of child.curvePoints) {
      point.sub(pivot);
      point.applyQuaternion(quaternion);
      point.add(pivot);
    }

    _rotateChildren(graph, childId, pivot, quaternion);
  }
}
