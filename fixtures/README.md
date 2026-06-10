# Fixtures

Synthetic fixtures live in code (`packages/core/test/fixtures.ts`). To validate the
parsers and the plugin contract against reality, drop **real** Kobo files here — this
folder (`fixtures/real/`) is gitignored.

Copy from the Kobo over USB:

- `koreader/settings/statistics.sqlite3`  →  `fixtures/real/statistics.sqlite3`
- one or two `<book>.sdr/metadata.epub.lua`  →  `fixtures/real/<name>.metadata.lua`

(On a Kobo the KOReader root is `.adds/koreader/`.)

The agent can't read the device directly (macOS TCC blocks USB access), so this hand-off
is how real data reaches the parser tests.
