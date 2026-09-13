-- signals database: raw collected items, 90-day retention.
--
-- Write budget (Cloudflare D1 free plan: 100,000 rows written per day, index updates count):
--   insert           = 1 table row + 2 index entries (content_hash UNIQUE, triage)  ≈ 3 writes
--   triage update    = 1 table row + 1 index entry (triage_status changes)          ≈ 2 writes
--   retention delete = 1 table row + 2 index entries                               ≈ 3 writes
--   => ~8 writes per signal over its life, i.e. roughly 12,000 new signals/day at most.
-- A duplicate insert (INSERT … ON CONFLICT(content_hash) DO NOTHING) writes nothing.
-- Keep indexes to the two below; every extra index costs one more write per insert and delete.
--
-- Timestamps are UTC ISO 8601 text, exactly 'YYYY-MM-DDTHH:MM:SSZ', so they sort as text.

CREATE TABLE signals (
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
  published_at  TEXT    CHECK (published_at IS NULL OR published_at GLOB
                  '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  fetched_at    TEXT    NOT NULL CHECK (fetched_at GLOB
                  '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  triage_status TEXT    NOT NULL DEFAULT 'pending'
                CHECK (triage_status IN ('pending', 'scored', 'duplicate', 'dropped', 'queued')),
  triage_score  REAL    CHECK (triage_score IS NULL OR (triage_score >= 0 AND triage_score <= 1)),
  triage_labels TEXT    CHECK (triage_labels IS NULL OR json_valid(triage_labels)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                CHECK (created_at GLOB
                  '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')
) STRICT;

-- One index serves both hot paths:
--   triage job:  WHERE triage_status = 'pending' ORDER BY created_at LIMIT n
--   retention:   WHERE triage_status IN ('pending','scored','duplicate','dropped','queued')
--                  AND created_at < :cutoff     (IN over all five statuses keeps it index-only;
--                                                delete in batches of a few hundred ids)
CREATE INDEX signals_triage_created ON signals (triage_status, created_at);
