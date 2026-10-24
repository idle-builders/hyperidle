# Mock-data policy

**TL;DR — No made-up data in production code.** Screens and the server show only what the system of record holds; when a value is missing they say so. Made-up data lives in tests, `__fixtures__/`, e2e specs and the demo world (`tools/setup/src/demo-world/`), which holds the story the app is shown and tested with.

This doc is the human statement of the policy. The machine copy — the closed sets the lint rules and inventory script enforce — lives in `tools/eslint-plugin-design/src/mock-data-policy.ts`, which embeds this doc's path in its error messages (`POLICY_DOC_URL`). **Do not move or rename this file without updating that constant.**

---

## What counts as mock data

A constant in source that **stands in for** data normally produced by a system of record — a DB row, an API response, an auth context, an agent-assignment service.

Three properties, all required:

1. Authored as a literal (`const`, object literal, array, record, or hardcoded string identity).
2. Substitutes for data the production runtime would otherwise fetch.
3. Reachable from a runtime production module (web bundle or server runtime).

If any of the three is missing, it's not mock data.

## What is not mock data

| Pattern | Why it's allowed |
|---|---|
| UI words and lookups (labels, a state-to-word map, the icon choices for a document) | Presentation vocabulary — no system-of-record alternative exists. |
| Algorithm tuning constants (weights, batch sizes, timeouts) | Config, not stand-ins. Numeric-literal initializers are exempt from the `DEFAULT_*` guard. |
| Seeding a database (`layers/core-api/src/bootstrap/factory-state.ts`, `tools/setup/src/demo-fixture.ts` and `tools/setup/src/demo-world/`) | Rows in a database are data, not code. The demo world is opt-in (`npm run setup -- --demo`), never on a normal boot path. |
| Test and fixture data | Never ships in the bundle. |
| Empty-state strings ("Nothing here yet", "—") | Render-time vocabulary, not data. |

## Permitted-mock surface (closed set)

Mock data is legal in files matching (`mock-data-policy.ts`):

- Path contains `/__fixtures__/`, `/__tests__/`, or `/__e2e__/`
- Suffix `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx`
- Basename starts with `seed`

The surface is decided by path alone. Adding a permitted location means editing `tools/eslint-plugin-design/src/mock-data-policy.ts`, which both the ESLint rules and the inventory script import.

## Hard rules

1. **No mock data in runtime production code.** Two checks enforce it:
   - `design/no-mock-data-import` + `design/no-mock-data-symbol`, at error in `eslint.config.ts`, on `layers/core-api/src/**`.
   - `tools/repo-gates/src/mock-inventory.ts`, which scans `layers/core-ui/src`, every `src/` under `layers/core-api`, `layers/agent-orchestration` and `layers/agent-execution`, and `applications/remote-server` and `applications/remote-worker`. It writes what it finds to `tools/repo-gates/mock-inventory/inventory.json`; `npm run mock-inventory:check` (in `npm run verify`) fails when that file no longer matches, so a new offender fails the build.
2. **Every surviving offender is listed** under [Tracked-out survivors](#tracked-out-survivors) with what it stands in for.
3. **No fabricated fallback.** `useFoo() ?? FALLBACK_FOO` is forbidden; the page shows an honest empty, loading or "did not load" state when the source is silent.

## Forbidden symbol-name prefixes (in runtime production code)

`MOCK_`, `FAKE_`, `STUB_`, `SAMPLE_`, `DUMMY_`, `PLACEHOLDER_`, `FALLBACK_`, `DEMO_`, `LEGACY_`, `EXAMPLE_`, `HARDCODED_` (`FORBIDDEN_PREFIXES`).

`DEFAULT_*` is forbidden only when the file path contains a data-provider fragment (`/fixtures/`, `/data/`, `/services/`, `/routes/`, `/layouts/`, `/pages/`) or the symbol name ends in `_DATA`, `_SETTINGS`, or `_ID` — numeric-literal initializers are exempt.

## Forbidden imports

A runtime file may not import from `/__fixtures__/` or `/fixtures/` (`FORBIDDEN_IMPORT_FRAGMENTS`). A production file may never import a development file at all — governance enforces that in general.

## Banned fictional names

`Nimmly` is a real, separate product — it must not appear anywhere in the HyperIdle codebase (code, tests, docs).

The fictional company for demo data is **`Northwind`** — the company of the demo world, whose teams are `demo-team-product` and `demo-team-support`. Use it in tests that need a believable team name and in the demo world. Any other clearly fictional placeholder (`ACME Corp`, `Test Team`) is fine too — as long as it is not `Nimmly`.

## Forbidden literal-id strings (in runtime production code)

The inventory script flags hardcoded identity strings used as stand-ins for the auth context: `"u-founder"`, `"agent-unassigned"`, `"founder@hyperidle.com"` (`LITERAL_ID_STRINGS`). Tests and e2e specs are exempt by path.

## Tracked-out survivors

The offenders the inventory carries deliberately. An offender in a file not listed here is a real failure.

**Server auth fallback** — `u-founder` in `layers/core-api/src/middleware/auth.ts`. The middleware substitutes the hardcoded user id when the database holds no `kind: "human"` row. First start (`POST /api/start`) makes that row with `edit_user` — and runs as the placeholder itself, since nobody exists yet — so after first start every request resolves a real person. It goes when `userId` turns nullable and answers 401 instead of substituting a fake identity.

## When you need made-up data

1. In a test: declare it inside the permitted surface.
2. To see a screen with real-looking content: add it to the demo world and run `npm run setup -- --demo`. The e2e tests run against the same world.
3. When the runtime has nothing to show: render the empty state, don't fabricate data.

## Checking locally

```bash
npm run mock-inventory        # regenerate tools/repo-gates/mock-inventory/inventory.json
npm run mock-inventory:check  # fails if the checked-in inventory is stale
```

Run the check before pushing; it also runs in `npm run verify`.

## Cross-references

- Machine copy of the closed sets: `tools/eslint-plugin-design/src/mock-data-policy.ts`
- Offender list: `tools/repo-gates/mock-inventory/inventory.json`
- Testing guide: [testing.md](testing.md)
