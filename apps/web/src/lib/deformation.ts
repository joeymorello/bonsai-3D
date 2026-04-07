// ---------------------------------------------------------------------------
// Branch deformation utilities
// ---------------------------------------------------------------------------

import type { Vector3 as V3 } from "three";
import { Vector3, Quaternion, Matrix4 } from "three";

/** A single point on a branch curve with position and radius. */
export interface CurvePoint {
  position: [number, number, number];
  radius: number;
}

/** Represents a branch skeleton node in the tree graph. */
export interface BranchNode {
  id: string;
  parentId: string | null;
  curvePoints: CurvePoint[];
  rotation: [number, number, number, number]; // quaternion xyzw
  children: string[];
}

// ---- Curve helpers --------------------------------------------------------

/**
 * Evaluate a point on a cubic Catmull-Rom spline defined by `points`.
 * `t` ranges from 0..1 across the full curve.
 */
export function interpolateCurve(
  points: CurvePoint[],
  t: number,
): { position: Vector3; radius: number } {
  const n = points.length;
  if (n === 0) throw new Error("Empty curve");
  if (n === 1 || t <= 0) {
    const p = points[0]!;
    return { position: new Vector3(...p.position), radius: p.radius };
  }
  if (t >= 1) {
    const p = points[n - 1]!;
    return { position: new Vector3(...p.position), radius: p.radius };
  }

  const segCount = n - 1;
  const rawIdx = t * segCount;
  const idx = Math.floor(rawIdx);
  const local = rawIdx - idx;

  const p0 = points[Math.max(idx - 1, 0)]!;
  const p1 = points[idx]!;
  const p2 = points[Math.min(idx + 1, n - 1)]!;
  const p3 = points[Math.min(idx + 2, n - 1)]!;

  const pos = catmullRom(
    new Vector3(...p0.position),
    new Vector3(...p1.position),
    new Vector3(...p2.position),
    new Vector3(...p3.position),
    local,
  );

  const radius =
    p1.radius + (p2.radius - p1.radius) * local;

  return { position: pos, radius };
}

function catmullRom(p0: V3, p1: V3, p2: V3, p3: V3, t: number): Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return new Vector3(
    0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  );
}

// ---- Branch deformations --------------------------------------------------

/**
 * Bend a branch curve by displacing a control point at `handleIndex`
 * by the given `delta` vector. Neighbouring points receive a falloff.
 */
export function bendBranch(
  curvePoints: CurvePoint[],
  handleIndex: number,
  delta: [number, number, number],
  falloff = 2,
): CurvePoint[] {
  const d = new Vector3(...delta);
  return curvePoints.map((cp, i) => {
    const dist = Math.abs(i - handleIndex);
    const weight = Math.max(0, 1 - dist / falloff);
    if (weight === 0) return cp;
    const offset = d.clone().multiplyScalar(weight);
    return {
      ...cp,
      position: [
        cp.position[0] + offset.x,
        cp.position[1] + offset.y,
        cp.position[2] + offset.z,
      ] as [number, number, number],
    };
  });
}

/**
 * Rotate a branch node around a given axis by `angle` radians.
 * Returns a new rotation quaternion (xyzw).
 */
export function rotateBranch(
  node: BranchNode,
  axis: [number, number, number],
  angle: number,
): [number, number, number, number] {
  const existing = new Quaternion(
    node.rotation[0],
    node.rotation[1],
    node.rotation[2],
    node.rotation[3],
  );
  const delta = new Quaternion().setFromAxisAngle(
    new Vector3(...axis).normalize(),
    angle,
  );
  const result = delta.multiply(existing);
  return [result.x, result.y, result.z, result.w];
}

/**
 * After transforming a parent branch, propagate the delta transform to all
 * descendants in the branch graph.
 */
export function propagateToDescendants(
  nodes: Map<string, BranchNode>,
  parentId: string,
  transform: Matrix4,
): Map<string, BranchNode> {
  const updated = new Map(nodes);
  const queue = [parentId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = updated.get(currentId);
    if (!node) continue;

    for (const childId of node.children) {
      const child = updated.get(childId);
      if (!child) continue;

      const newPoints = child.curvePoints.map((cp) => {
        const v = new Vector3(...cp.position).applyMatrix4(transform);
        return {
          ...cp,
          position: [v.x, v.y, v.z] as [number, number, number],
        };
      });

      updated.set(childId, { ...child, curvePoints: newPoints });
      queue.push(childId);
    }
  }

  return updated;
}
