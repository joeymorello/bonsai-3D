"""Branch skeleton extraction from 3D meshes."""

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import trimesh
from scipy import ndimage
from skimage.morphology import skeletonize_3d


@dataclass
class BranchNode:
    """A node in the branch graph (junction or tip)."""

    id: str
    position: list[float]  # [x, y, z]
    radius: float = 0.01
    is_junction: bool = False
    is_tip: bool = False
    neighbor_ids: list[str] = field(default_factory=list)


@dataclass
class BranchEdge:
    """An edge in the branch graph connecting two nodes."""

    id: str
    source_id: str
    target_id: str
    curve_points: list[list[float]]  # list of [x, y, z] control points
    radii: list[float]  # radius at each control point
    length: float = 0.0


@dataclass
class BranchGraph:
    """Complete branch skeleton representation."""

    nodes: dict[str, dict[str, Any]]
    edges: dict[str, dict[str, Any]]
    root_id: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "root_id": self.root_id,
            "metadata": self.metadata,
        }


def extract_skeleton(mesh_path: str) -> dict[str, Any]:
    """Extract the branch skeleton from a mesh.

    Pipeline:
    1. Convert mesh to voxel grid
    2. Compute distance transform
    3. Extract medial axis / centerlines using 3D skeletonization
    4. Build graph: nodes at junctions/tips, edges as branch segments
    5. Fit spline curves to each branch segment
    6. Estimate radius from local mesh thickness
    7. Return BranchGraph JSON

    Args:
        mesh_path: Path to the input mesh file.

    Returns:
        BranchGraph as a dictionary.
    """
    mesh = trimesh.load(mesh_path, force="mesh")

    # Step 1: Voxelize the mesh
    pitch = _compute_voxel_pitch(mesh, target_voxels=128)
    voxel_grid = mesh.voxelized(pitch)
    volume = voxel_grid.matrix.astype(np.uint8)

    # Step 2: Distance transform (distance from each voxel to nearest surface)
    distance_field = ndimage.distance_transform_edt(volume)

    # Step 3: 3D skeletonization
    skeleton_volume = skeletonize_3d(volume)

    # Step 4: Extract graph from skeleton voxels
    skel_coords = np.argwhere(skeleton_volume > 0)

    if len(skel_coords) == 0:
        # Fallback: return a minimal skeleton from mesh bounds
        return _fallback_skeleton(mesh)

    # Build adjacency from 26-connectivity
    nodes, edges = _build_graph_from_voxels(
        skel_coords, distance_field, voxel_grid, pitch
    )

    # Find root (lowest Y position, assuming +Y is up)
    root_id = _find_root_node(nodes)

    # Step 5 & 6: Fit curves and estimate radii (already done in edge building)

    graph = BranchGraph(
        nodes=nodes,
        edges=edges,
        root_id=root_id,
        metadata={
            "voxel_pitch": float(pitch),
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "mesh_bounds": mesh.bounds.tolist(),
        },
    )

    return graph.to_dict()


def _compute_voxel_pitch(mesh: trimesh.Trimesh, target_voxels: int = 128) -> float:
    """Compute voxel pitch to achieve roughly target_voxels along the longest axis."""
    extent = mesh.extents.max()
    return float(extent / target_voxels)


def _build_graph_from_voxels(
    skel_coords: np.ndarray,
    distance_field: np.ndarray,
    voxel_grid,
    pitch: float,
) -> tuple[dict[str, dict], dict[str, dict]]:
    """Build a graph from skeleton voxel coordinates.

    Identifies junction points (degree > 2) and tip points (degree == 1),
    then traces edges between them.
    """
    # Create a lookup set for fast neighbor checking
    coord_set = set(map(tuple, skel_coords))

    # Compute degree for each skeleton voxel (26-connectivity)
    offsets = []
    for dx in [-1, 0, 1]:
        for dy in [-1, 0, 1]:
            for dz in [-1, 0, 1]:
                if dx == 0 and dy == 0 and dz == 0:
                    continue
                offsets.append((dx, dy, dz))

    degrees: dict[tuple, int] = {}
    neighbors_map: dict[tuple, list[tuple]] = {}

    for coord in skel_coords:
        coord_tuple = tuple(coord)
        nbrs = []
        for off in offsets:
            nbr = (coord[0] + off[0], coord[1] + off[1], coord[2] + off[2])
            if nbr in coord_set:
                nbrs.append(nbr)
        degrees[coord_tuple] = len(nbrs)
        neighbors_map[coord_tuple] = nbrs

    # Classify nodes: junctions (degree != 2) or tips (degree == 1)
    special_points = {
        c: d for c, d in degrees.items() if d != 2
    }

    # If no special points, use endpoints of the coordinate list
    if not special_points:
        first = tuple(skel_coords[0])
        last = tuple(skel_coords[-1])
        special_points[first] = 1
        special_points[last] = 1

    # Build nodes
    nodes: dict[str, dict] = {}
    origin = np.array(voxel_grid.origin) if hasattr(voxel_grid, 'origin') else np.zeros(3)

    for i, (coord, degree) in enumerate(special_points.items()):
        node_id = f"node_{i}"
        world_pos = np.array(coord) * pitch + origin
        radius = float(distance_field[coord] * pitch) if coord[0] < distance_field.shape[0] else 0.01

        nodes[node_id] = {
            "id": node_id,
            "position": world_pos.tolist(),
            "radius": max(radius, 0.001),
            "is_junction": degree > 2,
            "is_tip": degree == 1,
            "neighbor_ids": [],
        }

    # Map voxel coords to node IDs
    coord_to_node = {coord: f"node_{i}" for i, coord in enumerate(special_points)}

    # Trace edges between special points
    edges: dict[str, dict] = {}
    edge_count = 0
    visited_edges: set[tuple] = set()

    for start_coord, start_node_id in coord_to_node.items():
        for nbr in neighbors_map.get(start_coord, []):
            if nbr in coord_to_node:
                # Direct connection between two special points
                edge_key = tuple(sorted([start_coord, nbr]))
                if edge_key in visited_edges:
                    continue
                visited_edges.add(edge_key)

                end_node_id = coord_to_node[nbr]
                edge_id = f"edge_{edge_count}"
                edge_count += 1

                start_pos = np.array(start_coord) * pitch + origin
                end_pos = np.array(nbr) * pitch + origin
                mid_pos = (start_pos + end_pos) / 2

                r_start = float(distance_field[start_coord] * pitch) if _in_bounds(start_coord, distance_field.shape) else 0.01
                r_end = float(distance_field[nbr] * pitch) if _in_bounds(nbr, distance_field.shape) else 0.01

                edges[edge_id] = {
                    "id": edge_id,
                    "source_id": start_node_id,
                    "target_id": end_node_id,
                    "curve_points": [start_pos.tolist(), mid_pos.tolist(), end_pos.tolist()],
                    "radii": [max(r_start, 0.001), max((r_start + r_end) / 2, 0.001), max(r_end, 0.001)],
                    "length": float(np.linalg.norm(end_pos - start_pos)),
                }

                nodes[start_node_id]["neighbor_ids"].append(end_node_id)
                nodes[end_node_id]["neighbor_ids"].append(start_node_id)

            elif nbr not in coord_to_node:
                # Trace along degree-2 chain until we hit another special point
                chain = [start_coord, nbr]
                current = nbr
                prev = start_coord

                while current not in coord_to_node:
                    next_nbrs = [
                        n for n in neighbors_map.get(current, []) if n != prev
                    ]
                    if not next_nbrs:
                        break
                    prev = current
                    current = next_nbrs[0]
                    chain.append(current)

                if current in coord_to_node:
                    edge_key = tuple(sorted([start_coord, current]))
                    if edge_key in visited_edges:
                        continue
                    visited_edges.add(edge_key)

                    end_node_id = coord_to_node[current]
                    edge_id = f"edge_{edge_count}"
                    edge_count += 1

                    # Sample control points along the chain
                    step = max(1, len(chain) // 8)
                    sampled = chain[::step]
                    if chain[-1] not in sampled:
                        sampled.append(chain[-1])

                    curve_points = [
                        (np.array(c) * pitch + origin).tolist() for c in sampled
                    ]
                    radii = [
                        max(float(distance_field[c] * pitch) if _in_bounds(c, distance_field.shape) else 0.01, 0.001)
                        for c in sampled
                    ]

                    total_length = sum(
                        float(np.linalg.norm(
                            np.array(chain[j + 1]) - np.array(chain[j])
                        )) * pitch
                        for j in range(len(chain) - 1)
                    )

                    edges[edge_id] = {
                        "id": edge_id,
                        "source_id": start_node_id,
                        "target_id": end_node_id,
                        "curve_points": curve_points,
                        "radii": radii,
                        "length": total_length,
                    }

                    nodes[start_node_id]["neighbor_ids"].append(end_node_id)
                    nodes[end_node_id]["neighbor_ids"].append(start_node_id)

    return nodes, edges


def _in_bounds(coord: tuple, shape: tuple) -> bool:
    """Check if a coordinate is within array bounds."""
    return all(0 <= c < s for c, s in zip(coord, shape))


def _find_root_node(nodes: dict[str, dict]) -> str:
    """Find the root node (lowest Y position)."""
    if not nodes:
        return ""

    root_id = min(nodes.keys(), key=lambda nid: nodes[nid]["position"][1])
    return root_id


def _fallback_skeleton(mesh: trimesh.Trimesh) -> dict:
    """Generate a minimal skeleton when extraction fails."""
    bounds = mesh.bounds
    bottom = [(bounds[0][0] + bounds[1][0]) / 2, bounds[0][1], (bounds[0][2] + bounds[1][2]) / 2]
    top = [(bounds[0][0] + bounds[1][0]) / 2, bounds[1][1], (bounds[0][2] + bounds[1][2]) / 2]

    return {
        "nodes": {
            "node_0": {
                "id": "node_0",
                "position": bottom,
                "radius": 0.05,
                "is_junction": False,
                "is_tip": False,
                "neighbor_ids": ["node_1"],
            },
            "node_1": {
                "id": "node_1",
                "position": top,
                "radius": 0.02,
                "is_junction": False,
                "is_tip": True,
                "neighbor_ids": ["node_0"],
            },
        },
        "edges": {
            "edge_0": {
                "id": "edge_0",
                "source_id": "node_0",
                "target_id": "node_1",
                "curve_points": [bottom, [(b + t) / 2 for b, t in zip(bottom, top)], top],
                "radii": [0.05, 0.035, 0.02],
                "length": float(np.linalg.norm(np.array(top) - np.array(bottom))),
            },
        },
        "root_id": "node_0",
        "metadata": {
            "fallback": True,
            "mesh_bounds": mesh.bounds.tolist(),
        },
    }
