# Q3 Design Critique — Bet Creation Dialog

DESIGN-CRITIQUE: variant=modal-dialog score=8/10 rounds=1 axes: H:8 S:8 T:9 C:8 Co:9 St:9 A:7 AS:9 PP:7

---

## Summary

The design is solid. It follows the established KnowledgeCreateDialog pattern faithfully, covers all ACs, handles all states (empty, loading, submitting, success, error, optimistic failure), and avoids AI aesthetic tells. The data flow section is unusually thorough for a design doc — the architecture will benefit from it. Two areas need attention: touch targets on mobile and a minor accessibility gap in form field labeling.

---

## CRITICAL

None.

## WARNING

### W-1: btn-xs touch targets do not meet 44px floor on mobile (AQ-015)

The design specifies `btn btn-xs btn-ghost` for Cancel and `btn btn-xs btn-primary` for Create. DaisyUI `btn-xs` has a min-height of approximately 24px (1.5rem). The design document claims "Touch targets: all buttons meet 44px minimum (btn-xs with padding meets this)" in Section 5 (Mobile adaptation). This claim is incorrect. DaisyUI btn-xs renders at ~24px height. The `p-2` responsive class on the `+` entry button is addressed, but the dialog action buttons are not.

KnowledgeCreateDialog has the same issue (same btn-xs on Cancel/Create). This is a pre-existing pattern. Since Q3 is following an established precedent and the fix would be cross-cutting (all dialogs), this is a WARNING not a CRITICAL. The builder should add `min-h-[44px]` or `min-h-11` on the dialog buttons at mobile viewports, or document the deviation and file a follow-up for all dialog action buttons.

**Fix:** Add `sm:min-h-0 min-h-[44px]` to Cancel and Create buttons in the component mapping table, or acknowledge the debt and file a cross-cutting follow-up.

### W-2: Field labels use `<span>` instead of `<label>` for product select and appetite inputs

The component mapping table (Section 6) specifies `<span>` for field labels. The KnowledgeCreateDialog wraps inputs in `<label>` elements with the label text as children, which is the correct accessible pattern. The design doc's component mapping diverges from the precedent it claims to follow. If the builder implements `<span>` labels without `for`/`htmlFor` binding, the product select and appetite inputs will have no programmatic label association.

The pitch textarea field is also listed with a `<span>` label. Only the KnowledgeCreateDialog's wrapping `<label>` pattern correctly associates labels with inputs.

**Fix:** Change field labels from `<span>` to wrapping `<label>` elements (matching KnowledgeCreateDialog's actual pattern), or add explicit `htmlFor` + `id` bindings.

### W-3: Title preview `deriveTitleFromPitch` logic may diverge from server

The design specifies client-side title derivation: "strip leading `#{1,6}\s+`, take first 60 chars." The server's `deriveTitleFromPitch()` (bets.ts:118-130) iterates lines, skips empty lines, strips the heading prefix, and takes the first 60 chars of the *stripped* line. If the client implements a simpler version (e.g., taking the first line without skipping empties), the preview will not match the server-derived title.

**Fix:** The architecture plan should mandate that the client reuses the exact same logic (or imports a shared utility from `@hyperidle/shared`). The design should note that title preview is a best-effort display that may differ from server truth, or mandate a shared implementation.

## SUGGESTION

### S-1: Consider `<label>` wrapping for the product select hint text

The "(required)" annotation next to field labels uses `<span aria-hidden>`. This hides "required" from screen readers. The alternative is `aria-required="true"` on the `<select>` and `<textarea>` elements, which is the standard ARIA pattern for required fields. The KnowledgeCreateDialog uses the same `<span aria-hidden>` pattern, so this is consistent, but both could be improved.

**Fix:** Add `aria-required="true"` to the product select and pitch textarea in addition to the visual "(required)" hint.

### S-2: Optimistic failure recovery UX could be simpler

Section 4 describes a complex optimistic failure flow: remove optimistic BetCard, show inline error below column header with retry action that re-opens the dialog with previous field values. This is thorough but introduces state complexity (preserving previous field values across dialog close/reopen cycles). The KnowledgeCreateDialog does not have optimistic behavior — it closes after success and re-opens fresh.

The simpler alternative: if the POST fails after the dialog closes, show the inline error with "Try again" that simply opens a fresh dialog (no field restoration). The user re-enters the data. For a creation flow that takes 10 seconds to fill, this is acceptable.

**Decision for architecture:** The current design is fine if the builder can implement it cleanly. If the builder finds field-preservation across dialog cycles adds significant complexity, the simpler alternative is acceptable.

### S-3: Currency default could be derived from user locale

The design hardcodes USD as the default currency. For a single-founder product, this is fine. If the product expands to non-US founders, the currency default should come from user preferences or browser locale. No action needed now — noting for future reference.

### S-4: Amount input `step="1"` prevents decimal entry for JPY but blocks cents for USD

The design specifies `<input type="number" min="0" step="1" />` for the appetite amount. Since the input is in major units, USD amounts like $12.50 would require step="0.01" (or step="any"). The design says "Amount in major units (e.g. $500)" — if founders only enter whole-dollar amounts, step="1" is fine. But if someone wants $12.50, the browser validation may reject it (Chrome shows a "Please enter a valid value" tooltip).

**Fix:** Use `step="any"` or `step="0.01"` for USD/EUR/GBP and `step="1"` for JPY, or use `step="any"` universally and let the client-side conversion handle precision.

---

## What's Working Well

1. **State coverage is exhaustive.** The design documents 7 distinct states (empty canvas, dialog open, validation, submitting, success, error, optimistic failure) with specific behavior for each. This is unusually complete and gives the builder clear implementation targets.

2. **Data flow section bridges design and architecture.** Section 7 explicitly maps form fields to POST body fields, including the major-to-minor unit conversion and the omission strategy for empty appetite. This eliminates a class of "what does the designer mean?" questions during build.

3. **Follows the existing pattern faithfully.** The dialog dimensions, class names, heading style, button placement, and native `<dialog>` usage all match KnowledgeCreateDialog. This consistency reduces cognitive load for anyone reading both components.

---

## AC Coverage Audit

| AC | Covered in design? | Notes |
|---|---|---|
| AC1: "New pitch" action in Canvas shaped column | Yes | Section 2: `+` button with aria-label="New pitch" in shaped column header |
| AC2: Creation form with all fields | Yes | Section 3: product picker, pitch textarea, appetite (number + currency) |
| AC3: POST /api/bets with status=shaped | Yes | Section 7: data flow maps form to POST body; status is implicit (shaped) |
| AC4: BetCard appears in shaped column | Yes | Section 4 (Success): optimistic BetCard insertion |
| AC5: Markdown renders in bet detail | Partially | Section 7 mentions pitch body is markdown; rendering in detail is deferred to existing WorkBet.tsx (deriveBlocks). Design does not need to cover detail page. |
| AC6: Edit pitch post-creation | Not in scope | Design covers creation dialog only. Edit pitch is a PATCH operation on the detail page, not a new UI surface. Architecture covers this (T4). |
| AC7: Agent edits + version history | Not in scope | Backend concern. Design covers creation only. |
| AC8: teamId auto-assigned | Yes | Section 7: "teamId: omitted -- server derives from productId" |
| AC9: No appetite shows "--" | Yes | Section 7: optimistic card appetite shows "--" when amount is null |
| AC10: Empty pitch validation | Yes | Section 4 (Validation): "Pitch body is required" error message |
| AC11: bun verify green | N/A | Build-time concern, not design. |

All design-relevant ACs are covered. AC5-AC7 are correctly out of scope for the creation dialog design.

---

## Verdict

Score 8/10. The design is above the 7-threshold and advances to architecture. The two WARNINGs (touch targets, label elements) should be addressed during build but do not block progression. W-3 (title derivation divergence) is an architecture concern more than a design concern.
