"""Publish a run's candidate batch to the ``collector-state`` branch, for a Worker to pull.

Why this exists: writing to D1 from GitHub Actions needs a ``CLOUDFLARE_API_TOKEN`` repository
secret. The Worker (``apps/ingest``) already runs *inside* the Cloudflare account that owns the
databases, so if the run **publishes** its batch and the Worker **pulls** it, the same rows reach
the same two tables with no shared credential anywhere. This module writes the file the Worker
reads; :mod:`gt_collectors.d1` still writes the rows directly when somebody runs it locally with
``wrangler login``.

Two files, next to the dedup ledger on the ``collector-state`` branch::

    collectors/state/batches/2026-09-16-18234567890.json   the batch
    collectors/state/batches/latest.json                   the pointer

The pointer names exactly one batch, so a consumer needs one small fetch to learn whether there is
anything new. It carries the SHA-256 of the batch file, so a reader can tell a truncated or
half-written file from the one the run meant to publish.

Batch document (``schema: gt.collector.batch/1``)::

    {"schema": "...", "batch_id": "2026-09-16-18234567890",
     "created_at": "2026-09-16T05:23:11Z", "run_url": "https://…" | null,
     "counts": {"rows": 37, "reviews": 12, "truncated": 0,
                "by_triage_status": {"pending": 5, "queued": 12, "scored": 20}},
     "rows": [ … ]}

**What may be in ``rows``, and nothing more.** Every row is exactly one ``signals`` row as
:func:`gt_collectors.d1.row` maps it — the same sixteen columns, the same values — with one
encoding difference: ``simhash`` travels as 16 lowercase hex characters, because JavaScript
numbers cannot hold a 64-bit integer (``db/README.md``). So the published file can never contain
more than what already goes into D1, and it cannot contain anything the Turkish-forces safety
filter or the geofence dropped: :func:`gt_collectors.d1.prepare` runs the filter again before a
row is mapped, exactly as the push path does.

Size. The pointer file and the newest batch are the only two files a consumer reads, and a batch
holds at most :data:`MAX_ROWS` rows: a run that somehow produced more publishes the candidates a
human was offered first (``queued``), then ``pending``, then ``scored``, and says how many rows it
left out. The run artifact still holds the whole batch either way. Old batch files are pruned the
way the ledger is pruned (:data:`RETENTION_DAYS`, :data:`MAX_BATCHES`), so the branch stays small
forever; :func:`prune_plan` says which files a run should delete and the workflow removes them in
the same commit that adds the new one.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Mapping, Sequence
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from gt_collectors import d1
from gt_collectors import simhash as _simhash

SCHEMA = "gt.collector.batch/1"
POINTER_SCHEMA = "gt.collector.batch-pointer/1"
#: Where the batches live on the ``collector-state`` branch, next to ``seen.jsonl``.
DEFAULT_DIR = Path("collectors/state/batches")
POINTER_FILE = "latest.json"
#: Most rows in one published batch. A normal run is far below this (40 queued candidates plus
#: what the relevance filter set aside); the cap is what keeps one runaway run from handing the
#: Worker more work than a cron tick and the daily D1 write budget can take.
MAX_ROWS = 1000
#: Batch files older than this are deleted, like ledger entries.
RETENTION_DAYS = 14
#: …and at most this many are kept even if they are all recent.
MAX_BATCHES = 14

#: ``<UTC day>-<run id>``: sorts by day, and two runs on the same day cannot collide.
BATCH_ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-[0-9a-z]{1,32}$")
FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-[0-9a-z]{1,32}\.json$")
_RUN_ID_UNSAFE = re.compile(r"[^0-9a-z]+")
#: Published first when a run is over :data:`MAX_ROWS`: a candidate a human was offered may never
#: be the row that is left out.
_STATUS_ORDER = {"queued": 0, "pending": 1, "scored": 2}


class BatchError(ValueError):
    """The batch could not be built or published."""


def run_id(value: str | None, *, now: datetime) -> str:
    """A safe run id: the workflow's ``GITHUB_RUN_ID``, or the run's UTC time locally."""
    cleaned = _RUN_ID_UNSAFE.sub("", (value or "").strip().casefold())[:32]
    return cleaned or now.strftime("%H%M%S")


def batch_id(day: date, run: str) -> str:
    value = f"{day.isoformat()}-{run}"
    if not BATCH_ID_RE.match(value):
        raise BatchError(f"batch id must be <day>-<run id>, got {value!r}")
    return value


def file_name(identifier: str) -> str:
    if not BATCH_ID_RE.match(identifier):
        raise BatchError(f"batch id must be <day>-<run id>, got {identifier!r}")
    return f"{identifier}.json"


def wire_row(row: Mapping[str, Any]) -> dict[str, Any]:
    """One ``signals`` row as it travels: the D1 columns, with ``simhash`` as 16 hex characters."""
    if set(row) != set(d1.COLUMNS):
        raise BatchError(f"a published row must have exactly the {len(d1.COLUMNS)} signals columns")
    out = dict(row)
    value = row["simhash"]
    out["simhash"] = None if value is None else _simhash.to_hex(_simhash.from_signed64(int(value)))
    return out


def select_rows(rows: Sequence[Mapping[str, Any]], *, limit: int = MAX_ROWS) -> tuple[list[dict], int]:
    """At most ``limit`` rows, queued candidates first, and how many were left out."""
    if limit < 1:
        raise BatchError("a published batch holds at least one row")
    ordered = sorted(rows, key=lambda r: _STATUS_ORDER.get(r["triage_status"], 9))
    return [wire_row(r) for r in ordered[:limit]], max(0, len(ordered) - limit)


def document(
    rows: Sequence[Mapping[str, Any]],
    *,
    identifier: str,
    created_at: datetime,
    run_url: str | None = None,
    limit: int = MAX_ROWS,
) -> dict[str, Any]:
    """The batch document. Counts only — no candidate is ever named outside ``rows``."""
    file_name(identifier)  # the id has to be one a file can be named after
    if run_url is not None and not run_url.startswith("https://"):
        raise BatchError("run_url must be an https URL")
    published, truncated = select_rows(rows, limit=limit)
    by_status: dict[str, int] = {}
    for row in published:
        by_status[row["triage_status"]] = by_status.get(row["triage_status"], 0) + 1
    return {
        "schema": SCHEMA,
        "batch_id": identifier,
        "created_at": created_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "run_url": run_url,
        "counts": {
            "rows": len(published),
            "reviews": by_status.get("queued", 0),
            "truncated": truncated,
            "by_triage_status": dict(sorted(by_status.items())),
        },
        "rows": published,
    }


def serialize(payload: Mapping[str, Any]) -> bytes:
    """The exact bytes written, so the digest in the pointer describes the file on disk."""
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    return text.encode("utf-8")


def pointer(payload: Mapping[str, Any], *, digest: str) -> dict[str, Any]:
    """The tiny file a consumer reads first: which batch is newest, and what it should hash to."""
    return {
        "schema": POINTER_SCHEMA,
        "batch_id": payload["batch_id"],
        "file": file_name(payload["batch_id"]),
        "sha256": digest,
        "rows": payload["counts"]["rows"],
        "created_at": payload["created_at"],
    }


def prune_plan(
    existing: Iterable[str],
    *,
    keep: str,
    today: date,
    retention_days: int = RETENTION_DAYS,
    max_batches: int = MAX_BATCHES,
) -> list[str]:
    """Which published batch files this run should delete.

    ``existing`` are the file names already on the branch. Anything that is not a batch file
    (the pointer, the ledger, a stray file) is left alone: this function only ever proposes
    deleting a file it can recognise as a batch it published itself.
    """
    names = sorted({n for n in existing if FILE_RE.match(n)} - {keep})
    cutoff = today - timedelta(days=retention_days)
    drop = {n for n in names if date.fromisoformat(FILE_RE.match(n).group(1)) < cutoff}
    kept = [n for n in names if n not in drop]
    # The new batch takes one of the slots, so the oldest survivors go once the file count would
    # pass the limit.
    over = len(kept) + 1 - max(1, max_batches)
    if over > 0:
        drop.update(kept[:over])
    return sorted(drop)


def publish(
    items: Iterable[d1.Item],
    *,
    directory: str | Path,
    identifier: str,
    created_at: datetime,
    run_url: str | None = None,
    existing: Iterable[str] = (),
    limit: int = MAX_ROWS,
) -> dict[str, Any]:
    """Write the batch and the pointer, and report what the caller should commit and delete.

    The safety filter runs inside :func:`gt_collectors.d1.prepare`, before any row is mapped, so a
    record it drops cannot reach the published file even if a caller hands over an unfiltered
    batch.
    """
    rows, report = d1.prepare(items)
    payload = document(rows, identifier=identifier, created_at=created_at, run_url=run_url, limit=limit)
    body = serialize(payload)
    digest = hashlib.sha256(body).hexdigest()
    head = pointer(payload, digest=digest)

    out = Path(directory)
    out.mkdir(parents=True, exist_ok=True)
    batch_path = out / head["file"]
    pointer_path = out / POINTER_FILE
    batch_path.write_bytes(body)
    pointer_path.write_bytes(serialize(head))

    return {
        "schema": SCHEMA,
        "batch_id": payload["batch_id"],
        "file": batch_path.as_posix(),
        "pointer": pointer_path.as_posix(),
        "sha256": digest,
        "rows": payload["counts"]["rows"],
        "reviews": payload["counts"]["reviews"],
        "truncated": payload["counts"]["truncated"],
        "by_triage_status": payload["counts"]["by_triage_status"],
        "candidates": report.candidates,
        "dropped_by_safety_filter": report.dropped_by_filter,
        "duplicates": report.duplicates,
        "prune": [
            (out / name).as_posix()
            for name in prune_plan(existing, keep=head["file"], today=created_at.date())
        ],
    }
