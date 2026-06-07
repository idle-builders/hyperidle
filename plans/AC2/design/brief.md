DESIGN-CLASS: routine-low-conf  ref=WorkBet.tsx-outcome-section  pattern=none

# AC2 Design Brief -- Bet Hypothesis Validation Flow

## User task

A founder has just shipped (or killed) a bet. They see the bet detail page. The bet has a hypothesis ("chunked uploads reduce failure rate by 50%"). They need to evaluate whether the hypothesis held, capture what actually happened, and extract learnings -- all in one interaction that produces both a bet outcome (AC1 fields) and a retro knowledge item.

## What exists today (AC1 baseline)

The bet detail page (WorkBet.tsx) has an "Outcome" section between stat cards and the Pitch section, visible only for completed/killed bets. It has two modes:

- **Not evaluated state**: "Not evaluated" text + "Record outcome" link-button
- **Populated state**: verdict badge + "Edit outcome" link + optional summary text
- **Editing state**: inline form with verdict select + summary textarea + Cancel/Save

The AC1 form does NOT show the hypothesis side-by-side, does NOT capture learnings, does NOT create a knowledge item, and does NOT offer AI-assisted drafting.

## What AC2 adds

1. **Side-by-side display**: the original hypothesis text is shown alongside the reality summary field, so the founder can compare what was predicted vs what happened
2. **Learnings field**: a second textarea for extracting reusable knowledge (becomes the knowledge item body)
3. **AI-assisted draft button**: "Draft with AI" triggers a facilitator agent that pre-fills the verdict, reality summary, and learnings based on the bet's session data
4. **Knowledge item creation**: Save now writes BOTH the bet outcome (AC1 PATCH) AND creates a retro knowledge item (POST to knowledge API) atomically
5. **Persistent "not evaluated" indicator**: unchanged from AC1 (already exists)

## Constraints from concept doc

- Validation is a UI flow, not an entity -- no wizard, no multi-step, no separate page
- The hypothesis snapshot is immutable (shown as read-only)
- Use kind='reflection' on the knowledge fabric row, not a new 'retro' kind
- The flow subsumed AC1's inline outcome form -- it is the same entry point, enhanced
- AI-assisted draft is one LLM call, cost-capped
- Validation does not block bet completion

## Component budget

Zero new components. Must compose from existing DaisyUI primitives (select, textarea, btn) and match the existing Hearth section pattern (13px semibold uppercase tracking section headers, border-b border-subtle dividers).

## Key design decisions still open

1. How much vertical real estate does the expanded form consume? The existing AC1 form is compact (select + textarea + buttons). AC2 adds hypothesis display + learnings field + AI draft button.
2. Does the hypothesis display as a block-quote-style element or as a plain label+text pair?
3. Where does the "Draft with AI" button sit -- above the form, inline with Save, or as a secondary action?
4. How does the AI draft loading state look -- does the form gray out, or do fields populate one by one?

## Interrogation answers (settled)

- **Entry point**: "Record outcome" button (same as AC1). Opens the enhanced form.
- **Location**: same page, same position (between stat cards and Pitch). No separate page.
- **State on save**: both bet outcome AND knowledge item created atomically. Single save button.
- **Mobile**: full-width, same layout. The side-by-side hypothesis can stack vertically on narrow viewports.
- **Keyboard**: Tab through fields. Escape cancels. Enter on Save submits.
- **Focus on open**: focus moves to the first editable field (verdict select or reality textarea depending on variant).
