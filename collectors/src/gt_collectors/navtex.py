"""NAVTEX parser: a navigational warning as a structured record.

A NAVTEX message is a fixed-shape telex, and the shape is what makes it worth collecting::

    ZCZC LA03 191940 UTC FEB 26
    LIMNOS RADIO NAVWARN 038/26
    NORTHEAST AEGEAN SEA
    PSARA ISLAND AGIOS GEORGIOS POINT
    FLASHING WHITE LIGHT IN POSITION: 38-32.20N 025-36.56E UNLIT
    NNNN

``ZCZC`` opens the message and ``NNNN`` closes it; ``LA03`` is the B1–B4 group — B1 the
transmitting station's letter, B2 the subject, B3B4 the serial in that subject's series. The rest
is free text, but it is written to a habit: the issuing station and the warning's own number, the
sea area, then what is where.

**Why this matters to this project.** The areas a state closes to navigation, and how often, are
a published measure of its military activity that nobody has to guess at: firing practice, missile
tests, exercises, submarine operations and survey work are all announced this way, with a position
and a time window, by the state doing them. Counting them turns "there is more activity in the
Aegean lately" into a number with a source. It is also the safest possible way to measure that
activity: everything here is a public safety broadcast meant to be read by every ship at sea, and
nothing in it is a position of a Turkish unit (ADR 0013).

What this module does **not** do: it does not judge, attribute or characterise. It extracts what
the message says — station, serial, time, positions, and which kind of activity the wording names —
and leaves the reading of it to a human.

**Terms.** Some hydrographic services publish their NAVTEX pages under terms that forbid
redistribution and modification — the Hellenic service is one — so the message text itself must not
be stored or republished by us. Facts are not text: the station, the serial, the time, the
positions and the kind of activity are what we keep, and :meth:`NavtexMessage.to_json` leaves the
body out unless it is asked for explicitly. Anything that ends up in a public file of ours has to
come from a source whose terms allow it (ADR 0009).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

# B1: the transmitting station letter; B2: the subject indicator. Both are ITU/IMO allocations,
# and only the ones that reach this region are named — an unknown letter is kept, never guessed.
STATIONS = {
    "A": "Kerkyra (GR)", "H": "Irakleio (GR)", "L": "Limnos (GR)", "K": "Kerkyra (GR)",
    "F": "İstanbul (TR)", "M": "İzmir (TR)", "I": "Samsun (TR)", "D": "Antalya (TR)",
    "B": "Varna (BG)", "C": "Constanţa (RO)", "R": "Novorossiysk (RU)", "W": "Odesa (UA)",
    "V": "Cyprus (CY)", "P": "Alexandria (EG)", "N": "Haifa (IL)", "X": "Beirut (LB)",
}
SUBJECTS = {
    "A": "navigational warning", "B": "meteorological warning", "C": "ice report",
    "D": "search and rescue", "E": "meteorological forecast", "F": "pilot service",
    "G": "AIS", "H": "LORAN", "I": "unassigned", "J": "SATNAV", "K": "other electronic navaid",
    "L": "navigational warning (additional)", "T": "test", "V": "special service",
    "W": "special service", "X": "special service", "Y": "special service", "Z": "no message",
}

# What the message says is happening. The order matters: the first match wins, and the more
# specific kinds are tried first, because a firing exercise is also an exercise.
ACTIVITY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("firing", ("FIRING", "GUNNERY", "LIVE FIRE", "LIVE-FIRE", "ATIŞ", "SHOOTING")),
    ("missile-test", ("MISSILE", "ROCKET LAUNCH", "FÜZE")),
    ("submarine", ("SUBMARINE", "DENİZALTI")),
    ("military-exercise", ("EXERCISE", "MILITARY ACTIVITY", "NAVAL ACTIVITY", "TATBİKAT",
                           "MANOEUVRE", "MANEUVER")),
    ("survey", ("SURVEY", "SEISMIC", "RESEARCH", "ARAŞTIRMA", "SİSMİK", "HYDROGRAPHIC")),
    ("cable-pipeline", ("CABLE", "PIPELINE", "BORU", "KABLO")),
    ("sar", ("SARWARN", "SEARCH AND RESCUE", "PERSON IN THE SEA", "DISTRESS")),
    ("aid-to-navigation", ("LIGHT", "BUOY", "BEACON", "UNLIT", "FENER", "ŞAMANDIRA")),
    ("wreck-obstruction", ("WRECK", "OBSTRUCTION", "DERELICT", "BATIK")),
)

# "38-32.20N 025-36.56E", "38 32.20 N 025 36.56 E", "3832.20N 02536.56E", "38-32-12N 025-36-34E"
_LAT = r"(\d{1,2})[-\s]?(\d{2}(?:[.,]\d+)?)(?:[-\s]?(\d{2}(?:[.,]\d+)?))?\s*([NS])"
_LON = r"(\d{1,3})[-\s]?(\d{2}(?:[.,]\d+)?)(?:[-\s]?(\d{2}(?:[.,]\d+)?))?\s*([EW])"
POSITION_RE = re.compile(_LAT + r"[\s,/]+" + _LON)
HEADER_RE = re.compile(
    r"ZCZC\s+([A-Z])([A-Z])(\d{2})\s+(\d{2})(\d{2})(\d{2})\s*UTC\s+([A-Z]{3})\s+(\d{2})", re.I
)
SERIAL_RE = re.compile(
    r"\b([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s\.]{2,30}?)\s+(NAVWARN|SARWARN|NAVAREA|METAREA|WARNING)"
    r"\s+(\d{1,4}\s*/\s*\d{2})",
    re.I,
)
MONTHS = {m: i for i, m in enumerate(
    ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"), start=1)}


@dataclass(frozen=True)
class Position:
    lat: float
    lon: float

    def as_tuple(self) -> tuple[float, float]:
        return (self.lat, self.lon)


@dataclass
class NavtexMessage:
    """One NAVTEX message. Every field is what the message says, or None when it does not say it."""

    raw: str
    station_letter: str | None = None
    station: str | None = None
    subject_letter: str | None = None
    subject: str | None = None
    serial_in_subject: str | None = None      # B3B4, the two digits after the letters
    issuing_station: str | None = None        # "LIMNOS RADIO", as written
    warning_kind: str | None = None           # NAVWARN | SARWARN | NAVAREA | METAREA
    warning_serial: str | None = None         # "038/26", as written
    issued_at: datetime | None = None
    positions: list[Position] = field(default_factory=list)
    activity: str | None = None
    body: str = ""
    cancelled_by: str | None = None

    def to_json(self, *, include_body: bool = False) -> dict:
        """The record we keep. The body is left out by default: for a source whose terms forbid
        redistribution, the facts may be kept and the text may not (see the module docstring)."""
        out = {
            "station_letter": self.station_letter,
            "station": self.station,
            "subject_letter": self.subject_letter,
            "subject": self.subject,
            "serial_in_subject": self.serial_in_subject,
            "issuing_station": self.issuing_station,
            "warning_kind": self.warning_kind,
            "warning_serial": self.warning_serial,
            "issued_at": self.issued_at.strftime("%Y-%m-%dT%H:%M:%SZ") if self.issued_at else None,
            "positions": [p.as_tuple() for p in self.positions],
            "activity": self.activity,
            "cancelled_by": self.cancelled_by,
        }
        if include_body:
            out["body"] = self.body
        return out


def _dm(deg: str, minutes: str, seconds: str | None, hemi: str) -> float:
    value = int(deg) + float(minutes.replace(",", ".")) / 60
    if seconds:
        value += float(seconds.replace(",", ".")) / 3600
    return -value if hemi.upper() in ("S", "W") else value


def positions(text: str) -> list[Position]:
    """Every lat/lon pair in the text, in the order it appears, deduplicated and bounds-checked."""
    out: list[Position] = []
    seen: set[tuple[float, float]] = set()
    for m in POSITION_RE.finditer(text):
        lat = _dm(m.group(1), m.group(2), m.group(3), m.group(4))
        lon = _dm(m.group(5), m.group(6), m.group(7), m.group(8))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        key = (round(lat, 6), round(lon, 6))
        if key not in seen:
            seen.add(key)
            out.append(Position(*key))
    return out


def activity_of(text: str) -> str | None:
    """Which kind of activity the wording names, or None when it names none of them."""
    upper = text.upper()
    for name, needles in ACTIVITY_RULES:
        if any(n in upper for n in needles):
            return name
    return None


def _issued_at(groups: tuple[str, str, str, str, str]) -> datetime | None:
    """(day, hour, minute, month name, two-digit year) as written in the ZCZC line."""
    day, hour, minute, mon, year = groups
    month = MONTHS.get(mon.upper())
    if not month:
        return None
    try:
        return datetime(2000 + int(year), month, int(day), int(hour), int(minute), tzinfo=UTC)
    except ValueError:
        return None


def parse(text: str, *, now: datetime | None = None) -> NavtexMessage:
    """Parse one NAVTEX message. Unparseable parts are left as None rather than guessed."""
    raw = text.strip()
    flat = " ".join(raw.split())
    msg = NavtexMessage(raw=raw)

    header = HEADER_RE.search(flat)
    if header:
        b1, b2, b3b4, day, hh, mm, mon, yy = header.groups()
        msg.station_letter = b1.upper()
        msg.station = STATIONS.get(b1.upper())
        msg.subject_letter = b2.upper()
        msg.subject = SUBJECTS.get(b2.upper())
        msg.serial_in_subject = b3b4
        msg.issued_at = _issued_at((day, hh, mm, mon, yy))

    serial = SERIAL_RE.search(flat)
    if serial:
        msg.issuing_station = " ".join(serial.group(1).split()).title()
        msg.warning_kind = serial.group(2).upper()
        msg.warning_serial = serial.group(3).replace(" ", "")

    body = flat
    if header:
        body = flat[header.end():].strip()
    if serial and serial.end() > (header.end() if header else 0):
        body = flat[serial.end():].strip()
    msg.body = re.sub(r"\s*NNNN\s*$", "", body).strip()

    msg.positions = positions(msg.body or flat)
    msg.activity = activity_of(flat)
    cancel = re.search(r"CANCEL(?:LED|)\s+(?:BY\s+)?(?:NAVWARN|SARWARN)?\s*(\d{1,4}\s*/\s*\d{2})", flat, re.I)
    if cancel:
        msg.cancelled_by = cancel.group(1).replace(" ", "")
    return msg


def parse_many(texts: list[str], *, now: datetime | None = None) -> list[NavtexMessage]:
    return [parse(t, now=now) for t in texts]
