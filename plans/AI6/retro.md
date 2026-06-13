# Retro: AI6 — "The design system holds itself to its own rules"

**Date:** 2026-06-13 | **Branch:** `feat/AI6-design-system-self-coherence` | **Commits:** 13 (design ×3 incl. 2 revisions, critique ×3, red, green, fix, review ×2)

---

## Key Observations

### Behavioral Coupling Missed in Plan-Authoring (Medium)
The slash-menu AC validated using a className-only fix for what is fundamentally a behavioral problem: `onMouseEnter={() => setSelectedIndex(index)}` couples pointer-hover into the selected state. Plan author wrote the fix without tracing the event chain to the state binding — behavior and chrome concerns were siloed. Critique r0 caught this, designer re-targeted to TabBar (which genuinely holds independent states). **Lesson:** pointer-event handlers must be verified during plan-authoring when writing visibility/className fixes for "hover vs selected" AC.

### Plan-to-Verify Fidelity Broken by False Green (High)
Builder reported e2e "verify passed" but 8/11 tests were unreachable: red tests authored against a lazy-rendered catalog that defaults to `modules[0]` and never navigated to components. Specs were written assuming the DOM structure would be present without validating the navigation path. Root cause is the missing primitive-host pattern (CC-018: when a primitive's consumers aren't built yet, e2e must have a host page or `test.fixme` placeholders). Code review surfaced this in Phase 4; verify should have flagged it in Phase 3. **Cost:** builder confidence in verify signal was broken. Verify continued running specs that failed silently (empty selectors timeout in Playwright without clear failure cause).

### Critique r0→r1 Oscillation on Validation (Medium)
Critique r1 surfaced a new issue introduced by design's r1 revision: the TabBar focus e2e assertion copied row two-tone logic (bg-mix) but TabBar uses text-color + border for two-tone. Assertion would fail on correct TabBar. This was introduced by the plan-revision process itself — the designer re-targeted to TabBar but copied row validation logic without re-validating the target's actual treatment. **Pattern:** when re-scoping validation to a different component, the assertion shape must be re-audited against that component's actual implementation, not copied from the old target.

### Outline-Width Lint Gap Left Real Divergence (Medium)
TabBar pill focus was explicitly named in the plan (`architecture.md:57: TabBar.tsx:40,73`) but line 73 remained `outline-[2px]` on first green pass (line 40 converged to `outline-1`). TabBar is the AC's reference implementation and now carries two divergent focus treatments — the exact self-contradiction the WP exists to end. No lint rule covers `outline-width`, so the divergence passed silent in linting. Fixed in Phase 4 code review, not in Phase 3 green. **Lesson:** when a component is the reference implementation (AC 1: "one focus treatment on every component"), divergence *within* that component is a critical gap that no linter catches yet.

### Plan-Authoring Clarity: Stream-of-Consciousness in Specs (Low)
Architecture critique r0 included a cell describing tracking-AC verification as unreviewable stream-of-consciousness ("is wrong… also wrong… correct"). Critique r1 required a rewrite to state only the decision. Verifiability (Dimension 9) failed even though the final answer was correct — the reasoning was presented as a thought-process rather than a clean, reviewable decision. **Pattern:** architecture cells that walk through multiple options should be authored as "considered A, B; chose C because X" not as live derivation. Critique can then evaluate the reasoning rather than trace the author's thinking.

### Reality Reconciliation Exemplary (CC-007 Success)
Plan made nearly 50+ file:line claims about existing code and all verified against source: `no-raw-tailwind-color.ts:43`, `util.ts:277`, `collectClassStringsFromJSXAttribute`, `RAW_TAILWIND_PALETTE`, lint-rule shapes, token values. This is the dimension most plans fail (silent drift between spec and reality). AI6 nailed it via aggressive spec-vs-source diffing at plan-time. **Lesson:** when verifying architectural claims, go beyond "does the file exist" — verify the function signatures, export names, and line numbers.

### Dual-Round Critique Defended Against Blind Spots (CC-009 Success)
Design critique r0 + architecture critique r0 + architecture re-critique r1 caught 5 separate real issues: slash-menu behavioral coupling, TabBar hover assertion shape, StatusChip ownership ambiguity, ESLint premise stale, and focus assertion scope. Single-pass review would have shipped 3+ rework-inducing bugs. **Lesson:** multi-round critique is not waste — it's the gate that catches authoring blind spots.

### Incomplete Implementation Accepted at Green (Medium)
HTML reference tracking migration (task 10) was authored in the plan and explicitly rejected deferral, but was skipped on first green pass. Plan author said "migrate ArtifactEmbed/Preview/Block.html"; builder never touched `.html` files. Gap between plan mandate and green completion was caught in code review (Phase 4), not red/green phases (Phase 2-3). **Pattern:** when a plan task lists specific file paths, DoD should verify the task-to-implementation binding via grep before issuing green. This is not a code-logic issue but a plan-contract compliance issue.

---

## Summary: What Changed This Cycle

| Phase | Finding | Impact | Status |
|-------|---------|--------|--------|
| R0: Design | Slash-menu hover/selected unsatisfiable | Blocked code | Revision → TabBar re-target (valid) |
| R0: Architecture | Tracking AC unreviewable; scrim token missing probe | Blocked green | Revision → rewrite AC cells; add `--scrim` |
| R1: Design | N/A (ratification only) | — | Clean |
| R1: Critique | TabBar hover assertion copied wrong pattern; StatusChip ownership | Blocked green | Revision → fix assertion; gate resolved |
| Green: Phase 3 | 8/11 e2e failing (spec authoring assumption, not impl) | Not caught | Code review → fix + rewrite specs |
| Green: Phase 3 | TabBar pill focus `outline-[2px]` (plan task missed) | Not caught | Code review → converge to `outline-1` |
| Green: Phase 3 | HTML tracking migration skipped (task 10 in plan) | Not caught | Code review → migrate 3 `.html` files |
| Review: Phase 4 | All 4 gaps fixed, 15/15 e2e passing | — | Done |

---

## Process Lessons

1. **Behavioral + Chrome fixes require event-chain verification.** Pointer events that drive state changes must be traced during plan-authoring, not discovered at critique.
2. **Primitive e2e specs must have a host surface or explicit `test.fixme`.** Red tests authored against lazy-loaded components fail silently (timeout on empty selectors). Plan must include host-page or quarantine pattern.
3. **Verify signal is only as strong as the assumptions it tests.** "Verify passed" for specs that never run = false green. Builder confidence broken until Phase 4 review.
4. **Plan-revised validation must be re-audited against new target.** Copying assertion logic across different components (row → TabBar) without re-checking the target's implementation introduces new bugs.
5. **Dual critique caught issues single review would have shipped.** This is a protected process — do not consolidate.
6. **Reference implementations must not contain the divergence they're supposed to fix.** TabBar's two-tone divergence (pill vs underline focus) undermines the AC it's supposed to prove.

---

## Candidates for `/compound`

- **CC-007** (Spec/reality drift): AI6 exemplified the fix (aggressive plan-time reconciliation); also flagged new class (behavioral state binding must be verified at plan-time).
- **CC-009** (Multi-agent review): Dual critique necessary; alone it ships 3 bugs.
- **CC-010** (TDD red-green): Red-phase assumptions about DOM lazy-loading must be validated; spec authoring gap revealed.
- **CC-014** (Verify fidelity): e2e specs failed silently (unreachable selectors); verify signal was false green.
- **CC-018** (Primitive-host gap): Emerging → Confirmed. Two workpackages now (L2, AI6) hit "primitives authored without host surface = e2e unreachable in red."
- **CC-020** (CI as in-band gate): Verify ran specs that never touched real DOM; code review caught it first.
- **CC-024** (Critique findings → plan revision): Critique caught 5 issues requiring revision before builder; process loop now in place.

---

## What Shipped

✓ 5 new design tokens (`--accent-primary-dim`, `--tint-success`, `--tint-warning`, `--tint-error`, `--scrim` probe)
✓ 2 new ESLint rules (`no-hardcoded-tracking`, `no-off-scale-duration`) + tests
✓ Focus convergence: `TabBar.tsx:40,73`, `Button.tsx:57` all `outline-1`
✓ Tracking migration: DS uppercase labels + StatusChip + HTML refs
✓ Color hardcoding eliminated: 18 component-file migrations
✓ Renderer parity: image/code/data/html/url-renderers converged to block/ chrome
✓ Motion: SearchField, NavItem, Toast, Checkbox → motion-scale tokens
✓ E2E proof: 15/15 specs passing (focus, hover-selected, renderer-parity, tokens)

**Verification:** `npm run check` PASS, `npm run lint` exit 0, `npm run test` 627 green, `npx playwright test AI6-*` 15 green.

