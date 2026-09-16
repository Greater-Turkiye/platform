"""Write a run's signals into the Cloudflare D1 ``gt-signals`` database (``db/README.md``).

The review queue issue is what a human reads; this store is the **history**. Everything the run
collected goes in with the triage status it ended the run with — queued, waiting for the next run,
or set aside by the relevance filter — so a later Worker can ask what was ever seen without
reading through GitHub issues.

What is **never** written: anything the Turkish-forces safety filter or the geofence dropped.
Those records never reach a file, so they cannot reach this module either; :func:`prepare` runs
:func:`gt_collectors.safety.filter_signals` once more anyway (defence in depth, as
:mod:`gt_collectors.ingest` does), and only counts of dropped items are reported.

Row mapping — ``collectors`` field → ``signals`` column (``db/migrations/signals/0001_init.sql``)::

    signal.content_hash()   -> content_hash   sha256:<64 hex>, the UNIQUE key
    signal.simhash()        -> simhash        signed 64-bit (simhash.to_signed64)
    signal.raw_hash         -> raw_hash
    signal.source_id        -> source_id      NULL while the source has no datasets record
    candidate.feed_id       -> collector_id
    signal.url              -> url
    signal.lang             -> lang
    signal.title            -> title          <= 300 characters (Signal enforces it)
    signal.text             -> text           <= 1000 characters, an excerpt, never full text
    signal.geo.region       -> region
    signal.geo              -> geo_json       only when the item has a place or coordinates
    signal.published_at     -> published_at
    signal.fetched_at       -> fetched_at
    candidate.status        -> triage_status  queued -> 'queued', deferred -> 'pending',
                                              off-topic -> 'scored'
    relevance.score         -> triage_score
    feed / queue id / topics-> triage_labels  JSON, what the run decided and why
    (default)               -> created_at     stamped by D1, so a replay cannot shift it

``triage_status`` uses the vocabulary of the migration: ``pending`` is "nobody has decided yet"
(a deferred item is offered again by the next run), ``scored`` is "the relevance filter had its
say and it did not reach the threshold", ``queued`` is "a human has it in front of them".
``dropped`` and ``duplicate`` stay free for the triage Worker; the collector never writes them.

Idempotence: every batch is a single ``INSERT … ON CONFLICT(content_hash) DO NOTHING`` — never
``DO UPDATE`` — so running the same batch twice writes nothing the second time, changes no
triage status and moves no counter. A duplicate insert costs zero rows of the daily write
budget; a new row costs about three (the row plus its two index entries), which is why batches
are small and the writer reports exactly how many rows it offered.

Parameter binding: ``wrangler d1 execute`` takes SQL text, not bound parameters, so values are
rendered as SQLite literals by :func:`sql_literal`. SQLite has no backslash escape inside a
string literal: doubling ``'`` is the whole rule, and everything else in the text is literal.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import tempfile
from collections import Counter
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from gt_collectors import safety
from gt_collectors import simhash as _simhash
from gt_collectors.geo import Geofence
from gt_collectors.signal import Signal

DATABASE = "gt-signals"
TABLE = "signals"
#: Rows per ``INSERT``. Small on purpose: D1 caps the size of one SQL statement, and a short
#: statement keeps a failed batch small enough to read in a workflow log.
MAX_BATCH = 25
BATCH_LIMIT = 100
WRANGLER_VERSION = "4.132.0"  # pinned like every other tool here
TOKEN_ENV = "CLOUDFLARE_API_TOKEN"  # noqa: S105 - the name of an environment variable, never a value

COLUMNS = (
    "content_hash",
    "simhash",
    "raw_hash",
    "source_id",
    "collector_id",
    "url",
    "lang",
    "title",
    "text",
    "region",
    "geo_json",
    "published_at",
    "fetched_at",
    "triage_status",
    "triage_score",
    "triage_labels",
)

#: What the collector's own word for an item becomes in the migration's ``triage_status`` enum.
TRIAGE_STATUS = {"queued": "queued", "deferred": "pending", "off-topic": "scored"}

_COLLECTOR_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$")
_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


class D1Error(RuntimeError):
    """The store could not be written. The rest of the run is unaffected."""


@dataclass(frozen=True, slots=True)
class Item:
    """One line of ``candidates.jsonl``: a signal plus what this run decided about it."""

    feed_id: str
    queue_id: str
    status: str
    signal: Signal
    redline_check: bool = False
    relevance: Mapping[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.status not in TRIAGE_STATUS:
            raise ValueError(f"unknown candidate status {self.status!r}; expected {tuple(TRIAGE_STATUS)}")
        if not _COLLECTOR_ID_RE.match(self.feed_id or ""):
            raise ValueError(f"collector_id must be 3-64 safe characters, got {self.feed_id!r}")

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> Item:
        try:
            return cls(
                feed_id=data["feed"],
                queue_id=data["queue_id"],
                status=data["status"],
                signal=Signal.from_dict(data["signal"]),
                redline_check=bool(data.get("redline_check")),
                relevance=data.get("relevance"),
            )
        except (KeyError, TypeError) as exc:
            raise ValueError(f"candidate line is not a review candidate: {exc}") from None


def read_batch(path: str | Path) -> list[Item]:
    """Read ``candidates.jsonl`` (the whole batch a queue run wrote), newest last."""
    file = Path(path)
    items: list[Item] = []
    with file.open(encoding="utf-8") as fh:
        for number, line in enumerate(fh, start=1):
            if not line.strip():
                continue
            try:
                items.append(Item.from_dict(json.loads(line)))
            except (json.JSONDecodeError, ValueError) as exc:
                raise ValueError(f"{file}:{number}: {exc}") from None
    return items


def sql_literal(value: Any) -> str:
    """Render a Python value as a SQLite literal (see the module docstring on escaping)."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        raise TypeError("booleans have no column here; map them to 0/1 or to JSON first")
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("a non-finite number cannot be stored")
        return repr(value)
    if isinstance(value, str):
        if "\x00" in value:
            raise ValueError("text with a NUL byte cannot be stored")
        return "'" + value.replace("'", "''") + "'"
    raise TypeError(f"cannot store {type(value).__name__} in D1")


def _labels(item: Item) -> str:
    labels: dict[str, Any] = {
        "queue_id": item.queue_id,
        "feed": item.feed_id,
        "collector_status": item.status,
        "redline_check": item.redline_check,
    }
    relevance = item.relevance or {}
    if relevance:
        labels["topics"] = list(relevance.get("topics") or ())
        labels["borderline"] = bool(relevance.get("borderline"))
        threshold = relevance.get("threshold")
        if isinstance(threshold, int | float) and not isinstance(threshold, bool):
            labels["threshold"] = float(threshold)
    return json.dumps(labels, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _score(item: Item) -> float | None:
    value = (item.relevance or {}).get("score")
    if value is None or isinstance(value, bool) or not isinstance(value, int | float):
        return None
    score = float(value)
    if not math.isfinite(score) or not 0.0 <= score <= 1.0:
        raise ValueError(f"relevance score out of range for triage_score: {value!r}")
    return score


def _geo_json(signal: Signal) -> str | None:
    """The location hint, and only when there is one beyond the region (which has its own column)."""
    geo = signal.geo
    if geo.place is None and geo.lat is None and geo.lon is None:
        return None
    return json.dumps(geo.to_dict(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def row(item: Item) -> dict[str, Any]:
    """One ``signals`` row as a mapping in :data:`COLUMNS` order. Raises on anything the schema rejects."""
    signal = item.signal
    payload = signal.to_dict()
    content_hash = signal.content_hash()
    fetched_at = payload["fetched_at"]
    published_at = payload["published_at"]
    if not _TIMESTAMP_RE.match(fetched_at) or (published_at and not _TIMESTAMP_RE.match(published_at)):
        raise ValueError("timestamps must be exactly YYYY-MM-DDTHH:MM:SSZ")
    if not signal.url.startswith(("https://", "http://")):
        raise ValueError(f"url must be http(s), got {signal.url!r}")
    return {
        "content_hash": content_hash,
        "simhash": _simhash.to_signed64(signal.simhash()),
        "raw_hash": signal.raw_hash,
        "source_id": signal.source_id,
        "collector_id": item.feed_id,
        "url": signal.url,
        "lang": signal.lang or None,
        "title": signal.title or None,
        "text": signal.text or None,
        "region": signal.geo.region,
        "geo_json": _geo_json(signal),
        "published_at": published_at,
        "fetched_at": fetched_at,
        "triage_status": TRIAGE_STATUS[item.status],
        "triage_score": _score(item),
        "triage_labels": _labels(item),
    }


def insert_sql(rows: Sequence[Mapping[str, Any]]) -> str:
    """One idempotent multi-row INSERT. Empty input raises: a batch is never empty."""
    if not rows:
        raise ValueError("an INSERT needs at least one row")
    if len(rows) > BATCH_LIMIT:
        raise ValueError(f"at most {BATCH_LIMIT} rows in one statement")
    values = ",\n  ".join("(" + ", ".join(sql_literal(r[column]) for column in COLUMNS) + ")" for r in rows)
    return (
        f"INSERT INTO {TABLE} ({', '.join(COLUMNS)})\nVALUES\n  {values}\n"
        "ON CONFLICT(content_hash) DO NOTHING;"
    )


def iter_batches(rows: Sequence[Any], size: int = MAX_BATCH) -> Iterator[Sequence[Any]]:
    if not 1 <= size <= BATCH_LIMIT:
        raise ValueError(f"batch size must be 1..{BATCH_LIMIT}")
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


@dataclass
class WriteReport:
    """Counts only — a dropped or duplicated item is never named in a log."""

    candidates: int = 0
    rows: int = 0
    batches: int = 0
    dropped_by_filter: int = 0
    duplicates: int = 0
    by_status: Counter[str] = field(default_factory=Counter)

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidates": self.candidates,
            "rows": self.rows,
            "batches": self.batches,
            "dropped_by_safety_filter": self.dropped_by_filter,
            "duplicates": self.duplicates,
            "by_triage_status": dict(sorted(self.by_status.items())),
            # The write budget of db/README.md: a new row costs the row plus two index entries.
            "rows_written_estimate": self.rows * 3,
        }


def prepare(
    items: Iterable[Item], *, geofence: Geofence | None = None
) -> tuple[list[dict[str, Any]], WriteReport]:
    """Rows to insert, and what happened to everything else.

    The safety filter runs here, before any mapping: a signal it drops has no row, so nothing it
    dropped can reach the database even if a caller hands this module an unfiltered batch.
    """
    items = list(items)
    report = WriteReport(candidates=len(items))
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if safety.assess_signal(item.signal, geofence=geofence) is not None:
            report.dropped_by_filter += 1
            continue
        mapped = row(item)
        if mapped["content_hash"] in seen:
            report.duplicates += 1
            continue
        seen.add(mapped["content_hash"])
        rows.append(mapped)
        report.by_status[mapped["triage_status"]] += 1
    report.rows = len(rows)
    return rows, report


def write(
    items: Iterable[Item],
    execute: Callable[[str], None],
    *,
    batch_size: int = MAX_BATCH,
    geofence: Geofence | None = None,
) -> WriteReport:
    """Map, filter and insert a run's items. ``execute`` receives one SQL statement per batch."""
    rows, report = prepare(items, geofence=geofence)
    for batch in iter_batches(rows, batch_size):
        execute(insert_sql(batch))
        report.batches += 1
    return report


def wrangler_command(database: str, file: str | Path, *, version: str = WRANGLER_VERSION) -> list[str]:
    npx = shutil.which("npx") or "npx"
    return [
        npx,
        "--yes",
        f"wrangler@{version}",
        "d1",
        "execute",
        database,
        "--remote",
        "--yes",
        "--file",
        str(file),
    ]


def wrangler_executor(
    database: str = DATABASE,
    *,
    version: str = WRANGLER_VERSION,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    timeout: float = 300.0,
) -> Callable[[str], None]:
    """Execute SQL against the remote database with the wrangler CLI.

    Authentication comes from the environment (``CLOUDFLARE_API_TOKEN``, or an OAuth login on a
    developer machine); no credential is ever read from a file in this repository or passed on
    the command line, where it would show up in a process list.
    """

    def execute(sql: str) -> None:
        with tempfile.TemporaryDirectory(prefix="gt-d1-") as tmp:
            path = Path(tmp) / "batch.sql"
            path.write_text(sql, encoding="utf-8", newline="\n")
            command = wrangler_command(database, path, version=version)
            try:
                # Fixed argv, no shell; the SQL travels in a file, never on the command line.
                result = runner(
                    command,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=timeout,
                    check=False,
                )
            except (OSError, subprocess.SubprocessError) as exc:
                raise D1Error(f"could not run wrangler: {type(exc).__name__}: {exc}") from None
            if result.returncode != 0:
                # wrangler echoes the statement on error; keep only its last lines out of the log.
                tail = "\n".join((result.stderr or result.stdout or "").strip().splitlines()[-5:])
                raise D1Error(f"wrangler d1 execute failed (exit {result.returncode}): {tail}")

    return execute


def has_token(environ: Mapping[str, str] | None = None) -> bool:
    return bool((environ if environ is not None else os.environ).get(TOKEN_ENV, "").strip())
