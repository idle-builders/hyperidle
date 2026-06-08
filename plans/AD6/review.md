# AD6 Code Review — Phase 4

**Workpackage:** AD6 — Knowledge Cleanup & Scope Simplification  
**Branch:** `feat/AD6-knowledge-scope-simplification`  
**Reviewer:** Phase 4 reviewer (carries Phase 2 design/arch context)  
**Date:** 2026-06-08

---

## Verdict: NOT DONE

Three blockers must be resolved before this can ship.

---

## Findings

### BLOCKER-1: U9-knowledge-scope-pills.test.tsx fails (5 tests)

**Severity:** Blocker  
**File:** `packages/web/src/__tests__/U9-knowledge-scope-pills.test.tsx`  
**Plan ref:** architecture.md section 7.1 ("Tests to update" table)

The existing U9 test file asserts on old dynamic pill test IDs (`scope-pill-practice`, `scope-pill-product`, `scope-pill-factory`) which no longer exist. 5 of 11 tests fail. The architecture plan explicitly listed this file as requiring updates. The builder created the new AD6 test file but did not fix the pre-existing test file.

**Fix:** Update U9-knowledge-scope-pills.test.tsx to assert on the new static pill IDs (`scope-pill-all`, `scope-pill-shared`, `scope-pill-team`, `scope-pill-private`) and the new filter semantics.

---

### BLOCKER-2: KnowledgeCreateDialog not modified

**Severity:** Blocker  
**File:** `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx`  
**Plan ref:** architecture.md sections 6.1, 6.2, file inventory, task 5

The architecture plan specifies this file as a MODIFY target: replace the `SCOPE_KINDS.map(...)` `<select>` with the 3-pill segmented control when unlocked, and remove the kind reference. The file is completely unchanged. It still renders all 7 SCOPE_KINDS in a dropdown and still has a "Scope ID" free-text input.

**Fix:** Apply the same 3-pill pattern from KnowledgeCreate to KnowledgeCreateDialog (when not locked). Import `SCOPE_CREATE_OPTIONS` and render pill buttons. Remove the scopeId input when unlocked.

---

### BLOCKER-3: Metadata bar Tag(kind) and Tag(layer) not removed from KnowledgeDetail header

**Severity:** Blocker  
**File:** `packages/web/src/pages/KnowledgeDetail.tsx` line 652-654  
**Plan ref:** architecture.md section 4.3, design/approved.md Surface 4

The architecture plan section 4.3 says to remove `Tag(kind)` and `Tag(layer)` from the header metadata bar. The design spec says the header should show only: StatusChip + confidence + origin agent + timestamp. Both tags remain at lines 652-654. The builder noted this was intentional because "protected tests assert them" — but the architecture plan section 7.1 explicitly lists KnowledgeDetail tests as needing updates.

**Fix:** Remove `<Tag label={item.kind} />` and `<Tag label={item.layer} />` from the metadata bar. Update any tests that assert on them.

---

### MAJOR-1: Missing Scope row in metadata aside

**Severity:** Major  
**File:** `packages/web/src/pages/KnowledgeDetail.tsx` (metadata aside, line ~849)  
**Plan ref:** architecture.md section 4.4, design/approved.md Surface 4

The architecture plan specifies adding a "Scope" row to the metadata card showing the human-readable scope label via `scopeKindToLabel()`. The design spec says the aside should have a Scope row between Kind and Status. Neither was added. The `scopeKindToLabel` function was created in `scope-labels.ts` but is never imported or used in KnowledgeDetail.

**Fix:** Add a Scope row after Kind in the metadata aside: `<span>Scope</span> <span>{scopeKindToLabel(item.scopeKind ?? "factory")}</span>`.

---

### MAJOR-2: Accessibility — scope pills use role="group" instead of role="radiogroup"

**Severity:** Major  
**File:** `packages/web/src/pages/KnowledgeCreate.tsx` line 207  
**Plan ref:** architecture.md section 5.2, design/approved.md section "Accessibility"

Both the design spec and architecture plan specify `role="radiogroup"` with each pill having `role="radio"` + `aria-checked`. The implementation uses `role="group"` with plain buttons and no `aria-checked`. This is an accessibility deviation from the approved plan.

**Fix:** Change `role="group"` to `role="radiogroup"`. Add `role="radio"` and `aria-checked={isActive}` to each pill button. Apply the same fix in KnowledgeList's pill fieldset (currently a `<fieldset>` which is semantically correct for the list filter but the create page should be a radiogroup).

---

### MAJOR-3: Unsafe `as` cast for team detection

**Severity:** Major  
**File:** `packages/web/src/pages/KnowledgeCreate.tsx` line 56  
**Plan ref:** .claude/rules/typescript.md ("No unsafe `as` casts")

```typescript
const hasTeam = (user as { teamId?: string } | null | undefined)?.teamId !== undefined;
```

This casts `CurrentUser | null` to a different type to access a property that does not exist on the interface. Since `CurrentUser` has no `teamId` field, this always evaluates to `false`. The cast is both unsafe and unnecessary.

**Fix:** Replace with `const hasTeam = false; // AD6: CurrentUser has no teamId yet — Team pill disabled until /me returns teamId`.

---

### MINOR-1: Dead code — kindBadgeStyle function and kind badge rendering

**Severity:** Minor  
**File:** `packages/web/src/pages/KnowledgeList.tsx` lines 165-187, 258-265, 388-395  
**Plan ref:** architecture.md section 3.2

The `kindBadgeStyle` function and both kind badge render blocks remain in `KnowledgeListRow`. Since no call site passes `kind`, they are dead code. The architecture plan says "remove the kind badge rendering block" — the intent was to delete the render code, not just stop passing the prop.

**Fix:** Remove the `kindBadgeStyle` function and the `{kind && kStyle && (...)}` blocks from both row variants. Keep the `kind` prop in the interface (it's API-compatible) but remove the render path.

---

### MINOR-2: Missing encodeURIComponent on archive URL

**Severity:** Minor  
**File:** `packages/web/src/pages/KnowledgeDetail.tsx` line 590  
**Plan ref:** architecture.md section 4.2

The architecture plan specifies `encodeURIComponent(effectiveKnowledgeId)` in the archive URL. The implementation uses the raw id. Knowledge IDs are UUIDs so this is unlikely to cause issues in practice, but it deviates from the plan and is a defensive coding best practice.

**Fix:** Change to `` `/api/knowledge/${encodeURIComponent(effectiveKnowledgeId)}/archive` ``.

---

### MINOR-3: Redundant onClick guard in disabled button

**Severity:** Minor (slop)  
**File:** `packages/web/src/pages/KnowledgeCreate.tsx` line 219-220  
**Plan ref:** Simplification lens

```tsx
disabled={isDisabled}
onClick={() => { if (!isDisabled) setSelectedScope(option); }}
```

The `disabled` attribute already prevents click events from firing on the button. The `if (!isDisabled)` guard is redundant defensive code.

**Fix:** Simplify to `onClick={() => setSelectedScope(option)}`.

---

### OBSERVATION-1: Pill styling duplication

**File:** `packages/web/src/pages/KnowledgeCreate.tsx` lines 222-227, `packages/web/src/pages/KnowledgeList.tsx` lines 549-552

The active/inactive/disabled pill class strings are duplicated between KnowledgeCreate and KnowledgeList. If KnowledgeCreateDialog is also updated (BLOCKER-2), that's three copies. Consider extracting a shared constant or tiny utility for pill class resolution.

---

### OBSERVATION-2: AD6 test comments say "red phase" but tests pass

**File:** `packages/web/src/__tests__/AD6-knowledge-simplification.test.tsx` line 7

The file header says "Tests assert the NEW behavior. They will fail against current implementation and pass once the implementation is complete." The tests now pass because implementation is complete. This is just a stale comment — not a blocking issue.

---

## Lens Summaries

### Architecture Lens

- `scope-labels.ts` utility: matches plan structure. Types are clean. Naming is honest.
- KnowledgeList scope filter logic: correctly applies static pills and filters before triage/curated split (plan section 3.3). The `scopeFilteredItems` memo correctly uses `selectedScopePill.filterKinds`.
- KnowledgeDetail archive handler: correctly wires POST, handles success/error, shows inline banner. Missing `encodeURIComponent` (MINOR-2).
- KnowledgeCreateDialog: NOT modified (BLOCKER-2).
- Metadata bar: NOT simplified (BLOCKER-3).
- Metadata aside: missing Scope row (MAJOR-1).

### Design Lens

- Scope pills in list: correctly static, correct labels, correct filter behavior.
- Create page pills: correct visual treatment, correct disabled state. Wrong ARIA role (MAJOR-2).
- Archive flow: correct — POST, navigate on success, inline error on failure.
- Team pill disabled: correct visual signal (opacity-40, cursor-not-allowed, title tooltip).
- Flag removed from overflow menu: correct.
- Kind badge not rendered in list (via omitted prop): functionally correct, dead code remains (MINOR-1).

### Security Lens

- No XSS vectors. No `dangerouslySetInnerHTML`. No user input rendered without escaping.
- Archive endpoint: uses POST (correct). No request body needed. ID from route params (controlled by app, not user free-text).
- Missing `encodeURIComponent` on path segment is low risk (UUIDs) but present (MINOR-2).
- No new endpoints added (presentation-only changes). No auth changes.

### Adversarial Lens

- **The Saboteur:** The U9 test failure (BLOCKER-1) would silently pass CI if the test is skipped or the file has a different run config. Currently it FAILS, which is good — CI will catch it.
- **The New Hire:** The `hasTeam` cast (MAJOR-3) is confusing — a new developer would wonder why we cast to an interface that doesn't exist. `const hasTeam = false` with a comment is immediately clear.
- **The Auditor:** The PR claims to implement all 5 ACs but leaves KnowledgeCreateDialog unchanged and metadata bar unsimplified.

### Simplification Lens

- `kindBadgeStyle` function: dead code, never called with a non-undefined kind from any call site.
- Redundant `if (!isDisabled)` guard (MINOR-3).
- Pill class strings duplicated 2x (will be 3x after BLOCKER-2 fix).

### AI Slop Lens

- Comment at line 48 of KnowledgeCreate ("AD6: 3-pill scope picker replaces 7-item SCOPE_KINDS dropdown. Default: Shared (→ factory scopeKind).") is useful lore, not slop.
- The `@lore` annotations are well-placed and informative.
- No "TODO: implement", no "simplified version", no filler patterns detected.
- The test file header comment (OBSERVATION-2) is stale but minor.

---

## AC Completeness Audit

| AC | Status | Evidence |
|---|---|---|
| AC-1: Scope picker offers 3 clear choices (shared/team/private) | PARTIAL PASS | KnowledgeCreate has 3-pill picker. KnowledgeCreateDialog still has 7-item dropdown (BLOCKER-2). |
| AC-2: No dead buttons that do nothing on click | PASS | Archive wired to POST. Flag removed. Change scope works. |
| AC-3: Archiving works end-to-end | PASS | POST /api/knowledge/:id/archive + navigate on success + error on failure. Tests 5-7 pass. |
| AC-4: Scope vs topic distinction clear | PASS | Static pills filter by visibility (Shared/Team/Private). Topics remain as grouping. |
| AC-5: Kind removed from user-facing surfaces or simplified | PARTIAL PASS | Kind badge removed from list rows (not passed). Kind selector removed from KnowledgeCreate. But: Tag(kind) remains in detail header (BLOCKER-3). KnowledgeCreateDialog still shows kind implicitly through scope dropdown (BLOCKER-2). |

---

## Required Actions Before DONE

1. **Fix BLOCKER-1:** Update `U9-knowledge-scope-pills.test.tsx` to work with new static pill IDs.
2. **Fix BLOCKER-2:** Modify `KnowledgeCreateDialog.tsx` per architecture plan section 6.
3. **Fix BLOCKER-3:** Remove `Tag(kind)` and `Tag(layer)` from KnowledgeDetail metadata bar. Update any tests that assert them.
4. **Fix MAJOR-1:** Add Scope row to metadata aside.
5. **Fix MAJOR-2:** Use `role="radiogroup"` + `role="radio"` + `aria-checked` for create page scope pills.
6. **Fix MAJOR-3:** Replace unsafe `as` cast with `const hasTeam = false`.
7. Fix minors at builder's discretion (recommended).
8. Run `npm run test -- --all` and verify zero failures.
