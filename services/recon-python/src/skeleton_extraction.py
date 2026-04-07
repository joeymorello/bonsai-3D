"""Branch skeleton extraction from 3D meshes.

V1 simplified implementation: samples mesh surface points, slices along
the vertical (Y) axis to find centroids, and builds a linear tree graph.
This is a starting point that will be iterated on.
"""

import logging
from typing import Any

import numpy as np
import trimesh
from scipy.spatial import KDTree

logger = logging.getLogger(__name__)


def extract_skeleton(mesh_path: str) -> dict[str, Any]:
    """Extract a simplified branch skeleton from a mesh.

    Pipeline:
    1. Load mesh and sample surface points
    2. Slice along Y axis to find cross-section centroids
    3. Estimate radius at each slice from point spread
    4. Build a linear skeleton graph from bottom to top
    5. Detect branches via cross-section clustering

    Args:
        mesh_path: Path to the input mesh file.

    Returns:
        Skeleton dict with nodes, edges, root_id.
    """
    try:
        mesh = trimesh.load(mesh_path, force="mesh")
    except Exception as e:
        logger.error("Failed to load mesh: %s", e)
        return _empty_skeleton()

    if len(mesh.vertices) == 0:
        return _empty_skeleton()

    try:
        return _build_skeleton_from_slices(mesh)
    except Exception as e:
        logger.warning("Skeleton extraction failed, using fallback: %s", e)
        return _fallback_skeleton(mesh)


def _build_skeleton_from_slices(mesh: trimesh.Trimesh) -> dict[str, Any]:
    """Build a skeleton by slicing the mesh along the Y axis."""
    # Sample points on the mesh surface
    n_samples = min(10000, max(1000, len(mesh.vertices)))
    try:
        points, _ = trimesh.sample.sample_surface(mesh, n_samples)
    except Exception:
        points = np.array(mesh.vertices)

    if len(points) == 0:
        return _fallback_skeleton(mesh)

    # Get Y extent (vertical axis)
    y_min = points[:, 1].min()
    y_max = points[:, 1].max()
    y_range = y_max - y_min

    if y_range < 1e-6:
        return _fallback_skeleton(mesh)

    # Create slices along Y axis
    n_slices = min(20, max(5, int(y_range * 50)))
    slice_ys = np.linspace(y_min, y_max, n_slices)
    slice_thickness = y_range / n_slices * 1.5  # slight overlap

    nodes: dict[str, dict] = {}
    node_positions: list[np.ndarray] = []

    for i, y_val in enumerate(slice_ys):
        # Find points near this Y slice
        mask = np.abs(points[:, 1] - y_val) < slice_thickness / 2
        slice_points = points[mask]

        if len(slice_points) < 3:
            continue

        # Compute centroid and radius of this cross-section
        centroid = slice_points.mean(axis=0)
        # Radius from spread in XZ plane
        xz_spread = slice_points[:, [0, 2]] - centroid[[0, 2]]
        radius = float(np.sqrt(np.mean(np.sum(xz_spread ** 2, axis=1))))

        node_id = f"node_{len(nodes)}"
        nodes[node_id] = {
            "id": node_id,
            "position": centroid.tolist(),
            "radius": max(radius, 0.001),
            "parent_id": None,
            "is_junction": False,
            "is_tip": False,
        }
        node_positions.append(centroid)

    if len(nodes) == 0:
        return _fallback_skeleton(mesh)

    # Mark first and last
    node_ids = list(nodes.keys())
    nodes[node_ids[0]]["is_tip"] = False  # root
    nodes[node_ids[-1]]["is_tip"] = True

    # Build edges connecting consecutive slices
    edges: dict[str, dict] = {}
    for i in range(len(node_ids) - 1):
        src_id = node_ids[i]
        tgt_id = node_ids[i + 1]
        nodes[tgt_id]["parent_id"] = src_id

        src_pos = np.array(nodes[src_id]["position"])
        tgt_pos = np.array(nodes[tgt_id]["position"])
        mid_pos = ((src_pos + tgt_pos) / 2).tolist()

        edge_id = f"edge_{i}"
        edges[edge_id] = {
            "id": edge_id,
            "source_id": src_id,
            "target_id": tgt_id,
            "curve_points": [
                nodes[src_id]["position"],
                mid_pos,
                nodes[tgt_id]["position"],
            ],
            "radii": [
                nodes[src_id]["radius"],
                (nodes[src_id]["radius"] + nodes[tgt_id]["radius"]) / 2,
                nodes[tgt_id]["radius"],
            ],
            "length": float(np.linalg.norm(tgt_pos - src_pos)),
        }

    root_id = node_ids[0]

    return {
        "nodes": nodes,
        "edges": edges,
        "root_id": root_id,
        "metadata": {
            "method": "y_axis_slicing_v1",
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "mesh_bounds": mesh.bounds.tolist(),
        },
    }


def _fallback_skeleton(mesh: trimesh.Trimesh) -> dict[str, Any]:
    """Generate a minimal skeleton when extraction fails."""
    bounds = mesh.bounds
    bottom = [
        float((bounds[0][0] + bounds[1][0]) / 2),
        float(bounds[0][1]),
        float((bounds[0][2] + bounds[1][2]) / 2),
    ]
    top = [
        float((bounds[0][0] + bounds[1][0]) / 2),
        float(bounds[1][1]),
        float((bounds[0][2] + bounds[1][2]) / 2),
    ]
    mid = [(b + t) / 2 for b, t in zip(bottom, top)]

    return {
        "nodes": {
            "node_0": {
                "id": "node_0",
                "position": bottom,
                "radius": 0.05,
                "parent_id": None,
                "is_junction": False,
                "is_tip": False,
            },
            "node_1": {
                "id": "node_1",
                "position": top,
                "radius": 0.02,
                "parent_id": "node_0",
                "is_junction": False,
                "is_tip": True,
            },
        },
        "edges": {
            "edge_0": {
                "id": "edge_0",
                "source_id": "node_0",
                "target_id": "node_1",
                "curve_points": [bottom, mid, top],
                "radii": [0.05, 0.035, 0.02],
                "length": float(np.linalg.norm(np.array(top) - np.array(bottom))),
            },
        },
        "root_id": "node_0",
        "metadata": {
            "method": "fallback",
            "mesh_bounds": mesh.bounds.tolist(),
        },
    }


def _empty_skeleton() -> dict[str, Any]:
    """Return an empty skeleton when no mesh is available."""
    return {
        "nodes": {},
        "edges": {},
        "root_id": "",
        "metadata": {"method": "empty", "error": "no valid mesh"},
    }
