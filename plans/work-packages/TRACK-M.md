# Track M: Mock-Data Purge (pre-rollout)

This track removes every instance of mock data from the runtime production code paths and lands a structural lint guard that prevents reintroduction. It exists because the application is being prepared for the first user rollout; the L29 final sweep depends on 22 other L-stories and cannot run yet.

**Concept (locked):** `plans/mock-data-purge/concept.md`. Every workpackage in this track reads the concept first; the concept defines what counts as mock data, the closed permitted-mock surface, and the seven hard rules the migration honors.

**Ground truth:** `docs/guides/developer/mock-data-policy.md`.

**Track shape (founder-locked):**

The track is intentionally structured so the **architect is invoked ONCE**, only on the rows that need a new contract. Everything else is mechanical refactoring done in parallel by builders. The linter is the source of truth — the inventory is auto-generated from a CI-friendly script, never hand-curated, so it cannot rot.

```
┌────────────────────┐
│ M1                 │  Linter + auto-inventory script. CI emits the offender list.
│ Mock guard +       │  Each row annotated: straight-swap | needs-contract | borderline.
│ inventory generator│
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ M2                 │  Architect, ONCE. Pins the replacement contracts for the
│ Replacement        │  needs-contract rows: auth/identity, /api/settings, /api/rail,
│ contracts          │  agent assignment, avatar. Outputs contracts.md — the artifact
│                    │  M3 builders read. straight-swap rows skip this WP entirely.
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ M3                 │  Parallel refactor pool. One builder ticket per inventory row
│ Parallel refactor  │  (or small cluster). Mechanical: read row → apply contract →
│ pool               │  add regression test → mark row closed-by. Highly parallel.
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ M4                 │  Re-run inventory (zero rows), promote lint warn → error,
│ Final sweep + lint │  add e2e regression suite, gap-analysis doc.
│ promotion to error │
└────────────────────┘
```

**Scope rules (apply to every story in this track):**

- **Concept-doc fidelity.** Every story honors the concept's hard rules — no fallback that fabricates data, every mock has a recorded replacement contract, the guard is non-bypassable in CI.
- **Empty-state honesty.** When a runtime fallback is removed, the UI renders the real empty / loading / error state. No "render plausible content while the real source is silent."
- **Inventory is machine-generated.** The hand-written `plans/mock-data-purge/inventory.md` is a 2026-05-09 preview only. Once M1 lands, the canonical inventory is the script's output (`plans/mock-data-purge/inventory.json` + a markdown digest regenerated on every CI run). Stories cite rows by the script's stable identity (`path:symbol`), not by line number.
- **Architect involvement is bounded to M2.** If a builder in M3 hits a row that secretly needs a new contract, they STOP and re-triage — they do NOT design in flight. M2 absorbs the redesign, then M3 resumes.
- **Synthesis e2e ripple awareness** (CC-016, from the L16 retro). Any story that removes a runtime fallback enumerates the e2e specs that mock the same endpoint and updates them in the same PR. Pre-push: re-run the full Playwright suite locally.
- **No emojis.**

---

### M1 — Mock-data linter + auto-inventory generator

**Story.** As a maintainer landing the rest of Track M without regression risk and without hand-curating an inventory that will rot, I want a structural lint guard AND a CI-runnable inventory script — the lint rule fails on new offenders, the script enumerates current offenders into a machine-readable artifact, and both share one source of truth (the closed permitted-mock surface globs + the closed forbidden-prefix set from the policy doc).

**Depends on.** None.

**Acceptance criteria.**

- A new lint rule `design/no-mock-data-import` lives in `packages/eslint-plugin-design/src/rules/`. It forbids any import in runtime production code from `**/__fixtures__/**`, `**/fixtures/**` (when the importer is a runtime path), and any path the architect adds to the closed permitted-mock-surface globs. It is a generalization of the L16 `no-restricted-imports` block (the existing block keeps working — the new rule layers on top).
- A new lint rule `design/no-mock-data-symbol` lives alongside it. It forbids top-level declarations whose names match the closed prefix set in the policy doc (`MOCK_*`, `FAKE_*`, `STUB_*`, `SAMPLE_*`, `DUMMY_*`, `PLACEHOLDER_*`, `FALLBACK_*`, `DEMO_*`, `LEGACY_*`, `EXAMPLE_*`, `HARDCODED_*`, plus `DEFAULT_*` when the symbol's value shape mirrors a fetched source — architect picks the disambiguation: path filter, suffix `_DATA`, or per-symbol allowlist).
- A new script `scripts/mock-inventory.ts` (Bun-runnable) walks `packages/*/src/` (excluding the permitted-mock surface) and emits:
  - `plans/mock-data-purge/inventory.json` — array of `{path, line, symbol, kind: "import" | "symbol" | "literal-id", shape, importerCount, triageHint}` rows. `triageHint` is the heuristic-based first guess: `straight-swap` (real source obviously exists in code), `needs-contract` (no obvious replacement), `borderline` (visual fallback / config). Final triage decision is M2's call.
  - `plans/mock-data-purge/inventory.md` — human-readable digest grouped by package + area + triage hint.
  - The script also detects literal hardcoded identity strings (`"u-founder"`, `"agent-unassigned"`, `"founder@hyperidle.com"`) as `kind: "literal-id"` rows even when no symbol prefix match exists. The architect picks the literal-id allowlist.
- Both lint rules + the script emit actionable error messages naming (a) the file, (b) the symbol or import path, (c) the policy doc URL `docs/guides/developer/mock-data-policy.md`, (d) where the import / symbol is legal.
- Per-line `eslint-disable` requires a tracking issue id in the comment (e.g. `// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #123`); a meta-test proves the rule rejects bare disables.
- Both lint rules wired in `eslint.config.js` at `warn` for `packages/web/src/**` and `packages/server/src/**`, with the closed permitted-mock-surface globs as `ignores`.
- A new CI step runs `bun run scripts/mock-inventory.ts` and fails the build if `inventory.json` differs from what's checked in (so PRs that change the offender set must commit the regenerated inventory).
- Vitest tests in `packages/eslint-plugin-design/src/__tests__/` cover: positive (forbidden import / symbol detected), negative (permitted-surface paths NOT detected), allowlist (theme `DEFAULT_*` allowed), per-line-disable (without tracking id rejected; with tracking id accepted). Script tests cover the triage heuristic on a fixed sample.
- `bun run check` + `bun run lint` + `bun run test` all green. The lint rules produce warnings for every existing offender; the script's `inventory.json` is non-empty.

**Validation scenarios.**

- Given the rule wired at warn, when CI runs on `main`, every current offender produces a warning that names the file, symbol, and policy URL.
- Given a developer adds `const MOCK_USERS = […]` to `packages/web/src/pages/SomeNew.tsx`, the lint warns AND the next CI run regenerates `inventory.json` with the new row.
- Given the same constant is added to `packages/web/src/pages/__fixtures__/some-new-fixture.ts`, both the lint and the script stay silent.
- Given `// eslint-disable-next-line design/no-mock-data-symbol` without a tracking id, the meta-test fails the build.

**Contracts / constraints.**

- The lint rules and the inventory script share ONE source of truth for permitted-mock-surface globs and forbidden-prefix set — extract to a single module under `packages/eslint-plugin-design/src/`.
- `inventory.json` is checked into git so it diffs cleanly on PRs.
- Wired at `warn` ONLY in M1. Promotion to `error` is M4.

**Complexity.** L (the script + literal-id detection is the meat).
**Effort.** L (~3–4d).

---

### M2 — Replacement contracts (architecture pass)

**Story.** As an architect reading the M1-generated inventory's `needs-contract` rows, I want one bundled architecture pass that pins the replacement contracts for every cluster of offenders that lacks a real source today — so M3 builders can swap mechanically without making contract decisions in flight.

**Depends on.** M1.

**Scope (what M2 designs — clusters identified from current inventory; final cluster list is whatever M1's `needs-contract` rows produce):**

1. **Auth / identity context.** `useCurrentUser()` (or named equivalent) on the client; server auth middleware enforcement so all `"u-founder"` literals + `DEFAULT_FOUNDER_ID` server fallbacks become a hard 401-on-missing-header path. Includes the wider sweep of `actor: "u-founder"` literals in `packages/server/src/routes/bets.ts`, `services/lifecycle-propagation.ts`, `services/bet-state-machine.ts` flagged by M1's literal-id detection.
2. **`/api/settings` contract.** Endpoint shape, payload schema (**see V6 note below on `packages/api-contract/` deprecation — new schemas go to `packages/server/src/schemas/`**), the client hook (`useSettings`), and the loading/error/empty rendering rules. Disambiguates which fields stay as theme/UI defaults (allowed) vs which become fetched data.
3. **`/api/rail` contract.** Endpoint shape, payload schema, client hook (`useRail`), empty-state rules. Identifies whether a precursor cost-aggregation endpoint is needed and either schedules it or closes it inside M2.
4. **Agent-participant assignment contract.** How the assigned agent for a host entity (bet, task, knowledge item) is read at thread-creation time. Replaces `PLACEHOLDER_AGENT_PARTICIPANT_ID`. Covers the unassigned-state UX.
5. **Avatar fallback contract.** Picks one of the two paths from the concept doc (server guarantees `avatarUrl` OR client renders a DS-quality initials chip). Documents the choice.
6. **Knowledge submenu count contract.** If the count is derivable from an existing list response, M2 says so and the row becomes `straight-swap`. Otherwise M2 adds the endpoint shape.

**Acceptance criteria.**

- Every `needs-contract` row in the M1-generated inventory is addressed by exactly one section in `plans/mock-data-purge/contracts.md`.
- Each contract section includes: (a) the real source (endpoint or hook), (b) the type signature / schema, (c) the empty / loading / error rendering rule, (d) the migration recipe ("at site `path:symbol`, replace with `useThing()`; render `<Empty/>` when null"), (e) the test pattern (Vitest + Playwright shape), (f) the e2e ripple sites builders must update in the same PR.
- API contracts land in `packages/api-contract/` (types only, no implementation) so M3 builders can import them. **Note (2026-05-14): `packages/api-contract/` is superseded by V6 API type-safety architecture (`plans/api-typesafety/architecture.md`). New contracts should be Zod schemas in `packages/server/src/schemas/` with Hono RPC AppType inference. Existing api-contract types will be migrated during V6 Phase 3.**
- After M2, every inventory row is annotated `straight-swap | contract-pinned | tracked-out` (the third is for rows that legitimately can't be fixed in M-track and become followups elsewhere).
- No code changes other than `packages/api-contract/` types and the `contracts.md` artifact. Implementation is M3.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**

- Given a builder picks any inventory row in M3, they find the matching section in `contracts.md` and can write the test + the swap without further design.
- Given the M2 architect cannot find a clean contract for a row, the row is marked `tracked-out` with a written follow-up and removed from M3's pool.
- Given the e2e ripple sites are listed per contract, the builder updates them in the same PR — synthesis e2e regressions caught at CI time, not after merge (CC-016).

**Contracts / constraints.**

- Architect is invoked ONCE. If M3 surfaces a row that needs new contract design, M3 stops and re-opens M2 for an addendum — never inline.
- Bundle the contracts; do not produce one architecture doc per cluster.
- Pin endpoint paths and payload shapes — builders should not be picking these.

**Complexity.** L.
**Effort.** L (~3–5d). One bundled pass.

---

### M3 — Parallel refactor pool

**Story.** As a builder (or several builders, in parallel), I want to draw inventory rows from the M1-generated pool, apply the M2 contracts (or, for `straight-swap` rows, the existing real source), and close each row with a regression test that proves the mock is gone — until the inventory is empty.

**Depends on.** M2.

**Acceptance criteria.**

- Every row in `plans/mock-data-purge/inventory.json` annotated `straight-swap` or `contract-pinned` is closed by a commit. Closure requires:
  1. The mock symbol / import / literal id is removed from runtime code.
  2. The replacement (real source from M2's contracts, or the existing real source for `straight-swap` rows) is wired in.
  3. The empty / loading / error state renders honestly when the source is silent.
  4. A Vitest test asserts the swap (e.g. component renders the fetched value, NOT the previous mock value).
  5. A Playwright e2e covers the user-visible path when relevant.
  6. The e2e ripple sites listed in the matching `contracts.md` section are updated in the same PR.
  7. The next CI run regenerates `inventory.json` with the row removed.
- Builders draw rows from the pool in any order. Rows in the same file are typically batched into one PR; rows in unrelated files are independent PRs run in parallel.
- The M1 lint rules' warning count for the affected files drops to zero as each PR lands.
- A "ticket queue" view (a markdown checklist auto-generated by the M1 script under `plans/mock-data-purge/queue.md`) shows in-flight vs available rows so multiple builders don't pick the same row.
- `bun run check` + `bun run lint` + `bun run test` all green per PR; the full Playwright suite re-runs and stays green per PR.
- No new mocks are introduced; the M1 lint rule catches any regression at warn-level before merge.

**Validation scenarios.**

- Given the pool has 30 rows annotated `straight-swap` or `contract-pinned`, after M3 completes, the regenerated inventory has zero such rows.
- Given two builders pick adjacent rows in the same file, they coordinate via the queue and produce one PR (avoiding merge conflicts).
- Given a builder finds a row that needs contract redesign, they mark the row `re-triage` in the queue and stop — they do NOT design in flight.

**Contracts / constraints.**

- One row = one closure. No "while I'm in here" cleanup of unrelated mocks (those have their own row).
- Builders do NOT pick `borderline` or `tracked-out` rows. `borderline` rows are M2's call to either pin or punt.
- The Vitest test must demonstrate the swap — a test that passes against `main` (i.e., before the swap) is theatrical; rewrite it.

**Complexity.** Variable per row (mostly S, a few M); the workpackage as a whole is L because of breadth.
**Effort.** L overall (~5–8d cumulative across builders, depending on parallelism).

---

### M4 — Final sweep + lint promotion to error

**Story.** As a maintainer about to flip the rollout switch, I want a final pass that verifies the inventory is empty, promotes the M1 lint rules from `warn` to `error` so future regressions break CI, adds the regression-blocking e2e suite, and produces the test-coverage gap analysis.

**Depends on.** M1, M2, M3.

**Acceptance criteria.**

- Re-running `bun run scripts/mock-inventory.ts` produces an `inventory.json` with zero forbidden rows. Any remaining rows are `tracked-out` with a written follow-up entry in `plans/mock-data-purge/follow-ups.md`.
- The M1 lint rules `design/no-mock-data-import` and `design/no-mock-data-symbol` are promoted from `warn` to `error` in `eslint.config.js` for `packages/web/src/**` and `packages/server/src/**`. CI now blocks any new offender.
- A regression-blocking e2e suite is added at `packages/web/e2e/mock-data-purge.spec.ts`. The suite asserts: (a) no rendered DOM contains the literal strings `"u-founder"`, `"agent-unassigned"`, or `"founder@hyperidle.com"` on production paths; (b) the rail's cost values match a DB-seeded source not the previous mock numbers; (c) the settings panel reflects the logged-in user's profile, not the previous "Founder" hardcode.
- A test-coverage gap analysis at `plans/mock-data-purge/test-coverage-gap.md` explains, with concrete examples, why the old test/e2e suite passed despite the leaks (e.g., e2e specs mocked the same endpoints the runtime hardcoded against). Mirrors L29's deliverable but scoped to the M-track set.
- A `git grep` (or `rg`) for the forbidden-prefix set + the literal-id allowlist across `packages/web/src/` and `packages/server/src/` (excluding the permitted-mock surface) returns ZERO hits. The exact command is captured in `docs/guides/developer/mock-data-policy.md` as a CI smoke-test.
- The full `bun run verify` + Playwright suite is green. CI rejects any new fixture import OR mock-prefixed symbol declaration into runtime code.

**Validation scenarios.**

- Given a developer opens a PR that adds `const MOCK_X = […]` to a runtime file, CI fails with the actionable message from M1.
- Given the regression e2e suite is run against `main` BEFORE Track M started, it fails (proving the tests are real).
- Given the inventory file is regenerated post-M4, it is empty (or only `tracked-out` rows with follow-ups).

**Contracts / constraints.**

- The promotion to `error` is non-bypassable. Per-line `eslint-disable` still requires a tracking issue id.
- The e2e suite is a deliverable, not a stub.
- The gap-analysis doc is a deliverable, not a stub.

**Complexity.** M.
**Effort.** M (~2–3d).

---

## Track M dependency graph

```
M1 (linter + inventory generator) ─► M2 (architect, ONCE — replacement contracts)
                                         │
                                         ▼
                                     M3 (parallel refactor pool — many small PRs)
                                         │
                                         ▼
                                     M4 (sweep + lint promotion to error)
```

- M1 lands first — the inventory becomes machine-generated and the lint rules light up the baseline at warn.
- M2 is the one-shot architecture pass — bundled contracts, no per-cluster design phases.
- M3 is the parallel coding pool — drawn from the M1 inventory, gated by the M2 contracts, no architect involvement unless a row hits `re-triage`.
- M4 verifies, promotes to error, ships.

## Out of scope (separate tracks)

- Algorithm tuning constants in `packages/fabric/src/scoring-config.ts` and `relevance-engine.ts`. These are config, not mock data — they belong under a future factory-settings track.
- The 22 L-stories that L29 was originally designed to wait on. Track M is the rollout-blocking subset; L29 still owns the broader test-coverage gap when it runs.
- UI vocabulary constants (`HEALTH_DOT`, `SCOPE_LABELS`, `TIME_24H_RE`, etc.). The M1 guard's allowlist passes them; they are presentation vocabulary, not data.

## Reference

- Concept: `plans/mock-data-purge/concept.md`
- Inventory (preview, hand-curated 2026-05-09; M1 replaces with auto-generated): `plans/mock-data-purge/inventory.md`
- Policy: `docs/guides/developer/mock-data-policy.md`
- Precedent: `eslint.config.js` "L16 AC-3" block (fixtures import boundary)
- Retro pattern this prevents: `docs/retros/L16.md` CC-016 (synthesis e2e ripple)
