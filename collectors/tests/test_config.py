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
        assert f.country and f.name and f.notes
        # Nothing is switched on before a maintainer confirms terms and registers the source.
        assert f.enabled is False
        assert not f.secrets


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
