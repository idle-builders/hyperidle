# `cost` — Service-as-Product Audit (AU20)

**Layer:** agent-orchestration · **Owned tables:** none · **Current public exports:** 25 · **Target:** ~11

---

## 1. Existence / Consolidation Verdict — **STANDALONE**

`cost` is a genuine platform product: a **synchronous budget gate + accumulating spend ledger + background sentinel** that every agent-session-spending path consults. Its customers are other services, so it is an infra/platform product — held to the platform bar, and it clears it.

**Platform value + consumers (from the data):**
- **work** (`checkCostCap` via `CostCapChecker`) — pre-flight gate; the return value branches `bet-decomposition.ts` control flow *synchronously* in the same code path (an event cannot serve a read-then-branch). This is an against-grain up-edge ruled permanent — and its existence is precisely what justifies cost as a shared synchronous capability rather than domain-local logic.
- **session-lifecycle** (`checkCostCap`, `recordCostAndCheck`, `releaseSessionDedup`) — gate at admit, accumulate on every cost event, release dedup at session-end.
- **dispatch** (`getFactoryCostActual` via `DispatchCostAccessor`, `COST_SENTINEL_INTERVAL_MS`) — factory-spend read for routine scheduling.

**Why not consolidate/dissolve.** Cost owns zero tables; spend lives on `users.costActual`, `teamMembers.costActual`, `bets.costActualMinor`, and cost settings on `server_config`. It is *pure cross-domain policy over three domain services + settings*. That is the reason it must stand alone, not a reason to dissolve it: it is the single place the multi-scope budget rule lives. Folding it into any one of users/org/work would force that domain to reach into the other two's tables (worse coupling) and smear the budget rule across three owners. The candidate-cluster pass proposed **no neighbors** for cost, and I agree — it shares no lifecycle with the `durable-agent-queue` or `session-runtime` clusters; it is a policy leaf they all call. **Standalone confirmed.**

The AU19 catalog claim ("cross-cutting budget-gating every session-start path needs synchronously, orthogonal to work/users/org even though it reads all three") holds. What AU19 got wrong is the **shape** of the exposed surface — see §2.

---

## 2. The Deliberate Target Public API (25 → ~11)

The real runtime demand is tiny: gate a spend, record a spend, read a spend, reset a scope, run the sentinel, reclaim dedup at session-end. The current 25 exports inflate that with (a) a method-per-scope spend surface, (b) three module-level cache-clearing test hooks, (c) dual dedup-release paths, and (d) six DI row/input types split out from four accessors.

**Target surface:**

| # | Export | Shape | Subsumes | Why it's a shared capability |
|---|--------|-------|----------|------------------------------|
| 1 | `createCostOps(deps)` | factory → `CostOps` | `createCostOps` | Composition-root binding (same idiom as `agent-selection`). |
| 2 | `CostOps` | `{ check, record, spend, reset, startSentinel }` | `checkCostCap`, `recordCostAndCheck`, `getFactoryCostActual`, `resetCosts`, `runCostSentinelCheck`, `startCostSentinel` | The whole gate+ledger+sentinel product behind one bound instance, every method parameterized by scope, not carved per scope. |
| 3 | `CostScope` | `{ level: "agent"\|"team"\|"factory"; id?: string }` | `ResetCostsParams` + the implicit scope args of `getAgentSpend`/`getTeamSpend`/`getFactoryCostActual` | One discriminator drives `spend(scope)` + `reset(scope)` (and internally `check`); a new cap dimension adds a branch, not a method. |
| 4 | `CostVerdict` | `{ allowed; level?; currentSpend?; cap? }` | `CostCapResult` | The gate's single result type. |
| 5 | `CostCheckParams` | `{ agentId; teamId?; factory? }` | `CheckCostCapParams` | Gate request. |
| 6 | `CostRecordParams` | `{ sessionId; agentId; teamId?; taskId?; costMinor; currency; … }` | `RecordCostAndCheckParams` | Ledger-write request. |
| 7 | `CostDeps` | `{ users; org; work; settings }` | `CostDeps` | The one port bundle the root supplies. |
| 8–11 | `CostUserAccessor`, `CostTeamAccessor`, `CostWorkAccessor`, `CostSettingsAccessor` | port interfaces | the 4 accessors **+** `CostUserRow`, `CostTeamRow`, `CostTaskRef`, `CostReviewItemInput`, `CostSettingsSnapshot`, `CostSettingsPatch` (inlined) | The outbound-edge contract the root implements. The 6 row/input types are inlined (`Pick<>`) into the accessor methods — DI plumbing, not product nouns. |

**Deleted from the public surface entirely:**
- `clearDeduplicationCache`, `getDedupCacheSize`, `clearCostSentinelCache` — module-level cache-clearing hooks used *only* by tests + the boot wiring (confirmed: no non-test consumer). Move dedup + sentinel state onto the `createCostOps` closure and test isolation becomes "construct a fresh ops instance." All three vanish. (The code's own `@lore I3 review C2 / arch H-2` already flags this as the intended end-state.)
- `releaseSessionDedup` — the direct session-end cleanup path. The EventBus releaser already subscribes to every session-end event; the direct calls (session-lifecycle, policy handoff, artifacts route) are belt-and-suspenders. MVP keeps one path (the EventBus subscription), folded onto `CostOps` / installed by the factory. Drops session-lifecycle's third request.
- `registerCostCapDedupReleaser` — folded: the ops factory installs the EventBus releaser at construction. One fewer boot-wiring export.
- `COST_SENTINEL_INTERVAL_MS`, `COST_WARNING_RATIO`, `CostSentinelLevel` — internal config/impl detail. `startSentinel` owns its own cadence (it already sets the interval internally); dispatch should not *also* schedule the sentinel as a builtin routine off a leaked constant — that is a duplicate-cadence smell. One scheduling owner (cost), constant goes internal.

---

## 3. Inside Lens — staying clean/evolvable

- **Kill module-level mutable state.** Today `dedupBySession` (a `Map`) and the sentinel dedup cache are module globals — the sole reason 3 test-only clear-hooks are public and why tests must `clearDeduplicationCache()` in `beforeEach`. Hanging both on the `createCostOps` closure makes each ops instance self-contained: test isolation is a fresh instance, no reset ritual, no leaked API.
- **One scope discriminator (`CostScope`)** threads through `check`/`record`/`spend`/`reset`. Adding a cap dimension touches the discriminated union + one branch in each method — not a new export.
- **Four DI accessors, row types inlined.** The port surface is the four accessor interfaces + `CostDeps`; the six structural row/input mirrors collapse into the method signatures they serve, so "what does cost depend on" reads as four contracts, not eleven types.
- **Sentinel is self-scheduling.** `startSentinel(db, bus) → stop()` owns its cadence internally; no cross-service interval constant, no second scheduler.

---

## 4. Scaling Argument (sub-linear)

Imagine dozens more services and hundreds more calls:

- New consumer asking "is X within budget?" → `check(params)`. **No new method.**
- New consumer reading current spend at any level → `spend(scope)`. **No new method.** (Already the case: `getFactoryCostActual`'s real consumers are dispatch + eval; both become `spend({level:"factory"})`.)
- New place recording cost → `record(params)`. **No new method.**
- **New cap dimension** (e.g. per-project or per-bet cap) → add one arm to `CostScope` + one branch inside the four methods. **No new method.**

Contrast the failing shape this replaces: a method per (scope × operation) cell — `getAgentSpend`, `getTeamSpend`, `getFactoryCostActual`, then inevitably `resetAgentCost`, `resetTeamCost`… = 3×N growth. The parameterized `spend(scope)` / `reset(scope)` collapse each operation-column to **one** method that absorbs new scopes for free. Sub-linear: use-cases compose from `{scope, params}`; the export count is flat.

---

## 5. Key Collapses

1. **Method-per-scope spend read → `spend(scope)`.** `getFactoryCostActual` (public) + `getAgentSpend`/`getTeamSpend` (internal) unify into one parameterized read on the ledger. Real consumers (dispatch routine-scheduler, eval seeding/scenarios) call `spend({level:"factory"})`.
2. **`ResetCostsParams` → `CostScope`, reused by spend + reset.** One discriminator instead of a per-operation param noun.
3. **Three module-level test hooks deleted** (`clearDeduplicationCache`, `getDedupCacheSize`, `clearCostSentinelCache`) by moving dedup/sentinel state onto the ops instance — the biggest INSIDE win, removes public API that exists only because state is global.
4. **Dual dedup-release paths → one EventBus releaser.** Drops `releaseSessionDedup` + `registerCostCapDedupReleaser` as separate exports (factory installs the subscription); removes session-lifecycle's third request.
5. **Six DI row/input types inlined into four accessors.** Public port surface = `CostDeps` + 4 accessors, not 11 types.
6. **Sentinel config internalized** (`COST_SENTINEL_INTERVAL_MS`, `COST_WARNING_RATIO`, `CostSentinelLevel`); cost owns one cadence, no constant leak to dispatch.

**Net: 25 → ~11 exports**, with the 6-method `CostOps` re-shaped to 5 general methods and all state instance-local.
