"""Surface reconstruction from oriented point clouds.

Implements a volumetric implicit surface approach:
1. Estimate point normals via PCA on k-nearest neighbors
2. Orient normals consistently (outward-facing)
3. Build a signed distance field on a voxel grid (vectorized, fast)
4. Extract the isosurface via marching cubes
5. Smooth the mesh with Laplacian smoothing
6. Transfer vertex colors from the nearest source points
"""

import logging
import numpy as np
from scipy.spatial import KDTree
from scipy.ndimage import gaussian_filter

logger = logging.getLogger(__name__)


def reconstruct_surface(
    points: np.ndarray,
    colors: np.ndarray,
    grid_resolution: int = 100,
    normal_k: int = 20,
    smoothing_sigma: float = 1.0,
    laplacian_iterations: int = 5,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Reconstruct a smooth triangle mesh from a colored point cloud.

    Returns (vertices, faces, vertex_colors).
    """
    n = len(points)
    logger.info("Surface reconstruction: %d points, grid=%d", n, grid_resolution)

    # 1. Estimate and orient normals
    normals = _estimate_normals(points, k=normal_k)
    centroid = points.mean(axis=0)
    # Orient outward from centroid
    dots = np.sum((points - centroid) * normals, axis=1)
    normals[dots < 0] *= -1

    # 2. Set up voxel grid
    padding = 0.08
    bbox_min = points.min(axis=0) - padding
    bbox_max = points.max(axis=0) + padding
    extent = bbox_max - bbox_min
    voxel_size = extent.max() / grid_resolution
    grid_dims = np.ceil(extent / voxel_size).astype(int) + 1
    gx, gy, gz = grid_dims
    logger.info("  Grid: %dx%dx%d (%.5f voxel), %d total", gx, gy, gz, voxel_size, gx * gy * gz)

    # 3. Splat points into the grid — for each point, update nearby voxels
    # This is much faster than querying per-voxel
    logger.info("  Splatting %d points into SDF grid...", n)
    sdf_sum = np.zeros(grid_dims, dtype=np.float64)
    weight_sum = np.zeros(grid_dims, dtype=np.float64)

    tree = KDTree(points)
    # Influence radius should be several voxels wide to fill gaps in the SDF
    radius_voxels = 4
    sigma = voxel_size * 2.5  # Gaussian spread covers ~3 voxels
    sigma_sq = sigma ** 2

    for i in range(n):
        px, py, pz = points[i]
        nx, ny, nz = normals[i]

        # Grid index of this point
        gi = int((px - bbox_min[0]) / voxel_size)
        gj = int((py - bbox_min[1]) / voxel_size)
        gk = int((pz - bbox_min[2]) / voxel_size)

        # Neighborhood bounds
        i0, i1 = max(gi - radius_voxels, 0), min(gi + radius_voxels + 1, gx)
        j0, j1 = max(gj - radius_voxels, 0), min(gj + radius_voxels + 1, gy)
        k0, k1 = max(gk - radius_voxels, 0), min(gk + radius_voxels + 1, gz)

        # Voxel centers in this neighborhood
        xs = bbox_min[0] + np.arange(i0, i1) * voxel_size
        ys = bbox_min[1] + np.arange(j0, j1) * voxel_size
        zs = bbox_min[2] + np.arange(k0, k1) * voxel_size
        vx, vy, vz = np.meshgrid(xs, ys, zs, indexing='ij')

        # Signed distance: project (voxel - point) onto normal
        dx = vx - px
        dy = vy - py
        dz = vz - pz
        dist_sq = dx * dx + dy * dy + dz * dz
        sd = dx * nx + dy * ny + dz * nz
        w = np.exp(-dist_sq / sigma_sq)

        sdf_sum[i0:i1, j0:j1, k0:k1] += sd * w
        weight_sum[i0:i1, j0:j1, k0:k1] += w

    # Compute SDF
    mask = weight_sum > 1e-10
    sdf = np.ones(grid_dims, dtype=np.float32)
    sdf[mask] = (sdf_sum[mask] / weight_sum[mask]).astype(np.float32)

    # Smooth the SDF for less choppy surfaces
    if smoothing_sigma > 0:
        sdf = gaussian_filter(sdf, sigma=smoothing_sigma)

    # 4. Marching cubes
    logger.info("  Running marching cubes...")
    try:
        from skimage.measure import marching_cubes
        verts_grid, faces, _, _ = marching_cubes(sdf, level=0.0, step_size=1)
    except ImportError:
        logger.error("skimage required for marching cubes")
        raise

    if len(verts_grid) == 0 or len(faces) == 0:
        raise ValueError("Marching cubes produced no surface")

    # Convert to world coords
    vertices = verts_grid * voxel_size + bbox_min
    logger.info("  Raw surface: %d verts, %d faces", len(vertices), len(faces))

    # 5. Laplacian smoothing
    if laplacian_iterations > 0:
        vertices = _laplacian_smooth(vertices, faces, iterations=laplacian_iterations, lam=0.5)

    # 6. Transfer colors
    _, cidx = tree.query(vertices)
    vertex_colors = colors[cidx]

    logger.info("  Final surface: %d verts, %d faces", len(vertices), len(faces))
    return vertices, faces, vertex_colors


def _estimate_normals(points: np.ndarray, k: int = 20) -> np.ndarray:
    """Estimate surface normals via PCA on k-nearest neighbors."""
    tree = KDTree(points)
    _, indices = tree.query(points, k=min(k, len(points)))

    normals = np.zeros_like(points)
    for i in range(len(points)):
        neighbors = points[indices[i]]
        centered = neighbors - neighbors.mean(axis=0)
        cov = centered.T @ centered / len(neighbors)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        normals[i] = eigenvectors[:, 0]  # smallest eigenvalue = normal

    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    norms[norms < 1e-10] = 1.0
    return normals / norms


def _laplacian_smooth(
    vertices: np.ndarray,
    faces: np.ndarray,
    iterations: int = 5,
    lam: float = 0.5,
) -> np.ndarray:
    """Laplacian mesh smoothing — averages each vertex toward its neighbors."""
    from collections import defaultdict

    # Build adjacency
    adj: dict[int, set[int]] = defaultdict(set)
    for f in faces:
        for a, b in [(f[0], f[1]), (f[1], f[2]), (f[2], f[0])]:
            adj[a].add(b)
            adj[b].add(a)

    verts = vertices.copy()
    for _ in range(iterations):
        new_verts = verts.copy()
        for i in range(len(verts)):
            neighbors = list(adj.get(i, []))
            if neighbors:
                center = verts[neighbors].mean(axis=0)
                new_verts[i] = verts[i] + lam * (center - verts[i])
        verts = new_verts

    return verts
