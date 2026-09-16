-- signals: rebuild the table with timestamp CHECKs that D1 can actually evaluate.
--
-- 0001 checked each timestamp with one 14-class GLOB pattern
-- ('[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'). Local SQLite
-- evaluates it, but D1 refuses any LIKE/GLOB pattern with more than about ten wildcards or
-- character classes, so every remote insert failed on the fetched_at and created_at checks:
--
--   INSERT INTO signals … -> LIKE or GLOB pattern too complex: SQLITE_ERROR [code: 7500]
--
-- In other words no row could ever be written to the remote database. The same rule is written
-- here as the length plus two shorter patterns (8 and 6 classes) over the two halves of the
-- timestamp: the set of accepted and rejected values is exactly the one 0001 intended.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt. Columns, types, defaults, the
-- UNIQUE key, the STRICT mode and the single index are unchanged, and existing rows are copied.
-- Write budget: the copy rewrites every row once (the table was empty when this was applied).
--
-- The `ops` tables carry the same over-long pattern in their own timestamp checks and need the
-- same treatment; that is a separate migration, because no collector writes to `ops` yet.

CREATE TABLE signals_v2 (
  id            INTEGER PRIMARY KEY,
  content_hash  TEXT    NOT NULL UNIQUE
                CHECK (length(content_hash) = 71 AND content_hash GLOB 'sha256:*'
                       AND substr(content_hash, 8) NOT GLOB '*[^0-9a-f]*'),
  simhash       INTEGER,                         -- 64-bit SimHash stored as signed int64
  raw_hash      TEXT
                CHECK (raw_hash IS NULL OR (length(raw_hash) = 71 AND raw_hash GLOB 'sha256:*')),
  source_id     TEXT
                CHECK (source_id IS NULL OR (length(source_id) = 30 AND source_id GLOB 'src_*')),
  collector_id  TEXT    NOT NULL CHECK (length(collector_id) BETWEEN 3 AND 64),
  url           TEXT    NOT NULL CHECK (url GLOB 'https://?*' OR url GLOB 'http://?*'),
  lang          TEXT    CHECK (lang IS NULL OR length(lang) BETWEEN 2 AND 35),
  title         TEXT    CHECK (title IS NULL OR length(title) <= 300),
  text          TEXT    CHECK (text IS NULL OR length(text) <= 1000),  -- excerpt, never full text
  region        TEXT,                            -- datasets vocab/regions.yaml code
  geo_json      TEXT    CHECK (geo_json IS NULL OR json_valid(geo_json)),
  published_at  TEXT    CHECK (published_at IS NULL OR (
                  length(published_at) = 20
                  AND substr(published_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                  AND substr(published_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')),
  fetched_at    TEXT    NOT NULL CHECK (
                  length(fetched_at) = 20
                  AND substr(fetched_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                  AND substr(fetched_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  triage_status TEXT    NOT NULL DEFAULT 'pending'
                CHECK (triage_status IN ('pending', 'scored', 'duplicate', 'dropped', 'queued')),
  triage_score  REAL    CHECK (triage_score IS NULL OR (triage_score >= 0 AND triage_score <= 1)),
  triage_labels TEXT    CHECK (triage_labels IS NULL OR json_valid(triage_labels)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                CHECK (
                  length(created_at) = 20
                  AND substr(created_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                  AND substr(created_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')
) STRICT;

INSERT INTO signals_v2 (id, content_hash, simhash, raw_hash, source_id, collector_id, url, lang,
                        title, text, region, geo_json, published_at, fetched_at, triage_status,
                        triage_score, triage_labels, created_at)
SELECT id, content_hash, simhash, raw_hash, source_id, collector_id, url, lang,
       title, text, region, geo_json, published_at, fetched_at, triage_status,
       triage_score, triage_labels, created_at
FROM signals;

DROP TABLE signals;

ALTER TABLE signals_v2 RENAME TO signals;

-- Unchanged from 0001 (dropped with the old table, recreated here):
--   triage job:  WHERE triage_status = 'pending' ORDER BY created_at LIMIT n
--   retention:   WHERE triage_status IN (…) AND created_at < :cutoff
CREATE INDEX signals_triage_created ON signals (triage_status, created_at);
