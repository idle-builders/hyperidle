# Q2 Design Brief

DESIGN-CLASS: routine-low-conf  ref=KnowledgeList,KnowledgeDetail,WorkBet,TaskSheet  pattern=none

## Who and what

A founder managing a fleet of AI agents wants to capture knowledge at any scope -- factory principles, product decisions, team notes, bet context, task findings, or personal scratch. They need to:

1. Create knowledge items from the Knowledge view (default scope: factory)
2. Create knowledge items contextually from bet detail (scope: bet) and task sheet (scope: task)
3. Pick or change scope after creation
4. See only their own user-scoped items until they promote them

## Task analysis

The primary task is **capture** -- the founder has an insight right now and wants to save it before context switches. Speed matters. The secondary task is **organize** -- changing scope to share a private note or promote a bet-level insight to practice-level knowledge.

### Capture frequency

Low volume: a few items per day at most. This is not a high-throughput data entry form. It is a "write it down while I'm thinking about it" flow.

### Decision: what scope?

For contextual creation (from bet/task), scope is pre-filled -- no decision needed. From Knowledge view, scope defaults to factory. Scope selection is secondary to content entry. Most items will be created contextually or at factory scope. The "pick an arbitrary scope" flow (e.g. "I want to write a product-scoped note from the Knowledge view") is the exception, not the rule.

## Existing surfaces

- **KnowledgeList** (Knowledge view): has no creation affordance. Needs "New item" action.
- **KnowledgeDetail** (Knowledge detail): has an Edit mode (textarea + preview). Needs "Change scope" action.
- **WorkBet** (Bet detail): has BetCard, BetPitch, task table, HostThreadSection. Needs contextual "New knowledge" action.
- **TaskSheet** (Task detail drawer): has task summary, intent radiogroup, HostThreadSection. Needs contextual "New knowledge" action.

## Component budget impact

No new design-system primitives needed. The creation form and scope picker are page-level compositions using DaisyUI primitives (input, textarea, select, btn, dialog). The scope picker is a form element, not a reusable Tier 1/2 component -- it is specific to knowledge creation and would not be used in 2+ contexts.

## Constraints from concept doc

- scope_kind is a closed enum: factory | product | practice | team | bet | task | user
- scope_id is an entity identifier, nullable for factory
- Layer is NOT set by the user -- fabric assigns it
- Scope changes tracked in version history
- User-scoped items visible only to author

## Probes resolved

1. **Creation surface: inline or dialog?** Given low volume and the need for scope picker + title + body, an inline expandable section on KnowledgeList or a dialog/page are both viable. A full page is overkill for "title + scope + body." A dialog keeps context visible.
2. **Scope picker complexity?** For contextual creation, scope is pre-filled and read-only (just a badge). From Knowledge view, scope_kind is a <select> with 7 options. scope_id needs a secondary selector only for non-factory scopes. This is progressive disclosure: factory (no scope_id) is the common case.
3. **"Change scope" -- where?** On the KnowledgeDetail page, as an explicit action (not inline-editable). A small dialog or inline form that shows current scope and lets the user pick a new one. Must be deliberate (not accidental) because scope changes affect visibility.
4. **Contextual creation from bet/task -- how?** A small "Add knowledge" button/link in the bet detail or task sheet that opens a creation form with scope pre-filled. The form itself is the same component used from Knowledge view, just pre-configured.
5. **User-scoped item visibility -- how surfaced?** A visual indicator (tag/badge) on user-scoped items in Knowledge list. Server-side filtering ensures only the author sees them.
