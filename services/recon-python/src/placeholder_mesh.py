"""Generate a procedural bonsai-like mesh for development/testing."""

import tempfile
import numpy as np
import trimesh


def generate_bonsai_mesh() -> str:
    """Generate a simple procedural bonsai tree mesh.

    Creates a trunk (cylinder) with a few branches (thinner cylinders)
    and a foliage canopy (spheres). Returns path to a GLB file.
    """
    meshes = []

    # Trunk — tapered cylinder
    trunk = _tapered_cylinder(
        base_radius=0.06,
        top_radius=0.03,
        height=0.5,
        sections=12,
        segments=8,
    )
    trunk.visual.vertex_colors = np.full((len(trunk.vertices), 4), [120, 80, 50, 255], dtype=np.uint8)
    meshes.append(trunk)

    # Main branches
    branch_configs = [
        {"angle": 35, "azimuth": 0, "length": 0.25, "y_start": 0.35, "radius": 0.02},
        {"angle": 40, "azimuth": 120, "length": 0.22, "y_start": 0.38, "radius": 0.018},
        {"angle": 30, "azimuth": 240, "length": 0.2, "y_start": 0.32, "radius": 0.015},
        {"angle": 25, "azimuth": 60, "length": 0.18, "y_start": 0.42, "radius": 0.012},
        {"angle": 45, "azimuth": 180, "length": 0.15, "y_start": 0.4, "radius": 0.012},
    ]

    foliage_positions = []

    for cfg in branch_configs:
        branch = _tapered_cylinder(
            base_radius=cfg["radius"],
            top_radius=cfg["radius"] * 0.4,
            height=cfg["length"],
            sections=8,
            segments=4,
        )
        branch.visual.vertex_colors = np.full(
            (len(branch.vertices), 4), [100, 70, 45, 255], dtype=np.uint8
        )

        # Rotate branch away from trunk
        angle_rad = np.radians(cfg["angle"])
        azimuth_rad = np.radians(cfg["azimuth"])

        # Tilt in XZ plane
        rot_x = trimesh.transformations.rotation_matrix(angle_rad, [1, 0, 0])
        rot_y = trimesh.transformations.rotation_matrix(azimuth_rad, [0, 1, 0])
        branch.apply_transform(rot_x)
        branch.apply_transform(rot_y)

        # Translate to branch start point on trunk
        branch.apply_translation([0, cfg["y_start"], 0])
        meshes.append(branch)

        # Compute foliage position at branch tip
        tip_dir = np.array([
            np.sin(angle_rad) * np.sin(azimuth_rad),
            np.cos(angle_rad),
            np.sin(angle_rad) * np.cos(azimuth_rad),
        ])
        tip_pos = np.array([0, cfg["y_start"], 0]) + tip_dir * cfg["length"]
        foliage_positions.append(tip_pos)

    # Top foliage position
    foliage_positions.append(np.array([0, 0.55, 0]))

    # Foliage clusters — irregular spheres
    for pos in foliage_positions:
        radius = 0.06 + np.random.uniform(0, 0.04)
        sphere = trimesh.creation.icosphere(subdivisions=2, radius=radius)
        # Slightly squash vertically for more natural look
        sphere.vertices[:, 1] *= 0.7
        # Add noise for organic feel
        sphere.vertices += np.random.normal(0, radius * 0.08, sphere.vertices.shape)
        sphere.apply_translation(pos)
        sphere.visual.vertex_colors = np.full(
            (len(sphere.vertices), 4),
            [40 + np.random.randint(0, 30), 120 + np.random.randint(0, 40), 30 + np.random.randint(0, 20), 255],
            dtype=np.uint8,
        )
        meshes.append(sphere)

    # Pot — short wide cylinder
    pot = trimesh.creation.cylinder(radius=0.12, height=0.08, sections=16)
    pot.apply_translation([0, -0.04, 0])
    pot.visual.vertex_colors = np.full(
        (len(pot.vertices), 4), [160, 100, 60, 255], dtype=np.uint8
    )
    meshes.append(pot)

    # Soil surface
    soil = trimesh.creation.cylinder(radius=0.11, height=0.01, sections=16)
    soil.apply_translation([0, 0.0, 0])
    soil.visual.vertex_colors = np.full(
        (len(soil.vertices), 4), [80, 60, 40, 255], dtype=np.uint8
    )
    meshes.append(soil)

    combined = trimesh.util.concatenate(meshes)

    fd, path = tempfile.mkstemp(suffix=".glb")
    combined.export(path, file_type="glb")
    return path


def _tapered_cylinder(
    base_radius: float,
    top_radius: float,
    height: float,
    sections: int = 12,
    segments: int = 4,
) -> trimesh.Trimesh:
    """Create a tapered cylinder (truncated cone)."""
    vertices = []
    faces = []

    for seg in range(segments + 1):
        t = seg / segments
        y = t * height
        r = base_radius + (top_radius - base_radius) * t

        for sec in range(sections):
            angle = 2 * np.pi * sec / sections
            x = r * np.cos(angle)
            z = r * np.sin(angle)
            vertices.append([x, y, z])

    vertices = np.array(vertices)

    for seg in range(segments):
        for sec in range(sections):
            i0 = seg * sections + sec
            i1 = seg * sections + (sec + 1) % sections
            i2 = (seg + 1) * sections + sec
            i3 = (seg + 1) * sections + (sec + 1) % sections
            faces.append([i0, i2, i1])
            faces.append([i1, i2, i3])

    faces = np.array(faces)
    return trimesh.Trimesh(vertices=vertices, faces=faces)
