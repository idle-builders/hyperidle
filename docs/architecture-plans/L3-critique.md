# L3 — Architecture Critique

**Plan scored.** `docs/architecture-plans/L3.md`
**Iterations.** 1 (passed threshold on first round)
**Aggregate score.** 8.6 / 10

---

## Per-dimension scores

| # | Dimension | Score | One-line rationale |
|---|---|---|---|
| 1 | Spec alignment | 9 | All 12 ACs from TRACK-L L3 mapped with verification + failure-mode tests; founder reframe ("every output an artifact", function-agnostic, task-rooted) honored; closed view family enforced; no scope creep. |
| 2 | Layer integrity | 8 | `shared` types → `server` routes → `web` consumers respected. The `getArtifactViewProps` cross-layer concern is surfaced as ⚠️ UNVERIFIED with a concrete mitigation (lift the 5 ArtifactView shape *types* into `packages/shared/src/types/artifact-view.ts` as step 1; runtime component stays in `web`). |
| 3 | API contracts | 9 | All 5 endpoints carry method, path, query/body, response shape, status codes, auth, cache. Zod discriminated-union schemas sketched. 9 distinct error codes. Pagination cursor shape pinned. Event-bus payloads listed. |
| 4 | Data model alignment | 8 | Dual-driver SQLite + PG parity; FK `restrict` on `producing_task_id`; cursor + fetch indexes present; precision-safe money in micros; null-until-settled lifecycle reflected. Formatter contract now explicit (was implicit pre-fix). |
| 5 | Naming | 9 | `unknown_kind` token disambiguated from `other`; `tasks.artifacts` collision surfaced as CONFUSION + `@lore` + L3-FU-1; aliases-NOT-to-use (Output / File / Deliverable) listed in AC-5; `ArtifactView` (renderer) vs Artifact (primitive) explicit throughout. |
| 6 | Module depth | 8 | One canonical fetch shape serves all 4 axes; one `useArtifacts` hook; one `createArtifact` service used by harness + route. 8 DS exports for 4 layouts justified by sub-primitive composition (no per-kind components). Two PATCH endpoints justified by mutability rule. |
| 7 | Failure-mode coverage | 9 | Every AC carries an explicit failure-mode test row per CC-003. STRIDE block addresses spoofing, tampering, repudiation, info-disclosure, two DoS vectors, elevation, and immutability. Route checklist (per L7-retro PROPOSED-L7-B) lists every middleware × route × caller. Cross-tenant returns 404 (not 403). Race-safe immutability via SELECT-then-WHERE-NULL. |
| 8 | Simplicity | 8 | Closed enum chosen over open registry (with rationale); no materialised aggregation table; no GIN index until needed; rename + cursor-signing punted. The "Layer 3 — concept-doc anchor" of closed-view-family enforcement was honestly relabeled (documentation, not a third runtime defence) per critique fix. |
| 9 | Verifiability | 9 | Every AC names test files + assertions + failure modes. Protected-tests block (§12) populated with 21 tests post-fix (added the L1-forward-compat thread_count zero assertion). Route checklist covers every route × every guard. ⚠️ UNVERIFIED labels properly mark Storybook arg-toggle. |

**Aggregate.** (9 + 8 + 9 + 8 + 9 + 8 + 9 + 8 + 9) / 9 = **8.55 → rounded 8.6** / 10. Above the 7.0 threshold on iteration 1.

---

## Fixes applied to L3.md (this round)

1. **§5.5 (Event-bus integration).** Header said "Two events emitted" while listing three. Corrected to "Three events emitted" — copy-edit, but a wrong count is an integrity smell that propagates into tests.
2. **§3.3 (Cost shape).** The `ArtifactCostFromSession` API shape carries one `tokens` string while the DB stores `cost_tokens_input` + `cost_tokens_output` as separate columns. The split-to-collapse contract was implicit. Added a "Formatter contract" paragraph naming `formatArtifactCost(row)`, the null-handling rules (`money` null iff `cost_money_micros IS NULL`; `tokens` null iff BOTH token columns null), the L3 short-form rendering (`"12.4k"`, `"248"`), and the L4 transition path (the formatter is replaced; wire field names do not change). This is the most consequential fix — it pins the only place where DB columns and wire shape diverge, so the L4 adoption story has a single touch-point.
3. **§9 (Closed view family enforcement).** Layer-3 "concept-doc anchor" was framed as a defence layer alongside the export-boundary test and the eslint rule, but it has no enforcement teeth. Re-labeled as "documentation, not enforcement" — clarifies that two static checks are the real defence and the concept-doc anchor is the breadcrumb. Honest layering that future agents can rely on.
4. **§12 (Protected tests).** Added one row: `thread-count-forward-compat-zero` — explicitly asserts that, while L1 has not landed, every Artifact response returns `threadCount: 0` (numeric, never null, never missing). AC-4's L1-forward-compat path was tested via the §2 reconciliation table only; lifting it into protected-tests prevents drift when L1 lands.

---

## Unresolved concerns surfaced for /write-tests (Step 5)

- **⚠️ UNVERIFIED — Storybook CSF3 arg-toggle (Q8 / step 11).** Plan §17 flags that the `cost-pending` overlay state ships as a Storybook arg toggle, but the exact CSF3 arg shape against the local Storybook config is not verified. Step 11's tests must verify the toggle renders the populated story with cost null, OR the plan must fall back to a 5th explicit story per layout. Either is acceptable; the test author should pick at write-time.
- **⚠️ UNVERIFIED — Cross-package type-only import direction (Q4 mitigation).** Plan §10 lifts ArtifactView shape *types* into `packages/shared/src/types/artifact-view.ts` to keep `getArtifactViewProps` in shared without inverting deps. This is the right shape, but the test author should add a tsc-level assertion that no value (only type) imports cross from `web` to `shared`.
- **L3-FU-1 (`tasks.artifacts` rename).** Deferred deliberately. The `@lore name-collision` comment must land at the producer site (`packages/db/src/schema.ts:92`) and at the consumer site (`handoff-to.ts:18`) so the next agent reading either file sees the warning.
- **L1 thread-join column shape.** Plan §4.3 forward-declares `attached_host_type='artifact'` + `attached_host_id`. If L1 lands different column names, the L3 thread_count subquery in §10 Q5 needs a one-line revision; the protected test added in this critique round will catch that automatically (returning a non-zero count once L1 ships).
- **Route checklist names planned-by-L12 web pages.** §5.4 and adversary finding A6 made this explicit: at L3-merge time, the only web page consuming the routes is `ArtifactPermalink.tsx` (consuming `GET /:id`); the four axis routes are integration-tested only. /write-tests should not assume the L12 pages exist.

---

## Files written / edited

- **Edited:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L3/docs/architecture-plans/L3.md` (4 fixes — §5.5 event count, §3.3 formatter contract, §9 layer-3 honesty, §12 added L1-forward-compat protected test)
- **Written:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L3/docs/architecture-plans/L3-critique.md` (this file)

---

## What's working well

- The Plan reconciliation table (§13) row-by-row maps every concept §4.5 hard rule and every approved-design constraint to a plan section. This is the table /check-definition-of-done will lean on at the end of the story.
- The Design-it-twice section (§11) is real, not theatre — both alternatives are stated at the contract level and the costs are quantified per option (e.g. "4 cache shapes vs 1", "exhaustive type check vs runtime registry"). The "pick" lines cite verified codebase patterns.
- The CONFUSION blocks are not hedges — they pre-emptively defer scope (`tasks.artifacts` rename → L3-FU-1; `discussion` slot → option A) with the follow-up story id named, so the deferral cannot silently rot.
