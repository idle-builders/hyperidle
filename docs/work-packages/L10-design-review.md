# L10 — Design Review

**Branch:** `feat/L10-conversations-filter`
**Reviewer role:** Lead Product Designer (read-only)
**Approved contract:** `docs/design-explorations/L10/approved.md` + `docs/design-explorations/L10/variant-a-pure-axis/mockup.html`
**Plan:** `docs/work-packages/L10-plan.md`
**Method:** Read approved contract + mockup HTML → read changed TSX → started Vite dev server → captured Playwright screenshots of `/conversations/review` and `/designsystem` (Submenu stories) → compared pixels against the approved mockup. Fixture wire shape derived from `e2e/l10-conversations-filter.spec.ts`.

**Verdict:** Functional contract is correct; **two CRITICAL visual divergences** from the approved mockup ship in this PR. Fix them before merge or update the approved mockup to match (with a recorded design decision).

---

## Severity summary

| Severity | Count |
|---|---|
| CRITICAL | 2 |
| WARNING | 3 |
| OBSERVATION | 4 |

---

## CRITICAL

### C1 — Inline `× Clear` row layout: Async chip wraps onto its own row

**Where:** `packages/web/src/shell/Submenu.tsx:142-183` — outer `flex items-center gap-1` containing the `flex flex-wrap` tablist + the `ml-auto` clear button.

**Spec reference:**
- `approved.md` §2 "Tab order: `All`, `Blocking`, `Async` — left to right."
- `approved.md` §3 "Right edge of the chip row, in the same flex row as the chips."
- `approved.md` §8 "Three chips + `× Clear` fit at 360 px viewport width with the existing `flex flex-wrap gap-1`."
- `variant-a-pure-axis/mockup.html` line 228-232 — chips render as a single horizontal row.

**What I see (screenshots):**
- `/tmp/L10-real-blocking.png` (production `/conversations/review`, viewport 1440, fixture from e2e spec) — chip row renders as:
  - Row 1: `All`  `Blocking`  ………space………  `× Clear`
  - Row 2: `Async` (alone, wrapped)
- `/tmp/L10-ConversationsClearAffordance.png` (design system story, default viewport) — same broken layout.
- `/tmp/L10-real-async.png` — same: Async wraps to its own row when selected.
- `/tmp/L10-real-all.png` — when filter is `all` and `× Clear` is unmounted, the row is correct: single line `All Blocking Async`.

**Root cause (visible from CSS):**
The outer container is `flex items-center gap-1` (no wrap). It contains:
1. inner tablist `flex flex-wrap gap-1` holding three chips, each with `min-w-[44px]` for AQ-015 touch-target. Three chips ≈ `3 × 44 + 2 × 4 = 140px`.
2. clear button with `ml-auto`, `min-w-[44px]`, content `× Clear` ≈ 80–90px.

`ml-auto` on the clear button does not by itself shrink the tablist, but in combination with `min-w-[44px]` on the clear button and the Submenu's literal `w-60` (240px), the inner tablist's available main-size after subtracting the clear's `min-w` falls below the natural width of three chips. The inner tablist's `flex-wrap` then kicks in and wraps the third chip onto a new row inside the tablist. The clear button stays parked on the right of row 1 because it's a sibling of the tablist (not inside it), creating the visible asymmetry.

The architecture plan §3.7 anticipated this for the comfortable density tier ("chips wrap onto two rows before the outer row breaks") but here it happens in the **default** density at the spec's nominal width — a regression against the approved mockup which shows all three chips on one row in default mode.

**Why this matters:**
1. **Tab order assertion is violated visually.** The approved Tab order is `All → Blocking → Async → × Clear → first list row`. The DOM order matches that. But to a sighted user the visual reading order becomes `All → Blocking → × Clear` (row 1) → `Async` (row 2). The clear control visually sits *before* the third chip, which contradicts the "right edge of the chip row" placement and breaks the spatial intent of "right-edge recovery".
2. **The Async chip selected state lands in an unexpected location.** When the user clicks Async, the selected indicator shifts to row 2, which feels broken — Async is a peer of Blocking, not a secondary control.
3. **Chrome budget violation.** The synthesis explicitly chose the inline approach over Variant C's pill row to save vertical chrome. The wrap re-introduces the second chrome row this design rejected.

**Fix path (design-side, for the architect to implement):**
Either of:
- Drop `min-w-[44px]` from the chips when chip count ≤ 3 — touch target can be met via `min-h` alone since chips render via DaisyUI `btn-xs` whose padding meets 44px height under `comfortable` density. Three chips at natural width (~30px each) + the clear button (~80px) + gaps fit comfortably in 240px.
- Or set the inner tablist to `flex-1 min-w-0` and allow chip text truncation if needed (not ideal — the chip labels are already short).
- Or drop the `min-w-[44px]` requirement from the tablist's chips and keep it only on the clear button; verify AQ-015 via the chip's intrinsic 44px-height instead.

**Reproduction:** `bun dev`, navigate to `/conversations/review`, click `Blocking` chip. Or inspect `ConversationsClearAffordance` story at `/designsystem`.

**Severity rationale:** This is a screenshot-reviewable visual bug present at the production page on the canonical 1440-wide viewport with the canonical fixture. The spec-mockup parity rule (visual-parity.md, extended to design-explorations per the review prompt) is breached.

---

### C2 — `Clear filter` button in filter-empty EmptyState is a solid `btn-primary`, not the flat text-link the mockup specifies

**Where:** `packages/web/src/components/ThreadSections.tsx:225-233`
```jsx
<button type="button" className="btn btn-primary btn-sm" aria-label="Clear filter" onClick={onClearFilter}>
  Clear filter
</button>
```

**Spec reference:**
- `variant-a-pure-axis/mockup.html` lines 200-209:
  ```css
  .empty-state__action-btn {
    font-family: var(--ui);
    font-size: 12px;
    color: var(--primary);
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .empty-state__action-btn:hover { text-decoration: underline; }
  ```
- `variant-a-pure-axis/screenshot.png` Frame 2 — button renders as a flat link in primary color, no background, no border, no padding.
- `approved.md` §5.3 — "primary text-button labeled `Clear filter` (uses `--primary` color via `btn-primary`)" — this phrasing is ambiguous and the architect resolved it (plan §3.6) to a solid `btn btn-primary btn-sm`. The mockup CSS unambiguously shows a flat text link.

**What I see:** `/tmp/L10-page-blocking.png` and `/tmp/L10-page-async.png` — the `Clear filter` button renders as a chunky filled indigo/purple pill (DaisyUI `btn-primary btn-sm`). It looms over the EmptyState description copy and pulls visual weight from the message. This is the AI-aesthetic-adjacent "primary CTA" treatment the variant explicitly avoided.

**Why this matters:**
1. **Mockup parity rule.** The HTML mockup is the design source of truth for L10 per the review prompt. Visual diff is far above the 5% pixel threshold — the entire button is a different shape, color, and visual weight.
2. **Hierarchy.** The EmptyState is a passive informational surface (`role="status"`); a solid filled button violates the precision-instrument register the EmptyState component sets ("compact vertical rhythm matches the terminal-style aesthetic — no oversized padding, no decorative icons" per `EmptyState.tsx:8`).
3. **Density.** `btn-sm` adds `~2.25rem` height — nearly twice the descriptive text's line-height — making the EmptyState feel marketing-page-like, not productivity-tool-like.

**Fix path:** Replace the action node with the flat-link form:
- Tailwind: `text-[var(--primary)] text-[12px] hover:underline cursor-pointer p-0 bg-transparent border-0`.
- Or wrap as a DaisyUI `btn btn-link btn-xs p-0` — `btn-link` is the closest primitive to the mockup's flat treatment.

**Note on the architect's resolution:** The plan §3.6 explicitly says `btn-primary btn-sm`. If the implementation must keep that shape, the approved mockup needs to be updated and re-critiqued. Either way, the current state is an internal contradiction between mockup and code.

---

## WARNINGS

### W1 — Selected chip uses `btn-neutral` (filled medium-grey) — heavier weight than mockup's chip background

**Where:** `Submenu.tsx:157` — selected chip class `btn btn-xs btn-neutral`.

**Spec reference:** `mockup.html` line 86-89:
```css
.chip[aria-selected="true"] {
  background: var(--surface-4);
  color: var(--text-hi);
}
```
The mockup uses `--surface-4` (a faint elevated surface) for the selected state. DaisyUI `btn-neutral` resolves to a darker neutral fill that reads as a stronger UI affordance.

**What I see:** `/tmp/L10-real-blocking.png` — selected `Blocking` chip is a noticeably bolder, larger-feeling rectangle than the unselected siblings; in the mockup the selected state is a quieter elevated surface tint.

**Why this matters:** The `@lore` at `Submenu.tsx:153-156` already documents the J2-era reasoning for `btn-neutral` over `btn-primary`. The approved L10 mockup pivots to a still-quieter `--surface-4` treatment. The implementation kept `btn-neutral` from J2; the L10 mockup wasn't honored on this token.

**Fix path:** Selected chip uses `bg-[var(--surface-4)] text-[var(--text-hi)]` — and matching unselected uses `bg-transparent` + hover `bg-[var(--surface-3)]`. Drop the DaisyUI `btn-neutral` tier for chips. Rationale: the chip row is a high-frequency surface; lighter weight reduces visual fatigue and matches the precision-instrument aesthetic.

This is Warning rather than Critical because it's a chip-weight calibration, not a layout failure. The approved mockup's screenshot is the authority and is being missed; whether the founder considers it ship-blocking is a judgment call.

### W2 — `× Clear` button uses `font-mono` — unverified against mockup; mockup shows the chip row in the UI font

**Where:** `Submenu.tsx:171` — `className="btn btn-xs btn-ghost text-[var(--text-lo)] font-mono ml-auto …"`.

**Spec reference:** `approved.md` §3 "Class: `btn btn-xs btn-ghost text-[var(--text-lo)] font-mono` — matches chip row register, sits visually quieter than the chip pair." The approved spec prescribes `font-mono`.

But the mockup CSS for the chip row uses `font-family: var(--ui)` (lines 70-89). The mockup does not render the `× Clear` (per approved.md §3 "the mockup does not yet render the inline `× Clear`"), so there is no visual reference for the font choice.

**What I see:** `/tmp/L10-real-blocking.png` — the `× Clear` button reads in monospace (`× Clear`). The chips above read in the UI font. The font register difference is visible and noticeable on a 240px-wide Submenu.

**Why this matters:** The mono treatment is a deliberate de-emphasis choice in the spec, but it does not appear in any mockup. The contradiction between "matches chip row register" (spec wording) and the actual font register difference (chips are UI font; clear is mono) is internal to the spec. The implementation followed the spec text correctly. Worth a designer review pass — does the mono `× Clear` feel right next to UI-font chips? In the screenshot, mono signals "this is a system action, not a category" which actually supports the synthesis intent. **Leave as-is** unless the founder reads it differently. Logged so the next reviewer doesn't double-back on it.

### W3 — Filter-empty EmptyState wraps title onto two lines on a 240 px Submenu

**Where:** `ThreadSections.tsx:217-238` (EmptyState passes `title="No threads match this filter"` — 31 characters).

**What I see:** `/tmp/L10-page-blocking.png` and `/tmp/L10-page-async.png` — the EmptyState title wraps to two lines: `No threads match` / `this filter`. The mockup at 360px width (Frame 2) renders the title on a single line. The production Submenu is 240px (`w-60`), narrower than the mockup frame.

**Why this matters:** Wrapping a four-word headline isn't broken — but the mockup intent appears to be a single-line headline. The fact that the mockup ran in a 360px frame and production runs in 240px is a contract-mockup mismatch, not a code bug. Two paths:
- Shorten the title (e.g. `Nothing matches`, `No matches`).
- Accept the wrap as long as it's clean (currently the wrap point is OK).

**Recommendation:** Accept the wrap. Two-line empty-state titles are common and read fine. Mockup width should be updated to 240px in the next L10-style spec to avoid future false-positives.

---

## OBSERVATIONS

### O1 — Component budget: confirmed unchanged

No new custom components were introduced. The inline `× Clear` is a `<button>` using DaisyUI primitives (`btn btn-xs btn-ghost`), which is the correct path per `approved.md` §10. EmptyState was reused unchanged. ThreadSections gained two props (`activeFilter`, `onClearFilter`) — backward-compatible additions, no new component.

Tier 1/2/3 budget: 19/19. Approved §11 verification holds.

### O2 — Story coverage: complete and correctly variant-named

`Submenu.stories.tsx` has the four L10-relevant variants: `WithFiltersConversations` (default state), `ConversationsClearAffordance` (× Clear visible), `ConversationsDisabledChips` (error state), and the existing `WithFiltersKnowledge` (Knowledge subset). All render at `/designsystem?component=Submenu`. The disabled state correctly shows reduced opacity (`/tmp/L10-ConversationsDisabledChips.png` — chips are visibly faded; `aria-disabled` on each chip via tests).

Note: Submenu does not have a `.html` mockup in `packages/design-system/html/` for `:8098` parity diffing — Submenu is a Tier 3 region and lives in `packages/web/src/shell/`, not the design-system package. This is consistent with the design-system contract (Tier 3 stays in web). The L10 design source of truth is the design-explorations mockup, not a `packages/design-system/html` peer.

### O3 — Title-bar count under filter: behavior matches spec, including the "show 0" rule

Verified visually at `/tmp/L10-real-blocking.png`: count badge shows `2` (post-filter). Verified at `/tmp/L10-page-blocking.png` (no fixture): count shows `0` when filter is active and zero rows match — the spec's §6 "informative zero" rule. The L10 §1 Q9 contract is correctly implemented in `AppShell.tsx:490-500`.

### O4 — Token compliance: clean

No hardcoded colors, no off-grid spacing, no `rounded-2xl`, no oversized padding in the L10 surfaces. All token references trace to `--surface-*`, `--text-*`, `--density-*`, `--motion-*`, `--primary`, `--danger`. No raw Tailwind palette colors. Closed radius scale honored via DaisyUI defaults.

The `font-mono` on `× Clear` is intentional per §3. The `text-[12px]` on EmptyState description is intentional per `EmptyState.tsx:48` lore. Both are consistent with the design system's selective off-token concessions.

---

## Mobile adaptation

Approved §8: chips + clear fit at 360 px viewport with `flex flex-wrap`. **C1 above means this is provably false** — at 240 px the Async chip already wraps in default density. At 360 px viewport with the Submenu at `w-60` = 240 px (Submenu width is fixed regardless of viewport), the wrap behavior repeats. Comfortable density at viewport ≤ 1024 px makes the chips physically larger, exacerbating C1.

Approved §8 needs a width clarification or the spec needs to assume a mobile-only Submenu width that I cannot find documented. The stricter-density mobile case must be captured by C1's fix.

---

## Recommendations to the architect

1. **Block on C1.** Fix the chip-row layout so all three chips and `× Clear` render on a single row at the production Submenu width (240 px) and at viewport ≤ 1024 (comfortable density). Take a fresh `/tmp/L10-real-blocking.png` and `/tmp/L10-real-async.png` after the fix.
2. **Resolve C2 with the founder.** Either change the implementation to the flat text-link the mockup shows, OR update the mockup CSS + screenshot to a solid `btn-primary` and re-record the design decision. Don't ship the contradiction.
3. **Decide on W1.** Selected-chip weight: stay with `btn-neutral` (current) or move to `bg-[var(--surface-4)]` (mockup). One clear answer in the mockup-or-code direction.
4. **Defer W2.** The mono `× Clear` reads correctly even though it diverges in font register — an L10-2 designer call.
5. **Note W3 in approved.md** for the next iteration: mockup width should match production Submenu width.

---

## Screenshots used in this review

All paths absolute, captured against the `feat/L10-conversations-filter` branch at the time of review:
- `/tmp/L10-real-all.png` — Submenu, default `All` filter, fixture rows present
- `/tmp/L10-real-blocking.png` — Submenu, `Blocking` filter active, shows C1 (Async wraps)
- `/tmp/L10-real-async.png` — Submenu, `Async` filter active, shows C1 from a different angle
- `/tmp/L10-page-all.png` — full page, no fixture (L8 EmptyState, sanity check)
- `/tmp/L10-page-blocking.png` — full page, `Blocking` filter, shows C2 (solid `Clear filter` button) and C1 (chip wrap)
- `/tmp/L10-page-async.png` — full page, `Async` filter, same C1 + C2 evidence
- `/tmp/L10-ConversationsClearAffordance.png` — `/designsystem` story, shows C1 in isolation
- `/tmp/L10-ConversationsDisabledChips.png` — `/designsystem` story, disabled state correct (O2)
- `/tmp/L10-WithFiltersConversations.png` — `/designsystem` story, default state correct
- `/tmp/L10-WithFiltersKnowledge.png` — `/designsystem` story, Knowledge subset unchanged
- `docs/design-explorations/L10/variant-a-pure-axis/screenshot.png` — approved mockup reference
