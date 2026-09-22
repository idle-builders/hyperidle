# Mock-data policy

**TL;DR — No mock data in runtime production code.** Mock data is only legal in tests, stories, fixtures directories, e2e specs, and DB seed scripts. Lint guards fail the build when a runtime file declares or imports mock data, and `npm run mock-inventory:check` (in the verify chain) fails when the offender inventory is stale.

This doc is the canonical human statement of the policy. The machine copy — the closed sets the lint rules and inventory script actually enforce — lives in `tools/eslint-plugin-design/src/mock-data-policy.ts`, which names this doc and embeds its path in lint error messages (`POLICY_DOC_URL`, mock-data-policy.ts:93). **Do not move or rename this file without updating that constant.**

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
| Algorithm tuning constants (`DEFAULT_WEIGHTS`, `DEFAULT_RELEVANCE_WEIGHTS`, batch sizes) | Config, not stand-ins. Numeric-literal initializers are exempt from the `DEFAULT_*` guard. |
| DB seed scripts (`layers/core-api/src/bootstrap/factory-state.ts`, `tools/setup/src/demo-fixture.ts`) | Bootstrap the system of record itself. |
| Test / story / fixture data | Never ships in the bundle. |
| Empty-state UI strings (`"No tasks yet"`, `"—"`) | Render-time vocabulary, not data. |

## Permitted-mock surface (closed set)

Mock data is legal in files matching (`mock-data-policy.ts:62-80`):

- Path contains `/__fixtures__/`, `/__tests__/`, or `/__e2e__/`
- Suffix `.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`, or `.stories.tsx`
- Basename starts with `seed` (DB bootstrap only)

The surface is verifiable by path alone — no content inspection. Adding a new permitted location means editing `tools/eslint-plugin-design/src/mock-data-policy.ts`, the single source of truth both the ESLint rules and the inventory script import from.

## Hard rules

1. **No mock data in runtime production code paths.** Enforced by `design/no-mock-data-import` + `design/no-mock-data-symbol` (error-level in `eslint.config.ts`) and the literal-id detector in `tools/repo-gates/src/mock-inventory.ts`.
2. **Every surviving mock instance is tracked with its remediation plan** under [Tracked-out survivors](#tracked-out-survivors) below — the API, table, or context it stands in for.
3. **Removing a mock removes its fallback.** The pattern `useFoo() ?? FALLBACK_FOO` is forbidden; the UI must render an honest empty / loading / error state when the source is silent.
4. **The guard is non-bypassable.** Per-line `eslint-disable` for these rules requires a tracking issue id in the comment (enforced by the meta-test in `tools/eslint-plugin-design/src/__tests__/eslint-disable-meta.test.ts`).
5. **The inventory is machine-generated.** `tools/repo-gates/src/mock-inventory.ts` emits `tools/repo-gates/mock-inventory/inventory.json`; `npm run mock-inventory:check` (in `npm run verify`) exits non-zero when it's stale. PRs that change the offender set must commit the regenerated inventory.

## Forbidden symbol-name prefixes (in runtime production code)

`MOCK_`, `FAKE_`, `STUB_`, `SAMPLE_`, `DUMMY_`, `PLACEHOLDER_`, `FALLBACK_`, `DEMO_`, `LEGACY_`, `EXAMPLE_`, `HARDCODED_` (`FORBIDDEN_PREFIXES`, mock-data-policy.ts:10-22).

`DEFAULT_*` is conditionally forbidden: the guard fires when the file path contains a data-provider fragment (`/fixtures/`, `/data/`, `/services/`, `/routes/`, `/layouts/`, `/pages/`) or the symbol name ends in `_DATA`, `_SETTINGS`, or `_ID` — numeric-literal initializers are exempt. Theme and UI presentation defaults are allowed.

## Banned fictional names

`Nimmly` is a real, separate product — it must not appear anywhere in the HyperIdle codebase (code, tests, stories, docs, mockups).

The sanctioned fictional name for demo data is **`Acme`** (team id `demo-team-acme`, agents `demo-agent-*`). Use it for:

- Test fixtures and stories that need a believable team name
- Setup-cli demo mode (`--demo` flag) — seeds the lived-in six-week Acme world (tasks, threads/reviews, knowledge, sessions, routines) into a fresh database; opt-in only, never on a normal boot path
- Design mockups needing realistic example content

Any other clearly-fictional placeholder (`ACME Corp`, `Test Team`, `Demo Co`) is fine too — as long as it is not `Nimmly`.

## Forbidden literal-id strings (in runtime production code)

The inventory script flags hardcoded identity strings used as stand-ins for the auth context: `"u-founder"`, `"agent-unassigned"`, `"founder@hyperidle.com"` (`LITERAL_ID_STRINGS`, mock-data-policy.ts:83-87). Tests / stories / e2e are exempt by path. Known tracked-out survivors (the server auth fallbacks) are listed with remediation plans under [Tracked-out survivors](#tracked-out-survivors) — an offender in a file not listed there is a real failure.

## Tracked-out survivors

The offenders the inventory carries deliberately. An offender in a file not listed here is a real failure.

**Server auth fallback** — `u-founder` in `layers/core-api/src/middleware/auth.ts`, `layers/core-api/src/routes/auth.ts` and `layers/core-api/policy/src/lifecycle-propagation.ts`. The middleware substitutes the hardcoded user id when the database holds no `kind: "human"` row, and the auth route does the same when the session context carries no resolved user id. Onboarding now inserts that row (`layers/core-api/src/routes/users.ts`), so the fallback is reachable only against a database nobody set up. It goes when `userId` turns nullable and answers 401 instead of substituting a fake identity.

## When you legitimately need a mock

1. Tests / stories: import or declare freely inside the permitted surface.
2. Runtime needs a stable fallback URL or empty shape: render the empty state, don't fabricate data.
3. You're prototyping a new feature: keep the mock in `__fixtures__/` and inject via prop or context — never co-locate in the page. Runtime imports from `/__fixtures__/` or `/fixtures/` are blocked (`FORBIDDEN_IMPORT_FRAGMENTS`, mock-data-policy.ts:90).

## Checking locally

```bash
npm run mock-inventory        # regenerate tools/repo-gates/mock-inventory/inventory.json
npm run mock-inventory:check  # fails if the checked-in inventory is stale
```

Run the check before pushing; it also runs in `npm run verify`.

## Cross-references

- Machine copy of the closed sets: `tools/eslint-plugin-design/src/mock-data-policy.ts`
- Offender tracking: [Tracked-out survivors](#tracked-out-survivors), `tools/repo-gates/mock-inventory/inventory.json`
- Fixtures import boundary precedent: `eslint.config.ts` block tagged "L16 AC-3"
- Testing guide: [testing.md](testing.md)
