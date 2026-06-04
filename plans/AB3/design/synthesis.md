# AB3 — Design Synthesis

## Chosen direction

**Variant B (Dialog Stepper) is the strongest base**, with simplifications.

Despite Variant A scoring equally and being simpler, the dialog pattern wins for three reasons:

1. **Focus.** Agent creation involves reading and potentially editing a soul prompt -- a multi-paragraph text. An inline accordion in the roster section competes with the roster content and bet sections for visual attention. The dialog isolates the task.

2. **Established precedent.** BetCreateDialog already establishes the native `<dialog>` pattern for creation flows. Using the same pattern for agent creation builds muscle memory: "creating something = dialog opens."

3. **Validation staging.** The dialog's fixed footer with Cancel/Back/Next provides consistent navigation regardless of content length. The review step (Step 4) prevents misconfiguration before creation -- important because a misconfigured agent wastes API credits.

## Simplifications from Variant A pulled into B

- **Drop the review sidebar.** The sidebar in the original B spec showed a running summary in a side column. This is decorative -- it shows what the user just typed. Cut it. The dialog is single-column.
- **Merge harness + model tier into one step.** The original B had 4 steps: Role, Identity, Harness, Review. But harness selection is a single dropdown and model tier is another dropdown. These two fit in one step: "Step 3: Configuration" (harness select + model tier select). This reduces the flow to 3 steps + review, which is less ceremony. Actually, the review step can incorporate model tier as its own select, keeping the stepper at 3 steps: Role, Identity, Harness & Model. The final step simply includes the model tier select alongside a summary of previous choices.
- **Compact inputs.** Use the page-density input sizes (13px, 7px padding, `r-subtle`) from Variant A instead of the spacious onboarding-style inputs. The dialog is a tool, not a welcome screen.
- **No stepper dot labels.** The stepper shows numbered dots connected by lines, but no text labels below each dot. The step title appears as a heading inside the body. This is more compact and avoids the horizontal space pressure of 4 labels.

## What gets explicitly rejected

1. **Inline accordion in the team page.** The accordion pattern works for editing existing items (SettingsAgents) but creates scroll-and-context problems for creation flows with textarea content.
2. **Review sidebar / split-panel dialog.** Decorative. Shows data the user already entered. Adds implementation complexity (responsive breakpoint for sidebar visibility) for zero information gain.
3. **Stepper with text labels.** Horizontal text labels ("Role", "Identity", "Harness", "Review") consume horizontal space and create a layout problem on narrow dialogs. Numbered dots are sufficient -- the step title in the body is the label.
4. **4 separate steps.** Harness and model tier are both single-dropdown selections. Combining them into one step reduces friction without hiding important choices.
5. **Custom route for the wizard.** The wizard is not a page; it's a transient creation flow. A dialog is the right surface.
6. **Draft persistence.** If the user closes the dialog mid-wizard, state is lost. This is acceptable for a 30-second flow. Draft persistence adds storage complexity for negligible user benefit.

## Final shape: 3-step dialog

**Step 1 -- Role** (landing step)
- Description text: "Choose a role. Each comes with a pre-configured soul prompt."
- 2x2 grid of role cards (3 presets + Custom). Each card: role name (13px/600) + one-line description (12px/tertiary). Agent avatar circle with initials.
- Selected card: forest green border + subtle green tint.
- Custom card: dashed border.

**Step 2 -- Identity**
- Name input (required). 13px, `r-subtle` radius.
- Soul prompt textarea (pre-filled from template, or empty for Custom role). 8 rows, monospace placeholder hint.
- Hint text below textarea.

**Step 3 -- Harness & Model** (combined step with review summary)
- Review summary card (surface-container, r-subtle): shows role badge + name from previous steps. Read-only.
- Harness select dropdown. Populated from `GET /api/workers`. Default: first available.
- Model tier select dropdown. Three options with descriptions. Default: `workhorse`.
- Validation line at bottom: green dot "All checks passed" or amber dot "Reasoning tier has no provider configured."
- "Create agent" button in footer.

**Footer (fixed):**
- Cancel (ghost, left-aligned)
- Back (ghost, only shown on steps 2-3)
- Next / Create agent (primary, right-aligned)

**After creation:**
- Dialog body transitions to success state: checkmark icon, "Agent created" title, agent name + role badge, next-step links (pill ghost buttons), "Done" primary button.

**Empty state trigger:**
- WorkTeam roster section: when `roster.length === 0`, EmptyState with title "No agents on this team", description "Add your first agent to start building with AI.", action button "Add first agent" (opens the dialog).
- When roster has agents: "+ Add agent" ghost button below the roster opens the dialog.
