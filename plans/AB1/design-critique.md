# AB1 Design Critique — Agent Profile Page

**Reviewer:** Phase 2 Reviewer
**Artifact reviewed:** `plans/AB1/design/variants.md` + `plans/AB1/design/approved.md`
**Selected variant:** B (Priority-Weighted Sections with Health Banner)

---

## Dimension Scores

### 1. AC Fidelity — 8/10

**AC1 (accessible from team page, sidebar, org chart):** Route `/agents/:agentId` exists. AgentCard name click navigates there. Sidebar and org chart are explicitly noted as out-of-scope for wiring (sidebar = "future", org chart = click target). The AC says "accessible from" all three, but the design only wires the team page entry point in this workpackage. The route existing is necessary but not sufficient — if the sidebar and org chart never link to it, AC1 is partially unsatisfied. However, the spec's own validation scenarios only test team-page navigation, so this is a scope question, not a design failure.

**AC2 (complete operational picture):** Satisfied. All five data groups are visible sections in a single scrollable page. MCP configuration is surfaced via the Harness Capabilities badge row (MCP badge).

**AC3 (current status with session link):** Satisfied. StatusChip in header + "Running: {taskTitle}" link when active.

**AC4 (health signals with warnings):** Satisfied. Conditional banner + four trigger conditions. The banner is absent when healthy (not just hidden — absent from DOM). The spec asks for "failure rate trend, cost trend, idle duration, configuration validity." The design covers failure rate (7d), last-session crash, harness availability, and model config. "Cost trend" and "idle duration" from the AC are not directly surfaced as banner trigger conditions. Cost is null (honest decision per architecture), and idle duration is implicit from StatusChip("idle") but not shown as a duration value. Minor gap: the AC says "idle duration" as a health signal; the design only shows idle status, not how long idle.

**AC5 (harness capabilities):** Satisfied. Badge row with green/ghost styling.

**AC6 (link to Settings for editing):** The design specifies `Link to="/settings?section=agents"` as the "Edit in Settings" button target. However, `/settings` redirects to `/conversations?settings=open` (confirmed in `router.tsx` line 85), and the settings overlay always opens to the "profile" section by default (`useState<SettingsSectionId>("profile")` in `AppShell.tsx` line 105). There is no URL-driven mechanism to deep-link to the "agents" section. **The `?section=agents` query param will be silently dropped by the redirect.** The user will land on settings/profile, not settings/agents. The builder must either: (a) implement deep-link support for `?section=` in AppShell, or (b) change the link to `/conversations?settings=open` (which opens settings but to the wrong section), or (c) note this as a known limitation and file a follow-up.

### 2. Pattern Consistency — 8/10

The design correctly identifies the existing detail-page pattern (breadcrumb + stacked sections + uppercase headings + KeyValue pairs) and follows it. Components used (StatusChip, Tag, KeyValue, Avatar, Badge, Table, Collapse) are all in the existing vocabulary.

Two new layout patterns are introduced:
- Two-column KeyValue grid (existing pages use single column)
- Horizontal performance row (KeyValues in flex row instead of column)

Both compose from existing primitives via layout, not new components — acceptable. The conditional health banner is a genuinely new behavioral pattern (no other page uses a conditional warning block). It is well-justified for the "needs attention" use case.

One concern: WorkTeam and WorkBet use `bg-[var(--surface-container)]` sections with `p-[18px]` padding. The design's sections lack this — the approved design's section markup shows `section[aria-label=...]` with heading + content but no container styling. This inconsistency should be clarified: are sections styled as surface-container cards (matching WorkTeam) or bare sections? The variants.md does not specify this, and the approved design's HTML pseudo-code omits container styling for most sections.

### 3. Information Hierarchy — 9/10

Variant B's strongest feature. The conditional health banner ensures the most urgent information (degraded signals) appears first, but only when relevant. When the agent is healthy, the page leads with identity — the right default. The header consolidates name + status + category + role, which matches the three questions the page answers (what, how, does it need attention). Performance summary at the bottom in horizontal layout is appropriate — aggregate numbers are reference data, not primary.

### 4. Component Reuse — 9/10

Zero new custom components. Everything composes from existing primitives. The design explicitly maps each UI element to its source (StatusChip, Tag, KeyValue, Avatar, Badge, Table, Collapse, Button). The `HealthBanner` and `CapabilityBadge` are file-local helper functions, not exported components — correctly noted as not counting against the component budget.

### 5. State Coverage — 9/10

States documented: Loading (SkeletonCard), Error (ErrorState), Not found (EmptyState), Populated/healthy, Populated/degraded, Populated/active, Populated/idle, Populated/error, No sessions (EmptyState in activity), No skills (EmptyState in skills).

Missing: What happens when the soul prompt is null? The collapse disclosure shows "Not set" — good. What happens when the agent has no team (strategy/personal agents)? The KeyValue shows "Team: --" — good. What about when capabilities are unresolved (`resolved: false`)? The design doesn't explicitly state what happens to the capability badges when the harness type is unknown. The architecture returns `resolved: false` with all capabilities false — the badges would all show ghost/unsupported, which is correct behavior but should be documented.

### 6. Accessibility — 7/10

Strengths:
- Section `aria-label` attributes on every section
- Tab order follows visual order
- Session links and "Edit in Settings" button are focusable
- Collapse trigger is keyboard-accessible via DaisyUI default behavior

Gaps:
- The health banner has no ARIA role. A conditional warning that appears for degraded agents should have `role="alert"` or `role="status"` so screen readers announce it on page load. Without this, a screen reader user might not notice the banner.
- Tables lack `aria-label` on the `<table>` element. With two tables on the page (Skills and Recent Activity), screen reader users navigating by table landmark need a way to distinguish them.
- The "Edit in Settings" ghost button should have an accessible name that includes context (e.g., `aria-label="Edit agent configuration in Settings"`) since "Edit in Settings" is ambiguous without visual context.

### 7. Responsiveness — 7/10

The design specifies: two-column grid collapses to single column on mobile (viewport < 768px), horizontal performance row wraps to two rows. "Everything else stacks naturally."

Missing specifics:
- Tables on mobile: DaisyUI `table-xs` with 4-5 columns will overflow on narrow viewports. The design does not specify whether to use `overflow-x-auto` on the table wrapper or a different mobile layout (card-per-row). This is a real concern for the Skills table (5 columns: Skill, Access, Uses, Success rate, Last used).
- The breadcrumb + header layout may wrap awkwardly on very narrow viewports. The flex-wrap is specified but the stacking order is not.

### 8. Visual Density — 9/10

The design is appropriately dense for a data-heavy profile page. Merged identity/config section eliminates one heading. Collapsed soul prompt saves vertical space. Horizontal performance row compresses four values into one line. The `table-xs` size for skills and sessions keeps data compact. Badge rows use `gap-[6px]` which is on the Hearth 6px grid.

### 9. Simplicity — 8/10

The page could be described as: breadcrumb, optional banner, header, five stacked sections. That is simple. The conditional banner adds complexity but is well-motivated by the "needs attention" primary question. No tabs, no modals, no client-side state beyond the fetch hook.

One area of concern: the Skills table merges two data sources (`toolsForRole` + `userSkills`) which adds complexity in the data layer. But this is an architecture concern, not a design concern.

---

## Overall Score: 8.2/10

**Verdict: PASS.** The design is well-constructed, follows existing patterns with justified extensions, and satisfies all acceptance criteria with minor gaps.

## Findings for the Builder

### Must-Fix (blocking)

**F1. Settings deep-link is broken.** The "Edit in Settings" button links to `/settings?section=agents`, but the `/settings` route redirects to `/conversations?settings=open` and drops the `section` parameter. The builder must either: (a) add `?section=agents` support to the AppShell settings-open handler, or (b) link to `/conversations?settings=open` (which opens settings to the profile section, not agents — still wrong), or (c) accept the limitation and just link to `/conversations?settings=open` with a TODO for section deep-linking. Option (c) is acceptable for v1 given that the AC says "links to the Settings page for editing" — the profile section still has an agents nav item the user can click.

**F2. Health banner needs `role="alert"` or `role="status"`.** A conditional warning that appears for degraded agents must be announced by screen readers. Add the appropriate ARIA role.

### Should-Fix (non-blocking)

**F3. Idle duration not surfaced.** AC4 lists "idle duration" as a health signal. The design shows idle status via StatusChip but does not display how long the agent has been idle. Consider adding an "Idle since: 2h 15m" line to the header when status is idle.

**F4. Tables need `aria-label`.** Two tables on the page need distinguishing labels for screen reader table navigation.

**F5. Table mobile overflow.** The Skills table (5 columns) needs `overflow-x-auto` on its wrapper or a responsive strategy for narrow viewports.

**F6. Section container styling unclear.** Confirm whether sections use `bg-[var(--surface-container)]` card styling (matching WorkTeam/WorkBet pattern) or bare sections. The approved design pseudo-code is ambiguous.

### Observations (informational)

- The cost columns are honestly null (per architecture decision). The "Cost" column in the Recent Activity table and the cost values in Performance will show "--" for all sessions. This is correct and intentional, but the team lead may find it confusing. Consider a one-line explanation or tooltip: "Cost data not tracked at the session level."
- The health banner uses `bg-[rgba(200,60,30,0.04)]` — this is a hardcoded RGBA value, not a semantic token. This technically violates AQ-008 (no hardcoded colors). The builder should consider whether a semantic token exists or can be added, or justify this as an intentional one-off for the warning tint.
