from __future__ import annotations

import json
from typing import Any

import pytest

from gt_collectors import relevance, safety
from gt_collectors.normalize import normalize_url, sha256_prefixed
from gt_collectors.relevance import GLOBAL, RelevanceError, Table, default_table, fold
from gt_collectors.signal import Geo, Signal
from tests.conftest import FIXTURES, NOW

CASES: list[dict[str, Any]] = json.loads((FIXTURES / "relevance_cases.json").read_text(encoding="utf-8"))[
    "cases"
]


def item(title: str, text: str = "", *, region: str | None = GLOBAL, n: int = 0) -> Signal:
    """A signal shaped like one the UN feeds produce: a title, an excerpt, region `global`."""
    return Signal(
        source_id=None,
        url=normalize_url(f"https://news.example.org/item/{n}"),
        fetched_at=NOW,
        published_at=NOW,
        lang="en",
        title=title,
        text=text,
        raw_hash=sha256_prefixed(title.encode()),
        geo=Geo(region=region, precision="region" if region else None),
    )


# -- the real batch ---------------------------------------------------------------------------


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_real_batch_is_sorted_into_queue_and_noise(case: dict[str, Any]) -> None:
    """Fixtures from the batch of issue #41: what must survive, and what must not."""
    score = default_table().assess(item(case["title"], case["text"]))
    assert score.relevant is (case["expect"] == "queued"), (
        f"{case['id']}: score {score.score} region={score.region} topics={score.topics}"
    )
    assert score.region == case["region"]
    assert score.borderline is bool(case.get("borderline", False))


def test_every_queued_fixture_gets_a_real_region_not_global() -> None:
    """Issue #42: an item about Syria must be `syria`, not `global`."""
    queued = [c for c in CASES if c["expect"] == "queued"]
    assert queued, "the fixture file must contain items that survive the filter"
    assert all(c["region"] not in (None, GLOBAL) for c in queued)


# -- how the score is built -------------------------------------------------------------------


def test_an_inflected_russian_place_name_still_names_its_region() -> None:
    """Russian declines its nouns: Сирия in the nominative is Сирию in the accusative. The table
    holds stems for exactly that reason, and a feed read in Russian is worth nothing without it."""
    r = default_table().assess(item("Переброска сил в Сирию", "Авиабаза приняла истребители"))
    assert r.region == "syria"
    assert r.relevant


def test_an_arabic_item_is_scored_like_any_other() -> None:
    r = default_table().assess(item("غارة جوية على إدلب", "نفذت طائرات حربية غارات جوية في شمال سوريا"))
    assert r.region == "syria"
    assert r.relevant


def test_russian_domestic_news_still_scores_nothing() -> None:
    """The point of the tables is to drop what is not ours, in every language they cover."""
    r = default_table().assess(item("Встреча с губернатором Тверской области", "Рабочая встреча"))
    assert not r.relevant


def test_region_alone_is_not_enough() -> None:
    score = default_table().assess(item("Yemen wedding traditions", "A report from Sanaa."))
    assert score.region == "gulf-red-sea" and score.region_score > 0
    assert score.topic_score == 0 and score.score == 0 and not score.relevant


def test_topic_alone_is_not_enough() -> None:
    score = default_table().assess(item("Naval exercise off Peru", "Two frigates took part."))
    assert score.topic_score > 0 and score.region is None
    assert score.score == 0 and not score.relevant


def test_a_title_match_outweighs_an_excerpt_match() -> None:
    table = default_table()
    in_title = table.assess(item("Airstrike reported in Syria", "Officials commented."))
    in_text = table.assess(item("Regional briefing", "An airstrike was reported in Syria."))
    assert in_title.score > in_text.score
    assert in_title.relevant and in_text.relevant


def test_the_feed_region_stands_in_when_the_text_names_none() -> None:
    table = default_table()
    unnamed = table.assess(
        item("Naval exercise announced", "The ministry gave no location.", region="aegean")
    )
    assert unnamed.region == "aegean" and unnamed.region_score == table.weights["feed_region"]
    assert unnamed.relevant


def test_the_text_overrides_the_feed_region() -> None:
    named = default_table().assess(
        item("Airstrike reported in Idlib", "The area is in Syria.", region="aegean")
    )
    assert named.region == "syria"


def test_global_is_never_a_relevance_signal() -> None:
    score = default_table().assess(item("Global arms exports rise", "A new report on procurement."))
    assert score.region is None and score.score == 0 and not score.relevant


def test_south_sudan_is_not_sudan() -> None:
    table = default_table()
    assert table.assess(item("Fighting in South Sudan", "Clashes were reported.")).region is None
    assert table.assess(item("Fighting in Sudan", "Clashes were reported.")).region == "gulf-red-sea"


# -- the uncertainty band ---------------------------------------------------------------------


def test_borderline_items_are_queued_with_a_marker_not_dropped() -> None:
    table = default_table()
    score = table.assess(item("Weekly bulletin", "The bulletin notes a coast guard vessel near Cyprus."))
    assert table.threshold - table.margin <= score.score < table.threshold
    assert score.relevant and score.borderline


def test_nothing_below_the_band_is_marked_borderline() -> None:
    score = default_table().assess(item("Back to school in Haiti", "Classrooms reopened."))
    assert not score.relevant and not score.borderline


# -- folding and prefix matching ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("first", "second"),
    [("İran", "iran"), ("IRAK", "ırak"), ("Kıbrıs", "kibris"), ("Türkiye", "turkiye"), ("Bakü", "baku")],
)
def test_fold_makes_turkish_and_english_spellings_one_term(first: str, second: str) -> None:
    assert fold(first) == fold(second)


@pytest.mark.parametrize(
    "title",
    [
        "Suriye'de hava saldırısı",
        "Suriye’de hava saldırıları",
        "SURİYE'DE HAVA SALDIRISI",
        "Airstrike in Syria",
    ],
)
def test_turkish_suffixes_and_case_do_not_hide_a_match(title: str) -> None:
    score = default_table().assess(item(title))
    assert score.region == "syria" and score.relevant


# -- the table is data, and it is validated -----------------------------------------------------


def _table(**overrides: Any) -> Table:
    document = {
        "schema": relevance.SCHEMA,
        "threshold": 0.5,
        "margin": 0.1,
        "weights": {"region": 0.5, "topic": 0.5, "title": 1.0, "text": 0.4, "feed_region": 0.5},
        "regions": {"syria": ["syria"]},
        "topics": {"kinetic.airstrike": ["airstrike"]},
    }
    document.update(overrides)
    return Table.from_mapping(document)


def test_a_contributor_can_extend_the_tables_without_touching_code() -> None:
    table = _table(regions={"syria": ["syria", "palmyra"]}, topics={"other": ["survey vessel"]})
    score = table.assess(item("Survey vessel reported off Palmyra"))
    assert score.region == "syria" and score.topics == ("other",) and score.relevant


@pytest.mark.parametrize(
    "overrides",
    [
        {"schema": "gt-relevance/999"},
        {"weights": {"region": 0.5}},
        {"weights": {"region": 0, "topic": 0.5, "title": 1.0, "text": 0.4, "feed_region": 0.5}},
        {"threshold": 2},
        {"margin": 0.9},
        {"regions": {}},
        {"regions": {"global": ["everything"]}},
        {"regions": {"syria": "syria"}},
        {"topics": {"kinetic.airstrike": []}},
        {"nonsense": 1},
    ],
)
def test_a_broken_table_is_an_error_not_a_silent_pass(overrides: dict[str, Any]) -> None:
    with pytest.raises(RelevanceError):
        _table(**overrides)


def test_the_packaged_table_loads_and_covers_the_watch_regions() -> None:
    table = default_table()
    # Every code in datasets/vocab/regions.yaml except `global`, which is the fallback.
    assert set(table.region_codes) == {
        "syria",
        "iraq",
        "iran",
        "levant",
        "caucasus",
        "aegean",
        "east-med",
        "cyprus",
        "black-sea",
        "libya-north-africa",
        "gulf-red-sea",
        "balkans",
        "central-asia",
    }


def test_min_relevance_override_keeps_the_tables() -> None:
    table = default_table().with_threshold(0.0)
    score = table.assess(item("Back to school in Haiti", "Classrooms reopened."))
    assert score.score == 0 and score.relevant  # nothing is filtered at threshold 0
    assert default_table().threshold == 0.5  # the cached table is unchanged


# -- the red lines the relevance filter must not touch ------------------------------------------


def test_relevance_cannot_rescue_anything_the_safety_filter_drops() -> None:
    """A highly relevant item with a position inside the geofence is still dropped.

    The safety filter and the geofence run first and know nothing about relevance; scoring well
    is not a way back in (handbook 02-red-lines, ADR 0013).
    """
    inside = Signal(
        source_id=None,
        url=normalize_url("https://news.example.org/item/geofenced"),
        fetched_at=NOW,
        published_at=NOW,
        lang="en",
        title="Naval exercise announced in the Aegean off Rhodes",
        text="A frigate took part, the ministry said.",
        raw_hash=sha256_prefixed(b"geofenced"),
        geo=Geo(region="aegean", lat=38.42, lon=27.14, precision="point"),  # Izmir
    )
    assert default_table().assess(inside).relevant
    filtered = safety.filter_signals([inside])
    assert filtered.kept == [] and filtered.dropped == 1
