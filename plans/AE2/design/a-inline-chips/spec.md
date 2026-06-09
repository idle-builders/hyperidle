# Variant A -- Inline Chips (Minimal Scaffold)

**Constraint:** Smallest possible component count. Reuse existing primitives. No new shapes.

**Thesis:** The function selector is just a multi-select. Add it as one more field group in the existing single-scroll form. No steps, no pages, no wizard. The user picks functions like they pick a repo path -- it is one more thing on the form.

## User task

A first-time user fills out a single-scroll form. Below the repo path field, a new "Team focus" section shows 8 toggleable chips. Each chip is a team function. Selecting a chip highlights it (forest green outline + fill tint). Below the chips, a live roster preview shows which agents will be created.

## Component composition

- **Input** (design system) -- name, API key fields (unchanged)
- **Repo path** -- inline text input with folder picker (unchanged)
- **Function chips** -- each is a `<button>` styled like a Tag variant. Not a new component -- uses Tag's visual treatment (pill shape, 12px font, same padding) but adds toggle behavior via `aria-pressed`. This is a DaisyUI primitive composition, not a custom component.
- **Roster preview** -- a simple text list below the chips: "Your team: Builder, QA Engineer, Product Manager" in 13px `--text-secondary`. Updates live as functions are toggled.
- **Button** (design system) -- "Start HyperIdle" submit button (unchanged)

**New custom components: 0.** All composition from existing primitives + DaisyUI.

## Information hierarchy

1. **Brand + tagline** (unchanged) -- "HyperIdle" 20px/700, tagline 15px secondary
2. **WelcomeVisual** (unchanged) -- 3-card abstract illustration
3. **Form heading** -- "Set up your workspace" 20px/600
4. **Form fields** -- name, API key, repo path (unchanged layout)
5. **Team focus section** -- new:
   - Label: "What does your team do?" 13px/500 `--text-primary`
   - Hint: "Pick one or more. We will create the right agents for you." 12px `--text-tertiary`
   - Chips row: flex-wrap, gap 6px. Each chip: `px-[12px] py-[6px] text-[13px] font-[500] rounded-[var(--r-pill)] border-[1.5px]`
     - Unselected: `border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]`
     - Selected: `border-[var(--accent-primary)] bg-[rgba(22,118,79,0.06)] text-[var(--accent-primary)]`
   - Roster preview: below chips, 13px `--text-secondary`, shows comma-separated agent names
6. **Submit button** -- unchanged

## States

| State | What renders |
|---|---|
| **Initial** | All 8 function chips unselected. Roster preview: "Select at least one focus area." Submit button disabled (needs name + API key + at least one function). |
| **Selecting** | User clicks chips. Each toggles independently. Roster preview updates live: "Your team: Builder, QA Engineer" (derived from `defaultRoster(selectedFunctions)`). At least one function selected + name + API key filled = submit enabled. |
| **Submitting** | Button shows spinner. Form disabled. |
| **Error** | Inline error text below button in `--status-error`. |
| **Post-submit** | Navigate to `/work/portfolio`. Assistant overlay auto-opens with welcome message. |

## Behavior

- **Chip toggle:** Click toggles `aria-pressed`. Transition: border-color + background 120ms (`--motion-fast`).
- **Keyboard:** Tab through chips. Space/Enter toggles. Standard form navigation.
- **Roster preview:** Pure derived state from `defaultRoster(selectedFunctions)`. Maps role strings to `AGENT_ROLE_CATALOG` labels. Shows as comma-separated text.
- **Validation:** Submit requires name + API key + at least one function selected.
- **Post-submit redirect:** Navigate to `/work/portfolio?onboarding=true`. The `onboarding` query param triggers the Assistant overlay to auto-open with a welcome message.

## Mobile adaptation

Single column, chips wrap naturally. No changes needed -- the flex-wrap handles it.

## Signature

**One continuous form.** No steps, no wizard, no pagination. The function selector feels like checking preferences, not a separate decision. Fast.

## Trade-offs

- **Bad at:** Explaining what each function means. Chips show "Development" but not "creates Builder + QA Engineer." The roster preview helps but requires the user to mentally map functions to roles.
- **Bad at:** Guiding a confused user. There is no hand-holding -- just a form.
- **Good at:** Speed. A user who knows what they want completes setup in 30 seconds.
