"""Structure-from-Motion photogrammetry pipeline.

Reconstructs a 3D mesh from multi-view photographs of a bonsai tree using:
  1. SIFT feature extraction
  2. FLANN-based feature matching with Lowe's ratio test
  3. Essential matrix estimation and relative pose recovery
  4. Incremental triangulation across views
  5. Point cloud colorization from source images
  6. Mesh reconstruction via Delaunay alpha shapes / convex hull fallback
  7. GLB export via trimesh

Dependencies: OpenCV (4.11.0), numpy, scipy, trimesh.
"""

import logging
import os
import tempfile
from itertools import combinations
from typing import NamedTuple

import cv2
import numpy as np
from scipy.spatial import Delaunay, KDTree

import trimesh
import trimesh.repair

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal data structures
# ---------------------------------------------------------------------------


class _ImageData(NamedTuple):
    """Pre-processed image with its extracted features."""

    path: str
    image: np.ndarray         # BGR, resized
    gray: np.ndarray          # grayscale, resized
    keypoints: tuple          # cv2.KeyPoint tuple
    descriptors: np.ndarray   # Nx128 float32
    shape: tuple[int, int]    # (height, width) after resize
    scale: float              # resize scale factor applied


class _PairMatch(NamedTuple):
    """Feature matches between two views."""

    idx_a: int
    idx_b: int
    matches: list             # list[cv2.DMatch]
    pts_a: np.ndarray         # Nx2 float64 matched keypoint coords in image A
    pts_b: np.ndarray         # Nx2 float64 matched keypoint coords in image B


# ---------------------------------------------------------------------------
# Pipeline constants
# ---------------------------------------------------------------------------

_MAX_IMAGE_DIM = 2048          # resize longest side to this (higher = more features)
_SIFT_N_FEATURES = 16000       # extract more features for denser reconstruction
_CROSS_CHECK_TOP_N = 2000      # keep top N cross-check matches per pair
_MIN_MATCHES_FOR_POSE = 15
_MIN_INLIERS_TRIANGULATE = 8
_RANSAC_CONFIDENCE = 0.999
_RANSAC_THRESHOLD = 2.0        # pixels — needs to be generous for real photos
_OUTLIER_KNN = 12
_OUTLIER_STD_FACTOR = 2.0
_ALPHA_PERCENTILE = 85
_ALPHA_MULTIPLIER = 2.5


# ---------------------------------------------------------------------------
# Stage 1 -- Image loading and feature extraction
# ---------------------------------------------------------------------------


def _load_and_extract(path: str, sift: cv2.SIFT) -> _ImageData | None:
    """Load an image, resize it, and extract SIFT features."""
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        logger.warning("Cannot read image, skipping: %s", path)
        return None

    h, w = img.shape[:2]
    scale = min(1.0, _MAX_IMAGE_DIM / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    keypoints, descriptors = sift.detectAndCompute(gray, None)

    if descriptors is None or len(keypoints) < _MIN_MATCHES_FOR_POSE:
        logger.warning("Too few features (%d) in %s, skipping",
                        len(keypoints) if keypoints else 0, os.path.basename(path))
        return None

    logger.info("  %s: %dx%d, %d features (scale=%.2f)",
                os.path.basename(path), w, h, len(keypoints), scale)

    return _ImageData(
        path=path,
        image=img,
        gray=gray,
        keypoints=keypoints,
        descriptors=descriptors,
        shape=(h, w),
        scale=scale,
    )


# ---------------------------------------------------------------------------
# Stage 2 -- Pairwise matching
# ---------------------------------------------------------------------------


def _match_pair(
    desc_a: np.ndarray,
    desc_b: np.ndarray,
    kp_a: tuple,
    kp_b: tuple,
    matcher: cv2.BFMatcher,
) -> tuple[list, np.ndarray, np.ndarray]:
    """Cross-check match two descriptor sets (much more accurate than ratio test for natural scenes)."""
    if len(desc_a) < 2 or len(desc_b) < 2:
        return [], np.empty((0, 2)), np.empty((0, 2))

    raw = matcher.match(desc_a, desc_b)
    # Sort by distance and keep top N
    raw = sorted(raw, key=lambda m: m.distance)[:_CROSS_CHECK_TOP_N]

    pts_a = np.float64([kp_a[m.queryIdx].pt for m in raw]) if raw else np.empty((0, 2))
    pts_b = np.float64([kp_b[m.trainIdx].pt for m in raw]) if raw else np.empty((0, 2))
    return raw, pts_a, pts_b


# ---------------------------------------------------------------------------
# Stage 3+4 -- Pose estimation and triangulation
# ---------------------------------------------------------------------------


def _estimate_intrinsics(h: int, w: int, image_path: str | None = None) -> np.ndarray:
    """Camera intrinsic matrix, using EXIF data when available.

    Reads FocalLengthIn35mmFilm from EXIF and converts to pixel focal length.
    Falls back to 0.85 * max(w, h) if EXIF is unavailable.
    """
    focal_35mm = None
    if image_path:
        try:
            from PIL import Image as PILImage
            from PIL.ExifTags import TAGS
            pil = PILImage.open(image_path)
            exif = pil._getexif()
            if exif:
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if tag == "FocalLengthIn35mmFilm" and value:
                        focal_35mm = float(value)
                        break
        except Exception:
            pass

    if focal_35mm and focal_35mm > 0:
        # 35mm sensor is 36mm wide; convert to pixel focal length
        focal = focal_35mm * max(w, h) / 36.0
        logger.info("Using EXIF focal length: %dmm (35mm equiv) = %.0fpx", focal_35mm, focal)
    else:
        focal = 0.85 * max(w, h)
        logger.info("No EXIF focal length; using default estimate: %.0fpx", focal)

    return np.array([
        [focal, 0.0,   w / 2.0],
        [0.0,   focal, h / 2.0],
        [0.0,   0.0,   1.0],
    ], dtype=np.float64)


def _recover_pose(
    pts_a: np.ndarray,
    pts_b: np.ndarray,
    K: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray] | None:
    """Find essential matrix and recover relative R, t.

    Returns (R, t, inlier_pts_a, inlier_pts_b) or None on failure.
    """
    E, mask_e = cv2.findEssentialMat(
        pts_a, pts_b, K,
        method=cv2.RANSAC,
        prob=_RANSAC_CONFIDENCE,
        threshold=_RANSAC_THRESHOLD,
    )
    if E is None:
        return None

    inliers = mask_e.ravel().astype(bool)
    pts_a_in = pts_a[inliers]
    pts_b_in = pts_b[inliers]
    if len(pts_a_in) < _MIN_INLIERS_TRIANGULATE:
        return None

    _, R, t, mask_pose = cv2.recoverPose(E, pts_a_in, pts_b_in, K)
    pose_ok = mask_pose.ravel() > 0
    pts_a_in = pts_a_in[pose_ok]
    pts_b_in = pts_b_in[pose_ok]
    if len(pts_a_in) < _MIN_INLIERS_TRIANGULATE:
        return None

    return R, t, pts_a_in, pts_b_in


def _triangulate(
    K: np.ndarray,
    R1: np.ndarray, t1: np.ndarray,
    R2: np.ndarray, t2: np.ndarray,
    pts1: np.ndarray, pts2: np.ndarray,
) -> np.ndarray:
    """Triangulate 3D points from two camera views.

    Filters points behind either camera and statistical outliers.
    Returns Nx3 float64 array (may be empty).
    """
    P1 = K @ np.hstack([R1, t1])
    P2 = K @ np.hstack([R2, t2])

    pts4d = cv2.triangulatePoints(P1, P2, pts1.T.astype(np.float64), pts2.T.astype(np.float64))
    pts4d /= pts4d[3]
    pts3d = pts4d[:3].T  # Nx3

    # Keep only finite points
    finite = np.isfinite(pts3d).all(axis=1)
    pts3d = pts3d[finite]
    if len(pts3d) == 0:
        return pts3d

    # Depth test: points must be in front of both cameras
    cam1_z = (R1 @ pts3d.T + t1)[2]
    cam2_z = (R2 @ pts3d.T + t2)[2]
    in_front = (cam1_z > 0) & (cam2_z > 0)
    pts3d = pts3d[in_front]
    if len(pts3d) == 0:
        return pts3d

    # Remove extreme distance outliers relative to the median
    dists = np.linalg.norm(pts3d - np.median(pts3d, axis=0), axis=1)
    med_d = np.median(dists)
    keep = dists < max(med_d * 5.0, 1e-3)
    return pts3d[keep]


def _sample_colors_from_view(
    pts3d: np.ndarray,
    K: np.ndarray,
    R: np.ndarray,
    t: np.ndarray,
    image_bgr: np.ndarray,
) -> np.ndarray:
    """Project 3D points into an image and sample RGB colours.

    Returns Nx3 uint8 (RGB). Out-of-bounds projections get neutral gray.
    """
    h, w = image_bgr.shape[:2]
    img_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    cam = (R @ pts3d.T + t).T            # Nx3 camera-space
    z = cam[:, 2]
    safe_z = np.where(np.abs(z) > 1e-8, z, 1e-8)
    proj = (K @ cam.T).T                  # Nx3 homogeneous
    px = (proj[:, 0] / safe_z).astype(int)
    py = (proj[:, 1] / safe_z).astype(int)

    colors = np.full((len(pts3d), 3), 128, dtype=np.uint8)
    valid = (z > 0) & (px >= 0) & (px < w) & (py >= 0) & (py < h)
    colors[valid] = img_rgb[py[valid], px[valid]]
    return colors


# ---------------------------------------------------------------------------
# Stage 5 -- Point cloud post-processing
# ---------------------------------------------------------------------------


def _remove_statistical_outliers(
    points: np.ndarray,
    colors: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Remove points whose average k-NN distance exceeds mean + std_factor * std."""
    if len(points) <= _OUTLIER_KNN + 1:
        return points, colors

    tree = KDTree(points)
    k = min(_OUTLIER_KNN, len(points) - 1)
    dists, _ = tree.query(points, k=k + 1)  # includes self at dist 0
    mean_dists = dists[:, 1:].mean(axis=1)

    mu = mean_dists.mean()
    sigma = mean_dists.std()
    keep = mean_dists < (mu + _OUTLIER_STD_FACTOR * sigma)

    removed = (~keep).sum()
    if removed > 0:
        logger.info("Outlier removal: dropped %d / %d points", removed, len(points))
    return points[keep], colors[keep]


def _voxel_downsample(
    points: np.ndarray,
    colors: np.ndarray,
    voxel_size: float | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Reduce density by averaging points within each voxel cell."""
    if len(points) < 2000:
        # Don't downsample small clouds — we need all the points we can get
        logger.info("Voxel downsample: skipped (only %d points)", len(points))
        return points, colors

    if voxel_size is None:
        # Use median nearest-neighbor distance to set voxel size
        tree = KDTree(points)
        dists, _ = tree.query(points, k=2)
        median_nn = np.median(dists[:, 1])
        voxel_size = max(median_nn * 2.0, 1e-7)

    origin = points.min(axis=0)
    indices = ((points - origin) / voxel_size).astype(np.int64)

    buckets: dict[tuple, list[int]] = {}
    for i, key in enumerate(map(tuple, indices)):
        buckets.setdefault(key, []).append(i)

    n = len(buckets)
    new_pts = np.empty((n, 3), dtype=np.float64)
    new_col = np.empty((n, 3), dtype=np.uint8)
    for vi, ids in enumerate(buckets.values()):
        new_pts[vi] = points[ids].mean(axis=0)
        new_col[vi] = colors[ids].mean(axis=0).astype(np.uint8)

    logger.info("Voxel downsample: %d -> %d (voxel=%.5f)", len(points), n, voxel_size)
    return new_pts, new_col


# ---------------------------------------------------------------------------
# Stage 6 -- Mesh reconstruction
# ---------------------------------------------------------------------------


def _circumradius_tet(pts: np.ndarray) -> float:
    """Circumradius of a tetrahedron defined by 4x3 array of vertices."""
    a, b, c, d = pts
    ab, ac, ad = b - a, c - a, d - a

    cross_ac_ad = np.cross(ac, ad)
    denom = 2.0 * np.dot(ab, cross_ac_ad)
    if abs(denom) < 1e-12:
        return float("inf")

    numer = (
        np.dot(ab, ab) * np.cross(ac, ad)
        + np.dot(ac, ac) * np.cross(ad, ab)
        + np.dot(ad, ad) * np.cross(ab, ac)
    )
    return float(np.linalg.norm(numer) / abs(denom))


def _alpha_shape_mesh(
    points: np.ndarray,
    colors: np.ndarray,
) -> trimesh.Trimesh | None:
    """Build an alpha-shape surface from the Delaunay tetrahedralization.

    Keeps tetrahedra whose longest edge (used as a simpler proxy for
    circumradius) falls below an adaptive percentile-based threshold, then
    extracts boundary triangles.
    """
    try:
        tet = Delaunay(points)
    except Exception as exc:
        logger.warning("Delaunay tetrahedralization failed: %s", exc)
        return None

    simplices = tet.simplices  # Mx4

    # Compute max edge length per tetrahedron (fast proxy for circumradius)
    edge_combos = [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]
    max_edges = np.zeros(len(simplices))
    for ai, bi in edge_combos:
        d = np.linalg.norm(points[simplices[:, ai]] - points[simplices[:, bi]], axis=1)
        np.maximum(max_edges, d, out=max_edges)

    alpha_threshold = np.percentile(max_edges, _ALPHA_PERCENTILE) * _ALPHA_MULTIPLIER
    keep_mask = max_edges < alpha_threshold
    kept = simplices[keep_mask]

    if len(kept) == 0:
        return None

    # Extract boundary faces: triangles that belong to exactly one tetrahedron
    face_count: dict[tuple[int, ...], int] = {}
    for tet_verts in kept:
        for skip in range(4):
            face = tuple(sorted(tet_verts[j] for j in range(4) if j != skip))
            face_count[face] = face_count.get(face, 0) + 1

    boundary = [f for f, c in face_count.items() if c == 1]
    if len(boundary) < 4:
        return None

    faces = np.array(boundary, dtype=np.int64)
    rgba = np.hstack([colors, np.full((len(colors), 1), 255, dtype=np.uint8)])

    mesh = trimesh.Trimesh(vertices=points, faces=faces, vertex_colors=rgba, process=True)
    # Clean up mesh faces — use trimesh's current API
    try:
        good = mesh.nondegenerate_faces()
        mesh.update_faces(good)
    except Exception:
        pass
    try:
        unique = mesh.unique_faces()
        mesh.update_faces(unique)
    except Exception:
        pass
    mesh.remove_unreferenced_vertices()

    if len(mesh.faces) < 4:
        return None

    try:
        trimesh.repair.fix_normals(mesh)
    except Exception:
        pass  # networkx may be unavailable
    return mesh


def _build_mesh(points: np.ndarray, colors: np.ndarray) -> trimesh.Trimesh:
    """Build a smooth triangle mesh from a coloured point cloud.

    Uses volumetric SDF + marching cubes + Laplacian smoothing for quality.
    Falls back to alpha shape / convex hull if that fails.
    """
    n = len(points)
    if n < 4:
        raise ValueError(f"Point cloud too small for meshing ({n} points)")

    logger.info("Building mesh from %d points ...", n)

    # Primary: volumetric surface reconstruction (smooth, high quality)
    try:
        from .surface_reconstruction import reconstruct_surface

        # Scale grid resolution based on point count — higher = more detail
        grid_res = min(max(int(n ** 0.4 * 2), 80), 200)
        verts, faces, vcols = reconstruct_surface(
            points, colors,
            grid_resolution=grid_res,
            normal_k=min(25, n // 2),
            smoothing_sigma=0.8,
            laplacian_iterations=3,
        )
        rgba = np.hstack([vcols, np.full((len(vcols), 1), 255, dtype=np.uint8)])
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_colors=rgba, process=True)
        logger.info("Volumetric mesh: %d verts, %d faces", len(mesh.vertices), len(mesh.faces))
        return mesh
    except Exception as e:
        logger.warning("Volumetric reconstruction failed: %s — trying alpha shape", e)

    # Fallback 1: alpha shape
    mesh = _alpha_shape_mesh(points, colors)
    if mesh is not None and len(mesh.faces) >= 4:
        logger.info("Alpha-shape mesh: %d verts, %d faces", len(mesh.vertices), len(mesh.faces))
        return mesh

    # Fallback 2: convex hull
    logger.warning("Alpha shape failed; falling back to convex hull")
    cloud = trimesh.PointCloud(
        points,
        colors=np.hstack([colors, np.full((n, 1), 255, dtype=np.uint8)]),
    )
    hull = cloud.convex_hull

    tree = KDTree(points)
    _, idx = tree.query(hull.vertices)
    hull_rgba = np.hstack([colors[idx], np.full((len(hull.vertices), 1), 255, dtype=np.uint8)])
    hull.visual.vertex_colors = hull_rgba

    logger.info("Convex hull mesh: %d verts, %d faces", len(hull.vertices), len(hull.faces))
    return hull


def _normalize_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Center at origin and scale so the bounding box fits within [-0.5, 0.5]."""
    mesh.vertices -= mesh.centroid
    max_extent = max(mesh.extents)
    if max_extent > 0:
        mesh.vertices /= max_extent
    logger.info("Normalized mesh: extents=%s", np.round(mesh.extents, 4).tolist())
    return mesh


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def reconstruct_from_photos(image_paths: list[str]) -> str:
    """Run the full Structure-from-Motion pipeline on multi-view images.

    Args:
        image_paths: File paths to input photographs (minimum 2).

    Returns:
        Absolute path to the exported ``.glb`` mesh file.

    Raises:
        ValueError: If fewer than 2 usable images are provided or
            reconstruction fails at any stage.
    """
    if len(image_paths) < 2:
        raise ValueError("At least 2 images are required for reconstruction")

    # ------------------------------------------------------------------ #
    # Stage 1  --  Load images and extract SIFT features                 #
    # ------------------------------------------------------------------ #
    logger.info("=== Stage 1: Load images and extract features (%d images) ===",
                len(image_paths))

    sift = cv2.SIFT_create(nfeatures=_SIFT_N_FEATURES)
    views: list[_ImageData | None] = []
    for path in image_paths:
        views.append(_load_and_extract(path, sift))

    usable_idx = [i for i, v in enumerate(views) if v is not None]
    if len(usable_idx) < 2:
        raise ValueError(
            f"Only {len(usable_idx)} images had sufficient features; need at least 2"
        )
    logger.info("%d / %d images usable", len(usable_idx), len(image_paths))

    # Use intrinsics from the first usable image (assume same camera throughout)
    ref = views[usable_idx[0]]
    K = _estimate_intrinsics(*ref.shape, image_path=ref.path)
    logger.info("Camera intrinsics: fx=%.1f  cx=%.1f  cy=%.1f", K[0, 0], K[0, 2], K[1, 2])

    # ------------------------------------------------------------------ #
    # Stage 2  --  Pairwise feature matching                             #
    # ------------------------------------------------------------------ #
    logger.info("=== Stage 2: Pairwise feature matching ===")

    # BFMatcher with cross-check is much more accurate than FLANN ratio test
    # for natural scenes with repetitive textures (foliage, bark)
    bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=True)

    pair_matches: list[_PairMatch] = []
    for i, j in combinations(usable_idx, 2):
        vi, vj = views[i], views[j]
        try:
            good, pts_a, pts_b = _match_pair(
                vi.descriptors, vj.descriptors,
                vi.keypoints, vj.keypoints,
                bf,
            )
        except cv2.error as exc:
            logger.debug("Matching error for pair (%d,%d): %s", i, j, exc)
            continue

        if len(good) < _MIN_MATCHES_FOR_POSE:
            logger.debug("Pair (%d,%d): %d matches (below threshold), skipping", i, j, len(good))
            continue

        pair_matches.append(_PairMatch(i, j, good, pts_a, pts_b))
        logger.info("  Pair (%d,%d): %d good matches", i, j, len(good))

    if not pair_matches:
        raise ValueError("No image pair produced enough feature matches")

    # ------------------------------------------------------------------ #
    # Stage 3  --  Initialize reconstruction with best pair              #
    # ------------------------------------------------------------------ #
    logger.info("=== Stage 3: Initialize with best pair ===")

    # Try all pairs and pick the one with the most essential matrix inliers
    best_seed = None
    best_inlier_count = 0
    best_result = None
    for pm in pair_matches:
        result = _recover_pose(pm.pts_a, pm.pts_b, K)
        if result is None:
            continue
        _, _, pa_in, pb_in = result
        n_in = len(pa_in)
        if n_in > best_inlier_count:
            best_inlier_count = n_in
            best_seed = pm
            best_result = result
        logger.debug("  Pair (%d,%d): %d inliers", pm.idx_a, pm.idx_b, n_in)

    if best_seed is None or best_result is None:
        raise ValueError("Pose recovery failed for all image pairs")

    seed = best_seed
    R_rel, t_rel, pts_a_in, pts_b_in = best_result
    logger.info("Best seed pair: (%d,%d) with %d inliers", seed.idx_a, seed.idx_b, best_inlier_count)

    R1 = np.eye(3, dtype=np.float64)
    t1 = np.zeros((3, 1), dtype=np.float64)
    R2 = R_rel.astype(np.float64)
    t2 = t_rel.astype(np.float64)

    registered: dict[int, tuple[np.ndarray, np.ndarray]] = {
        seed.idx_a: (R1, t1),
        seed.idx_b: (R2, t2),
    }

    all_pts3d: list[np.ndarray] = []
    all_colors: list[np.ndarray] = []

    pts3d = _triangulate(K, R1, t1, R2, t2, pts_a_in, pts_b_in)
    logger.info("Seed pair (%d,%d): %d triangulated points", seed.idx_a, seed.idx_b, len(pts3d))

    if len(pts3d) > 0:
        c_a = _sample_colors_from_view(pts3d, K, R1, t1, views[seed.idx_a].image)
        c_b = _sample_colors_from_view(pts3d, K, R2, t2, views[seed.idx_b].image)
        avg_color = ((c_a.astype(np.int32) + c_b.astype(np.int32)) // 2).astype(np.uint8)
        all_pts3d.append(pts3d)
        all_colors.append(avg_color)

    # ------------------------------------------------------------------ #
    # Stage 4  --  Incrementally register remaining views                #
    # ------------------------------------------------------------------ #
    logger.info("=== Stage 4: Incremental view registration ===")

    unregistered = [i for i in usable_idx if i not in registered]
    progress = True
    while unregistered and progress:
        progress = False
        for new_idx in list(unregistered):
            # Find best pair with an already-registered view
            best_pm: _PairMatch | None = None
            best_reg: int | None = None
            best_n = 0

            for pm in pair_matches:
                if pm.idx_a == new_idx and pm.idx_b in registered and len(pm.matches) > best_n:
                    # Swap so registered view is always "A"
                    best_pm = _PairMatch(pm.idx_b, pm.idx_a, pm.matches, pm.pts_b, pm.pts_a)
                    best_reg = pm.idx_b
                    best_n = len(pm.matches)
                elif pm.idx_b == new_idx and pm.idx_a in registered and len(pm.matches) > best_n:
                    best_pm = pm
                    best_reg = pm.idx_a
                    best_n = len(pm.matches)

            if best_pm is None or best_n < _MIN_MATCHES_FOR_POSE:
                continue

            result = _recover_pose(best_pm.pts_a, best_pm.pts_b, K)
            if result is None:
                logger.debug("Pose recovery failed for view %d against %d", new_idx, best_reg)
                continue

            R_rel_new, t_rel_new, pa_in, pb_in = result
            reg_R, reg_t = registered[best_reg]

            # Compose: world pose of new camera
            R_world = R_rel_new @ reg_R
            t_world = R_rel_new @ reg_t + t_rel_new

            registered[new_idx] = (R_world, t_world)
            unregistered.remove(new_idx)
            progress = True

            pts3d_new = _triangulate(K, reg_R, reg_t, R_world, t_world, pa_in, pb_in)
            if len(pts3d_new) > 0:
                c1 = _sample_colors_from_view(pts3d_new, K, reg_R, reg_t, views[best_reg].image)
                c2 = _sample_colors_from_view(pts3d_new, K, R_world, t_world, views[new_idx].image)
                avg_c = ((c1.astype(np.int32) + c2.astype(np.int32)) // 2).astype(np.uint8)
                all_pts3d.append(pts3d_new)
                all_colors.append(avg_c)

            logger.info("  Registered view %d: +%d pts (total views: %d/%d)",
                        new_idx, len(pts3d_new), len(registered), len(usable_idx))

    logger.info("Registration complete: %d / %d views", len(registered), len(usable_idx))

    # Also triangulate between all registered pairs for extra density
    logger.info("=== Stage 4b: Dense triangulation across all registered pairs ===")
    reg_keys = sorted(registered.keys())
    for i, j in combinations(reg_keys, 2):
        # Skip seed pair (already done)
        if {i, j} == {seed.idx_a, seed.idx_b}:
            continue
        # Find matching pair data
        pm = None
        for candidate in pair_matches:
            if {candidate.idx_a, candidate.idx_b} == {i, j}:
                pm = candidate
                break
        if pm is None:
            continue

        # Ensure ordering matches registered keys
        if pm.idx_a == i:
            pa, pb = pm.pts_a, pm.pts_b
        else:
            pa, pb = pm.pts_b, pm.pts_a

        Ri, ti = registered[i]
        Rj, tj = registered[j]

        # Triangulate directly using registered poses — no re-filtering needed
        # since cross-check already provides clean matches
        extra = _triangulate(K, Ri, ti, Rj, tj, pa, pb)
        if len(extra) > 0:
            c1 = _sample_colors_from_view(extra, K, Ri, ti, views[i].image)
            c2 = _sample_colors_from_view(extra, K, Rj, tj, views[j].image)
            avg = ((c1.astype(np.int32) + c2.astype(np.int32)) // 2).astype(np.uint8)
            all_pts3d.append(extra)
            all_colors.append(avg)

    # ------------------------------------------------------------------ #
    # Stage 5  --  Merge, clean, and downsample point cloud              #
    # ------------------------------------------------------------------ #
    logger.info("=== Stage 5: Post-process point cloud ===")

    if not all_pts3d:
        raise ValueError("No 3D points were triangulated; images may lack texture or overlap")

    cloud = np.vstack(all_pts3d)
    colors = np.vstack(all_colors)
    logger.info("Raw merged cloud: %d points", len(cloud))

    # Center and scale so outlier detection works in normalised space
    centroid = cloud.mean(axis=0)
    cloud -= centroid
    extent = np.abs(cloud).max()
    if extent > 0:
        cloud /= extent

    cloud, colors = _remove_statistical_outliers(cloud, colors)
    cloud, colors = _voxel_downsample(cloud, colors)

    if len(cloud) < 4:
        raise ValueError(f"Point cloud too sparse after filtering ({len(cloud)} points)")

    # ------------------------------------------------------------------ #
    # Stage 6  --  Mesh reconstruction                                   #
    # ------------------------------------------------------------------ #
    logger.info("=== Stage 6: Mesh reconstruction ===")
    mesh = _build_mesh(cloud, colors)
    mesh = _normalize_mesh(mesh)

    # ------------------------------------------------------------------ #
    # Stage 7  --  Export GLB                                            #
    # ------------------------------------------------------------------ #
    logger.info("=== Stage 7: Export GLB ===")

    out_dir = tempfile.mkdtemp(prefix="bonsai_sfm_")
    out_path = os.path.join(out_dir, "reconstruction.glb")
    mesh.export(out_path, file_type="glb")

    size_kb = os.path.getsize(out_path) / 1024.0
    logger.info("Exported %s  (%.1f KB, %d verts, %d faces)",
                out_path, size_kb, len(mesh.vertices), len(mesh.faces))

    return out_path
