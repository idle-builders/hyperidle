# Mock-data policy

**TL;DR — No mock data in runtime production code.** Mock data is only legal in tests, stories, fixtures directories, e2e specs, and DB seed scripts. The lint guard fails CI when a runtime file declares or imports mock data, and a CI script regenerates the offender inventory on every commit.

---

## What counts as mock data

A constant in source that **stands in for** data normally produced by a system of record — a DB row, an API response, an auth context, an agent-assignment service.

Three properties, all required:

1. Authored as a literal (`const`, object literal, array, record, or hardcoded string identity).
2. Substitutes for data the production runtime would otherwise fetch.
3. Reachable from a runtime production module (web bundle or server runtime).

If any of the three is missing, it's not mock data. See "What is NOT mock data" below.

## What IS NOT mock data

| Pattern | Why it's allowed |
|---|---|
| UI vocabulary constants (`HEALTH_DOT`, `SCOPE_LABELS`, `TIME_24H_RE`, tab labels, color maps) | Presentation vocabulary — no system-of-record alternative exists. |
| Algorithm tuning constants (`DEFAULT_WEIGHTS`, `DEFAULT_RELEVANCE_WEIGHTS`, batch sizes) | Config — track separately under factory-settings work; not stand-ins. |
| DB seed scripts (`packages/db/src/seed.ts`, `seed-fixtures.js`) | Bootstrap the system of record itself. |
| Test / story / fixture data | Never ship in the bundle. |
| Empty-state UI strings (`"No bets yet"`, `"—"`) | Render-time vocabulary, not data. |

## Permitted-mock surface (closed set)

Mock data is legal in files matching:

- `**/__fixtures__/**`
- `**/__tests__/**`
- `**/*.test.{ts,tsx}`
- `**/*.spec.{ts,tsx}`
- `**/*.stories.tsx`
- `**/e2e/**`
- `**/seed*.{ts,js}` (DB bootstrap only)

Adding a new permitted location requires updating `plans/mock-data-purge/concept.md` first.

## Hard rules

1. **No mock data in runtime production code paths.** Enforced by `design/no-mock-data-import` + `design/no-mock-data-symbol` + the literal-id detector in `scripts/mock-inventory.ts`.
2. **Every mock instance has a replacement contract** — the API, table, or context it stands in for — recorded in `plans/mock-data-purge/contracts.md` (M2 output).
3. **Removing a mock removes its fallback.** The pattern `useFoo() ?? FALLBACK_FOO` is forbidden; the UI must render an honest empty / loading / error state when the source is silent.
4. **The guard is non-bypassable in CI.** Per-line `eslint-disable` requires a tracking issue id in the comment.
5. **The permitted-mock surface is verifiable by path alone** — no content inspection.
6. **The inventory is machine-generated.** `scripts/mock-inventory.ts` emits `plans/mock-data-purge/inventory.json` on every CI run; PRs that change the offender set must commit the regenerated inventory.

## Forbidden symbol-name prefixes (in runtime production code)

`MOCK_*`, `FAKE_*`, `STUB_*`, `SAMPLE_*`, `DUMMY_*`, `PLACEHOLDER_*`, `FALLBACK_*` (when the shape mirrors a real source), `DEMO_*`, `LEGACY_*`, `EXAMPLE_*`, `HARDCODED_*`. `DEFAULT_*` is forbidden when standing in for fetched data; allowed for theme / UI / density defaults (the lint rule's allowlist disambiguates).

## Banned fictional names

`Nimmly` is a real, separate product — it must not appear anywhere in the HyperIdle codebase (code, tests, stories, docs, mockups). The nimmly-guard script (`npm run nimmly-guard:check`) enforces this and runs in `npm run verify`.

The sanctioned fictional name for demo data is **`Acme`** (team id `demo-team-acme`, agents `demo-agent-*`). Use it for:
- Test fixtures and stories that need a believable team name
- Setup-cli demo mode (`--demo` flag)
- Design mockups needing realistic example content

Any other clearly-fictional placeholder (`ACME Corp`, `Test Team`, `Demo Co`) is fine too — as long as it is not `Nimmly`.

## Forbidden literal-id strings (in runtime production code)

The M1 inventory script also flags hardcoded identity strings used as stand-ins for the auth context: `"u-founder"`, `"agent-unassigned"`, `"founder@hyperidle.com"`, and any further entries the architect adds during M2. Tests / stories / e2e are exempt by path.

## When you legitimately need a mock

1. Tests / stories: import or declare freely inside the permitted surface.
2. Runtime needs a stable fallback URL or empty shape: render the empty state, don't fabricate data.
3. You're prototyping a new feature: keep the mock in `__fixtures__/` and inject via prop or context — never co-locate in the page.

## CI smoke-test

### Inventory generator

Run the inventory generator locally before pushing:

```bash
npm run scripts/mock-inventory.ts
```

The script exits non-zero (fails CI) if `inventory.json` differs from the checked-in version.

### Forbidden-string grep

Verify zero hits for forbidden prefixes and literal-id strings across runtime code
(excluding the permitted-mock surface):

```bash
rg "(MOCK_|FAKE_|STUB_|SAMPLE_|DUMMY_|PLACEHOLDER_|FALLBACK_|DEMO_|LEGACY_|EXAMPLE_|HARDCODED_)" \
  packages/web/src/ packages/server/src/ \
  --glob '!**/fixtures/**' \
  --glob '!**/__fixtures__/**' \
  --glob '!**/__tests__/**' \
  --glob '!**/*.test.{ts,tsx}' \
  --glob '!**/*.spec.{ts,tsx}' \
  --glob '!**/*.stories.tsx' \
  --glob '!**/e2e/**' \
  --glob '!**/seed*.{ts,js}' \
  -t ts --type-add 'ts:*.tsx' \
  --no-filename -c

rg '"(u-founder|agent-unassigned|founder@hyperidle\.com)"' \
  packages/web/src/ packages/server/src/ \
  --glob '!**/fixtures/**' \
  --glob '!**/__fixtures__/**' \
  --glob '!**/__tests__/**' \
  --glob '!**/*.test.{ts,tsx}' \
  --glob '!**/*.spec.{ts,tsx}' \
  --glob '!**/*.stories.tsx' \
  --glob '!**/e2e/**' \
  --glob '!**/seed*.{ts,js}' \
  -t ts --type-add 'ts:*.tsx' \
  -l
```

**Interpreting results:** Any match from the second command must be cross-referenced against
`plans/mock-data-purge/follow-ups.md`. The 3 server auth fallback rows (`middleware/auth.ts`,
`routes/auth.ts`, `lifecycle-propagation.ts`) are tracked-out with a remediation plan. A match
in a file NOT listed in `follow-ups.md` is a real failure and must be fixed before merging.

The first command (forbidden-prefix symbols) must return zero matches from runtime code. The
`fixtures/knowledge-data.ts` rows are in the `fixtures/` directory which the globs exclude.

## Cross-references

- Concept: `plans/mock-data-purge/concept.md`
- Track: `.pipeline/work-packages/TRACK-M.md`
- Existing precedent (fixtures import boundary): `eslint.config.js` block tagged "L16 AC-3"
- Testing guide: `docs/guides/developer/testing.md`
