# Variant B -- Stepped Cards (Power-Density Rethink)

**Constraint:** Optimize for the most common power-user task: understanding what you are getting. Show the function-to-agent mapping explicitly so the user makes an informed choice.

**Thesis:** The function selector is the most important decision in setup. It determines your entire team. Elevate it to a proper step with visual cards that show each function's agents. Two-step form: identity (name + key) then team composition.

## User task

A first-time user sees a two-step setup. Step 1 is identity (name, API key, repo path -- compact). Step 2 is team composition: a grid of function cards, each showing the function name, a one-line description, and the agent roles it includes. Cards are toggleable. A sidebar summary shows the assembled roster.

## Component composition

- **Input** (design system) -- name, API key fields
- **Button** (design system) -- "Next" and "Start HyperIdle" buttons
- **Function cards** -- toggleable cards. Not a new design-system component -- a composition of existing surface tokens:
  - Card surface: `bg-[var(--surface-elevated)] rounded-[var(--r-default)] border-[1.5px] p-[12px]`
  - Function name: 15px/600 `--text-primary`
  - Description: 12px/400 `--text-tertiary`
  - Agent list: 12px/500 `--text-secondary`, comma-separated
  - Selected state: `border-[var(--accent-primary)]` + green dot indicator (8px, top-right corner)
  - Hover: `--shadow-elevated` + `translateY(-2px)` per AQ-010
- **Roster summary** -- right column (or below on narrow screens): assembled team list with role labels and count

**New custom components: 0.** Function cards are a page-level composition, not a design-system component. They are used exactly once (setup flow).

## Layout

### Step 1: Identity (single column, compact)

```
[Brand + tagline]
[Step 1 of 2 -- 12px mono uppercase, --text-tertiary]

Your name        [input]
Anthropic API key [input]
Project folder    [input + folder picker]

[Next ->]
```

Step indicator: "1 of 2" in 12px mono uppercase `--text-tertiary` with `--tracking-caps-sm`.

### Step 2: Team composition (two zones)

```
[Brand + tagline]
[Step 2 of 2]

What does your team do?
Pick the areas your team works in. We will create agents for each.

[Development]  [Product]   [Design]    [Marketing]
[Sales]        [Operations] [Support]  [Research]

Your team (5 agents)
--
Builder
QA Engineer
Product Manager
Designer
Growth

[<- Back]  [Start HyperIdle]
```

Function cards are in a 2-column grid (gap 9px) at the current 520px max-width. Each card is ~250px wide.

### Card internal layout

```
+----------------------------------+
| Development              [*]     |  -- function name 15px/600, green dot if selected
| Engineer. Implements features,   |  -- description 12px/400 --text-tertiary
| writes code, tests, deploys.     |
|                                  |
| Agents: Builder, QA Engineer     |  -- 12px/500 --text-secondary, agents listed
+----------------------------------+
```

Card height: auto (content-driven). Min-height: none.

## Information hierarchy

1. **Brand** -- "HyperIdle" (unchanged)
2. **Step indicator** -- "1 of 2" / "2 of 2" -- quiet, structural
3. **Step heading** -- "What does your team do?" 20px/600
4. **Step description** -- 15px/400 `--text-secondary`
5. **Function cards** -- the primary interaction surface in step 2
6. **Roster summary** -- secondary: shows the consequence of your selection
7. **Navigation** -- Back/Next/Start buttons

## States

| State | What renders |
|---|---|
| **Step 1 initial** | Identity form. Next button disabled until name + API key filled. |
| **Step 1 filled** | Next button enabled. Click advances to step 2. |
| **Step 2 initial** | All function cards unselected. Roster summary empty: "Select at least one area." Start button disabled. |
| **Step 2 selecting** | Cards toggle on click. Roster summary updates live. At least one = Start enabled. |
| **Step 2 submitting** | Start button shows spinner. Cards + Back disabled. |
| **Step 2 error** | Inline error below Start button. |
| **Post-submit** | Navigate to `/work/portfolio`. Assistant overlay auto-opens. |

## Behavior

- **Step transition:** Step 1 -> Step 2 is an in-place swap (no page navigation). Transition: fade-out step 1 content, fade-in step 2 content, 240ms (`--motion-default`). The card container stays fixed.
- **Card toggle:** Click toggles selected state. Transition: border-color 120ms. Green dot appears/disappears.
- **Keyboard:** Tab through cards. Space/Enter toggles. Back button: Shift+Tab from first card reaches it.
- **Roster summary derivation:** `defaultRoster(selectedFunctions)` -> map role strings to catalog labels. Count displayed in heading: "Your team (N agents)".
- **Back button:** Returns to step 1 with fields preserved.
- **Post-submit redirect:** Navigate to `/work/portfolio?onboarding=true`.

## Mobile adaptation

Function cards go to single-column (1 card per row). Roster summary moves below the cards.

## Signature

**Show the mapping.** Each function card explicitly shows which agents it creates. The user never wonders "what will this do?" -- they see it.

## Trade-offs

- **Bad at:** Speed for users who know what they want. Two steps + reading card descriptions + scanning roster = slower than a simple form.
- **Bad at:** Narrow viewports. Cards need minimum 250px width each; at very narrow viewports, the 2-column grid collapses.
- **Good at:** Comprehension. The user understands exactly what they are choosing and what they will get.
- **Good at:** Preventing confusion. No "I picked development but why do I have a QA Engineer?" because the card said so.
