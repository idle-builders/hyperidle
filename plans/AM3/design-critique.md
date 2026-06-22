# Design Critique: AM3 — Session dial-in & activity view

DESIGN-CRITIQUE: variant=a-side-panel score=8/10  rounds=1  axes: H:8 S:8 T:8 C:8 Co:9 St:7 A:7 AS:9 PP:8

Evaluated cold from the three embodiment stories (`SessionDialIn{Side,Route,Overlay}.stories.tsx` + `sessionDialInFixtures.tsx`) and the design specs. Viewer (`:8098`) was down — scored from the TSX (the AJ1 design source of truth) + specs, all token usage traced statically. Memory honored: variants render the populated real state only; loading/empty/error deferred to build.

## Variant scores

| Variant | H | S | T | C | Co | St | A | AS | PP | Avg |
|---|---|---|---|---|---|---|---|---|---|---|
| **A — Side panel (CHOSEN)** | 8 | 8 | 8 | 8 | 9 | 7 | 7 | 9 | 8 | **8.0** |
| B — Inspector route | 8 | 7 | 8 | 8 | 8 | 6 | 8 | 8 | 7 | 7.5 |
| C — Overlay sheet | 8 | 8 | 8 | 8 | 9 | 8 | 9 | 9 | 8 | 8.3 |

C scores marginally highest on free behavior (DS `Dialog` focus-trap/scrim/mobile-sheet) but the synthesis correctly rejects it as primary: modal-blocking defeats steer-while-reading and sustained auditing. A best satisfies the load-bearing AM3 constraint (lower-level companion, not promoted, steer-while-reading). The placement decision is well-reasoned and the rejections are sound. No re-litigation.

## CRITICAL
- none (visual/design lens).

## WARNING
- **Token compliance — strong.** Every spacing value in all three stories is on the 6px grid `{3,6,9,12,18}`; every font-size on-scale `{11,12,13,17}`; every radius `--r-pill`/`--r-subtle`/`--r-default`; every color a semantic token (`--accent-primary`, `--surface-container`, `--text-tertiary`, `--border-*`); motion `--motion-fast`/`--motion-default`; scrim built via `color-mix` over `--surface-page`/`--text-primary` (no raw color). No AQ-008/018/001/004/011 violations. This is the no-color-change contract honored exactly.
- [SessionDialInSide.stories.tsx:51 / a-side-panel/spec.md:1,9] **Panel width mismatch — spec/story drift.** brief + spec say 420px ("narrow 420px panel"), synthesis says "target 460–480px", `approved.md` says 460px, the story uses `w-[460px]`. The drift is harmless (story wins, 460px is fine) but the spec text should be reconciled to 460 so the builder doesn't ship 420. → builder reads `approved.md`/story (460), not the stale 420 in `a-side-panel/spec.md`.
- [sessionDialInFixtures.tsx:222 `DialInControls`] **`boolean`/`number`/`text` controls not embodied.** The control row renders ONLY `select` options (model + the three selects). The descriptor type and the design intent both name `boolean`→Checkbox / `number`/`text`→Input, but the fixture descriptor declares no boolean/number/text option, so those branches are never rendered or visually proven. Design-acceptable (the AC2 proof is descriptor-driven control dispatch, proven in build), but the visual treatment of a toggle/input row inside the inline config band is unverified by any rendered variant. → builder must render + snapshot a boolean and a number/text control row in the production `DialInControls.stories.tsx`; do not assume the inline band reads cleanly with a Checkbox/Input until rendered.

## SUGGESTION
- [sessionDialInFixtures.tsx:188 `SelectControl`] Pill `<button>` height is `py-[3px]` + 12px text ≈ 24px tall — below the AQ-015 44px touch target at ≤1024px. Acceptable for a dense desktop config band, but the production component must meet the 44px floor at mobile breakpoints (the mobile-sheet adaptation). Flag for build.
- [sessionDialInFixtures.tsx:192 / model pills] Active/inactive pill states are well-differentiated (accent ring + `--accent-primary-dim` fill vs bordered secondary). But there is no focus-ring style on the pills/close button beyond default — A11y dimension docked to 7 across A/B because focus-move-on-open, focus-restore-on-close, and visible focus rings are all "deferred to build" per the specs. These are the riskiest deferrals; the build must not skip them (they are AC-adjacent: AC1 entry/exit UX). → ensure visible focus rings + focus management land in build; the design defers but must not drop them.
- [DialInHeader:310] Header hardcodes "Atlas" / "Wire passkey login" / "Ended · 1m 12s" as fixture literals — correct for a story, but the production header must be prop-driven (architecture's `SessionDialInProps.header` covers this). No action; noted for build fidelity.

## What's Working Well
- **Coherence (9).** The dial-in header deliberately mirrors `ConversationHeader` (Tag pill + `·` separators + agent/task + `StatusChip` + ✕), and activity renders through `PartList` — the SAME renderer the conversation uses. This is the AM1↔AM3 uniformity contract embodied correctly at the design layer: the sub-room reads as the same product, zero parallel renderer. `data-ds-component` markers present for the snapshot net.
- **Anti-slop (9).** No purple/gradient/glass/hero/3-col-grid/oversized-padding tells. Dense, purposeful, warm-token Hearth surface. The slide-over reads as an intentional drawer, not a generic AI panel. Diffs reuse the existing `diff` Embed → `ReferenceChip` rather than a bespoke diff card.
