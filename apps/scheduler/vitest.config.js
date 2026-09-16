import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The tests run inside workerd with the real wrangler.jsonc, so the configuration itself is under
// test too. No credential is needed: nothing here talks to Cloudflare or to GitHub.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
});
