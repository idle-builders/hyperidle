# Variant A: Inline Accordion

**Constraint:** Stay close to existing patterns. Reuse the WorkTeam page's roster section and the inline-expand pattern from SettingsAgents. No new surfaces, no dialogs. The wizard lives inside the team page as a progressive disclosure accordion.

**Thesis:** The team page IS the agent management surface. Adding an agent shouldn't leave the page context. Each step reveals below the previous, building up the agent configuration like filling out a form -- the same pattern used in SettingsAgents inline edit.

## User story (1 sentence)

A team lead clicks "+ Add agent" in the WorkTeam roster section, and a multi-step form expands inline below the roster, walking them through role, identity, harness, and model tier without leaving the team page.

## Component composition

- **WorkTeam page** (existing): hosts the wizard inline in the roster section
- **EmptyState** (existing, Tier 2): zero-agent CTA with `action` prop for "Create your first agent" button
- **DaisyUI collapse/disclosure**: each step is a collapsible section that auto-opens when reached
- **DaisyUI form controls**: `select`, `input`, `textarea` -- all `select-sm`/`input-sm` styled
- **StatusChip** (existing, Tier 1): shows validation status per step
- **DaisyUI btn**: primary pill for "Next"/"Create", ghost for "Back"

No new custom components. The wizard is a local component inside WorkTeam (or a co-located file `AgentSetupInline.tsx` imported by WorkTeam).

## Information hierarchy

1. **Step indicator** -- current step number and label (e.g., "Step 1 of 4: Choose a role"). 12px uppercase tertiary, the Hearth section-header style.
2. **Step content** -- the actual form fields for the current step. Full visual weight. 15px body text for descriptions.
3. **Step summary** -- completed steps show a one-line summary (e.g., "Role: Product Manager"). Collapsed, 13px secondary text.
4. **Navigation** -- "Next" / "Back" / "Create" buttons. Right-aligned, pill-shaped.

## All states

### Empty (zero agents)
The roster section renders EmptyState with:
- **title:** "No agents on this team"
- **description:** "Add your first agent to start building with AI. The wizard guides you through setup in four steps."
- **action:** Primary pill button "Add first agent"

### Loading
Skeleton cards matching the roster row height (3 rows).

### Error
ErrorState with "Failed to load team" and retry.

### Populated (wizard open)
The roster section shows existing agents above, with the wizard form expanding below. Steps:

**Step 1 -- Role:**
- Grid of role cards (2 columns on desktop, 1 on mobile). Each card: role name (13px semibold), one-line description (12px tertiary). Cards use `surface-container` bg, `r-subtle` radius, `12px` padding.
- Three preset roles: "Product Manager" ("Shapes bets, writes pitches, defines done conditions"), "Practice Facilitator" ("Curates knowledge, coaches skills, maintains standards"), "Chief of Staff" ("Cross-team patterns, obstacle reports, principle stewardship").
- "Custom" card: "Custom role" ("Write your own soul prompt for a specialized agent").
- Selected card has `border-default` border + `accent-primary` left bar (2px).

**Step 2 -- Identity:**
- Name input (required, `input-sm input-bordered`, placeholder: "e.g., Atlas")
- Soul prompt textarea (pre-filled from template, 8 rows, `textarea-bordered text-sm`). For custom role, empty with placeholder "Describe your agent's personality, expertise, and approach..."
- Validation: name must be non-empty and unique within team. Red text below input if duplicate.

**Step 3 -- Harness:**
- Select dropdown populated from `GET /api/workers`. Shows adapter name and type. Default: first available.
- Below the select, a caption (12px tertiary) explaining: "The harness determines how the agent executes tasks. 'builtin' is simplest; 'claude-code' enables file editing."
- If only one harness is available, auto-select it and show "Only one harness available" note.
- Validation warning if no harness available (red text: "No harness adapters are registered. Start a worker process first.").

**Step 4 -- Model tier:**
- Three radio-style cards (similar to role cards but smaller): "Reasoning" ("Complex decisions, planning. Slowest, most expensive."), "Workhorse" ("Daily tasks, implementation. Good balance."), "Fast" ("Quick responses, simple tasks. Cheapest.").
- Default: "workhorse" (pre-selected).
- Validation: check `GET /api/model-gateway` to see if the selected tier has a configured provider. If not, amber warning: "The reasoning tier has no provider configured. Configure it in Settings > Models."

### Success (post-creation)
The wizard collapses and the new agent appears in the roster. A toast confirms "Agent created". Below the roster, a subtle card (surface-container, r-subtle, 12px padding) shows next steps:
- "Assign to a bet" (link to work/team/:teamId)
- "Create a routine" (future -- disabled with "Coming soon")
- "View profile" (link to future agent profile, or settings/agents for now)

### Overflow
If team already has 20+ agents, the roster scrolls. The wizard button stays visible at the bottom.

## Behavior

- **Accordion progression:** Clicking "Next" validates the current step and opens the next. Completed steps collapse to a one-line summary. Clicking a completed step's summary re-expands it for editing.
- **Escape:** Closes the wizard entirely, discarding state.
- **Focus management:** When a step opens, focus moves to the first interactive element in that step.
- **Keyboard:** Tab moves between form elements. Enter on "Next"/"Create" progresses/submits.
- **Template fetch:** When role is selected in Step 1, fetch `GET /api/agents/templates/:role`. Loading state: skeleton in textarea. Error: leave textarea empty with "Template unavailable" hint.

## Mobile adaptation

The accordion naturally stacks in a single column. Role and model-tier cards go single-column. The wizard occupies the full main pane (mobile three-tab layout: Conversations | Work | Knowledge -- this is under Work tab).

## Signature

The wizard lives INSIDE the team page. No context switch, no dialog, no new route. The team lead sees their roster, clicks "add", and the form grows right there. Completed steps fold up into summaries, giving a running config preview.

## Trade-offs

- **Scrolling:** With 4 steps expanded, the page gets long. On short viewports the user scrolls past the roster to reach later steps.
- **Context collision:** The wizard shares visual space with existing roster content. If the roster is long, the wizard is pushed below the fold.
- **No isolation:** Unlike a dialog, the wizard competes with other page content for attention. A team lead might get distracted by the roster or bets sections while in the middle of setup.
- **Re-entry:** If the user navigates away mid-wizard, state is lost (no persistence).
