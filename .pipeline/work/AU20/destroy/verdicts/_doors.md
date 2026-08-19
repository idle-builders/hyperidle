# _doors — destroyer verdict (all doors except the 22 agent tools)

Scope: 180 HTTP routes + 8 scheduler ticks + 6 worker-protocol messages = **194 doors**.
Enumerated from `npx tsx tools/trace/trace-doors.ts` (216 total − 22 agent TOOLs).

Method note: every "no caller" below was confirmed with `rg -a` across `layers/ framework/ applications/`
(production files only — tests/stories/`__` dirs excluded), including the two string-built HTTP seams the
graph cannot see: `buildCoreApiPort` (agent-orchestration → core-api, backs the agent tools) and
`AgentOrchestrationPort` (core-api → agent-orchestration). Both seams were read line-by-line and every
seam method traced to a production consumer. `tools/` is development world and never counts as a caller.

## Should this surface exist?

Yes — the door surface is where HyperIdle IS a product: conversations, bets, knowledge, agents, routines,
settings. But **48 of 180 HTTP routes (27%) have zero production callers or duplicate another door.** The
biggest finding is not a dead route — it is a *half-wired core feature*: the AL7 proposed-call approval
loop cannot close, because the one route that composes the grant on approval has no caller anywhere.

## If written today, from scratch

The honest door surface is: the ~110 UI-called routes behind the real pages (conversations/threads,
bets, knowledge, agents, teams, routines, settings, filesystems, connections, credentials, notifications
inbox, search, review page), the ~28 seam routes that back the agent tools and the core↔orchestration
split, the 2 MCP doors + worker WS + 6 worker messages, and 6 of the 8 timers. Everything else — explicit
HTTP session starts, shared-mode auth, status/ops endpoints, notification channel administration,
knowledge merge/split/flag, legacy conversations reads, user inboxes, manual task mutation — is dead
weight and goes.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 49 (48 routes + 1 tick) |
| MERGE | 5 (4 routes + 1 tick) |
| SIMPLIFY | 2 (1 route + 1 tick) |
| KEEP | 138 |

Surface: **194 doors → 140 doors (28% cut)**; HTTP alone: 180 → 132 (27% cut).

## Feature kill list

### 1. Explicit session start over HTTP — 7 doors, DELETE
`POST /api/sessions/`, `GET /api/sessions/starts/:startId`, `POST /api/agent-orchestration/intents/explicit-start`,
`GET /api/agent-orchestration/requests/explicit-start`, `GET .../requests/explicit-start/:startId`,
`POST .../runs/explicit-start/fail`, `POST .../runs/bare`.
The whole family is only reachable from itself: `POST /api/sessions` (`layers/core-api/src/routes/sessions-routes.ts`)
is the sole caller of `createExplicitStart`/`findExplicitStartBy*`/`createBareRun`/`failExplicitStart`
(via `agent-orchestration-port-composition.ts`), and **nothing in production dials `POST /api/sessions`** —
the UI only `GET`s `/api/sessions?task_id=` (`Conversations.tsx:125`), and the 202 body's `pollUrl` has zero
consumers (`rg pollUrl layers/core-ui` = empty). Real sessions start through the intent queue: thread
messages, routine triggers, handoffs. Dies with it: `explicit_session_starts` machinery,
`framework/http-middleware/src/http/explicit-start-projection.ts`, `agent-run-admission-reactions.ts`.
Breaks: nothing observable. No client can reach this today.

### 2. AL7 proposed-call approval loop — human half is ALREADY unwired. 4 doors, DELETE (or wire ONE caller)
`POST /api/threads/:threadId/messages/:messageId/verdict` + `POST /api/reviews/proposed-calls`,
`POST .../consume`, `POST .../:id/outcome`.
Evidence: grant composition lives ONLY in the dedicated verdict route (`routes/threads.ts:1607` — "verdict →
tailored grant + proposed_call_granted"). The verdict-message path inside `POST /:id/messages` explicitly does
NOT compose it (`threads.ts:1559-1562`: "handled by proposed-call workflow (Task 8) … `void decision`").
ReviewPage submits verdicts via `postVerdictHostMessage` → the *messages* route (`ReviewPage.tsx:191`,
`host-threads.ts:132`) — **no production code ever calls the `/verdict` route**. Consequence: approving a
review resolves the thread but never mints a grant, so `consumeTailoredGrant` (agent tool dispatch) can never
find one — the approve→act loop is broken end to end and nobody has noticed, which proves it is not
load-bearing today. Default verdict per brief: DELETE all four routes plus the capture/consume machinery in
tool dispatch. Alternative if the founder still wants AL7 (trust-model says it gates unconditionally): keep
all four and add ONE fetch in `handleSubmitVerdict`. Founder decision required; the current state is the
worst of both — full machinery, zero function.

### 3. Shared-mode auth: invites + login sessions — 3 doors, DELETE
`POST /api/auth/claim`, `POST /api/auth/invite`, `POST /api/auth/logout`.
Zero callers in UI, desktop, remote-server, website (`rg` across all apps). No client implements the
invite/claim/login-session flow; the product authenticates via API key (`X-API-Key`) + `/api/auth/me` /
`ws-token` / `worker-token`, all of which stay. Dies with it: invite_codes writes and the
login_sessions/invite_codes retention sweep. Breaks: multi-user shared-backend login — which is already
unreachable. Preemptive enterprise auth by construction.

### 4. Ops/status observability — 4 doors, DELETE
`GET /api/status/`, `GET /api/status/health`, `GET /api/status/digest`, `GET /api/workers/`.
`routes/status.ts` itself admits the root route has "zero consumers repo-wide". `/status/health` appears only
in the rate-limit skip list. `getDailyDigest` has no production reader. `/api/workers` ("worker admin
visibility") is referenced only by comments in `framework/harness-protocol`. Liveness stays on `/api/health`
(desktop boot polls it). Admin dashboards for an audience of zero.

### 5. Outbound notification-channel administration — 7 doors, DELETE
`GET /api/notifications/` (root list), `GET+PATCH /api/notifications/config`, `POST /test`, `GET /queue`,
`POST /flush`, `POST /digest`.
Zero callers anywhere — `SettingsNotifications.tsx` makes no API calls at all (a stub). The config PATCH even
writes an "admin-action audit record" (`notifications-routes.ts:210`) — an audit trail on a route nobody can
reach. The in-app inbox (`/inbox`, `/seen`, `/:id/read`, `/mute*`) is UI-used and stays, as does the drain
tick. Hole worth naming: with `PATCH /config` gone, SMTP/ntfy channels are permanently unconfigurable —
the external-channel delivery code becomes a follow-up kill for the notifications service destroyer.

### 6. Knowledge curation ceremony — 4 doors, DELETE
`POST /api/knowledge/:id/merge`, `POST /:id/split`, `POST /:id/flag`, `GET /api/team-members/`.
Zero callers: not in the UI (which uses list/detail/create/edit/scope/archive/triage-count), not in the
CoreApiPort seam (which carries search/create/patch/get/conflicts/promote/attention only). Librarian
features nobody asked for.

### 7. Legacy conversations read API — 2 doors, DELETE
`GET /api/conversations/`, `GET /api/conversations/:threadId`.
The conversations UI reads `/api/threads*` exclusively. The only remaining reference to `GET
/api/conversations/:threadId` is a rollback doc in `framework/db`. The `/items*` sub-routes are
seam-reached by agent tools and stay.

### 8. User inbox messaging — 2 doors, DELETE
`GET+POST /api/users/:id/inbox`. Superseded by `GET /api/threads/inbox` (agent `read_inbox`) and
`POST /api/threads/direct` (DMs). Second inbox, zero callers.

### 9. Manual task mutation API — 2 doors, DELETE
`PATCH /api/tasks/:id`, `POST /api/tasks/:id/transition`. The UI only batch-reads tasks
(`useAgentRunState.ts:79`); task state moves via events/policy in-process and via the agent seam
(create/notes/handoff), never through these routes.

### 10. Bet lifecycle leftovers — 3 doors, DELETE
`GET /api/bets/canvas` (canvas view retired; zero callers), `POST /api/bets/:id/ship` (completion is
event-propagated via `lifecycle-propagation` → `transitionBetStatus`; no caller), `POST /api/bets/:id/outcome`
(WorkBet.tsx:584 — "Replaces the AC1 POST /outcome call"; retro superseded it).

### 11. Second doors — 4 route MERGEs
- `POST /api/org/teams` (agent create_team) vs `POST /api/teams/` (UI) — one create door.
- `GET /api/org/teams/:teamId` vs `GET /api/teams/:teamId` — both UI-called (`useAgentRunState` vs
  `useTeam`); one read door.
- `POST /api/threads/scaffold` (agent insertThread) vs `POST /api/threads/` (UI) — one create door.
- `GET /api/knowledge/search` (agent query_practice) vs `GET /api/search/` (UI global) — one search door
  with a scope param.

### 12. Timer kills
- **DELETE** the 30s propagation retry heartbeat (`lifecycle-propagation.ts:806`): propagation is
  event-driven at write time and bet→team is "derived on read" (its own comment); the heartbeat exists to
  heal `propagation_log`, an audit ledger with no reader. The retention reaper even reaps it — bookkeeping
  to clean bookkeeping.
- **MERGE** the agent-layer reap timer (`start-runtime.ts:331`) into the 1s wake drain it sits next to —
  same loop, one fewer timer.
- **SIMPLIFY** the retention reaper (`service-bootstrap.ts:525`): loses login_sessions/invite_codes (kill 3)
  and propagation_log (kill 12) sweeps; shrinks to notification_queue + knowledge_access_log +
  task_dispatch_attempts — real unbounded growth on a laptop PGlite, so the timer itself stays.

### 13. Singles
`POST /api/teams/:teamId/agents` (UI adds agents via `POST /api/agents/`; agents via org/scaffolded-agents),
`PATCH /api/artifacts/:id/preview` (create carries preview; no patcher), `POST /api/routines/:id/retire`
(UI uses `DELETE /api/routines/:id`), `GET+PATCH /api/settings/` (UI reads only
`/api/settings/agent-behavior/*`; M2 aggregate has no fetcher), `POST /api/harnesses/:type/disabled` (no UI
toggle exists), `POST /api/connections/:id/validate` (SettingsConnections never validates; credentials
validate is the used one), `PATCH /api/sessions/:id` (state/effectiveness writes happen in-process via the
worker protocol; no dialer), `GET /api/agent-orchestration/sessions` + `GET .../sessions/:sessionId/activity`
(seam methods `listSessionHistoryBySource`/`getRecentActivity` have zero core-api consumers; the UI-facing
`/api/sessions` list + `/api/sessions/:id/activity` serve the same data in-layer).

## Full door audit

Reach tags: `UI:` browser client (`layers/core-ui/src`, desktop). `AGENT-SEAM:` reached by agent tools via
`buildCoreApiPort`. `CORE-SEAM:` reached by core-api via `AgentOrchestrationPort`. `WORKER:` remote-worker
client / harness. `DEAD:` zero production callers (rg-confirmed).

### HTTP routes (order of trace-doors)

| # | Door | Called by UI? | Verdict | Reason |
|---|---|---|---|---|
| 1 | GET /api/health | desktop boot + rate-limit floor | KEEP | Liveness probe the desktop app actually polls. |
| 2 | POST /api/users/ | UI:SetupFlow | KEEP | First-run human creation. |
| 3 | POST /api/auth/claim | DEAD | DELETE | Invite-claim flow no client implements (kill 3). |
| 4 | GET /api/auth/me | UI:useCurrentUser | KEEP | Identity read behind every page. |
| 5 | POST /api/auth/ws-token | UI:ws-client | KEEP | WS auth for live updates. |
| 6 | POST /api/auth/worker-token | WORKER:remote-worker-client | KEEP | Worker WS auth. |
| 7 | POST /api/auth/invite | DEAD | DELETE | Shared-mode invite minting, zero callers (kill 3). |
| 8 | POST /api/auth/logout | DEAD | DELETE | Login-session revoke for sessions nobody can create (kill 3). |
| 9 | GET /api/health/auth | desktop credential-validator | KEEP | Desktop validates shared-backend key with it. |
| 10 | GET /api/agents/:id/profile | UI:useAgentProfile | KEEP | Agent profile pane. |
| 11 | GET /api/agents/templates/:role | UI:AgentEditor, AgentAddDialog | KEEP | Prompt-template read for agent creation. |
| 12 | GET /api/agents/ | UI:SettingsAgents, useTeamAgents | KEEP | Agent roster. |
| 13 | POST /api/agents/ | UI:AgentAddDialog, SettingsAgents | KEEP | Create agent — core act. |
| 14 | PATCH /api/agents/:id | UI:AgentEditor | KEEP | Edit agent. |
| 15 | DELETE /api/agents/:id | UI:SettingsAgents | KEEP | Remove agent. |
| 16 | GET /api/model-gateway/ | UI:SettingsModels, SetupFlow | KEEP | Model config read. |
| 17 | PATCH /api/model-gateway/ | UI:SettingsModels, SetupFlow | KEEP | Model config write. |
| 18 | GET /api/teams/ | UI:useTeams, SetupFlow | KEEP | Team list. |
| 19 | POST /api/teams/ | UI:SetupFlow, WorkOverview | KEEP | Team create — merge target for #97. |
| 20 | POST /api/teams/:teamId/agents | DEAD | DELETE | Third way to add an agent; zero callers (kill 13). |
| 21 | PATCH /api/teams/:teamId | UI:useTeam + AGENT-SEAM:updateTeam | KEEP | Team edit, both actors. |
| 22 | GET /api/teams/:teamId | UI:useTeam | KEEP | Team read — merge target for #100. |
| 23 | GET /api/bets/ | UI:WorkBetCreate, KnowledgeDetail | KEEP | Bet list. |
| 24 | GET /api/bets/canvas | DEAD | DELETE | Canvas view retired; zero callers (kill 10). |
| 25 | GET /api/bets/:id | UI:useBet + AGENT-SEAM:getBetById | KEEP | Bet detail. |
| 26 | POST /api/bets/ | UI:WorkBetCreate + AGENT-SEAM:create_bet | KEEP | Bet create, both actors. |
| 27 | PATCH /api/bets/:id | UI:WorkBet + AGENT-SEAM:edit_bet | KEEP | Bet field edit, both actors. |
| 28 | POST /api/bets/:id/commit | UI:WorkBet:545 | KEEP | Commit a bet — the time-box act. |
| 29 | POST /api/bets/:id/ship | DEAD | DELETE | Completion is event-propagated; no caller (kill 10). |
| 30 | POST /api/bets/:id/kill | UI:WorkBet | KEEP | Kill a bet + cascade — core act. |
| 31 | POST /api/bets/:id/outcome | DEAD | DELETE | Superseded by retro (WorkBet.tsx:584) (kill 10). |
| 32 | POST /api/bets/:id/retro/draft | UI:WorkBet:616 | KEEP | AI retro draft. |
| 33 | POST /api/bets/:id/retro | UI:WorkBet:593 | KEEP | Save retro. |
| 34 | GET /api/bets/:id/artifact-thread-summary | UI:useArtifactThreadSummary | KEEP | Bet artifact panel. |
| 35 | POST /api/tasks/ | AGENT-SEAM:create_task | KEEP | Agents create tasks. |
| 36 | GET /api/tasks/ | UI:useAgentRunState (?ids= batch) | KEEP | Task batch read for run state. |
| 37 | GET /api/tasks/:id | AGENT-SEAM:getTaskById | KEEP | Seam read (log_task/handoff validation). |
| 38 | PATCH /api/tasks/:id/notes | AGENT-SEAM:log_task | KEEP | Agent task log. |
| 39 | PATCH /api/tasks/:id | DEAD | DELETE | No caller; task state moves in-process (kill 9). |
| 40 | POST /api/tasks/:id/transition | DEAD | DELETE | No caller; transitions are event/policy-driven (kill 9). |
| 41 | POST /api/tasks/:id/handoff | AGENT-SEAM:handoff_to | KEEP | Handoff — core agent collaboration act. |
| 42 | GET /api/reviews/:reviewMessageId | UI:ReviewPage:44 | KEEP | Review page data. |
| 43 | POST /api/reviews/proposed-calls | AGENT-SEAM:tool dispatch (AL7) | DELETE | AL7 loop cannot close — grant door unwired (kill 2). |
| 44 | POST /api/reviews/proposed-calls/consume | AGENT-SEAM:tool dispatch (AL7) | DELETE | Consumes grants that are never minted (kill 2). |
| 45 | POST /api/reviews/proposed-calls/:id/outcome | AGENT-SEAM:tool dispatch (AL7) | DELETE | Outcome for a flow that never grants (kill 2). |
| 46 | GET /api/artifacts/ | UI:useArtifacts | KEEP | Artifact gallery. |
| 47 | GET /api/artifacts/:id | UI:useArtifacts | KEEP | Artifact detail. |
| 48 | POST /api/artifacts/ | UI:useArtifacts + AGENT-SEAM:create_artifact | KEEP | Artifact create, both actors. |
| 49 | PATCH /api/artifacts/:id/preview | DEAD | DELETE | Create carries preview; race-safe patcher has no caller (kill 13). |
| 50 | POST /api/filesystems/:id/injections | UI:SettingsAgents | KEEP | Grant agent filesystem access. |
| 51 | GET /api/knowledge/search | AGENT-SEAM:query_practice | MERGE | Fold into GET /api/search with a scope param (kill 11). |
| 52 | GET /api/knowledge/ | UI:KnowledgeList | KEEP | Knowledge list. |
| 53 | GET /api/knowledge/triage-count | UI:AppShell | KEEP | Triage badge. |
| 54 | GET /api/knowledge/:id | UI:KnowledgeDetail + AGENT-SEAM | KEEP | Knowledge detail, both actors. |
| 55 | POST /api/knowledge/ | UI:KnowledgeCreate + AGENT-SEAM:write_memory | KEEP | Knowledge create, both actors. |
| 56 | PATCH /api/knowledge/:id/scope | UI:ScopeChangeDialog | KEEP | Scope move. |
| 57 | PATCH /api/knowledge/:id | UI:useAutoSave + AGENT-SEAM:writeback | KEEP | Content edit w/ optimistic lock, both actors. |
| 58 | POST /api/knowledge/:id/merge | DEAD | DELETE | Librarian ceremony, zero callers (kill 6). |
| 59 | POST /api/knowledge/:id/split | DEAD | DELETE | Same (kill 6). |
| 60 | POST /api/knowledge/:id/archive | UI:KnowledgeDetail | KEEP | Archive is the UI's remove action. |
| 61 | POST /api/knowledge/:id/flag | DEAD | DELETE | Flag-for-review nobody flags (kill 6). |
| 62 | GET /api/knowledge/:id/conflicts | AGENT-SEAM:conflict workflow | KEEP | Backs create_conflict_review dedup. |
| 63 | POST /api/knowledge/:id/conflicts | AGENT-SEAM:create_conflict_review | KEEP | Conflict capture. |
| 64 | POST /api/knowledge/:id/promote | AGENT-SEAM:promote_knowledge | KEEP | Facilitator promotion. |
| 65 | PATCH /api/knowledge/:id/attention-score | AGENT-SEAM:score_attention | KEEP | Attention override mode. |
| 66 | POST /api/knowledge/:id/recompute-attention | AGENT-SEAM:score_attention | KEEP | Attention recompute mode. |
| 67 | GET /api/team-members/ | DEAD | DELETE | Raw team_members dump, zero callers (kill 6). |
| 68 | GET /api/settings/ | DEAD | DELETE | M2 aggregate; UI never fetches it (kill 13). |
| 69 | PATCH /api/settings/ | DEAD | DELETE | Writer for the unread aggregate (kill 13). |
| 70 | GET /api/settings/agent-behavior/config | UI:SettingsAgentBehavior:98 | KEEP | Behavior config read. |
| 71 | PATCH /api/settings/agent-behavior/config/:id | UI:SettingsAgentBehavior:176 | KEEP | Behavior config write. |
| 72 | GET /api/conversations/ | DEAD | DELETE | Legacy thread list; UI uses /api/threads (kill 7). |
| 73 | GET /api/conversations/items | AGENT-SEAM:findItemByReasoningMarker | KEEP | Seam marker lookup. |
| 74 | GET /api/conversations/items/:id | AGENT-SEAM:getItemById | KEEP | Seam item read. |
| 75 | PATCH /api/conversations/items/:id | AGENT-SEAM:updateItemById | KEEP | Seam item update. |
| 76 | GET /api/conversations/:threadId | DEAD | DELETE | Only reference is a DB rollback doc (kill 7). |
| 77 | POST /api/conversations/items | AGENT-SEAM:create_item | KEEP | Agent item creation. |
| 78 | GET /api/threads/assistant/ | UI:AssistantOverlay | KEEP | Assistant thread. |
| 79 | GET /api/threads/coach/ | UI:useAssistantThread | KEEP | Coach thread. |
| 80 | POST /api/threads/scaffold | AGENT-SEAM:insertThread | MERGE | Second thread-create door; fold into POST /api/threads/ (kill 11). |
| 81 | POST /api/threads/direct | AGENT-SEAM:send_message DM | KEEP | Find-or-create DM. |
| 82 | GET /api/threads/inbox | AGENT-SEAM:read_inbox | KEEP | Agent inbox — core loop. |
| 83 | PATCH /api/threads/:id | UI + AGENT-SEAM:updateThread | KEEP | Thread update, both actors. |
| 84 | GET /api/threads/ | UI:useConversationsThreads + seam | KEEP | Thread list, both actors. |
| 85 | GET /api/threads/:id | UI:useThreadDetail + seam | KEEP | Thread detail, both actors. |
| 86 | POST /api/threads/ | UI:RecipientPicker, host-threads | KEEP | Thread create — merge target for #80. |
| 87 | POST /api/threads/:id/messages | UI:Conversations + AGENT-SEAM:reply/send | KEEP | THE message door — the product's center. |
| 88 | POST /api/threads/:threadId/messages/:messageId/verdict | DEAD | DELETE | AL7 grant composer nobody calls — see kill 2 (or wire ReviewPage to it). |
| 89 | GET /api/users/ | UI:SetupFlow + AGENT-SEAM:listUsers | KEEP | User list, both actors. |
| 90 | GET /api/users/:id | UI:SettingsProfile + AGENT-SEAM | KEEP | User read. |
| 91 | PATCH /api/users/:id | UI:SettingsProfile | KEEP | Profile edit. |
| 92 | GET /api/users/:id/inbox | DEAD | DELETE | Second inbox; threads/inbox is the real one (kill 8). |
| 93 | POST /api/users/:id/inbox | DEAD | DELETE | Second send door; threads/direct is the real one (kill 8). |
| 94 | GET /api/users/:userId/assistant/ | UI:SettingsAgents | KEEP | Assistant config read. |
| 95 | PATCH /api/users/:userId/assistant/ | UI:SettingsAgents | KEEP | Assistant config write. |
| 96 | GET /api/org/ | UI:SettingsOrgChart | KEEP | Org chart read. |
| 97 | PUT /api/org/edges | UI:SettingsOrgChart | KEEP | Org edge upsert. |
| 98 | DELETE /api/org/edges/:id | UI:SettingsOrgChart | KEEP | Org edge remove. |
| 99 | GET /api/org/teams/:teamId | UI:useAgentRunState + AGENT-SEAM:getTeamById | MERGE | Duplicate of GET /api/teams/:teamId — one team-read door (kill 11). |
| 100 | GET /api/org/teams/:teamId/membership | AGENT-SEAM:add_agent/create_team | KEEP | Membership read for team tools. |
| 101 | GET /api/org/team-members/:teamMembersId | AGENT-SEAM:tool bindings | KEEP | Member-group read. |
| 102 | POST /api/org/teams | AGENT-SEAM:create_team | MERGE | Duplicate of POST /api/teams/ — one team-create door (kill 11). |
| 103 | GET /api/org/review-recipients | AGENT-SEAM:create_item routing | KEEP | Review routing resolution. |
| 104 | POST /api/org/scaffolded-agents | AGENT-SEAM:create_team/add_agent | KEEP | Agent scaffolding persistence. |
| 105 | POST /api/org/team-routines | AGENT-SEAM:create_team | KEEP | Team routine provisioning. |
| 106 | POST /api/routines/ | UI:RoutineCreateDialog + AGENT-SEAM:create_routine | KEEP | Routine create, both actors. |
| 107 | GET /api/routines/ | UI:RoutineCreateDialog | KEEP | Routine list. |
| 108 | DELETE /api/routines/:id | UI:RoutineDetailPane | KEEP | Routine delete — the UI's remove action. |
| 109 | GET /api/routines/:id | UI:useRoutine + AGENT-SEAM | KEEP | Routine detail. |
| 110 | PATCH /api/routines/:id | UI:RoutineDetailPane + AGENT-SEAM:update_routine | KEEP | Routine edit, both actors. |
| 111 | POST /api/routines/:id/retire | DEAD | DELETE | Soft-retire twin of DELETE; zero callers (kill 13). |
| 112 | POST /api/routines/:id/trigger | UI:RoutineDetailPane | KEEP | Manual run-now. |
| 113 | GET /api/recipients/ | UI:useRecipients | KEEP | Recipient picker data. |
| 114 | POST /api/sessions/ | DEAD | DELETE | Explicit-start door nobody dials (kill 1). |
| 115 | GET /api/status/health | DEAD | DELETE | Authenticated probe nobody probes (kill 4). |
| 116 | GET /api/status/ | DEAD | DELETE | Route's own comment: zero consumers repo-wide (kill 4). |
| 117 | GET /api/status/digest | DEAD | DELETE | Daily digest with no reader (kill 4). |
| 118 | GET /api/workers/ | DEAD | DELETE | Worker admin visibility, comments-only references (kill 4). |
| 119 | GET /api/harnesses/ | UI:SettingsHarnesses, SetupFlow | KEEP | Harness detection read. |
| 120 | POST /api/harnesses/redetect | UI:SettingsHarnesses:201 | KEEP | Re-detect button. |
| 121 | POST /api/harnesses/:type/disabled | DEAD | DELETE | Disable toggle with no UI (kill 13). |
| 122 | GET /api/credentials/ | UI:CredentialsTab | KEEP | Credential list. |
| 123 | PUT /api/credentials/:name | UI:CredentialsTab, SetupFlow | KEEP | Credential set. |
| 124 | DELETE /api/credentials/:name | UI:CredentialsTab | KEEP | Credential remove. |
| 125 | POST /api/credentials/:name/validate | UI:CredentialsTab:166 | KEEP | Key validation — used. |
| 126 | GET /api/hint-progress/ | UI:useHints | KEEP | Hint state. |
| 127 | POST /api/hint-progress/:hintId/dismiss | UI:useHints | KEEP | Hint dismiss. |
| 128 | GET /api/search/ | UI:GlobalSearchPanel | KEEP | Global search — merge target for #51. |
| 129 | GET /api/notifications/ | DEAD | DELETE | Root list; UI reads /inbox (kill 5). |
| 130 | GET /api/notifications/config | DEAD | DELETE | Channel admin, zero callers (kill 5). |
| 131 | PATCH /api/notifications/config | DEAD | DELETE | Writes an audit log on a route nobody reaches (kill 5). |
| 132 | POST /api/notifications/test | DEAD | DELETE | Test-send with rate limiter, zero callers (kill 5). |
| 133 | GET /api/notifications/queue | DEAD | DELETE | Queue introspection, zero callers (kill 5). |
| 134 | POST /api/notifications/flush | DEAD | DELETE | Manual flush; drain tick does this (kill 5). |
| 135 | POST /api/notifications/digest | DEAD | DELETE | Digest send, zero callers (kill 5). |
| 136 | GET /api/notifications/inbox | UI:useNotifications:45 | KEEP | In-app inbox. |
| 137 | POST /api/notifications/seen | UI:useNotifications:64 | KEEP | Mark seen. |
| 138 | POST /api/notifications/:id/read | UI:useNotifications:73 | KEEP | Mark read. |
| 139 | GET /api/notifications/mute | UI:useNotificationMute | KEEP | Mute list. |
| 140 | PUT /api/notifications/mute/:key | UI:useNotificationMute | KEEP | Mute toggle. |
| 141 | GET /api/sessions/ (orch app) | UI:Conversations:125 | KEEP | Active-session lookup per task. |
| 142 | GET /api/sessions/starts/:startId | DEAD | DELETE | pollUrl no client follows (kill 1). |
| 143 | GET /api/sessions/:id/activity | UI:useSessionActivity:150 | KEEP | Live session activity feed. |
| 144 | PATCH /api/sessions/:id | DEAD | DELETE | State/effectiveness writes happen in-process; no dialer (kill 13). |
| 145 | GET /api/agent-orchestration/sessions | DEAD | DELETE | Seam method listSessionHistoryBySource has zero consumers (kill 13). |
| 146 | GET /api/agent-orchestration/sessions/:sessionId | CORE-SEAM:tasks.ts handoff, sessions-routes | SIMPLIFY | Sole surviving consumer (handoff) reads 2 fields — shrink response to {id, agentId}. |
| 147 | GET /api/agent-orchestration/sessions/:sessionId/activity | DEAD | DELETE | Duplicate of #143 served in-layer; seam method unconsumed (kill 13). |
| 148 | GET /api/agent-orchestration/runs/active-counts | UI:agent-runs.ts | KEEP | Run badges. |
| 149 | GET /api/agent-orchestration/runs/latest-outcomes | UI:agent-runs.ts:87 | KEEP | Task outcome chips. |
| 150 | GET /api/agent-orchestration/runs | UI:useTaskSessions | KEEP | Run history read. |
| 151 | POST /api/agent-orchestration/intents | CORE-SEAM:policy/routine/threads | KEEP | THE intent door — how all agent work is requested. |
| 152 | POST /api/agent-orchestration/intents/explicit-start | DEAD (only from #114) | DELETE | Explicit-start family (kill 1). |
| 153 | GET /api/agent-orchestration/requests/explicit-start | DEAD (only from #114) | DELETE | Explicit-start family (kill 1). |
| 154 | GET /api/agent-orchestration/requests/explicit-start/:startId | DEAD (only from #114) | DELETE | Explicit-start family (kill 1). |
| 155 | GET /api/agent-orchestration/requests/pending-intents | CORE-SEAM:assistant-turn-coherence | KEEP | Coherence check reads pending intents. |
| 156 | POST /api/agent-orchestration/runs/abort | CORE-SEAM:policy-bindings (handoff) | KEEP | Handoff aborts the old run. |
| 157 | POST /api/agent-orchestration/runs/stop-for-tasks | CORE-SEAM:bets.ts kill cascade | KEEP | Bet kill stops the runs. |
| 158 | POST /api/agent-orchestration/runs/end-for-handoff | CORE-SEAM:policy-bindings | KEEP | Handoff run end. |
| 159 | POST /api/agent-orchestration/runs/bare | DEAD (only from #114 fallback) | DELETE | Legacy bare-insert fallback of the dead door (kill 1). |
| 160 | POST /api/agent-orchestration/runs/explicit-start/fail | DEAD (admission of dead starts) | DELETE | Explicit-start family (kill 1). |
| 161 | GET /api/agent-orchestration/run-config/:agentId | CORE-SEAM:agent-profile, assistant | KEEP | Run-config read. |
| 162 | POST /api/agent-orchestration/run-config/batch | CORE-SEAM:teams-routes, boot | KEEP | Roster config batch read. |
| 163 | PATCH /api/agent-orchestration/run-config/:agentId | CORE-SEAM:assistant, scaffolding writer | KEEP | Run-config write. |
| 164 | GET /api/agent-orchestration/team-run-config-defaults/:teamId | CORE-SEAM:teams-routes:543 | KEEP | Team defaults read. |
| 165 | PATCH /api/agent-orchestration/team-run-config-defaults/:teamId | CORE-SEAM:teams-routes:282 | KEEP | Team defaults write on create. |
| 166 | GET /api/agent-orchestration/filesystems/:id/team | CORE-SEAM:filesystems.ts | KEEP | Injection authz read. |
| 167 | POST /api/agent-orchestration/filesystems/:id/injections/persist | CORE-SEAM:filesystems.ts | KEEP | Injection persistence. |
| 168 | GET /api/connections/ | UI:SettingsConnections | KEEP | Connection list. |
| 169 | POST /api/connections/ | UI:SettingsConnections | KEEP | Connection create. |
| 170 | DELETE /api/connections/:id | UI:SettingsConnections | KEEP | Connection remove. |
| 171 | POST /api/connections/:id/validate | DEAD | DELETE | Validate door the UI never calls (kill 13). |
| 172 | POST /api/filesystems/ | UI:SettingsFilesystems, SetupFlow | KEEP | Filesystem registration. |
| 173 | POST /api/filesystems/inspect-path | UI:SetupFlow | KEEP | Path inspection during setup. |
| 174 | GET /api/filesystems/ | UI:SettingsFilesystems | KEEP | Filesystem list. |
| 175 | GET /api/filesystems/:id | UI:SettingsAgents, SetupFlow | KEEP | Filesystem detail. |
| 176 | DELETE /api/filesystems/:id | UI:SettingsAgents, SetupFlow | KEEP | Filesystem remove. |
| 177 | DELETE /api/filesystems/:id/injections/:agentUserId | UI:SettingsAgents | KEEP | Revoke agent access. |
| 178 | POST /api/mcp/:token/return-status | WORKER:hook scripts | KEEP | Hook adjudication — enforcement floor for real sessions. |
| 179 | ALL /api/mcp/:token | WORKER:every harness MCP client | KEEP | THE agent tool transport. |
| 180 | GET /api/ws/worker | WORKER:remote-worker-client | KEEP | Worker ingress socket. |

### Scheduler ticks

| # | Door | Called by UI? | Verdict | Reason |
|---|---|---|---|---|
| 181 | TICK sandbox reaper (60min, runtime-reapers.ts:122) | n/a | KEEP | Reclaims dead sandbox dirs — real disk, real laptop. |
| 182 | TICK 1s wake drain (start-runtime.ts:330) | n/a | KEEP | Dispatches all agent work; process-death recovery — the heartbeat of the product. |
| 183 | TICK agent-layer reap (start-runtime.ts:331) | n/a | MERGE | Second timer on the same loop; fold reapExpired into the wake drain cadence (kill 12). |
| 184 | TICK session-requests poll (service.ts:254) | n/a | KEEP | Lifecycle projection drain; event bus is a latency hint only — this is the recovery path. |
| 185 | TICK notification drain (install.ts:1651) | n/a | KEEP | Delivers the queue the UI inbox displays. |
| 186 | TICK propagation retry 30s (lifecycle-propagation.ts:806) | n/a | DELETE | Heals propagation_log, an audit ledger with no reader; propagation is derived on read (kill 12). |
| 187 | TICK routine scheduler (routine-scheduler.ts:802) | n/a | KEEP | Routines primitive — cron IS the feature. |
| 188 | TICK retention reaper (service-bootstrap.ts:525) | n/a | SIMPLIFY | Loses invite/login + propagation_log sweeps with their features; keeps queue/access-log/dispatch-attempt reaps (kill 12). |

### Worker-protocol messages

| # | Door | Called by UI? | Verdict | Reason |
|---|---|---|---|---|
| 189 | WORKER register | remote-worker-client | KEEP | Worker joins the pool. |
| 190 | WORKER event | remote-worker-client | KEEP | Session activity streaming. |
| 191 | WORKER session_result | remote-worker-client | KEEP | Session completion — the run lifecycle depends on it. |
| 192 | WORKER error | remote-worker-client | KEEP | Session failure path. |
| 193 | WORKER pause | desktop main.ts:766 | KEEP | User pauses agent work from the desktop app. |
| 194 | WORKER resume | desktop main.ts:770 | KEEP | User resumes. |

## Types / DI ports that die with the routes

| Declaration | Verdict | Reason |
|---|---|---|
| `AgentOrchestrationPort.intents.createExplicitStart` + `requests.findExplicitStartBy*` + `runs.createBareRun` + `runs.failExplicitStart` (api-contract + port-composition) | DELETE | Only callers are the dead explicit-start routes. |
| `AgentOrchestrationPort.sessions.listSessionHistoryBySource` / `getRecentActivity` | DELETE | Zero consumers. |
| `framework/http-middleware/src/http/explicit-start-projection.ts` (whole module) | DELETE | Projects a wire shape only the dead family renders. |
| `CoreApiPort.review.*` + `CaptureProposedCall*`/`ConsumeTailoredGrant*` types | DELETE (contingent on kill 2) | AL7 machinery. |
| `CoreApiHcClient.reviews` / `knowledge` merge-split-flag absent already — no seam debt | — | Seam never mirrored the dead knowledge routes; confirms they were UI-conceived and never adopted. |
| `SettingsResponse`/`SettingsNotifications` etc. in `framework/api-contract/src/settings.ts` | DELETE | Mirrors the unfetched GET/PATCH /api/settings aggregate. |

## Holes this leaves

1. **No manual "start a session on this task" API.** Explicit-start deletion removes the only door for a
   human/API client to force a session onto a task outside the intent queue. Nothing uses it today; if the
   UI ever grows a "run agent now" button, the intent door (#151) is the right substrate anyway.
2. **AL7 review gate: agents' gated calls have no approval path** — but that is the state TODAY (the grant
   door is unwired). Deleting makes the truth honest: gated tool calls should stop being captured instead of
   being captured into a void. If the founder wants the gate, the fix is one fetch in ReviewPage, not 4 routes
   of scaffolding — decide, don't keep both halves broken.
3. **Shared multi-user backend cannot issue invites or revoke logins.** Single-user API-key auth (the only
   mode any client implements) is untouched.
4. **SMTP/ntfy notification channels become unconfigurable** once config PATCH dies — the outbound adapters
   are then dead code for the notifications service destroyer to sweep. In-app notifications unaffected.
5. **A failed lifecycle propagation is never retried** — bet→team status is derived on read, so the visible
   product state stays correct; only the propagation_log ledger stops healing (and can die with it).
6. **`tools/eval` scenario prose mentions `POST /api/sessions/start`** in a fictional error log — cosmetic,
   not a caller.
7. **Session effectiveness scores lose their write door** (#144) — nothing writes them today; the column is
   already inert.
