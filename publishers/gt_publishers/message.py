"""The publish-message contract and the content checks that run before anything is drafted.

The contract is the one documented in publishers/README.md.  Everything here is pure: it reads a
dict and returns findings, so the checks can run in CI without credentials or network access.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

TYPES = ("bulletin", "record", "correction")
RECORD_ID_RE = re.compile(r"^(evt|act|sit|eqp|src)_[0-7][0-9a-hjkmnp-tv-z]{25}$")
URL_RE = re.compile(r"https?://[^\s<>\"']+")
# A bulletin repeats a source's claim, so it must say so in its own text, in both languages.
UNVERIFIED_LABEL = {"text_tr": "[DOĞRULANMAMIŞ]", "text_en": "[UNVERIFIED]"}
ALLOWED_RATINGS = ("A", "B")  # bulletins only; see the handbook's source-rating scale


class MessageError(ValueError):
    """The message does not satisfy the contract."""


@dataclass(frozen=True)
class Source:
    name: str
    url: str
    archive_url: str
    rating: str


@dataclass(frozen=True)
class Message:
    type: str
    publication_id: str
    channels: tuple[str, ...]
    text_tr: str
    text_en: str
    sources: tuple[Source, ...]
    approved_by: str
    idempotency_key: str
    record_id: str | None = None
    corrects_publication_id: str | None = None
    extra: dict = field(default_factory=dict, repr=False)

    @property
    def texts(self) -> dict[str, str]:
        return {"text_tr": self.text_tr, "text_en": self.text_en}


def parse(doc: dict) -> Message:
    """Read a message dict into a Message, raising MessageError on anything the contract forbids."""
    if not isinstance(doc, dict):
        raise MessageError("message must be a JSON object")
    missing = [k for k in ("type", "publication_id", "text_tr", "text_en", "approved_by",
                           "idempotency_key") if not doc.get(k)]
    if missing:
        raise MessageError(f"missing required fields: {', '.join(missing)}")
    if doc["type"] not in TYPES:
        raise MessageError(f"type must be one of {', '.join(TYPES)}")
    if not isinstance(doc["channels"], list) or not doc["channels"]:
        raise MessageError("channels must be a non-empty list")
    record_id = doc.get("record_id")
    if doc["type"] == "record" and not record_id:
        raise MessageError("record messages need record_id")
    if record_id and not RECORD_ID_RE.match(str(record_id)):
        raise MessageError(f"record_id {record_id!r} is not a dataset ID")
    if doc["type"] == "correction" and not (doc.get("corrects_publication_id") or record_id):
        raise MessageError("a correction must name the publication or the record it corrects")
    sources = []
    for i, s in enumerate(doc["sources"] or []):
        for key in ("name", "url", "archive_url", "rating"):
            if not (isinstance(s, dict) and s.get(key)):
                raise MessageError(f"sources/{i}: {key} is required (archives are not optional)")
        sources.append(Source(s["name"], s["url"], s["archive_url"], s["rating"]))
    if not sources:
        raise MessageError("at least one source with an archive is required")
    return Message(type=doc["type"], publication_id=doc["publication_id"],
                   channels=tuple(doc["channels"]), text_tr=doc["text_tr"], text_en=doc["text_en"],
                   sources=tuple(sources), approved_by=doc["approved_by"],
                   idempotency_key=doc["idempotency_key"], record_id=record_id,
                   corrects_publication_id=doc.get("corrects_publication_id"),
                   extra={k: v for k, v in doc.items() if k.startswith("_")})


def content_findings(msg: Message) -> list[str]:
    """Red-line and house-style checks on the drafted text. An empty list means the draft may be shown
    to a reviewer — never that it may be posted."""
    findings: list[str] = []
    if msg.type == "bulletin":
        for lang, label in UNVERIFIED_LABEL.items():
            if label not in getattr(msg, lang):
                findings.append(f"{lang}: a bulletin must carry {label}; an unverified claim is never "
                                f"written as fact")
        bad = [s.rating for s in msg.sources if s.rating not in ALLOWED_RATINGS]
        if bad:
            findings.append(f"bulletins come only from {'/'.join(ALLOWED_RATINGS)} rated sources, "
                            f"found {', '.join(sorted(set(bad)))}")
    declared = {s.url for s in msg.sources} | {s.archive_url for s in msg.sources}
    for lang, text in msg.texts.items():
        if not any(s.name in text for s in msg.sources):
            findings.append(f"{lang}: no source is named in the text; every post is attributed")
        for url in URL_RE.findall(text):
            if url not in declared:
                findings.append(f"{lang}: links {url}, which is not a declared source or archive")
    return findings
