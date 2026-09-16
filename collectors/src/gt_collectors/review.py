"""The human review queue: one GitHub issue per scheduled run.

Gate 1 of ADR 0007 is a Telegram reviewer bot, which needs a Worker and a bot token we do not
have yet. Until then the queue is an issue in this repository: every candidate is one checklist
line with its title, a link to the source, a Wayback link when one exists, the region guess and
the dedup id from :mod:`gt_collectors.state`.

**Nothing in the issue is a published claim.** The items are unverified candidates: automation
only suggests, a human decides (ADR 0007). :func:`render_issue` always writes that banner first.

Before an item becomes a line here it passes the relevance filter
(:mod:`gt_collectors.relevance`), which keeps items about the watch regions and the event types
this project records. That filter is for **noise only**: the Turkish-forces safety filter and the
geofence run before it and are unaffected by it. Items below the relevance threshold are not
listed; they stay in the run artifact with ``status: off-topic``, are counted in the table at the
top of the issue, and are never written to the dedup ledger. Items that land just under the
threshold are listed with a ``borderline`` marker rather than dropped silently.

The body is kept under :data:`BODY_LIMIT` characters (GitHub refuses an issue body over 65,536)
by listing at most ``max_items`` candidates and saying how many were left for the next run.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from urllib.parse import quote, urlencode

from gt_collectors import fetch
from gt_collectors.normalize import normalize_text
from gt_collectors.relevance import Relevance
from gt_collectors.signal import Signal

MAX_ITEMS = 40
BODY_LIMIT = 60_000
LABEL = "inceleme-kuyrugu"
WAYBACK_API = "https://archive.org/wayback/available"
# What this run did with a candidate. Only ``queued`` items reach the issue and the dedup ledger;
# the other two stay in the artifact so nothing collected is ever lost.
STATUSES = ("queued", "deferred", "off-topic")

# A hint for the reviewer, never a filter: items that talk about Turkish forces are the ones the
# red line covers (handbook 02-red-lines, ADR 0013). They are queued like any other candidate and
# marked, so a reviewer reads them knowing that positions and movements are never publishable.
_REDLINE_TERMS = (
    "türk silahlı kuvvetleri",
    "türk ordusu",
    "türk askeri",
    "türk askerleri",
    "türk birlikleri",
    "türk deniz kuvvetleri",
    "türk hava kuvvetleri",
    "türk kara kuvvetleri",
    "mehmetçik",
    "tsk",
    "sat komandoları",
    "turkish armed forces",
    "turkish forces",
    "turkish troops",
    "turkish soldiers",
    "turkish military",
    "turkish navy",
    "turkish air force",
    "turkish army",
)
_REDLINE_RE = re.compile(rf"(?<!\w)(?:{'|'.join(re.escape(t) for t in _REDLINE_TERMS)})(?!\w)")
_MD_SPECIAL = re.compile(r"([\\`*_{}\[\]()#+\-.!|<>~])")
_URL_SAFE = ":/?#[]@!$&'()*+,;=%~"


@dataclass(frozen=True, slots=True)
class Candidate:
    """One unverified item on its way to a human."""

    feed_id: str
    queue_id: str
    signal: Signal
    archive_url: str | None = None
    redline_check: bool = False
    relevance: Relevance | None = None
    status: str = "queued"

    def __post_init__(self) -> None:
        if self.status not in STATUSES:
            raise ValueError(f"status must be one of {STATUSES}, got {self.status!r}")

    @property
    def when(self) -> datetime:
        """Sort key: the source's publication time, or the fetch time when it gives none."""
        return self.signal.published_at or self.signal.fetched_at

    def to_dict(self) -> dict[str, Any]:
        return {
            "queue_id": self.queue_id,
            "feed": self.feed_id,
            "status": self.status,
            "archive_url": self.archive_url,
            "redline_check": self.redline_check,
            "relevance": self.relevance.to_dict() if self.relevance else None,
            "signal": self.signal.to_dict(),
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))


def redline_check(signal: Signal) -> bool:
    """True if the item mentions Turkish forces, so the reviewer sees the red-line marker."""
    return bool(_REDLINE_RE.search(normalize_text(f"{signal.title} {signal.text}").casefold()))


def archive_lookup(url: str, *, fetcher: Any = fetch.get, timeout: float = 10.0) -> str | None:
    """Closest Wayback Machine snapshot of ``url``, or ``None``.

    Uses the public availability API, which needs no key and no account. Any failure (offline,
    rate limit, unexpected payload) returns ``None``: an archive link is a convenience, never a
    reason to fail a run.
    """
    query = urlencode({"url": url})
    try:
        response = fetcher(f"{WAYBACK_API}?{query}", retries=0, timeout=timeout)
        payload = json.loads(response.body.decode("utf-8"))
        snapshot = payload["archived_snapshots"]["closest"]
        if not snapshot.get("available"):
            return None
        location = snapshot["url"]
    except (fetch.FetchError, OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError):
        return None
    if not isinstance(location, str) or not location.startswith(("https://", "http://")):
        return None
    return location.replace("http://web.archive.org/", "https://web.archive.org/", 1)


def issue_title(day: date) -> str:
    return f"İnceleme kuyruğu / Review queue — {day.isoformat()}"


def _escape(text: str) -> str:
    return _MD_SPECIAL.sub(r"\\\1", normalize_text(text))


def _link(label: str, url: str) -> str:
    # Angle-bracket destinations survive parentheses and other punctuation in a URL.
    return f"[{label}](<{quote(url, safe=_URL_SAFE)}>)"


def _line(candidate: Candidate) -> str:
    signal = candidate.signal
    title = _escape(signal.title) or "(başlıksız / untitled)"
    parts = [_link("kaynak / source", signal.url)]
    if candidate.archive_url:
        parts.append(_link("arşiv / archive", candidate.archive_url))
    parts.append(f"`{candidate.feed_id}`")
    if signal.geo.region:
        parts.append(f"bölge / region: `{signal.geo.region}`")
    if candidate.relevance is not None:
        parts.append(f"ilgi / relevance: `{candidate.relevance.score:.2f}`")
    when = signal.published_at or signal.fetched_at
    parts.append(f"{when:%Y-%m-%d %H:%M} UTC")
    parts.append(f"`{candidate.queue_id}`")
    flags = ""
    if candidate.relevance is not None and candidate.relevance.borderline:
        flags += " ❓ `sınırda / borderline`"
    if candidate.redline_check:
        flags += " ⚠️ `redline_check`"
    return f"- [ ] **{title}** — " + " · ".join(parts) + flags


def _order(candidate: Candidate) -> tuple[datetime, str, str]:
    return (candidate.when, candidate.feed_id, candidate.queue_id)


def select(
    candidates: Iterable[Candidate], max_items: int = MAX_ITEMS
) -> tuple[list[Candidate], list[Candidate]]:
    """The newest ``max_items`` candidates, and the ones left over.

    Leftovers are **deferred, not dropped**: they are not written to the ledger, so the next run
    offers them again (as long as they are still in the source's feed window), and they go into
    the run artifact with ``status: deferred``.
    """
    ordered = sorted(candidates, key=_order, reverse=True)
    if max_items < 0:
        return ordered, []
    return ordered[:max_items], ordered[max_items:]


def render_issue(
    candidates: Sequence[Candidate],
    *,
    day: date,
    stats: dict[str, Any] | None = None,
    run_url: str | None = None,
    deferred: int = 0,
    limit: int = BODY_LIMIT,
) -> str:
    """Render the issue body. Newest candidate first; always under ``limit`` characters."""
    stats = stats or {}
    header = [
        "> **Bunlar doğrulanmamış adaylardır, yayımlanmış iddia değildir.** Otomasyon yalnızca öneri",
        "> üretir; hiçbir öğe bir insan doğrulamadan hiçbir yerde yayımlanmaz ([ADR 0007]"
        "(https://github.com/Greater-Turkiye/handbook/blob/main/decisions/"
        "0007-human-in-the-loop-publishing.md)).",
        "> Türk kuvvetlerinin konumu ve hareketleri hiçbir koşulda yayımlanmaz; `redline_check`",
        "> işaretli satırlar bunu hatırlatır.",
        ">",
        "> **These are unverified candidates, not published claims.** Automation only suggests;",
        "> nothing is published anywhere until a human has verified it (ADR 0007). Positions and",
        "> movements of Turkish forces are never published — lines marked `redline_check` are a",
        "> reminder, not a verdict.",
        "",
        f"Çalışma / run: **{day.isoformat()}**"
        + (f" · [iş kaydı / run log](<{run_url}>)" if run_url else "")
        + " · üretim / produced by `.github/workflows/collect.yml`",
        "",
    ]
    counts = [
        "| | |",
        "|---|---:|",
        f"| Akış / feeds | {stats.get('feeds', 0)} |",
        f"| Görülen öğe / items seen | {stats.get('items', 0)} |",
        f"| Güvenlik süzgeci + geofence eledi / dropped by the safety filter | {stats.get('dropped', 0)} |",
        f"| Kopya / duplicates within the run | {stats.get('duplicates', 0)} |",
        f"| Daha önce kuyruğa girmiş / already in the ledger | {stats.get('known', 0)} |",
        f"| İlgisiz / off-topic (ilgi süzgeci / relevance filter) | {stats.get('off_topic', 0)} |",
        f"| Kuyruğa alınan / queued here | {len(candidates)} |",
        f"| Sonraki çalışmaya ertelenen / deferred to the next run | {deferred} |",
        f"| Hatalı akış / feed errors | {stats.get('errors', 0)} |",
        "",
        f"## Adaylar / Candidates ({len(candidates)})",
        "",
    ]
    off_topic = int(stats.get("off_topic", 0) or 0)
    borderline = sum(1 for c in candidates if c.relevance is not None and c.relevance.borderline)
    footer_lines = [
        "",
        "Her satır için / for each line: **kutuyu işaretle** = incelendi (`x`), yorumda kararını yaz",
        "(ör. *reddedildi / dismissed*, *taslağa / promote to draft*). Tam parti ve her alan çalışma",
        "yapıtındadır (`candidates.jsonl`). Kaynak metni yeniden yayımlanmaz; yalnızca bağlantı,",
        "başlık ve ≤500 karakterlik alıntı saklanır.",
        "",
        "Tick a box when you have reviewed a line and say what you decided in a comment (dismissed,",
        "promote to draft, …). The full batch with every field is the run artifact",
        "(`candidates.jsonl`). Source text is never republished: link, title and a ≤500-character",
        "excerpt only.",
    ]
    note: list[str] = []
    if off_topic:
        note += [
            f"**İlgi süzgeci / relevance filter:** {off_topic} aday bir izleme bölgesi **ve** bir "
            "olay türüyle birden eşleşmediği için kuyruğa girmedi. Silinmediler: hepsi çalışma "
            "yapıtında `status: off-topic` olarak durur ve kayıt defterine **yazılmadılar**, "
            "böylece daha iyi bir tablo onları sonraki çalışmada yeniden değerlendirebilir.",
            "",
            f"{off_topic} candidates matched no watch region **or** no recorded event type, so "
            "they are not listed here. Nothing was deleted: they are in the run artifact with "
            "`status: off-topic` and were **not** written to the dedup ledger, so a better table "
            "can pick them up on a later run. The tables, the threshold and how to extend them: "
            "`collectors/src/gt_collectors/data/relevance.yaml`, `collectors/README.md`.",
            "",
        ]
    if borderline:
        note += [
            f"❓ `sınırda / borderline` işaretli {borderline} satır eşiğin hemen altında kaldı: "
            "süzgeç emin değil, atmak yerine size soruyor. / "
            f"{borderline} line(s) marked ❓ `sınırda / borderline` scored just below the "
            "threshold: the filter is unsure and asks you rather than dropping them quietly.",
            "",
        ]
    footer_lines[1:1] = note
    if deferred:
        footer_lines[1:1] = [
            f"{deferred} aday bu çalışmaya sığmadı; kayıt defterine yazılmadılar ve **bir sonraki "
            f"çalışmada** kuyruğa girerler. / {deferred} candidates did not fit in this run: they "
            "were not written to the ledger and the **next** run offers them again.",
            "",
        ]

    body = header + counts
    footer = "\n".join(footer_lines)
    lines: list[str] = []
    hidden = 0
    for candidate in sorted(candidates, key=_order, reverse=True):
        line = _line(candidate)
        projected = len("\n".join(body + lines + [line])) + len(footer) + 200
        if projected > limit:
            hidden += 1
            continue
        lines.append(line)
    if not lines and not candidates:
        lines.append("_Bu çalışmada yeni aday yok. / No new candidates in this run._")
    if hidden:
        lines.append(
            f"- _… {hidden} satır GitHub'ın konu boyutu sınırı için kırpıldı; hepsi çalışma "
            f"yapıtındadır. / {hidden} lines were trimmed to stay under GitHub's issue size "
            "limit; all of them are in the run artifact._"
        )
    return "\n".join(body + lines) + "\n" + footer + "\n"
