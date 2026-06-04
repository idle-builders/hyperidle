# AB3 — Agent Setup Wizard: Design Brief

DESIGN-CLASS: routine-low-conf  ref=SettingsAgents+BetCreateDialog  pattern=onboarding.html

## Classification rationale

The wizard introduces a **new interaction pattern** (multi-step guided flow) not present in the codebase. However, the components it composes from (form controls, selects, buttons, EmptyState) are all existing DaisyUI primitives and design-system components. Two variants warranted: A stays close to existing patterns (inline in WorkTeam), B challenges with a dedicated dialog surface.

## User task

A team lead on the Work/Team page wants to add a new agent. They do not know what "soul prompts" or "harness types" are. They need: pick a role from a short list with descriptions, give it a name, confirm the harness and model tier (with sensible defaults pre-selected), and create. The wizard also needs to surface as a CTA when the team has zero agents.

## Probes (resolved from codebase reading)

### 1. What roles have templates?

Three roles have soul prompt templates seeded from `docs/souls/`: `product_manager`, `practice_facilitator`, `chief_of_staff`. Three roles have no templates: `builder`, `growth`, `brand_voice`. The wizard must show the three templated roles as presets with descriptions, and a "Custom" option for the others where the user writes/pastes a soul prompt.

### 2. What harness types exist?

From `adapter-pool.ts`: `claude-code` (always available), `builtin` (always available), and CLI tools (`aider`, `goose`, `opencode`) registered if their binary is on PATH. The wizard should query `GET /api/workers` to get the list of available adapters and present them as a select. No free-text harness type input -- select from what's actually available.

### 3. What model tiers exist?

`reasoning | workhorse | fast` from `MODEL_TIERS` constant. The wizard should show these three with a description of when to use each. Default: `workhorse`. Validation: the selected tier must have a configured provider (checkable via `GET /api/model-gateway`).

### 4. Where does the wizard live?

Two options explored as variants: (A) inline within WorkTeam page roster section, (B) as a dialog triggered from WorkTeam. Both are triggered by a button in the team roster section and by the empty-state CTA.

### 5. What happens after creation?

The user sees a success state with next-step links: "Assign to a bet", "Create a routine", "View profile". These link to existing routes.

### 6. How does the empty-state CTA work?

When `roster.length === 0` on the WorkTeam page, the existing EmptyState component is used with its `action` prop to render a "Create your first agent" button. This replaces the current "Roster not configured" empty state.

### 7. Does creation also create a teamMembers entry?

Looking at the existing `POST /api/agents` route: it creates a `users` row with `teamId` set to the provided `teamId`, which references the `team_members` table. So the agent is associated with the team through `users.teamId`. The existing route already accepts `teamId` in the request body.
