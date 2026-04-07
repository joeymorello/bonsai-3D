# ADR-003: Editor Data Model

## Status

Accepted

## Date

2026-04-07

## Context

The bonsai-3D editor needs a data model that supports:

- Semantic editing of bonsai branches (bend, rotate, prune) rather than raw mesh manipulation.
- Smooth, natural-looking deformation of the 3D mesh when the skeleton is edited.
- Non-destructive exploration of multiple styling variations from the same source model.
- Undo/redo for all operations.
- Efficient storage and fast variation switching.

## Decision

### Branch Graph with Spline Model

We represent the bonsai skeleton as a rooted tree graph where nodes are connected by cubic Bezier curve segments.

- **Nodes** store position, radius, branch order, and classification (trunk/branch/twig/foliage-anchor).
- **Curve segments** between nodes store Bezier control points and radius profiles for smooth interpolation and tapering.
- **Branches** are maximal node chains between junctions, providing a higher-level editing unit.
- The mesh is **bound** to the skeleton via per-vertex weights that encode each vertex's position relative to the nearest curve segment (parameter `t`, radial offset, branch distance).

This representation allows edits to the skeleton to automatically produce smooth, natural mesh deformation by recomputing vertex positions from their stored bindings.

### Structural Pruning over Mesh Booleans

Pruning is implemented as a graph operation (remove a subtree from the branch graph) rather than a mesh boolean (subtract a cutting volume from the mesh).

- When a branch is pruned at parameter `t`, all nodes distal to the cut point are removed from the graph.
- Mesh vertices bound to removed segments are hidden.
- The cut face is closed with a simple cap (disc at the cut radius).

### Operation-Log Variations

Variations are stored as ordered lists of edit operations rather than as full mesh copies.

- The original branch graph from skeleton extraction is immutable.
- Each variation records an **edit log**: a sequence of operations applied to the original.
- Displaying a variation means replaying its edit log from the original state.
- Forking a variation copies the parent's edit log and appends new operations.

## Alternatives Considered

### Direct mesh editing (vertex displacement)

Rejected. Moving individual vertices does not encode branch semantics. Users cannot "bend a branch" or "prune at this point" -- they can only push vertices around. This fails the core use case of bonsai styling, which is about understanding and manipulating tree structure.

### Mesh booleans for pruning

Rejected. Boolean operations on meshes are computationally expensive, prone to artifacts (non-manifold edges, self-intersections), and difficult to undo cleanly. Graph-based pruning is instantaneous, artifact-free, and trivially reversible.

### Full mesh snapshots for variations

Rejected. A 100k-triangle mesh is approximately 5-10 MB as GLB. Storing a full mesh per variation would consume significant storage and make variation creation slow. An edit log of 50 operations is typically under 50 KB, and replaying it takes under 1 second.

### Catmull-Rom splines instead of cubic Bezier

Considered but rejected. Bezier curves give explicit control point manipulation, which maps more naturally to user-driven bend operations. Catmull-Rom curves pass through all control points, which can cause unexpected oscillation when editing dense node sequences.

### ECS (Entity-Component-System) architecture

Considered for the editor runtime. Rejected as over-engineered for our scope. The branch graph is a well-defined tree structure with a small set of operation types. A simpler command-pattern architecture with a typed operation interface provides sufficient extensibility without ECS complexity.

## Consequences

- **Positive**: Semantic editing operations that match bonsai styling vocabulary. Smooth deformation via curve-driven binding. Lightweight, non-destructive variations. Clean undo/redo via invertible operations. Fast variation switching (replay log, not load mesh).
- **Negative**: Skeleton extraction quality directly impacts editor usability (garbage in, garbage out). Mesh binding computation is an upfront cost (~2-5 seconds for 100k vertices). Complex binding logic at branch junctions requires careful blending.
- **Mitigations**: Skeleton extraction is iteratively improvable without changing the editor data model. Binding is computed once and cached. Junction blending uses a simple distance-weighted scheme that handles most cases well.
