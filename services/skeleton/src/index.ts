export type {
  BranchNode,
  BranchGraph,
  DeformationOp,
  FoliageCluster,
  DeformationType,
} from "./types.js";

export {
  bendBranch,
  rotateBranch,
  translateBranch,
  pruneBranch,
  applyOperations,
} from "./deformation.js";
