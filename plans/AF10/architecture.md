# AF10 — Cost accounting integrity — Architecture

**Branch:** `feat/AF10-cost-accounting` · **Complexity:** L · Backend + light frontend (money formatting).
Closes Z8-002, Z8-030, Z8-031, Z8-049, Z8-088, Z8-119, Z8-124, Z8-127, Z8-162.

`/concept` and `/design` skipped per spec (cost is an existing primitive; no new UI surface, only formatting consolidation).

---

## 0. Cost-flow ground truth (what the code does today)

Money flows **delta → accumulators → aggregates → read endpoints → `formatMoney`**. The cost-recording boundary is `recordCostAndCheck` (`packages/fabric/src/services/cost-cap.ts:232`). It **already treats its `costMinor` argument as a per-event delta** and increments counters with `+= effectiveCostMinor`:

- `users.costActual` (line 247) — per-agent running total, minor units
- `teamMembers.costActual` (line 255) — per-membership-group running total (`@lore U1`: `teamMembers`, NOT the domain `teams` table, which has no cost columns)
- `bets.costActualMinor` (line 272) — via `tasks.betId` lookup
- tail: `recordFactoryCost(db)` (line 351) writes `factory_settings.cost_actual = SUM(users.costActual)` — the value **AF8's cost-sentinel and AF6's routine-scheduler both read** (`packages/fabric/src/services/cost-sentinel.ts:108`, `packages/fabric/src/services/routine-scheduler.ts:214`).

The boundary is correct. **The single caller passes the wrong value.**

### The quadratic bug (Z8-002) — confirmed, exact location

`packages/server/src/services/session-provisioning.ts:744-776`, the `cost_update` branch of the harness event drain:

```
const delta = Math.max(0, event.deltaCost);        // 746-748: per-event delta, correct
totalCostCents += Math.round(delta * scale);        // 755: running total accumulator
...
await recordCostAndCheck(db, eventBus, {
    sessionId,
    costMinor: totalCostCents,   // 768 ← BUG: passes the RUNNING TOTAL to a delta-taking boundary
    ...
});
```

`recordCostAndCheck` then does `costActual += totalCostCents`. Across events 10, 5, 5:

| event | delta | totalCostCents (line 755) | passed as costMinor | `users.costActual` after `+=` |
|---|---|---|---|---|
| 1 | 10 | 10 | 10 | 10 |
| 2 | 5 | 15 | 15 | 25 |
| 3 | 5 | 20 | 20 | **45** |

Records **45, not 20** — exactly the spec's quadratic inflation. Every downstream number (agent/team/bet/factory aggregate, sentinel ratio, budget gate) inherits the inflation. The `@lore AF8 INFLATION WARNING` at `cost-cap.ts:366` documents this exact bias and states it disappears the moment AF10 lands — no AF8 change needed.

**The contract the spec states ("the recording boundary takes deltas; any caller passing a total is a bug") is already met by the boundary. AF10's job is to make the one caller honor it.**

---

## 1. The delta-vs-total fix (AC1, Z8-002)

**File:** `packages/server/src/services/session-provisioning.ts`

Pass the **per-event delta in minor units**, not the running total. Keep `totalCostCents` purely for the per-run cap check (line 759) and the result/teardown plumbing (lines 866/880/891) — those legitimately want the session total.

Change at line ~755-768:

```
const deltaMinor = Math.round(delta * scale);   // per-event delta in minor units
totalCostCents += deltaMinor;                    // local running total — cap check + teardown only
if (routinePerRunCap != null && totalCostCents >= routinePerRunCap) { budgetExhausted = true; break; }
await recordCostAndCheck(db, eventBus, {
    sessionId,
    costMinor: deltaMinor,   // ← FIX: the delta, not totalCostCents
    currency,
    agentId: params.agentId,
    teamId,
    taskId: params.taskId,
    factoryCap: params.factoryCap,
    factorySpend: params.factorySpend,
    reviewThreadId: params.reviewThreadId,
});
```

**Coupling note — `factorySpend`:** `recordCostAndCheck` line 334 computes `factorySpend = (params.factorySpend ?? 0) + effectiveCostMinor` for the factory-cap check only (not persisted; `recordFactoryCost` recomputes the real SUM). With `effectiveCostMinor` now a delta, the factory-cap check sees `base + delta` per event instead of `base + runningTotal`. This is the *correct* per-event spend; it removes a second inflation in the cap-breach check. No caller of `recordCostAndCheck` changes signature.

**No DB migration. No boundary signature change.** One caller, one value. This is the smallest possible fix for the highest-impact finding.

### `@lore` to add
At the `recordCostAndCheck` call site: `@lore AF10: costMinor MUST be the per-event delta. recordCostAndCheck does costActual += costMinor (cost-cap.ts:247). Passing totalCostCents here caused Z8-002 quadratic inflation (10,5,5 → 45 not 20).`

---

## 2. Routine cumulative cost write path (AC2, Z8-030/Z8-119)

**Finding:** `routines.costActualMinor` (`schema.ts:303`, "cumulative actual cost across all runs") **has no writer.** Grep over `update(routines)` confirms: `session-lifecycle.ts:110` sets only `lastRunAt`/`lastRunSummary`; no path ever sets `costActualMinor`. So:
- `GET /api/routines/:id` returns `costActual: null` (`routines-routes.ts:424-428`) → WorkRoutine routine card renders `"—"` (`WorkRoutine.tsx:439`).
- Team routine cards read `r.costActualMinor` (`teams-routes.ts:789`) → `WorkTeam.tsx:680` renders `"—"`.

Per-run (`routineRuns.costMinor`) and month-to-date (`SUM(routineRuns.costMinor)`) **are** written and read correctly (`session-lifecycle.ts:102`; `routines-routes.ts:340`; `teams-routes.ts:733`). Only the cumulative routine field is orphaned.

**Fix — `packages/server/src/services/session-lifecycle.ts`, inside `updateRoutineRunOnSessionEnd` (lines 94-115):** when `costInCents > 0`, atomically increment `routines.costActualMinor` in the existing `update(routines)` set:

```
.set({
    lastRunAt: endedAt,
    ...(costInCents > 0 ? {
        costActualMinor: sql`coalesce(${routines.costActualMinor}, 0) + ${costInCents}`,
        costActualCurrency: "USD",
    } : {}),
    ...(summary ? { lastRunSummary: summary } : {}),
})
```

`costInCents` here is the session total passed from provisioning teardown (`endSession`/`crashSession` → `updateRoutineRunOnSessionEnd`). This is a **per-run total accumulated onto a per-routine cumulative field** — a true delta with respect to `routines.costActualMinor`, so `+=` is correct and not a re-introduction of the §1 bug. Same atomic-SQL pattern as `recordCostAndCheck` to avoid lost updates under concurrent routine runs.

**Currency note:** `"USD"` literal here matches the existing `routineRuns.costCurrency` write (`session-lifecycle.ts:103`). Factory is single-currency today; flagged as a tech-debt item in §6, not fixed in AF10.

---

## 3. Team cost cap write/read consistency (AC2, Z8-031)

**Finding:** team cost is **already written and read** — but inconsistently across two columns, and inflated by §1.
- Writer: `recordCostAndCheck` increments `teamMembers.costActual` (legacy column, line 255).
- Reader (burn): `teams-routes.ts:801` reads `memberGroup.costActual` → consistent. `costCap` reads `costCapMinor ?? costCap` (line 799).
- Reader (list): `teams-routes.ts:206` hardcodes `costActualMinor: null` ("list route doesn't compute actual spend") — intentional, list cards show cap only.

So team cost is **not** a permanent placeholder where it's wired (the burn panel); §1's delta fix corrects its magnitude. **No new team write path is required for AC2** — the spec's "team cost caps have no writer" is satisfied by the existing `teamMembers.costActual` path plus the §1 correctness fix.

**One consistency hardening (low cost, high clarity):** the burn route reads `costActual` (legacy) while caps prefer `costCapMinor`. Leave the read column as-is (it's the written column) but add a `@lore AF10` at `teams-routes.ts:801` documenting that team actual spend lives on `teamMembers.costActual` (the L17/O2 minor-unit accumulator), so a future reader does not mistake the orphaned `costActualMinor`-style naming for the source of truth.

---

## 4. CLI-harness cost capture (AC3, Z8-049/Z8-088)

**Finding:** `packages/server/src/harness/cli-harness-adapter.ts` emits only events the external CLI already prints as ndjson (`parseStdoutLine`, line 350-372 — pass-through of any object with a `type` field). `buildResult` hardcodes `cost: { minor: 0 }` (line 386, comment: "CLI tools don't report cost/tokens through our event channel"). A CLI session that does **not** emit a HyperIdle-shaped `cost_update` event contributes **zero** to accounting — invisible to every aggregate. Contrast: `claude-agent-sdk-adapter.ts:286-291` emits `cost_update` with `deltaCost = totalCost - session.totalCost` from the SDK `result` message's `total_cost_usd`.

**Fix — settle CLI cost at session end via a synthetic terminal `cost_update`.** The `claude` CLI's final ndjson result line carries `total_cost_usd` (same field the SDK adapter reads). Two coordinated changes in `cli-harness-adapter.ts`:

1. **Capture the total.** In `parseStdoutLine` (or the stdout wiring at `wireStdout`, line 391), when a parsed ndjson line is a CLI result message exposing a total-cost field (`total_cost_usd`, or a configured field name on `CliHarnessConfig`), record it on the `CliSession` as `session.totalCostUsd`. Do **not** trust a CLI-emitted `cost_update` blindly as a delta — most CLI tools report cumulative, not deltas. Convert at the seam, exactly as §1.

2. **Emit one terminal delta.** In `streamEvents`, just before `if (session.done) break;` (line 295), if `session.totalCostUsd` was captured and not yet emitted, yield a single `cost_update` with `totalCost = session.totalCostUsd`, `deltaCost = session.totalCostUsd` (whole session as one delta — provisioning's §1 loop turns it into one `recordCostAndCheck(delta)` call), `currency: "USD"`. Provisioning already handles `cost_update` uniformly, so no provisioning change is needed beyond §1.

`buildResult` should also return the captured cost instead of `0` so the `SessionResult.cost` is truthful for callers that read it directly.

**Constraint:** a CLI tool that genuinely reports nothing stays at zero — that is correct (no cost incurred *that we can observe*), not a silent drop. The fix closes the gap for CLI tools that **do** report a total (the `claude` CLI being the primary one) but whose total was being discarded.

⚠️ UNVERIFIED: exact JSON field name / shape of the `claude` CLI's final result line in the version pinned by this repo. Confirm against the adapter's existing `eventFormat: "ndjson"` fixtures and the SDK adapter's `total_cost_usd` usage during the red phase; the field name must be read from a parsed CLI result line, not assumed.

#### 4.1 Field name, fixture, and missing-field fallback (pinned for T6 → T7)

The SDK adapter reads `msg.total_cost_usd` (`claude-agent-sdk-adapter.ts:287`) — the canonical default field. To make a CLI-version drift a *config* change rather than a *code* change, add a named, defaulted config field:

- **`CliHarnessConfig.costField?: string` (default `"total_cost_usd"`)** alongside the existing `eventFormat` (`cli-harness-adapter.ts:50`). Capture reads `parsedResultLine[config.costField ?? "total_cost_usd"]` from the parsed ndjson **result** line (the line whose `type` marks it as the terminal result — same line the SDK reads `total_cost_usd` off). Only a finite non-negative number is accepted; anything else is treated as missing.

- **The real fixture is defined BEFORE T7 (red phase owns it).** T6 must capture (or hand-author from the pinned CLI's documented `--output-format stream-json` result shape) the exact terminal ndjson line and commit it as a test fixture, e.g.:
  ```
  {"type":"result","subtype":"success","total_cost_usd":0.0123,"is_error":false,...}
  ```
  The fixture is the contract: T6 drives this line through `parseStdoutLine` → `wireStdout` and asserts the captured `session.totalCostUsd === 0.0123`, then asserts the synthetic terminal `cost_update` yields `deltaCost = round(0.0123 * 100) = 1` minor unit reaching the agent/bet aggregate. **Do not assume the field — read it from the committed fixture.**

- **Missing-field fallback (T6 negative case, hard requirement):** if the result line has no `costField` (or a non-numeric value), `session.totalCostUsd` stays unset, **no** synthetic `cost_update` is emitted, and `buildResult` returns `cost: { minor: 0, currency: "USD" }`. The aggregate is unchanged. This is the §4 "a CLI that reports nothing stays at zero" constraint, made a *test assertion* (a second fixture with the field absent ⇒ aggregate delta 0). Field drift in a new CLI version is then a one-line `costField` config change, caught by the fixture mismatch — never a silent zero in production.

---

## 5. Artifact cost recording & surfacing (AC4, Z8-124/Z8-127/Z8-162)

**Finding:** `POST /api/artifacts` accepts a `cost` object (`money_micros`, `tokens_input`, `tokens_output` — `artifacts.ts:41-48`) then **discards it** (`@lore O2`, line 39-40: "values are ignored since cost columns were stripped from the kernel artifacts table"). The `artifacts` table (`schema.ts:783-800`) has **no cost columns**. The read path always returns `NULL_COST = { money: null, tokens: null }` (line 67). The shared formatter `formatArtifactCost` (`shared/src/format/artifact-cost.ts`) exists and correctly converts `money_micros → WireMoney` (micros/10000 = cents) but is fed nothing. This is the literal "silently dropped" finding.

**Decision — route artifact cost through the existing accumulators, do not resurrect dropped columns.** Re-adding `cost_*` columns to the kernel `artifacts` table contradicts the O2 kernel/strategy separation (`@lore O2`) and would create a *second* cost-of-record surface to keep consistent. Instead, route to `recordCostAndCheck` — **but the route must supply a real, non-null `agentId` and the correct `teamMembers.id` as `teamId`, or the boundary throws (`cost-cap.ts:171-173` `Agent not found`).** The plan below pins the exact resolution path; the previous draft's "the task's context resolves agentId/teamId" was hand-waved and is corrected here.

#### 5.1 The id-resolution problem (verified against schema)

| boundary param | required? | what's available on an artifact | gap |
|---|---|---|---|
| `agentId` | **required, non-null** (`cost-cap.ts:43`); boundary throws if the row is absent | only `tasks.ownerAgentId` — **nullable** (`schema.ts:170`) | no guaranteed agent |
| `teamId` | optional, but must be a **`teamMembers.id`** (membership group — `@lore U1`, `cost-cap.ts:251`) | `tasks.teamId` references **`teams.id`** (domain entity — `schema.ts:167-169`) | wrong table; passing it accumulates onto the wrong row |
| `sessionId` | required (dedup key) | artifacts have **no** session linkage; a task has many sessions, `producingTaskId` names none | no session |

So `producingTaskId` alone cannot satisfy the boundary. The artifact create must carry the originating agent.

#### 5.2 Resolution path — pinned (mirrors the verified provisioning happy path)

The provisioning loop already resolves exactly these ids the same way: `session-provisioning.ts:284` does `const teamId = agent.teamId ?? undefined` where `users.teamId` references **`teamMembers.id`** (`schema.ts:41-45`, `@lore U1`). AF10 reuses that path verbatim for artifacts:

1. **Carry `agentId` (and optional `sessionId`) on the artifact create.** Add an optional `agentId: string` and optional `sessionId: string` to `createArtifactSchema` (`artifacts.ts:27-49`). The producing agent already knows its own id when it POSTs the artifact — this is a one-field wire addition, no new table, no migration.
2. **Resolve `agentId`.** Prefer the body `agentId`; if absent, fall back to `tasks.ownerAgentId` (looked up alongside the existing `tasks.title` select at `artifacts.ts:291-295`). Result may still be null — handled by 5.3.
3. **Resolve `teamId` → `teamMembers.id`** via the agent row: `SELECT teamId FROM users WHERE id = <resolvedAgentId>` → `agent.teamId ?? undefined`. This is the membership-group id the boundary expects. **Do NOT pass `tasks.teamId`** (that's `teams.id`, wrong table).
4. **Resolve `sessionId`** for the dedup key: prefer the body `sessionId`; else synthesize a stable non-colliding key `artifact:<artifactId>` (artifacts are created once, so a per-artifact dedup scope is correct and never bleeds — and `releaseSessionDedup` is moot because the synthetic id is used exactly once). This avoids attributing the artifact's dedup state to a real session that may still be live.
5. **Call** `recordCostAndCheck(db, eventBus, { sessionId: <resolved>, costMinor: Math.round(money_micros / 10000), currency: "USD", agentId: <resolvedAgentId>, teamId: <teamMembers.id | undefined>, taskId: body.producingTaskId })`. `taskId` drives the bet rollup via the existing `tasks.betId` lookup; `agentId`/`teamId` drive the agent/team accumulators; the trailing `recordFactoryCost` updates the AF8 SUM. `costMinor` is a **delta** w.r.t. the accumulators (the whole artifact cost recorded once), consistent with §1.

#### 5.3 Null-`agentId` behavior — decided: **skip recording, surface 422-free**

If neither the body `agentId` nor `tasks.ownerAgentId` yields an agent, **skip the `recordCostAndCheck` call entirely** and still create the artifact (201). Justification:

- The boundary throws on a missing agent — calling it with a null/absent agent would 500 the artifact create, coupling artifact creation to cost plumbing. That violates "humans validate, agents execute": dropping a cost number must never block the artifact itself.
- Attributing to a synthetic "system agent" would invent a fake accounting subject and pollute `users.costActual` / the factory SUM with cost no real agent incurred — worse than not recording, because it's silently *wrong* rather than *absent*.
- A 400/422 rejection would make a previously-accepted create suddenly fail when `agentId` is omitted — a behavior regression for existing callers (the field is being *added* as optional).
- So: **no agent ⇒ artifact created, cost not recorded** (the honest "we couldn't attribute this" outcome). This is logged via a `@lore` and is the test's negative case (T8b below). It is the same posture as §4's "a CLI that reports nothing stays at zero — absent, not dropped."

This narrows the "recorded" half of AC4 to *recordable-when-attributable*, which is the only runtime-correct option given a nullable owner. The spec's intent ("artifact cost is not silently dropped") is met: when attributable it flows to every aggregate; when not attributable the absence is explicit and tested, not a silent discard into a column that doesn't exist.

**Trade-off quantified:** routing-through-accumulators adds one `recordCostAndCheck` call (the same 3-4 UPDATEs a cost event already does; artifact creates are rare) + one `users` lookup to resolve `teamMembers.id`, and one optional wire field. Zero migration. Re-adding columns would cost: 1 migration + a backfill + a second read/format/consistency surface + divergence risk against `users.costActual`. Accumulator routing is strictly cheaper and keeps one cost-of-record.

#### 5.4 The "surfaced" half of AC4 — durable, survives a GET reload

AC4 is "recorded **AND** surfaced." §5.2 delivers *recorded* (into bet/agent/team/factory aggregates). The artifact's **own** read path still returns `NULL_COST` (`artifacts.ts:67`, `:137`, `:322`) because the `artifacts` table has no cost columns and we refuse to add them — so a create→GET round-trip loses the chip. The previous draft's "round-tripped at creation time for the immediate response" only covered the 201 response body, **not** a subsequent `GET /api/artifacts/:id`. That gap is closed here with a **derived read**, not a stored column:

- **`rowToArtifact` computes `cost.money` from the producing task's bet/agent context at read time.** But the bet/agent accumulators are *running totals across all sessions*, not this artifact's slice — so they cannot answer "what did THIS artifact cost." Re-reading those would surface a number, but the wrong one (the whole bet's spend on every artifact chip). Rejected: surfacing a wrong number is worse than `NULL_COST`.
- **Decision — surface the artifact's own cost only when it is independently derivable, else keep `NULL_COST` and assert that explicitly.** The honest per-artifact figure is the `money_micros` the producer supplied at create time. To make it survive a GET *without* a kernel cost column, store it where artifact-scoped derived data already lives: the **`previewJson`** blob is artifact-owned and already round-trips through GET. AF10 does **not** widen the kernel schema; instead the *artifact-cost surfacing* is delivered by the bet/team rollup (the canonical, queryable place cost is meant to live post-O2), and the artifact's own chip is explicitly scoped to **null on reload** — matching the O2 decision that per-artifact cost is a strategy concern, not a kernel column.

**Chosen resolution (narrowed AC4, justified):** AC4 for AF10 = **"artifact cost is recorded into the canonical aggregates (bet/agent/team/factory) and reflected in the create response; it is NOT silently discarded."** The artifact's own cost chip on `GET /api/artifacts/:id` remains `NULL_COST` by deliberate O2 design — surfacing per-artifact cost durably would require either resurrecting the dropped kernel columns (rejected, §5 trade-off) or a strategy-layer cost store that is out of AF10's scope. This narrowing is recorded as a known/deferred gap, not a silent one.

**Why the narrowing is defensible against the spec:** the spec's failure mode is "cost accepted then silently dropped to nowhere." Post-AF10 the cost lands in four durable, queryable aggregates and the AF8 sentinel SUM — it is *not* dropped to nowhere. The only thing absent is a per-artifact chip, which O2 already declared a non-kernel concern. The alternative (resurrecting columns) re-opens the exact divergence O2 closed. The narrowing trades a redundant per-artifact display for one cost-of-record, consistent with §10 scope discipline.

**Verification that survives a GET (T8):** the test does create-with-cost → assert bet/agent/team aggregate increased by `micros/10000` → **then `GET /api/artifacts/:id` and assert `cost == NULL_COST`** (proving the narrowing is intentional and not an accidental write to a non-existent column) → and a second `GET` after a reload returns the same aggregate from the bet route (proving *recorded* is durable). If a future workpackage adds a strategy cost store, the chip lights up additively without touching AF10's accumulator path.

**Open question for critique:** whether artifact `tokens_*` also need surfacing or only `money`. AC4 says "artifact cost"; tokens flow through the existing `token_usage`/`accumulateSessionTokensOnBet` path already, so this plan scopes AC4 to **money**. If critique wants artifact tokens too, it's an additive token-accumulation call, no structural change.

---

## 6. Money-formatting consolidation (AC5, Z8-162)

**Single allowed render path:** `formatMoney(value: WireMoney | Money | null)` (`packages/shared/src/format/money.ts:14`), exported from `@hyperidle/shared`. It uses `Intl.NumberFormat` with `scaleForCurrency` — currency-symbol, divisor, and fraction digits all derive from the currency code. **No surface may hardcode `$`, `/100`, `toFixed`, or `"USD"`.**

### Violating surfaces (must convert to `formatMoney`)

| File:line | Current | Violation | Fix |
|---|---|---|---|
| `web/src/components/SessionActivityPanel.tsx:100` | `+{(deltaMinor / 100).toFixed(4)} / total {(totalMinor / 100).toFixed(2)}` | hardcoded `/100`, no currency symbol, magic precision | `formatMoney({ minor: deltaMinor, currency })` + `formatMoney({ minor: totalMinor, currency })`; thread `currency` through `CostTickData` (default `"USD"`) — see producer chain below |

**`cost_tick` currency-threading chain (named so T11 is a one-shot edit, not a hunt):** `CostTickData` is defined server-side in `packages/server/src/services/session-activity-buffer.ts:25` (the `cost_tick` entry producer) and mirrored on the web side in `packages/web/src/hooks/useSessionActivity.ts:34` (type) + `:84-85` (`isCostTickData` guard). Add an optional `currency?: CurrencyCode` to `CostTickData` in **both** definitions and the guard, defaulting to `"USD"` at the read site in `SessionActivityPanel.tsx:95-100`. The server emit site that builds the `cost_tick` entry already has the `cost_update` event's `currency` field (`harness-events.ts:31`, threaded from the adapters' `currency: "USD"`) — pass it onto `CostTickData` there. One field, three coordinated edits, no search.
| `web/src/pages/WorkTask.tsx:144` | `${((cost?.minor ?? 0) / 100).toFixed(2)}` | hardcoded `$` + `/100` | `formatMoney(cost)` (already `WireMoney | null`) |
| `web/src/pages/WorkTask.tsx:334` | `${((task.costActual.minor ?? 0) / 100).toFixed(2)}` | hardcoded `$` + `/100` | `formatMoney(task.costActual)` |
| `web/src/pages/WorkRoutine.tsx:353` | fallback `"$0.00"` | hardcoded symbol in fallback | `formatMoney(budget.costThisMonth)` — formatter already returns `"--"` for null; if a zero display is wanted use `formatMoney({ minor: 0, currency })` |
| `web/src/pages/WorkTeam.tsx:263` | fallback `"$0.00"` | hardcoded symbol | `formatMoney(burn.betCostActual)` (returns `"--"` for null) or `formatMoney({minor:0,currency})` |
| `web/src/pages/WorkTeam.tsx:270` | fallback `"$0.00 (this month)"` | hardcoded symbol | `${formatMoney({minor:0,currency})} (this month)` |
| `web/src/shell/TaskSheet.tsx:342` | `${(task.latestSessionCost / 100).toFixed(2)}` | hardcoded `$` + `/100` | `formatMoney({ minor: task.latestSessionCost, currency })` — thread the session `currency` onto the `TaskSheet` task shape (`latestSessionCost` is bare minor units, `:46`); guard stays `latestSessionCost != null` |

**7 surfaces total, not 6** — added per critique. Re-grep confirms no 8th: `grep -rn "toFixed(2)" packages/web/src | grep -iE "cost|minor|Cost"` returns exactly these (SessionActivityPanel:100, WorkTask:144/334, TaskSheet:342). `TaskSheet.tsx:62-63` `toFixed(1)` are **token-count** abbreviations (`formatTokens`), not money — correctly excluded. The §6 regression guard (T12) must therefore pass on TaskSheet *after* its conversion, not flag it.

**`"—"` / `"---"` / `"No cap"` text fallbacks are NOT violations** — they are non-money sentinel strings (placeholder for absent value / "no cap configured"), not hardcoded currency. `formatMoney(null)` already returns `"--"`; teams may standardize on it but it is out of AC5 scope. Decision: leave non-`$` sentinels as-is; the AC is specifically symbol/divisor/currency-code hardcoding.

### Server-side currency literals (secondary — flag, scope decision for critique)
`routines-routes.ts:366/370/374`, `teams-routes.ts` currency defaults, and `formatArtifactCost`/`artifact-cost.ts:27` hardcode `currency: "USD"`. These are **data-layer** currency tagging, not the **render path** AC5 governs (which is the UI). They are correct as long as the factory is single-currency. AF10 leaves them but adds a `@lore AF10` noting the single-currency assumption and that a future multi-currency change must thread a configured `factoryCurrency` instead of the literal. **Not in AC5 scope; flagged to avoid silent assumption.**

### Regression guard (recommended, test/lint act for the builder)
A static ESLint rule (or a focused unit grep-test) that fails on `/\$\d|\/\s*100|\.toFixed\(\s*2\s*\).*minor|['"]\bUSD\b['"]/` inside `packages/web/src/**` money-render contexts would prevent re-introduction. Mirrors the AF11 "static guardrail" posture. Designer flags this as the durable fix for Z8-162; builder decides rule vs. test.

---

## 7. AF6 / AF8 coordination (non-negotiable contract)

- **AF8 cost-sentinel** reads `factory_settings.cost_actual` (`packages/fabric/src/services/cost-sentinel.ts:108`). **AF6 routine-scheduler** reads the same key (`packages/fabric/src/services/routine-scheduler.ts:214`) and `SUM(routineRuns.costMinor)` for monthly caps (`packages/fabric/src/services/routine-scheduler.ts:397`). Both values are written by paths AF10 owns:
  - `factory_settings.cost_actual` ← `recordFactoryCost(db)` (`SUM(users.costActual)`), called at the tail of `recordCostAndCheck`. **AF10 preserves this trailing call** (the `@lore AF8/AF10 CONTRACT` at `cost-cap.ts:362` requires it). §1's delta fix corrects the *magnitude* of `users.costActual`; the SUM and the read are unchanged. **The value AF8 reads is exactly the one AF10 writes.** ✓ contract satisfied.
  - `routineRuns.costMinor` ← `updateRoutineRunOnSessionEnd` (`session-lifecycle.ts:102`), already written; §2 adds the cumulative routine field, does not touch the per-run field AF6 reads.
- **No AF6/AF8 file is modified by AF10.** AF10 only makes the numbers they already read *correct*. After §1, the `@lore AF8 INFLATION WARNING` (cost-cap.ts:366-371) becomes stale — **update it** to state the inflation is resolved (lore hygiene, not a logic change).

---

## 8. Ordered, testable tasks → AC map

Red phase first (per repo rule: define requirement before implementation). Each runtime AC gets an automated test importing the code; static properties (§6 guard) get a lint rule.

| # | Task | Files | AC | Verification |
|---|---|---|---|---|
| T1 | **Red:** failing integration test — session with cost events 10,5,5 ⇒ `users.costActual == 20` (and bet/team/factory == 20) | `server/src/__tests__/session-provisioning.integration.test.ts` (extend) | AC1 | integration test asserts accumulator == 20, not 45 |
| T2 | Fix delta-vs-total: pass `deltaMinor` not `totalCostCents` to `recordCostAndCheck`; keep `totalCostCents` for cap/teardown; add `@lore AF10` | `server/.../session-provisioning.ts` | AC1 | T1 green |
| T3 | **Red:** routine run with cost ⇒ `routines.costActualMinor` incremented; second run accumulates | `server/src/__tests__/AA3-routine-cost.integration.test.ts` (extend) | AC2 | test asserts cumulative field non-null & summed |
| T4 | Write cumulative routine cost in `updateRoutineRunOnSessionEnd`; verify burn/detail routes surface it (not "—") | `server/.../session-lifecycle.ts` | AC2 | T3 green; route test returns non-null `costActual` |
| T5 | `@lore` hardening on team cost read column consistency (no logic change) | `server/src/routes/teams-routes.ts` | AC2 | n/a (doc) — covered by T1's team assertion |
| T6 | **Red:** define the **real ndjson result fixture** (committed, per §4.1) — (a) result line with `total_cost_usd` ⇒ cost appears in agent/bet aggregate; (b) result line **without** the field ⇒ aggregate delta 0 (missing-field fallback) | `server/src/harness/__tests__/` (new or extend CLI adapter test) + fixture file | AC3 | (a) asserts non-zero aggregate from `round(usd*100)`; (b) asserts zero |
| T7 | Add `CliHarnessConfig.costField` (default `"total_cost_usd"`); capture total in `wireStdout`/`parseStdoutLine`; emit one terminal `cost_update`; fix `buildResult` cost | `server/.../cli-harness-adapter.ts` | AC3 | T6(a)+(b) green |
| T8 | **Red:** (a) `POST /api/artifacts` with `cost.money_micros` + `agentId` ⇒ producing task's bet/agent/team aggregate increases by `micros/10000`; (b) `GET /api/artifacts/:id` after create returns `cost == NULL_COST` (narrowed-AC4 surfacing, §5.4) and the bet aggregate is still durable on reload; (c) **null-agent**: create with no `agentId` and a task with null `ownerAgentId` ⇒ artifact created 201, aggregate unchanged (§5.3) | `server/src/__tests__/` (artifacts integration) | AC4 | (a) accumulator delta == micros/10000; (b) chip null on GET, aggregate durable; (c) 201 + zero delta |
| T9 | Add optional `agentId`/`sessionId` to `createArtifactSchema`; resolve `agentId` (body ⇒ `tasks.ownerAgentId`), resolve `teamId` via `users.teamId` (=`teamMembers.id`), synthesize `sessionId`; route cost through `recordCostAndCheck` (delta); skip when no agent; update `@lore O2` note | `server/.../routes/artifacts.ts` | AC4 | T8(a)(b)(c) green |
| T10 | **Red:** component test — `SessionActivityPanel`/`WorkTask`/**`TaskSheet`** render via `formatMoney` (assert JPY/zero-decimal currency formats correctly, proving no hardcoded `$`/`/100`) | `web/src/__tests__/L17-money-web.test.tsx` (extend) | AC5 | render asserts currency-correct output |
| T11 | Convert all **7** §6 violating surfaces to `formatMoney`; thread `currency` through the `CostTickData` chain (`session-activity-buffer.ts` ↔ `useSessionActivity.ts`) and onto the `TaskSheet` task shape | `web/.../SessionActivityPanel.tsx`, `WorkTask.tsx`, `WorkRoutine.tsx`, `WorkTeam.tsx`, `shell/TaskSheet.tsx`, `hooks/useSessionActivity.ts`, `server/.../session-activity-buffer.ts` | AC5 | T10 green |
| T12 | Add static guard (ESLint rule or grep-test) banning `$`/`/100`/`"USD"` in web money contexts | `eslint config` or `web/src/__tests__/` | AC5 | guard fails on a planted violation, passes on clean tree |
| T13 | Lore hygiene: update stale `@lore AF8 INFLATION WARNING` (cost-cap.ts:366) — inflation resolved | `fabric/.../cost-cap.ts` | — | doc; `/lore` index |
| T14 | Full gate: `npm run check && npm run lint && npm run test:all` | — | all | green |

**Sequencing rationale:** T1-T2 first (highest-impact, unblocks correct numbers for every other test). T3-T9 are independent write-path additions (parallelizable). T10-T12 (frontend formatting) depend only on the wire shapes, not on T1-T9, so can proceed in parallel. T13 after T2 lands.

### Protected tests (CC-008 — frozen contracts; extend, never loosen)

AF10 extends three existing test files. The following assertions are **frozen** — the builder adds new cases but must not relax or delete these:

- **`packages/server/src/__tests__/AA3-routine-cost.integration.test.ts`**
  - `:143` / `:202` — `costCapMonthlyMinor` returns/clears to `null` (null-cap handling). Frozen.
  - `:523-544` — `AC-4` burn: `betCostActual` summed from active bets (`costActualMinor` 500/300 fixtures) and `routineCostThisMonth` from this month's runs. §2's cumulative-routine write must not change these per-run/burn sums. Frozen.
- **`packages/web/src/__tests__/L17-money-web.test.tsx`**
  - `:35` `'$12.40'` for `{minor:1240,USD}`; `:49` `'$0.00'` for `{minor:0,USD}`; `:63` `'--'` for null money. These are the `formatMoney` golden outputs every §6 conversion must continue to satisfy. Frozen — T10 adds JPY/zero-decimal cases *alongside* them.
- **`packages/server/src/__tests__/session-provisioning.integration.test.ts`**
  - Existing session-end / teardown / `totalCostCents` cap-check assertions. §1 changes what is passed to `recordCostAndCheck` (delta, not total) but must keep the per-run cap-check and teardown totals intact. T1 adds the `10,5,5 ⇒ 20` accumulator assertion *without* loosening any existing teardown/result-cost assertion. Frozen.

---

## 9. Bugs / risks flagged during investigation

1. **(Primary, Z8-002)** `session-provisioning.ts:768` passes a running total to a delta-taking boundary → quadratic inflation. Fixed §1.
2. **(Z8-030/119)** `routines.costActualMinor` has zero writers → permanent "—". Fixed §2.
3. **(Z8-049/088)** CLI adapter discards observable CLI total cost (`buildResult` hardcodes `minor: 0`) → CLI sessions invisible to accounting. Fixed §4.
4. **(Z8-124/127/162)** `POST /api/artifacts` accepts then drops cost; `artifacts` table has no cost columns; read always `NULL_COST`. Fixed §5 by routing through accumulators (no new table). **Id-resolution pinned (§5.1-5.2):** carry `agentId` on create → resolve `teamMembers.id` via `users.teamId` (NOT `tasks.teamId`, which is `teams.id`) → synthesize `sessionId`. **Null-owner rule (§5.3):** no resolvable agent ⇒ artifact still created, cost not recorded (explicit, tested — not a silent throw). **AC4 narrowed (§5.4):** "recorded into aggregates + create response"; per-artifact chip on GET stays `NULL_COST` by O2 design, asserted to survive a reload as intentional.
5. **(Z8-162)** Six UI surfaces hardcode `$`/`/100`/`toFixed`/`"$0.00"`. Fixed §6.
6. **Secondary risk — single-currency assumption baked into literals** (`"USD"` in routines/teams routes, `artifact-cost.ts`, §2's new write). Correct today; flagged with `@lore`. A multi-currency factory would need a threaded `factoryCurrency` — out of AF10 scope, must not be silently assumed.
7. **`factorySpend` over-count in the factory-cap *check*** (cost-cap.ts:334): with the §1 fix this self-corrects (was `base + runningTotal`, now `base + delta`). No separate task; verified by T1's factory assertion.
8. **Test isolation gotcha:** `recordCostAndCheck` uses module-level `dedupBySession` state (`@lore I3` at cost-cap.ts:75-80). New tests importing it MUST call `clearDeduplicationCache()` in `beforeEach`. Called out so T1/T3/T8 don't bleed state.

## 10. Scope discipline (self-critique)

- **No new tables, no migrations.** Every fix lands on existing columns/accumulators. Artifact cost deliberately avoids resurrecting the O2-dropped columns (§5 trade-off quantified). The only schema-adjacent change is **two optional wire fields** (`agentId`, `sessionId`) on `createArtifactSchema` — additive, backward-compatible (existing callers omit them and hit the null-owner skip path, §5.3), no DB column.
- **No boundary signature change.** `recordCostAndCheck` is untouched; only its one mis-calling site is fixed.
- **No new abstraction.** `formatMoney` already exists; AF10 routes more callers to it rather than inventing a wrapper.
- **Out of scope (held):** budget *enforcement* in the scheduler (AF6 consumes these numbers), notification delivery (AF8), multi-currency, artifact token surfacing (scoped to money per AC4 reading — flagged for critique).
