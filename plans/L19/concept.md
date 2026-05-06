# L19 Concept — Harness Jump-Out from Session Metadata

## Verdict: No new or reshaped primitives

L19 uses existing concepts only. No concept work required.

### Existing concepts consumed

- **Session** (process primitive, `sessions` table): Already defined with `id`, `taskId`, `agentId`, `outcome`, `cost`, `state`. L19 adds two columns (`harnessUrl`, `tokensUsed`) and surfaces the "latest session" as a read projection -- it does not change what a Session IS.

- **Task** (process primitive, `tasks` table): Already defined. L19 does not add fields to the task row. It enriches the task's API response with a derived join (latest session metadata).

- **SessionOutcome** (shared type): Already defined as `"completed" | "crashed" | "stopped"`. L19 maps these to presentation statuses via the existing `StatusChip` vocabulary. No new outcome values.

### What L19 is NOT introducing

- Not a new "HarnessSession" concept -- the existing Session is sufficient.
- Not a "SessionLink" or "JumpOut" entity -- the harness URL is a column on Session, not a standalone noun.
- Not reshaping the Task-Session relationship -- a Task already has many Sessions via `sessions.taskId`. L19 merely surfaces the latest one.
- Not a "Harness" concept in the HyperIdle domain -- the harness is external. HyperIdle stores its URL as an opaque string.

### Vocabulary confirmation

| Term | Meaning in L19 | Status |
|------|----------------|--------|
| Latest session | The most-recent session row for a task, ordered by `startedAt DESC` | Read projection, not a new entity |
| Harness URL | Opaque external URL stored on the session row | New column, not a new concept |
| Jump-out | UI affordance (link/button) that opens the harness URL | Interaction pattern, not a domain noun |
| Outcome chip | StatusChip rendering of SessionOutcome | Presentation mapping, not a concept |
