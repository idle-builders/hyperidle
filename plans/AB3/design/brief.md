# AB3 Design Brief

DESIGN-CLASS: novel  ref=none  pattern=none

## User task

A team lead opens their team's Work page. The roster section shows agents that were auto-provisioned by the strategy based on team functions. The team lead needs to:

1. **Understand** what each agent does (role, description, category)
2. **Customize** the soul (personality/style/values) for agents they want to tune
3. **Distinguish** team agents (fully theirs) from strategy agents (managed, soul-editable) from personal agents (fully theirs)
4. **Adjust** operational settings (harness type, model tier) when needed
5. **Add** a custom agent from scratch (10% power-user flow)

The primary flow (90%) is understand-then-customize existing agents. The secondary flow (10%) is create-from-scratch.

## Key design decisions

**Editing surface:** Native `<dialog>` element for the edit flow. The team page is a multi-section layout (header, burn, bets, roster, artifacts). Inline expansion would disrupt the page structure. Dialog isolates the editing context.

**Data enrichment:** The roster section currently shows only name, role, and lead badge. AB3 enriches this with: role description (from AGENT_ROLE_CATALOG, resolved client-side), agent category badge, and a "Customize" affordance. The soulPrompt and operational config are fetched on demand when the edit dialog opens (via GET /api/agents or a dedicated endpoint).

**Category-aware editing:** The edit dialog adapts by category:
- **Team agent:** Fully editable. All fields open. No warnings.
- **Strategy agent:** Soul editable. Operational config visible but marked as strategy-managed. A note: "This agent is managed by your strategy. Soul edits are yours; operational config may be refreshed on strategy updates."
- **Personal agent:** Fully editable. No warnings.

**First-time experience:** The existing useHints system provides a one-time "Review & customize your agents" hint above the roster section on first visit. Each agent row has a persistent "Customize" affordance (not gated by hint dismissal).

**Add custom agent:** A secondary button ("+ Add agent") below the roster opens a create dialog with role selection, name, soul prompt (pre-filled from template when available), harness, and model tier.

## Existing components used

- **Avatar** (agent avatar with green tint, per AQ-012)
- **Button** (pill, primary/secondary/ghost variants)
- **StatusChip** (not used for agent status yet, but relevant for category badges)
- **Tag** (for category labels: "Team", "Strategy", "Personal")
- **KeyValue** (for operational settings display)
- **EmptyState** (when roster is empty)
- **Input** (name field)
- **Select** (role, harness, model tier)
- **Toggle** (not needed here)

No new custom components. Dialog is a native `<dialog>` element styled with DaisyUI `modal` classes. The edit form inside the dialog is composed from existing DaisyUI form primitives.

## Constraints from the design system

- 6px spacing grid: {3, 6, 9, 12, 18, 24, 36, 48}px
- Card padding: 18px. Section spacing: 12px gaps.
- Pill buttons (9999px radius). Cards use 16px radius.
- Agent avatars: green-tinted background, forest green border/text (AQ-012)
- Section headers: 12px uppercase, 600 weight, wide tracking, tertiary color (AQ-013)
- No cool grays, no off-grid spacing, no AI-aesthetic tells
- Touch targets >= 44px at viewport <= 1024px

## Anti-convergence axes for variants

The three variants will differ on:
1. **Hierarchy** -- where the eye lands first in the roster
2. **Density** -- how much info per agent row
3. **Action surface** -- where edit/customize verbs live
4. **State strategy** -- how category distinction is communicated
5. **Composition** -- dialog structure and flow
