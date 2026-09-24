"""Probe candidate feed URLs from wherever this runs and print what each one answers.

The collector's own User-Agent is used, never a browser's: a host that answers a browser and
refuses us stays refused. Output is one line per URL — status, what the body looks like (rss,
atom, html), how many items it holds, and the final URL after redirects — so a survey can be
run from a GitHub runner when a host does not resolve or answer from a maintainer's network.

    python tools/collectors/probe_feeds.py https://example.org/feed.xml https://example.net/rss
    python tools/collectors/probe_feeds.py --file urls.txt
"""

from __future__ import annotations

import argparse
import re
import socket
import ssl
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "collectors" / "src"))
from gt_collectors import USER_AGENT  # noqa: E402

ITEM = re.compile(rb"<item[\s>]|<entry[\s>]")
ACCEPT = "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5"


def probe(url: str, show: int = 0) -> tuple[str, str, int, str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": ACCEPT})
    try:
        with urllib.request.urlopen(req, timeout=25, context=ssl.create_default_context()) as r:
            body = r.read(400_000)
            final = r.geturl()
            status = str(r.status)
    except urllib.error.HTTPError as e:
        return url, f"HTTP {e.code}", 0, "", ""
    except Exception as e:  # noqa: BLE001 - a probe reports, it does not fail
        return url, f"{type(e).__name__}: {str(e)[:60]}", 0, "", ""
    head = body[:600].lstrip().lower()
    if b"<feed" in head:
        kind = "atom"
    elif b"<rss" in head or b"<rdf" in head:
        kind = "rss"
    elif b"<html" in head or b"<!doctype" in head:
        kind = "html"
    else:
        kind = "?"
    preview = " ".join(body[:show].decode("utf-8", "replace").split()) if show else ""
    return url, f"{status} {kind}", len(ITEM.findall(body)), final if final != url else "", preview


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--file", type=Path, help="one URL per line; blank lines and # comments skipped")
    ap.add_argument("--show", type=int, default=0, metavar="N", help="also print the first N bytes of each body")
    args = ap.parse_args()
    urls = list(args.urls)
    if args.file:
        urls += [
            line.strip()
            for line in args.file.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        ]
    if not urls:
        ap.error("no URLs")
    socket.setdefaulttimeout(25)
    with ThreadPoolExecutor(8) as ex:
        rows = list(ex.map(lambda u: probe(u, args.show), urls))
    for url, status, n, final, preview in rows:
        print(f"{status:<28} {n:>4}  {url}" + (f"  -> {final}" if final else ""))
        if preview:
            print(f"    | {preview}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
