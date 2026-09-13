"""64-bit SimHash for near-duplicate detection.

Features are word 3-shingles of the case-folded, normalized text (or the single tokens when
there are fewer than three). Each feature is hashed with BLAKE2b (8-byte digest). Two texts
are near-duplicates when the Hamming distance between their SimHashes is small (typically <= 3).

On the wire the value is a 16-character lowercase hex string (JavaScript numbers cannot hold
64-bit integers); SQLite/D1 stores it as a signed 64-bit INTEGER (see :func:`to_signed64`).
"""

from __future__ import annotations

import hashlib
import re

from gt_collectors.normalize import normalize_text

_TOKEN = re.compile(r"\w+", re.UNICODE)
BITS = 64
_MASK = (1 << BITS) - 1


def tokens(text: str) -> list[str]:
    return _TOKEN.findall(normalize_text(text).casefold())


def features(text: str, shingle: int = 3) -> list[str]:
    toks = tokens(text)
    if len(toks) < shingle:
        return toks
    return [" ".join(toks[i : i + shingle]) for i in range(len(toks) - shingle + 1)]


def _h64(feature: str) -> int:
    return int.from_bytes(hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest(), "big")


def simhash(text: str) -> int:
    """Unsigned 64-bit SimHash; ``0`` for text without word characters."""
    weights = [0] * BITS
    feats = features(text)
    if not feats:
        return 0
    for f in feats:
        h = _h64(f)
        for bit in range(BITS):
            weights[bit] += 1 if (h >> bit) & 1 else -1
    value = 0
    for bit in range(BITS):
        if weights[bit] > 0:
            value |= 1 << bit
    return value


def to_hex(value: int) -> str:
    return f"{value & _MASK:016x}"


def from_hex(value: str) -> int:
    if len(value) != 16:
        raise ValueError("simhash hex must be 16 characters")
    return int(value, 16)


def to_signed64(value: int) -> int:
    value &= _MASK
    return value - (1 << BITS) if value >= 1 << (BITS - 1) else value


def from_signed64(value: int) -> int:
    return value & _MASK


def hamming(a: int, b: int) -> int:
    return ((a ^ b) & _MASK).bit_count()
