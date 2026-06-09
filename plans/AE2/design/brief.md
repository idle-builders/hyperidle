DESIGN-CLASS: novel  ref=SetupFlow.tsx  pattern=none

# AE2 Design Brief -- Team Creation & Onboarding Journey

## Design surfaces

Three surfaces identified, one requires design work:

### Surface 1: Setup flow redesign with team function selector (NOVEL -- 3 variants)

The current SetupFlow is a single-scroll form with 3 fields: name, API key, repo path. It creates a team with hardcoded builder + PM agents.

AE2 adds a team function selection step. The user picks what their team does (development, marketing, design, etc.) and the system creates agents matching those functions via `defaultRoster()`.

**Key constraints:**
- 8 known team functions: development, product, design, marketing, sales, operations, support, research
- Each maps to 1-3 agent roles via `AGENT_ROLE_CATALOG`
- User needs to understand what they are choosing (function -> agents) without reading docs
- "Install to first agent working" must take under 10 minutes
- The flow must end with the user being guided to the Assistant

**User task:** "I just installed this. Tell me what to pick and get me started fast."

### Surface 2: Post-setup landing and Assistant guidance (integrated into Surface 1)

After setup completes, the user must be guided to the Assistant overlay. The Assistant provides conversational onboarding -- helping the user understand what their team does and guiding them to their first bet.

**Key question:** Where does the user land after setup? Currently: `/work/portfolio`. With AE2: should they land on portfolio with the Assistant overlay auto-opened? Or should the Assistant overlay open during the last step of setup?

**Decision:** Land on `/work/portfolio` with the Assistant overlay auto-opened on first visit. This keeps the existing navigation mental model (you are in the app, the Assistant is available) while ensuring the user gets guidance. The Assistant's first message is a welcome that references their team composition and suggests next steps.

### Surface 3: AgentAddDialog enrichment (NO DESIGN WORK NEEDED)

The existing `AgentAddDialog.tsx` (AB3) already satisfies AC-2:
- Shows all team-category roles from `AGENT_ROLE_CATALOG` in a dropdown (line 47)
- Fetches and pre-loads soul templates when a role is selected (lines 89-109)
- Displays role description below the selector (line 148, line 194-196)

AC-2 is already met. No design changes needed.

## Design focus

All three variants focus on Surface 1: how the setup flow incorporates function selection and transitions to the Assistant-guided onboarding.

## What the user sees before and after

**Before AE2:**
```
/setup -> [Name] [API Key] [Repo Path] -> "Start HyperIdle" -> /work/portfolio (blank page, 2 hardcoded agents)
```

**After AE2:**
```
/setup -> [Name] [API Key] [Repo Path] + [Team Functions] -> "Start HyperIdle" -> /work/portfolio (correct agents, Assistant overlay open with welcome message)
```

## Existing components available

- `Input` (design system) -- for name, API key, repo path
- `Button` (design system) -- submit button, pill shape
- `Checkbox` (design system HTML reference) -- potential for multi-select
- `Tag` (design system) -- potential for function chips
- `AssistantOverlay` (shell composition) -- the overlay that opens post-setup
- `WelcomeVisual` (inline in SetupFlow) -- the 3-card abstract illustration

## Required reading (for /architecture)

See `plans/AE2/concept.md` Required Reading table.
