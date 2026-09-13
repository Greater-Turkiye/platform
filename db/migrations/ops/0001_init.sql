-- ops database: review queue, drafts, publications, usage ledger, reviewers, collector state.
--
-- D1 cannot JOIN across databases, so reviews reference signals by content_hash (no FK).
-- Volumes here are small (hundreds of rows/day at most), so a few lookup indexes are
-- affordable; the two hot-update tables (usage_ledger, collector_state) are WITHOUT ROWID so
-- their primary key is the table itself and an upsert costs one row write, not two.
-- The reviewers table holds no real names or contact details.
-- Timestamps are UTC ISO 8601 text, exactly 'YYYY-MM-DDTHH:MM:SSZ'.

CREATE TABLE reviewers (
  id               INTEGER PRIMARY KEY,
  github_login     TEXT    UNIQUE CHECK (github_login IS NULL OR length(github_login) BETWEEN 1 AND 39),
  telegram_user_id INTEGER NOT NULL UNIQUE CHECK (telegram_user_id > 0),
  role             TEXT    NOT NULL DEFAULT 'reviewer' CHECK (role IN ('reviewer', 'maintainer')),
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  added_by         INTEGER REFERENCES reviewers (id),
  added_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                   CHECK (added_at GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')
) STRICT;

CREATE TABLE reviews (
  id                  INTEGER PRIMARY KEY,
  content_hash        TEXT    NOT NULL UNIQUE   -- one review per signal; replays are idempotent
                      CHECK (length(content_hash) = 71 AND content_hash GLOB 'sha256:*'),
  status              TEXT    NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'dismissed', 'drafted', 'bulletined', 'redline')),
  summary_tr          TEXT    CHECK (summary_tr IS NULL OR length(summary_tr) <= 2000),
  summary_en          TEXT    CHECK (summary_en IS NULL OR length(summary_en) <= 2000),
  telegram_message_id INTEGER,
  decided_by          INTEGER REFERENCES reviewers (id),
  decided_at          TEXT    CHECK (decided_at IS NULL OR decided_at GLOB
                        '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  note                TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                      CHECK (created_at GLOB
                        '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  -- every decision records who made it and when
  CHECK (status = 'queued' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
) STRICT;

-- /queue and the bot list pending items oldest first.
CREATE INDEX reviews_status_created ON reviews (status, created_at);

CREATE TABLE drafts (
  id          INTEGER PRIMARY KEY,
  review_id   INTEGER NOT NULL REFERENCES reviews (id),
  kind        TEXT    NOT NULL CHECK (kind IN ('event', 'actor', 'site', 'equipment', 'source')),
  record_id   TEXT    CHECK (record_id IS NULL OR (length(record_id) = 30 AND (
                        record_id GLOB 'evt_*' OR record_id GLOB 'act_*' OR record_id GLOB 'sit_*'
                        OR record_id GLOB 'eqp_*' OR record_id GLOB 'src_*'))),
  branch      TEXT,
  pr_number   INTEGER UNIQUE CHECK (pr_number IS NULL OR pr_number > 0),  -- webhook lookup
  pr_url      TEXT    CHECK (pr_url IS NULL OR pr_url GLOB 'https://github.com/*'),
  promoted_by INTEGER NOT NULL REFERENCES reviewers (id),
  state       TEXT    NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'merged', 'closed')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
              CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
              CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')
) STRICT;

CREATE TABLE publications (
  id                      INTEGER PRIMARY KEY,
  type                    TEXT    NOT NULL CHECK (type IN ('bulletin', 'record', 'correction')),
  record_id               TEXT    CHECK (record_id IS NULL OR (length(record_id) = 30 AND record_id GLOB 'evt_*')),
  review_id               INTEGER REFERENCES reviews (id),
  channel                 TEXT    NOT NULL
                          CHECK (length(channel) BETWEEN 2 AND 32 AND channel NOT GLOB '*[^a-z0-9-]*'),
  lang                    TEXT    NOT NULL CHECK (lang IN ('tr', 'en')),
  status                  TEXT    NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued', 'held', 'posted', 'failed', 'deleted')),
  text                    TEXT    NOT NULL,
  external_id             TEXT,
  external_url            TEXT    CHECK (external_url IS NULL OR external_url GLOB 'https://*'),
  corrects_publication_id INTEGER REFERENCES publications (id),
  idempotency_key         TEXT    NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  approved_by             TEXT    NOT NULL,   -- reviewer handle from the queue message
  posted_at               TEXT    CHECK (posted_at IS NULL OR posted_at GLOB
                            '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                          CHECK (created_at GLOB
                            '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  -- One queue message fans out to one row per channel; replaying it never double-posts.
  UNIQUE (idempotency_key, channel),
  CHECK (type <> 'record' OR record_id IS NOT NULL),
  CHECK (type <> 'correction' OR corrects_publication_id IS NOT NULL),
  CHECK (status <> 'posted' OR posted_at IS NOT NULL)
) STRICT;

-- Rate limits (≤4/hour, ≤30/day per channel) count posts per channel by time.
CREATE INDEX publications_channel_posted ON publications (channel, posted_at);

CREATE TABLE usage_ledger (
  day         TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  service     TEXT    NOT NULL CHECK (length(service) BETWEEN 2 AND 32 AND service NOT GLOB '*[^a-z0-9-]*'),
  units       INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  daily_limit INTEGER CHECK (daily_limit IS NULL OR daily_limit > 0),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
              CHECK (updated_at GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  PRIMARY KEY (day, service)
) STRICT, WITHOUT ROWID;

CREATE TABLE collector_state (
  collector_id         TEXT    PRIMARY KEY CHECK (length(collector_id) BETWEEN 3 AND 64),
  enabled              INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  last_run_at          TEXT,
  last_success_at      TEXT,
  next_due_at          TEXT,
  cursor               TEXT,     -- ETag / Last-Modified / last id
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error           TEXT    CHECK (last_error IS NULL OR length(last_error) <= 1000)
) STRICT, WITHOUT ROWID;
