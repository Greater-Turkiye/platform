"""Does the pipeline still work? Asked every day, so that nothing fails in private.

The monthly announced-activity refresh was broken for months. It downloaded 112 MB, failed on a
missing import, and stopped — every month, unnoticed, because a scheduled job that nobody watches
fails where nobody is looking. It was found by dispatching it for an unrelated reason.

That is the failure this script exists to prevent. It asks four questions a person would ask if
they checked by hand, and it asks them on a schedule:

  workflows   did each scheduled run succeed, and has it run recently enough for its own cadence?
  collector   is the collector still publishing batches, or has the branch gone quiet?
  data        is each published data file younger than the cadence that is supposed to refresh it?
  site        do the pages and the data files they load actually answer?

It needs no secret beyond the token a workflow already has, and it reads nothing private. Anything
it cannot determine is reported as unknown, never as a pass.

    python tools/ops/health.py                  # human-readable report; exits non-zero on a problem
    python tools/ops/health.py --format md      # the same as Markdown, for an issue body
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "Greater-Turkiye/platform"
SITE = "https://greater-turkiye.github.io/platform"
USER_AGENT = "GreaterTurkiye-OSINT/0.1 (+https://github.com/Greater-Turkiye)"

# How often each scheduled thing is supposed to happen, and how long after that is too long. The
# grace is generous on purpose: this should report a pipeline that has stopped, not a run that
# started late because Actions queues were busy.
WORKFLOWS = {
    "collect.yml": {"every_days": 1, "grace_days": 2},
    "msi-activity.yml": {"every_days": 31, "grace_days": 7},
    "trade-vessels.yml": {"every_days": 31, "grace_days": 7},
    "markdown-links.yml": {"every_days": 7, "grace_days": 4},
}

# The branch the collectors publish their batch to. If this stops moving, the whole front of the
# pipeline has stopped, whatever the workflow says about itself.
COLLECTOR_BRANCH = "collector-state"
COLLECTOR_QUIET_DAYS = 3

# Data files that carry their own build time, and how stale each may get before it is a problem.
DATA = {
    "assets/data/vessels-summary.json": 45,
    "assets/data/fir.json": 120,
}

# Pages that must answer, and the files they cannot render without.
PAGES = ["index.html", "panel.html", "deniz.html", "hava.html", "ticaret.html", "sicil.html", "method.html"]
ASSETS = ["assets/data/trade-il.json", "assets/data/fir.json", "assets/data/msi-density.json"]


def now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


def parse(ts: str) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def gh(args: list[str]) -> str | None:
    """`gh` output, or None when the call failed — which is reported, never treated as a pass."""
    try:
        r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=120, encoding="utf-8")
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def http(url: str) -> int | None:
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, TimeoutError):
        return None


class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str]] = []  # (state, subject, detail)
        self.bad = 0

    def add(self, state: str, subject: str, detail: str) -> None:
        self.rows.append((state, subject, detail))
        if state != "ok":
            self.bad += 1

    def text(self) -> str:
        mark = {"ok": "ok ", "FAIL": "!! ", "?": "?  "}
        return "\n".join(f"  {mark.get(s, s)} {subj:<34} {d}" for s, subj, d in self.rows)

    def markdown(self) -> str:
        mark = {"ok": "✅", "FAIL": "🚫", "?": "❔"}
        head = ["| | ne / what | durum / state |", "|---|---|---|"]
        return "\n".join(head + [f"| {mark.get(s, s)} | `{subj}` | {d} |" for s, subj, d in self.rows])


def check_workflows(rep: Report) -> None:
    for name, rule in WORKFLOWS.items():
        out = gh(["run", "list", "-R", REPO, "--workflow", name, "-L", "1",
                  "--json", "conclusion,createdAt,status"])
        if out is None:
            rep.add("?", name, "could not ask GitHub")
            continue
        runs = json.loads(out or "[]")
        if not runs:
            rep.add("FAIL", name, "has never run")
            continue
        run = runs[0]
        started = parse(run.get("createdAt", ""))
        age = (now() - started).days if started else None
        if run.get("status") not in ("completed", None):
            rep.add("ok", name, f"running now ({run.get('status')})")
            continue
        if run.get("conclusion") != "success":
            rep.add("FAIL", name, f"last run {run.get('conclusion')} {age}d ago")
            continue
        limit = rule["every_days"] + rule["grace_days"]
        if age is not None and age > limit:
            rep.add("FAIL", name, f"last success {age}d ago; expected every {rule['every_days']}d")
        else:
            rep.add("ok", name, f"success {age}d ago")


def check_collector(rep: Report) -> None:
    out = gh(["api", f"repos/{REPO}/branches/{COLLECTOR_BRANCH}", "-q", ".commit.commit.committer.date"])
    if out is None:
        rep.add("?", COLLECTOR_BRANCH, "could not read the branch")
        return
    when = parse(out)
    if not when:
        rep.add("?", COLLECTOR_BRANCH, f"unreadable date: {out}")
        return
    age = (now() - when).days
    state = "FAIL" if age > COLLECTOR_QUIET_DAYS else "ok"
    rep.add(state, COLLECTOR_BRANCH, f"last batch {age}d ago")


def check_data(rep: Report) -> None:
    for path, max_age in DATA.items():
        url = f"{SITE}/{path}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.loads(r.read())
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            rep.add("?", path, f"could not read: {e}")
            continue
        built = parse(str(body.get("built_at", "")))
        if not built:
            rep.add("?", path, "carries no built_at")
            continue
        age = (now() - built).days
        rep.add("FAIL" if age > max_age else "ok", path, f"built {age}d ago (limit {max_age}d)")


def check_site(rep: Report) -> None:
    for page in PAGES + ASSETS:
        code = http(f"{SITE}/{page}")
        if code is None:
            rep.add("?", page, "no answer")
        else:
            rep.add("ok" if code == 200 else "FAIL", page, f"HTTP {code}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--format", choices=("text", "md"), default="text")
    args = ap.parse_args()

    rep = Report()
    check_workflows(rep)
    check_collector(rep)
    check_data(rep)
    check_site(rep)

    if args.format == "md":
        print(rep.markdown())
    else:
        print(rep.text())
    print()
    if rep.bad:
        print(f"{rep.bad} problem(s)", file=sys.stderr)
        return 1
    print("the pipeline answers on every check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
