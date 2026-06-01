# Design Critique: U9 — Screen Layouts

DESIGN-CRITIQUE: variant=single score=7/10  rounds=1  axes: H:8 S:7 T:8 C:7 Co:7 St:7 A:7 AS:8 PP:7

**Reviewed artifact:** `plans/U9/design/approved.md`
**Spec reference:** TRACK-U.md lines 329-365

---

## Dimension Scores

### 1. Visual Hierarchy — 8/10

The design establishes clear reading order across all pages. The page wrapper pattern (`flex flex-col gap-[var(--density-gap)] h-full`) is consistent. Section headings use the mono uppercase pattern (12px/600/tracking-caps/text-tertiary) which correctly recedes while content takes prominence. The bet grid card pattern (elevated surface + shadow-default) differentiates content cards from page chrome.

The "All bets" title uses the mono uppercase pattern which is correct for chrome headings. BetCards carry the visual weight. Team pills provide secondary navigation. The hierarchy reads correctly.

### 2. Spacing & Density — 7/10

All spacing references use Hearth tokens: `--density-gap`, `--density-card-pad`, `--space-2`, `--space-3`. The 6px grid is respected. The bet grid uses `gap-[var(--density-gap)]` which correctly responds to density presets. Cards use `p-[var(--density-card-pad)]`.

Pill filter bars use `gap-[var(--space-2)] mb-[var(--space-3)]` -- both on the 6px grid (6px gap, 9px bottom margin). The `shrink-0` on the pill bar prevents collapse.

### 3. Typography — 8/10

The section heading pattern uses `text-[12px] font-[family-name:var(--font-mono)] font-[600] uppercase tracking-[var(--tracking-caps)]` which is on-scale (12px in the allowlist, weight 600 in range). Body text uses density tokens. No off-scale font sizes detected in the spec.

### 4. Color Usage — 7/10

All colors reference semantic tokens: `--surface-elevated`, `--surface-container`, `--text-primary/secondary/tertiary`, `--accent-primary`, `--status-success/error`, `--shadow-default/elevated`. No hardcoded hex values in the design spec. Active pill uses `btn-primary` (forest green via DaisyUI theme). Inactive uses `btn-ghost`.

Status dots reference the 4-color Hearth status system which pairs color with shape (dot) and text (status label).

### 5. Component Coherence & Consistency — 7/10

The card surface pattern is consistent across all sections:
```
bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[var(--density-card-pad)]
```

The pill filter bar pattern is consistent across Conversations, Work Portfolio, and Knowledge List: same `role="tablist"`, same `btn btn-xs` styling, same active/inactive toggle pattern.

The hover lift pattern on bet cards (`hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition duration-[var(--motion-fast)]`) uses motion tokens correctly.

### 6. States & Feedback — 7/10

States are enumerated for most pages: empty, loading, error, populated. WorkPortfolio adds "filtered empty" state. Conversations lists 5 states (empty, loading, error, populated, thread detail). KnowledgeList adds "filtered empty."

Hover states specified for bet cards (lift + shadow transition). Motion uses `--motion-fast` token.

### 7. Accessibility — 7/10

Pill filter bars use `role="tablist"` with `role="tab"` and `aria-selected` on each pill. This is semantically correct for filter selection. The pill bar label uses `aria-label="Filter"`.

The section heading pattern uses `<h2>` semantic elements. Cards are interactive buttons with cursor-pointer.

### 8. Anti-Slop Check — 8/10

No AI-aesthetic tells detected:
- No purple/indigo palettes
- No oversized padding (max is `--density-card-pad`)
- No hero sections
- No gradient-on-text
- No glass morphism
- No 3-column identical card grid (bet grid is 2-column)
- No emoji icons
- The 2-column bet grid is the spec requirement, not a stock pattern

The rejection list explicitly locked out: Canvas/Kanban drag-drop, 3-column grid, tabs-instead-of-pills, cool-gray hover states, custom filter dropdown. Good.

### 9. Premium Polish — 7/10

Motion tokens used correctly (`--motion-fast`). Shadow tokens used (`--shadow-default` for cards, `--shadow-elevated` for hover/modals). Radius from closed scale only (`--r-default`, `--r-subtle`, `--r-pill`). Typography uses density tokens for responsive sizing.

---

## CRITICAL

1. **[approved.md:section 1d] Conversations "New Thread" button wiring is underspecified.** The design says the button "opens the RecipientPicker" but does not specify how the Conversations page (a child of AppShell's Outlet) will access the `setShowRecipientPicker` state that lives in AppShell. The architecture plan addresses this by proposing `onNewThread` on `AppShellOutletContext`, which is the correct resolution. The design should have specified the wiring mechanism rather than leaving it implicit. **Impact on builder:** The builder will need to follow the architecture plan, not the design spec, for this wiring. Acceptable because the architecture plan is the downstream authority.

2. **[approved.md:section 5a] Knowledge scope pills data source mismatch with spec.** The spec says "Specific scope pill filters at top -- concrete practices (e.g., 'Design', 'Frontend') and teams (e.g., 'Nimmly')." The design says scope pills will be "All", "Practices", "Products", "Factory" (the 3 fixed sidebar categories). These are parent categories, not concrete practices/teams as the spec requests. The design's open question #3 acknowledges this. The architecture plan resolves it correctly: use the 3 fixed scopes for v1, note that concrete-scope granularity requires backend changes (out of U9 scope). **This is a spec-design gap that the architecture plan bridges.** The builder should follow the architecture plan resolution.

## WARNING

1. **[approved.md:section 2] WorkPortfolio hover lift uses raw `translate-y-[-2px]`.** The 2px value is not on the 6px grid (AQ-001). However, this is a transform value, not a spacing value -- transforms are exempt from the layout spacing grid because they do not affect document flow. The design is technically correct but should document this exemption explicitly so the builder does not get flagged by lint. **Recommendation:** Add a `// hearth-internal-padding` or similar exemption comment in the implementation.

2. **[approved.md:section 2] Bet grid `BetCard` composition underspecified.** The design says "Each cell is a `<BetCard>` from the design system" but BetCard is a Tier 2 component with specific props (`title`, `status`, `progress`, `leadAvatar`, `budget`, `teamName`). The design does not specify which BetCard props are populated or how the data maps from the API response to BetCard props. The architecture plan provides the `BetListItem` type signature. **The builder must consult the architecture plan for prop mapping.**

3. **[approved.md:section 7] Settings pages coverage is vague.** The design says "Grep all settings files for old token references and replace" and "mostly DaisyUI-based so the token changes from U4 should already cover most styling." This is analysis-as-design. The design should explicitly list which settings files have old tokens and what the changes are. The architecture plan's Task 2 lists the 7+ settings files but also does not enumerate the specific token replacements per file. **Risk:** The builder will need to run the grep and make judgment calls about replacements. Low risk because this is mechanical token substitution.

4. **[approved.md:pill filter pattern] Pill filter bar pattern specifies `btn btn-xs` but the spec says the "New bet" button should also be `btn btn-xs btn-primary`.** These are two different button roles (filter toggle vs. action CTA) sharing the same size class. This is correct per the Hearth aesthetic (pills and small CTAs share the `btn-xs` sizing), but the design does not call out the intentional size equality between filter pills and action buttons. **No change needed, but the design should acknowledge this is intentional.**

5. **[approved.md:section 6c] KnowledgeDetail related sidebar border uses `border-[var(--border-subtle)]`.** This is correct, but the design does not specify which side the border appears on (left, right, top). The existing code likely has a specific border placement. **The builder should preserve the existing border placement and only migrate the token.**

## SUGGESTION

1. **[approved.md:section 2] Consider specifying the WorkPortfolio empty state illustration or icon.** The design says `EmptyState` with "No bets yet" + "New bet" CTA, but EmptyState supports an optional `illustration` or `icon` prop. An empty portfolio is a common first-time-user state and benefits from a visual cue beyond text.

2. **[approved.md:universal patterns] The page wrapper pattern could include `data-testid` in the template.** The design shows `data-testid="<page>-page"` in the example wrapper, which is good. All pages should consistently follow this pattern. The architecture plan's AC-12 verification grep depends on these testids being present.

3. **[approved.md:section 4d] Bet detail breadcrumb should specify keyboard accessibility.** The breadcrumb `Portfolio > [Team Name] > BET-123` uses link elements with `text-[var(--text-secondary)] hover:text-[var(--text-primary)]`. The design does not specify focus-visible styling for these links. DaisyUI's base link styling may handle this, but it should be explicitly verified.

---

## What's Working Well

1. **Consistent pattern language.** The universal patterns section (page wrapper, section heading, card surface, pill filter bar) creates a clear vocabulary that all 8 page sections reference. This reduces ambiguity for the builder.

2. **Thorough rejection list.** The locked rejection list (Canvas drag-drop, 3-column grid, tabs, cool-gray hovers, filter dropdown, inline team avatars in pills) documents decisions that were considered and discarded. This prevents the builder from re-proposing rejected approaches.

3. **Correct token migration map.** The Lucid-to-Hearth token mapping is complete and consistent with `packages/design-system/src/tokens.css` values. The mapping correctly handles edge cases: `--r2` merging into `--r-subtle` (both old 8px and 10px map to Hearth's 10px), `--ok` splitting into context-dependent `--accent-primary` or `--status-success`.

---

## Verdict

Score 7/10 -- meets the advancement threshold. The design is a well-structured restyling specification with consistent pattern language. The two CRITICAL findings are spec-design gaps that the architecture plan correctly bridges. The design can advance to implementation with the architecture plan as the authoritative technical contract.
