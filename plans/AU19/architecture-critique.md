# AU19 — Refine + Architecture Critique (Round 1 of max 3)

**Reviewer pass:** `/refine-critique` + `/architecture-critique`, round 1.
**Inputs judged:** `plans/AU19/requirements.md` (refine) · `plans/AU19/architecture.md` (architecture) · `plans/AU19/concept.html` (founder-approved DWG AU19-001) · `.pipeline/work-packages/TRACK-AU.md` §AU19 (contract).
**Codebase spot-checks performed** (worktree `AU19-build`): server prod-file count, `services/` count, `tools/` `@hyperidle/db` + foreign-table usage, `worker-ws`/`remote-harness-adapter` db-import claim, `agent_work_intents` accessors, `agent-work-intents.ts` owner exports.

## Verdict

**Refine: CLEARS the bar** (strong; one buried tension noted).
**Architecture: DOES NOT clear the bar — revise (round 2).** Two CRITICAL findings (tool-provider resolution is internally contradictory; the mandated composition-edge audit is incomplete and its headline count is self-inconsistent) plus four WARNINGs. The plan's spine — three mechanisms, hard-gated Increment 0, ambiguous-file table, AC map, scaffold generator, floor-honest 30-Service roster, `remote-server` correctly never composing `agent-execution` — is sound and materially better than AU17. The failures are concentrated in the one place the spec flagged as the genuinely-new work (Mechanism C / `tool-provider`), and that is exactly where it must be tightened before code.

---

## CRITICAL findings

### C1 — `tool-provider` resolution is internally contradictory; the deferral does NOT honor the zero-DB-execution constraint

The founder locked two things that collide inside `tool-provider`: (a) tools live under `agent-execution`, and (b) `agent-execution` holds **zero** Service/table reference of any kind. The architecture (§10.1 + honesty note) claims it can prove "the package/dependency boundary (deps = shared only, tsc-enforced)" **while** "not re-routing today's in-process tool execution." **These two cannot both be true.**

Codebase evidence (this worktree):
- **37** files under `packages/server/src/tools/` import `@hyperidle/db`.
- **11** of them do foreign-table access directly (`.from(knowledgeItems)`, `insert(knowledgeItems)`, `.from(artifacts)`, `.from(teams)` — tables owned by `knowledge`/`work`/`org`, not by `tool-provider`), e.g. `score-attention.ts`, `promote-knowledge.ts`, `create-conflict-review.ts`, `create-artifact.ts`, `create-bet.ts`, `add-agent.ts`.

Consequences the plan does not reconcile:
- If **behavior is genuinely not re-routed**, the `tool-provider` package.json MUST keep `@hyperidle/db` and MUST keep importing foreign tables → it fails **Mechanism A** (Table ACL — foreign `.from(knowledgeItems)`), fails **Mechanism B** (zero-DB execution), and fails **Mechanism C**. `deps = shared only` is then false.
- To make `deps = shared only` **true**, every one of the 37 db-touching tool files must have its table access converted to injected ports — which **is** the re-routing §10.1 says it defers. You cannot buy the package-boundary win without doing the DI conversion.

The "package clean but behavior unchanged" middle position §10.1 stakes out is not reachable. The plan must pick one and say so concretely:
- Option A: Increment 4 fully converts all ~37 db-touching tool files to injected ports (removing `@hyperidle/db` from `tool-provider`) — state this as the actual scope and cost, not a deferral. **This is the only option consistent with the locked constraints + zero-allowlist rule.**
- Option B (likely the correct classification): the **DB-touching tool bodies are orchestration-side, not execution-side.** The architecture's own §10.1 says "tools execute where the DB is." If so, only the harness-facing tool **dispatch/registration/schema** surface belongs in `agent-execution`; the DB-touching implementations belong under `agent-orchestration` (or `core-api`). Placing all of `tools/` under `agent-execution` is then a mis-placement across the execution boundary. Resolve the split explicitly — do not defer it to "Increment 4, behavior not re-routed."

Honesty about a gap (the §10.1 note is commendable) does not close the gap. As written, Increment 4's stated exit state is unachievable.

### C2 — The composition-edge audit is incomplete and its headline count is self-inconsistent (spec-mandated deliverable missing)

The spec makes this a hard deliverable: "budget a full audit of every current Service-shaped-module-calls-another-Service-shaped-module edge … **produce an explicit table of these edges the same way AU11/AU17 tabulated their file moves**." Mechanism C is the one genuinely-new refactoring in the WP and AC-6 depends on every edge being Layer-wired.

What the architecture delivers (§10): per-source aggregate counts and "Full machine-generated list retained in the build scratchpad." Problems:
- **No explicit edge table exists** in the artifact, and the referenced "build scratchpad" is not a committed artifact — it is unverifiable and, in a multi-session resumable build, will not survive to the increment that needs it.
- **The stated total is internally impossible.** The top-5 source rows alone sum to ~133 edges (`tool-provider` ~40 + `session-lifecycle` ~30 + `dispatch` ~30 + `policy` ~20 + `context-assembly` ~13 = 133), yet the headline claims "**115 distinct** cross-Service edges" for *all* services — and the "remainder" row then adds ~22 more services at 1–4 edges each (another ~30–50). A real distinct-edge count cannot have its top-5 subset (133) exceed its stated whole (115). This is an estimate dressed as a census.

Because each increment's correctness ("convert only your group's outbound edges") is defined against this inventory, an inaccurate/absent inventory is a real migration risk, not a cosmetic one. Round 2 must either commit the actual edge-by-edge table (grouped by owning Layer, as AU11/AU17 did) or state honestly that the enumeration is produced per-increment and remove the contradictory "115"/"machine-generated list" claims.

---

## WARNING findings

### W1 — AC-9 `routes/threads.ts` closure is under-specified and brushes the layer/composition boundary
Confirmed: `routes/threads.ts:1195` does a raw `tx.insert(agentWorkIntents)` (imports the table at line 15). AC-9 requires this closed **this WP, not deferred again**. But `routes/*` are `core-api` Layer and `agent_work_intents` is owned by an `agent-orchestration` Service (`session-requests`). Per the locked model a Layer may only compose its **own** Services; cross-Layer wiring is the Application's job — so a core-api route cannot simply `import { recordAgentWorkIntent } from "@hyperidle/session-requests"`. §11 hand-waves this ("does so through a core-api→orchestration wiring point … confirm the existing handoff path at migration"). Given AC-9 must actually land, the plan needs a concrete answer now (an Application-injected recorder / a downward-wired dependency handed to the route at app construction), not a migration-time TBD. Note also MEMORY: the post-bet-retro path already bypasses the durable-intent queue with an ad-hoc route call — the same anti-pattern the founder flagged as wrong trajectory; do not reproduce it here.

### W2 — Increment 0 "minimal slice" is not minimal; transitional wiring is under-specified
§12 extracts `context-assembly` into a package in Inc 0, but §10 shows `context-assembly` has 5 outbound edges (`knowledge`(7), `work`(2), `users`(1), `routine`(1), `filesystems`(1)) — not just the one `knowledge` edge the spec's minimal-slice example names. Extracting the package forces **all** its imports to resolve, so Inc 0 must also DI-wire work/users/routine/filesystems. §12 step 3 says the non-knowledge concrete impls are "imported by the `agent-orchestration` Layer from their *current* `packages/server/src` location, transitionally" — i.e. the new `@hyperidle/agent-orchestration` Layer package deep-imports into the still-monolithic `@hyperidle/server`. Whether `@hyperidle/server` even exports those symbols, and whether that transitional edge itself trips the new guards, is unspecified. Risk: the HARD-GATE Inc 0 balloons past "one Service per Layer + one composition." Either pick a genuinely single-edge slice (e.g. wire only `knowledge`; leave `context-assembly`'s other consumers in place until Inc 3) or specify the transitional import contract precisely.

### W3 — AC-4 literal contradiction reinterpreted, not escalated
Spec AC-4 states orchestration/execution Services "own no SQL table, so their boundary is the package/exports-map itself, not Table ACL." The architecture correctly finds (§4 finding, §14) that `session-requests`/`lifecycle-projection` **do** own tables (`agent_work_intents`, `agent_session_requests`, `agent_lifecycle_inbox`) and applies Table ACL to them — which AC-9 independently requires. The resolution is right and honestly flagged, but it silently rewrites a locked AC ("read AC-4 as 'most orchestration Services don't own tables'"). This is a founder-facing AC-text correction, not an architecture-internal reinterpretation — surface it explicitly for confirmation rather than quietly reinterpreting the contract.

### W4 — Execution-layer port **type source** is unspecified and conflicts with the scaffold
§8's scaffold has `agent-execution` Services **drop `@hyperidle/db`** entirely. But §7.3's DI worked-example types its port off `import type { KnowledgeItem } from "@hyperidle/db"`. An execution-layer port (e.g. the tool-provider `WorkWriter`/`KnowledgeReader` bundles in §10.1) therefore has nowhere to source its domain row types from — `db` is disallowed, and the plan hasn't said those types move to `@hyperidle/shared`. Relocating the domain row types execution needs into `@hyperidle/shared` is non-trivial and is a prerequisite for C1-Option-A being buildable at all. Name the type-source path.

---

## Minor findings

- **File-count facts are wrong.** §1 says "flat **82**-file dump" and "**240** production `.ts` files"; actual on this branch: `services/` = **76**, total server prod files = **238** (matches the spec's "~238", not the doc's 240). Small, but these are cited as hard facts driving the migration inventory.
- **§5 overclaims a file census.** It asserts "all 240 production files land in exactly one Service/Layer/Application/ambiguous slot" but enumerates *categories*, not files, and the count itself (240) is off by 2. Reuse AU17's actual per-file classification or state that §5 is category-level.
- **Refine handed architecture a buried contradiction (refine gap).** Refine Q1 grounds `agent-execution ≈ packages/server/src/{harness,mcp,tools}` **and** locks "agent-execution zero DB" without noting that `tools/` is DB-saturated (37 files import `@hyperidle/db`). The architecture caught it (§10.1); refine should have surfaced the tools/ tension as the known hard case rather than asserting the dir mapping cleanly. (Refine still clears the bar — the five gated questions are each resolved with defensible, codebase-grounded reasoning: IFF harness-talks test; 4 exhaustive Applications; `Service` over `Domain`; core-ui deferred; floor-not-ceiling. `worker-ws`/`remote-harness-adapter` zero-db claim verified true.)

---

## Things checked and found CORRECT (no finding)

- **`remote-server` never composes `agent-execution`** — §3 table row `— ● ● —`; §7.4 wires its `HarnessPort` to a `remote-worker` WS client. Matches the locked constraint and the concept schedule exactly.
- **Ambiguous-file disposition table present (§6), 17 rows, each with a named home + reasoning, explicitly append-only, no silent `shared` default** — meets the spec's "do not default into a flat shared bucket" demand. (Rows marked "inspect at migration" carry a tentative home + rationale, flagged not defaulted — acceptable.)
- **`agent_work_intents` debt is in-scope, not deferred** — §11 names exactly the 3 spec accessors (`routes/threads.ts` insert [confirmed L1195], `routes/sessions-routes.ts` read, `services/agent-layer-boot.ts` read), scheduled Increment 3, TABLE_OWNER rows added. (Mechanism for the route accessor is the W1 gap.)
- **Increment 0 is a hard gate, ordered strictly before bulk (§12), builds all 3 guards, wires the real `context-assembly ← knowledge` composition at the Layer, and runs 3 sanity-breaks (A/B/C: inject → RED → revert)** — satisfies AC-7's "≥1 sanity-break per mechanism before migration." (Minimality caveat = W2.)
- **Service roster is an honest floor** — 30 Services (§4), "within the ~25–35 the floor predicted"; not capped at the concept's ~20.
- **Table-ACL barrel-discipline-is-insufficient finding (§7.1)** — the doc correctly identifies that `@hyperidle/db` exports every table to everyone, so the general `TABLE_OWNER` guard (not barrel discipline) is the load-bearing enforcer. This is exactly the right correctness caveat to surface.
- **`typecheck-gate.ts` recursion (§9.2)** correctly identified as the silent-failure risk that would make every tsc-based mechanism theatre, and gated first in Inc 0.
- **AC → plan-step map (§13)** covers all 10 spec ACs + the workspaces-glob item; mappings are concrete (guard `--fixtures`, negative-case tsc fixtures, boot-each-topology).

---

## 9-dimension rubric

| # | Dimension | Score /5 | Note |
|---|---|:--:|---|
| 1 | Spec/contract fidelity | 3.0 | AC-4 reinterpreted (W3); tool-provider constraint unresolved (C1). |
| 2 | Boundary & mechanism integrity (A/B/C) | 2.5 | C1 breaks B+C at `tool-provider`; W1 route closure fuzzy. |
| 3 | Enforcement & verification design | 4.0 | Guards, `--fixtures`, sanity-breaks, typecheck-gate recursion all well-caught. |
| 4 | Sequencing & resumability | 3.5 | Inc-0 gate + increment checklist strong; Inc 0 not truly minimal (W2). |
| 5 | Completeness of mandated deliverables | 2.5 | Edge table absent + count inconsistent (C2); ambiguous table + scaffold + AC map present. |
| 6 | Internal consistency | 2.5 | 115-vs-133 edge contradiction; 82/240 file-count errors. |
| 7 | Simplicity / no over-abstraction | 4.0 | No ports package; `HarnessPort` bounded to existing seam; roster fold-candidates flagged honestly. |
| 8 | Naming / vocabulary | 4.5 | `Service` lock clean; "domain" retained only as adjective. |
| 9 | Honesty / self-critique | 4.5 | Flags its own hardest tensions (§10.1, §14) plainly — the reason this is fixable in one revision. |

**Overall: revise (round 2).** Close C1 (pick a real tool-provider resolution consistent with zero-DB + zero-allowlist) and C2 (commit the actual edge inventory + fix the count), then tighten W1/W2/W4. The bones are good; the two CRITICALs are both in the Mechanism-C / execution-boundary seam the spec itself flagged as the novel work.

---

# Round 2 (post-revision `e51048c`) — architecture-critique

**Reviewer pass:** `/architecture-critique`, round 2 of max 3.
**Input judged:** `plans/AU19/architecture.md` @ `e51048c` (claims C1/C2 + W1–W4 resolved).
**Codebase re-verification (worktree `AU19-build`, real files — not just the doc's internal consistency):** `@hyperidle/shared` package.json db-freeness; `tools/` `@hyperidle/db` production census; `tool-provider` seed-file db-freeness; per-source + full-edge-table sum reconciliation; three edge-table rows spot-checked against real import statements; `createApp`/`server-factory` deps-threading reality.

## Verdict

**Architecture: CLEARS the bar (round 2).** Both round-1 CRITICALs are genuinely resolved — not papered over. The census is a real import-grounded census (spot-checks land on actual imports), its headline reconciles (110 = 43 core-api + 64 orch + 3 exec, and the per-source table sums to 110), and the tool-provider/tool-handlers split resolves C1 by moving DB work *out* of execution rather than deferring it. W1–W4 are each closed with a concrete, codebase-verified mechanism. One **new WARNING** (W5, non-blocking) surfaced: `tool-registry.ts` is simultaneously named a `tool-provider` (execution, deps=shared-only) seed *and* performs foreign-table writes the §7.5 "8 foreign-table" enumeration omits. This does not reopen C1 — it is covered in principle by "the 11 db-touching bodies DI-convert in Inc 4" — but the file's required internal split must be stated explicitly so a builder does not relocate `.insert(proposedCalls)` into an execution package. **The critique loop ends here; the plan proceeds to Increment 0.**

## Round-1 findings — resolution verified

- **C1 (tool-provider zero-DB contradiction) — RESOLVED.** Verified: `@hyperidle/shared` has **zero** `@hyperidle/db` dependency (deps = zod / @noble/hashes / github-slugger / remark-* / unified), so execution ports typing off `shared` is genuinely db-free. Production `tools/` census confirmed: **exactly 11** non-test files import `@hyperidle/db` (matches the doc's 11, refuting the round-1 "37" which counted tests). 4 of 5 named tool-provider seed files (`index.ts`, `tool-result.ts`, `assistant-tool-result.ts`, `return-status-tool.ts`) are db-free today. The thesis — descriptor/dispatch stays in execution (shared-only, tsc-provable), the DB-touching bodies relocate to an orchestration `tool-handlers` Service and DI-convert (real, scheduled Inc 4) — is sound and package-location-matches-runtime-location is a correct, non-hand-wavy justification. No "clean package / deferred behavior" middle position remains. (Caveat: W5.)
- **C2 (incomplete / self-inconsistent edge census) — RESOLVED.** The full 110-edge table (§10.2) is committed in the artifact, grouped by owning Layer, with a per-source summary (§10.1) that sums to exactly 110 and per-Layer subtotals that reconcile (core-api 43, orch 64, exec 3). Methodology is grounded, not fabricated: spot-checked `context-assembly → knowledge` (`context-assembly-prompt.ts` imports `../knowledge/role-community-map.js`), `policy → work` (`approval-rate.ts` imports `../work-service.js`, calls `work.listItemIdsBySourceAgent`), `work ⚠ session-requests` class. The round-1 "115 vs 133" impossibility is gone. Bonus: the real census surfaced 9 against-grain (core-api→orch/exec) edges with a per-edge inversion lever (§10.3) — the single most valuable output of doing it for real.
- **W1 (AC-9 route closure) — RESOLVED.** Verified `routes/threads.ts:1195` really is `tx.insert(agentWorkIntents)` inside a tx. The fix — an `AgentWorkIntentRecorder { record(tx, intent) }` port in `@hyperidle/shared`, concrete from `session-requests`, injected by the Application via `createApp(deps)` — rests on a real mechanism: `app.ts:createApp(options)` and `server-factory.ts` already thread a `Deps` bundle (`AssistantTurnDeps`, `TaskDispatcherDeps`, `dispatcherDeps`). The tx-carrying recorder preserves atomicity with the message insert and avoids the MEMORY-flagged ad-hoc-route-bypass anti-pattern (durable intent stays on the `session-requests` canonical path). Concrete, not a migration-time TBD.
- **W2 (Increment 0 not minimal) — RESOLVED.** Inc 0 is narrowed to the single real edge `context-assembly ← knowledge`; the other 4 context-assembly ports are explicit transitional stubs, and — critically — §12 step 4 states the Inc-0 package is **not swapped into the live app** (production keeps calling the in-`packages/server` context-assembly until Inc 3), so "no behavior change" holds because the stubbed ports are never on a production path. The swap-to-real plan is explicitly stated (Inc 3: "replace the Inc-0 transitional stubs with real work/users/routine/filesystems ports; swap into the live app"). No new "no-behavior-change" contradiction introduced by the stub approach — the concern I was asked to probe is closed.
- **W3 (AC-4 reinterpretation) — RESOLVED.** A prominent top-of-doc callout + §14 open item + §13 AC-4 row flag the factual contradiction, proceed with the correct table-owning classification (`session-requests`/`lifecycle-projection`), and mark the AC *wording* as needing spec-owner sign-off without unilaterally amending it. Correct handling. (Open item persists — founder must confirm the AC-4 rewording — but it blocks neither the build nor the classification.)
- **W4 (execution port type source) — RESOLVED.** §7.3 + §8 consistently source execution-side ports from `@hyperidle/shared` (verified db-free), db-keeping layers (core-api/orchestration) may type off `@hyperidle/db`, and the §7.3 db-typed example is correctly justified as an *orchestration* Service. Under the §7.5 split, `tool-provider` needs no domain row types at all — W4 is minimal in practice. No new contracts package (correctly rejected).

## New finding

### W5 (WARNING, non-blocking) — `tool-registry.ts` is named an execution seed yet holds foreign-table writes; §7.5's "8 foreign-table" is a 9-file undercount
`packages/server/src/tools/tool-registry.ts` imports `operationOutcomes, proposedCalls, tailoredGrants` from `@hyperidle/db` and performs `.insert(proposedCalls)`, `.insert(operationOutcomes)`, `.update(proposedCalls)`, `.update(tailoredGrants)` — real foreign-table Drizzle writes (execution owns zero tables, so these are foreign by definition). Yet §4 lists `tool-registry.ts` as a `tool-provider` (agent-execution, deps=shared-only) seed to be "stripped of all domain/DB imports," and §7.5's explicit foreign-table enumeration names only **8** files, excluding it. Consequences:
- The "8 files do direct foreign-table access" count should read **9** (add `tool-registry.ts`).
- `tool-registry.ts` appears in two mutually-tensioned dispositions: the tool-provider seed list (§4) and, as one of "the 11 db-touching bodies that move to `tool-handlers`" (§7.5). Unlike `assistant-draft-registry.ts` — for which §4 gives an explicit "it is a handler body → tool-handlers, not here" — `tool-registry.ts` gets no explicit split instruction. It cannot be relocated wholesale to `tool-provider`; its proposed-call / operation-outcome / tailored-grant recording must be extracted to injected handler ports (or `tool-handlers`), leaving only the dispatch shell in execution.
- **Why non-blocking:** the resolution is covered *in principle* — tool-registry is inside the counted 11 that Inc 4 DI-converts, and the mechanism (dispatch shell stays, DB bodies become injected ports) is exactly the C1 pattern. The gap is precision, not soundness: add one sentence stating `tool-registry.ts` is **split** (dispatch → `tool-provider`; `proposedCalls`/`operationOutcomes`/`tailoredGrants` recording → injected ports wired to their owning Services), and correct "8" → "9". Left unstated, a builder risks shipping an `.insert(proposedCalls)` inside a shared-only execution package (Mechanism A + B violation). Fix in the same edit that starts Increment 4; does not gate Increment 0.

## Internal-consistency checks the fixes could have broken (probed, all clean)

- **Roster count.** Adding `tool-handlers` is reflected consistently: §4 header "agent-orchestration Layer — 11 Services", the table lists 11 incl. `tool-handlers`, line 107 "31 Service packages … (Was 30; +1)", §15 "31 Services", §13 AC-4. No stale "30".
- **Stub-swap vs no-behavior-change.** Covered above (W2) — the swap plan is stated (Inc 3) and the Inc-0 package is kept off the production path, so no contradiction.
- **Edge-table `tools` unit vs the split.** §10 counts `tools` as one census unit and §469/§10.2-exec footnotes explain how those edges route post-split (10 → `tool-handlers` downward-DI; `return-status-tool → harness-registry` stays intra-execution). Consistent with §7.5.

## 9-dimension rubric (round 2)

| # | Dimension | R1 | R2 | Note |
|---|---|:--:|:--:|---|
| 1 | Spec/contract fidelity | 3.0 | 4.0 | AC-4 now correctly flagged for sign-off; tool-provider constraint honored literally. Open AC-4 wording is the only residual. |
| 2 | Boundary & mechanism integrity (A/B/C) | 2.5 | 4.0 | C1 resolved by descriptor/handler split; W1 route closure concrete. −0.5 for the W5 tool-registry split imprecision. |
| 3 | Enforcement & verification design | 4.0 | 4.5 | Guards + `--fixtures` + sanity-breaks + typecheck-gate recursion; census now real. |
| 4 | Sequencing & resumability | 3.5 | 4.5 | Inc 0 genuinely minimal (single real edge + stubs, not swapped live); Inc-3 swap stated. |
| 5 | Completeness of mandated deliverables | 2.5 | 4.5 | Full 110-edge table committed + grouped by Layer + against-grain lever table. |
| 6 | Internal consistency | 2.5 | 4.0 | 110 reconciles; file counts fixed; roster consistent. −1 residual: W5 "8"→"9" + dual disposition of tool-registry. |
| 7 | Simplicity / no over-abstraction | 4.0 | 4.0 | No ports package; `tool-handlers` is a justified extraction, not invention. |
| 8 | Naming / vocabulary | 4.5 | 4.5 | Unchanged; `Service` lock clean. |
| 9 | Honesty / self-critique | 4.5 | 4.5 | §15 candidly flags `tool-handlers`/`retention`/`realtime` as probe-worthy. |

**Overall: CLEARS (round 2).** No CRITICAL. One non-blocking WARNING (W5) to fold into the Increment-4 opening edit. The two round-1 CRITICALs — both in the Mechanism-C / execution-boundary seam the spec itself named as the novel work — are genuinely closed, verified against the real codebase, not merely internally consistent. Proceed to Increment 0.
