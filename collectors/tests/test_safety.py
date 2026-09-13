"""Turkish-forces safety filter — must-drop / must-pass cases from synthetic fixtures (issue #1)."""

from __future__ import annotations

import json

import pytest

from gt_collectors import safety
from gt_collectors.safety import DropReason, assess, filter_records, filter_signals, mmsi_mid, parse_icao24
from tests.conftest import FIXTURES, make_signal

CASES = json.loads((FIXTURES / "safety_cases.json").read_text(encoding="utf-8"))["cases"]
_SPECIAL = {"NaN": float("nan"), "Infinity": float("inf")}


def _coord(v: object) -> object:
    return _SPECIAL.get(v, v) if isinstance(v, str) and v in _SPECIAL else v


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_fixture_case(case: dict) -> None:
    reason = assess(
        case["kind"],
        icao24=case.get("icao24"),
        mmsi=case.get("mmsi"),
        lat=_coord(case.get("lat")),
        lon=_coord(case.get("lon")),
    )
    expected = case["expect"]
    assert (reason.value if reason else None) == expected


def test_fixtures_cover_both_outcomes() -> None:
    drops = [c for c in CASES if c["expect"]]
    passes = [c for c in CASES if not c["expect"]]
    assert len(drops) >= 20 and len(passes) >= 8
    assert {c["expect"] for c in drops} == {r.value for r in DropReason}


@pytest.mark.parametrize(
    ("mmsi", "mid"),
    [
        ("271123456", 271),  # ship
        ("027112345", 271),  # group call
        ("002711234", 271),  # coast station
        ("111271123", 271),  # SAR aircraft
        ("827112345", 271),  # handheld
        ("982711234", 271),  # craft associated with parent ship
        ("992711234", 271),  # aid to navigation
        ("237123456", 237),
        ("002371234", 237),
        (2711234, 271),  # int loses the leading zeros of 002711234
        ("970123456", None),  # AIS-SART: no MID
        ("972123456", None),  # MOB
        ("974123456", None),  # EPIRB-AIS
        ("112271123", None),  # 11x other than 111
        ("912345678", None),
        ("123456789", None),
        ("012345678", None),  # group call with MID 123 (unallocated)
        ("27112345", None),
        ("", None),
        (None, None),
        (True, None),
        (1_000_000_000, None),
    ],
)
def test_mmsi_mid_formats(mmsi: object, mid: int | None) -> None:
    assert mmsi_mid(mmsi) == mid


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("4b8000", 0x4B8000),
        (" 4BFFFF ", 0x4BFFFF),
        ("0x4b8001", 0x4B8001),
        (0x4B8002, 0x4B8002),
        ("~4b8000", None),
        ("4b800", None),
        ("4b80000", None),
        ("g00000", None),
        (-1, None),
        (0x1000000, None),
        (4.9e6, None),
        (None, None),
    ],
)
def test_parse_icao24(value: object, expected: int | None) -> None:
    assert parse_icao24(value) == expected


def test_whole_tr_block_is_dropped_and_neighbours_pass() -> None:
    far = {"lat": 35.0, "lon": 18.0}
    for address in range(safety.TR_ICAO_FIRST, safety.TR_ICAO_LAST + 1, 0x101):
        assert assess("adsb", icao24=f"{address:06x}", **far) is DropReason.TR_ICAO_BLOCK
    assert assess("adsb", icao24=safety.TR_ICAO_FIRST - 1, **far) is None
    assert assess("adsb", icao24=safety.TR_ICAO_LAST + 1, **far) is None


def test_kind_is_case_insensitive() -> None:
    assert assess(" ADSB ", icao24="4b8000", lat=35.0, lon=18.0) is DropReason.TR_ICAO_BLOCK
    assert assess("AIS", mmsi="271000001", lat=35.0, lon=18.0) is DropReason.TR_MID


def test_filter_records_returns_only_counts_for_dropped() -> None:
    records = [
        {"icao24": "4b8000", "lat": 35.0, "lon": 18.0, "callsign": "SYNTH1"},
        {"icao24": "abc123", "lat": 35.0, "lon": 18.0, "callsign": "SYNTH2"},
        {"icao24": "abc124", "lat": 39.9, "lon": 32.9, "callsign": "SYNTH3"},
        {"icao24": "abc125", "lat": None, "lon": None, "callsign": "SYNTH4"},
    ]
    result = filter_records(records, kind="adsb")
    assert [r["callsign"] for r in result.kept] == ["SYNTH2"]
    assert result.dropped == 3
    assert result.by_reason == {"tr_icao_block": 1, "in_geofence": 1, "missing_position": 1}
    # Nothing identifying the dropped records is kept anywhere on the result.
    assert "SYNTH1" not in repr(result) and "4b8000" not in repr(result)


def test_filter_signals() -> None:
    signals = [make_signal(1), make_signal(2, lat=41.0, lon=29.0), make_signal(3, lat=37.98, lon=23.73)]
    result = filter_signals(signals)
    assert [s.title for s in result.kept] == ["Synthetic item 1", "Synthetic item 3"]
    assert result.dropped == 1 and result.by_reason == {"in_geofence": 1}
