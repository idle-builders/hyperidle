# Design Critique: AG4 — Desktop navigation

DESIGN-CRITIQUE: variant=a-inpane-header score=8/10  rounds=1  axes: H:9 S:9 T:8 C:8 Co:8 St:8 A:7 AS:9 PP:7

Critiqued against rendered mockup screenshots (`a-inpane-header/screenshot.png`, `b-shell-navstrip/screenshot.png`), mockup source, `DESIGN.md`, `tokens.css`, and `.claude/rules/aesthetic-quality.md`. Variant A is the approved direction; B scored 7.6 and was correctly rejected.

## Verdict
Approve with findings. The chosen shape (A + B's consolidation) is the right call and the screenshots confirm it: nav cluster + breadcrumb fold into the existing header, title stays visually dominant below, roots stay clean. Hierarchy/anti-slop are genuinely strong — zero AI tells, chrome recedes under content. Two real findings (contrast token, breadcrumb-link focus ring) must be carried into the DS component spec before build; both are cheap and the design already half-acknowledges the second.

### CRITICAL
- none

### WARNING
- **Breadcrumb link contrast violates AQ-010 (≥4.5:1).** `approved.md` line 59 and both mockups set breadcrumb segment text + separators to `--text-tertiary` (#9a8d7e = **2.85:1** on page in light mode; the token's own `@lore U3` in `tokens.css:159` says "decorative/hint only"). Non-current breadcrumb segments are interactive navigation **links carrying meaning** — content, not hints — so AQ-010 applies. Pre-existing in the hand-rolled breadcrumbs, but AG4 bakes it into a NEW Tier-1 DS component, which is exactly the moment to fix rather than enshrine. → Spec the `Breadcrumb` link segments at `--text-secondary` (#6b5d4d, the mockup already defines it but doesn't use it on crumbs); keep the `/` separator and the current (non-link) trailing segment as-is. Re-verify the hover `--accent-primary` state also clears 4.5:1.
- **Breadcrumb link focus ring is named but unspecified.** `approved.md` line 56 says "Breadcrumb links must [have a visible focus ring] too" but neither mockup gives the `.crumb a` elements any `:focus-visible` style, and unlike the cluster buttons they are NOT DS `Button`s (which already carry `focus-visible:outline … --accent-primary`, confirmed `Button.tsx:57`). Without an explicit token the keyboard-first AC-5 path lands on invisible focus. → Spec `Breadcrumb` link `:focus-visible` to reuse Button's ring (2px outset `--accent-primary`, offset 2px) so keyboard nav is honest.

### SUGGESTION
- **Forward-absent layout shift.** Design correctly omits Forward from DOM when no forward history (avoids a phantom affordance) but keeps Back disabled-but-present (stable). Net effect: the breadcrumb's left edge shifts ~31px the instant forward history appears (e.g. after a Back press). Minor, but worth a fixed-width cluster slot (reserve both button footprints, render Forward invisible-but-spaced) if it reads as jitter in the E2E screenshots. Not blocking.
- **Disabled-Back opacity 0.35 on a 2.85:1 base.** Disabled Back = `--text-tertiary` × 0.35 opacity — effectively ~1.5:1. That's acceptable for a *disabled* control (no contrast minimum applies to disabled elements per WCAG), but pair it with `aria-disabled`/`disabled` (mockup uses `disabled` — good) so it's programmatically conveyed, not color-only. Already covered in approved.md line 41; just confirm the TSX keeps the real `disabled` attribute, not a class-only fake.
- **Tabular-nums / tracking N/A here.** No numeric columns or uppercase chip labels inside the breadcrumb, so AQ-006/AQ-007 don't apply — correctly absent. (The `[ACTIVE]`/`[$4k appetite]` chips in the mock are existing StatusChip/budget badges, out of AG4 scope.)

### What's Working Well
- **Anti-slop and hierarchy are excellent.** The screenshot shows the founder's "one-way door" complaint solved without any generic-toolbar tell: chevrons are quiet ghost glyphs, breadcrumb is a thin tertiary line, the title owns the visual weight. Variant B's persistent strip (correctly rejected) would have pulled the eye to chrome-above-content and risked the AG2 dead-chrome read — the synthesis caught this and captured B's only real win (always-same-spot) by left-aligning the cluster instead. Good design-it-twice discipline.
- **State coverage is complete and honest.** default / disabled-back (deep-link) / forward-absent / loading (skeleton entity segment, instant structural segments) / root-no-nav / overflow-truncate are all enumerated in approved.md with the right trade rationale (disable Back for layout stability, omit Forward to kill phantom affordance). The deep-link state — Back disabled, breadcrumb fully present so Up never lies — is exactly the AC-4 requirement, designed not bolted on.
