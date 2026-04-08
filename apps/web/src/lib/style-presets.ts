/**
 * Bonsai style presets that apply predefined deformations to the skeleton.
 * Each preset defines a set of operations relative to the current branch graph.
 */

import type { EditorBranch } from "@/stores/editor-store";
import { bendBranch as applyBend, type CurvePoint } from "./deformation";

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  apply: (branches: Map<string, EditorBranch>) => Map<string, EditorBranch>;
}

function sortBranchesByHeight(branches: Map<string, EditorBranch>): EditorBranch[] {
  return [...branches.values()]
    .filter((b) => !b.isPruned && b.curvePoints.length >= 2)
    .sort((a, b) => {
      const aY = a.curvePoints[0]?.position[1] ?? 0;
      const bY = b.curvePoints[0]?.position[1] ?? 0;
      return aY - bY;
    });
}

/** Formal Upright (Chokkan): straight trunk, symmetrical branches tapering upward */
const formalUpright: StylePreset = {
  id: "chokkan",
  name: "Formal Upright",
  description: "Straight trunk with symmetrical horizontal branches",
  apply: (branches) => {
    const updated = new Map(branches);
    const sorted = sortBranchesByHeight(updated);

    for (let i = 0; i < sorted.length; i++) {
      const branch = sorted[i]!;
      // Slightly flatten branches horizontally
      const midIdx = Math.floor(branch.curvePoints.length / 2);
      const flattenDelta: [number, number, number] = [0, -0.02 * (i + 1) / sorted.length, 0];
      const newPoints = applyBend(branch.curvePoints, midIdx, flattenDelta, 3);
      updated.set(branch.id, { ...branch, curvePoints: newPoints });
    }

    return updated;
  },
};

/** Informal Upright (Moyogi): curved trunk, natural asymmetry */
const informalUpright: StylePreset = {
  id: "moyogi",
  name: "Informal Upright",
  description: "Gently curved trunk with natural branch placement",
  apply: (branches) => {
    const updated = new Map(branches);
    const sorted = sortBranchesByHeight(updated);

    for (let i = 0; i < sorted.length; i++) {
      const branch = sorted[i]!;
      const midIdx = Math.floor(branch.curvePoints.length / 2);
      // Alternating gentle S-curves
      const direction = i % 2 === 0 ? 1 : -1;
      const intensity = 0.03 * (1 - i / sorted.length);
      const delta: [number, number, number] = [direction * intensity, -intensity * 0.5, 0];
      const newPoints = applyBend(branch.curvePoints, midIdx, delta, 3);
      updated.set(branch.id, { ...branch, curvePoints: newPoints });
    }

    return updated;
  },
};

/** Slanting (Shakan): trunk leaning to one side */
const slanting: StylePreset = {
  id: "shakan",
  name: "Slanting",
  description: "Trunk leans to one side at an angle",
  apply: (branches) => {
    const updated = new Map(branches);

    for (const [id, branch] of updated) {
      if (branch.isPruned) continue;
      // Push all branches in one direction based on height
      const newPoints = branch.curvePoints.map((cp, i) => {
        const heightFactor = cp.position[1] * 0.15;
        return {
          ...cp,
          position: [
            cp.position[0] + heightFactor,
            cp.position[1],
            cp.position[2] + heightFactor * 0.3,
          ] as [number, number, number],
        };
      });
      updated.set(id, { ...branch, curvePoints: newPoints });
    }

    return updated;
  },
};

/** Cascade (Kengai): trunk cascades below the pot line */
const cascade: StylePreset = {
  id: "kengai",
  name: "Cascade",
  description: "Trunk cascades downward below the pot",
  apply: (branches) => {
    const updated = new Map(branches);

    for (const [id, branch] of updated) {
      if (branch.isPruned) continue;
      const newPoints = branch.curvePoints.map((cp) => {
        const heightFactor = Math.max(0, cp.position[1] - 0.2);
        return {
          ...cp,
          position: [
            cp.position[0] + heightFactor * 0.3,
            cp.position[1] - heightFactor * 0.5,
            cp.position[2],
          ] as [number, number, number],
        };
      });
      updated.set(id, { ...branch, curvePoints: newPoints });
    }

    return updated;
  },
};

/** Windswept (Fukinagashi): all branches swept in one direction */
const windswept: StylePreset = {
  id: "fukinagashi",
  name: "Windswept",
  description: "Branches swept strongly in one direction by wind",
  apply: (branches) => {
    const updated = new Map(branches);

    for (const [id, branch] of updated) {
      if (branch.isPruned) continue;
      const newPoints = branch.curvePoints.map((cp, i) => {
        const factor = (i / Math.max(branch.curvePoints.length - 1, 1)) * 0.1;
        return {
          ...cp,
          position: [
            cp.position[0] + factor,
            cp.position[1] - factor * 0.2,
            cp.position[2] + factor * 0.5,
          ] as [number, number, number],
        };
      });
      updated.set(id, { ...branch, curvePoints: newPoints });
    }

    return updated;
  },
};

export const STYLE_PRESETS: StylePreset[] = [
  formalUpright,
  informalUpright,
  slanting,
  cascade,
  windswept,
];
