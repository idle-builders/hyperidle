# AB3 Approved Design

**Base:** Variant B (Power Density) + elements from C (explicit button, section headers, Tag over dot).

**Rejected directions:** Flat form dialog (A), read-only identity section (C), ThreadRow dividers (C), keyboard arrow nav (C), native `<details>` element (B).

---

## 1. Roster Section (R3) Enhancement

### Current state
Flat rows: Avatar initials (28px circle) + Name (12px) + Role string (10px) + Lead badge. No descriptions, no category info, no edit affordances.

### New state
Compact flat cards replacing the rows. Each agent is a clickable card.

**Card structure:**
```
+-------------------------------------------------------+
| [Av] Agent Name            [Strategy tag]  [Customize] |
|      Role description text, single line...              |
+-------------------------------------------------------+
```

**Specifics:**

- **Container:** `bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[12px]`. NOT elevated (no shadow). Clickable `<button>` wrapping. Gap between cards: `6px`.
- **Row 1 (flex, items-center, gap-[12px]):**
  - Avatar: 24px, agent-green variant (green-tinted bg, forest green border/text per AQ-012). Shows first two letters of name.
  - Name: `text-[13px] font-medium text-[var(--text-primary)]`. Truncate.
  - Lead indicator: `text-[var(--accent-primary)] text-[10px]` " -- Lead" after name (same as current).
  - Category Tag: Only for non-team agents. `Tag` component, `xs` size.
    - Strategy: amber variant, text "Strategy"
    - Personal: default variant, text "Personal"
    - Team: no tag (team is the default; don't label the default)
  - Customize button: `Button` ghost variant, xs size, text "Customize". Right-aligned via `ml-auto`. `onClick` opens dialog, `stopPropagation` prevents card click from also firing.
- **Row 2:**
  - Description: `text-[12px] text-[var(--text-tertiary)] truncate`. From `AGENT_ROLE_CATALOG` description field (resolved client-side). Example: "Engineer. Implements features, writes code, tests, deploys."
  - If role has no catalog entry: show the raw role string.

**Hover state:** `rgba(44,36,26,0.02)` background tint. Cursor pointer on the whole card.

**Click behavior:** Clicking anywhere on the card opens the edit dialog for that agent. The Customize button does the same but provides an explicit affordance.

### Card sizing
- Card height: ~52px (12px padding top + 18px line 1 + 3px gap + 16px line 2 + 12px padding bottom = ~61px). Compact but readable.
- 4 agents = ~252px vertical space including gaps. Reasonable for the multi-section team page.

---

## 2. First-Time Hint

Uses the existing `useHints` system (same pattern as `hintCreateBet` in WorkTeam.tsx).

**Placement:** Above the roster cards, below the "Roster" section header.

**Visual style:** Green-tinted background matching action-block pattern (AQ-016):
- `bg-[rgba(22,118,79,0.03)] rounded-[var(--r-subtle)] p-[18px]`
- A 6px green dot before the text (action-block pattern).

**Copy:** "Your team's agents are ready. Click any agent to review and personalize their style."

**Dismiss:** Ghost xs button "Got it". Calls `hintReviewAgents.dismiss()`.

**Hint ID:** `review-agents`

**data-testid:** `hint-review-agents`

---

## 3. Edit Dialog

A native `<dialog>` element styled with DaisyUI modal classes. Opens via `dialogRef.current.showModal()`.

**Width:** `max-w-[560px]` (narrower than full modal, focused).

### 3.1 Dialog Header

```
Agent Name               [x close]
Role Label
Role description from catalog, up to two lines.
```

- **Name:** `text-[17px] font-semibold text-[var(--text-primary)]`
- **Role label:** `text-[13px] text-[var(--text-secondary)]` on a new line below name.
- **Category tag:** For strategy agents only: `Tag` amber variant "Strategy -- managed" on the same line as role label.
- **Description:** `text-[13px] text-[var(--text-secondary)]` below role label, 1-2 lines. The catalog's description field.
- **Close button:** Top-right, ghost icon "x" (native dialog close via `dialog.close()`).

### 3.2 Soul Section

**Section header:** "SOUL" -- `text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]` (AQ-013 pattern). `mt-[18px] mb-[6px]`.

**Guidance text:** Below section header, `text-[12px] text-[var(--text-tertiary)]`:
"Personality, style, and values. You define the soul; the system provides tools, context, and knowledge."

**Strategy note (strategy agents only):**
`bg-[rgba(217,119,6,0.06)] rounded-[var(--r-subtle)] p-[9px] mt-[6px]`
Text: "This agent is managed by your strategy. Your soul edits are preserved, but operational configuration may be refreshed on strategy updates."
`text-[12px] text-[var(--text-secondary)]`

**Textarea:**
- `textarea textarea-bordered w-full mt-[6px]`
- 12 rows.
- Pre-filled from `agent.soulPrompt` if non-null.
- Placeholder: "Describe this agent's personality, communication style, and values..."
- If soulPrompt is null and a template exists for the role: show the template content with a note.

**Template button (conditional):**
- Visible when: soulPrompt is null/empty AND `hasTemplate` is true for the agent's role.
- Position: Below textarea, left-aligned.
- `Button` ghost variant, sm size. Text: "Load {roleLabel} template".
- On click: fetches `GET /api/agents/templates/:role`, fills textarea. Button disappears.
- If textarea already has content: button hidden.

### 3.3 Configuration Section

**Toggle button:** A `Button` ghost variant, xs size, text "Show configuration" / "Hide configuration". Below the soul section, left-aligned. `mt-[12px]`.

**When shown** (toggled open):

A container `mt-[6px]` with three fields in `flex flex-wrap gap-[12px]`:

1. **Harness type:** Label "Harness" + text `Input` (sm). Placeholder "e.g. claude-code". `min-w-[140px] flex-1`.
2. **Model tier:** Label "Model tier" + `Select` (sm). Options: "Default" (value ""), "Reasoning", "Workhorse", "Fast". `min-w-[140px] flex-1`.
3. **Max sessions:** Label "Max sessions" + number `Input` (sm). Min 1, max 20. `min-w-[100px] flex-1`.

**Strategy agent behavior:** Fields are `disabled`. Labels show "(managed)" suffix. The toggle button text becomes "Show configuration (managed by strategy)".

**Default state:** Hidden (collapsed). Team leads who just want to edit the soul never see these fields.

### 3.4 Dialog Footer

`flex justify-end gap-[6px] mt-[18px] pt-[12px] border-t border-[var(--border-subtle)]`

- **Cancel:** `Button` ghost variant, sm size. Closes dialog without saving.
- **Save:** `Button` primary variant, sm size. Text "Save". Shows `loading loading-spinner loading-xs` when saving. Disabled when saving.

### Dialog data flow

1. **Open:** When user clicks a roster card, the component fetches the agent's full data (soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions, agentCategory) via `GET /api/agents` (the list endpoint, already cached) or a dedicated per-agent fetch. The dialog opens with the data pre-filled.
2. **Save:** `PATCH /api/agents/:id` with the edited fields. On success: close dialog, refresh roster data, show toast "Agent saved".
3. **Error:** Toast "Failed to save agent".

---

## 4. Add Custom Agent Flow

### Trigger
A ghost button below the roster cards:
`+ Add agent` -- `Button` ghost variant, sm size, self-start alignment. `mt-[6px]`.

### Create dialog
Reuses the edit dialog structure with modifications:

**Header changes:**
- Name field: `Input` sm, placeholder "Agent name". Replaces the static name display.
- Role select: `Select` sm, populated from `AGENT_ROLE_CATALOG` filtered to `category === "team"` entries. Replaces the static role label.
- Description: Updates dynamically when role changes (from catalog entry).
- No category tag (new agents are always team agents, bound to this team).

**Soul section changes:**
- On role change: fetch template via `GET /api/agents/templates/:role` (with AbortController pattern from SettingsAgents). If template exists, fill textarea. If user already typed content, do not overwrite (confirm first or skip).
- Template button not shown in create mode (template auto-loads on role selection).

**Configuration section:**
- Starts expanded in create mode (since there are no defaults).
- All fields enabled.

**Footer:**
- "Cancel" + "Create" (primary). Create calls `POST /api/agents` with `teamId` set to the current team's teamMembers id.
- On success: close dialog, refresh roster, toast "Agent created".

---

## 5. States Summary

### Roster section states
| State | Rendering |
|---|---|
| **Populated** | Agent cards with description, category tag, customize button |
| **Empty** | `EmptyState` "Roster not configured. No agents are assigned to this team." |
| **Loading** | `SkeletonCard` (existing, from WorkTeam loading state) |
| **Error** | Handled at page level (WorkTeam error state) |
| **First visit** | Green-tinted hint banner above cards |
| **Overflow (6+ agents)** | Natural vertical scroll. Cards at ~60px each, 6 agents = ~390px |

### Edit dialog states
| State | Rendering |
|---|---|
| **Loaded** | Header with identity context, soul textarea pre-filled, config hidden |
| **Strategy agent** | Amber note in soul section, config fields disabled |
| **Template available, soul empty** | "Load template" button below textarea |
| **Saving** | Save button spinner, all fields disabled |
| **Save error** | Toast notification |
| **Loading agent data** | Skeleton bars in dialog body while fetch completes |

### Add dialog states
| State | Rendering |
|---|---|
| **Initial** | Name input focused, first team role selected, soul empty, config expanded |
| **Role changed** | Template fetch in progress, soul textarea shows loading state |
| **Template loaded** | Soul fills with template content |
| **Saving** | Create button spinner |
| **Validation error** | Name required (empty name = Create button disabled) |

---

## 6. Behavior Reference

| Action | Result |
|---|---|
| Click agent card | Open edit dialog |
| Click "Customize" button | Open edit dialog (stopPropagation) |
| Escape / click backdrop | Close dialog |
| Tab in dialog | Soul textarea -> Show config button -> (if config shown: Harness -> Tier -> Sessions) -> Cancel -> Save |
| Save (edit) | PATCH /api/agents/:id -> close -> refresh -> toast |
| Save (create) | POST /api/agents -> close -> refresh -> toast |
| "Load template" click | Fetch template, fill textarea, hide button |
| Role change (create) | Fetch template, fill textarea (if empty) |
| Dismiss hint | Persist via useHints, hide banner |

---

## 7. Mobile Adaptation

- **Roster cards:** Render as-is. Full-width. Minimum touch target height 44px (cards are ~60px, sufficient).
- **Edit dialog:** Full-screen modal via DaisyUI `modal-bottom sm:modal-middle` pattern. Content scrolls within dialog.
- **Configuration section:** Starts expanded on mobile (collapsed sections are harder to discover on touch).
- **Textarea:** 8 rows on mobile (reduced from 12 to save viewport space).

---

## 8. Component Mapping

| Design Element | Component | Props / Variant |
|---|---|---|
| Agent avatar | `Avatar` | size="sm" (24px), agent variant (green tint) |
| Agent name | Raw `<span>` | 13px medium text-primary |
| Category indicator | `Tag` | xs size, amber variant (strategy), default variant (personal) |
| Customize button | `Button` | variant="ghost", size="xs" |
| Add agent button | `Button` | variant="ghost", size="sm" |
| Hint banner | Raw `<div>` | Action-block pattern styling |
| Hint dismiss | `Button` | variant="ghost", size="xs" |
| Dialog | Native `<dialog>` | DaisyUI modal classes |
| Section headers | Raw `<h3>` | 12px uppercase semibold tertiary tracking |
| Soul textarea | DaisyUI `textarea` | textarea-bordered, 12 rows |
| Template button | `Button` | variant="ghost", size="sm" |
| Config toggle | `Button` | variant="ghost", size="xs" |
| Harness input | `Input` or DaisyUI `input` | input-sm input-bordered |
| Model tier select | `Select` or DaisyUI `select` | select-sm select-bordered |
| Sessions input | DaisyUI `input` | input-sm input-bordered, type=number |
| Save button | `Button` | variant="primary", size="sm" |
| Cancel button | `Button` | variant="ghost", size="sm" |
| Status info | `KeyValue` | Not used in dialog (rejected C's identity section) |

**New custom components: 0.** Component budget unchanged at 19.

---

## 9. Open Questions for Architecture

1. **RosterMember wire type extension:** The current `RosterMember` has `{ agentId, name, role, isLead }`. The roster card needs `agentCategory` to show the category tag. Options: (a) extend RosterMember with `agentCategory`, (b) resolve category client-side from AGENT_ROLE_CATALOG lookup. Recommendation: extend the wire type -- the catalog lookup works for known roles but fails for custom roles.

2. **Agent detail fetch for dialog:** The dialog needs soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions. Options: (a) extend the team endpoint to include these in the roster, (b) fetch from GET /api/agents on dialog open, (c) add GET /api/agents/:id endpoint. Recommendation: (b) fetch from GET /api/agents filtered by teamId on dialog open. The list endpoint already returns all fields. Cache it for the duration of the page session.

3. **Hint registration:** The `review-agents` hint needs to be registered in the hints system (seed data + API). Follow the pattern of `create-bet` hint.

4. **teamId for POST /api/agents:** The create endpoint needs the team's teamMembers.id (not the team.id). The TeamDetail response includes `teamMembers.id`. Ensure the create dialog passes this value.

5. **Role description resolution:** The catalog is a TypeScript constant. It is available client-side via import. No API call needed for description lookup. But custom roles (not in catalog) will have no description -- show the raw role string instead.
