# AR1 — Honest Harness Integration Testing: lane collapse + enforcement floor

**Type:** infra / tooling. No UI. No `/design`, no new domain primitive.
**Effort:** L (~2d). **Depends on:** none.

## Summary

The two-archetype testing *prose* already landed (testing.md §two archetypes, both CLAUDE.md tables, the repo-local write-tests/review SKILL.md). AR1 ships the *mechanism* that makes the prose true and stops it drifting, in five parts:

1. **Lane collapse** — delete `.real-harness.test.ts` suffix + `vitest.real-harness.config.ts`; those tests become `*.integration.test.ts` run under the integration config with real-LLM files serialized. Remove `npm run test:real-harness`. Update every naming surface in lockstep.
2. **`requireHarness(name)`** — a shared test util that hard-fails (throws) when the named binary/key is absent, replacing every `skipIf`-on-absence in harness integration tests.
3. **Stub-adapter guard** — a standalone `scripts/honest-harness-guard.ts` check (NOT an eslint rule — justified below) wired into `verify`. Three sub-checks: lane/suffix/skipIf checks **enforce immediately**; the stub-adapter content check **starts as a known-debt allowlist report** so it does not break `main` before AR2–AR6 convert the ~30 offenders.
4. **Attestation executed-count floor** — `verify-attest.ts` runs the integration leg once with `--reporter=dot --reporter=json --outputFile=<os.tmpdir()>` (outside the tree → no `dirty` flip), reads per-file counts, applies the single-sourced `isHarnessFacingIntegration` predicate to select agentic files, embeds executed + skipped in the HMAC-signed payload; `check-attestation.ts` fails when the agentic set is **empty** (W5) OR reports **zero executed**. Missing results json → fail closed (C1).
5. **Skill guidance** — the two repo-local SKILL.md files already carry the harness-out-of-mockables prose (write-tests §2) and the stubbed-seam tripwire (review Lens 4). AR1 keeps them in lockstep with the shipped lane structure (drop the "until those land, follow by hand" framing once enforced). See **Decision 4** for the plugin-cache wrinkle.

---

## Required reading (engineer reads before implementing)

- `.claude/rules/testing.md` — §"Integration tests: two archetypes", naming table, §Structure. The lockstep target.
- `CLAUDE.md` — both test tables (lines ~41-47 "Which command to use when", ~59-64 "Test file naming") + the "Harness-facing integration tests" callout.
- `.claude/skills/write-tests/SKILL.md` §2 (line 19) — harness-facing carve-out; `.claude/skills/review/SKILL.md` Lens 4 (line 116) — stubbed-seam tripwire.
- `scripts/ah5-no-mock-guard.ts`, `scripts/ah6-no-mock-guard.ts`, `scripts/mock-inventory.ts` — the in-repo **standalone-script** precedent the new guard follows (tsx script, wired into `verify`, fail-closed-on-zero-inspected-files). **NOT an allowlist precedent** — none of these has allowlist machinery; the allowlist is net-new to this WP (Decision 3).
- `scripts/verify-attest.ts` (note: `execSync(ATTESTED_COMMAND, {stdio:"inherit"})` at line 96 reads NO file — the count-read is net-new; `.verify-attestations/<sha>.json` is git-tracked so the dirty gate is `git status --porcelain` at line 89), `scripts/check-attestation.ts` (dirty gate line 146, `srcHash?` optional-field precedent line 60) — the attestation pair; AR1 is **additive** to both. verify-attest imports `isHarnessFacingIntegration` from `scripts/honest-harness-guard.ts` (a tsx-runnable `.ts`, not a compiled artifact — S3 import-safe; verify-attest already runs under tsx).
- `vitest.integration.config.ts`, `vitest.real-harness.config.ts`, `vitest.config.ts`, `packages/server/vitest.config.ts`, `package.json` test scripts — the lane configs.
- `packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement.real-harness.test.ts` (lines 80-100) — the `binaryPresent`/`claudeInstalled` pattern `requireHarness` replaces.
- `packages/shared/src/harness/mock-harness-adapter.ts` — the legit unit-test stub the guard must NOT false-positive in `*.test.ts`.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| 4× `.real-harness.test.ts` files | Confirmed: `AL6-real-harness-return-enforcement`, `AL7-two-session-trust-first`, `cli-adapter-real-binary`, `AN2-connection-provisioning` (all in `packages/server/src/harness/__tests__/`) | Rename all 4 to `*.integration.test.ts` (bodies preserved). |
| One `.real-harness` mislabeled as `.integration` (the AN1 lore) | Confirmed: `AN1-real-harness-inherited.integration.test.ts` is a real-harness test excluded by a glob in `vitest.integration.config.ts:23` | Folds in naturally — drop that exclude line; the file already has the right suffix. |
| `test:real-harness` script exists | Confirmed `package.json:22` | Remove (not repurpose — nothing else needs it). |
| `vitest.real-harness.config.ts` is referenced only by the script | **Also** referenced by `packages/server/vitest.config.ts:13` (excludes `*.real-harness.test.ts` from the unit lane) and `vitest.integration.config.ts:23` (excludes the AN1 mislabel) | Update both configs in lockstep when the suffix dies. |
| `skipIf`-on-absence only in harness tests | Confirmed harness-facing ones in 8 files (AL6, AL7, AM2×3, AN1, AN2, cli-adapter, session-provisioning, AM2-builtin-gateway). **Also**: `migration-l1.integration.test.ts:345` (`!HAS_PG`) and `AO1-reachability-lane-b` (`SKIP`) — **NOT harness, NOT in scope** | `requireHarness` replaces only the **harness/key** `skipIf`s. The PG/reachability skips are out of scope (they gate on DB driver, not harness). The guard's skipIf check is scoped to harness-facing files (Decision 2). |
| `scripts/verify-attest.ts` records exit code only | Confirmed — payload has `status` from `ATTESTED_COMMAND` exit, no counts | Add `agenticExecuted`/`agenticSkipped` to payload + HMAC. |
| eslint-plugin-design / authz show custom-rule pattern | Confirmed, but **`scripts/ah5-no-mock-guard.ts` is the closer precedent for the script *form*** (standalone tsx, fail-closed-on-zero, wired into verify). It has **no allowlist** — the allowlist is net-new (Decision 3). | Guard = standalone script (form follows ah5); allowlist machinery is owned as new (Decision 3). |
| write-tests/review guidance to edit | **Repo-local** `.claude/skills/{write-tests,review}/SKILL.md` are git-tracked and already carry the prose; the substantive `references/test-layers.md`/`lenses.md` live ONLY in the plugin cache `~/.claude/plugins/cache/agent-pipeline/...` (sourced from `ambrovia/agent-skills-pipeline`, NOT this repo) | Edit the repo-local SKILL.md files (the in-repo source of truth builders read). Plugin-cache references are upstream — out of this repo's PR. See Decision 4. |
| "30 stubbed offenders" | ~31 harness-path integration files import the adapter/provision seam; 10 construct a named scripted/echo/capturing adapter; 6 `vi.mock` the llm-client/harness in an integration test | Allowlist is generated from a real scan, not hand-typed (Decision 3). |

---

## Decision 1 (design-it-twice): guard mechanism — eslint rule vs standalone check script

**Option A — eslint rule** (`packages/eslint-plugin-design` or a new `eslint-plugin-test-honesty`).
AST-precise; runs in the existing `npm run lint` pass; reports at file:line in-editor.
*Reject:* (1) The strongest signal — "this integration test is harness-facing" — is a **path + import** heuristic, not an AST shape; eslint's per-file model still works, but (2) the lane/suffix/`test:real-harness`-reference checks span *config files and package.json*, which eslint does not lint; (3) the executed-count is orthogonal. A rule covers only one of the three sub-checks, so we'd ship a rule **plus** a script anyway. (4) The allowlist-as-report mode (start permissive, tighten later) is awkward in eslint (severity is binary per-rule).

**Option B — standalone `scripts/honest-harness-guard.ts`** wired into `verify` (script *form* follows `ah5-no-mock-guard.ts`: tsx, fail-closed-on-zero-inspected, in the `verify` chain).
One process owns all four static checks (lane/suffix, skipIf-on-harness, stub-adapter content, `test:real-harness` reference). The allowlist (Decision 3) is a JSON file the script reads — **net-new machinery, not inherited from ah5** (ah5 has no allowlist; verified). The script *form* is the established in-repo pattern; the allowlist + report-mode is owned as new code with its own test (W3/Decision 3).
*Reject:* no in-editor squiggle; not AST-precise (regex/substring heuristics) → must be conservative to avoid false positives.

**Pick: B (standalone script).** The guard's job is cross-file static enforcement over tests *and* configs *and* package.json — a shape only a script (not eslint) can span. The script *form* matches `ah5-no-mock-guard.ts`; the phased allowlist is new and carries its own test burden (Decision 3, W3). An eslint rule would cover one third of it and still need the script. `@lore`: regex heuristics are conservative by design; the real teeth is `requireHarness` (runtime hard-fail) + the attestation floor, not the static guard. The guard is the *tripwire that stops a new offender*, not the proof of correctness.

## Decision 2 (design-it-twice): harness-facing detection heuristic (the guard's crux)

The guard must flag a stubbed adapter **only** in a `*.integration.test.ts` that is harness-facing, never in (a) a `*.test.ts` unit that legitimately stubs, or (b) a web/service `*.integration.test.ts` that never touches the harness.

**Option A — path-only** (`/harness/__tests__/` or filename prefix). Simple, zero false positives on web/service tests.
*Reject:* misses harness-facing tests that live in `src/__tests__/` (e.g. `AF10-provisioning-cost-delta`, `AD2-task-dispatcher`, `R1-wire-agent-execution` all import the seam but sit outside `harness/`). Under-enforces.

**Option B — import-based.** A `*.integration.test.ts` is harness-facing iff its source imports any of the *production harness seam* modules:
`harness/adapter-pool`, `harness/cli-harness-adapter`, `harness/builtin-harness-adapter`, `harness/remote-harness-adapter`, `harness/llm-client`, or `services/session-provisioning` (`provisionSession`/`admitSession`/`runSession`).
Precise: web/service tests never import these; unit `*.test.ts` are out of scope by suffix.
*Reject (mitigated):* a harness-facing test that touches the seam *only transitively* (through a helper) is missed — acceptable; those are rare and AR2–AR6 convert them by hand.

**Pick: B (import-based), suffix-gated.** Detection set =
`endsWith(".integration.test.ts")` AND imports one of the seam modules above.
Within that set the guard flags, as a **violation**:
- construction of a fake/scripted adapter: regex for `new ScriptedAdapter`/`ScriptedHarness`/`EchoHarnessAdapter`/`CapturingHarnessAdapter`/`MockHarnessAdapter`/`makeBuiltinPool`, OR a `class … implements HarnessAdapter` defined in the test, OR an import of `mock-harness-adapter`;
- `vi.mock("…harness/llm-client")` / `vi.mock("…/harness/…")` / `vi.mock(".*callLlm.*")`;
- `skipIf(`…`Installed)` / `skipIf(!…)` keyed on a harness/key probe.

This set is computed once; the lane/skipIf checks enforce immediately, the stub-adapter construction check is allowlisted (Decision 3). `MockHarnessAdapter` in a `*.test.ts` unit is **never** seen (wrong suffix) — no false positive on the legit stub.

## Decision 3: the known-debt allowlist (phased enforcement) — NET-NEW machinery, owned

**This is new code, not a copied pattern.** Verified: `ah5-no-mock-guard.ts` (read in full) and `ah6`/`mock-inventory` have **no allowlist, no `--write`, no baseline** — `grep allowlist|baseline|--write|known.*debt` returns nothing. AR1 owns the allowlist as new machinery with its own self-test (W3 / §Verification method details / task 12). What AR1 inherits from `ah5` is only the **fail-closed-on-zero** discipline (`ah5-no-mock-guard.ts:56-68`).

The spec's plan-call: the **content** check (stub-adapter construction / `vi.mock`) MAY start as a report with a known-debt allowlist so it does not break `main` before AR2–AR6 convert the ~30 offenders; the **lane/skipIf/filename** checks enforce immediately.

**File format** — `scripts/honest-harness-guard.allowlist.json`, a JSON object (not a bare array, so it can carry a schema note + version for future churn):
```jsonc
{
  "$comment": "Known-debt stubbed harness adapters — shrinks monotonically as AR2–AR6 convert each. A path here that the guard finds CLEAN fails the guard (remove the line). Never add by hand: regenerate via --write-allowlist.",
  "version": 1,
  "stubbedHarnessIntegration": [
    "packages/server/src/harness/__tests__/<offender>.integration.test.ts",
    "packages/server/src/__tests__/<offender>.integration.test.ts"
  ]
}
```
- Repo-relative paths, sorted, exempt from the **stub-adapter content** check **only** (never from skipIf/lane/filename checks).
- Generated by `npm run honest-harness-guard -- --write-allowlist` from a real scan at AR1 ship time (the true offender set, not hand-typed). Committed.

**How the guard reads + enforces it (the monotonic-shrink rule, owned):**
1. Compute the agentic set (Decision 2 predicate). For each agentic file, detect whether it constructs a stub adapter / `vi.mock`s the harness (the content check).
2. A file that is **dirty (has a stub)** AND **on the allowlist** → tolerated (known debt). PASS.
3. A file that is **dirty** AND **NOT on the allowlist** → **VIOLATION** (a new offender). FAIL.
4. A file on the allowlist that the guard finds **clean** (no stub) → **VIOLATION** "remove `<path>` from the allowlist — it no longer has a stubbed harness adapter." FAIL. This is the monotonic-shrink rule: AR2–AR6 convert a file, must remove its line, guard enforces it forever after.
5. An allowlist entry whose **path no longer exists** (file renamed/deleted) → **VIOLATION** "stale allowlist entry `<path>` — file not found." FAIL (prevents a renamed offender hiding behind a dead allowlist line).

The skipIf-on-harness, lane/suffix, and `test:real-harness`-reference checks are **never** allowlisted — they enforce from AR1's merge. (Every `skipIf`-on-harness is converted to `requireHarness` *in this WP*, so there is no debt to allow.)

**Test burden (W3/C2):** the allowlist's three fail rules (3 new-offender, 4 clean-but-allowlisted, 5 stale-entry) are covered by the guard self-test fixtures (§Verification method details / task 12), each asserting the exit code, so a regression in the allowlist logic is caught — not "proven by hand at ship."

`@lore`: the allowlist is net-new (no ah5 precedent); it is for the *stub-adapter construction* debt only; AR1 itself clears the skipIf debt, so skipIf enforcement needs no allowlist.

## Decision 4: the skill-guidance surface (which file builders actually read)

The acceptance criterion ("write-tests carves harness out of mockable externals; review gains a stubbed-adapter tripwire") is **already satisfied in the repo-tracked** `.claude/skills/write-tests/SKILL.md` (§2 line 19) and `.claude/skills/review/SKILL.md` (Lens 4 line 116) — both git-tracked in *this* repo. The richer `references/test-layers.md` ("mock only nondeterministic externals: LLM/model calls, network") and `references/lenses.md` live ONLY in the plugin cache (`~/.claude/plugins/cache/agent-pipeline/...`), sourced from the separate `ambrovia/agent-skills-pipeline` repo — **not editable in this PR**.

**Plan (W4 — precise framing, the invitation is NOT "gone"):** edit the repo-local SKILL.md files (the in-repo source of truth HyperIdle builders read) to (a) keep the carve-out + tripwire prose, and (b) drop the "until those land, follow the rule by hand" provisional framing now that the mechanism enforces it.

The AC is **met at the repo surface**: `.claude/skills/write-tests/SKILL.md:19` carves the harness out of mockable externals, and that is the surface HyperIdle builders read. But the plugin-cache `test-layers.md:22` "mock only nondeterministic externals: LLM/model calls, network" line **remains reachable** — it is loaded **on demand from write-tests** (its header says "Loaded on demand"), so a builder who follows the reference still reaches it. The override is editorial, not mechanical — nothing in this repo stops the on-demand load. State both precisely:
- **Repo surface (AC met, in this PR):** repo-local SKILL.md carves the harness out; the guard + `requireHarness` + floor enforce it mechanically.
- **Upstream residual (out-of-PR follow-up, R1):** `test-layers.md:22` / `lenses.md` live in `~/.claude/plugins/cache/agent-pipeline/...` sourced from `ambrovia/agent-skills-pipeline` — **not editable in this PR**. The "mock the LLM" invitation is **still reachable** via on-demand load; filed as an upstream follow-up + a `@lore`. Do **not** claim it is gone. **R1 (below).**

---

## requireHarness — shape, signature, location

**Location:** `packages/server/src/harness/__tests__/require-harness.ts` (a test-support module beside the tests that use it; not a `.test.ts`, so no suite runs it). Exported for reuse by AR2–AR6.

**Why server, not shared:** the only consumers are server harness integration tests; the binary/key probe (`which claude`, env-var presence) is server-test infra, not a shared runtime concern.

**ENV_KEY vocabulary is keyed to the REAL gates (W1 — verified per-file, not assumed).** The gate set differs by test:
- `AM2-builtin-gateway.integration.test.ts:34-35` gates on **`OPENAI_API_KEY` specifically** ("OPENAI_API_KEY must be present specifically — other keys use different provider paths") — it probes the openai-compatible path.
- `AM2-real-harness-discovery.integration.test.ts:22-24` gates on **any-of-three** (`ANTHROPIC_API_KEY ?? OPENAI_API_KEY ?? OPENROUTER_API_KEY`) — discovery is provider-agnostic.
- `session-provisioning.integration.test.ts:117` (real path `packages/server/src/__tests__/`) gates on **`ANTHROPIC_API_KEY`**.

So `requireHarness("gateway-key")` (any-of-three) is **wrong** for `AM2-builtin-gateway` — that file needs `OPENAI_API_KEY` specifically. The vocabulary carries distinct names per real gate:

```ts
// packages/server/src/harness/__tests__/require-harness.ts
import { execFileSync } from "node:child_process";

/** The harnesses/keys a test can require — each name maps to the EXACT gate the
 *  corresponding test body checks (verified per-file; see §Route checklist). */
export type HarnessName =
  | "claude" | "codex" | "opencode" | "gh"
  | "openai-key"        // OPENAI_API_KEY specifically — AM2-builtin-gateway's openai-compatible path
  | "anthropic-key"     // ANTHROPIC_API_KEY — session-provisioning's claude-config proxy
  | "any-gateway-key";  // any of the three — AM2-discovery's provider-agnostic gate

const BINARY: Partial<Record<HarnessName, string>> = {
  claude: "claude", codex: "codex", opencode: "opencode", gh: "gh",
};
const ENV_KEY: Partial<Record<HarnessName, readonly string[]>> = {
  "openai-key": ["OPENAI_API_KEY"],
  "anthropic-key": ["ANTHROPIC_API_KEY"],
  "any-gateway-key": ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"],
};

function present(name: HarnessName): boolean {
  const bin = BINARY[name];
  if (bin) {
    try { execFileSync("which", [bin], { stdio: "ignore" }); return true; } catch { return false; }
  }
  const keys = ENV_KEY[name];
  if (keys) return keys.some((k) => !!process.env[k]);
  return false;
}

/**
 * Hard-fail when the named harness/key is absent. Throws (does NOT skip) so the
 * suite goes RED and the agent stops with a "cannot complete" message.
 * Call at the top of the file or describe block — never inside skipIf.
 */
export function requireHarness(...names: HarnessName[]): void {
  const missing = names.filter((n) => !present(n));
  if (missing.length > 0) {
    throw new Error(
      `requireHarness: ${missing.join(", ")} not installed/configured — harness integration ` +
      `test cannot complete. Install the binary / set the key, or demote this to a *.test.ts unit. ` +
      `(AR1: never skipIf to green.)`,
    );
  }
}
```

**Usage migration** (replaces `test.skipIf(!claudeInstalled)(...)`):
```ts
// top of the harness integration file, module scope
requireHarness("claude");           // throws at load if absent → file fails RED
// ...then plain test("...", async () => { ... }) — no skipIf wrapper
```
For multi-harness files (AL6, AL7 cover claude+codex+opencode), call per-`describe`:
```ts
describe("claude", () => { requireHarness("claude"); test(...); });
describe("codex",  () => { requireHarness("codex");  test(...); });
```
A throw in a `describe` callback fails that block's collection → RED, not skip. `@lore`: throwing in `describe` body (collection phase) is the vitest idiom for "this whole block cannot run"; throwing in module scope fails the file.

**Scope note:** AR1 introduces `requireHarness` and **migrates the existing `skipIf`-on-harness call sites' guard mechanism** (skipIf → requireHarness) in the 8 harness files, preserving every assertion body (per spec: AR1 moves the lane, AR6 rewrites bodies). The PG/reachability `skipIf`s are untouched.

---

## Lane-collapse mechanics

### Files renamed (suffix `.real-harness.test.ts` → `.integration.test.ts`, bodies preserved)
1. `packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement.real-harness.test.ts` — **collision:** a sibling `AL6-real-harness-return-enforcement.integration.test.ts` already exists (the scripted duplicate). Rename the real one to `…-real-harness-return-enforcement.integration.test.ts` would clash. **Resolution:** rename the real-harness file to a distinct name `AL6-return-enforcement-realbinary.integration.test.ts`; the scripted `.integration` duplicate is AR6's to remove. Record the rename for AR6.
2. `AL7-two-session-trust-first.real-harness.test.ts` → `AL7-two-session-trust-first.integration.test.ts`.
3. `cli-adapter-real-binary.real-harness.test.ts` → `cli-adapter-real-binary.integration.test.ts`.
4. `AN2-connection-provisioning.real-harness.test.ts` → `AN2-connection-provisioning.integration.test.ts`.

Each renamed file: replace its local `binaryPresent`/`claudeInstalled` + `test.skipIf(!installed)` with `import { requireHarness } from "./require-harness.js"` + a module/`describe`-scope `requireHarness(...)`.

### Config changes
- **Delete** `vitest.real-harness.config.ts`.
- `vitest.integration.config.ts`:
  - Remove the `**/harness/__tests__/*real-harness*.integration.test.{ts,tsx}` exclude (line 23) — the AN1 mislabel + the renamed files now run as integration.
  - **Serial execution for real-LLM/CLI files (W2 — LOCKED, cross-file mechanism).** The rate-limit constraint is **cross-file** (parallel real-LLM calls across 4 workers hit provider rate limits), so `describe.sequential` is the **wrong primitive** — it serializes tests *within* one file, not *across* files. The correct mechanism is **a single worker for the harness lane**. Verified: `vitest.config.ts:17` already uses `projects` — so a two-project integration config is the established repo pattern, not a new abstraction.

    **Locked shape — `vitest.integration.config.ts` becomes a two-project config:**
    ```ts
    // vitest.integration.config.ts
    export default defineConfig({
      test: {
        // shared: timeouts, reporters, setupFiles, isolate stay here (project-inherited)
        hookTimeout: 120_000, testTimeout: 120_000,
        reporters: ["dot"], isolate: true,
        setupFiles: ["packages/db/src/vitest-integration-setup.ts"],
        projects: [
          {
            // service integration — parallel, fast, deterministic (the old behavior)
            test: {
              name: "integration-service",
              include: ["packages/**/*.integration.test.{ts,tsx}"],
              exclude: ["**/harness/__tests__/**", /* + any src/__tests__ harness-facing file, see note */],
              maxWorkers: 4, minWorkers: 4,
            },
          },
          {
            // harness integration — SERIAL across files (real LLM/CLI, rate-limited)
            test: {
              name: "integration-harness",
              include: ["packages/**/harness/__tests__/*.integration.test.{ts,tsx}",
                        "packages/server/src/__tests__/session-provisioning.integration.test.ts"],
              maxWorkers: 1, minWorkers: 1,   // ← THE cross-file serialization. One worker = one file at a time.
              fileParallelism: false,         // belt-and-braces: never parallelize files in this project
            },
          },
        ],
      },
    });
    ```
    `maxWorkers: 1` + `fileParallelism: false` on the harness project means **at most one harness file runs at a time across the whole lane** — that is what "real-LLM files run serially to respect rate limits" requires. The AN1 mislabel exclude (old line 23) is gone — AN1 now runs in the harness project by its `harness/__tests__/` path. ⚠️ UNVERIFIED only the exact `fileParallelism` key name under a project's `test` block in vitest 4 — engineer confirms against vitest 4 config docs before commit; `maxWorkers:1` alone already serializes (it is the load-bearing option; `fileParallelism:false` is redundant insurance). `@lore`: the harness project is selected by path (`harness/__tests__/` + the one session-provisioning file), not by a per-file directive — survives renames within `harness/__tests__/` and needs no in-file opt-in. Note: a harness-facing file outside `harness/__tests__/` (only `session-provisioning` today) must be listed explicitly in the harness project's include AND excluded from the service project — recorded for AR2–AR6 if they add more.
- `vitest.config.ts` (root unit lane): unchanged (already excludes `*.integration.test.{ts,tsx}`; the `.real-harness` files now match that exclude via their new suffix).
- `packages/server/vitest.config.ts:13`: change `exclude: ["**/*.integration.test.{ts,tsx}", "**/*.real-harness.test.ts"]` → `exclude: ["**/*.integration.test.{ts,tsx}"]` (the second glob is now dead — the suffix is gone).

### package.json
- **Remove** `"test:real-harness": "vitest run --config vitest.real-harness.config.ts"` (line 22).
- `"verify"` chain: add `&& npm run honest-harness-guard:selftest && npm run honest-harness-guard:check` after `ah6-mock-guard:check` (selftest first — a broken guard must fail before it green-lights anything; W3).
- Add scripts:
  - `"honest-harness-guard": "npx tsx scripts/honest-harness-guard.ts"`
  - `"honest-harness-guard:check": "npx tsx scripts/honest-harness-guard.ts --check"`
  - `"honest-harness-guard:selftest": "npx tsx scripts/honest-harness-guard.ts --selftest"` (W3 — runs the fixture self-test in `verify`).
- `test:integration` / `test:all` unchanged in shape — they now pick up the folded-in files via the integration config's widened include.

### knip
- `vitest.real-harness.config.ts` deletion + `test:real-harness` removal may leave knip flagging the binary/config. Run `npm run knip` after; remove any now-unused entry. `sharedFiles` flags package.json.

---

## Attestation executed/skipped wiring (C1 — exact mechanism, locked)

**The reality this must respect (verified against the real files):**
- `package.json:21` — `"test:all": "npm run test && npm run test:integration"` — **two separate vitest invocations**. The agentic/harness tests live in the **`test:integration`** leg (`vitest.integration.config.ts`), never in the unit `test` leg. So the json reporter goes onto **`test:integration`**, not `test:all` and not `test`.
- `vitest.integration.config.ts:25` — `reporters: ["dot"]`. A bare `--reporter=json` CLI override **replaces** the dot reporter (you lose console output). Must pass **both**: `--reporter=dot --reporter=json`.
- `verify-attest.ts:96` — `execSync(ATTESTED_COMMAND, { stdio: "inherit" })`, where `ATTESTED_COMMAND = "npm run test:all"`. It captures **only the exit code** and **reads no file**. The count-read is net-new wiring.
- `.verify-attestations/<sha>.json` is **git-tracked** (verified: `git ls-files .verify-attestations/` returns a committed file). The `dirty` flag is `git status --porcelain` (`verify-attest.ts:89`). Therefore **any `--outputFile` written inside the repo working tree — tracked OR untracked — flips `dirty` and breaks the attestation's own dirty gate** (`check-attestation.ts:146`). The json results MUST be written **outside the tree**.

### Locked decision: where the json is written

`os.tmpdir()` — a path **outside the repo working tree entirely**, so `git status --porcelain` can never see it and `dirty` cannot flip. Not a gitignored in-tree path (gitignored still risks future `git add -A`/glob accidents and clutters the tree); `os.tmpdir()` is categorically invisible to git.

The path is a **single constant shared by the script that writes it and verify-attest that reads it.** Since both are TS, the cleanest contract is: **verify-attest itself owns the path and passes it to the run** (no separate package.json script needs to know it). Concretely:

```ts
// scripts/verify-attest.ts — new module-level constant
import { tmpdir } from "node:os";
import { join } from "node:path";
const INTEGRATION_RESULTS_PATH = join(tmpdir(), "hyperidle-integration-results.json");
```

### Locked decision: how the json is emitted (single run, no double-cost)

Do **not** add a flag to the `test:integration` package.json script (that would force the json path on every plain `npm run test:integration` invocation and couple the script to `os.tmpdir`). Instead, **verify-attest runs the integration leg itself with the reporter flags**, so the json is a side effect of the run it already does. Replace the single `execSync("npm run test:all")` with the two legs verify-attest already attests (`ATTESTED_TOOLS = ["test", "test:integration"]`), the second leg carrying the reporter flags:

```ts
// scripts/verify-attest.ts — replaces the single execSync at line 96
let status: "passed" | "failed" = "passed";
try {
  // unit + component leg — unchanged behavior, exit code only
  execSync("npm run test", { stdio: "inherit" });
  // integration leg — same suite, PLUS json results to a tmp path (outside the tree)
  execSync(
    `npx vitest run --config vitest.integration.config.ts ` +
    `--reporter=dot --reporter=json --outputFile=${INTEGRATION_RESULTS_PATH}`,
    { stdio: "inherit" },
  );
} catch {
  status = "failed";
}
```
This runs the **same** integration suite once (no double real-LLM cost — R3 resolved), keeps the dot console output, and drops the per-file json at `INTEGRATION_RESULTS_PATH`. `status` still derives from a thrown non-zero exit on either leg. `@lore`: the integration suite is run via the explicit `vitest run --config …` form rather than `npm run test:integration` so verify-attest controls the reporter+outputFile without mutating the shared package.json script.

> **vitest 4 json reporter shape** (verified against vitest 4 docs — json reporter): top-level `testResults[]` (one per file) each with `assertionResults[]` carrying `status: "passed"|"failed"|"skipped"|"pending"|"todo"` and the file path on the parent. `@lore`: `pending`/`todo` count as "skipped" for the floor.

### Count extraction (single-sourced predicate)

After the run, verify-attest reads `INTEGRATION_RESULTS_PATH` and, for each `testResults` file entry, applies the **same** `isHarnessFacingIntegration(filePath, source)` predicate the guard uses — imported from `scripts/honest-harness-guard.ts` (single source of truth; W3 unit-tests it). For files the predicate flags agentic:
- `agenticExecuted` += assertions with status `passed` | `failed`.
- `agenticSkipped` += assertions with status `skipped` | `pending` | `todo`.

`source` is read from disk per file path (the predicate needs the imports, not just the path). Files outside `packages/**` or not matching `*.integration.test.ts` are skipped before the predicate (cheap pre-filter).

### Failure behavior when the json is ABSENT (fail closed — C1.d)

If `INTEGRATION_RESULTS_PATH` does **not exist** after the run (e.g. the integration leg crashed before the reporter flushed), verify-attest **does not** silently mint `agenticExecuted: undefined`. It treats a missing results file as a **hard failure**: write `status: "failed"` and `process.exit(1)` with `"verify-attest: integration results json missing — cannot attest the agentic floor"`. A green can never be minted without the counts.

```ts
if (!existsSync(INTEGRATION_RESULTS_PATH)) {
  process.stderr.write("verify-attest: integration results json missing — cannot attest the agentic floor\n");
  process.exit(1);
}
```

### payload (HMAC-covered)

Embed `agenticExecuted`, `agenticSkipped` in the `payload` object **before** `createHmac` (so they are signed — cannot be tampered post-sign). Add to `ATTESTED_TOOLS` nothing new (the tools list is unchanged; the counts are derived from the same `test:integration` run).

### check-attestation.ts (additive — floor + non-empty assertion, W5)

Add, after the existing `status`/`dirty`/`srcHash` checks. **Order matters: the non-empty assertion fires first** (W5), so a predicate that selects zero agentic files FAILS rather than passing vacuously:
```ts
// W5: a green cannot be minted on an EMPTY agentic set. If the attestation carries
// the counts at all (post-AR1), the agentic surface MUST be non-empty — a predicate
// that selected zero files (or a suite that ran zero agentic tests) is itself the
// 100%-skipped-mints-green hole this track closes.
if (typeof attestation.agenticExecuted === "number") {
  const total = attestation.agenticExecuted + (attestation.agenticSkipped ?? 0);
  if (total === 0) {
    fail("agentic harness integration set is EMPTY (zero agentic tests collected) — " +
         "the executed-count floor cannot be vacuously satisfied (AR1 floor / W5).");
  }
  if (attestation.agenticExecuted === 0) {
    fail("agentic harness integration tests reported ZERO executed — " +
         "a green cannot be minted on a 100%-skipped agentic surface (AR1 floor).");
  }
}
```
- **Back-compat:** a legacy attestation without the field (`agenticExecuted === undefined`) skips the whole block (additive, not retroactive) — matches the `srcHash?` optional-field precedent (`check-attestation.ts:60`).
- **Why non-empty fires before zero-executed:** the deepest hole (TRACK-AR §15) is not "all skipped" (with `requireHarness`, absence throws → `failed`, not `skipped`, so real skips can't happen) — it is the **predicate selecting nothing** (W3/W5: a broken `isHarnessFacingIntegration` returns an empty agentic set → `executed===0 && skipped===0` → the old zero-executed check passed vacuously). The non-empty assertion closes that. The floor's correctness is now bounded by the predicate's correctness, and the predicate has its own unit test (W3, task 11).
- Update the `Attestation` interface with `agenticExecuted?: number; agenticSkipped?: number;`.

`@lore`: three locks, not two. (1) `requireHarness` — absence throws RED, can't skip. (2) executed-count floor — a green needs ≥1 agentic test that ran. (3) **non-empty floor** — the agentic set itself can't be empty, so a mis-scoped predicate can't silently empty the floor. The non-empty floor is the one that closes the predicate-regression blast radius (W5).

---

## Prose edits (lockstep — all in this PR)

1. **`.claude/rules/testing.md`**
   - §Structure line 35 + naming table line 45: already correct (no `.real-harness`). Verify no residual `.real-harness` mention — line 70's "collapse of the redundant `*.real-harness.test.ts` lane" rewrites to past tense: "the `*.real-harness.test.ts` lane has been collapsed into `*.integration.test.ts`."
   - §two archetypes line 70 (the "Rolling out via Track AR" blockquote): rewrite to "Enforced by Track AR: `requireHarness()` hard-fails on absence, `scripts/honest-harness-guard.ts` rejects a stubbed harness adapter, the attestation floor fails on zero-executed agentic tests, and `*.real-harness.test.ts` has been folded into `*.integration.test.ts`. AR2–AR6 convert the remaining stubbed tests." Drop "Until those land, follow the rule by hand."

2. **`CLAUDE.md`**
   - "Which command to use when" table (line ~46-47): no `test:real-harness` row exists to remove — confirm; if a `test:real-harness` mention exists elsewhere in CLAUDE.md, drop it. (grep found none in CLAUDE.md → no edit needed beyond confirming.)
   - "Test file naming" table line 61 + the "Harness-facing" callout line 64: already correct; append "Enforced via `requireHarness` + `honest-harness-guard` + attestation floor (Track AR)." to the callout so the doc names the mechanism.

3. **`.claude/skills/write-tests/SKILL.md`** §2 (line 19): keep the carve-out; append the enforcement reference: "Enforced by `requireHarness()` + `scripts/honest-harness-guard.ts` — a stubbed harness adapter in a `*.integration.test.ts` fails `verify`." **W4 precision:** this repo-local file is the surface the AC is met on (no "mock the LLM" invitation here). The `test-layers.md:22` invitation lives ONLY in the plugin cache and **remains reachable via on-demand load** — do NOT add prose claiming it is gone; instead note the repo-local carve-out is authoritative for HyperIdle builders and file the upstream fix as R1. Capture as a `@lore` next to the carve-out reference.

4. **`.claude/skills/review/SKILL.md`** Lens 4 (line 116): already carries the tripwire; append "(enforced by `scripts/honest-harness-guard.ts`; a harness-facing AC proven only by a stubbed adapter is a **blocking** finding)."

5. **`vitest.real-harness.config.ts` @lore + `vitest.integration.config.ts:18-23` @lore**: delete the AN1 exclude lore (file deleted / exclude removed).

---

## Ordered task list

| # | Task | Files | Proof |
|---|---|---|---|
| 1 | Add `requireHarness` util | `packages/server/src/harness/__tests__/require-harness.ts` | T-A: unit test `require-harness.test.ts` — `requireHarness("a-binary-that-does-not-exist")` **throws** with the message; a present binary does not throw. |
| 2 | Rename 4 `.real-harness.test.ts` → `.integration.test.ts`; swap `skipIf`→`requireHarness` (bodies preserved) | the 4 files in §Files renamed | T-B: `git diff --stat` shows rename only; assertions unchanged (protectedTests). Files now collected by integration config. |
| 3 | Drop the AN1 `skipIf`s in `AN1-real-harness-inherited.integration.test.ts` → `requireHarness`; same for AM2×3 harness integration files | AN1, AM2-real-harness-discovery/-session-probe/-builtin-gateway | T-C: grep shows zero `skipIf(`…`Installed)` in harness `*.integration.test.ts`. |
| 4 | Collapse configs | delete `vitest.real-harness.config.ts`; edit `vitest.integration.config.ts`, `packages/server/vitest.config.ts` | T-D: `npm run test:integration` collects the folded-in files; real-LLM files run serially. |
| 5 | Remove `test:real-harness`; wire guard into verify; add guard scripts | `package.json` | T-E: `npm run` lists no `test:real-harness`; `verify` chain includes `honest-harness-guard:check`. |
| 6 | Build the guard (incl. allowlist machinery — net-new, Decision 3) + export `isHarnessFacingIntegration` | `scripts/honest-harness-guard.ts`, `scripts/honest-harness-guard.allowlist.json` | T-F (guard self-test, task 12). |
| 7 | Generate the allowlist from a real scan | `--write-allowlist`, commit the JSON | T-G: `npm run honest-harness-guard:check` passes on `main` (offenders allowlisted); a clean file on the allowlist → guard fails ("remove from allowlist"). |
| 8 | Attestation counts (C1) — json to `os.tmpdir()`, single integration run, fail-closed on missing json, payload-signed counts | `scripts/verify-attest.ts`, `scripts/check-attestation.ts` | T-H: see Verification (executed-count floor + W5 non-empty floor + missing-json fail-closed). |
| 9 | Attestation floor self-test (`check-attestation --selftest` + fixture json) | `scripts/check-attestation.ts`, `scripts/__fixtures__/attestation/` | T-H: all-skipped→1, ≥1-executed→0, empty-set→1, legacy-no-counts→0; sanity-break (revert floor → fixture goes green). |
| 10 | Lockstep prose | the 5 surfaces in §Prose edits | T-I: grep for `.real-harness` across `.claude/`, `CLAUDE.md`, `docs/` → only past-tense / historical mentions remain; no surface describes it as a live lane. |
| 11 | **Unit test `isHarnessFacingIntegration` (W3)** — the single-sourced predicate feeding BOTH guard and floor | `packages/server/src/harness/__tests__/is-harness-facing-integration.test.ts` (imports the export from `scripts/honest-harness-guard.ts`) | T-J: vitest unit — positive (seam import→true), false-positive guards (`.test.ts` unit, web `.integration`→false/out-of-set), `mock-harness-adapter` import→true, transitive-only→false (documented miss). Runs in `npm run test`. |
| 12 | **Guard self-test wired into verify (W3)** — fixtures + `--selftest` flag | `scripts/__fixtures__/honest-harness-guard/`, `honest-harness-guard:selftest` script in the `verify` chain | T-F: new-offender→1, legit-unit-stub→0, web-integration→0, clean-but-allowlisted→1, stale-allowlist-entry→1. |
| 13 | knip + full verify | — | `npm run verify` green on a machine WITH binaries. |

---

## Acceptance criteria → verification method

| AC | Verification |
|---|---|
| Two-archetype prose updated in lockstep; never drifts | **Guard sub-check** (`honest-harness-guard --check`): fail if any `.real-harness` live-lane description remains in the 5 prose surfaces, OR if `vitest.real-harness.config.ts` / `test:real-harness` exists while the prose claims collapse. Plus manual grep (T-I). |
| write-tests carves harness out of mockables; review gains tripwire | **Manual** (static doc content) — the repo-local SKILL.md files; confirmed already present, append enforcement refs (T edits). Not a runtime test (doc content per testing.md "asserting on documentation content is nothing"). **W4:** AC met at the repo surface; the plugin `test-layers.md:22` "mock the LLM" invitation remains reachable via on-demand load and is an explicit out-of-PR follow-up (R1) — not claimed gone. |
| `.real-harness` suffix + config gone; tests run as integration (real-LLM serial); `test:real-harness` removed | **Guard sub-check** (fail if any `*.real-harness.test.ts` or `vitest.real-harness.config.ts` exists, or package.json has `test:real-harness`) + `npm run test:integration` collects the renamed files (T-D). |
| `requireHarness(name)` exists, replaces every skipIf-on-absence; absent → run FAILS naming the harness, no skip | **Unit test** `require-harness.test.ts` (throws on absent, message names harness) + **guard sub-check** (zero `skipIf`-on-harness in harness `*.integration.test.ts`). |
| Guard fails build on fake/scripted/echo adapter, `vi.mock` of harness/llm, or skipIf-on-harness in a harness-facing integration test | **(a) `isHarnessFacingIntegration` unit test** (T-J, vitest, W3) — the predicate's false-positive/false-negative contract, runs in `npm run test`. **(b) Guard self-test wired into `verify`** (T-F, task 12) — fixtures asserting exit 1/0 incl. clean-but-allowlisted→1 and stale-entry→1. |
| verify-attest records executed+skipped; check-attestation fails on zero-executed agentic | **Script self-test** (T-H, task 9, `--selftest`): all-agentic-skipped → exit 1; ≥1 executed → exit 0; **empty agentic set → exit 1 (W5 non-empty floor)**; legacy no-counts → exit 0; **missing results json → exit 1 (C1.d fail-closed)**. Sanity-break per mock-validation-trap lore. |
| `npm run verify` passes WITH binaries, fails with requireHarness message WITHOUT | **Manual live-proof** (must execute before DONE per ETHOS): run `verify` on this machine (binaries present) → green; temporarily shadow `which claude` (PATH trick) and run an AL-harness integration file → RED with "cannot complete". Document the run. |

---

## Verification method details (guard + attestation self-tests)

These guard/attestation scripts are **static-property / build tooling** — per `.claude/rules/testing.md` they are NOT vitest tests when they read files / run subprocesses. BUT the **load-bearing pure function** they share — `isHarnessFacingIntegration(filePath, source)` — is a pure string/import function, which IS unit-testable per the testing rules ("if you can express it as `import → expect(thing(...)).toBe(...)` it's a test"). W3 makes it an automated test, not hand-proof:

- **`isHarnessFacingIntegration` unit test (W3 — NEW, the single-sourced predicate, task 11).** `packages/server/src/harness/__tests__/is-harness-facing-integration.test.ts` (or co-located with the export). It imports the function from `scripts/honest-harness-guard.ts` and asserts:
  - **positive:** a `*.integration.test.ts` path whose source imports `harness/cli-harness-adapter` (and each other seam module) → `true`.
  - **false-positive guard #1:** a legit `*.test.ts` unit that imports `mock-harness-adapter` → `false` (wrong suffix, out of set).
  - **false-positive guard #2:** a web/service `*.integration.test.ts` whose source imports only `test-fixtures` / no harness seam → `false`.
  - **false-negative concern:** a `*.integration.test.ts` that constructs the adapter only **transitively** through a helper (no direct seam import) → `false` (documents the known miss; AR2–AR6 convert those by hand — Decision 2's accepted limitation).
  - **the `mock-harness-adapter` import case** (Decision 2): a `*.integration.test.ts` importing `mock-harness-adapter` → `true` (it's a stub in an integration file — exactly the offender).
  Because this predicate is **single-sourced into both the guard AND verify-attest's floor** (C1), this one unit test guards the false-positive/false-negative contract for *both* the guard and the attestation floor. A regression in it now fails this test rather than silently corrupting the floor (the W3/W5 blast-radius concern).
- **Guard self-test (task 12).** `scripts/__fixtures__/honest-harness-guard/` with sample files (offending-integration, legit-unit-stub, web-integration, clean-but-allowlisted, stale-allowlist-entry) and a `--selftest` flag on the guard that asserts exit codes for: new-offender→1, legit-unit-stub→0, web-integration→0, clean-but-allowlisted→1 (Decision 3 rule 4), stale-allowlist-entry→1 (Decision 3 rule 5). **Wired into `verify`** as a fast static check (it reads fixtures, runs in <1s — exactly the CI-fast-check shape): `npm run honest-harness-guard:selftest` runs before `honest-harness-guard:check` in the chain. This is the W3 fix — the guard's contract is an automated regression net in `verify`, not "run by hand at ship."
- **Attestation floor self-test (task 9).** Hand-feed a synthetic results json fixture to a `check-attestation --selftest` path: all-agentic-skipped → exit 1; ≥1 executed → exit 0; **empty agentic set → exit 1** (W5 non-empty floor); no-counts (legacy) → exit 0. **Sanity-break (per mock-validation-trap lore):** revert the floor `if`, re-run with the all-skipped fixture → must go from RED to green, confirming the floor is load-bearing.

---

## Route checklist (skipIf-on-harness migration targets)

Every harness-facing `skipIf`-on-absence the guard enforces against / `requireHarness` replaces. **The env-key column names the EXACT gate each test body checks (W1 — verified, not assumed)** — the migration is NOT a uniform `gateway-key` swap:
- `AL6-real-harness-return-enforcement` (→ renamed) — `requireHarness("claude")`×3, `("codex")`×4, `("opencode")`×5
- `AL7-two-session-trust-first` (→ renamed) — `("claude")`×3, `("codex")`×2, `("opencode")`×2
- `AM2-real-harness-discovery.integration.test.ts` — `("codex")`, `("claude")`, `("opencode")`, cursor(absent-assert, special case below), and the gateway gate (lines 22-24, any-of-three) → **`requireHarness("any-gateway-key")`**
- `AM2-real-harness-session-probe.integration.test.ts` — `("codex")`, `("claude")`, `("opencode")`
- `AM2-builtin-gateway.integration.test.ts` — gates on `OPENAI_API_KEY` **specifically** (line 34) → **`requireHarness("openai-key")`** (NOT `any-gateway-key` — the body needs the openai-compatible path)
- `AN1-real-harness-inherited.integration.test.ts` — `("codex")`×3, `("claude")`×2, `("opencode")`×4, `("gh")`×2
- `AN2-connection-provisioning` (→ renamed) — `("claude")`, `("codex")`, `("opencode")`, `("gh")` (describe-level)
- `cli-adapter-real-binary` (→ renamed) — `("claude")`, `("codex")`, `("opencode")`
- `packages/server/src/__tests__/session-provisioning.integration.test.ts:117` — gates on `ANTHROPIC_API_KEY` → **`requireHarness("anthropic-key")`** (note: lives in `src/__tests__/`, NOT `harness/__tests__/`; the import-based predicate (Decision 2) still flags it agentic via its harness-seam import)

**Explicitly OUT** (not harness, not migrated): `migration-l1.integration.test.ts:345` (`!HAS_PG`), `AO1-reachability-lane-b` (`SKIP`). The guard must NOT flag these — they import no harness seam (Decision 2 set excludes them by import).

**Special case — `cursorInstalled` (`AM2-real-harness-discovery:64`):** `test.skipIf(cursorInstalled)` asserts cursor is *absent/inert* (inverse). This is an assertion-shaped skip, not an availability gate → convert to a plain `test` that asserts cursor is non-spawnable, NOT a `requireHarness`. Flagged for the engineer.

---

## Security & abuse cases

- **Rate-limit on POST/PATCH:** N/A — no new endpoints.
- **Input-trust / agent-authored field:** N/A — no runtime data path; this is build/test tooling.
- **Secret-handling:** `requireHarness("anthropic-key"|"openai-key"|"any-gateway-key")` reads `process.env` presence only (`!!process.env[k]`) — it does **not** log or embed the key value. Confirm the throw message names the *harness/key-class*, never the key value. ✅ addressed in the helper shape.
- **Attestation integrity (the one real abuse surface):** the new `agenticExecuted`/`agenticSkipped` MUST be inside the HMAC-signed `payload` (not appended after signing), else an attacker edits the count to bypass the floor. ✅ addressed — fields go in `payload` before `createHmac` (C1). The results json itself is read from `os.tmpdir()` and never trusted post-sign — only the **signed counts** in the payload gate CI. The `srcHash` source-integrity check prevents swapping the *source* the counts were derived from. The floor is *additive* and never weakens the existing `status`/`dirty`/`srcHash` gates. **The non-empty floor (W5) closes the predicate-empties-the-set bypass.**
- **Path-traversal / SSRF:** N/A — no path input, no outbound URL.

---

## Risks / ambiguities

- **R1 (W4 — AC met at repo surface; upstream invitation still reachable, filed as follow-up).** The "mock only nondeterministic externals: LLM/model calls, network" invitation lives in `~/.claude/plugins/cache/agent-pipeline/.../write-tests/references/test-layers.md:22`, sourced from `ambrovia/agent-skills-pipeline` — **not this repo**, and **loaded on demand from write-tests** (so a builder who follows the reference still reaches it; the override is editorial, not mechanical). **Resolution:** AC is **met** at the repo-local SKILL.md surface (the surface HyperIdle builders read; the guard/requireHarness/floor enforce it). The upstream `test-layers.md:22` line is **not editable in this PR** and **remains reachable** — filed as an out-of-PR follow-up (note + `@lore`). The plan does **not** claim the invitation is gone — only that the repo-local carve-out is authoritative for HyperIdle and the upstream fix is a separate follow-up against `ambrovia/agent-skills-pipeline`.
- **R2 — vitest 4 serial-execution mechanism. LOCKED (W2):** two-project integration config; the harness project runs `maxWorkers:1` (+ `fileParallelism:false` as insurance) — cross-file serial. `projects` is already used in `vitest.config.ts:17` (repo precedent). Only the exact `fileParallelism` key under a project block is ⚠️ UNVERIFIED; `maxWorkers:1` alone is sufficient and load-bearing. No longer an engineer-discovers-mid-build gap.
- **R3 — running integration twice in verify-attest. LOCKED (C1):** verify-attest runs the integration leg **once** via `npx vitest run --config vitest.integration.config.ts --reporter=dot --reporter=json --outputFile=$TMPDIR/...`, dropping the json as a side effect of the run it already does. No second integration run, no double real-LLM cost. The json path is `os.tmpdir()` (outside the tree → cannot flip `dirty`).
- **R4 — AL6 filename collision** (real-harness file vs existing scripted `.integration` duplicate). Resolved by renaming the real one to `AL6-return-enforcement-realbinary.integration.test.ts`; the scripted duplicate's removal is AR6's. Recorded so AR6 doesn't re-collide.
- **R5 — allowlist staleness.** If AR1 ships and AR2 converts a file but forgets to remove its allowlist line, the guard's "clean-but-allowlisted → fail" rule (Decision 3) forces the removal. Good — self-correcting.

---

## protectedTests

**AR1 only moves the lane (spec) — assertion bodies stay frozen across ALL touched harness files**, not just the 4 renamed ones (S2). Every file below may change only: the suffix (renamed 4), the `skipIf`→`requireHarness` swap, and the `require-harness.js` import. **No `expect(...)` change.**

Renamed 4:
- `packages/server/src/harness/__tests__/AL6-return-enforcement-realbinary.integration.test.ts` (was `…-real-harness-return-enforcement.real-harness.test.ts`)
- `packages/server/src/harness/__tests__/AL7-two-session-trust-first.integration.test.ts`
- `packages/server/src/harness/__tests__/cli-adapter-real-binary.integration.test.ts`
- `packages/server/src/harness/__tests__/AN2-connection-provisioning.integration.test.ts`

skipIf→requireHarness only (S2 — also frozen):
- `packages/server/src/harness/__tests__/AN1-real-harness-inherited.integration.test.ts`
- `packages/server/src/harness/__tests__/AM2-real-harness-discovery.integration.test.ts`
- `packages/server/src/harness/__tests__/AM2-real-harness-session-probe.integration.test.ts`
- `packages/server/src/harness/__tests__/AM2-builtin-gateway.integration.test.ts`
- `packages/server/src/__tests__/session-provisioning.integration.test.ts`

DoD audits: `git diff` on these shows only the import line + skipIf→requireHarness swap (and the rename for the 4), no `expect(...)` changes.

## sharedFiles

- `package.json` (scripts) — concurrent WPs touch it.
- `vitest.integration.config.ts`, `vitest.config.ts`, `packages/server/vitest.config.ts` — lane configs.
- `scripts/verify-attest.ts`, `scripts/check-attestation.ts` — attestation pair (any WP changing verify touches these).
- `.claude/rules/testing.md`, `CLAUDE.md`, `.claude/skills/write-tests/SKILL.md`, `.claude/skills/review/SKILL.md` — prose surfaces.

## Migrations (rename/remove enumerated)

- **delete:** `vitest.real-harness.config.ts`; `package.json` `test:real-harness` script.
- **rename:** 4 files (§Files renamed) — update no import sites (they are leaf test files, imported by nothing) except their own `requireHarness` import.
- **edit (exclude removal):** `vitest.integration.config.ts:23`, `packages/server/vitest.config.ts:13`.
- **reference cleanup:** grep-confirmed `test:real-harness`/`real-harness.config`/`real-harness.test` mentions in `docs/agent-layer/harness-capability-descriptor.md`, `docs/process-layer/staged-operation.md`, `packages/server/src/harness/cli-harness-adapter.ts` (comment), `packages/server/vitest.config.ts` (comment) → update each to reflect the collapsed lane (the doc + comment mentions are historical/illustrative; rewrite to the integration-lane reality). `.pipeline/progress/*.json` and `plans/AN2/*` are historical artifacts — leave (git history).
