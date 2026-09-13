"""Command line: ``gt-collect`` (or ``python -m gt_collectors``).

Examples::

    # print signals as JSON lines, send nothing (no secrets needed)
    gt-collect --config config/feeds.yaml --feed rss-aze-mod --dry-run

    # offline: parse a saved feed file instead of fetching
    gt-collect --config config/feeds.yaml --feed rss-aze-mod --input saved.xml --dry-run

    # real run (CI): needs INGEST_URL and INGEST_HMAC_KEY; only enabled feeds with a source_id
    gt-collect --config config/feeds.yaml

Signals go to stdout; one JSON summary line per feed goes to stderr. Summaries contain only
counts — dropped records are never printed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from gt_collectors import fetch, rss
from gt_collectors.config import ConfigError, FeedConfig, load_feeds
from gt_collectors.ingest import IngestClient

DEFAULT_CONFIG = Path(__file__).resolve().parents[2] / "config" / "feeds.yaml"


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="gt-collect", description="Run Greater Türkiye RSS/Atom collectors.")
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="feeds YAML (default: %(default)s)")
    p.add_argument(
        "--feed", action="append", default=[], metavar="ID", help="run only this feed (repeatable)"
    )
    p.add_argument("--include-disabled", action="store_true", help="with --dry-run: also run disabled feeds")
    p.add_argument("--dry-run", action="store_true", help="print signals as JSON lines; send nothing")
    p.add_argument("--input", type=Path, help="parse this local file instead of fetching (needs one --feed)")
    return p


def _select(feeds: list[FeedConfig], args: argparse.Namespace) -> list[FeedConfig]:
    by_id = {f.id: f for f in feeds}
    unknown = [fid for fid in args.feed if fid not in by_id]
    if unknown:
        raise ConfigError(f"unknown feed id(s): {', '.join(unknown)}")
    selected = [by_id[fid] for fid in args.feed] if args.feed else list(feeds)
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


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = _parser().parse_args(argv)
    try:
        feeds = _select(load_feeds(args.config), args)
        if args.input and len(feeds) != 1:
            raise ConfigError("--input needs exactly one --feed")
        if not args.dry_run and args.input:
            raise ConfigError("--input is only allowed with --dry-run")
    except (ConfigError, OSError) as exc:
        print(f"config error: {exc}", file=sys.stderr)
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
            body = args.input.read_bytes() if args.input else None
            result = rss.collect(feed, body=body)
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
