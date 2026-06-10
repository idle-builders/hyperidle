# Z8 Trace — WORK: Team Detail, Routine Detail, Agent Profile (+ dialogs)

Audit scope: `WorkTeam.tsx`, `WorkRoutine.tsx`, `AgentProfile.tsx`, `AgentEditDialog.tsx`,
`AgentAddDialog.tsx`, `work/RoutineCreateDialog.tsx`, hooks (`useTeam`, `useTeamAgents`,
`useRoutine`, `useAgentProfile`), server routes (`teams-routes.ts`, `routines-routes.ts`,
`agents.ts`, `agent-profile.ts`), services (`routine-scheduler.ts`, `cost-cap.ts`,
`session-lifecycle.ts`, `session-provisioning.ts`, `schedule-label.ts`, `agent-utils.ts`,
`team-lookup.ts`, `approval-rate.ts`), DB schema (`packages/db/src/schema.ts`), seed (`seed.ts`).

Routes registered in `packages/web/src/router.tsx`: `work/team/:teamId` (L75),
`work/routine/:routineId` (L77), `agents/:agentId` (L80). Server mounts in
`packages/server/src/app.ts`: `/api/agents` (L379), `/api/teams` (L381), `/api/routines` (L392-399).

---

## Element Inventory

### Page: WorkTeam — `/work/team/:teamId` (`packages/web/src/pages/WorkTeam.tsx`)

Data source: `useTeam(teamId)` (`hooks/useTeam.ts:20-57`) → `apiFetch GET /api/teams/:teamId`
→ `createTeamRoutes` GET `/:teamId` (`server/src/routes/teams-routes.ts:547-859`).
Secondary: `useTeamAgents(rosterAgentIds)` (`hooks/useTeamAgents.ts:31-99`) → `GET /api/agents`
(`routes/agents.ts:117-147`), filtered client-side by roster ids.

| # | Element | file:line | Chain | DB |
|---|---------|-----------|-------|----|
| T1 | Skeleton cards (loading) | WorkTeam.tsx:105-114 | `fetched.loading` from useTeam | — |
| T2 | "Team not found" EmptyState (404 / null data / malformed data) | WorkTeam.tsx:117-164 | error.message contains "404" / `data===null` / `!data.team` | — |
| T3 | ErrorState (non-404) | WorkTeam.tsx:130-134 | useTeam error | — |
| T4 | Breadcrumb "← Portfolio" link | WorkTeam.tsx:230-236 | react-router `Link to=/work/portfolio` | — |
| T5 | Team name `<h1>` + StatusChip | WorkTeam.tsx:239-243 | `team.name`, `team.status` ← `deriveTeamStatus()` teams-routes.ts:74-89, 802-810 | teams SELECT (547-551), team_members SELECT via `loadTeamMembers` (team-lookup.ts:42-55), tasks SELECT for blocked detection (682-688) |
| T6 | Phase / Lead line | WorkTeam.tsx:244-247 | `team.phase`; lead name resolved client-side from roster by `leadAgentId` (WorkTeam.tsx:213-216) | teams.phase, team_members.lead_agent_id |
| T7 | Burn vs Cap section (Bet cost, Routine cost, Total cost, Cap, Capacity rows + progress bar) | WorkTeam.tsx:251-293 | see Computation Traces §1 | team_members, bets, routine_runs, routines |
| T8 | "No active bets" EmptyState + create-bet hint card ("Got it" dismiss button) | WorkTeam.tsx:300-327 | `useHint("create-bet")` (hooks/useHints.tsx:125) → GET `/api/hint-progress`, dismiss → POST `/api/hint-progress/create-bet/dismiss` | hint progress table (out of scope) |
| T9 | BetRow (button, whole-row click) | WorkTeam.tsx:740-762, mapped at 330-338 | `onNavigate` → `navigate(/work/bet/:id)`. Displays `descriptionTitle` (`deriveTitle(bet.description)`), StatusChip via `betStatusToStatus`, `formatMoney(bet.costAppetite)`, `progressDone/progressTotal` | bets SELECT (teams-routes.ts:672-675), tasks SELECT per bet (681-688) |
| T10 | "+ New routine" Button | WorkTeam.tsx:349-357 | `setCreateRoutineOpen(true)` → mounts RoutineCreateDialog (475-485) | — |
| T11 | "No routines" EmptyState | WorkTeam.tsx:360-365 | `routines.length===0` (defaults `[]`, L190) | — |
| T12 | RoutineRow (button) — status dot, name, agent avatar, schedule, last run, cost | WorkTeam.tsx:659-737, mapped 367-376 | dot ← `routineStateToStatus(routine.state)` (design-system/status-mapping.ts:99); schedule ← `humanizeSchedule` (server, schedule-label.ts); last run ← `formatRelativeTime(lastRunAt)`; cost ← `formatMoney(routine.costActual)` else "—"; click → `/work/routine/:id` | routines SELECT excl. soft-deleted (teams-routes.ts:718-722), routine_runs latest-run SELECT per routine (769-774), users SELECT for owner names (752-763) |
| T13 | "+ Add agent" Button | WorkTeam.tsx:387-395 | `setAddDialogOpen(true)` → mounts AgentAddDialog (462-472) | — |
| T14 | review-agents hint card + "Got it" | WorkTeam.tsx:399-415 | `useHint("review-agents")`, dismiss POST | — |
| T15 | "No agents" EmptyState | WorkTeam.tsx:418-419 | roster empty | — |
| T16 | AgentRow (`div role="button"`, keyboard Enter/Space) — health dot, avatar, name+Lead, category Tag, status, context, Customize | WorkTeam.tsx:508-647, mapped 421-429 | row click → `/agents/:agentId`; Customize (stopPropagation) → `setEditingAgentId` → mounts AgentEditDialog (449-459). Health dot color ← `member.healthLevel` (server-derived, teams-routes.ts:661-662 via `deriveHealthLevel`/`deriveHealthDetail` agent-profile.ts:155-192); status ← `member.operationalStatus` (teams-routes.ts:649-657); context ← activeTaskTitle / healthDetail / role description | users SELECT (teams-routes.ts:560), sessions batch SELECT `inArray(agentId)` (582-594), tasks SELECT per active session (625-629); side-effect: notification_queue SELECT+INSERT when status=error (`maybeNotifyAgentError` teams-routes.ts:112-142, 665-667 → `enqueueNotification` fabric/notifications/dispatcher.ts:225) |
| T17 | ArtifactSection (stack, axis=product, limit=10) | WorkTeam.tsx:435-445 | `components/ArtifactSection.tsx` → GET /api/artifacts (separate domain) | artifacts |

### Dialog: RoutineCreateDialog (`pages/work/RoutineCreateDialog.tsx`)

Native `<dialog>` with JSDOM `showModal` fallback (L65-93). Form reset on open.

| # | Element | file:line | Chain |
|---|---------|-----------|-------|
| RC1 | Name input (required) | :158-166 | `setName` |
| RC2 | Description textarea | :172-179 | `setDescription` |
| RC3 | Team select | :183-202 | Only rendered when `teams.length > 1`; WorkTeam always passes exactly 1 team so it auto-resolves (L49-50) |
| RC4 | Agent select (required) | :209-223 | options from prop `agents` = `roster.filter(m => m.role !== "human")` (WorkTeam.tsx:481-483) — see FLAG F7 |
| RC5 | Schedule select (5 presets + "Custom…") | :230-244 | `SCHEDULE_PRESETS` shared/routine.ts:170-176 |
| RC6 | Custom cron input | :247-259 | shown when `scheduleValue === "custom"` |
| RC7 | Cost cap per run (USD) input | :266-277 | parsed `parseFloat * 100` → minor units (:102-104) |
| RC8 | Monthly cost cap (USD) input | :283-295 | → `costCapMonthlyMinor` (:106-108) |
| RC9 | Error `<p role="alert">` | :297-301 | server `error` field of non-ok response |
| RC10 | Cancel / Create buttons | :303-320 | Create → `handleSubmit` (:95-138) → `apiFetch POST /api/routines` body `{name, description?, teamId, ownerAgentId, triggerType:"calendar", triggerConfig: JSON({cron}), costCapPerRunMinor?, costCapMonthlyMinor?}` |

Server: `routines-routes.ts POST /` (:134-260). Validation: `createRoutineSchema` zod (:61-71)
via `validateBody` (middleware/validate.ts). Steps: teams SELECT (:138), users SELECT (:144),
JSON+cron validation via `parseCron` (fabric routine-scheduler.ts:111), stub task creation —
bets SELECT for parent bet, or INSERT system "Routine Operations" bet (:189-216), tasks INSERT
(:207-227), `nextRunAt` via `nextCronMatch` (:231-238), routines INSERT (:240-256, state="active",
active=true), routines SELECT-back → 201. No event emitted on create.

### Page: WorkRoutine — `/work/routine/:routineId` (`pages/WorkRoutine.tsx`)

Data: `useRoutine(routineId)` (hooks/useRoutine.ts:17-54) → `apiFetch GET /api/routines/:id`
→ routines-routes.ts GET `/:id` (:291-456).

| # | Element | file:line | Chain | DB |
|---|---------|-----------|-------|----|
| R1 | Loading skeletons / ErrorState / Not-found EmptyState | :62-88 | hook states | — |
| R2 | Breadcrumb "← Portfolio / {team} / {name}" | :176-187 | Link `/work/portfolio`; teamName from server (teams SELECT routines-routes.ts:308-309) | teams |
| R3 | Name + StatusChip | :188-193 | `routineStateToStatus(currentState)` — local optimistic state (:98) | routines.state |
| R4 | Agent · triggerType line, description | :194-199 | agentName (users SELECT :300-305) | users |
| R5 | Config KV grid: Agent, Schedule, Trigger type, Autonomy level, Next run, Last run, Created | :212-229 | scheduleLabel ← `humanizeSchedule` (schedule-label.ts:105+); autonomy label map (:155-164); Next run fallback "On next event" (:220) | routines columns |
| R6 | **Pause/Resume** button | :261-269 | `handleTogglePause` (:104-120): bare `fetch PATCH /api/routines/:id` `{state: "paused"|"active"}` → on `res.ok` set local state (NOT optimistic — waits for ok; no rollback needed; **no error feedback**, **bare fetch not apiFetch** — FLAGs F9/F10). Server: routines-routes.ts PATCH (:459-507), `updateRoutineSchema` zod (:73-86); syncs legacy `active` boolean via `stateToActive` (:92-94) | routines SELECT + UPDATE (:502) |
| R7 | **Trigger Now** button | :271-278 | `handleTriggerNow` (:123-134): bare `fetch POST /api/routines/:id/trigger`; **response ignored, no refetch of run history, no error feedback**. Server: routines-routes.ts (:525-718) — see Data Flow Chain §C3 | routines, routine_runs, sessions, tasks, bets |
| R8 | **Delete** button → inline confirm row ("Confirm delete" / "Cancel") | :282-289 / :232-258 | `setShowDeleteConfirm(true)`; confirm → `handleDeleteConfirm` (:137-153): `apiFetch DELETE /api/routines/:id` → on ok `navigate("/work/portfolio")`. Server DELETE (:269-288): soft delete — routines UPDATE `{deletedAt, state:"paused", active:false}` (:279-285) | routines UPDATE |
| R9 | Budget section | :295, 336-389 | see Computation Traces §2 | routine_runs aggregates |
| R10 | Last Run Summary | :298-311 | `routine.lastRunSummary` (written by `updateRoutineRunOnSessionEnd`, session-lifecycle.ts:109-115) | routines.last_run_summary |
| R11 | RunRow — time, duration, outcome dot, cost | :395-443, mapped :322-324 | dot color (:397-404): success→green, error/timeout→red, budget_exhausted/monthly_budget_exhausted→amber (`--accent-secondary`), anything else (skipped, running)→tertiary gray. durationSeconds computed server-side (:380-388); cost `formatMoney` else "—" | routine_runs SELECT limit 20 desc (:313-318) |

### Page: AgentProfile — `/agents/:agentId` (`pages/AgentProfile.tsx`)

Data: `useAgentProfile(agentId)` (hooks/useAgentProfile.ts:18-55) → `GET /api/agents/:id/profile`
→ `handleAgentProfile` (routes/agent-profile.ts:203-349). Registered before `/:id` in
agents.ts:91-93 (route-order lore).

| # | Element | file:line | Chain | DB |
|---|---------|-----------|-------|----|
| A1 | Loading / 404 EmptyState / ErrorState | :63-103 | hook | — |
| A2 | Breadcrumb "← {teamName ?? Agents}" | :129-136 | Link to `/work/team/:teamId` when teamId else `/work/portfolio` (teamId via teamMembers⋈teams join, agent-profile.ts:222-231) | team_members, teams |
| A3 | Health banner (role="alert") | :139-162 | `healthSignals.degraded` — failureRate7d>0.5 / lastSessionCrashed / !harnessAvailable (`computeHealthSignals` agent-profile.ts:66-133) | sessions SELECT all for agent (:234-245) |
| A4 | Header: Avatar, name, operational status chip, category Tag, role·team·created line | :164-203 | **operationalStatus derived on FE** (A2 lore): `isActive = activeSession !== null`; `isError = !isActive && lastSessionCrashed`; else idle (AgentProfile.tsx:113-116) | — |
| A5 | "↗ Active session" link | :205-214 | `/work/bet/:betId/task/:taskId`; betId via tasks SELECT (agent-profile.ts:249-263); `betId ?? ""` fallback → broken link if task missing (FLAG F15) | tasks |
| A6 | "Edit in Settings" link | :217-219 | `/conversations?settings=open` (router has `/settings` → same redirect) | — |
| A7 | Configuration section: Role, Harness, Category, Model tier, Team, Max sessions, Created + collapsible Soul prompt `<details>` | :224-251 | users columns | users |
| A8 | Harness Capabilities badges (Tool use, MCP, File editing, Sub-agents) | :254-268, CapabilityBadge :372-384 | `mapCapabilities` (agent-profile.ts:406-425): toolUse ← `preCompactionTrigger` proxy, fileEditing ← `subAgents` proxy; all-false when no adapterPool | — |
| A9 | Review Track Record: approval rate, count, window, 10 VerdictDots | :271-298, VerdictDot :387-402 | `computeApprovalRate` (fabric/approval-rate.ts:46-134), window from factorySettings `trust_window_days` default 30 (agent-profile.ts:313, 360-374) | messages⋈items (path 1), messages⋈threads (path 2), factory_settings |
| A10 | Recent Activity table (Task, Outcome chip, Cost, When) | :301-342, OutcomeChip :405-416 | last 10 sessions; task titles via single `inArray` JOIN-style query (agent-profile.ts:268-286); **Cost cell hardcoded "—"** (:333) | sessions, tasks |
| A11 | Performance row: Sessions, Success rate, Avg cost "—", Total cost "—" | :345-362 | see Computation Traces §3 | sessions |

### Dialog: AgentEditDialog (`pages/AgentEditDialog.tsx`)

Native `<dialog>`; opens when `agent !== null` (effect :70-82); native close event → onClose
(:85-95); backdrop `<form method="dialog">` (:338-340).

| # | Element | file:line | Chain |
|---|---------|-----------|-------|
| E1 | Header: avatar, name, role label+description, ✕ close | :169-188 | from `rosterMember` / `agent` + `findRoleCatalogEntry` (shared/agent-roles.ts:201) |
| E2 | Strategy-managed amber note | :200-210 | `agentCategory === "strategy"` |
| E3 | Soul Prompt textarea (rows=12) | :212-220 | controlled `formValues.soulPrompt` |
| E4 | "Load {role} template" button | :222-232 | shown when soul empty AND `catalogEntry.hasTemplate` AND not loading (:157-158); `handleLoadTemplate` (:122-147) → `apiFetch GET /api/agents/templates/:role` with AbortController; server agents.ts:99-114 → factory_settings SELECT key `soul_template:<role>`; 404 silently ignored |
| E5 | Show/Hide configuration toggle | :237-250 | local `configVisible` |
| E6 | Harness text input | :258-269 | disabled for strategy agents or while saving |
| E7 | Model tier select ("Default" + `MODEL_TIERS` reasoning/workhorse/fast) | :276-296 | shared/types.ts:87 |
| E8 | Max sessions number input (1-20) | :302-318 | `Number(e.target.value)` |
| E9 | Cancel / Save buttons (+spinner) | :328-334 | `handleSave` (:97-120): `apiFetch PATCH /api/agents/:id` body `{soulPrompt\|null, harnessType\|null, modelTierPreference\|null, maxConcurrentSessions}` → on ok `onSaved()` (parent `refetchAgents` + close) + toast "Agent saved"; catch → toast "Failed to save agent". Server agents.ts PATCH (:207-266): users SELECT, kind/system guard 403, `patchAgentSchema` zod (:44-51), users UPDATE via `buildPatchUpdateSet` (:60-71, :240), sessions count SELECT for response |

### Dialog: AgentAddDialog (`pages/AgentAddDialog.tsx`)

| # | Element | file:line | Chain |
|---|---------|-----------|-------|
| AD1 | Agent name input (autoFocus, required) | :165-174 | `formValues.name` |
| AD2 | Role select (TEAM_ROLES = catalog category==="team") | :180-192, :47 | `handleRoleChange` (:111-117): clears soulPrompt then `fetchTemplate(role)` (:89-109) → `GET /api/agents/templates/:role` (abortable) — auto-fills soul textarea |
| AD3 | Role description text | :194-196 | catalog lookup |
| AD4 | ✕ close | :198-205 | onClose |
| AD5 | Soul Prompt textarea (rows=10) | :217-225 | controlled |
| AD6 | Harness / Model tier / Max sessions config (always expanded) | :233-299 | mirrors edit dialog |
| AD7 | Cancel / Create (disabled until name non-empty) | :307-320 | `handleCreate` (:119-145): `apiFetch POST /api/agents` body `{name, role, soulPrompt\|null, harnessType\|null, modelTierPreference\|null, maxConcurrentSessions, teamId: teamMembersId}` (**team_members.id, not teams.id** — lore-guarded, WorkTeam passes `data.teamMembers.id` L465). Server agents.ts POST (:150-204): `createAgentSchema` zod (:33-42), agentCategory derived explicit > catalog > "team" (:171-172), users INSERT (:174-187) → 201. Toast "Agent created"/"Failed to create agent" |

Note: the role-change template fetch (AD2) has no rollback — on success it sets soulPrompt even
if the user typed since (soulPrompt cleared first, so race window is small but exists).

---

## Computation Traces

### 1. WorkTeam Burn vs Cap (teams-routes.ts GET /:teamId)

| KV row | FE source (WorkTeam.tsx) | Server computation | DB |
|--------|--------------------------|--------------------|----|
| **Bet cost** | :261-264 — `burn.betCostActual ? formatMoney : "$0.00"` | `betCostActualMinor = Σ activeBetRows.costActualMinor` (teams-routes.ts:712-715); wrapped to WireMoney **only when > 0** (:839-842) | bets.cost_actual_minor — written ONLY by `recordCostAndCheck` (fabric/cost-cap.ts:260-268) per `cost_update` event from `provisionSession` (session-provisioning.ts:601-611) |
| **Routine cost (this month)** | :265-272 — `burn.routineCostThisMonth ? "${formatMoney} (this month)" : "$0.00 (this month)"` | `Σ routine_runs.cost_minor WHERE routineId IN (team routines) AND startedAt >= first-of-UTC-month` (:727-746); null when 0 (:843-846) | routine_runs.cost_minor — written only by `updateRoutineRunOnSessionEnd` (session-lifecycle.ts:94-106) when a routine session ends via provisionSession path |
| **Total cost** | :273 — `formatMoney(burn.costActual)` → "--" when null | `teamMembers.costActual` legacy running counter (:801, :830-834). NOT bet+routine sum; all-time accumulator | team_members.cost_actual — written by `recordCostAndCheck` (cost-cap.ts:244-249), reset by `resetCosts` (cost-cap.ts:485-492) |
| **Cap** | :274 — `formatMoney(burn.costCap)` → "--" when null | `costCapMinor ?? costCap` (:799, :835); currency = `costCapCurrency ?? "USD"` (:813) | team_members.cost_cap_minor / cost_cap — **no write path found anywhere** (seed sets neither; no PATCH endpoint exposes them) → always "--" |
| **Capacity** | :275 — `"{activeBets} / {capacity}"` | cached counters | team_members.active_bets (maintained by bet-state-machine.ts:181-216 under write-lock), team_members.capacity (seeded 5; set 5 on team create teams-routes.ts:360) |
| Progress bar | :219-292 — `capPercent = min(1, costActual.minor / costCap.minor)` when cap>0 else 0; null cap renders 0-value gray bar with aria "Cost cap not set" | — | — |

Where "$0.00" and "--" come from: "$0.00"/"$0.00 (this month)" are **hardcoded FE fallbacks**
(USD-assuming) when betCostActual/routineCostThisMonth are null (server nulls them at 0).
"--" comes from `formatMoney(null)` (shared/format/money.ts:14-16). With seed data
(no sessions, no runs, no caps): Bet cost $0.00, Routine cost $0.00, Total cost $0.00
(team_members.cost_actual defaults 0 → WireMoney{0}), Cap "--", Capacity 0/5.

**Over-counting bug in the only cost write path**: session-provisioning.ts:590 accumulates
`totalCostCents += delta`, then :601-603 calls `recordCostAndCheck({costMinor: totalCostCents})`
— the **running total**, while `recordCostAndCheck` **adds** `effectiveCostMinor` to
users.costActual, teamMembers.costActual, and bets.costActualMinor (cost-cap.ts:233-269).
N cost_update events with deltas d1..dN accumulate Σ(running totals) instead of Σ(deltas) —
quadratic inflation of Bet cost AND Total cost. See FLAG F1.

### 2. WorkRoutine Budget section (routines-routes.ts:320-378 → BudgetSection WorkRoutine.tsx:336-389)

- **Avg cost per run**: `AVG(routine_runs.cost_minor) WHERE routineId=? AND cost_minor > 0`
  (:328-332). FE fallback when null: `"---"` (three hyphens — inconsistent with "--"/"—"
  used elsewhere, FLAG F13).
- **Cost this month**: `SUM(cost_minor) WHERE startedAt >= first-of-UTC-month` (:335-340);
  null when 0 → FE "$0.00".
- **Cost cap per run / Monthly cap**: routines.cost_cap_per_run_minor /
  cost_cap_monthly_minor, FE "No cap" when null.
- **Per-run utilization** = `round(lastCompletedRunCost / capPerRun * 100)` where
  lastCompletedRun = first of the 20 fetched runs with cost>0 AND outcome ∈
  {success, budget_exhausted} (:343-354). Null when no cap or no such run.
- **Monthly utilization** = `round(costThisMonth / capMonthly * 100)`, null when no cap
  **or costThisMonth == 0** (:356-359) — a capped routine with zero spend shows no bar.
- **80% amber logic** (FE, WorkRoutine.tsx:364-386): `Progress variant = percent > 80 ? "amber" : "green"`
  — strictly greater: exactly 80% renders green. ≥100% monthly additionally shows
  "Monthly budget exhausted — runs skipped until next month" (:380-384).
- Cap enforcement (server side): monthly — checked at trigger (routines-routes.ts:571-583 via
  `getRoutineMonthlySpend` fabric/routine-scheduler.ts:343-354) and in scheduler
  (routine-scheduler.ts:379-394), writing a `monthly_budget_exhausted` run row. Per-run —
  enforced mid-stream in provisionSession (session-provisioning.ts:594-597 → endSession with
  `"budget_exhausted"` :710-720).

### 3. AgentProfile Performance (agent-profile.ts:288-292)

- **Sessions** = `allSessions.length` — count of ALL sessions rows for agent (single SELECT
  :234-245, no window).
- **Success rate** = `count(outcome === "completed") / totalSessions`, 0 when none. Note:
  active (un-ended) sessions count in the denominator, deflating the rate.
- **Avg cost / Total cost** = hardcoded `"—"` in FE (AgentProfile.tsx:359-360); per @lore AB1
  "sessions table lacks cost columns. Honest over fabricated." Same for the per-row Cost
  column (:333) — server always sends `cost: null` (agent-profile.ts:284).
- **Review track record**: `computeApprovalRate(db, agentId, windowDays=factory_settings
  trust_window_days||30, 10)` (approval-rate.ts:46-134) — verdict messages via
  messages⋈items.sourceAgentId (legacy path) ∪ messages⋈threads.initiatorId (no legacyItemId);
  approval = decision ∈ {approve, approve-with-comments}.

### 4. Agent health derivation (A2)

- **Backend signals** — `computeHealthSignals` (agent-profile.ts:66-133): failureRate7d =
  crashed/total over sessions started in last 7 days; lastSessionCrashed = latest crash
  strictly newer than latest success within 7d; harnessAvailable via
  `resolveHarnessAvailable` (agent-profile.ts:389-400 — no pool ⇒ always true);
  idleDurationMs from most recent ended session (all time);
  degraded = failureRate7d>0.5 ∨ lastSessionCrashed ∨ ¬harnessAvailable.
- **AgentProfile page (frontend)**: operationalStatus = active (activeSession≠null) /
  error (lastSessionCrashed) / idle (AgentProfile.tsx:113-116). Health banner =
  `healthSignals.degraded`.
- **WorkTeam AgentRow (backend-enriched)**: teams-routes.ts:616-668 — same signals;
  operationalStatus error when `failureRate7d > 0.5 || lastSessionCrashed` (broader than
  profile page, which only uses lastSessionCrashed — FLAG F16); healthLevel via
  `deriveHealthLevel` (critical >0.5 rate / warning crash-or-harness / healthy);
  healthDetail via `deriveHealthDetail`. Team list route (`GET /teams`) computes
  `agentHealthWarning = any agent degraded` (teams-routes.ts:265-291).
- Side-effect: error status on team detail GET enqueues `agent.health.degraded`
  notification, throttled by existing-pending check (teams-routes.ts:112-142).

### 5. Run history provenance (routine_runs writers)

| Writer | Outcome written | file:line |
|--------|-----------------|-----------|
| POST /:id/trigger — monthly cap hit | `monthly_budget_exhausted` | routines-routes.ts:574-581 |
| POST /:id/trigger — coalesced | `skipped` (+errorMessage) | routines-routes.ts:589-597 |
| POST /:id/trigger — provision path | `running` pre-insert (:624-629), sessionId backfilled (:656-659); error → `error`+endedAt+message (:667-676) | routines-routes.ts |
| POST /:id/trigger — kernel fallback | `running` with sessionId (:695-702) | routines-routes.ts |
| Session end (provision path) | `success` / `budget_exhausted` / `error` + endedAt + costMinor + summary; also routines.lastRunAt/lastRunSummary | session-lifecycle.ts:71-116, called :253-262, :322-331 |
| Scheduler monthly-cap skip | `monthly_budget_exhausted` | fabric/routine-scheduler.ts:382-389 |
| Scheduler successful fire | **NOTHING — no routine_runs row inserted** | routine-scheduler.ts:419-450 (FLAG F3) |

Outcome → dot color (WorkRoutine.tsx RunRow:397-404): success=green, error/timeout=red,
budget_exhausted/monthly_budget_exhausted=amber, skipped/running/other=gray. ("timeout" is
mapped in FE but no writer ever produces it — dead branch.)

---

## Data Flow Chains (full chains for the routine actions)

**C1 — Pause/Resume**: button (WorkRoutine.tsx:261-269) → `handleTogglePause` (:104-120) →
bare `fetch PATCH /api/routines/:id {state}` → `validateBody(updateRoutineSchema)`
(routines-routes.ts:73-86, 459) → routines SELECT (soft-deleted ⇒ 404, :476-480) →
routines UPDATE `{state, active: stateToActive(state)}` (:490-502) → SELECT-back JSON. FE
sets `currentState` only on `res.ok`; no toast/UI on failure; no event emitted; the parent
team page's routine list is NOT refreshed.

**C2 — Delete**: Delete btn → inline confirm (:232-258) → `handleDeleteConfirm` (:137-153)
→ `apiFetch DELETE /api/routines/:id` → routines UPDATE `{deletedAt: now, state:"paused",
active:false}` (routines-routes.ts:277-285) → `{deleted:true}` → FE navigate
`/work/portfolio`. Soft delete; history (routine_runs, stub task) preserved. No event.

**C3 — Trigger Now**: btn → `handleTriggerNow` (:123-134) → bare `fetch POST
/api/routines/:id/trigger` → routines-routes.ts:525-718:
1. 404 check (deletedAt NOT checked here — soft-deleted routines have active=false so step 2
   returns 403 instead of 404, minor inconsistency);
2. `active===false` ⇒ 403 FORBIDDEN;
3. builtin ids → `runBuiltinRoutine` (fabric);
4. monthly cap → `getRoutineMonthlySpend` ⇒ insert `monthly_budget_exhausted` run, fired:false;
5. coalescing → `shouldCoalesce` (active session with sessions.routineId=:id,
   routine-scheduler.ts:324-331) ⇒ insert `skipped` run;
6. `findReferenceTaskId` (stubTaskId, else any owner task, else any task; none ⇒ 409);
7. with adapters: pre-insert `running` run → routines.lastRunAt=now →
   `provisionSession({routineId})` (11 phases; sessions INSERT with routineId
   session-provisioning.ts:346; cost_update events → `recordCostAndCheck`; per-run cap break)
   → backfill run.sessionId → 200 `{fired:true,sessionId,outcome}`. Session end →
   `endSession`/`crashSession` → `updateRoutineRunOnSessionEnd` (matches routineId+
   outcome="running") → run finalized + routines.lastRunAt/lastRunSummary;
8. kernel fallback: sessions INSERT (state=active, routineId), routine_runs INSERT
   (`running`, sessionId), routines.lastRunAt=now, emit `session_started`, 201 session JSON.
   **Nothing ever finalizes this fallback run** unless a separate lifecycle path ends the
   session with routine context.

**C4 — Scheduled fire** (fabric/routine-scheduler.ts:500-532 `startRoutineScheduler`):
poll active routines where nextRunAt <= now → `checkAndFireRoutine` (:358-451): factory cap
check (factory_settings cost_cap/cost_actual) → monthly cap → WIP limit (+ delegation via
user_skills) → `createRoutineSession` (sessions INSERT — **no routineId set**, **dead
`cost: 0` field**, :228-236) → optional review item (threads+items INSERT) → routines
lastRunAt/nextRunAt UPDATE → emit `routine_fired`. Requires `triggerConfig.taskId` (:365-369)
— UI-created routines only carry `{cron}` so they return "no taskId in trigger config".
**No caller of `startRoutineScheduler` exists in the server** (only fabric export + tests).

---

## FLAGS

| # | Severity | Finding |
|---|----------|---------|
| **F1** | **Critical** | **Cost over-counting**: session-provisioning.ts:601-603 passes the cumulative `totalCostCents` as `costMinor` to `recordCostAndCheck`, which *adds* it to users.costActual / team_members.costActual / bets.costActualMinor on **every** cost_update event (cost-cap.ts:237-269). Multiple cost events per session ⇒ quadratic inflation of "Bet cost" and "Total cost" on Burn vs Cap, and of cap-breach checks. Should pass the per-event delta. |
| **F2** | **Critical** | **Routine scheduler never started**: `startRoutineScheduler` has zero callsites outside fabric exports/tests. Scheduled (cron) routines created in the UI never fire automatically — only "Trigger Now" works. `nextRunAt` is computed and displayed but nothing consumes it in the running server. |
| **F3** | **High** | Even if the scheduler ran: (a) `checkAndFireRoutine` requires `triggerConfig.taskId` (routine-scheduler.ts:365-369) which UI-created routines (`{cron}` only) never have ⇒ permanent "no taskId" skip; (b) on successful fire it inserts **no routine_runs row** and creates the session **without `routineId`** (:228-236) ⇒ no run history, coalescing blind, lifecycle hook can't finalize. Scheduler and AA2 trigger flow are two divergent implementations. |
| **F4** | High | **routines.costActualMinor is never written** (only read, routines-routes.ts:425/teams-routes.ts:789). RoutineRow "Cost" column on WorkTeam (WorkTeam.tsx:680) and `routine.costActual` in RoutineDetail are permanently "—"/null. Either dead schema or missing accumulation in `updateRoutineRunOnSessionEnd`. |
| **F5** | High | **team_members.costCapMinor/costCap have no write path** (no API, no seed). "Cap" on Burn vs Cap is always "--", capPercent always 0, the `overBudget` branch of `deriveTeamStatus` (teams-routes.ts:86) and team-level cap checks in cost-cap.ts can never trigger. Given seed data, Cap "--" is guaranteed. |
| **F6** | High | Kernel-fallback Trigger Now (routines-routes.ts:680-717) leaves a session `state="active"` and a run `outcome="running"` forever (no harness drives it to completion). Subsequent triggers are then permanently **coalesced/skipped** (shouldCoalesce sees the active session) — one manual trigger in kernel mode bricks the routine until someone manually patches the session. |
| **F7** | High | **FE/BE mismatch in RoutineCreateDialog agent filter**: WorkTeam.tsx:481-483 filters roster by `m.role !== "human"`, but "human" is a `users.kind`, not a role (humans have role "founder" etc.). Any human assigned to the team roster would be offered as a routine owner agent. Same conceptual gap: the roster query (teams-routes.ts:560) does not filter `kind="ai"`, so humans appear as AgentRows with health dots and a Customize button (PATCH then 403s). |
| **F8** | Medium | **No data refresh after mutations on WorkTeam**: RoutineCreateDialog `onCreated` only closes the dialog (WorkTeam.tsx:479) — new routine invisible until full page reload (useTeam has no refetch). AgentAddDialog `onCreated` calls `refetchAgents()` (WorkTeam.tsx:467-469) which refreshes `/api/agents` configs only — the **roster list comes from useTeam data**, so the new agent also doesn't appear until reload. |
| **F9** | Medium | WorkRoutine `handleTogglePause` (:109) and `handleTriggerNow` (:127) use **bare `fetch`**, not `apiFetch` — no X-API-Key injected. In Electron/prod (key only via window.__HYPERIDLE__) these two buttons 401 silently; `handleDeleteConfirm` correctly uses apiFetch. Inconsistent within the same file. |
| **F10** | Medium | Missing error handling on all three routine actions: non-ok responses produce **no user feedback** (pause silently does nothing; delete silently closes the confirm; trigger ignores the response entirely and never refreshes run history). Network rejections in `handleTogglePause`/`handleTriggerNow` propagate as unhandled promise rejections (try/finally without catch, invoked directly from onClick). |
| **F11** | Medium | GET-with-side-effects: `GET /api/teams/:id` INSERTs into notification_queue for error-state agents (teams-routes.ts:665-667). Throttled only by "pending" status — once the notification is dispatched/dismissed, the next page view re-enqueues. Read path doing writes also breaks caching assumptions. |
| **F12** | Medium | WorkTeam AgentRow "error" derivation (`failureRate7d > 0.5 \|\| lastSessionCrashed`, teams-routes.ts:650) differs from AgentProfile's FE derivation (only `lastSessionCrashed`, AgentProfile.tsx:115). An agent with >50% failures but a recent success shows "error" on the team page and "idle" on its own profile. |
| **F13** | Low | Placeholder inconsistency: `"---"` (Avg cost per run, WorkRoutine.tsx:349) vs `"--"` (formatMoney null) vs `"—"` em-dash (RoutineRow cost, RunRow, AgentProfile cost cells) vs hardcoded `"$0.00"` (assumes USD regardless of team currency). |
| **F14** | Low | Dead/unreachable display logic: (a) RunRow maps outcome "timeout" (WorkRoutine.tsx:400) — no writer ever produces it; (b) `routines.state="error"` is never set by any server/fabric code, so RoutineRow's error dot and StatusChip error state are only reachable via manual PATCH; (c) `routineRunOutcome` lastRunOutcome is fetched per-routine on WorkTeam (extra query per routine, teams-routes.ts:769-774) but RoutineCardSummary.lastRunOutcome is never rendered by RoutineRow; (d) `cost: 0` in scheduler's session insert (routine-scheduler.ts:235) references a column stripped from sessions — silently dropped by Drizzle. |
| **F15** | Low | AgentProfile active-session link uses `betId ?? ""` (agent-profile.ts:260) — if the task row is missing, the link becomes `/work/bet//task/:taskId` (broken navigation). |
| **F16** | Low | Performance "Success rate" denominator includes active and stopped sessions (agent-profile.ts:289-291) — an agent with 1 completed + 1 currently-active session shows 50%. |
| **F17** | Low | Given seed data (no sessions, no routine_runs, no caps, no verdict messages, draft-only bet): every number on these pages is zero/empty — Performance 0 / 0%, Review Track Record empty, Burn vs Cap $0.00/$0.00/$0.00/--/0-5, routine cost "—", budget "---"/"$0.00"/"No cap". Nothing in the seed exercises any non-zero path. |
| **F18** | Low | `useTeamAgents` fetches the **entire** agent list and filters client-side (hooks/useTeamAgents.ts:67-78) — includes every agent's soulPrompt (up to 50KB each) just to power the team's edit dialogs. Acceptable per AB3 lore but a payload smell at scale. Also: if the roster agent is retired or fetch is in-flight, Customize opens AgentEditDialog with `agent=null`, which **never opens the native dialog** (effect no-ops) — the click silently does nothing. |
| **F19** | Info | N+1 query patterns in GET /teams/:id: tasks SELECT per active session (teams-routes.ts:625-629), per active bet (:682-685), routine_runs latest per routine (:769-774); GET /teams list is worse (per-team bet counts, sessions, tasks). Fine for laptop scale, flagged for the record. |
| **F20** | Info | Trigger Now on a soft-deleted routine returns 403 "disabled" rather than 404 (deletedAt not checked, routines-routes.ts:528-539); POST /:id/retire (:510-522) also ignores deletedAt and is not used by any of these pages (dead endpoint for this UI). |
