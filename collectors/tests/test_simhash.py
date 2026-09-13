from __future__ import annotations

import pytest

from gt_collectors.simhash import (
    features,
    from_hex,
    from_signed64,
    hamming,
    simhash,
    to_hex,
    to_signed64,
)

BASE = (
    "The ministry of defence of the example republic announced on Friday that a joint naval "
    "exercise with two partner countries will take place next week in international waters, "
    "involving frigates, patrol boats and maritime patrol aircraft, and that observers from "
    "several regional states have been invited to attend the closing ceremony at the naval base."
)


def test_identical_text_distance_zero() -> None:
    assert hamming(simhash(BASE), simhash(BASE)) == 0


def test_near_duplicate_is_close_and_unrelated_is_far() -> None:
    near = BASE.replace("next week", "next month")
    unrelated = "Heavy rain caused flooding in the capital; schools will stay closed until Monday."
    assert hamming(simhash(BASE), simhash(near)) <= 12
    assert hamming(simhash(BASE), simhash(unrelated)) >= 16


def test_case_and_whitespace_insensitive() -> None:
    assert simhash(BASE) == simhash("  " + BASE.upper().replace(" ", "\n  "))


def test_short_and_empty_text() -> None:
    assert features("two words") == ["two", "words"]
    assert simhash("") == 0
    assert simhash("!!!") == 0


def test_encodings_round_trip() -> None:
    value = simhash(BASE)
    assert 0 <= value < 2**64
    assert len(to_hex(value)) == 16 and from_hex(to_hex(value)) == value
    signed = to_signed64(value)
    assert -(2**63) <= signed < 2**63
    assert from_signed64(signed) == value
    assert to_signed64(2**64 - 1) == -1
    with pytest.raises(ValueError):
        from_hex("abc")
