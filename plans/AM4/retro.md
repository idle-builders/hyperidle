# AM4 Retro — Harness detection & onboarding

**Date:** 2026-06-23  
**Workpackage:** AM4 — Harness detection & onboarding  
**Branch:** feat/AM4-harness-onboarding  
**Run status:** SHIPPED (docs phase complete)

## Cost Signals — Fresh-Context Observations

This retro captures process friction and decision-flow surprises observed across the AM4 pipeline run (24 commits: design → critique → founder-approval → build → review → fixes → docs). The observations log is in `.pipeline/retro-log/AM4.jsonl`.

### High-Severity Frictions

1. **Toggle decision flip-flopped (founder override → scope addition mid-build)**
   - Architecture-critique round 1 ruled: disable-toggle is WRONG. Reasoning: no runtime consumer reads a `harness.disabled` flag → dead state → don't ship a broken switch.
   - Plan decision locked: B2 (derived toggle, no persisted state).
   - Founder review (in-conversation, with real t3code screenshot): "No, restore the toggle as a real control."
   - Architect: corrected plan to B1 (persisted `harnessDisabled` + `select()` gate + write endpoint). Four wiring seams added.
   - Cost: multi-round reversal (critique→plan→founder→rework), scope addition surfaced mid-build (not pre-plan), added 4 backend tasks, toggle became a load-bearing control instead of a nice-to-have.
   - **Signal:** Founder's real reference image (t3code Providers UI) overrode architecture abstract reasoning. The reference UI showed a real toggle; the architecture critique didn't have access to it. Critique was reasoning about an abstractly-correct design (no consumer), not the actual user expectation. **Compound candidate:** reference materials should be baked into architecture critique, not just design critique.

2. **Phase 4 review found 5 production blockers**
   - Lint gate blockers: 5 `eslint-disable-next-line @typescript-eslint/no-explicit-any` in test files (rule not registered in ESLint config).
   - Dead code: CTA button in auth zone (native_cli_login path) never used; copyable command was the real affordance.
   - Dead mappers: `readinessToStatus`, `showsEnabledIndication`, `accessModeLabel` — no callers, stale after design evolved.
   - Undefined tokens: 5 status tokens (`--status-healthy`, `--status-behind`, `--status-paused`, `--status-blocked`, `--status-done`) used in code but not defined in token table.
   - Cost: fixes committed in a post-build round (afbd72ea), not caught at code-review gate.
   - **Signal:** Cleanup-task remnants + token-name correctness not validated until after build. Token-guard would have caught #4 at verify time. **Compound candidate CC-011 (lint inside verify before DoD)** applies here.

### Medium-Severity Frictions

3. **Initial design diverged from reference spec — revised after founder handoff**
   - Initial design (before critique): boxy cards with `--shadow-default`, 18px padding, loud `StatusChip` pills, no toggle, no re-detect.
   - Design-critique flagged affordance gaps but scored 8/10, passed.
   - Founder handoff (in-conversation): provided real t3code Settings → Providers screenshot (`Screenshot 2026-06-16 at 22.15.42.png`).
   - Design substantially revised: calm dense list (one bordered container, hairline rows, 12px padding, quiet status dots, real toggle).
   - Cost: late revision cycle after critique was already done. If `/design` had started from the reference image, initial direction would have been closer.
   - **Signal:** Spec references an external system (t3code); reference material should be a `/design` input, not a mid-run correction. `/design` skill template could demand "visual reference image from spec" as a check-in.

4. **Design-critique WARNING on toggle affordance not closed pre-build**
   - Critique found: toggle rendered for `unauthenticated` backends as permanently-disabled + always-off.
   - Issue: disabled switch next to "Sign in needed" reads as broken control, not "auth unlocks this."
   - Initial design did not disambiguate: should the toggle be absent? Static "Enabled" label? Deferred to B1?
   - Founder's real reference answered: toggle is real and interactive (the headline affordance on every provider row in t3code).
   - Cost: affordance ambiguity required a design iteration after critique.
   - **Signal:** Design critique should interrogate edge cases (unauthenticated + disabled toggle = confusing affordance) and demand a closure before marking PASS.

5. **Architecture-critique WARNING: runtime caps all-false in production — fixtures masked**
   - Production discovery does NOT run session probe (AM2 lore); re-detect re-runs same probe → `fileEditing: false, toolUse: false` for all backends.
   - Capabilities Fold would render "File editing: No / MCP: No / Sub-agents: No" in production.
   - Fixtures hardcoded `true` and masked the production shape.
   - Builder had to handle gracefully (render "Capabilities confirmed after first run" instead).
   - Cost: test fixture reality gap discovered at code review time, not earlier.
   - **Signal:** When fixtures hardcode "success" values that production won't have until a later workpackage (AM3), the critique should flag the gap and the builder should render the all-false shape. Compounds with CC-004 (wiring-gap / test-production disconnect).

6. **Architecture plan promised B2 but critique ruled it under-specified**
   - Plan: B2 (toggle is derived from `discovery.state`, no persisted state, non-interactive).
   - Critique ruling: B2 is under-specified. Toggle must be either (a) non-interactive "Enabled" status, or (b) deferred as B1 follow-up.
   - Architect's response: added B1 implementation (persisted `harnessDisabled` + wiring). Founder approved.
   - Cost: scope addition mid-implementation, not caught at architecture gate.
   - **Signal:** Critique findings are meant to feed back into plan revisions, but this one cascaded into a scope addition. The loop exists (approved.md recorded the reversal), but the mid-stream rework still consumed build effort.

### Low-Severity Frictions & Successes

7. **Focused architecture re-critique on toggle reversal prevented wiring bugs**
   - After founder approval of B1, architect re-critiqued the disabled-state wiring specifically.
   - Re-critique caught 4 real wiring seams before build: (1) disabledTypes caller-supplied (pool is DB-free), (2) builtin hard-exempted in select(), (3) discovery.disabled stamped at route layer, (4) POST /:type/disabled validates + rejects builtin.
   - Cost: ~1 hour of re-critique work. Benefit: 4 real bugs prevented before code.
   - **Signal:** Targeted re-critique on a decision delta (B2→B1) paid off. The four seams would have appeared as puzzle pieces during code review. Prevention > fix.

8. **Descriptor-driven contract held tight**
   - Architecture ruled: zero per-backend branching (no `type === "codex"` conditions in rendered surface).
   - Contract enforced in both UI mappers (statusLine, showsToggle, isEnabled, etc. — all derived from discovery.state, authAction, not family type) and backend wiring (seams are at route layer and select() level, not per-family logic).
   - Code review confirmed: no type-based branching in HarnessCard or harness-presentation.
   - Cost: none (contract held).
   - **Signal:** SUCCESS. Descriptor-driven architecture, enforced through mappers, stays clean even during mid-stream scope changes.

9. **Park→approve→resume gate worked as designed**
   - Workpackage parked at human-design-review gate (novel design, autonomous run).
   - Founder reviewed rendered variant in component viewer (live stories at :8098).
   - Approval recorded in approved.md with two locked rules.
   - Resume after approval: build phase.
   - Cost: park/resume coordination is built into pipeline skill.
   - **Signal:** SUCCESS. Human-design-review gate is fit for founder review cycles.

10. **Archive signal: lint promotion opportunity**
    - Architecture-critique SUGGESTION: promote manual "grep-for-`=== codex`" check to a real ESLint rule.
    - Critique noted it as optional. Opportunity: per CLAUDE.md "First Principle," static codebase properties (no-branching contract) should fail at `npm run lint`, not pass at code review.
    - Not a blocker, but a process lever for future workpackages that name contracts.

---

## Compound Candidate References

- **CC-004 (wiring gap):** fixture hardcoding production-unrealistic values → test green while runtime broken. AM4 surfaced at critique (all-false caps), resolved by builder rendering correct shape. Pattern re-confirmed.
- **CC-007 (spec/reality drift):** reference image (t3code Providers) should have been baked into `/design` input, not provided mid-run. Pattern re-confirmed.
- **CC-011 (lint inside verify):** stray eslint-disable-next-line + undefined tokens blocked DoD. Lint should run inside verify before DoD audit. Pattern re-confirmed.
- **New signal:** Reference materials in spec should trigger `/design` pre-check. Candidate for process rule.

---

## Summary for A/B Harness Runs

**Cost/friction profile:**
- 1 HIGH (toggle flip-flop + scope addition mid-build)
- 4 MEDIUM (design revision, affordance ambiguity, fixture gap, plan underspecification)
- 3 LOW (dead code, lint gaps, archive suggestions)

**Decision-flow:**
- Reference material (t3code screenshot) was handed mid-run, not at spec-in.
- Founder override on toggle (critique said no, founder said yes) was the right call but came late.
- Re-critique on wiring seams prevented bugs.
- Cleanup gaps surfaced at code-review gate (catch timing, not policy).

**Process levers to consider:**
1. Mandate visual references in spec intake for `/design` phase.
2. Extend architecture-critique template to include "reference materials consulted" checkpoint.
3. When critique suggests "optional" lint rules, promote to process if the contract is headline-level (e.g., no-branching).

**Strengths:**
- Descriptor-driven contract stayed clean.
- Human-design-review gate provided founder approval loop.
- Fine-grained commits kept logic flow tractable even with mid-stream changes.
- Focused re-critique prevented real bugs.

