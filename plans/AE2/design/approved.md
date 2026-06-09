# AE2 Approved Design -- Team Creation & Onboarding Journey

## Summary

The setup flow gains a team function selector (preset bundles with a custom option) and a "What are you building?" context field. After setup, the user lands on `/work/portfolio` with the Assistant overlay auto-opened and a personalized welcome message. The AgentAddDialog already satisfies AC-2 (no changes needed).

No new design-system components. Zero component budget cost.

---

## 1. Setup Flow -- Redesigned

### Layout (single scroll, same card container as today)

The existing 520px-max card remains. The form gains two new sections between the repo path field and the submit button.

```
+---------------------------------------------------+
| HyperIdle                                         |
| Your agentic operating system.                    |
| Humans steer, agents build.                       |
|                                                   |
| [WelcomeVisual -- 3 abstract cards, unchanged]    |
|                                                   |
| Set up your workspace                             |
| Enter your name and API key to get started.       |
|                                                   |
| Your name              [input, required, autofocus]|
| Anthropic API key      [input, password, required] |
| Project folder         [input + folder icon, opt]  |
|                                                   |
| What are you building? (optional)                 |
| [textarea, 3 rows, placeholder: "A SaaS app..."] |
|                                                   |
| Team focus                                        |
| Pick a starting point. You can add agents later.  |
|                                                   |
| (o) Software  ( ) Software + Design              |
| ( ) Full team  ( ) Marketing  ( ) Custom          |
|                                                   |
| [if Custom selected:]                             |
| [Development] [Product] [Design] [Marketing]      |
| [Sales] [Operations] [Support] [Research]         |
|                                                   |
| Creates: Builder, QA Engineer, Product Manager    |
|                                                   |
| [Start HyperIdle]                                 |
+---------------------------------------------------+
```

### Section: "What are you building?"

- **Label:** "What are you building?" -- 13px/500 `--text-primary`
- **Hint:** "(optional)" inline with label, 13px/400 `--text-tertiary`
- **Textarea:** Standard DaisyUI `textarea textarea-bordered`, 3 rows, resize vertical
  - Placeholder: "A SaaS app for managing subscriptions..."
  - 15px `--text-primary` body text, `--surface-elevated` bg, `--border-default` border, `--r-default` radius
- **Spacing:** 18px (`mb-[18px]`) between this section and the next, same as other form groups

### Section: "Team focus"

- **Label:** "Team focus" -- 13px/500 `--text-primary`
- **Hint:** "Pick a starting point. You can add agents later." -- 12px `--text-tertiary`
- **Spacing:** 6px between label and hint, 9px between hint and preset pills

### Preset pills (radio group)

Five preset options rendered as pill-shaped radio buttons in a flex-wrap row.

**Preset definitions:**

| Preset label | Functions passed to `defaultRoster()` | Resulting agents |
|---|---|---|
| **Software** | `["development", "product"]` | Builder, Product Manager, QA Engineer |
| **Software + Design** | `["development", "product", "design"]` | Builder, Designer, Product Manager, QA Engineer |
| **Full team** | `["development", "product", "design", "marketing"]` | Builder, Designer, Growth, Product Manager, QA Engineer |
| **Marketing** | `["marketing", "product"]` | Brand Voice, Content Writer, Growth, Product Manager |
| **Custom** | _(user picks from individual chips)_ | _(derived from selection)_ |

**Visual treatment (each pill):**

```
Container: flex-wrap, gap-[6px]

Pill (unselected):
  px-[12px] py-[6px]
  text-[13px] font-[500]
  rounded-[var(--r-pill)]
  border-[1.5px] border-[var(--border-default)]
  bg-[var(--surface-elevated)]
  text-[var(--text-secondary)]
  cursor-pointer
  transition: border-color, background, color var(--motion-fast) var(--motion-ease)

Pill (selected):
  border-[var(--accent-primary)]
  bg-[rgba(22,118,79,0.06)]
  text-[var(--accent-primary)]
  font-[500]
```

**Behavior:**
- Radio behavior: clicking one deselects others (except "Custom" -- see below)
- Default: "Software" is pre-selected on initial render
- Keyboard: arrow keys navigate between pills, Space/Enter selects
- `role="radiogroup"` on container, `role="radio"` + `aria-checked` on each pill

### Custom function picker (conditional)

When "Custom" is selected, an additional row of individual function chips appears below the preset pills with 9px gap.

**Individual function chips:**

```
Container: flex-wrap, gap-[6px], mt-[9px]
Animated: max-height transition 240ms (--motion-default), overflow hidden

Chip (unselected):
  px-[9px] py-[3px]
  text-[12px] font-[500]
  rounded-[var(--r-pill)]
  border-[1.5px] border-[var(--border-default)]
  bg-[var(--surface-elevated)]
  text-[var(--text-secondary)]
  cursor-pointer

Chip (selected):
  border-[var(--accent-primary)]
  bg-[rgba(22,118,79,0.06)]
  text-[var(--accent-primary)]
```

- Toggle behavior: each chip toggles independently (`aria-pressed`)
- Chips: one per `TEAM_FUNCTIONS` entry: Development, Product, Design, Marketing, Sales, Operations, Support, Research
- At least one chip must be selected for Submit to be enabled

### Roster preview

Below the preset pills (or custom chips), a text line shows the resulting agents.

```
"Creates: Builder, QA Engineer, Product Manager"

Style:
  text-[12px] font-[400]
  text-[var(--text-tertiary)]
  mt-[9px]
```

- Derived from `defaultRoster(selectedFunctions)` mapped through `AGENT_ROLE_CATALOG` to get labels
- Updates live as the user changes the selection
- When nothing is selected (Custom with no chips toggled): "Select at least one focus area."

### Submit button

Unchanged: `Button variant="primary"`. Text: "Start HyperIdle".

**Enabled when:** name non-empty AND API key non-empty AND at least one function selected (preset or custom chips).

### Form submission flow

1. POST `/api/users` (name) -- unchanged
2. POST `/api/teams` (name, repoPath, **functions**) -- now includes the selected function strings
3. Set credential via bridge -- unchanged
4. Navigate to `/work/portfolio?onboarding=true`

---

## 2. Post-Setup: Assistant Onboarding

### Auto-open trigger

When the app loads at `/work/portfolio` with `?onboarding=true` query param:

1. The AppShell reads the query param
2. Opens the AssistantOverlay automatically
3. Removes the query param from the URL (replaceState, no navigation)

The AssistantOverlay's `useAssistantThread()` hook fetches the assistant thread. If the thread was just created (during user registration), it will have a welcome message seeded by the server.

### Welcome message (server-side)

When POST `/api/teams` completes during setup, the server posts a welcome message to the assistant thread. This is a real `plain` message sent by the assistant agent.

**Message content template:**

```
Welcome to HyperIdle, {userName}.

Your team is set up with {agentCount} agents: {agentListCommaSeparated}.
{if repoPath: "I see you have connected {repoBasename} as your project folder."}

Here is what I suggest to get started:
1. Create your first bet -- describe what you want built and the team picks it up.
2. Ask me anything about how HyperIdle works.

What would you like to do first?
```

This message is inserted as a real message row in the `messages` table with `senderId = ast-{userId}`, `type = "plain"`, `threadId = thr-ast-{userId}`.

### Assistant response capability (AC-3)

AC-3 says the Assistant must respond to human messages. This is already implemented by AD8b's assistant dispatcher (`app.ts:514`). When a human posts to the assistant thread, the dispatcher provisions an assistant session that reads thread history + tools and responds.

No design work needed here -- the existing ThreadShell + AssistantOverlay + assistant dispatcher handle this end-to-end.

---

## 3. Agent Add Dialog (AC-2) -- No Changes

The existing `AgentAddDialog.tsx` already satisfies AC-2:

| Requirement | Current implementation |
|---|---|
| "presents the predefined agent roles from the catalog" | Line 47: `TEAM_ROLES = AGENT_ROLE_CATALOG.filter(e => e.category === "team")`, rendered as `<select>` options (lines 186-193) |
| "with soul templates pre-loaded" | Lines 89-109: `fetchTemplate(role)` calls `GET /api/agents/templates/{role}`, sets `soulPrompt` in form state |
| Description shown | Lines 148, 194-196: `roleDescription` rendered below the role select |

No design changes needed.

---

## 4. States Matrix (Setup Flow)

| State | Visual |
|---|---|
| **Initial** | Name + API key empty. "Software" preset pre-selected. Roster shows "Creates: Builder, QA Engineer, Product Manager". Submit disabled (gray). |
| **Partial** | Name filled, API key empty. Submit still disabled. |
| **Ready** | Name + API key filled. Preset selected (or custom with at least one chip). Submit enabled (forest green). |
| **Custom expanding** | User clicked "Custom". Individual chips appear with 240ms slide-down animation. |
| **Custom selecting** | User toggling individual chips. Roster preview updates live. If no chips selected, submit disabled. |
| **Submitting** | Spinner on submit button. All fields + pills disabled. |
| **Error** | Red error text below submit button. Form re-enabled. |
| **Success** | Navigate away. Page unmounts. |

---

## 5. Keyboard and Accessibility

| Element | Keyboard | ARIA |
|---|---|---|
| Preset pills | Arrow keys navigate, Space/Enter selects | `role="radiogroup"`, each pill `role="radio"` + `aria-checked` |
| Custom chips | Tab to first chip, Space/Enter toggles | Each chip: `role="button"` + `aria-pressed` |
| Textarea | Standard textarea keyboard | `aria-label="What are you building?"` |
| Submit button | Enter submits form (form `onSubmit`) | Standard form submission |

---

## 6. Mobile Adaptation

At viewport <= 768px:
- Preset pills wrap (flex-wrap handles it naturally)
- Custom chips wrap (same)
- Textarea stays full-width
- No other changes needed -- the single-scroll form is already responsive

---

## 7. Open Questions for Architecture

1. **How does `CreateTeamRequest` get the `functions` array?** The type needs a `functions` field. The POST `/api/teams` handler needs to call `defaultRoster(functions)` and create agents from the result.

2. **How is the welcome message seeded?** During team creation, after agents are created, the server should post a plain message to the assistant thread. This requires the team creation handler to know the user ID (to find `thr-ast-{userId}`).

3. **Where does the "What are you building?" text go?** Options: (a) stored as a field on the team row, (b) included in the welcome message body, (c) stored as a knowledge item. Recommendation: include in the welcome message body. No new schema needed.

4. **How does the auto-open trigger work?** The `?onboarding=true` param is read by AppShell or a hook. It calls the AssistantContext's open function. This needs the AssistantContext to expose an imperative `open()`.

5. **Preset-to-functions mapping:** Hardcoded in the frontend (`SetupFlow.tsx`). The presets are a UI convenience, not a domain concept. The API receives raw function strings.

---

## 8. Component Budget Impact

**New custom components: 0.** All UI is composed from:
- `Input` (Tier 1, existing)
- `Button` (Tier 1, existing)
- DaisyUI `textarea` (direct usage)
- Custom-styled `<button>` pills (page-level composition, not a component)
- `AssistantOverlay` (Tier 3 shell, existing)

---

## 9. What This Design Explicitly Rejects

| Direction | Why rejected |
|---|---|
| Multi-step wizard | No other surface uses this. Orphaned UX pattern. |
| Card grid for functions | AQ-108 adjacent. Disproportionate visual weight. |
| Assistant-driven team creation | AE3 out of scope. |
| Tutorial/coach marks overlay | "Humans validate, agents execute." The Assistant handles guidance through conversation. |
| Full-screen onboarding flow | The setup form is already full-screen. Adding another layer is overkill. |
| Skipping function selection entirely | AC-1 requires function choice. |
| Individual function chips without presets | Forces 8-way decision on a first-time user. Presets collapse the decision space. |
