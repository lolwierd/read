# Repository Guidelines

## Project Structure & Module Organization

This pnpm monorepo centers on the active static dashboard in `apps/read`. Its React UI lives in `src/`, record-building utilities in `scripts/`, shared data transformations in `shared/`, public assets in `public/`, and deployment templates in `deploy/miso/`. Reusable KOReader parsing, schemas, time helpers, and rollups belong in `packages/core/src`; their tests live in `packages/core/test`.

`plugin/` contains KOReader Lua plugins, while `fixtures/` documents local test data. `apps/mcp`, `apps/web`, and `migrations/` are legacy Cloudflare/D1 code. Keep active features in `apps/read` and `packages/core` unless deliberately maintaining that experiment. Generated records, covers, device databases, and build outputs must stay untracked because they may contain private data.

## Build, Test, and Development Commands

Use Node 20+, Corepack, and the pnpm version pinned in `package.json`.

- `pnpm install`: install all workspace dependencies.
- `pnpm --filter @read/read dev`: run the dashboard on port 5184.
- `pnpm test`: run active core and dashboard tests.
- `pnpm typecheck`: type-check active packages with strict TypeScript rules.
- `pnpm build`: create the production dashboard bundle.
- `pnpm --filter @read/core test:cov`: run core tests with coverage thresholds.
- `pnpm --filter @read/read build:record`: compile the Linux ARM64 record builder.
- `pnpm legacy:check`: type-check the retained MCP and Svelte packages.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, semicolons, double quotes, trailing commas, and ES modules. Use `PascalCase` for React components and exported types, `camelCase` for functions and variables, and descriptive lowercase filenames for core modules. Tests use `*.test.ts`; SvelteKit route filenames follow framework conventions. No formatter or linter is configured, so preserve nearby formatting and rely on `typecheck` plus tests.

Keep parsing and rollup logic pure where practical. Shared domain behavior belongs in `packages/core`; display transformations belong in `apps/read/shared` or `src/lib`.

## Testing Guidelines

Core tests use Vitest; dashboard logic uses Bun's test runner. Add regression tests to the relevant suite and reuse `packages/core/test/fixtures.ts` when suitable. Core coverage requires 100% lines, functions, and statements, plus 95% branches. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before submitting.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Improve reading ledger and harden sync`. Keep each commit scoped to one coherent change. Pull requests should explain behavior and motivation, identify affected packages, report verification commands, and link relevant issues. Include before-and-after screenshots for visible dashboard changes. Never include real reading databases, WebDAV credentials, Calibre paths, or generated personal records.
