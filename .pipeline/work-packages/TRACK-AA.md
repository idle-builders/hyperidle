# Track AA: Routines as Work

Make routines a first-class work primitive alongside bets. Today, bets are the only way work happens in HyperIdle — time-boxed, hypothesis-driven units. But real teams also have repeated units of work: daily standups, weekly digests, continuous monitoring, scheduled curation, periodic health checks. The `routines` schema table (C5) and the routine scheduler exist, but routines are invisible in the Work view, have no first-class UI, and can't be managed as part of a team's workload.

This track elevates routines from a backend scheduling mechanism to a visible, manageable, team-scoped work primitive.

**What exists today.** The `routines` table (C5) stores routine config with `ownerAgentId`, `triggerType`, `triggerConfig`, `autonomyLevel`. The routine scheduler polls every 60s, matching cron/heartbeat/event triggers. Five builtin routines are seeded (cost sentinel, practice meeting, post-bet retro, portfolio retro, knowledge decay). Session provisioning can launch sessions for routines. Cost cap enforcement (C7) exists at agent/team/factory level.

**Concept:** Routines are reshaped from "cron triggers that launch agent sessions" to "recurring units of work owned by a team, visible in Work, with outcomes and cost tracking." Run `/concept` for the Routine primitive at pipeline time.

**Constraint:** Routines coexist with bets — parallel work track, not a replacement. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AA1 — Routine Visibility & Team Scoping

**Workpackage.** As a team lead viewing the Work surface, I want to see all my team's routines alongside bets — with their schedule, status, last run, and cost — so that I understand the full picture of what my team is doing, including the recurring work that runs in the background.

**What exists today.** The `routines` table exists but has no `name`, `description`, `team_id`, or state enum (only a boolean `active`). Routines are not shown in the Work surface at all. Sessions have no `routine_id` FK for run history queries.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- Routines are visible in the team Work page alongside bets — a team lead sees both one-time work (bets) and recurring work (routines) in one view.
- Each routine shows its name, schedule in human-readable form, assigned agent, last run outcome, last run time, next scheduled run, and cumulative cost.
- Routines have meaningful states beyond boolean active/inactive — at minimum: active (running on schedule), paused (won't fire until resumed), and error (last run failed).
- Every routine belongs to a team — routines without a team cannot be created. Only team members can manage a team's routines.
- Clicking a routine shows its run history (recent runs with timestamp, duration, outcome, cost) and configuration.
- The Work portfolio page shows routine count per team alongside bet count.

**Validation scenarios.**
- Given a team with 3 routines and 2 bets, when the team Work page loads, then both bets and routines are visible.
- Given a routine whose last run failed, when the Work page loads, then the routine shows an error state.
- Given a user who is not a member of team A, when they attempt to view team A's routines, then they see nothing (or 403 if direct API).
- Given the Work portfolio, when it loads, then each team shows both bet and routine counts.

**Plan calls.** /design needed — routine entries in Work and the routine detail view are new UI surfaces. Architecture pass should design: the schema migration (adding `name`, `description`, `team_id` FK, state enum replacing boolean `active`, and the session↔routine linking strategy for run history queries). The concept pass should reconcile routines as a work primitive with the existing bet/task hierarchy.

**Contracts / constraints.**
- Routine entries use the same design system components as bet entries.
- `team_id` is NOT NULL — migration must backfill existing routines (derive from owner agent's team).
- The schema migration covers all columns needed by AA1 and AA2 — no incremental migrations across the track.

**Out of scope.**
- Routine execution changes (AA2 covers the session adaptation).
- Cost budgets for routines (AA3 covers appetite/cap).

**Effort.** L (~2d)

---

### AA2 — Routine Management & Session Adaptation

**Workpackage.** As a team lead, I want to create, edit, pause, resume, and delete routines from the Work surface — and have routine sessions work correctly with the existing agent session infrastructure — so that managing recurring work is as natural as managing bets, and routine sessions have bounded context and proper outcome recording.

**What exists today.** CRUD routes exist for routines (`routines-routes.ts`) but only support `active` boolean, `triggerConfig`, `autonomyLevel`, and `silent` fields. The session provisioning orchestrator (D5) can start sessions but has no routine-specific context assembly. Agents receive task context but no routine context. The routine scheduler fires routines and creates sessions, but sessions have no link back to the routine for run history.

**Depends on.**
- AA1 — Routine Visibility & Team Scoping. AA1 establishes the schema (name, description, team_id, state enum) and Work surface display.

**Complexity.** L

**Acceptance criteria.**
- A team lead can create a routine from the Work surface: name, description, schedule (cron with human-friendly presets), assigned agent, and optional cost cap per run.
- A team lead can pause, resume, and delete routines. Pausing stops future runs but preserves history. Deleting archives the routine (soft delete).
- Routine sessions reuse the existing session provisioning infrastructure — no separate execution path. The adaptation is in context assembly: routine sessions receive the routine's purpose, last run summary, and relevant knowledge instead of task/bet context.
- Each routine session starts clean — no leftover context from previous runs. Continuity between runs comes from the last run summary (stored on the routine) and knowledge items, not session memory.
- If a routine session is still running when the next scheduled beat arrives, the new beat is coalesced (skipped with a log entry).
- Routine session outcomes (success/failure/timeout, summary, cost) are recorded and visible in the routine's run history (AA1).

**Validation scenarios.**
- Given a team lead creates a routine "Daily digest" with schedule "Weekdays at 9am," when 9am arrives on Monday, then a session starts with the routine's context (purpose + last summary + knowledge), runs, records its outcome, and terminates.
- Given a routine session that ran yesterday with summary "processed 5 items," when today's session starts, then the context includes yesterday's summary but no other leftover state.
- Given a routine session still running, when the next scheduled beat fires, then it's skipped with a "coalesced" log entry.
- Given a team lead pauses a routine, when the next cron fires, then no session starts.
- Given a team lead deletes a routine, then it disappears from the Work surface but its run history remains queryable.

**Plan calls.** Architecture pass should design: how routine context differs from task context in the prompt composition module (X1), the coalescing mechanism, the last-run-summary storage (column on routines table), and how the cron picker maps to cron expressions. The concept pass should clarify how routine sessions relate to task-driven sessions — same provisioning path, different context template.

**Contracts / constraints.**
- Routine sessions use the same harness adapters (X5) and provisioning orchestrator (D5) as task sessions.
- The cron picker produces standard cron expressions — no proprietary format.
- Soft delete uses a `deleted_at` timestamp.
- Coalescing uses a DB-level check (not in-memory locks) for crash safety.

**Out of scope.**
- Event-triggered routines (Y4 covers declarative event hooks).
- Routine templates or marketplace.
- Multi-step routines (a routine is one bounded session per beat).

**Effort.** L (~3d)

---

### AA3 — Routine Cost & Appetite Model

**Workpackage.** As a founder, I want each routine to have a cost appetite (per-run and per-month budgets) and to see aggregate routine costs alongside bet costs — so that recurring agent work doesn't silently consume more than it's worth.

**What exists today.** Cost cap enforcement (C7) exists at agent/team/factory level. Bets have `costAppetiteMinor`/`costActualMinor`. The cost sentinel routine monitors factory-level spending. But routines have no per-routine cost caps, no per-run budgets, and routine costs don't appear in the Work surface.

**Depends on.**
- AA1 — Routine Visibility & Team Scoping. AA1 shows routines in Work; AA3 adds cost display and enforcement.
- AA2 — Routine Management & Session Adaptation. AA2 records per-run costs; AA3 adds budget enforcement.

**Complexity.** M

**Acceptance criteria.**
- Each routine can have a per-run cost cap (maximum spend per session) and a per-month cost cap (maximum aggregate spend per calendar month). Both are optional — null means unlimited.
- When a routine session hits its per-run cap, the session terminates with outcome "budget_exhausted."
- When a routine's monthly spend reaches its monthly cap, future sessions are skipped with outcome "monthly_budget_exhausted" until the next calendar month.
- The team Work page shows aggregate routine cost alongside aggregate bet cost — a team lead sees total recurring spend vs total project spend.
- The routine detail view shows: average cost per run, total cost this month, and budget utilization if caps are set.

**Validation scenarios.**
- Given a routine with per-run cap of $0.50 that has spent $0.55 in a session, then the session is terminated with "budget_exhausted."
- Given a routine with monthly cap of $10 that has spent $10.50 this month, when the next beat fires, then the session is skipped with "monthly_budget_exhausted."
- Given a team with 3 routines costing $5, $3, $2 this month, when the Work page loads, then aggregate routine cost shows $10.

**Plan calls.** Architecture pass should design: schema migration for cost cap columns on routines, integration with existing C7 cost cap enforcement, and how monthly aggregation works (calendar months, not rolling windows).

**Contracts / constraints.**
- Cost cap enforcement reuses the existing C7 infrastructure — no separate enforcement mechanism.
- Monthly aggregation uses calendar months.
- Cost tracking matches the existing session cost model (L17).

**Out of scope.**
- Cross-team routine cost budgets.
- Cost optimization recommendations (Y8 covers cost intelligence).
- Historical cost trend analysis beyond current month.

**Effort.** M (~6h)
