"""URL/text normalization and hashes.

These rules are a cross-language contract: the ingest Worker (JavaScript) re-derives
``content_hash`` and must get the same bytes. Everything here is deliberately simple:
no percent-decoding or re-encoding, an explicit whitespace class, Unicode NFC.

``normalize_url``
    1. Trim; scheme must be ``http``/``https``; lowercase scheme and host; drop userinfo,
       a trailing dot on the host and the default port (80/443); an empty path becomes ``/``.
    2. Query: split the raw string on ``&``, drop empty parts and parts whose key (text before
       the first ``=``, lowercased, *not* percent-decoded) is a tracking parameter
       (:data:`TRACKING_PARAMS` or a prefix in :data:`TRACKING_PREFIXES`); sort the remaining
       parts as raw strings (by code point) and join with ``&``.
    3. Fragment: dropped, unless it starts with ``!`` or ``/`` (hash-routed pages).

``normalize_text``
    Unicode NFC; runs of :data:`WHITESPACE` collapse to one space; trimmed.

``content_hash``
    ``"sha256:" + hex(SHA-256(UTF-8(normalize_url(url) + "\\n" + normalize_text(text))))``.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from urllib.parse import urlsplit

TRACKING_PARAMS = frozenset(
    {
        "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "twclid",
        "ttclid", "li_fat_id", "igshid", "igsh", "mc_cid", "mc_eid", "_ga", "_gl", "_hsenc",
        "_hsmi", "mkt_tok", "oly_anon_id", "oly_enc_id", "rb_clickid", "s_cid", "vero_id",
        "vero_conv", "wickedid", "ref_src", "ref_url", "srsltid", "spm", "cmpid", "at_medium",
        "at_campaign",
    }
)  # fmt: skip
TRACKING_PREFIXES = ("utm_", "pk_", "mtm_", "hsa_")

# Explicit so that Python and JavaScript agree (their \s classes differ).
WHITESPACE = "\t\n\v\f\r    -     　﻿"
_WS_RUN = re.compile(f"[{WHITESPACE}]+")
_DEFAULT_PORTS = {"http": 80, "https": 443}


class InvalidURL(ValueError):
    pass


def _is_tracking(key: str) -> bool:
    k = key.lower()
    return k in TRACKING_PARAMS or k.startswith(TRACKING_PREFIXES)


def normalize_url(url: str) -> str:
    url = url.strip()
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as exc:
        raise InvalidURL(f"unparseable URL: {url!r}") from exc
    scheme = parts.scheme.lower()
    if scheme not in _DEFAULT_PORTS:
        raise InvalidURL(f"only http(s) URLs are accepted: {url!r}")
    host = (parts.hostname or "").rstrip(".")
    if not host:
        raise InvalidURL(f"URL has no host: {url!r}")
    if ":" in host:  # IPv6 literal
        host = f"[{host}]"
    netloc = host if port in (None, _DEFAULT_PORTS[scheme]) else f"{host}:{port}"
    path = parts.path or "/"
    kept = sorted(p for p in parts.query.split("&") if p and not _is_tracking(p.split("=", 1)[0]))
    query = "&".join(kept)
    fragment = parts.fragment if parts.fragment[:1] in ("!", "/") else ""
    out = f"{scheme}://{netloc}{path}"
    if query:
        out += f"?{query}"
    if fragment:
        out += f"#{fragment}"
    return out


def normalize_text(text: str | None) -> str:
    if not text:
        return ""
    return _WS_RUN.sub(" ", unicodedata.normalize("NFC", text)).strip()


def sha256_prefixed(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def content_hash(url: str, text: str | None) -> str:
    payload = normalize_url(url) + "\n" + normalize_text(text)
    return sha256_prefixed(payload.encode("utf-8"))
