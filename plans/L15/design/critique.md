# L15 — Design Critique

## Design Critique: L15 — Task Request Sheet (Variant C)

DESIGN-CRITIQUE: variant=sheet score=8/10 rounds=1 axes: H:9 S:9 T:8 C:7 Co:8 St:8 A:9 AS:8 PP:8

Verdict: PASS — every dimension ≥7. Approved design (`plans/L15/design/approved.md`) is shippable to architecture; the open coherence question (variant C sheet vs. existing PitchSelector inline-replace) and the L18-not-yet-shipped caveat are answered enough for this phase. Notes below are non-blocking.

### Per-dimension scores (with reasoning)

1. **Visual Hierarchy — 9.** At rest, zero added chrome — task title still wins. In the sheet, the eyebrow ("Task") + title + summary metadata read top-down; the "REQUEST" eyebrow then switches the user's mode of reading. Variants A (8) and B (5) confirmed via `variants.md` scoring.

2. **Spacing & Density — 9.** Zero per-card overhead at rest (drag chrome removed, no kebab added — Variant C is the same as A on this axis, both better than B). Sheet's intent rows use a clean vertical column and the textarea sits one row below; the approved spec calls out density tokens for row min-height.

3. **Typography — 8.** Spec calls "text-base font-medium" for title, uppercase eyebrow with `+0.02em` tracking (AQ-007), 16px input on mobile (AQ-005), and reuses `KeyValue`/`StatusChip`/`Tag`. One nit: the spec doesn't call out `font-variant-numeric: tabular-nums` for the optional `cost` value (AQ-006). Architecture should pin this.

4. **Color Usage — 9.** Sheet uses `--surface-2` shell, hover uses the `--surface-4 → --surface-3` step, error uses the existing toast `error` variant. No hardcoded values. No AI-tell colors.

5. **Component Coherence — 7.** Reuses `TaskCard`, `KeyValue`, `StatusChip`, `Tag`, DaisyUI `drawer/modal`. **Open question** the designer flagged (collision with `PitchSelector`'s inline-replace pattern in `WorkTeam.tsx:160-167`) is fair: the page already has one overlay shape. Sheet vs. inline-replace is a defensible tradeoff because the Sheet is per-row detail (different scope than PitchSelector's full-section view). Acceptable; would benefit from a single-line "why both" note in the approved doc next to "Rail / Conversations interaction".

6. **States & Feedback — 8.** Default, hover, focus, active, disabled (`Send request` until intent picked), loading (button spinner + intent rows disabled), error (sheet stays open with selection preserved), empty (no thread yet — handled by transparent thread creation). Mobile bottom-sheet variant called out. Missing: the empty/loading/error state of the *thread-resolution* round-trip itself (the few-hundred-ms gap between user clicking `Send request` and the thread create resolving). Minor — could surface as "Sending…" toast or skeleton inside the sheet body.

7. **Accessibility — 9.** `role="dialog"`, `aria-modal`, `aria-labelledby` to title, intent rows as `role="radiogroup"` / `role="radio"` with `aria-checked`, `aria-live="polite"` toast region, focus trap, ESC restores focus to trigger via `useRef`. Touch targets ≥ 44px. Keyboard order documented. Strong.

8. **Anti-Slop — 8.** Drawer-end is the boring, correct sheet pattern — no glass morphism, no purple gradients, no centered hero. The intent buttons being a vertical column avoids the 3-column-card-grid AI-tell. One watchful note: ensure no `rounded-2xl` or `rounded-3xl` slips into the sheet shell during build (use `--r2`/`--r3` tokens per AQ-011/AQ-101).

9. **Premium Polish — 8.** Tabular numerals on cost (AQ-006), 16px mobile input (AQ-005), letter-spacing on uppercase eyebrow (AQ-007), motion tokens for drawer slide-in (AQ-013), `prefers-reduced-motion` respected (AQ-014) — most are spec'd. The two that aren't explicitly called out: tabular-nums on cost and the cubic-bezier easing token. Architecture should pin both.

### CRITICAL
None.

### WARNING
- [approved.md §"Sheet contents"] Architecture spec should require `font-variant-numeric: tabular-nums` on the `cost` slot (AQ-006). Current spec inherits via `KeyValue` token defaults, but the doc should state it explicitly so the builder doesn't drop it.
- [approved.md §"Mobile"] Bottom-sheet path uses `rounded-t-[var(--r3)]` — verify `--r3` is the correct token (not `--r-pill`); `tokens.css` is the source of truth (AQ-011).

### SUGGESTION
- [approved.md §"Rail / Conversations interaction"] Add a one-line note explaining why Variant C sheet does NOT collide with `PitchSelector`'s inline-replace pattern in `WorkTeam.tsx`. The designer answered this in `variants.md` ("per-row detail vs. full-section view") — pulling that sentence into approved.md would close the coherence question for the next reader.
- [approved.md §"States & feedback"] Mention the in-flight state during thread resolution (the GET → create round-trip before the message POST). A subtle "Sending…" toast or button state would close the loop.
- [approved.md §"Closed intent vocabulary"] Consider showing the intent label exactly as the message text begins (e.g. label "Move to BLOCKED" → text "Request: move to BLOCKED.") — the small mismatch ("Move to BLOCKED" vs "Request: move to BLOCKED") is harmless but worth a one-line caveat that the prefix word "Request:" is template-glued, not part of the visible label.

### What's Working Well
- The Variant C scoring math (79/90 vs A's 76 vs B's 59) is honest — A is genuinely close, and the deciding factor (growth into L18's attached-thread surface without rework) is the right strategic frame.
- Every state (default, hover, focus, activation, loading, error, mobile bottom-sheet, ESC, focus-restore) is explicitly named with the mechanism. That's the difference between a design spec and a design vibe.
- The design respects the 19-component budget and avoids spawning a new design-system primitive — the Sheet is correctly scoped to `packages/web/src/shell/`.
