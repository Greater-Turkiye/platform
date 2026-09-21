"""Whatever the link checker cannot reach, check the archive copy of instead.

`.lycheeignore` names the sources a GitHub runner cannot fetch: the TRNC gazette's certificate
chain is rejected there, mgk.gov.tr resets the connection, and a SPARQL endpoint is not a page.
Excluding them keeps the check green — and leaves those sources, which are the primary documents
the whole method rests on, entirely unwatched. If the TRNC gazette quietly reorganised its URLs
tomorrow, nothing in this repository would notice.

This closes that hole from the other side. For every excluded URL it asks the Wayback availability
API whether a snapshot exists and how old it is. A source that no longer answers anywhere, not even
in the archive, is a citation that has failed and should be found by us rather than by a reader.

    python tools/web/check_archives.py                    # report, exit non-zero on a failure
    python tools/web/check_archives.py --max-age-days 400 # also complain about a stale snapshot

It needs no account and no secret: the availability API is free and unauthenticated. Anything it
cannot answer for is reported as unknown rather than as a pass, because an inconclusive check that
reports success is worse than no check.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IGNORE = ROOT / ".lycheeignore"
AVAILABILITY = "https://archive.org/wayback/available?url="
USER_AGENT = "GreaterTurkiye-OSINT/0.1 (+https://github.com/Greater-Turkiye)"

# A SPARQL endpoint has nothing to archive and nothing to rot: it is cited as the interface a query
# was run against, not as a document. Anything else in the ignore file is a document.
NOT_A_DOCUMENT = ("query.wikidata.org/sparql",)


def urls_from_ignore(path: Path) -> list[str]:
    """The URLs `.lycheeignore` excludes, turned back from anchored regexes into plain URLs.

    The file holds `^https://host/path$` with the regex metacharacters escaped, which is exactly
    reversible for the patterns this project writes: the anchors come off and the backslashes
    before literal dots and hyphens come out. A line that is not of that shape is reported rather
    than guessed at, because a pattern this cannot read is a pattern this cannot check."""
    out, unreadable = [], []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if not (line.startswith("^") and line.endswith("$")):
            unreadable.append(line)
            continue
        url = line[1:-1].replace("\\", "")
        if not url.startswith("http"):
            unreadable.append(line)
            continue
        out.append(url)
    for line in unreadable:
        print(f"  ?  cannot read as a URL: {line}", file=sys.stderr)
    return out


def snapshot(url: str) -> dict | None:
    """The closest Wayback snapshot, or None when the archive has never seen the page."""
    req = urllib.request.Request(AVAILABILITY + urllib.parse.quote(url, safe=""),
                                 headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.loads(r.read())
    closest = (body.get("archived_snapshots") or {}).get("closest")
    return closest if closest and closest.get("available") else None


def age_days(timestamp: str) -> int | None:
    """Wayback stamps are YYYYMMDDhhmmss."""
    m = re.match(r"^(\d{4})(\d{2})(\d{2})", timestamp or "")
    if not m:
        return None
    taken = dt.datetime(int(m[1]), int(m[2]), int(m[3]), tzinfo=dt.UTC)
    return (dt.datetime.now(tz=dt.UTC) - taken).days


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--max-age-days", type=int, default=0,
                    help="warn when the newest snapshot is older than this (0 = do not check age)")
    args = ap.parse_args()

    if not IGNORE.exists():
        print(f"{IGNORE.relative_to(ROOT)} does not exist; nothing is excluded, nothing to check")
        return 0

    urls = urls_from_ignore(IGNORE)
    if not urls:
        print("the ignore file excludes nothing")
        return 0

    failures, stale = 0, 0
    print(f"{len(urls)} excluded URL(s); asking the Wayback availability API for each\n")
    for url in urls:
        if any(skip in url for skip in NOT_A_DOCUMENT):
            print(f"  -  skipped, not a document: {url}")
            continue
        try:
            hit = snapshot(url)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            # Unknown is not a pass. A checker that reports success when it could not check is
            # worse than no checker, because it is believed.
            print(f"  ?  could not ask the archive ({e}): {url}", file=sys.stderr)
            failures += 1
            continue
        if not hit:
            print(f"  X  no snapshot anywhere: {url}", file=sys.stderr)
            failures += 1
            continue
        days = age_days(hit.get("timestamp", ""))
        mark = "ok"
        if args.max_age_days and days is not None and days > args.max_age_days:
            mark, stale = "old", stale + 1
        print(f"  {mark:<2} {str(days) + 'd' if days is not None else '?':>6}  {url}")

    print()
    if failures:
        print(f"{failures} source(s) have no archive copy and cannot be checked any other way; "
              f"archive them with datasets/tools/archive.py", file=sys.stderr)
    if stale:
        print(f"{stale} snapshot(s) older than {args.max_age_days} days", file=sys.stderr)
    if not failures and not stale:
        print("every excluded source has an archive copy")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
