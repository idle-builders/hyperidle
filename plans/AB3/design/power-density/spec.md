# Variant B -- Power Density

**Constraint:** Optimize for the single most common power-user task: scanning the roster to understand agent state, then editing one agent's soul. Cut everything else from the primary view; push it to a detail/secondary surface. Density and speed beat completeness.

**Thesis:** The 80% task is "scan roster, spot the agent I want, open soul editor." The roster rows should pack maximum signal into minimum space. The edit flow should open directly to the soul textarea -- not a settings form. Operational settings are secondary and collapsed.

## User story

A team lead glances at the roster, sees each agent's name, role, description, and category at a glance in compact rows. They click an agent and land directly in a soul-editing dialog with the description visible as context. Operational settings are behind a disclosure.

## Component composition

### Roster section (R3) -- compact cards

The roster section uses compact flat cards instead of the current minimal rows. Each agent is a clickable card:

- **Card container:** `bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[12px]` (flat card with border, not elevated). Clickable (opens dialog). Hover: subtle tint `rgba(44,36,26,0.02)`.
- **Layout:** Two-row within the card.
  - **Row 1:** Avatar (24px, agent-green) + Name (13px medium text-primary) + Category indicator (only non-team: a 6px colored dot -- green for strategy, amber for personal -- no text tag to save space) + Lead badge if applicable.
  - **Row 2:** Role description from AGENT_ROLE_CATALOG (12px text-tertiary, single line, truncated). This is the one-sentence description like "Engineer. Implements features, writes code, tests, deploys."
- **No explicit "Customize" button.** The entire card is the click target. The cursor changes to pointer. The hover state signals interactivity.
- **Card spacing:** 6px gap between cards.

### First-time hint

Same useHints pattern as Variant A but with terser copy:

- "Your strategy shipped these agents. Click any agent to review and customize."
- Ghost xs dismiss button: "Got it"

### Edit dialog -- soul-first

A dialog that opens directly to the soul editor with the agent's identity as context.

**Header:**
- Agent name (17px semibold, text-primary) + Role label (13px text-secondary) on the same line.
- Category: shown as Tag for strategy agents ("Strategy -- managed") in amber. Not shown for team/personal (they are fully yours -- no need to label the default).
- Below the name line: the role description from the catalog in full (13px text-secondary, up to two lines). This gives the team lead context for what this agent does before they edit the soul.

**Body -- soul takes 80% of the space:**

- Guidance text (one line, 12px text-tertiary): "Define personality, style, and values. The system provides tools, context, and knowledge."
- For strategy agents: amber-tinted inline note (12px): "Managed by strategy. Soul edits are yours; operational config may refresh."
- `<textarea>` -- 12 rows, full width. Pre-filled from current soulPrompt or template.
- Below textarea: if template exists and soul is empty, a ghost button "Load {role} template" that fills the textarea.

**Collapsible operational settings:**

- A `<details>` element with `<summary>`: "Operational settings" (12px uppercase tertiary, section header style).
- When expanded: three fields in a row (Harness select, Model tier select, Max sessions number input).
- For strategy agents: fields are readonly with a "(managed)" suffix in the label.
- Collapsed by default. Opens remember-state per session (not persisted).

**Footer:** Cancel (ghost) + Save (primary pill).

### Add custom agent

A text link below the roster: "Add a custom agent" (13px text-secondary, underline on hover). Opens the edit dialog in create mode:
- Name input at the top (not present in edit mode where name is the header).
- Role select replaces the static role label.
- Soul textarea pre-fills from template on role change.
- Operational settings expanded by default in create mode (no defaults to fall back on).

## Information hierarchy

1. **Agent name** -- primary, bold, the anchor of each card
2. **Role description** -- secondary, the "what does this agent do?" answer right on the card
3. **Category dot** -- tertiary, only for non-team (glanceable, not text-heavy)
4. **Soul textarea** (in dialog) -- primary editing surface, 80% of dialog space
5. **Role description** (in dialog header) -- context for editing
6. **Operational settings** (collapsed in dialog) -- tertiary, power-user

## States

### Roster section

- **Populated:** Compact cards with description visible. Glanceable.
- **Empty:** EmptyState unchanged.
- **Loading:** SkeletonCard.
- **First visit:** Hint card above roster.
- **Overflow:** If 6+ agents, no special treatment -- vertical scroll within the page section. Cards are compact enough that 6 agents take ~240px vertical.

### Edit dialog

- **Soul editing (primary):** Textarea dominates. Description gives context.
- **Settings expanded:** Three-field row appears below textarea.
- **Strategy agent:** Amber note visible. Settings fields readonly.
- **Loading agent data:** If soulPrompt requires fetch, skeleton in textarea area.
- **Saving:** Button spinner + disabled state.
- **Save error:** Toast.
- **Template available but soul empty:** "Load {role} template" ghost button below textarea.
- **Template loaded:** Button disappears, textarea fills. No undo -- user can clear and re-load.

### Add dialog

- **Initial:** Name input focused, role select at first team role, soul empty.
- **Role changed:** Template fetched and loaded into soul textarea.
- **Saving:** Same as edit.

## Behavior

- **Click card:** Opens edit dialog.
- **Escape / backdrop:** Closes dialog.
- **Tab order:** (In edit) Soul textarea -> details summary (Enter toggles) -> Harness -> Tier -> Sessions -> Cancel -> Save.
- **details toggle:** Keyboard Enter on summary expands/collapses. Animated height via `max-height` transition (var(--motion-default)).
- **Save:** PATCH, close, re-fetch. Toast.
- **"Load template" button:** Fills textarea. If textarea already has content, no-op (button hidden when non-empty).

## Mobile adaptation

Cards stack vertically as-is. Dialog becomes full-screen modal. Textarea gets more rows (fills available height). Details starts expanded on mobile (touch users are less likely to discover collapsed sections).

## Signature

**Soul-first editing with inline description context.** The roster shows the description on each card (answering "what does this agent do?"). The dialog opens to the soul editor immediately with the description repeated as header context. No detours through settings. The operational settings are discoverable but not in the way. The category distinction is a dot, not a label -- because for power users, the strategy-managed note in the dialog is where the real information lives.

## Trade-offs

- **Good:** Extremely fast scan-to-edit flow. Description visible on roster (no dialog needed just to understand). Soul editing is the clear primary action. Compact cards pack more signal per pixel.
- **Good:** The `<details>` collapse means the dialog is not overwhelming even with 4+ settings fields. Progressive disclosure done right.
- **Bad:** No explicit "Customize" button text -- relies on the entire card being clickable. Less discoverable for users who expect explicit action buttons.
- **Bad:** The 6px category dot is subtle. A user unfamiliar with the system may not understand the dot semantics without hovering (tooltip needed).
- **Bad:** The `<details>` element may feel unusual for users expecting all fields visible. Some users may not find operational settings without being told to expand.
