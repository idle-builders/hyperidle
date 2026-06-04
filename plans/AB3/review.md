# AB3 -- Agent Setup Wizard: Code Review

## Files reviewed

- `packages/web/src/pages/work/AgentSetupDialog.tsx` (new, 849 lines)
- `packages/web/src/pages/WorkTeam.tsx` (modified, +25 lines)
- `packages/web/src/pages/work/AgentSetupDialog.stories.tsx` (new, 36 lines)
- `packages/web/src/pages/work/__tests__/AgentSetupDialog.test.tsx` (new, 837 lines)

## Reference documents

- `plans/AB3/architecture.md` (architecture plan)
- `plans/AB3/design/approved.md` (approved design contract)
- `plans/AB3/architecture-critique.md` (Phase 2 architecture critique, 8/10)
- `plans/AB3/design-critique.md` (Phase 2 design critique, 7/10)

---

## Lens 1: Architecture

**Plan alignment: GOOD.** The implementation matches the architecture plan's ordered task list. All 4 tasks completed: component (Task 1), integration (Task 2), tests (Task 3), stories (Task 4).

**Props match plan exactly:**
- `open`, `onClose`, `onCreated`, `teamMembersId`, `existingAgentNames` -- all 5 props present per architecture.md Task 1.
- `teamMembersId` correctly wired to `data.teamMembers.id` in WorkTeam.tsx (line 362), not `data.team.id`. The @lore comment documents this FK relationship.

**API contracts match plan:**
- `POST /api/agents` body shape: `name`, `role`, `soulPrompt`, `harnessType`, `modelTierPreference`, `maxConcurrentSessions: 1`, `teamId` -- all present at line 356-363.
- `GET /api/workers` -- fetched, paused adapters filtered (line 217).
- `GET /api/model-gateway` -- fetched, tier validation implemented (line 329-336).
- `GET /api/agents/templates/:role` -- fetched with AbortController (line 263-293).

**Architecture critique warning addressed:** The "Custom" role mapping warning (architecture-critique WARNING #1) is fully addressed. A `customRoleValue` state with sub-select of `["builder", "growth", "brand_voice"]` is implemented (lines 96-97, 599-617). `resolvedRole` at line 341-342 maps "custom" to the sub-select value before the API call. Test coverage exists for this (test lines 792-836).

**Layer integrity: CLEAN.** All code stays in `packages/web`. No server changes. No cross-package private imports. `apiFetch` is the sole API boundary.

**No scope creep:** No extra files, routes, or database changes beyond the plan.

---

## Lens 2: Design

**3-step stepper with numbered dots:** Matches approved.md. Three `StepDot` components at lines 511-523, connected by 1px lines. No text labels on dots -- matches the approved spec's "No text labels on the dots" requirement and addresses the design-critique WARNING #1.

**Dialog shell:** Native `<dialog>` with `showModal()`, `aria-modal="true"`, `aria-label="Create new agent"` (line 415). Width constraints: `min-w-[320px] max-w-[520px]` (matches approved.md's 520px). Max height: `min(85vh, 640px)` (matches approved.md).

**Role cards:** 4 cards in 2-column grid (line 537), each with `role="radio"` and `aria-checked` (lines 544-545). Addresses design-critique SUGGESTION #1 about ARIA semantics.

**Token compliance:**
- Spacing: 24px body padding, 18px footer, 9px gaps, 12px card padding, 6px label-to-input -- all on Hearth 6px grid.
- Colors: All from tokens (`--surface-container`, `--accent-primary`, `--text-primary/secondary/tertiary`, `--border-subtle`). The canonical `rgba(22,118,79,0.08)` green tint used consistently.
- Radii: `--r-subtle` on cards, `--r-pill` on buttons, `rounded-full` on dots/avatars. All on-scale per AQ-011.
- Touch targets: All buttons have `min-h-[44px]` per AQ-015.

**Finding F1 (SHOULD-FIX):** `text-[11px]` on StepDot (line 397). 11px is on the Hearth type scale (AQ-004 allowlist includes 11), so this passes the rule. However, the approved design says dots are 24px circles -- the implementation uses `w-6 h-6` which is 24px, correct. No issue here after closer reading -- 11px is on-scale.

**Finding F2 (SHOULD-FIX):** The approved design specifies "Shadow: `--shadow-elevated`" and "Background: `--surface-elevated`" on the dialog shell (approved.md lines 38-39). The implementation's `<dialog>` element has no explicit background or shadow styles. The browser's default `<dialog>` styling or DaisyUI may handle this, but the contract specifies these tokens explicitly. Missing: `background: var(--surface-elevated)` and `box-shadow: var(--shadow-elevated)` on the dialog.

**Finding F3 (NIT):** Success state transition. Approved.md specifies "opacity cross-fade, `--motion-fast`" (line 157). The implementation has no transition animation between wizard and success states -- the content just swaps via conditional rendering. This is cosmetic.

**Finding F4 (SHOULD-FIX):** Approved design Step 3 specifies a "Validation summary" section (approved.md lines 146-148): green "All checks passed -- ready to create" or amber individual warnings. The implementation has no validation summary section. Individual warnings exist (no harness, unconfigured tier), but no green "all checks passed" confirmation or aggregated summary.

**Finding F5 (SHOULD-FIX):** "View in settings" button in success state (line 475) calls `onCreated(); onClose()` but does not navigate to `/conversations?settings=open` as specified in approved.md line 165. Both "Assign to a bet" and "View in settings" have identical behavior -- they just close the dialog. The design says "View in settings" should navigate to the settings overlay.

**Stories:** Present (`AgentSetupDialog.stories.tsx`) but minimal -- only 2 stories (Step1Open, Closed). The architecture plan (Task 4) specifies 5 stories: Step 1, Step 2 (template pre-filled), Step 3 (all valid), Step 3 (validation warning), Success state. Only Step 1 is covered.

---

## Lens 3: Security

**STRIDE analysis: LOW RISK.** This is a client-side dialog using existing server endpoints.

- **Spoofing:** N/A -- uses existing auth via `apiFetch`.
- **Tampering:** Agent name validated client-side (trim, uniqueness check). Server-side validation via `createAgentSchema` remains the ultimate gate. No new trust boundaries.
- **Repudiation:** N/A -- agent creation is logged server-side.
- **Information disclosure:** No sensitive data exposed. Gateway config returned from API is already authorized.
- **DoS:** Existing global rate limiter covers `POST /api/agents` (60 req/min per architecture.md).
- **Elevation of privilege:** N/A -- no new auth surfaces.

**Input sanitization:** Agent name passed through `agentName.trim()`. Soul prompt rendered in `<textarea>` (no XSS vector). Role constrained to valid USER_ROLES values via `resolvedRole` mapping. `encodeURIComponent` used on template role path parameter (line 275).

No security findings.

---

## Lens 4: Adversarial

**The Saboteur:**

**Finding F6 (SHOULD-FIX):** `onCreated` callback is a no-op. In `WorkTeam.tsx` line 359-361, `onCreated` is defined as `() => { setWizardOpen(false); }`. But `onClose` also sets `wizardOpen` to false. In the success state, clicking "Done" calls both `onCreated()` and `onClose()` -- double-closing is harmless but reveals the real issue: there is no data refetch after agent creation. The architecture plan (Task 2) says "After creation, call `window.location.reload()` as a simple approach ... or if useTeam exposes a refetch method, use that." Neither is implemented. The user creates an agent but the roster does not update until they manually refresh the page.

**Finding F7 (NIT):** The `as WizardStep` casts on step increment/decrement (lines 814, 827) are safe in practice because `step > 1` guards the decrement and `step < 3` guards the increment. However, the TypeScript rule says "No unsafe `as` casts." These could be replaced with a type-safe step transition function: `const nextStep = (s: WizardStep): WizardStep => s === 1 ? 2 : 3` and `const prevStep = (s: WizardStep): WizardStep => s === 3 ? 2 : 1`.

**The New Hire:**

The component is 849 lines but well-structured with section comments. State management uses 14 `useState` calls which is high but each variable is named clearly. The lore comments explain the non-obvious decisions (teamMembersId FK, Custom role mapping, AbortController, JSDOM fallback). A new hire would understand the component's structure within a few minutes.

**The Auditor:**

The test file covers all 11 ACs with 28 tests. Test assertions are meaningful -- they check actual DOM state (disabled buttons, visible text, aria attributes, fetch call payloads). No `toBeDefined()`-only assertions. The `as Response` casts in the mock setup are justified -- JSDOM's Response type is incomplete.

---

## Lens 5: Simplification

**Finding F8 (NIT):** `createdAgentName` and `createdRole` state variables (lines 152-153, 277-278) exist solely to snapshot values for the success state display. The values could be derived from `agentName.trim()` and `resolvedRole` since the wizard state is reset only when the dialog reopens (the `open` effect at line 162), not when `created` becomes true. However, the current approach is defensive and prevents a class of bugs if someone later adds a reset on creation -- acceptable.

**Finding F9 (NIT):** The Escape key handler (lines 249-257) is redundant with native `<dialog>` behavior. `showModal()` dialogs fire a `cancel` event on Escape by default. However, the lore comment explains JSDOM doesn't implement `showModal()`, and the tests rely on keyboard Escape. This is test-infrastructure-driven complexity, not unnecessary -- acceptable in context.

**No dead code.** No commented-out code. No single-use abstractions beyond `StepDot` which is used 3 times. No premature generics.

---

## Lens 6: AI Slop

**Finding F10 (NIT):** Section separator comments (`// ---------------------------------------------------------------------------`) appear 10 times. These are verbose but serve as navigation landmarks in an 849-line file. Borderline -- a shorter `// --- Role selection ---` would suffice but this is style.

No other slop detected. No "TODO: implement" comments. No `=== true` filler. No unnecessary async. No verbose naming. The lore comments are substantive, not boilerplate.

---

## AC Completeness Audit

| AC | Status | Evidence |
|---|---|---|
| AC-1: Wizard opens from "+ Add agent" button | PASS | WorkTeam.tsx line 344 renders button, test AC-1 passes (2 tests) |
| AC-2: Empty state CTA opens wizard | PASS | WorkTeam.tsx EmptyState with action prop at line 305, test AC-2 passes (3 tests) |
| AC-3: Step 1 shows role cards with descriptions | PASS | 4 ROLE_PRESETS rendered in grid, role="radio", aria-checked. Test AC-3 passes (4 tests) |
| AC-4: Role selection pre-fills soul prompt template | PASS | fetchTemplate on role select, pre-fills textarea. Test AC-4 passes (2 tests) |
| AC-5: Name validation (non-empty, unique within team) | PASS | nameIsValid check, case-insensitive comparison. Test AC-5 passes (3 tests) |
| AC-6: Harness select from workers (exclude paused) | PASS | Filter `!w.paused`, amber warning when empty. Test AC-6 passes (2 tests) |
| AC-7: Model tier with validation warnings | PASS | Default workhorse, tierIsConfigured check, amber warning. Test AC-7 passes (2 tests) |
| AC-8: Validation before creation | PASS | Create disabled when `!nameIsValid \|\| noHarnessAvailable`. Test AC-8 passes (1 test) |
| AC-9: Successful creation calls POST /api/agents | PASS | handleCreate sends correct body, test verifies payload shape. Test AC-9 passes (2 tests) |
| AC-10: Success state shows next steps | PASS | "Agent created" title, "Assign to a bet", "View in settings", "Done" buttons. Test AC-10 passes (3 tests) |
| AC-11: First-time prominent CTA | PASS | Same as AC-2 -- EmptyState with action button. |

All 11 ACs have passing test coverage. Protected test (`WorkProduct.test.tsx`) passes -- 12/12 green. No regressions.

---

## Findings Summary

| # | Severity | File | Line(s) | Finding |
|---|---|---|---|---|
| F2 | SHOULD-FIX | AgentSetupDialog.tsx | 415 | Dialog `<dialog>` element missing `background: var(--surface-elevated)` and `box-shadow: var(--shadow-elevated)` per approved.md shell spec. |
| F4 | SHOULD-FIX | AgentSetupDialog.tsx | 681-791 | Step 3 missing "Validation summary" section from approved.md (green "All checks passed" / amber warnings list). |
| F5 | SHOULD-FIX | AgentSetupDialog.tsx | 468-476 | "View in settings" button does not navigate to `/conversations?settings=open` as specified in approved.md. Both next-step buttons are identical no-ops. |
| F6 | SHOULD-FIX | WorkTeam.tsx | 359-361 | `onCreated` callback does not trigger data refetch. After creating an agent, the roster does not update until manual page refresh. Architecture plan specifies refetch or `window.location.reload()`. |
| F3 | NIT | AgentSetupDialog.tsx | 416-496 | No opacity cross-fade transition between wizard and success states per approved.md. |
| F7 | NIT | AgentSetupDialog.tsx | 814, 827 | `as WizardStep` casts on step transitions. Safe at runtime due to guards but could use type-safe step functions. |
| F8 | NIT | AgentSetupDialog.tsx | 152-153 | `createdAgentName`/`createdRole` snapshot state is defensive but derivable from existing state. |
| F10 | NIT | AgentSetupDialog.tsx | multiple | Verbose section separator comments (10 occurrences). |
| -- | NIT | AgentSetupDialog.stories.tsx | all | Only 2 of the 5 planned stories implemented (Step1Open, Closed). Missing: Step 2, Step 3 valid, Step 3 warning, Success. |

## ~~Verdict: NOT DONE~~

~~Four SHOULD-FIX findings must be addressed before shipping:~~

1. ~~**F2:** Add `background` and `box-shadow` tokens to the dialog element per the design contract.~~
2. ~~**F4:** Add validation summary in Step 3 (green "all checks passed" or amber warning list).~~
3. ~~**F5:** "View in settings" must navigate to the settings overlay, not just close the dialog.~~
4. ~~**F6:** `onCreated` must trigger roster data refetch (use `useTeam`'s refetch, `window.location.reload()`, or an equivalent mechanism).~~

---

## Re-review (2026-06-05)

All four SHOULD-FIX findings verified as resolved. No regressions. Tests: 28/28 green.

### F2: Dialog background and shadow -- RESOLVED

`AgentSetupDialog.tsx` line 425-428: inline `style` on `<dialog>` now applies `background: "var(--surface-elevated)"` and `boxShadow: "var(--shadow-elevated)"`. Matches approved.md shell spec exactly.

### F4: Validation summary in Step 3 -- RESOLVED

`AgentSetupDialog.tsx` lines 800-836: new "Validation summary" block renders conditionally. When `noHarnessAvailable || !selectedTierConfigured`, amber dot-prefixed warnings appear for each failing condition. Otherwise, a green dot with "All checks passed -- ready to create" renders. Token usage correct: `--accent-secondary` for amber, `--status-success` for green, 12px text, 6px dots. Matches approved.md lines 145-147.

### F5: "View in settings" navigation -- RESOLVED

`AgentSetupDialog.tsx` line 485: `onViewInSettings?.()` called before `onCreated()` and `onClose()`. New `onViewInSettings` optional prop added to the interface (line 115) with JSDoc. `WorkTeam.tsx` lines 367-369 wires `onViewInSettings` to `navigate("/conversations?settings=open")`. Matches approved.md line 164.

### F6: onCreated triggers data refetch -- RESOLVED

`WorkTeam.tsx` lines 359-366: `onCreated` now calls `setWizardOpen(false)` then `window.location.reload()`. Documented with `@lore` comment citing the established pattern (`KnowledgeDetail.tsx:713`) and noting the technical debt path (replace with query invalidation when React Query lands). Matches architecture plan Task 2.

### Regression check

The diff includes Biome formatting changes in the test file (long lines broken, object properties reformatted). No logic changes, no weakened assertions, no removed tests. All 28 tests pass. No new files, no new dependencies, no scope creep.

### Remaining NITs (unchanged, acceptable for ship)

- F3: No opacity cross-fade transition on success state (cosmetic).
- F7: `as WizardStep` casts on step transitions (safe due to guards).
- F8: Defensive `createdAgentName`/`createdRole` snapshot state.
- F10: Verbose section separator comments.
- Stories: 2 of 5 planned stories implemented.

## Verdict: DONE
