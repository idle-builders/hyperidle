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
