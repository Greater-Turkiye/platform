import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The tests run inside workerd with the real wrangler.jsonc, so the configuration itself is under
// test too, and against **real local D1 databases** built from `db/migrations`: an insert that the
// schema would reject fails the test rather than passing a fake. Nothing here talks to Cloudflare
// or to GitHub — the local D1 is Miniflare's, and `fetch` is injected in the tests — so there is
// no credential in this directory, which is the same claim the deployed Worker makes.
const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = (name) => readD1Migrations(path.join(here, "..", "..", "db", "migrations", name));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          SIGNALS_MIGRATIONS: await migrations("signals"),
          OPS_MIGRATIONS: await migrations("ops"),
        },
      },
    })),
  ],
  test: { setupFiles: ["./test/apply-migrations.js"] },
});
