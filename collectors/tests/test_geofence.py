"""Türkiye geofence: named points, an independent property check, and data provenance."""

from __future__ import annotations

import json
import math
import random

import pytest

from gt_collectors.geo import KM_PER_NM, Geofence, load_geofence_data, point_in_ring, turkiye_geofence
from gt_collectors.tools import build_geofence
from tests.conftest import REPO_ROOT

FENCE = turkiye_geofence()

# Synthetic query points (rounded city/sea coordinates), not records of anything.
MUST_DROP = {
    "ankara": (39.93, 32.86),
    "istanbul": (41.01, 28.98),
    "izmir": (38.42, 27.14),
    "lake-van": (38.65, 42.90),
    "hakkari-border-area": (37.30, 44.20),
    "edirne": (41.68, 26.56),
    "gokceada": (40.17, 25.85),
    "central-marmara": (40.75, 28.00),
    "marmara-west": (40.65, 27.55),
    "bosphorus": (41.12, 29.06),
    "dardanelles": (40.20, 26.40),
    "gulf-of-izmit": (40.74, 29.70),
    "10km-off-sinop": (42.12, 35.15),
    "iskenderun-gulf": (36.70, 35.95),
    # Consequences of a uniform 12 nm buffer (fail safe); see collectors/README open questions.
    "kastellorizo-2km-off-kas": (36.15, 29.59),
    "batumi-near-sarp-border": (41.64, 41.64),
}
MUST_PASS = {
    "athens": (37.98, 23.73),
    "heraklion": (35.34, 25.13),
    "nicosia": (35.17, 33.36),
    "kyrenia": (35.34, 33.32),
    "aleppo": (36.20, 37.15),
    "mosul": (36.34, 43.13),
    "tbilisi": (41.72, 44.79),
    "sofia": (42.70, 23.32),
    "mid-black-sea": (43.30, 34.00),
    "east-med-open-sea": (34.50, 31.00),
    "null-island": (0.0, 0.0),
    "antimeridian": (0.0, 180.0),
    "south-pole": (-90.0, 0.0),
}


@pytest.mark.parametrize("name", MUST_DROP)
def test_must_drop(name: str) -> None:
    assert FENCE.contains(*MUST_DROP[name])


@pytest.mark.parametrize("name", MUST_PASS)
def test_must_pass(name: str) -> None:
    assert not FENCE.contains(*MUST_PASS[name])


def test_effective_radius_includes_all_margins() -> None:
    data = load_geofence_data()
    assert data["buffer_nm"] == 12
    expected = (12 * KM_PER_NM + data["max_simplification_error_km"] + data["source_margin_km"]) * 1.01
    assert FENCE.radius_km == pytest.approx(expected)
    assert FENCE.radius_km > 12 * KM_PER_NM


def test_buffer_is_parameterised() -> None:
    narrower = Geofence.from_mapping(load_geofence_data(), buffer_nm=0)
    assert narrower.contains(39.93, 32.86)  # land still inside
    assert not narrower.contains(42.12, 35.15)  # 10 km offshore now outside
    assert FENCE.contains(42.12, 35.15)


def test_point_in_ring_basics() -> None:
    square = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    assert point_in_ring(0.5, 0.5, square)
    assert not point_in_ring(1.5, 0.5, square)
    fence = Geofence([square], radius_km=10)
    assert fence.contains(0.5, 1.05)  # ~5.5 km north of the edge
    assert not fence.contains(0.5, 1.2)  # ~22 km north


def test_rejects_degenerate_input() -> None:
    with pytest.raises(ValueError):
        Geofence([[(0, 0), (1, 1)]], radius_km=1)
    with pytest.raises(ValueError):
        Geofence([[(0, 0), (1, 0), (0, 1)]], radius_km=-1)
    with pytest.raises(ValueError):
        Geofence.from_mapping({"schema": "other"})


# --- independent property check ---------------------------------------------------------------

EARTH_RADIUS_KM = 6371.0088


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _densify(ring: list[tuple[float, float]], step_km: float) -> list[tuple[float, float]]:
    out = []
    for i, (x1, y1) in enumerate(ring):
        x2, y2 = ring[(i + 1) % len(ring)]
        n = max(1, math.ceil(_haversine(y1, x1, y2, x2) / step_km))
        out.extend((x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(n))
    return out


def test_property_against_unsimplified_source() -> None:
    """Compare with the ORIGINAL Natural Earth rings using great-circle distances.

    Reference: inside (original land or internal waters) or within 12 nm -> must drop;
    outside and farther than the effective radius (+ slack for densification/approximation)
    -> must pass. Points in between are unconstrained.
    """
    topo = json.loads((REPO_ROOT / build_geofence.SOURCE_REL).read_text(encoding="utf-8"))
    rings = [*build_geofence.decode_feature(topo, build_geofence.FEATURE_ID), build_geofence.INTERNAL_WATERS]
    step = 1.0
    boundary = [p for r in rings for p in _densify(r, step)]
    rng = random.Random(792)
    must_drop_km = 12 * KM_PER_NM
    must_pass_km = FENCE.radius_km * 1.01 + step
    checked_drop = checked_pass = 0
    for _ in range(500):
        bx, by = rng.choice(boundary)
        lon, lat = bx + rng.uniform(-0.6, 0.6), by + rng.uniform(-0.45, 0.45)
        inside = any(point_in_ring(lon, lat, r) for r in rings)
        near = [p for p in boundary if abs(p[1] - lat) < 0.4 and abs(p[0] - lon) < 0.55]
        d = min((_haversine(lat, lon, py, px) for px, py in near), default=math.inf)
        if inside or d <= must_drop_km:
            checked_drop += 1
            assert FENCE.contains(lat, lon), (lat, lon, d)
        elif d >= must_pass_km:
            checked_pass += 1
            assert not FENCE.contains(lat, lon), (lat, lon, d)
    assert checked_drop > 150 and checked_pass > 50


# --- provenance -------------------------------------------------------------------------------


def test_vendored_geofence_matches_a_fresh_build() -> None:
    """The vendored JSON must be exactly what the builder produces from Natural Earth."""
    vendored = build_geofence.OUTPUT.read_text(encoding="utf-8")
    assert vendored == build_geofence.render(build_geofence.build(REPO_ROOT))


def test_provenance_is_recorded() -> None:
    data = load_geofence_data()
    land = data["provenance"]["land"]
    assert land["feature_id"] == "792" and "public domain" in land["licence"]
    assert 0 < data["max_simplification_error_km"] <= data["simplify_tolerance_km"] + 0.01
    roles = [p["role"] for p in data["polygons"]]
    assert roles.count("internal-waters") == 1 and roles.count("land") == 3


def test_internal_waters_polygon_stays_close_to_land() -> None:
    """Every hand-drawn vertex must be on Turkish land or within 12 nm of it."""
    topo = json.loads((REPO_ROOT / build_geofence.SOURCE_REL).read_text(encoding="utf-8"))
    land = Geofence(build_geofence.decode_feature(topo, build_geofence.FEATURE_ID), radius_km=12 * KM_PER_NM)
    for lon, lat in build_geofence.INTERNAL_WATERS:
        assert land.contains(lat, lon), (lon, lat)
