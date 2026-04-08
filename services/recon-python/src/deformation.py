"""Mesh deformation based on skeleton edit operations.

Applies bend, rotate, and prune operations to a mesh using skeleton-based
vertex weighting. Each vertex is assigned to its nearest skeleton edge,
then transformed according to the operations on that edge.
"""

import logging
import tempfile
from typing import Any

import numpy as np
import trimesh
from scipy.spatial import KDTree

logger = logging.getLogger(__name__)


def apply_deformations(
    mesh_path: str,
    skeleton: dict[str, Any],
    operations: list[dict[str, Any]],
) -> tuple[str, int]:
    """Apply edit operations to a mesh based on its skeleton.

    Args:
        mesh_path: Path to the input GLB/mesh file.
        skeleton: Skeleton dict with nodes, edges, root_id.
        operations: List of operations with type, branchId, params.

    Returns:
        Tuple of (output_path, operations_applied_count).
    """
    mesh = trimesh.load(mesh_path, force="mesh")
    vertices = np.array(mesh.vertices, dtype=np.float64)

    edges = skeleton.get("edges", {})
    nodes = skeleton.get("nodes", {})

    if not edges:
        logger.warning("No skeleton edges — returning mesh unmodified")
        out_path = _save_mesh(mesh)
        return out_path, 0

    # Build a KD-tree of skeleton edge midpoints for vertex assignment
    edge_ids = list(edges.keys())
    edge_midpoints = []
    for eid in edge_ids:
        edge = edges[eid]
        pts = np.array(edge.get("curve_points", []))
        if len(pts) > 0:
            edge_midpoints.append(pts.mean(axis=0))
        else:
            # Fallback to source node position
            src = nodes.get(edge.get("source_id", ""), {})
            pos = src.get("position", [0, 0, 0])
            edge_midpoints.append(np.array(pos))

    edge_midpoints = np.array(edge_midpoints)
    tree = KDTree(edge_midpoints)

    # Assign each vertex to nearest skeleton edge
    _, vertex_edge_indices = tree.query(vertices)

    # Build edge_id -> vertex indices mapping
    edge_vertex_map: dict[str, np.ndarray] = {}
    for eid_idx, eid in enumerate(edge_ids):
        mask = vertex_edge_indices == eid_idx
        if mask.any():
            edge_vertex_map[eid] = np.where(mask)[0]

    ops_applied = 0

    for op in operations:
        op_type = op.get("type", "")
        branch_id = op.get("branchId", "")
        params = op.get("params", {})

        if op_type in ("bend_branch", "bend"):
            vertices = _apply_bend(vertices, edge_vertex_map, edges, branch_id, params)
            ops_applied += 1
        elif op_type in ("rotate_branch", "rotate"):
            vertices = _apply_rotate(vertices, edge_vertex_map, edges, nodes, branch_id, params)
            ops_applied += 1
        elif op_type in ("prune_segment", "prune"):
            vertices = _apply_prune(vertices, edge_vertex_map, branch_id, mesh)
            ops_applied += 1
        else:
            logger.warning("Unknown operation type: %s", op_type)

    mesh.vertices = vertices
    out_path = _save_mesh(mesh)
    return out_path, ops_applied


def _apply_bend(
    vertices: np.ndarray,
    edge_vertex_map: dict[str, np.ndarray],
    edges: dict[str, Any],
    branch_id: str,
    params: dict[str, Any],
) -> np.ndarray:
    """Displace vertices assigned to a branch by the bend delta with falloff."""
    delta = np.array(params.get("delta", [0, 0, 0]), dtype=np.float64)
    handle_index = params.get("handleIndex", 0)

    v_indices = edge_vertex_map.get(branch_id)
    if v_indices is None or len(v_indices) == 0:
        return vertices

    edge = edges.get(branch_id, {})
    curve_pts = np.array(edge.get("curve_points", []))
    if len(curve_pts) == 0:
        return vertices

    # Compute falloff: vertices closer to the handle point get more displacement
    handle_pos = curve_pts[min(handle_index, len(curve_pts) - 1)]
    affected_verts = vertices[v_indices]
    dists = np.linalg.norm(affected_verts - handle_pos, axis=1)
    max_dist = dists.max() if dists.max() > 0 else 1.0
    weights = np.maximum(0, 1.0 - dists / (max_dist * 1.5))

    vertices[v_indices] += delta[np.newaxis, :] * weights[:, np.newaxis]
    return vertices


def _apply_rotate(
    vertices: np.ndarray,
    edge_vertex_map: dict[str, np.ndarray],
    edges: dict[str, Any],
    nodes: dict[str, Any],
    branch_id: str,
    params: dict[str, Any],
) -> np.ndarray:
    """Rotate vertices assigned to a branch around a given axis."""
    axis = np.array(params.get("axis", [0, 1, 0]), dtype=np.float64)
    angle = float(params.get("angle", 0))

    v_indices = edge_vertex_map.get(branch_id)
    if v_indices is None or len(v_indices) == 0:
        return vertices

    # Rotation pivot: base of the edge (source node)
    edge = edges.get(branch_id, {})
    source_id = edge.get("source_id", "")
    source_node = nodes.get(source_id, {})
    pivot = np.array(source_node.get("position", [0, 0, 0]), dtype=np.float64)

    # Rodrigues rotation
    axis = axis / (np.linalg.norm(axis) + 1e-10)
    cos_a = np.cos(angle)
    sin_a = np.sin(angle)

    centered = vertices[v_indices] - pivot
    dot = np.dot(centered, axis)
    cross = np.cross(axis, centered)

    rotated = centered * cos_a + cross * sin_a + np.outer(dot, axis) * (1 - cos_a)
    vertices[v_indices] = rotated + pivot
    return vertices


def _apply_prune(
    vertices: np.ndarray,
    edge_vertex_map: dict[str, np.ndarray],
    branch_id: str,
    mesh: trimesh.Trimesh,
) -> np.ndarray:
    """Collapse vertices of a pruned branch to the branch base (visually removing it)."""
    v_indices = edge_vertex_map.get(branch_id)
    if v_indices is None or len(v_indices) == 0:
        return vertices

    # Move pruned vertices to their centroid (collapses geometry)
    centroid = vertices[v_indices].mean(axis=0)
    vertices[v_indices] = centroid
    return vertices


def _save_mesh(mesh: trimesh.Trimesh) -> str:
    """Save mesh to a temporary GLB file and return the path."""
    fd, path = tempfile.mkstemp(suffix=".glb")
    mesh.export(path, file_type="glb")
    return path
