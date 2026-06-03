# X3 Design Synthesis

## Chosen direction: Inline Table

The inline table variant is the only variant (routine classification). It reuses the exact OrgChart pattern (table + inline add/edit form) and Profile pattern (dirty-tracking save).

## What's in

1. **Table format** for the agent list — enables at-a-glance comparison of all agents
2. **Inline edit form** below the selected row — matches OrgChart pattern
3. **Inline add form** at the bottom — matches OrgChart "+ Add Edge" pattern
4. **Soul prompt textarea** with monospace font and 8-row minimum — gives the soul prompt the space it needs without a modal
5. **Role-triggered template pre-fill** — when creating a new agent, changing the role fetches and pre-fills the soul prompt template
6. **Single-click confirmation for delete** — row button changes to "Confirm?" requiring a second click, avoiding both a modal and accidental deletion
7. **Toast feedback on save** — consistent with Profile section

## What's rejected (do not re-litigate)

- Modal editor (violates W3 single-page contract)
- Two-column split (too narrow at 680px, inconsistent with other sections)
- Accordion per agent (slower scanning than table)
- Dedicated page (spec says no new page)
- Click-to-edit table cells (soul prompt doesn't fit)
- Rich markdown editor for soul prompt (out of scope; plain textarea is sufficient)
- Drag-to-reorder agents (explicitly in the L-track rejection list)
- Search/filter for agents (unnecessary at 8-15 agents)

## Open questions for architect

1. **Template fetch endpoint**: Should role-based soul prompt templates be served from `GET /api/soul-prompt-templates/:role` or from the existing `GET /api/settings` response (embedded in the settings payload)?
2. **Agent CRUD permissions**: PATCH for editing existing agents should be open to the founder. Should creating/deleting agents also be founder-only? My read: yes, gated by the same auth as other settings mutations.
3. **Soul prompt size limit**: The textarea accepts arbitrary markdown. Should there be a max length validation? The token budget (4000 tokens for persona + tools) is enforced at prompt composition time, not at storage time. But storing a 100KB soul prompt is wasteful. My read: cap at 50,000 characters (~12,500 tokens), enforced at the API boundary.
