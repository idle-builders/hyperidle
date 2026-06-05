# Variant A -- Minimal Scaffold

**Constraint:** Smallest possible component count. Reuse existing primitives without inventing anything new. The shape is whatever falls out of recombining what is already in `packages/design-system/src/`.

**Thesis:** Prove the feature can ship inside the 19-component budget with zero new shapes. The roster section gets just enough enrichment to satisfy the ACs, and the dialog is a plain form.

## User story

A team lead views the enriched roster rows on their team page, clicks "Customize" on any agent, and edits the soul prompt in a plain dialog with form fields.

## Component composition

### Roster section (R3) -- enhanced

The existing R3 section stays structurally identical: a section with `h2` header, followed by a vertical list of agent rows. Each row is enhanced:

- **Row container:** Same `flex items-center gap-[12px]` layout as current, but now a `<button>` (clickable to open dialog)
- **Avatar:** Existing `Avatar` component (agent variant: green-tinted per AQ-012), 28px
- **Name + role line:** Primary text (name, 13px medium) + secondary text (role label from catalog, 12px tertiary). Same as current but with the label instead of raw role string.
- **Category tag:** A small inline `Tag` component after the role label. Values: "Team" (default/subtle), "Strategy" (amber tint), "Personal" (green tint). Only shown for non-team agents (team is the default, so showing it on every row is noise).
- **Lead badge:** Existing "Lead" accent text, unchanged.
- **Customize button:** `Button` ghost variant, xs size, text "Customize". Right-aligned. On click, opens the edit dialog.

### First-time hint

Uses the existing `useHints` hook system. A hint card appears above the roster section (same pattern as `hintCreateBet` in WorkTeam.tsx):

- Container: `rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]`
- Copy: "Your team ships with agents tailored to your team's functions. Review their roles and customize their personality to fit your team's style."
- Dismiss button: ghost xs "Got it"
- data-testid: `hint-review-agents`

### Edit dialog (native `<dialog>`)

A single-page dialog with DaisyUI `modal` classes. Opens via `dialogRef.current.showModal()`.

**Header:** Agent name + role label + category tag. Dialog title is the agent name.

**Body -- two sections:**

1. **Soul section:**
   - A guidance paragraph: "The soul defines this agent's personality, communication style, and values. You write the soul. The system handles tools, context, and knowledge automatically."
   - For strategy agents, an additional amber-tinted note: "This agent is managed by your strategy. Your soul edits are preserved, but operational behavior may be refreshed on strategy updates."
   - A `<textarea>` (DaisyUI `textarea textarea-bordered`) pre-filled with the current soulPrompt. If empty and a template exists, show the template with a note "Pre-filled from the {role} template."
   - 8 rows, full width.

2. **Settings section:**
   - A quiet section header ("OPERATIONAL SETTINGS", 12px uppercase tertiary).
   - Three fields in a horizontal flex-wrap layout:
     - **Harness type:** `Select` with options derived from available harness types, or a text `Input` for freeform. Current: text input matching SettingsAgents pattern.
     - **Model tier:** `Select` with options "Default", "Reasoning", "Workhorse", "Fast".
     - **Max sessions:** Number `Input`, min 1, max 20.
   - For strategy agents, these fields are visually dimmed (opacity 0.6) with a tooltip: "Managed by strategy."

**Footer:** "Cancel" (ghost) and "Save" (primary pill). Save calls PATCH /api/agents/:id.

### Add custom agent flow

Below the roster rows, a ghost button: "+ Add agent". Opens a separate dialog (or reuses the edit dialog in "create" mode) with:

- Name input
- Role select (from AGENT_ROLE_CATALOG, filtered to team-category roles)
- Soul prompt textarea (auto-fills from template on role change, matching SettingsAgents pattern)
- Harness type input
- Model tier select
- "Create" primary button calls POST /api/agents

## Information hierarchy

1. **Agent name** -- primary text, 13px medium, text-primary
2. **Role label** -- secondary text, 12px, text-tertiary
3. **Category tag** -- only for non-team agents, Tag component
4. **Customize button** -- ghost, right-aligned, tertiary weight
5. **Soul prompt** (in dialog) -- the primary editing surface, largest area
6. **Operational settings** (in dialog) -- secondary, below soul

## States

### Roster section

- **Populated (default):** Agent rows rendered. Each has name, role, optional category tag, customize button.
- **Empty:** EmptyState "Roster not configured. No agents are assigned to this team." (existing)
- **Loading:** SkeletonCard (existing, from WorkTeam loading state)
- **Error:** Handled at page level (WorkTeam error state)
- **First visit:** Hint card above roster. Dismissible. Persists via useHints.

### Edit dialog

- **Populated:** All fields filled from agent data.
- **Loading (fetch):** Skeleton placeholder in dialog body while agent detail loads.
- **Saving:** Save button shows loading spinner, disabled. Fields disabled.
- **Error (save):** Toast "Failed to save agent" via existing showToast.
- **Strategy agent:** Settings section dimmed with note.
- **No template:** Soul textarea empty with placeholder text.
- **Template available:** Soul textarea pre-filled, note below: "Pre-filled from the {role} template."

### Add dialog

- **Empty (initial):** Name empty, role defaulting to first team role in catalog, soul empty until role triggers template fetch.
- **Template loading:** Soul textarea shows "Loading template..." placeholder.
- **Saving:** Same as edit dialog.
- **Error:** Toast.

## Behavior

- **Click agent row:** Opens edit dialog for that agent.
- **Click "Customize" button:** Opens edit dialog (same behavior as row click, button provides explicit affordance).
- **Escape key:** Closes dialog (native dialog behavior).
- **Click backdrop:** Closes dialog (DaisyUI modal-backdrop behavior).
- **Tab order in dialog:** Soul textarea -> Harness -> Model tier -> Max sessions -> Cancel -> Save.
- **Role change in add dialog:** Fetches template, pre-fills soul. Uses AbortController pattern from SettingsAgents.
- **Save success:** Dialog closes, roster refreshes (re-fetch team data or optimistic update), toast "Agent saved".
- **Transitions:** Dialog open/close uses CSS `transition: opacity var(--motion-default)`. No slide-in.

## Mobile adaptation

On mobile (three-tab layout), the team page scrolls vertically. The roster section renders identically -- it is already a vertical list. The edit dialog becomes a full-screen modal (DaisyUI `modal-bottom` on mobile). Touch targets on agent rows are 44px minimum height.

## Signature

**The minimum viable enhancement.** The roster goes from a passive display to an active management surface with the least possible structural change. One new dialog, enhanced rows, done. The dialog is a plain form -- not a wizard, not a stepper, not a multi-page flow. It respects the principle of "opinionated beats flexible."

## Trade-offs

- **Good:** Zero new components. Minimal code surface. Familiar form patterns. Ships fast.
- **Bad:** The dialog is a flat form dump -- all fields visible at once, no progressive disclosure. For agents with long soul prompts, the dialog could feel overwhelming. The category distinction is communicated only by a small tag and a note -- it may not be prominent enough for first-time understanding.
- **Bad:** No visual separation between "understand what this agent does" and "edit its personality." The read and write experiences are collapsed into one dialog.
