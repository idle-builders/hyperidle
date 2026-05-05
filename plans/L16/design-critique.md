# L16 — Design Critique

**Artifact reviewed:** `plans/L16/design/approved.md` (single variant — "Document section, no chrome").
**Method:** 9-dimension rubric, 0-10 each. Threshold: average ≥ 7. Two rounds (initial + post-fix).

## Per-dimension scores (final, post-fix)

| Dimension | Score | Rationale |
|---|---|---|
| Hierarchy | 9 | BetCard = data card; pitch = prose body; markdown's own headings supply hierarchy. The Pitch / Tasks / Comments h2 asymmetry is now explicitly acknowledged in the design doc with the "chrome labels are reserved for list-shaped sections" rule — a coherent system rationale, not an exception. |
| Spacing | 8 | Inherits parent `gap-3` (12 px); Block-internal `py-[6px]` supplies inter-block rhythm. No new spacing tokens. AQ-001/002 explicitly checked. |
| Typography | 9 | Fully delegated to Block + payload renderers (already token-clean from L2). No new font sizes. AQ-004 N/A. |
| Color | 9 | No card-on-card surface. AQ-008/009/012 pass. Anti-card stance is correct vs. the surface ladder. |
| Coherence | 9 | Explicit alignment with L23's anticipated knowledge-body consumer. Correctly defers L18's BlockHandle wiring per ACs. Fixture migration to `__fixtures__/` consistent with the architectural plan. |
| States | 9 | Empty / whitespace / oversize / unknown-kind / script-html cases enumerated and traced to source lines. `MalformedPitch` story added in this round to give the unknown-kind fallback visible coverage. |
| A11y | 7 | `<section aria-label="Bet pitch">`, inherited tabIndex + arrow stepping. Activation is intentionally a no-op (deferred to L18). The "focus lands on a block that announces no purpose" smell remains, but the deferral rationale is clear and tied to a concrete next workpackage. Acceptable; would lift to 8 once L18 wires `onOpenActions`. |
| Anti-slop | 10 | Refused chrome, refused redundant heading, refused "Read more" feature. Refused promoting `BetPitch` to a Tier-2 component. AQ-101–113 all pass. Exemplary restraint. |
| Premium polish | 9 | Token audit complete. The "absence is the message" empty-state stance is design-confident. `MalformedPitch` story added in this round closes the only previously-open coverage gap. |

**Average: 8.6 / 10**

## Top findings (resolved this round)

1. **States — `unknown` block fallback had no story coverage.** Resolved: `MalformedPitch` story added to `WorkBet.stories.tsx` (sized below 256 KB cap; exercises `parser-unrecognised` path).
2. **Hierarchy — Pitch/Tasks/Comments h2 asymmetry was unflagged.** Resolved: design doc now states the rule ("chrome labels are reserved for list-shaped sections; a body section earns no label"), turning the asymmetry from an apparent oversight into an explicit system convention.

## Findings still open (non-blocking)

- **A11y will lift on L18 landing.** When `onOpenActions` and `onCopyPermalink` get wired, the focus-without-purpose smell goes away. Captured here as a forward dependency, not a critique of L16.

## Verdict

**APPROVED**
