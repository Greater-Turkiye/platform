from __future__ import annotations

import copy

import pytest

from gt_collectors.config import ConfigError, load_feeds, parse_feeds
from tests.conftest import COLLECTORS_DIR

# datasets vocab/regions.yaml codes (2026-09-13)
REGION_CODES = {
    "syria", "iraq", "iran", "levant", "caucasus", "aegean", "east-med", "cyprus", "black-sea",
    "libya-north-africa", "gulf-red-sea", "balkans", "central-asia", "global",
}  # fmt: skip

VALID = {
    "feeds": [
        {
            "id": "rss-example",
            "kind": "rss",
            "url": "https://example.org/feed.xml",
            "cadence_minutes": 15,
            "lang": "en",
            "enabled": False,
        }
    ]
}


def test_repository_feeds_file_is_valid() -> None:
    feeds = load_feeds(COLLECTORS_DIR / "config" / "feeds.yaml")
    assert feeds, "feeds.yaml should list the confirmed feeds"
    for f in feeds:
        assert f.kind == "rss"
        assert f.cadence_minutes >= 15
        assert set(f.regions) <= REGION_CODES
        assert f.name and f.notes
        # country is ISO 3166-1 alpha-3, so international publishers (UN, IAEA) leave it unset.
        assert f.country is None or len(f.country) == 3
        # Nothing is sent to ingest before a maintainer confirms terms and registers the source.
        assert f.enabled is False
        assert not f.secrets
        # A feed only enters the human review queue with the source's terms on record.
        assert not f.queue or f.terms


def test_minimal_valid_config() -> None:
    (feed,) = parse_feeds(VALID)
    assert feed.id == "rss-example" and feed.regions == () and feed.source_id is None


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("cadence_minutes", 14),
        ("cadence_minutes", True),
        ("kind", "gdelt"),
        ("url", "ftp://example.org/feed"),
        ("id", "Bad Id"),
        ("lang", "english"),
        ("enabled", "yes"),
        ("source_id", "src_123"),
        ("country", "TR"),
        ("regions", "aegean"),
        ("secrets", ["lowercase"]),
        ("queue", "true"),
        ("surprise", 1),
    ],
)
def test_invalid_values(key: str, value: object) -> None:
    doc = copy.deepcopy(VALID)
    doc["feeds"][0][key] = value
    with pytest.raises(ConfigError):
        parse_feeds(doc)


def test_missing_key_and_duplicates() -> None:
    doc = copy.deepcopy(VALID)
    del doc["feeds"][0]["url"]
    with pytest.raises(ConfigError, match="missing"):
        parse_feeds(doc)
    doc = copy.deepcopy(VALID)
    doc["feeds"].append(copy.deepcopy(doc["feeds"][0]))
    with pytest.raises(ConfigError, match="duplicate"):
        parse_feeds(doc)
    with pytest.raises(ConfigError):
        parse_feeds({"feeds": [], "extra": 1})
    with pytest.raises(ConfigError):
        parse_feeds(["not", "a", "mapping"])


def test_queue_requires_recorded_terms() -> None:
    doc = copy.deepcopy(VALID)
    doc["feeds"][0]["queue"] = True
    with pytest.raises(ConfigError, match="terms"):
        parse_feeds(doc)
    doc["feeds"][0]["terms"] = "https://example.org/copyright"
    (feed,) = parse_feeds(doc)
    assert feed.queue is True and feed.enabled is False  # the two gates are independent


def test_queue_defaults_to_false() -> None:
    (feed,) = parse_feeds(VALID)
    assert feed.queue is False



from gt_collectors import config as _cfg


def _queue_feed(**extra):
    raw = {"id": "rss-x", "kind": "rss", "url": "https://example.org/feed", "cadence_minutes": 60,
           "lang": "en", "enabled": False, "queue": True, "terms": "https://example.org/terms"}
    raw.update(extra)
    return raw


def test_a_source_graded_below_the_floor_cannot_be_queued() -> None:
    # The blacklist: a grade with a reason in the source record, and a gate that reads it.
    for grade in ("E", "F"):
        with pytest.raises(ConfigError, match="below the queue floor"):
            _cfg._feed(_queue_feed(reliability=grade), "feeds[0]")


def test_the_floor_itself_is_allowed_and_carried() -> None:
    feed = _cfg._feed(_queue_feed(reliability="D"), "feeds[0]")
    assert feed.reliability == "D"


def test_an_ungraded_queue_feed_still_loads() -> None:
    assert _cfg._feed(_queue_feed(), "feeds[0]").reliability is None


def test_reliability_must_be_an_admiralty_grade() -> None:
    with pytest.raises(ConfigError, match="Admiralty"):
        _cfg._feed(_queue_feed(reliability="G"), "feeds[0]")
