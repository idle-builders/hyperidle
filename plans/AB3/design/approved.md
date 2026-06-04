# AB3 — Agent Setup Wizard: Approved Design

## Overview

A 3-step dialog wizard for creating agents, triggered from the WorkTeam page roster section. The dialog follows the BetCreateDialog pattern (native `<dialog>`, `showModal()`, `aria-modal`). Steps: Role, Identity, Configuration (harness + model tier + review). After creation, a success state with next-step links.

## Entry points

### 1. Empty state (zero agents on team)

The WorkTeam roster section replaces its current EmptyState with one that opens the wizard:

- **EmptyState component** (existing, Tier 2)
- **title:** "No agents on this team"
- **description:** "Add your first agent to start building with AI. The wizard walks you through setup in under a minute."
- **action:** Primary pill button "Add first agent" -- opens the dialog with `teamId` pre-set.

### 2. Populated state (team has agents)

Below the roster rows, a ghost text button:

```
+ Add agent
```

Same style as the existing SettingsAgents `+ Add Agent` button. Opens the dialog.

## Dialog structure

### Shell

- **Native `<dialog>`** -- follows BetCreateDialog pattern.
- **Width:** 520px (same as onboarding card). `max-width: calc(100vw - 48px)`.
- **Max height:** `min(85vh, 640px)`.
- **Padding:** 24px body, 18px footer.
- **Radius:** `--r-default` (16px).
- **Shadow:** `--shadow-elevated`.
- **Background:** `--surface-elevated`.

### Header

- **Title:** "New agent" -- 20px/600, `--text-primary`, `letter-spacing: -0.01em`.
- **Stepper:** Three numbered dots connected by lines, below the title. No text labels on the dots -- the active step's title is shown in the body content.
  - Done dot: `rgba(22,118,79,0.08)` bg, `--accent-primary` text, shows checkmark.
  - Active dot: `--accent-primary` bg, `--text-on-accent` text, shows number.
  - Pending dot: `--surface-container` bg, `--text-tertiary` text, shows number.
  - Connecting lines: 1px `--border-subtle`, done segments: 1px `--accent-primary`.
  - Dot size: 24px circle, `--r-pill`.
- **Border:** 1px `--border-subtle` bottom separator after stepper.

### Body (scrollable)

Content varies by step. Body has internal vertical scroll if content exceeds available height. Header and footer are fixed.

### Footer (fixed)

- **Left:** "Cancel" ghost pill button.
- **Right:** "Back" ghost pill (hidden on step 1) + "Next" / "Create agent" primary pill.
- **Button sizing:** `btn-sm` with `min-h-[44px]` for touch target compliance (AQ-015).
- **Separator:** 1px `--border-subtle` top border.

## Step 1: Role

### Content

- **Intro text:** "Choose a role for the new agent. Each role comes with a soul prompt template." -- 15px, `--text-secondary`, `line-height: 1.7`.
- **Role grid:** 2-column grid, `gap: 9px`.

### Role cards

Four cards (3 presets + 1 custom):

| Role | Name | Description | Initials |
|---|---|---|---|
| `product_manager` | Product Manager | Shapes bets, writes pitches, defines done conditions | PM |
| `practice_facilitator` | Practice Facilitator | Curates knowledge, coaches skills, maintains standards | PF |
| `chief_of_staff` | Chief of Staff | Cross-team patterns, obstacle reports, principle stewardship | CS |
| `custom` | Custom | Write your own soul prompt for a specialized agent | -- |

Each card:
- **Container:** `--surface-container` bg, `--r-subtle` radius, 12px padding, 1.5px transparent border.
- **Header row:** 28px avatar circle (agent-style: green-tinted bg + green text + monospace initials) + role name (13px/600 `--text-primary`).
- **Description:** 12px, `--text-tertiary`, `line-height: 1.5`.
- **Selected state:** `--accent-primary` border, `rgba(22,118,79,0.04)` background.
- **Custom card:** dashed border (`--border-default`), no avatar circle (or a "?" placeholder).
- **Hover:** `--border-default` border (transition: `--motion-fast`).

### Behavior

- Clicking a card selects it (radio behavior -- only one selected at a time).
- Default: no selection -- "Next" is disabled until a role is selected.
- On selection, the soul prompt template is fetched in the background via `GET /api/agents/templates/:role`. If fetch fails, the soul prompt in Step 2 starts empty.
- "Next" button: enabled when a role is selected.

## Step 2: Identity

### Content

- **Name input:**
  - Label: "Agent name" (13px/500 `--text-primary`).
  - Input: `input-sm input-bordered`, placeholder "e.g., Atlas".
  - Validation: non-empty, unique within team. Error shown as 12px `--status-error` text below the input: "An agent with this name already exists on this team."

- **Soul prompt textarea:**
  - Label: "Soul prompt" (13px/500).
  - Textarea: `textarea-bordered text-sm`, 8 rows.
  - For preset roles: pre-filled with the template fetched in Step 1.
  - For Custom role: empty, placeholder "Describe your agent's personality, expertise, and approach..."
  - Hint: "Pre-filled from the [Role] template. Edit freely." or "Write a soul prompt for your custom agent." (12px `--text-tertiary`).

### Behavior

- "Next" enabled when name is non-empty.
- Template loading: if the template fetch from Step 1 is still in flight, show a skeleton in the textarea. If it fails, textarea is empty with hint "Template unavailable -- write a soul prompt manually."
- Name uniqueness check: debounced 300ms, checks against agents already loaded from `GET /api/agents` (filtered by team). No server round-trip for uniqueness -- client-side check against the agents list.

## Step 3: Configuration & Review

### Content

- **Review summary card:**
  - Container: `--surface-container` bg, `--r-subtle` radius, 18px padding.
  - KeyValue rows (using the Hearth section-header style for labels):
    - **Role:** pill badge (`rgba(22,118,79,0.08)` bg, `--accent-primary` text, `--r-pill`, 12px, 3px 9px padding).
    - **Name:** 13px `--text-primary`.
    - **Prompt:** first line truncated, 12px `--text-secondary`.
  - Labels: 12px/600 uppercase, `--tracking-caps-sm` (0.06em), `--text-tertiary`, 80px fixed width.

- **Harness select:**
  - Label: "Execution harness" (13px/500).
  - Select: `select-sm select-bordered`. Options populated from `GET /api/workers` (adapter list). Each option shows adapter name + type.
  - Default: first available adapter. If only one adapter: auto-selected, select is still visible but with one option.
  - Hint: "Determines how the agent executes tasks." (12px `--text-tertiary`).
  - Error state: if no adapters available, show amber text: "No harness adapters available. Start a worker process first." Select is disabled.

- **Model tier select:**
  - Label: "Model tier" (13px/500).
  - Select: `select-sm select-bordered`. Three options:
    - "workhorse -- Daily tasks, good balance" (default selected)
    - "reasoning -- Complex decisions, expensive"
    - "fast -- Quick responses, cheapest"
  - Hint: "Determines which AI model handles this agent's tasks." (12px `--text-tertiary`).
  - Validation: check `GET /api/model-gateway` to see if selected tier has a configured provider. If not: amber warning below the select: "The [tier] tier has no provider configured. Configure it in Settings > Models." Warning uses `--accent-secondary` color with 6px dot prefix.

- **Validation summary:**
  - Green: "All checks passed -- ready to create" (12px `--status-success`, 6px green dot prefix).
  - Amber: individual validation warnings listed.

### Behavior

- Footer button changes from "Next" to "Create agent".
- "Create agent" enabled when: harness is available, name is non-empty, name is unique.
- On create: button shows loading spinner (`loading loading-spinner loading-xs`). Sends `POST /api/agents` with `{ name, role, soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions: 1, teamId }`.

## Success state

After successful creation, the dialog body transitions (opacity cross-fade, `--motion-fast`) to:

- **Icon:** 48px circle, `rgba(22,118,79,0.08)` bg, green checkmark SVG (24px). Same as EmptyState icon container.
- **Title:** "Agent created" -- 20px/600 `--text-primary`.
- **Agent info:** name + role badge on one line.
- **Next steps** (12px `--text-secondary` intro "What's next?"):
  - "Assign to a bet" -- ghost pill button. Closes dialog (the user is already on the team page where bets are visible).
  - "View in settings" -- ghost pill button. Closes dialog, navigates to `/conversations?settings=open` (settings overlay).
  - "Done" -- primary pill button. Closes dialog, refreshes the team page data.

## Data fetching

The dialog fetches three things on open (parallel):

1. **Agents list:** `GET /api/agents` -- for name uniqueness validation.
2. **Workers list:** `GET /api/workers` -- for harness select options.
3. **Gateway config:** `GET /api/model-gateway` -- for tier validation.

Template fetch happens on role selection in Step 1: `GET /api/agents/templates/:role`.

## Rejected decisions

1. **Inline accordion in team page.** Context collision with roster content; soul prompt textarea pushes everything off-screen.
2. **Review sidebar / split panel.** Decorative repetition of user input. Implementation complexity (responsive breakpoint) for zero information gain.
3. **4 separate steps.** Harness and model tier are both single-dropdown selections. Combining them reduces friction.
4. **Stepper text labels.** Horizontal space pressure. Numbered dots are sufficient.
5. **Custom route.** The wizard is transient. A dialog is the right surface.
6. **Draft persistence.** 30-second flow. Not worth the storage complexity.
7. **Bulk creation.** Out of scope per workpackage spec.
8. **Free-text harness type input.** Replaced with select populated from actual available adapters. Prevents typos and invalid harness types.

## Mobile adaptation

- Dialog goes near-full-screen: `width: calc(100vw - 24px)`, `height: calc(100vh - 24px)`, `border-radius: var(--r-subtle)`.
- Role grid goes single-column.
- Review summary card stacks labels and values vertically.
- Stepper dots shrink to 20px but remain visible.
- Footer buttons stack vertically if needed (Back and Cancel combine into "< Back" in header).

## Open questions for architecture

1. **Name uniqueness scope:** The spec says "unique within the team." The current `GET /api/agents` endpoint returns all agents (not filtered by team). The architect should decide: filter on the client, or add a `?teamId=` query param to the endpoint?
2. **Workers endpoint auth:** `GET /api/workers` requires `X-API-Key` header (see workers.ts). The web client's `apiFetch` sends `X-API-Key` automatically -- confirm this works for the wizard.
3. **teamId resolution:** The wizard opens from the WorkTeam page, which has `teamId` from the URL params. But the `POST /api/agents` endpoint accepts `teamId` which references `team_members.id` (not `teams.id`). The architect must clarify the mapping: is `teamId` on the URL the same as `teamId` in the agent creation payload?
4. **Success callback:** After creation, should the dialog trigger a refetch of the team data (roster), or should it optimistically add the new agent to the roster array?
