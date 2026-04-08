"""Structure-from-Motion photogrammetry pipeline using OpenCV.

Reconstructs a 3D mesh from multi-view photographs using feature matching,
camera pose estimation, and point cloud triangulation.
"""

import logging
import tempfile
from itertools import combinations

import cv2
import numpy as np
from scipy.spatial import Delaunay

logger = logging.getLogger(__name__)


def reconstruct_from_photos(image_paths: list[str]) -> str:
    """Reconstruct a 3D mesh from multiple photographs.

    Pipeline:
    1. Load and resize images
    2. Extract SIFT features
    3. Match features between image pairs
    4. Estimate camera poses via essential matrix
    5. Triangulate 3D points
    6. Build mesh from point cloud
    7. Export as GLB

    Args:
        image_paths: List of local file paths to input images.

    Returns:
        Path to the output GLB mesh file.
    """
    if len(image_paths) < 2:
        raise ValueError("Need at least 2 images for reconstruction")

    # Stage 1: Load images
    logger.info("Loading %d images...", len(image_paths))
    images = []
    gray_images = []
    for path in image_paths:
        img = cv2.imread(path)
        if img is None:
            logger.warning("Could not read image: %s", path)
            continue
        # Resize for performance (max 1024px on longest side)
        h, w = img.shape[:2]
        scale = min(1.0, 1024.0 / max(h, w))
        if scale < 1.0:
            img = cv2.resize(img, (int(w * scale), int(h * scale)))
        images.append(img)
        gray_images.append(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))

    if len(images) < 2:
        raise ValueError("Could not load enough valid images")

    h, w = images[0].shape[:2]
    logger.info("Loaded %d images at %dx%d", len(images), w, h)

    # Estimate camera intrinsics (assume phone camera)
    focal_length = max(w, h) * 1.2  # Rough estimate
    cx, cy = w / 2, h / 2
    K = np.array([
        [focal_length, 0, cx],
        [0, focal_length, cy],
        [0, 0, 1],
    ], dtype=np.float64)

    # Stage 2: Extract SIFT features
    logger.info("Extracting SIFT features...")
    sift = cv2.SIFT_create(nfeatures=4000)
    keypoints_list = []
    descriptors_list = []
    for gray in gray_images:
        kp, desc = sift.detectAndCompute(gray, None)
        keypoints_list.append(kp)
        descriptors_list.append(desc)
        logger.info("  Image: %d keypoints", len(kp))

    # Stage 3: Match features between pairs
    logger.info("Matching features between image pairs...")
    FLANN_INDEX_KDTREE = 1
    index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)

    all_points_3d = []
    all_colors = []
    camera_poses = [np.eye(4)]  # First camera at origin

    # Use first image as reference
    ref_idx = 0
    ref_desc = descriptors_list[ref_idx]
    ref_kp = keypoints_list[ref_idx]

    for i in range(1, len(images)):
        if descriptors_list[i] is None or ref_desc is None:
            continue
        if len(descriptors_list[i]) < 10 or len(ref_desc) < 10:
            continue

        try:
            matches = flann.knnMatch(ref_desc, descriptors_list[i], k=2)
        except cv2.error:
            logger.warning("FLANN matching failed for pair 0-%d", i)
            continue

        # Ratio test
        good_matches = []
        for m_pair in matches:
            if len(m_pair) == 2:
                m, n = m_pair
                if m.distance < 0.75 * n.distance:
                    good_matches.append(m)

        logger.info("  Pair 0-%d: %d good matches", i, len(good_matches))

        if len(good_matches) < 15:
            continue

        # Get matched point coordinates
        pts1 = np.float32([ref_kp[m.queryIdx].pt for m in good_matches])
        pts2 = np.float32([keypoints_list[i][m.trainIdx].pt for m in good_matches])

        # Stage 4: Estimate essential matrix and recover pose
        E, mask_e = cv2.findEssentialMat(pts1, pts2, K, method=cv2.RANSAC, prob=0.999, threshold=1.0)
        if E is None:
            continue

        inliers = mask_e.ravel().astype(bool)
        pts1_in = pts1[inliers]
        pts2_in = pts2[inliers]

        if len(pts1_in) < 10:
            continue

        _, R, t, mask_pose = cv2.recoverPose(E, pts1_in, pts2_in, K)

        # Build projection matrices
        P1 = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
        P2 = K @ np.hstack([R, t])

        # Stage 5: Triangulate points
        pts1_h = pts1_in.T.astype(np.float64)
        pts2_h = pts2_in.T.astype(np.float64)

        points_4d = cv2.triangulatePoints(P1, P2, pts1_h, pts2_h)
        points_3d = (points_4d[:3] / points_4d[3:]).T

        # Filter out points behind cameras or too far away
        valid = (
            (points_3d[:, 2] > 0) &
            (np.abs(points_3d[:, 0]) < 10) &
            (np.abs(points_3d[:, 1]) < 10) &
            (np.abs(points_3d[:, 2]) < 10) &
            np.isfinite(points_3d).all(axis=1)
        )
        points_3d = points_3d[valid]

        if len(points_3d) < 5:
            continue

        # Sample colors from the reference image
        pixel_coords = pts1_in[valid].astype(int)
        colors = []
        for px, py in pixel_coords:
            px = np.clip(px, 0, w - 1)
            py = np.clip(py, 0, h - 1)
            bgr = images[ref_idx][int(py), int(px)]
            colors.append([bgr[2], bgr[1], bgr[0], 255])  # BGR -> RGBA

        all_points_3d.append(points_3d)
        all_colors.append(np.array(colors, dtype=np.uint8))

        # Store camera pose
        pose = np.eye(4)
        pose[:3, :3] = R
        pose[:3, 3] = t.ravel()
        camera_poses.append(pose)

        logger.info("  Triangulated %d points from pair 0-%d", len(points_3d), i)

    # Also do pairwise matching between consecutive images for more coverage
    for i in range(1, len(images) - 1):
        j = i + 1
        if descriptors_list[i] is None or descriptors_list[j] is None:
            continue
        if len(descriptors_list[i]) < 10 or len(descriptors_list[j]) < 10:
            continue

        try:
            matches = flann.knnMatch(descriptors_list[i], descriptors_list[j], k=2)
        except cv2.error:
            continue

        good_matches = []
        for m_pair in matches:
            if len(m_pair) == 2:
                m, n = m_pair
                if m.distance < 0.75 * n.distance:
                    good_matches.append(m)

        if len(good_matches) < 15:
            continue

        pts1 = np.float32([keypoints_list[i][m.queryIdx].pt for m in good_matches])
        pts2 = np.float32([keypoints_list[j][m.trainIdx].pt for m in good_matches])

        E, mask_e = cv2.findEssentialMat(pts1, pts2, K, method=cv2.RANSAC, prob=0.999, threshold=1.0)
        if E is None:
            continue

        inliers = mask_e.ravel().astype(bool)
        pts1_in = pts1[inliers]
        pts2_in = pts2[inliers]

        if len(pts1_in) < 10:
            continue

        _, R, t, _ = cv2.recoverPose(E, pts1_in, pts2_in, K)

        P1 = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
        P2 = K @ np.hstack([R, t])

        points_4d = cv2.triangulatePoints(P1, P2, pts1_in.T.astype(np.float64), pts2_in.T.astype(np.float64))
        points_3d = (points_4d[:3] / points_4d[3:]).T

        valid = (
            (points_3d[:, 2] > 0) &
            (np.abs(points_3d[:, 0]) < 10) &
            (np.abs(points_3d[:, 1]) < 10) &
            (np.abs(points_3d[:, 2]) < 10) &
            np.isfinite(points_3d).all(axis=1)
        )
        points_3d = points_3d[valid]

        if len(points_3d) < 5:
            continue

        pixel_coords = pts1_in[valid].astype(int)
        colors = []
        for px, py in pixel_coords:
            px = np.clip(px, 0, images[i].shape[1] - 1)
            py = np.clip(py, 0, images[i].shape[0] - 1)
            bgr = images[i][int(py), int(px)]
            colors.append([bgr[2], bgr[1], bgr[0], 255])

        all_points_3d.append(points_3d)
        all_colors.append(np.array(colors, dtype=np.uint8))

        logger.info("  Triangulated %d points from pair %d-%d", len(points_3d), i, j)

    if not all_points_3d:
        raise ValueError("No 3D points could be triangulated — images may lack texture or overlap")

    # Merge all points
    points = np.vstack(all_points_3d)
    colors = np.vstack(all_colors) if all_colors else np.full((len(points), 4), [128, 128, 128, 255], dtype=np.uint8)

    logger.info("Total reconstructed points: %d", len(points))

    # Stage 6: Normalize point cloud
    centroid = points.mean(axis=0)
    points -= centroid
    extent = np.abs(points).max()
    if extent > 0:
        points /= extent

    # Remove statistical outliers
    if len(points) > 50:
        from scipy.spatial import KDTree
        tree = KDTree(points)
        dists, _ = tree.query(points, k=min(10, len(points)))
        mean_dist = dists[:, 1:].mean(axis=1)
        threshold = mean_dist.mean() + 2.0 * mean_dist.std()
        inlier_mask = mean_dist < threshold
        points = points[inlier_mask]
        colors = colors[inlier_mask]
        logger.info("After outlier removal: %d points", len(points))

    # Stage 7: Build mesh from point cloud
    mesh = _build_mesh_from_points(points, colors)

    # Export
    fd, path = tempfile.mkstemp(suffix=".glb")
    mesh.export(path, file_type="glb")
    logger.info("Exported mesh: %d vertices, %d faces -> %s", len(mesh.vertices), len(mesh.faces), path)

    return path


def _build_mesh_from_points(points: np.ndarray, colors: np.ndarray):
    """Build a trimesh from a point cloud using Delaunay triangulation."""
    import trimesh

    if len(points) < 4:
        # Too few points — create a simple convex hull
        cloud = trimesh.PointCloud(points)
        return cloud.convex_hull

    try:
        # Try 3D Delaunay triangulation
        tri = Delaunay(points)
        # Extract surface faces from tetrahedra
        faces = set()
        for simplex in tri.simplices:
            for i in range(4):
                face = tuple(sorted([simplex[j] for j in range(4) if j != i]))
                faces.add(face)
        faces = np.array(list(faces))

        mesh = trimesh.Trimesh(vertices=points, faces=faces)
        mesh.visual.vertex_colors = colors[:len(mesh.vertices)]

        # Keep only the convex hull for cleaner results
        # then subdivide for smoother appearance
        hull = mesh.convex_hull

        # Transfer colors to hull vertices by nearest neighbor
        if len(colors) > 0:
            from scipy.spatial import KDTree
            tree = KDTree(points)
            _, indices = tree.query(hull.vertices)
            hull.visual.vertex_colors = colors[indices]

        # Try to get a better surface via alpha shape
        try:
            alpha_mesh = _alpha_shape_3d(points, colors, alpha=0.5)
            if alpha_mesh is not None and len(alpha_mesh.faces) > len(hull.faces):
                return alpha_mesh
        except Exception as e:
            logger.warning("Alpha shape failed, using convex hull: %s", e)

        return hull

    except Exception as e:
        logger.warning("Delaunay failed, using convex hull: %s", e)
        cloud = trimesh.PointCloud(points)
        hull = cloud.convex_hull
        if len(colors) > 0:
            from scipy.spatial import KDTree
            tree = KDTree(points)
            _, indices = tree.query(hull.vertices)
            hull.visual.vertex_colors = colors[indices]
        return hull


def _alpha_shape_3d(points: np.ndarray, colors: np.ndarray, alpha: float = 0.5):
    """Compute a 3D alpha shape from a point cloud.

    Filters Delaunay tetrahedra by circumradius, keeping only those
    smaller than 1/alpha.
    """
    import trimesh

    if len(points) < 4:
        return None

    tri = Delaunay(points)
    threshold = 1.0 / alpha if alpha > 0 else float("inf")

    valid_faces = set()
    for simplex in tri.simplices:
        pts = points[simplex]
        # Compute circumradius of tetrahedron
        cr = _circumradius_tet(pts)
        if cr < threshold:
            # Add all 4 faces of this tetrahedron
            for i in range(4):
                face = tuple(sorted([simplex[j] for j in range(4) if j != i]))
                # Only keep faces that appear once (surface faces)
                if face in valid_faces:
                    valid_faces.discard(face)
                else:
                    valid_faces.add(face)

    if not valid_faces:
        return None

    faces = np.array(list(valid_faces))
    mesh = trimesh.Trimesh(vertices=points, faces=faces)

    # Transfer colors
    if len(colors) >= len(points):
        mesh.visual.vertex_colors = colors[:len(points)]

    # Clean up
    mesh.remove_degenerate_faces()
    mesh.remove_duplicate_faces()

    if len(mesh.faces) < 4:
        return None

    return mesh


def _circumradius_tet(pts: np.ndarray) -> float:
    """Compute circumradius of a tetrahedron defined by 4 points."""
    a, b, c, d = pts
    ab = b - a
    ac = c - a
    ad = d - a

    cross_bc = np.cross(ab, ac)
    cross_cd = np.cross(ac, ad)
    cross_db = np.cross(ad, ab)

    denom = 2.0 * np.dot(ab, np.cross(ac, ad))
    if abs(denom) < 1e-10:
        return float("inf")

    numer = (
        np.dot(ab, ab) * cross_cd +
        np.dot(ac, ac) * cross_db +
        np.dot(ad, ad) * cross_bc
    )

    return np.linalg.norm(numer) / abs(denom)
