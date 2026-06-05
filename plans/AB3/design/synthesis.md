# AB3 Design Synthesis

## Winner: Variant B (Power Density) as base, with elements from C

**Variant B** is the strongest base because it optimizes for the primary user task (scan-to-edit) and puts the soul front-and-center in the dialog. The description on the roster card is the single most impactful design decision across all variants -- it means the team lead can understand their agents without opening any dialog.

## Elements pulled from other variants

### From Variant C: Explicit "Customize" button on roster rows

Variant B's weakness is discoverability -- no explicit button, just a clickable card. Variant C includes an explicit "Edit" button. The synthesis adds an explicit "Customize" ghost button to each roster card (right-aligned), matching the Variant A pattern. The card remains fully clickable, but the button provides the explicit affordance that first-time users need.

### From Variant C: Section headers in dialog

Variant B's dialog has a guidance line and a collapsed details element. Variant C's section headers ("SOUL", "CONFIGURATION") create a reading rhythm. The synthesis adds quiet section headers (12px uppercase tertiary, AQ-013 pattern) to the dialog sections. The soul section gets a "SOUL" header with inline guidance. The details element gets "CONFIGURATION" as its summary text styled as a section header.

### From Variant C: Category shown as Tag, not dot

Variant B's 6px colored dot is too subtle. Variant C's Tag component is more accessible and self-explanatory. The synthesis uses a small Tag for non-team agents on the roster card. Strategy agents get an amber Tag "Strategy". This is more accessible than a dot and does not need a tooltip.

## Explicitly rejected

1. **Variant A's flat form dialog.** No hierarchy, no progressive disclosure, no soul-first focus. The form dump pattern is the Settings page approach -- the team page deserves a better experience.

2. **Variant C's Identity section (read-only KeyValue pairs) in dialog.** Dead weight for repeat users. The role description is already visible on the roster card. Repeating it as a full section in the dialog adds scroll distance without adding value for the primary task (soul editing). Instead, the dialog header shows the name, role label, and description as context text -- not as a formal section with KeyValue pairs.

3. **Variant C's ThreadRow-style dividers for roster.** The WorkTeam page uses flat card containers for bets (R2) and container backgrounds for burn (R4). Switching to divider-based list rows for agents would break the visual consistency of the page. The synthesis uses flat cards (Variant B pattern), matching the page's existing visual language.

4. **Variant C's keyboard navigation (Up/Down arrows in roster).** Implementation complexity for marginal benefit. The roster is 3-6 items -- mouse/touch is sufficient. Tab navigation to the Customize button is enough.

5. **Variant B's `<details>` element for settings.** While progressive disclosure is good, the native `<details>` element has limited styling control and does not animate smoothly in all browsers. The synthesis uses a simple "Show settings" / "Hide settings" toggle button that shows/hides the configuration section with a CSS transition. This is more controllable and Hearth-consistent.

## The synthesized design

### Roster (R3): Compact cards with description + Customize button

Each agent rendered as a flat card:
- Avatar (24px, agent-green) + Name (13px medium) + Category Tag (non-team only) + Lead badge
- Role description below (12px tertiary, single line, truncated)
- "Customize" ghost button right-aligned
- Entire card clickable
- Hover: subtle tint

### First-time hint

Green-tinted banner (action-block pattern): "Your team's agents are ready. Click any agent to review and personalize their style."

### Edit dialog: Soul-first with structured sections

- **Header:** Agent name (17px semibold) + Role label (13px secondary). Category tag for strategy agents (amber). Role description (13px secondary, 1-2 lines) as context below the name.
- **Section: SOUL** -- header (12px uppercase tertiary) + guidance (12px tertiary: "Personality, style, and values. You define the soul; the system handles the rest.") + textarea (12 rows) + strategy note if applicable + "Load template" button if template available and soul empty.
- **Section: CONFIGURATION** -- hidden by default behind "Show configuration" toggle button. When shown: Harness, Model tier, Max sessions in a flex-wrap row. Strategy agents: fields disabled with "(managed)" note.
- **Footer:** Cancel + Save.

### Add agent: Ghost button + create dialog

"+ Add agent" ghost button below roster. Opens edit dialog in create mode with name input and role select replacing the header.
