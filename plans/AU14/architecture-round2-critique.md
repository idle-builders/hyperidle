# AU14 Round 2 — Architecture Critique (independent re-evaluation)

**Reviewer:** fresh independent evaluator (not the round-2 planner).
**Plan under review:** `plans/AU14/architecture-round2.md`.
**Verified against:** real code on `backend/AU14-knowledge-read-path-unification` (worktree `.worktrees/AU14`), corrected WP `TRACK-AU.md` §AU14, round-1 `architecture.md`.
**Verdict:** BLOCKED (1 CRITICAL, 2 WARNING). Zero-exclusion requirement is **structurally satisfied by the design**, but the plan under-proves the highest-risk "preserve exactly" surface and makes a demonstrably false coverage claim.

---

## What is solid (verified against real code, not the plan's prose)

- **§7 write-sequence replication — every claim accurate.** Read the real handlers (`routes/knowledge.ts` 656–1199):
  - `changeScope` W1: version+1 (line 733), `scope_change` edit-log rows with `"${scopeKind} (reason: ${reason})"` (708), projection-layer upsert (740). ✓
  - `mergeItems` W2/W3: target body-append + version+1 + updatedBy (893–901); source status=archived + updatedBy (904–911); two `merge` rows (914–934); **non-transactional**. ✓
  - `splitItem` W4/W5: N inserts status=draft/v1 inheriting scope + `upsertProjectionLayer` + **no `create` edit-log** (982–1009); original archived + one `split` row (1012–1031); **non-transactional**. ✓
  - `archiveItem` W6: **no version bump, no `updatedBy` change** — `.set({ status:"archived", updatedAt })` only (1062–1068); `archive` row editor=`item.updatedBy` (1071–1080). ✓
  - `flagItem` W7: **no version bump, no `updatedBy` change**, status→draft (1145–1148); `flag` row `"flagged (reason: …)"` (1149–1158); inside the route's `db.transaction` with `recordAgentWorkIntent` keyed `knowledge:${id}:review:${editId}` (1144–1167). ✓
- **Central risk claim (§7a) — CONFIRMED, the 5-function design is justified.** `update()` (repo 334, applied at 342–350) sets `version = existing.version+1` **unconditionally**, even when `kernelChanges` is empty; `KERNEL_EDITABLE_FIELDS` (230) contains no `scopeKind`; `create()` (197–206) always writes a `create` edit-log row and (185–194) populates `projection.scopeId`/`kind`. Delegating any of the five to `create()`/`update()` would change version, edit-log, or projection state the WP forbids. No simpler design exists — the justification does not collapse.
- **`splitItem` no-create-log / layer-only projection — verified against the real split handler**, not assumed: the loop (982–1009) inserts `knowledgeItems` + `upsertProjectionLayer` (layer only) + re-select, with zero `knowledgeEditLog` insert for new items. ✓
- **Guard file-scoping is correct, NOT residual narrowing.** 14 other server files touch `knowledgeItems` (attention-scoring/-service, relevance-service, promotion-pipeline, practice-meeting, git-export, routes/bets, routes/threads, routes/search, builtin-routine-handlers, agent-work-intent-worker, tools/create-conflict-review, tools/promote-knowledge, tools/score-attention). Spot-checked promotion-pipeline (cross-product `scopeId` signal counting) and practice-meeting (meeting-item inserts) — genuinely other domains' concerns, correctly out of AU14 per the WP's own "Out of scope: any other domain's read/write path." The repo-wide `TABLE_OWNER` map is AU8's job (WP AU8 line 621 confirms). Scoping the guard to `routes/knowledge.ts` is exactly the founder's "no exclusion **within this file**", not under-delivery.

**Zero-exclusion assessment:** the design DOES close it — all 19 reads + 7 write call sites routed to the repo, all five handlers converted (no handler carve-out survives), the `knowledgeItems` import removed, guard covers `.from`/`.insert`/`.update`/`.delete`. No residual handler-level scope narrowing survived review.

---

## CRITICAL

### C1 — Plan falsely claims archive/flag/scope exact-behavior is "fully pinned"; the highest-risk regressions are untested
§11: *"No net-new tests needed for `changeScope`/`archiveItem`/`flagItem` — their observable behavior is already fully pinned by the existing suites above."* **This is false, and it is false precisely on the behaviors §7 itself names as the reason these can't delegate to `update()`.** Verified by reading the real suites:

- **`archiveItem` "no version bump / no `updatedBy` change"** — the only archive test (`knowledge.integration.test.ts` AC8, lines 317–339) asserts **`body.status === "archived"` and a 404**. It does **not** assert version-unchanged, updatedBy-unchanged, or the `archive` edit-log row. A builder who routes `archiveItem` through any version-bumping helper (or through `update()`) **passes every existing gate** while silently bumping the version of every archived item — the exact regression §7a calls out.
- **`flagItem`** — AC9 (341–360) asserts only **`res.status === 200` and `body.id === id`**. Nothing pins status→draft, no-version-bump, no-updatedBy-change, the `flag` edit-log format, or the cross-domain single-transaction with `recordAgentWorkIntent` (the plan's own "one cross-domain subtlety," §7d). The most delicate composition in the WP has **zero** test coverage.
- **`changeScope` `editType` + exact newValue format** — `knowledge.q2.integration.test.ts` (routes/__tests__, 453–478) checks version+1, `field==="scope_kind"`, `oldValue==="user"`, `newValue` **contains** `"product"`. It does **not** assert `editType==="scope_change"` nor the exact `"${scopeKind} (reason: ${reason})"` format. `grep scope_change` across all tests returns **zero** — the `editType` value is unpinned everywhere.

This is the same class of "we thought it was covered but it wasn't" narrowing that reopened this WP twice. The plan's DoD — *"keep every existing suite green while the guard flips red→green"* — is satisfiable by a **wrong** implementation. Per CLAUDE.md First Principle and the mock-validation-trap rule, an "exact-replication" guarantee with no failing-test backing is unproven.

**Required fix:** add exact-behavior lock tests (import the repo fn, assert DB state via `{ db }`) for:
1. `archiveItem` — post-call `version` unchanged, `updatedBy` unchanged, exactly one `editType:"archive"` row.
2. `flagItem` — status→`draft`, `version` unchanged, `updatedBy` unchanged, one `editType:"flag"` row with `newValue` = `"flagged (reason: …)"`; and a route-level test for the `agentId` path proving the intent row + edit-log row commit atomically (single transaction, shared `editId`→`idempotencyKey`).
3. `changeScope` — assert `editType:"scope_change"` and the exact newValue format on the `scope_kind` row.

(Net-new tests 2 & 3 for merge/split ARE sufficient for their named risks — split test 3 directly catches the create()-delegation regression; keep them. This finding is only about the three the plan waved through.)

---

## WARNING

### W1 — Guard method-set omits joins; "any kind / no exclusion" not fully enforced against future regression
§9 matches callee `.from`/`.insert`/`.update`/`.delete` with first-arg identifier `knowledgeItems`. Today every read is `.from(knowledgeItems).leftJoin(knowledgeAppProjection…)`, so `knowledgeItems` is always the `.from` target and is caught. But a **future** read written as `.from(knowledgeAppProjection).innerJoin(knowledgeItems, …)` touches `knowledgeItems` directly and **evades** the guard entirely. Given the founder's literal *"any `db.select`/`db.insert`/`db.update` … must return zero"* and this WP's history, the guard should also match `.leftJoin`/`.innerJoin`/`.rightJoin`/`.fullJoin` with `knowledgeItems` as first arg. Cheap to add; without it the guard's "zero access of any kind" claim (§14) is stronger than what it enforces.

### W2 — §7a reasoning partly inaccurate (does not change the conclusion, but a builder may rely on the false premise)
§7a/§7 state `update()` *"bumps version and **rewrites `updatedBy`**"* unconditionally. Verified: `update()` **always** bumps version (correct, load-bearing), but `updatedBy` is only written when the caller passes it (`buildDiff` 258–262 skips `undefined`). The conclusion (can't delegate) still holds via the version bump alone, but the stated reason is imprecise. Correct the wording so the builder relies on the true invariant (unconditional version bump), not a false one.

---

## NOTE

- **N1** — The plan cites `knowledge.q2.integration.test.ts` by filename; its real path is `packages/server/src/routes/__tests__/`, not `packages/server/src/__tests__/`. Harmless, but the builder should know where the assertions live.
- **N2** — Minor line drift: §11 cites AC12 `logs.length >= 2` at "line 450"; actual is 467 (describe at 449). Plan disclaims drift — acceptable.
- **N3** — Fold the `changeScope` `editType`/format assertion (C1 item 3) into a single scope-change lock test rather than a separate net-new file; keeps the suite lean.

---

## Disposition
BLOCKED. C1 must be fixed (add the three exact-behavior lock tests; retract the false "fully pinned" claim). W1/W2 should be fixed in the same revision. On those, the plan's core architecture — 5 bespoke replication functions, `findById` for all kernel reads, route-owned events/404/409/scope-resolution, file-scoped 4-method guard — is sound and the zero-exclusion directive is genuinely met by the design.
