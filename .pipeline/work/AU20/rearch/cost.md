# `cost` — Service-as-Product Re-Architecture (AU20, BOTH lenses)

**Layer:** agent-orchestration · **Owned tables:** 0 · **Substrate:** internal-logic · **Merge anchor:** no (standalone)

---

## 0. Substrate identification — INTERNAL-LOGIC (not tables, not adapter)

`cost` owns **zero** DB tables. It is **not** an adapter over an external system either — there is no CLI/LLM/git/ws/fs/auth on the other side. It is a **pure owned-policy engine**: the one place the multi-scope budget rule lives. Spend physically lives on other services' tables (`users.costActual`, `teamMembers.costActual`, `bets.costActualMinor`) and its config on `server_config`; `cost` reaches them only through four injected DI accessors (Mechanism C). So the substrate is **internal-logic**, and its floor is the *coherent operation set of the owned algorithm*, not CRUD-per-table and not a unified-adapter surface.

**The owned algorithm:** a multi-scope (agent → team → factory) budget-cap policy = a synchronous pre-flight **gate**, a cross-scope accumulating **ledger** with 80%-warning / 100%-breach threshold emission (per-session deduped, breach → review item), and a self-scheduling factory **sentinel** that emits only on level transitions (ok/warning/breach). That is the product.

---

## 1. INSIDE-OUT — the floor + genuine capabilities

The coherent op set of the budget-cap policy is **5 operations**. Each is irreducible; none is a per-scope or per-caller carve:

| # | Op | Why it is in the floor (and cannot fold into a sibling) |
|---|----|--------------------------------------------------------|
| 1 | `check(params) → verdict` | The **synchronous** pre-flight gate. Read-only; returns first breach in the agent→team→factory hierarchy. Cannot fold into `record` — `check` runs *before* a spend and its return **branches caller control flow** (work's `bet-decomposition.ts`); an event/`record` cannot serve a read-then-branch. |
| 2 | `record(params) → void` | Post-spend **ledger mutation**: accumulate the delta on agent + (team) + (bet-via-task), then evaluate thresholds and emit `cost_cap_warning`/`cost_cap_breached` (deduped per session) + create a review item on breach. Distinct from `check` (mutating vs read-only, after vs before). |
| 3 | `spend(scope) → number` | **Read** current spend at any scope. One discriminated `CostScope` collapses what was `getAgentSpend`/`getTeamSpend`/`getFactoryCostActual` into one parameterized read. |
| 4 | `reset(scope) → void` | **Zero** counters at any scope (billing cycle). Same `CostScope` discriminator as `spend`; also clears the matching dedup entries. |
| 5 | `startSentinel(db,bus) → stop()` | Background **monitor lifecycle**: self-scheduling 15-min factory-ratio check emitting on level transitions, AND (folded) the session-end dedup-releaser EventBus subscription. One disposer, one cadence owner. |

**Floor = 5.** Genuine capability beyond the floor: **none** — this is a tight logic service; the 5 ops *are* the whole product. The only non-floor public export is the composition-root binding `createCostOps(deps)` (a 0-table logic service has no DB of its own, so it MUST declare + receive its outbound edges — same idiom as `agent-selection`). Everything else is internal state or test scaffolding.

---

## 2. OUTSIDE-IN — the real consumer demand (from data + call sites)

| Consumer | Real request | Collapses to |
|---|---|---|
| **work** (`bet-decomposition.ts`) | `checkCostCap` — synchronous pre-flight gate that branches control flow | `check(params)` |
| **dispatch** (`routine-scheduler.ts`) + **eval** (seeding/scenarios) | `getFactoryCostActual` — factory total for scheduling | `spend({level:"factory"})` |
| **run-orchestration** (session-lifecycle / session-provisioning) + **routes/artifacts** | `recordCostAndCheck` on every cost event; `check` at admit | `record(params)`, `check(params)` |
| **teams-routes** | team/billing-cycle reset | `reset(scope)` |
| **server-factory** (boot) | start sentinel + install dedup releaser | `startSentinel(db,bus)` |

Every request composes from the 5 ops, parameterized by `CostScope` / params — **no method-per-caller, no method-per-scope**. New "is X within budget?" → `check`; new "read spend at level Y" → `spend(scope)`; new cap dimension → one arm of `CostScope` + one branch, **zero new methods** (sub-linear).

---

## 3. THE COHERENT PRODUCT API (fused)

```ts
// Composition root (inside-out: 0-table logic service must be DI-bound)
createCostOps(deps: CostDeps): CostOps

interface CostOps {
  // Gate — synchronous, read-only, first-breach in agent→team→factory
  check(db, bus, params: CostCheckParams): Promise<CostVerdict>;
  // Ledger — accumulate across scopes + threshold-emit + breach review item
  record(db, bus, params: CostRecordParams): Promise<void>;
  // Read current spend at any scope
  spend(db, scope: CostScope): Promise<number>;
  // Zero counters at any scope (billing cycle)
  reset(db, scope: CostScope): Promise<void>;
  // Background factory monitor + folded session-end dedup releaser; returns disposer
  startSentinel(db, bus): () => void;
}
```

| Interface | Shape | Lens | Source |
|---|---|---|---|
| `createCostOps` | `(deps) → CostOps` | both | inside: 0-table logic service DI binding; outside: every consumer imports the bound instance |
| `check` | `(db,bus,CostCheckParams) → CostVerdict` | both | inside: gate op; outside: work's synchronous branch |
| `record` | `(db,bus,CostRecordParams) → void` | both | inside: ledger-mutate op; outside: session-lifecycle + artifacts spend events |
| `spend` | `(db,CostScope) → number` | both | inside: read op; outside: dispatch + eval factory read |
| `reset` | `(db,CostScope) → void` | both | inside: reset op; outside: teams-routes billing reset |
| `startSentinel` | `(db,bus) → ()=>void` | both | inside: monitor lifecycle; outside: server-factory boot |

**Types (10):** `CostOps`, `CostScope` (spec/discriminator), `CostVerdict` (discriminated return), `CostCheckParams`, `CostRecordParams`, `CostDeps` (DI bundle) + 4 outbound accessor ports (`CostUserAccessor`, `CostTeamAccessor`, `CostWorkAccessor`, `CostSettingsAccessor`). The 4 accessors are the genuinely-needed outbound edge contract of a table-less logic service; their 6 row/input mirror types (`CostUserRow`, `CostTeamRow`, `CostTaskRef`, `CostReviewItemInput`, `CostSettingsSnapshot`, `CostSettingsPatch`) are inlined into the accessor signatures, not product nouns.

---

## 4. TARGET NUMBERS

- **Substrate floor:** 5 (coherent op set of the owned budget-cap algorithm)
- **targetMethods = 6** = floor 5 + `createCostOps` (justified: composition-root DI binding for a 0-table service)
- **targetTypes = 10** = `CostOps` + 4 param/result types (`CostScope`, `CostVerdict`, `CostCheckParams`, `CostRecordParams`) + `CostDeps` + 4 accessor ports
- **From:** currentMethods 14 → **6**; currentTypes 19 → **10**

### DELETED from the product (not merely internalized)

1. **`runCostSentinelCheck` as a public method → demoted to `_testHooks`.** `startSentinel` owns the cadence and calls the tick internally; the only non-test caller (dispatch scheduling the sentinel off a leaked interval constant) is removed — one scheduling owner. Deterministic single-tick is a test concern, not product surface. (6→5 public CostOps methods; the analysis's 6th method drops.)
2. **`CostRecordParams.cost` (deprecated) — DELETE.** Superseded by `costMinor` + `currency`; migrate the two lingering callers, drop the field.
3. **`reset(CostScope | string)` string-shorthand overload — DELETE.** All callers pass `CostScope`; the bare-teamId string form in `cost-bindings.ts` goes.

### INTERNALIZED (leaves product surface, stays in code)

- 6 row/input mirror types → inlined into the 4 accessor signatures.
- `CostTestHooks` (5 hooks: `getDedupSize`/`releaseDedup`/`clearDedup`/`resetSentinelState`/`installDedupReleaser`) + `CostDedupState` + `CostSentinelState` + `SessionDedupEntry` → closure-local instance state, off-barrel already; test isolation = a fresh `createCostOps`.
- `COST_SENTINEL_INTERVAL_MS`, `COST_WARNING_RATIO`, `CostSentinelLevel` → package-internal constants; no cross-service leak.

---

## 5. LEAN *AND* COMPLETE — every current feature still deliverable

| Real user feature | Delivered via |
|---|---|
| Block over-budget bet decomposition (pre-flight) | `check` (synchronous, first-breach) |
| Accumulate spend on agent + team + bet per event | `record` (all scopes param-driven) |
| 80% warning / 100% breach events, deduped per session | `record` threshold emit + closure dedup |
| Review item + blocking on hard breach | `record` → work `createItem` |
| Factory dashboard / routine-scheduler total spend | `spend({level:"factory"})` |
| Per-agent / per-team spend read | `spend({level,id})` |
| Billing-cycle reset (team, factory) | `reset(scope)` |
| Background factory sentinel on ratio transitions | `startSentinel` |
| Session-end dedup reclamation (all end paths) | `startSentinel`'s folded EventBus releaser |
| New cap dimension (future) | one `CostScope` arm + one branch — **0 new methods** |

Nothing lost; fragmentation removed. Standalone confirmed — no merge anchor.
