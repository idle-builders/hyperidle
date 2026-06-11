# Architecture Critique: AF10

ARCHITECTURE-SCORE: 9/10  rounds=2  score-line: SA:9 LI:9 AC:9 DM:8 N:9 MD:9 FMC:8 S:9 V:9

> **Round 2 (2026-06-11): APPROVED — builder may proceed.** All four Round-1 findings (1 CRITICAL, 3 WARNING) are genuinely resolved and re-verified against actual code. Full Round-2 log at the bottom of this file. Round-1 sections below are preserved verbatim.

---

## Round 1 (score 8/10)

Verified every central claim against the actual code. The plan is unusually well-grounded — line-exact citations that hold up under inspection. The bug analysis (§0–§1) and the AF6/AF8 contract reasoning (§7) are correct and load-bearing. The two soft spots are both in §5 (artifact cost): a key code-claim does not survive verification, and the AC4 "surfacing" half is under-specified. One missed render surface in §6.

---

### Verification log (claims checked against code)

| Plan claim | Verdict |
|---|---|
| `recordCostAndCheck` treats arg as a delta (`costActual += effectiveCostMinor`) | TRUE — `cost-cap.ts:243` `+= effectiveCostMinor` on users/teamMembers/bets |
| `session-provisioning.ts` is the lone caller passing a running total | TRUE — `session-provisioning.ts:767` `costMinor: totalCostCents`; `totalCostCents += ...` at :755 |
| `routines.costActualMinor` has zero writers | TRUE — schema:303; only `update(routines)` writer at `session-lifecycle.ts:110` sets `lastRunAt`/`lastRunSummary` only |
| AF6/AF8 read `factory_settings.cost_actual` written by `recordFactoryCost` | TRUE — sentinel `cost-sentinel.ts:108`, scheduler `routine-scheduler.ts:213` both read key `"cost_actual"`; `recordFactoryCost` writes `SUM(users.costActual)` to that key; `@lore AF8/AF10 CONTRACT` present at `cost-cap.ts` tail |
| AF10 delta fix won't contradict AF8/AF6 | TRUE — fix changes magnitude of `users.costActual`; SUM + read unchanged |
| CLI-harness drops cost | TRUE — `cli-harness-adapter.ts:386` `cost: { minor: 0, currency: "USD" }`; comment "CLI tools don't report cost/tokens" |
| Artifact cost dropped | TRUE — `artifacts.ts:38` ignores `cost`; `artifacts` table (schema:783) has no cost columns; read returns `NULL_COST` |
| 6 hardcoded money surfaces exist | TRUE — all 6 lines confirmed exactly as tabled (SessionActivityPanel:100, WorkTask:144/334, WorkRoutine:353, WorkTeam:263/270) |
| §5 "producing task resolves the agentId/teamId the boundary needs" | **FALSE / UNVERIFIED** — see CRITICAL below |
| Sentinel/scheduler file paths (§0, §7) | IMPRECISE — files are in `packages/fabric/src/services/`, plan omits the prefix |

---

### CRITICAL

- **[§5, T8/T9] The artifact→`recordCostAndCheck` route cannot supply the mandatory `agentId`, and passes the wrong table's id as `teamId`.** `RecordCostAndCheckParams.agentId` is **required and non-null** (`cost-cap.ts:43`), and the boundary **throws `Agent not found`** if the row is absent (`cost-cap.ts:171-173`). But the artifact POST handler only has `body.producingTaskId`, and the `tasks` table has only a **nullable** `ownerAgentId` (`schema.ts:170`) — there is no guaranteed agent to attribute cost to. Worse: `tasks.teamId` references **`teams.id`** (`schema.ts:167`), while `recordCostAndCheck`'s `teamId` param expects a **`teamMembers.id`** (membership group — `@lore U1` at `cost-cap.ts:251`/`tasks.teamId@schema:45` for the *user* side). Passing `tasks.teamId` accumulates onto the wrong table. The plan's sentence "The producing task's session/agent/team context resolves the agentId/teamId the boundary needs" is hand-waved — there is no session linkage on an artifact (a task has many sessions; `producingTaskId` does not name one), and the only agent on a task is optional.
  → **Fix the plan**: pin down the exact resolution path. Either (a) require the artifact create to carry the originating `sessionId`/`agentId` and resolve `teamId` to the correct `teamMembers.id` via the agent's membership (`users.teamId` at `schema:45`), and specify the behavior when `ownerAgentId` is null (skip accounting? 400? attribute to a system agent?); or (b) drop the accumulator-routing decision and record artifact cost on a dedicated path that does **not** require a full agent/team context. Add a §5 sub-table mapping `producingTaskId → {agentId, teamId(teamMembers.id)}` with the source column for each, and an explicit failure rule for the null-`ownerAgentId` case. As written, T9 will either throw at runtime or silently mis-attribute. This is the one place the plan's "smallest possible fix" framing breaks down.

### WARNING

- **[§5, AC4 — "surfaced" half unmet] AC4 is "recorded AND surfaced"; the plan only delivers "recorded."** Routing artifact cost through accumulators makes it flow into bet/team/factory aggregates, but the artifact's **own** read path still returns `NULL_COST` (`artifacts.ts:67`) because the `artifacts` table has no cost columns and the plan explicitly refuses to add them. The plan claims the artifact "cost chip" is satisfied by "the wire `cost` field round-tripped at creation time for the immediate response" (§5) — but that is the *create response only*; a subsequent `GET /api/artifacts` re-reads `NULL_COST`, so the chip shows nothing on reload. The validation scenario "artifact cost … surfaced rather than silently dropped" is not met on the read path.
  → **Fix the plan**: either add a verification for the artifact's own surfaced cost (and a storage answer for it that survives a reload — without resurrecting O2 columns, this likely needs a derived/joined read), or explicitly narrow AC4 to "recorded into aggregates + reflected in create response" and get that scope-narrowing blessed, noting the chip-on-reload gap as known/deferred. Right now T8's assertion ("accumulator delta == micros/10000") proves *recorded* but nothing proves *surfaced*.

- **[§6] A 7th hardcoded money surface is missed: `TaskSheet.tsx:342`** — `${(task.latestSessionCost / 100).toFixed(2)}`. Same `$` + `/100` violation class as the tabled six. AC5 says "every money value in the UI" and "no surface hardcodes the symbol, divisor, or currency code." The plan's §6 table is therefore incomplete, and the §6 regression guard (T12) would itself flag this file — meaning the plan's own guard contradicts the plan's own surface list.
  → **Fix the plan**: add `TaskSheet.tsx:342` (and re-grep `packages/web/src/**` for `toFixed(2)` near `cost`/`minor`/`Cost` to confirm no 8th). Note `TaskSheet.tsx:62-63` `toFixed(1)` are token-count abbreviations, not money — correctly excluded.

- **[§4, FMC] CLI cost-capture is built on an admittedly unverified field name.** §4 already flags `⚠️ UNVERIFIED: exact JSON field of the claude CLI result line`. Good that it's flagged, but T6/T7 have no fallback contract if the field is absent or differently named in the pinned CLI version. AC3's validation scenario ("CLI session that incurs cost … appears in aggregates") cannot go green if the field is wrong.
  → **Fix the plan**: T6 must define the exact ndjson fixture (captured from the real pinned CLI, not assumed) before T7, and specify the behavior when the field is missing (stay at zero — already the §4 constraint, but make it the test's negative case). Make the field name a named config on `CliHarnessConfig` (§4 already gestures at this) so a version drift is a config change, not a code change.

### SUGGESTION

- **[§0, §7] File-path imprecision.** `cost-sentinel.ts` and `routine-scheduler.ts` are in `packages/fabric/src/services/`, not the bare names the plan cites. Harmless for a human, but a builder grepping `packages/server/src/services/cost-sentinel.ts` (the natural read of §0/§7 given the other §0 files are server-side) hits nothing. Prefix both.

- **[§6, T11] `cost_tick` currency threading is under-specified.** `SessionActivityPanel` reads `entry.data.{deltaMinor,totalMinor}` (line 96) — the `cost_tick` entry has **no currency field**. §6 correctly says "thread a `currency` through the `cost_tick` entry data," but does not name where `cost_tick` entries are produced (the activity-log builder), so the builder must hunt for the emit site. Name the producer file in T11 so the type extension is a one-shot edit, not a search.

- **[§9 risk 8 / V] Good catch on `clearDeduplicationCache()` in `beforeEach` for T1/T3/T8** — verified the module-level `dedupBySession` state and the `@lore I3` warning at `cost-cap.ts:70-80`. Keep this; it's exactly the kind of test-isolation trap that bleeds green→red across a worker.

- **[DM] No protected-tests list.** The plan extends `AA3-routine-cost.integration.test.ts`, `L17-money-web.test.tsx`, and the session-provisioning integration test. Per CC-008, enumerate which existing assertions in those files are frozen contracts (e.g. AA3's `betCostActual` null-handling, L17's JPY zero-decimal format) so the builder doesn't loosen them while extending. Add a one-line protected-tests block to §8.

### What's Working Well

- **§0–§1 bug analysis is exemplary.** The quadratic-inflation table (10,5,5 → 45) is reproduced exactly from the code, the boundary-vs-caller framing is correct ("the contract is already met by the boundary; AF10's job is to make the one caller honor it"), and the `factorySpend` self-correction note (§1 coupling) shows the architect traced the delta through every consumer, not just the headline path. This is the rare plan where the central claim is *more* solid than stated.
- **§7 AF6/AF8 coordination is contract-grade and verified true.** Both consumers read `factory_settings.cost_actual`; `recordFactoryCost` writes it as `SUM(users.costActual)`; the delta fix changes only the summed column's magnitude, never the SUM or the read. The `@lore AF8/AF10 CONTRACT` (preserve the trailing call) and the stale `INFLATION WARNING` (T13 updates it) are both real and correctly handled. The spec's hardest constraint — "the value the AF8 sentinel reads must be one this workpackage actually writes" — is genuinely satisfied, not just asserted.
- **§10 scope discipline holds.** No new tables, no migration, no boundary signature change, no new abstraction (routes more callers to the existing `formatMoney` rather than wrapping it). The artifact-cost trade-off (§5) is quantified rather than asserted — even though the resolution path is wrong (CRITICAL above), the instinct to avoid resurrecting O2 columns is sound.

---

## Round 2 (score 9/10) — re-critique of the revised plan

Re-read the full revised `architecture.md` and re-verified every revised claim against actual code. The designer addressed all four findings with line-exact resolution paths that hold under inspection. No hand-waving remains in §5. Score raised 8→9.

### Round-2 verification log (claims re-checked against code)

| Revised claim | Verdict |
|---|---|
| `users.teamId` references **`teamMembers.id`** (membership group) | TRUE — `schema.ts:162` `teamId: text("team_id").references(() => teamMembers.id …)`, `@lore U1` present |
| `tasks.teamId` references **`teams.id`** (domain entity, wrong table for the boundary) | TRUE — `schema.ts` tasks block `teamId … .references(() => teams.id …)`, `@lore U1` |
| `tasks.ownerAgentId` is **nullable** | TRUE — `schema.ts` `ownerAgentId: text("owner_agent_id").references(() => users.id …)` — no `.notNull()` |
| `recordCostAndCheck` throws `Agent not found` on absent agent | TRUE — **two** throw sites: `cost-cap.ts:171-173` (checkCostCap) AND `cost-cap.ts:280-282` (inside the record path itself). So even the record path 500s on a null agent — §5.3 skip is the only safe route |
| `teamMembers.costActual` is the accumulator target (`@lore U1`) | TRUE — `cost-cap.ts:251` `update(teamMembers).set({ costActual: … })`, `@lore U1` inline |
| §5.2 reuses the provisioning resolution `agent.teamId ?? undefined` | TRUE — `session-provisioning.ts:284` `const teamId = agent.teamId ?? undefined` — verbatim the pattern the plan cites |
| SDK adapter default cost field is `total_cost_usd` | TRUE — `claude-agent-sdk-adapter.ts:287` `const totalCost = msg.total_cost_usd ?? 0` |
| `TaskSheet.tsx:342` is a real 7th money surface | TRUE — `${(task.latestSessionCost / 100).toFixed(2)}` exactly |
| No 8th money surface | TRUE — `grep "toFixed(2)" packages/web/src | grep -iE "cost|minor"` returns SessionActivityPanel:100, WorkTask:144/334, TaskSheet:342 only; WorkRoutine/WorkTeam use `"$0.00"` string literals (already tabled), not `toFixed` |
| Artifact handler currently selects only `tasks.title` (plan extends it to add `ownerAgentId`) | TRUE — `artifacts.ts:291-295` selects `{ title }`; the §5.2 extension is an accurate delta, not a misstated current state |

### Finding-by-finding resolution

**1. CRITICAL §5 artifact routing — RESOLVED.** The previous hand-wave ("the task's context resolves the ids") is replaced by §5.1-5.3, which is now contract-correct:
- §5.1 gap table is accurate: `agentId` required+non-null, only `tasks.ownerAgentId` (nullable) available; `tasks.teamId` is the wrong table (`teams.id`, not `teamMembers.id`); no session linkage on an artifact. All three rows verified.
- §5.2 resolution path is the **verified-correct** one: carry `agentId` on create → resolve `teamMembers.id` via `SELECT teamId FROM users WHERE id = agentId` (`users.teamId` = `teamMembers.id`), explicitly **not** `tasks.teamId`. This mirrors `session-provisioning.ts:284` verbatim. Synthetic `sessionId = artifact:<id>` for the dedup key is sound — artifacts create once, so the per-artifact dedup scope never bleeds.
- §5.3 null-owner decision is **sound and won't throw**: because `recordCostAndCheck` itself throws `Agent not found` at `cost-cap.ts:280-282`, the only runtime-safe option when neither body `agentId` nor `tasks.ownerAgentId` resolves is to skip the call and still return 201. The three rejected alternatives (synthetic system agent = silently-wrong SUM pollution; 400/422 = behavior regression on the additively-optional field; calling with null = 500) are each correctly reasoned. "Skip recording, still 201" is the honest absent-not-dropped posture, consistent with §4's CLI-zero stance. T8(c) tests it.

**2. AC4 "surfaced" narrowing — RESOLVED.** §5.4 makes the narrowing explicit and defensible: AC4 = "recorded into bet/agent/team/factory aggregates + reflected in the create response; NOT silently discarded." The per-artifact GET chip staying `NULL_COST` is now a *declared, tested* gap (O2 design: per-artifact cost is a strategy concern), not a silent one. The plan correctly rejects the tempting-but-wrong "surface the bet's running total on the chip" (would show the wrong number). T8(b) is the right proof: GET returns `cost == NULL_COST` (asserts the narrowing is intentional, not an accidental write to a non-existent column) AND the bet aggregate is durable on reload (asserts *recorded* survives). Justification against the spec is correct: the spec's failure mode is "cost dropped to nowhere"; post-AF10 it lands in four durable aggregates + the AF8 SUM. Narrowing blessed.

**3. 7th surface TaskSheet.tsx:342 — RESOLVED.** Added to the §6 table with the correct fix (`formatMoney({ minor: task.latestSessionCost, currency })`, thread currency onto the TaskSheet task shape, guard stays `!= null`). The "7 surfaces total, not 6" note re-greps and confirms no 8th, and correctly excludes the `toFixed(1)` token abbreviations at TaskSheet:62-63. T10/T11 now name TaskSheet explicitly.

**4. CLI field + fixture + fallback — RESOLVED.** New §4.1 pins all three: `CliHarnessConfig.costField?: string` (default `"total_cost_usd"`, the verified SDK field) making version-drift a config change; the real ndjson fixture is owned by T6 (red phase) and committed before T7, with the contract "do not assume the field — read it from the committed fixture"; the missing-field fallback is now a hard T6 negative case (field absent ⇒ `session.totalCostUsd` unset ⇒ no synthetic `cost_update` ⇒ aggregate delta 0 ⇒ `buildResult` returns `{ minor: 0 }`). T6/T7 in §8 reflect both the positive and negative fixtures.

### Remaining items

- **No CRITICAL. No WARNING.**
- SUGGESTIONS from Round 1 also addressed: file-path prefixes corrected (`packages/fabric/src/services/`), the `cost_tick` currency-threading chain is now named end-to-end (`session-activity-buffer.ts:25` ↔ `useSessionActivity.ts:34/84` + emit site), and the protected-tests block (CC-008) is added to §8 with frozen assertions enumerated for all three extended test files.
- One **non-blocking note** for the builder (not a finding): §5.2 step 4 synthesizes `sessionId = artifact:<artifactId>`, but the artifact id is generated locally (`artifacts.ts:300` `crypto.randomUUID()`) — ensure the `recordCostAndCheck` call happens *after* that `id` is in scope and that the synthetic key is used for the dedup map only (it is never released, which is correct since it's used exactly once). No code-correctness risk; just sequence the call after id generation.

### Updated dimension scores (Round 2)

| Dim | R1 | R2 | Why changed |
|---|---|---|---|
| AC (acceptance-criteria fidelity) | 8 | 9 | AC4 narrowing now explicit + tested (T8b); null-owner case specified (T8c) |
| DM (data model) | 6 | 8 | id-resolution path pinned to correct tables; protected-tests list added |
| FMC (failure-mode coverage) | 7 | 8 | CLI missing-field fallback is now a test assertion; null-agent throw avoided by design |
| V (verification) | 8 | 9 | T6 negative fixture, T8(b)(c) surfacing+null cases, 7th-surface guard all added |

**ARCHITECTURE-SCORE: 9/10. No CRITICAL, no WARNING. APPROVED — builder may proceed.**
