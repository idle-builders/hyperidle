# AK8 — Architecture: decomposition becomes a Strategy response to a Kernel event

Concept: `plans/AK8/concept.md` (no new noun). Boundary: `docs/architecture/kernel-strategy-split.md` §2a/§3b/§4.

## Required reading (builder)
- `docs/architecture/kernel-strategy-split.md` §2a (three-way cut), §3b (AK7 selection seam), §4 (AK3 as-built = Minimal fallback).
- `packages/shared/src/strategy-port.ts` — the 4-method port; AK8 adds the 5th.
- `packages/shared/src/events.ts` — `KernelEvent` union, `WorkSelectionRequestedEvent` (the sibling event pattern AK8 copies).
- `packages/server/src/services/bet-decomposition.ts` — `runBetDecomposition`, `findEligibleTeamAgents`, `insertProposedBetTasks`, `resolveOrphanedDecompositions`, CAS, `markTerminal`.
- `packages/server/src/services/bet-decomposition-subscriber.ts` — the subscriber being rewired.
- `packages/server/src/services/select-agent.ts` — `selectOwner`, `enumerateTeamCandidates`.
- `packages/fabric/src/fabric-strategy.ts`, `packages/strategy-minimal/src/minimal-strategy.ts`, `packages/fabric/src/services/agent-selection.ts`.
- `packages/server/src/server-factory.ts` L260-285 (boot wiring).

---

## Key architectural decision: what moves behind the port vs what stays Kernel

The §2a cut for "spawn an agent to do work" is **Trigger=Kernel / Selection=Strategy / Execution=Kernel**. Applied to decomposition, the precise cut is the crux of this WP:

| Piece | Owner | AK8 disposition |
|---|---|---|
| Commit fires "work to decompose" | **Kernel** | New `work_decompose_requested` event emitted from the decomposition flow (was: implicit in `bet_state_changed(active)` subscriber). |
| **Which** decomposer agent, **what** the breakdown is (count, titles, owners) | **Strategy** | New port method `decomposeBet` returns a `DecompositionPlan` (the task list + the chosen decomposer agent id). |
| Sandbox lifecycle, cost-cap, CAS, crash-recovery, persist tasks, dispatch | **Kernel** | Stays in `bet-decomposition.ts`. The Kernel runs the PM turn *as mechanism on behalf of the Strategy's chosen agent* — Execution is Kernel (§2a row 3). |

### Design-it-twice on the port boundary (the one non-trivial decision)

**Option A — port returns a plan, Kernel executes (CHOSEN).**
`decomposeBet(req) → { decomposerAgentId, tasks }`. The Strategy decides *who decomposes* and *what the breakdown is*; the Kernel keeps the sandbox/cost/CAS/persist machinery in `runBetDecomposition`. Minimal returns AK3's trivial answer (pick first eligible / role-match PM, and — for the no-LLM default — an empty `tasks` so the Kernel runs its existing PM turn as the fallback breakdown). Fabric returns a knowledge-matched decomposer + may pre-populate `tasks` from knowledge.
- Trade-off: the Kernel still owns the LLM-turn plumbing (`runRealPmTurn`, adapter pool, `resolveModel`). That's correct per §2a row 3 (Execution=Kernel mechanism) and avoids handing harness/cost into the Strategy package (hard-rule: cost stays Kernel-side; Strategy never spawns a session — strategy-port.ts:294).
- Reject reason for the alternative below.

**Option B — port owns the whole turn.**
`decomposeBet` runs the sandbox + LLM turn inside the Strategy and returns finished tasks. Rejected: violates "the Strategy NEVER spawns/attaches a session and NEVER enforces cost" (strategy-port.ts:294, §2 hard rules). Would pull `adapterPool`, `resolveModel`, `checkCostCap`, sandbox base path into `packages/fabric`/`packages/strategy-minimal` — a layering inversion and a duplication of the Kernel's harness wiring across every Strategy. Higher coupling surface, no benefit: decomposition *quality* (the only thing Fabric improves) lives in the **plan** (which agent, which knowledge, which task shape), not in the turn plumbing.

**Synthesis:** Option A. The port method is a *planning* call (occasion → decision), exactly like `selectAgent`. The Kernel's `runBetDecomposition` becomes: emit event → ask Strategy for the plan → if the plan carries tasks, persist them; else run the Kernel's PM turn (the AK3 fallback) seeded by the Strategy-chosen decomposer → persist → dispatch. This keeps AK3's entire mechanism intact and makes "how/who" swappable with zero Kernel change (AC4).

> **Why the Minimal default still runs the Kernel PM turn:** AK3-as-built IS the Minimal fallback (§4). The Minimal Strategy has no knowledge to produce a task list, so it returns `{ decomposerAgentId, tasks: [] }` and the Kernel runs its existing PM turn — byte-identical to AK3 today. "Tasks come from the Kernel PM turn" is the *Minimal* behaviour, not a Kernel-permanent route; a Strategy that wants to decompose from knowledge returns a non-empty `tasks` and the turn is skipped.

---

## The new event (`packages/shared/src/events.ts`)

Sibling of `WorkSelectionRequestedEvent`. Emitted by the Kernel when a committed bet enters decomposition — the observable "work to decompose" occasion (AC1).

```ts
export interface WorkDecomposeRequestedEvent {
  type: "work_decompose_requested";
  streamId: string;   // = teamId
  teamId: string;
  betId: string;      // the work keyed to this decomposition
  at: string;         // ISO 8601
}
```

Add to the `KernelEvent` union (`@lore O1` checklist: interface + union + emit site). It is **audit/observability-only** in AK8 — like `work_selection_requested`, no subscriber mutates state off it; the decision arrives via the synchronous port call (event-then-call ordering, §3b precedent). This keeps AC1 ("Kernel emits the event; does not itself decide") literally true: the Kernel emits, then *asks* the Strategy.

---

## The new port method (`packages/shared/src/strategy-port.ts`)

```ts
/** AK8: occasion for a bet decomposition. Carries the bet + the Kernel-enumerated
 *  eligible candidates (mechanism), never an answer. teamId/betId for correlation. */
export interface DecomposeBetRequest<TDb> {
  readonly db: TDb;
  readonly teamId: string;
  readonly betId: string;
  readonly betDescription: string;
  readonly betDoneCondition: string | null;
  /** Eligible team candidates (active AI, category='team', orderBy users.id) —
   *  same enumeration as selectAgent's `candidates`. The Strategy picks the decomposer. */
  readonly candidates: readonly SelectionCandidate[];
}

/** AK8: the Strategy's decomposition decision.
 *  - decomposerAgentId: which agent decomposes. null = no eligible decomposer → Kernel blocks.
 *    NOT pre-validated — the Kernel re-validates it against the enumerated candidates (membership +
 *    active-AI) before any session, since a third-party Strategy could return an off-team/inactive id.
 *  - tasks: the breakdown IF the Strategy authored one. EMPTY ([]) = "Kernel, run your default turn
 *    with decomposerAgentId" (the AK3/Minimal fallback). NB: []-from-Strategy means "run turn";
 *    []-from-turn means blocked/empty (T5 @lore documents the asymmetry at both sites). */
export interface DecompositionPlan {
  readonly decomposerAgentId: string | null;
  readonly tasks: readonly DecompositionTaskInput[];
}

// on interface Strategy<TDb>:
decomposeBet(req: DecomposeBetRequest<TDb>): Promise<DecompositionPlan>;
```

`DecompositionTaskInput` already exists (`@hyperidle/shared`, used by AK3). `SelectionCandidate` exists (AK7). No new shared types beyond the two above + the event.

### Minimal (`packages/strategy-minimal/src/minimal-strategy.ts`)
```ts
async decomposeBet(req) {
  // AK3 fallback: role-match PM else first candidate; NO knowledge task list.
  const pm = req.candidates.find(c => c.role === "product_manager") ?? req.candidates[0];
  return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
}
```
`tasks: []` → Kernel runs its existing PM turn → AK3-identical breakdown (the validation scenario: ≥1 task owned by the team's single agent, into dispatch).

### Fabric (`packages/fabric/src/fabric-strategy.ts` → delegates to `packages/fabric/src/services/agent-selection.ts` or a new `bet-decomposition-fabric.ts`)
```ts
async decomposeBet(req) {
  // Knowledge-matched decomposer (role-match PM on candidates, same oracle as bet_decomposer).
  const pm = req.candidates.find(c => c.role === "product_manager") ?? req.candidates[0];
  // AK8 v1: Fabric returns tasks:[] too → Kernel PM turn runs with knowledge-assembled context
  //         (assembleContext already gives the Fabric its knowledge edge at turn time).
  return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
}
```

> **Fabric "knowledge-matched" in v1 = knowledge-matched *decomposer selection* + the Fabric's `assembleContext` feeding the PM turn** (already wired in `runBetDecomposition` turn path). The spec's "knowledge-matched decomposition" is satisfied IN V1 by (a) the Fabric picking the decomposer and (b) the Fabric's context assembly enriching the turn — *not* by the Fabric pre-computing a task list. **A richer knowledge-derived breakdown is explicitly out of scope for AK8 — it is an eval concern (judging decomposition quality needs a live LLM, not a unit/integration test).**
>
> **Concretely for the AC2-Fabric test:** it asserts **AK3 parity (no regression)** — Fabric + committed bet → tasks created, owned by eligible agents, accepted into dispatch, matching the AK3 oracle — NOT a knowledge-derived task list (which v1 cannot produce, since Fabric returns `tasks:[]` and falls through to the same turn/override). The test MUST NOT assert a richer breakdown; doing so would force the builder to fake knowledge output to pass (MEMORY: tests must not drive behavior). The `tasks` field is the seam that lets a future Fabric return a knowledge-derived breakdown with zero Kernel change — proving AC4's "no Kernel code change" claim structurally. This is the no-regression-vs-AK3 path: same turn, same dispatch.

---

## Moving the subscriber behind the event (the rewire)

**Before (AK3):** `registerBetDecomposition` subscribes to `bet_state_changed(active)` → `runBetDecomposition` (Kernel picks PM inline via `selectOwner(bet_decomposer)`).

**After (AK8):** The subscriber stays as the *trigger wiring* (Kernel owns the trigger — §2a row 1) but `runBetDecomposition` is rewired internally:

1. CAS NULL→'running' (unchanged — idempotency).
2. Load bet. `findEligibleTeamAgents` → none → `blocked/no_eligible_agent` (unchanged).
3. **Emit `work_decompose_requested`** (AC1 observable occasion). Post-CAS, post-eligible-check — only the CAS winner emits, so duplicate `bet_state_changed` → exactly one emit.
4. `enumerateTeamCandidates(db, teamId)` (reuse AK7 helper) → **`getActiveStrategy().decomposeBet({ … candidates })`** wrapped in try/catch (throw → `blocked/failed`, mirror the `assembleContext` catch). (AC1: Strategy decides; AC4: swap Strategy = swap behaviour.)
5. `plan.decomposerAgentId === null` → `blocked/no_eligible_agent` (unchanged guarantee).
6. **Inline-validate `decomposerAgentId`** (see "Decomposer validation" below) → invalid → `blocked/no_eligible_agent` (unattachable-session guard).
7. Cost pre-flight `checkCostCap` on the validated decomposer (unchanged — Kernel-side).
8. **Turn-source precedence** (see "Turn-source precedence" below) → either persist `plan.tasks`, run the `runDecompositionTurn` override, or run the real PM turn → `taskList`.
9. `taskList` empty → `blocked/empty`. Else `insertProposedBetTasks` → `task_state_changed(accepted)` → existing dispatcher (unchanged).
10. `markTerminal('done')`. `finally` rm scratch sandbox.

The `bet_decomposer` `selectOwner` call (AK7) is **replaced** by the `decomposeBet` plan's `decomposerAgentId` — decomposer choice now comes from the Strategy's decomposition decision, not a separate selection call. The per-task `bet_task` `selectOwner` calls inside `insertProposedBetTasks` stay (AK7 owns task-owner assignment). This avoids two competing seams for "who decomposes."

### Turn-source precedence (CRITICAL 1 — explicit fall-through)

`selectOwner` previously validated the decomposer internally and the override seam interacted only with the turn. Removing `selectOwner` means the new flow must define precedence explicitly, because every protected AK3 integration test injects `deps.runDecompositionTurn` to skip the real LLM turn (bet-decomposition.ts:73; AK3-bet-decomposition.integration.test.ts:159,189,380…). Those frozen assertions MUST keep passing without relaxation. Step 8 resolves the breakdown source in this **exact order**:

1. **`plan.tasks.length > 0`** → persist those tasks via `insertProposedBetTasks`; **skip both** the override and the real turn. (Strategy authored the breakdown — future Fabric path. No current Strategy hits this in v1.)
2. **else `deps.runDecompositionTurn` override present** → call it (supplying the **Strategy-chosen `decomposerAgentId`** as the decomposing agent) → its returned task list. **This is the protected-test path**: every AK3 integration test stays on this branch, byte-identical to today, because v1 Strategies return `tasks:[]` and the tests still inject the override.
3. **else** → real PM turn: scratch sandbox + `assembleContext` + `runRealPmTurn` (the AK3-as-built / Minimal default fallback) → task list.

Rationale for this order: `plan.tasks` is the Strategy's authored decision (highest authority — it bypasses the Kernel turn entirely); the override is a test/deps seam that replaces only the turn mechanism, so it ranks below a real authored plan but above the live turn; the real turn is the default mechanism. The override never overrides `plan.tasks` because that would let a test seam mask a Strategy decision — the inverse of what the seam is for. Because all v1 Strategies (Minimal, Fabric) return `tasks:[]`, the protected tests deterministically land on branch 2 and never observe a behaviour change.

> The empty-list asymmetry: `plan.tasks === []` means "Strategy authored no breakdown → fall through to override/turn", whereas an **empty `taskList` produced by the turn** (step 9) means `blocked/empty`. Same `[]` value, opposite meaning depending on origin. T5 ships a `@lore` spelling this out at both sites. (Design-it-twice: an explicit `tasks: DecompositionTaskInput[] | null` sentinel — `null` = "run your turn", `[]` = "I produced zero" — was considered. Rejected for v1: no Strategy ever returns a deliberate empty breakdown (that path is `blocked/no_eligible_agent` upstream), so the `null`/`[]` distinction is currently unreachable and would add an always-null field to the contract. The `@lore` carries the asymmetry until a Strategy needs the distinction.)

### Decomposer validation (WARNING 1 — inline guard, `selectOwner` no longer runs)

`selectOwner(bet_decomposer)` validated its returned agent internally (active AI user — select-agent.ts:149-153). That call is removed, so its guard no longer executes on this path. `decomposeBet` returns a **raw** `decomposerAgentId` the Strategy chose — for a future third-party Strategy it could be off-team, inactive, or non-existent. T3 adds an explicit inline guard in `bet-decomposition.ts` (net-new Kernel mechanism, not a Strategy decision): load the `users` row for `decomposerAgentId`, assert it exists **and** `kind === 'ai'` **and** `status === 'active'` **and** is a member of `teamId` (i.e. present in the enumerated `candidates`). Any failure → `markTerminal('blocked', 'no_eligible_agent')`. This is the same predicate `findEligibleTeamAgents`/`enumerateTeamCandidates` already apply — the cheapest correct form is `candidates.some(c => c.agentId === plan.decomposerAgentId)`, which proves membership + eligibility in one check since `candidates` is already the active-AI-on-team set. `decomposerAgentId` is therefore **not** pre-validated by the contract; the Kernel validates it.

`registerBetDecomposition` subscriber body is otherwise unchanged (still fire-and-forget `runBetDecomposition`, still `bet_state_changed(active)` filter). The "Kernel event" the spec asks for is `work_decompose_requested` emitted *inside* the flow; `bet_state_changed` remains the commit fact that triggers it. (Alternative — a separate `work_decompose_requested` subscriber replacing the `bet_state_changed` one — adds a second hop and a second CAS race window for no benefit; rejected.)

---

## How every AK3 guarantee is preserved (per-guarantee)

| AK3 guarantee | Mechanism | Preserved by |
|---|---|---|
| **No false promise** (never indefinite zero-tasks) | `runBetDecomposition` NEVER throws; always `markTerminal` before return | Untouched — every new early-exit (null decomposer, invalid id) calls `markTerminal('blocked', …)`. New port call wrapped so a Strategy throw → `blocked/failed` (add try/catch around `decomposeBet`, mirror the `assembleContext` catch). |
| **Explicit blocker on no-eligible-agent** | `findEligibleTeamAgents` empty → `blocked/no_eligible_agent`; surfaced in 4-state UI | Step 2 unchanged + step 5/6 add `null/invalid decomposerAgentId → blocked/no_eligible_agent`. Same reason code → same UI copy + "Add an agent" link. |
| **Bet surface reflects real task state** | `decompositionStatus`/`decompositionBlockerReason` columns; GET `/bets/:id` | No schema/UI change. `WorkBet.tsx` four-state surface reused verbatim (spec: no fork). |
| **Idempotency / CAS** | NULL→'running' CAS at top of `runBetDecomposition` | Unchanged. The new event emit is post-CAS (only the CAS winner emits + calls the port), so a duplicate `bet_state_changed` neither re-emits `work_decompose_requested` nor double-calls `decomposeBet`. |
| **Crash recovery** | `resolveOrphanedDecompositions` boot sweep flips 'running'→blocked/failed | Unchanged — boot wiring + sweep untouched. Strategy call is in-process within the same turn; a crash mid-`decomposeBet` leaves 'running' → swept identically to a crash mid-PM-turn. |
| **User Sovereignty** | PM turn runs `tools: []`; no irreversible external action; human commits the bet | Unchanged. `decomposeBet` is a pure planning call (no session, no tools, no external effect — strategy-port.ts hard rule). The fallback turn is still `tools: []`. |

---

## Plan reconciliation (spec ⇆ reality)
- "Kernel work event" — AK7 shipped `work_selection_requested`; AK8 adds the sibling `work_decompose_requested` (same shape, same audit-only semantics). ✓ pattern exists.
- "Strategy handles it" — port is real (`getActiveStrategy()`), 4 methods; adding a 5th is the AK6/AK7 idiom. ✓
- "AK3 path = Minimal fallback" — §4 already declares this; code change = Minimal returns `tasks:[]` and Kernel keeps `runRealPmTurn`. ✓
- "Reuse AK3 UI + dispatch, no fork" — no `WorkBet.tsx` change, no new dispatch route; `insertProposedBetTasks` → `transitionTask(accepted)` → existing dispatcher untouched. ✓
- `selectOwner(bet_decomposer)` (AK7) — currently the decomposer-pick site; AK8 supersedes it with `decomposeBet.decomposerAgentId`. The `bet_decomposer` surface in the `SelectAgentRequest` union becomes dead at the production call site. **Decision: retain the `bet_decomposer` surface in the union** (no schema churn, AK7 tests reference it) but remove its only production caller. Note for review: this leaves `bet_decomposer` exercised by AK7 unit tests only — acceptable; flag in the WP so the reviewer's dead-code lens expects it. (Alternative: delete the surface — rejected: churns the AK7 closed union + AK7 protected tests for no functional gain.)

---

## Ordered task list (each = one commit boundary)

**T1 — Shared contracts + protected-fixture typecheck repair (red-safe scaffolding).**
Files: `packages/shared/src/events.ts` (+`WorkDecomposeRequestedEvent`, add to `KernelEvent`), `packages/shared/src/strategy-port.ts` (+`DecomposeBetRequest`, `DecompositionPlan`, `decomposeBet` on `Strategy`).
**Also files-to-touch (WARNING 3):** every inline `Strategy<TDb>` test fixture/object-literal breaks typecheck the moment the 5th method lands. Add `decomposeBet` to each:
  - `packages/server/src/__tests__/AK3-bet-decomposition.integration.test.ts` — `makeFabricLikeStrategy()` (and any sibling inline Strategy literals there). Give it a `decomposeBet` returning `{ decomposerAgentId: <role-match PM of candidates>, tasks: [] }` so the fixture lands on the override branch (turn-source precedence branch 2). **Fixture shape grows; every frozen assertion stays byte-identical.**
  - Any inline Strategy literal in the other protected files (AK7 select-owner, fabric agent-selection) + strategy-minimal/fabric unit-test fixtures.
Proves: AC1/AC4 contract surface. `npm run check` compiles (incl. fixtures); the `switch(event.type)` exhaustiveness over `KernelEvent` still compiles with no default.

**T2 — Strategy implementations.**
Files: `packages/strategy-minimal/src/minimal-strategy.ts` (`decomposeBet` → role-match PM, `tasks:[]`), `packages/fabric/src/fabric-strategy.ts` + `packages/fabric/src/services/agent-selection.ts` (or new `bet-decomposition-fabric.ts`) (`decomposeBet` → role-match decomposer, `tasks:[]`).
**Also:** the **divergent-decomposer test fixture** the AC4 swap test needs (see T3 / AC4 proof) — a `Strategy` whose `decomposeBet` returns a demonstrably *different* decomposer than Minimal's role-match PM (e.g. `candidates[candidates.length - 1]`, or a non-PM candidate). Lives in the server integration test file (test-only fixture, not a shipped Strategy).
TDD: unit tests — Minimal returns the single eligible agent as decomposer; Fabric role-matches PM over a builder; both `tasks:[]`; both return `null` decomposer on empty candidates.

**T3 — Rewire `runBetDecomposition` through the port.**
Files: `packages/server/src/services/bet-decomposition.ts`.
- Emit `work_decompose_requested` post-CAS, post-eligible-check.
- Replace the `selectOwner({surface:'bet_decomposer'})` call with `enumerateTeamCandidates` + `getActiveStrategy().decomposeBet(...)`, wrapped in try/catch (throw → `blocked/failed`).
- **Inline-validate `decomposerAgentId`** (WARNING 1): `candidates.some(c => c.agentId === plan.decomposerAgentId)` (membership + active-AI eligibility in one check) → false → `blocked/no_eligible_agent`. The `selectOwner` internal guard no longer runs; this is its net-new inline replacement.
- **Turn-source precedence** (CRITICAL 1): step 8 fall-through `plan.tasks.length>0` → persist; else `deps.runDecompositionTurn` override → run it (with `plan.decomposerAgentId`); else real PM turn. Protected tests inject the override → land on branch 2 → byte-identical to AK3.
TDD (integration, server pkg):
  - Minimal + committed bet → ≥1 task, owned by eligible agent, accepted (AC2, scenario 1). **Spy `decomposeBet` was called with `objectContaining({ betId })`** (AC1 — would fail if the Kernel hard-coded the breakdown; WARNING 4).
  - Fabric + committed bet → tasks created, owned by eligible agents, accepted; **assert parity with the AK3 oracle, NOT a knowledge-derived breakdown** (AC2, scenario 2, no regression; WARNING 5).
  - **AC4 swap (divergent Strategy):** identical committed bet run under Minimal vs the **divergent-decomposer fixture** (T2) — no `bet-decomposition.ts` edit between runs — asserts a **different decomposer** is chosen/owns the dispatched work. (Minimal-vs-Fabric is vacuous: both role-match the same PM on a single-PM team. WARNING 2 / CRITICAL 2.)
  - No eligible agent → `blocked/no_eligible_agent` (AC3, scenario 3).
  - **Invalid `decomposerAgentId`** (Strategy returns an off-team/inactive id) → `blocked/no_eligible_agent` (AC3 — proves the inline guard; WARNING 1).
  - Strategy `decomposeBet` throws → `blocked/failed`, no throw out of `runBetDecomposition` (AC3 false-promise).
  - Duplicate `bet_state_changed(active)` → exactly one `work_decompose_requested`, one `decomposeBet` call (CAS; AC3 idempotency, AC1 post-CAS emit).

**T4 — Static guard against import + obvious round-robin regression (NOT the AC4 proof).**
File: `eslint.config.ts`.
- Extend/add a `no-restricted-imports` so `bet-decomposition.ts` cannot import a concrete Strategy (already covered by the AK2 server-scope guard — verify it catches `@hyperidle/strategy-minimal` + Fabric decomposition symbols; add the new Fabric decompose export to the ban list if it leaks).
- Confirm the AK7 round-robin guard (`% <expr>.length` ban, allowlisting `select-agent.ts`) still holds.
**Honest scope (CRITICAL 2):** T4 is a **regression guard, not the AC4 proof.** The `% <expr>.length` selector does **not** fire on a re-introduced inline `candidates.find(c => c.role === 'product_manager') ?? candidates[0]` (a `.find()` expression, not a modulo) — so ESLint alone cannot prove "no inline decomposer decision." Adding a `.find`-on-candidates guard is rejected: `.find` is too broad a pattern (the inline validation guard itself uses `candidates.some`), high false-positive risk. **AC4 is proven at RUNTIME by the T3 strategy-swap test using the divergent-decomposer fixture.** T4's static role: (a) the import ban prevents the Kernel *naming* a concrete Strategy, and (b) the round-robin guard catches the obvious AK7-style per-task regression. It does NOT, on its own, prove AC4.

**T5 — Boot wiring sanity + docs.**
Files: `packages/server/src/server-factory.ts` (no logic change expected — `registerBetDecomposition` deps unchanged; confirm), `docs/architecture/kernel-strategy-split.md` (append **§3c — As-built AK8**: the event, the 5th port method, the Minimal-fallback `tasks:[]` rule, the `bet_decomposer`-surface-now-dead note). Update §2a/§3b "What … does NOT move / deferred to AK8" status lines to "shipped."
Proves: as-built doc parity; `@lore AK8` comments on (a) the turn-source precedence (`plan.tasks` → override → real turn) and why the override never beats `plan.tasks`, (b) the `[]`-from-Strategy ("run turn") vs `[]`-from-turn ("blocked/empty") asymmetry at both sites, (c) the inline `decomposerAgentId` validation replacing `selectOwner`'s removed guard.

**Dependency order:** T1 → T2 → T3 (T2,T3 both need T1; T3 needs T2). T4, T5 after T3.

---

## AC → test/scenario mapping

| AC | Proof |
|---|---|
| **AC1** Kernel emits "work to decompose"; Kernel doesn't decide | T3 integration: assert `work_decompose_requested` emitted on commit (post-CAS, exactly one on duplicate). **Spy `decomposeBet` was actually called** (`expect(strategy.decomposeBet).toHaveBeenCalledWith(objectContaining({ betId }))`) — a "≥1 task created" assertion alone would pass even if the Kernel ignored the Strategy (WARNING 4). T1 `check`: event in union. |
| **AC2** Strategy produces breakdown; Minimal=AK3 trivial, Fabric=knowledge-matched, no regression | T3 scenario 1 (Minimal → ≥1 task, single agent, dispatch) + scenario 2 (Fabric → tasks created, eligible owners, dispatch; **parity vs AK3 oracle, NOT a knowledge-derived breakdown** — Fabric v1 = knowledge-matched decomposer + context-fed turn; richer breakdown is an out-of-scope eval concern; WARNING 5). T2 unit: decomposer selection per Strategy. |
| **AC3** All AK3 guarantees hold under both Strategies | T3: no-eligible → `blocked/no_eligible_agent` (scenario 3); invalid `decomposerAgentId` → `blocked/no_eligible_agent` (inline guard, WARNING 1); Strategy-throw → `blocked/failed` (no false promise); duplicate event → one decomposition + one emit (CAS); existing AK3 crash-recovery + GET `/bets/:id` 4-state tests stay green (protected). User Sovereignty: fallback turn `tools:[]` test (AK3 AC5) stays green. |
| **AC4** Swap Strategy changes behaviour, no Kernel code change | **RUNTIME proof (primary):** T3 runs an identical commit under `setActiveStrategy(minimalStrategy)` vs the **divergent-decomposer fixture** (T2) — test-level swap, no `bet-decomposition.ts` edit — asserting a **different decomposer** owns the dispatched work. Minimal-vs-Fabric is rejected (both role-match the same PM → vacuous; WARNING 2). **Static guard (secondary, not the proof):** T4 ESLint import-ban (Kernel can't name a concrete Strategy) + round-robin guard. ESLint does NOT prove "no inline decomposer decision" (a `.find()` pick evades the `% length` selector; CRITICAL 2) — the runtime swap test is the proof. |

---

## Protected tests
- `packages/server/src/__tests__/AK3-bet-decomposition.integration.test.ts`
- `packages/server/src/__tests__/AK3-bet-decomposition-subscriber.integration.test.ts`
- `packages/server/src/__tests__/AK3-bet-decomposition.test.ts`
- `packages/server/src/__tests__/AK7-select-owner.integration.test.ts`
- `packages/fabric/src/__tests__/AK7-agent-selection.test.ts`

**Contract: assertions frozen, setup may evolve** (AK7 retro). The AK3 tests that call `runBetDecomposition` directly: their *behavioural assertions* (terminal status, task count, owner eligibility, blocker reasons, idempotency, crash recovery, `tools:[]`) MUST stay byte-identical — they ARE the no-regression proof for AC2/AC3. Permitted setup-only changes (T1): (a) add `decomposeBet` to every inline `Strategy` fixture (`makeFabricLikeStrategy` et al.) so it typechecks against the 5th method — fixture returns `{ decomposerAgentId: <role-match PM>, tasks: [] }` to land on the override branch; (b) add a `setActiveStrategy` call if a test relies on the boot default. The injected `runDecompositionTurn` override stays and the tests stay on turn-source precedence branch 2 → byte-identical breakdown. Do not relax an assertion to make the rewire pass (MEMORY: tests must not drive behavior).

## Shared files
- `packages/shared/src/events.ts` (KernelEvent union)
- `packages/shared/src/strategy-port.ts` (Strategy interface — every Strategy impl must add `decomposeBet`)
- `eslint.config.ts`
- `docs/architecture/kernel-strategy-split.md`

## Security & abuse cases
- **Input-trust (agent-authored task fields):** `tasks` from a Strategy plan flow through the SAME `insertProposedBetTasks` truncation/`betId`-from-bet guards as the AK3 PM turn (cross-bet injection prevention — `betId` never from task input). Applicable + addressed (reuse). N/A for Minimal/Fabric (in-process, trusted code) but the seam is treated as untrusted for a future third-party Strategy.
- **Unattachable session:** `decomposerAgentId` is **not** pre-validated by the Strategy contract (it returns a raw chosen id). The Kernel validates it inline before any session — `candidates.some(c => c.agentId === plan.decomposerAgentId)` proves on-team membership + active-AI eligibility (WARNING 1; `selectOwner`'s internal guard no longer runs on this path). Invalid → `blocked/no_eligible_agent`. Applicable + addressed.
- **Cost:** `checkCostCap` pre-flight retained, Kernel-side, on the validated decomposer. Strategy never enforces/bypasses cost. Applicable + addressed.
- Rate-limit / SSRF / path-traversal / secrets: **N/A** — no new POST/PATCH route, no outbound URL, no new path input (scratch sandbox path is Kernel-derived from `betId`, unchanged), no new credential surface.

## Risks / edge cases
- **Strategy switch mid-decomposition:** exactly one active Strategy per process (hard rule); a swap only happens at boot/test setup, never mid-turn. A bet 'running' across a swap is swept by `resolveOrphanedDecompositions` at the next boot. No new risk.
- **Fabric knowledge unavailable / `decomposeBet` throws:** caught → `blocked/failed` (no false promise). The Fabric's `tasks:[]` v1 path means it never *computes* a task list, so there's no "knowledge unavailable" failure surface in v1 beyond `assembleContext` throwing (already → `blocked/failed`, AK3 path).
- **`bet_decomposer` AK7 surface goes dead at production:** documented decision (Plan reconciliation). Flag for reviewer's dead-code lens so it isn't mistaken for an unwired seam (AK7 retro's CRITICAL was the inverse — a seam wired nowhere; here it's a seam *superseded* deliberately).
- **Double seam temptation:** do NOT keep both `selectOwner(bet_decomposer)` and `decomposeBet.decomposerAgentId` choosing the decomposer. T3 removes the former; T4 ESLint guards against re-adding inline choice.
