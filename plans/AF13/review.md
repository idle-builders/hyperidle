# AF13 — Phase 4 Code Review (Reviewer)

## RE-REVIEW (after builder fixes) — Verdict: DONE

Builder applied all four findings. Verified against live `origin/main...HEAD`, not the summary. Independently re-ran all gates: `npm run check` PASS (12/12), `npm run lint` exit 0 (warnings only, zero errors), `npm run test` 405 files / **4197** passed (was 4195; +2 new dialog tests), `npm run test:integration` 225 files passed / 1 skipped (pre-existing) / 2707 tests passed.

| Prior finding | Fix verified | Evidence |
|---|---|---|
| MEDIUM — curated rows mouse-only orphan `<li>` | FIXED | `KnowledgeListRow` restored to `<li><button type="button" onClick>` — real focusable, Enter/Space-activatable (WCAG 2.1.1 met). `KnowledgeTopicGroup` children wrapper `<div>`→`<ul className="list-none m-0 p-0">` (KnowledgeTopicGroup.tsx 83-85) → `<li>` has valid list parent, no orphan, valid `listitem` role. Sort-pill test queries re-scoped to `within(getByTestId("knowledge-sort-bar"))` (KnowledgeList.af13.test.tsx 131-132,182-183,239-240). Reorder assertions byte-unchanged (`newestIdx<middleIdx<oldestIdx`; `high<low<no`) — sort still genuinely exercised, NOT weakened. No new a11y regression from `<ul>`. |
| LOW — ScopeChangeDialog Team option ungated | FIXED | `hasTeam = user?.teamId !== undefined` (ScopeChangeDialog.tsx 91); `<option disabled={isTeamOption && !hasTeam}>`. Parity with KnowledgeCreate. 2 new tests on the real dialog: disabled w/o teamId (KnowledgeDetail.af13.test.tsx 361-388), enabled w/ teamId (390-417) — assert actual `option.disabled` state, not file-grep. |
| LOW (slop) — test-mechanics commentary in row JSX | FIXED (row) | Row commentary trimmed to one accurate DOM-choice line (KnowledgeList.tsx 411-412). |
| NIT — `optimisticStatuses` Map value type | FIXED | Narrowed to `Map<string, "active" \| "archived">` (KnowledgeList.tsx 841). |

### Residual (non-blocking, carryover NIT)
Sort-pill block (KnowledgeList.tsx 631-651) still carries test-coupled commentary explaining `getByRole("button")`/`aria-checked` query behavior, and the pills keep `aria-checked` on a roleless `<button>` (invalid ARIA, AT-ignored, kept only for the U9 `[aria-checked='true']` query). This block predates the four fixes (introduced in the §3 commit) and was already accepted in the original review as "a sound a11y change for the sort pills specifically." Not a regression introduced by the fix. Recommend a future cleanup: switch U9's selector to `aria-pressed` and drop the duplicate `aria-checked` + the query-mechanics comments. Does not block DONE.

No regression to previously-passing ACs or protected invariants: agent-authored factory items still read-only; U9/AD6 scope-pill tests unmodified and green against the changed components; no schema/migration/out-of-scope surface touched.

**All 8 ACs PASS. Verdict: DONE.**

---

## Original Phase 4 review (superseded by re-review above)

**Verdict: NOT DONE** — one MEDIUM accessibility/semantics regression introduced in the green phase (curated rows downgraded `<button>` → orphan `<li>`, keyboard access lost) plus one LOW plan-deviation. All ACs are functionally proven and all 4195 unit + 178 knowledge integration tests pass, but a keyboard-accessible production control was demoted to mouse-only to satisfy a test query. That is exactly the green-phase failure mode review exists to catch. Fix is small and localized.

Live diff reviewed against `origin/main...HEAD`. Independently ran: `npm run check` PASS (12/12 packages), `npm run lint` exit 0 (warnings only, no errors), `npm run test` 405 files / 4195 tests passed, `npm run test:integration -- knowledge.af13` 10/10 passed, full knowledge integration 11 files / 178 passed.

---

## AC table

| AC / Validation scenario | Code | Test proving it | Status |
|---|---|---|---|
| Default item editable by creator | `KnowledgeDetail.tsx` `isReadOnly = isFactory && !isSelfAuthoredFactory` (533-543); `KnowledgeCreate.tsx` `status:"active"` (84) | `KnowledgeDetail.af13.test.tsx` §2 self-authored → Edit present (118); `KnowledgeCreate.af13.test.tsx` §1 payload `status:active` (98-104) | PASS |
| Sort actually reorders | `sortItems` helper (KnowledgeList.tsx 62-95); wired into curated groups (632-+) and triage (889) | `sortItems.test.ts` (per-option + tie-break); `KnowledgeList.af13.test.tsx` recency/frequency row-order in curated + triage (97-249) | PASS |
| Scope change after edit, no spurious 409 | `KnowledgeDetail.tsx` passes live `version` state to dialog (pre-existing wiring; `currentVersion={version}`) | `knowledge.q2.integration.test.ts` scope-version semantics (178 knowledge integ green) | PASS |
| Triage item remains findable (no vanish) | `optimisticStatuses: Map<id,status>` override applied before split (KnowledgeList.tsx 837-+, 857-+) | `KnowledgeList.af13.test.tsx` §6 validate→curated same render (305-332); reject→not curated (334-374); failure-revert (376-408) | PASS |
| Detail metadata real (access/related/editor/kind/topic) | `knowledge.ts` detail route adds `accessCount` (count BEFORE insert) + `relatedItems` (354-410); `KnowledgeDetail.tsx` kind `?? "—"` (878) | `knowledge.af13.integration.test.ts` accessCount===N not N+1 (125), ===0 (145), 30-day window (162); relatedItems route-response shape/cap/scope (179-322); `KnowledgeDetail.af13.test.tsx` kind "—" (229) | PASS |
| Team scope selectable where intended | `KnowledgeCreate.tsx` `hasTeam = user?.teamId !== undefined` (66); `useCurrentUser.ts` `teamId?` wired from API | `KnowledgeCreate.af13.test.tsx` §6 ENABLED with teamId (144), DISABLED without (174), tooltip (194), click-selects (224) | PASS (create surface) |
| AD6/AE1 — no raw scope-kind enum leak | `ScopeChangeDialog.tsx` 3 labeled `SCOPE_CREATE_OPTIONS` (184-188); `resolveDefaultOption` maps factory+practice→Shared (71-77) | `KnowledgeDetail.af13.test.tsx` §4A exactly 3 options, no factory/practice/bet/task (272-283); factory→Shared (322), practice→Shared no phantom (342-348) | PASS |
| Detail returns declared fields (no placeholders) | detail route now returns every `KnowledgeItemData` field; honest computed `0` / `[]` | integration relatedItems `[]` for no-topic (321) + accessCount `0` (145) | PASS |

All eight rows are functionally proven by behavior-asserting tests (not file-grep). No AC is unproven.

---

## Highest-risk item: green-phase test edits — VERDICT: LEGITIMATE

Commit `35abacfd` edited 3 test files. I read the full diff and the resulting files. The claim ("vi.mock hoisting contradictions") is **true**, and **no assertion was weakened or gutted**.

- **Root cause is real.** `vi.mock()` is hoisted to module top regardless of being written inside `beforeEach`/`it`. The original red-phase tests wrote multiple `vi.mock("../hooks/useCurrentUser.js", ...)` factories in different `describe`/`beforeEach` blocks of one file. Hoisting collapses these to **last-factory-wins for the whole file** — so the §6 ENABLED test (needs `teamId`) and DISABLED test (needs no `teamId`) would have shared a single mock and one of them was structurally guaranteed to be testing the wrong state. That is a genuine structural test bug, not a convenience.
- **Fix is the canonical pattern.** Single file-level `vi.mock(path, () => ({ fn: vi.fn() }))` + per-test `vi.mocked(fn).mockReturnValue(...)`. Standard, correct.
- **Assertions are byte-for-byte preserved.** I diffed the bodies: §6 ENABLED still `expect(teamPill).not.toBeDisabled()`; DISABLED still `expect(teamPill).toBeDisabled()`; §2 self still `getByRole("button",{name:/edit/i})` present; §2 agent still `queryByRole(...).not.toBeInTheDocument()`. Only the mock-wiring mechanism changed.
- **`sortItems.test.ts` change** is removal of a single `@ts-expect-error` whose comment explicitly said "remove in green phase once exported." Correct — `sortItems` is now exported.

Conclusion: the test edits fixed real structural bugs and did **not** falsify the green. This is not the failure mode; it was correctly handled.

---

## The 3 WARNING DoD proofs — ALL HOLD

1. **Access-count is N not N+1.** Route counts `knowledgeAccessLog` STRICTLY BEFORE the best-effort insert (knowledge.ts 354-368, insert at 372+). `@lore` documents the ordering. Integration test asserts `accessCount === 3` with 3 seeded rows after one GET (not 4) — binding. PASS.
2. **`relatedItems` proven on the ROUTE response.** `knowledge.af13.integration.test.ts` asserts on `body.relatedItems` JSON (length, `{id,title}`, self-exclusion, user-scope filter, cap-10, null-topic→[]) — not the fixture-fallback card render. The masking risk from critique WARNING 2 is closed. PASS.
3. **Team-pill positive path asserted.** `KnowledgeCreate.af13.test.tsx` renders `useCurrentUser → {teamId:"t1"}` and asserts the pill is NOT disabled — the data-driven flip is proven, not just the (identical-to-old) negative path. PASS.

---

## AD6/AE1 constraint — SATISFIED

`ScopeChangeDialog` select renders exactly the 3 labeled options. `resolveDefaultOption` maps both `factory` and `practice` to "Shared" via `scopeKindToLabel` — no phantom `practice` option. Test asserts exactly 3 options and explicitly `not.toContain("factory"/"practice"/"bet"/"task"/"product")`. SUGGESTION from the critique is honored.

## Out-of-scope discipline — CLEAN

No schema/migration changes (`git diff --name-only` shows none). No `knowledge_relations` table — related items are topic-derived in the query. No merge/split UI. No fabric/relevance/FTS mechanics (sort orders by existing signals only). The only grep hits for merge/split/fabric are in plan/design `.md` docs, not production code.

## Protected invariants — INTACT

- Agent-authored factory items stay read-only: `isReadOnly = isFactory && updatedBy !== user.id`; §2 agent test asserts no Edit button. PASS.
- U9/AD6 scope-pills tests were **not modified** (empty diff) and still pass against the changed component. The U9 sort-pill test only asserts `[aria-checked='true']` exists in the sort bar — the builder kept `aria-checked={isActive}` alongside the new `aria-pressed`, so the test passes meaningfully (it is not a rename-around-broken-test). Dropping `role="radio"` while keeping `aria-checked` is a sound a11y change for the **sort pills** specifically.

---

## Findings

### MEDIUM — Curated rows downgraded from accessible `<button>` to orphan `<li>`; keyboard access lost (a11y + invalid HTML)
`KnowledgeList.tsx` `KnowledgeListRow` (421-468). The green phase changed the curated row from `<button type="button">` to `<li onClick=...>` purely so `getAllByRole("listitem")` works and so item titles containing "Frequency" stop matching `getByRole("button",{name:/frequency/i})`. Two real regressions result:

1. **Keyboard inaccessible.** The old `<button>` was focusable + Enter/Space-activatable. The new `<li>` has `onClick` only — no `tabIndex`, no `onKeyDown`. The `biome-ignore` and `@lore` comment claim "keyboard access handled by parent list" — **this is false for the curated path.** The keyboard handler (KnowledgeList.tsx 515/531) is scoped to the **triage** view only; `KnowledgeTopicGroup` (the curated parent) renders children into a plain `<div className="flex flex-col">` (KnowledgeTopicGroup.tsx 83-84) with no roving focus or key handling. Curated knowledge rows are now mouse-only — a WCAG 2.1.1 regression on a core surface.
2. **Invalid markup / unreliable role.** The curated `<li>` is **not inside a `<ul>`/`<ol>`** (the triage view wraps in `<ul>` at 694; the curated `KnowledgeTopicGroup` does not). Orphan `<li>` in a `<div>` is invalid HTML; jsdom still grants the implicit `listitem` role (so the test passes) but real browser AT exposure of `listitem` for an orphan `<li>` is not guaranteed.

Root issue: production accessibility was sacrificed to a test-query convenience. The correct fix is to keep the row a `<button>` (or an `<li><button></li>` for the curated group) and disambiguate the test query instead — e.g. `getByRole("button",{name:"Recency"})` with an exact/`{exact:true}` name, or query the sort pills by `within(screen.getByTestId("knowledge-sort-bar"))`. Both AF13 list tests already have the sort bar testid available.

**Builder must:** restore keyboard activation for curated rows (revert to `<button>`, or add `tabIndex={0}` + `onKeyDown` Enter/Space to the `<li>` AND wrap curated rows in a `<ul>` so the `listitem` role is valid), and fix the affected test queries to scope to the sort bar rather than relying on the row being a non-button. Re-run `KnowledgeList.af13.test.tsx`, `U9-knowledge-scope-pills.test.tsx`, `AD6-knowledge-simplification.test.tsx`.

### LOW — `ScopeChangeDialog` Team option not gated by `hasTeam` (plan §6 deviation)
Plan §6 / task 9 says: "Apply the same `hasTeam` gate to the Team option in `ScopeChangeDialog` so the two surfaces agree." The dialog renders all 3 options ungated (ScopeChangeDialog.tsx 184-188). A teamless user can select Team here; the server will reject (team scope needs membership/scopeId), so it is not exploitable — but the two surfaces disagree, contradicting the plan and the spirit of the "selectable where intended" AC. Not AC-blocking (the primary create surface is correctly data-driven and tested). Recommend gating the Team `<option>` (disable or omit when `!hasTeam`) for parity, or explicitly note the deviation. No test currently covers the dialog Team-gating, so this is silently uncovered.

### LOW (slop) — Production component carrying test-mechanics commentary
`KnowledgeListRow` now has ~10 lines of `@lore`/comment explaining *why a Testing Library query behaves a certain way* (411-420). Comments that document test-query internals inside production JSX are an AI-slop tell and a coupling smell — the production component should not know or explain how its tests query it. If the MEDIUM finding is fixed by correcting the test queries, most of this commentary disappears. Trim to a single line about the actual DOM choice.

### NIT — `optimisticStatuses` typed `Map<string, string>` rather than `Map<string,"active"|"archived">`
KnowledgeList.tsx 837+. The plan specified the narrowed union. `string` works (the override is later read as `status`) but loses the type guarantee the plan called for. Low value; mention only.

---

## Lint / lib warnings (informational, not blocking)
`npm run lint` exits 0. Pre-existing warning classes unchanged in character. The new `<li onClick>` contributes to `a11y/useKeyWithClickEvents` and `a11y/noStaticElementInteractions` (suppressed via biome-ignore) — fixing the MEDIUM finding removes those suppressions, which is the better outcome than carrying them.

## Docs skip — REASONABLE
No user-facing docs written. The workpackage is a defect-fix that restores intended behavior of existing surfaces (editability, sort, scope dialog, metadata) — it introduces no new concept, primitive, or noun. The user guide already documents knowledge authoring as if these controls worked. Skip is justified; no doc gap created.

---

## Summary for builder (to reach DONE)
1. **(MEDIUM, required)** Restore keyboard accessibility to curated rows: revert to a focusable activatable control (`<button>`, or `<li>` wrapped in `<ul>` with `tabIndex`/`onKeyDown`), and fix `KnowledgeList.af13.test.tsx` sort-pill queries to scope to `knowledge-sort-bar` instead of forcing the row out of the button role. Confirm U9/AD6/y4-triage stay green.
2. **(LOW, recommended)** Gate the `ScopeChangeDialog` Team option by `hasTeam` for parity with create (plan §6), add a covering assertion.
3. **(LOW, recommended)** Trim test-mechanics comments from `KnowledgeListRow`.
4. **(NIT)** Narrow `optimisticStatuses` value type to `"active" | "archived"`.

Re-run `npm run check && npm run lint && npm run test` + AF13 integration after the fix.
