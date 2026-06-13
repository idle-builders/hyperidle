# AH2 Design Critique — Constrained selectors

**Reviewer persona (Phase 2 evaluation). Producer = designer; this is independent scoring.**
**Surface:** Settings → Agents (per-agent Model + Harness selectors), Settings → Models (demoted system-default tier table).
**Artifacts read:** `brief.md`, `comparison.md`, `rejected.md`, `synthesis.md`, `approved.md`, `constrained-selectors/{spec.md, mockup.html, screenshot.png}`.

## Verdict: 8 / 10 — APPROVED for build (no CRITICAL; two WARNINGs addressable in build).

The direction is correct and disciplined: zero new components, two equal-weight `Select`s fed from live system truth, free-text harness eliminated. The mockup uses real design tokens (`--r-default`, `--surface-elevated`, `--border-default`, `--accent-primary`, warm palette) and the screenshot matches the design-system `Select` (verified: `Select.tsx` is `text-[15px]`, `rounded-[var(--r-default)]`, forest-green focus ring `0_0_0_3px_rgba(22,118,79,0.1)` — identical to mockup). The degraded-harness state (disabled flagged option + warning chip + Save block) is the genuinely new state and is handled visibly, not silently. Rejected directions are well-reasoned and the routine single-variant classification is justified (existing files, existing patterns).

## 9-dimension scoring

| Dimension | Score | Note |
|---|---|---|
| Spec alignment | 9 | Hits all 5 ACs at the UI layer: per-agent model, constrained harness (no text box), default-on-create (architecture wires seeds), current catalog labels, demoted Models table with explicit "system default" framing. |
| Hierarchy | 8 | Model→Harness left-to-right (brain→body) is a clean read; equal weight is correct. 3 fields on one desktop row is slightly busy but `flex-wrap` + `min-w` handle it. |
| Density | 8 | Net-neutral column swap (−Model Tier, +Model). No bloat. |
| State coverage | 8 | populated / loading / error / empty / overflow / degraded all specified. **Gap (WARNING-1):** no save-error surface for the server-side 422 (`UNKNOWN_HARNESS`/`UNKNOWN_MODEL`). |
| Anti-slop | 8 | No AI tells; reuses warm-token table + Select. The `●` in the warn chip is correctly downgraded to `StatusChip` in TSX (comparison.md flags the literal-bullet risk — good catch by the designer). |
| Component budget | 10 | Zero new components. Only swap is `<input>`→`Select`, already imported in both files. |
| Copy | 8 | "Harness unavailable", "System default models. Used only when an agent has no model of its own" — terse, guiding, no superlatives. |
| Motion | 8 | Zero new motion; inherits `Select` `--motion-fast` border transition. Appropriate. |
| Mobile / a11y | 6 | **WARNING-2:** AQ-005 (≥16px input font at ≤768px). Design-system `Select` base is `text-[15px]` (verified) — violates AQ-005 on mobile out of the box. Design flags it but punts to architecture; architecture (`Risks`) punts back ("bump to 16px OR accept existing pattern"). Neither owns it. Both `aria-label`s specified for the unlabeled-by-context selectors — good. |

## Findings

### WARNING-1 — No save-error state for server-side rejection
- **Location:** `approved.md` States section; `spec.md` "All states".
- **What's wrong:** The design specifies client-side Save-gating (Save disabled when selected harness is the disabled option). But the concept + architecture mandate a **server-side** 422 (`UNKNOWN_HARNESS` / `UNKNOWN_MODEL`) — e.g. when a harness de-registers between form-open and Save (CLI leaves PATH), or under a stale client. There is no specified UI for surfacing that 422. The user would hit Save and get silence or a generic failure — which is exactly the "silent failure" class AH2 exists to kill.
- **Fix direction:** Add a save-error state to the design: on 422 from POST/PATCH `/api/agents`, surface the `{ error }` message inline near the form actions (reuse the existing `text-error` / toast pattern already in these files). One line in the States table + a note that the form consumes the `{ error, code }` shape.

### WARNING-2 — AQ-005 ownership gap (≥16px mobile input font)
- **Location:** `approved.md` Mobile adaptation; `brief.md` Q on AQ-005; architecture `Risks` AQ-005 bullet.
- **What's wrong:** The two new `Select`s inherit `text-[15px]` (verified in `Select.tsx`), which fails AQ-005's ≥16px-at-≤768px rule (iOS zoom-on-focus). The design defers to architecture; the architecture defers back ("bump to 16px at ≤768px OR accept the existing settings-form pattern"). It is a real, verifiable violation that nobody has committed to fixing. This is the lowest-scoring dimension (6).
- **Fix direction:** Pick one and write it down: either (a) the two AH2 `Select`s get a `max-md:text-[16px]` (or `Select` `size` variant) so AH2's new controls comply, or (b) explicitly accept the existing settings-form non-compliance as out-of-scope with a follow-up note. Do not leave it as a hot-potato between design and architecture. (b) is acceptable given AH2 is desktop-primary, but it must be a stated decision, not a deferral.

### INFO — Overflow / long-id truncation
- The Model cell uses `truncate` + `font-mono`; full label shows in the open `Select`. Fine. Note `claude-haiku-4-5` alias is short, but if a full id (`claude-haiku-4-5-20251001`) ever surfaces in the cell, the 180px `max-width` truncate is the right call. No action.

### INFO — "Harness unavailable" lacks remediation
- Designer flagged in `spec.md` trade-offs: the warning chip says what's wrong, not how to fix. Acceptable for AH2 (founder re-picks from the constrained set); no action.

## Re-score guidance
Both WARNINGs are build-resolvable and neither blocks the build from starting. If the orchestrator wants the design doc itself amended: add the save-error state (WARNING-1) and a committed AQ-005 decision (WARNING-2). With those, this is a 9.

---

# Round-2 re-critique (2026-06-13) — verifying the 2 WARNING resolutions

**Re-scored against the revised `approved.md` + `constrained-selectors/spec.md`. Tokens re-verified live.**

## Round-2 verdict: 9 / 10 — APPROVED, proceed to build. No CRITICAL, no unresolved WARNING.

## Per-WARNING verdict

- **DESIGN-1 (save-error state for server 422) — RESOLVED.** A new **"Save error (server 422)"** state is now in the States table (`approved.md` line 40, `spec.md` line 29) and the component map (`approved.md` line 30): form stays open, values intact, server `{ error }` rendered inline above Save/Cancel as `<p className="text-[13px] text-[var(--status-error)]">`, clears on next field change or success, replacing the `showToast("Failed to save agent")` swallow. Covers all four codes (`UNKNOWN_HARNESS`/`UNKNOWN_MODEL`/`INCOMPATIBLE_HARNESS_MODEL`/`UNSUPPORTED_PROVIDER`) plus the de-register-between-open-and-Save race. **Coverage check against the round-2 422 set: complete** — the architecture's four codes (incl. ARCH-1's `INCOMPATIBLE_HARNESS_MODEL` and ARCH-3's `UNSUPPORTED_PROVIDER`) all map to this one inline surface; success + transport-level failures stay on toasts. No save-failure mode is left silent. Token verified live: `--status-error` is defined (`design-system/src/tokens.css:172/235/290`, themes + `_tokens.css`); `--color-error`/`text-error` confirmed dead (`ThreadSections.tsx:360` comment documents the same migration). Correct token choice. Architecture Task 9 wires the consume-`{error,code}`-and-render path with a mocked-422 component test.

- **DESIGN-2 (AQ-005 ≥16px mobile input) — RESOLVED.** Both AH2 `Select`s (Model + Harness, edit + add forms) get `className="max-md:text-[16px]"` (`approved.md` line 51, `spec.md` line 40, architecture Risks line 324 + Task 9). The hot-potato is gone: design owns the decision, architecture owns the wiring, both say so. Design-system `Select` base stays `text-[15px]` (global bump explicitly out of scope, stated, not deferred). Mobile/a11y dimension moves 6→8.

## NEW findings (round-2)
- None. The two resolutions touch only the States table, component map, and one className; no new component, no new motion, no new token. Anti-slop and component-budget unaffected (still zero new components — the save-error `<p>` is a plain element, not a component).

## Round-2 dimension deltas
- State coverage 8→9 (save-error state added and complete against the full 422 set).
- Mobile / a11y 6→8 (AQ-005 committed and wired).
- Others unchanged. Overall **9/10**.

**APPROVED — round 2.** `plans/AH2/design/approved.md` is the approved design. No CRITICAL, no unresolved WARNING. Proceed to build.
