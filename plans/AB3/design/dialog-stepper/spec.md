# Variant B: Dialog Stepper

**Constraint:** Challenge the inline pattern. Use a dedicated dialog surface (like BetCreateDialog) that isolates the wizard from the team page. The dialog owns focus, prevents distraction, and creates a clear "I'm doing setup now" mode.

**Thesis:** Agent creation is a deliberate act with consequences (API key usage, team composition changes). It deserves a dedicated, focused surface -- not an inline expansion that competes with existing content. The dialog pattern is already established by BetCreateDialog and the onboarding screen.

## User story (1 sentence)

A team lead clicks "+ Add agent" on the WorkTeam page (or the empty-state CTA), and a modal dialog opens with a compact stepper showing all four configuration steps, with the active step's form in the center and a running preview sidebar.

## Component composition

- **WorkTeam page** (existing): triggers dialog open via button in roster section
- **EmptyState** (existing, Tier 2): zero-agent CTA with `action` prop
- **Native `<dialog>`**: follows BetCreateDialog pattern -- `showModal()`, `aria-modal`, focus trap
- **DaisyUI steps**: horizontal stepper indicator at the top of the dialog (step dots, `steps steps-horizontal`)
- **DaisyUI form controls**: same as Variant A
- **DaisyUI btn**: primary pill for "Next"/"Create", ghost for "Back"/"Cancel"

No new custom components. The dialog is a local component `AgentSetupDialog.tsx` co-located with WorkTeam or in `pages/work/`.

## Information hierarchy

1. **Dialog header** -- "New agent" title (20px/600, same weight as onboarding step-title). Fixed at top.
2. **Step indicator** -- horizontal step dots below the title. Four dots: Role / Identity / Harness / Model. Active step filled forest green, completed steps with checkmark, upcoming steps hollow. 12px labels below each dot.
3. **Step content** -- the active step's form, centered in the dialog body. Same field layouts as Variant A but with more vertical breathing room (the dialog has 36px padding like the onboarding card).
4. **Review sidebar** (right side, 180px) -- running summary of completed choices. Role badge, name preview, harness chip, tier chip. Updates as the user progresses. Only visible on desktop (>768px).
5. **Footer** -- button row: "Cancel" (ghost, left-aligned), "Back" (ghost), "Next" / "Create" (primary). Fixed at bottom.

## All states

### Empty (zero agents)
Same as Variant A: EmptyState in roster section with "Add first agent" button. Button opens the dialog.

### Loading
Skeleton in dialog body while fetching templates/workers/gateway config. Dialog opens immediately, loads data in parallel.

### Error
Error text inline below the field that failed validation. Dialog-level error for network failures: amber banner at top of dialog body.

### Populated (dialog open)

**Step 1 -- Role:**
- Role cards in a 3-column grid (desktop) / 1-column (mobile). Taller cards than Variant A because we have room: role name (15px/500), 2-line description (13px/secondary), and a role icon area (a 36px circle with the role's initials in forest green, like agent avatars).
- Three presets + "Custom" card. Custom card has a dashed border instead of solid.
- Selected card: forest green border, subtle green tint background (`rgba(22,118,79,0.04)`).
- Clicking a card immediately shows the soul prompt preview in the review sidebar.

**Step 2 -- Identity:**
- Name input (15px, `r-default` radius -- dialog inputs are slightly larger than page inputs for the isolated context).
- Soul prompt textarea (pre-filled, 10 rows). A "Preview" toggle shows the rendered markdown.
- Below the textarea, a note: "The soul prompt shapes how the agent thinks and communicates. The template is a starting point -- edit freely."

**Step 3 -- Harness:**
- Radio group of available harnesses. Each option: harness name (13px/500), type in mono badge, one-line capability description.
- If only one option: auto-selected with "This is the only available harness" note.
- Validation: if no harness available, the step shows an error state with a link to "Start a worker process" documentation.

**Step 4 -- Review & Create:**
- NOT a model tier step -- model tier is folded into this final review step as a select.
- Full summary card: name, role (with badge), harness, model tier select, soul prompt preview (first 3 lines, expandable).
- Model tier: select dropdown with descriptions as option text. Default pre-selected based on role (product_manager -> reasoning, practice_facilitator -> workhorse, chief_of_staff -> reasoning, custom -> workhorse).
- Validation summary: green checkmarks for valid items, red warnings for issues. "Create agent" button only enabled when all validations pass.

### Success (post-creation)
Dialog content transitions to a success state (no new dialog):
- Green checkmark circle (48px, same as EmptyState icon container)
- "Agent created" title (20px/600)
- Agent name + role badge below
- Three next-step buttons (pill, ghost variant):
  - "Assign to a bet" -> closes dialog
  - "Create a routine" -> closes dialog (future, disabled)
  - "View profile" -> closes dialog, navigates
- "Done" primary button -> closes dialog, refreshes roster

### Overflow
Dialog has internal scroll for step content. Header (title + stepper) and footer (buttons) are fixed. Max-height: `min(85vh, 640px)`.

## Behavior

- **Dialog lifecycle:** Opens via `showModal()`. Closes on Cancel, Escape, or backdrop click. Closing mid-wizard discards state (no draft persistence).
- **Step progression:** "Next" validates current step, advances stepper. "Back" returns without losing data. Steps are not independently clickable in the stepper (linear progression only -- prevents skipping required steps).
- **Focus trap:** Dialog uses native `<dialog>` focus trap. On step transition, focus moves to the first input of the new step.
- **Template fetch:** Same as Variant A but initiated when dialog opens (parallel fetch: templates list + workers list + gateway config).
- **Keyboard:** Tab cycles within dialog. Escape closes. Enter on focused "Next"/"Create" progresses.
- **Transition:** Step content cross-fades (`opacity`, 120ms `--motion-fast`). No slide.

## Mobile adaptation

Dialog goes full-screen (`width: 100%`, `height: 100%`, `border-radius: 0`). Review sidebar hidden. Step indicator switches to a compact "Step 2 of 4" text label instead of the horizontal dots. Back button becomes a "< Back" in the header area.

## Signature

The dialog creates a **focused mode** for agent setup. The review sidebar gives a running preview of what's being configured. The final step is a review-and-confirm step, not just another form -- the user sees everything they chose before creating. The step dots give spatial orientation.

## Trade-offs

- **Context switch:** The dialog takes the user out of the team page flow. They can't see the roster while setting up.
- **Heavier pattern:** A dialog with a stepper, review sidebar, and 4 steps is more complex to implement and maintain than an inline form.
- **Overengineered for 4 fields:** At its core, creating an agent is: role, name, harness, tier. Four fields. A dialog with a stepper may be more ceremony than the task warrants.
- **Review sidebar is decorative:** The sidebar shows information the user just entered. It doesn't provide new information -- it's a progressive summary. This is a risk of the "AI aesthetic" pattern where things look impressive but don't serve the user.
