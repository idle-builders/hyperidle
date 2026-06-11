# Design Critique: AF13 — Knowledge authoring and curation that works

DESIGN-CRITIQUE: variant=repair-in-place score=8/10  rounds=1  axes: H:n/a S:n/a T:n/a C:n/a Co:9 St:8 A:n/a AS:n/a PP:n/a

**Nature of this critique.** Routine, repair-in-place. No new component, no new shape, no pixel change. The HTML mockups (`knowledge-list.html`, `knowledge-detail.html`, `knowledge-edit.html`) remain the visual truth and are untouched. The 9-dimension *visual* rubric (hierarchy, spacing, typography, color, anti-slop, premium polish) is therefore N/A — there is nothing new to screenshot. Per the task brief, this critique judges the **soundness and completeness of the UX decisions**: default-scope editability, triage visibility, sort behavior, scope vocabulary, metadata honesty. Scored on Component Coherence (does the corrected behavior fit the existing surface grammar?) and States/Feedback (are all states handled?).

All five referenced surfaces and symbols were verified to exist as the design describes: `BacklinksCard` (KnowledgeDetail:318), `amendableBanner` (466), `optimisticRemovals` (KnowledgeList:778), `attentionScore` triage sort (805), `SCOPE_CREATE_OPTIONS`/`SCOPE_PILL_OPTIONS`/`scopeKindToLabel` (scope-labels.ts).

## Decision-by-decision

### 1. Default-scope → editability — SOUND
Fixes the dead-end at the *editability rule* (author-check predicate), not by making `factory` editable. Correctly preserves the deliberate "agent-curated org knowledge is read-only" invariant and the `amendableBanner` review flow (verified keyed on `isFactory && status === "needs_human"`, line 466). Edit→Done state shape unchanged. Offers a clean fallback (default scope → `practice`). Both land the user on an editable detail page. No dead controls.

### 2. Triage post-action visibility — SOUND, best-in-class
Optimistic *status transition* (override map) rather than optimistic *removal* is the right model: one `useMemo` pass relocates the item (leaves Triage, enters Curated) instead of vanishing it. Failure-revert semantics preserved (delete key vs remove-from-set). Correctly rejects a toast (list grammar is silent relocation) and rejects auto-switching tabs (preserves keyboard `j`/`k` triage flow). Empty-state copy unchanged. The "verdict moves the item, never makes it vanish" signature directly answers the AC.

### 3. Sort pills — SOUND
Client-side sort over the fetched list, both tabs. Null-last handling mirrors the existing `attentionScore` pattern (verified line 805). Correctly scopes sort to rows-within-groups (not reordering topic groups, which carry health semantics). Triage keeps `attentionScore` as its native "relevance" and honors recency/frequency. Tie-breaks defined per option. Active-pill visual state unchanged.

### 4. Scope-change dialog vocabulary + version — SOUND
Replaces the raw 7-enum `<select>` (verified leaking `factory/practice/bet/task` at ScopeChangeDialog:150) with the 3 user-facing `SCOPE_CREATE_OPTIONS`, matching the create flow exactly — kills the AD6/AE1 vocabulary leak. `scopeId` free-text retained only for Team (the one `SCOPES_REQUIRING_ID` option among the three). Version sourced from live `version` state, not frozen mount value — directly fixes the spurious 409. Genuine conflicts still surface the inline error (no silent auto-retry).

### 5. Detail metadata honesty — SOUND
Each declared field mapped to a real source with an honest empty/zero display. Verified: the UI plumbing already reads `apiItem.accessCount` and `apiItem.relatedItems` (KnowledgeDetail:264/266 → aside:913, BacklinksCard:920); only the server route omits them. Topic-derived related (no new relations table) respects the out-of-scope guard. Honesty rule (remove unsourceable fields rather than placeholder) correctly stated; both gap fields are sourceable so nothing is removed.

## WARNING
- [design §4 Decision A] States "Shared → factory **or** practice per the create mapping". The actual `SCOPE_CREATE_OPTIONS[0]` maps Shared → `factory` only (scope-labels.ts:59) — there is no practice branch in the create options today. Harmless to the user-visible outcome, but the dialog's default-option resolution must map BOTH `factory` and `practice` current-scopes back to the single "Shared" option via `scopeKindToLabel` (the architecture §4A already specifies this). Keep the design's claim consistent with the one-entry reality so the builder doesn't add a phantom practice option.

## SUGGESTION
- [design §4 Team selectability] Gating Team on `currentUser.teamId` is correct, but the design leaves "until the user model carries teamId" open. With `teamId` absent today the pill is *always* disabled — functionally identical to the current `hasTeam = false` from the user's view. This satisfies "data-driven, not a hardcoded literal" but does NOT visibly satisfy the AC "selectable where the product intends it" until a team context exists. Acceptable as planned (the AC says "not permanently disabled *by mistake*"), but the builder should ensure a component test proves the gate flips when `teamId` is present — otherwise the fix is invisible and indistinguishable from the bug.

## What's Working Well
- Disciplined repair-in-place: every decision fixes a *wiring* defect at the seam where the concept says the rule belongs, with zero new surface and zero pixel change. The "Did we consider / rejected directions" section is genuine (toast, tab-switch, group reorder, 7-kind dropdown, relations table, server sort) — each rejection cites the contract or scope rule it would violate, not a straw man.
- The triage status-override model is the standout decision — it reframes a removal bug as a transition, which is both simpler and more correct than the suppress-set it replaces.
