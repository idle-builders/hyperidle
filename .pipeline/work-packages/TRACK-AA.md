# Track AA: Routines as Work

Make routines a first-class work primitive alongside bets. Today, bets are the only way work happens in HyperIdle — time-boxed, hypothesis-driven units. But real teams also have repeated units of work that aren't bets: daily standups, weekly digests, continuous monitoring, scheduled curation, periodic health checks. Paperclip solved this with "heartbeats" — agents that wake on a schedule, process work, and terminate. HyperIdle has the `routines` schema table (C5) but routines are invisible in the Work view, have no first-class UI, and can't be managed as part of a team's workload.

This track elevates routines from a backend scheduling mechanism to a visible, manageable, team-scoped work primitive that sits alongside bets in the Work surface.

**Concept:** Routines are reshaped from "cron triggers that launch agent sessions" to "recurring units of work owned by a team, visible in Work, with outcomes and cost tracking." Run `/concept` for the Routine primitive at pipeline time.

**Constraint:** Routines must coexist with bets — they are a parallel work track, not a replacement. The Work surface shows both. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AA1 — Routine Visibility in Work Surface

**Workpackage.** As a team lead viewing the Work surface, I want to see all active routines alongside bets — with their schedule, last run status, next run time, and cost — so that I understand the full picture of what my team is doing, not just the bet-driven work.

**Depends on.** None. The `routines` table (C5), Work surface pages (J5/UI-40), and session routes (E6) exist. This workpackage adds routine entries to the Work view.

**Complexity.** M

**Acceptance criteria.**
- The team Work page shows a "Routines" section below or alongside the "Bets" section, listing all routines scoped to that team.
- Each routine entry displays: name, schedule (human-readable cron description like "Every weekday at 9am"), assigned agent, last run status (success/failure/skipped), last run timestamp, next scheduled run, and cumulative cost (tokens + money) since creation.
- Routines can be in one of four states: `active` (running on schedule), `paused` (exists but won't fire), `disabled` (manually turned off), `error` (last run failed, awaiting review). The state is shown as a status badge.
- Clicking a routine opens a detail sheet (similar to TaskSheet) showing: run history (last 20 runs with timestamp, duration, outcome, cost), the routine's configuration (schedule, agent, autonomy level), and a link to the associated session logs.
- The Work portfolio page (top-level) shows a "Routines" count badge per team alongside the bet count.

**Validation scenarios.**
- Given a team with 3 active routines and 2 bets, when the team Work page loads, then both the Bets section (2 entries) and the Routines section (3 entries) are visible.
- Given a routine that last ran at 9am and failed, when the Work page loads, then the routine shows status "error" with the failure timestamp.
- Given a user clicks on a routine entry, when the detail sheet opens, then the last 20 runs are listed with their outcomes and costs.
- Given the Work portfolio page, when it loads, then each team row shows both bet count and routine count.

**Plan calls.** /design needed — the routine entries in Work and the routine detail sheet are new UI surfaces. Architecture pass should design: the routine list query (join routines with latest heartbeat_runs for status), the run history query, and the detail sheet component structure.

**Contracts / constraints.**
- Routine entries use the existing design system components (same card style as bet entries, same status badges).
- The routine detail sheet reuses the TaskSheet component pattern — slide-over panel, not a new page.
- Run history is read from the existing `sessions` table filtered by routine_id.
- No changes to the routine execution mechanism — this is purely visibility.

**Out of scope.**
- Creating or editing routines from the Work surface (AA2 covers this).
- Routine execution improvements (AA3 covers the heartbeat pattern).
- Cost budgets for routines (AA4 covers appetite/cap).

**Effort.** M (~6h)

---

### AA2 — Routine CRUD from Work Surface

**Workpackage.** As a team lead, I want to create, edit, pause, resume, and delete routines directly from the Work surface — so that managing recurring work is as natural as managing bets, without needing to navigate to settings or use the API.

**Depends on.**
- AA1 — Routine Visibility in Work Surface. AA1 establishes the routine entries in the Work view; AA2 adds the management actions.

**Complexity.** M

**Acceptance criteria.**
- A "New Routine" action in the Work surface opens a creation form with fields: name, description, schedule (cron expression with a human-friendly picker), assigned agent (dropdown from team members), autonomy level (enum: full/supervised/manual), and optional cost cap per run.
- The routine detail sheet (from AA1) includes action buttons: Pause, Resume, Disable, Delete, and Edit.
- Pausing a routine stops future scheduled runs but preserves the routine and its history. Resuming restarts the schedule from the next occurrence.
- Deleting a routine requires confirmation and archives the routine (soft delete) — run history is preserved.
- Editing a routine allows changing: name, description, schedule, assigned agent, autonomy level, and cost cap. Changes take effect on the next scheduled run.
- The cron picker supports common presets: "Hourly," "Every 4 hours," "Daily at 9am," "Weekdays at 9am," "Weekly on Monday," "Custom cron expression."

**Validation scenarios.**
- Given a user clicks "New Routine" on the team Work page, when they select "Daily at 9am," assign agent "Builder-1," and save, then a new routine appears in the Routines section with schedule "Daily at 9am."
- Given an active routine, when the user clicks "Pause," then the routine's status changes to "paused" and no future runs are scheduled.
- Given a paused routine, when the user clicks "Resume," then the routine's status changes to "active" and the next run is scheduled according to the cron expression.
- Given a user clicks "Delete" on a routine, when they confirm, then the routine disappears from the Work surface but run history remains accessible via API.

**Plan calls.** /design needed — the creation form, cron picker, and action buttons are new UI. Architecture pass should design: the create/update/delete API contract (likely extending existing routines-routes.ts), the cron picker component, and the soft-delete mechanism.

**Contracts / constraints.**
- The cron picker produces a standard cron expression stored in the routines table — no proprietary schedule format.
- Autonomy level maps to the existing `autonomy_level` column on the `routines` table.
- Soft delete sets a `deleted_at` timestamp — the routine is excluded from queries but not physically removed.
- The assigned agent must be a member of the routine's team.

**Out of scope.**
- Event-triggered routines (only cron-scheduled — Y8 covers event hooks).
- Routine templates or marketplace.
- Bulk routine management.

**Effort.** M (~6h)

---

### AA3 — Heartbeat Execution Pattern

**Workpackage.** As a factory operator, I want routines to follow the heartbeat pattern — wake on schedule, receive a curated context packet, process work, record outcomes, and terminate — so that recurring agent work has bounded context, predictable cost, and automatic fault recovery instead of long-running sessions that accumulate state.

**Depends on.**
- AA1 — Routine Visibility in Work Surface. AA1 makes routines visible; AA3 changes how they execute.

**Complexity.** L

**Acceptance criteria.**
- When a routine's cron schedule fires, the system creates a new bounded session (a "heartbeat") that: (a) loads the routine's agent configuration, (b) assembles a curated context packet containing: the routine's purpose/description, its last run summary, any items queued for processing since the last run, and relevant knowledge from materialization; (c) starts the agent with this context; (d) runs the agent until it signals completion or hits the cost/token cap; (e) records the outcome (success/failure/partial, a summary of what was done, cost/tokens consumed); (f) terminates the session cleanly.
- Each heartbeat starts with no leftover context from previous runs — the curated context packet is assembled fresh. State between runs is persisted externally (knowledge items, task state, routine metadata), never in session memory.
- If a heartbeat is still running when the next scheduled beat arrives, the new beat is coalesced (skipped with a log entry) rather than spawning a duplicate.
- Heartbeat sessions have a configurable maximum duration (default: 15 minutes). If the agent exceeds this, the session is terminated and the outcome is recorded as "timeout."
- The last run summary (written by the previous heartbeat) is included in the next heartbeat's context packet, providing continuity without unbounded state accumulation.
- Heartbeat outcomes are visible in the routine detail sheet (from AA1) with: timestamp, duration, outcome, cost, and a one-line summary.

**Validation scenarios.**
- Given a routine scheduled every 4 hours, when the cron fires, then a new session starts with a fresh context packet containing the routine description, last run summary, and queued items — no leftover state from the previous session.
- Given a heartbeat already running for routine R, when R's next scheduled beat arrives, then the new beat is skipped and a "coalesced" log entry is recorded.
- Given a heartbeat that runs for 16 minutes with a 15-minute cap, when the timeout fires, then the session is terminated and the outcome is recorded as "timeout."
- Given a routine that ran yesterday with summary "processed 3 knowledge items, promoted 1 to L3," when today's heartbeat starts, then the context packet includes this summary.

**Plan calls.** Concept work needed on "Heartbeat" as a session execution pattern distinct from task-driven sessions. Architecture pass should design: the context packet assembly (what goes in, token budget), the coalescing mechanism (lock on routine_id), the timeout enforcement, the outcome recording schema, and how heartbeat sessions differ from task sessions in the provisioning orchestrator (D5).

**Contracts / constraints.**
- Heartbeat sessions use the same harness adapters (X5) as task sessions — no separate execution path.
- The context packet is assembled by the same prompt composition module (X1) with a different template for routine context vs task context.
- Coalescing uses an atomic DB check (SELECT ... FOR UPDATE on routine_id) — no in-memory locks.
- The last run summary is stored on the routine row (a text column), not as a separate table.
- Heartbeat sessions are cost-capped per the routine's configured cap, defaulting to the team's per-session cap.

**Out of scope.**
- Event-triggered heartbeats (only cron-scheduled — Y8 covers event hooks).
- Multi-step heartbeats (a heartbeat is one bounded session, not a pipeline).
- Heartbeat-to-heartbeat communication (routines don't talk to each other directly).

**Effort.** L (~3d)

---

### AA4 — Routine Cost & Appetite Model

**Workpackage.** As a founder, I want each routine to have a cost appetite (budget per run and budget per month) and to see aggregate routine costs alongside bet costs in the Work surface — so that I can manage the total cost of recurring agent work and ensure routines don't silently consume more than they're worth.

**Depends on.**
- AA1 — Routine Visibility in Work Surface. AA1 displays routine cost; AA4 adds budget enforcement and aggregate views.
- AA3 — Heartbeat Execution Pattern. AA3 records per-run costs; AA4 adds budget enforcement.

**Complexity.** M

**Acceptance criteria.**
- Each routine has two configurable cost fields: `cost_cap_per_run` (maximum spend per heartbeat, nullable = unlimited) and `cost_cap_per_month` (maximum aggregate spend per calendar month, nullable = unlimited).
- When a heartbeat approaches the per-run cap (80%), a warning is logged. When it hits 100%, the session is terminated and the outcome is recorded as "budget_exhausted."
- When a routine's monthly aggregate approaches 80% of the monthly cap, an alert appears in the facilitator queue. When it hits 100%, future heartbeats are skipped with outcome "monthly_budget_exhausted" until the next calendar month.
- The team Work page shows aggregate routine cost: total cost this month for all team routines, compared to total bet cost this month.
- The routine detail sheet shows: cost per run (average, min, max), total cost this month, monthly budget utilization bar (if cap is set).
- The Work portfolio page shows per-team routine cost alongside bet cost.

**Validation scenarios.**
- Given a routine with `cost_cap_per_run = $0.50` and a heartbeat that has spent $0.40, when the agent makes another LLM call costing $0.15, then the session is terminated with outcome "budget_exhausted."
- Given a routine with `cost_cap_per_month = $10` that has spent $8.50 this month, when the facilitator queue is checked, then an alert shows "Routine X at 85% of monthly budget."
- Given a routine that has exhausted its monthly budget, when the next scheduled heartbeat fires, then the heartbeat is skipped and the outcome is "monthly_budget_exhausted."
- Given a team with 3 routines costing $5, $3, and $2 this month, when the team Work page loads, then the aggregate routine cost shows $10.

**Plan calls.** Standard architecture pass — schema migration for cost cap columns, integration with existing cost cap enforcement (C7/L17), aggregate cost queries, and UI components for budget display. Skip /design (uses existing budget visualization patterns from bet cost tracking).

**Contracts / constraints.**
- Cost cap enforcement reuses the existing cost cap infrastructure (C7) — no separate enforcement mechanism.
- Monthly aggregation uses calendar months (not rolling 30-day windows).
- Cost tracking includes both token costs and money costs, matching the existing session cost model (L17).
- Null cost caps mean unlimited — the system does not enforce a default cap.

**Out of scope.**
- Cross-team routine cost budgets.
- Cost optimization recommendations.
- Historical cost trend analysis beyond current month.

**Effort.** M (~6h)

---

### AA5 — Routine Ownership & Team Scoping

**Workpackage.** As a team that owns its recurring work, I want routines to be scoped to teams with clear ownership — so that each team manages its own routines, routine costs roll up to the team, and agents only execute routines for their team.

**Depends on.** None. The `routines` table and team management (C4) exist. This workpackage enforces team scoping on routines.

**Complexity.** S

**Acceptance criteria.**
- Every routine has a required `team_id` foreign key. Routines without a team cannot be created.
- The routine list API filters by team: `GET /api/routines?team_id=<id>` returns only that team's routines. The unfiltered endpoint returns all routines the requesting user has access to.
- When a routine's heartbeat fires, the session is provisioned with the routine's team context — the agent receives team-scoped knowledge, not factory-wide.
- Only team members (humans or agents in the team's `teamMembers`) can create, edit, or delete routines for that team. Non-members receive 403.
- The routine's assigned agent must be a member of the routine's team. Attempting to assign a non-member agent returns 400.

**Validation scenarios.**
- Given a user who is a member of team A but not team B, when they attempt to create a routine for team B, then the API returns 403.
- Given a routine scoped to team A, when its heartbeat fires, then the provisioned session includes team A's knowledge context, not team B's.
- Given a routine with agent "Builder-1" who is a member of team A, when the user tries to reassign it to "Builder-2" (not in team A), then the API returns 400.

**Plan calls.** Standard architecture pass — migration for team_id FK (if not already present), API authorization checks, and session provisioning team-scoping. Skip /design (no UI changes — AA1 already shows routines per team).

**Contracts / constraints.**
- The `team_id` column is NOT NULL with a FK to the `teams` table.
- Authorization checks use the existing team membership model (P2 org edges).
- Migration backfills existing routines with a default team (the first team in the factory, or requires manual assignment).

**Out of scope.**
- Cross-team routines (a routine that serves multiple teams).
- Routine delegation (one team creating routines that run in another team's context).

**Effort.** S (~2h)
