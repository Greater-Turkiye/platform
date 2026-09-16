"""Command line: ``gt-collect`` (or ``python -m gt_collectors``).

Three modes, none of which ever writes a record that the safety filter dropped:

``--dry-run``
    Print signals as JSON lines, send nothing (no secrets needed)::

        gt-collect --config config/feeds.yaml --feed rss-aze-mod --dry-run
        gt-collect --config config/feeds.yaml --feed rss-aze-mod --input saved.xml --dry-run

``--queue-dir``
    Build the **human review queue**: collect the feeds marked ``queue: true``, drop everything
    already in the dedup ledger (:mod:`gt_collectors.state`) and write the batch, the issue body
    and a summary into a directory. No secrets, nothing is published. This is what the scheduled
    workflow runs (``.github/workflows/collect.yml``)::

        gt-collect --queue-dir queue --state collectors/state/seen.jsonl --archive

``(neither)``
    A real ingest run: needs ``INGEST_URL`` and ``INGEST_HMAC_KEY``, and sends only enabled
    feeds that have a ``source_id``::

        gt-collect --config config/feeds.yaml

Signals go to stdout; one JSON summary line per feed goes to stderr, plus a final run summary
in queue mode. Summaries contain only counts — dropped records are never printed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

from gt_collectors import fetch, review, rss, safety, state
from gt_collectors.config import ConfigError, FeedConfig, load_feeds
from gt_collectors.ingest import IngestClient

DEFAULT_CONFIG = Path(__file__).resolve().parents[2] / "config" / "feeds.yaml"
CANDIDATES_FILE = "candidates.jsonl"
ISSUE_BODY_FILE = "issue.md"
ISSUE_TITLE_FILE = "issue-title.txt"
SUMMARY_FILE = "summary.json"


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="gt-collect", description="Run Greater Türkiye RSS/Atom collectors.")
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="feeds YAML (default: %(default)s)")
    p.add_argument(
        "--feed", action="append", default=[], metavar="ID", help="run only this feed (repeatable)"
    )
    p.add_argument("--include-disabled", action="store_true", help="with --dry-run: also run disabled feeds")
    p.add_argument("--dry-run", action="store_true", help="print signals as JSON lines; send nothing")
    p.add_argument("--input", type=Path, help="parse this local file instead of fetching (needs one --feed)")
    queue = p.add_argument_group("review queue")
    queue.add_argument(
        "--queue-dir",
        type=Path,
        metavar="DIR",
        help=f"review-queue mode: write {CANDIDATES_FILE}, {ISSUE_BODY_FILE}, "
        f"{ISSUE_TITLE_FILE} and {SUMMARY_FILE} into DIR (sends nothing)",
    )
    queue.add_argument(
        "--state",
        type=Path,
        metavar="PATH",
        help="dedup ledger to read and update (default: no ledger, every item counts as new)",
    )
    queue.add_argument(
        "--max-items",
        type=int,
        default=review.MAX_ITEMS,
        metavar="N",
        help="at most N candidates per run; the rest wait for the next run (default: %(default)s)",
    )
    queue.add_argument(
        "--archive", action="store_true", help="look up a Wayback Machine snapshot for each candidate"
    )
    queue.add_argument("--run-url", metavar="URL", help="link to the workflow run, shown in the issue")
    return p


def _select(feeds: list[FeedConfig], args: argparse.Namespace) -> list[FeedConfig]:
    by_id = {f.id: f for f in feeds}
    unknown = [fid for fid in args.feed if fid not in by_id]
    if unknown:
        raise ConfigError(f"unknown feed id(s): {', '.join(unknown)}")
    selected = [by_id[fid] for fid in args.feed] if args.feed else list(feeds)
    if args.queue_dir:
        # The review queue has its own gate: a maintainer has read the source's terms.
        return selected if args.feed else [f for f in selected if f.queue]
    if args.dry_run:
        if args.feed or args.include_disabled:
            return selected
        return [f for f in selected if f.enabled]
    disabled = [f.id for f in selected if not f.enabled]
    if args.feed and disabled:
        raise ConfigError(
            f"feed(s) disabled until terms are confirmed (use --dry-run): {', '.join(disabled)}"
        )
    return [f for f in selected if f.enabled]


def _collect(feed: FeedConfig, args: argparse.Namespace) -> rss.CollectResult:
    body = args.input.read_bytes() if args.input else None
    return rss.collect(feed, body=body)


def _run_queue(feeds: list[FeedConfig], args: argparse.Namespace, now: datetime) -> int:
    """Collect into the review queue: ledger-deduplicated candidates, an issue body, a summary."""
    day = state.today_utc(now)
    ledger = state.Ledger.load(args.state) if args.state else state.Ledger()
    ledger_before = len(ledger)
    pending = state.Ledger()  # items already picked in this run, so feeds cannot repeat each other
    totals: Counter[str] = Counter()
    fresh: list[review.Candidate] = []

    for feed in feeds:
        summary: dict[str, object] = {"feed": feed.id}
        try:
            result = _collect(feed, args)
            summary = result.summary()
            totals["items"] += result.items
            totals["duplicates"] += result.duplicates
            totals["dropped"] += result.dropped
            # The safety filter ran inside rss.collect, in memory, right after parsing. Run it once
            # more here: nothing reaches a file or an issue without passing it (red line, ADR 0013).
            guarded = safety.filter_signals(result.signals)
            totals["dropped"] += guarded.dropped
            new = 0
            for signal in guarded.kept:
                if ledger.contains(signal) or pending.contains(signal):
                    totals["known"] += 1
                    continue
                pending.add(signal, day=day)
                new += 1
                fresh.append(
                    review.Candidate(
                        feed_id=feed.id,
                        queue_id=state.queue_id(signal),
                        signal=signal,
                        redline_check=review.redline_check(signal),
                    )
                )
            summary["new"] = new
        except (fetch.FetchError, rss.FeedError, ValueError, OSError) as exc:
            totals["errors"] += 1
            summary["error"] = f"{type(exc).__name__}: {exc}"
        print(json.dumps(summary, ensure_ascii=False), file=sys.stderr)

    selected, deferred = review.select(fresh, args.max_items)
    if args.archive:
        selected = [
            replace(candidate, archive_url=review.archive_lookup(candidate.signal.url))
            for candidate in selected
        ]

    stats = {
        "feeds": len(feeds),
        "items": totals["items"],
        "dropped": totals["dropped"],
        "duplicates": totals["duplicates"],
        "known": totals["known"],
        "errors": totals["errors"],
    }
    out = args.queue_dir
    out.mkdir(parents=True, exist_ok=True)
    (out / CANDIDATES_FILE).write_text(
        "".join(f"{c.to_json()}\n" for c in selected), encoding="utf-8", newline="\n"
    )
    (out / ISSUE_TITLE_FILE).write_text(review.issue_title(day) + "\n", encoding="utf-8", newline="\n")
    (out / ISSUE_BODY_FILE).write_text(
        review.render_issue(selected, day=day, stats=stats, run_url=args.run_url, deferred=deferred),
        encoding="utf-8",
        newline="\n",
    )

    for candidate in selected:
        ledger.add(candidate.signal, day=day)
    pruned = ledger.prune(today=day)
    if args.state:
        ledger.save(args.state)

    run_summary = {
        "day": day.isoformat(),
        **stats,
        "queued": len(selected),
        "deferred": deferred,
        "redline_check": sum(1 for c in selected if c.redline_check),
        "ledger_before": ledger_before,
        "ledger_after": len(ledger),
        "ledger_pruned": pruned,
    }
    (out / SUMMARY_FILE).write_text(
        json.dumps(run_summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps(run_summary, ensure_ascii=False), file=sys.stderr)
    return 1 if feeds and totals["errors"] == len(feeds) else 0


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = _parser().parse_args(argv)
    try:
        if args.queue_dir and args.dry_run:
            raise ConfigError("--queue-dir and --dry-run are different modes; pick one")
        if args.max_items < 0:
            raise ConfigError("--max-items must be zero or more")
        feeds = _select(load_feeds(args.config), args)
        if args.input and len(feeds) != 1:
            raise ConfigError("--input needs exactly one --feed")
        if not (args.dry_run or args.queue_dir) and args.input:
            raise ConfigError("--input is only allowed with --dry-run or --queue-dir")
    except (ConfigError, OSError) as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2

    if args.queue_dir:
        try:
            return _run_queue(feeds, args, datetime.now(UTC))
        except (state.LedgerError, OSError) as exc:
            print(f"queue error: {type(exc).__name__}: {exc}", file=sys.stderr)
            return 2

    endpoint = key = None
    if not args.dry_run:
        endpoint, key = os.environ.get("INGEST_URL"), os.environ.get("INGEST_HMAC_KEY")
        if not endpoint or not key:
            print("INGEST_URL and INGEST_HMAC_KEY are required unless --dry-run", file=sys.stderr)
            return 2

    failures = 0
    for feed in feeds:
        summary: dict[str, object] = {"feed": feed.id}
        try:
            result = _collect(feed, args)
            summary = result.summary()
            if args.dry_run:
                for signal in result.signals:
                    print(signal.to_json())
            elif result.signals:
                client = IngestClient(endpoint, key.encode("utf-8"), feed.id)
                report = client.send(result.signals)
                summary.update(sent=report.sent, batches=report.batches)
        except (fetch.FetchError, rss.FeedError, ValueError, OSError) as exc:
            failures += 1
            summary["error"] = f"{type(exc).__name__}: {exc}"
        print(json.dumps(summary, ensure_ascii=False), file=sys.stderr)
    return 1 if feeds and failures == len(feeds) else 0


if __name__ == "__main__":
    raise SystemExit(main())
