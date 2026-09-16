"""Deduplication ledger: what the review queue has already put in front of a human.

The scheduled run (``.github/workflows/collect.yml``) has no database — there is no paid
infrastructure (ADR 0008) — so the only thing it remembers between runs is this file: a small
JSON Lines ledger that the workflow keeps on the ``collector-state`` branch and commits back
after every run (``main`` is protected, so the bot never pushes there).

One line per item that was queued, newest last::

    {"id":"1f0c4b9ad2e7","simhash":"a4f0…","seen":"2026-09-16"}

* ``id`` — the first 12 hex characters of the signal's ``content_hash``; it is also the
  dedup id shown in the issue, so a reviewer can find an item again.
* ``simhash`` — the 64-bit SimHash of title + excerpt, hex (:mod:`gt_collectors.simhash`).
  An item is a **near**-duplicate of a ledger entry when the Hamming distance is at most
  :data:`NEAR_DUPLICATE_BITS`. Three bits is deliberately strict, because a false match means a
  human never sees that item: over a 500-character excerpt it collapses re-formatted copies of
  the same item (whitespace and punctuation changes score 0, a single changed word in a long
  excerpt 2) but leaves a genuinely rewritten summary (typically 9–11 bits apart) in the queue.
* ``seen`` — the UTC day it was queued, used only for pruning.

Nothing else is stored: no titles, no URLs, no text. The ledger is append-only in normal use;
:meth:`Ledger.prune` drops entries older than :data:`RETENTION_DAYS` and, if the file is still
long, the oldest entries beyond :data:`MAX_ENTRIES`, so the file stays small forever.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

from gt_collectors import simhash as _simhash

if TYPE_CHECKING:  # pragma: no cover - import cycle only for type checkers
    from gt_collectors.signal import Signal

ID_CHARS = 12
NEAR_DUPLICATE_BITS = 3
MAX_ENTRIES = 5000
RETENTION_DAYS = 90
ENTRY_KEYS = ("id", "simhash", "seen")

_ID_RE = re.compile(rf"^[0-9a-f]{{{ID_CHARS}}}$")
_SIMHASH_RE = re.compile(r"^[0-9a-f]{16}$")
_ZERO_SIMHASH = "0" * 16


class LedgerError(ValueError):
    pass


def queue_id(signal: Signal) -> str:
    """Short, stable id of a signal: the first 12 hex characters of its ``content_hash``."""
    return signal.content_hash().removeprefix("sha256:")[:ID_CHARS]


@dataclass(frozen=True, slots=True)
class Entry:
    id: str
    simhash: str
    seen: str

    def __post_init__(self) -> None:
        if not isinstance(self.id, str) or not _ID_RE.match(self.id):
            raise LedgerError(f"ledger id must be {ID_CHARS} lowercase hex characters, got {self.id!r}")
        if not isinstance(self.simhash, str) or not _SIMHASH_RE.match(self.simhash):
            raise LedgerError(f"ledger simhash must be 16 lowercase hex characters, got {self.simhash!r}")
        try:
            date.fromisoformat(self.seen)
        except (TypeError, ValueError):
            raise LedgerError(f"ledger seen must be an ISO date, got {self.seen!r}") from None

    @property
    def seen_date(self) -> date:
        return date.fromisoformat(self.seen)

    @classmethod
    def from_signal(cls, signal: Signal, *, day: date) -> Entry:
        return cls(
            id=queue_id(signal),
            simhash=_simhash.to_hex(signal.simhash()),
            seen=day.isoformat(),
        )

    def to_dict(self) -> dict[str, str]:
        return {"id": self.id, "simhash": self.simhash, "seen": self.seen}

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), separators=(",", ":"))

    @classmethod
    def from_json(cls, line: str) -> Entry:
        try:
            data = json.loads(line)
        except json.JSONDecodeError as exc:
            raise LedgerError(f"ledger line is not JSON: {exc}") from None
        if not isinstance(data, dict) or set(data) != set(ENTRY_KEYS):
            raise LedgerError(f"ledger line keys must be exactly {ENTRY_KEYS}")
        return cls(id=data["id"], simhash=data["simhash"], seen=data["seen"])


class Ledger:
    """The set of already-queued items, with exact and near-duplicate lookup."""

    def __init__(self, entries: Iterable[Entry] = ()) -> None:
        self._entries: list[Entry] = list(entries)
        self._reindex()

    def _reindex(self) -> None:
        self._ids = {e.id for e in self._entries}
        # Zero is the SimHash of text without word characters; it would match every other
        # empty text, so it never takes part in near-duplicate comparison.
        self._hashes = [int(e.simhash, 16) for e in self._entries if e.simhash != _ZERO_SIMHASH]

    def __len__(self) -> int:
        return len(self._entries)

    def __iter__(self) -> Iterator[Entry]:
        return iter(self._entries)

    @property
    def entries(self) -> tuple[Entry, ...]:
        return tuple(self._entries)

    def contains(self, signal: Signal, *, distance: int = NEAR_DUPLICATE_BITS) -> bool:
        """True if this signal, or a near-duplicate of it, has already been queued."""
        if queue_id(signal) in self._ids:
            return True
        value = signal.simhash()
        if value == 0 or distance < 0:
            return False
        return any(_simhash.hamming(value, other) <= distance for other in self._hashes)

    def add(self, signal: Signal, *, day: date) -> Entry:
        entry = Entry.from_signal(signal, day=day)
        self._entries.append(entry)
        self._ids.add(entry.id)
        if entry.simhash != _ZERO_SIMHASH:
            self._hashes.append(int(entry.simhash, 16))
        return entry

    def prune(
        self,
        *,
        today: date,
        retention_days: int = RETENTION_DAYS,
        max_entries: int = MAX_ENTRIES,
    ) -> int:
        """Drop entries older than ``retention_days``, then the oldest above ``max_entries``.

        Returns the number of entries removed.
        """
        before = len(self._entries)
        cutoff = today - timedelta(days=retention_days)
        kept = [e for e in self._entries if e.seen_date >= cutoff]
        if len(kept) > max_entries:
            kept = kept[len(kept) - max_entries :]
        self._entries = kept
        self._reindex()
        return before - len(self._entries)

    @classmethod
    def load(cls, path: str | Path) -> Ledger:
        """Read a ledger file; a missing file is an empty ledger (the first run)."""
        file = Path(path)
        if not file.exists():
            return cls()
        entries = []
        with file.open(encoding="utf-8") as fh:
            for number, line in enumerate(fh, start=1):
                if not line.strip():
                    continue
                try:
                    entries.append(Entry.from_json(line))
                except LedgerError as exc:
                    raise LedgerError(f"{file}:{number}: {exc}") from None
        return cls(entries)

    def save(self, path: str | Path) -> Path:
        """Write the ledger (replacing the file atomically). Returns the path."""
        file = Path(path)
        file.parent.mkdir(parents=True, exist_ok=True)
        tmp = file.with_name(file.name + ".tmp")
        payload = "".join(f"{e.to_json()}\n" for e in self._entries)
        tmp.write_text(payload, encoding="utf-8", newline="\n")
        tmp.replace(file)
        return file


def today_utc(now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(UTC).date()
