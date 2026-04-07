# QA Acceptance Tests

Checklist of acceptance criteria for each major feature area. All items must pass before a milestone is considered complete.

## Workspace Creation

- [ ] User can create a new workspace with a name and optional description.
- [ ] Workspace appears in the workspace list immediately after creation.
- [ ] Workspace names are unique per user; duplicate names show a validation error.
- [ ] Workspace can be renamed and deleted.
- [ ] Deleting a workspace removes all associated photos, models, and variations from S3.

## Photo Upload

- [ ] User can upload 1-80 photos via drag-and-drop or file picker.
- [ ] Upload progress is shown per-photo and overall.
- [ ] Uploads use presigned URLs (no photo data passes through the API server).
- [ ] Photos appear in a gallery view after upload.
- [ ] Unsupported file types (non-image) are rejected with a clear error message.
- [ ] Photos larger than 50 MB are rejected with a size limit error.
- [ ] Upload can be cancelled mid-flight; partial uploads are cleaned up.

## Photo QA

- [ ] QA runs automatically after all photos are uploaded.
- [ ] Blurry photos are flagged with a blur indicator and excluded from reconstruction.
- [ ] Duplicate photos are detected; only the highest-quality copy is kept.
- [ ] Overexposed/underexposed photos show a warning badge.
- [ ] Coverage gaps are reported with suggested angles for additional photos.
- [ ] User can override QA exclusions and force-include a photo.
- [ ] QA report is viewable as a summary with per-photo details.

## Reconstruction

- [ ] User can start reconstruction after QA passes (or after overriding exclusions).
- [ ] Reconstruction job progress is shown in real time (percentage, current stage).
- [ ] Each pipeline stage (QA, preprocess, reconstruct, cleanup, skeletonize) is visible.
- [ ] If reconstruction fails, the error is shown with a retry option.
- [ ] Reconstruction can be cancelled; partial artifacts are cleaned up.
- [ ] Completed reconstruction produces a cleaned GLB mesh and a branch graph JSON.

## 3D Viewer

- [ ] Reconstructed model loads and displays within 3 seconds of opening the viewer.
- [ ] Orbit, pan, and zoom controls work smoothly (60 fps on mid-range hardware).
- [ ] Trunk and foliage are rendered with distinct materials.
- [ ] Model is correctly oriented (trunk vertical, centered in viewport).
- [ ] Wireframe overlay toggle works.
- [ ] Screenshot capture produces a PNG at viewport resolution.
- [ ] Viewer handles models up to 200k triangles without frame drops below 30 fps.

## Styling Mode (Branch Editor)

- [ ] Branch skeleton overlay is visible and can be toggled.
- [ ] Selecting a branch highlights it and shows its properties panel.
- [ ] Bend operation: dragging a point on a branch curves it smoothly.
- [ ] Rotate operation: rotating a branch node rotates the entire subtree.
- [ ] Translate operation: moving a node displaces it and its subtree.
- [ ] Mesh deforms in real time to follow skeleton edits (< 50 ms latency).
- [ ] Radius scaling changes branch thickness visually.
- [ ] Tapering adjusts thickness gradient from base to tip.
- [ ] Foliage cluster density and radius adjustments are reflected immediately.
- [ ] Undo (Ctrl+Z) reverses the last operation.
- [ ] Redo (Ctrl+Shift+Z) re-applies the undone operation.
- [ ] Undo/redo stack supports at least 50 consecutive operations.

## Clipper Tool (Pruning)

- [ ] Clipper tool activates a cutting plane or point-and-click prune mode.
- [ ] Clicking a branch shows a preview of the cut location.
- [ ] Confirming the cut removes the distal portion of the branch.
- [ ] Pruned branches and their foliage clusters are removed from the view.
- [ ] Pruning is undoable.
- [ ] Pruning a major branch updates the mesh in < 200 ms.

## Variations

- [ ] User can create a new variation from the current state.
- [ ] User can fork an existing variation.
- [ ] Variations are listed with name, timestamp, and thumbnail.
- [ ] Switching between variations replays the correct edit log (< 1 second).
- [ ] Side-by-side comparison of two variations works.
- [ ] Variations can be renamed and deleted.
- [ ] Deleting a variation does not affect the original model or other variations.

## Export

- [ ] Export to GLB produces a valid file loadable in third-party viewers.
- [ ] Export to OBJ produces valid OBJ + MTL files.
- [ ] Export to STL produces a valid mesh (for 3D printing use cases).
- [ ] Exported model reflects the current variation's edits.
- [ ] Export file size is reported before download.

## Performance Targets

| Metric | Target |
|---|---|
| Initial page load (web app) | < 2 seconds |
| Model load in viewer (100k triangles) | < 3 seconds |
| Edit operation feedback (bend/rotate/translate) | < 50 ms |
| Prune operation completion | < 200 ms |
| Variation switch (replay edit log, 50 ops) | < 1 second |
| Photo upload throughput (per photo, 10 MB avg) | < 5 seconds |
| Reconstruction pipeline (40 photos, Meshy) | < 20 minutes end-to-end |
| Concurrent users per instance | >= 20 |
| Viewer frame rate (100k tri model, mid-range GPU) | >= 60 fps |
| Memory usage in viewer (100k tri model) | < 512 MB |
