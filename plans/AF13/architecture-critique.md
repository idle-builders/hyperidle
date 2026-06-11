# Architecture Critique: AF13

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:8 N:9 MD:8 FMC:7 S:9 V:8

Repair-in-place, defect-fix workpackage. No new primitive, component, schema, or route. I verified the load-bearing claims against the real code (not the designer's summary). All structural claims hold; line numbers drift a few lines (file evolved post-plan) but every cited symbol exists.

## Claim verification (spot-checks, ✓ = confirmed against code)

| Plan claim | Verified | Reality |
|---|---|---|
| Create route honors `status` (knowledge.ts:408) | ✓ | `status: body.status ?? "draft"` at the create insert. Defect is client-side (create page never sends `status`). |
| Create page default scope = `factory` | ✓ | `SCOPE_CREATE_OPTIONS[0]` = `{label:"Shared", scopeKind:"factory"}` (scope-labels.ts:59); KnowledgeCreate:52/55 default. |
| Editability predicate at `isFactory` gate | ✓ | `isFactory` KnowledgeDetail:465; `user` from `useCurrentUser` in scope (531); `item.updatedBy` populated (apiItem map 263). |
| Dialog freezes `item.versionNum` | ✓ | `currentVersion={item.versionNum ?? 1}` (852, mount value); live `version` state at 514, bumped in `useAutoSave.onSaved` — dialog never sees it. **Real bug confirmed.** |
| Detail route omits `accessCount`/`relatedItems` | ✓ | Returns `{...item, kind, layer, confidence}` only (362-367). No accessCount, no relatedItems. |
| Hook declares both fields | ✓ | `KnowledgeItemData.accessCount?` (useKnowledgeItem.ts:35), `relatedItems?` (37). UI reads them (KnowledgeDetail:264/266 → aside:913, BacklinksCard:920). |
| `hasTeam` hardcoded false | ✓ | `const hasTeam: boolean = false;` (KnowledgeCreate:65). |
| Dialog leaks raw enums | ✓ | `SCOPE_KINDS.map` → `<option>` (ScopeChangeDialog:150). |
| Sort pills placebo | ✓ | `deriveSort`/`isKnowledgeSortOption` parse URL (62-68) but no consumer reorders; curated `groupByTopic` unsorted, triage `attentionScore`-only (805). |
| `KnowledgeSortOption` closed union | ✓ | `["relevance","recency","frequency"]` (fabric/types.ts:88). `signals.{accessCount30d,relevanceScore,attentionScore}` field names match the helper (KnowledgeList:85-89). |
| All protected tests exist | ✓ | factory/metadata/related/y4-triage/U9-pills/AD6 + knowledge.q2.integration all present. |

The "Plan reconciliation" table is honest CC-007-clean: every spec assumption was checked against reality and the gap correctly located (client vs server) in each row. This is exemplary.

## AC coverage (all six + two contracts)

| AC / contract | Plan section | Verified covered |
|---|---|---|
| Default item editable by creator | §2 (editability predicate) + §1 (status active) | ✓ task 3, 4 |
| Sort actually reorders | §3 (`sortItems`, both tabs) | ✓ task 5 |
| Scope change after edit succeeds (no 409) | §4B (live version) | ✓ task 8 |
| Triage item remains findable | §6 / task 6 (status-override map) | ✓ task 6 |
| Detail metadata real (access/related/editor/kind/topic) | §5 | ✓ task 1, 2 |
| Team scope selectable where intended | §6 (`teamId`-driven `hasTeam`) | ✓ task 9 |
| AD6/AE1 — no raw enum leak | §4A | ✓ task 7 |
| Detail returns declared fields (no placeholders) | §5 | ✓ task 1 |

All six ACs and both constraint contracts map to tasks. No scope-creep tasks. Design-it-twice present and genuine on the one non-trivial decision (triage visibility: `useFetch.refetch` rejected for cross-cutting blast radius vs localized override — not straw-manned).

## WARNING
- [§5, FMC] **Access-count timing is left as "pick one" inside a code comment, but the AC depends on it.** The detail route inserts a best-effort access-log row for the *current* read (`accessorId:"browser"`, knowledge.ts:337-349) BEFORE returning. If the count query runs after that insert, every freshly-loaded item shows `accessCount ≥ 1` from its own page-load — a placebo number, violating the "real data not placeholder" AC. The plan says "compute before insert" in §5.1 prose and risk #2, but the code sketch places the count query without pinning order relative to the existing try/catch insert. **Fix:** make the ordering a hard task requirement (count query strictly before the access-log insert) and assert it in the integration test (seed N rows, GET once, expect `accessCount === N`, not `N+1`). Currently a "decision in a comment" — promote to an explicit acceptance assertion.

- [§5.2 / design, FMC] **`relatedItems` server field vs `structuredRelatedItems` + fixture `findRelated` fallback.** The aside's `BacklinksCard` prefers `item.structuredRelatedItems` (from `apiItem.relatedItems`) and ONLY falls back to the topic-derived fixture `related` (`findRelated`, KnowledgeDetail:559) when the structured list is empty (320-328). So an empty server `relatedItems: []` will silently render fixture-derived backlinks in test envs, masking whether the server field actually populated. The plan's §5 verification ("backlinks-card renders related-item links") could pass on the fixture fallback without proving the server field works. **Fix:** the integration test must assert on the **route response** (`relatedItems.length === 1` with correct `{id,title}`), not only the rendered card — the plan does say this in §5 prose; make it the binding proof for task 1, not the component render.

- [§6, V] **Team-selectability "fix" is invisible without a positive-path test.** With `CurrentUser.teamId` absent today, `hasTeam = user?.teamId !== undefined` evaluates to `false` — behaviorally identical to the current hardcoded `false`. The plan's verification (task 9) renders with `useCurrentUser → {teamId:"t1"}` → enabled; this is the right test and MUST be present or the AC ("selectable where intended") is unproven. Keep it binding. (Also: adding `teamId?` to `CurrentUser` is flagged in sharedFiles — correct; additive optional is safe.)

## SUGGESTION
- [§4A] The default-option resolution must map BOTH `factory` AND `practice` current-scopes back to the single "Shared" option (via `scopeKindToLabel`), since `SCOPE_CREATE_OPTIONS` has only a `factory` Shared entry. Plan §4A prose handles this ("else fall to the entry whose label equals `scopeKindToLabel`"); ensure the builder doesn't introduce a phantom `practice` create option. Mirror the design-critique WARNING.
- [§3] `updatedAt.localeCompare` for recency assumes ISO-8601 (true here) — plan correctly notes it avoids the AF14 `NaN`-Date class of bug. Good. Add a `sortItems` unit-test case with two equal `updatedAt` values to lock the title tie-break, since that's the only deterministic-ordering guarantee.
- [Route checklist] Accurately states no route added/removed and only `GET /:id` body changes. Security block correctly marks rate-limit N/A (no new endpoint, existing `requireBoundary({kind:"public-data"})`), notes the new related-items query respects the user-scope visibility filter (excludes other users' private titles — verified the detail route already 404s `user`-scope items for non-owners at 328-336). SSRF/path-traversal/secrets correctly N/A. CC-003 satisfied.

## What's Working Well
- **Reconciliation discipline.** Every spec assumption is checked against grep'd reality and the defect correctly localized (client vs server) before any task is written. This is precisely what CC-007 (spec/codebase drift) exists to prevent, done proactively. I re-verified four of the riskiest rows independently and all held.
- **Minimal, seam-located fixes.** No schema migration, no new route, no symbol rename, no abstraction. Each fix lands at the exact seam the concept identifies as the contract boundary (editability rule, requested-status, live-version, response-fields). Simplicity dimension is near-perfect.
- **protectedTests list is populated and reasoned** (CC-008 clean) — including the subtle note that the factory test, if it asserts read-only for a *self-authored* factory item, encodes the bug and must be updated rather than preserved.

## Verdict
Both critiques ≥ 7. No CRITICAL findings. Three WARNINGs are all of the "make an implicit decision a binding test assertion" class — they harden verifiability of ACs that are otherwise correctly planned, not structural defects. **APPROVE** for `/write-tests`, with the three WARNING test-assertions treated as required DoD proofs (access-count excludes self-load; related-items asserted on route response; team-enabled positive path).
