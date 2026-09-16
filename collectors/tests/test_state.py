from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from gt_collectors import simhash
from gt_collectors.normalize import normalize_url, sha256_prefixed
from gt_collectors.signal import Signal
from gt_collectors.state import (
    ENTRY_KEYS,
    Entry,
    Ledger,
    LedgerError,
    queue_id,
    today_utc,
)
from tests.conftest import NOW, make_signal


def signal(n: int, *, title: str = "Joint naval exercise announced", text: str = "Text") -> Signal:
    """A signal with a caller-chosen title and text (conftest.make_signal numbers the title)."""
    return Signal(
        source_id=None,
        url=normalize_url(f"https://news.example.org/story/{n}"),
        fetched_at=NOW,
        published_at=NOW,
        lang="en",
        title=title,
        text=text,
        raw_hash=sha256_prefixed(str(n).encode()),
    )


DAY = date(2026, 9, 16)


def test_queue_id_is_twelve_hex_characters_of_the_content_hash() -> None:
    signal = make_signal(1)
    assert queue_id(signal) == signal.content_hash().removeprefix("sha256:")[:12]
    assert len(queue_id(signal)) == 12
    # Same URL and text -> same id, even from a different fetch.
    assert queue_id(make_signal(1)) == queue_id(signal)
    assert queue_id(make_signal(2)) != queue_id(signal)


def test_entry_round_trip() -> None:
    entry = Entry.from_signal(make_signal(1), day=DAY)
    assert set(json.loads(entry.to_json())) == set(ENTRY_KEYS)
    assert Entry.from_json(entry.to_json()) == entry
    assert entry.seen_date == DAY


@pytest.mark.parametrize(
    "line",
    [
        "{not json",
        json.dumps({"id": "abc", "simhash": "0" * 16, "seen": "2026-09-16"}),
        json.dumps({"id": "a" * 12, "simhash": "zz", "seen": "2026-09-16"}),
        json.dumps({"id": "a" * 12, "simhash": "0" * 16, "seen": "yesterday"}),
        json.dumps({"id": "a" * 12, "simhash": "0" * 16}),
        json.dumps({"id": "a" * 12, "simhash": "0" * 16, "seen": "2026-09-16", "url": "x"}),
    ],
)
def test_malformed_entries_are_rejected(line: str) -> None:
    with pytest.raises(LedgerError):
        Entry.from_json(line)


def test_ledger_stores_no_urls_or_text(tmp_path: Path) -> None:
    ledger = Ledger()
    ledger.add(make_signal(1), day=DAY)
    path = ledger.save(tmp_path / "state" / "seen.jsonl")
    written = path.read_text(encoding="utf-8")
    assert "news.example.org" not in written and "Synthetic" not in written
    assert json.loads(written.strip()).keys() == {"id", "simhash", "seen"}


def test_missing_file_is_an_empty_ledger(tmp_path: Path) -> None:
    ledger = Ledger.load(tmp_path / "never-written.jsonl")
    assert len(ledger) == 0 and not ledger.contains(make_signal(1))


def test_save_load_round_trip(tmp_path: Path) -> None:
    ledger = Ledger()
    for n in range(3):
        ledger.add(make_signal(n), day=DAY)
    path = ledger.save(tmp_path / "seen.jsonl")
    assert path.read_bytes().count(b"\n") == 3
    again = Ledger.load(path)
    assert again.entries == ledger.entries
    assert all(again.contains(make_signal(n)) for n in range(3))


def test_load_reports_the_broken_line(tmp_path: Path) -> None:
    path = tmp_path / "seen.jsonl"
    good = Entry.from_signal(make_signal(1), day=DAY).to_json()
    path.write_text(f"{good}\n\n[]\n", encoding="utf-8")
    with pytest.raises(LedgerError, match=r"seen\.jsonl:3"):
        Ledger.load(path)


def test_exact_and_near_duplicates_are_recognised() -> None:
    base = (
        "The ministry said a joint naval exercise with three frigates began in the eastern "
        "Mediterranean on Tuesday morning and would run for four days. The statement gave the "
        "names of the participating ships and said the exercise was planned last year."
    )
    reformatted = base.replace("four days.", "four days ,")  # whitespace/punctuation only
    rewritten = "Navy holds drills off the coast, ministry says in a short statement."
    ledger = Ledger()
    ledger.add(signal(1, text=base), day=DAY)

    assert ledger.contains(signal(1, text=base))  # the same item, fetched again
    # A re-formatted copy under a different URL is the same story: same SimHash, no second review.
    assert simhash.hamming(simhash.simhash(reformatted), simhash.simhash(base)) <= 3
    assert ledger.contains(signal(2, text=reformatted))
    # A genuinely different summary is far away and stays in the queue: hiding an item from a
    # human is worse than showing a duplicate, so the threshold is strict.
    assert simhash.hamming(simhash.simhash(rewritten), simhash.simhash(base)) > 3
    assert not ledger.contains(signal(3, text=rewritten))


def test_empty_text_never_counts_as_a_near_duplicate() -> None:
    ledger = Ledger()
    ledger.add(signal(1, title="…", text="..."), day=DAY)  # no word characters -> SimHash 0
    assert ledger.entries[0].simhash == "0" * 16
    assert not ledger.contains(signal(2, title="—", text="???"))
    assert ledger.contains(signal(1, title="…", text="..."))  # the exact id still matches


def test_prune_by_age_then_size() -> None:
    ledger = Ledger()
    for n in range(10):
        ledger.add(make_signal(n), day=date(2026, 1, 1))
    for n in range(10, 15):
        ledger.add(make_signal(n), day=DAY)

    assert ledger.prune(today=DAY, retention_days=90) == 10
    assert len(ledger) == 5
    assert not ledger.contains(make_signal(0))  # forgotten, so it may be queued again
    assert ledger.contains(make_signal(14))

    assert ledger.prune(today=DAY, retention_days=90, max_entries=2) == 3
    assert [e.id for e in ledger] == [queue_id(make_signal(13)), queue_id(make_signal(14))]


def test_today_utc_uses_utc() -> None:
    assert today_utc(NOW) == NOW.date()
