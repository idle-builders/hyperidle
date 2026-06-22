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
 *  - decomposerAgentId: which agent decomposes (resolves to a Kernel user-id). null = no eligible decomposer.
 *  - tasks: the breakdown IF the Strategy produced one from knowledge. EMPTY = "Kernel, run your
 *    default PM turn with decomposerAgentId" (the AK3/Minimal fallback). */
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

> **Fabric "knowledge-matched" in v1 = knowledge-matched *decomposer selection* + the Fabric's `assembleContext` feeding the PM turn** (already wired in `runBetDecomposition` step 5). The spec's "knowledge-matched decomposition" is satisfied by (a) the Fabric picking the decomposer and (b) the Fabric's context assembly enriching the turn — *not* by the Fabric pre-computing a task list. **Decomposition quality is explicitly out of scope (eval concern).** The `tasks` field is the seam that lets a future Fabric return a knowledge-derived breakdown with zero Kernel change — proving AC4's "no Kernel code change" claim structurally. This is the no-regression-vs-AK3 path: same turn, same dispatch.

---

## Moving the subscriber behind the event (the rewire)

**Before (AK3):** `registerBetDecomposition` subscribes to `bet_state_changed(active)` → `runBetDecomposition` (Kernel picks PM inline via `selectOwner(bet_decomposer)`).

**After (AK8):** The subscriber stays as the *trigger wiring* (Kernel owns the trigger — §2a row 1) but `runBetDecomposition` is rewired internally:

1. CAS NULL→'running' (unchanged — idempotency).
2. Load bet. `findEligibleTeamAgents` → none → `blocked/no_eligible_agent` (unchanged).
3. **Emit `work_decompose_requested`** (AC1 observable occasion).
4. `enumerateTeamCandidates(db, teamId)` (reuse AK7 helper) → **`getActiveStrategy().decomposeBet({ … candidates })`** (AC1: Strategy decides; AC4: swap Strategy = swap behaviour).
5. `plan.decomposerAgentId === null` → `blocked/no_eligible_agent` (unchanged guarantee).
6. Validate `decomposerAgentId` via the same load-and-validate guard as `selectOwner` (active AI user) → invalid → `blocked/no_eligible_agent` (unattachable-session guard).
7. Cost pre-flight `checkCostCap` on the chosen decomposer (unchanged — Kernel-side).
8. If `plan.tasks.length > 0`: persist those via `insertProposedBetTasks` (skip the LLM turn). Else: scratch sandbox + `assembleContext` + PM turn (the AK3 fallback path, unchanged) → `taskList`.
9. `taskList` empty → `blocked/empty`. Else `insertProposedBetTasks` → `task_state_changed(accepted)` → existing dispatcher (unchanged).
10. `markTerminal('done')`. `finally` rm scratch sandbox.

The `bet_decomposer` `selectOwner` call (AK7) is **replaced** by the `decomposeBet` plan's `decomposerAgentId` — decomposer choice now comes from the Strategy's decomposition decision, not a separate selection call. The per-task `bet_task` `selectOwner` calls inside `insertProposedBetTasks` stay (AK7 owns task-owner assignment). This avoids two competing seams for "who decomposes."

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

**T1 — Shared contracts (red-safe scaffolding).**
Files: `packages/shared/src/events.ts` (+`WorkDecomposeRequestedEvent`, add to `KernelEvent`), `packages/shared/src/strategy-port.ts` (+`DecomposeBetRequest`, `DecompositionPlan`, `decomposeBet` on `Strategy`).
Proves: AC1/AC4 contract surface. `npm run check` compiles; the `switch(event.type)` exhaustiveness over `KernelEvent` still compiles with no default.

**T2 — Strategy implementations.**
Files: `packages/strategy-minimal/src/minimal-strategy.ts` (`decomposeBet` → role-match PM, `tasks:[]`), `packages/fabric/src/fabric-strategy.ts` + `packages/fabric/src/services/agent-selection.ts` (or new `bet-decomposition-fabric.ts`) (`decomposeBet` → role-match decomposer, `tasks:[]`).
TDD: unit tests — Minimal returns the single eligible agent as decomposer; Fabric role-matches PM over a builder; both `tasks:[]`; both return `null` decomposer on empty candidates.

**T3 — Rewire `runBetDecomposition` through the port.**
Files: `packages/server/src/services/bet-decomposition.ts`.
- Emit `work_decompose_requested` post-CAS, post-eligible-check.
- Replace the `selectOwner({surface:'bet_decomposer'})` call with `enumerateTeamCandidates` + `getActiveStrategy().decomposeBet(...)`, wrapped in try/catch (throw → `blocked/failed`).
- Validate `decomposerAgentId` (load-and-validate guard); branch on `plan.tasks.length`.
TDD (integration, server pkg):
  - Minimal + committed bet → ≥1 task, owned by eligible agent, accepted (AC2, scenario 1).
  - Fabric + committed bet → tasks created, owned by eligible agents, accepted; assert parity with AK3 oracle (AC2, scenario 2, no regression).
  - No eligible agent → `blocked/no_eligible_agent` (AC3, scenario 3).
  - Strategy `decomposeBet` throws → `blocked/failed`, no throw out of `runBetDecomposition` (AC3 false-promise).
  - Duplicate `bet_state_changed(active)` → exactly one `work_decompose_requested`, one `decomposeBet` call (CAS; AC3 idempotency).

**T4 — Static guard for AC4 (no Kernel decomposition decision).**
File: `eslint.config.ts`.
- Extend/add a `no-restricted-imports` so `bet-decomposition.ts` cannot import a concrete Strategy (already covered by the AK2 server-scope guard — verify it catches `@hyperidle/strategy-minimal` + Fabric decomposition symbols; add the new Fabric decompose export to the ban list if it leaks).
- Confirm the AK7 round-robin guard (`% <expr>.length` ban, allowlisting `select-agent.ts`) still holds — `bet-decomposition.ts` must contain no inline owner/decomposer choice.
Proves: AC4 statically — the Kernel decomposition flow holds no Strategy decision and no concrete-Strategy import.

**T5 — Boot wiring sanity + docs.**
Files: `packages/server/src/server-factory.ts` (no logic change expected — `registerBetDecomposition` deps unchanged; confirm), `docs/architecture/kernel-strategy-split.md` (append **§3c — As-built AK8**: the event, the 5th port method, the Minimal-fallback `tasks:[]` rule, the `bet_decomposer`-surface-now-dead note). Update §2a/§3b "What … does NOT move / deferred to AK8" status lines to "shipped."
Proves: as-built doc parity; `@lore AK8` comments on the rewire + the `tasks:[]` fallback semantics.

**Dependency order:** T1 → T2 → T3 (T2,T3 both need T1; T3 needs T2). T4, T5 after T3.

---

## AC → test/scenario mapping

| AC | Proof |
|---|---|
| **AC1** Kernel emits "work to decompose"; Kernel doesn't decide | T3 integration: assert `work_decompose_requested` emitted on commit (post-CAS); assert the breakdown comes from `decomposeBet` (spy/strategy-swap shows different output) not Kernel constant. T1 `check`: event in union. |
| **AC2** Strategy produces breakdown; Minimal=AK3 trivial, Fabric=knowledge-matched, no regression | T3 scenario 1 (Minimal → ≥1 task, single agent, dispatch) + scenario 2 (Fabric → tasks created, eligible owners, dispatch; parity vs AK3 oracle). T2 unit: decomposer selection per Strategy. |
| **AC3** All AK3 guarantees hold under both Strategies | T3: no-eligible → `blocked/no_eligible_agent` (scenario 3); Strategy-throw → `blocked/failed` (no false promise); duplicate event → one decomposition (CAS); existing AK3 crash-recovery + GET `/bets/:id` 4-state tests stay green (protected). User Sovereignty: fallback turn `tools:[]` test (AK3 AC5) stays green. |
| **AC4** Swap Strategy changes behaviour, no Kernel code change | T3: run identical commit under `setActiveStrategy(minimalStrategy)` vs `fabricStrategy` (test-level swap, no `bet-decomposition.ts` edit) → different decomposer selection observable. T4 ESLint: Kernel flow holds no inline decision + no concrete-Strategy import. |

---

## Protected tests
- `packages/server/src/__tests__/AK3-bet-decomposition.integration.test.ts`
- `packages/server/src/__tests__/AK3-bet-decomposition-subscriber.integration.test.ts`
- `packages/server/src/__tests__/AK3-bet-decomposition.test.ts`
- `packages/server/src/__tests__/AK7-select-owner.integration.test.ts`
- `packages/fabric/src/__tests__/AK7-agent-selection.test.ts`

**Contract: assertions frozen, setup may evolve** (AK7 retro). The AK3 tests that call `runBetDecomposition` directly: their *behavioural assertions* (terminal status, task count, owner eligibility, blocker reasons, idempotency, crash recovery, `tools:[]`) MUST stay byte-identical — they ARE the no-regression proof for AC2/AC3. Setup may add a `setActiveStrategy` call if a test currently relies on the boot default. Do not relax an assertion to make the rewire pass (MEMORY: tests must not drive behavior).

## Shared files
- `packages/shared/src/events.ts` (KernelEvent union)
- `packages/shared/src/strategy-port.ts` (Strategy interface — every Strategy impl must add `decomposeBet`)
- `eslint.config.ts`
- `docs/architecture/kernel-strategy-split.md`

## Security & abuse cases
- **Input-trust (agent-authored task fields):** `tasks` from a Strategy plan flow through the SAME `insertProposedBetTasks` truncation/`betId`-from-bet guards as the AK3 PM turn (cross-bet injection prevention — `betId` never from task input). Applicable + addressed (reuse). N/A for Minimal/Fabric (in-process, trusted code) but the seam is treated as untrusted for a future third-party Strategy.
- **Unattachable session:** `decomposerAgentId` load-and-validated (active AI user) before any session — same guard as `selectOwner`. Applicable + addressed.
- **Cost:** `checkCostCap` pre-flight retained, Kernel-side, on the validated decomposer. Strategy never enforces/bypasses cost. Applicable + addressed.
- Rate-limit / SSRF / path-traversal / secrets: **N/A** — no new POST/PATCH route, no outbound URL, no new path input (scratch sandbox path is Kernel-derived from `betId`, unchanged), no new credential surface.

## Risks / edge cases
- **Strategy switch mid-decomposition:** exactly one active Strategy per process (hard rule); a swap only happens at boot/test setup, never mid-turn. A bet 'running' across a swap is swept by `resolveOrphanedDecompositions` at the next boot. No new risk.
- **Fabric knowledge unavailable / `decomposeBet` throws:** caught → `blocked/failed` (no false promise). The Fabric's `tasks:[]` v1 path means it never *computes* a task list, so there's no "knowledge unavailable" failure surface in v1 beyond `assembleContext` throwing (already → `blocked/failed`, AK3 path).
- **`bet_decomposer` AK7 surface goes dead at production:** documented decision (Plan reconciliation). Flag for reviewer's dead-code lens so it isn't mistaken for an unwired seam (AK7 retro's CRITICAL was the inverse — a seam wired nowhere; here it's a seam *superseded* deliberately).
- **Double seam temptation:** do NOT keep both `selectOwner(bet_decomposer)` and `decomposeBet.decomposerAgentId` choosing the decomposer. T3 removes the former; T4 ESLint guards against re-adding inline choice.
