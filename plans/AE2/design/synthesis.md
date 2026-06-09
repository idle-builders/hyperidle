# AE2 Design Synthesis

## Chosen direction: Variant C (Conversational) with Variant A's custom chips

### From C (base):
- Single-scroll form with preset function bundles as radio pills
- "Software" pre-selected as sensible default
- Optional "What are you building?" textarea
- Post-setup: navigate to `/work/portfolio?onboarding=true`, Assistant overlay auto-opens
- Welcome message seeded server-side with team composition info

### From A (pulled in):
- When "Custom" is selected, the individual function chip grid appears (toggle chips from Variant A)
- Roster preview text below the selection showing which agents get created

### From B (rejected):
- Two-step wizard: rejected because no other surface uses this pattern. Introduces orphaned UX grammar.
- Function cards with descriptions: rejected as AQ-108 adjacent (card grid). The information density is better served by the roster preview text.

## Explicit rejection list

| Direction | Reason for rejection |
|---|---|
| Multi-step wizard | Orphaned pattern. Only used once. Violates coherence. |
| Card grid for functions | AQ-108 risk. Visual weight disproportionate to decision importance. |
| Inline function description on each chip | Chips are too small for descriptions. Use roster preview instead. |
| Full-screen function picker overlay | Overkill for 8 items. |
| Assistant-driven team creation (conversational setup) | AE3 is out of scope. Assistant cannot create teams programmatically in AE2. |
| No function selection (hardcode Software default) | Violates AC-1 requirement for function choice. |
| Checkboxes instead of chips/pills | Checkboxes feel like a settings form. Chips feel like tagging, which is the right mental model. |
| Step-by-step tutorial after setup | Conflicts with "humans validate, agents execute" principle. The Assistant handles guidance through conversation, not a tutorial overlay. |
