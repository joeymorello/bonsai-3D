"""Mesh cleanup utilities using trimesh."""

import os
import tempfile

import numpy as np
import trimesh


def normalize_mesh(mesh_path: str) -> str:
    """Center the mesh, normalize scale, and align the up axis to +Y.

    Args:
        mesh_path: Path to the input mesh file.

    Returns:
        Path to the normalized mesh file.
    """
    mesh = trimesh.load(mesh_path, force="mesh")

    # Center at origin
    centroid = mesh.centroid
    mesh.vertices -= centroid

    # Normalize scale so the mesh fits in a unit bounding box
    extent = mesh.extents.max()
    if extent > 0:
        mesh.vertices /= extent

    # Align up axis: detect the principal axis closest to vertical
    # and rotate so it aligns with +Y
    inertia = mesh.principal_inertia_vectors
    up_candidate = inertia[np.argmax(np.abs(inertia[:, 1]))]
    if up_candidate[1] < 0:
        up_candidate = -up_candidate

    # Build rotation from current up to +Y
    target_up = np.array([0.0, 1.0, 0.0])
    if not np.allclose(up_candidate, target_up, atol=0.01):
        rotation = trimesh.geometry.align_vectors(target_up, up_candidate)
        mesh.apply_transform(rotation)

    output_path = _temp_mesh_output(mesh_path, "_normalized")
    mesh.export(output_path)
    return output_path


def decimate_mesh(mesh_path: str, target_faces: int = 30000) -> str:
    """Reduce the face count of a mesh.

    Args:
        mesh_path: Path to the input mesh file.
        target_faces: Target number of faces after decimation.

    Returns:
        Path to the decimated mesh file.
    """
    mesh = trimesh.load(mesh_path, force="mesh")

    current_faces = len(mesh.faces)
    if current_faces <= target_faces:
        return mesh_path

    # Use trimesh's built-in simplification
    ratio = target_faces / current_faces
    simplified = mesh.simplify_quadric_decimation(target_faces)

    output_path = _temp_mesh_output(mesh_path, "_decimated")
    simplified.export(output_path)
    return output_path


def separate_components(mesh_path: str) -> list[str]:
    """Split a mesh into disconnected components.

    Args:
        mesh_path: Path to the input mesh file.

    Returns:
        List of paths to individual component mesh files.
    """
    mesh = trimesh.load(mesh_path, force="mesh")
    components = mesh.split(only_watertight=False)

    output_paths: list[str] = []
    for i, component in enumerate(components):
        output_path = _temp_mesh_output(mesh_path, f"_component_{i}")
        component.export(output_path)
        output_paths.append(output_path)

    return output_paths


def compute_bounding_box(mesh_path: str) -> dict:
    """Compute the axis-aligned bounding box of a mesh.

    Args:
        mesh_path: Path to the input mesh file.

    Returns:
        Dictionary with 'min', 'max', 'center', and 'extents' as lists of floats.
    """
    mesh = trimesh.load(mesh_path, force="mesh")
    bounds = mesh.bounds

    return {
        "min": bounds[0].tolist(),
        "max": bounds[1].tolist(),
        "center": mesh.centroid.tolist(),
        "extents": mesh.extents.tolist(),
    }


def _temp_mesh_output(original_path: str, suffix: str) -> str:
    """Create a temporary output path for a mesh file."""
    base, ext = os.path.splitext(os.path.basename(original_path))
    if not ext:
        ext = ".glb"
    fd, path = tempfile.mkstemp(suffix=f"{suffix}{ext}")
    os.close(fd)
    return path
