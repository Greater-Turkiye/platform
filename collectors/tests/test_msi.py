"""Counting rules for NGA broadcast warnings.

The Turkish-exclusion tests are the ones that matter most: a regression there would publish a series
of Türkiye's own announced firing and exercise areas, which is the thing the red line exists to
prevent (ADR 0013).
"""

from gt_collectors import msi, navtex

AEGEAN_FIRING = {
    "msgYear": 2020, "msgNumber": 1234, "navArea": "A", "authority": "NAVAREA III 512/20",
    "text": "AEGEAN SEA. DNC 09. 1. HAZARDOUS OPERATIONS 121200Z TO 121600Z JUN IN AREA BOUND BY "
            "39-00.00N 025-00.00E, 39-00.00N 025-30.00E, 38-40.00N 025-30.00E. "
            "2. CANCEL THIS MSG 121700Z JUN 20.",
}
COORDS_ONLY = {
    "msgYear": 2019, "msgNumber": 77, "navArea": "A", "authority": "MRCC ROME 12/19",
    "text": "DNC 09. GUNNERY FIRING 050800Z TO 051200Z MAY IN AREA BOUND BY 36-30.00N 028-00.00E, "
            "36-30.00N 028-30.00E, 36-10.00N 028-30.00E.",
}
FAR_AWAY = {
    "msgYear": 2019, "msgNumber": 78, "navArea": "P", "authority": "NAVAREA XII 3/19",
    "text": "NORTH PACIFIC OCEAN. HAZARDOUS OPERATIONS IN AREA BOUND BY 30-00.00N 150-00.00W.",
}
TURKISH_BY_AUTHORITY = {
    "msgYear": 2020, "msgNumber": 900, "navArea": "A", "authority": "TURKEY NAVTEX 615/20",
    "text": "AEGEAN SEA. GUNNERY EXERCISE 101000Z TO 101400Z IN AREA BOUND BY 39-10.00N 025-40.00E.",
}
TURKISH_BY_SUBJECT = {
    "msgYear": 2020, "msgNumber": 901, "navArea": "A", "authority": "NAVAREA III 600/20",
    "text": "TURKEY. HAZARDOUS OPERATIONS 111000Z TO 111400Z IN AREA BOUND BY 40-10.00N 026-40.00E.",
}
CANCEL_ONLY = {
    "msgYear": 2020, "msgNumber": 902, "navArea": "A", "authority": "NAVAREA III 601/20",
    "text": "AEGEAN SEA. DNC 09. CANCEL HYDROLANT 277/20 AND THIS MSG.",
}


def test_a_named_sea_puts_a_warning_in_the_region():
    assert msi.in_region(AEGEAN_FIRING["text"], navtex.positions(AEGEAN_FIRING["text"]))


def test_coordinates_alone_put_a_warning_in_the_region():
    text = COORDS_ONLY["text"]
    assert "AEGEAN" not in text.upper()
    assert msi.in_region(text, navtex.positions(text))


def test_a_warning_from_another_ocean_is_not_ours():
    text = FAR_AWAY["text"]
    assert not msi.in_region(text, navtex.positions(text))


def test_a_turkish_authority_is_excluded():
    assert msi.is_turkish(TURKISH_BY_AUTHORITY, TURKISH_BY_AUTHORITY["text"])


def test_a_turkish_subject_is_excluded_even_from_another_authority():
    assert msi.is_turkish(TURKISH_BY_SUBJECT, TURKISH_BY_SUBJECT["text"])


def test_a_greek_relay_about_the_aegean_is_not_turkish():
    assert not msi.is_turkish(AEGEAN_FIRING, AEGEAN_FIRING["text"])


def test_the_tally_counts_what_it_should_and_skips_what_it_should_not():
    t = msi.summarise(
        [AEGEAN_FIRING, COORDS_ONLY, FAR_AWAY, TURKISH_BY_AUTHORITY, TURKISH_BY_SUBJECT, CANCEL_ONLY]
    )
    assert t.read == 6
    assert t.kept == 2                    # the Aegean area and the one given only in coordinates
    assert t.turkish_excluded == 2
    assert t.cancellations == 1
    assert t.years[2020] == 1 and t.years[2019] == 1


def test_the_archive_baseline_counts_every_area_not_only_ours():
    t = msi.summarise([AEGEAN_FIRING, FAR_AWAY])
    assert t.archive_years[2019] == 1     # the Pacific warning is in the baseline
    assert t.years[2019] == 0             # but not in the region's count


def test_activity_comes_from_the_wording():
    t = msi.summarise([AEGEAN_FIRING, COORDS_ONLY])
    assert t.per_year_activity[2020]["hazardous-operations"] == 1
    assert t.per_year_activity[2019]["firing"] == 1


def test_a_repeated_message_is_counted_once():
    t = msi.summarise([AEGEAN_FIRING, dict(AEGEAN_FIRING)])
    assert t.kept == 1


def test_series_carries_the_columns_a_reader_needs():
    t = msi.summarise([AEGEAN_FIRING, COORDS_ONLY, FAR_AWAY])
    row = next(r for r in t.series() if r["year"] == 2020)
    assert row["total"] == 1
    assert row["by_authority"] == {"NAVAREA": 1}
    assert row["archive_all_areas"] == 1
    assert row["by_activity"] == {"hazardous-operations": 1}
