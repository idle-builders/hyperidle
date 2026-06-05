# Variant C -- Linear-Inspired

**Constraint:** Take inspiration from Linear's team member views and settings overlays. Linear shows team members as a list with inline status, and opens a right-panel or overlay for detail/editing. The interaction grammar: list as navigation, panel as workspace.

**Thesis:** A proven interaction grammar shortens the user's learning curve. Linear users (HyperIdle's likely early adopters) already know "click row -> detail panel." Applied here: the roster list is the navigation, and editing happens in a slide-over panel or a well-structured dialog that feels like a detail page.

## User story

A team lead sees the roster as a clean list. Each row shows essential info. Clicking a row opens a structured detail/edit view in a dialog that is organized like a mini profile page: identity at top, soul editing in the center, operational config at bottom. The dialog has section headers that create a visual rhythm, making it feel like a proper agent profile -- not a raw form dump.

## Component composition

### Roster section (R3) -- structured list rows

The roster uses list rows styled similarly to ThreadRow (flat list item with bottom border divider, hover tint). This borrows the established pattern from the Conversations view.

- **Row layout:** `flex items-center gap-[12px] py-[12px] px-[18px]` with `border-b border-[var(--border-subtle)]` as divider (ThreadRow pattern).
- **Left: Avatar** (28px, agent-green variant).
- **Center: Name block**
  - Line 1: Agent name (13px medium text-primary) + if lead: " -- Lead" in accent-primary text.
  - Line 2: Role label (12px text-tertiary). e.g., "Builder -- Engineer. Implements features, writes code, tests, deploys." The label and description joined with an em dash for density.
- **Right: Category + action**
  - For strategy agents: Tag "Strategy" (amber subtle variant, 10px).
  - For all: a ghost icon-button or text "Edit" (12px ghost button). 
- **Hover:** Subtle background tint `rgba(44,36,26,0.02)` (ThreadRow pattern). Row is clickable.

### First-time hint

A tinted banner above the roster, slightly different from Variant A/B:

- Uses `bg-[rgba(22,118,79,0.03)]` (green tint, matching action block pattern AQ-016).
- A 6px green dot before the text.
- Copy: "Your team's agents are ready. Click any agent to see what they do and personalize their style."
- Ghost dismiss button.
- This borrows the action-block visual language, connecting it to the agent's own green-tinted identity. Subtle but intentional.

### Edit dialog -- structured profile layout

A larger dialog (max-width 640px) organized with section headers creating a clean vertical rhythm. Feels like a mini agent profile, not a form.

**Section 1: Identity (read-only context)**
- Section header: "IDENTITY" (12px uppercase tertiary, AQ-013 pattern).
- KeyValue pairs (using the existing KeyValue component):
  - "Role" -> role label (e.g., "Builder")
  - "Description" -> role description from catalog
  - "Category" -> "Team agent" / "Strategy agent (managed)" / "Personal agent"
  - "Status" -> "Active" with StatusChip

This section is read-only. It answers "what is this agent?" before the user sees editable fields.

**Section 2: Soul**
- Section header: "SOUL" with a small help text: "Personality, style, and values. You define the soul. The system handles context, tools, and knowledge."
- For strategy agents: amber note below the header (same pattern as Variant B).
- `<textarea>` 10 rows, full width. Pre-filled from soulPrompt or template.
- If template available and soul empty: "Use {role} template" pill button (small primary) below the textarea.

**Section 3: Configuration**
- Section header: "CONFIGURATION"
- Three fields in flex-wrap row:
  - Harness type: text Input
  - Model tier: Select
  - Max sessions: number Input
- For strategy agents: a note "(managed by strategy)" under the header, fields disabled.

**Footer:** Cancel + Save. Fixed at dialog bottom.

### Add custom agent

A "+ Add agent" ghost button below the roster list. Opens the same dialog structure but in create mode:
- Section 1 is replaced with editable fields: Name input, Role select.
- Role change triggers template fetch for Section 2.
- Section 3 starts with defaults.

## Information hierarchy

1. **Agent name** -- primary in roster row
2. **Role + description** -- secondary, joined in roster row
3. **Identity section** (in dialog) -- read-only context using KeyValue pairs
4. **Soul textarea** (in dialog) -- primary editing surface
5. **Configuration fields** (in dialog) -- tertiary
6. **Category tag** (in roster) -- only for non-team agents

## States

### Roster section

- **Populated:** ThreadRow-style list with dividers. Clean, scannable.
- **Empty:** EmptyState component.
- **Loading:** SkeletonCard.
- **First visit:** Green-tinted hint banner above roster.
- **Overflow:** Natural scroll. Rows are ~52px each, so 8 agents = ~416px.

### Edit dialog

- **Loaded:** Three sections with KeyValue identity, soul textarea, config fields.
- **Strategy agent:** Amber note in soul section. Config fields disabled with "(managed)" note.
- **Template available, soul empty:** "Use {role} template" button visible below textarea.
- **Template loaded:** Button disappears. Textarea fills.
- **Loading (agent fetch):** Skeleton bars in each section.
- **Saving:** Save button spinner. Fields disabled.
- **Error:** Toast.

### Add dialog

- **Initial:** Name focused. Role at first team role. Soul empty. Config at defaults.
- **Role changed:** Template fetched, soul fills.
- **Saving/error:** Same as edit.

## Behavior

- **Click row:** Opens edit dialog.
- **Click "Edit" button:** Same (prevents ambiguity about what clicking the row does).
- **Escape / backdrop:** Closes dialog.
- **Tab order:** (Identity is read-only, skipped) Soul textarea -> Harness -> Tier -> Sessions -> Cancel -> Save.
- **"Use template" button:** Fills soul textarea. Disappears after click.
- **Save:** PATCH, close, re-fetch. Toast "Agent saved."
- **Keyboard:** Up/Down arrow navigation between roster rows (if focus is in the list). Enter opens dialog.
- **Transitions:** Dialog appears with opacity + translateY(-12px) -> (0,0) at var(--motion-default). Subtle lift-in.

## Mobile adaptation

Roster rows render as full-width list items (already responsive). Dialog becomes full-screen modal-bottom. Sections stack vertically. The identity section is collapsed by default on mobile to prioritize the soul editing area.

## Signature

**The structured profile dialog.** The dialog is not a form -- it is a mini profile view with clear section headers (Identity, Soul, Configuration) that creates a reading rhythm. The team lead first reads the identity section to understand what the agent does, then edits the soul, then optionally adjusts config. The section headers give the dialog structure and make it feel purposeful, not like a random collection of fields. This is the Linear influence: structure creates comprehension.

## Trade-offs

- **Good:** The section-header pattern creates a clear reading flow in the dialog. Identity context is always visible, so the user knows what they are editing. The ThreadRow-style roster is a proven pattern already in the codebase.
- **Good:** KeyValue component reuse for the identity section -- no new components needed, and the pairs are scannable.
- **Bad:** The dialog is larger (640px) and has more content (three sections) -- it may feel heavy for a quick soul edit. Users who just want to change one word in the soul must scroll past the identity section.
- **Bad:** ThreadRow-style dividers may feel visually different from the other sections of the WorkTeam page (bets use flat cards, not divider lists). The visual consistency of the page may suffer.
- **Bad:** Keyboard nav (Up/Down in roster) adds implementation complexity for marginal benefit -- most users will use the mouse on the team page.
