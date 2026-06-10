// SvelteKit ambient types. The Cloudflare adapter injects `platform.env` (our D1).
import type { D1Database } from "@cloudflare/workers-types";

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
      };
    }
  }
}

export {};
