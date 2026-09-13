from __future__ import annotations

import dataclasses
import json
from datetime import datetime, timedelta, timezone

import pytest

from gt_collectors.normalize import content_hash
from gt_collectors.signal import GEO_KEYS, SIGNAL_KEYS, Geo, Signal
from tests.conftest import make_signal


def test_to_dict_matches_contract_exactly() -> None:
    d = make_signal(1).to_dict()
    assert tuple(d) == SIGNAL_KEYS
    assert tuple(d["geo"]) == GEO_KEYS
    assert d["fetched_at"] == "2026-09-12T10:15:00Z"
    assert d["raw_hash"].startswith("sha256:")


def test_json_round_trip() -> None:
    s = make_signal(2, lat=37.9, lon=23.7)
    again = Signal.from_dict(json.loads(s.to_json()))
    assert again == s


def test_from_dict_rejects_extra_keys() -> None:
    d = make_signal(3).to_dict()
    d["content_hash"] = "sha256:" + "0" * 64
    with pytest.raises(ValueError):
        Signal.from_dict(d)


def test_content_hash_uses_url_and_text() -> None:
    s = make_signal(4)
    assert s.content_hash() == content_hash(s.url, s.text)


@pytest.mark.parametrize(
    "change",
    [
        {"source_id": "src_bad"},
        {"url": "https://Example.org/x?utm_source=a"},
        {"fetched_at": datetime(2026, 9, 12, 10, 0)},  # naive
        {"fetched_at": datetime(2026, 9, 12, 10, 0, tzinfo=timezone(timedelta(hours=3)))},  # not UTC
        {"lang": "English"},
        {"title": "x" * 301},
        {"text": "x" * 1001},
        {"raw_hash": "md5:abc"},
    ],
)
def test_validation(change: dict) -> None:
    with pytest.raises(ValueError):
        dataclasses.replace(make_signal(5), **change)


@pytest.mark.parametrize(
    "geo",
    [
        {"lat": float("nan"), "lon": 1.0},
        {"lat": True, "lon": 1.0},
        {"region": "Aegean Sea"},
        {"precision": "EXACT"},
        {"place": "x" * 201},
    ],
)
def test_geo_validation(geo: dict) -> None:
    with pytest.raises(ValueError):
        Geo(**geo)


def test_null_source_id_allowed_for_dry_run() -> None:
    assert make_signal(6, source_id=None).to_dict()["source_id"] is None
