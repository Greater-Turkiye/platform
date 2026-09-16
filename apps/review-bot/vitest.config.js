import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The tests run inside workerd with the real wrangler.jsonc, so the configuration is under test
// too. They never reach Cloudflare or api.telegram.org: D1 is a plain in-memory stand-in
// (test/helpers.js) and the Telegram API is a recorded fake, so no credential exists here.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
});
