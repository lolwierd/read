import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));
const migrations = await readD1Migrations(migrationsDir);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // wrangler.toml provides the DB + OAUTH_KV bindings; add test-only values here.
        bindings: { TEST_MIGRATIONS: migrations, INGEST_TOKEN: "test-token", ALLOWED_EMAIL: "owner@example.com" },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
