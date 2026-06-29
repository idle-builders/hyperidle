# AR2 — Architecture (AMENDED): equal harness coverage, mechanically enforced

> **Amendment context.** AR2 shipped (PR #382) covering only `builtin` + `claude`. The founder rejected it: AR1's governing rule says harness-facing integration tests run across **every supported harness**, and AR2 covered a subset. The shipped spec's "Plan calls" said *"at least one CLI binary"* — narrower than the rule — and out-competed it; no mechanical gate caught the gap (the lint guard only bans stubs/`skipIf`/`vi.mock`, and the attestation floor only asserts a GLOBAL `agenticExecuted > 0`). This amendment **hardens the enforcement so equal coverage can never silently regress**, fixes AR2's test to satisfy it, and writes the requirement into the rules + spec.
>
> **Supported harness set (the full matrix):** `builtin` + `claude` + `codex` + `opencode`. (`cursor-agent` is inert/not-spawnable; `gh` is a tool, not an agent harness.) All four gated by `requireHarness(<name>)` — hard-fail on absence, never skip. All four are installed + authed on this machine, so the real matrix runs locally.

The capture seam (`onBeforeTeardown` on `ProvisionSessionDeps`) is **correct and unchanged** — see §5. This document leads with the enforcement gate (§1–2), then the full matrix (§3), the rule text (§4), and the spec fix (§6).

---

## 0. The single source of truth: `SUPPORTED_HARNESSES`

The gap recurs because "the supported set" is implicit — `require-harness.ts` has a `HarnessName` union that includes `gh` (a tool, not an agent harness), the guard has no notion of the set at all, and the attestation floor only knows "non-zero globally." The fix is **one named constant the guard, the helper, and `requireHarness` all read.**

Define it in the path-only predicate lib (already shared by the guard AND the attestation floor — the natural single home both sides import without a package-graph cycle):

`scripts/lib/honest-harness-predicate.ts`
```ts
/**
 * The agent-harness matrix every harness-facing integration test MUST cover.
 * Single source of truth shared by: the coverage check in honest-harness-guard.ts,
 * the SUPPORTED_HARNESS_LANES table in provision-real-session.ts, and (mirrored —
 * see below) requireHarness. `gh` is a TOOL not an agent harness; cursor-agent is
 * inert/not-spawnable — neither is in the matrix.
 */
export const SUPPORTED_HARNESSES = ["builtin", "claude", "codex", "opencode"] as const;
export type SupportedHarness = (typeof SUPPORTED_HARNESSES)[number];
```

`require-harness.ts` keeps its own `HarnessName` union (it still accepts `gh` for tool-gated tests), but its agent-harness members must **structurally equal** `SUPPORTED_HARNESSES`. Rather than import a `scripts/` module into `packages/` (layering: server test-support must not depend on a build script), add a compile-time assertion in `require-harness.ts` that fails `npm run check` if the two drift:

```ts
// require-harness.ts — AR2: SUPPORTED_HARNESSES is the agent-harness matrix; this
// type-level assert keeps require-harness's vocabulary in lockstep with the guard's.
// (Mirrored literal, NOT a cross-layer import — packages/ must not import scripts/.)
const SUPPORTED_HARNESSES_MIRROR = ["builtin", "claude", "codex", "opencode"] as const;
type _AssertCovered = SupportedHarness extends HarnessName ? true : never; // each supported name is a valid HarnessName
```

Decision: a **mirrored literal + type assert**, not a shared import, because the predicate lives in `scripts/` (build tooling) and `require-harness.ts` lives in `packages/server` (test support). Crossing that boundary for a 4-element constant is the wrong coupling; a type assert that fails `check` is the lighter guarantee. The guard's coverage check (which DOES live in `scripts/`) imports `SUPPORTED_HARNESSES` directly.

---

## 1. The lint coverage check — `scripts/honest-harness-guard.ts`

### What's missing today
The guard (read in full) classifies harness-facing files via `isHarnessIntegrationPath` and runs three checks: dead-lane, `skipIf`-on-absent, and stub-content (allowlisted). **None of them assert that a harness-facing test covers the whole matrix.** A single real `claude` lane passes clean — exactly AR2's bug.

### The new check: matrix coverage
Add a **fourth rule** (`coverageViolation`), applied to every selected (`isHarnessIntegrationPath`-true) file, **not allowlistable for partial coverage** the way stubs are — but **stageable** for the not-yet-converted AR3–AR6 files via the existing allowlist (see staging below).

**Detection (path-only guard reasons over source text it already reads):** a harness-facing integration file DECLARES a harness when it contains a `requireHarness("<name>")` call naming it. Parse the declared set from source with a tolerant regex over the file body:

```ts
// honest-harness-guard.ts
const REQUIRE_HARNESS_CALL = /requireHarness\s*\(\s*([^)]*)\)/g;
const HARNESS_NAME_LITERAL = /["']([a-z-]+)["']/g;

/** The set of harness names a file passes to requireHarness(...) across all calls. */
export function declaredHarnesses(source: string): Set<string> {
  const declared = new Set<string>();
  for (const call of source.matchAll(REQUIRE_HARNESS_CALL)) {
    for (const lit of call[1].matchAll(HARNESS_NAME_LITERAL)) declared.add(lit[1]);
  }
  return declared;
}

/** A selected file must declare EVERY supported harness. Returns the missing ones. */
export function missingHarnesses(source: string): SupportedHarness[] {
  const declared = declaredHarnesses(source);
  return SUPPORTED_HARNESSES.filter((h) => !declared.has(h));
}
```

Rule, added inside `ruleFor` (after the stub check, before the clean return), for a selected, existing file:

```ts
const missing = missingHarnesses(f.source);
if (missing.length > 0 && !coverageAllowlisted) {
  return (
    `incomplete harness coverage — declares { ${[...declaredHarnesses(f.source)].join(", ") || "none"} } ` +
    `but a harness-facing integration test must cover the full supported matrix. ` +
    `Add a requireHarness("<name>") lane for: ${missing.join(", ")}. ` +
    `(AR2: every supported harness, equal coverage. SUPPORTED_HARNESSES is the source of truth.)`
  );
}
```

The message **names the missing harnesses** — pointing the author straight at the gap (the spec's exact requirement).

### Staging AR3–AR6 as known debt (so `main` doesn't break)
The existing `honest-harness-guard.allowlist.json` stages **stub** debt. Coverage debt is a different axis: an AR3–AR6 file may be stub-free yet still cover only a subset until its conversion lands. Two clean options:

| Option | Mechanism | Cost | Verdict |
|---|---|---|---|
| **A. Reuse the single allowlist for both axes** | A path on the allowlist suppresses BOTH stub and coverage violations. | Conflates two debts; removing a file once its stub is paid would silently also drop its coverage requirement (or vice-versa) → a half-converted file slips. | Rejected — the two debts must retire independently. |
| **B. A second, parallel `coverage-debt.allowlist.json`** (chosen) | A separate list keyed only to the coverage rule, same monotonic-shrink semantics (clean+listed → FAIL "debt paid, remove"; listed+missing-file → FAIL "stale"). Seed it now with the AR3–AR6 currently-stubbed files (the same five already on the stub allowlist) so `main` stays green; each conversion removes its entry. | One more JSON file + a `--write-coverage-allowlist` flag mirroring the existing `--write-allowlist`. | **Chosen** — each axis retires on its own clock; symmetry with the existing mechanism keeps the guard's mental model uniform. |

The seeded coverage-debt entries are exactly the five on the stub allowlist (`AL6-*`, `ah5-*`) — they are stubbed AND subset-covered today; AR3–AR6 pay both as they convert. **AR2's own test (`AR2-provision-real-session.integration.test.ts`) is on NEITHER allowlist** — it must fully conform: all four `requireHarness` lanes, zero stubs.

### Why a check script, not an ESLint rule (unchanged rationale)
Same as AR1's Mechanism-3 lore: the guard owns whole-repo facts + a stateful monotonic-shrink allowlist, which doesn't fit ESLint's per-file AST model. Coverage is per-file but shares the allowlist machinery, so it belongs in the same script. It rides `npm run lint` (already wired: `… && npx tsx scripts/honest-harness-guard.ts --check`).

### Honest blind spot the lint check has (→ why §2 exists)
The lint check proves a file **declares** all four `requireHarness` calls. It cannot prove each lane **ran** — a lane could be structured so its body never executes (e.g. an early `return`, a test gated behind a runtime condition) yet still textually contain `requireHarness("codex")`. That's the defense-in-depth job of the attestation per-harness floor (§2): the lint check gates the **source**, the attestation gates the **execution**.

---

## 2. The attestation per-harness floor — `verify-attest.ts` + `check-attestation.ts`

### What's missing today
`verify-attest` records GLOBAL `agenticExecuted`/`agenticSkipped`; `check-attestation` fails only when GLOBAL `executed === 0` (`assertAgenticFloor`). A run with 12 executed claude assertions and **zero codex** mints green. The floor must become **per-harness**.

### Tagging an executed agentic assertion with its harness — the lightest mechanism
`verify-attest` parses the vitest `--reporter=json` integration report and tallies per-file (`extractAgenticCounts` in `scripts/lib/attestation-floor.ts`). The JSON shape it reads is `testResults[].name` (file path) + `assertionResults[].{status,title,...}`. The harness name is **already present in every agentic test's structure**: each lane is a `describe(...)` that calls `requireHarness("<name>")`, and the vitest JSON reporter exposes the full ancestor title chain on each assertion (`assertionResults[].ancestorTitles: string[]` and `.fullName`). So the lightest tag is a **naming convention already in the shipped test**: the per-harness `describe` title contains the harness name (`"AR2 Lane 1 — builtin harness …"`, `"AR2 Lane 2 — claude CLI …"`).

Rather than rely on prose in a title, make it **mechanical and unambiguous** with a tiny marker the convention already implies — bracket the harness name in each lane's `describe` title:

> `describe("[harness:builtin] AR2 Lane 1 — …")`, `describe("[harness:codex] …")`, etc.

The reporter puts that bracket token into `ancestorTitles`/`fullName`. `extractAgenticCounts` already iterates assertions; extend it to also read `ancestorTitles`:

`scripts/lib/attestation-floor.ts`
```ts
const HARNESS_TAG = /\[harness:([a-z-]+)\]/;

/** Per-harness executed/skipped tally, keyed by the [harness:<name>] describe tag. */
export interface AgenticCountsByHarness {
  agenticExecuted: number;            // global (kept — back-compat)
  agenticSkipped: number;             // global (kept — back-compat)
  byHarness: Record<string, { executed: number; skipped: number }>;
}

export function extractAgenticCounts(
  json: VitestJsonResult,
  predicate: (path: string) => boolean,
): AgenticCountsByHarness { /* … iterate; bucket each assertion by its [harness:X] tag … */ }
```

A test whose `describe` carries no `[harness:X]` tag contributes to the global tally but to no bucket — which the floor reads as "that harness ran zero," so the marker is **forced by the floor**, not merely conventional. This is the lightest mechanism: no per-test custom reporter, no separate marker file, no new vitest plugin — just a bracket token in the `describe` title that the JSON reporter already surfaces, parsed by the function that already parses the report.

> ⚠️ **UNVERIFIED** — the exact vitest-4 `--reporter=json` field carrying the ancestor chain (`ancestorTitles` vs `fullName`). The builder must confirm against the live JSON report (`npx vitest run --config vitest.integration.config.ts --reporter=json --outputFile=/tmp/x.json`, inspect one `assertionResults[]` entry) before wiring. Both fields are stable in vitest's jest-compatible JSON reporter; pick whichever the live report carries.

### The signed payload
`verify-attest.ts` writes per-harness counts into the payload:
```ts
agenticExecuted,                       // kept (global) — back-compat with assertAgenticFloor
agenticSkipped,
agenticExecutedByHarness: counts.byHarness,   // NEW: { builtin:{executed,skipped}, claude:{…}, codex:{…}, opencode:{…} }
```
HMAC covers the whole payload (already the case — the new field is signed automatically).

### The check
`check-attestation.ts` extends `assertAgenticFloor`. Keep the existing global floor for back-compat (legacy attestations carry no `agenticExecutedByHarness` ⇒ skip the per-harness floor, exactly as `srcHash?`/`agenticExecuted?` already degrade). When the field IS present, fail if ANY supported harness has zero executed:

`scripts/lib/attestation-floor.ts`
```ts
export function assertPerHarnessFloor(
  byHarness: Record<string, { executed: number; skipped: number }> | undefined,
  supported: readonly string[],   // SUPPORTED_HARNESSES mirrored into the lib
): string | null {
  if (byHarness === undefined) return null;          // legacy back-compat
  const empty = supported.filter((h) => (byHarness[h]?.executed ?? 0) === 0);
  if (empty.length > 0) {
    return (
      `per-harness agentic floor: ${empty.join(", ")} ran ZERO executed agentic assertion(s). ` +
      `Every supported harness must actually RUN a harness-facing integration test — a green ` +
      `cannot be minted while a supported harness's lane silently did not execute. ` +
      `(AR2: equal coverage across all supported harnesses; SUPPORTED_HARNESSES is the source of truth.)`
    );
  }
  return null;
}
```
`SUPPORTED_HARNESSES` is mirrored into `attestation-floor.ts` (same lib dir as the predicate — a single import within `scripts/lib/`, no layering cost). `check-attestation` calls `assertPerHarnessFloor(attestation.agenticExecutedByHarness, SUPPORTED_HARNESSES)` after the existing global floor and `fail()`s on a violation.

### Defense-in-depth, stated plainly
- **Lint (§1)** proves the **source declares** every supported harness — catches a developer who writes only a claude lane (AR2's exact bug) at `npm run lint`, before any test runs.
- **Attestation (§2)** proves every supported harness **actually executed** — catches a lane that is declared-but-dead, or a machine where one binary silently didn't run, at attestation-validation time.

Neither alone is sufficient; together they make AR2's regression class mechanically impossible: you cannot ship a subset-covered harness test (lint blocks it) and you cannot mint a green where a declared lane didn't run (attestation blocks it).

> **Note on the matrix vs the rest of the suite.** The per-harness floor applies to the **agentic surface as a whole** (the union of all `isHarnessIntegrationPath` files), not file-by-file. A single conforming file (AR2's test, all four lanes) satisfies all four buckets; the staged AR3–AR6 files needn't each cover the matrix for the floor to pass. This is correct: the floor asks "did every harness run *somewhere* in the agentic suite," which AR2's four-lane test answers. The lint coverage check is the per-file gate; the attestation floor is the per-suite execution gate. (Both reference `SUPPORTED_HARNESSES`.)

---

## 3. The AR2 full-harness matrix (the test)

### File (unchanged location)
`packages/server/src/harness/__tests__/AR2-provision-real-session.integration.test.ts` — auto-collected into the serial `harness` vitest project (`fileParallelism:false`, `retry:2`, 240s ceiling, PGlite setup).

### Structure: four lanes, one shape
Every lane is the AR2 recipe — **provision-real → capture → assert → teardown** — through production `provisionSession()`, each `requireHarness`-gated, each `describe` carrying its `[harness:<name>]` tag (§2):

| Lane | Gate | Adapter | MCP bridge? | Observable output | Assert |
|---|---|---|---|---|---|
| **builtin** | `requireHarness("builtin")` | `BuiltinHarnessAdapter` + cheap OpenRouter model | no (`mcpSupport:false`, in-process tools) | `result.totalCostCents > 0` (stub yields 0); seam fires | cost > 0 |
| **claude** | `requireHarness("claude")` | `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` | **yes** (`startMcpBridgeServer`) | native `Write` → `answer.txt` in sandbox | `cap.files.get("answer.txt")` contains `4`; cost > 0 |
| **codex** | `requireHarness("codex")` | `CliHarnessAdapter(CLI_TOOL_CONFIGS.codex)` | via `.codex-home/config.toml` (codex-toml dialect) | native file write (`codex exec` edits files) → `answer.txt` | `cap.files.get("answer.txt")` contains `4`; outcome completed |
| **opencode** | `requireHarness("opencode")` | `CliHarnessAdapter(CLI_TOOL_CONFIGS.opencode)` | via `opencode.json` (opencode-json dialect) | native file write (`opencode run` edits files) → `answer.txt` | `cap.files.get("answer.txt")` contains `4`; outcome completed |

The builtin + claude lanes are the **shipped** lanes, unchanged in shape. The amendment **adds the codex + opencode lanes**.

### Grounding per-harness setup in REAL existing scaffolding (do not invent)
`cli-adapter-real-binary.integration.test.ts` already drives all three CLI binaries through the production `CliHarnessAdapter` with per-harness sandbox/auth prep. **Reuse those helpers verbatim** — extract them into the AC4 helper module (§4) so AR2 and `cli-adapter-real-binary` share one source:

- **claude** — `provisionClaudeSandbox(sandboxPath)`: writes `.mcp.json` + `.claude/settings.json`; keychain auth via forwarded `HOME/USER/LOGNAME`. (AR2's claude lane already uses the production `startMcpBridgeServer` instead of the dead-URL `.mcp.json` because it needs a live return path — keep that.)
- **codex** — `provisionCodexHome(sandboxPath)`: copies `auth.json` + `config.toml` from `~/.codex` into `.codex-home/` (NOT the SQLite files — they lock; lore'd). The adapter auto-detects `.codex-home/` and sets `CODEX_HOME`. Codex requires a **git repo** in the sandbox cwd (`git init` + empty commit) — reuse that prep. Codex MCP comes via `mcpConfig.dialect: "codex-toml"` written into `.codex-home/config.toml` (per `adapter-pool.ts`).
- **opencode** — keyed from `OPENROUTER_API_KEY` (the only key) through the openai-compatible OpenRouter endpoint; provider-prefixed model id (`openrouter/openai/gpt-4o-mini`). MCP via `mcpConfig.dialect: "opencode-json"` written into `opencode.json` in the sandbox cwd (per `adapter-pool.ts` + `cli-mcp-config.ts`).

`CLI_TOOL_CONFIGS` (`adapter-pool.ts`) supplies the `codex` (`exec … --json`) and `opencode` (`run … --format json`) configs; `CLAUDE_CLI_CONFIG` the claude one. `cli-mcp-config.ts` is the per-dialect MCP-config writer that `provisionSession` invokes — the codex/opencode lanes rely on it exactly as production does.

### Observable-output decision per harness (the real-risk question)
The shipped **claude** lane asserts on a native-`Write` `answer.txt` — the strongest AC2 proof (a pure-sandbox file with no other observation channel, deleted at teardown). The question for the new lanes: can codex (`exec`) and opencode (`run`) do the same native file write?

- **Preferred (uniform): native file write.** Both codex and opencode are coding agents whose native toolset edits files in the working directory (the sandbox cwd). The uniform task — *"create a file `answer.txt` in the working directory containing exactly 4, then report via send_message"* — should drive a native write on both, captured by `createSandboxCapture({ paths: ["answer.txt"] })` exactly like claude. This keeps all three CLI lanes byte-identical in shape (the AC4 helper's whole point).
- **Per-harness divergence + fallback, grounded in `cli-adapter-real-binary`'s observed behavior:**
  - `cli-adapter-real-binary` proves all three binaries complete a real LLM turn and emit a `completion` event, but it asserts on a **returned token** (`ADAPTER_OK`), not a written file — so the file-write path is **unproven for codex/opencode today**. Native file-write on a single-turn `exec`/`run` is plausible but not yet demonstrated in-repo.
  - **builtin** already diverges (shipped): cheap OpenRouter models don't reliably call the file-writing tool, so the builtin lane asserts `cost > 0` + seam-fired, not a file. Documented in the shipped test (W2 resolution).
  - **Decision:** codex + opencode lanes **attempt the native file write first** (`cap.files.get("answer.txt")` contains `4`) as the primary AC2 assertion. Because single-turn CLI file-write is unproven in-repo, each CLI lane carries a **belt-and-suspenders floor** identical to `cli-adapter-real-binary`'s proven assertions: `result.outcome === "completed"` (codex/opencode) + a real `cost`/`token_usage` signal where the harness emits one. If the builder finds during the green phase that codex `exec` or opencode `run` does **not** reliably write a file in a single turn (model nondeterminism over `retry:2`), the lane **demotes the file assertion to the same posture as the builtin lane** — assert the real-turn floor (completion + real cost/tokens, which a stub cannot produce) and document the divergence with a lore comment, exactly as the builtin lane already does. The harness still RAN (satisfying §2's per-harness floor); the load-bearing AC2 file-capture proof remains carried by the claude lane.

  This is honest: the matrix proves **every supported harness runs through real `provisionSession()` end-to-end** (the AR2 keystone), with the strongest-available per-harness output assertion. It does not pretend a flaky single-turn write is deterministic.

> **Flagged real risk.** codex single-turn `exec` and opencode single-turn `run` writing a file deterministically is the one unproven assumption in this matrix — `cli-adapter-real-binary` only proved they reply with a token. The builder MUST verify the native-write task live during the green phase; if it flaps over `retry:2`, fall back to the documented real-turn floor for that lane (above). This is not a reason to omit the lane — the lane still proves real-provision-through-`provisionSession` for that harness, which is the coverage requirement.

### Timing / flake
Four lanes: builtin (~10–40s) + three real CLI turns (~30–90s each) ≈ **3–6 min wall-clock** for the file, run serially in the `harness` project (`fileParallelism:false`). `retry:2` (3 attempts) absorbs model jitter, not logic breaks (AR1 config lore). Keep each task single-step + unambiguous; keep `maxIterations`/`maxOutputTokens` small on builtin.

---

## 4. AC4 — the extractable pattern is now the MATRIX helper

The shipped helper `provision-real-session.ts` exports `createSandboxCapture` + `startMcpBridgeServer`. The amendment **grows it into the matrix helper** so AR3–AR6 import *"run through all supported harnesses"* rather than rebuilding four lanes each.

Add to `packages/server/src/harness/__tests__/provision-real-session.ts`:

```ts
import type { SupportedHarness } from "??";  // see note below on the mirror

/** One supported-harness lane: how to gate it, build its ProvisionSessionDeps, and
 *  prep its sandbox/auth. The per-harness prep helpers are the SAME ones
 *  cli-adapter-real-binary uses (provisionClaudeSandbox / provisionCodexHome / opencode key),
 *  lifted here so both test files share one source. */
export interface HarnessLane {
  readonly harness: SupportedHarness;
  /** Tag for the [harness:<name>] describe convention the attestation floor reads. */
  readonly describeTag: string;            // `[harness:${harness}]`
  /** Build the adapter + (CLI) MCP bridge + sandbox prep for this harness. Returns
   *  the deps slice + a teardown fn; the caller threads in db/eventBus + the capture. */
  readonly setup: (sandboxPath: string) => Promise<{
    deps: Partial<ProvisionSessionDeps>;   // adapterPool, workspace, mcp* — harness-specific
    resolvedModel: ResolvedModel;
    cleanup: () => Promise<void>;
  }>;
}

/** The four supported-harness lanes, in matrix order. AR3–AR6 import this to run a
 *  task through EVERY supported harness without re-deriving per-harness wiring. */
export const SUPPORTED_HARNESS_LANES: readonly HarnessLane[] = [ /* builtin, claude, codex, opencode */ ];

/** Run one task through one lane end-to-end via production provisionSession(): gate,
 *  prep, provision, capture before teardown, return { result, files }. The single
 *  call AR3–AR6 reuse. requireHarness(lane.harness) is asserted by the caller's
 *  describe so collection-phase throw means "this lane cannot run". */
export async function runThroughHarness(
  lane: HarnessLane,
  task: { taskId: string; agentId: string; taskDescription: string; doneCondition: string; capturePaths?: string[] },
  ctx: { db: HyperIdleDb; eventBus: EventBus; sandboxBasePath: string },
): Promise<{ result: ProvisionSessionResult; files: Map<string, string> }>;
```

How AR3–AR6 consume it:
```ts
for (const lane of SUPPORTED_HARNESS_LANES) {
  describe(`${lane.describeTag} <feature> — real provision`, () => {
    requireHarness(lane.harness);              // hard-fail, never skip
    test("…", async ({ db, eventBus }) => {
      const { result, files } = await runThroughHarness(lane, task, { db, eventBus, sandboxBasePath });
      // assert on result / files
    });
  });
}
```

This makes the coverage requirement **the path of least resistance**: importing `SUPPORTED_HARNESS_LANES` and looping yields all four `requireHarness` declarations + all four `[harness:X]` tags automatically — so a conforming AR3–AR6 test satisfies both the lint coverage check (§1) and the attestation floor (§2) by construction. AR2's own test can either loop over `SUPPORTED_HARNESS_LANES` or keep its four explicit `describe`s (the per-harness divergence on observable output — builtin/codex/opencode fallbacks — makes explicit lanes clearer for AR2 itself; the loop form is what AR3–AR6 adopt for uniform features).

The per-harness prep helpers (`provisionClaudeSandbox`, `provisionCodexHome`, opencode key resolution, the codex `git init`) move from `cli-adapter-real-binary.integration.test.ts`'s file body INTO this helper, and `cli-adapter-real-binary` imports them — one source, no duplication. (The `SupportedHarness` type is imported via the `scripts/lib` predicate only if a clean path exists; otherwise mirror the literal in the helper with the same type-assert pattern as §0 — the builder picks whichever avoids a `packages/ → scripts/` import. The matrix CONSTANT `SUPPORTED_HARNESS_LANES` is the test-side artifact; `SUPPORTED_HARNESSES` is the guard/attestation-side constant; the type assert in §0 keeps them in lockstep.)

---

## 5. The capture seam (UNCHANGED — recovered from the shipped plan)

The `onBeforeTeardown` callback on `ProvisionSessionDeps` is correct and stays exactly as shipped. Summary (full rationale in the prior plan, recovered from `git show 6ea3fe4c:plans/AR2/architecture.md` and the shipped `session-provisioning.ts`):

- **Seam:** optional `onBeforeTeardown?: (ctx: BeforeTeardownContext) => void | Promise<void>` on `ProvisionSessionDeps`; `BeforeTeardownContext = { sessionId, sandboxPath }`.
- **Fire point:** in `runSession`, after the drain `try/finally` releases the adapter slot and **before** the teardown-branch dispatch — the unique window where the sandbox is fully written and nothing has deleted it (`rm` lives in `endSession`, `session-lifecycle.ts:341`). Try/catch-wrapped: an observer throw logs + continues teardown (never strands a sandbox).
- **Production callers omit it → no-op.** The detached HTTP path (`startSessionProvision`) never sets it — production teardown behavior is byte-identical.
- **Rejected alternatives** (all in the prior plan): extend `filesystem_captures` (table didn't exist at base — building a persistent subsystem for a test concern), snapshot on the result type (pollutes a production type), wrap `destroy()` (fires after the `rm`). `onBeforeTeardown` is the lightest change that cannot weaken teardown.

No schema, no migration, no change to `session-lifecycle.ts`. This is the entire production surface of AR2.

---

## 6. Spec fix — `.pipeline/work-packages/TRACK-AR.md` (AR2 section)

The root cause was a spec contradiction: AR2's "Plan calls" said *"Prefer BuiltinHarnessAdapter + a cheap real model for the default lane, with the same shape proven against **at least one CLI binary**"* — narrower than AR1's "every supported harness." The amendment edits the AR2 section so it **cannot recur**:

- **Plan calls:** "at least one CLI binary" → "the **full supported-harness matrix** (builtin + claude + codex + opencode), each through `provisionSession()`, each `requireHarness`-gated; enforced by the lint coverage check + the attestation per-harness floor."
- **Acceptance criteria** tightened to require **all four harnesses** + the coverage gate (a new AC: "every supported harness has a `requireHarness`-gated lane through real `provisionSession()`; the lint coverage check + attestation per-harness floor fail any subset").
- **Contracts:** add "coverage across the full `SUPPORTED_HARNESSES` matrix is mechanically enforced — not a per-test author choice."

(Edited in this commit; see §8.)

---

## 7. Rule text — `.claude/rules/testing.md` + `CLAUDE.md` (in lockstep with the gate)

`.claude/rules/testing.md` §"Integration tests: two archetypes" and the `> Enforced (shipped via Track AR1)` block, and the `CLAUDE.md` test tables, are updated so **"every supported harness, equal coverage, mechanically enforced"** is explicit prose pointing at the gate:

- The harness archetype paragraph states the supported set explicitly (`builtin/claude/codex/opencode`) and that a harness-facing integration test must cover **all** of them — not "across every supported harness" as soft prose but with the mechanism named.
- The Enforced block gains: *"Equal coverage across the supported matrix is enforced by (a) the `honest-harness-guard` coverage check — a harness-facing `*.integration.test.ts` must declare a `requireHarness(<name>)` lane for every member of `SUPPORTED_HARNESSES` (`builtin/claude/codex/opencode`); and (b) the attestation **per-harness** floor — `agenticExecutedByHarness` in the signed payload; `check-attestation` fails if any supported harness ran zero executed agentic assertions. `gh` is a tool, not an agent harness; `cursor-agent` is inert."*
- `CLAUDE.md`'s `*.integration.test.ts` table rows note the harness-facing kind covers the **full** `builtin/claude/codex/opencode` matrix, enforced by guard + attestation.

(Edited in this commit; see §8.)

---

## 8. Ordered tasks for the builder

**Gate (red-then-green on the enforcement itself):**
1. Add `SUPPORTED_HARNESSES` + `SupportedHarness` to `scripts/lib/honest-harness-predicate.ts`; add the type-assert mirror in `require-harness.ts` (§0).
2. **Lint:** add `declaredHarnesses` / `missingHarnesses` + the coverage rule + the `coverage-debt.allowlist.json` (seeded with the five AR3–AR6 stubbed files) + `--write-coverage-allowlist` to `honest-harness-guard.ts` (§1). Unit-test the pure fns (`declaredHarnesses`, `missingHarnesses`) as `*.test.ts`.
3. **Attestation:** extend `extractAgenticCounts` → `byHarness` (parse `[harness:X]` from the ancestor-title chain — verify the live JSON field first), add `assertPerHarnessFloor`, write `agenticExecutedByHarness` in `verify-attest.ts`, call the per-harness floor in `check-attestation.ts` (§2). Unit-test `assertPerHarnessFloor` (empty bucket → violation; all present → null; undefined → null back-compat).

**Matrix (the test):**
4. Grow `provision-real-session.ts`: `SUPPORTED_HARNESS_LANES` + `runThroughHarness` + the lifted per-harness prep helpers (§4).
5. Add codex + opencode lanes to `AR2-provision-real-session.integration.test.ts` with `[harness:codex]`/`[harness:opencode]` describe tags; add the tags to the existing builtin/claude describes (§2/§3). **Verify native file-write live for codex/opencode**; apply the documented fallback per lane if it flaps.
6. Point `cli-adapter-real-binary.integration.test.ts` at the lifted prep helpers (de-dup; optional but keeps one source).

**Rule + spec:**
7. Edit `.claude/rules/testing.md` + `CLAUDE.md` (§7) and `.pipeline/work-packages/TRACK-AR.md` AR2 section (§6). *(Done in the amendment commit alongside this plan; the builder verifies they match the shipped gate.)*

**Verify:**
8. `npm run check` (type assert + per-harness types) + `npm run lint` (guard coverage check green — AR2 conforms, AR3–AR6 staged) + run the `harness` integration project locally with all four binaries + `OPENROUTER_API_KEY`; confirm all four lanes EXECUTE (not skip) and the attestation carries `agenticExecutedByHarness` with non-zero for each. **Sanity-break:** delete the codex lane → lint coverage check goes RED naming codex; restore it but force its body to early-return → attestation per-harness floor goes RED naming codex.

---

## 9. Risks / open items
- ⚠️ **UNVERIFIED — vitest-4 JSON reporter field** carrying the ancestor-title chain (`ancestorTitles` vs `fullName`) — builder confirms against a live report before wiring the `[harness:X]` parse (§2).
- ⚠️ **REAL RISK — codex `exec` / opencode `run` single-turn native file-write determinism.** Unproven in-repo (`cli-adapter-real-binary` only proved token-reply). Verify live; fall back to the real-turn floor (completion + real cost/tokens) per lane if it flaps over `retry:2` (§3). The lane still satisfies the per-harness coverage floor (the harness RAN through real `provisionSession`).
- ⚠️ **UNVERIFIED — OpenRouter model id** for the builtin lane (shipped test uses `openai/gpt-4o-mini` with a bounded fallback list) — builder confirms a current cheap tool-capable id at build time (Source-Driven).
- **Latent cost bug** (`recordCostAndCheck` over-counts, lore'd) is AR3's to fix, not AR2's — AR2 asserts on captured files + `cost > 0`, unaffected.
- **`gh` deliberately excluded** from `SUPPORTED_HARNESSES` — it's a tool, not an agent harness; `requireHarness("gh")` still works for tool-gated tests but `gh` is not in the matrix the floor/coverage check enforce.
