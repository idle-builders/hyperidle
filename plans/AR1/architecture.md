# AR1 — Honest Harness Integration Testing: lane collapse + enforcement floor

**Type:** infra / tooling. No UI. No `/design`, no new domain primitive.
**Effort:** L (~2d). **Depends on:** none.

## Summary

The two-archetype testing *prose* already landed (testing.md §two archetypes, both CLAUDE.md tables, the repo-local write-tests/review SKILL.md). AR1 ships the *mechanism* that makes the prose true and stops it drifting, in five parts:

1. **Lane collapse** — delete `.real-harness.test.ts` suffix + `vitest.real-harness.config.ts`; those tests become `*.integration.test.ts` run under the integration config with real-LLM files serialized. Remove `npm run test:real-harness`. Update every naming surface in lockstep.
2. **`requireHarness(name)`** — a shared test util that hard-fails (throws) when the named binary/key is absent, replacing every `skipIf`-on-absence in harness integration tests.
3. **Stub-adapter guard** — a standalone `scripts/honest-harness-guard.ts` check (NOT an eslint rule — justified below) wired into `verify`. Three sub-checks: lane/suffix/skipIf checks **enforce immediately**; the stub-adapter content check **starts as a known-debt allowlist report** so it does not break `main` before AR2–AR6 convert the ~30 offenders.
4. **Attestation executed-count floor** — `verify-attest.ts` runs the integration suite with the vitest `json` reporter, records executed + skipped counts for agentic harness tests, embeds them in the signed payload; `check-attestation.ts` fails when agentic harness tests report **zero executed**.
5. **Skill guidance** — the two repo-local SKILL.md files already carry the harness-out-of-mockables prose (write-tests §2) and the stubbed-seam tripwire (review Lens 4). AR1 keeps them in lockstep with the shipped lane structure (drop the "until those land, follow by hand" framing once enforced). See **Decision 4** for the plugin-cache wrinkle.

---

## Required reading (engineer reads before implementing)

- `.claude/rules/testing.md` — §"Integration tests: two archetypes", naming table, §Structure. The lockstep target.
- `CLAUDE.md` — both test tables (lines ~41-47 "Which command to use when", ~59-64 "Test file naming") + the "Harness-facing integration tests" callout.
- `.claude/skills/write-tests/SKILL.md` §2 (line 19) — harness-facing carve-out; `.claude/skills/review/SKILL.md` Lens 4 (line 116) — stubbed-seam tripwire.
- `scripts/ah5-no-mock-guard.ts`, `scripts/ah6-no-mock-guard.ts`, `scripts/mock-inventory.ts` — the in-repo standalone-guard + allowlist precedent the new guard copies.
- `scripts/verify-attest.ts`, `scripts/check-attestation.ts` — the attestation pair; AR1 is **additive** to both.
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
| eslint-plugin-design / authz show custom-rule pattern | Confirmed, but **`scripts/ah5-no-mock-guard.ts` is the closer precedent** (standalone tsx, allowlist, wired into verify) | Guard = standalone script. See Decision 1. |
| write-tests/review guidance to edit | **Repo-local** `.claude/skills/{write-tests,review}/SKILL.md` are git-tracked and already carry the prose; the substantive `references/test-layers.md`/`lenses.md` live ONLY in the plugin cache `~/.claude/plugins/cache/agent-pipeline/...` (sourced from `ambrovia/agent-skills-pipeline`, NOT this repo) | Edit the repo-local SKILL.md files (the in-repo source of truth builders read). Plugin-cache references are upstream — out of this repo's PR. See Decision 4. |
| "30 stubbed offenders" | ~31 harness-path integration files import the adapter/provision seam; 10 construct a named scripted/echo/capturing adapter; 6 `vi.mock` the llm-client/harness in an integration test | Allowlist is generated from a real scan, not hand-typed (Decision 3). |

---

## Decision 1 (design-it-twice): guard mechanism — eslint rule vs standalone check script

**Option A — eslint rule** (`packages/eslint-plugin-design` or a new `eslint-plugin-test-honesty`).
AST-precise; runs in the existing `npm run lint` pass; reports at file:line in-editor.
*Reject:* (1) The strongest signal — "this integration test is harness-facing" — is a **path + import** heuristic, not an AST shape; eslint's per-file model still works, but (2) the lane/suffix/`test:real-harness`-reference checks span *config files and package.json*, which eslint does not lint; (3) the executed-count is orthogonal. A rule covers only one of the three sub-checks, so we'd ship a rule **plus** a script anyway. (4) The allowlist-as-report mode (start permissive, tighten later) is awkward in eslint (severity is binary per-rule).

**Option B — standalone `scripts/honest-harness-guard.ts`** wired into `verify` (exactly like `ah5-no-mock-guard.ts`).
One process owns all four static checks (lane/suffix, skipIf-on-harness, stub-adapter content, `test:real-harness` reference). Allowlist + report-mode is trivial (it's a JSON file the script reads). Matches the established in-repo precedent the spec itself points at.
*Reject:* no in-editor squiggle; not AST-precise (regex/substring heuristics) → must be conservative to avoid false positives.

**Pick: B (standalone script).** The guard's job is cross-file static enforcement over tests *and* configs *and* package.json, with a phased allowlist — precisely the shape `ah5-no-mock-guard.ts` already solved. An eslint rule would cover one third of it and still need the script. `@lore`: regex heuristics are conservative by design; the real teeth is `requireHarness` (runtime hard-fail) + the attestation floor, not the static guard. The guard is the *tripwire that stops a new offender*, not the proof of correctness.

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

## Decision 3: the known-debt allowlist (phased enforcement)

The spec's plan-call: the **content** check (stub-adapter construction / `vi.mock`) MAY start as a report with a known-debt allowlist so it does not break `main` before AR2–AR6 convert the ~30 offenders; the **lane/skipIf/filename** checks enforce immediately.

- `scripts/honest-harness-guard.allowlist.json` — array of repo-relative test paths exempt from the **stub-adapter content** check only. Generated by `npm run honest-harness-guard -- --write-allowlist` from a real scan at AR1 ship time (so it is the true offender set, not hand-typed). Committed.
- A path on the allowlist that the guard finds **clean** (no stub) → the guard **fails** with "remove from allowlist" (the same fail-closed discipline as `ah5-no-mock-guard`'s zero-spec guard). This makes the allowlist shrink monotonically: AR2–AR6 convert a file, remove its line, guard enforces it forever after.
- The skipIf-on-harness and lane/suffix and `test:real-harness`-reference checks are **never** allowlisted — they enforce from AR1's merge. (Every `skipIf`-on-harness is converted to `requireHarness` *in this WP*, so there is no debt to allow.)

`@lore`: the allowlist is for the *stub-adapter construction* debt only; AR1 itself clears the skipIf debt, so skipIf enforcement needs no allowlist.

## Decision 4: the skill-guidance surface (which file builders actually read)

The acceptance criterion ("write-tests carves harness out of mockable externals; review gains a stubbed-adapter tripwire") is **already satisfied in the repo-tracked** `.claude/skills/write-tests/SKILL.md` (§2 line 19) and `.claude/skills/review/SKILL.md` (Lens 4 line 116) — both git-tracked in *this* repo. The richer `references/test-layers.md` ("mock only nondeterministic externals: LLM/model calls, network") and `references/lenses.md` live ONLY in the plugin cache (`~/.claude/plugins/cache/agent-pipeline/...`), sourced from the separate `ambrovia/agent-skills-pipeline` repo — **not editable in this PR**.

**Plan:** edit the repo-local SKILL.md files (the in-repo source of truth) to (a) keep the carve-out + tripwire prose, and (b) drop the "until those land, follow the rule by hand" provisional framing now that the mechanism enforces it. The plugin-cache `test-layers.md:22` "mock the LLM/network" line is an **upstream** change: record it as an out-of-repo follow-up note in the plan and in a `@lore` — AR1 cannot land it here, and the repo-local SKILL.md (which overrides for HyperIdle builders) already corrects it. **Open risk R1 (below).**

---

## requireHarness — shape, signature, location

**Location:** `packages/server/src/harness/__tests__/require-harness.ts` (a test-support module beside the tests that use it; not a `.test.ts`, so no suite runs it). Exported for reuse by AR2–AR6.

**Why server, not shared:** the only consumers are server harness integration tests; the binary/key probe (`which claude`, env-var presence) is server-test infra, not a shared runtime concern.

```ts
// packages/server/src/harness/__tests__/require-harness.ts
import { execFileSync } from "node:child_process";

/** The harnesses/keys a test can require. */
export type HarnessName = "claude" | "codex" | "opencode" | "gh" | "gateway-key" | "anthropic-key";

const BINARY: Partial<Record<HarnessName, string>> = {
  claude: "claude", codex: "codex", opencode: "opencode", gh: "gh",
};
const ENV_KEY: Partial<Record<HarnessName, readonly string[]>> = {
  "gateway-key": ["AI_GATEWAY_API_KEY", "OPENROUTER_API_KEY"],
  "anthropic-key": ["ANTHROPIC_API_KEY"],
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
  - Add **serial execution for real-LLM/CLI files** without serializing the whole 285-file suite. Use a per-file directive: add `// @vitest-environment` is N/A; instead set `test.sequential` is per-test. **Chosen mechanism:** vitest `poolMatchGlobs` is removed in v4; use `test.fileParallelism` config gating via a second project OR `describe.sequential`. **Simplest viable:** keep the integration config `maxWorkers: 4` for service tests, and have each real-LLM file opt into serialization with `describe.sequential(...)` at the top (vitest 4 supports `describe.sequential`). `@lore`: real-LLM files self-declare `describe.sequential` rather than the runner globbing them — survives renames and needs no path list. ⚠️ UNVERIFIED (vitest 4 `describe.sequential` + cross-file rate-limit interaction) — engineer verifies against vitest 4 docs; fallback is a dedicated `maxWorkers:1` integration sub-project matching `**/harness/__tests__/*.integration.test.ts`.
- `vitest.config.ts` (root unit lane): unchanged (already excludes `*.integration.test.{ts,tsx}`; the `.real-harness` files now match that exclude via their new suffix).
- `packages/server/vitest.config.ts:13`: change `exclude: ["**/*.integration.test.{ts,tsx}", "**/*.real-harness.test.ts"]` → `exclude: ["**/*.integration.test.{ts,tsx}"]` (the second glob is now dead — the suffix is gone).

### package.json
- **Remove** `"test:real-harness": "vitest run --config vitest.real-harness.config.ts"` (line 22).
- `"verify"` chain: add `&& npm run honest-harness-guard:check` after `ah6-mock-guard:check`.
- Add scripts:
  - `"honest-harness-guard": "npx tsx scripts/honest-harness-guard.ts"`
  - `"honest-harness-guard:check": "npx tsx scripts/honest-harness-guard.ts --check"`
- `test:integration` / `test:all` unchanged in shape — they now pick up the folded-in files via the integration config's widened include.

### knip
- `vitest.real-harness.config.ts` deletion + `test:real-harness` removal may leave knip flagging the binary/config. Run `npm run knip` after; remove any now-unused entry. `sharedFiles` flags package.json.

---

## Attestation executed/skipped wiring

### verify-attest.ts (additive)
Today `ATTESTED_COMMAND = "npm run test:all"` runs and only its exit code is captured. Change:
1. Run `test:all` as now (status from exit code — unchanged).
2. **Additionally** run the integration suite with the json reporter to a temp file:
   `vitest run --config vitest.integration.config.ts --reporter=json --outputFile=<tmp>/integration-results.json`
   (vitest 4 json reporter emits per-file `assertionResults` with `status: "passed"|"failed"|"skipped"|"pending"` and top-level `numPassedTests`/`numPendingTests`/`numTotalTests`). `@lore`: pending == skipped in vitest's json shape; count both as "skipped".
   To avoid running integration twice, instead make `test:all` itself emit the json (add `--reporter=json --outputFile` to the integration leg) and have verify-attest read that file. Prefer this — single run.
3. **Agentic-harness count extraction:** from the json, select assertion results whose **test file path** matches a harness-facing test (reuse the import-based detection set from the guard — export `isHarnessFacingIntegration(filePath, source)` from `scripts/honest-harness-guard.ts` and import it here so the *definition of "agentic test" is single-sourced* with the guard). Sum:
   - `agenticExecuted` = count of harness-facing assertions with status `passed`|`failed`.
   - `agenticSkipped` = count with status `skipped`|`pending`.
4. Embed `agenticExecuted`, `agenticSkipped` in the `payload` object (so they are covered by the HMAC — cannot be tampered post-sign).

### check-attestation.ts (additive)
Add, after the existing `status`/`dirty`/`srcHash` checks:
```ts
if (typeof attestation.agenticExecuted === "number" && attestation.agenticExecuted === 0
    && (attestation.agenticSkipped ?? 0) > 0) {
  fail("agentic harness integration tests reported ZERO executed (all skipped) — " +
       "a green cannot be minted on a 100%-skipped agentic surface (AR1 floor).");
}
```
- **Back-compat:** a legacy attestation without the field (`agenticExecuted === undefined`) passes the floor (additive, not retroactive) — matches the `srcHash?` optional-field precedent.
- **Why `agenticSkipped > 0` guard:** on a machine with *no harness tests at all in the diff* (executed 0, skipped 0), the floor must not false-fail. The floor fires only when there *were* agentic tests and they *all* skipped. With `requireHarness`, a real skip can't happen (absence throws → failed, not skipped) — so this floor is **defense-in-depth** against the floor itself being eroded later (per spec §"deepest hole").
- Update the `Attestation` interface with `agenticExecuted?: number; agenticSkipped?: number;`.

`@lore`: the executed-count is the second lock; `requireHarness` is the first. Either alone is bypassable (delete requireHarness calls / never write an agentic test); together a green requires ≥1 agentic test that actually ran.

---

## Prose edits (lockstep — all in this PR)

1. **`.claude/rules/testing.md`**
   - §Structure line 35 + naming table line 45: already correct (no `.real-harness`). Verify no residual `.real-harness` mention — line 70's "collapse of the redundant `*.real-harness.test.ts` lane" rewrites to past tense: "the `*.real-harness.test.ts` lane has been collapsed into `*.integration.test.ts`."
   - §two archetypes line 70 (the "Rolling out via Track AR" blockquote): rewrite to "Enforced by Track AR: `requireHarness()` hard-fails on absence, `scripts/honest-harness-guard.ts` rejects a stubbed harness adapter, the attestation floor fails on zero-executed agentic tests, and `*.real-harness.test.ts` has been folded into `*.integration.test.ts`. AR2–AR6 convert the remaining stubbed tests." Drop "Until those land, follow the rule by hand."

2. **`CLAUDE.md`**
   - "Which command to use when" table (line ~46-47): no `test:real-harness` row exists to remove — confirm; if a `test:real-harness` mention exists elsewhere in CLAUDE.md, drop it. (grep found none in CLAUDE.md → no edit needed beyond confirming.)
   - "Test file naming" table line 61 + the "Harness-facing" callout line 64: already correct; append "Enforced via `requireHarness` + `honest-harness-guard` + attestation floor (Track AR)." to the callout so the doc names the mechanism.

3. **`.claude/skills/write-tests/SKILL.md`** §2 (line 19): keep the carve-out; append the enforcement reference: "Enforced by `requireHarness()` + `scripts/honest-harness-guard.ts` — a stubbed harness adapter in a `*.integration.test.ts` fails `verify`." Confirm no "mock the LLM/network" invitation remains (it does not in this file — that line lives only in the plugin-cache `test-layers.md`, see R1).

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
| 6 | Build the guard | `scripts/honest-harness-guard.ts`, `scripts/honest-harness-guard.allowlist.json`, export `isHarnessFacingIntegration` | T-F (guard self-test, see Verification): synthetic fixture with a ScriptedAdapter in an integration file → guard exits 1; same in a `.test.ts` → exit 0; web `.integration.test.ts` → exit 0. |
| 7 | Generate the allowlist from a real scan | `--write-allowlist`, commit the JSON | T-G: `npm run honest-harness-guard:check` passes on `main` (offenders allowlisted); a clean file on the allowlist → guard fails ("remove from allowlist"). |
| 8 | Attestation counts | `scripts/verify-attest.ts`, `scripts/check-attestation.ts` | T-H: see Verification (executed-count floor). |
| 9 | Lockstep prose | the 5 surfaces in §Prose edits | T-I: grep for `.real-harness` across `.claude/`, `CLAUDE.md`, `docs/` → only past-tense / historical mentions remain; no surface describes it as a live lane. |
| 10 | knip + full verify | — | `npm run verify` green on a machine WITH binaries. |

---

## Acceptance criteria → verification method

| AC | Verification |
|---|---|
| Two-archetype prose updated in lockstep; never drifts | **Guard sub-check** (`honest-harness-guard --check`): fail if any `.real-harness` live-lane description remains in the 5 prose surfaces, OR if `vitest.real-harness.config.ts` / `test:real-harness` exists while the prose claims collapse. Plus manual grep (T-I). |
| write-tests carves harness out of mockables; review gains tripwire | **Manual** (static doc content) — the repo-local SKILL.md files; confirmed already present, append enforcement refs (T edits). Not a runtime test (doc content per testing.md "asserting on documentation content is nothing"). |
| `.real-harness` suffix + config gone; tests run as integration (real-LLM serial); `test:real-harness` removed | **Guard sub-check** (fail if any `*.real-harness.test.ts` or `vitest.real-harness.config.ts` exists, or package.json has `test:real-harness`) + `npm run test:integration` collects the renamed files (T-D). |
| `requireHarness(name)` exists, replaces every skipIf-on-absence; absent → run FAILS naming the harness, no skip | **Unit test** `require-harness.test.ts` (throws on absent, message names harness) + **guard sub-check** (zero `skipIf`-on-harness in harness `*.integration.test.ts`). |
| Guard fails build on fake/scripted/echo adapter, `vi.mock` of harness/llm, or skipIf-on-harness in a harness-facing integration test | **Guard self-test** (T-F): 3 synthetic fixtures (offending integration / legit unit-stub / web integration) asserting exit 1 / 0 / 0. False-positive contract is the test. |
| verify-attest records executed+skipped; check-attestation fails on zero-executed agentic | **Script test** (T-H): synthetic json-results fixture with all-agentic-skipped → `check-attestation` exits 1; with ≥1 executed → exits 0; with no agentic tests at all → exits 0. |
| `npm run verify` passes WITH binaries, fails with requireHarness message WITHOUT | **Manual live-proof** (must execute before DONE per ETHOS): run `verify` on this machine (binaries present) → green; temporarily shadow `which claude` (PATH trick) and run an AL-harness integration file → RED with "cannot complete". Document the run. |

---

## Verification method details (guard + attestation self-tests)

These guard/attestation scripts are **static-property / build tooling** — per `.claude/rules/testing.md` they are NOT vitest tests (they read files / run subprocesses). They are proven by:
- **Guard:** a fixtures dir `scripts/__fixtures__/honest-harness-guard/` with three sample files (offending-integration, legit-unit-stub, web-integration) and a tiny runner `scripts/honest-harness-guard.selftest.ts` (or a `--selftest` flag) that asserts exit codes. Wired as a one-shot in CI-fast-checks? **No** — keep it local; assert manually + leave the fixtures so AR2-AR6 reuse. The guard's *real* test is that it flags a known offender and passes a known-clean file (T-F/T-G run by hand at ship).
- **Attestation:** `scripts/check-attestation.ts` already runs in CI fast-checks live. Add a `--selftest` path or a fixture json so the floor logic is exercisable; prove by hand-feeding a synthetic results json (T-H) and observing exit code. **Sanity-break (per mock-validation-trap lore):** revert the floor `if`, re-run with the all-skipped fixture → must go from RED to green, confirming the floor is load-bearing.

---

## Route checklist (skipIf-on-harness migration targets)

Every harness-facing `skipIf`-on-absence the guard enforces against / `requireHarness` replaces:
- `AL6-real-harness-return-enforcement` (→ renamed) — claude×3, codex×4, opencode×5
- `AL7-two-session-trust-first` (→ renamed) — claude×3, codex×2, opencode×2
- `AM2-real-harness-discovery.integration.test.ts` — codex, claude, opencode, cursor(absent-assert), gateway-key
- `AM2-real-harness-session-probe.integration.test.ts` — codex, claude, opencode
- `AM2-builtin-gateway.integration.test.ts` — gateway-key
- `AN1-real-harness-inherited.integration.test.ts` — codex×3, claude×2, opencode×4, gh×2
- `AN2-connection-provisioning` (→ renamed) — claude, codex, opencode, gh (describe-level)
- `cli-adapter-real-binary` (→ renamed) — claude, codex, opencode
- `session-provisioning.integration.test.ts:117` — `ANTHROPIC_API_KEY` (→ `requireHarness("anthropic-key")`)

**Explicitly OUT** (not harness, not migrated): `migration-l1.integration.test.ts:345` (`!HAS_PG`), `AO1-reachability-lane-b` (`SKIP`). The guard must NOT flag these — they import no harness seam (Decision 2 set excludes them by import).

**Special case — `cursorInstalled` (`AM2-real-harness-discovery:64`):** `test.skipIf(cursorInstalled)` asserts cursor is *absent/inert* (inverse). This is an assertion-shaped skip, not an availability gate → convert to a plain `test` that asserts cursor is non-spawnable, NOT a `requireHarness`. Flagged for the engineer.

---

## Security & abuse cases

- **Rate-limit on POST/PATCH:** N/A — no new endpoints.
- **Input-trust / agent-authored field:** N/A — no runtime data path; this is build/test tooling.
- **Secret-handling:** `requireHarness("anthropic-key"|"gateway-key")` reads `process.env` presence only — it does **not** log or embed the key value. Confirm the throw message names the *harness*, never the key value. ✅ addressed in the helper shape.
- **Attestation integrity (the one real abuse surface):** the new `agenticExecuted`/`agenticSkipped` MUST be inside the HMAC-signed `payload` (not appended after signing), else an attacker edits the count to bypass the floor. ✅ addressed — fields go in `payload` before `createHmac`. The `srcHash` source-integrity check already prevents swapping the results json. The floor is *additive* and never weakens the existing `status`/`dirty`/`srcHash` gates.
- **Path-traversal / SSRF:** N/A — no path input, no outbound URL.

---

## Risks / ambiguities

- **R1 (open) — plugin-cache skill source.** The "mock only nondeterministic externals: LLM/model calls, network" invitation (the spec calls out as the out-competing surface) lives in `~/.claude/plugins/cache/agent-pipeline/.../write-tests/references/test-layers.md`, sourced from `ambrovia/agent-skills-pipeline` — **not this repo**. AR1 corrects the repo-local SKILL.md (which HyperIdle builders read and which overrides), but cannot land the upstream `test-layers.md`/`lenses.md` fix here. **Mitigation:** the repo-local SKILL.md explicitly carves the harness out, so the in-repo guidance is correct; file the upstream change as a follow-up (note + `@lore`). *Confirm with reviewer:* is editing the plugin cache in-place acceptable for this PR, or is repo-local SKILL.md the agreed enforcement surface? (My read: repo-local SKILL.md is the surface; plugin = upstream follow-up.)
- **R2 — vitest 4 serial-execution mechanism.** `describe.sequential` + cross-file rate-limit interaction is ⚠️ UNVERIFIED. Fallback: a dedicated `maxWorkers:1` integration sub-project globbing `**/harness/__tests__/*.integration.test.ts`. Engineer verifies against vitest 4 docs before committing the config shape.
- **R3 — running integration twice in verify-attest.** Reading counts must reuse the single `test:all` run's json output (add `--reporter=json --outputFile` to the integration leg of `test:all`), not invoke integration a second time (would double the ~minutes-long real-LLM cost). Engineer wires the json output into `test:all`, not a separate verify-attest run.
- **R4 — AL6 filename collision** (real-harness file vs existing scripted `.integration` duplicate). Resolved by renaming the real one to `AL6-return-enforcement-realbinary.integration.test.ts`; the scripted duplicate's removal is AR6's. Recorded so AR6 doesn't re-collide.
- **R5 — allowlist staleness.** If AR1 ships and AR2 converts a file but forgets to remove its allowlist line, the guard's "clean-but-allowlisted → fail" rule (Decision 3) forces the removal. Good — self-correcting.

---

## protectedTests

The 4 renamed real-harness files' **assertions** must not change (rename + skipIf→requireHarness only):
- `packages/server/src/harness/__tests__/AL6-return-enforcement-realbinary.integration.test.ts` (was `…-real-harness-return-enforcement.real-harness.test.ts`)
- `packages/server/src/harness/__tests__/AL7-two-session-trust-first.integration.test.ts`
- `packages/server/src/harness/__tests__/cli-adapter-real-binary.integration.test.ts`
- `packages/server/src/harness/__tests__/AN2-connection-provisioning.integration.test.ts`

DoD audits: `git log -p` on these shows only the import line + skipIf→requireHarness swap, no `expect(...)` changes.

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
