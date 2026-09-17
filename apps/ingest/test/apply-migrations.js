// Build both local test databases from db/migrations before any test runs, so every INSERT in
// these tests is checked by the real schema: the STRICT column types, the UNIQUE `content_hash`,
// the enums and the timestamp CHECKs. The migrations are read in vitest.config.js (Node side) and
// handed to the runtime as bindings; nothing here reads a file or reaches a network.
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.SIGNALS_DB, env.SIGNALS_MIGRATIONS);
await applyD1Migrations(env.OPS_DB, env.OPS_MIGRATIONS);
