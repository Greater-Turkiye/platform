-- ops: rebuild the tables whose timestamp CHECKs D1 cannot evaluate.
--
-- Same defect and same fix as `signals` 0002. Every timestamp in 0001 was checked with one
-- 14-class GLOB pattern ('[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z').
-- Local SQLite evaluates it; D1 refuses any LIKE/GLOB pattern with more than about ten wildcards
-- or character classes, on every INSERT rather than at CREATE TABLE:
--
--   INSERT INTO reviews … -> LIKE or GLOB pattern too complex: SQLITE_ERROR [code: 7500]
--
-- so `reviewers`, `reviews`, `drafts`, `publications` and `usage_ledger` could not take a single
-- row remotely — the review bot's queue could never be filled. The rule is written here as the
-- length plus two shorter patterns (8 and 6 classes) over the two halves of the timestamp:
-- the accepted and rejected values are exactly the ones 0001 intended.
--
-- `usage_ledger.day` (8 classes) and `collector_state` (no timestamp CHECK) are already fine, so
-- `collector_state` is not touched at all.
--
-- SQLite cannot alter a CHECK, so the five tables are rebuilt. Columns, types, defaults, STRICT
-- and WITHOUT ROWID, every UNIQUE key, every foreign key and both indexes are unchanged, and the
-- existing rows are copied. The order below is what makes it safe while foreign keys stay on (D1
-- enforces them, and a migration file here may not switch them off):
--
--   1. create the new tables, referencing each other, so the new graph is closed;
--   2. copy parents before children, so every reference exists when a row is inserted;
--   3. drop children before parents, so no drop deletes a row another table still points at;
--   4. rename: SQLite rewrites the '…_v2' references in the other tables as each one is renamed;
--   5. recreate the two indexes, which were dropped with their tables.
--
-- Write budget: the copy rewrites every row once (both databases were empty when this was
-- applied, so it cost nothing in practice).

CREATE TABLE reviewers_v2 (
  id               INTEGER PRIMARY KEY,
  github_login     TEXT    UNIQUE CHECK (github_login IS NULL OR length(github_login) BETWEEN 1 AND 39),
  telegram_user_id INTEGER NOT NULL UNIQUE CHECK (telegram_user_id > 0),
  role             TEXT    NOT NULL DEFAULT 'reviewer' CHECK (role IN ('reviewer', 'maintainer')),
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  added_by         INTEGER REFERENCES reviewers_v2 (id),
  added_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                   CHECK (length(added_at) = 20
                          AND substr(added_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                          AND substr(added_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')
) STRICT;

CREATE TABLE reviews_v2 (
  id                  INTEGER PRIMARY KEY,
  content_hash        TEXT    NOT NULL UNIQUE   -- one review per signal; replays are idempotent
                      CHECK (length(content_hash) = 71 AND content_hash GLOB 'sha256:*'),
  status              TEXT    NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'dismissed', 'drafted', 'bulletined', 'redline')),
  summary_tr          TEXT    CHECK (summary_tr IS NULL OR length(summary_tr) <= 2000),
  summary_en          TEXT    CHECK (summary_en IS NULL OR length(summary_en) <= 2000),
  telegram_message_id INTEGER,
  decided_by          INTEGER REFERENCES reviewers_v2 (id),
  decided_at          TEXT    CHECK (decided_at IS NULL OR (
                        length(decided_at) = 20
                        AND substr(decided_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                        AND substr(decided_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')),
  note                TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                      CHECK (length(created_at) = 20
                             AND substr(created_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                             AND substr(created_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  -- every decision records who made it and when
  CHECK (status = 'queued' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
) STRICT;

CREATE TABLE drafts_v2 (
  id          INTEGER PRIMARY KEY,
  review_id   INTEGER NOT NULL REFERENCES reviews_v2 (id),
  kind        TEXT    NOT NULL CHECK (kind IN ('event', 'actor', 'site', 'equipment', 'source')),
  record_id   TEXT    CHECK (record_id IS NULL OR (length(record_id) = 30 AND (
                        record_id GLOB 'evt_*' OR record_id GLOB 'act_*' OR record_id GLOB 'sit_*'
                        OR record_id GLOB 'eqp_*' OR record_id GLOB 'src_*'))),
  branch      TEXT,
  pr_number   INTEGER UNIQUE CHECK (pr_number IS NULL OR pr_number > 0),  -- webhook lookup
  pr_url      TEXT    CHECK (pr_url IS NULL OR pr_url GLOB 'https://github.com/*'),
  promoted_by INTEGER NOT NULL REFERENCES reviewers_v2 (id),
  state       TEXT    NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'merged', 'closed')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
              CHECK (length(created_at) = 20
                     AND substr(created_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                     AND substr(created_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
              CHECK (length(updated_at) = 20
                     AND substr(updated_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                     AND substr(updated_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')
) STRICT;

CREATE TABLE publications_v2 (
  id                      INTEGER PRIMARY KEY,
  type                    TEXT    NOT NULL CHECK (type IN ('bulletin', 'record', 'correction')),
  record_id               TEXT    CHECK (record_id IS NULL OR (length(record_id) = 30 AND record_id GLOB 'evt_*')),
  review_id               INTEGER REFERENCES reviews_v2 (id),
  channel                 TEXT    NOT NULL
                          CHECK (length(channel) BETWEEN 2 AND 32 AND channel NOT GLOB '*[^a-z0-9-]*'),
  lang                    TEXT    NOT NULL CHECK (lang IN ('tr', 'en')),
  status                  TEXT    NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued', 'held', 'posted', 'failed', 'deleted')),
  text                    TEXT    NOT NULL,
  external_id             TEXT,
  external_url            TEXT    CHECK (external_url IS NULL OR external_url GLOB 'https://*'),
  corrects_publication_id INTEGER REFERENCES publications_v2 (id),
  idempotency_key         TEXT    NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  approved_by             TEXT    NOT NULL,   -- reviewer handle from the queue message
  posted_at               TEXT    CHECK (posted_at IS NULL OR (
                            length(posted_at) = 20
                            AND substr(posted_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                            AND substr(posted_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z')),
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                          CHECK (length(created_at) = 20
                                 AND substr(created_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                                 AND substr(created_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  -- One queue message fans out to one row per channel; replaying it never double-posts.
  UNIQUE (idempotency_key, channel),
  CHECK (type <> 'record' OR record_id IS NOT NULL),
  CHECK (type <> 'correction' OR corrects_publication_id IS NOT NULL),
  CHECK (status <> 'posted' OR posted_at IS NOT NULL)
) STRICT;

CREATE TABLE usage_ledger_v2 (
  day         TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  service     TEXT    NOT NULL CHECK (length(service) BETWEEN 2 AND 32 AND service NOT GLOB '*[^a-z0-9-]*'),
  units       INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  daily_limit INTEGER CHECK (daily_limit IS NULL OR daily_limit > 0),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
              CHECK (length(updated_at) = 20
                     AND substr(updated_at, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T'
                     AND substr(updated_at, 12) GLOB '[0-2][0-9]:[0-5][0-9]:[0-6][0-9]Z'),
  PRIMARY KEY (day, service)
) STRICT, WITHOUT ROWID;

-- Parents before children. `reviewers.added_by` points at another reviewer, so the copy goes in
-- id order: a reviewer is always added by somebody who was added before them.
INSERT INTO reviewers_v2 (id, github_login, telegram_user_id, role, active, added_by, added_at)
SELECT id, github_login, telegram_user_id, role, active, added_by, added_at
FROM reviewers ORDER BY id;

INSERT INTO reviews_v2 (id, content_hash, status, summary_tr, summary_en, telegram_message_id,
                        decided_by, decided_at, note, created_at)
SELECT id, content_hash, status, summary_tr, summary_en, telegram_message_id,
       decided_by, decided_at, note, created_at
FROM reviews ORDER BY id;

INSERT INTO drafts_v2 (id, review_id, kind, record_id, branch, pr_number, pr_url, promoted_by,
                       state, created_at, updated_at)
SELECT id, review_id, kind, record_id, branch, pr_number, pr_url, promoted_by,
       state, created_at, updated_at
FROM drafts ORDER BY id;

-- `corrects_publication_id` points at an earlier publication, so id order is safe here too.
INSERT INTO publications_v2 (id, type, record_id, review_id, channel, lang, status, text,
                             external_id, external_url, corrects_publication_id, idempotency_key,
                             approved_by, posted_at, created_at)
SELECT id, type, record_id, review_id, channel, lang, status, text,
       external_id, external_url, corrects_publication_id, idempotency_key,
       approved_by, posted_at, created_at
FROM publications ORDER BY id;

INSERT INTO usage_ledger_v2 (day, service, units, daily_limit, updated_at)
SELECT day, service, units, daily_limit, updated_at FROM usage_ledger;

DROP TABLE publications;
DROP TABLE drafts;
DROP TABLE reviews;
DROP TABLE reviewers;
DROP TABLE usage_ledger;

ALTER TABLE reviewers_v2 RENAME TO reviewers;
ALTER TABLE reviews_v2 RENAME TO reviews;
ALTER TABLE drafts_v2 RENAME TO drafts;
ALTER TABLE publications_v2 RENAME TO publications;
ALTER TABLE usage_ledger_v2 RENAME TO usage_ledger;

-- Unchanged from 0001 (dropped with the old tables, recreated here):
--   /queue and the bot list pending items oldest first
CREATE INDEX reviews_status_created ON reviews (status, created_at);
--   rate limits count posts per channel by time
CREATE INDEX publications_channel_posted ON publications (channel, posted_at);
