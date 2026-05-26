# Q1 Design Critique

**Reviewer:** Phase 2 Reviewer (producer/evaluator separation)
**Artifact:** `plans/Q1/design/variants.md`
**Recommended Variant:** C (Companion Rail)
**Round:** 1

---

## 9-Dimension Rubric Scoring

### 1. Problem-Solution Fit (8/9)

The design correctly identifies the three decisions at play (composition model, recipient picker, mode signaling) and explores them across three genuinely differentiated variants. Each variant represents a distinct composition philosophy (merged timeline vs stacked vs side-by-side), not superficial variations of the same idea. The weaknesses sections honestly diagnose the tradeoffs.

**Minor deduction:** The design does not explicitly address the AC "Observe mode is read-only -- the agent's session is not interrupted or notified by observation alone." While the implementation will handle this server-side, the design should note that no visual affordance indicates "you are observing silently" vs "you are participating" -- this distinction matters for user confidence.

### 2. Existing Pattern Reuse (7/9)

The design claims Variant C reuses the "existing companion pane pattern" from section 2.4 of the IA doc. I verified this claim against the codebase: **the companion layout does NOT exist in the web source today.** A `grep` for "companion" across `packages/web/src/` returns zero results. The IA doc describes it as a concept (section 2.4: "When an ArtifactView is complex, the main pane splits into companion layout"), but no implementation exists.

This is not fatal -- the IA doc IS the authoritative design reference, so building toward a described pattern is valid. But the design doc should not phrase it as "reuses an existing layout pattern" when it means "implements a layout pattern described in the IA spec that has not yet been built." The distinction matters for task planning and component budget accounting.

The inline submenu replacement pattern genuinely parallels PitchSelector (confirmed: PitchSelector is a Tier 3 region that replaces content in the submenu area). This reuse claim is accurate.

### 3. Component Budget Discipline (8/9)

The designer claims zero new budget slots consumed. This is reasonable:
- RecipientPicker: page-level composition (like PitchSelector), not a design-system primitive. Assembles SearchField + ThreadRow + DaisyUI parts.
- SessionActivityPanel: composition using KeyValue + StatusChip + DaisyUI tabs. Not a new Tier 2/3 component.

The claim holds under the budget rules ("No strict count enforced. Create new components only when necessary... Prefer composition inside existing components when possible"). These components don't earn Tier 2 status because they serve a single use site.

**Minor concern:** The filter tabs (All | Tools | Reasoning | Cost) within SessionActivityPanel are a local interaction pattern. If they eventually appear elsewhere, they should be extracted. For now, inline is correct.

### 4. State Completeness (9/9)

Excellent coverage. The design explicitly enumerates:
- Submenu states: thread list, recipient picker, picker+selected (3 states)
- Main pane states: empty, thread normal, thread+dial-in, thread+session-ended, not-found (5 states)
- Activity panel lifecycle: hidden -> streaming -> summary (with transitions)
- RecipientPicker: browsing, selected, sending (3 states)
- SessionActivityPanel: streaming, summary, error (3 states)

All standard UI states (empty, loading, error, populated) are addressed either explicitly or by delegation to existing components (ThreadShell handles its own loading/error).

### 5. Density & Spacing Alignment (8/9)

The design specifies:
- 4px vertical gap between activity rows (on-grid, AQ-001 compliant)
- 8px padding (within the 8-12px default per CLAUDE.md)
- `text-xs` monospace for activity entries (consistent with dense observation surface)
- `btn-xs` for the Dial In button

These respect the factory-dark density contract. The "observation surface -- maximum density" directive is appropriate for power-user tooling.

**Minor concern:** The 4px gap is aggressive. At `text-xs` with 4px gap, each row is approximately 20px tall. If tool calls arrive at 1/second, the auto-scroll will be rapid. The design does not specify whether auto-scroll pauses when the user manually scrolls up (standard chat behavior). This is an implementation detail but should have been noted.

### 6. Accessibility (7/9)

Good:
- `aria-live="polite"` on the activity panel
- Keyboard shortcuts defined (N, D, Escape)
- Roving tabindex for list navigation in recipient picker
- Tab from composer does NOT trap into activity panel (correct -- read-only surface)

Gaps:
- No mention of `role` or `aria-label` on the companion split regions. The left/right panes need landmark roles or `aria-label` so screen readers can announce "Thread messages" vs "Session activity."
- The "Live" badge (pulsing dot) should have `aria-label="Session active"` or equivalent -- purely visual animation carries no semantic meaning.
- The D keyboard shortcut for dial-in toggle: is this document-level? Does it conflict with other keyboard shortcuts when a textarea has focus? The design says "D in thread detail (when badge visible)" but does not specify how focus-context gating works.
- No mention of `aria-current` or equivalent for the selected filter tab.

### 7. Mobile & Responsive Handling (8/9)

The design makes a correct judgment call: session observation is desktop-first. The concessions are explicitly stated and justified:
- Recipient picker: full-screen overlay on mobile (works)
- Dial-in: not available on mobile (badge shows as FYI only)

The 500px minimum for the left column at 1280px viewports is acknowledged and compared to Slack's message width. This is defensible.

**Minor concern:** The spec says "form factors" include tablet. The design covers mobile (<768px) and desktop but does not address the 768-1024px tablet range. At 1024px with IconRail (48px) + Submenu (240px) + Rail (56px), the main pane gets ~680px. Splitting that 60/40 gives 408px/272px. The 272px right panel is narrow for activity content. This edge case is not discussed.

### 8. Anti-Slop / AI Aesthetic Avoidance (9/9)

No AI aesthetic tells detected:
- No gradients, no rounded-2xl, no oversized padding
- Dense monospace rendering for activity (authentic engineering tool aesthetic)
- Uses existing DaisyUI classes (btn-ghost, btn-xs, tabs-bordered, tabs-xs)
- The "pulsing dot" for live indicator is the only animation -- restrained and purposeful
- Color palette relies on StatusChip states (healthy) and base-300 borders -- no custom colors introduced

### 9. Variant Differentiation Quality (8/9)

Three variants represent genuinely different composition philosophies:
- A: merged timeline (single scroll, mixed data)
- B: stacked panes (vertical split, two scrolls)
- C: side-by-side (horizontal split, two scrolls)

Each has honest strengths/weaknesses analysis. The comparison matrix covers 10 dimensions. The recommendation is well-argued with 5 rationale points and 1 concession.

**Minor deduction:** Variant A's weaknesses are arguably overstated ("conceptual lie" about ephemeral data in timeline). Many chat applications successfully mix system events with messages (GitHub, Linear, Slack). The framing steers toward C. This is a design judgment call rather than an error, but the critique is that A deserved slightly more credit.

---

## Aggregate Score: 72/81 (8.0/9)

| Dimension | Score |
|-----------|-------|
| Problem-Solution Fit | 8 |
| Existing Pattern Reuse | 7 |
| Component Budget | 8 |
| State Completeness | 9 |
| Density & Spacing | 8 |
| Accessibility | 7 |
| Mobile & Responsive | 8 |
| Anti-Slop | 9 |
| Variant Differentiation | 8 |
| **Average** | **8.0** |

---

## Verdict: PASS (8.0 >= 7.0 threshold)

Variant C (Companion Rail) advances with the following conditions for the builder:

### Required Conditions (must be addressed in implementation)

1. **Landmark roles on companion panes.** The left (thread) and right (activity) regions must have `aria-label` or `role="region"` with accessible names.
2. **Live badge must have semantic label.** The pulsing dot "Live" indicator needs `aria-label="Active session"` (not just visual animation).
3. **Auto-scroll pause behavior.** When the user manually scrolls up in the activity list, auto-scroll must pause (resume on scroll-to-bottom). This is standard chat UX and must not be omitted.
4. **Keyboard shortcut focus gating.** The D shortcut must NOT fire when focus is inside a text input (textarea, input). Document-level shortcuts need `event.target` checks.

### Advisory Notes (recommended but not blocking)

- The "companion pane" is new implementation work, not a reuse of existing code. Plan accordingly -- the flexbox split is simple but the layout state management (open/closed, session detection) is the real complexity.
- Consider the 768-1024px viewport range in implementation. If the right panel drops below 250px, hide it (degrade to badge-only, like mobile).
- The design's "conflict resolution" note (section 2.4 companion used for artifact review AND session activity) is elegant but deferred. For Q1, if both states are active simultaneously, session activity wins (or defer this edge case to a follow-up).
