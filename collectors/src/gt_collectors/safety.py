"""Turkish-forces safety filter (red line). Runs in memory, before anything is stored or sent.

Rules (collectors/README.md; the ingest Worker applies them again)::

    DROP if kind == adsb and 0x4B8000 <= icao24 <= 0x4BFFFF      # Türkiye ICAO 24-bit block
    DROP if kind == ais  and mid(mmsi) == 271                     # Türkiye MID
    DROP if the record has a position inside the Türkiye geofence (land + internal waters + 12 nm)

Fail safe: a missing or invalid ICAO address / MMSI, an ADS-B/AIS record without a position,
and any half-present, non-numeric, non-finite or out-of-range position are dropped too.

Dropped records are never logged or returned; callers get only counts.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from gt_collectors.geo import Geofence, turkiye_geofence

if TYPE_CHECKING:
    from gt_collectors.signal import Signal

TR_ICAO_FIRST = 0x4B8000
TR_ICAO_LAST = 0x4BFFFF
TR_MID = 271
# ITU-R M.585: Maritime Identification Digits are allocated in 201-775.
MID_MIN, MID_MAX = 201, 775
POSITION_REQUIRED_KINDS = frozenset({"adsb", "ais"})

_HEX6 = re.compile(r"[0-9a-fA-F]{6}")
_DIGITS9 = re.compile(r"[0-9]{9}")


class DropReason(StrEnum):
    TR_ICAO_BLOCK = "tr_icao_block"
    INVALID_ICAO = "invalid_icao"
    TR_MID = "tr_mid"
    INVALID_MMSI = "invalid_mmsi"
    MISSING_POSITION = "missing_position"
    INVALID_POSITION = "invalid_position"
    IN_GEOFENCE = "in_geofence"


def parse_icao24(value: Any) -> int | None:
    """Parse a 24-bit ICAO aircraft address (``"4b1a2c"``, ``"0x4B1A2C"`` or an int)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if 0 <= value <= 0xFFFFFF else None
    if not isinstance(value, str):
        return None
    s = value.strip()
    if s[:2].lower() == "0x":
        s = s[2:]
    if not _HEX6.fullmatch(s):  # e.g. "~abc123" (non-ICAO/TIS-B) is not an ICAO address
        return None
    return int(s, 16)


def normalize_mmsi(value: Any) -> str | None:
    """Return the 9-digit MMSI string, or ``None`` if invalid.

    Integers are zero-padded (``2711234`` was ``002711234``, a coast station). Strings must be
    exactly nine digits (surrounding whitespace allowed).
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return f"{value:09d}" if 0 <= value <= 999_999_999 else None
    if isinstance(value, str) and _DIGITS9.fullmatch(value.strip()):
        return value.strip()
    return None


def mmsi_mid(value: Any) -> int | None:
    """Maritime Identification Digits of an MMSI, for every format that carries one.

    ==============  ===========  =============================================
    Format          Pattern      Station
    ==============  ===========  =============================================
    ``MIDxxxxxx``   2-7 first    ship station
    ``0MIDxxxxx``                group ship station call
    ``00MIDxxxx``                coast station
    ``111MIDxxx``                SAR aircraft
    ``8MIDxxxxx``                handheld VHF with DSC and GNSS
    ``98MIDxxxx``                craft associated with a parent ship
    ``99MIDxxxx``                aid to navigation
    ==============  ===========  =============================================

    ``970/972/974…`` (AIS-SART, MOB, EPIRB-AIS) carry a manufacturer code, not a MID, and any
    other pattern is invalid: both return ``None`` (the filter then drops the record).
    """
    mmsi = normalize_mmsi(value)
    if mmsi is None:
        return None
    if mmsi[0] in "234567":
        mid = mmsi[0:3]
    elif mmsi.startswith("00"):
        mid = mmsi[2:5]
    elif mmsi.startswith("0"):
        mid = mmsi[1:4]
    elif mmsi.startswith("111"):
        mid = mmsi[3:6]
    elif mmsi.startswith("8"):
        mid = mmsi[1:4]
    elif mmsi.startswith(("98", "99")):
        mid = mmsi[2:5]
    else:
        return None
    n = int(mid)
    return n if MID_MIN <= n <= MID_MAX else None


def _coordinate(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    f = float(value)
    return f if math.isfinite(f) else None


def assess(
    kind: str,
    *,
    icao24: Any = None,
    mmsi: Any = None,
    lat: Any = None,
    lon: Any = None,
    geofence: Geofence | None = None,
) -> DropReason | None:
    """Return why a record must be dropped, or ``None`` if it may be kept."""
    kind = (kind or "").strip().lower()
    if kind == "adsb":
        address = parse_icao24(icao24)
        if address is None:
            return DropReason.INVALID_ICAO
        if TR_ICAO_FIRST <= address <= TR_ICAO_LAST:
            return DropReason.TR_ICAO_BLOCK
    elif kind == "ais":
        mid = mmsi_mid(mmsi)
        if mid is None:
            return DropReason.INVALID_MMSI
        if mid == TR_MID:
            return DropReason.TR_MID

    if lat is None and lon is None:
        return DropReason.MISSING_POSITION if kind in POSITION_REQUIRED_KINDS else None
    flat, flon = _coordinate(lat), _coordinate(lon)
    if flat is None or flon is None or not (-90.0 <= flat <= 90.0) or not (-180.0 <= flon <= 180.0):
        return DropReason.INVALID_POSITION
    if (geofence or turkiye_geofence()).contains(flat, flon):
        return DropReason.IN_GEOFENCE
    return None


def assess_signal(
    signal: Signal, *, kind: str = "signal", geofence: Geofence | None = None
) -> DropReason | None:
    geo = signal.geo
    return assess(kind, lat=geo.lat, lon=geo.lon, geofence=geofence)


@dataclass
class FilterResult:
    kept: list
    dropped: int = 0
    by_reason: Counter = field(default_factory=Counter)


def filter_signals(signals: Iterable[Signal], *, geofence: Geofence | None = None) -> FilterResult:
    """Keep only signals that pass the safety filter. Only counts of dropped items are returned."""
    result = FilterResult(kept=[])
    for signal in signals:
        reason = assess_signal(signal, geofence=geofence)
        if reason is None:
            result.kept.append(signal)
        else:
            result.dropped += 1
            result.by_reason[reason.value] += 1
    return result


def filter_records(records: Iterable[dict], *, kind: str, geofence: Geofence | None = None) -> FilterResult:
    """Filter raw position records (dicts with ``icao24``/``mmsi``/``lat``/``lon`` keys)."""
    result = FilterResult(kept=[])
    for rec in records:
        reason = assess(
            kind,
            icao24=rec.get("icao24"),
            mmsi=rec.get("mmsi"),
            lat=rec.get("lat"),
            lon=rec.get("lon"),
            geofence=geofence,
        )
        if reason is None:
            result.kept.append(rec)
        else:
            result.dropped += 1
            result.by_reason[reason.value] += 1
    return result
