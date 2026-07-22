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

---

## Stage 2 escape-hatch adjudication — census-correct factory target (supersedes the numeric target above)

### Decision

Keep the Stage 1 factory/object contract. Correct the census target to **1 method / 6 types = 7**.

`surface-census.ts` counts exported implementation declarations. It does **not** count methods
declared inside an exported interface or functions stored on the object returned by a factory.
Therefore the coherent API below has one method declaration (`createCostOps`) — not six. Retaining
five exported implementation wrappers solely to make `targetMethods = 6` would recreate the
method-per-binding surface this rearchitecture is removing and would game the metric rather than
improve the Service.

The committed Stage 1 completeness contract at `2745548a` fixes the required object behavior:
`check`, `record`, `spend`, `reset`, `startSentinel`, and deterministic
`runCostSentinelCheck`. The deterministic tick remains an object member because Stage 1 exercises
it directly; it is not a second exported implementation declaration. `_testHooks` remains an
instance-local test seam required by that contract, but its shape is internal and does not become
a seventh exported product type.

### Exact coherent API

```ts
createCostOps(deps: CostDeps): CostOps & {
  readonly _testHooks: {
    getDedupSize(): number;
    releaseDedup(sessionId: string): void;
    clearDedup(): void;
    resetSentinelState(): void;
    installDedupReleaser(eventBus: EventBus): () => void;
  };
}

interface CostOps {
  check(db, bus, params: CostCheckParams): Promise<CostVerdict>;
  record(db, bus, params: CostRecordParams): Promise<void>;
  spend(db, scope: CostScope): Promise<number>;
  reset(db, scope: CostScope): Promise<void>;
  startSentinel(db, bus): () => void;
  runCostSentinelCheck(db, bus): Promise<{ fired: true; emitted: readonly string[] }>;
}
```

**Exported method declarations (1):** `createCostOps`.

**Exported type declarations (6):** `CostOps`, `CostScope`, `CostVerdict`,
`CostCheckParams`, `CostRecordParams`, `CostDeps`.

The four accessor shapes (`users`, `org`, `work`, `settings`) stay structurally named inside
`CostDeps` only when that improves readability, but are not exported declarations: the composition
root supplies one `CostDeps` object and contextual typing supplies every member signature. The six
row/input mirrors and closure-state/test-hook types are likewise internal. This is a real type
collapse, not barrel hiding: their implementation declarations lose `export`.

### Required behavior and atomicity boundary

This adjudication does **not** add reservation, settlement, durable event-idempotency, or a new
cost table. Neither captured consumer demand nor the Stage 1 contract asks for those capabilities.
`check` remains the existing synchronous read-before-branch snapshot used by `work`; `record`
remains the post-spend per-event delta accumulator. “Atomic accumulation” means each injected
owner accessor performs its own increment atomically (no read-modify-write lost update), as the
current owner contracts specify. It does not newly promise one transaction spanning users, org,
and work. Cross-owner reservation would be a new product capability and requires a separately
refined work package if real demand earns it.

Preserve these existing invariants:

- `check` evaluates the first breach in agent → team → factory order and does not mutate spend.
- `record` accepts per-event deltas and accumulates agent, optional team, and optional bet spend;
  it never receives a running total.
- warning/breach notification dedup is per session; `startSentinel` installs the lifecycle releaser
  and returns one disposer for both subscription and timer.
- sentinel notification is level-transition based; deterministic tick behavior remains available
  through the bound ops object for the Stage 1 contract.
- `spend` and `reset` use one `CostScope`; the deprecated `cost` field and bare-string reset
  shorthand are migrated away rather than retained as aliases.

### Stage 2 deletion and migration obligations

1. Consolidate the implementation behind `createCostOps` in one module so helpers no longer need
   cross-file exports. Delete superseded split modules after moving their still-live private logic.
   Merely removing barrel
   re-exports is insufficient, and merely removing `export` while retaining cross-file imports is
   impossible. The 13 counted helper declarations (dedup/state constructors, legacy cost-cap
   functions, factory-only read, sentinel tick/start helpers) become unexported closure/file-local
   declarations or are deleted. Delete obsolete factory-only aliases; the bound object calls the
   unified scope implementation directly.
2. Remove exported declarations for `CostTestHooks`, `CostDedupState`, `CostSentinelState`, the four
   accessor interfaces, and the six row/input mirror types. Keep only the six exported types named
   above. This must be an implementation-site reduction, not merely removal from `index.ts`.
3. Migrate the composition binding and production consumers to one bound `CostOps` instance:
   work/session admission → `check`; session/artifact cost events → `record`; dispatch/eval factory
   read → `spend({ level: "factory" })`; team billing reset → `reset(scope)`; boot →
   `startSentinel`. Do not preserve production wrappers merely for old names.
4. Migrate integration tests that need isolated dedup/sentinel state to a fresh `createCostOps`
   instance and its `_testHooks`. Remove the five exported compatibility test helpers from the
   composition binding once their callers move.
5. Delete `CostRecordParams.cost`; require callers to use `costMinor` plus currency. Delete the
   `reset(CostScope | string)` compatibility form; all callers construct `CostScope`.
6. Acceptance is exact `surface-census.ts` output **cost = 1 method / 6 types**, the committed
   Stage 1 completeness contract green, all migrated consumers green, and no new wrapper,
   reservation, table, guard, or census-script change.
