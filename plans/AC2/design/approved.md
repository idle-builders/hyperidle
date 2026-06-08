# AC2 Approved Design -- Bet Hypothesis Validation Flow

## Summary

The validation flow replaces the AC1 inline outcome form with a richer two-column layout: hypothesis pinned on the left, evaluation form on the right. The section header remains "Outcome" (AC1 continuity). The flow produces two writes: bet outcome fields (AC1 PATCH) + retro knowledge item (knowledge POST). No new components. No new pages.

---

## 1. Bet Detail (WorkBet.tsx) -- Enhanced Outcome Section

### 1.1 Section header

**Unchanged from AC1.** Section header "Outcome" using the standard section header pattern: 13px font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)], border-b border-[var(--border-subtle)].

### 1.2 Not-evaluated state (default)

**Unchanged from AC1.**
```
OUTCOME
-----------------------------------------
Not evaluated     [Record outcome]
```
- "Not evaluated" in 13px text-[var(--text-tertiary)]
- "Record outcome" as a link-style button: text-[13px] text-[var(--accent-primary)] hover:underline cursor-pointer

### 1.3 Editing state (new -- replaces AC1 inline form)

When the founder clicks "Record outcome" or "Edit outcome", the section shows a two-column layout:

```
OUTCOME
-----------------------------------------
 PREDICTED                      WHAT HAPPENED
 "Chunked uploads reduce        Verdict  [Validated v]
  failure rate by 50%"
                                [Draft with AI]

                                What happened?
                                [textarea, 3 rows]

                                What did you learn?
                                [textarea, 3 rows]

                                        [Cancel]  [Save]
```

**Layout:**
- Container: `grid grid-cols-[1fr_1fr] gap-[18px]` within the section
- Left column: fixed, read-only content
- Right column: form fields
- No vertical divider line between columns (the gap is sufficient visual separation)
- On viewports < 640px: `grid-cols-1` (stacks vertically, hypothesis on top)

**Left column ("Predicted"):**
- Label: "Predicted" in 12px font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-[6px]
- Hypothesis text: 13px text-[var(--text-primary)] italic leading-[1.7]
- If `bets.hypothesis` is null/empty: "No hypothesis recorded" in 13px text-[var(--text-tertiary)] italic
- The hypothesis text is NEVER editable in this context. It is a snapshot display.

**Right column ("What happened"):**
- Label: "What happened" in 12px font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-[6px]

- **Verdict select**: below the column label
  - Label: "Verdict" in 12px font-[500] text-[var(--text-secondary)]
  - Select: `select select-sm bg-[var(--surface-container)] border-[var(--border-default)] text-[var(--text-primary)] text-[13px]`
  - Options: "Select verdict..." (placeholder) | Validated | Refuted | Partial | Inconclusive
  - Same select styling as AC1

- **"Draft with AI" button**: below verdict select, mb-[12px]
  - Style: `btn btn-xs btn-ghost` (same as other ghost action buttons on this page)
  - Label: "Draft with AI"
  - Loading label: "Drafting..."
  - Disabled while drafting
  - Only shown when bet has session data (tasks with sessions). Hidden otherwise -- no point offering AI drafting when there is nothing to draft from.

- **Reality textarea**: labeled "What happened?"
  - Label: 12px font-[500] text-[var(--text-secondary)]
  - Textarea: `textarea textarea-sm bg-[var(--surface-container)] border-[var(--border-default)] text-[var(--text-primary)] text-[13px] min-h-[72px] resize-y`
  - Placeholder: "Compare against the hypothesis -- what actually happened?"
  - This writes to the bet's `outcomeSummary` field AND becomes the "Reality" section of the retro knowledge item body.

- **Learnings textarea**: labeled "What did you learn?"
  - Label: 12px font-[500] text-[var(--text-secondary)]
  - Textarea: same styling as reality textarea
  - Placeholder: "What would you carry forward to the next bet?"
  - This becomes the "Learnings" section of the retro knowledge item body.

- **Error text**: below learnings textarea, above buttons. text-[12px] text-[var(--status-error)]. Only shown on error.

- **Action buttons**: flex justify-end gap-[9px]
  - Cancel: `btn btn-xs btn-ghost` disabled={saving}
  - Save: `btn btn-xs btn-primary` disabled={!verdictSelected || saving}
  - Save label: "Save" / "Saving..."

### 1.4 Populated state (viewed -- replaces AC1 view state)

After saving, the section shows the result in a two-column layout:

```
OUTCOME
-----------------------------------------
 PREDICTED                      REALITY
 "Chunked uploads reduce        [Validated]  3d ago by @Founder
  failure rate by 50%"
                                The chunked upload hypothesis
                                held -- failure rate dropped
                                from 12% to 2.1%.

                                LEARNINGS
                                Next time, run the A/B test
                                for a full week before
                                declaring success.

                                                     [Edit]
```

**Layout:** Same `grid grid-cols-[1fr_1fr] gap-[18px]` as editing state.

**Left column ("Predicted"):**
- Label: "Predicted" same style as editing
- Hypothesis text: 13px text-[var(--text-primary)] italic leading-[1.7]

**Right column ("Reality"):**
- Label: "Reality" in 12px font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-[6px]
- Verdict badge: `inline-flex items-center text-[12px] font-[500] px-[9px] py-[3px] rounded-[var(--r-pill)] bg-[var(--surface-container)] text-[var(--text-secondary)] leading-[1.4]` (same neutral badge as AC1)
- Metadata: "Xd ago by @Name" in 12px text-[var(--text-tertiary)] ml-[9px]
- Reality summary: 13px text-[var(--text-secondary)] leading-[1.7] mt-[9px]
- Learnings sub-section:
  - Label: "Learnings" in 12px font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mt-[12px] mb-[6px]
  - Text: 13px text-[var(--text-secondary)] leading-[1.7]
- "Edit" button: text-[13px] text-[var(--accent-primary)] hover:underline cursor-pointer. Positioned at bottom-right of right column.

**Populated state without learnings:** If the founder saved without entering learnings (field is optional), the "Learnings" sub-section is not rendered. The reality summary and verdict badge are sufficient.

### 1.5 AI-Assisted Draft states

**Draft button visible:** Only when the bet has at least one task with at least one session. (If no sessions exist, there is no data for the agent to draft from.)

**Drafting in progress:**
- "Draft with AI" button shows "Drafting..." and is disabled
- The verdict select and textareas show a reduced opacity (opacity-50) with a subtle breathing pulse (optional, via CSS animation, not JS)
- No skeleton loaders -- the fields are dimmed, not replaced

**Draft arrives:**
- Verdict select is set to the suggested value
- Reality textarea is populated with the suggested text
- Learnings textarea is populated with the suggested text
- All fields return to full opacity
- Focus moves to the verdict select so the founder reviews from top to bottom
- The founder can immediately edit any pre-filled value

**Draft fails:**
- "Draft with AI" button returns to default state
- Error text below the button: "Could not generate draft. Fill in manually." in text-[12px] text-[var(--status-error)]
- All form fields remain editable and at full opacity

### 1.6 Save behavior (atomic two-write)

On Save:
1. POST `/api/bets/:id/outcome` with `{ verdict, summary: realitySummary }` (writes AC1 outcome fields)
2. POST `/api/knowledge` (or PUT if retro item already exists) with structured body containing hypothesis snapshot, verdict, reality, and learnings (creates/updates the retro knowledge item)
3. Both calls must succeed for the save to be considered complete. If the outcome write succeeds but the knowledge write fails, show an error and leave the form open (the outcome fields are already written -- the error message should say "Outcome saved but retro record failed. Try again.").
4. On full success: collapse to populated view state, refresh bet data.

**Open question for architecture:** Should the two writes be a single server endpoint (POST `/api/bets/:id/retro` that does both) or two client-side calls? Single endpoint is safer (atomic) but adds a new route. Architecture decides.

---

## 2. Task Rows -- Outcome Badges

**Unchanged from AC1.** Each task row shows an optional outcome badge (Met/Rework/Partial/Not met) before the state badge. No AC2 changes.

---

## 3. Work Portfolio -- Verdict Filter

**Unchanged from AC1.** Verdict filter pills on the portfolio page. No AC2 changes.

---

## 4. "Not Evaluated" Indicator

**AC2 requirement met by AC1's existing behavior.** When `outcomeVerdict` is null, the Outcome section shows "Not evaluated." This is persistent -- the indicator remains until the founder completes the validation flow. No additional indicator is needed.

The indicator is quiet (text-tertiary, not alarming) per AC1's approved design. AC2 does not change the visual treatment of the not-evaluated state.

---

## 5. Knowledge Item Visibility

After the validation flow creates a retro knowledge item, the item is visible in:
- **Knowledge view** (existing): appears in the list filtered by scope_kind='bet'. The item has the bet title in its title ("Retro: [bet title]"), scope_kind='bet', scope_id=betId.
- **Bet detail page** (existing): the "Add knowledge" button and KnowledgeCreateDialog already exist on WorkBet.tsx. The retro item appears in any bet-scoped knowledge listing. No additional UI is needed on the bet page.

No new pages, views, or navigation surfaces for AC2.

---

## 6. Component Budget Impact

**New components: 0.** All UI composes from existing DaisyUI primitives (select, textarea, btn, badge pills) and CSS grid layout.

**Modified pages: 1.** WorkBet.tsx: the Outcome section is enhanced from AC1's inline form to the two-column validation flow.

**Modified components: 0.** No changes to BetCard, KnowledgeRow, or any Tier 1-3 component.

---

## 7. Behavior and Interaction

### Keyboard
- Tab navigates through interactive elements in the right column: Draft with AI -> verdict select -> reality textarea -> learnings textarea -> Cancel -> Save
- The left column (hypothesis) is not focusable (static text)
- Escape cancels and collapses the form
- Enter on Save submits
- Standard button keyboard (Enter/Space) for "Record outcome", "Edit", "Draft with AI"

### Focus management
- "Record outcome" click: two-column layout appears, focus moves to verdict select
- "Draft with AI" click: focus stays on button during draft. After draft completes, focus moves to verdict select.
- Cancel/Escape: layout collapses. Focus returns to "Record outcome" (if was creating) or "Edit" (if was editing).
- Successful save: focus returns to "Edit" button.

### Motion
- Form expand/collapse: opacity 0<->1 over var(--motion-fast) (120ms) -- matches AC1
- No stagger on two-column appearance (both columns appear simultaneously)
- AI draft field dimming: opacity transition 120ms
- AI draft field population: instant (no typing animation)
- Verdict badge and populated content: no motion (static content)

---

## 8. Mobile Adaptation (< 640px)

- Two-column layout stacks to single column (grid-cols-1)
- Hypothesis block appears first (full-width), then form fields below
- All other behavior identical
- Touch targets remain >= 44px (select, textarea, and buttons are all above this threshold)

---

## 9. Rejection List (locked -- do not re-litigate)

1. No separate page for validation. Inline section on bet detail.
2. No modal dialog for the validation form.
3. No multi-step wizard. All fields visible at once.
4. No color-coded hypothesis/reality comparison (no green/red treatment).
5. No animation on AI draft text insertion (values appear instantly).
6. No "Retro" section header (keep "Outcome" for AC1 continuity).
7. No vertical-stack-only form (side-by-side comparison IS the feature).
8. No new components. CSS grid + existing primitives only.
9. No sticky/position:fixed left column. Both columns scroll naturally within the page.
10. No verdict color-coding. All neutral badge style.
11. No automatic AI drafting on section open. "Draft with AI" is opt-in.
12. No separate "Learnings" entity. Learnings are a section in the knowledge item body.

---

## 10. Open Questions for Architecture

1. **Atomic save**: Should the two writes (bet outcome + knowledge item) be a single server endpoint or two client-side calls? Recommendation: single endpoint POST `/api/bets/:id/retro` for atomicity.
2. **AI draft endpoint**: What endpoint does "Draft with AI" call? Recommendation: POST `/api/bets/:id/retro/draft` that returns `{ verdict, summary, learnings }`.
3. **Retro knowledge item deduplication**: How does the API find the existing retro item to update on re-validation? Recommendation: query `knowledge_items WHERE scope_kind='bet' AND scope_id=betId` + join `knowledge_strategy_fabric WHERE kind='reflection'`.
4. **AI draft cost cap**: What is the per-call token/cost limit? Recommendation: use the existing session cost cap mechanism.
5. **Retro knowledge item title format**: Recommendation: "Retro: {bet title}" (matches the existing post-bet-retro review item title pattern).
