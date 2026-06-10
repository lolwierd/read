/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      OAUTH_KV: KVNamespace;
      TEST_MIGRATIONS: D1Migration[];
      INGEST_TOKEN: string;
      ALLOWED_EMAIL: string;
    }
  }
}
