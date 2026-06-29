# AR5 — Architecture

**What this WP is.** Five `*.integration.test.ts` files inject a scripted `EchoHarnessAdapter` / a `runDecompositionTurn` override / a fake `makeFabricLikeStrategy()` into the bet-decomposition path, then assert on resulting tasks/edges — while the real strategy agent never runs. AR5 triages every assertion **agent-driven vs pure-logic** and either (a) converts to a real-harness integration test that drives a real agent across the full `SUPPORTED_HARNESSES` matrix, or (b) demotes to an honest `*.test.ts` unit. No scripted/echo adapter may remain in any `*.integration.test.ts`.

This is a **test-fidelity** change. Production contracts (`runBetDecomposition`, `insertProposedBetTasks`, `findEligibleTeamAgents`, `resolveOrphanedDecompositions`, the bets API shape, the subscriber) are **frozen** — AR5 changes which lane an assertion lives in, never what it asserts.

---

## AC → proof traceability (flat map; W-1)

Every AR5 acceptance criterion, mapped to the specific file + assertion that proves it. Phase-4 reads this row-by-row.

| AC | What it requires | Proven by (file → assertion) |
|---|---|---|
| **AC1** — each of the five files is converted-to-real-agent OR demoted to an honest `*.test.ts` unit; **no scripted/echo harness adapter remains in any `*.integration.test.ts`** | `EchoHarnessAdapter` / mock `HarnessAdapter` deleted from all five | **CONVERT:** `AK2-contributor-scenario.integration.test.ts` (Echo deleted, real session via `runThroughHarness`), `AK2-minimal-strategy.integration.test.ts` (Echo deleted). **DEMOTE/confirm-honest:** `AK3-bet-decomposition.integration.test.ts` (AC5 mock adapter relocated to `bet-decomposition.test.ts` — **mandatory**, W-5), `AK3-bet-decomposition-subscriber.integration.test.ts` (no harness adapter — confirmed), `AK8-strategy-decomposition.integration.test.ts` (no harness adapter — confirmed). **Guard:** post-AR5, `grep` for any `implements HarnessAdapter` / `new EchoHarnessAdapter` / config-capturing adapter inside the five `*.integration.test.ts` returns **zero**. |
| **AC2** — for agent-driven assertions, a real strategy agent produces the decomposition; tasks/edges asserted from that real output | **NEW** `AK3-real-decomposition.integration.test.ts` → four-lane matrix, Decision A (`decompositionDepsForLane` → `runBetDecomposition` Branch 3 → `runRealPmTurn` → real binary → JSON parse → persist). Assertion: the pinned predicate in W-2 below (≥1 persisted task, non-trivial title, `decompositionStatus === "done"`). |
| **AC3** — demoted units no longer carry `.integration`; do not route through `provisionSession` with a fake adapter | The **pure-logic-over-supplied-decomposition** assertions move to `*.test.ts`: AC5 `tools:[]` → `bet-decomposition.test.ts`; AK2-minimal inertness → `minimal-strategy.test.ts`. None call `provisionSession`. **Reconciliation (W-4):** AK8 + subscriber + the DB/app assertions of AK3 are **service**-integration (real `db`/`eventBus`/`app`, zero harness stub) — they were never harness-facing, so the suffix-drop clause does **not** bind them; they keep `*.integration.test.ts`. The clause applies only to the pure-logic demotions named above. |
| **AC4** — converted integration tests hard-fail on missing harness; none skip | Each converted file iterates `SUPPORTED_HARNESS_LANES` with `requireHarness(lane.harnessName)` at describe scope — no `skipIf` anywhere. Files: `AK2-contributor-scenario`, `AK2-minimal-strategy`, `AK3-real-decomposition`. |

---

## 0. Ground truth read from the code (not guessed)

### 0.1 The production decomposition path — `bet-decomposition.ts`

`runBetDecomposition` has a **3-way turn-source precedence** (lines 425–479):

- **Branch 1** — `plan.tasks.length > 0`: Strategy authored the breakdown. *No v1 Strategy does this* (Minimal + Fabric both return `tasks:[]`).
- **Branch 2** — `deps.runDecompositionTurn` present: **test-injectable override**, deterministic task list, **no LLM call**. *Every AK3/AK8 test uses this.*
- **Branch 3** — neither: **real PM turn** via `runRealPmTurn` (lines 522–610). Builds a real `SessionConfig` with `tools:[]`, calls `adapterPool.select() → startSession() → drainForCompletion() → stopSession()`, and **parses the model's JSON completion into `DecompositionTaskInput[]`**. This is the only path where a real agent produces the decomposition.

**Consequence for triage:** an assertion is *agent-driven* iff its truth depends on what a real agent emits in Branch 3. An assertion that feeds Branch 2 an override (or feeds `insertProposedBetTasks` a literal `taskInputs` array) is *pure-logic over a supplied decomposition* — a unit, regardless of today's `.integration` suffix.

### 0.2 `runRealPmTurn` drives the adapter directly, NOT `provisionSession()`

`runRealPmTurn` (line 533) calls `deps.adapterPool.select(...)` itself; it never calls `provisionSession`. The decomposition turn is a **scratch-sandbox PM turn**, not a full task session. AR2's `provisionSession`/`runThroughHarness` recipe provisions a *task* session (taskId/agentId/sandbox/MCP-bridge/capture) — it is not the shape `runRealPmTurn` uses. **This is the central architecture decision** (Decision A below).

### 0.3 The honest-harness machinery is **path-only** — and none of these files are on its radar

`scripts/lib/honest-harness-predicate.ts` `isHarnessIntegrationPath()` matches **only**:
- `…/harness/__tests__/<x>.integration.test.ts`, or
- the explicit list `EXPLICIT_HARNESS_INTEGRATION = ["__tests__/session-provisioning.integration.test.ts"]`.

All five AR5 files live in `packages/server/src/__tests__/` and are **NOT** under `harness/__tests__/`, so today:
- the `honest-harness-guard` does **not** flag their scripted adapters (that is why they pass lint while stubbing the seam),
- they are **absent from both** `coverage-debt.allowlist.json` and `honest-harness-guard.allowlist.json`,
- the per-harness attestation floor never counts them.

**Therefore a converted AR5 integration test will only be recognized as harness-facing if it is added to `EXPLICIT_HARNESS_INTEGRATION`** (and to `HARNESS_INCLUDE` in `vitest.integration.config.ts` so it runs in the serial real-LLM `harness` project). This is the load-bearing wiring step the builder must not skip — without it the converted test runs in the parallel `service` project, races real-LLM calls, and dodges the coverage check.

### 0.4 The attestation floor: global per-harness, file-coverage via guard

`scripts/lib/attestation-floor.ts`:
- `assertHarnessFloor` (line ~118): fails if **any** supported harness ran **zero** executed agentic assertions across the **whole** attested run, keyed off `[harness:X]` describe tags parsed from `ancestorTitles`.
- So the global floor is satisfied as long as **one** converted file emits all four `[harness:X]` lanes. Per-**file** equal coverage is enforced separately by the guard's coverage check on every path matched by `isHarnessIntegrationPath`.

**Implication:** the builder only needs the four-lane matrix to actually execute somewhere in the converted set; the guard then forces every converted file to declare all four lanes.

### 0.5 AR2 helpers available (verified in `provision-real-session.ts`)

`SUPPORTED_HARNESS_LANES` (4 lanes: builtin/claude/codex/opencode, each with `harnessName`, `describeTag`, `prepFn`), `runThroughHarness(lane, ctx)`, `createSandboxCapture`, `startMcpBridgeServer`, `provisionClaudeSandbox`, `provisionCodexHome`, `provisionOpencodeHome`, `initGitRepo`. `requireHarness(name)` in `require-harness.ts`. **These provision a generic task session** — see Decision A for why AR5 cannot use them verbatim for the decomposition turn.

---

## 1. Decision A — How does a converted test drive "a real agent decomposing a bet"?

The spec says "drive a real agent through the production `provisionSession()` path (AR2 pattern)." But §0.2 shows the production decomposition turn (`runRealPmTurn`) does **not** route through `provisionSession`; it drives the adapter directly. So a literal `runThroughHarness` call would prove a *task* session, not a *decomposition*. Three options:

**Option A1 — Drive `runBetDecomposition` Branch 3 on a real adapter pool (CHOSEN).**
Build `BetDecompositionDeps` with a **real `AdapterPool`** carrying the lane's real `CliHarnessAdapter`/`BuiltinHarnessAdapter`, a real `resolveModel`, a real scratch `sandboxBasePath`, and **NO `runDecompositionTurn` override** → forces Branch 3 → `runRealPmTurn` spawns the real binary, the model returns a JSON task list, `insertProposedBetTasks` persists it. Assert the persisted tasks reflect the agent's real output (a fake/empty output would fail).
- *Reuses AR2:* the per-lane adapter construction + per-harness auth prep (`provisionCodexHome`/`provisionOpencodeHome`/`initGitRepo`/`provisionClaudeSandbox`/`OPENROUTER_API_KEY`) and the `requireHarness` gate + `[harness:X]` describe tags. It does **not** reuse `runThroughHarness` (that runs `provisionSession`, the wrong entry point), but it reuses the lane *table's data* and prep helpers.
- *Cost:* the AR2 lane `prepFn` returns `ProvisionSessionParams`, not `BetDecompositionDeps`. The builder writes one small adapter-pool factory per harness (or a thin `decompositionDepsForLane(lane, ctx)` helper in the AR5 file or a shared `provision-real-decomposition.ts` sibling). ~80–120 LOC of shared helper.
- *Why chosen:* it exercises the **actual production decomposition contract** (`runBetDecomposition` → `runRealPmTurn` → JSON parse → persist), which is what the AC demands ("a real strategy agent produces the decomposition and the resulting tasks/edges are asserted from that real output"). It walks the same `tools:[]` PM turn the system ships.

**Option A2 — Call `runThroughHarness` verbatim, then assert decomposition.** Rejected: `runThroughHarness` runs `provisionSession` (a task session), which never calls `runBetDecomposition`. It would prove "a real agent ran a session," not "a real agent decomposed a bet." That is a different (weaker) claim — the same false-adjacency the track exists to kill.

**Option A3 — Have the real agent emit the task list via an MCP return tool.** Rejected for v1: the production decomposition turn is `tools:[]` (User Sovereignty, AC5 of AK3) — no tool surface. Adding a tool surface to satisfy a test would change production behavior to make a test pass (forbidden by MEMORY: tests must not drive behavior). The JSON-completion contract is what ships; assert against it.

**Decision A = A1.** New shared helper `packages/server/src/harness/__tests__/provision-real-decomposition.ts` exposing `decompositionDepsForLane(lane, ctx): BetDecompositionDeps` + a scratch-dir capture, built on the AR2 lane data + prep helpers. (Builder may inline if it stays under one file; a sibling helper is preferred for the AR6 dedup trajectory.)

### Decision A — pinned agent-driven assertion (W-2; the builder MUST write this shape)

Real CLI agents are nondeterministic and `tools:[]` JSON-only prompting is fragile: a model may wrap JSON in prose → `JSON.parse` fails → `taskList=[]` → `blocked/empty`, not `done`. The converted **agent-driven** assertion is therefore pinned as **concrete code, not prose** — the builder may not soften it into `tasks.length >= 0` or drop the `done` clause:

```ts
// AK3-real-decomposition.integration.test.ts — the agent-driven assertion, verbatim shape.
// Fail-closed: a fake/empty/non-array model output → runRealPmTurn returns [] (bet-decomposition.ts:606)
// → Branch-3 empty-guard → decompositionStatus 'blocked'/'empty', so BOTH asserts below fail.
const bet = await db.query.bets.findFirst({ where: eq(bets.id, betId) });
expect(bet?.decompositionStatus).toBe("done");          // empty/failed output → "blocked", fails closed

const tasks = await db.query.tasks.findMany({ where: eq(tasks.betId, betId) });
expect(tasks.length).toBeGreaterThanOrEqual(1);          // ≥1 real persisted task
expect(
  tasks.every((t) => t.title.trim().length >= 3),        // non-trivial title — survives phrasing variance
).toBe(true);
```

- **Field/value names verified in code:** `bets.decompositionStatus` terminal value `"done"` (`bet-decomposition.ts:241,247`); empty `taskList` → `markTerminal(..., "blocked", "empty")` (`:278`). The `done` assert therefore **cannot** pass on fake/empty output.
- **Threshold is a literal:** `title.trim().length >= 3` — not "non-trivial" prose. Tasks are asserted as **DB rows** (`db.query.tasks`), never sandbox files (decomposition persists to the DB; §4 task 1).
- **Retry posture is a code-level fact, not a hope:** the assertion runs in the serial `harness` vitest project, which carries `retry: 2` (3 attempts) — the builder inherits it by placing the file in `HARNESS_INCLUDE`; do not add a per-test retry override. This absorbs transient JSON-format misses exactly as AR2's lanes do.
- If even with `retry: 2` a given harness cannot reliably return parseable JSON for a tiny bet, that is a **real production-prompt-fragility finding** to surface, not mask (do not loosen the assertion to hide it).

---

## 2. Per-file, per-assertion triage

Legend: **DEMOTE** = pure-logic over a supplied decomposition → `*.test.ts` unit, assertion preserved, no `provisionSession`, no scripted adapter, stubs legitimate. **CONVERT** = agent-driven → real-harness `*.integration.test.ts`, full matrix, hard-fail on absent binary. **CONFIRM-HONEST (service-integration)** = real `db`/`eventBus`/`app` fixtures, zero harness stub, assertion unchanged, **keeps** `*.integration.test.ts`.

### Reconciling AC3 "demoted units drop `.integration`" with keeping AK8 + subscriber + AK3-DB asserts as `.integration` (W-4)

AC3 reads "Demoted units no longer carry the `.integration` suffix." Read literally against the wrong files this conflicts with keeping AK8, the AK3-subscriber, and AK3's DB/app assertions as `*.integration.test.ts`. The reconciliation, stated explicitly so the builder does not "fix" it:

- **The suffix-drop clause binds ONLY the pure-logic-over-supplied-decomposition demotions** — i.e. the assertions that move to a `*.test.ts` unit with no DB/server fixture: the AK3 **AC5 `tools:[]`** assertion → `bet-decomposition.test.ts`, and the AK2-minimal **inertness** assertions → `minimal-strategy.test.ts`. These are the only true "demotions to unit"; they correctly shed `.integration`.
- **AK8, the AK3-subscriber, and AK3's DB/app assertion groups are NOT demotions-to-unit.** They are **service**-integration tests: they need real `db`/`eventBus`/`app` fixtures and they **stub no harness** (they fake only the Strategy port and the `runDecompositionTurn` turn seam — neither is a harness adapter). They were **never harness-facing** — the path-only predicate never classified them as harness tests, and they never constructed an `EchoHarnessAdapter`. They were mislabeled-by-proximity (sitting next to a scripted-adapter file), never claiming harness integration. Therefore the suffix-drop clause does not bind them; they stay honest `*.integration.test.ts` **service** tests. The AC's intent — "no test claims to prove agent-driven decomposition while feeding a scripted `EchoHarnessAdapter`" — is fully satisfied: there is no false *harness* claim to strip, because there was never a harness stub in those files.

### 2.1 `AK2-contributor-scenario.integration.test.ts` (383 LOC)

This file proves the **Strategy Port seam is open** (AC4: register a custom Strategy, run with zero Kernel changes) — it is about the *contributor extension point*, not about agent-driven decomposition. The `EchoHarnessAdapter` is a stand-in for "some harness ran"; the assertions are about *what the Kernel handed the Strategy* and *that provisionSession completed*.

| Assertion(s) | Depends on real agent? | Decision |
|---|---|---|
| `contributor Strategy runs session to completion` (session.state=done, outcome=completed) | No — Echo adapter's scripted `completion`/`submit_review` drives outcome; the *contributor seam* is under test, not the agent | **CONVERT** (see note) |
| `Kernel passes correct assembleContext request fields` (taskId/agentId/teamId/sandboxPath/sessionId) | No — pure observation of the Kernel→Strategy handoff contract | **CONVERT** (see note) |
| `Kernel calls beginLearningIngestion and disposes the handle` (dispose count = 1) | No — lifecycle observation | **CONVERT** (see note) |
| `contributor Strategy's custom context assembly appears in the sandbox` (captured path/content) | No — proves the Strategy could write freely; harness output irrelevant | **CONVERT** (see note) |

**Note — this file is the genuinely hard one.** Its `provisionSession` calls a **real Kernel path** with a **fake `eventBus` (`as never`)** and a scripted `EchoHarnessAdapter`. Two honest resolutions, pick per the rule:

- **Preferred: CONVERT to a real-harness matrix file** `AK2-contributor-scenario.integration.test.ts` that drives `provisionSession` via **`runThroughHarness`** (AR2) across all four lanes, with the `ContributorStrategy` registered via `setActiveStrategy`. The four assertions (handoff fields, dispose count, captured context, completion) are all observable from a **real** session: the ContributorStrategy's `assembleContextCalls`/`ingestionCalls`/`disposeCallCount` are real in-process observations, and completion comes from the real harness. This is the *correct* archetype: the integration point (a custom Strategy running under a real session) is genuinely exercised, the fake eventBus is replaced by the real one from the `{db,eventBus}` fixture, and the `EchoHarnessAdapter` is deleted. **This is the only file in the set that legitimately uses `runThroughHarness` verbatim**, because here the thing under test really is "a real session runs to completion under a custom Strategy."
  - Risk: `ContributorStrategy.assembleContext` must write the sandbox scaffold the Kernel's post-admission invariants need (it already does). Under a real harness the sandbox capture must read `context/contributor-context.md` before teardown — wire `capturePaths` accordingly.
- **Alternative (if the contributor-seam assertions prove harness-independent enough): DEMOTE** the three pure handoff/lifecycle observations to a `*.test.ts` unit that calls `provisionSession` with a real in-process **builtin** path is *not* allowed (builtin is still a harness). So demotion here is **not** clean — the seam genuinely needs a session to run. **Prefer CONVERT.**

**Target:** `AK2-contributor-scenario.integration.test.ts` (renamed in spirit, same path), four lanes via `runThroughHarness`, `requireHarness(lane.harnessName)`, `[harness:X]` tags. Delete `EchoHarnessAdapter`. Add to `EXPLICIT_HARNESS_INTEGRATION` + `HARNESS_INCLUDE`.

### 2.2 `AK2-minimal-strategy.integration.test.ts` (314 LOC)

Proves AC1: under the **minimal** Strategy a task dispatches end-to-end and **no Fabric assembly/writeback happens** (empty knowledge dir, no new `knowledge_items` rows). The `EchoHarnessAdapter` again stands in for "a session ran." The assertions are about the **minimal Strategy's inertness**, observable from a real session.

| Assertion | Depends on real agent? | Decision |
|---|---|---|
| `session runs to completion under minimal Strategy` | No (Echo drives outcome) but needs a session to run | **CONVERT** via `runThroughHarness` (same rationale as 2.1) |
| `no files written under knowledge/ when minimal active` | No — observes the minimal Strategy did no assembly; harness-agnostic | **CONVERT** (asserted on the real session's sandbox via capture) |
| `.fabric/manifest.json has zero items` (currently only asserts outcome + sandbox path truthy) | No | **CONVERT** |
| `no new knowledge_items rows (no writeback)` | No — DB row count delta; pure Strategy-inertness | **CONVERT** |

**Resolution:** same as 2.1 — the integration point is "a real session runs under the minimal Strategy and the Strategy stays inert." CONVERT to a four-lane `runThroughHarness` file with `setActiveStrategy(minimalStrategy)` (import `@hyperidle/strategy-minimal`). Delete `EchoHarnessAdapter`. The knowledge-dir/`knowledge_items` assertions become observations on the **real** session. Add to `EXPLICIT_HARNESS_INTEGRATION` + `HARNESS_INCLUDE`.

- **Caveat for the reviewer:** the "no knowledge files" assertion is observing *minimal-Strategy inertness*, which is deterministic and harness-independent. A defensible **alternative** is to keep ONE four-lane CONVERT test for "session completes under minimal across all harnesses," and **DEMOTE** the inertness assertions (`knowledge/` empty, zero `knowledge_items`) to a `minimal-strategy.test.ts` unit that calls the minimal Strategy's `assembleContext`/`beginLearningIngestion` directly and asserts no writes — because those properties are about the Strategy object, not the harness. **This is cleaner.** Recommend: **DEMOTE the two inertness assertions to a unit; CONVERT only the end-to-end completion assertion to the matrix.** Reviewer to rule on split granularity.

### 2.3 `AK3-bet-decomposition.integration.test.ts` (710 LOC)

The largest file. Mostly **service-integration** (real PGlite + app, no harness) that was mislabeled by sitting next to a scripted-adapter test. Triage by describe block:

| describe / assertion group | Mechanism today | Depends on real agent? | Decision |
|---|---|---|---|
| `findEligibleTeamAgents` (4 tests: eligibility, exclude strategy, exclude inactive, empty) | Real DB query, no harness | **No** — pure DB logic | **DEMOTE** → `*.test.ts` (real `db` fixture; this is *service* integration but has no harness — keep as integration if it needs `db`, but it has no scripted adapter so it is already honest. **Stays `.integration.test.ts` as service-integration** — see note) |
| `insertProposedBetTasks` (3 tests: insert+owner, round-robin fallback, betId binding) | Real DB + `makeFabricLikeStrategy()` fake for owner selection; **supplied** `taskInputs` literal | **No** — pure transform of a *supplied* decomposition (the task list is a literal; the fake strategy only does owner round-robin, itself pure logic) | **DEMOTE** → unit/service: the assertion is "given these task inputs + these eligible agents, owners are assigned thus." `makeFabricLikeStrategy` is a legitimate stub of the *selection* port here. |
| `runBetDecomposition — no-eligible-agent` (blocked/no_eligible_agent, 0 tasks) | Real DB, no turn invoked (short-circuits before any agent) | **No** — guard logic before any decomposition | **DEMOTE** |
| `runBetDecomposition — happy path` (injected `stubTurn` returns 2 tasks → done) | **Branch 2 override** | **No** — explicitly a stubbed turn; "given a supplied 2-task decomposition, persist+mark done" | **DEMOTE** |
| `runBetDecomposition — timeout/error` (rejecting turn → blocked/failed; empty turn → blocked/empty) | **Branch 2 override** | **No** — error-handling over a supplied (failing/empty) turn | **DEMOTE** |
| `runBetDecomposition — idempotency CAS` (pre-set running → stub not called) | Real DB CAS | **No** | **DEMOTE** |
| `resolveOrphanedDecompositions` (3 tests: flips running, leaves terminal, clean boot) | Real DB | **No** | **DEMOTE** |
| `GET /bets/:id returns decomposition fields` (2 tests: API shape) | Real app + DB | **No** — API contract | **DEMOTE** (service-integration via `app` fixture) |
| `runBetDecomposition — real PM turn uses tools:[] (AC5)` | **mock `HarnessAdapter` capturing SessionConfig (`:~640`)** — Branch 3 but with a structural mock adapter | **Partially** — asserts the *production code* builds `tools:[]`; the adapter is mocked to capture config, not to produce a decomposition | **DEMOTE — MANDATORY relocation to `bet-decomposition.test.ts` (W-5); a constructed `HarnessAdapter` may NOT remain in this `.integration.test.ts`** |

**The AC5 `tools:[]` assertion is the one genuinely-agent-adjacent test, and it is subtle.** What it proves is a **production-code property**: "when Branch 3 runs, the `SessionConfig` it builds carries `tools:[]`." That is a *static-ish behavioral property of `runRealPmTurn`*, observable without a real LLM (the mock adapter captures the config the production code constructed).

> **W-5 — relocation is MANDATORY, not optional.** The config-capturing `mockAdapter` constructed at `AK3-bet-decomposition.integration.test.ts:~640` is a **constructed `HarnessAdapter` inside a `.integration.test.ts`** — i.e. a real instance of exactly what AC1 forbids ("no scripted/echo harness adapter remains in a `*.integration.test.ts`"). A config-capturing adapter is still a `HarnessAdapter`; "it only captures, doesn't script output" is **not** an exemption. It MUST move to a `*.test.ts` unit. There is no "or keep it as a service-integration" branch — leaving it in any `.integration.test.ts` would actively exercise the path-only-guard blind spot (Risk 4), not merely leave it theoretical. The single honest option:

- **DEMOTE the `tools:[]` assertion (MANDATORY)** to a `bet-decomposition.test.ts` unit that calls `runBetDecomposition` Branch 3 with a **config-capturing adapter** (legitimate stub *in a unit* — it is testing what *the production code builds*, not what the agent returns). This keeps the cheap, deterministic proof of User Sovereignty, and removes the last constructed `HarnessAdapter` from the five `*.integration.test.ts` files.
- **AND CONVERT a new agent-driven assertion** (which does NOT exist in the file today): "a real agent decomposes a real bet → ≥1 real task persisted, bet `done`." This is the file's contribution to the matrix. It is the AC's core ("a real strategy agent produces the decomposition and the resulting tasks/edges are asserted from that real output").

**So `AK3-bet-decomposition.integration.test.ts` splits three ways:**
1. **Service-integration units/tests** (everything except AC5 and the new agent test) → land in a `.test.ts` unit OR remain in a **service** `.integration.test.ts` that has **no scripted harness adapter** (the `makeFabricLikeStrategy` selection stub is legitimate; the `runDecompositionTurn` override is a supplied-decomposition seam, legitimate in a unit). **Recommendation:** the DB-only assertions that need the `db`/`app` fixtures stay as a **service** `.integration.test.ts` (honest — real DB, no harness stub); the pure transforms with no DB can be `.test.ts`. Critically, **remove nothing's assertion** — only relabel and strip the false harness claim. The existing `AK3-bet-decomposition.test.ts` (78 LOC, type/constant units) is the demotion sink for the pure type/constant checks and grows to absorb the pure-logic ones.
2. **`tools:[]` AC5 unit** → `bet-decomposition.test.ts` (or the existing `.test.ts`) with a config-capturing adapter.
3. **NEW agent-driven matrix file** `AK3-real-decomposition.integration.test.ts` → four lanes via Decision A (`decompositionDepsForLane`), `requireHarness`, `[harness:X]`, hard-fail on absent. Asserts the real agent's decomposition persisted. Add to `EXPLICIT_HARNESS_INTEGRATION` + `HARNESS_INCLUDE`.

> **Note on "service-integration `.integration.test.ts` is fine":** the track only forbids a *scripted/echo HARNESS adapter* in a `.integration.test.ts`. A real-DB-real-app test with no harness stub is a legitimate service integration and KEEPS its suffix. The `makeFabricLikeStrategy` and `runDecompositionTurn` are NOT harness adapters — they are a selection-port stub and a supplied-task seam. They remain legitimate; the file just must not also pretend the *harness* ran. Since this file never instantiated a real or scripted *harness* adapter except in the AC5 mock-capture test, the cleanest end-state is: **keep the DB/app assertions as service-integration; demote the override-driven `runBetDecomposition` assertions to units; move AC5 to a unit; add the new agent file.** Reviewer: confirm we are not over-demoting — if a reviewer prefers all non-agent assertions as plain `.test.ts` units (no DB), note PGlite-backed assertions need the `db` fixture and therefore the `.integration` (service) lane.

### 2.4 `AK3-bet-decomposition-subscriber.integration.test.ts` (266 LOC)

Proves the event subscriber wires `bet_state_changed(active)` → `runBetDecomposition`, with CAS idempotency. Uses **`runDecompositionTurn` override** (Branch 2) + `makeFabricLikeStrategy` + real `eventBus` fixture.

| Assertion | Depends on real agent? | Decision |
|---|---|---|
| `emitting active twice runs decomposition only once (CAS)` | No — override turn; tests the subscriber's dedup, not the agent | **DEMOTE** |
| `subscriber ignores non-active transitions` | No — event filtering | **DEMOTE** |
| `after decomposition, tasks are accepted (dispatcher-ready)` | No — override returns a supplied task; asserts state transition | **DEMOTE** |

**All three are subscriber-wiring + supplied-decomposition logic.** No real agent. **DEMOTE the whole file.** It still needs the **real `eventBus`** + **real `db`** fixtures (the integration point under test is the event→service wiring, which is *service* integration, NOT harness). So: **keep it a `.integration.test.ts` (service lane), strip nothing, but it already has no harness adapter** — it is already honest as a *service* integration; its only sin is the `.integration` suffix implying harness when it does not stub one. **Verdict: it is honest as-is for service integration.** The override is a legitimate supplied-decomposition seam. **No change required beyond confirming it carries no scripted harness adapter (it does not) and is not counted as harness-facing (it is not — path-only predicate excludes it).**

> **Builder action for 2.4:** verify (no scripted harness adapter present — confirmed: only `runDecompositionTurn` + `makeFabricLikeStrategy`, both legitimate non-harness stubs). If the reviewer wants the supplied-decomposition assertions stated as units, they can move to `.test.ts`, but they need `db`+`eventBus` fixtures, so the **service `.integration.test.ts`** is the correct honest home. **Leave as service-integration; no scripted-harness removal needed.**

### 2.5 `AK8-strategy-decomposition.integration.test.ts` (672 LOC)

Proves the **Strategy port owns decomposition** (AC1 `decomposeBet` is called; AC4 runtime strategy-swap changes the decomposer). Uses `runDecompositionTurn` override + three fake strategies (minimal-spy, fabric-like, divergent) + real `db`/`eventBus`.

| describe / assertion | Mechanism | Real agent? | Decision |
|---|---|---|---|
| AC1 `emits work_decompose_requested` | Override + spy strategy | No | **DEMOTE** (service: event + spy) |
| AC1 `calls Strategy.decomposeBet with betId` (WARNING-4 spy) | Spy on fake strategy | No — proves Kernel asks the port, not a constant; the *port call* is the integration point, the strategy is legitimately faked | **DEMOTE** |
| AC1 `duplicate active → exactly one emit + one decomposeBet (CAS)` | Spy + override | No | **DEMOTE** |
| AC2 `Minimal: ≥1 task, eligible owner, accepted` | Override (`stubTurn`) | No — supplied task list | **DEMOTE** |
| AC2 `Fabric-like: AK3 parity` | Override | No | **DEMOTE** |
| AC3 `no eligible agents → blocked/no_eligible_agent + decomposeBet NOT called` | Guard + spy | No | **DEMOTE** |
| AC3 `invalid decomposerAgentId → blocked/no_eligible_agent (inline guard)` | Fake strategy returns off-team id | No — validation logic over a supplied plan | **DEMOTE** |
| AC3 `decomposeBet throws → blocked/failed` | Fake strategy rejects | No — error handling | **DEMOTE** |
| AC3 `duplicate via subscriber → exactly one decomposition (CAS)` | Spy + override | No | **DEMOTE** |
| AC4 `Minimal picks PM; divergent picks first → different decomposers, no Kernel edit` | Two fake strategies + override | No — the *swap proof* is about the Kernel reading the port's response; the strategies are deliberately fake to make the divergence observable. A real agent would make this assertion NON-deterministic and unable to prove "different decomposer = strategy choice, not model randomness" | **DEMOTE** |

**Entire AK8 file is DEMOTE.** Crucially, **AC4's runtime-swap proof is *better* as a unit than as a real-agent test**: its whole point is that *the Kernel never references a concrete Strategy* — proven by swapping two fake strategies and observing the Kernel uses whichever is registered. A real agent would inject model randomness that destroys the "the difference came from the strategy swap, not the model" inference. These are **pure-logic over a supplied decomposition / a faked port** by construction. The `decomposeBet` spy is a legitimate stub of the Strategy port.

**Target:** `AK8-strategy-decomposition.test.ts` (drop `.integration`) OR keep `.integration` as **service** (needs `db`/`eventBus`). Since all assertions need the DB and the event bus, the honest home is a **service `.integration.test.ts` with no harness stub** — which it already is (no scripted harness adapter present; only fake strategies + override). **Verdict: AK8 is already honest as a *service* integration test; it stubs the Strategy port + the turn seam, neither of which is a harness.** The `.integration` suffix is correct for service integration.

> **Reviewer tension to resolve:** the spec lists AK8 among the five to "convert or demote." Reading the code, AK8 contains **zero** scripted/echo *harness* adapters — it only fakes the Strategy port and the turn seam, both legitimate. By the two-archetypes rule, every AK8 assertion is pure-logic/service. So AK8's "honest split" outcome is: **confirm it is already an honest service-integration file (no harness stub to remove); the agent-driven proof AK8 was *claiming* via the override now lives in the NEW `AK3-real-decomposition.integration.test.ts` matrix file (§2.3.3).** This satisfies the AC ("either converted… or demoted to a unit whose stubs are honest") — AK8's stubs ARE honest (Strategy-port + turn seam), so it is the demotion case; the real-agent claim is carried once, in the dedicated matrix file.

---

## 3. End-state file map

| File | End state | Lane | Matrix? | Allowlist / config |
|---|---|---|---|---|
| `AK2-contributor-scenario.integration.test.ts` | CONVERT — real session under custom Strategy via `runThroughHarness` | harness | 4 lanes | + `EXPLICIT_HARNESS_INTEGRATION`, + `HARNESS_INCLUDE` |
| `AK2-minimal-strategy.integration.test.ts` | CONVERT (completion) via `runThroughHarness`; inertness assertions → new `minimal-strategy.test.ts` unit | harness + unit | 4 lanes | + `EXPLICIT_HARNESS_INTEGRATION`, + `HARNESS_INCLUDE` |
| `AK3-bet-decomposition.integration.test.ts` | Keep DB/app assertions as service-integration; demote override-driven asserts to units; move AC5 `tools:[]` to unit | service + unit | — | no change (service path-excluded) |
| `AK3-real-decomposition.integration.test.ts` (**NEW**) | CONVERT — real agent decomposes a real bet via Decision A | harness | 4 lanes | + `EXPLICIT_HARNESS_INTEGRATION`, + `HARNESS_INCLUDE` |
| `AK3-bet-decomposition-subscriber.integration.test.ts` | Confirm honest service-integration (no harness stub); leave as-is | service | — | no change |
| `AK8-strategy-decomposition.integration.test.ts` | Confirm honest service-integration (Strategy-port + turn-seam stubs are legitimate); leave as-is | service | — | no change |
| `AK3-bet-decomposition.test.ts` (existing 78 LOC) | Grows — absorbs demoted pure-logic/AC5 units | unit | — | n/a |
| `provision-real-decomposition.ts` (**NEW** helper) | `decompositionDepsForLane(lane, ctx)` built on AR2 lane data + prep | test-support | — | n/a |

**Net new harness-facing files: 3** (AK2-contributor, AK2-minimal, AK3-real-decomposition) — these three carry the full 4×4 matrix and the agent-driven proof. The matrix executes (≥1 file × 4 lanes), satisfying the global per-harness floor; each of the three declares all four `requireHarness` lanes, satisfying the guard coverage check.

---

## 4. Ordered task list for the builder

**Phase 1 — Wiring + helper (foundation first).**
1. Write `packages/server/src/harness/__tests__/provision-real-decomposition.ts`: `decompositionDepsForLane(lane: HarnessLane, ctx: HarnessRunCtx): BetDecompositionDeps` — reuse `lane.prepFn` adapter construction + per-harness prep (`provisionCodexHome`/`provisionOpencodeHome`/`initGitRepo`/`OPENROUTER_API_KEY`), assemble a real `AdapterPool` + real `resolveModel` + scratch `sandboxBasePath` under `ctx.tmpDir`, **omit `runDecompositionTurn`** (forces Branch 3). Add a scratch-dir capture for the persisted-task assertion (assert via `db`, not sandbox — tasks are DB rows).
   - **MANDATORY `@lore` comment at the top of the helper (W-3)** — capture the `provisionSession`-vs-`runBetDecomposition`-Branch-3 divergence so no future agent "unifies" this back into `runThroughHarness`:
     > `@lore AR5` — This helper builds `BetDecompositionDeps` and drives `runBetDecomposition` **Branch 3** (`runRealPmTurn`), NOT `provisionSession`/`runThroughHarness`. The production decomposition turn does NOT flow through `provisionSession` — `runRealPmTurn` (bet-decomposition.ts:522) calls `adapterPool.select()` directly on a scratch `tools:[]` PM turn. Driving `provisionSession` here would prove "a real agent ran a *session*," not "a real agent *decomposed a bet*" — the exact false-adjacency Track AR exists to kill. Do NOT collapse this into `runThroughHarness`; that would silently weaken the proof to the wrong seam. The AK2 session-completion files correctly DO use `runThroughHarness` because there the thing under test genuinely is a session running to completion.
2. Add the three converted file paths to `EXPLICIT_HARNESS_INTEGRATION` in `scripts/lib/honest-harness-predicate.ts` and to `HARNESS_INCLUDE` in `vitest.integration.config.ts`. (Do this BEFORE writing the converted tests so the guard coverage check is live while you author them.)

**Phase 2 — Conversions (red→green per file).**
3. CONVERT `AK2-contributor-scenario`: rewrite as `for (const lane of SUPPORTED_HARNESS_LANES) { describe(\`${lane.describeTag} …\`, () => { requireHarness(lane.harnessName); … }) }` using `runThroughHarness`; register `ContributorStrategy` via `setActiveStrategy`; assert handoff fields / dispose / completion / captured context on the real session. **Delete `EchoHarnessAdapter`.**
4. CONVERT `AK2-minimal-strategy`: four-lane `runThroughHarness` for the completion assertion; move the two inertness assertions to a new `minimal-strategy.test.ts` unit (direct Strategy-object calls). **Delete `EchoHarnessAdapter`.**
5. NEW `AK3-real-decomposition.integration.test.ts`: four-lane via `decompositionDepsForLane`; seed a real team+eligible agent+bet; call `runBetDecomposition` (Branch 3); assert ≥1 persisted task with non-trivial title AND `decompositionStatus='done'`. Robust assertion per Decision A risk note.

**Phase 3 — Demotions (assertion-preserving relabels).**
6. `AK3-bet-decomposition.integration.test.ts`: demote override-driven `runBetDecomposition` asserts to `bet-decomposition.test.ts` units. **MANDATORY (W-5): relocate the AC5 `tools:[]` config-capturing `mockAdapter` (`:~640`) to a `bet-decomposition.test.ts` unit** — a constructed `HarnessAdapter` may NOT remain in this `.integration.test.ts`; this is one of the actual AC1 violations, not an optional cleanup. Keep DB/app asserts (`findEligibleTeamAgents`, `resolveOrphanedDecompositions`, `GET /bets/:id`) as service-integration. Preserve every assertion verbatim. **End-state guard for this file: zero `implements HarnessAdapter` / `new …Adapter` constructions remain.**
7. `AK3-bet-decomposition-subscriber.integration.test.ts`: confirm no scripted harness adapter; leave as honest service-integration. (No-op beyond the confirmation comment.)
8. `AK8-strategy-decomposition.integration.test.ts`: confirm Strategy-port + turn-seam stubs are the only fakes; leave as honest service-integration.

**Phase 4 — Allowlist hygiene + gate.**
9. The three new harness files reach **full** 4-lane coverage on first write, so they are **never** added to `coverage-debt.allowlist.json` (the allowlist is for not-yet-converted debt; AR5's converts land at full coverage). Confirm none of the five appears on `honest-harness-guard.allowlist.json` (they never did). **No allowlist additions** — only `EXPLICIT_HARNESS_INTEGRATION` (predicate) + `HARNESS_INCLUDE` (vitest) edits.
10. Run `npm run lint` (honest-harness-guard coverage check passes for the three converts), `npm run check`, `npm run test:integration` locally (all four binaries installed + authed per MEMORY). The per-harness floor must show `agenticExecutedByHarness` ≥1 for all of builtin/claude/codex/opencode.

---

## 5. Coverage-debt allowlist + attestation floor — exact application

- **`coverage-debt.allowlist.json`:** unchanged. AR5 adds three NEW harness files that are born at full coverage; the allowlist only ever holds files that are harness-facing but *not yet* full-matrix. A monotonically-shrinking allowlist is the invariant — AR5 neither adds nor needs to remove entries (the five were never on it, because the path-only predicate never classified them as harness-facing). **State this explicitly in the PR so the reviewer does not expect an allowlist shrink.**
- **`honest-harness-guard.allowlist.json`:** unchanged for the same reason.
- **Per-harness floor (`agenticExecutedByHarness`):** satisfied globally by the three converted files emitting all four `[harness:X]` lanes. `assertHarnessFloor` checks the union across the run, so even one fully-covered file would satisfy it; three is belt-and-braces. Each converted file independently satisfies the guard's **per-file** coverage check (all four `requireHarness` lanes declared).
- **Hard-fail on absent binary:** inherited free from `requireHarness(lane.harnessName)` at each lane's describe scope — no `skipIf` anywhere. Per MEMORY, all four binaries are installed + authed locally, so this is fully runnable.

---

## 6. Open risks for the reviewer

1. **Decision A assertion robustness (highest).** The agent-driven test asserts on a real model's JSON-completion task list (`tools:[]`, JSON-only prompt). Confirm the assertion fails on fake/empty output yet survives model phrasing variance (lean on `harness` project `retry:2`). If a harness reliably can't return parseable JSON for a tiny bet, that is a real production-prompt fragility finding — surface, don't mask.
2. **`provisionSession` vs `runRealPmTurn` divergence.** AR5 uses `runThroughHarness` (→ `provisionSession`) for the AK2 *session-completion* files, but `decompositionDepsForLane` (→ `runBetDecomposition` Branch 3) for the AK3 *decomposition* file — because the production decomposition turn does NOT go through `provisionSession`. The spec's "through provisionSession" phrasing is literally true only for AK2; AK3-real-decomposition rides the real `runRealPmTurn` adapter path instead, which is the *correct* production decomposition seam. Reviewer: confirm this is the honest reading (driving `provisionSession` for a decomposition would prove the wrong thing).
3. **AK8 / subscriber "demote" is really "confirm honest."** Neither file stubs a *harness*; both stub the Strategy port / turn seam (legitimate) over the real DB + event bus. The honest end-state is "service-integration, no change" — NOT a harness conversion and NOT a `.test.ts` rename (they need fixtures). Reviewer: confirm this satisfies the AC's "demoted to a unit whose stubs are honest" (service-integration with legitimate non-harness stubs is the spirit; the false *harness-integration* claim was never actually present, only implied by proximity).
4. **Path-only guard blind spot (cross-cutting).** The fact that all five files dodged the guard for being outside `harness/__tests__/` is itself a finding: a *future* scripted-harness test placed in `server/src/__tests__/` would also dodge it. AR5 closes its own three files by listing them in `EXPLICIT_HARNESS_INTEGRATION`, but the general gap (any `server/src/__tests__/*.integration.test.ts` that instantiates a `HarnessAdapter` is invisible to the guard) is **AR6 territory or a new finding** — flag it, don't fix it in AR5.
5. **Over-demotion check.** Demotions must preserve every assertion verbatim (spec: "demotions preserve the assertion; they change the lane"). Reviewer to diff each demoted assertion against its origin and confirm nothing was weakened or dropped.

### Explicitly OUT of AR5 scope — do not touch (reviewer NOTE N-1)

- **`AK2-fabric-parity.integration.test.ts` is NOT one of AR5's five files and is OUT of scope.** Verified it carries the same smell — it constructs an `EchoHarnessAdapter` (`:141 class EchoHarnessAdapter implements HarnessAdapter`, used at `:280,:306`) inside a `*.integration.test.ts`. This is a real sibling violation, but the AR5 work-package boundary is the **named five** (`AK2-contributor-scenario`, `AK2-minimal-strategy`, `AK3-bet-decomposition`, `AK3-bet-decomposition-subscriber`, `AK8-strategy-decomposition`). **The builder must NOT convert or modify `AK2-fabric-parity` in this WP.** It is tracked for a future WP (its conversion is the same shape as AK2-minimal — fabric-parity under a real session). Stating it here so it is not silently forgotten and not silently swept into AR5's diff.
