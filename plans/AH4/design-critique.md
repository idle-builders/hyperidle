# Design Critique: AH4 — Add-agent placement affordance

DESIGN-CRITIQUE: variant=placement-in-context score=8/10 rounds=0 axes: H:9 S:9 T:8 C:9 Co:9 St:8 A:7 AS:9 PP:8

Verdict: **APPROVED** (8/10, no CRITICAL). Routine single-variant justified.

## CRITICAL
- None.

## WARNING
- **[approved.md:17 vs Select.tsx:78-81] Label source contradiction.** Design text says the Settings picker uses "the form's existing `.label` / `label-text text-[var(--text-secondary)]` pattern," but the `Select` primitive already renders its own associated `<label htmlFor>` (13px, `--text-primary`) when `label="Team"` is passed. The component-mapping table (approved.md:33) contradicts this by specifying `aria-label="Team"` (external-label path). Resolve to ONE before build. Recommendation: pass `label="Team"` to `Select` for built-in a11y association; accept its native label typography (design-system standard) rather than reproducing the form's ad-hoc `.label`.
- **[comparison.md:13 / placement-in-context/spec.md:33] A11y of disabled-Select states unverified.** Empty/loading/error states rely on a `disabled` Select with a placeholder option. A disabled control may not surface the reason ("No teams — run Setup") to a screen reader. Add `aria-describedby` hint OR keep the select enabled-but-empty so SR reads the guidance. Largest gap; pulls A11y to 7.

## SUGGESTION
- **[placement-in-context/spec.md:33] Error-state "create disabled until retry" has no retry affordance.** Define a retry control or change copy so the error state isn't a dead end.
- **[approved.md:26] Zero-teams explicit-orphan path.** Create with `teamId:null` while the picker shows a *disabled* "No teams" option means the user proceeds past a dead picker rather than actively choosing orphan. Make "create unassigned agent" an active affordance, or route to Setup. (Same as architecture Risk 3.)

## What's Working Well
- The two-register thesis (read-only KeyValue where context is fixed, Select where it's a choice) is semantically correct, not decoration. Correctly rejects the unified-picker that would lie about WorkTeam's fixed context.
- Zero new components. Both KeyValue and Select exist, are exported, and support exactly what the design asks. Reuse hard-gate satisfied by construction.
- Rejected alternatives (unified picker, new primitive, post-create assignment, inline team creation) each dismissed for sound spec-grounded reasons.
