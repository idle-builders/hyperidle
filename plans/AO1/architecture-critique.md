# Architecture Critique: AO1 — The Substrate primitive

**Reviewer:** evaluator (separate agent from the producer).
**Plan under review:** `plans/AO1/architecture.md` @ commit `5fc7fb17`.
**Locked input:** `plans/AO/concept.md` + `plans/AO/research-substrate-vs-tool.md` + `TRACK-AO.md` (AO1 ACs, AO2 consumer).
**Method:** every load-bearing claim reconciled against actual code on this branch (worktree AO0, base `origin/main`), not the plan's prose.

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:9 DM:5 N:8 MD:8 FMC:7 S:8 V:8

**Verdict: NEEDS-REVISION (one CRITICAL).** The plan is structurally excellent — well-reconciled, honest about its seams, correctly scoped, faithful to the locked concept on every invariant EXCEPT one. The single blocker is the `agent_member_id` FK target (open question Q1), which the plan resolves the wrong way and which silently diverges from the concept + breaks the AO2 materialization seam. Fix Q1 → this is an 8+ and ready to build. Everything else is WARNING/SUGGESTION.

---

## Code reconciliation (what I actually verified)

| Plan claim | Verified? | Evidence |
|---|---|---|
| `teams.id` PK, `text` | ✅ | schema.ts:17-18 |
| `team_members` = membership GROUP, `{id, teamId, members, leadAgentId, capacity…}` | ✅ | schema.ts:100-117 |
| `team_members` is **one row per team** (U1 1:1 invariant) | ✅ | schema.ts:97-99 `@lore U1: one teamMembers row per teams row` |
| Individual agent = a `users` row; `users.teamId → team_members.id` | ✅ | schema.ts:47 |
| **`sessions.agentId → users.id`** (the runtime agent identity) | ✅ | schema.ts:252-254 — **decisive for Q1; the plan did not cite this** |
| `artifacts` has NO substrate columns | ✅ | schema.ts:848-865 — `{id, producingTaskId, kind, label, previewJson, createdAt}` |
| `service_connections` ABSENT on this branch | ✅ (with caveat) | No def in schema.ts/index.ts. BUT it existed (migration 0036) and was **DROPPED in 0038** (`DROP TABLE "service_connections" CASCADE`). Plan's "AN unmerged" framing is imprecise — see WARNING-2. |
| Migration tail = `0038_skinny_argent`; journal idx 38 | ✅ | `_journal.json`; next = `0039` correct |
| `GitRunner` export-only — NO clone/fetch/checkout | ✅ | git-export-runner.ts:18-41; grep for clone/fetch/checkout = zero hits |
| AO2 hook: spawn @463, assembleContext @488 | ✅ (≈) | `workspace.spawn` @463; `strategy.assembleContext` @488 (plan said @487 — off-by-one, immaterial) |
| AO2 hook: capture-back after endSession before destroy | ✅ (≈) | normal path: `endSession` @1117, `workspace.destroy` @1122. Plan also correctly notes the crash paths (`@1060/@1062` budget, `@1102/@1104` not-returned) need capture-back too |
| Route pattern `createXRoutes(db, eventBus)` + `requireBoundary({kind:"public-data"})` + `validateBody` | ✅ | artifacts.ts:156-159, 295-299; validate.ts |

**Reconciliation grade: A.** No spec/codebase drift (CC-007 clean). The plan's reconciliation table is accurate to the line. The one place it under-cited is the very place it got the answer wrong (Q1): it cited `users.teamId → team_members.id` but not `sessions.agentId → users.id`, which is the runtime fact that settles Q1.

---

## CRITICAL

### CRIT-1 — [§Phase 0·Q2, §2 schema, §11·Q1] `agent_member_id` targets `team_members.id` — wrong. Must target `users.id`.

The plan attaches a substrate to `team_members.id` (the membership GROUP) and reasons: "honor the canonical name literally; `team_members` = the team's membership group, so this means team-level-or-the-group." This is a **silent divergence from the concept and a break in the AO2 seam.** Evidence:

1. **`team_members` is one row per team** (schema.ts:97-99, U1 1:1 invariant). So `agent_member_id → team_members.id` is functionally identical to `team_id → teams.id` — it carries **zero per-agent information**. The "primary attachment to an agent-within-a-team" column degenerates into a duplicate of the team scope. Every agent in the team resolves to the same `agent_member_id`. The column cannot distinguish "agent A's repo" from "agent B's repo."

2. **The runtime agent identity is `users.id`, not `team_members.id`.** `sessions.agentId → users.id` (schema.ts:252-254). AO2's materialization (§5, Phase 4.5) resolves "the unit-of-work's bound substrate(s)" inside a session that runs as a specific `agentId` (`users.id`). With the attachment keyed to `team_members.id`, AO2 **cannot ask "which substrate is bound to THIS agent"** — the only join it has, `agentId`, points at `users`, and the substrate row points at the group. The seam the plan is proudest of (§5) does not actually close.

3. **The concept means the individual agent.** Concept Phase 1: "attached to an **agent within a team**"; Phase 4 cardinality: "`agent-in-team 1 — 0..N Substrate`… attaches to **one agent-within-a-team** or is shared at the **Team** level." Two distinct levels: individual-agent attachment AND team-shared. The plan collapses both onto `team_members.id`, losing the individual level entirely. AC1 ("An agent within a team can be attached to a substrate") is then only superficially satisfiable — you can write a row, but you can't bind it to one agent.

4. **The producer's own Q1 flags the contradiction honestly but resolves it backwards.** It treats the canonical-shapes *column name* (`agentMemberId`) as load-bearing and the *semantics* as negotiable. That is inverted: the concept's semantics ("an agent within a team," cardinality `agent-in-team 1—0..N`) are LOCKED; a column *name* in canonical-shapes is a label that should be corrected to match. The plan's fallback ("add `agent_user_id → users.id` later as additive") concedes the right answer while shipping the wrong one first — guaranteeing a second migration and a confusing dead `agent_member_id` column.

**Fix.** Target the individual agent:
```
agentUserId: text("agent_user_id").references(() => users.id, { onDelete: "cascade" })   // null → team-level (shared)
```
Keep `team_id → teams.id` as the always-present scope (correct as-is). Drop `agent_member_id` entirely (do not ship both). Two attachment levels fall out naturally: `agent_user_id` non-null = bound to one agent; `agent_user_id` null = team-shared. AO2 then resolves by `WHERE team_id = ? AND (agent_user_id = :sessionAgentId OR agent_user_id IS NULL)` — exactly the concept's "attached to one agent-within-a-team **or** shared at the Team level." Rename the index `substrates_agent_user_idx`. Update the wire type `Substrate.agentMemberId` → `agentUserId`.

**This is a one-line concept/canonical-shapes correction, not a re-open.** `docs/process-layer/canonical-shapes.md §Substrate` should rename `agentMemberId → teamMembers.id` to `agentUserId → users.id`. That is the cheapest reconciliation and it is the correct one. The plan even says so in Q1's last sentence — it just shipped the other branch.

---

## WARNING

### WARN-1 — [§Phase 1 table, §4·"AN unmerged"] `service_connections` was reverted, not never-merged — the seam reasoning is sound but the premise is stated wrong.

The plan repeatedly says the table "does not exist on `main` (AN unmerged)." Actual history: `service_connections` was created in migration `0036_bizarre_leopardon.sql` and **dropped in `0038_skinny_argent.sql`** (`DROP TABLE "service_connections" CASCADE`). It was merged then **deliberately reverted** (consistent with MEMORY: Track AN reset, PR #364 — broker/registry dropped). This does not change the §3·B decision (plain `text` column, not an FK — still correct, since the target is genuinely absent now), but it matters because: (a) a future AN re-merge may bring back a *different* shape than 0036's, so the `SubstrateAuthResolver` seam must not assume 0036's columns; (b) the plan's confidence that "AN may add the FK in its own migration" should account for the fact AN's schema is itself unsettled (it has already churned once). **Fix:** restate the premise as "AN's connection table was reverted (0038) and its re-merged shape is not yet settled — therefore reference by opaque id through the resolver seam, never by FK or column assumption." Strengthens, not weakens, Alt-2.

### WARN-2 — [§3 route-checklist, §Phase 2 AC table] PATCH route exists in the plan but no AC exercises it; create-time `kind` constraint vs read-time openness not tested at the boundary it matters.

`PATCH /api/substrates/:id` is in the route-checklist (§3) and is real surface, but no acceptance criterion in §Phase 2 covers it — AC1/AC6 cover POST/GET/DELETE, none covers PATCH. Per the rubric (happy-path completeness / verifiability), an untested mutation route is a gap. Either (a) add a PATCH verification row (e.g. "PATCH branch → GET reflects new branch; PATCH cannot change `teamId`"), or (b) if PATCH is not required by any AC, cut it from AO1 scope (the ACs only require attach/inspect/list/detach + reachability — PATCH is arguably scope-creep; see SUGG-1). Pick one; do not ship an untested route.

### WARN-3 — [§3 reachability, AC5] The `needs_attention` semantics under the default `NoopAuthResolver` will mark **every** connection-backed substrate as needs-attention until AN re-merges — verify this is the intended v1 surface, not a permanently-red state.

`resolveSubstrateState` returns `needs_attention` for any `code`+`writeback:'git'`+`connectionId` substrate because the shipped `NoopAuthResolver.canResolve` always returns false (§4). With AN reverted (WARN-1) and no resolver registered, **the only substrates that can ever show `reachable` are bare-local ones** (`connectionId` null) or `writeback:'none'`. That is concept-correct ("surface, never silent" — hard rule 7) and the plan states it, but it means AC5's "inverse: present connection → `reachable`" branch is **only testable with an injected fake resolver**, never with the real default binding. That's fine for the integration test (AC5 explicitly injects a fake), but flag it loudly in the plan as a known v1 limitation so AO2/the founder don't read a forge-backed substrate's permanent `needs_attention` as a bug. **Fix:** add one sentence to §3 making the "no real resolver on main → all connection-backed substrates are needs_attention until AN lands" state explicit and intended.

### WARN-4 — [§2] `Substrate` name collision resolved by splitting into `Substrate` (wire) + `SubstrateRow` (DB) — correct, but the §1 snippet still declares `export interface Substrate` in shared AND the §2 prose says "two distinct types, one named `Substrate` in each package." Tighten so the builder doesn't ship two `Substrate` types.

The plan first writes `export interface Substrate` in `@hyperidle/shared` (§1), then in §2 corrects the DB select type to `SubstrateRow` while one sentence still reads "one named `Substrate` in each package — acceptable (mirrors `Artifact`/`ArtifactRow`)." Verified against code: db/index.ts:28 exports `type ArtifactRow` (NOT `Artifact`) — so the actual precedent is `ArtifactRow` (db) + `Artifact` (shared), exactly one `Substrate`-named type total. The plan's §2 "Correction to the snippet" gets this right (`SubstrateRow` in db). **Fix:** delete the contradicting "one named `Substrate` in each package" sentence; state unambiguously: shared exports `Substrate` (wire, parsed `resourceRef`); db exports `SubstrateRow`/`NewSubstrate` (row, `resourceRef: string`). This is a clarity fix, low-risk.

---

## SUGGESTION

### SUGG-1 — [§3] PATCH and `GET (list)` may be scope-creep relative to the ACs. AO1's ACs require: attach (POST), inspect (GET :id), detach (DELETE), reachability (GET surfaces state), distinctness, types, migration. Neither PATCH nor list is named by an AC. The list route is defensible (inspect-a-team's-substrates is implied by AC1's "visible"), but PATCH ("update branch/writeback/connection") maps to no AC and no validation scenario. Either justify PATCH against a concrete AC line or defer it. The rubric penalizes plan tasks that don't trace to an AC — currently 5 routes for ~4 AC-mandated operations.

### SUGG-2 — [§7 security] Rate-limit N/A is correctly reasoned (ETHOS anti-enterprise; same posture as artifacts/bets POSTs). Good. The `branch`/`repo` input-trust handling correctly punts traversal/SSRF to AO2 (AO1 only *stores*, never *executes*) — that boundary split is exactly right and well-stated. No change needed; calling out as a model for future plans.

### SUGG-3 — [§5] The §5 hook-point doc cites `endSession @1117 / destroy @1122` for capture-back but the budget-exhausted (@1060/@1062) and not-returned (@1102/@1104) paths ALSO destroy the sandbox. The plan does say "crash/budget paths capture-back too if a working tree exists" — good — but the line citations only point at the happy path. When AO2 builds this, give it all three (endSession/destroy) pairs so capture-back isn't silently skipped on budget-exhaustion (the most common real failure). Pure forward-note for AO2; not an AO1 deliverable.

---

## Adjudication of the producer's 6 open questions

**Q1 — `agent_member_id` FK target.** **VERDICT: target `users.id` (rename to `agent_user_id`). The plan's choice (`team_members.id`) is wrong.** See CRIT-1. "An agent within a team" = the individual agent = a `users` row (`sessions.agentId → users.id`, schema.ts:252). `team_members` is one row per team (U1 1:1), so targeting it carries no per-agent identity and breaks AO2's per-agent materialization. The canonical-shapes column *name* is a label to correct, not a contract to preserve over the locked concept semantics. Drop `agent_member_id`; ship `agent_user_id → users.id` (nullable; null = team-shared). One-line canonical-shapes correction, not a concept re-open.

**Q2 — v1 reachability is structural, not a live forge round-trip.** **VERDICT: structural is correct for AO1. Upheld.** AO1 must not hold forge creds (concept hard rule 1; creds live in the sandbox, AO2). A live `git ls-remote` at attach-time would require AO1 to reach for the very credentials the concept forbids it from holding. Structural reachability (does the referenced Connection resolve to an auth handle) is the right v1 boundary and satisfies "surface, never silent." Live reachability is an AO2/runtime concern. No change. (See WARN-3 for the one disclosure to add.)

**Q3 — `doc_set` folder source for v1 is realistically a bare local folder.** **VERDICT: acceptable. Upheld.** AC3 only requires the *kind is recorded* to prove the primitive isn't code-only ("prove generality without a sync engine"). A local-folder `doc_set` (`connectionId` null, `writeback:'file'`) satisfies that. The seam already models a connection-backed `doc_set`; it's just unexercised until a folder-providing Connection exists. Concept-faithful (substrate is local-first, hard rule 5). No change.

**Q4 — `connection_id` is a non-FK text column.** **VERDICT: correct. Upheld, with WARN-1 caveat.** The target table is genuinely absent on this branch (dropped in 0038), so a real FK won't migrate, and coupling AO1's migration to AN's is exactly the dependency the spec forbids. The integrity gap (orphan `connection_id`) is surfaced as `needs_attention` (AC5) — "the gap is the feature." Decoupling beats blocking AO1 on AN. Only fix: restate the premise (reverted, not never-merged) per WARN-1, and don't assume AN's re-merged shape.

**Q5 — `Substrate` (wire) vs `SubstrateRow` (DB) split.** **VERDICT: split is correct and clearer. Upheld.** Mirrors the real codebase precedent (`ArtifactRow` in db, `Artifact` in shared — verified db/index.ts:28). A single type with `resourceRef: string` would force every consumer to parse, and a single type with parsed `ResourceRef` would lie about the DB row. Two types is honest. Only fix: the WARN-4 wording cleanup so exactly one `Substrate`-named type ships.

**Q6 — AO2 inbound-git: extend `GitRunner` vs sibling.** **VERDICT: extend `GitRunner`. Upheld — this is the right recommendation.** Verified `GitRunner` is export-only (git-export-runner.ts:18-41) and its `buildGitEnv`/redaction/`GIT_TERMINAL_PROMPT=0` env-hardening is exactly what an inbound authenticated clone needs; a sibling would duplicate ~120 lines of security-critical env code. The plan correctly flags the catch: the current env fails closed on auth (`GIT_ASKPASS=/bin/false`), so an authenticated inbound clone must apply the `SubstrateAuth.provision` directive (credential helper / `GH_TOKEN`). That wiring is AO2's, riding the seam. Recording it now for seam coherence is exactly right. Not an AO1 deliverable. No change. (One refinement: when AO2 adds `clone`, it must NOT loosen the export path's fail-closed default for all callers — gate the auth-applied env to the inbound verbs only. Forward-note for AO2.)

---

## Spec-alignment audit (concept invariants + ACs)

| Invariant / AC | Honored? | Note |
|---|---|---|
| SoRs (inbox/CRM/ticket) excluded at the boundary | ✅ | Open `kind` vocab, create constrained to `SUBSTRATE_KINDS = [code, doc_set]`; negative test on `inbox` → 400 (AC3). Faithful to the decision rule. |
| No secret on the row; auth provisioned INTO sandbox (not withheld) | ✅ | Row has no credential column (AC2 asserts `Object.keys(row)` has none); `SubstrateAuth` is a handle resolved to AO2, provisioned into the sandbox; §4 explicitly rejects withholding/broker-only (concept hard rule 1, PR #364). Correct — this is the post-AN-reset model. |
| Write-back rides the host (no custom sync engine) | ✅ | §5: `git`→commit (push/PR is AL7 landing, not captureBack); `file`→last-write-wins + snapshot; `none`→no-op. No OT/CRDT/two-way diff. Concept hard rule + research-faithful. |
| Attachment is to an agent-in-team | ❌ | **CRIT-1.** Plan targets `team_members.id` (group), not the individual agent (`users.id`). Only divergence — but it's the load-bearing one. |
| Distinct from knowledge-export / knowledge-item (no overwrite) | ✅ | New table, no ALTER on artifacts/knowledge_items/server_config; AC4 asserts rowcount + export config unchanged. |
| Local-first (functions with no forge) | ✅ | `connectionId` null → `reachable`; bare-local git repo / folder supported. |
| Unreachable → needs_attention, never silent | ✅ | AC5; structural check transitions + persists state. |
| Forward-only migration | ✅ | `0039_AO1_substrates.sql`, no down-migration; correct next index. |

**Seven of eight concept invariants honored faithfully. The eighth (CRIT-1) is the blocker.**

---

## What's working well

- **Reconciliation discipline (CC-007 clean).** Every symbol the plan references was verified against code and the table is accurate to the line — including correctly identifying that `artifacts` has no substrate columns and that `GitRunner` is export-only. This is the standard.
- **Seam design is genuinely good.** The `SubstrateAuthResolver` / `SubstrateMaterializer` split (AO1 owns the types, AO2 implements; `canResolve` for cheap reachability vs `resolve` for full provisioning) lets AO1 ship without AN and without forge creds, exactly as the concept demands. The "plain text `connection_id` + reachability-surfaces-the-orphan" decision turns the integrity gap into the feature — that's the right instinct.
- **Security boundary split is exemplary.** AO1 *stores* paths/URLs but never *executes* them; traversal/SSRF correctly punted to AO2 where the sandbox actually resolves them. Marked applicable+addressed or N/A-with-reason on every STRIDE vector. No preemptive gating (ETHOS-faithful).
- **Design-it-twice is real, not theatre.** Both §3·A (JSON-in-text vs split columns) and §3·B (FK vs plain ref) have a genuinely-considered loser with a concrete reject reason grounded in the open-vocab contract and the absent AN table — not a straw man.
