# Design Critique: AF12 (routine — 1 variant, light pass)

DESIGN-SCORE: 8/10  rounds=1

Routine workpackage: 4 surfaces, all extensions of existing components, component budget unchanged (19). 1-variant gate is appropriate — these are completions of shipped surfaces, not novel UX. Judged on (a) fit with the existing component family, (b) copy honesty, (c) state coverage.

### Fit with component family — PASS
All four surfaces reuse established patterns: overflow-menu item (Surface 1 mirrors existing `ship` no-confirm flow), `<dialog>` chrome + required-reason (Surface 2 reuses AppetiteDialog shell), `ConsequencePreviewDialog` unchanged structure (Surface 3), inline section between artifact-preview and Discussion (Surface 4 mirrors WorkTask's inline session list). No new design-system primitive. Activate is neutral, kill stays red — red-only-for-danger held. Rejected directions (dedicated Activate button, activation confirmation dialog, slider money input, sessions tab) are all rejected for real reasons, not strawmen. Good restraint.

### CRITICAL
- None.

### WARNING
- **[Surface 3 — kill copy cost honesty]** Same finding as architecture-critique WARNING #1. The copy `STOPS: In-progress tasks are killed and their active sessions stopped.` + `SAVED: Team capacity is freed immediately.` is honest at the DB/state level but a user reads "sessions stopped" + "freed immediately" as "cost stops now." AF12 only guarantees the DB truth; a live harness process (AF7's seam) may keep burning. Concept Decision 3 explicitly called this out as the thing to not over-promise. The copy is honest-by-omission, not honest-by-statement. **Fix:** add a short qualifier the design already half-reaches for — e.g. `(running agents finish their current step)` — or have the architect record that no line claims instant cost-stop and the copy unit test asserts the absence of any "immediately terminates / stops cost" phrasing. Don't ship "freed immediately" next to "sessions stopped" without disambiguating capacity (a counter, instantly freed) from cost (a process, not instantly stopped).

### SUGGESTION
- **[Surface 4 — empty/error/loading states]** State coverage is complete and is the core AC4 guarantee (empty = "No sessions yet.", not blank). Good. One gap: the design says loading may "render nothing or a single skeleton row" — "render nothing" risks a flash-of-empty that looks identical to the empty state for a beat, then pops to rows. Prefer the one-line "Loading sessions…" consistently (the design lists it as acceptable) so empty and loading are visually distinct. Lock it rather than offering "nothing or skeleton."
- **[Surface 2 — JPY/scale-0 step]** Design correctly specifies `step` by currency scale (`0.01` scale-2, `1` JPY). Confirm the amount `<input>` re-derives `step` and `min` when the currency `<select>` changes (switching to JPY mid-edit should drop the decimal step) — otherwise a user enters `12.50 JPY` and `Math.round(12.5 * 10**0)=13` silently. Honest, but flag the rounding in the field or block decimals when scale=0.
- **[Surface 1 — activate error slot]** The `role="alert"` line under the bet title (open-Q3 recommendation) is the right minimal affordance and matches the appetite dialog's inline-error pattern. Locked correctly by architecture §2. No issue.

### What's Working Well
- Copy refuses the cheap fix (weakening kill copy) in favor of making the cascade real — the honest *and* harder choice.
- State tables for every surface (default/empty/loading/error/in-flight) are present and map to AC4's "not permanently empty" guarantee precisely.
- Density/token discipline: 12px row padding, 6px sub-gaps, Hearth 6px grid, no new colors or motion. Touch targets ≥44px called out (AQ-015).
