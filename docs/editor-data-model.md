# Editor Data Model

This document defines the data structures and operations used by the bonsai-3D branch editor.

## Branch Graph Structure

The core data structure is a rooted tree graph representing the bonsai's skeletal structure.

### Node

```typescript
interface BranchNode {
  id: string;                    // unique identifier (ULID)
  parentId: string | null;       // null for root node
  childIds: string[];            // ordered list of child node IDs
  position: Vec3;                // 3D world position [x, y, z]
  radius: number;                // branch radius at this node (meters, normalized)
  branchOrder: number;           // 0 = trunk, 1 = primary branch, 2 = secondary, etc.
  classification: 'trunk' | 'branch' | 'twig' | 'foliage-anchor';
}
```

### Curve Segments

Consecutive nodes along a branch are connected by cubic Bezier curve segments. Each segment stores two control points for smooth interpolation.

```typescript
interface CurveSegment {
  fromNodeId: string;
  toNodeId: string;
  controlPoint1: Vec3;           // Bezier CP1 (relative to fromNode)
  controlPoint2: Vec3;           // Bezier CP2 (relative to toNode)
  radiusProfile: [number, number]; // radius at start, radius at end (for tapering)
}
```

### Branch

A branch is a maximal chain of nodes between two junction points (or a junction and a tip).

```typescript
interface Branch {
  id: string;
  nodeIds: string[];             // ordered from base to tip
  segments: CurveSegment[];
  order: number;                 // branch order (inherited from nodes)
  parentBranchId: string | null;
  childBranchIds: string[];
}
```

## Foliage Clusters

Foliage is modeled as clusters anchored to branch nodes rather than as individual leaves.

```typescript
interface FoliageCluster {
  id: string;
  anchorNodeId: string;          // branch node this cluster is attached to
  center: Vec3;                  // cluster center (world space)
  radius: number;                // bounding sphere radius
  density: number;               // 0-1, controls rendering density
  shape: 'sphere' | 'ellipsoid' | 'cone' | 'cloud';
  orientation: Quaternion;       // rotation for non-spherical shapes
  meshVertexIndices: number[];   // indices into the foliage mesh
}
```

## Mesh Binding

The original reconstructed mesh is bound to the branch skeleton so that edits to the skeleton deform the mesh accordingly.

### Vertex Weights

Each mesh vertex is bound to one or more skeleton segments with weights.

```typescript
interface VertexBinding {
  vertexIndex: number;
  bindings: Array<{
    segmentId: string;           // curve segment ID
    t: number;                   // parameter along the segment (0-1)
    weight: number;              // influence weight (0-1, sum to 1.0)
    branchDistance: number;      // signed distance from branch centerline
    radialOffset: Vec2;          // offset in the segment's local radial plane
  }>;
}
```

### Binding Strategy

- Vertices within 1.5x the local branch radius are bound to the nearest segment.
- Trunk vertices use single-segment binding (weight = 1.0) for stability.
- Junction vertices use multi-segment blending (up to 3 segments) for smooth transitions.
- Foliage vertices are bound loosely (larger radial offsets) to allow natural-looking deformation.

## Deformation Model

### Skeletal Deformation

When a branch node is moved or rotated, the deformation propagates:

1. Compute the transform delta at the edited node.
2. Propagate the transform down the subtree with distance-based attenuation.
3. Update Bezier control points to maintain curve smoothness.
4. For each affected segment, recompute bound vertex positions using their stored `t`, `branchDistance`, and `radialOffset` values.

### Curve-Driven Deformation

For bend operations, the deformation is driven by the curve shape rather than rigid node transforms:

1. The user drags a point on the curve, creating a new target position.
2. The curve is re-solved (control points updated) to pass through the target.
3. Vertices slide along the curve and maintain their radial offsets.
4. Radius tapering is preserved automatically via the `radiusProfile`.

## Edit Operations

All operations implement a common interface:

```typescript
interface EditOperation {
  type: string;
  timestamp: number;
  targetIds: string[];           // node or branch IDs affected
  params: Record<string, unknown>;
  apply(graph: BranchGraph): BranchGraph;
  invert(): EditOperation;       // returns the inverse operation for undo
}
```

### Supported Operations

| Operation | Target | Parameters | Description |
|---|---|---|---|
| `bend` | CurveSegment | `t: number, offset: Vec3` | Bend a branch at parameter t by the given offset |
| `rotate` | BranchNode | `axis: Vec3, angle: number` | Rotate a subtree around the node |
| `translate` | BranchNode | `delta: Vec3` | Move a node (and subtree) by delta |
| `prune` | Branch | `t: number` | Cut a branch at parameter t, removing the distal portion |
| `scale-radius` | Branch | `factor: number` | Scale branch thickness uniformly |
| `taper` | Branch | `startFactor: number, endFactor: number` | Adjust radius tapering along the branch |
| `adjust-foliage` | FoliageCluster | `density: number, radius: number` | Modify foliage cluster properties |
| `reattach` | Branch | `newParentNodeId: string` | Move a branch to a different parent node |

## Variation Model

Variations allow users to explore different styling options without destroying the original reconstruction.

### Principles

- The **original** branch graph (from skeleton extraction) is immutable once created.
- Each **variation** is stored as an ordered list of edit operations (an edit log).
- To display a variation, start from the original graph and replay the edit log.
- Variations can be forked: create a new variation by copying another's edit log and appending further edits.

### Variation Record

```typescript
interface Variation {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  parentVariationId: string | null; // null = based on original
  forkPoint: number;                // index in parent's edit log where this variation diverged
  editLog: EditOperation[];
  createdAt: Date;
  updatedAt: Date;
  thumbnailUrl: string | null;
}
```

### Storage

- Edit logs are stored as JSON in S3 (`variations/{id}/edit-log.json`).
- The Postgres `variations` table stores metadata (name, parent, timestamps).
- Optionally, a baked mesh snapshot can be cached in S3 for quick preview loading.

## Undo / Redo

The editor uses a command pattern for undo/redo:

1. Every edit operation knows how to `invert()` itself (e.g., a `translate` by `+delta` inverts to `-delta`).
2. The editor maintains two stacks: `undoStack` and `redoStack`.
3. When an operation is applied, it is pushed onto `undoStack` and `redoStack` is cleared.
4. **Undo**: Pop from `undoStack`, apply its inverse, push the inverse onto `redoStack`.
5. **Redo**: Pop from `redoStack`, apply it, push onto `undoStack`.
6. The stacks are capped at 100 entries to limit memory usage.

Changes are auto-saved to the variation's edit log on a debounced interval (every 2 seconds of inactivity).
