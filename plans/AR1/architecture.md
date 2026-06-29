# Architecture — AR1: Honest Harness Integration Testing (the mechanism)

**Workpackage:** AR1 (Track AR). **Type:** infra / tooling. **Complexity:** L. **No UI — `/design` skipped.**

**Fixed input:** `plans/AR/concept.md` (LOCKED — the STRICT harness model). This plan ships the *mechanism* that keeps that model true. It does **not** convert the ~30 stubbed harness tests (AR2–AR6) and does **not** rewrite test bodies except where the strict-model token purge forces it (see Decision 4).

**Structural reference (reverted, on this branch):** commits `c152d35d` (requireHarness/guard/floor), `5a5c1924` (renames), `0c7fbe1f` (skipIf→requireHarness). The *shapes* were right; the **harness/key vocabulary was wrong** — it shipped `requireHarness("openai-key")` / `"anthropic-key"` / `"any-gateway-key"`. That is the exact bug that got it reverted. This plan reuses the shapes and **replaces the vocabulary with the strict model**: `claude` / `codex` / `opencode` / `gh` = binary-on-PATH; `builtin` = `OPENROUTER_API_KEY`. No other key tokens exist.

---

## Required reading (builder)
- `plans/AR/concept.md` — STRICT harness model + Hard Prohibitions (load-bearing).
- `.pipeline/work-packages/TRACK-AR.md` §AR1 — ACs, validation scenarios, constraints.
- `.claude/rules/testing.md` §"Integration tests: two archetypes" — prose already landed; AR1 updates it in lockstep.
- `scripts/verify-attest.ts`, `scripts/check-attestation.ts` — attestation; floor is additive.
- `vitest.integration.config.ts`, `vitest.real-harness.config.ts`, root `package.json` scripts — lane collapse targets.
- `scripts/ah5-no-mock-guard.ts`, `scripts/harness-vocab-guard.ts` — guard-script precedent (standalone tsx, wired into `lint`).

---

## Plan reconciliation (spec ⇆ codebase)

| Spec assumption | Reality found | Plan handling |
|---|---|---|
| One `*.real-harness.test.ts` lane to fold | **8** real-harness-suffix files? No — **4** `.real-harness.test.ts` + 3 `*real-harness*.integration.test.ts` (mis-named in AN1/AM2) + `vitest.real-harness.config.ts` | Rename the 4 suffix files; **remove the `*real-harness*` exclude** in `vitest.integration.config.ts` so the 3 mis-named ones actually run; delete the config + script. |
| `session-provisioning` gated on a key proxy | Confirmed — `session-provisioning.integration.test.ts:117` `test.skipIf(!process.env.ANTHROPIC_API_KEY)` drives `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` (keychain). The canonical phantom gate. | → `requireHarness("claude")`. Purge `ANTHROPIC_API_KEY` + the header lore that calls it a "proxy". `modelProviders:["anthropic"]` (a model-provider label, **not** a key) stays. |
| `builtin` path uses a gateway key | `AM2-builtin-gateway.integration.test.ts` drives `BuiltinHarnessAdapter` with **`OPENAI_API_KEY` + `gpt-4o-mini`**; `AM2-real-harness-discovery` gates on `ANTHROPIC \|\| OPENAI \|\| OPENROUTER`. **All three tokens are forbidden by the strict model.** | `requireHarness("builtin")` (= `OPENROUTER_API_KEY`); purge `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` from body + retarget model to an OpenRouter model id. This token purge is **AR1's job** (Hard Prohibition is absolute), not AR6 body-rewrite. See Decision 4. |
| `vitest.integration.config.ts` runs harness tests | It currently **excludes** `**/harness/__tests__/*real-harness*.integration.test.{ts,tsx}` → AN1 + 2 AM2 files never run in `test:all` today | Remove the exclude; route them through the serial project (Decision 3). |
| CI re-runs the verify-chain guards | **No.** `.github/workflows/ci.yml` re-runs only `check`, `lint`, `knip`, `mock-inventory:check`, builds, `check-attestation`. The `ah5/ah6/harness-vocab/token` guards are **not** a CI step. | Guard must ride **`npm run lint`** (precedent: `ag7-no-divergent-classes.ts` is chained into `lint`) so CI's Lint step enforces it. Floor rides `check-attestation`. |
| Only one CLAUDE.md table | Root `CLAUDE.md` has **two** tables ("Which command to use when" + "Test file naming"); there is exactly one `CLAUDE.md`. | "Both CLAUDE.md tables" = those two. |
| AL6 rename is clean | `AL6-real-harness-return-enforcement.real-harness.test.ts` **collides** with existing `AL6-real-harness-return-enforcement.integration.test.ts` | Rename to `…-realbinary.integration.test.ts` (reverted impl's choice). |

---

## Design-it-twice decisions

### Decision 1 — Guard: standalone tsx check script (NOT an eslint rule)
- **A. ESLint rule (`packages/eslint-plugin-*`)** — per-file AST, auto-runs in `lint`. *Reject:* the guard must reason about repo-structure facts no single file's AST sees — does `vitest.real-harness.config.ts` exist? is the `test:real-harness` npm script gone? does a `.real-harness.test.ts` filename survive? — and must own a cross-run **allowlist** that shrinks monotonically. ESLint is the wrong shape for whole-repo + stateful-allowlist checks.
- **B. Standalone `scripts/honest-harness-guard.ts` (tsx), chained into `npm run lint`.** *Chosen.* Precedent is exact: `ah5-no-mock-guard.ts`, `harness-vocab-guard.ts`, `ag7-no-divergent-classes.ts` are standalone tsx checks; `ag7` is already inside the `lint` script, so it runs live in CI's Lint step with **no new CI job** (honors "no CI test job"). Whole-file source reading (stub/`vi.mock`/`skipIf` regex) and the allowlist live naturally here. False-positive control comes from the **path predicate** (Decision 2), not AST guesswork.

**Wiring:** prepend to `lint`: `... && npx tsx scripts/honest-harness-guard.ts --check`. It is therefore inside `verify` (verify runs lint) and inside CI (CI runs `npm run lint`). Add `"honest-harness-guard": "npx tsx scripts/honest-harness-guard.ts"` and `":check"` / `":write-allowlist"` script aliases for local use. Add to `knip.json` ignore if needed (precedent: reverted `b2cfc97d`).

### Decision 2 — "Harness-facing" detection: **path predicate** (single-sourced, path-only)
- **A. Import-seam allowlist** (reverted approach: file imports `cli-harness-adapter`/`builtin-harness-adapter`/`llm-client`/…). *Reject:* brittle + false-negatives — `AM2-real-harness-discovery` imports `harness-discovery.js` and `AM2-real-harness-session-probe` imports `harness-session-probe.js`, neither in the seam list, yet both spawn real binaries. And **`verify-attest` only has file paths from the vitest JSON reporter — no source** — so the floor cannot use a source-import predicate.
- **B. Path predicate.** *Chosen.* A file is an agentic harness integration test iff:
  ```
  isHarnessIntegrationPath(p) =
      /\/harness\/__tests__\/.*\.integration\.test\.ts$/.test(p)
      || EXPLICIT_HARNESS_INTEGRATION.some(suffix => p.endsWith(suffix))
  // EXPLICIT_HARNESS_INTEGRATION = ["__tests__/session-provisioning.integration.test.ts"]
  ```
  Path-only → works for **both** the floor (paths from JSON) and the guard (file selection). The `harness/__tests__/` directory is the convention for harness-touching tests; the `.integration.test.ts` suffix excludes the `.test.ts` units in that dir (e.g. `AL6-provision-return-hook.test.ts`), so units that legitimately stub are never selected. Service `*.integration.test.ts` elsewhere (web/db) never match → no false positive. `session-provisioning` lives in `server/src/__tests__/` so it is added explicitly.
- **Single source:** `scripts/lib/honest-harness-predicate.ts` exports `isHarnessIntegrationPath` + `EXPLICIT_HARNESS_INTEGRATION`. Imported by `honest-harness-guard.ts` **and** `verify-attest.ts`. One regression net: `ar1-harness-predicate.test.ts`.

> Files the path predicate selects today (the agentic set): `harness/__tests__/*.integration.test.ts` (AL6-realbinary, AL6-reprompt-loop, AL6-return-gate, AL6-uniform-forcing, AL6-realbinary-return-enforcement, AL7-two-session-trust-first, AM2-builtin-gateway, AM2-real-harness-discovery, AM2-real-harness-session-probe, AN1-real-harness-inherited, AN2-connection-provisioning, ah5-gates-on-broken-stream, cli-adapter-real-binary) + `__tests__/session-provisioning.integration.test.ts`.

### Decision 3 — Serial real-LLM execution: Vitest 4 `projects` with a single-thread harness project
- **A. `fileParallelism:false` on the whole integration config.** *Reject:* serializes the fast deterministic service-integration suite too — a large, needless slowdown.
- **B. Two `projects` inside `vitest.integration.config.ts`.** *Chosen.*
  - `service`: `include: ["packages/**/*.integration.test.{ts,tsx}"]`, `exclude:` the harness set, `maxWorkers:4` (today's behaviour, parallel).
  - `harness`: `include: ["packages/server/src/harness/__tests__/**/*.integration.test.ts", "packages/server/src/__tests__/session-provisioning.integration.test.ts"]`, `poolOptions: { threads: { singleThread: true } }`, `testTimeout/hookTimeout: 120_000`. `singleThread` runs every file in this project on one worker → real-LLM calls never race (rate-limit + auth-contention safe). `setupFiles` (PGlite) stays only on projects that need DB fixtures (`session-provisioning` uses `{db,app}`, so keep the integration setup on the `harness` project too).
  - `npm run test:integration` (`vitest run --config vitest.integration.config.ts`) runs **all** projects in one invocation. `test:all` unchanged.
  - ⚠️ **VERIFY at build:** Vitest 4 per-project serial knob. Per [vitest.dev/guide/parallelism] + [config/fileparallelism], per-project `fileParallelism` is not exposed in project config, but `poolOptions.threads.singleThread:true` is the supported per-project serial mechanism (confirmed direction; builder pins the exact field against installed `vitest@^4.1.5` before relying on it). Fallback: a dedicated `vitest.harness.config.ts` with `fileParallelism:false` chained after the service run in `test:integration` — only if `projects` single-thread does not hold.

### Decision 4 — `AM2-builtin-gateway` token purge is AR1, not AR6
The Hard Prohibition ("no `openai-key`/`anthropic-key` token anywhere", "`ANTHROPIC_API_KEY` does not exist in any scenario") is **absolute** and is AR1's defining purpose. `AM2-builtin-gateway`'s body is OpenAI-coded (`OPENAI_API_KEY`, `gpt-4o-mini`). The minimal strict-conformance change — gate `requireHarness("builtin")`, swap key → `OPENROUTER_API_KEY`, model → an OpenRouter model id — is **token purge**, which AR1 owns, not the stubbed→real conversion AR6 owns. The assertion (non-echoed real completion through `BuiltinHarnessAdapter`) is preserved. Flag: if the OpenRouter model wiring proves non-trivial, the test still must not retain a forbidden token — at worst it gates `requireHarness("builtin")` and any residual OpenAI body reference is a **blocking** strict-model violation, never shipped.

---

## The five mechanisms — concrete

### 1. Lane collapse
**Rename (preserve assertions; only swap `skipIf`→`requireHarness`):**
| From | To |
|---|---|
| `…/AL6-real-harness-return-enforcement.real-harness.test.ts` | `…/AL6-real-harness-return-enforcement-realbinary.integration.test.ts` *(avoids collision)* |
| `…/AL7-two-session-trust-first.real-harness.test.ts` | `…/AL7-two-session-trust-first.integration.test.ts` |
| `…/AN2-connection-provisioning.real-harness.test.ts` | `…/AN2-connection-provisioning.integration.test.ts` |
| `…/cli-adapter-real-binary.real-harness.test.ts` | `…/cli-adapter-real-binary.integration.test.ts` |

Use `git mv` (preserve history). **Delete** `vitest.real-harness.config.ts`. **Remove** `"test:real-harness"` from root `package.json`. **Remove** the `*real-harness*.integration.test` exclude block + `@lore AN1` note in `vitest.integration.config.ts`. **Check** `packages/server/vitest.config.ts` — drop any now-dead `.real-harness.test.ts` exclude. Real-LLM files now run via Decision 3's `harness` project.

### 2. `requireHarness(name)`
**Location:** `packages/server/src/harness/__tests__/require-harness.ts` (session-provisioning imports `../harness/__tests__/require-harness.js`).
```ts
export type HarnessName = "claude" | "codex" | "opencode" | "gh" | "builtin";
// claude/codex/opencode/gh: keychain/inherited login — NO API key. builtin: OPENROUTER_API_KEY from .env.
export function requireHarness(...names: HarnessName[]): void;
```
**Detection:**
- `claude` | `codex` | `opencode` | `gh` → binary on PATH: `execFileSync("which", [bin], { stdio: "ignore" })` (throws ⇒ absent). `BINARY = { claude:"claude", codex:"codex", opencode:"opencode", gh:"gh" }`.
- `builtin` → `Boolean(process.env.OPENROUTER_API_KEY)`. **No other env key. No `ANTHROPIC_API_KEY`. No `OPENAI_API_KEY`.**

**Behavior:** any absent name ⇒ `throw new Error("requireHarness: <names> not installed/configured — harness integration test cannot complete. Install the binary (claude/codex/opencode/gh) or set OPENROUTER_API_KEY for builtin; or demote to a *.test.ts unit. (AR1: never skipIf to green.)")`. Message names the harness, **never a raw secret**. Called at module scope or top of a `describe()` (collection-phase throw = "this block cannot run").

**Conversions (every `skipIf`-on-absent → `requireHarness`):**
| File | Gate today | → |
|---|---|---|
| `session-provisioning.integration.test.ts:117` | `skipIf(!ANTHROPIC_API_KEY)` | `requireHarness("claude")` + purge ANTHROPIC lore |
| `AN1-real-harness-inherited.integration.test.ts` | per-binary `skipIf(!{codex,claude,opencode,gh}Installed)` | wrap each `describe` with `requireHarness("<binary>")` |
| `AM2-real-harness-discovery.integration.test.ts` | per-binary skipIf + `gatewayKeyConfigured` | per-binary `requireHarness`; `gatewayKeyConfigured`→`requireHarness("builtin")`; **cursor:** `skipIf(cursorInstalled)` is a skip-*when-present* assertion (cursor inert/not-spawnable) — convert to an **unconditional** assertion that cursor is absent from discovery (drop the skipIf; do **not** misread it as an availability gate) |
| `AM2-real-harness-session-probe.integration.test.ts` | per-binary skipIf | per-binary `requireHarness` |
| `AM2-builtin-gateway.integration.test.ts` | `skipIf(!hasGatewayKey)` + inner `canProbeOpenAiCompatible` | `requireHarness("builtin")` + Decision 4 token purge |
| 4 renamed files (AL6-realbinary, AL7, AN2, cli-adapter) | per-binary skipIf | per-binary `requireHarness` |

### 3. Stub-adapter guard (`scripts/honest-harness-guard.ts`)
Selects files via `isHarnessIntegrationPath` (Decision 2), then three checks:

- **Lane checks (immediate, never allowlisted):** fail if any `*.real-harness.test.ts` file exists, `vitest.real-harness.config.ts` exists, or `test:real-harness` appears in `package.json`.
- **`skipIf` check (immediate, never allowlisted):** in a selected file, fail on a skip-*when-absent* gate — patterns `/(?:test|it|describe)\.skipIf\s*\(\s*!/`, `…skipIf(\s*\w+(?:Missing|Absent)\b`, `…skipIf(\s*!?\w*(?:Installed|Present|Configured)\s*\)`. **Excludes the inverse** `skipIf(<bareTruthy>)`-asserting-absence form only when the operand is a known absence-assertion name (`cursorInstalled`); since AR1 removes that one outright, the guard need not special-case it after conversion. Document the narrow shape so a future skip-when-present assertion isn't mis-flagged.
- **Stub-content check (allowlisted, monotonic-shrink):** in a selected file, flag `new ScriptedAdapter|ScriptedHarness|EchoHarnessAdapter|CapturingHarnessAdapter|MockHarnessAdapter`, `class \w+ implements HarnessAdapter`, `import …mock-harness-adapter`, `vi.mock("…/harness/…")`, `vi.mock("…llm-client…")`, `vi.mock("…callLlm…")`. Allowlist rules: dirty+allowlisted ⇒ PASS (known debt); dirty+not-allowlisted ⇒ FAIL ("new offender — write against the real harness or demote to *.test.ts unit"); clean+allowlisted ⇒ FAIL ("remove from allowlist — debt paid"); stale (allowlisted path missing) ⇒ FAIL.

**Allowlist file:** `scripts/honest-harness-guard.allowlist.json` — a JSON array of repo-relative paths. Generated once via `--write-allowlist` from the real scan (the AL6-stub/ah5/AM2-builtin pre-conversion offenders, ~12–17). Shrinks as AR2–AR6 convert them; **never grows** (a new dirty file is a build failure, not an allowlist append). The lane/skipIf checks are **not** represented in the allowlist.

**Exported (for unit tests):** `isStubDirty(source)`, `hasAbsentSkipIf(source)`, `checkGuardRules(files, allowlist)`, plus `isHarnessIntegrationPath` re-exported from the predicate lib.

### 4. Attestation executed-count floor (additive)
**`scripts/lib/attestation-floor.ts`** (pure): `extractAgenticCounts(vitestJson, predicate) → { agenticExecuted, agenticSkipped }` (status `passed|failed` ⇒ executed; `skipped|pending|todo` ⇒ skipped) and `assertAgenticFloor(counts) → string|null` (returns a violation when the agentic set is empty **or** `agenticExecuted===0`; back-compat: undefined counts ⇒ `null`).

**`scripts/verify-attest.ts`:** run the integration suite with a JSON reporter captured to a temp file (multi-reporter: `--reporter=dot --reporter=json --outputFile=<tmp>`), parse it through `extractAgenticCounts(json, isHarnessIntegrationPath)`, and add `agenticExecuted` + `agenticSkipped` to the signed payload (so they are HMAC-covered). Derive `status` from the **combined** exit code of unit + integration runs (unchanged failure semantics). Do not double-run real-LLM tests (single integration invocation produces both the human output and the JSON).

**`scripts/check-attestation.ts`:** add `agenticExecuted?`/`agenticSkipped?` to the `Attestation` interface; after the existing `status/partial/dirty/srcHash` gates, call `assertAgenticFloor({ agenticExecuted, agenticSkipped })` and `fail(...)` on a violation. Optional fields ⇒ legacy attestations still validate (matches `srcHash?` precedent). **Does not weaken any existing gate.**

> Interaction note: because `requireHarness` *throws* (status `failed` ⇒ executed, and a failed attestation is never minted) rather than skipping, the "zero executed" branch can only fire if a `skipIf` is reintroduced. The floor is therefore the **regression backstop** behind `requireHarness` + the guard, exactly as intended (a green can't be minted on a 100%-skipped agentic surface).

### 5. Lockstep prose
| Surface | Change |
|---|---|
| `.claude/rules/testing.md` | §two-archetypes: "Real CLI/SDK" → "the real installed CLI binary" (purge **SDK**). Rewrite the "Rolling out via Track AR / follow the rule by hand" note from future→**shipped** (requireHarness + guard + floor + lane-collapse are live). Remove every `.real-harness.test.ts` mention; both naming tables already say "harness-facing: real installed binary, hard-fail if absent" — confirm. Add a one-line "gate with `requireHarness(<name>)`, never a key proxy". |
| `CLAUDE.md` (both tables) | Confirm "Which command to use when" + "Test file naming" describe only `*.integration.test.ts` (service **or** harness-facing); no `.real-harness` lane; no `test:real-harness`. |
| `.claude/references/testing-patterns.md:69` | Row "Manual mock — External services (LLM APIs, …)": **carve the harness/LLM-under-test OUT**. The harness/agent/CLI under test is never mocked (use the real binary). Mockable externals shrink to truly-out-of-band ones (email, webhooks). This is the "mock the LLM/network" line the spec flags (`test-layers.md:22` ≡ this row). |
| `.claude/skills/write-tests/SKILL.md` | Line 18: keep "service integration may use a deterministic double **only when the harness is not under test**"; ensure it never reads as license to mock the harness. Line 19 harness-facing already correct — purge "CLI/SDK"→"CLI binary", drop `.real-harness` references. |
| `.claude/skills/review/SKILL.md:116` | Already has the CC-004 "stubbed harness seam" tripwire; make explicit it is a **blocking** finding (not advisory) and references `requireHarness` as the honest gate. |
| (secondary, lower priority) `docs/agent-layer/harness-capability-descriptor.md`, `docs/agent-layer/return-gate-enforcement.md`, `docs/process-layer/staged-operation.md` | Mention the dead `.real-harness` lane — note for builder to purge in the same PR so prose doesn't drift. Retro-log/progress files are immutable history — leave them. |

---

## Acceptance criteria → verification

| # | AC | Verification method |
|---|---|---|
| AC1 | Two-archetype prose updated in lockstep; no `.real-harness` lane in any naming surface | **Guard lane-check** (fails if any `.real-harness.test.ts`/`vitest.real-harness.config.ts`/`test:real-harness` survives) + reviewer reads the 6 prose surfaces. Static. |
| AC2 | write-tests carves harness out of mockable externals; review gains a **blocking** tripwire | Prose edit; reviewer confirms `testing-patterns.md`/`write-tests` no longer license mocking the harness and `review` marks it blocking. Static. |
| AC3 | `.real-harness` suffix + config + script gone; those tests run as `*.integration.test.ts` (real-LLM serial) | `ar1-lane-collapse.test.ts`-style? No — **static**: guard lane-check + `npm run test:integration` collects the 4 renamed + 3 un-excluded files (run the `harness` project, assert it discovers them). |
| AC4 | `requireHarness` exists + replaces every absent-`skipIf`; hard-fails naming the harness; strict vocab; **no `anthropic-key`/`openai-key`/`ANTHROPIC_API_KEY` token anywhere** | `ar1-require-harness.test.ts`: `requireHarness("codex")` throws with message naming codex when absent (stub PATH); `HarnessName` type has exactly the 5 names (`npm run check`). **Token-purge:** guard/grep assertion (or `harness-vocab-guard`) that `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` appear in **no** harness-facing test or in `require-harness.ts`. Static + unit. |
| AC5 | Guard fails the build on a stubbed/`vi.mock`/`skipIf` harness-facing integration test; no false-positive on units or service-integration | `ar1-honest-harness-guard.test.ts`: `checkGuardRules` — dirty+not-allowlisted ⇒ violation; dirty+allowlisted ⇒ pass; a `*.test.ts` unit with a stub ⇒ no violation; a web `*.integration.test.ts` ⇒ not selected; a `skipIf(!x)` in a selected file ⇒ violation even if allowlisted. Guard wired into `lint`. Unit. |
| AC6 | `verify-attest` records executed/skipped; `check-attestation` fails on zero-executed agentic | `ar1-attestation-floor.test.ts`: `extractAgenticCounts` over a fixture vitest-JSON returns right counts for predicate-matched files only; `assertAgenticFloor({executed:0,skipped:N})`⇒violation, `{executed:0,skipped:0}`⇒empty-set violation, `{executed:N}`⇒null; legacy (undefined)⇒null. Unit. |
| AC7 | `verify` passes with binaries installed; fails with the `requireHarness` message without them | Behavioral (validation scenario). Proven by AC4 unit (throw path) + a real `npm run verify` on the founder machine (binaries + `OPENROUTER_API_KEY` present). |

---

## Ordered task list (commit-incremental green phase)

> Red phase first (tests for AC4/AC5/AC6 against not-yet-existing modules), then green per task. Each task is an independently-committable boundary.

1. **Predicate + red tests.** Create `scripts/lib/honest-harness-predicate.ts` (`isHarnessIntegrationPath`, `EXPLICIT_HARNESS_INTEGRATION`). Write `ar1-harness-predicate.test.ts` (selects harness-dir `.integration.test.ts` + session-provisioning; rejects `.test.ts` units, web `.integration.test.ts`). *Commit.*
2. **`requireHarness` + red test.** Create `require-harness.ts` (strict `HarnessName`, `which`/`OPENROUTER_API_KEY` detection, throw-on-absent). `ar1-require-harness.test.ts`. *Commit.*
3. **Guard + red test.** `scripts/honest-harness-guard.ts` (lane/skipIf/stub-content checks, allowlist rules, `main()`), exporting pure fns. `ar1-honest-harness-guard.test.ts`. Do **not** wire into `lint` yet (offenders still present). *Commit.*
4. **Lane collapse.** `git mv` the 4 files (AL6→`-realbinary`); delete `vitest.real-harness.config.ts`; remove `test:real-harness`; remove the `*real-harness*` exclude in `vitest.integration.config.ts` + add the two `projects` (Decision 3); drop dead exclude in `packages/server/vitest.config.ts`. *Commit.*
5. **skipIf→requireHarness conversions.** All files in §2's table (session-provisioning, AN1, AM2×3 incl. cursor + builtin token purge per Decision 4, 4 renamed). *Commit.*
6. **Generate allowlist + wire guard into `lint`.** `--write-allowlist` → `honest-harness-guard.allowlist.json` (residual known-debt stubs). Prepend guard to the `lint` script; add npm aliases; update `knip.json` if it flags the new scripts. Run `npm run lint` → green (offenders allowlisted, lane/skipIf clean). *Commit.*
7. **Attestation floor.** `scripts/lib/attestation-floor.ts` + `ar1-attestation-floor.test.ts`; wire JSON-reporter capture + counts into `verify-attest.ts`; add floor gate to `check-attestation.ts`. *Commit.*
8. **Prose lockstep.** All §5 surfaces in one commit. *Commit.*
9. **Green-gate.** Builder runs `npm run check && npm run lint && npm run test`; full `npm run verify` (real binaries) on the founder machine for AC7/AC3. *(Builder, not designer.)*

---

## Type / config contracts
- `HarnessName = "claude" | "codex" | "opencode" | "gh" | "builtin"` — exhaustive; no key-named members.
- `isHarnessIntegrationPath(filePath: string): boolean` — path-only; single-sourced.
- `AgenticCounts = { agenticExecuted: number; agenticSkipped: number }`.
- `Attestation` gains optional `agenticExecuted?: number; agenticSkipped?: number` (HMAC-covered).
- `vitest.integration.config.ts` gains `test.projects: [serviceProject, harnessProject]` (⚠️ verify v4 field).

## Migrations (rename/move call sites)
- 4 `git mv` renames (§1). No source imports the test files by path (they are leaf test files) — confirm via `grep -rl "<oldbasename>"`. No fixtures/e2e reference them.
- `package.json`: remove `test:real-harness`; prepend guard to `lint`; add guard aliases.
- `vitest.integration.config.ts` + `packages/server/vitest.config.ts`: exclude edits.

## sharedFiles
`package.json`, `vitest.integration.config.ts`, `scripts/verify-attest.ts`, `scripts/check-attestation.ts`, `.claude/rules/testing.md`, `CLAUDE.md`, `knip.json`. (Infra — flag for merge-order if AR2+ run concurrently; they edit harness test bodies + the allowlist, so coordinate the allowlist file.)

## protectedTests
The 4 renamed files + AN1 + AM2×3 + session-provisioning **assertions must not change** (only filename + `skipIf`→`requireHarness` gate, and AM2-builtin token/model purge per Decision 4). DoD audits `git diff` shows gate/import/rename lines only, not assertion bodies — except AM2-builtin's key/model purge, which is explicitly authorized.

## Security & abuse cases
- **Secret handling:** `requireHarness` and the guard message name harness/key-*class* only — never echo a secret value. `builtin` checks presence of `OPENROUTER_API_KEY`, never logs it. **N/A otherwise** (no new route, no input, no outbound URL, no path input — tooling only).
- **Attestation integrity:** floor fields are inside the HMAC payload (not appended post-sign), so they cannot be forged independently. Floor is additive — no existing gate weakened.

---

## Risks / unresolved ambiguities (reviewer/builder must know)
1. **Vitest 4 per-project serial field (Decision 3, ⚠️).** Builder must pin `poolOptions.threads.singleThread` (or the v4 equivalent) against installed `vitest@^4.1.5` before relying on it; fallback = dedicated `vitest.harness.config.ts` with `fileParallelism:false`. This is the one unverified framework detail.
2. **`AM2-builtin-gateway` body purge (Decision 4).** Confirmed as AR1 scope (Hard Prohibition is absolute), but it crosses into body territory. If the OpenRouter model wiring for `BuiltinHarnessAdapter` is non-trivial, the test must still ship **zero forbidden tokens** — worst case it gates `requireHarness("builtin")` and any residual OpenAI reference is a blocking violation. Reviewer: verify no `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` survives anywhere.
3. **Pure-logic test location.** Tests live in `packages/`; the pure modules live in `scripts/lib/`. If the TS project boundary rejects a `packages/ → scripts/` relative import under `npm run check`, fall back to the reverted precedent: thin `packages/scripts/` re-export shims (commit `c152d35d` created `packages/scripts/{honest-harness-guard,lib/attestation-floor}.ts`). Prefer the direct import if `check` is happy.
4. **CI enforcement path.** The guard rides `lint` (CI re-runs `lint` live); the floor rides `check-attestation` (CI step). Neither adds a CI **test** job — honors the constraint. If a future change removes `ag7`-style scripts from `lint`, the guard loses CI teeth — keep it in `lint`, not only `verify`.
5. **Agentic set includes currently-stubbed AL6/ah5 integration files.** They execute (stubbed, pass) and so satisfy the floor's "≥1 executed" today. That is acceptable: `requireHarness` + the guard's allowlist track them as known debt for AR2–AR6; the floor's job is only "not everything skipped," which holds.
