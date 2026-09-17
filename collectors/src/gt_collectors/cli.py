"""Command line: ``gt-collect`` (or ``python -m gt_collectors``).

Five modes, none of which ever writes a record that the safety filter dropped:

``--dry-run``
    Print signals as JSON lines, send nothing (no secrets needed)::

        gt-collect --config config/feeds.yaml --feed rss-aze-mod --dry-run
        gt-collect --config config/feeds.yaml --feed rss-aze-mod --input saved.xml --dry-run

``--queue-dir``
    Build the **human review queue**: collect the feeds marked ``queue: true``, drop everything
    already in the dedup ledger (:mod:`gt_collectors.state`), score what is left with the
    relevance filter (:mod:`gt_collectors.relevance`) and write the batch, the issue body and a
    summary into a directory. No secrets, nothing is published. This is what the scheduled
    workflow runs (``.github/workflows/collect.yml``)::

        gt-collect --queue-dir queue --state collectors/state/seen.jsonl --archive

    ``candidates.jsonl`` holds the **whole** batch, each line with a ``status``: ``queued``
    (in the issue and in the ledger), ``deferred`` (did not fit under ``--max-items``) or
    ``off-topic`` (below the relevance threshold). Only ``queued`` items are written to the
    ledger, so the other two are offered again by a later run.

``--write-d1``
    Write a batch that ``--queue-dir`` already produced into Cloudflare D1
    (:mod:`gt_collectors.d1`). It reads ``DIR/candidates.jsonl`` and collects nothing itself, so
    the workflow can run it **after** the review queue issue exists::

        gt-collect --write-d1 queue                  # CLOUDFLARE_API_TOKEN or `wrangler login`
        gt-collect --write-d1 queue --d1-dry-run     # print the SQL, touch nothing
        gt-collect --write-d1 queue --no-reviews     # the signal store only

    Two writes, in this order: every collected item goes into ``gt-signals`` with its triage
    status (the store is the history, the issue is only the human's view), and then the items
    this run actually offered to a human — and only those — become ``gt-ops.reviews`` rows for
    the Telegram review bot. Items the safety filter or the geofence dropped are not in the
    batch, and the writer filters again before mapping a row.

``--publish-batch``
    Publish the same rows as a file the ``apps/ingest`` Worker pulls, instead of pushing them
    into D1 from here (:mod:`gt_collectors.batch`). No credential of any kind::

        gt-collect --publish-batch queue --batch-dir collectors/state/batches \\
            --run-id "$GITHUB_RUN_ID" --existing existing.txt

    Writes ``<batch-dir>/<day>-<run id>.json`` and ``<batch-dir>/latest.json``, and a summary in
    ``DIR/publish.json`` naming the two files to commit and the old batches to delete. This is
    what the scheduled workflow does, and it is why the workflow needs no Cloudflare secret.

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
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path

from gt_collectors import batch as batch_publish
from gt_collectors import d1, fetch, relevance, review, rss, safety, state
from gt_collectors.config import ConfigError, FeedConfig, load_feeds
from gt_collectors.ingest import IngestClient
from gt_collectors.signal import Geo, Signal

DEFAULT_CONFIG = Path(__file__).resolve().parents[2] / "config" / "feeds.yaml"
CANDIDATES_FILE = "candidates.jsonl"
ISSUE_BODY_FILE = "issue.md"
ISSUE_TITLE_FILE = "issue-title.txt"
SUMMARY_FILE = "summary.json"
PUBLISH_FILE = "publish.json"


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
    queue.add_argument(
        "--relevance",
        type=Path,
        metavar="PATH",
        help="relevance tables to use instead of the packaged data/relevance.yaml",
    )
    queue.add_argument(
        "--min-relevance",
        type=float,
        metavar="SCORE",
        help="override the table's relevance threshold (0 queues everything the tables scored)",
    )
    store = p.add_argument_group("signal store (Cloudflare D1)")
    store.add_argument(
        "--write-d1",
        type=Path,
        metavar="DIR",
        help=f"write the batch in DIR/{CANDIDATES_FILE} into the D1 signals database "
        f"(collects nothing; authenticates with {d1.TOKEN_ENV} or a local wrangler login)",
    )
    store.add_argument(
        "--d1-database", default=d1.DATABASE, metavar="NAME", help="D1 database (default: %(default)s)"
    )
    store.add_argument(
        "--d1-batch",
        type=int,
        default=d1.MAX_BATCH,
        metavar="N",
        help="rows per INSERT (default: %(default)s)",
    )
    store.add_argument(
        "--d1-dry-run", action="store_true", help="print the SQL instead of executing it (no token needed)"
    )
    store.add_argument(
        "--ops-database",
        default=d1.OPS_DATABASE,
        metavar="NAME",
        help="D1 database holding the review queue (default: %(default)s)",
    )
    store.add_argument(
        "--no-reviews",
        action="store_true",
        help="write the signals only; do not promote queued candidates into ops.reviews",
    )
    published = p.add_argument_group("published batch (pulled by the apps/ingest Worker)")
    published.add_argument(
        "--publish-batch",
        type=Path,
        metavar="DIR",
        help=f"publish the batch in DIR/{CANDIDATES_FILE} as a file a Worker can pull "
        "(no credential of any kind)",
    )
    published.add_argument(
        "--batch-dir",
        type=Path,
        default=batch_publish.DEFAULT_DIR,
        metavar="DIR",
        help="where the batch and its pointer are written (default: %(default)s)",
    )
    published.add_argument(
        "--run-id",
        metavar="ID",
        help="run identifier in the batch id (default: the run's UTC time)",
    )
    published.add_argument(
        "--existing",
        type=Path,
        metavar="FILE",
        help="file listing the batch file names already published, one per line, "
        "used to work out which old batches this run should delete",
    )
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


def _relevance_table(args: argparse.Namespace) -> relevance.Table:
    table = relevance.Table.load(args.relevance) if args.relevance else relevance.default_table()
    return table.with_threshold(args.min_relevance) if args.min_relevance is not None else table


def _with_region(signal: Signal, guess: str | None) -> Signal:
    """Replace the feed's region guess with the one the item's own text supports.

    Only ``geo`` changes, so ``content_hash``, ``simhash`` and the dedup id stay the same.
    """
    if guess is None or guess == signal.geo.region:
        return signal
    geo = signal.geo
    return replace(signal, geo=Geo(guess, geo.place, geo.lat, geo.lon, geo.precision or "region"))


@dataclass(slots=True)
class _Batch:
    """Everything one queue run collected, split by what happens to it next."""

    relevant: list[review.Candidate] = field(default_factory=list)
    off_topic: list[review.Candidate] = field(default_factory=list)
    totals: Counter[str] = field(default_factory=Counter)


def _collect_feeds(
    feeds: list[FeedConfig],
    args: argparse.Namespace,
    *,
    table: relevance.Table,
    seen: Callable[[Signal], bool],
) -> _Batch:
    """Fetch every feed, filter it and turn what is left into candidates. Never raises."""
    batch = _Batch()
    for feed in feeds:
        summary: dict[str, object] = {"feed": feed.id}
        try:
            result = _collect(feed, args)
            summary = result.summary()
            batch.totals["items"] += result.items
            batch.totals["duplicates"] += result.duplicates
            batch.totals["dropped"] += result.dropped
            # The safety filter ran inside rss.collect, in memory, right after parsing. Run it once
            # more here: nothing reaches a file or an issue without passing it (red line, ADR 0013).
            guarded = safety.filter_signals(result.signals)
            batch.totals["dropped"] += guarded.dropped
            new = off_topic = 0
            for signal in guarded.kept:
                if seen(signal):
                    batch.totals["known"] += 1
                    continue
                new += 1
                # Relevance is noise triage only, and runs last: the safety filter and the
                # geofence have already had their say, unchanged, on every signal here.
                score = table.assess(signal)
                candidate = review.Candidate(
                    feed_id=feed.id,
                    queue_id=state.queue_id(signal),
                    signal=_with_region(signal, score.region),
                    redline_check=review.redline_check(signal),
                    relevance=score,
                    status="queued" if score.relevant else "off-topic",
                )
                if score.relevant:
                    batch.relevant.append(candidate)
                else:
                    off_topic += 1
                    batch.off_topic.append(candidate)
            batch.totals["off_topic"] += off_topic
            summary["new"] = new
            summary["off_topic"] = off_topic
        except (fetch.FetchError, rss.FeedError, ValueError, OSError) as exc:
            batch.totals["errors"] += 1
            summary["error"] = f"{type(exc).__name__}: {exc}"
        print(json.dumps(summary, ensure_ascii=False), file=sys.stderr)
    return batch


def _run_queue(feeds: list[FeedConfig], args: argparse.Namespace, now: datetime) -> int:
    """Collect into the review queue: ledger-deduplicated candidates, an issue body, a summary."""
    day = state.today_utc(now)
    table = _relevance_table(args)
    ledger = state.Ledger.load(args.state) if args.state else state.Ledger()
    ledger_before = len(ledger)
    pending = state.Ledger()  # items already picked in this run, so feeds cannot repeat each other

    def seen(signal: Signal) -> bool:
        if ledger.contains(signal) or pending.contains(signal):
            return True
        pending.add(signal, day=day)
        return False

    batch = _collect_feeds(feeds, args, table=table, seen=seen)
    totals, off_topic = batch.totals, batch.off_topic
    selected, deferred_items = review.select(batch.relevant, args.max_items)
    deferred = len(deferred_items)
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
        "off_topic": totals["off_topic"],
        "errors": totals["errors"],
    }
    out = args.queue_dir
    out.mkdir(parents=True, exist_ok=True)
    # The artifact is the whole batch: what was queued, what waits for the next run and what the
    # relevance filter set aside. Nothing collected is thrown away; only `queued` reaches a human.
    artifact = [
        *selected,
        *(replace(c, status="deferred") for c in deferred_items),
        *off_topic,
    ]
    (out / CANDIDATES_FILE).write_text(
        "".join(f"{c.to_json()}\n" for c in artifact), encoding="utf-8", newline="\n"
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
        "borderline": sum(1 for c in selected if c.relevance is not None and c.relevance.borderline),
        "relevance_threshold": table.threshold,
        "ledger_before": ledger_before,
        "ledger_after": len(ledger),
        "ledger_pruned": pruned,
    }
    (out / SUMMARY_FILE).write_text(
        json.dumps(run_summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps(run_summary, ensure_ascii=False), file=sys.stderr)
    return 1 if feeds and totals["errors"] == len(feeds) else 0


def _run_write_d1(args: argparse.Namespace) -> int:
    """Write an existing queue batch into D1: the signals first, then the review queue."""
    path = args.write_d1 / CANDIDATES_FILE if args.write_d1.is_dir() else args.write_d1
    items = d1.read_batch(path)
    rows, report = d1.prepare(items)
    reviews = None
    if args.d1_dry_run:
        for batch in d1.iter_batches(rows, args.d1_batch):
            print(d1.insert_sql(batch))
            report.batches += 1
        if not args.no_reviews:
            promoted = d1.review_rows(rows)
            reviews = d1.ReviewReport(queued=len(promoted), rows=len(promoted))
            for batch in d1.iter_batches(promoted, args.d1_batch):
                print(d1.insert_reviews_sql(batch))
                reviews.batches += 1
    else:
        if not d1.has_token():
            # Not an error: a developer machine authenticates with `wrangler login` instead.
            # In the workflow the step is skipped before this point when the secret is absent.
            print(f"note: {d1.TOKEN_ENV} is not set; wrangler will use a local login", file=sys.stderr)
        report = d1.write(items, d1.wrangler_executor(args.d1_database), batch_size=args.d1_batch)
        # Only after the signals are stored: a review without its signal shows the reviewer a
        # candidate with no source link.
        if not args.no_reviews:
            reviews = d1.write_reviews(
                rows, d1.wrangler_executor(args.ops_database), batch_size=args.d1_batch
            )
    summary: dict[str, object] = {"d1": args.d1_database, "dry_run": args.d1_dry_run, **report.to_dict()}
    summary["reviews"] = {"d1": args.ops_database, **reviews.to_dict()} if reviews is not None else "skipped"
    print(json.dumps(summary, ensure_ascii=False), file=sys.stderr)
    return 0


def _existing_names(path: Path | None) -> list[str]:
    """The batch file names already on the state branch (``git ls-tree --name-only``)."""
    if path is None or not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    return [line.strip().rsplit("/", 1)[-1] for line in lines if line.strip()]


def _run_publish_batch(args: argparse.Namespace, now: datetime) -> int:
    """Publish an existing queue batch as the file the ingest Worker pulls."""
    queue_dir = args.publish_batch if args.publish_batch.is_dir() else args.publish_batch.parent
    path = args.publish_batch / CANDIDATES_FILE if args.publish_batch.is_dir() else args.publish_batch
    items = d1.read_batch(path)
    identifier = batch_publish.batch_id(state.today_utc(now), batch_publish.run_id(args.run_id, now=now))
    summary = batch_publish.publish(
        items,
        directory=args.batch_dir,
        identifier=identifier,
        created_at=now,
        run_url=args.run_url,
        existing=_existing_names(args.existing),
    )
    (queue_dir / PUBLISH_FILE).write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps(summary, ensure_ascii=False), file=sys.stderr)
    return 0


def _run_batch_mode(args: argparse.Namespace) -> int | None:
    """``--write-d1`` and ``--publish-batch``: the two ways an existing batch leaves this run.

    Both take a batch ``--queue-dir`` already produced and collect nothing themselves, so neither
    can be combined with a collecting option. Returns the exit code, or ``None`` when the run is
    in neither mode.
    """
    if args.write_d1 and args.publish_batch:
        raise ConfigError("--write-d1 pushes a batch, --publish-batch publishes one; pick one")
    flag = "--write-d1" if args.write_d1 else "--publish-batch"
    if not (args.write_d1 or args.publish_batch):
        return None
    if args.queue_dir or args.dry_run or args.input or args.feed:
        raise ConfigError(f"{flag} is its own mode: it takes a batch that --queue-dir already produced")
    try:
        if args.write_d1:
            return _run_write_d1(args)
        return _run_publish_batch(args, datetime.now(UTC))
    except (ValueError, OSError, d1.D1Error) as exc:  # BatchError is a ValueError
        print(f"{flag.lstrip('-')} error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


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
        if args.min_relevance is not None and not 0 <= args.min_relevance <= 1:
            raise ConfigError("--min-relevance must be between 0 and 1")
        if not 1 <= args.d1_batch <= d1.BATCH_LIMIT:
            raise ConfigError(f"--d1-batch must be between 1 and {d1.BATCH_LIMIT}")
        code = _run_batch_mode(args)
        if code is not None:
            return code
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
        except (state.LedgerError, relevance.RelevanceError, OSError) as exc:
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
