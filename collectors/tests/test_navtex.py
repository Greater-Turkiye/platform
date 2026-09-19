"""NAVTEX parsing: the header, the warning's own serial, positions and what is happening.

The messages here are real ones, as published by the Hellenic Navy Hydrographic Service on its
public NAVTEX feed, trimmed to what the parser has to read.
"""

from datetime import UTC, datetime

import pytest

from gt_collectors import navtex

LIMNOS = (
    "ZCZC LA03 191940 UTC FEB 26 LIMNOS RADIO NAVWARN 038/26 NOTRHEAST AEGEAN SEA PSARA ISLAND "
    "AGIOS GEORGIOS POINT FLASHING WHITE LIGHT IN POSITION: 38-32.20N 025-36.56E UNLIT NNNN"
)
KERKYRA_SAR = (
    "ZCZC KD00 201750 UTC FEB 26 KERKYRA RADIO SARWARN 001/26 SEA AREA SOUTH OF PORT OF PATRA - "
    "ESTUARY OF GLAFKOS RIVER TYPE OF DISTRESS: PERSON IN THE SEA PERSONS AT RISK: 01 NNNN"
)
FIRING = (
    "ZCZC HA12 031200 UTC MAR 26 IRAKLEIO RADIO NAVWARN 112/26 SOUTH AEGEAN SEA GUNNERY FIRING "
    "PRACTICE WILL TAKE PLACE IN THE AREA BOUNDED BY 36-10.00N 025-30.00E 36-10.00N 026-00.00E "
    "35-50.00N 026-00.00E 35-50.00N 025-30.00E FROM 041200 UTC TO 041800 UTC MAR 26 NNNN"
)


def test_header_is_read_into_station_subject_and_time():
    m = navtex.parse(LIMNOS)
    assert (m.station_letter, m.subject_letter, m.serial_in_subject) == ("L", "A", "03")
    assert m.station == "Limnos (GR)"
    assert m.subject == "navigational warning"
    assert m.issued_at == datetime(2026, 2, 19, 19, 40, tzinfo=UTC)


def test_warning_serial_and_issuing_station():
    m = navtex.parse(LIMNOS)
    assert m.issuing_station == "Limnos Radio"
    assert m.warning_kind == "NAVWARN"
    assert m.warning_serial == "038/26"


def test_position_is_degrees_and_decimal_minutes():
    m = navtex.parse(LIMNOS)
    assert len(m.positions) == 1
    lat, lon = m.positions[0].as_tuple()
    assert abs(lat - (38 + 32.20 / 60)) < 1e-6
    assert abs(lon - (25 + 36.56 / 60)) < 1e-6


def test_body_excludes_the_header_and_the_closing_marker():
    m = navtex.parse(LIMNOS)
    assert m.body.startswith("NOTRHEAST AEGEAN SEA")   # the typo is the publisher's
    assert "ZCZC" not in m.body
    assert not m.body.endswith("NNNN")


def test_activity_is_what_the_wording_names():
    assert navtex.parse(FIRING).activity == "firing"
    assert navtex.parse(KERKYRA_SAR).activity == "sar"
    assert navtex.parse(LIMNOS).activity == "aid-to-navigation"


def test_a_firing_area_keeps_every_corner_in_order():
    m = navtex.parse(FIRING)
    assert len(m.positions) == 4
    assert m.positions[0].as_tuple() == pytest.approx((36 + 10 / 60, 25.5), abs=1e-5)
    assert m.positions[-1].as_tuple() == pytest.approx((35 + 50 / 60, 25.5), abs=1e-5)
    assert m.warning_kind == "NAVWARN"


def test_search_and_rescue_subject_letter_is_kept_even_without_positions():
    m = navtex.parse(KERKYRA_SAR)
    assert m.subject_letter == "D"
    assert m.subject == "search and rescue"
    assert m.positions == []


def test_unknown_station_letter_is_kept_and_not_guessed():
    m = navtex.parse("ZCZC QA01 010000 UTC JAN 26 SOMEWHERE RADIO NAVWARN 001/26 TEXT NNNN")
    assert m.station_letter == "Q"
    assert m.station is None


def test_a_message_without_a_header_still_yields_positions_and_activity():
    m = navtex.parse("SUBMARINE EXERCISE IN POSITION 40-00.00N 026-00.00E")
    assert m.station_letter is None
    assert m.activity == "submarine"
    assert m.positions[0].as_tuple() == pytest.approx((40.0, 26.0), abs=1e-5)


def test_cancellation_is_recorded():
    m = navtex.parse("ZCZC LA05 050600 UTC MAR 26 LIMNOS RADIO NAVWARN 040/26 CANCEL NAVWARN 038/26 NNNN")
    assert m.cancelled_by == "038/26"


def test_out_of_range_numbers_are_not_positions():
    assert navtex.positions("99-99.00N 999-99.00E") == []


def test_to_json_has_a_stable_shape():
    j = navtex.parse(FIRING).to_json()
    assert j["issued_at"] == "2026-03-03T12:00:00Z"
    assert j["activity"] == "firing"
    assert tuple(j["positions"][0]) == pytest.approx((36 + 10 / 60, 25.5), abs=1e-5)


def test_the_body_is_left_out_unless_it_is_asked_for():
    """A source whose terms forbid redistribution gives us facts to keep, not text to republish."""
    m = navtex.parse(FIRING)
    assert "body" not in m.to_json()
    assert m.to_json(include_body=True)["body"].startswith("SOUTH AEGEAN SEA")
