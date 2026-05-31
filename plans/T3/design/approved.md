# T3 Design Approval

**Status:** Approved (design phase skipped)

T3 introduces no novel UI. It replicates the T2 knowledge editing pattern (BodyEditor + auto-save + saving indicator) on the bet pitch surface. The BodyEditor component, saving indicator pattern, and status-based edit/read-only toggle all exist from T1/T2. No new components, no new visual states, no new interaction patterns.

The only UI-relevant decisions are:
1. BodyEditor replaces BetPitch in mutable statuses (draft, active) -- same "always-on editor" pattern as KnowledgeDetail.
2. BetPitch preserved in immutable statuses (completed, killed) -- existing read-only rendering unchanged.
3. BetCreateDialog textarea replaced with BodyEditor -- same pattern as KnowledgeCreateDialog.
4. Saving indicator uses identical markup/token pattern as KnowledgeDetail.

No design critique needed. No variants to explore.
