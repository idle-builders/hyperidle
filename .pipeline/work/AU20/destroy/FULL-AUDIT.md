# AU20 (reopened) — full destroyer audit

One row per method, per door, per type. Every one carries a verdict. Nothing sampled.

Baseline at reopen (`ba0fb454d`): 19 services, 268 exported functions, 16 classes (38 member methods), 176 interface/type declarations (620 member signatures), 216 doors.

## Roll-up

| Verdict | Count | Share |
|---|---|---|
| DELETE | 492 | 27% |
| MERGE | 107 | 6% |
| SIMPLIFY | 360 | 20% |
| KEEP | 875 | 48% |
| **Total rows** | **1834** | |

Killed outright or folded away: **599** of 1834 (33%).

## Per service

| Service | Rows | DELETE | MERGE | SIMPLIFY | KEEP | Kill rate |
|---|---|---|---|---|---|---|
| _doors | 202 | 54 | 6 | 3 | 139 | 30% |
| fw-db | 155 | 54 | 2 | 4 | 95 | 36% |
| fw-domain-model | 250 | 53 | 0 | 75 | 122 | 21% |
| knowledge | 62 | 25 | 3 | 15 | 19 | 45% |
| fw-design-system | 255 | 23 | 3 | 58 | 171 | 10% |
| fw-diagnostics | 30 | 21 | 2 | 3 | 4 | 77% |
| fw-filesystem-contract | 24 | 12 | 9 | 2 | 1 | 88% |
| harness-registry | 73 | 14 | 4 | 8 | 47 | 25% |
| notifications | 31 | 17 | 1 | 10 | 3 | 58% |
| org | 29 | 9 | 9 | 5 | 6 | 62% |
| settings | 24 | 16 | 2 | 3 | 3 | 75% |
| review | 25 | 16 | 1 | 3 | 5 | 68% |
| users | 27 | 14 | 3 | 4 | 6 | 63% |
| work | 50 | 11 | 6 | 15 | 18 | 34% |
| fw-api-contract | 102 | 14 | 1 | 14 | 73 | 15% |
| fw-harness-protocol | 25 | 8 | 5 | 4 | 8 | 52% |
| fw-conversation-parts | 25 | 10 | 2 | 5 | 8 | 48% |
| routine | 35 | 9 | 3 | 12 | 11 | 34% |
| session-requests | 39 | 11 | 1 | 10 | 17 | 31% |
| fw-factory-defaults | 15 | 8 | 3 | 2 | 2 | 73% |
| fw-harness-capability | 19 | 8 | 3 | 5 | 3 | 58% |
| fw-http-middleware | 26 | 9 | 2 | 5 | 10 | 42% |
| filesystems | 23 | 7 | 3 | 5 | 8 | 43% |
| run-orchestration | 48 | 8 | 2 | 21 | 17 | 21% |
| fw-host-process | 27 | 7 | 2 | 15 | 3 | 33% |
| agent-run-config | 15 | 6 | 2 | 2 | 5 | 53% |
| fw-tool-protocol | 10 | 7 | 1 | 1 | 1 | 80% |
| tool-handlers | 31 | 6 | 2 | 11 | 12 | 26% |
| fw-event-bus | 12 | 5 | 2 | 1 | 4 | 58% |
| conversation | 32 | 4 | 2 | 11 | 15 | 19% |
| fw-toon-codec | 9 | 4 | 2 | 1 | 2 | 67% |
| policy | 16 | 4 | 2 | 5 | 5 | 38% |
| connections | 15 | 2 | 3 | 6 | 4 | 33% |
| fw-block-derivation | 12 | 3 | 2 | 1 | 6 | 42% |
| fw-work-intent-port | 14 | 3 | 2 | 2 | 7 | 36% |
| filesystem-mounting | 9 | 2 | 2 | 4 | 1 | 44% |
| fw-presentation-format | 7 | 3 | 1 | 2 | 1 | 57% |
| credentials | 9 | 1 | 2 | 2 | 4 | 33% |
| fw-credential-access | 9 | 2 | 1 | 1 | 5 | 33% |
| fw-cron | 8 | 1 | 2 | 2 | 3 | 38% |
| fw-query-escaping | 5 | 1 | 1 | 2 | 1 | 40% |


---

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


---

# agent-run-config — destroyer verdict

## Should this service exist?

**KILL THE PACKAGE.** This is not a service — it is two small store files (5 functions, ~200 lines) whose only operational consumer is `run-orchestration` (session admission reads the config live at `layers/agent-orchestration/run-orchestration/src/provisioner.ts:923`). Because it is a separate Service, that one consumer cannot import it and instead carries a whole indirection built solely to route around the boundary: the `SessionLifecycleAgentRunConfigReader` mirror port (`provisioner.ts:484–495`, the comment says outright it exists because "Mechanism C forbids a Service importing another Service") plus its wiring (`layers/agent-orchestration/src/services/run-orchestration-composition.ts:26,388`). The package boundary is the *cause* of that ceremony.

**Fold the surviving store into `run-orchestration`.** Run config's operational moment is session admission, which run-orchestration owns. Not `harness-registry` — the registry maps harnessType→adapter and never consumes per-agent config. Table ownership rows (`agent_run_config`) move to run-orchestration in the governance manifest; reads and writes stay exclusive to exactly one service, no ACL exception. The intake routes (`layers/agent-orchestration/src/routes/agent-orchestration-intake.ts`) stay where they are and import from run-orchestration instead.

Deleted by the fold alone, before any method verdict: the package (`package.json`, barrel `src/index.ts`, tsconfig), the `SessionLifecycleAgentRunConfigReader` port + mirror type, the composition wiring line.

## If written today, from scratch

Two functions inside run-orchestration, owning one table:

1. `readAgentRunConfigs(db, ids) → Map<id, AgentRunConfig>` — the one reader; a single read is a batch of one.
2. `writeAgentRunConfig(db, id, patch)` — the one writer, upsert with PATCH field semantics.

No team-defaults table at all. Team creation already stamps the initial roster directly from the request's `primaryHarness` (`teams-routes.ts:310–316`) — the table is a memo of one form field, written once at creation (`teams-routes.ts:282`) and replayed in exactly one place (`teams-routes.ts:543`, stamping a late-added agent). A 3-column table, 2 functions, 1 type, 1 const, 2 intake routes, and 2 seam methods to replay one dropdown is not a feature, it is furniture.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 0 |
| KEEP | 2 |

Surface: 5 methods → 2 methods (60% cut). Package: 1 → 0 (folded into run-orchestration). Tables: 2 → 1.

## Feature-level kills

**Team run-config defaults (whole capability — table `team_run_config_defaults`, both functions, type, const).** The feature: an agent added to a team *after* creation inherits the harness/model picked in the create-team form. What breaks: that late-added agent lands on the builtin/sonnet fallback (`org/src/scaffold-agents.ts:194–202`) instead of the team's chosen harness, until edited in Settings → Agents. Why acceptable: the initial roster is unaffected (stamped directly from the request, not the table); the repair is one Settings edit; and the current design already ships broken-by-design here — the table write is deliberately non-transactional with team creation (`teams-routes.ts:256–262`, founder-ruled RELINQUISHED), so a failed write produces exactly the fallback behavior this kill makes universal, and the sanctioned repair is already "the team settings edit". If the hole ever hurts, the one-line fix is to inherit the most common harness among existing teammates via the surviving `readAgentRunConfigs` — better product than replaying a stale creation-time choice, and zero new storage. Collateral kills: `GET/PATCH /api/agent-orchestration/team-run-config-defaults/:teamId` intake routes, seam methods `runConfig.readTeamDefaults`/`writeTeamDefaults` + their api-contract mirrors (`framework/api-contract/src/agent-orchestration-port.ts:288`), the post-commit write at `teams-routes.ts:282–286`, the read at `teams-routes.ts:543`, `team-harness-default-propagation.integration.test.ts`, one drop migration.

**Single-read seam (with the MERGE below).** `GET /api/agent-orchestration/run-config/:agentId` and seam method `runConfig.read` die; the four core-api callers (agent profile, PATCH agents, assistant GET/PATCH) and the provisioner use batch-of-one. Nothing user-visible breaks.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `readAgentRunConfig` | UI:GET /api/agents/:id/profile (+PATCH /api/agents/:id, GET+PATCH /api/users/:userId/assistant); BOOTSTRAP DI → session admission `provisioner.ts:923` | MERGE | Batch-of-one of `readAgentRunConfigs` — two readers are one idea; callers take `.get(id)`. |
| 2 | `readAgentRunConfigs` | UI:GET /api/agents/ (+GET /api/teams/:teamId; config-projection port `boot.ts:360` → `plugin-configuration.ts:674`) | KEEP | The one reader. Core value: sessions launch on the agent's configured harness/model/prompt — that IS agent execution; door named: session admission after merge, plus GET /api/agents/. |
| 3 | `writeAgentRunConfig` | UI:PATCH /api/agents/:id (+POST /api/agents/, users/teams/assistant creation); AGENT:create_team, AGENT:add_agent | KEEP | The one writer. Core value: choosing which harness/model an agent runs is how a founder shapes the team; PATCH field semantics require the patch-key upsert as-is. |
| 4 | `readTeamRunConfigDefaults` | UI:POST /api/teams/:teamId/agents (sole production reader, `teams-routes.ts:543`) | DELETE | One-reader memo table replaying a create-form dropdown; late-added agents take the existing builtin fallback — see feature kill. |
| 5 | `writeTeamRunConfigDefaults` | UI:POST /api/teams/ (`teams-routes.ts:282`, deliberately non-atomic) | DELETE | Writes a memo nobody needs once #4 dies; creation-time stamping already bypasses the table entirely. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `AgentRunConfig` (interface) | KEEP | The value shape the seam contract mirrors and the session reads; survives the fold into run-orchestration. |
| `AgentRunConfigPatch` (type) | KEEP | Real semantic type — PATCH "present key is written, absent key untouched"; not a Deps/Ports mirror. |
| `TeamRunConfigDefaults` (interface) | DELETE | Dies with the feature kill; api-contract mirror at `agent-orchestration-port.ts:288` dies too. |
| `DEFAULT_AGENT_RUN_CONFIG` (const) | SIMPLIFY | Unexport — module-private map-fill default; sole external use is a type-only import (`agent-orchestration-intake.ts:22,344`) replaceable with `AgentRunConfig`. |
| `EMPTY_TEAM_RUN_CONFIG_DEFAULTS` (const) | DELETE | Zero external production consumers (confirmed `rg -a`); dies with the feature kill. |
| `SessionLifecycleAgentRunConfigReader` (port, in run-orchestration — not in input but killed by this verdict) | DELETE | Exists only because Service→Service import is forbidden; the fold makes it a direct import. |

## Holes this leaves

1. **Late-added agents don't inherit the team's harness choice.** They land on builtin/sonnet fallback until edited in Settings — the same state today's design already produces when the non-atomic defaults write fails, with the same sanctioned repair. Priced fix if it hurts: inherit the most common teammate harness via `readAgentRunConfigs` (one line, no storage).
2. **Single-read callers get batch-of-one ergonomics** — `(await readAgentRunConfigs(db, [id])).get(id)` plus a non-null assert or `?? default` at four core-api sites and the provisioner. Cosmetic.
3. **Governance churn, not a hole:** table-ownership manifest rows for `agent_run_config` move to run-orchestration; `team_run_config_defaults` needs a drop migration; api-contract seam surface shrinks by three methods (`runConfig.read`, `readTeamDefaults`, `writeTeamDefaults`) and one intake route file loses three routes.
4. **Tests that die with their subjects:** `team-harness-default-propagation.integration.test.ts`, the team-defaults halves of `agent-run-config-store.integration.test.ts`, and any intake-route tests for the three deleted routes.


---

# connections — destroyer verdict

## Should this service exist?

**KEEP AS the sole owner of `service_connections`.** Agent auth is the product: "a tool
that can't authenticate is useless" (ETHOS §2). This service is what lets a human hand a
token/MCP pointer to their agents (UI CRUD), lets a spawn inject it live (provisioning read
+ decrypt), and shows what the machine already grants (inherited reach). Every method traces
to a real door. It is also the table-ACL holder — kill it and four live UI routes plus
spawn-time auth injection die with no replacement.

Context checks the founder asked for, both clean:
- **Bake leftovers (AU21 K1):** genuinely deleted. No `GET /connections/provisioning`
  route, no held-connection snapshot on any emitted intent
  (`rg heldConnections|connectionsSnapshot|bakedConnections` over domain-model events,
  session-requests, core-api services → zero production hits). Only comments and the
  edge-closed integration tests remain. The spawn reads live via
  `listHeldConnectionsForProvisioning`.
- **Credential duplication vs `credentials` service:** none. Cipher is shared
  (`decryptCredentialValue`/`encryptCredentialValue` from `@hyperidle/credential-access`),
  no forked crypto, and this package never touches `server_credentials`. The four probes
  moved OUT of `harness-discovery.ts` cleanly — only comments reference them there now.

Caveat on the small body count: AU20 Am4 already destroyed this service once (7 per-intent
store methods → 4). This pass is the second sweep of a surface that was recently burned.

## If written today, from scratch

Six methods:
- `listConnections(db, filter)` — the ONE read of the table (filter must be non-empty; also
  serves the spawn-time held read)
- `insertConnection` / `updateConnection` / `deleteConnection` — the UI CRUD, ACL-mandated
- `resolveHeldToken(db, userId, connectionId)` — the only plaintext path (function, not class)
- `createInheritedReach()` → `{ refresh, list }` where `list()` returns views directly

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 0 |
| MERGE | 2 |
| SIMPLIFY | 3 |
| KEEP | 3 |

Surface: 8 methods → 6 methods (25% cut); 3 type declarations → 2 (one dies with a merge).
Plus: the stub-runner test seam (`InheritedProbeDeps.run`) dies, and the two stub-based
unit-test files die with it.

## Feature-level kills

- **The all-rows read (`listConnections` with empty filter, documented "admin/debug use
  case").** No production caller ever passes an empty filter (callers pass `{userId}`,
  `{id}`, `{id,userId}`, `{authSource}`). An every-user's-rows read kept "for debugging" is
  exactly the defensive capability the brief names. Kill the branch; empty filter throws.
  Nothing breaks.
- **The stub command-runner seam (`InheritedProbeDeps.run`).** Production never passes it —
  `refresh()` is called bare at boot (`boot.ts:337`) and redetect
  (`create-server.ts:291/:404`). It exists solely so `inherited-reach.test.ts` /
  `inherited-reach-probes.test.ts` can fake CLI output — a mislabeled harness test under the
  repo's own real-binary doctrine. Kill the seam and those tests; the real-binary
  integration test (`AN1-real-harness-inherited.integration.test.ts`) stays and isolates via
  the surviving `env`/`cwd` fields. What breaks: fast unit coverage of CLI-output parsing —
  acceptable; extract the pure parse functions if that coverage is ever wanted back.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `listHeldConnectionsForProvisioning` | BOOTSTRAP (boot.ts:314 → `ProvisionSessionDeps.heldConnections` → spawn) | MERGE | Second read of the same table; = `listConnections({userId, authSource∈held})` + a 6-line ciphertext-stripping map. Widen `listConnections.filter.authSource` to accept a set, do the map in the boot closure that already wraps it. File and its type die. |
| 2 | `createInheritedReach` | BOOTSTRAP (boot.ts:335; refresh at boot + app redetect callbacks) | KEEP | Core value: shows which services agents already reach via machine auth — the inherited group UI:GET /api/connections leads with; zero-config agent reach is ETHOS §2. Probes verified moved (not duplicated) from harness-discovery. |
| 3 | `projectInheritedConnections` | UI:GET /api/connections/ | MERGE | One caller ever, and its only input is `inheritedReach.list()`. Fold into `InheritedReach.list()` returning `ServiceConnectionView[]`; delete the export and the raw-facts hop. |
| 4 | `listConnections` | UI:GET /, POST /, DELETE /:id, POST /:id/validate (/api/connections) + BOOTSTRAP (boot.ts:419 backfill port) | SIMPLIFY | Live on four doors — but delete the empty-filter all-rows branch (unused "admin/debug" capability); require ≥1 condition, throw otherwise. Gains the held-auth-source-set filter from #1. |
| 5 | `insertConnection` | UI:POST /api/connections/ | KEEP | One-line wrapper, but load-bearing: table ACL makes this package the only legal importer of `serviceConnections`, and the route lives outside it. Door + core value (user hands agents a token/MCP pointer) both named. |
| 6 | `updateConnection` | UI:POST /api/connections/:id/validate | SIMPLIFY | Single caller always passes all three patch fields. Make `health`/`lastValidatedAt` required, delete the conditional patch assembly. |
| 7 | `deleteConnection` | UI:DELETE /api/connections/:id | KEEP | Removing a connection is baseline product behavior; owner-scoped delete is the ACL surface for it. |
| 8 | `ServiceConnectionResolver.resolve` | BOOTSTRAP (boot.ts:323 → `buildProvisioningPlan` → spawn) | SIMPLIFY | Core value is real — sole plaintext path feeding spawn-time auth injection — but a class holding one method and one field is ceremony. Demote to `resolveHeldToken(db, userId, connectionId)`; run-orchestration's structural port is satisfied by `{ resolve: (u,c) => resolveHeldToken(db,u,c) }` in boot. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `HeldConnectionForProvisioning` | DELETE | Dies with row 1's merge. It is already a duplicate: `run-orchestration/src/connection-provisioning.ts:94` declares its own structurally identical interface, and that is the one the consumer actually types against. The boot closure maps rows → that shape. |
| `InheritedProbeDeps` | SIMPLIFY | Drop `run` — production never passes it; it exists only so stub-based unit tests can fake CLI output (test-only seam on a production signature; harness probes are real-binary-tested per repo doctrine). Keep `env`/`cwd`, which the real-binary integration test needs for `CODEX_HOME`/`XDG_CONFIG_HOME`/`.mcp.json` isolation. |
| `InheritedReach` | SIMPLIFY | Two members stay two, but `list()` returns `ServiceConnectionView[]` (absorbing row 3) and `refresh(deps)` shrinks with `InheritedProbeDeps`. Raw `InheritedConnectionFact[]` never leaves the package. |

## Holes this leaves

- **No all-rows table read.** If someone later wants a cross-user connections dump for
  debugging, they write SQL by hand. That is the correct price.
- **No stubbed probe unit tests.** CLI-output parsing regressions surface only in the local
  real-binary integration lane (which has no CI job by design). If that bites, the fix is
  extracting pure `parseX(stdout)` functions and unit-testing those — not resurrecting the
  stub runner.
- **Not a hole, but a boundary note for the founder:** core-api's settings backfill
  (`plugin-configuration.ts:744`) reads this service's table through the boot-exported
  `serviceConnectionsReader.listByAuthSource` port. The owner serves the read, so the ACL
  holds — but if the settings destroyer kills the mcp-seed backfill, `listConnections`'
  authSource-only filter loses its last cross-layer consumer.


---

# conversation — destroyer verdict

## Should this service exist?

**KEEP — this IS the product.** "Humans and agents collaborating through conversations" is the first clause of what HyperIdle is. `threads` + `messages` are the central tables; every agent tool that talks (`send_message`, `reply`, `read_inbox`, `submit_review`) and every chat surface in the UI lands here. The AU12 ownership seam (single owner of thread/message row writes) is also the thing AU-track governance is built on — killing it re-scatters raw table writes across 20 callers.

The function surface was already destroyed once (AU20 Am5: 29 → 14 store functions). What's left is close to the minimal honest shape. The remaining fat is not in the functions — it is in **dead doors calling them** (4 production-dead HTTP routes), **dead flexibility** (params and filter fields whose only callers are those dead routes), and **defenses for a feature that never shipped** (message soft-delete/redaction has no production writer, yet four read paths guard against it). This verdict kills those.

## If written today, from scratch

Eleven callable units:

- `insertThread` / `updateThread` / `insertMessage` — the irreducible writes
- `resolveMessageIfUnresolved` — the one conditional write (verdict CAS, absorbs `updateMessage`)
- `findThread` / `listThreads` / `findMessage` / `listMessages` — the filtered reads
- `findOrCreateDirectThread(db, senderId, recipientId, now)` — DMs, no kind param
- `listInbox` — sender-exclusion only (the agent `read_inbox` tool)
- `searchConversations` — the live global-search join
- `resolveAssistantTurnRequest` — human message → assistant turn, the product's beating heart
- plus two bootstrap reactions: pin-after-first-AI-reply (moved to Layer code, DI interface dead) and session-not-returned notice

Not in the from-scratch shape: `countThreads`, `updateMessage`, the typed error class, `recipientKind`, the participant-probe inbox variant, the deleted/redacted guards.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 5 |
| KEEP | 10 |

Surface: 18 callable units (17 functions + 1 class) → 15 functions, 0 classes (~17% unit cut; the deeper cut is 4 dead routes, 1 DI interface, 1 policy-port member, and 7 filter/param fields — measured in reachable surface, not function count).

## Feature-level kills

These are caller kills — the service methods they reach survive via live doors, but the dead doors and the flexibility that exists only for them die.

1. **`GET /api/conversations/` + `GET /api/conversations/:threadId` (routes/conversations.ts) — dead thread-list door.** Zero production callers: the web UI's thread list is `GET /api/threads?participant_id=…` (`useConversationsThreads.ts:165`), and the agent seam uses only `client.conversations.items.*` (core-api-port-composition.ts:473–494). The list route is a second way to list threads, carries an `attention_score` branch that is byte-identical to its default branch, and is the **sole caller of `countThreads`**. The `:threadId` route still ships `responses: []` "for one release" — that release shipped. What breaks: nothing observable. The `/items` routes on the same router are live (agent seam) and stay.
2. **`GET /api/users/:id/inbox` + `POST /api/users/:id/inbox` (routes/users.ts:291, 326) — dead inbox doors.** Zero production callers: the UI's inbox is `/api/notifications/inbox` (`useNotifications.ts:45`), agents read via `GET /api/threads/inbox` (sender-exclusion seam). GET is the **sole caller of `listInbox`'s participant-probe variant**; POST is the sole caller passing nothing but defaults into `findOrCreateDirectThread`. What breaks: nothing — no client sends these requests.
3. **`GET /api/threads/coach/` (routes/coach.ts) — superseded door.** `useAssistantThread.ts:9` records the fetch path moving coach → assistant (AD8b); no production caller remains, only the comment. It is the **sole caller of `findThread({pinned})`**. A whole route file duplicating assistant.ts. What breaks: nothing.
4. **Message soft-delete/redaction read-guards — defense for a feature with no writer.** No production code ever sets `messages.deletedAt` or `messages.redactedAt` (the only `deletedAt` writer is routine soft-delete, a different table; `updateMessage`'s only caller patches `resolvedAt`). Yet four paths defend against it: `MessageFilter.includeDeleted` (sole caller search.ts:180), the resolver's `message.deletedAt || message.redactedAt` throw, `searchConversations`' `deletedAt IS NULL` clause, and `getArtifactThreadSummaries`' non-deleted filtering. Strip all four. What breaks: nothing today — no such row can exist. When message deletion actually ships, its writer re-adds the guards it needs. (The schema columns are `framework/db`'s surface, not this service's — flagged, not verdicted here.)
5. **`AssistantTurnSourceUnavailableError` — a typed error nobody catches.** No file outside the package + its barrel imports it; no `instanceof` anywhere. Ceremony around a `throw new Error(...)`.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `registerAssistantThreadPinReaction` | BOOTSTRAP (service-bootstrap.ts) → EVENT:thread_message_appended | SIMPLIFY | Live product effect (assistant thread sorts pinned-first in ThreadSections.tsx:134), but 80 lines + a DI interface + WeakSet for one conditional UPDATE. Move to `core-api/src/services/` (Layer code — same shape as assistant-turn-coherence-trigger.ts), import users' `findUser` statically, delete `AssistantThreadPinReactionDeps` and the WeakSet guard. Write still routes through `updateThread`. |
| 2 | `resolveAssistantTurnRequest` | UI:POST /api/threads/:id/messages (threads.ts:1516) + EVENT:thread_message_appended (coherence trigger:75) | SIMPLIFY | Core value itself — human message → assistant turn. Shrink: `readServerConfig` is "optional" but both real call sites wire it — make it required and delete the absent-branch + conditional `harnessDisabled` spread; delete the deleted/redacted guard (feature kill #4). |
| 3 | `insertThread` | UI:POST /api/threads/ (+12 more doors, 2 agent tools, 2 schedulers) | KEEP | Irreducible row write; the AU12 ownership seam for thread creation. Core: threads exist. |
| 4 | `updateThread` | UI:PATCH /api/threads/:id, POST /api/threads/:id/messages (lastActiveAt bump), agent tools via seam | KEEP | Irreducible row write; lastActiveAt bumps drive the recency-sorted thread list the UI actually renders. |
| 5 | `insertMessage` | UI:POST /api/threads/:id/messages + AGENT:send_message/reply/submit_review + SCHED:lifecycle | KEEP | The single most core write in the product — a message getting sent. |
| 6 | `updateMessage` | EVENT:item_created → policy-engine.ts:199 (only production caller) | MERGE | One caller, one field: policy-engine sets `resolvedAt` on a review message. `resolveMessageIfUnresolved` does exactly that with better (first-wins) semantics. Switch policy-engine to it, delete this and the `updateMessage` member of `policy/src/ports.ts:76`. |
| 7 | `resolveMessageIfUnresolved` | UI:POST /api/threads/:id/messages (verdict path) + AGENT:submit_review via seam | KEEP | The verdict CAS — first-verdict-wins is the review→act loop (AL7), which is earned, chosen review, not ceremony. Absorbs #6. |
| 8 | `findOrCreateDirectThread` | UI:POST /api/threads/direct + AGENT:send_message/reply (seam port) | KEEP* | DMs between humans and agents — core. *Shrink signature: drop `recipientKind` — no production caller passes it (threads.ts:762 omits it; the only other caller is dead route kill #2). |
| 9 | `findThread` | 14 UI doors + agent tools + 2 event subscribers | KEEP | The single-thread read behind every thread route, authz check, and reaction. Drop the `pinned` filter field with feature kill #3. |
| 10 | `listThreads` | UI:GET /api/threads/ (the real UI list), GET /api/search/, routine scheduler | SIMPLIFY | Live everywhere — but drop `order:"created"` and `offset` from `ThreadFilter`: their only caller is the dead conversations route (kill #1). Every surviving caller orders by `lastActive` with no offset. |
| 11 | `countThreads` | UI:GET /api/conversations/ — a door with zero production callers | DELETE | Sole consumer is dead route kill #1; a pagination `total` no client ever reads. Delete the function and the route together. |
| 12 | `findMessage` | UI:POST /api/threads/:id/messages (idempotency + verdict target), GET /api/reviews/:id, EVENT:coherence trigger | KEEP | Idempotency replay and verdict-target lookup — correctness of the core send path. |
| 13 | `listMessages` | 7 direct UI doors (transcripts, search, agent profile) + resolver + trust-model verdict windows (policy-bindings.ts:155) | KEEP | Every conversation render and the approval-rate trust model read through it. The `legacyItemIds`/`noLegacyItem`/`threadInitiatorId` fields are live trust-model inputs, not dead legacy. Drop only `includeDeleted` (kill #4). |
| 14 | `listInbox` | UI:GET /api/threads/inbox → AGENT:read_inbox (seam) | SIMPLIFY | The sender-exclusion variant is the agent `read_inbox` tool — core. The participant-probe variant's only door is dead route kill #2. Un-merge the XOR: keep `{excludeSenderId, limit}` only, delete the probe branch, the `"%%"` fallback, and `offset`. |
| 15 | `searchConversations` | UI:GET /api/search/ → GlobalSearchPanel (live) | KEEP | Global search over conversations is a real product surface the shell renders. Drop the `deletedAt IS NULL` clause (kill #4). |
| 16 | `getArtifactThreadSummaries` | UI:GET /api/bets/:id/artifact-thread-summary → useArtifactThreadSummary (live bet page) | KEEP | Distinct aggregate product surface: conversation state on a bet's artifacts. Live hook in production UI. Drop the deleted-message filtering (kill #4). |
| 17 | `registerSessionNotReturnedNotice` | BOOTSTRAP (service-bootstrap.ts) → EVENT:session_not_returned | KEEP | The never-silent net: a person waiting on an agent turn is told it died instead of hanging forever. That is conversation-trust, the product's core promise, in 20 effective lines. |
| 18 | `AssistantTurnSourceUnavailableError` (class) | INTERNAL — thrown at resolver:126, caught by nobody | DELETE | No importer outside the package, no `instanceof` anywhere. Replace the throw with plain `Error`. Typed-error ceremony. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `AssistantThreadPinReactionDeps` | DELETE | Dies with row 1's move to Layer code, which may import `@hyperidle/users` directly. Mechanism C ceremony with no remaining reason to exist. |
| `AssistantTurnResolverDeps` | SIMPLIFY | Keep `requireRunnableAgent` (the Mechanism C boundary is real). Make `readServerConfig` required — both production call sites (threads.ts:1516, coherence trigger:82) already wire it; the optional is dead flexibility. |
| `BakedTranscriptRow` | KEEP | The resolver's transcript element; run-orchestration deliberately mirrors it structurally (runtime.ts:178) so the drain stays decoupled. |
| `BakedAssistantTurnRequest` | SIMPLIFY | The emit-time contract — load-bearing. Make `harnessDisabled` required once its dep is (above), and drop the barrel export from index.ts: no external file imports the name. |
| `ThreadFilter` | SIMPLIFY | Drop `offset`, `order:"created"`, `pinned` — each field's only production caller is a dead route (kills #1, #3). Survivors: id, directKey, host, hostKind, participantProbe, ids, order:"lastActive", limit. |
| `MessageFilter` | SIMPLIFY | Drop `includeDeleted` (kill #4). Everything else is exercised by live doors, including the trust-model trio. Note: `findMessage` silently ignores 12 of these fields — acceptable for a shared key type, but do not grow it. |
| `InboxFilter` | SIMPLIFY | Drop `participantProbe` and `offset` (die with row 14). Survives as `{excludeSenderId, limit}`. |
| `InboxRow` | KEEP | The `read_inbox` tool's wire element; `participants` is returned to the agent by the live inbox route. |
| `ThreadSearchRow` | KEEP | Exact projection the live search route JS-filters and responds with. |
| `ArtifactThreadSummaryRow` | KEEP | Wire shape of a live UI hook. |
| `SESSION_NOT_RETURNED_NOTICE_TEXT` (const) | SIMPLIFY | Production use is only intra-module; every external importer is a test. Un-export; tests assert the literal. |

## Holes this leaves

- **No global thread list endpoint.** Killing `GET /api/conversations/` removes the only unscoped "all threads, paginated" door. Nothing calls it, and the participant-scoped `GET /api/threads` is what the product actually uses. If an admin-ish overview is ever wanted — that's an enterprise reflex; don't rebuild it.
- **No human→human DM kind.** Dropping `recipientKind` hard-codes direct threads to `hostKind:"agent"`. Today no production path creates a user-kind direct thread. If human-to-human DMs ship, the parameter comes back with its first real caller.
- **Message deletion/redaction loses its read-side guards.** If someone hand-writes `deletedAt` into the DB, deleted messages will render. Acceptable: the feature has no writer, so the guards defend a state the product cannot reach. The feature's future implementation owns re-adding them.
- **Coach route deletion** removes a URL that has been dead since AD8b; any stale external client pinned to `/api/threads/coach` gets a 404. None is known to exist.
- **Policy-engine resolve becomes first-wins** (via the CAS merge). If a review message were somehow already resolved, policy-engine's stamp becomes a no-op instead of an overwrite — strictly safer, and no production path races it today.


---

# credentials — destroyer verdict

## Should this service exist?

**KEEP AS the `server_credentials` table-ACL unit — shrunk from 2 files to 1.**

Tried to kill it three ways; all three fail on architecture, not sentiment:

1. **Dissolve into `@hyperidle/credential-access` (framework)?** No. That package is a framework
   primitive — no db handle, off the bus (AU29 substrate rule). Moving a SQL-owning store there
   hands framework a table, which is exactly what the substrate split exists to forbid. The cipher
   already lives there *because* it touches no table; the store stays here *because* it does.
2. **Dissolve into `agent-orchestration/connections`?** No. AU26 E2/J2 already litigated this:
   `server_credentials` keys are resolved on core's OWN call path (model resolution, credentials
   routes, harness readiness, notifications email). Moving the table to the agent layer inverts a
   clean consumer-locus edge to fix nothing.
3. **Dissolve into another core-api service (`settings`)?** No. The consumer set spans four
   services (credentials routes, harnesses, notifications, model resolution) — a neutral per-table
   owner is the correct ACL shape; folding into `settings` blurs table ownership for zero deletion.

This is the LLM-key catalog. An agent OS whose agents cannot authenticate to a model provider is a
brick — this is as core as core value gets (ETHOS §2: "a tool that can't authenticate is useless").
The service already absorbed AU20 Am4's collapse (34 → 5 exports, 9 accessors → 3). What's left is
the bone, minus one remaining piece of ceremony: the resolver class.

## If written today, from scratch

One file, four functions, one type, zero classes:

- `readCredentials(db, filter?)` — list / point-lookup
- `writeCredential(db, name, patch)` — upsert or validation write-back
- `deleteCredential(db, name)` — remove
- `resolveCredential(db, name)` — read + decrypt, the production secret path (today a class)
- `CredentialWrite` — the patch, without `updatedAt` (store stamps it)

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 0 |
| MERGE | 1 |
| SIMPLIFY | 1 |
| KEEP | 3 |

Surface: 4 methods → 4 methods; 5 exports → 4 (class dissolved into a store function; file
`credential-resolver.ts` deleted; AH1 `instanceof` invariant test + the `credentialResolver`
exposure on `CoreApiBoot`/`ServerHandle` die with it).

## Feature-level kills

No user-facing feature dies — every method sits on a live UI door or the boot-wired model-resolution
path. Two structural kills ride along:

1. **The resolver class + its test-serving exposure.** `DbCredentialResolver` exists as a *class*
   for one reason: so `server-factory.resolver.test.ts` can assert `instanceof` and so
   `CoreApiBoot.credentialResolver` / `ServerHandle.credentialResolver` can carry it out for that
   assertion (boot.ts:150 and create-server.ts:123 say so in their own comments). The invariant it
   guards — "production resolves from DB, not env" — has no remaining reversion path:
   `EnvCredentialResolver` was exiled to `tools/eval` and the production barrel exports only the DB
   implementation. Structure that exists to make a test pass is DELETE by the brief's own list.
   The class also re-implements `readCredentials`' point-lookup SQL instead of calling it —
   internal duplication inside a 2-file package. Fold `resolve` into the store as
   `resolveCredential(db, name)` built on `readCredentials` + `decryptCredentialValue`; the
   composition root passes `{ resolve: (name) => resolveCredential(db, name) }` to the
   `CredentialResolver` port. Delete the class, the two handle exposures, and the instanceof test.
2. **Adjacent, not this service's rows:** three composition roots (`boot.ts:247`,
   `service-bootstrap.ts:162`, `app.ts:238`) re-wrap this store back into the OLD per-intent shape
   (`findByName`/`upsert`/`deleteByName`) because `NotificationsDeps.credentialStore` still speaks
   it. Am4's collapse stopped at the store boundary; the per-intent methods it killed live on as
   three copies of adapter glue. `NotificationsDeps` should take `read`/`write`/`delete` directly.
   Belongs to the notifications/composition-root verdict — flagged here so it isn't lost.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `readCredentials` | UI:GET /api/credentials/ (+ PUT, POST /:name/validate, GET/POST /api/harnesses, GET/POST notifications, SCHED:notification-drain, EVENT:routine_fired) | KEEP | Core value: humans see/manage LLM keys, harness readiness and email drain read them. Already the Am4 merge of findByName+listAll — one verb, 8 real doors. |
| 2 | `writeCredential` | UI:PUT /api/credentials/:name (+ POST /:name/validate, PATCH /api/notifications/config) | KEEP | The only way a key enters the system; upsert/write-back dual path is the Am4 merge of 4 old writers. Re-splitting is churn, not shrinkage. |
| 3 | `deleteCredential` | UI:DELETE /api/credentials/:name (+ PATCH /api/notifications/config) | KEEP | A key you can't remove after rotation is a broken catalog. Two lines, live door. |
| 4 | `DbCredentialResolver.resolve` | BOOTSTRAP boot.ts:242 → `CredentialResolver` port → `resolveModel` on every agent run (graph shows 0 doors — interface dispatch hid it; rg confirms the wiring) | MERGE | The production secret path, but the *class* is test-serving ceremony: fold into the store as `resolveCredential(db, name)` on top of `readCredentials` (kills its duplicated SQL), delete the class, the `instanceof` test, and both handle exposures. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `CredentialWrite` | SIMPLIFY | Every caller (routes, migration, notifications adapter) passes `updatedAt: now` — no caller ever passes anything else. Stamp it inside `writeCredential`, drop the field; every call site sheds a line. |

## Holes this leaves

- **AH1 single-resolver invariant is no longer test-assertable via `instanceof`.** Acceptable: the
  env resolver no longer exists in production code, so the reversion the test guards against has no
  path. If a learning ever re-earns the invariant, assert on behavior (resolver returns the DB row's
  decrypted value), not on class identity.
- **`resolveModel`'s `CredentialResolver` port is satisfied by an object literal at boot instead of
  a named class.** Nothing breaks — the port lives in `credential-access` and never required a
  class.
- No user-visible hole. Every door listed above keeps working.


---

# filesystem-mounting — destroyer verdict

## Should this service exist?

**KILL THE PACKAGE. Merge the mount engine into `run-orchestration`.**

Four exports, one class, one production consumer. The only production reference to this package
anywhere is `layers/agent-orchestration/src/boot.ts:56` (imports `RegistryFilesystemMounter`, wires
it into `run-orchestration`'s provisioning deps). Neither exported type is imported by anyone —
`AdapterDeps` and `MountingGitRunnerFactory` have **zero** external references (boot.ts passes
structural object literals). The graph shows 0 doors for every symbol because the whole package is
reached through one DI port (`deps.mounter?: FilesystemMounter`) — dynamic dispatch, a known graph
blind spot; rg confirms the real chain: session-start doors → `run-orchestration/provisioner.ts`
(mount at Phase 4.5, captureBack at teardown Hook B) → this class.

The package's entire reason to be a separate Service was ownership of the `filesystem_captures`
table (barrel `@lore`, AU26 F1). That table is a **write-only archive**: this class is its only
writer and there are zero production readers of the rows, the `.bundle` files, or the snapshot dirs
(`rg` across layers/framework/applications/tools: only schema, this package, and tests). Its
designed consumer, AO3 "land captured code", is **WONT DO** (founder, 2026-07-03,
`TRACK-AO.md:123`) — the ruling says code work rides provider-native git/gh: agents branch and push
themselves. The other dependent, AO5 session-fork, is registered but unbuilt. Delete the archive
and the package owns nothing; a table-less mount engine with a single same-Layer consumer is a file
in `run-orchestration`, not a Service.

Survivors route to: `layers/agent-orchestration/run-orchestration/src/` (mount adapters +
scaffolding exclusion), as internal modules. Not to `filesystems` — that sibling owns the
filesystem *record*; mounting is a provisioning implementation detail and provisioning lives in
run-orchestration. This also deletes the structural re-declaration rationale for `ports.ts` (the
port was re-typed only because it crossed a Service boundary that stops existing).

## If written today, from scratch

Three functions inside run-orchestration, no class, no registry ceremony:

- `mountFilesystem(fs, sandboxPath)` — symlink a local folder; `git worktree add` a local repo;
  depth-1 clone a connected repo; write the scaffolding exclude. Error result for anything else.
- `releaseWorktree(fs, sandboxPath, sessionId)` — teardown for the worktree case only: unstage
  scaffolding, commit leftovers onto the `agent/<session>` branch (already visible in the user's
  own repo — work rides git, per the AO3 ruling), `git worktree remove --force`.
- `SANDBOX_SCAFFOLDING_PATHS` — the one mirrored list, living next to the scaffolding writers it
  mirrors.

No captures dir, no bundles, no snapshots, no DB table, no containment check, no auth parameter.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 1 |
| MERGE | 1 |
| SIMPLIFY | 3 |
| KEEP | 0 |

Surface: 5 exported declarations → 0 (package dissolved; 2 shrunken internal survivors inside
run-orchestration). The capture-archive feature — roughly half the package's code and its entire
DB surface — dies outright.

## Feature-level kills

1. **The capture archive** (git bundles, local-folder snapshots, `filesystem_captures` inserts,
   `capturesDir`, the capture-root containment check, the sessionId regex, the
   insert-failure-rollback dance in `RegistryFilesystemMounter.captureBack`,
   `mounter-registry.ts:307-361`). Zero production readers of any output. AO3, the consumer it was
   built for, is WONT-DO; the founder ruling replaced it with "agents use normal git/gh tools".
   What breaks: AO5 session-fork loses its substrate — acceptable because AO5 is unbuilt, and a
   capture write-path rebuilt when AO5 actually starts will be shaped by AO5's real restore needs
   instead of a two-tracks-stale guess. Also kills: the `filesystemCaptures` schema +
   drop-table migration, its table-ownership-guard entry, `CaptureResult`/`captureBack` in
   `framework/filesystem-contract`, and four test files
   (`capture-provenance.integration.test.ts`, the three adapter captureBack suites).

2. **Local-folder snapshot backup** (`LocalFolderAdapter.captureBack`, lines 105-120). The mount is
   a symlink to the real folder — the agent's edits land live; the teardown `cpSync` copy is a
   backup nobody can see or restore. Nothing breaks.

3. **Clone-source teardown capture** (`GitCloneAdapter.captureBack`, lines 149-169). The bundle was
   the only artifact surviving sandbox destruction and nothing can read it — the work was already
   effectively lost. Hole: an agent on a connected remote repo that never pushed loses uncommitted
   work at teardown. That is the founder-sanctioned model (AO3 ruling: agent pushes, provider owns
   the rest). Trust the agent to push.

4. **The `CloudNotBuiltAdapter` class** (lines 58-74) — a class whose whole job is returning an
   error string for gdrive/dropbox/s3 sources no adapter exists for. Becomes one inline error
   return in the adapter selector.

5. **The package itself** — package.json, barrel, vitest config, tsconfig, the `AdapterDeps`
   export, the Mechanism-C port re-declaration story. Mount adapters + their mount tests +
   `git-worktree-live-proof` move into run-orchestration.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `RegistryFilesystemMounter.mount` | BOOTSTRAP wire (`boot.ts:301`) → DI port `deps.mounter`, called at session-provisioning Phase 4.5 (`filesystem-provisioning.ts:103`); ultimate doors are the session-start doors. Graph-blind: dynamic dispatch through `FilesystemMounter`. | SIMPLIFY | Core — this is how an agent session gets the user's repo/folder; but drop the `auth` param (every call site passes `null`, no adapter reads `ctx.auth`), inline the cloud-stub error, and demote from exported class to an internal run-orchestration function. |
| 2 | `RegistryFilesystemMounter.captureBack` | Same DI port, called at teardown Hook B (`provisioner.ts:1637,1690,1716`) for all three end paths. | SIMPLIFY | Shrink to worktree-only `releaseWorktree` (unstage scaffolding, commit leftovers to the `agent/*` branch, `worktree remove`) — that part has real user value (work appears as a branch in the user's own repo; no stale worktree registrations). Everything else it does — bundle, snapshot, DB insert, containment check, sessionId regex, rollback — is the dead archive: DELETE per feature-kill 1. |

Internal members not in the input surface, for completeness: `LocalFolderAdapter.captureBack`,
`GitCloneAdapter.captureBack` → DELETE (feature-kills 2, 3). `CloudNotBuiltAdapter` → DELETE
(feature-kill 4). `LocalFolderAdapter.mount`, `GitCloneAdapter.mount`, `GitWorktreeAdapter.mount`,
`writeExclude`, `sanitizeBranch`, `resolveCommonGitDir`, `isLocalRepoPath`, `selectMountAdapter` →
survive inside run-orchestration as the mount function's guts. `MalformedFilesystemError` →
DELETE the class; return the error result the caller already handles.
`GitWorktreeAdapter.captureBack` → survives shrunken as `releaseWorktree` (row 2).

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `AdapterDeps` | DELETE | Zero external references — boot.ts builds the deps structurally without importing it. After feature-kill 1, two of its three members (`capturesDir`, `db`) are dead anyway; the survivor is "pass the git-runner factory", which needs no interface. |
| `MountingGitRunnerFactory` | SIMPLIFY | The port is real (Application injects `createGitRunner`), but zero external importers of the *type*, and 4 of its 11 verbs have zero production callers in this package: `lsRemote` (never called here), `revParseIsInsideWorkTree` (TEST-ONLY), `currentBranch` (DEAD, nothing references it anywhere), `bundle` (dies with the archive). Delete those four; the type becomes an internal declaration in run-orchestration. |
| `SANDBOX_SCAFFOLDING_PATHS` | MERGE | Live and load-bearing — feeds `writeExclude` at mount and the unstage filter at teardown, and the cross-layer drift-guard test (`layers/core-api/src/__tests__/scaffolding-drift-guard.test.ts`) pins it against every real scaffolding writer's `EMITTED_ROOTS_*`. Moves with the engine into run-orchestration, next to the scaffolding writers it mirrors; drift-guard re-points its import. |

## Holes this leaves

- **AO5 (session fork from checkpoint) loses its substrate.** `TRACK-AO.md` says AO5 "literally
  cannot be built" without AO2's capture write-path. True — and rebuilding a capture path when AO5
  starts is small, will target AO5's actual restore verbs, and beats paying storage + code + a DB
  table for an unbuilt feature indefinitely. If the founder holds AO5 as imminent, the cheapest
  counter-verdict is keeping only `GitWorktreeAdapter`'s commit (the branch IS the checkpoint;
  `commitSha` is recoverable from the branch itself with no table).
- **Unpushed work on connected (clone-source) repos dies at teardown.** Today it "survives" into a
  bundle no product surface can open — so nothing users could reach is lost. The sanctioned path
  is the agent pushing its branch.
- **Accumulated `filesystem_captures` rows and `.ao2-captures` files become orphans.** Drop the
  table, delete the dir; nothing ever read either.
- **The `writeback` setting's teardown-capture promise goes fully hollow** (it was already half
  hollow — nothing gates captureBack on it and nothing reads captures). Whether the field itself
  dies belongs to the `filesystems` / settings destroyer; flagging the cross-service seam here.
- **Contract shrink ripples:** `FilesystemMounter` and `CaptureResult` in
  `framework/filesystem-contract` shrink or die with the port; `provisioner.ts` Hook B call sites
  become "release worktrees" calls; `boot.ts:299-307` wiring loses `capturesDir` and `db`.


---

# filesystems — destroyer verdict

## Should this service exist?

**KEEP — but as the ONE filesystem service. MERGE `filesystem-mounting` into it and delete that package.**

The feature is core value: a founder hands an agent a real repo or folder, and the agent gets it mounted in its sandbox at spawn. That is literally "agents doing real work" — register → probe → inject → mount → capture is one lifecycle, one domain.

It is currently split across two packages for a reason that no longer exists. `filesystem-mounting`'s own barrel lore says the F1 split happened because "`filesystems` is still a core-owned table" — that premise died with the founder's 2026-08-04 F2 ruling. `tools/governance/table-owners.json:45-47` now places `filesystems`, `filesystemInjections` (owner: `filesystems`) and `filesystemCaptures` (owner: `filesystem-mounting`) all in the same agent-orchestration Layer. Two same-layer packages, one domain, and the split forces a **duplicated 12-verb git-runner port** (`FilesystemsGitRunnerFactory` in `filesystems/src/ports.ts` vs the structurally identical `MountingGitRunnerFactory` in `filesystem-mounting/src/ports.ts`). Merge direction: mounting → filesystems (10 functions absorb 1 class + 1 const). One package, one table-owners entry set, one git-runner port. The `filesystem-mounting/src/index.ts` lore claiming filesystems is core-owned is stale and dies in the merge.

Note: this service was already gutted once (AU20 R-filesystems: NoopAuthResolver, adapter classes, two-step agent list, `startWatcher`, `listCaptures`, all deleted). AU21's bake-at-emit machinery (`resolveInjectedFilesystemsForAgent`) is **confirmed fully gone** — zero hits repo-wide (`rg -a` across layers/framework/applications/tools), AU26 F2 replaced it with the live spawn-read. The remaining fat is not in the functions — it is in the **types** (9 declarations propping up 10 one-query functions) and in the package split.

## If written today, from scratch

Nine functions, one package, three types:

- `saveFilesystem`, `getFilesystem`, `listFilesystems(teamId|agentId)`, `deleteFilesystem` — the record
- `saveInjection`, `deleteInjection` — assign/eject a filesystem for an agent
- `refreshFilesystemState` — probe + persist in one call (today's `resolveFilesystemState` + `updateFilesystemState` + the route's `checkAndPersistState`, which is service logic stranded in a route)
- `listInjectedFilesystemsForProvisioning` — the live spawn-read, returning `Filesystem` from `@hyperidle/filesystem-contract`
- `inspectLocalPath` — onboarding path probe
- plus `RegistryFilesystemMounter` + `SANDBOX_SCAFFOLDING_PATHS` absorbed from the dead sibling package
- Types: `FilesystemFilter` (two fields), `LocalPathInfo`, one shared 12-verb git-runner port

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 6 |
| MERGE | 2 |
| SIMPLIFY | 4 |
| KEEP | 7 |

Surface: 10 methods → 9 methods (10% cut) · 9 type declarations → 3 (67% cut) · 2 packages → 1

## Feature-level kills

1. **Kill the team-consistency gate on `POST /api/filesystems/:id/injections` — and with it, both internal seam endpoints.** The gate (core-api `routes/filesystems.ts:67`) reads `users` + `team_members` to verify the agent belongs to the filesystem's team, and because those are core tables, the write has to travel core → HTTP seam → `GET /api/agent-orchestration/filesystems/:id/team` + `POST .../injections/persist` (`agent-orchestration-intake.ts:403,413`) → `saveInjection`. That is two internal HTTP endpoints, a seam declaration on `core-api-port.ts`, and a two-hop write, all to enforce a same-team check. This is a permission matrix reflex (ETHOS §1/§2: trust humans and agents; small teams usually ARE one team). Delete the gate, move the route into `layers/agent-orchestration/src/routes/filesystems.ts` beside its siblings, call `saveInjection` directly, delete both intake endpoints and the seam entries. Hole: a user can inject a filesystem into an agent on another team — the mount still works, nothing corrupts (FKs still guarantee both rows exist). Acceptable.

2. **Kill the `filesystem-mounting` package** (merge, not delete — the mounter code is live and core). See above.

3. **Already dead, confirmed dead:** AU21's pre-bake machinery. Nothing left to kill; noted so nobody hunts for it again.

## Full method audit

Reachability verified with the code graph at head ba0fb454; both graph-negative rows (`saveInjection`, `listInjectedFilesystemsForProvisioning`) confirmed LIVE by `rg -a` — the graph missed an alias import (`saveInjection as saveFilesystemInjection`, `agent-orchestration-intake.ts:41`) and boot-time DI wiring (`boot.ts:319-322`).

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `resolveFilesystemState` | UI:POST /api/filesystems/ · UI:GET /api/filesystems/:id | MERGE | Always called with `updateFilesystemState` via the route's `checkAndPersistState` helper — that trio is one act. Fold all three into one service method `refreshFilesystemState(exec, row, deps)`; also drop the `FilesystemReachabilityInput` mirror and take `FilesystemRow` (it reads 4 of the 9 fields). |
| 2 | `saveFilesystem` | UI:POST /api/filesystems/ | KEEP | Core value: registering a repo/folder is how a founder gives an agent real material to work on. Door: register route, live from SettingsFilesystems + SetupFlow. |
| 3 | `getFilesystem` | UI:POST /api/filesystems/ · UI:GET /api/filesystems/:id · UI:DELETE /api/filesystems/:id · UI:GET /api/agent-orchestration/filesystems/:id/team (seam) · UI:POST .../injections/persist (seam) | KEEP | Core CRUD read behind three real doors. The two seam doors die with feature-kill #1; the method survives on the other three. |
| 4 | `listFilesystems` | UI:GET /api/filesystems/ · INTERNAL (`listInjectedFilesystemsForProvisioning`) | SIMPLIFY | The `ids` branch and the bare list-everything fallback have zero production callers (only `teamId` and `agentId` are ever passed). Delete both branches; filter becomes `teamId` XOR `agentId`. |
| 5 | `updateFilesystemState` | UI:POST /api/filesystems/ · UI:GET /api/filesystems/:id | MERGE | One-line UPDATE only ever executed as the persist half of a probe. Dies into `refreshFilesystemState` (row 1). |
| 6 | `deleteFilesystem` | UI:DELETE /api/filesystems/:id | KEEP | Detach door; injections cascade at DB level. Minimal already. |
| 7 | `saveInjection` | UI:POST /api/agent-orchestration/filesystems/:id/injections/persist (seam from core POST /api/filesystems/:id/injections) — graph missed the alias import, `rg` confirms | KEEP | The injection write IS the product act "give this agent this filesystem". After feature-kill #1 it is called directly from the moved route, one hop. |
| 8 | `deleteInjection` | UI:DELETE /api/filesystems/:id/injections/:agentUserId | KEEP | Eject door, single query, returns existence honestly. Minimal. |
| 9 | `listInjectedFilesystemsForProvisioning` | BOOTSTRAP (`boot.ts:321` → `run-orchestration` `mountFilesystemsForAgent`, admitSession Phase 4.5) — graph missed DI wiring, `rg` confirms | SIMPLIFY | The spawn-read is core value (closes the AU26 F2 staleness window), but the hand-rolled 9-field mapping duplicates the route's `rowToFilesystem`. Return `readonly Filesystem[]` from `@hyperidle/filesystem-contract` via one shared mapper; delete the `InjectedFilesystemForProvisioning` mirror. |
| 10 | `inspectLocalPath` | UI:POST /api/filesystems/inspect-path | KEEP | SetupFlow onboarding calls it twice (`SetupFlow.tsx:368,508`) to classify folder vs git repo and get the branch `codeRefSchema` requires before register. Real user-facing door, never throws, already minimal. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `FilesystemReachabilityInput` | DELETE | Nine-field mirror of `FilesystemRow`; the function reads four of them. Take `FilesystemRow` — the only production caller already passes exactly that. |
| `FilesystemRow` (re-export alias) | DELETE | Pure passthrough of `@hyperidle/db`'s type. Governance classifies `db:row-type` as an ungated import surface — the route imports it from `@hyperidle/db` directly (it already imports `HyperIdleDb` from there). |
| `NewFilesystem` (re-export alias) | DELETE | Passthrough with zero external consumers — `rg -a` finds only `framework/db` itself and this package. |
| `NewFilesystemInjection` (re-export alias) | DELETE | Same: zero external consumers. |
| `FilesystemFilter` | SIMPLIFY | Dies to two fields (`teamId` XOR `agentId`) with row 4's branch kills. |
| `InjectedFilesystemForProvisioning` | DELETE | Third copy of the same nine fields (`Filesystem` in filesystem-contract, `FilesystemForProvisioning` in run-orchestration are the other two). The consumer re-declares its own port shape by design (Mechanism C), so this one serves nobody — return `Filesystem`. |
| `LocalPathInfo` | KEEP | The wire contract of a live door (inspect-path JSON body). Three fields, all read by SetupFlow. |
| `FilesystemsGitRunnerFactory` | SIMPLIFY | Declares 12 verbs; this package calls 3 (`lsRemote`, `revParseIsInsideWorkTree`, `currentBranch`) — the other 9 are a copy-paste of the mounting engine's needs from before the F1 split. After the package merge: one shared port with `MountingGitRunnerFactory`. If the merge is rejected: shrink to the 3 used verbs. |
| `FilesystemsServiceConnectionResolver` | DELETE | Never used inside this package — it types the ROUTE's injected dependency and is parked here only because the route once lived in core-api. Post-F2 the route sits in the same layer; declare the one-member shape inline at the route (or import from `@hyperidle/connections`). |

## Holes this leaves

- **Cross-team injection becomes possible** (feature-kill #1): a filesystem can be injected into an agent on a different team. FKs still guarantee both rows exist; the mount works; nothing corrupts. For a small-team product this is a trust posture, not a bug — and if it ever burns someone, that learning earns the gate back per ETHOS §2.
- Everything else is behavior-preserving: the merges and simplifies change signatures and package layout, not observable behavior. Tests exercising the `ids` filter branch and the deleted type mirrors die with them.
- Unrelated but observed while auditing: mount failures at spawn are `console.warn`-only (`filesystem-provisioning.ts:107-116`) — the register-time probe is currently the ONLY user-visible signal a filesystem is broken. That is the argument for keeping the probe; it is not a hole this pass creates.


---

# api-contract — destroyer verdict (framework)

## Where does this package go?

**Verdict: STAYS SHARED — but gutted to the one thing it really is: the core-api ↔ agent-orchestration seam contract.**

The package's own header claims it exists so "server and client stay in sync." That is fiction. **Zero UI consumers exist** — `rg -a -l "@hyperidle/api-contract"` finds no file under `layers/core-ui` or `applications/web`. The web client types its API calls with its own local copies (`useCurrentUser.ts` declares its own `CurrentUser`; its test declares its own private `AuthMeResponse`). The three files written for that charter — `auth.ts`, `session.ts`, `settings.ts` — have **zero production consumers anywhere**, including the package's only function. They are kept alive solely by the package's own `contracts.test.ts`, which tests nothing but them.

What the package actually is: the two-sided port contract across the core-api ↔ agent-orchestration boundary. Both layers import overlapping symbol sets from it, both are forbidden to import each other (founder ruling quoted in `layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts:7-9`; governance `architecture.json` declares `surfaces/framework/api-contract` with `reach: ["layer"]`), and the contract carries live runtime traffic in both directions:

- core-api consumes `AgentOrchestrationPort` (34 production files) → agent-orchestration's routes serve it with `satisfies` on the same types.
- agent-orchestration consumes `CoreApiPort` via its HTTP client (`core-api-port-composition.ts`) → core-api's routes type the same request/response shapes (`reviews.ts` imports `CaptureProposedCallRequest` etc.).
- `CORE_API_ACTOR_OVERRIDE_HEADER` is *sent* by agent-orchestration (`core-api-port-composition.ts:878`) and *read* by core-api (`middleware/auth.ts:146`) — a genuinely shared runtime constant.

Dissolving into either layer would force the other layer to import it, which the governance model forbids by construction. This is the one framework-package shape that earns its existence: two independent consumers on opposite ends of a machine-enforced boundary. DISSOLVE is not honest here.

But two whole port members are dead wire — client method, backing HTTP route, and types, none of it called by anything — and three of the five source files plus the package's only test file are corpses.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/api-contract" layers framework applications tools`:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api` (12 prod files) | `AgentOrchestrationPort` + its req/resp/view types, `CoreApi*` req types in `routes/reviews.ts`, `CORE_API_ACTOR_OVERRIDE_HEADER` | No — it would have to import agent-orchestration for the port, forbidden |
| `layers/agent-orchestration` (5 prod files) | `CoreApiPort`, `CoreApiTransport`, all `CoreApi*` req/resp types (client impl), `AgentOrchestration*` wire types (`satisfies` on serving routes) | No — it would have to import core-api, explicitly ruled out (lore in `agent-orchestration-sessions.ts`) |
| `tools/eval` | `AgentOrchestrationPort`, `AgentOrchestrationTransport` (fixture) | Dev world, follows wherever the type lives |
| `tools/governance` | `AuthMeResponse` as an attack-fixture import string only | Incidental — any exported type name works |
| `applications/desktop`, `applications/remote-server`, `run-orchestration/session-store`, `tool-handlers/ports.ts` | **Comments only** — zero imports (`tool-handlers/ports.ts` deliberately mirrors `TaskView` structurally, "Mechanism C: no import") | n/a |
| `layers/core-ui` / web | **Nothing. Ever.** | The "client sync" charter never happened |

## If written today, from scratch

One package, two files, one honest name: the seam contract between the two layers.

- `core-api-port.ts` — `CoreApiPort` + the req/resp types its 44 live members carry (all 44 verified live: every member has ≥1 caller in agent-orchestration outside the client impl — this is the agents' tool traffic, core value).
- `agent-orchestration-port.ts` — `AgentOrchestrationPort` shrunk by the two dead session members, + the wire types its live members carry.
- `CORE_API_ACTOR_OVERRIDE_HEADER`.
- No `auth.ts`, no `session.ts`, no `settings.ts`, no `contracts.test.ts`, no sub-port exports from the index — sub-ports are reachable as members of the two parent ports.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 13 |
| MERGE | 0 |
| SIMPLIFY | 13 |
| KEEP | 72 |

Surface: 98 exports → 72 exports (27% cut). Files: 5 source files → 2 (+index), package test file deleted, plus ~100 LOC of dead client/route code in the two layers.

## Feature-level kills

1. **The "server/client sync" charter — dead on arrival, delete the remains.** `auth.ts`, `session.ts`, `settings.ts`: 13 exports including the package's ONLY function (`isPendingSessionStart` — zero references outside its own file, confirmed `rg -a` repo-wide). The serving routes don't import them (`routes/auth.ts` types its own response), the web client doesn't import them (writes its own local types). `AutonomyLevel` here (`"manual"|"supervised"|"autonomous"`) even **contradicts** the real `AutonomyLevel` in `framework/domain-model/src/knowledge.ts:69` (`1|2|3|4`) — a stale duplicate of a retired concept waiting to be imported by mistake.
2. **Two dead seam reads: session history + session activity.** `AgentOrchestrationPort.sessions.listSessionHistoryBySource` and `.getRecentActivity` have **zero callers** in core-api production. Kill the port members, their client impls (`agent-orchestration-port-composition.ts:218-260`), their backing wire routes (`agent-orchestration-sessions.ts:64-89` GET `/agent-orchestration/sessions`, `:108-114` GET `/agent-orchestration/sessions/:sessionId/activity`), the `getRecentActivity` DI parameter threaded through that route factory and boot, and the two entry types. The UI gets session activity through agent-orchestration's own REST door (`routes/sessions.ts` GET `/api/sessions/:id/activity`, hit by `core-ui/hooks/useSessionActivity.ts`) — the seam copy is a parallel second door nobody walks through.
3. **`src/__tests__/contracts.test.ts` — delete whole.** It exercises only the dead auth/settings types, and it is exactly the kind of type-shape "test" the repo's own testing rules reject. It is the only thing keeping the corpses warm. The `vitest` devDependency goes with it.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `isPendingSessionStart` | DEAD | DELETE | The package's only function; zero references outside its own file, repo-wide `rg -a` confirmed. |

## Full export audit (types + const)

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `AgentOrchestrationSessionHistoryEntry` | interface | DEAD | DELETE | Only the never-called `listSessionHistoryBySource` client impl names it. |
| 2 | `AgentOrchestrationSessionActivityEntry` | interface | DEAD | DELETE | Only the never-called `getRecentActivity` client impl names it; UI reads activity via the REST door instead. |
| 3 | `AgentOrchestrationSessionWireRow` | interface | UI:POST /api/sessions (202 branch) | KEEP | Live wire row: served with `satisfies` by the owning layer, read through `sessions.getById` by core-api routes. |
| 4 | `AgentOrchestrationSessionsPort` | interface | INTERNAL | SIMPLIFY | 2 of 3 members die (rows 1-2's methods); shrink to `getById` and stop exporting — reachable as `AgentOrchestrationPort["sessions"]`. |
| 5 | `AgentOrchestrationWorkIntentKind` | type | UI + SCHED + intake route | KEEP | Live both ends: intake route + composition + scheduler bindings. |
| 6 | `AgentOrchestrationWorkIntentInput` | interface | UI:POST /api/knowledge… + SCHED:routine-scheduler | KEEP | Payload of `intents.submit`, called from 4 core-api prod files. |
| 7 | `AgentOrchestrationWorkIntentReceipt` | interface | same as 6 | KEEP | Return of live `intents.submit`. |
| 8 | `AgentOrchestrationExplicitStartRequest` | interface | UI:POST /api/sessions | KEEP | Payload of live `createExplicitStart`; typed on both ends of the seam. |
| 9 | `AgentOrchestrationExplicitStartView` | interface | UI:POST /api/sessions, GET /api/sessions/starts/:id | KEEP | Live on 3 prod files incl. `sessions-routes.ts`. |
| 10 | `AgentOrchestrationExplicitStartResult` | interface | same as 8 | KEEP | Return of live `createExplicitStart`. |
| 11 | `AgentOrchestrationIntentsPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; un-export, reachable as `AgentOrchestrationPort["intents"]`. |
| 12 | `AgentOrchestrationRequestsPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 3 members live; un-export. |
| 13 | `AgentOrchestrationStoppedRun` | interface | UI:tasks route via `runs.stopForTasks` | KEEP | Return of live member. |
| 14 | `AgentOrchestrationCreateBareRunRequest` | interface | UI via `runs.createBareRun` | KEEP | Payload of live member, typed on both ends. |
| 15 | `AgentOrchestrationRunsPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 5 members live (`stopForTasks`, `endForHandoff`, `createBareRun`, `abort`, `failExplicitStart`); un-export. |
| 16 | `AgentOrchestrationRunConfigView` | interface | UI:GET /api/agents/:id, /api/assistant | KEEP | Return of live `runConfig.read`/`readBatch`. |
| 17 | `AgentOrchestrationRunConfigPatch` | type | UI:PATCH /api/agents/:id, /api/assistant | KEEP | 4 prod importers; live write traffic. |
| 18 | `AgentOrchestrationTeamRunConfigDefaultsView` | interface | UI:teams routes | KEEP | Live `readTeamDefaults`/`writeTeamDefaults` both called. |
| 19 | `AgentOrchestrationRunConfigPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 5 members live; un-export. |
| 20 | `AgentOrchestrationFilesystemInjectionView` | interface | INTERNAL | SIMPLIFY | Zero name-importers; rides live `persistInjection` return; un-export. |
| 21 | `AgentOrchestrationPersistInjectionResult` | type | INTERNAL | SIMPLIFY | Same — un-export. |
| 22 | `AgentOrchestrationFilesystemsPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; both members live (`filesystems.ts:79,105`); un-export. |
| 23 | `AgentOrchestrationPort` | interface | UI + SCHED + EVENT — 34 prod files | KEEP | The seam itself. Core value: core-api's only legal door into orchestration. Loses the two dead session members. |
| 24 | `AgentOrchestrationTransport` | type | BOOTSTRAP both layers + eval | KEEP | Selects in-process vs HTTP wiring at boot on both sides. |
| 25 | `AuthMeResponse` | interface | TEST-ONLY/TOOLING | DELETE | Serving route and web hook both use private local copies; only real references are governance attack-fixture strings. |
| 26 | `CreateBetRequest` | interface | AGENT:create_bet tool | KEEP | Live `createBet` traffic, typed both ends. |
| 27 | `CreateBetResponse` | interface | AGENT:create_bet tool | KEEP | Return of live member. |
| 28 | `TaskView` | interface | AGENT:task tools | KEEP | Live `getTaskById`; deliberately mirrored (not imported) by `tool-handlers/ports.ts` — the contract copy is the master. |
| 29 | `BetView` | interface | AGENT:bet tools | KEEP | Live `getBetById`. |
| 30 | `UpdateBetRequest` | interface | AGENT:update_bet | KEEP | Live `updateBetById`. |
| 31 | `CreateTaskRequest` | interface | AGENT:create_task | KEEP | Live `createTask`. |
| 32 | `CreateTaskResponse` | interface | AGENT:create_task | KEEP | Return of live member. |
| 33 | `ItemView` | interface | AGENT:item tools | KEEP | Live `getItemById`/`updateItemById`. |
| 34 | `UpdateItemRequest` | interface | AGENT:item tools | KEEP | Live `updateItemById`. |
| 35 | `CreateItemRequest` | interface | AGENT:create_item + EVENT reactions | KEEP | Live `createItem`, imported by both `tool-handlers-bindings` and the client. |
| 36 | `CreateItemResponse` | interface | same | KEEP | Return of live member. |
| 37 | `CreateArtifactRequest` | interface | AGENT:create_artifact | KEEP | Live `createArtifact`. |
| 38 | `CreateArtifactResponse` | interface | same | KEEP | Return of live member. |
| 39 | `UserView` | interface | AGENT:user reads | KEEP | Live `getUserById`/`listUsersByTeam`/`findSoleHumanUser`. |
| 40 | `HandoffTaskRequest` | interface | AGENT:handoff tool | KEEP | Live `handoffTask`. |
| 41 | `HandoffTaskResponse` | interface | same | KEEP | Return of live member. |
| 42 | `CoreApiWorkPort` | interface | agent-orchestration imports name | KEEP | All 12 members verified live from the orchestration side. |
| 43 | `CoreApiUsersPort` | interface | agent-orchestration imports name | KEEP | All 3 members live. |
| 44 | `ConversationThreadView` | interface | AGENT:conversation tools | KEEP | Live `getThreadById`; mirrored by design in `tool-handlers/ports.ts`. |
| 45 | `InsertThreadRequest` | interface | AGENT:conversation tools | KEEP | Live `insertThread`. |
| 46 | `InsertThreadResponse` | interface | same | KEEP | Return of live member. |
| 47 | `UpdateThreadRequest` | interface | AGENT:conversation tools | KEEP | Live `updateThread`. |
| 48 | `ConversationMessageType` | type | AGENT:messaging | KEEP | Field of live `InsertMessageRequest`. |
| 49 | `InsertMessageRequest` | interface | AGENT:send_message | KEEP | Live `insertMessage` — the agents-talk-in-conversations core loop. |
| 50 | `InsertMessageResponse` | interface | same | KEEP | Return of live member. |
| 51 | `ConversationInboxMessageView` | interface | INTERNAL | SIMPLIFY | Zero name-importers; only a field of `ConversationInboxRowView`; un-export. |
| 52 | `ConversationInboxRowView` | interface | AGENT:inbox reads | KEEP | Return of live `listInboxBySenderExclusion`. |
| 53 | `DirectThreadResponse` | interface | AGENT:direct threads | KEEP | Return of live `findOrCreateDirectThread`. |
| 54 | `CoreApiConversationPort` | interface | agent-orchestration imports name | KEEP | All 7 members live. |
| 55 | `OrgTeamView` | interface | AGENT:team reads | KEEP | Live `getTeamById`. |
| 56 | `OrgTeamMembershipView` | interface | AGENT:team reads | KEEP | Live `getTeamMembersByTeamId`. |
| 57 | `OrgTeamMembersByIdView` | interface | AGENT:team reads | KEEP | Live `getTeamMembersById`. |
| 58 | `CreateOrgTeamRequest` | interface | AGENT:team scaffolding | KEEP | Live `createTeam`. |
| 59 | `UpdateOrgTeamRequest` | interface | AGENT:team updates | KEEP | Live `updateTeam`. |
| 60 | `ReviewRecipientsQuery` | interface | INTERNAL | SIMPLIFY | Zero name-importers; param of live `resolveReviewRecipientsForItem`; un-export. |
| 61 | `PersistScaffoldedAgentsResponse` | interface | AGENT:team scaffolding | KEEP | Return of live `persistScaffoldedAgents`. |
| 62 | `ProvisionTeamRoutinesRequest` | interface | AGENT:team scaffolding | KEEP | Live `provisionTeamRoutines`. |
| 63 | `CoreApiOrgPort` | interface | agent-orchestration imports name | KEEP | All 8 members live. |
| 64 | `InsertRoutineRequest` | interface | AGENT:routine tools | KEEP | Live `insertRoutine`, imported by `tool-handlers-bindings`. |
| 65 | `RoutineView` | interface | AGENT:routine tools | KEEP | Live `getRoutineById`. |
| 66 | `UpdateRoutineRequest` | interface | AGENT:routine tools | KEEP | Live `updateRoutineById`. |
| 67 | `CoreApiRoutinePort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 3 members live; un-export, reachable as `CoreApiPort["routine"]`. |
| 68 | `CreateKnowledgeItemRequest` | interface | AGENT:knowledge tools | KEEP | Live `knowledge.create` — shared-knowledge core loop. |
| 69 | `CreateKnowledgeItemResponse` | interface | same | KEEP | Return of live member. |
| 70 | `UpdateKnowledgeItemContentRequest` | interface | AGENT:knowledge tools | KEEP | Live `updateKnowledgeItemContent`. |
| 71 | `UpdateKnowledgeItemContentResponse` | interface | same | KEEP | Return of live member. |
| 72 | `UpdateKnowledgeItemContentResult` | type | same | KEEP | Discriminated result of live member. |
| 73 | `KnowledgeItemVersionView` | interface | AGENT:knowledge reads | KEEP | Live `findKnowledgeItemVersionById`. |
| 74 | `KnowledgeItemStatusView` | interface | AGENT:knowledge reads | KEEP | Live `findKnowledgeItemStatusById`. |
| 75 | `KnowledgeConflictView` | interface | AGENT:knowledge conflicts | KEEP | Live `findOpenConflictByItemAndProposer`. |
| 76 | `CreateKnowledgeConflictRequest` | interface | AGENT:knowledge conflicts | KEEP | Live `createKnowledgeConflict` (3 callers). |
| 77 | `PromoteKnowledgeItemRequest` | interface | AGENT:knowledge promotion | KEEP | Live `promoteKnowledgeItem`. |
| 78 | `PromoteKnowledgeItemResult` | type | same | KEEP | Return of live member, 2 prod importers. |
| 79 | `CoreApiKnowledgePort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 10 members live; un-export. |
| 80 | `CaptureProposedCallRequest` | interface | AGENT:AL7 review loop | KEEP | Live `captureProposedCall`, typed on the serving route too (`reviews.ts`). |
| 81 | `CaptureProposedCallResponse` | interface | same | KEEP | Return of live member. |
| 82 | `ConsumeTailoredGrantRequest` | interface | AGENT:AL7 review loop | KEEP | Live `consumeTailoredGrant`, both ends. |
| 83 | `ConsumeTailoredGrantResponse` | interface | same | KEEP | Return of live member. |
| 84 | `ProposedCallOutcomeResult` | type | AGENT:AL7 review loop | KEEP | Live `recordOutcome`, both ends. |
| 85 | `CoreApiReviewPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 3 members live; un-export. |
| 86 | `CoreApiPort` | interface | AGENT — 25 prod files | KEEP | The other half of the seam: agent-orchestration's only legal door into core-api. Core value: every agent tool call rides it. |
| 87 | `CoreApiTransport` | type | BOOTSTRAP both layers | KEEP | 6 prod importers; boot-time wiring selector. |
| 88 | `PendingSessionStart` | interface | DEAD | DELETE | Zero references outside `session.ts`. The 202 flow types its wire rows elsewhere. |
| 89 | `CreateSessionAcceptedResponse` | type | DEAD | DELETE | Zero references outside `session.ts`. |
| 90 | `AutonomyLevel` | type | DEAD | DELETE | Zero consumers, and it contradicts the real `AutonomyLevel` (`1\|2\|3\|4`) in `domain-model/knowledge.ts:69` — a booby trap, not a contract. |
| 91 | `SettingsProfile` | interface | TEST-ONLY | DELETE | Only the package's own test imports it; core-ui hits are React components sharing the name, zero api-contract imports in core-ui. |
| 92 | `SettingsTeam` | interface | TEST-ONLY | DELETE | Same corpse pile. |
| 93 | `SettingsUser` | interface | TEST-ONLY | DELETE | Same. |
| 94 | `SettingsAgent` | type | TEST-ONLY | DELETE | Same. |
| 95 | `SettingsNotifications` | interface | TEST-ONLY | DELETE | Same; the real notifications UI never imported it. |
| 96 | `SettingsResponse` | interface | DEAD | DELETE | Zero references anywhere outside the package. |
| 97 | `CORE_API_ACTOR_OVERRIDE_HEADER` | const | seam runtime value, both layers | KEEP | Sent by orchestration's client (`core-api-port-composition.ts:878`), read by core-api auth (`auth.ts:146`). The one legitimate runtime export. |

## Types / DI ports

Covered above — this package is nothing but types and one const; rows 1-97 are the complete surface.

## Holes this leaves

- **None at runtime.** Every DELETE has zero production callers, verified with `rg -a` repo-wide. No UI, agent, or scheduler door reaches any of it.
- Deleting the two dead port members also deletes their backing wire routes and client impls (~100 LOC across `agent-orchestration-port-composition.ts` and `agent-orchestration-sessions.ts`) plus the `getRecentActivity` DI thread through agent-orchestration boot; the port-readonly integration test loses the cases covering those two routes.
- `tools/governance` attack fixtures use `import type { AuthMeResponse } from "@hyperidle/api-contract"` as their probe string (3 sites in `governance-attacks.ts`, 1 mention in `no-laundered-re-exports.ts`) — respell to any surviving export, e.g. `CoreApiTransport`. Tooling-world, five-minute fix.
- If the founder ever actually wants typed web↔server contracts, that is a new decision to make deliberately — not a reason to keep 13 dead exports that pretended to be one for the entire life of this package.
- Deleting `contracts.test.ts` removes the package's only test. Nothing of value is lost: it tested only the deleted types, with type-shape assertions the repo's testing rules already reject.


---

# block-derivation — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `framework/design-system`**

Block derivation is real product capability, not machinery ahead of need — but it is not a package.
Derived blocks reach five UI doors: the knowledge page (`KnowledgeBody.tsx`), the bet pitch
(`WorkBet.tsx`), the review canvas (`review-canvas.tsx` — prose blocks and synthetic code-line ids
for diff-anchored comments), artifact text bodies (`compose-artifact-body.tsx`), and every plain
message (`CommentRow.tsx` via `derivePayloads`). Anchored comments and knowledge rendering stand on
these ids. The capability lives.

The package does not. Exactly two production consumers exist: `framework/design-system` and
`layers/core-ui` — and core-ui already depends on design-system. Derivation runs **client-side at
render time only** (@lore L23); zero server code touches it — `core-api` and `domain-model` carry
the dependency for tests alone. Derivation and rendering are one pipeline: markdown → payloads →
React. Design-system already owns the rendering half (`src/block/`, `HeadingPayload`,
`compose-artifact-body`). Move the four source files into `framework/design-system/src/block/`,
export `deriveBlocks`, `derivePayloads`, `blockId`, `normalisedPayload`, `slug`,
`EMPTY_SLUG_SENTINEL` from there, delete the package. Design-system gains the deps
(`remark-parse`, `remark-gfm`, `unified`, `github-slugger`, `@noble/hashes`); core-ui's import
lines change package name and nothing else.

Graph note: `trace-uses.ts deriveBlocks` returns "nothing references" — false negative (pure
client-side imports, no door/DI wiring in the graph). The `rg -a` sweep across all four roots is
the evidence above.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/block-derivation" layers framework applications tools`:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `framework/design-system` (3 files: `compose-artifact-body.tsx`, `CommentRow.tsx`, `HeadingPayload.tsx`) | `deriveBlocks`, `derivePayloads`, `slug`, `EMPTY_SLUG_SENTINEL` | **Yes — it becomes the owner.** Already renders every payload the derivation produces. |
| `layers/core-ui` (4 files: `WorkBet.tsx`, `useBlockResolution.ts`, `KnowledgeBody.tsx`, `review-canvas.tsx`) | `deriveBlocks`, `blockId`, `normalisedPayload` | No (design-system cannot import a layer) — but it already imports design-system, so it consumes from there. |
| `framework/domain-model` | **devDependencies only** — its `__tests__/blocks/` hosts tests OF block-derivation code | N/A — misplaced tests; they move with the code, devDep dies. |
| `layers/core-api` | **test-only** (`blocks-no-ssrf.test.ts`); zero production imports in `src/` | N/A — retarget the test import, drop the dep from `package.json`. |

Two production consumers, one of which sits below the other in the dependency graph. That is not a
shared package; that is design-system code with an invented boundary.

## If written today, from scratch

One module family inside design-system, next to the block renderers:

- `deriveBlocks(body, host)` — markdown → identified `Block[]` (the whole point of the concept)
- `derivePayloads(text)` — the same walker with image-downgrade policy and no identity, for messages
- `blockId(...)` / `normalisedPayload(...)` / `slug(...)` / `EMPTY_SLUG_SENTINEL` — the id primitive
  and its normalisation, exported because review-canvas mints synthetic ids for diff lines and
  HeadingPayload re-slugs anchors

One mdast→payload walker, not two. No collision "check" that reports to a no-op.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 1 |
| MERGE | 3 |
| SIMPLIFY | 0 |
| KEEP | 5 |

Surface: 9 exports → 5 surviving public exports (44% cut), package itself deleted, ~220 duplicated
walker lines deleted via the `derivePayloads` merge.

## Feature-level kills

**The dev-mode collision check is theatre — delete it.** `deriveBlocks` calls
`assertNoCollisions(blocks, defaultLogger)` in non-production, and `defaultLogger.critical` is an
intentional no-op (`derive-blocks.ts:444-448`). The check builds a Map on every derivation in dev
and can never say anything, in any environment, to anyone. Its own comment concedes
`golden-ids.test.ts` is the canonical guard. Zero production loss; a `domain-model` test that
invokes it directly dies with it.

No other feature kills: derivation itself is load-bearing for Blocks (anchored comments, knowledge
rendering, review anchors) and every remaining export is on a painted UI path.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `blockId` | function | UI: review canvas (diff-line comment anchors, `review-canvas.tsx:68`) + INTERNAL (`deriveBlocks`) | KEEP | Mints the id every anchor and comment stands on; moves to design-system. |
| 2 | `deriveBlocks` | function | UI: knowledge page, bet pitch, review canvas, artifact body, `useBlockResolution` | KEEP | The package's reason to exist — five painted routes render its output; moves to design-system. |
| 3 | `assertNoCollisions` | function | INTERNAL (wired to a no-op logger) + TEST-ONLY external refs | DELETE | Reports to nobody by construction; golden-ids snapshot is the real guard. Delete export, dev-mode call, and the test that pokes it. |
| 4 | `derivePayloads` | function | UI: every message row (`CommentRow.tsx:134`) | MERGE → `deriveBlocks` walker | Its file is a ~250-line near-copy of derive-blocks' mdast walker differing only in image policy and no-identity. Keep the entry point, share one walker with an image-policy parameter, delete the duplicate. |
| 5 | `slug` | function | UI: `HeadingPayload.tsx:22` (anchor gating) + INTERNAL (normalise, derive-blocks) | KEEP | Hash-input primitive; heading ids and anchors depend on its exact output. Moves to design-system. |
| 6 | `normalisedPayload` | function | UI: review canvas (code-line ids) + INTERNAL (`deriveBlocks`) | KEEP | Sole source of the hash preimage; review canvas must match `deriveBlocks` byte-for-byte. Moves to design-system. |
| 7 | `BlockIdInput` | interface (internal, not in `index.ts`) | INTERNAL: `blockId` signature only | MERGE → inline into `blockId` signature | A `*Input` type mirroring one function is the exact garbage the brief names. |
| 8 | `EMPTY_SLUG_SENTINEL` | const (public) | UI: `HeadingPayload.tsx:25` + INTERNAL | KEEP | Part of the hash preimage AND read by the renderer to suppress dead anchors — genuinely shared between derivation and paint. Moves to design-system. |
| 9 | `ROOT_OUTLINE_SENTINEL` | const (internal, not in `index.ts`) | INTERNAL: `derive-blocks.ts` only | MERGE → module-private const in `derive-blocks.ts` | Exported from `normalise.ts` for one sibling module; nothing outside the package can even see it. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `BlockIdInput` | MERGE | Inline into `blockId`'s parameter; one-function arg mirror. |
| `CollisionLogger` (unexported, `derive-blocks.ts:440`) | DELETE | Dies with `assertNoCollisions`; its only real implementation is a no-op. |

## Holes this leaves

- **None functional.** Every production caller keeps its function; only the import path changes to
  `@hyperidle/design-system`. Block ids are unchanged — no hash input moves.
- **Dev collision detection disappears** — from "computes and tells a no-op" to "doesn't compute".
  Observable difference: zero. `golden-ids.test.ts` remains the id-stability guard.
- **Design-system gains five npm deps** (remark-parse, remark-gfm, unified, github-slugger,
  @noble/hashes). It is already the block-rendering package; parsing what it renders is the same
  concern, not scope creep.
- **Cleanup riders:** `domain-model`'s `__tests__/blocks/` tests and devDep move with the code;
  `core-api` drops a production-declared dependency it only ever used in one test; the
  `derivePayloads` merge must keep the R3 image-downgrade policy (alt→paragraph, empty-alt→drop)
  behind an explicit parameter so message rendering and block derivation stay distinguishable.


---

# conversation-parts — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `layers/core-ui`**

Every production consumer is `layers/core-ui`. Nothing else imports it — not the conversation
service, not core-api, not agent-orchestration, not desktop. Measured:
`rg -a -l "@hyperidle/conversation-parts" layers framework applications tools` → 23 files,
all under `layers/core-ui/` (the one `framework/domain-model` hit is a doc comment).

**Explicit answer to the founder's question — is "parts of a conversation" a different thing
from "conversation"?** No, but the dissolve target is NOT the conversation service either.
A Part is a client-side render unit, "derived, never stored" by the package's own design.
The server owns `Message` (in `domain-model`); it never sees a Part. Moving this into the
conversation service would put UI view-model code on the server. The concept belongs to the
renderer that consumes it: this is `layers/core-ui/src/parts/` code wearing a package costume.

The package boundary exists for one reason: a scoped ESLint `no-restricted-imports` rule
proving the renderer never imports `Message`/`HarnessEvent`. A lint rule can scope to a
directory inside core-ui exactly as well. A package is not needed to hold a lint boundary.

Bonus: the `deriveComposerPills` function is the package's ONLY reason to depend on
`@hyperidle/harness-capability` — a composer concern jammed into a "conversation parts"
package because it had no better home. Dissolving kills that dependency edge too.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-ui` (23 files: PartList, SessionView, Conversations, ConversationSurface, open-handler, parts/*, tests, stories) | Everything the package exports that is used at all | Yes — it is the only consumer. Move `part.ts` to `layers/core-ui/src/parts/part.ts`, delete the package. |
| `framework/domain-model/src/session-activity.ts` | Nothing — mentions `derivePartsFromSession` in a comment | n/a |

## The headline finding: half this package renders data that does not exist

The only production producer of `ActivityEntry` is
`layers/agent-orchestration/src/session-activity-buffer.ts`, fed by
`run-orchestration/src/provisioner.ts:1565`, which emits exactly
`{ type: "tool_call", data: { toolName, argsSummary } }`. Confirmed with `rg -a` across
layers/framework/applications: **no production code ever produces** `reasoning`,
`answer_delta`, `answer_settled`, or `human_message` entries, and no production tool_call
ever carries `toolKind`, `status`, `verb`, `target`, `output`, `diff`, or `opensSession`.
Only stories, unit tests, and one e2e spec fabricate them.

In the running product, `derivePartsFromSession` therefore always outputs generic neutral
tool rows (toolKind "generic", status "neutral", no diff, no output), and:
- the streaming-prose merge machinery (delta append, settle, flush) never runs
- reasoning Parts never exist → `ReasoningPart.tsx` never renders in production
- `aggregateToolRun`'s running-standalone rule and `failedCount` never fire — every status
  is "neutral", everything folds
- SessionView's toolKind tallies (`SessionView.tsx:216-221` counting edits/cmds/reads) count
  over a field that is always undefined
- the `sub-agent` → `opensSession` → nested-session affordance (`ToolPart.tsx:200-207`)
  never fires
- `TOOL_KINDS`' alias pairs are a lie twice over: `normalizeToolKind`'s comment claims it
  canonicalizes "read"/"file-read" and "edit"/"file-change" but the code returns the raw
  value, so every consumer dispatches on both spellings — of values that never arrive.

This is stories-and-tests-driven fiction sustaining ~150 lines of adapter plus renderer
surface. Either wire real producers or cut the vocabulary to what the wire carries. The
destroyer verdict is: cut it; re-grow branches when a producer actually emits them.

## Second dead variant: `session-reference` Embed

No adapter and no production code ever constructs a `session-reference` Embed — only
stories and tests (`rg -a 'kind: "session-reference"'`). The renderer branch in
`embeds.tsx:66,101-102` filters and renders a variant that cannot occur. Delete the union
member, the renderer branch dies with it. (The `route: "session"` OpenTarget stays — it is
also the sub-agent row's route — but note that path is production-dead today too.)

## If written today, from scratch

A single `layers/core-ui/src/parts/part.ts` (+ the existing `parts/*` renderers) holding:
- `Part` union (prose, review, resolved, questionnaire, tool, reasoning*, unknown — reasoning
  only if a producer lands), `PartAuthor`, `PartGroup`, `Embed` (minus session-reference),
  `OpenTarget`, `OpenHandler`
- `derivePartsFromMessages` — the real, load-bearing adapter (Conversations surface)
- `derivePartsFromSession` — reduced to the tool_call mapping the wire actually carries
- `groupParts`
- tool-run folding inlined where SessionView uses it

No package, no `@hyperidle/harness-capability` dependency, no exported const sets.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 9 |
| MERGE | 1 |
| SIMPLIFY | 4 |
| KEEP | 7 |
Surface: 21 exports → 12 survivors (43% export cut), package itself deleted (100% package cut)

## Feature-level kills
1. **The rich session-stream vocabulary** (reasoning/answer-delta/answer-settled/human-message
   entries, toolKind families, statuses, diffs, sub-agent recursion). Breaks: nothing a user
   can see — production never produces the data. Stories/tests that fabricate it die too.
   Hole: when real harness streaming lands, the branches must be rebuilt against the real
   emitter instead of against fixtures — which is the correct order anyway.
2. **`session-reference` Embed kind.** Breaks: two stories, one test. No production path.
3. **The package boundary itself.** Breaks: the W1 ESLint rule must be re-scoped from a
   package name to a directory glob. One-line lint config change.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `groupParts` | function | UI: Conversations + SessionView via PartList | KEEP | Real grouping both live surfaces run on every render; moves to core-ui. |
| 2 | `derivePartsFromMessages` | function | UI: `/conversations` (Conversations.tsx, ConversationSurface.tsx) | KEEP | The load-bearing adapter; review/resolved/questionnaire/verdict paths all have real API producers (threads.ts, coach.ts, assistant.ts); moves to core-ui. |
| 3 | `derivePartsFromSession` | function | UI: SessionView | SIMPLIFY | Production input is tool_call-only (`session-activity-buffer.ts` emits nothing else); reasoning/answer_delta/answer_settled/human_message branches + streaming merge (~100 of 140 lines) are TEST-ONLY fiction — cut to the tool_call mapping; moves to core-ui. |
| 4 | `aggregateToolRun` | function | UI: SessionView only | SIMPLIFY | Status is always "neutral" in production — running-standalone rule and failedCount never fire; degenerates to "fold runs of ≥2 tools"; inline into SessionView. |
| 5 | `deriveComposerPills` | function | UI: SessionView composer only | MERGE | Six-line find+filter; sole reason the package depends on harness-capability; composer concern, not a conversation part — inline into SessionView. |
| 6 | `PartKind` | type | none (PartList mention is a comment) | DELETE | Exported to nobody; internal use inlines into the union. |
| 7 | `ToolKind` | type | none outside package | DELETE | Dies with the TOOL_KINDS fiction; production value is always "generic". |
| 8 | `PartId` | type | none | DELETE | Alias of `string`, referenced by zero consumers. |
| 9 | `PartAuthor` | interface | UI: Conversations.tsx, SessionView.tsx | KEEP | Real author shape both adapters and pages construct; moves to core-ui. |
| 10 | `ReviewTarget` | interface | none outside package | DELETE | Internal-only; inline the `{betId, reviewId}` shape into the Part union. Note `betId` is always `""` at the only construction site (part.ts:377) — half the shape is already hollow. |
| 11 | `FoldDescriptor` | interface | DEAD | DELETE | Zero references anywhere — not even inside its own package. Pure corpse. |
| 12 | `Part` | type | UI: PartList, SessionView, all parts/* renderers | KEEP | The core vocabulary of the conversation surface; moves to core-ui. |
| 13 | `EmbedKind` | type | DEAD | DELETE | Zero references anywhere outside its own derivation line. |
| 14 | `Embed` | type | UI: embeds.tsx, ProsePart, adapters | SIMPLIFY | Survives minus the `session-reference` variant no production code ever constructs (stories/tests only); renderer branch embeds.tsx:66 dies with it; moves to core-ui. |
| 15 | `OpenTarget` | type | UI: open-handler.ts, Conversations, SessionView, ToolPart | KEEP | The real routing seam the navigate hook resolves; moves to core-ui beside open-handler.ts. |
| 16 | `OpenHandler` | type | UI: 8 production files | KEEP | The single open-hook signature every part renderer takes; moves to core-ui. |
| 17 | `PartGroup` | interface | UI: PartList, SessionView | KEEP | Return shape of groupParts; moves with it. |
| 18 | `ToolRunBlock` | type | UI: SessionView only | SIMPLIFY | Single consumer; `failedCount` is production-dead (statuses always neutral) — drop it and inline the type with aggregateToolRun into SessionView. |
| 19 | `PART_KINDS` | const | TEST-ONLY externally; internal type derivation | DELETE | No runtime production reader; inline the union literals. |
| 20 | `TOOL_KINDS` | const | TEST-ONLY externally; internal `normalizeToolKind` membership check | DELETE | An 11-member closed family for a field production never sends; contains duplicate alias pairs its own "normalizer" doesn't normalize; `sub-agent` entry gates a feature with no producer. |
| 21 | `EMBED_KINDS` | const | TEST-ONLY | DELETE | Only readers are the package's own tests asserting the const equals itself. |

## Holes this leaves
- **Session view gets honest, not worse.** After the SIMPLIFY cuts, SessionView renders
  exactly what it renders in production today: generic neutral tool rows. The rich stream
  (reasoning spans, streaming prose, statuses, diffs, sub-agent nesting) was only ever
  visible in Storybook. When a real emitter lands in `provisioner.ts`/the buffer, the
  branches must be rebuilt against real events — with `ReasoningPart.tsx` and the
  ToolPart status/diff/opensSession affordances (core-ui destroyer's turf) revived with them.
- **W1 lint boundary** (renderer must not import `Message`/harness types) must be re-scoped
  from `@hyperidle/conversation-parts` to a core-ui directory glob, or the source-agnostic
  guarantee silently evaporates. One lint-config edit; do it in the same PR as the move.
- **Two stories and a handful of unit tests** (`AM1-part.test.ts` session-reference cases,
  SessionView/ToolPart/ReasoningPart rich-stream stories, parts of `AM3-session-view.test.tsx`)
  die with the fiction they fabricate. Correct per brief: dead code plus tests that should
  die with it.
- `derivePartsFromMessages`, `groupParts`, `Part`/`Embed`/`OpenTarget`/`OpenHandler` survive
  unchanged in behavior — the conversation surface itself loses nothing.


---

# credential-access — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `layers/core-api/credentials`. One place absorbs all three.**

The credentials destroyer was too cautious; do not compound it. Said plainly: the `credentials`
service is the single home for everything in this package — the cipher, the `CredentialResolver`
port, and `resolveModel`. Here is why each of the three belongs there and nowhere else:

- **The cipher** (`encryptCredentialValue`/`decryptCredentialValue`): its root of trust IS the
  credentials story — a key derived from `HYPERIDLE_API_KEY`/`HYPERIDLE_CREDENTIAL_KEY`, the same
  secret `credentials` already owns operationally. The only consumer outside core-api is the
  `connections` surface (`agent-orchestration/src/routes/connections.ts:271,401` and
  `connections/src/service-connection-resolver.ts:52`), which the connections destroyer already
  flagged as "shares a cipher without duplicating it." The resolution is not a shared package — it
  is injection: the composition roots (`desktop/create-server.ts`, `remote-server/create-server.ts`)
  already compose both layers and already thread a `CredentialResolver` value from credentials-land
  into the server handle. Thread `{ encrypt, decrypt }` the same way. Two closures over one wire
  that already exists.
- **The port** (`CredentialResolver`): both production implementations (`DbCredentialResolver`, and
  eval's dev-only `EnvCredentialResolver`) — the real one lives in `@hyperidle/credentials`, which
  ALREADY re-exports this interface "for convenience." A package whose type is re-exported by the
  service that implements it is a laundering layer, and the AU31 lore on `remote-server` admits it
  outright: the framework package exists so an Application can name the type "never
  `@hyperidle/credentials` (a Service) directly" — while the runtime value on that very handle IS a
  `DbCredentialResolver` from that service. That is a governance spelling rule, not architecture.
  Change the declared reach; delete the laundering. The stale lore claiming harness-registry's
  `cli-harness-adapter` consumes this port is false today — `rg` finds zero references to
  `CredentialResolver` anywhere in `layers/agent-execution/harness-registry/src`.
- **`resolveModel`**: exactly ONE production caller — `layers/core-api/src/boot.ts` (the
  composition root building the dispatch capability). Its whole job is "credential + config →
  provider/model/apiKey", and its one dependency is the resolver whose implementation lives in
  `credentials`. It sits next to `DbCredentialResolver` or it sits in the wrong place. (tools/eval
  also imports it — dev world, follows the move.)

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api` root (app.ts, boot.ts, service-bootstrap.ts, routes/credentials.ts) | cipher pair, `resolveModel`, `CredentialResolver` type | Moves to importing `@hyperidle/credentials` — an edge boot.ts already has (`DbCredentialResolver`, `readCredentials`, `writeCredential`) |
| `layers/core-api/credentials` | `decryptCredentialValue`, `CredentialResolver` type | It becomes the owner — imports vanish |
| `layers/agent-orchestration` (routes/connections.ts, connections service) | cipher pair / decrypt | Receives `{ encrypt, decrypt }` injected from the composition roots — same wire the resolver already rides |
| `applications/desktop`, `applications/remote-server` | `type CredentialResolver` only | Type comes from `@hyperidle/credentials`; the type-only Service import is exactly what the runtime value already is |
| `layers/core-ui/__scripts__`, `tools/eval` | encrypt / `resolveModel` / type | Dev world — free to import the Service directly |

## If written today, from scratch
`@hyperidle/credentials` exports: the cipher pair, `CredentialResolver` (declared once, not
re-exported from anywhere), `DbCredentialResolver`, `resolveModel`. `connections` holds two injected
function values. No framework package.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 1 |
| MERGE | 0 |
| SIMPLIFY | 0 |
| KEEP | 4 |
Surface: 5 exports → 4 (20% export cut; 100% package cut)

## Feature-level kills
- **The package itself and the type-laundering pattern it anchors**: the "Application must not name
  a Service type" spelling that forced this package into existence dies with it. One declared-reach
  row in governance changes; four packages stop depending on a 5-export shim.
- **`credentials`' convenience re-export of `CredentialResolver`**: becomes the single declaration
  instead of a re-export — the brief's re-export garbage category, resolved by the move itself.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `encryptCredentialValue` | function | UI:`POST /api/credentials` + UI:connections store route (`connections.ts:271`) | KEEP | Real secrets at rest (AES-256-GCM over HKDF of the root key) for two live doors. Moves into `credentials`; connections gets it injected. |
| 2 | `decryptCredentialValue` | function | UI:credentials read + `DbCredentialResolver` + connections resolver (`service-connection-resolver.ts:52`) | KEEP | The read half of the same cipher. Moves with it. |
| 3 | `resolveModel` | function | BOOTSTRAP — sole production caller `core-api/src/boot.ts` (builds the dispatch drain's model capability) | KEEP | Load-bearing for every LLM call the server makes; one caller, one owner — moves next to the resolver implementation in `credentials`. |
| 4 | `UnsupportedAgentProviderError` | class | TEST-ONLY (`AH2-resolve-agent-model.integration.test.ts:131` is the only reference; no production catch or `instanceof` anywhere) | DELETE | An error subclass nobody catches is a plain `Error` with a costume. Throw `Error` with the same message; retag the test to assert the message. |
| 5 | `CredentialResolver` | interface | BOOTSTRAP — implemented in `credentials`, threaded by both app composition roots and core-api boot | KEEP | A real port with two ends — but both ends' home is `credentials`; the separate package existed only to launder the Service name out of Application imports. Declare it once, in `credentials`. |

## Holes this leaves
- `connections` gains two injected function parameters (encrypt, decrypt) in its route deps and
  resolver constructor — the AU20 Am4 "no secret param" ergonomics survive because the closures
  still own the key. Cost: two wiring lines per composition root.
- Governance: one framework-surfaces/declared-reach entry deleted, and applications' type-only
  import of `@hyperidle/credentials` must be permitted. If the linter's model cannot express
  "composition roots may name Services," that model — not the code — is what needs the fix.
- The stale `@lore` in `resolve-model.ts` about `cli-harness-adapter` injecting this port must not
  be copied into the new home; it describes an edge that no longer exists.


---

# cron — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `layers/core-api/routine`**

Is this a cron-expression parser nobody needs? No — calendar routines are product-real:
`RoutineCreateDialog.tsx` creates `triggerType: "calendar"` routines from the UI, the
`create_routine` agent tool requires a cron expression, and the routine scheduler computes next-run
times from it. The parser earns its life. What does NOT earn its life is the package boundary, and
the reason is that two of the three consumers should not be doing cron work at all:

1. `routine-scheduler.ts` (core-api/routine) — the owner. Parses cron, computes `nextRunAt` on
   tick, reschedule, and run-completion. This is the concept's home.
2. `routines-routes.ts` (core-api root) — computes `nextRunAt` BEFORE inserting a routine
   (lines 144–159). Owner-derived state computed outside the owner.
3. `tool-definitions.ts` (agent-orchestration/tool-handlers) — the `create_routine` tool parses the
   cron, computes `nextRunAt` itself, then hands the finished value to
   `ports.coreApi.insertRoutine(...)` (lines 1316–1338). Same duplication, worse: the orchestration
   layer computing routine-domain state and pushing it through a port, when the founder's standing
   ruling is that orchestration is a blind executor and service ownership covers writes.

`nextRunAt` on create is computed in THREE places for one insert path. Move the computation behind
`insertRoutine` (the routine service computes it from `triggerType`/`triggerConfig` on insert, and
returns it), and consumers 2 and 3 drop their cron imports entirely — validation of the expression
happens where the row is written, throwing `INVALID_INPUT` back through the same port/route. At
that point the package has exactly one consumer, the routine service, and the cross-layer
justification for a framework package evaporates. The 8 in-process timer doors do not need a shared
cron library — 7 of them run plain `setInterval`; only the routine scheduler speaks cron, and it
should own its own parser.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/routine/src/routine-scheduler.ts` | `parseCron`, `nextCronMatch`, `computeNextRunAt` | Yes — it is the owner; code moves in |
| `layers/core-api/src/routes/routines-routes.ts` | `parseCron`, `nextCronMatch` | Should not need it — `insertRoutine`/update computes `nextRunAt` owner-side |
| `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` | `parseCron`, `nextCronMatch`, `CronFields` | Should not need it — the tool forwards `triggerConfig` raw; owner validates and computes |

## If written today, from scratch
`layers/core-api/routine/src/cron.ts` — a private module of the routine package: `parseCron` +
`nextCronMatch` (+ private `parseField`/`fieldMatches`), and `computeNextRunAt` folded into the
scheduler. Nothing exported outside `@hyperidle/routine`. No framework package.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 0 |
| MERGE | 1 |
| SIMPLIFY | 1 |
| KEEP | 2 |
Surface: 4 exports → 0 framework exports (100% package cut; 2 functions survive as routine-internal)

## Feature-level kills
- **Pre-insert `nextRunAt` computation at non-owner call sites** (routes + agent tool): dies. The
  routine service computes it on insert/update. What breaks: the `create_routine` tool currently
  returns `nextRunAt` in its result — the port/route returns the owner-computed value instead. One
  computation, one owner, same observable behavior.
- **AU20 Stage 2's own rationale** ("shared by dispatch, API validation, and tool handlers without
  service-layer back-edges") is dissolved by construction: after the move nobody but the service
  needs cron, so there is no back-edge to avoid.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `parseCron` | function | UI:`POST /api/routines` + AGENT:`create_routine` + SCHED:routine-scheduler | KEEP | Calendar routines are real product (UI dialog, agent tool, scheduler). Moves into `routine` as a private module; stops being a package export. |
| 2 | `nextCronMatch` | function | same three doors as `parseCron` | KEEP | The actual next-fire computation the scheduler needs. Moves into `routine` with `parseCron`. |
| 3 | `computeNextRunAt` | function | SCHED:routine-scheduler (sole caller, 3 sites) | MERGE | Routine-domain logic (`triggerType` heartbeat/continuous/calendar, `TriggerConfig` JSON) masquerading as "pure cron" — its input type IS a routine row. Fold into `routine-scheduler.ts`. |
| 4 | `CronFields` | interface | INTERNAL (return type of `parseCron`; only external annotation is `tool-definitions.ts:1316`, which dies with the tool's cron work) | SIMPLIFY | Becomes a non-exported type inside the routine package once the two non-owner consumers stop parsing cron. |

## Holes this leaves
- The `create_routine` tool and the routines route lose their local early-validation of the cron
  string; a bad expression is now rejected by the routine service at insert. Same error surface
  (`INVALID_INPUT`), one round-trip deeper for the tool. Acceptable — that is what owning a table
  means.
- `insertRoutine`'s port signature changes (stops accepting caller-supplied `nextRunAt`, returns
  it). One port touched, three duplicated computations deleted.


---

# db — destroyer verdict (framework)

## Where does this package go?

**Verdict: STAYS SHARED** — but it sheds 47% of its export surface, one whole file, two dead tables, one duplicate connection factory, and two npm dependencies.

This is the one framework package that genuinely earns shared existence. The founder's dissolve question — move each table's schema into its owning service, leaving `db` as just the connection — was tested against the actual tooling and the actual schema, not assumed:

1. **Codegen does NOT force centrality.** `drizzle-kit` accepts `schema?: string | string[]` with glob support (verified in `node_modules/drizzle-kit/index.d.mts:119`; the current `framework/db/drizzle.config.ts` points at the single `./src/schema.ts` by choice, not necessity). So "the migration tooling requires a central barrel" is false at the generator level.
2. **The FK graph DOES force centrality.** `framework/db/src/schema.ts` contains **64 cross-table `references()`** — nearly every table FKs into `users`, `teams`, `sessions`, `tasks`, `threads`, which are owned by five different services. Per-service schema fragments must import each other's `pgTable` objects to declare those FKs → service→service import edges, which the zero-exception ownership ACL forbids. The alternative — dropping `references()` — trades package tidiness for losing DB-level referential integrity. Bad trade.
3. **The connection needs the merged schema anyway.** `drizzle(client, { schema })` and `HyperIdleDb = PgDatabase<PgQueryResultHKT, typeof schema>` (used in **137 production files**) both require the merged schema object/type. Split the fragments and a central barrel that imports all of them reappears immediately under another name.
4. **The migration journal is one linear sequence** (`framework/db/drizzle/`, 57 files, one `_journal.json`) shared by three appliers: desktop bundle (`applications/desktop/src/migrate.ts`), setup CLI, and the cloud runner (`migrate-pg.ts`). Central regardless of where table defs live.
5. **The dissolve buys zero enforcement.** Table ACL is already lint-enforced per consumer (`tools/governance/table-owners.json` — all 44 tables owned, all rules at error since AU30). Moving schema into services would add package-boundary enforcement the lint already provides.

Also checked: **zero** production `db.query.*` relational-API usage — every caller uses `select().from(table)` — so the typed-schema coupling is shallower than it looks, but the FK graph and the connection type still decide it.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/db"` → ~60 production files across every layer. Grouped:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `applications/desktop` | `createPgliteDb`, `createPostgresDb`, `DbHandle`, `HyperIdleDb`, `applyMigrations`, `isDowngrade` | No — one of two apps |
| `applications/remote-server` | `createPgliteDb`, `createPostgresDb`, `DbHandle`, `HyperIdleDb` | No — the other app |
| ~14 `layers/core-api/*` services | `HyperIdleDb`, `WriteExecutor`, each its owned tables + row types | No — each owns a slice, none owns the substrate |
| ~7 `layers/agent-orchestration/*` services | same pattern | No |
| `framework/{factory-defaults, harness-protocol, http-middleware, tool-protocol, work-intent-port}` | row types (`Team`, `User`, `AgentRunConfigRow`, …) | No — type consumers |
| `tools/setup`, `tools/eval` | connection factories, `applyMigrations`, tables for seeding | No — dev world |

Genuinely 2+ independent consumers for every surviving surface class. STAYS SHARED is earned, not defaulted.

## If written today, from scratch

- `connection.ts`: `HyperIdleDb`, `DbHandle`, `createPgliteDb`, `createPostgresDb` (one Postgres factory, not two), pool-size helpers module-private.
- `migrate.ts`: `applyMigrations`, `isDowngrade`, `MigrationResult`.
- `pg-ssl.ts`: unchanged, internal.
- `schema.ts`: 42 tables (not 44), row-type aliases **only where a consumer imports one** — 41 of the current 87, not a reflexive `Row`/`New*` pair per table.
- `write-executor.ts`: `WriteExecutor`.
- **No `zod-schemas.ts` at all.** No `drizzle-zod`, no `zod` dependency.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 79 |
| MERGE | 1 |
| SIMPLIFY | 3 |
| KEEP | 94 |

Surface: 177 exports → 94 exports (**47% cut**)

## Feature-level kills

1. **`triggerResolutionHistory` — a table with no writer.** Zero `insert` anywhere in the repo (prod, tools, tests — confirmed by `rg -a` on both camelCase and `trigger_resolution_history`). The only production touch is `session-requests/src/service.ts:571`, an UPDATE that has matched zero rows since the insert path was removed; no SELECT exists. Both row types have zero references. DELETE: table, the no-op UPDATE, both types, `table-owners.json` row, plus a drop-table migration (precedent: `0056_drop_user_skills.sql`). Hole: none — the feature already doesn't exist.
2. **`filesystemCaptures` — write-only audit trail.** One production INSERT (`filesystem-mounting/src/mounter-registry.ts:339`), zero production reads; only `capture-provenance.integration.test.ts` reads it back. Capture *bundles* (the actual data) live outside this table — the row is provenance nobody surfaces. Classic audit-trail-nobody-reads. DELETE: table, insert, provenance test, both row types, drop migration. Hole: if a future UI wants a capture history list, rebuild the table then — the git bundles are unaffected.
3. **`zod-schemas.ts` — an entire generated file with zero importers.** The `./zod-schemas` subpath export has no importer in any world (only its own tests and a `zodModule` pointer in `tools/governance/architecture.json`). The premise — drizzle-zod schemas validating API edges — never materialized: routes hand-roll their wire schemas (`layers/core-api/src/schemas/bet.schema.ts` builds from `type Bet`, not from `selectBetSchema`). DELETE: all 28 consts, the file, the subpath export, its two test files, the governance `zodModule` config plus the crossing-detector code that reads it, and the `drizzle-zod` + `zod` dependencies of this package. Hole: none.
4. **`createPgDb` — the second way to open Postgres.** Differs from `createPostgresDb` only by exposing `.poolSize` "for health checks, tests" — zero consumers read `.poolSize` (confirmed repo-wide). Only callers are `tools/setup/{bootstrap-pg,seed-pg-cli}.ts`. MERGE: point both at `createPostgresDb`; delete `createPgDb`, `PgDbOptions`, `PgDbHandle`, `resolvePgPoolSize`. (`PG_POOL_SIZE` env handling survives inside `createPostgresDb` — `docker-compose.yml` and `docs/deployment/self-hosting.md` really use the variable.)
5. **46 row-type aliases generated for uniformity.** Every table got a `Row`/`New*` pair reflexively; 46 of them have zero importers in any world. Pure `$inferSelect`/`$inferInsert` one-liners — any future consumer recreates one in ten seconds.

Non-export hygiene noticed in passing: `framework/db/drizzle-sqlite-archive/` (388K of dead SQLite migrations, referenced only by audit prose) should go with this pass; `createPostgresDb:111`'s `?? DEFAULT_PG_POOL_SIZE` arm is unreachable (`parsePgPoolSize` never returns undefined).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `parsePgPoolSize` | INTERNAL | SIMPLIFY | Only called inside connection.ts; unexport, module-private. |
| 2 | `resolvePgPoolSize` | INTERNAL (createPgDb only) | DELETE | Sole caller is `createPgDb`, which merges away. |
| 3 | `createPgliteDb` | BOOTSTRAP (desktop, remote-server, setup, eval) | KEEP | The laptop-profile DB — core to the product's local-first shape. |
| 4 | `createPostgresDb` | BOOTSTRAP (desktop, remote-server) | KEEP | The cloud-profile DB; becomes the only Postgres factory. |
| 5 | `createPgDb` | TOOLS-only (bootstrap-pg, seed-pg-cli) | MERGE | Duplicate of #4; its one differentiator (`.poolSize`) has zero readers. Fold callers onto `createPostgresDb`. |
| 6 | `applyMigrations` | BOOTSTRAP (desktop migrate, setup-cli, eval runner) | KEEP | The single shared migration path — the reason this package exists. |
| 7 | `isDowngrade` | BOOTSTRAP (desktop only) | KEEP | Prevents an older desktop build corrupting a newer data dir; shares `countAppliedMigrations` with #6 — moving it to desktop duplicates that. |
| 8 | `sanitizePostgresUrl` | INTERNAL (connection.ts, migrate-pg.ts) | KEEP | Real deploy-time fix (postgres-js forwards `sslrootcert` as a bogus GUC); not in the public barrel. |
| 9 | `resolvePostgresSsl` | INTERNAL (connection.ts, migrate-pg.ts) | KEEP | Implements sslmode semantics postgres-js lacks; earned from a real cluster deploy failure; not in the public barrel. |

## Types / DI ports

Evidence: per-symbol import counts across production (shipping roots, dev files excluded, `framework/db` excluded), tools, and dev/test worlds. "0 imports anywhere" was confirmed with `rg -a` word-boundary sweeps including the `schema.*` namespace path (zero namespace-based type access exists repo-wide).

| # | Declaration | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `HyperIdleDb` | 137 production files | KEEP | The DB type of the entire system. |
| 2 | `DbHandle` | BOOTSTRAP (desktop, remote-server) | KEEP | Lifecycle handle both apps hold. |
| 3 | `PgDbOptions` | DEAD outside createPgDb | DELETE | Dies with `createPgDb`. |
| 4 | `PgDbHandle` | DEAD outside createPgDb | DELETE | Dies with `createPgDb`; `.poolSize` has zero readers. |
| 5 | `MigrationResult` | BOOTSTRAP (return type of applyMigrations) | KEEP | Required explicit return type of a kept export. |
| 6 | `PostgresSslOption` | INTERNAL (pg-ssl.ts) | KEEP | Internal, not in barrel. |
| 7 | `KnowledgeAppProjectionRow` | DEAD | DELETE | Zero imports anywhere. |
| 8 | `NewKnowledgeAppProjectionRow` | DEAD | DELETE | Zero imports anywhere. |
| 9 | `TaskPlanningSignalRow` | DEAD | DELETE | Zero imports anywhere. |
| 10 | `NewTaskPlanningSignalRow` | DEAD | DELETE | Zero imports anywhere. |
| 11 | `FilesystemRow` | UI:/api/filesystems via filesystems svc | KEEP | Imported by 2 production files. |
| 12 | `NewFilesystem` | same | KEEP | Imported by filesystem-registry. |
| 13 | `FilesystemInjectionRow` | DEAD | DELETE | Zero imports anywhere. |
| 14 | `NewFilesystemInjection` | UI:/api/filesystems via filesystems svc | KEEP | Imported by filesystem-registry. |
| 15 | `FilesystemCaptureRow` | TEST-ONLY | DELETE | Dies with the `filesystemCaptures` table. |
| 16 | `NewFilesystemCaptureRow` | DEAD | DELETE | Dies with the `filesystemCaptures` table. |
| 17 | `Team` | UI:/api/teams via org svc + 5 more | KEEP | 6 importing production files. |
| 18 | `NewTeam` | DEAD | DELETE | Zero imports; inserts use literal objects. |
| 19 | `User` | UI:/api/users via users svc + 16 more | KEEP | 17 importing production files. |
| 20 | `NewUser` | UI:/api/users via users svc | KEEP | 3 importing production files. |
| 21 | `AgentRunConfigRow` | DEAD (1 dev ref) | DELETE | Zero production imports. |
| 22 | `NewAgentRunConfigRow` | UI:/api/agents via agent-run-config svc | KEEP | Imported by agent-run-config-store. |
| 23 | `TeamRunConfigDefaultsRow` | DEAD | DELETE | Zero imports anywhere. |
| 24 | `NewTeamRunConfigDefaultsRow` | DEAD | DELETE | Zero imports anywhere. |
| 25 | `TeamMember` | UI:/api/teams via org svc | KEEP | 4 importing production files. |
| 26 | `NewTeamMember` | DEAD | DELETE | Zero imports anywhere. |
| 27 | `Bet` | UI:/api/bets via work svc + 6 more | KEEP | 7 importing production files. |
| 28 | `NewBet` | UI:/api/bets via work svc | KEEP | 2 importing production files. |
| 29 | `Task` | UI:/api/tasks via work svc + 3 more | KEEP | 4 importing production files. |
| 30 | `NewTask` | UI:/api/tasks via work svc | KEEP | 3 importing production files. |
| 31 | `Session` | UI:/api/sessions via run-orchestration | KEEP | 2 importing production files. |
| 32 | `NewSession` | DEAD | DELETE | Zero imports anywhere. |
| 33 | `AgentSessionRequest` | AGENT: session-requests queue | KEEP | 5 importing production files. |
| 34 | `NewAgentSessionRequest` | DEAD | DELETE | Zero imports anywhere. |
| 35 | `AgentWorkIntent` | AGENT: intent queue via session-requests | KEEP | 2 importing production files. |
| 36 | `NewAgentWorkIntent` | DEAD | DELETE | Zero imports anywhere; already barrel-internal. |
| 37 | `ExplicitSessionStart` | AGENT: explicit-start pair | KEEP | 3 importing production files. |
| 38 | `TriggerResolutionHistoryRow` | DEAD | DELETE | Dies with the dead table. |
| 39 | `NewTriggerResolutionHistoryRow` | DEAD | DELETE | Dies with the dead table. |
| 40 | `Routine` | UI:/api/routines + SCHED:routine-scheduler | KEEP | 3 importing production files. |
| 41 | `NewRoutine` | same | KEEP | Imported by routine svc. |
| 42 | `RoutineRun` | DEAD | DELETE | Zero imports; prod matches are other symbols. |
| 43 | `NewRoutineRun` | SCHED:routine-scheduler | KEEP | Imported by routine svc. |
| 44 | `Thread` | UI:/api/threads via conversation svc | KEEP | 9 importing production files. |
| 45 | `NewThread` | same | KEEP | 4 importing production files. |
| 46 | `Message` | UI:/api/threads via conversation svc | KEEP | 21 importing production files. |
| 47 | `NewMessage` | same | KEEP | Imported by conversation-store. |
| 48 | `Item` | UI:/api/items via work svc | KEEP | 5 importing production files. |
| 49 | `NewItem` | same | KEEP | 5 importing production files. |
| 50 | `OrgEdge` | DEAD | DELETE | Zero imports; org-routing selects columns, never the type. |
| 51 | `NewOrgEdge` | DEAD (1 dev ref) | DELETE | Zero production imports. |
| 52 | `KnowledgeItem` | UI:/api/knowledge via knowledge svc | KEEP | 4 importing production files. |
| 53 | `NewKnowledgeItem` | DEAD | DELETE | Zero imports anywhere. |
| 54 | `KnowledgeEditLogEntry` | DEAD | DELETE | Zero imports; callers use `$inferInsert` inline. |
| 55 | `NewKnowledgeEditLogEntry` | DEAD | DELETE | Zero imports anywhere. |
| 56 | `KnowledgeAccessLogEntry` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 57 | `NewKnowledgeAccessLogEntry` | DEAD | DELETE | Zero imports anywhere. |
| 58 | `KnowledgeConflict` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 59 | `NewKnowledgeConflict` | DEAD | DELETE | Zero imports anywhere. |
| 60 | `NotificationQueueRow` | EVENT: notification dispatch | KEEP | Imported by notifications svc. |
| 61 | `NewNotificationQueueRow` | same | KEEP | 3 importing production files. |
| 62 | `ArtifactRow` | UI:/api/artifacts via work svc | KEEP | Imported by artifact-store. |
| 63 | `NewArtifactRow` | DEAD | DELETE | Zero imports anywhere. |
| 64 | `PropagationLogRow` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 65 | `NewPropagationLogRow` | EVENT: lifecycle propagation via policy svc | KEEP | Imported by lifecycle-propagation. |
| 66 | `ServerCredential` | UI:/api/credentials via credentials svc | KEEP | 3 importing production files. |
| 67 | `NewServerCredential` | DEAD | DELETE | Zero imports anywhere. |
| 68 | `ServerConfigRow` | DEAD | DELETE | Zero imports; settings svc selects columns. |
| 69 | `NewServerConfigRow` | DEAD | DELETE | Zero imports anywhere. |
| 70 | `PluginRow` | UI:/api/settings via settings svc | KEEP | Imported by plugin-configuration. |
| 71 | `NewPluginRow` | DEAD | DELETE | Zero imports anywhere. |
| 72 | `PluginConfigurationDefaultRow` | same as 70 | KEEP | Imported by plugin-configuration. |
| 73 | `NewPluginConfigurationDefaultRow` | DEAD | DELETE | Zero imports anywhere. |
| 74 | `ConfigurationOverrideRow` | same as 70 | KEEP | Imported by plugin-configuration. |
| 75 | `NewConfigurationOverrideRow` | DEAD | DELETE | Zero imports anywhere. |
| 76 | `HintProgressRow` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 77 | `NewHintProgressRow` | DEAD | DELETE | Zero imports anywhere. |
| 78 | `LoginSession` | UI:/api/auth via users svc | KEEP | Imported by login-session. |
| 79 | `NewLoginSession` | DEAD | DELETE | Zero imports anywhere. |
| 80 | `InviteCode` | UI:/api/auth via users svc | KEEP | Imported by invite-code. |
| 81 | `NewInviteCode` | DEAD | DELETE | Zero imports anywhere. |
| 82 | `ProposedCall` | AGENT: AL7 review flow via review svc | KEEP | Imported by proposed-call-workflow. |
| 83 | `NewProposedCall` | DEAD | DELETE | Zero imports anywhere. |
| 84 | `TailoredGrant` | same as 82 | KEEP | Imported by proposed-call-workflow. |
| 85 | `NewTailoredGrant` | DEAD | DELETE | Zero imports anywhere. |
| 86 | `OperationOutcome` | same as 82 | KEEP | Imported by proposed-call-workflow. |
| 87 | `NewOperationOutcome` | DEAD | DELETE | Zero imports anywhere. |
| 88 | `ServiceConnectionRow` | UI:/api/connections via connections svc | KEEP | 4 importing production files. |
| 89 | `NewServiceConnectionRow` | same | KEEP | Imported by service-connection-store. |
| 90 | `TaskDispatchAttempt` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 91 | `NewTaskDispatchAttempt` | DEAD | DELETE | Zero imports anywhere. |
| 92 | `AgentLifecycleInboxRow` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 93 | `NewAgentLifecycleInboxRow` | DEAD | DELETE | Zero imports anywhere. |
| 94 | `WriteExecutor` | 37 production files | KEEP | The tx-join union type every write-owning service signs with. |

## Const / enum audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `DEFAULT_PG_POOL_SIZE` | const | INTERNAL | SIMPLIFY | Unexport; only external ref is a governance attack fixture (dev). |
| 2 | `PG_POOL_SIZE_ENV` | const | INTERNAL | SIMPLIFY | Unexport; env var itself stays (docker-compose + self-hosting docs use it). |
| 3 | `teams` | table | UI via org svc | KEEP | Owned (org), read+written. |
| 4 | `teamRunConfigDefaults` | table | UI via agent-run-config svc | KEEP | Owned, read+written by team-run-config-defaults-store. |
| 5 | `users` | table | UI via users svc | KEEP | Owned, the identity table. |
| 6 | `agentRunConfig` | table | UI via agent-run-config svc | KEEP | Owned, read+written. |
| 7 | `teamMembers` | table | UI via org svc | KEEP | Owned, read+written. |
| 8 | `bets` | table | UI via work svc | KEEP | Owned — a core primitive. |
| 9 | `tasks` | table | UI via work svc | KEEP | Owned — a core primitive. |
| 10 | `sessions` | table | UI+AGENT via run-orchestration | KEEP | Owned — a core primitive. |
| 11 | `agentSessionRequests` | table | AGENT via session-requests | KEEP | Owned, the durable agent queue. |
| 12 | `agentWorkIntents` | table | AGENT via session-requests | KEEP | Owned, intent queue read+written. |
| 13 | `explicitSessionStarts` | table | AGENT via session-requests | KEEP | Owned, inserted (service.ts:1159) and re-checked at resolution. |
| 14 | `taskDispatchAttempts` | table | AGENT via work svc | KEEP | Owned, read+written by dispatch-attempt store. |
| 15 | `agentLifecycleInbox` | table | EVENT via session-requests | KEEP | Owned, claim/project loop reads and writes it. |
| 16 | `triggerResolutionHistory` | table | DEAD | DELETE | No INSERT exists anywhere; sole UPDATE (service.ts:571) matches zero rows forever; no SELECT. Drop table + migration. |
| 17 | `routines` | table | UI+SCHED via routine svc | KEEP | Owned — a core primitive. |
| 18 | `routineRuns` | table | SCHED via routine svc | KEEP | Owned, read+written. |
| 19 | `threads` | table | UI via conversation svc | KEEP | Owned — a core primitive. |
| 20 | `messages` | table | UI via conversation svc | KEEP | Owned — a core primitive. |
| 21 | `items` | table | UI via work svc | KEEP | Owned, read+written. |
| 22 | `orgEdges` | table | UI via org svc | KEEP | Owned, org-routing reads by mechanism. |
| 23 | `knowledgeItems` | table | UI+AGENT via knowledge svc | KEEP | Owned — a core primitive. |
| 24 | `knowledgeEditLog` | table | EVENT via knowledge svc | KEEP | Written AND read (relevance-service:95, attention-scoring:310) — feeds scoring, not a vanity trail. |
| 25 | `knowledgeAccessLog` | table | EVENT via knowledge svc | KEEP | Written AND read (accessCount30d relevance signals) — functional. |
| 26 | `knowledgeConflicts` | table | UI via knowledge svc | KEEP | Owned, open-conflict checks read it. |
| 27 | `knowledgeAppProjection` | table | UI via knowledge svc | KEEP | Owned, 4+ production read sites. |
| 28 | `taskPlanningSignals` | table | AGENT via work svc | KEEP | Owned, riskTier read drives trust gating. |
| 29 | `notificationQueue` | table | EVENT via notifications svc | KEEP | Owned, single repository reads+writes. |
| 30 | `propagationLog` | table | EVENT via policy svc | KEEP | Written and read back (lifecycle-propagation:622) for dedupe — functional, with its own reaper. |
| 31 | `artifacts` | table | UI via work svc | KEEP | Owned — a core primitive. |
| 32 | `filesystems` | table | UI via filesystems svc | KEEP | Owned, read+written. |
| 33 | `filesystemInjections` | table | UI via filesystems svc | KEEP | Owned, read+written+deleted. |
| 34 | `filesystemCaptures` | table | write-only (mounter-registry:339); reads TEST-ONLY | DELETE | Audit trail no production code reads. Drop table + insert + provenance test + migration. |
| 35 | `serverCredentials` | table | UI via credentials svc | KEEP | Owned, store + resolver read+write. |
| 36 | `serverConfig` | table | UI via settings svc | KEEP | Owned, read+written. |
| 37 | `plugins` | table | UI via settings svc | KEEP | Owned, insert/update/join in plugin-configuration. |
| 38 | `pluginConfigurationDefaults` | table | UI via settings svc | KEEP | Owned, read+written. |
| 39 | `configurationOverrides` | table | UI via settings svc | KEEP | Owned, read+written+upserted. |
| 40 | `hintProgress` | table | UI:/api/hints via users svc | KEEP | Owned, read+written. (Whether the hints *feature* earns its life is the users-service destroyer's call, not a schema call.) |
| 41 | `loginSessions` | table | UI:/api/auth via users svc | KEEP | Owned — auth is load-bearing. |
| 42 | `inviteCodes` | table | UI:/api/auth via users svc | KEEP | Owned — the only door into a team. |
| 43 | `proposedCalls` | table | AGENT: AL7 review via review svc | KEEP | Owned, read+written by proposed-call-workflow. |
| 44 | `tailoredGrants` | table | same | KEEP | Owned, joined in grant resolution. |
| 45 | `operationOutcomes` | table | same | KEEP | Owned, read (workflow:121) and written. |
| 46 | `serviceConnections` | table | UI:/api/connections via connections svc | KEEP | Owned, store + resolver read+write. |
| 47–63 | `selectTeamSchema` … `selectArtifactSchema` (17 selects) | const | DEAD — subpath has zero importers | DELETE | One declaration family, one fate: nothing imports `@hyperidle/db/zod-schemas` in any world. Delete the file. |
| 64–74 | `insertTeamSchema` … `insertArtifactSchema` (11 inserts) | const | DEAD — same file | DELETE | Same family, same fate. Kills `drizzle-zod` + `zod` deps with it. |

## Holes this leaves

- **Trigger-resolution provenance is unrecoverable.** If anyone ever wants "which trigger caused this session", the table that was meant to answer it never had a writer — dropping it just makes the truth visible. Rebuilding means schema + a real insert path.
- **Filesystem capture history has no DB record.** Git bundles still exist on disk; the mapping row (which session produced which capture) is gone. A future "capture history" surface rebuilds the table then.
- **No generated API validation layer.** Deleting zod-schemas closes the door on "drizzle-zod validates the wire for free." That door was never walked through — routes hand-roll wire schemas today and would keep doing so.
- **Tools lose `.poolSize` introspection they never used.** `bootstrap-pg`/`seed-pg-cli` switch to `createPostgresDb` with identical behavior.
- **Deleted row types must be recreated on demand** — each is one `typeof table.$inferSelect` line; cost is seconds, and it re-earns the export with an actual consumer.
- The governance `zodModule` crossing-detector config and its detector code lose their subject — that detector code dies too, or governance lint fails on a dangling path. The remover must sweep `tools/governance/architecture.json` and `crossing-detectors.ts` in the same change.


---

# design-system — destroyer verdict (framework)

## Where does this package go?

**Verdict: DISSOLVE → `layers/core-ui`**

One real code consumer. Measured with `rg -a -l "@hyperidle/design-system" layers framework applications tools`:

- `layers/core-ui` — the only package that imports code from it. Every page, shell, and component.
- `framework/domain-model/src/team.ts` — a **comment only** (@lore explaining why it deliberately does NOT import the `Status` type). Not a consumer.
- `tools/eslint-plugin-design`, `tools/repo-gates` — **strings and paths only**: lint messages that mention the package name, `TARGET_DIRS` path prefixes, the typecheck-gate leaf pre-build list, census package sets. No rule imports a runtime symbol from it. The census tool even carries its **own copy** of `TYPOGRAPHY_ROLES`/`MOTION_PROFILES` rather than importing them.
- `applications/*` — zero imports. Web/desktop consume `core-ui`, never design-system directly.

A "framework" package with one consumer is a package boundary invented for tidiness. Move `framework/design-system/src/*` into `layers/core-ui/src/ds/` (components keep their `.stories.tsx` siblings — the require-stories-sibling rule already covers core-ui component dirs), move `tokens.css` with it, delete the package. Bonus kills that fall out for free: the design-system leaf pre-build special case in `tools/repo-gates/src/typecheck-gate.ts` (AF5 lore — existed only so core-ui tests could resolve dist types), the 30-line dual dependency/devDependency tiptap list in its `package.json`, and the 251-line barrel `index.ts`.

## Consumers (measured, not assumed)

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-ui` | Everything — components, hooks, status mapping, tokens.css | Yes. It is the only importer. It owns this. |
| `framework/domain-model` | Nothing (comment reference only) | n/a |
| `tools/eslint-plugin-design` | Nothing at runtime — path strings + message text | Yes — update `TARGET_DIRS` strings on move |
| `tools/repo-gates` | Nothing at runtime — path strings, own copies of profile lists | Yes — delete the ds leaf-build entry on move |

## If written today, from scratch

A `ds/` folder inside core-ui: ~45 rendered components with stories (Button, Input, Dialog+useDialogBehavior, Row/ItemList, PageHeader/PageScaffold, thread stack, block renderer, artifact renderer, status mapping, Skeleton/Empty/Error states). No package, no barrel, no tier taxonomy, no JS token mirrors, no renderer registries with one entry. Internal helpers stay module-private instead of being exported for tests.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 22 |
| MERGE | 2 |
| SIMPLIFY | 57 |
| KEEP | 170 |

Surface: 251 exports → package deleted (100% of the package boundary); 170 of 251 symbols survive as core-ui modules, 57 of those drop off the public surface (module-internal after the move), 22 symbols + 2 merges die outright. Public importable surface 251 → ~113 (55% cut).

## Feature-level kills

1. **`Toast` component** — zero renders anywhere. core-ui ships its own `shell/ToastRegion` with its own toast UI; this is the second way that lost. Dies with `ToastProps` and its story.
2. **`DialogPortalRoot`** — zero mounts in any layer or application. `AppShell` calls `ensureOverlayRoot()` directly; the component's own doc comment claiming "the app shell also calls this via DialogPortalRoot" is false. Dies with its story; fix the stale comment in `useDialogBehavior.ts:74`.
3. **`ArtifactEmbed`** — only render site is the dev demo route `/_dev/artifacts` (`layers/core-ui/src/pages/_dev/ArtifactDemo.tsx`, router.tsx:110). Production thread embeds use `Fold`+`ReferenceChip` (`parts/embeds.tsx`) and artifact surfaces use `ArtifactPreview`/`GalleryCard`/`StackItem` (`ArtifactSection.tsx`). A component whose only door is a demo page is a demo, not a feature. Dies with `ArtifactEmbedProps`, its story, and its `tokens.css` class.
4. **Diff-renderer registry (`diff/select-diff.tsx`)** — `getDiffRenderer(kind)` has zero callers; `ReviewCodeDiff.tsx` imports `CodeDeltaRenderer` directly. A registry with one entry and no lookups. Dies with `DiffRendererProps`/`DiffRendererComponent`.
5. **`token-profiles.ts` — the whole runtime module** — `TYPE_STYLE`, `TYPOGRAPHY_ROLES`, `AVATAR_INITIAL_STYLE`, `MOTION_PROFILES`, `MOTION_STYLE`, `BORDER_WIDTH_PROFILES`, `BORDER_WIDTH_STYLE` and their three types have **zero runtime consumers** — not one component in design-system or core-ui imports them (verified content-level: only the defining file matches). Components use the `type-*` / `--motion-*` CSS classes from `tokens.css`; the lint rules enforce via regex; the census tool has its own copy of the lists. This is a parallel JS mirror of the CSS tokens that nothing reads. Dies with its AZ16 test.
6. **The DS tier/source instrumentation taxonomy** — `dsProps(name, tier)` / `dsShellProps` stamp `data-ds-component`/`data-ds-tier`/`data-ds-source` for a "K4 inspector" that never shipped as product. Runtime readers: none. Actual readers: e2e selectors (dev), the require-ds-attribute lint rule, the census gate. core-ui already hand-writes bare `data-ds-component` literals in a dozen places (SessionView.tsx etc.), so the helper isn't even the single way. Keep the *name* attribute as the e2e selector convention; delete tier, source, `dsShellProps`, `DsTier`, `DsSource`, `DsShellAttrs`.
7. **Exported-for-test internals** — `computeSenderGrouping`, `clickableProps`, `filterSlashItems`, `SLASH_MENU_ITEMS`, `clampFrameHeight`, `escapeSrcdocAttribute`, `buildArtifactDocument`, 7 of the 8 status maps: each export exists only so a test can import it (several say so in their own @lore). Un-export all; tests exercise the public door instead.
8. **The block-payload "promotion"** — 10 payload components + `renderInline` were barrel-exported "so each is individually reviewable" (a process reason, not a product one). Production reaches them exclusively through `renderPayload`/`Block`. All become internal modules of the block renderer.

## Full method audit

Reach tags: `UI:<n files>` = imported by n core-ui production files (the only door into this package); `INTERNAL` = only other design-system modules; `DEV-ONLY` = only stories/tests/dev routes; `DEAD` = nothing. All DEAD/DEV-ONLY rows confirmed with `rg -a` across layers/framework/applications/tools.

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `ArtifactEmbed` | DEV-ONLY (/_dev/artifacts) | DELETE | Only door is the dev demo route; prod embeds use Fold+ReferenceChip. |
| 2 | `ArtifactFrame` | INTERNAL (compose-artifact-body) | SIMPLIFY | Sandboxed-iframe renderer for html artifacts — keep, un-export; only the artifact composer uses it. |
| 3 | `ArtifactGalleryCard` | UI:1 (ArtifactSection) | KEEP | Artifact gallery is a shipped surface. |
| 4 | `ArtifactKindBadge` | UI:1 (KnowledgeList) | KEEP | Rendered in knowledge list. |
| 5 | `ArtifactPreview` | UI:2 (ArtifactPermalink, ArtifactSection) | KEEP | The artifact rendering door. |
| 6 | `ArtifactPreviewSurface` | INTERNAL (4 artifact components) | SIMPLIFY | Shared internal surface; un-export. |
| 7 | `ArtifactStackItem` | UI:1 (ArtifactSection) | KEEP | Stack layout in artifact section. |
| 8 | `ArtifactTimestamp` | INTERNAL (4 artifact components) | SIMPLIFY | Internal date chip; un-export. |
| 9 | `Avatar` | UI:8 | KEEP | Foundation primitive, everywhere. |
| 10 | `AvatarGroup` | UI:2 | KEEP | Used in team/thread rows. |
| 11 | `BetCard` | UI:4 | KEEP | Bets are a core primitive. |
| 12 | `Block` | UI:10 | KEEP | Block is a core content primitive. |
| 13 | `BlockActionsPopover` | UI:2 | KEEP | Block actions door. |
| 14 | `BlockHandle` | UI:1 (KnowledgeBody) | KEEP | Block discussion handle. |
| 15 | `BodyEditor` | UI:6 | KEEP | The WYSIWYG editor — core authoring. |
| 16 | `Breadcrumb` | UI:11 | KEEP | Nav orientation, everywhere. |
| 17 | `Checkbox` | UI:1 (ReviewCodeDiff) | KEEP | Form primitive, custom CSS, in use. |
| 18 | `CommentRow` | UI:3 | KEEP | Conversation rendering core. |
| 19 | `Composer` | UI:5 | KEEP | Message input — core. |
| 20 | `Dialog` | UI:7 | KEEP | The overlay primitive. |
| 21 | `DialogPortalRoot` | DEAD | DELETE | Zero mounts anywhere; AppShell calls ensureOverlayRoot directly. Its doc comment lies. |
| 22 | `DiscardConfirmStrip` | INTERNAL (Dialog only) | MERGE | One consumer; fold into Dialog.tsx. |
| 23 | `EmptyState` | UI:24 | KEEP | Most-used state component. |
| 24 | `ErrorState` | UI:26 | KEEP | Most-used state component. |
| 25 | `Fold` | UI:4 | KEEP | Thread embed collapse device. |
| 26 | `ItemList` | UI:11 | KEEP | List container primitive. |
| 27 | `KeyValue` | UI:6 | KEEP | Detail-pane primitive. |
| 28 | `KnowledgeRow` | UI:5 | KEEP | Knowledge list row. |
| 29 | `KpiStat` | INTERNAL (compose-artifact-body) | SIMPLIFY | Only the data-artifact renderer uses it; un-export. |
| 30 | `LiveDot` | UI:3 | KEEP | Agent activity indicator. |
| 31 | `Menu` | UI:4 | KEEP | Popover menu primitive. |
| 32 | `NavItem` | UI:1 (Sidebar) | KEEP | The sidebar nav row. |
| 33 | `NotificationRow` | UI:2 | KEEP | Notification surface row. |
| 34 | `PageFrame` | INTERNAL (PageHeader, PageScaffold) | SIMPLIFY | Layout shim two siblings share; un-export. |
| 35 | `PageHeader` | UI:20 | KEEP | Canonical page title strip, lint-enforced. |
| 36 | `PageScaffold` | UI:19 | KEEP | Canonical scroll contract, lint-enforced. |
| 37 | `Progress` | UI:1 (WorkBet) | KEEP | Bet progress bar. |
| 38 | `ReferenceChip` | UI:5 | KEEP | Attachment/reference primitive. |
| 39 | `RichMessageCard` | UI:1 (Conversations) | KEEP | Blocking-message card in the core conversation surface. |
| 40 | `RoleCombobox` | UI:1 (AgentEditor) | KEEP | Agent role picker. |
| 41 | `Row` | UI:15 | KEEP | The list-row primitive. |
| 42 | `RowDot` | UI:3 | KEEP | Row status dot. |
| 43 | `ScopePicker` | UI:4 | KEEP | Knowledge scope control. |
| 44 | `SectionLabel` | UI:7 | KEEP | Canonical section heading. |
| 45 | `Select` | UI:15 | KEEP | Form primitive, everywhere. |
| 46 | `Skeleton` | UI:3 | KEEP | Loading primitive. |
| 47 | `SkeletonList` | UI:14 | KEEP | Loading primitive, everywhere. |
| 48 | `SkeletonCard` | UI:6 | KEEP | Loading primitive. |
| 49 | `Sparkline` | INTERNAL (compose-artifact-body) | SIMPLIFY | Only the data-artifact renderer uses it; un-export. |
| 50 | `SplitView` | UI:8 | KEEP | AV4 split-pane — shipped core layout. |
| 51 | `StatusChip` | UI:18 | KEEP | The status primitive. |
| 52 | `TabBar` | UI:1 (SessionActivityPanel) | KEEP | Session panel tabs. |
| 53 | `Tag` | UI:8 | KEEP | Tag primitive. |
| 54 | `TaskCard` | UI:3 | KEEP | Tasks are a core primitive. |
| 55 | `ThreadHostBanner` | INTERNAL (ThreadShell, ThreadRow) | SIMPLIFY | Only thread internals render it; un-export. |
| 56 | `ThreadRow` | UI:4 | KEEP | Conversation list row — core. |
| 57 | `computeSenderGrouping` | INTERNAL (ThreadShell) + TEST-ONLY export | SIMPLIFY | Un-export; the export exists for one core-ui test and forced the typecheck-gate leaf-build hack (AF5). |
| 58 | `ThreadShell` | UI:5 | KEEP | The thread surface — core. |
| 59 | `Toast` | DEAD | DELETE | Zero renders; core-ui's ToastRegion is the real toast system. Second way, no users. |
| 60 | `Toggle` | UI:4 | KEEP | Settings switch primitive. |
| 61 | `clampFrameHeight` | INTERNAL + TEST-ONLY export | SIMPLIFY | Same-module helper exported for tests; un-export. |
| 62 | `escapeSrcdocAttribute` | INTERNAL (same file) | SIMPLIFY | Same-file helper; drop the export keyword. |
| 63 | `buildArtifactDocument` | INTERNAL (same file) + TEST-ONLY export | SIMPLIFY | Only buildArtifactSrcdoc calls it; un-export. |
| 64 | `buildArtifactSrcdoc` | INTERNAL (ArtifactFrame) | KEEP | The CSP+sandbox srcdoc builder — isolation is the artifact security model. |
| 65 | `CodePayload` | INTERNAL (renderPayload) | SIMPLIFY | Reached only via renderPayload; un-export from barrel. |
| 66 | `DividerPayload` | INTERNAL (renderPayload) | SIMPLIFY | Same — un-export. |
| 67 | `headingIdentityMatches` | UI:3 (ArtifactPermalink, 2 review pages) | KEEP | Real dedup logic at three doors. |
| 68 | `HeadingPayload` | INTERNAL (renderPayload; the core-ui "hit" is a CSS comment) | SIMPLIFY | Un-export. |
| 69 | `HtmlPayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 70 | `ImagePayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 71 | `ListPayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 72 | `ParagraphPayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 73 | `QuotePayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 74 | `TablePayload` | INTERNAL (renderPayload) | SIMPLIFY | Un-export. |
| 75 | `UnknownPayload` | INTERNAL | KEEP | Already internal; the never-crash fallback. |
| 76 | `renderInline` | INTERNAL (payload modules) | SIMPLIFY | Un-export from barrel. |
| 77 | `renderPayload` | UI:1 (BlockRefEmbed) + INTERNAL (Block) | KEEP | The block-payload door. |
| 78 | `buildFullExtensions` | INTERNAL (useBodyEditor) | KEEP | Editor wiring, already internal. |
| 79 | `buildMiniExtensions` | INTERNAL (useBodyEditor) | KEEP | Mini editor variant wiring, already internal. |
| 80 | `FloatingToolbar` | INTERNAL (BodyEditor) | KEEP | Editor internal, already internal. |
| 81 | `filterSlashItems` | INTERNAL (same file) + TEST-ONLY export | SIMPLIFY | @lore admits it's exported for tests; un-export. |
| 82 | `buildSlashMenuExtension` | INTERNAL (extensions) | KEEP | Editor internal, already internal. |
| 83 | `useBodyEditor` | INTERNAL (BodyEditor) | KEEP | Editor internal, already internal. |
| 84 | `clickableProps` | INTERNAL (7 components) + TEST-ONLY export | SIMPLIFY | Un-export from barrel; its dedicated core-ui test dies with the export. |
| 85 | `CodeDeltaRenderer` | UI:1 (ReviewCodeDiff) | KEEP | The code diff renderer for reviews. |
| 86 | `getDiffRenderer` | DEAD | DELETE | Zero callers; ReviewCodeDiff imports CodeDeltaRenderer directly. One-entry registry. |
| 87 | `dsProps` | INTERNAL (50 files); attrs read by e2e/lint/census only | SIMPLIFY | Keep as `dsProps(name)` emitting only data-ds-component (e2e selector); delete tier+source theater. |
| 88 | `dsShellProps` | INTERNAL (ThreadShell only) | DELETE | One caller; core-ui shells hand-write the literal anyway. ThreadShell writes the attr inline. |
| 89 | `ArtifactUnrenderable` | INTERNAL (compose-artifact-body) | KEEP | Already internal; honest never-crash fallback for unknown kinds. |
| 90 | `composeArtifactBody` | INTERNAL (ArtifactPreviewSurface); zero external prod importers | SIMPLIFY | Barrel export nobody imports; un-export. |
| 91 | `taskStateToStatus` | UI:2 | KEEP | Domain→chip mapping at real doors. |
| 92 | `knowledgeStatusToStatus` | UI:2 | KEEP | Same. |
| 93 | `betStatusToStatus` | UI:2 | KEEP | Same. |
| 94 | `sessionOutcomeToStatus` | UI:1 | KEEP | Same. |
| 95 | `routineStateToStatus` | UI:2 | KEEP | Same. |
| 96 | `betOutcomeVerdictToStatus` | UI:1 | KEEP | Same. |
| 97 | `taskOutcomeVerdictToStatus` | UI:1 | KEEP | Same. |
| 98 | `agentOperationalStatusToStatus` | UI:2 | KEEP | Same. |
| 99 | `ensureOverlayRoot` | UI:1 (AppShell) + INTERNAL | KEEP | The real overlay-root mechanism (replaces DialogPortalRoot). |
| 100 | `useDialogBehavior` | UI:4 | KEEP | The dialog behavior contract, lint-enforced. |

## Types / DI ports

Verdicts follow the owning component unless noted. "un-export" = survives as module-internal type after the dissolve.

| Declaration | Verdict | Reason |
|---|---|---|
| `ArtifactEmbedProps` | DELETE | Dies with ArtifactEmbed. |
| `ArtifactFrameProps` | SIMPLIFY | Un-export with ArtifactFrame. |
| `ArtifactGalleryCardProps` | KEEP | Rides its component. |
| `ArtifactKindBadgeProps` | KEEP | Rides its component. |
| `ArtifactPreviewProps` | KEEP | Rides its component. |
| `ArtifactPreviewSurfaceProps` | SIMPLIFY | Un-export with its component. |
| `ArtifactStackItemProps` | KEEP | Rides its component. |
| `ArtifactTimestampProps` | SIMPLIFY | Un-export with its component. |
| `AvatarProps` | KEEP | Rides its component. |
| `AvatarGroupProps` | KEEP | Rides its component. |
| `BetCardLeadAvatar` | KEEP | Rides BetCard. |
| `BetCardAvatarGroup` | KEEP | Already internal. |
| `BetCardProps` | KEEP | Rides BetCard; 16 members is prop bloat but every one is rendered. |
| `BlockSlots` | KEEP | Rides Block. |
| `BlockProps` | KEEP | Rides Block. |
| `BlockAction` | KEEP | Rides BlockActionsPopover. |
| `BlockActionsPopoverProps` | KEEP | Rides its component. |
| `BlockHandleProps` | KEEP | Rides its component. |
| `BodyEditorProps` | KEEP | Rides its component. |
| `BreadcrumbSegment` | KEEP | Rides Breadcrumb. |
| `BreadcrumbProps` | KEEP | Rides Breadcrumb. |
| `ButtonProps` | KEEP | Rides Button. |
| `CheckboxProps` | KEEP | Rides Checkbox. |
| `CommentRowSender` | KEEP | Rides CommentRow. |
| `CommentRowRichSlots` | KEEP | Already internal. |
| `CommentRowProps` | KEEP | Rides CommentRow. |
| `ComposerSubmitInput` | KEEP | Rides Composer. |
| `ComposerProps` | KEEP | Rides Composer. |
| `DialogSize` | KEEP | Rides Dialog. |
| `DialogProps` | KEEP | Rides Dialog. |
| `DiscardConfirmStripProps` | MERGE | Folds into Dialog.tsx with its component. |
| `EmptyStateProps` | KEEP | Rides its component. |
| `ErrorStateProps` | KEEP | Rides its component. |
| `FoldProps` | KEEP | Rides Fold. |
| `InputProps` | KEEP | Rides Input. |
| `ItemListEmpty` | KEEP | Rides ItemList. |
| `ItemListError` | KEEP | Rides ItemList. |
| `ItemListProps` | KEEP | Rides ItemList. |
| `KeyValueProps` | KEEP | Rides KeyValue. |
| `KnowledgeRowSignals` | KEEP | Already internal. |
| `KnowledgeRowProps` | KEEP | Rides KnowledgeRow. |
| `KpiStatProps` | SIMPLIFY | Un-export with KpiStat. |
| `MenuItem` | KEEP | Rides Menu. |
| `MenuProps` | KEEP | Rides Menu. |
| `NavItemProps` | KEEP | Rides NavItem. |
| `NotificationRowProps` | KEEP | Rides its component. |
| `PageFrameProps` | SIMPLIFY | Un-export with PageFrame. |
| `PageHeaderProps` | KEEP | Rides PageHeader. |
| `PageScaffoldProps` | KEEP | Rides PageScaffold. |
| `ProgressProps` | KEEP | Rides Progress. |
| `ReferenceChipKind` | KEEP | Rides ReferenceChip. |
| `ReferenceChipMode` | KEEP | Rides ReferenceChip. |
| `ReferenceChipProps` | KEEP | Rides ReferenceChip. |
| `RichMessageCardSender` | KEEP | Rides RichMessageCard. |
| `RichMessageCardAction` | KEEP | Rides RichMessageCard. |
| `RichMessageCardState` | KEEP | Rides RichMessageCard. |
| `RichMessageCardResolved` | KEEP | Rides RichMessageCard. |
| `RichMessageCardProps` | KEEP | Rides RichMessageCard. |
| `RoleOption` | KEEP | Rides RoleCombobox. |
| `RoleComboboxProps` | KEEP | Rides RoleCombobox. |
| `ItemListContextValue` | SIMPLIFY | Internal Row↔ItemList contract; un-export with ItemListContext. |
| `RowCell` | KEEP | Rides Row. |
| `RowProps` | KEEP | Rides Row. |
| `RowTone` | KEEP | Rides RowDot. |
| `RowDotProps` | KEEP | Rides RowDot. |
| `ScopePickerOption` | KEEP | Rides ScopePicker. |
| `ScopePickerProps` | KEEP | Rides ScopePicker. |
| `SearchFieldProps` | KEEP | Rides SearchField. |
| `SectionLabelProps` | KEEP | Rides SectionLabel. |
| `SelectProps` | KEEP | Rides Select. |
| `SkeletonListProps` | KEEP | Rides Skeleton family. |
| `SkeletonProps` | KEEP | Rides Skeleton family. |
| `SkeletonCardProps` | KEEP | Rides Skeleton family. |
| `SparklineProps` | SIMPLIFY | Un-export with Sparkline. |
| `FoldMode` | KEEP | Rides SplitView (prod:8). |
| `SplitViewProps` | KEEP | Rides SplitView. |
| `Status` | KEEP | The chip status vocabulary, used across core-ui signatures. |
| `StatusChipProps` | KEEP | Rides StatusChip. |
| `TabBarProps` | KEEP | Rides TabBar. |
| `TagProps` | KEEP | Rides Tag. |
| `TaskCardProps` | KEEP | Rides TaskCard. |
| `ThreadHostBannerParticipant` | SIMPLIFY | Un-export with ThreadHostBanner. |
| `ThreadHostBannerProps` | SIMPLIFY | Un-export with ThreadHostBanner. |
| `ThreadAvatarItem` | KEEP | Already internal. |
| `ThreadRowProps` | KEEP | Rides ThreadRow. |
| `ThreadShellIdentity` | KEEP | Rides ThreadShell. |
| `ThreadShellAppendInput` | KEEP | Rides ThreadShell. |
| `ThreadShellProps` | KEEP | Rides ThreadShell. |
| `ToastProps` | DELETE | Dies with Toast. |
| `ToggleProps` | KEEP | Rides Toggle. |
| `CodePayloadProps` | SIMPLIFY | Un-export with its payload. |
| `HeadingPayloadProps` | SIMPLIFY | Un-export with its payload. |
| `AuthoredOutlineContext` | SIMPLIFY | No production importer outside the payload chain; un-export. |
| `HtmlPayloadProps` | SIMPLIFY | Un-export with its payload. |
| `ImagePayloadProps` | SIMPLIFY | Un-export with its payload. |
| `ListPayloadProps` | SIMPLIFY | Un-export with its payload. |
| `ParagraphPayloadProps` | SIMPLIFY | Un-export with its payload. |
| `QuotePayloadProps` | SIMPLIFY | Un-export with its payload. |
| `TablePayloadProps` | SIMPLIFY | Un-export with its payload. |
| `UnknownPayloadProps` | KEEP | Already internal. |
| `SlashMenuItem` | KEEP | Already internal. |
| `UseBodyEditorOptions` | KEEP | Already internal. |
| `CodeDelta` | KEEP | Rides CodeDeltaRenderer (review diff door). |
| `DiffLineRef` | KEEP | Rides CodeDeltaRenderer. |
| `CodeDeltaProps` | KEEP | Rides CodeDeltaRenderer. |
| `DiffRendererProps` | DELETE | Dies with getDiffRenderer. |
| `DiffRendererComponent` | DELETE | Dies with getDiffRenderer. |
| `DsTier` | DELETE | Tier taxonomy nothing reads at runtime. |
| `DsSource` | DELETE | Same. |
| `DsAttrs` | SIMPLIFY | Shrinks to `{ "data-ds-component": string }`. |
| `DsShellAttrs` | DELETE | Dies with dsShellProps. |
| `UnrenderableReason` | KEEP | Already internal. |
| `ArtifactUnrenderableProps` | KEEP | Already internal. |
| `TagKind` | KEEP | Rides Tag's public prop. |
| `TagKindMeta` | SIMPLIFY | Internal to tag-kinds; un-export. |
| `TypographyRole` | DELETE | Dies with token-profiles.ts — zero runtime consumers. |
| `MotionProfile` | DELETE | Same. |
| `BorderWidthProfile` | DELETE | Same. |
| `DialogLayer` | KEEP | Rides useDialogBehavior. |
| `UseDialogBehaviorOptions` | KEEP | Rides useDialogBehavior. |
| `UseDialogBehavior` | KEEP | Rides useDialogBehavior. |

## Const / enum audit

| Declaration | Reach | Verdict | Reason |
|---|---|---|---|
| `Button` | UI:43 | KEEP | Most-used primitive in the app. |
| `Input` | UI:20 | KEEP | Form primitive, everywhere. |
| `pageTitleClassName` | UI:1 (KnowledgeCreate editable title) | KEEP | Documented composition door. |
| `paneTitleClassName` | INTERNAL (PageHeader only) | SIMPLIFY | Symmetry export nobody imports; un-export. Same class string as pageTitleClassName — collapse to one const. |
| `ItemListContext` | INTERNAL (Row, ItemList) | SIMPLIFY | Internal contract; un-export. |
| `TONE_COLOR` | INTERNAL (same file) | SIMPLIFY | RowDot's private data; un-export. |
| `SearchField` | UI:3 | KEEP | Search primitive. |
| `ARTIFACT_FRAME_SANDBOX` | INTERNAL | KEEP | The artifact isolation policy — core security model. |
| `ARTIFACT_FRAME_CSP` | INTERNAL | KEEP | Same. |
| `ARTIFACT_SIZE_CHANGED_METHOD` | INTERNAL (build-srcdoc ↔ ArtifactFrame) | KEEP | Frame resize protocol constant. |
| `FRAME_INITIAL_HEIGHT` | INTERNAL | KEEP | Frame sizing. |
| `FRAME_MIN_HEIGHT` | INTERNAL | KEEP | Frame sizing. |
| `FRAME_MAX_HEIGHT` | INTERNAL | KEEP | Frame sizing. |
| `SLASH_MENU_ITEMS` | INTERNAL (same file) + TEST-ONLY export | SIMPLIFY | @lore admits exported for tests; un-export. |
| `TASK_STATE_MAP` | INTERNAL (its function) | SIMPLIFY | Un-export; the function is the door. |
| `KNOWLEDGE_STATUS_MAP` | INTERNAL | SIMPLIFY | Same. |
| `BET_STATUS_MAP` | INTERNAL | SIMPLIFY | Same. |
| `SESSION_OUTCOME_MAP` | UI:1 (AgentProfile) | KEEP | AgentProfile iterates the outcome vocabulary. |
| `ROUTINE_STATE_MAP` | INTERNAL | SIMPLIFY | Un-export; the function is the door. |
| `BET_OUTCOME_VERDICT_STATUS` | INTERNAL | SIMPLIFY | Same. |
| `TASK_OUTCOME_VERDICT_STATUS` | INTERNAL | SIMPLIFY | Same. |
| `AGENT_OPERATIONAL_STATUS_MAP` | INTERNAL | SIMPLIFY | Same. |
| `TAG_KIND_ICONS` | INTERNAL (Tag.tsx only) | SIMPLIFY | Un-export; only Tag reads it (typecheck-gate lore about web importing it is stale — tests only). |
| `TYPOGRAPHY_ROLES` | DEAD (own file + own test only) | DELETE | Whole token-profiles.ts is a JS mirror of tokens.css nothing imports; census has its own copy. |
| `TYPE_STYLE` | DEAD | DELETE | Zero consumers; components use `type-*` CSS classes. |
| `AVATAR_INITIAL_STYLE` | DEAD | DELETE | Zero consumers anywhere — Avatar doesn't even use it. |
| `MOTION_PROFILES` | DEAD | DELETE | Lint enforces motion via regex, not this const. |
| `MOTION_STYLE` | DEAD | DELETE | Zero consumers. |
| `BORDER_WIDTH_PROFILES` | DEAD | DELETE | Zero consumers. |
| `BORDER_WIDTH_STYLE` | DEAD | DELETE | Zero consumers. |

## Holes this leaves

1. **Package deletion mechanics** — `tools/repo-gates/src/typecheck-gate.ts` drops design-system from its leaf pre-build list (a simplification, not a hole); `tools/eslint-plugin-design` `TARGET_DIRS`/path guards (require-stories-sibling, no-handrolled-*, motion-profile-only's RoleCombobox carve-out) respell to the new core-ui path; `design-css-gate`/`design-profile-census` package sets shrink to core-ui. All string edits.
2. **tokens.css** — the `./tokens.css` package export moves into core-ui and `layers/core-ui/src/index.css` imports it relatively. AZ7 lore warns Tailwind @source globs silently die — re-verify painted output after the move.
3. **Deleting the tier/source attrs** — the `require-ds-attribute` lint rule and `design-profile-census` must drop tier/source checks (name-only). E2E selectors on `data-ds-component` keep working; any spec asserting `data-ds-tier`/`data-ds-source` (accessibility/census-flavored specs) needs re-anchoring.
4. **ArtifactEmbed deletion** — the `/_dev/artifacts` demo route loses its embed row; `__e2e__/artifact-embed-no-chrome.spec.ts` must re-target the real embed path (Fold+ReferenceChip in threads) or die with the demo.
5. **Un-exporting test-only symbols** — the dedicated tests for `computeSenderGrouping`, `clickableProps`, `filterSlashItems`, status maps, and the AZ16 token-profiles test either move into the owning module's test file (same-package relative imports are fine post-dissolve) or die. After the dissolve this is moot for most: core-ui tests can import any module relatively.
6. **token-profiles deletion** — if a future component wants JS-side typography styles, it re-derives from tokens.css. Today nothing does; the lint rules that mention `TYPE_STYLE.<role>` in their message text need reworded messages.
7. **Toast/DialogPortalRoot deletion** — no functional hole; ToastRegion and ensureOverlayRoot already carry production. Stale doc comment in `useDialogBehavior.ts` gets fixed.
8. **framework→framework reach** — dissolving removes design-system from the framework surface entirely; the AU34 framework-surfaces model loses one package (a shrink, no migration risk beyond the import respell of ~130 core-ui files, mechanical codemod by exported name per AU34 lessons).


---

# diagnostics — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT — delete the observability third outright, keep a 2-file shared core (logger + secret-scrub), inline `redactDbUrl` into its two dev-world users.**

The package is three unrelated things stapled together:

1. **`logger.ts`** — the process-wide stdout sink. Genuinely shared: 6 independent consumer groups across all three shipping roots (framework/event-bus, framework/host-process, framework/http-middleware, layers/core-api + 6 subpackages, layers/agent-orchestration, applications/remote-server). ~30 production files import `createLogger`. No single owner exists; copying a logger into 6 packages is worse than the package. **STAYS SHARED.**
2. **`redact.ts`** — secret-scrub regexes with exactly two independent production consumers: `layers/agent-orchestration` (`summarizeToolArgs` → the live session-activity feed the user watches in the UI) and `layers/core-api/notifications` (`ERROR_TOKEN_PATTERNS` + `REDACTED_TAG` → scrubbing error text before it becomes a user-visible notification). The pattern list is one security artifact; two diverging copies is how a new secret shape gets scrubbed on one path and leaked on the other — and the H3 lore records exactly that burn ("previous coverage missed common credential shapes"). **STAYS SHARED**, but 13 of its 17 exports are un-exported (zero external readers) and `redactDbUrl` leaves entirely.
3. **`observability/`** (3 files, 3 of 5 functions' worth of surface: 1 function + 6 types) — **DELETE the entire pipeline**, including its sole consumer in core-api. Evidence below.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/diagnostics" layers framework applications tools` → 27 production files + tests. What each actually imports:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| layers/core-api (16 prod files incl. conversation, knowledge, notifications, routine, work subpackages) | `createLogger`, `Logger`; notifications also `ERROR_TOKEN_PATTERNS` + `REDACTED_TAG`; observability-runtime + dispatcher also the observability exports | No — logger shared with 5 other groups; observability part dies instead of moving |
| layers/agent-orchestration (3 prod files) | `createLogger`; composition injects `summarizeToolArgs` into the provisioner port | No — scrub list must stay identical to the notifications copy |
| applications/remote-server | `createLogger` | No |
| framework/event-bus | `createLogger`, `Logger` | No |
| framework/host-process | `createLogger`, `Logger` | No |
| framework/http-middleware | `createLogger` | No |
| tools/setup (tooling world) | `redactDbUrl` | **Yes — move it there** |
| framework/db `__testing__/pg-test-runner.ts` (dev world) | `redactDbUrl` | **Yes — own 20-line copy** |

Zero consumers anywhere for: the 12 individual regex consts, `scrubInlineTokens`, `ObservabilityEvent`/`ObservabilityAdapter`/`ObservabilityChannel`/`ObservabilityDispatcher`/`ObservabilityDispatcherStatus`/`FlushOutcome` outside core-api's dispatcher, and `createConsoleObservabilityAdapter` outside core-api's observability-runtime. Confirmed per-symbol with `rg -a` across all four roots (trace graph returns false negatives here — it misses this package's DI wiring; rg found the callers the graph missed, and rg's zeroes are the ones reported).

## The observability pipeline is machinery nobody reads — kill it end to end

The chain: EventBus → `registerObservabilityDispatcher` (core-api `dispatcher.ts`, ~480 lines of ring buffer, batching, drop accounting) → `createConsoleObservabilityAdapter` → the same `createLogger` → stdout. Its entire output is duplicate log lines of domain events (`session_started`, `task_state_changed`, `bet_state_changed`, `knowledge_write`…) that the emitting services already log. Who reads it, and what decision changes:

- **No operator surface.** AU26 already deleted all four `/api/observability*` routes because they had *zero requesters repo-wide*. `status()` survives, by its own `@lore` admission, only as a test seam.
- **No off switch anyone can reach.** `updateObservabilityConfig` has zero production callers — no route, no UI. The config is default-on and write-dead.
- **No decision branches on any event.** Nothing parses these stdout lines; the UI's live session-activity feed comes from `session-activity-buffer` → WebSocket, not from this dispatcher.
- **The batching exists for an adapter that doesn't exist.** `ObservabilityAdapter.record()` takes a batch "so network adapters can amortise per-request overhead" — the only adapters are `console` and `noop`. Ring buffer + flush timer + drop stats feeding `console.log` is anticipatory abstraction, verbatim the framework-brief garbage list.

Per the brief: diagnostics survive only where someone reads the output to make a decision. Nobody reads this. DELETE: `observability/events.ts`, `observability/types.ts`, `observability/console-adapter.ts` here, plus (outside this package, named as required) `layers/core-api/src/observability/dispatcher.ts`, `layers/core-api/src/observability-runtime.ts`, its wiring in `service-bootstrap.ts`, the `ObservabilitySchema` block + `read/updateObservabilityConfig` in `layers/core-api/settings/src/server-config.ts`, and the three dispatcher/adapter test files.

## If written today, from scratch

One small package, two files, five exports:

- `createLogger` / `Logger` — stdout sink with `info`/`warn`/`error`. No `minLevel` (no caller ever passes it), no `debug` (with the default floor at `info`, both production `.debug()` calls in the repo have never printed a line).
- `summarizeToolArgs` — scrub + 512-char cap for the tool-call preview the user watches in `SessionActivityPanel`. `scrubInlineTokens` folded in as a private helper.
- `ERROR_TOKEN_PATTERNS`, `REDACTED_TAG` — the shared pattern list + sentinel for notifications' user-visible error scrubbing. All 12 individual regexes private.

`redactDbUrl` lives in `tools/setup`; `pg-test-runner` keeps its own copy (dev world can't import from tools, and 20 lines does not justify a framework export with zero production callers).

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 20 |
| MERGE | 1 |
| SIMPLIFY | 2 |
| KEEP | 3 |

Surface: 26 exports → 5 exports (81% cut)

## Feature-level kills

- **The observability event pipeline** (this package's `observability/` + core-api's dispatcher, runtime, config schema, ~700 lines total across packages). Breaks: no batched telemetry lines on stdout, no `ObservabilityConfig` settings key. Acceptable because: zero readers, zero operator surface (already deleted in AU26 for zero requesters), zero config writers, and every event it mirrors is already logged by its source service. When someone actually wants a trace line, they add one `logger.info` at the source — that is the whole feature.
- **`redactDbUrl` as framework surface.** Breaks: nothing in production — its only users are a setup CLI (tooling) and a test runner (dev world). Both get local copies.
- **Public regex à-la-carte surface** (12 consts). Breaks: nothing — no file outside this package references any of them. The barrel exporting 12 regexes nobody imports is uniformity theater.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `createLogger` | function | BOOTSTRAP + INTERNAL — imported by 22 prod files across 6 consumer groups, all three shipping roots | SIMPLIFY | Shared stdout sink, earns its keep; drop `minLevel` (never passed by any caller) and the `debug` level (unprintable at the default floor — both prod `.debug()` calls die too). |
| 2 | `createConsoleObservabilityAdapter` | function | BOOTSTRAP — sole caller `core-api/observability-runtime.ts`, itself part of the dead pipeline | DELETE | Sink of a telemetry pipeline with no reader, no operator route (AU26 deleted them for zero requesters), no reachable off switch; dies with the whole pipeline. |
| 3 | `scrubInlineTokens` | function | INTERNAL — zero external references (`rg -a` all roots); only `summarizeToolArgs` calls it | MERGE | Fold into `summarizeToolArgs` as a private helper; the export is dead. |
| 4 | `summarizeToolArgs` | function | UI:SessionActivityPanel — provisioner (via agent-orchestration composition port) → `tool_call_recorded` → session-activity-buffer → WS → `useSessionActivity` | KEEP | Core value: the live "what is my agent doing" feed users watch, with secrets scrubbed before they hit the wire; the H3 learning that earned this scrubbing is real. |
| 5 | `redactDbUrl` | function | TEST/TOOLING-ONLY — `tools/setup/setup-cli.ts` (tooling world) + `framework/db/__testing__/pg-test-runner.ts` (dev world); zero production callers | DELETE | No production reach; move into `tools/setup`, give the test runner its own 20-line copy, delete from framework. |
| 6 | `Logger` | interface | Same reach as `createLogger` — also a DI type in event-bus, host-process, notifications, routes | SIMPLIFY | Survives with `createLogger`; loses the `debug` member. |
| 7 | `ObservabilityEvent` | type | INTERNAL to dead pipeline — outside this package only core-api `dispatcher.ts` + its tests | DELETE | Six-way discriminated union describing telemetry records nobody reads; dies with the pipeline. |
| 8 | `ObservabilityChannel` | type | core-api `dispatcher.ts` + tests only | DELETE | A `"console" \| "noop"` enum — an off switch spelled as a channel; dies with the pipeline. |
| 9 | `ObservabilityAdapter` | interface | core-api `dispatcher.ts`, `observability-runtime.ts` + tests | DELETE | One real implementation (console) — not an abstraction, indirection; batch signature serves a network adapter that was never built. |
| 10 | `ObservabilityDispatcherStatus` | interface | core-api `dispatcher.ts` only; sole production reader of `status()` deleted in AU26 (its own @lore says so) | DELETE | Operator snapshot with no operator; test-only seam = dead code plus tests that die with it. |
| 11 | `FlushOutcome` | interface | core-api `dispatcher.ts` only | DELETE | Partial-drain accounting for flushes to `console.log`; nobody branches on it. |
| 12 | `ObservabilityDispatcher` | interface | core-api `dispatcher.ts` + tests | DELETE | Port with one implementation, wired at one site, feeding one unread sink. |
| 13 | `REDACTED_TAG` | const | INTERNAL to notifications' scrub path — prod: `notifications/install.ts`; output is user-visible notification text | KEEP | The sentinel users actually see in scrubbed notification errors; shared with `ERROR_TOKEN_PATTERNS` consumer. |
| 14 | `GITHUB_TOKEN_RE` | const | DEAD as export — zero external references; used inside redact.ts only | DELETE | Un-export; private detail of the scrub functions. |
| 15 | `BEARER_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 16 | `SK_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 17 | `PK_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 18 | `TK_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 19 | `HEX_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 20 | `AWS_AKIA_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 21 | `SLACK_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 22 | `GOOGLE_API_KEY_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 23 | `JWT_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 24 | `STRIPE_TOKEN_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 25 | `PEM_BLOCK_RE` | const | DEAD as export — zero external references | DELETE | Un-export; same. |
| 26 | `ERROR_TOKEN_PATTERNS` | const | Prod: `notifications/install.ts` `scrubErrorMessage` — output lands in user-visible notification text | KEEP | The one shared consumer of the pattern list besides `summarizeToolArgs`; the reason the list stays centralized instead of forking. |

Rows 14–25 are one declaration family (the secret-shape regex set) but are listed individually per the no-sampling rule; all twelve verdicts confirmed independently with `rg -a`.

## Holes this leaves

- **No telemetry event stream at all.** If the founder ever wants machine-readable session/task/bet traces shipped somewhere, the pipeline must be rebuilt — but it comes back *with a reader*, which is the correct order. Today's version would be deleted output either way.
- **No `debug` log level.** Anyone wanting verbose diagnostics adds `info` lines temporarily. Given zero `debug` lines have ever printed in production, this hole is theoretical.
- **`redactDbUrl` duplicated** (tools/setup + pg-test-runner). Two 20-line copies of URL-password masking can drift; neither is production, so drift costs a log line in a test runner, not a leak.
- **`observability` settings key becomes unknown.** Any DB row holding old `observability` config is ignored after the schema block is deleted; no migration needed, but a leftover row is inert.


---

# domain-model — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT — dissolve ~55% of the surface into its real owners; a slimmed shared core remains.**

456 files across every layer import `@hyperidle/domain-model`, so "delete the package" is not on the table. But the 395-export surface is three different things wearing one name:

1. **A real client↔server wire contract** (core-api / agent-orchestration serve it, core-ui / design-system render it). Neither side may import the other, so this part legitimately needs a shared home. It survives, slimmed. ~121 exports.
2. **The event vocabulary + bus typing** (`events.ts`, ~48 exports). `EventType`/`EventByType`/`EventHandler`/`WildcardHandler` exist *only* to type `framework/event-bus`'s API; every subscriber already imports event-bus. **DISSOLVE → `framework/event-bus`.** Five of the events are defined, dispatcher-cased, and never emitted anywhere — those die outright.
3. **Single-owner code parked here for tidiness** (~120 exports): trigger schemas only core-api reads, block types only the block pipeline produces, health derivations only the browser runs, auth TTLs only core-api reads, session-request internals only orchestration reads, a whole Money arithmetic library nobody calls. Each moves to its sole consumer or dies.

Plus ~45 exports that are **dead**: never imported by any production file, duplicated locally by their supposed consumer, or guards/events for features that were hard-deleted (AU21 cost-cap) and left their vocabulary behind.

## Consumers (measured, not assumed)

456 importing files: core-api 153, core-ui 125, design-system 47, agent-orchestration 42, agent-execution 9, block-derivation 8, tools/eval 7, harness-protocol 6, http-middleware 5, event-bus 5, conversation-parts 5, factory-defaults 4, db 4, tool-protocol 3, harness-capability 3, credential-access 3, desktop 3, work-intent-port 2, diagnostics 2, others ≤2. (`api-contract` and `eslint-plugin-design` reference it only in comments/messages — not real consumers.)

| Consumer | What it actually imports | Could it own this? |
|---|---|---|
| core-api | wire response types, state vocabularies (TASK_STATES, BET_STATUSES…), API_ERROR_CODES, event types, mention parsing, trigger/config schemas, errors | Owns: trigger.ts, task-transition.ts, auth.ts, OLD_KIND_MAP, mention parsing, model defaults, org/propagation vocab, its errors |
| core-ui | same wire types from the other side, label registries, health derivations, KnowledgeScope/SortOption, SCHEDULE_PRESETS, ASSISTANT_TURN_TIMEOUT_MS | Owns: health derivations, agent-profile sub-shapes, knowledge UI vocab, schedule presets, timeout const |
| design-system | thread/message model, block payloads, kind registry display fns, status vocab | Owns: segmentMentions, promotedRichMessageId, verdictDecisionToStatus, summarizePreview, artifactDisplayTitle, KnowledgeKind |
| agent-orchestration | session-request schema/kinds, events, connection provisioning types, its errors | Owns: intent guards, request statuses, held-auth/inherited-connection types, its 3 error classes |
| agent-execution | ResolvedModel, ModelTier, TokenUsage, HttpError, MODEL_CATALOG | Owns: HttpError (thrower AND catcher are both in llm-client.ts — the "cross-seam instanceof" lore is obsolete) |
| event-bus | DomainEvent, EventType, EventByType, EventHandler, WildcardHandler | Owns: all of events.ts — the union exists to type the bus |
| block-derivation | every symbol in blocks/types.ts | Owns: all of blocks/types.ts — it is the producer; design-system/core-ui import block-derivation |
| db | ConfigurationKind, PluginState (column typing) | Owns those two |
| credential-access | ModelRequest, ModelGatewayConfig, CredentialName, MissingCredentialError | Owns: ModelRequest, MissingCredentialError (it is the resolver/thrower) |
| harness-protocol / tool-protocol / work-intent-port | AgentSessionSourceKind/Correlation, Reversibility, ModelTier, TokenUsage | No — these genuinely cross seams; stay shared |
| desktop / tools/eval / factory-defaults | credential vocabulary; role catalog; seeding vocab | No — genuinely shared |

## If written today, from scratch

One slim `domain-model` (121 exports, down from 395): the state/verdict/label vocabularies both sides render, the thread/message model, the artifact kind registry, the credential + model-gateway catalog, the team/routine/agent-profile wire contracts, `ApiErrorResponse` + `API_ERROR_CODES`, `AgentSessionSourceKind`/`Correlation`, `TokenUsage`. Events live in `event-bus`. Blocks live in `block-derivation`. Everything with one consumer lives in that consumer. No Money library, no dead events, no `UserRole = string` fake type, no identity-function "builders".

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 52 |
| MERGE (move to named owner) | 146 |
| SIMPLIFY (survives in package; unexported family member or shrinks) | 75 |
| KEEP | 121 |

Surface: 395 exports → 121 exported from the shared package (69% of the public surface gone: 52 dead outright, 146 moved to their real owner, 75 demoted to unexported internals). The package shrinks from 395 exports to ~196 declarations of which 121 are public.

## Feature-level kills

1. **The Money library** (`types/money.ts` minus TokenUsage/TierTokenCount — 13 exports). Bigint currency arithmetic with USD/EUR/GBP/JPY scales, wire conversion, add/compare. Zero production callers. It is the orphan of the AU21-deleted cost-cap feature; only `@lore` comments still reference it. Hole: none — the token-accounting types it shares a file with survive.
2. **Five never-emitted events**: `dependency_met`, `bet_revised`, `thread_archived`, `work_selection_requested`, `proposed_call_executed`. Defined in `events.ts`, cased in `core-api/src/observability/dispatcher.ts`, emitted by nothing, subscribed by nothing. Delete the interfaces, union entries, and dispatcher cases. Hole: none — they never fire.
3. **Dead type-guard family**: `isConfigurationKind`, `isPluginState`, `isConnectionAuthSource`, `isHeldAuthSource`, `isTriggerEventType`, `urgencyForType`, `buildSessionLifecycleCorrelation` (a literal identity function), `classifyThreadConfiguration` (self-described "documentation-only classifier — never persisted"). Zero production callers; `core-api/settings/plugin-configuration.ts` even wrote its own private `isConfigurationKind` rather than import this one.
4. **Dead mirrors of DB rows**: `ProposedCall` (core-api uses `proposedCalls.$inferSelect` from `framework/db`), `CreateArtifactInput` (core-api/work has its own in `artifact-store.ts`), `MUTABLE_BET_FIELDS` (live copy is `bet-state-machine.MUTABLE_FIELDS`; the "both must stay in sync" doc comment is false — nothing imports this one), `VersionConflictError` (core-api/knowledge throws its own 2-arg class; this 3-arg one is never instantiated, so the `instanceof` check in error-handler.ts:25 never matches and only the `err.name` string fallback works).
5. **Never-thrown errors**: `ActiveRoutinesError`, `ProviderTimeoutError` — no `new` site anywhere. `CassetteMissError` — thrown only from `agent-execution/harness-registry/src/__testing__/llm-cassette.ts` (development world); a production package exporting an error class for a test-only module is dead weight here.
6. **Fake types**: `UserRole = string` (imported at 9 production sites for zero type safety), `UserStatus`, `UserKind`/`USER_KINDS`, `SessionState`, `KnowledgeFormat`, `RiskTier`, `AutonomyLevel` — none imported by any production file.

## Full method audit

### A. Functions (48)

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `isAgentBehaviorConfigKind` | UI:PATCH /api/settings/agent-behavior (core-api ×2) | KEEP | Guard for the kept behavior-config wire family; server-side validation. |
| 2 | `findRoleCatalogEntry` | UI:multiple (core-api ×2, core-ui ×4, eval) | KEEP | Role catalog is genuinely shared across 3 worlds. |
| 3 | `roleLabel` | UI:GET /api/knowledge (core-api ×1) | MERGE → core-api | One caller; trivial title-caser over the shared catalog. |
| 4 | `communityForRole` | INTERNAL+2 (agent-orchestration, core-api barrel re-export) | KEEP | Two independent consumers of catalog derivation. |
| 5 | `defaultRoster` | UI:SetupFlow + factory-defaults | KEEP | Two independent consumers. |
| 6 | `computeHealthSignals` | UI:AgentProfile via core-ui hook | MERGE → core-ui | Only the browser runs it (AU26 J4 moved computation client-side); "both sides need it" is no longer true. |
| 7 | `deriveHealthLevel` | UI: core-ui ×1 | MERGE → core-ui | Same. |
| 8 | `deriveHealthDetail` | UI: core-ui ×1 | MERGE → core-ui | Same. |
| 9 | `isAgentWorkIntentKind` | INTERNAL:agent-orchestration ×2 | MERGE → agent-orchestration | Guards orchestration's own DB column; nobody else calls it. |
| 10 | `isAgentWorkIntentSourceKind` | INTERNAL:agent-orchestration ×2 | MERGE → agent-orchestration | Same. |
| 11 | `isConfigurationKind` | DEAD | DELETE | core-api wrote its own private copy (plugin-configuration.ts:138); this export has zero callers. |
| 12 | `isPluginState` | DEAD | DELETE | Zero callers anywhere. |
| 13 | `isConnectionAuthSource` | TEST-ONLY | DELETE | Only a test references it. |
| 14 | `isHeldAuthSource` | TEST-ONLY | DELETE | Only a test references it. |
| 15 | `isCredentialName` | UI:credentials route + desktop | KEEP | Two worlds (server + Electron) validate against one vocabulary. |
| 16 | `credentialNameForProvider` | UI:harnesses route + SetupFlow | KEEP | Server + client. |
| 17 | `isHintId` | UI:GET /api/hints | KEEP | Guard of the two-sided hint catalog (server validates, client renders). |
| 18 | `getKindDefinition` | UI: design-system ArtifactPreviewSurface | KEEP | Kind registry family is 3-sided (core-api, orchestration, design-system). |
| 19 | `isRegisteredKind` | UI: core-api artifacts + design-system | KEEP | Same family. |
| 20 | `scopeToLayer` | INTERNAL:core-api ×2 | MERGE → core-api | Only the knowledge service maps scope→layer. |
| 21 | `extractMentionCandidates` | UI:POST /api/threads (core-api) | MERGE → core-api | Server-side resolution is authoritative by design; only the server parses. |
| 22 | `resolveMentions` | UI:POST /api/threads (core-api) | MERGE → core-api | Same. |
| 23 | `segmentMentions` | UI: design-system CommentRow | MERGE → design-system | Only the renderer segments. |
| 24 | `isCatalogModel` | UI:validate-agent-config (core-api ×1) | MERGE → core-api | One caller; one-line `.some()` over the shared MODEL_CATALOG. |
| 25 | `catalogEntry` | UI:agents route (core-api ×1) | MERGE → core-api | One caller; one-line `.find()`. |
| 26 | `urgencyForType` | DEAD | DELETE | Zero callers. |
| 27 | `shortLabelForType` | UI:NotificationPopover (core-ui ×1) | MERGE → core-ui | One caller; NOTIFICATION_TYPES stays shared, the helper moves. |
| 28 | `buildSessionLifecycleCorrelation` | TEST-ONLY | DELETE | Literal identity function (`return input;`). One test imports it. |
| 29 | `canTransitionTaskState` | INTERNAL:core-api ×3 | MERGE → core-api/work | Task state machine is core-api's domain logic; no other consumer. |
| 30 | `exhaustiveAssert` | INTERNAL: conversation-parts, design-system | DELETE | 3-line language util; each consumer inlines its own never-guard. |
| 31 | `isRedactedPayload` | UI:many (core-ui ×5, conversation-parts, design-system ×3) | KEEP | Real shared narrowing across 3 packages. |
| 32 | `classifyThreadConfiguration` | TEST-ONLY | DELETE | Self-described "documentation-only classifier — never persisted". Zero prod callers. |
| 33 | `headCollapsePredicate` | UI:GET /api/threads (core-api) + internal | KEEP | Same head rule evaluated server-side and (via isBlocking) client-side. |
| 34 | `isBlocking` | UI: design-system ThreadShell | KEEP | Pairs with 33 across the seam. |
| 35 | `promotedRichMessageId` | UI: design-system ThreadShell ×1 | MERGE → design-system | Single consumer, pure render rule. |
| 36 | `verdictDecisionLabel` | UI: core-ui + conversation-parts + design-system | KEEP | Three consumers; the label registry lint rule depends on it. |
| 37 | `verdictDecisionToStatus` | UI: design-system CommentRow ×1 | MERGE → design-system | Belongs in status-mapping.ts, its only consumer's file's sibling. |
| 38 | `isTriggerEventType` | DEAD | DELETE | Zero callers. |
| 39 | `summarizePreview` | UI: design-system ArtifactEmbed ×1 | MERGE → design-system | Display helper; single consumer. |
| 40 | `artifactDisplayTitle` | UI: core-ui + design-system ×3 | MERGE → design-system | All consumers are UI-world; core-ui already imports design-system. |
| 41 | `scaleForCurrency` | DEAD | DELETE | Dead Money library (feature-kill 1). |
| 42 | `zeroMoney` | DEAD | DELETE | Same. |
| 43 | `moneyFromWire` | DEAD | DELETE | Same. |
| 44 | `moneyToWire` | DEAD | DELETE | Same. |
| 45 | `addMoney` | DEAD | DELETE | Same. |
| 46 | `compareMoney` | DEAD | DELETE | Same. |
| 47 | `totalTokens` | DEAD | DELETE | A @lore comment orders callers to use it; none do. |
| 48 | `addTokenUsage` | TEST-ONLY | DELETE | Only tests call it. |

### B. Classes (12)

| # | Class | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `InvalidTransitionError` | UI: core-api ×4 | MERGE → core-api | Thrown and caught only inside core-api. |
| 2 | `VersionConflictError` | DEAD (as a class) | DELETE | Never instantiated. core-api/knowledge throws its OWN 2-arg VersionConflictError; error-handler's `instanceof` on this one never matches — the `err.name` string fallback does the real work. |
| 3 | `CapacityExceededError` | UI: core-api ×2 | MERGE → core-api | Thrown (bet-state-machine) and mapped (error-handler) only in core-api. |
| 4 | `ConcurrencyLimitError` | INTERNAL: agent-orchestration ×2 | MERGE → agent-orchestration | Single owner. |
| 5 | `MissingCredentialError` | agent-orchestration + credential-access | MERGE → credential-access | The resolver throws it; orchestration already imports credential-access. |
| 6 | `TargetAgentNotRunnableError` | INTERNAL: agent-orchestration ×2 | MERGE → agent-orchestration | Single owner. |
| 7 | `ActiveRoutinesError` | DEAD | DELETE | No `new ActiveRoutinesError` anywhere. |
| 8 | `NoEligibleHarnessError` | INTERNAL: agent-orchestration ×1 | MERGE → agent-orchestration | Single owner. |
| 9 | `ProviderTimeoutError` | DEAD | DELETE | No throw site anywhere in production. |
| 10 | `HttpError` | INTERNAL: agent-execution llm-client ×1 | MERGE → agent-execution | Thrower AND catcher (`isHttpError`, `mapErrorToNotice`) now live in the same file; the cross-seam rationale is obsolete. |
| 11 | `CassetteMissError` | TEST-ONLY (`__testing__/llm-cassette.ts`) | DELETE | Only a development-world module throws/catches it; move the class into that module. |
| 12 | `TaskInvalidTransitionError` | UI: core-api ×4 | MERGE → core-api/work | Travels with the task state machine (A29). |

### C. Types / interfaces (236)

| # | Declaration | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `AgentBehaviorConfigKind` | core-api ×1 | SIMPLIFY | Unexport; structural member of kept View + guard source. |
| 2 | `AgentBehaviorOriginType` | core-api ×1 | SIMPLIFY | Unexport; member of OriginView. |
| 3 | `AgentBehaviorOriginState` | core-api ×1 | SIMPLIFY | Unexport; member. |
| 4 | `AgentBehaviorValueSource` | core-api ×1 | SIMPLIFY | Unexport; member. |
| 5 | `AgentBehaviorPromptSource` | core-api ×1 | SIMPLIFY | Unexport; member. |
| 6 | `AgentBehaviorFieldKind` | none external | SIMPLIFY | Unexport; member of EditableField. |
| 7 | `AgentBehaviorLinkTarget` | none external | SIMPLIFY | Unexport; member of ConfigLink. |
| 8 | `AgentBehaviorOriginView` | core-api ×1 | SIMPLIFY | Unexport; member of View. |
| 9 | `AgentBehaviorEditableField` | core-api + core-ui | KEEP | Two-sided wire type for the settings surface. |
| 10 | `AgentBehaviorConfigLink` | core-api ×1 | SIMPLIFY | Unexport; member of View. |
| 11 | `AgentBehaviorTriggerSummary` | core-api ×1 | SIMPLIFY | Unexport; member of View. |
| 12 | `AgentBehaviorConfigView` | core-api + core-ui | KEEP | The wire contract for Settings → Agent behavior. |
| 13 | `AgentBehaviorConfigListResponse` | core-api + core-ui | KEEP | Wire pair. |
| 14 | `AgentBehaviorConfigPatchRequest` | core-api ×1 | KEEP | Request half of the kept PATCH contract. |
| 15 | `AgentBehaviorConfigPatchResponse` | core-api + core-ui | KEEP | Wire pair. |
| 16 | `AgentBehaviorConfigErrorResponse` | core-api ×1 | DELETE | `{error, code}` — a duplicate of ApiErrorResponse. Use that. |
| 17 | `AgentActiveSession` | core-ui ×1 | MERGE → core-ui | Only the browser types this. |
| 18 | `AgentSessionSummary` | core-ui ×1 | MERGE → core-ui | Same. |
| 19 | `AgentPerformanceStats` | core-ui ×1 | MERGE → core-ui | Same. |
| 20 | `AgentHealthSignals` | core-ui ×1 + internal | MERGE → core-ui | Travels with the health derivations (A6–A8). |
| 21 | `AgentHarnessCapabilities` | core-api ×1 | SIMPLIFY | Unexport; member of AgentProfileResponse. |
| 22 | `AgentVerdictEntry` | none external | SIMPLIFY | Unexport; member of AgentReviewTrackRecord. |
| 23 | `AgentReviewTrackRecord` | core-api ×1 | SIMPLIFY | Unexport; member of AgentProfileResponse. |
| 24 | `AgentProfileResponse` | core-api + core-ui ×2 | KEEP | Wire contract for GET /api/agents/:id/profile. |
| 25 | `AgentRoleCatalogEntry` | via catalog (3 worlds) | KEEP | Element type of the shared catalog. |
| 26 | `TeamFunction` | none external | SIMPLIFY | Unexport; derived from TEAM_FUNCTIONS. |
| 27 | `AgentRunSummary` | core-ui ×3 | KEEP | Orchestration serves it, browser reads it — two-sided by construction. |
| 28 | `AgentRunsResponse` | agent-orchestration + core-ui | KEEP | Wire pair. |
| 29 | `AgentRunActiveCountsResponse` | agent-orchestration + core-ui | KEEP | Wire pair. |
| 30 | `AgentRunLatestOutcomesResponse` | agent-orchestration + core-ui | KEEP | Wire pair. |
| 31 | `HealthSignalInput` | none external | MERGE → core-ui | Parameter type of the moved health functions. |
| 32 | `ApiErrorResponse` | 14 prod files, 3 packages | KEEP | The error envelope of the whole API. |
| 33 | `ApiErrorCode` | none external | SIMPLIFY | Unexport; derived from API_ERROR_CODES. |
| 34 | `InviteRole` | core-api ×1 | MERGE → core-api/users | Only invite-code.ts types it. |
| 35 | `BlockKind` | block-derivation ×1 | MERGE → block-derivation | Whole blocks/types.ts belongs to its producer. |
| 36 | `BlockHostKind` | block-derivation + conversation-parts + core-ui | MERGE → block-derivation | Producer owns; consumers import block-derivation. |
| 37 | `BlockId` | block-derivation + core-ui + design-system | MERGE → block-derivation | Same. |
| 38 | `BlockAnchor` | none external | MERGE → block-derivation | Member of Block; travels. |
| 39 | `InlineNode` | block-derivation ×3 + design-system ×4 + core-ui | MERGE → block-derivation | Same. |
| 40 | `ListItem` | block-derivation + design-system | MERGE → block-derivation | Same. |
| 41 | `BlockPayload` | block-derivation ×3 + design-system ×5 + core-ui ×2 | MERGE → block-derivation | Same. |
| 42 | `Block` | block-derivation + design-system + core-ui | MERGE → block-derivation | Same. |
| 43 | `BlockDerivationResult` | block-derivation ×1 | MERGE → block-derivation | Literally named after its owner. |
| 44 | `ConfigurationKind` | core-api ×2 + db schema | MERGE → framework/db | db types the column; core-api already imports db. |
| 45 | `PluginState` | core-api + db schema | MERGE → framework/db | Same. |
| 46 | `ConfigurationOriginType` | none external | MERGE → core-api/settings | Member of ConfigurationOrigin; single owner. |
| 47 | `ConfigurationValueSource` | none external | MERGE → core-api/settings | Same. |
| 48 | `ConfigurationOrigin` | core-api ×1 | MERGE → core-api/settings | Single owner. |
| 49 | `ResolvedConfigurationItem` | core-api ×2 | MERGE → core-api/settings | Single owner. |
| 50 | `ConnectionAuthSource` | core-ui ×1 | KEEP | Member of the kept ServiceConnectionView wire type. |
| 51 | `ConnectionHealth` | agent-orchestration + core-ui | KEEP | Two-sided. |
| 52 | `HeldAuthSource` | agent-orchestration ×2 | MERGE → agent-orchestration | Provisioning-internal vocabulary. |
| 53 | `ServiceConnectionView` | agent-orchestration ×2 + core-ui | KEEP | Wire contract for Settings → Connections. |
| 54 | `InheritedConnectionFact` | agent-orchestration ×2 | MERGE → agent-orchestration | Only orchestration produces/consumes. |
| 55 | `CredentialName` | 5 packages incl. desktop | KEEP | Genuinely shared credential vocabulary. |
| 56 | `CredentialState` | core-api + core-ui + desktop | KEEP | Same. |
| 57 | `CredentialCatalogEntry` | none external | SIMPLIFY | Unexport; element of CREDENTIAL_CATALOG. |
| 58 | `AgentWorkIntentKind` | dev-only direct | MERGE → event-bus | Event vocabulary; travels with events.ts. |
| 59 | `AgentWorkIntentSourceKind` | via guards | MERGE → event-bus | Same. |
| 60 | `AgentWorkIntentEvent` | EVENT:agent_work_intent_recorded (emitted core-api ×2) | MERGE → event-bus | Live event. |
| 61 | `AgentRunAdmissionFailureCode` | agent-orchestration ×1 | MERGE → event-bus | Member of live admission-failed event. |
| 62 | `AgentRunAdmissionFailedEvent` | EVENT:agent_run_admission_failed | MERGE → event-bus | Live event. |
| 63 | `AgentRunLifecycleChangedEvent` | EVENT:agent_run_lifecycle_changed | MERGE → event-bus | Live event. |
| 64 | `TaskStateChangedEvent` | EVENT:task_state_changed | MERGE → event-bus | Live event. |
| 65 | `BetStateChangedEvent` | EVENT:bet_state_changed | MERGE → event-bus | Live event. |
| 66 | `ItemCreatedEvent` | EVENT:item_created | MERGE → event-bus | Live event. |
| 67 | `SessionStartedEvent` | EVENT:session_started | MERGE → event-bus | Live event. |
| 68 | `SessionOutcome` | 5 packages | MERGE → event-bus | Member of SessionEndedEvent; broad but travels with the event family. |
| 69 | `SessionEndedEvent` | EVENT:session_ended (8 prod subscribers) | MERGE → event-bus | Live event, heavily used. |
| 70 | `SessionHandoffCompletedEvent` | EVENT:session_handoff_completed | MERGE → event-bus | Live event. |
| 71 | `SessionNotReturnedEvent` | EVENT:session_not_returned | MERGE → event-bus | Live event. |
| 72 | `NotificationEvent` | EVENT:notification | MERGE → event-bus | Live event. |
| 73 | `KnowledgeUpdatedEvent` | EVENT:knowledge_updated | MERGE → event-bus | Live event. |
| 74 | `KnowledgeCreatedEvent` | EVENT:knowledge_created | MERGE → event-bus | Live event. |
| 75 | `KnowledgeArchivedEvent` | EVENT:knowledge_archived | MERGE → event-bus | Live event. |
| 76 | `KnowledgeAccessedEvent` | EVENT:knowledge_accessed | MERGE → event-bus | Live event. |
| 77 | `RoutineFiredEvent` | EVENT:routine_fired | MERGE → event-bus | Live event. |
| 78 | `DependencyMetEvent` | DEAD — never emitted | DELETE | Only definition + dispatcher case exist. No emitter, no subscriber. |
| 79 | `SandboxWritebackChange` | agent-orchestration file-watcher | MERGE → event-bus | Member of live writeback event. |
| 80 | `SandboxWritebackChangesDetectedEvent` | EVENT:sandbox_writeback_changes_detected | MERGE → event-bus | Live event. |
| 81 | `BetRevisedEvent` | DEAD — never emitted | DELETE | Same as #78. |
| 82 | `ToolCallRecordedEvent` | EVENT:tool_call_recorded | MERGE → event-bus | Live event. |
| 83 | `ThreadCreatedEvent` | EVENT:thread_created | MERGE → event-bus | Live event. |
| 84 | `ThreadMessageAppendedEvent` | EVENT:thread_message_appended | MERGE → event-bus | Live event. |
| 85 | `ThreadResolvedEvent` | EVENT:thread_resolved | MERGE → event-bus | Live event. |
| 86 | `ThreadReopenedEvent` | EVENT:thread_reopened | MERGE → event-bus | Live event. |
| 87 | `ThreadArchivedEvent` | DEAD — never emitted | DELETE | Thread archival does not exist as a runtime event. |
| 88 | `ArtifactCreatedEvent` | EVENT:artifact_created | MERGE → event-bus | Live event. |
| 89 | `PropagationAppliedEvent` | EVENT:propagation_applied | MERGE → event-bus | Live event. |
| 90 | `PropagationFailedEvent` | EVENT:propagation_failed | MERGE → event-bus | Live event. |
| 91 | `WorkSelectionRequestedEvent` | DEAD — never emitted | DELETE | Same as #78. |
| 92 | `TeamCreatedEvent` | EVENT:team_created | MERGE → event-bus | Live event. |
| 93 | `AgentAddedEvent` | EVENT:agent_added | MERGE → event-bus | Live event. |
| 94 | `UserCreatedEvent` | EVENT:user_created | MERGE → event-bus | Live event. |
| 95 | `ProposedCallExecutedEvent` | DEAD — never emitted | DELETE | The executed-status transition happens without an event. |
| 96 | `ProposedCallGrantedEvent` | EVENT:proposed_call_granted | MERGE → event-bus | Live event. |
| 97 | `KernelEvent` | TEST-ONLY | DELETE | Inline into DomainEvent; the kernel/strategy split is a docs concept, not a runtime seam. |
| 98 | `StrategyEvent` | internal only | DELETE | Same. |
| 99 | `DomainEvent` | core-api ×2 + event-bus | MERGE → event-bus | The bus's own union. |
| 100 | `EventType` | core-api ×2 + event-bus | MERGE → event-bus | Bus API typing. |
| 101 | `WildcardType` | event-bus internal | MERGE → event-bus | Bus API typing. |
| 102 | `EventByType` | event-bus ×1 | MERGE → event-bus | Bus API typing. |
| 103 | `EventHandler` | event-bus ×1 | MERGE → event-bus | Bus API typing. |
| 104 | `HintId` | core-ui ×1 | KEEP | Two-sided hint catalog (server validates via isHintId, client renders). |
| 105 | `HintCatalogEntry` | none external | SIMPLIFY | Unexport; element of HINT_CATALOG. |
| 106 | `OldKindMapping` | none external | MERGE → core-api | Travels with OLD_KIND_MAP (sole consumer: artifacts route). |
| 107 | `KindDefinition` | via getKindDefinition | KEEP | Extension-point contract of the shared kind registry. |
| 108 | `TextPreview` | none external | SIMPLIFY | Unexport; z.infer convenience, family member. |
| 109 | `CodePreview` | none external | SIMPLIFY | Same. |
| 110 | `ImagePreview` | none external | SIMPLIFY | Same. |
| 111 | `DataPreview` | none external | SIMPLIFY | Same. |
| 112 | `HtmlPreview` | none external | SIMPLIFY | Same. |
| 113 | `UrlPreview` | none external | SIMPLIFY | Same. |
| 114 | `ArtifactKind` | none external | SIMPLIFY | Unexport; derived from ARTIFACT_KINDS. |
| 115 | `KnowledgeLayer` | 3 packages | KEEP | Shared knowledge vocabulary. |
| 116 | `KnowledgeStatus` | 3 packages | KEEP | Shared. |
| 117 | `KnowledgeKind` | core-ui ×2 + design-system | MERGE → design-system | All consumers are UI-world; server stores plain text. |
| 118 | `KnowledgeScope` | core-ui ×3 | MERGE → core-ui | Single consumer. |
| 119 | `KnowledgeTopicHealth` | core-ui ×3 | MERGE → core-ui | Single consumer. |
| 120 | `KnowledgeAccessorKind` | none external | MERGE → event-bus | Member of KnowledgeAccessedEvent. |
| 121 | `KnowledgeRelevanceSignals` | DEAD | DELETE | Zero references outside declaration + barrel. |
| 122 | `KnowledgeSortOption` | core-ui ×1 | MERGE → core-ui | Single consumer. |
| 123 | `RiskTier` | DEAD | DELETE | Trust-model vocabulary nobody imports; the live riskTier lives in DB/service code. |
| 124 | `AutonomyLevel` | TEST-ONLY | DELETE | Same. |
| 125 | `PropagationLevel` | core-api ×1 + event member | MERGE → event-bus | Member of live propagation events. |
| 126 | `PropagationStatus` | DEAD | DELETE | Member of dead PropagationResult only. |
| 127 | `PropagationResult` | DEAD | DELETE | Zero external references; the events carry their own fields. |
| 128 | `MentionCandidate` | via extractMentionCandidates | MERGE → core-api | Travels with the parser. |
| 129 | `ResolvedMention` | via resolveMentions | MERGE → core-api | Same. |
| 130 | `MentionSegment` | design-system ×1 | MERGE → design-system | Travels with segmentMentions. |
| 131 | `ModelProvider` | 4 packages | KEEP | Shared gateway vocabulary. |
| 132 | `ModelTierConfig` | core-api ×2 | KEEP | Member of kept ModelGatewayConfig; directly imported. |
| 133 | `ModelGatewayConfig` | core-api ×4 + credential-access + eval | KEEP | Shared. |
| 134 | `ResolvedModel` | 6 packages | KEEP | The seam type between orchestration, execution, and the resolver. |
| 135 | `ModelCatalogEntry` | none external | SIMPLIFY | Unexport; element/return type of catalog family. |
| 136 | `ModelRequest` | credential-access ×1 | MERGE → credential-access | Input type of the resolver; single consumer. |
| 137 | `NotificationUrgency` | core-api ×1 | SIMPLIFY | Unexport; member of registry entry. |
| 138 | `NotificationTypeKey` | core-api ×2 + core-ui ×2 | KEEP | Two-sided registry key. |
| 139 | `NotificationType` | none external directly | SIMPLIFY | Unexport; element of NOTIFICATION_TYPES. |
| 140 | `ProposedCallStatus` | core-ui ×2 | MERGE → core-ui | Only review pages narrow it; server uses DB-inferred types. |
| 141 | `Reversibility` | harness-protocol + tool-protocol ×2 | KEEP | Two independent framework consumers across the tool seam. |
| 142 | `ProposedCall` | DEAD (dev-only import) | DELETE | Dead mirror; core-api uses `proposedCalls.$inferSelect` from framework/db. |
| 143 | `RoutineState` | design-system ×1 + family | KEEP | Status-mapping consumes; ROUTINE_STATES validates server-side — two-sided family. |
| 144 | `RoutineRunOutcome` | core-api ×2 | SIMPLIFY | Unexport; member of kept routine wire types. |
| 145 | `RoutineCardSummary` | core-api ×1 | SIMPLIFY | Unexport; member of TeamDetail. |
| 146 | `RoutineRunSummary` | core-api + core-ui | KEEP | Wire pair. |
| 147 | `RoutineInfo` | core-api ×1 | SIMPLIFY | Unexport; member of RoutineDetail. |
| 148 | `RoutineDetail` | core-api + core-ui ×3 | KEEP | Wire contract for routine pages. |
| 149 | `RoutineCreatePayload` | DEAD | DELETE | Route validates with its own zod schema; nobody imports this. |
| 150 | `ToolCallData` | none external | SIMPLIFY | Unexport; member of ActivityEntry union. |
| 151 | `ReasoningData` | none external | SIMPLIFY | Same. |
| 152 | `AnswerDeltaData` | none external | SIMPLIFY | Same. |
| 153 | `AnswerSettledData` | none external | SIMPLIFY | Same. |
| 154 | `HumanMessageData` | none external | SIMPLIFY | Same. |
| 155 | `ActivityEntry` | agent-orchestration ×4 + core-ui ×2 + conversation-parts | KEEP | The session-activity wire union across the WS seam. |
| 156 | `AgentSessionSourceKind` | 4 packages | KEEP | Crosses the orchestration↔harness↔tool seams. |
| 157 | `AgentSessionPromptMode` | none external | SIMPLIFY | Unexport; schema-internal. |
| 158 | `AgentSessionRequestStatus` | none external | MERGE → agent-orchestration | Vocabulary of orchestration's own request table. |
| 159 | `AgentSessionRequestInput` | agent-orchestration ×1 | KEEP | z.infer of the kept union schema. |
| 160 | `AgentSessionSourceCorrelation` | 4 packages | KEEP | Seam-crossing correlation type. |
| 161 | `SessionLifecycleCorrelation` | agent-orchestration ×1 | MERGE → agent-orchestration | Single consumer once its dead builder (A28) dies. |
| 162 | `TeamStatus` | none external | SIMPLIFY | Unexport; member of TeamSummary. |
| 163 | `TeamSummary` | none external | SIMPLIFY | Unexport; member of TeamDetail. |
| 164 | `AgentOperationalStatus` | core-ui + design-system ×3 | KEEP | Shared status vocabulary (lint-enforced registry). |
| 165 | `AgentHealthLevel` | core-ui ×1 | MERGE → core-ui | Travels with the health derivations. |
| 166 | `RosterMember` | core-api + core-ui | KEEP | Wire pair. |
| 167 | `TeamBurn` | none external | SIMPLIFY | Unexport; member of TeamDetail. |
| 168 | `BetCardSummary` | core-api + core-ui | KEEP | Wire pair. |
| 169 | `TeamDetail` | core-api + core-ui ×2 | KEEP | Wire contract for the team page. |
| 170 | `TeamListItem` | core-api + core-ui ×3 | KEEP | Wire contract. |
| 171 | `TeamListResponse` | core-ui ×2 | KEEP | Wire pair of kept TeamListItem. |
| 172 | `PrimaryHarnessConfig` | core-api ×2 + harness-capability | KEEP | Crosses core↔harness-capability seam. |
| 173 | `CreateTeamRequest` | core-api ×1 | MERGE → core-api | Only the route types it; the client posts untyped. |
| 174 | `CreateTeamResponse` | core-api ×1 | MERGE → core-api | Same. |
| 175 | `HostKind` | core-api ×6 + core-ui ×8 + design-system ×2 | KEEP | Core thread vocabulary. |
| 176 | `MessageType` | core-api ×3 + design-system | KEEP | Same. |
| 177 | `VerdictDecision` | core-ui ×4 + design-system ×2 | KEEP | Same. |
| 178 | `ArtifactViewShape` | none external directly | SIMPLIFY | Unexport; derived from kept ARTIFACT_VIEW_SHAPES, member of ArtifactRef. |
| 179 | `ThreadId` | none external | SIMPLIFY | Alias of `string`; collapse to string. |
| 180 | `MessageId` | none external | SIMPLIFY | Same. |
| 181 | `IdentityId` | none external | SIMPLIFY | Same. |
| 182 | `Thread` | core-api ×3 + core-ui ×3 + design-system | KEEP | Core model. |
| 183 | `AnchorRef` | core-ui ×7 | KEEP | Review-surface anchor type. |
| 184 | `InlineRefKind` | none external | SIMPLIFY | Unexport; union of the kept ref kinds. |
| 185 | `EntityRef` | conversation-parts ×1 | KEEP | Member of kept InlineRef union, directly imported. |
| 186 | `BlockRef` | core-ui ×1 | KEEP | Same. |
| 187 | `MentionRef` | none external (comments only) | SIMPLIFY | Unexport; union member flows structurally. |
| 188 | `InlineRef` | core-ui ×2 + conversation-parts + design-system ×3 | KEEP | Core model. |
| 189 | `ArtifactRef` | core-ui + conversation-parts + design-system | KEEP | Core model. |
| 190 | `ToolCallSummary` | none external | SIMPLIFY | Unexport; member of PlainPayload. |
| 191 | `AssistantNotice` | core-ui ×1 | KEEP | Member of PlainPayload, directly imported by the overlay. |
| 192 | `PlainPayload` | core-api ×3 + core-ui ×3 | KEEP | Core model. |
| 193 | `ReviewPayload` | agent-orchestration ×1 | KEEP | Message-union member, imported across the seam. |
| 194 | `QuestionnairePayload` | none external | SIMPLIFY | Unexport; union member. |
| 195 | `VerdictPayload` | conversation-parts ×1 | KEEP | Union member, imported. |
| 196 | `RedactedPayload` | core-api ×3 + design-system | KEEP | Union member, imported. |
| 197 | `Message` | 4 packages, 17 prod files | KEEP | THE core model type. |
| 198 | `ThreadConfiguration` | DEAD | DELETE | Dies with classifyThreadConfiguration (A32). |
| 199 | `HeadCollapseResult` | none external | SIMPLIFY | Unexport; return type of kept predicate. |
| 200 | `AgentSessionStateSnapshot` | design-system ×1 | KEEP | Parameter of kept isBlocking. |
| 201 | `ArtifactThreadSummary` | core-api ×1 | KEEP | Wire pair with #202. |
| 202 | `ArtifactThreadSummaryResponse` | core-ui ×1 | KEEP | Wire pair. |
| 203 | `PlainPayloadWithBlockId` | core-ui ×1 | MERGE → core-ui | Only the client builds this request shape. |
| 204 | `TriggerEventType` | internal | MERGE → core-api/settings | Whole trigger module has one owner: the settings/behavior-config service. |
| 205 | `TriggerResultState` | internal | MERGE → core-api/settings | Same. |
| 206 | `TriggerRuleValue` | internal | MERGE → core-api/settings | Same. |
| 207 | `TriggerResolutionResult` | DEAD | DELETE | Zero references anywhere outside declaration. |
| 208 | `ArtifactPreview` | none external (name-collision hits are design-system's component) | SIMPLIFY | Unexport; member of Artifact + schema target. |
| 209 | `Artifact` | core-api + core-ui ×2 + design-system ×4 | KEEP | Core wire model. |
| 210 | `ArtifactPage` | core-api + core-ui | KEEP | Wire pair. |
| 211 | `ArtifactFilterAxis` | core-ui ×2 | MERGE → core-ui | Client-side filter vocabulary. |
| 212 | `ArtifactQuery` | core-ui ×2 | MERGE → core-ui | Server validates with its own zod; only client imports. |
| 213 | `CreateArtifactInput` | DEAD | DELETE | core-api/work has its own CreateArtifactInput in artifact-store.ts; this one has zero callers. |
| 214 | `CurrencyCode` | DEAD | DELETE | Dead Money library. |
| 215 | `Money` | DEAD | DELETE | Same. |
| 216 | `WireMoney` | DEAD (comments only) | DELETE | Same. |
| 217 | `TierTokenCount` | agent-execution ×1 | KEEP | Live token accounting (SessionEndedEvent tokensByTier path). |
| 218 | `TokenUsage` | agent-execution + core-ui + harness-protocol | KEEP | Same, three consumers. |
| 219 | `TaskState` | core-api ×4 + core-ui + design-system ×2 + eval ×2 | KEEP | Core state vocabulary. |
| 220 | `MutableBetField` | DEAD | DELETE | Dies with MUTABLE_BET_FIELDS (dead mirror of bet-state-machine.MUTABLE_FIELDS). |
| 221 | `HealthResponse` | core-api ×1 | MERGE → core-api | Health route's own 2-field shape. |
| 222 | `KnowledgeFormat` | DEAD (comment refs only) | DELETE | AU14 widened the real column to string; this union is a leftover. |
| 223 | `KernelKnowledgeStatus` | agent-orchestration + core-api | KEEP | Crosses the tool-definition seam. |
| 224 | `BetStatus` | 4 packages | KEEP | Core state vocabulary. |
| 225 | `SessionState` | DEAD | DELETE | Zero imports; session state lives in orchestration's own types. |
| 226 | `ModelTier` | 6 packages | KEEP | The most-shared type in the package. |
| 227 | `TriggerType` | none external | SIMPLIFY | Unexport; member of RoutineInfo. |
| 228 | `AgentCategory` | eval + internal catalog | KEEP | Element type of shared AGENT_CATEGORIES/catalog. |
| 229 | `UserRole` | 9 prod files | DELETE | `type UserRole = string` — a fake type providing zero safety. Replace every import with `string`. |
| 230 | `UserStatus` | DEAD | DELETE | Zero imports. |
| 231 | `UserKind` | DEAD | DELETE | Zero imports; db doesn't type the column with it. |
| 232 | `OrgEdgeMechanism` | core-api ×1 | MERGE → core-api/org | Single owner. |
| 233 | `ScopeKind` | agent-orchestration + core-ui ×5 + eval | KEEP | Shared knowledge-scope vocabulary. |
| 234 | `BetOutcomeVerdict` | core-ui ×2 + design-system ×2 | KEEP | Shared verdict vocabulary. |
| 235 | `TaskOutcomeVerdict` | core-ui + design-system | KEEP | Same. |
| 236 | `OldKindMapping` — counted at #106 (input lists it under kinds/old-kind-map). | — | — | — |

### D. Consts (99)

| # | Const | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `AGENT_BEHAVIOR_CONFIG_KINDS` | internal guard only | SIMPLIFY | Unexport; feeds the kept guard. |
| 2 | `TEAM_FUNCTIONS` | UI:SetupFlow | KEEP | Client renders, catalog derives from it. |
| 3 | `AGENT_ROLE_CATALOG` | core-api + core-ui ×3 + factory-defaults | KEEP | The shared role catalog — 3 worlds. |
| 4 | `API_ERROR_CODES` | core-api ×16 + agent-orchestration ×4 + http-middleware ×4 | KEEP | Most-used const in the package. |
| 5 | `artifactPreviewSchema` | core-api + agent-orchestration | KEEP | Two-sided validation (route + tool schema). |
| 6 | `fallbackPreviewSchema` | core-api ×1 | KEEP | Family with #5; open-vocabulary fallback. |
| 7 | `INVITE_ROLES` | core-api ×1 | MERGE → core-api/users | Single owner. |
| 8 | `LOGIN_SESSION_TTL_MS` | core-api ×1 | MERGE → core-api/users | Single owner. |
| 9 | `INVITE_CODE_TTL_MS` | core-api ×1 | MERGE → core-api/users | Single owner. |
| 10 | `BLOCK_KINDS` | none external | MERGE → block-derivation | Blocks module moves whole. |
| 11 | `BLOCK_HOST_KINDS` | core-api ×1 | MERGE → block-derivation | Same; core-api imports block-derivation for validation. |
| 12 | `BLOCK_ID_VERSION` | block-derivation ×1 | MERGE → block-derivation | Same. |
| 13 | `IMAGE_URL_SAFE_SCHEMES` | block-derivation + design-system | MERGE → block-derivation | Same. |
| 14 | `LINK_URL_SAFE_SCHEMES` | block-derivation ×2 | MERGE → block-derivation | Same. |
| 15 | `MAX_BODY_BYTES` | block-derivation ×2 | MERGE → block-derivation | Same. |
| 16 | `CONFIGURATION_KINDS` | core-api ×1 | MERGE → core-api/settings | Single owner. |
| 17 | `PLUGIN_STATES` | none external | MERGE → framework/db | Derives PluginState, which moves to db. |
| 18 | `BUILTIN_PLUGIN_ID` | core-api ×1 | MERGE → core-api/settings | Single owner. |
| 19 | `CONNECTION_AUTH_SOURCES` | none external | SIMPLIFY | Unexport; type-derivation only once its dead guard dies. |
| 20 | `CONNECTION_HEALTH` | none external | SIMPLIFY | Same. |
| 21 | `HELD_AUTH_SOURCES` | agent-orchestration ×2 | MERGE → agent-orchestration | Provisioning-internal. |
| 22 | `CREDENTIAL_NAMES` | desktop ×1 | KEEP | Cross-world (Electron) vocabulary. |
| 23 | `CREDENTIAL_STATES` | core-api ×1 | KEEP | Derives shared CredentialState; server zod. |
| 24 | `CREDENTIAL_CATALOG` | core-api + core-ui | KEEP | Two-sided registry. |
| 25 | `CREDENTIAL_BY_PROVIDER` | none external | SIMPLIFY | Unexport; internal to credentialNameForProvider. |
| 26 | `ASSISTANT_TURN_TIMEOUT_MS` | core-ui ×1 | MERGE → core-ui | "Both sides use it" is false — only AssistantOverlay imports it in production. |
| 27 | `AGENT_WORK_INTENT_KINDS` | dev-only external | MERGE → event-bus | Travels with the intent event + guards. |
| 28 | `HINT_CATALOG` | core-ui ×1 | KEEP | Two-sided hint registry. |
| 29 | `HINT_IDS` | none external | SIMPLIFY | Unexport; internal to isHintId. |
| 30 | `OLD_KIND_MAP` | core-api ×1 | MERGE → core-api | Read-time normalization used by one route. |
| 31 | `textPreviewSchema` | internal registry | SIMPLIFY | Unexport; already marked internal. |
| 32 | `textKind` | internal registry | SIMPLIFY | Unexport. |
| 33 | `codePreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 34 | `codeKind` | internal registry | SIMPLIFY | Unexport. |
| 35 | `imagePreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 36 | `imageKind` | internal registry | SIMPLIFY | Unexport. |
| 37 | `dataPreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 38 | `dataKind` | internal registry | SIMPLIFY | Unexport. |
| 39 | `htmlPreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 40 | `htmlKind` | internal registry | SIMPLIFY | Unexport. |
| 41 | `urlPreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 42 | `urlKind` | internal registry | SIMPLIFY | Unexport. |
| 43 | `ARTIFACT_KINDS` | agent-orchestration + core-api | KEEP | Two-sided kind list. |
| 44 | `KNOWLEDGE_LAYERS` | agent-orchestration + core-api | KEEP | Two-sided. |
| 45 | `SCOPE_TO_LAYER` | core-api ×2 | MERGE → core-api | Travels with scopeToLayer. |
| 46 | `KNOWLEDGE_STATUSES` | agent-orchestration + core-ui ×2 | KEEP | Two-sided. |
| 47 | `KNOWLEDGE_STATUS_LABEL` | core-ui ×1 | KEEP | Label registry (lint-enforced pattern). |
| 48 | `KNOWLEDGE_SCOPES` | none external | MERGE → core-ui | Derives KnowledgeScope which moves there. |
| 49 | `KNOWLEDGE_TOPIC_HEALTHS` | none external | MERGE → core-ui | Same. |
| 50 | `KNOWLEDGE_SORT_OPTIONS` | core-ui ×1 | MERGE → core-ui | Single consumer. |
| 51 | `MAX_MENTIONS_PER_MESSAGE` | none external | MERGE → core-api | Travels with the mention parser. |
| 52 | `MODEL_PROVIDERS` | core-api ×2 + core-ui ×2 | KEEP | Two-sided. |
| 53 | `MODEL_CATALOG` | agent-execution ×1 (+ helpers) | KEEP | Shared model catalog. |
| 54 | `DEFAULT_AGENT_MODEL_ID` | core-api ×1 | MERGE → core-api | Agent-creation default; single owner. |
| 55 | `DEFAULT_AGENT_MODEL_PROVIDER` | core-api ×1 | MERGE → core-api | Same. |
| 56 | `DEFAULT_AGENT_HARNESS` | core-api ×1 | MERGE → core-api | Same. |
| 57 | `BUILT_IN_GATEWAY_CONFIG` | core-api ×1 | MERGE → core-api/settings | Single owner (server-config fallback). |
| 58 | `NOTIFICATION_TYPES` | core-api + core-ui | KEEP | Two-sided registry. |
| 59 | `PROPOSED_CALL_STATUSES` | TEST-ONLY external | MERGE → core-ui | Travels (unexported) with ProposedCallStatus. |
| 60 | `REVERSIBILITY` | TEST-ONLY external | SIMPLIFY | Unexport; derives kept Reversibility. |
| 61 | `ROUTINE_STATES` | core-api ×1 | KEEP | Server zod for the kept RoutineState family. |
| 62 | `ROUTINE_RUN_OUTCOMES` | none external | SIMPLIFY | Unexport; type-derivation only. |
| 63 | `SCHEDULE_PRESETS` | core-ui ×2 | MERGE → core-ui | Pure UI presets. |
| 64 | `AGENT_SESSION_SOURCE_KINDS` | agent-orchestration ×1 + internal trigger schema | KEEP | Seam vocabulary (also feeds trigger schema post-move). |
| 65 | `AGENT_SESSION_PROMPT_MODES` | none external | SIMPLIFY | Unexport; schema-internal. |
| 66 | `AGENT_SESSION_REQUEST_STATUSES` | none external | MERGE → agent-orchestration | Its request table's vocabulary. |
| 67 | `taskSessionRequestInputSchema` | none external | SIMPLIFY | Unexport; branch of the kept union schema. |
| 68 | `assistantSessionRequestInputSchema` | none external | SIMPLIFY | Same. |
| 69 | `routineSessionRequestInputSchema` | none external | SIMPLIFY | Same. |
| 70 | `knowledgeSessionRequestInputSchema` | none external | SIMPLIFY | Same. |
| 71 | `proposedCallSessionRequestInputSchema` | none external | SIMPLIFY | Same. |
| 72 | `agentSessionRequestInputSchema` | agent-orchestration ×2 | KEEP | The intake contract. |
| 73 | `TASK_STATE_TRANSITIONS` | core-api ×1 | MERGE → core-api/work | Task state machine data. |
| 74 | `HOST_KINDS` | core-api ×1 | KEEP | Derives shared HostKind; server zod. |
| 75 | `MESSAGE_TYPES` | core-api ×1 | KEEP | Same for MessageType. |
| 76 | `VERDICT_DECISIONS` | core-api ×1 | KEEP | Same for VerdictDecision. |
| 77 | `ARTIFACT_VIEW_SHAPES` | agent-orchestration + core-api | KEEP | Two-sided. |
| 78 | `TRIGGER_EVENT_TYPES` | internal | MERGE → core-api/settings | Trigger module moves whole. |
| 79 | `TRIGGER_RESULT_STATES` | internal | MERGE → core-api/settings | Same. |
| 80 | `TriggerRuleValueSchema` | core-api ×2 | MERGE → core-api/settings | Same. |
| 81 | `CURRENCY_CODES` | DEAD | DELETE | Dead Money library. |
| 82 | `CURRENCY_SCALE` | DEAD | DELETE | Same. |
| 83 | `TASK_STATES` | core-api ×2 | KEEP | Core vocabulary, server zod. |
| 84 | `TASK_STATE_LABEL` | core-ui ×2 | KEEP | Label registry — eslint-plugin-design's no-local-status-builder points here. |
| 85 | `MUTABLE_BET_FIELDS` | DEAD | DELETE | Dead mirror; bet-state-machine.MUTABLE_FIELDS is the live copy. Doc comment claiming route usage is false. |
| 86 | `KERNEL_KNOWLEDGE_STATUSES` | agent-orchestration ×1 | KEEP | Derives shared KernelKnowledgeStatus. |
| 87 | `BET_STATUSES` | core-api + core-ui | KEEP | Core vocabulary. |
| 88 | `BET_STATUS_LABEL` | core-ui ×2 + design-system | KEEP | Label registry. |
| 89 | `MODEL_TIERS` | 4 packages | KEEP | Core vocabulary. |
| 90 | `AGENT_CATEGORIES` | core-api ×1 | KEEP | Derives shared AgentCategory. |
| 91 | `USER_KINDS` | DEAD | DELETE | Zero imports. |
| 92 | `ORG_EDGE_MECHANISMS` | core-api ×1 | MERGE → core-api/org | Single owner. |
| 93 | `SCOPE_KINDS` | 3 packages | KEEP | Shared. |
| 94 | `SCOPES_REQUIRING_ID` | 3 packages | KEEP | Shared. |
| 95 | `BET_OUTCOME_VERDICTS` | core-api + core-ui | KEEP | Core vocabulary. |
| 96 | `BET_OUTCOME_VERDICT_LABEL` | core-ui + design-system | KEEP | Label registry. |
| 97 | `TASK_OUTCOME_VERDICTS` | core-api ×1 | KEEP | Core vocabulary. |
| 98 | `TASK_OUTCOME_VERDICT_LABEL` | core-ui ×1 | KEEP | Label registry. |
| 99 | `AGENT_OPERATIONAL_STATUS_LABEL` | core-ui ×2 | KEEP | Label registry. |

## Holes this leaves

- **Five dead events + dispatcher cases**: `core-api/src/observability/dispatcher.ts` loses five cases; the `DomainEvent` union shrinks. No runtime behavior changes — nothing emitted them.
- **`VersionConflictError` delete**: `error-handler.ts` must drop the dead `instanceof` and rely on (or import) core-api/knowledge's real class. Behavior today already flows through the `err.name` fallback, so nothing user-visible changes — but the middleware should stop pretending the instanceof works.
- **`UserRole` delete**: 9 production files change an import to `string`. Any future closed role enum would be a new decision, which is correct — the current type falsely implies one exists.
- **blocks/types.ts → block-derivation**: design-system and core-ui gain an import edge on `@hyperidle/block-derivation`; the framework-surfaces/reach declarations need updating. If governance forbids design-system→block-derivation, the fallback is keeping blocks/types in the slim shared core — the DELETE/SIMPLIFY rows are unaffected.
- **events.ts → event-bus**: every subscriber file changes an import path (large mechanical diff, zero behavior). `framework/db`'s intent-kind parity test follows the vocabulary to its new home.
- **`AgentBehaviorConfigErrorResponse` → ApiErrorResponse**: the settings route's error body loses nothing — the shapes are identical.
- **Money library delete**: if a future cost feature returns, it starts from its own design, not from an unexercised bigint library whose only proof of correctness is its own unit tests.
- **Misfiled test**: `framework/domain-model/src/http/__tests__/rate-limit.test.ts` tests `@hyperidle/http-middleware`'s rate limiter — it should move to http-middleware regardless of the rest of this verdict (the whole `src/http/` dir in domain-model contains nothing but that test).


---

# event-bus — destroyer verdict (framework)

## Where does this package go?
**Verdict: STAYS SHARED — the one genuine case in this batch; but half its method surface dies**

What it does beyond an emitter: three real things Node's `EventEmitter` does not give —
typed subscriptions over the `DomainEvent` union, per-handler error isolation (one throwing
subscriber cannot break durability-critical subscribers registered after it — the I1 lesson), and
a `*` wildcard used by exactly one production consumer (the observability dispatcher,
`dispatcher.ts:471`). That is a justified ~100-line class, not ceremony.

Why it genuinely cannot dissolve:
- **Instantiated by four independent production composition points across two layers and two
  applications**: `applications/desktop/create-server.ts:162`, `applications/remote-server/
  create-server.ts:241`, `layers/core-api/src/app.ts`, `layers/agent-orchestration/src/services/
  run-orchestration-composition.ts:399,540` (+ `start-runtime.ts:55` fallback). No single consumer
  owns it.
- **Typed on by ~80 production files** across core-api, agent-orchestration, and two framework
  protocol packages (`harness-protocol`, `tool-protocol`) — type-only imports, but they name the
  class.
- **The one plausible dissolve target — `domain-model`, where its event types live — is blocked by
  a hard fact**: the bus imports `@hyperidle/diagnostics` for its handler-failure logger, and the
  universal type package must stay dependency-free. Moving the class there poisons every
  type-only consumer with a runtime dependency.

AU29 took framework packages off the bus — that shrank subscribers, not this package's
justification: the bus's consumers are layers and apps, and they remain plural. So: STAYS SHARED,
with every consumer named above. What each owning its own copy would break: two bus classes means
two event unions drifting and the cross-layer emit/subscribe seam (core-api emits, orchestration
subscribes and vice versa) stops type-checking as one system.

The garbage is inside the class, not around it: `once` has ZERO production callers (`rg -a "\.once\("`
finds only Node `process`/`child`/`httpServer` calls and the bus's own test), and `off` is never
called directly in production — it is reached only through the unsubscribe closures `on` returns
(`dispatcher.ts:471` `unsub`). And the lazy `getLogger()` dance exists, per its own comment, to
accommodate `vi.mock` hoisting — production code shaped by a test, which the founder has already
ruled against.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `applications/desktop`, `applications/remote-server` | `EventBus` class (instantiate) | No — composition roots of a shared instance |
| `layers/core-api` (app.ts + ~60 files) | class + type | No — co-equal producer/subscriber with orchestration |
| `layers/agent-orchestration` (composition, start-runtime + ~20 files) | class + type | No — same |
| `framework/harness-protocol`, `framework/tool-protocol` | `type EventBus` only | They just name the seam type |
| `tools/eval` (dev world) | class | Dev-only, follows production |

## If written today, from scratch
The same class, minus `once`, with `off` private (the unsubscribe closure is the API), and a plain
module-level `createLogger` call with tests observing the real logger instead of mocking module
internals. `on` (typed + `*`), `emit`, done.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 4 |
| MERGE | 1 |
| SIMPLIFY | 0 |
| KEEP | 3 |
Surface: 8 public method rows → 3 (on typed, on wildcard, emit) — 62% cut

## Feature-level kills
- **`once` semantics**: no production feature has ever wanted exactly-one delivery. Dies with its
  test block. Nothing breaks.
- **Public unsubscription by handler reference (`off`)**: dies as public API. The returned-closure
  pattern is the one way to unsubscribe (already the only way used). Internal removal logic
  survives as a private method.
- **Test-shaped lazy logger**: fold `getLogger()` into a module-level `const logger = createLogger(...)`
  and let the bus's tests assert on observable delivery, not on a mocked logger. (Noted here;
  belongs to whoever executes the kills.)

## Full method audit
| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `EventBus.on` (typed overload) | BOOTSTRAP — every subscriber wiring in core-api + agent-orchestration composition | KEEP | The subscription seam of the whole system; typed against the DomainEvent union, which is the package's core value. |
| 2 | `EventBus.on` (`"*"` overload) | BOOTSTRAP — one production consumer: observability `dispatcher.ts:471` | KEEP | The observability pipe is a wildcard by nature; one real consumer is enough for an overload that costs 4 lines. |
| 3 | `EventBus.on` (implementation signature) | INTERNAL | MERGE | Not a third method — the overloads' shared body. Counted once with rows 1–2. |
| 4 | `EventBus.off` (typed overload) | INTERNAL — only via the unsubscribe closure `on` returns | DELETE | Zero direct production callers. Make removal private; the closure is the API. |
| 5 | `EventBus.off` (`"*"` overload) | INTERNAL — same closure path | DELETE | Same. |
| 6 | `EventBus.off` (implementation signature) | INTERNAL | DELETE | Dies with rows 4–5; survives only as a private helper. |
| 7 | `EventBus.once` | TEST-ONLY (`event-bus.test.ts:165` is the only caller in the repo) | DELETE | Dead API plus the test that keeps it warm. |
| 8 | `EventBus.emit` | Every door — all UI routes, agent tools, and schedulers emit through it after DB durability | KEEP | The delivery mechanism; synchronous-after-durability is the at-least-once contract the system leans on. |

## Holes this leaves
- Any future subscriber wanting one-shot delivery writes the 3-line self-unsubscribing wrapper at
  its own call site. Priced at zero — nobody has wanted it yet.
- External code can no longer detach a handler it did not register (no public `off`). No production
  code ever did.


---

# factory-defaults — destroyer verdict (framework)

## Where does this package go?

**Verdict: DISSOLVE → `layers/core-api`** (scaffold resolution into the org/teams service beside `persistScaffoldedAgents`; the roster seed inlined into `bootstrap/factory-state.ts`; the template reader beside its route). Package deleted.

The package is three unrelated things stapled together by the word "defaults":

1. **Scaffold-spec resolution** (`resolveAgentScaffoldSpecs`) — this is agent-identity logic. The org destroyer already ruled `persistScaffoldedAgents` the single writer of agent identity and keeps it in the teams service. The resolver is that writer's other half and belongs next to it. The only reason it sits in framework is that `tool-handlers` (agent-orchestration) calls it locally before pushing specs through the `persistScaffoldedAgents` seam — whose `specs` param is already opaque `Record<string, unknown>[]` (`tool-definitions.ts:1031-1049`). Widen the seam to accept the scaffold *request* and resolve inside core-api, and orchestration stops doing core-api's job (orchestration is a blind executor — it should hand over the request, not compose identity specs). After that, agent-orchestration imports **nothing** from this package.
2. **The factory roster seed** (`defaultFactoryRoster` + 4 types + `COMMUNITY_DISPLAY_NAMES`) — consumed by exactly one production file, `layers/core-api/src/bootstrap/factory-state.ts`, which **hardcodes** `const roster = defaultFactoryRoster`. The celebrated AK6 "registry-free roster injection seam" has never injected anything: one value, zero alternative rosters, the consumer reads the const directly. An abstraction with one value that is never passed is a literal wearing a seam costume. Inline what survives of the literal into `factory-state.ts`.
3. **System-prompt template reading** (`readSystemPromptTemplateForRole` + map) — consumed by core-api (`GET /api/agents/templates/:role` + scaffold), by agent-orchestration's bootstrap backfill (dies below), and by `tools/setup/demo-fixture.ts` (tooling importing a layer face is already the sanctioned pattern — `factory-state.ts`'s own header says so). Lands in core-api.

`tools/setup` and the desktop app reach everything through the core-api faces they already call (`applyFactoryCoreState`, `runFactoryBootstrap`). No consumer needs a framework package to exist.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/factory-defaults" layers framework applications tools` — production files only:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/src/bootstrap/factory-state.ts` | `COMMUNITY_DISPLAY_NAMES`, `defaultFactoryRoster`, `FactoryAgentRef` | Yes — sole consumer of all three; inline. |
| `layers/core-api/src/routes/users.ts` | `resolveAgentScaffoldSpecs`, `AgentScaffoldSpec` | Yes — core-api. |
| `layers/core-api/src/routes/teams-routes.ts` | `resolveAgentScaffoldSpecs` | Yes — core-api. |
| `layers/core-api/src/routes/assistant.ts` | `resolveAgentScaffoldSpecs` | Yes — core-api. |
| `layers/core-api/src/routes/agents.ts` | `readSystemPromptTemplateForRole` | Yes — core-api. |
| `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` | `resolveAgentScaffoldSpecs` | Doesn't need it — widen the `persistScaffoldedAgents` seam to take the request; resolution is core-api's job. |
| `layers/agent-orchestration/src/factory-run-config.ts` | `FactoryAgentRef`, `readSystemPromptTemplateForRole`, `SYSTEM_PROMPT_TEMPLATE_FILES` | Doesn't need it — the template backfill loop only ever matched facilitators (the assistant deliberately has no template); dies with the facilitator kill. `FactoryAgentRef` inlines as `{id, role}`. |
| `tools/setup/src/demo-fixture.ts` | `readSystemPromptTemplateForRole` | Imports the core-api face — same sanctioned tooling→layer-face reach `runFactoryBootstrap` already uses. |

Note `layers/core-api/org/src/scaffold-agents.ts` already **redeclares `AgentScaffoldSpec` locally** (its own header admits it: "structurally identical") — the package's export is a duplicate of a type the owning service already carries.

## If written today, from scratch

Three symbols, zero packages:

- `resolveAgentScaffoldSpecs` + `AgentScaffoldSpec` — inside the agent-identity (org/teams) service, behind the `persistScaffoldedAgents` seam.
- `readSystemPromptTemplateForRole` — in core-api beside its route; map module-internal.
- A six-line assistant seed literal inside `factory-state.ts`.

No roster spec types, no injection seam, no facilitators, no display-name table, no shared `{id, role}` interface.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 2 |
| SIMPLIFY | 1 |
| KEEP | 1 |

Surface: 11 exports → 0 exports (package deleted; 3 symbols survive, relocated into core-api).

## Feature-level kills

**1. The 5-facilitator factory pre-seed — whole feature, DELETE.**
Every fresh install seeds five "facilitator" agents, one per "community of practice" (build/product/growth/ops/facilitation). Nobody asked for them and the concept has no product surface: `rg -i "community|communities"` across `applications/` and `layers/core-ui/` finds **zero** UI references (one unrelated comment). Their only production job is owning the two builtin knowledge sweeps (`routine-scheduler.ts:151,162`, `ownerRole: "facilitator"`) — the builtin-routine subsystem the **routine destroyer already convicted** (second execution path bypassing the agent-run architecture; per-team seeding of global sweeps firing N duplicate runs). The kills compound: their DELETE removes the facilitators' only job; this DELETE removes the orphaned owners. What breaks: `tools/eval` scenarios and the demo world hardcode `seed-agent-pf-facilitation` (`tools/eval/src/seeding.ts:520`, `tools/eval/src/scenarios/builtin-routines.ts:72`, `tools/setup/src/demo-world/ids.ts:22`) — tooling follows the product, repoint or seed locally. The `facilitator` *role* stays in `AGENT_ROLE_CATALOG` and its `facilitator.md` template stays servable — a user who wants a facilitator creates one; the factory stops force-installing five.

**2. The AK6 roster-injection seam — DELETE.**
`FactoryRosterSpec` / `FactoryFacilitatorSpec` / `FactorySystemAssistantSpec` have zero external importers (the one `FactoryRosterSpec` hit outside the package is a doc comment in `scaffold-agents.ts:24`). The "seam" was never injected — `factory-state.ts` hardcodes the default. Types that exist only to type one literal die with the literal's inlining.

**3. The run-config template backfill — DELETE (collateral).**
`factory-run-config.ts:49-56` iterates `SYSTEM_PROMPT_TEMPLATE_FILES` to backfill prompts onto roster agents. With facilitators gone the roster is one assistant, which is deliberately **not** in the map (the lore in `system-prompt-templates.ts:19-23` preserves that 404), so the loop writes nothing, ever. `applyFactoryRunConfigDefaults` shrinks to one AH2-defaults write for the assistant.

**4. Orchestration-side scaffold resolution — MERGE behind the seam.**
`create_team` / `add_agent` tool handlers resolve specs locally, spread-widen them to dodge the opaque seam type, then push them through `persistScaffoldedAgents` (`tool-definitions.ts:1036,1131`). Seam takes the request; core-api resolves. Deletes the widening dance and the AU21 F1 apology comments with it.

**Survives on evidence — the assistant seed.** `seed-agent-cos` is load-bearing: `coach.ts:43` hardcodes `COC_AGENT_ID = "seed-agent-cos"`, `knowledge/src/factory-seed.ts:31` stamps it as `updatedBy`, `builtin:portfolio-retro` runs as `ownerRole: "assistant"`. One seeded system agent is the honest factory state.

**Sibling cross-checks (as tasked):**
- **settings destroyer** (drop `plugins` + `plugin_configuration_defaults` tables): factory-defaults feeds neither — `rg -a -i "plugin" framework/factory-defaults/src/` = zero hits. No coupling; their kill and this one are independent.
- **routine destroyer** (per-team seeding of duplicate global sweeps): this package seeds no routines, but it seeds the two facilitator **owners** of the convicted sweeps. See feature kill 1 — the verdicts compound, in the same direction.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `resolveAgentScaffoldSpecs` | function | UI:POST /api/teams, UI:POST /api/users, UI:GET+PATCH /api/users/:userId/assistant, AGENT:create_team, AGENT:add_agent | MERGE | Agent-identity logic; folds into the org/teams service beside `persistScaffoldedAgents`, resolution moves behind the seam so orchestration hands over requests, not specs. |
| 2 | `readSystemPromptTemplateForRole` | function | UI:GET /api/agents/templates/:role (AgentEditor, AgentAddDialog, AgentDetailPane) + scaffold paths + demo fixture | KEEP | Core value: agent personas from `docs/system-prompts/` behind a live UI door; relocates to core-api, traversal-closed allowlist unchanged. |
| 3 | `AgentScaffoldRequest` | interface | INTERNAL — zero external importers; callers pass literals | DELETE | An exported request shape nobody imports; a 7-field union where every call null-pads 4 fields — fold into per-trigger parameters when the resolver moves. |
| 4 | `AgentScaffoldSpec` | interface | users.ts, tool-definitions.ts, org (redeclared locally) | MERGE | The owning service already carries a structurally identical local copy (`org/src/scaffold-agents.ts:75`); make that the single declaration, delete this duplicate. |
| 5 | `FactoryFacilitatorSpec` | interface | INTERNAL — types the literal only | DELETE | Dies with the facilitator pre-seed; zero external importers even today. |
| 6 | `FactorySystemAssistantSpec` | interface | INTERNAL — types the literal only | DELETE | Two fields typing one inlined literal; zero external importers. |
| 7 | `FactoryRosterSpec` | interface | INTERNAL — only non-package mention is a doc comment | DELETE | The AK6 injection seam that never injects; `factory-state.ts` hardcodes the value it pretends to receive. |
| 8 | `FactoryAgentRef` | interface | BOOTSTRAP (factory-state.ts → factory-run-config.ts handoff) | DELETE | A `{id, role}` pair does not justify a package hop — inline the structural type in each face; duplicating two fields beats importing them. |
| 9 | `COMMUNITY_DISPLAY_NAMES` | const | BOOTSTRAP (factory-state.ts only) | DELETE | Display names for a communities-of-practice concept with zero UI surface; dies with the facilitators. |
| 10 | `defaultFactoryRoster` | const | BOOTSTRAP (factory-state.ts only, hardcoded) | SIMPLIFY | Shrinks from 5 facilitators + assistant to the assistant singleton (`seed-agent-cos` is load-bearing: coach.ts:43, knowledge factory-seed:31) and inlines into `factory-state.ts`. |
| 11 | `SYSTEM_PROMPT_TEMPLATE_FILES` | const | factory-run-config.ts backfill loop (dead with facilitators) + tests | DELETE | Export dies: sole surviving caller is `readSystemPromptTemplateForRole` in-module; the backfill loop it feeds can never match the assistant-only roster by design. |

## Holes this leaves

- **Fresh installs seed 1 agent, not 6.** No facilitators in the agent list on first boot. Anyone who wanted one creates one from the role catalog — template intact.
- **If the founder rejects the routine destroyer's builtin-routine kill**, the two knowledge sweeps lose their owners. Repair is one line each: `ownerRole: "assistant"` in `routine-scheduler.ts:151,162`. Still no reason to seed five agents.
- **Seam signature change.** `persistScaffoldedAgents` (Mechanism C seam + its api-contract mirror) widens to accept the scaffold request; `tool-definitions.ts` create_team/add_agent shrink. Mechanical, and a net deletion.
- **Tooling repoints.** `tools/eval/src/seeding.ts` + `scenarios/builtin-routines.ts` and `tools/setup/src/demo-world/ids.ts` reference `seed-agent-pf-facilitation` — eval/demo must seed their own facilitator or repoint to the assistant.
- **Tests die with the package.** `framework/factory-defaults/src/__tests__/` (3 files) delete; roster/map assertions in `factory-and-demo`, `AF17-factory-bootstrap`, `X3-agent-config-bootstrap`, `X3-agents` integration tests shrink to the assistant-only seed.
- **One import-shape change for tooling.** `demo-fixture.ts` imports the template reader from a core-api face instead of a framework package — the pattern `runFactoryBootstrap` already uses.


---

# filesystem-contract — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `@hyperidle/filesystems` (layers/agent-orchestration/filesystems)**

This is the textbook case the framework brief warns about: 160 lines, zero functions, zero classes,
12 types + 4 consts. A contract package whose two "seam" interfaces each have effectively **one or
zero real implementations**:

- `FilesystemMounter` — exactly one production implementation (`RegistryFilesystemMounter`,
  `layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts:290`). One implementation
  is indirection, not abstraction.
- `FilesystemAuthResolver` — two "implementations", both inline objects in ONE file
  (`layers/agent-orchestration/src/routes/filesystems.ts:124-149`), and both hardcode
  `resolve: () => null` and `sourceOf: () => null`. Half the interface is a ritual that returns null
  by construction. Only `resolveToken` does anything.
- `FilesystemAuth` — **never constructed in production** (both `resolve()` impls return literal
  null) and **never read** (the mounter passes `auth` through at mounter-registry.ts:302 and no
  adapter touches it; the only production `mount()` call hardcodes `auth: null` at
  `run-orchestration/src/filesystem-provisioning.ts:103`). The entire auth seam — the reason this
  package claims to exist as a "contract" — is dead wire.

The only genuinely shared thing in the package is the `Filesystem` wire type (4 production
consumers). Its owner is obvious: the `filesystems` service, which owns the registry, the tables,
the reachability lifecycle, and already has the `ports.ts` structural-port pattern the survivors
slot into. Everything else inlines into its single reader or dies.

Note: sibling destroyers are auditing `filesystems` and `filesystem-mounting` and one may recommend
merging them. This verdict stands either way — the target is the service that owns the Filesystem
noun; if they merge, that merged service is the target.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/filesystem-contract" layers framework applications tools` — 9 production
files (rest are tests/package.json/comment-only mentions):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/agent-orchestration/src/routes/filesystems.ts` | `Filesystem`, `FilesystemAuthResolver` (types); `FILESYSTEM_KINDS`, `WRITEBACK_MODES` (Zod enums) | Yes — it is the ONLY reader of both consts, and it defines both resolver impls |
| `layers/core-api/src/routes/filesystems.ts` | `FilesystemInjection` (one `satisfies`) | Doesn't need it — `FilesystemInjectionRow` from `@hyperidle/db` is the identical shape |
| `layers/agent-orchestration/filesystems/src/filesystem-reachability.ts` | `FilesystemAuthResolver`, `FilesystemState` (types) | Yes — only uses `resolveToken`; its own `ports.ts` is the house home for both |
| `layers/agent-orchestration/run-orchestration/src/filesystem-provisioning.ts` | `Filesystem`, `FilesystemMounter` (types) | Already declares structural mirrors locally (house pattern, see its own header comment) |
| `layers/agent-orchestration/run-orchestration/src/provisioner.ts` | `Filesystem`, `FilesystemMounter` (types) | Same — structural port |
| `layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts` | `Filesystem`, `FilesystemAuth`, `FilesystemMounter`, `MountResult`, `CaptureResult` | Yes — it is the sole implementor; all but `Filesystem` become its local types |
| `layers/agent-orchestration/src/boot.ts` | `FilesystemMounter` (type, composition root) | Uses the concrete `RegistryFilesystemMounter` on the next line — type import is redundant |
| `framework/db/src/schema.ts` | comment mention only (line 1254) | n/a |
| `layers/core-ui/src/settings/SettingsFilesystems.tsx` | comment mention only (line 19) — the UI already hand-mirrors the wire shape | n/a — proof the type never needed to be shared with the UI |

Zero consumers in `applications/` or `tools/`. The `.stories.tsx` files redefine `FilesystemKind`/
`WriteBack` locally rather than import them — even the stories didn't want this package.

## If written today, from scratch

One declaration, living in the owning service:

- `Filesystem` (wire/domain type) → `@hyperidle/filesystems`, with `kind: string`,
  `source: string` (the `(typeof X)[number] | (string & {})` dance is just `string`), and
  `resourceRef` inlined as the discriminated union.
- `FILESYSTEM_KINDS` / `WRITEBACK_MODES` → inline literals in the create route's Zod enums — their
  only reader.
- The reachability token hook → `resolveToken: (connectionId: string) => Promise<string | null>` as
  a plain function field in `filesystems/src/ports.ts`, next to `FilesystemsServiceConnectionResolver`
  which already lives there for exactly this reason.
- The mounter port → run-orchestration declares the two-method structural shape it needs (exactly
  as it already does for `InjectedFilesystemsReaderPort`); `RegistryFilesystemMounter` satisfies it
  structurally. No shared interface.

The package `framework/filesystem-contract` is deleted.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 8 |
| MERGE | 7 |
| SIMPLIFY | 1 |
| KEEP | 0 |

Surface: 16 exports → 1 surviving shared declaration (`Filesystem`, relocated into
`@hyperidle/filesystems`) + inline remnants (94% cut of the shared surface; the package dies).

## Feature-level kills

**The Connection-auth mount seam (`FilesystemAuth` + `FilesystemAuthResolver.resolve/canResolve/sourceOf`).**
Designed in AO1 for AN to fill in; AN filled in a different, simpler path instead (`resolveToken` →
raw token → `GIT_CONFIG` injection, per the AO1 v2 lore in the file itself). The provision-mode
union (`git-credential` / `env` / `none`) has zero producers and zero readers. What breaks: nothing
— production behavior is already "mount runs with `auth: null`, always." This deletion turns a
pretend capability into an honest absence. When authenticated mounts are actually needed, the
proven `resolveToken` path extends to the mounter as a token string — no mode union required.

**The mount result ceremony (`MountResult.sandboxPath`, `CaptureResult`).** `mount()`'s caller reads
`success` and `error` only; `sandboxPath` on the result is write-only. `captureBack()`'s only
external caller (`provisioner.ts:642`) ignores the return value entirely; `captured` is read once,
inside the implementor itself, for the provenance insert. What breaks: nothing.

## Full export audit

Reach evidence: `rg -a` over `layers framework applications tools`; graph cross-check where the
symbol is a value (`trace-uses FILESYSTEM_SOURCES` → "nothing references"). The graph is type-blind,
so type rows rest on the rg sweep.

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `FilesystemKind` | type | INTERNAL (no external importer; stories redefine their own copy) | MERGE | `(string & {})` open vocab = `string`; fold into `Filesystem.kind: string`. |
| 2 | `WriteBack` | type | INTERNAL (no external prod importer) | MERGE | Inline the 3-literal union on `Filesystem.writeback`. |
| 3 | `FilesystemState` | type | UI:GET /api/filesystems/:id via `resolveFilesystemState` (filesystems/filesystem-reachability.ts:4) | MERGE | One prod importer, the filesystems service — declare it there, next to the function that returns it. |
| 4 | `FilesystemSource` | type | DEAD (zero references outside its own file) | DELETE | Effectively `string`; `Filesystem.source: string`. |
| 5 | `ResourceRef` | type | INTERNAL (only ref outside the package is a schema.ts comment) | MERGE | Inline the union into the `Filesystem` declaration — nobody names it independently. |
| 6 | `Filesystem` | interface | UI:GET/POST /api/filesystems (routes serialize) + SCHED/session-provisioning (run-orchestration builds, filesystem-mounting reads) | SIMPLIFY | The one real shared type. Moves to `@hyperidle/filesystems`; `kind`/`source` degrade to `string`, `resourceRef` inlines. |
| 7 | `FilesystemInjection` | interface | UI:POST /api/agents/:id/filesystems (core-api/src/routes/filesystems.ts:116, one `satisfies`) | DELETE | Byte-identical to `FilesystemInjectionRow` (`@hyperidle/db`, all-text columns incl. `createdAt`). A duplicate of a row type is not a contract. |
| 8 | `FilesystemAuth` | interface | DEAD (never constructed — both `resolve()` impls return null; never read — mounter passes it through, no adapter touches it; sole mount call passes literal `null`) | DELETE | The package's flagship concept is dead wire. Delete the interface, its provision union, and the `auth` param off `mount()`. |
| 9 | `FilesystemAuthResolver` | interface | UI:POST /api/filesystems (built per-request in agent-orchestration routes:124, consumed by reachability) | DELETE | Interface dies; the one live member survives as a plain function field in filesystems' `ports.ts`. Member breakdown below. |
| 9a | `FilesystemAuthResolver.canResolve` | member | TEST-ONLY (one caller: AO1-reachability-lane-b test:190) | DELETE | Dead code plus a test assertion that dies with it. |
| 9b | `FilesystemAuthResolver.sourceOf` | member | UI:POST /api/filesystems (routes:210) — but both impls hardcode `null` | DELETE | Every call returns null and falls through to `sourceHint`. A member that cannot return a value is not a member. Delete the call too. |
| 9c | `FilesystemAuthResolver.resolve` | member | DEAD (zero callers; both impls hardcode `null`) | DELETE | Existed to produce `FilesystemAuth` (#8), which is also dead. |
| 9d | `FilesystemAuthResolver.resolveToken` | member | UI:GET /api/filesystems/:id + POST register (reachability probe, filesystem-reachability.ts:101) | MERGE | The only live member. Becomes `resolveToken: (connectionId) => Promise<string \| null>` in `filesystems/src/ports.ts`. |
| 10 | `MountResult` | interface | INTERNAL to the mount call (implementor names it; caller reads `success`/`error` structurally) | MERGE | Local type in filesystem-mounting, shrunk to `{ success, error? }` — `sandboxPath` is write-only. |
| 11 | `CaptureResult` | interface | INTERNAL (return value ignored by the only external caller, provisioner.ts:642; `captured` read only inside mounter-registry:326) | DELETE | `captureBack` returns `Promise<void>`; the provenance branch stays internal. |
| 12 | `FilesystemMounter` | interface | BOOTSTRAP (boot.ts:287 DI slot) + session-provisioning consumers | DELETE | One implementation = indirection. run-orchestration declares its own structural mounter port (its existing pattern); boot passes the concrete `RegistryFilesystemMounter`. |
| 13 | `FILESYSTEM_KINDS` | const | UI:POST /api/filesystems (Zod enum, agent-orchestration routes:31 — sole prod reader) | MERGE | Two literals, one reader. Inline into the route's Zod enum. |
| 14 | `WRITEBACK_MODES` | const | UI:POST /api/filesystems (Zod enum — sole prod reader; SetupFlow/stories mentions are comments/local copies) | MERGE | Three literals, one reader. Inline into the route's Zod enum. |
| 15 | `SUBSTRATE_STATES` | const | DEAD (zero references outside the package; only derived `FilesystemState`) | DELETE | Inline the union in the relocated `FilesystemState`. |
| 16 | `FILESYSTEM_SOURCES` | const | DEAD (rg zero + graph zero) | DELETE | Never read anywhere, ever — not even to derive a useful type (`FilesystemSource` is `string` anyway). |

## Types / DI ports

Covered above — the package IS its type/port surface (rows 1-12).

## Holes this leaves

1. **Authenticated mounts stay impossible — but they already are.** Deleting `FilesystemAuth` and
   `mount()`'s `auth` param codifies today's behavior (`auth: null` hardcoded at the only call
   site). Mounting a private repo cannot authenticate now and cannot after. When someone actually
   needs it, extend the mounter with a raw token (the `resolveToken`/`GIT_CONFIG` path reachability
   already proved) — do not resurrect the provision-mode union.
2. **`Filesystem` needs a home reachable by filesystem-mounting.** Either filesystem-mounting
   imports the type from `@hyperidle/filesystems` (new service→service type edge — governance must
   allow it) or it declares a structural mirror like run-orchestration does. If the sibling
   destroyers merge the two services, the question evaporates.
3. **AO1 tests break.** `AO1-filesystem-reachability.test.ts`, `AO1-reachability-lane-b.integration.test.ts`,
   and `AO1-filesystems.integration.test.ts` import the interface/consts and mock `canResolve`/
   `resolve` — they must shrink to the `resolveToken`-only port. The `canResolve` assertion at
   lane-b:190 dies with the member, correctly: it tests a ritual.
4. **`(string & {})` forward-compat vanishes into plain `string`.** No functional loss — writes are
   gated by the Zod enum, reads were always effectively open.
5. **`docs/process-layer/canonical-shapes.md` and the AO1 lore comments** reference the contract
   package as the wire types' home; they need a pointer update to `@hyperidle/filesystems`.


---

# harness-capability — destroyer verdict (framework)

## Where does this package go?

**Verdict: DISSOLVE → `framework/harness-protocol`** (the one runtime function dissolves the other way, into `core-ui`).

This package is not a package. It is 13 type declarations, 1 const, and one 9-line function.
`harness-protocol` — the adapter contract — imports six of the thirteen types to define its own
surface (`HarnessAdapter`, `HarnessCapabilities`, the read-model). The two packages describe one
noun: *what a harness is and can do*. They were split in AU34 solely to break an import cycle;
inside one package that cycle is just file imports, and the file-level graph is already acyclic
(the AU34 lore in `harness-capability-descriptor.ts` says so itself). A package boundary whose
only job is cycle bookkeeping is tidiness, not core value.

The one reason this package exists apart from harness-protocol: `core-ui` and `conversation-parts`
want descriptor types without the adapter machinery. But every one of their imports is
`import type` — zero runtime cost, tree-shaken to nothing. Keeping a whole package so a UI
`package.json` stays prettier is exactly the invented boundary the brief names.

**On the three-package question (harness-capability / harness-protocol / tool-protocol):**
harness-capability and harness-protocol are **one thing** — merge them, no hesitation; the
capability descriptor is a projection of the adapter's `getCapabilities()` and the two types
(`HarnessRuntimeCapabilities` vs `HarnessCapabilities`) are the same flags declared twice.
tool-protocol is a different noun (tools, not harnesses) — I make no claim it must join; if the
tool-protocol destroyer also lands on harness-protocol as home, fine, but the hard, evidenced
edge is capability↔protocol.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/harness-capability"` → 8 production consumers (rest are tests/stories):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `framework/harness-protocol` (harness-adapter.ts, read-model) | `HarnessAccessMode`, `HarnessAuthActionDescriptor`, `HarnessDiscoveryStatus`, `HarnessModelDescriptor`, `ReturnEnforcementChannel`, `HarnessCapabilityDescriptor` | **Yes — this is the dissolve target.** It already embeds these types in its own contract. |
| `layers/agent-execution/harness-registry` (5 files) | `HarnessCapabilityDescriptor`, `ReturnEnforcementChannel`, `HarnessReadinessState`, `HarnessAuthActionDescriptor`, `HarnessModelDescriptor`, `HarnessRuntimeCapabilities`, `HarnessDiscoveryStatus` | No — execution layer; core-api/core-ui may not import it (Mechanism B). Imports harness-protocol already. |
| `layers/agent-execution/src/boot.ts` | `ReturnEnforcementChannel` (type) | No — same. |
| `layers/agent-orchestration/run-orchestration/provisioner.ts` | `ReturnEnforcementChannel` (type) | No — same. |
| `layers/core-api/routes/harnesses.ts` | `HarnessCapabilityDescriptor` (type) | No — it is the wire producer, not the owner. Already reaches harness-protocol for the read-model. |
| `layers/core-ui` (7 files) | `HarnessCapabilityDescriptor` (type), `derivePrimaryHarness` (runtime) | Owns `derivePrimaryHarness` (sole caller: SetupFlow). Types come from harness-protocol as `import type`. |
| `framework/conversation-parts/part.ts` | `HarnessCapabilityDescriptor`, `HarnessModelOptionDescriptor` (types, for `deriveComposerPills`) | Moot — `deriveComposerPills` is producer-less dead machinery (see feature kill #1). |
| `framework/domain-model` | none (reverse: harness-capability imports `ModelProvider`, `PrimaryHarnessConfig` from it) | — |

Three of eight consumers import exactly one type each. This is not a shared package; it is six
symbols in the wrong file.

## If written today, from scratch

One file in `framework/harness-protocol` next to `harness-adapter.ts`:

- `HarnessCapabilityDescriptor` — the GET /api/harnesses wire DTO (shrunk: no `accessMode`, no
  `runtime`, one `modelProviders`)
- `HarnessDiscoveryStatus` + `HarnessReadinessState` — drives row greying and the disable toggle
- `HarnessAuthActionDescriptor` — drives the auth CTA (kind, label, command only)
- `HarnessModelDescriptor` — drives the model pickers (id, label, provider, selectable only)
- `ReturnEnforcementChannel` — 5 members, the one capability the system genuinely branches on
- `derivePrimaryHarness` → a private helper inside `core-ui/src/pages/SetupFlow.tsx`

The package `framework/harness-capability` does not exist.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 2 |
| SIMPLIFY | 4 |
| KEEP | 2 |

Surface: 15 exports → 6 exports (60% cut). Package count: −1. Survivors all relocate into
`harness-protocol`; nothing keeps its own package.

## Feature-level kills

**1. Per-model composer option pills — machinery on both ends of the wire, nothing in the middle.**
`HarnessModelOptionDescriptor` / `HarnessModelOptionControl` / `HarnessOptionChoice` /
`HarnessOptionControlKind` / `HARNESS_OPTION_CONTROL_KINDS` — five of the fifteen exports — exist
so a harness can declare per-model options that render as composer pills. **No production code has
ever created one.** Every construction site of `HarnessModelDescriptor` writes `options: []`
(harness-discovery.ts:101,141,762,801; harness-capability-descriptors.ts:87); the only non-empty
`options:` in the repo are a demo-world questionnaire and tests. Downstream, `deriveComposerPills`
(conversation-parts/part.ts) filters an always-empty array — and even redeclares its own local
`RECOGNIZED_CONTROL_KINDS` instead of importing the exported const, proving the const was never
needed — and SessionView.tsx:640-686 renders pills that have never appeared. Kill the types, the
const, `HarnessModelDescriptor.options`, `deriveComposerPills`, and the SessionView pill-mapping
branch, plus their tests. What breaks: nothing observable — the UI paints identically.

**2. Runtime capability badges — flags nobody branches on, displayed through crossed wires.**
`HarnessRuntimeCapabilities` (preCompactionTrigger, subAgents, mcpSupport, fileEditing, toolUse)
is declared three times (here, `HarnessCapabilities` in harness-protocol, `agent-profile.ts` in
domain-model). On the descriptor it is display-only: harness-presentation.ts:147-150 turns flags
into badge strings, AgentProfile.tsx:385 renders `CapabilityBadge`s. The exhaustive branch search
found exactly ONE runtime branch in the whole repo — provisioner.ts:1510 on `mcpSupport` — and it
reads the adapter's own `HarnessCapabilities`, not this type. The smoking gun that the badges
carry no value: `core-api/routes/agent-profile.ts` maps `toolUse: caps.preCompactionTrigger`
(line 214) and `fileEditing: caps.subAgents` (line 218) — the UI has been displaying the WRONG
flags under hand-waving "rough proxy" comments and no one ever noticed, because no decision hangs
on them. harness-presentation's own comment admits the production shape is all-false
("Capabilities confirmed after first run"). Per the brief: a capability never tested at runtime is
DELETE. Kill `HarnessRuntimeCapabilities`, the descriptor's `runtime` field, `provenCapabilities`/
`capabilitySummary` badge plumbing, `mapCapabilities` + `AgentHarnessCapabilities`
(domain-model copy), and the badge rows. Keep `mcpSupport` and `returnEnforcement` on
harness-protocol's `HarnessCapabilities` — the two members with real branches. What breaks: the
Settings harness fold loses its capability chips and AgentProfile loses four badges — chips that
were partly false anyway.

**3. Dead enforcement channels.** `"sdk-inprocess"` — declared by zero adapters; its own doc
comment says "dead"; provision-return-hook.ts:78 keeps a no-op case "for backward compat" with
nothing. `"soft-continue"` — declared by zero production adapters (cursor-agent derives to
`"none"` via `deriveCliChannel`, cli-harness-adapter.ts:338-340); referenced only by tests. Union
shrinks 7 → 5; two no-op case arms and their tests die.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `derivePrimaryHarness` | function | UI:SetupFlow (team creation) | MERGE | Sole caller is SetupFlow.tsx — 9 lines with a hardcoded stale-model fallback (`"claude-sonnet-4-6"`); inline into core-ui, the package's only runtime code goes with it. |
| 2 | `ReturnEnforcementChannel` | type | AGENT: provisioner.ts:1456 → provision-return-hook dispatch; declared by every adapter | SIMPLIFY | The one genuinely load-bearing capability — real branch per channel. Drop dead members `"sdk-inprocess"` + `"soft-continue"` (declared by nobody, see feature kill #3); relocate beside `HarnessCapabilities.returnEnforcement` in harness-protocol. |
| 3 | `HarnessOptionControlKind` | type | DEAD | DELETE | Zero references anywhere, including inside its own package — `HarnessModelOptionControl` respells the same literals instead of using it. |
| 4 | `HarnessAccessMode` | type | DEAD (written, never read) | DELETE | Every descriptor construction stamps it; `.accessMode` is read by zero production files (only an e2e fixture literal). Produced-never-consumed decoration — delete type + descriptor field + `HarnessCapabilities.accessMode` + the construction sites. |
| 5 | `HarnessReadinessState` | type | UI:/settings harnesses + SetupFlow (row greying, CTA gating via harness-presentation.ts) | KEEP | Discovery produces it, the UI branches on it (`state !== "unauthenticated"` etc.) — a real runtime-tested capability. Moves to harness-protocol. |
| 6 | `HarnessAuthActionKind` | type | INTERNAL (member of #7 only) | MERGE | Zero external references; inline the union into `HarnessAuthActionDescriptor.kind`, stop exporting. |
| 7 | `HarnessAuthActionDescriptor` | interface | UI: SetupFlow.tsx:107-108, SettingsHarnesses.tsx:148, harness-presentation.ts:98,191 | SIMPLIFY | `kind`/`label`/`command` are read and branch the auth CTA — real. `description` and `credentialNames` are written (harness-discovery.ts:707-726) and read by nobody — delete both members. Moves to harness-protocol. |
| 8 | `HarnessOptionChoice` | interface | DEAD (member of dead #9) | DELETE | Part of the producer-less option-pill subsystem — feature kill #1. |
| 9 | `HarnessModelOptionControl` | type | DEAD (member of dead #10) | DELETE | Part of the producer-less option-pill subsystem — feature kill #1. |
| 10 | `HarnessModelOptionDescriptor` | interface | producer-less: every production `options:` write is `[]` | DELETE | No production code has ever constructed one; its only consumers (`deriveComposerPills`, SessionView pill branch) process a permanently empty array. Feature kill #1 — delete consumers too. |
| 11 | `HarnessModelDescriptor` | interface | UI: AgentEditor model dropdown (model-options-for-harness.ts), SetupFlow, SettingsHarnesses model rows | SIMPLIFY | `id`/`label`/`provider`/`selectable` are read. `options` (always `[]`, kill #1), `contextWindow` (copied at descriptors.ts:84, read nowhere), `inheritedFromGateway` (written, read nowhere — `selectable` does the actual filtering) — delete three members. Moves to harness-protocol. |
| 12 | `HarnessRuntimeCapabilities` | interface | display-only badges; zero runtime branches on the descriptor copy | DELETE | Feature kill #2. Flags declared three times across three packages; the only real branch (`mcpSupport`, provisioner.ts:1510) reads harness-protocol's `HarnessCapabilities`, not this. The agent-profile crossed-wire mapping (`toolUse ← preCompactionTrigger`, `fileEditing ← subAgents`) shipped unnoticed — proof the display carries no value. |
| 13 | `HarnessDiscoveryStatus` | interface | UI: settings/setup greying, toggle, disabled stamp (AM4) | KEEP | `state`/`disabled` are branched on in harness-presentation and the route stamps `disabled` from server_config — real. `version`/`reason` render in the fold. Moves to harness-protocol. |
| 14 | `HarnessCapabilityDescriptor` | interface | UI: GET /api/harnesses wire DTO → SetupFlow, SettingsHarnesses, SettingsAgents, AgentEditor, SessionView | SIMPLIFY | The package's actual product surface — the harness picker and settings screens live off it. Shrink: drop `accessMode` (#4), drop `runtime` (#12), collapse the duplicate provider lists (`runtime.modelProviders` written-never-read vs top-level `modelProviders` self-labeled "Legacy" yet the one actually read — keep one field). Moves to harness-protocol. |
| 15 | `HARNESS_OPTION_CONTROL_KINDS` | const | TEST-ONLY (own package's descriptor test) | DELETE | Only reference outside its declaration is its own test asserting the literal back at itself; part.ts redeclared a private copy rather than import it. Dead code plus a test that dies with it. |

## Types / DI ports

No DI ports. All 13 declarations verdicted above. The parallel copies that die with #12:
`AgentHarnessCapabilities` (framework/domain-model/src/agent-profile.ts:93-100) and
`mapCapabilities` (core-api/routes/agent-profile.ts:202-221). `HarnessCapabilities`
(harness-protocol) survives as the single flags home, shrunk to the branched-on members.

## Holes this leaves

1. **Settings/AgentProfile capability chips disappear** (feature kill #2). Users no longer see
   "File editing / Tool use / MCP / Sub-agents" chips. Two of the four were mapped from the wrong
   source flags, so the display was partly false; the honest replacement is nothing.
2. **Composer pill machinery gone** (feature kill #1). If a future harness wants per-model options
   (e.g. a thinking-budget selector), the subsystem must be rebuilt. Today it renders nothing for
   any of the five harnesses — rebuild when a real producer exists, not before.
3. **core-ui and conversation-parts gain a `@hyperidle/harness-protocol` dependency** for type-only
   imports (they lose the lighter-weight package). Zero runtime weight — every import is
   `import type` — but the UI's package.json now names the protocol package that also declares
   event-bus/work-intent-port deps. If governance forbids that edge, the fallback is SPLIT: a
   single `harness-descriptor.ts` file stays framework-side — but as a file inside
   harness-protocol, not as a package.
4. **`"soft-continue"` removal** means a future spawnable cursor-agent must re-add its channel
   member and hook case — one union member and one case arm, earned when cursor actually spawns.
5. The two in-package test files die with the package; descriptor-shape coverage continues to live
   where it already really lives — the adapter and route tests that construct descriptors.


---

# harness-protocol — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT then dissolve — 4 of its 6 modules have exactly one real owner; only `harness-adapter.ts` + `harness-events.ts` + `return-actions.ts` earn shared status.**

The package poses as one protocol. Measured, it is six modules with different consumer sets:

1. **`harness-capability-read-model.ts`** — every namer is core-api (`app.ts` + 8 routes). **DISSOLVE → core-api.** The 6 exported functions are one-line forwarders over an injected reader and die outright.
2. **`harness-event-normalization.ts`** — every caller is harness-registry (`cli-harness-adapter.ts`, `adapter-pool.ts`). This is claude/codex/opencode stdout-dialect parsing — adapter *implementation*, not protocol. **DISSOLVE → harness-registry.** `isHarnessEvent` is fully dead.
3. **`enforcement-registry.ts`** — its own doc says it lives here because `mcp-provider` was a sibling Service of `harness-registry`. `mcp-provider` no longer exists — the MCP route lives at `layers/agent-execution/harness-registry/src/mcp/`. Every consumer (`return-enforcement.ts`, `return-status-tool.ts`, `mcp/*`, `agent-execution/src/boot.ts`) is agent-execution. The stated reason for framework placement evaporated. **DISSOLVE → harness-registry.**
4. **`worker-protocol.ts`** — every importer is agent-execution (`remote-worker-client.ts`, `remote-harness-adapter.ts`, `harness-adapter-factory.ts`) plus `agent-orchestration/src/boot.ts` (composition root, which already depends on `@hyperidle/agent-execution`). The server-side parser — `worker-ingress.ts` — **never imports these types at all**: it re-declares the whole wire union as a hand-rolled Zod schema (`WorkerToServerMessageSchema`, worker-ingress.ts:83). The "shared wire protocol" is not shared with the one file that parses the wire. **DISSOLVE → harness-registry.**
5. **`harness-port.ts`** — its doc claims "the one genuine cross-process seam both Services depend on." Measured: only `run-orchestration` names `HarnessPort` (contracts.ts + runtime.ts + composition comment). The implementation (`session-lifecycle-bindings.ts`) satisfies it structurally without importing it. One consumer = not a seam, it's indirection. **DISSOLVE → run-orchestration/contracts.ts.**
6. **`harness-adapter.ts` + `harness-events.ts` + `return-actions.ts`** — genuinely two-sided: harness-registry (agent-execution) implements, `provisioner.ts`/`session-run-registry.ts`/`worker-ingress.ts` (agent-orchestration) drive, core-api reads `HarnessCapabilities`. Machine-enforced boundaries forbid these importing each other. **STAYS SHARED** — this residue (~1 adapter-contract file + return-actions) is the honest `harness-protocol`.

**Are harness-protocol / harness-capability / tool-protocol one thing? No — but the boundary leaks.** `harness-capability` is the UI-visible vocabulary (core-ui imports it in 7 files; core-ui must never see `SessionConfig`) — the AU34 audience split is real, keep it. `tool-protocol` imports exactly one symbol from here (`SessionWorkflow`) — a different seam, keep it. The leak: `HarnessCapabilities` (here) duplicates `HarnessRuntimeCapabilities` (harness-capability) field-by-field, held apart only by history — `harnessCapabilitiesForType` literally rebuilds one from the other (`{...descriptor.runtime, returnEnforcement}`). harness-protocol already imports harness-capability, so declare `HarnessCapabilities = HarnessRuntimeCapabilities & { returnEnforcement }` and delete the duplicate field list.

Also: `framework/event-bus` declares `@hyperidle/harness-protocol` as a production dependency; its only import is a test file (`AL7-proposed-call-types.test.ts`). Respell to devDependency.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/harness-protocol"` — production files only (tests/comments excluded):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/agent-execution/harness-registry` (11 files) | HarnessAdapter family, SessionConfig family, events, all return-action fns/consts, EnforcementRegistry/Entry, WorkerRegisterMessage, normalization fns | Owns: normalization, enforcement-registry, worker-protocol, AdapterMeta |
| `layers/agent-execution/src` (boot, remote-worker-client) | EnforcementRegistry, HarnessAdapter, worker-protocol messages | Same layer as harness-registry — yes, via it |
| `layers/agent-orchestration/run-orchestration` (4 files) | HarnessPort family, SessionConfig family, HarnessEvent, isReturnAction, isInternalExtractionDrain, literalToolNamerForAdapterType, MAX_FORCE_RETURNS, HarnessAdapter | Owns: HarnessPort family. Cannot own adapter contract (boundary) |
| `layers/agent-orchestration/src/boot.ts` | HarnessAdapter, WorkerRegisterMessage | Composition root — already depends on agent-execution |
| `layers/agent-orchestration/session-requests` | HarnessAdapter, SessionHandle | No (boundary) |
| `layers/core-api` (app.ts + 8 routes) | HarnessCapabilityReader + the 6 forwarder fns + HarnessCapabilities | Owns: reader type. Forwarders die |
| `framework/tool-protocol` | `SessionWorkflow` (type, 1 symbol) | No — legitimate cross-import |
| `framework/event-bus` | **test-only** (prod dep declared anyway) | Dep is a lie — devDependency |
| `applications/desktop`, `applications/remote-server`, `tools/governance`, `tools/eval` | comments / lint-fixture strings only, zero imports | n/a |

## If written today, from scratch

One shared file-pair worth of contract, everything else owned by its one consumer:

- **Shared (`harness-protocol`, shrunk):** `HarnessAdapter`, `SessionConfig` (minus dead fields, satellites unexported), `SessionHandle`, `SessionResult`, `SessionMetrics`, `SessionWorkflow`, `ConversationMessage`, `HarnessCapabilities` (as intersection over harness-capability), `AdapterInfo`, `HarnessEvent` (4 variants, not 5), `return-actions.ts` (6 fns + 3 consts).
- **harness-registry:** event normalization (2 fns), enforcement registry types, worker-protocol wire types, `AdapterMeta`.
- **run-orchestration:** `HarnessPort`, `HarnessPortDeps`, `RunContextBundle`, `AdmittedRun`, `HarnessRunOutput`.
- **core-api:** `HarnessCapabilityReader`, `HarnessCapabilityFilter`; routes call `reader.size` / `.list()` / `.describe()` / `.refresh()` directly.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 17 |
| SIMPLIFY | 3 |
| KEEP | 35 |

Surface: 62 exports → ~20 exports remaining in the shared package (~68% cut of the shared surface; 15 of the KEEPs are relocations to a single owner, not survivals in place).

## Feature-level kills

- **`pre_compaction` as a protocol event.** The builtin adapter emits it (builtin-harness-adapter.ts:679) and the provisioner's drain switch handles `token_usage` / `tool_call` / `error` only (provisioner.ts:1556–1575) — **nothing anywhere parses `pre_compaction`**. The useful side-effect (writing session notes near context limit) happens inside the adapter before emitting. Kill the event variant and the emission; keep the adapter-internal note write. Hole: none — the wire event is noise today.
- **The six read-model forwarder functions.** `registeredHarnessCount(r)` = `r.size`; `workerConnections(r)` = `r.list()`; `refreshHarnessDiscoveries(r)` = `r.refresh()`; `harnessCapabilityDescriptors(r,o)` = `r?.describe(o) ?? []`. Each has exactly one calling file. Pure ceremony over an interface that already IS the narrowing. Hole: none.
- **Flag, not a kill — the remote-worker feature as a whole.** If the founder ever kills remote execution (remote-server + remote-worker apps), the entire worker-protocol module, `remote-worker-client.ts`, `remote-harness-adapter.ts`, `harness-adapter-factory.ts`, and `worker-ingress.ts` die together (~5 files + 11 types). Priced here so the option is visible; not verdicted dead — the shared-backend deployment is a shipped product surface.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `registeredHarnessCount` | UI:GET /api/agent-profile (agent-profile.ts:192) | DELETE | One-line forwarder for `reader.size`; one caller inlines it. |
| 2 | `workerConnections` | UI:GET /api/workers (workers.ts) | DELETE | One-line forwarder for `reader.list()`; one caller inlines it. |
| 3 | `harnessCapabilitiesForType` | UI:GET /api/agent-profile (agent-profile.ts) | MERGE | Single caller; fold the descriptor→capabilities merge into agent-profile.ts. |
| 4 | `harnessRegistrationMeta` | UI:validate-agent-config route | MERGE | Single caller; fold into validate-agent-config.ts (hardcoded `maxConcurrent: 1` is caller detail anyway). |
| 5 | `harnessCapabilityDescriptors` | UI:harnesses routes (harnesses.ts, 4 sites) | DELETE | Forwarder for `reader.describe()`; one calling file. |
| 6 | `refreshHarnessDiscoveries` | UI:harness refresh route (harnesses.ts) | DELETE | Forwarder for `reader.refresh()`; one caller. |
| 7 | `preMapClaudeEvent` | INTERNAL (cli-harness-adapter.ts only) | MERGE | Claude stdout-dialect parsing is cli-adapter implementation; fold into cli-harness-adapter.ts as a private helper. |
| 8 | `normalizeHarnessEvent` | INTERNAL (cli-harness-adapter.ts, adapter-pool.ts) | KEEP | Real work, two callers — both harness-registry. Moves there; stops being a framework export. |
| 9 | `isHarnessEvent` | DEAD (`rg -a` — zero refs, not even a test) | DELETE | Exported, never called anywhere. |
| 10 | `isReturnAction` | AGENT:return-gate (provisioner.ts drain, cli-harness-adapter.ts) | KEEP | The return-gate predicate, both sides of the enforced boundary. Core value: sessions must return work. |
| 11 | `isRequiredReturnAction` | AGENT:return-gate (return-enforcement.ts, builtin + cli adapters) | KEEP | Required-subset binding is live enforcement (assistant must `reply`). Stays with the closed set. |
| 12 | `isInternalExtractionDrain` | AGENT:provisioner exemption (provisioner.ts) | DELETE | One caller, one line (`config.tools.length === 0`). Inline at the call site with a comment. |
| 13 | `mcpNamespacedToolName` | AGENT:mcp-route forcing message (mcp-route.ts) | KEEP | Real per-dialect naming; used externally + by `literalToolNamerForAdapterType`. |
| 14 | `opencodeToolName` | AGENT:cli-adapter forcing (cli-harness-adapter.ts) | KEEP | Same — opencode's dialect verified against the real binary. |
| 15 | `literalToolNamerForAdapterType` | AGENT:provisioner (provisioner.ts) | KEEP | Cross-boundary dispatch of the namers; genuine shared surface. |
| 16 | `buildForceReturnMessage` | INTERNAL (only `shouldForceReturn` calls it) | MERGE | Zero external callers. Unexport; private helper of `shouldForceReturn`. |
| 17 | `shouldForceReturn` | AGENT:forcing hook (builtin, cli, mcp-route, return-status-tool) | KEEP | The force-return decision, four call sites. Core value: agents return work. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `EnforcementEntry` | KEEP → harness-registry | Only namer is return-enforcement.ts; the mcp-provider sibling-seam justification is dead. |
| `EnforcementRegistry` | KEEP → harness-registry | All five namers are agent-execution. Move, delete from framework. |
| `SessionWorkflow` | KEEP (shared) | tool-protocol + provisioner + SessionConfig — three packages, real AL7 surface. |
| `McpConnectionInfo` | MERGE → SessionConfig | Zero external namers; consumers build it structurally. Unexport. |
| `ConversationMessage` | KEEP (shared) | builtin adapter + runtime + provisioner + harness-port — both sides. |
| `SessionConfig` | SIMPLIFY | Live seam, but delete `systemPromptPath` — `@deprecated`, written by provisioner, read by nobody. |
| `SessionHandle` | SIMPLIFY | A one-field wrapper around `sessionId: string`. Pass the string. |
| `SessionMetrics` | KEEP (shared) | provisioner + cli adapter + HarnessRunOutput — token telemetry the founder explicitly kept (AU21). |
| `SessionResult` | KEEP (shared) | All four adapters + provisioner. |
| `ReturnHookConfig` | MERGE → SessionConfig | Zero external namers. Unexport. |
| `HarnessCapabilities` | SIMPLIFY | Two cuts: (1) declare as `HarnessRuntimeCapabilities & { returnEnforcement }` — the field list duplicates harness-capability's shape, and `harnessCapabilitiesForType` already proves they're one shape; (2) delete `preCompactionTrigger` — its event is dead wire, and agent-profile.ts:214 abuses it as a `toolUse` proxy when a real `toolUse` field exists. |
| `AdapterMeta` | KEEP → harness-registry | After row 4 inlines, every namer is harness-registry (adapter-pool, descriptors, index). Move. |
| `AdapterInfo` | KEEP (shared) | Pool-entry view crossing execution → core-api (`reader.list()` return, GET /api/workers). |
| `HarnessAdapter` | KEEP (shared) | THE seam: implemented by 4 adapters (execution), driven by provisioner/session-run-registry/worker-ingress (orchestration). Load-bearing for agents-run-work. |
| `HarnessCapabilityFilter` | KEEP → core-api | Moves with the reader; only named through `describe()`. |
| `HarnessCapabilityReader` | KEEP → core-api | All 9 namers are core-api. The narrowing is real value (routes can't name `select()`/`register()`); the *location* is wrong. Pool satisfies structurally — the drift-guard assertion test already lives in core-api. |
| `TokenUsageEvent` | MERGE → HarnessEvent | Zero external namers; live union member. Unexport. |
| `ToolCallEvent` | MERGE → HarnessEvent | Same (domain-model mention is a comment). |
| `CompletionEvent` | MERGE → HarnessEvent | Same. |
| `ErrorEvent` | MERGE → HarnessEvent | Same. |
| `PreCompactionEvent` | DELETE | Emitted by builtin only, parsed by nobody (provisioner drain has no case). Dead protocol. Kill variant + emission. |
| `HarnessEvent` | KEEP (shared) | The event stream both sides speak. |
| `HarnessEventType` | MERGE → normalization | Zero external namers; internal to the `satisfies` check. Unexport. |
| `ReturnActionName` | MERGE → return-actions | Zero external namers. Unexport. |
| `LiteralToolNamer` | MERGE → return-actions | Zero external namers (callers use inference). Unexport. |
| `HarnessAdapterType` | MERGE → return-actions | Zero external namers. Unexport. |
| `WorkerRegisterMessage` | KEEP → harness-registry | Namers: agent-execution files + both composition roots (which depend on agent-execution). The wire's parse side (worker-ingress) uses its own Zod copy regardless. |
| `WorkerEventMessage` | KEEP → harness-registry | remote-worker-client narrows on it. Moves with the wire module. |
| `WorkerSessionResultMessage` | KEEP → harness-registry | Same. |
| `WorkerErrorMessage` | KEEP → harness-registry | Same. |
| `WorkerPauseMessage` | MERGE → WorkerToServerMessage | Zero external namers; runtime pause is sent as a raw literal (`remote-worker-client.ts:341`) and parsed by worker-ingress's own Zod. Unexport. |
| `WorkerResumeMessage` | MERGE → WorkerToServerMessage | Same (line 348). |
| `WorkerToServerMessage` | KEEP → harness-registry | remote-harness-adapter names it. Moves. |
| `ServerDispatchMessage` | KEEP → harness-registry | remote-worker-client narrows on it. Moves. |
| `ServerStopMessage` | KEEP → harness-registry | Same. |
| `ServerRegisteredMessage` | MERGE → ServerToWorkerMessage | Zero external namers; ack sent as raw literal (worker-ingress.ts:203). Unexport. |
| `ServerToWorkerMessage` | KEEP → harness-registry | Client + adapter name it. Moves. |
| `HarnessPortDeps` | KEEP → run-orchestration | Only runtime.ts names it. |
| `RunContextBundle` | KEEP → run-orchestration | Only contracts.ts + runtime.ts name it. |
| `AdmittedRun` | KEEP → run-orchestration | Only runtime.ts names it. |
| `HarnessRunOutput` | KEEP → run-orchestration | Only contracts.ts names it. |
| `HarnessPort` | KEEP → run-orchestration | "Both Services depend on it" is measured false — one package names it; the impl satisfies it structurally without importing. Single-consumer port = local contract. |

### Consts

| Declaration | Verdict | Reason |
|---|---|---|
| `RETURN_ACTION_NAMES` | KEEP (shared) | The closed return set — builtin adapter reads it, tool-handlers' closure test guards drift against real tools. Core value. |
| `FORCE_RETURN_MESSAGE` | KEEP (shared) | cli adapter + return-status-tool; the canonical forcing text. |
| `MAX_FORCE_RETURNS` | KEEP (shared) | provisioner + 4 harness-registry files — the force budget both sides must agree on. |

## Holes this leaves

- **Worker wire union exists twice and now officially so.** worker-ingress's Zod schema was already a divergent hand copy of `WorkerToServerMessage`; moving the types to harness-registry does not create that drift, but it stops pretending the framework types prevent it. If drift bites, derive the ingress schema from one source — that's a fix the current package never delivered.
- **`HarnessCapabilityReader` moving to core-api** relies on the existing `const reader: HarnessCapabilityReader = pool` assertion test to catch pool/reader drift (it already does — the `Pick` link was severed in AU26). No new hole, but the assertion becomes the only guard, so it must not be deleted.
- **Deleting `pre_compaction`** removes the wire signal that context pressure occurred. Nothing consumes it today, so nothing breaks; if a future surface wants a "context nearly full" indicator, it re-adds a variant then — with a consumer attached.
- **Deleting `systemPromptPath`** removes a deprecated field one writer populates; if some path-validation actually reads it downstream via structural typing, `npm run check` will name the site immediately — that site inherits the delete.
- **Six route inlines** (rows 1–6) put trivial reader calls in route files — 8 core-api routes get a one-line change each. No behavior change; `test:integration:service` covers all these routes.


---

# host-process — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT then dissolve — package deleted.**

This package is three unrelated things stapled together because they all touch `node:` APIs:
a git subprocess runner, an SSRF URL guard, and deployment-profile/env resolution. No consumer
uses more than one of the three. That is not a shared package; it is three homeless modules.

1. **`git/git-runner.ts` → `layers/agent-orchestration`** (layer-level `src/`, next to `boot.ts`).
   The package's own lore claims the runner must be framework because "consumers end up on BOTH
   sides of the Layer boundary" (core-api/filesystems vs agent-orchestration). **That claim is
   stale.** The filesystems probe now lives at `layers/agent-orchestration/filesystems/` — every
   production importer of `createGitRunner` is inside `layers/agent-orchestration`
   (`src/routes/filesystems.ts`, `src/boot.ts`). The core-api references are test files only.
   The founding reason for the framework package is gone; the package outlived its excuse.

2. **`net/ssrf.ts` → `layers/agent-orchestration`**. The module header says it was "extracted
   from notifications so the same blocklist can guard webhook adapters." **That sharing never
   happened.** `layers/core-api/notifications/src/install.ts` re-implements the entire thing
   privately (`isPrivateIPv4`, `isPrivateIPv6`, `sanitizeNtfyUrl`, `assertNtfyUrlNotSSRF`,
   lines 461–558) and imports only the one-line `SanitizeResult` type. The only production
   consumers of the shared behavior are `agent-orchestration/src/routes/connections.ts` and
   `run-orchestration/src/connection-provisioning.ts`. One real owner. The "shared" SSRF package
   failed its own founding purpose and the two copies are already free to drift.

3. **`profiles.ts` → `applications/remote-server`; `validate-env.ts` → inlined into
   `applications/remote-server/src/index.ts`.** Consumers use different slices:
   - remote-server: full 3-profile table (laptop/vps/cloud) + `validateStartupEnv`.
   - desktop: calls `resolveProfile` but IS the laptop product — a "vps" profile inside Electron
     yields a docker-compose hostname (`postgres:5432`) that is nonsense there. Desktop should
     hardcode its pglite laptop defaults (~4 lines).
   - setup-cli: needs only the validated profile name + a `dbDriver` label for one log line —
     a 6-line local parse.
   Three consumers using three different slices of an 80-line module is not sharing.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/host-process"` — production importers only (tests excluded):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/agent-orchestration/src/routes/filesystems.ts` | `createGitRunner` | Yes — becomes same-layer module |
| `layers/agent-orchestration/src/boot.ts` | `createGitRunner` | Yes — same |
| `layers/agent-orchestration/src/routes/connections.ts` | `isPrivateHostLiteral`, `resolveUrlForSSRF` | Yes — becomes same-layer module |
| `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts` | `resolveUrlForSSRF` | Yes — same |
| `layers/core-api/notifications/src/install.ts` | `SanitizeResult` (type only; behavior duplicated locally) | Yes — writes its own 1-line union |
| `applications/remote-server/src/index.ts` | `validateStartupEnv` | Yes — inline, 10 lines, sole caller |
| `applications/remote-server/src/create-server.ts` | `resolveProfile` | Yes — becomes the module's home |
| `applications/desktop/src/create-server.ts` | `resolveProfile` | Yes — hardcode laptop defaults |
| `tools/setup/src/setup-cli.ts` | `resolveProfile`, `DeploymentProfile` | Yes — 6-line local parse |

`tools/repo-gates/typecheck-gate.ts` and `filesystem-mounting`/`filesystems` mention the package
in comments/package.json only — the two Services deliberately re-declare the runner shape as
structural ports (`FilesystemsGitRunner`, `MountingGitRunner`) and never import a single symbol.
Note the trace graph reports "nothing references createGitRunner" — the DI-factory-value wiring
(`gitRunnerFactory: createGitRunner`) is a known graph blind spot; rg is the evidence above.

## If written today, from scratch

- `layers/agent-orchestration/src/git-runner.ts` — `createGitRunner(repoPath)` with **12** verbs
  (the 4 git-export leftovers deleted), no options param.
- `layers/agent-orchestration/src/ssrf.ts` — `resolveUrlForSSRF`, `isPrivateHostLiteral`, and
  the private IP/parse helpers unexported.
- `applications/remote-server/src/profiles.ts` — `resolveProfile` over a 3-row table with
  **3** fields (`profile`, `dbDriver`, `dbUrlDefault`); `validateStartupEnv` inlined in `index.ts`.
- No framework package.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 6 |
| MERGE | 1 |
| SIMPLIFY | 14 |
| KEEP | 2 |

Surface: 23 exports → 0 exports from this package (package deleted; ~8 symbols survive as
module-level code inside their owners, most unexported). Within the survivors: `GitRunner`
loses 4 of 16 verbs, `ProfileDefaults` loses 3 of 6 fields.

## Feature-level kills

1. **Dead git-export verbs: `init`, `push`, `configSet`, `remoteAdd`.** Both production ports
   (`FilesystemsGitRunner`, `MountingGitRunner`) omit them; no production call site exists —
   they served the git-export feature deleted in C1 and survived it. Their tests die with them.
   Nothing breaks.
2. **The "shared SSRF" pretense.** Notifications keeps its own copy (it already does); the
   `SanitizeResult` type import — the last thread — dies. Nothing breaks; the drift between the
   two copies is already real and this makes it honest instead of hidden.
3. **Profile fields nobody reads: `sandboxAdapter`, `requiresDockerCompose`, `ports`.**
   Zero readers repo-wide (`rg -a` on all three names: only the package and its own test).
   The `SandboxAdapterKind` type dies with its field. Nothing breaks.
4. **Test-only public API: `sanitizeHttpUrl`, `assertUrlNotSSRF`, `CreateGitRunnerOptions`.**
   Only `__tests__/ssrf.test.ts` and `git-runner.integration.test.ts` touch them. Dead code plus
   tests that should die with it.
5. **`LAPTOP_DEV_API_KEY` as a shared constant.** The one place that must agree with it —
   `layers/core-ui/src/services/api-fetch.ts:33` — hardcodes the literal `"hyperidle-dev-local"`
   because the browser bundle cannot import host-process. The constant never enforced anything.
   Inline the literal at its one real use.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `createGitRunner` | UI:`/api/filesystems/*` + BOOTSTRAP:`boot.ts`→mount engine (AGENT session path) | SIMPLIFY | Moves to `layers/agent-orchestration/src/`; drop the `opts` param — no production caller passes options; returned runner drops 4 dead verbs. |
| 2 | `isPrivateIPv4` | INTERNAL | SIMPLIFY | Zero external callers (notifications has its own copy). Unexport; moves with ssrf module. |
| 3 | `isPrivateIPv6` | INTERNAL | SIMPLIFY | Same — unexport, module-private helper. |
| 4 | `isPrivateHostLiteral` | UI:`/api/connections` (connections.ts:74) | KEEP | Real door, real guard on user-supplied MCP server URLs. Moves to agent-orchestration. |
| 5 | `isLoopbackHost` | INTERNAL | SIMPLIFY | Only `parseAndCheckUrl` calls it. Unexport. |
| 6 | `sanitizeHttpUrl` | TEST-ONLY | DELETE | Only `__tests__/ssrf.test.ts` calls it. The sync gate nobody wired; `resolveUrlForSSRF` does its own parse. Test dies with it. |
| 7 | `assertUrlNotSSRF` | TEST-ONLY | DELETE | Wrapper over `resolveUrlForSSRF` that throws away the addresses. Its own `@lore` says it exists for "existing call sites (notifications/ntfy)" — those call sites use notifications' private copy, not this. Zero production callers. |
| 8 | `resolveUrlForSSRF` | UI:`POST /api/connections/:id/validate` + AGENT:connection-provisioning (session start) | KEEP | The one real SSRF gate, earned from a security review, two live doors. Moves to agent-orchestration. |
| 9 | `resolveProfile` | BOOTSTRAP:remote-server + desktop `create-server`, setup-cli | SIMPLIFY | Moves to remote-server. Desktop hardcodes its laptop/pglite defaults; setup-cli owns a 6-line name parse. Table shrinks to 3 fields. |
| 10 | `validateStartupEnv` | BOOTSTRAP:remote-server `index.ts:26` (sole prod caller) | MERGE | 10 lines, one caller — inline into `applications/remote-server/src/index.ts`. The core-api tests exercising it (`index.startup.integration.test.ts`) move or die. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `GitConfigInjection` | SIMPLIFY | No external importer — both consumer Services re-declare it structurally (`FilesystemsGitConfigInjection`, `MountingGitConfigInjection`). Unexport; moves with runner. |
| `GitRunner` | SIMPLIFY | No production importer of the type (structural ports everywhere). Delete members `init`, `push`, `configSet`, `remoteAdd` — production reaches the runner only through the two ports, and both omit them; they are git-export (C1) leftovers. 16 verbs → 12. Unexport. |
| `CreateGitRunnerOptions` | DELETE | Only `git-runner.integration.test.ts` passes `{ logger, timeouts }`. Production always calls `createGitRunner(path)` bare. Test-only surface on a public factory. |
| `SanitizeResult` | DELETE | Sole external importer is notifications — which duplicated all the behavior and kept only this 1-line union import. It writes its own `{ ok: true } | { ok: false; reason: string }`. |
| `ResolveResult` | SIMPLIFY | Return type of `resolveUrlForSSRF`; every consumer uses it structurally, none imports it by name. Moves with the function, unexported from any barrel. |
| `SanitizeUrlOptions` | SIMPLIFY | Drop `requireHttps` — zero production callers set it (rg repo-wide: one test). Keep `label` (used) and `lookup` (used via `_ssrfLookup` in connection-provisioning — note: that is a test seam threaded through a production signature; flagged, owner's problem after the move). |
| `DeploymentProfile` | SIMPLIFY | One external type importer (setup-cli, for a `satisfies` check). Moves to remote-server; setup-cli owns its own 3-literal union. |
| `DbDriver` | SIMPLIFY | Module-internal already (not in barrel). Moves with profiles; stays private. |
| `SandboxAdapterKind` | DELETE | The `sandboxAdapter` field it types is read by nobody, anywhere. Dies with the field. |
| `ProfileDefaults` | SIMPLIFY | 3 of 6 fields dead (`sandboxAdapter`, `requiresDockerCompose`, `ports` — zero readers repo-wide). Shrink to `{ profile, dbDriver, dbUrlDefault }`. |
| `ResolveOptions` | SIMPLIFY | Param type of `resolveProfile`; moves with it, module-private. |
| `PROFILE_DEFAULTS` (const) | SIMPLIFY | Module-internal already; only its own unit test names it. Moves with `resolveProfile`, rows shrink to 3 fields. |
| `LAPTOP_DEV_API_KEY` (const) | DELETE | Only prod use is the adjacent function; the browser code that must agree (`core-ui/api-fetch.ts:33`) hardcodes the literal anyway. Inline `"hyperidle-dev-local"` into the inlined `validateStartupEnv`; the core-api test importing it dies/moves with #10. |

## Holes this leaves

- **Desktop loses non-laptop profiles.** Hardcoding pglite defaults in desktop means
  `HYPERIDLE_PROFILE=vps` inside Electron stops "working" — it never worked meaningfully (the
  vps default DB URL is a docker-compose hostname). Real hole: pointing desktop at an external
  postgres via `DATABASE_URL` + profile switch stops working. If that is a real use case, desktop
  keeps a 2-row table; it is still not a framework package.
- **Default DB URL drift.** remote-server, desktop, and setup-cli each own their profile slice;
  if the laptop pglite default path ever changes, three files change instead of one. Priced: the
  two create-server files already keep a byte-for-byte duplicated DB-open block by explicit
  `@lore` policy — this hole already exists and is accepted.
- **SSRF blocklist drift between agent-orchestration and notifications** becomes permanent.
  It is already real (two independent IPv4/IPv6 checkers today); deleting the type import just
  stops pretending otherwise. A future security learning must be applied in two places.
- **Deleting `init`/`push`/`configSet`/`remoteAdd`** removes ready-made verbs a future
  git-export-like feature would want. It re-adds them against the same spawn path when a real
  feature earns them.
- **Test relocation:** `core-api/src/__tests__/index.startup.integration.test.ts`,
  `AO1-reachability-lane-b`, `AO1-filesystem-reachability` and the package's own 4 test files
  import the deleted package and must move to the new owners or die with their deleted subjects.


---

# http-middleware — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT then dissolve — DELETE the package.**

- **Security ceremony → DELETE outright** (8 of 22 exports): the AF11 boundary-declaration middleware pair, the rate limiter, the body cap, the timing-safe comparator, and their 3 types. All of it is preemptive security from hardening work packages (I2, AF11), not from any real learning. ETHOS.md: "Security is never preemptive... never a wall built first." Nobody was ever burned; these walls were built first and justified later.
- **Wire contract → `framework/domain-model`**: the explicit-start projection family (2 fns + 4 types after merge), `validateBody`/`ValidatedJson`, `HyperIdleEnv`. Proof this is the natural home: `domain-model/src/http/` **still exists and contains only a `__tests__` dir with a test for this package's rate limiter** — the corpse of the pre-AU34 home. `ApiErrorResponse` and `API_ERROR_CODES` — the exact shapes `validationHook` and the projection render — already live in domain-model. Contract and its enforcement reunite in one package. domain-model already has `zod` as a dep and `hono` as a devDep.
- **Mount recipe → `layers/core-api`**: `composeApiApplication` + its 2 option types move next to `api-middleware-stack.ts`, the file that builds the very stack it mounts. Its only two consumers (`applications/desktop/src/create-server.ts`, `applications/remote-server/src/create-server.ts`) both already import core-api (`bootCoreApi`). The "layer-blind framework home" argument dies with the middleware it existed to stay blind about.

Why not STAYS SHARED: after the security kills, 12 exports remain and every one of them is a wire/context **contract**, not middleware. A package named http-middleware whose middleware is all dead is a boundary invented for tidiness. Two real homes already exist.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/http-middleware"` → 67 files. Per-symbol:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api` (29 route files + stack + auth + app) | `requireBoundary`, `validateBody`, `createRateLimiter`, `createBodyLimit`, `constantTimeStringEqual`, `failClosedAssertion`, `HyperIdleEnv`, projection fns | Gets `composeApiApplication`; rest from domain-model |
| `layers/agent-orchestration` (6 route files + app + boot) | `requireBoundary`, `validateBody`, `createRateLimiter`, `createBodyLimit`, `HyperIdleEnv`, projection fns | May NOT import core-api — the shared survivors ride domain-model, which it already imports |
| `layers/agent-orchestration/run-orchestration` | `constantTimeStringEqual` only | Inlines `===` after the DELETE |
| `layers/agent-execution/harness-registry` (`mcp-route.ts`) | `requireBoundary` only | Dependency vanishes entirely |
| `applications/desktop`, `applications/remote-server` | `composeApiApplication` only | Import it from core-api, which they already boot |
| `tools/eval` | `HyperIdleEnv` (type-only) | Follows the type to domain-model |
| `framework/api-contract` | comment-only mention (hand-mirrored types, no import) | n/a |
| `framework/domain-model` | TEST-ONLY: `src/http/__tests__/rate-limit.test.ts` tests this package's limiter from another package | Misplaced leftover; dies with the limiter |
| `tools/eslint-plugin-authz` | references the NAME `requireBoundary` in 2 lint rules | Rules die with the ceremony (see holes) |

Three of nine consumers import exactly one symbol each. That is three symbols in the wrong place, not a shared package.

## If written today, from scratch

Nothing called "http-middleware" would exist. You would write:
- `domain-model/src/http/`: `validateBody` (typed 400s in the canonical error shape), `HyperIdleEnv` (the authenticated context both apps run on), `projectExplicitStartOutcome` + `sendStartProjection` (the one wire contract for `POST /api/sessions` / `GET /api/sessions/starts/:id`).
- `core-api/src/compose-api-application.ts`: the ~35-line mount recipe (probe-proven `notFound` trap + pre-auth/auth ordering — the one copy earned its keep by breaking twice as hand-copies).

No rate limiter. No body cap. No boundary stamps. No timing-safe hash dance. A solo founder's agents hammering their own API is the product working, not an attack.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 8 |
| MERGE | 1 |
| SIMPLIFY | 4 |
| KEEP | 9 |

Surface: 22 exports → 12 (45% cut), **package count → 0** (survivors absorbed into domain-model + core-api).

## Feature-level kills

1. **AF11 boundary-declaration ceremony — kill it all.** `requireBoundary` is stamped on 43 production route files; `failClosedAssertion` then checks the stamp was set. In production it **only logs**; the code's own comments admit "lint is the real gate." So the runtime pair is a dev-mode duplicate of a static lint check — a gate-by-default classifier the ethos explicitly forbids. Kills: both functions, 2 types, the `__boundary` member of `HyperIdleEnv`, one middleware slot in every composition root, 43 call-site stamps, `http-access-boundary.test.ts`, and both `tools/eslint-plugin-authz` rules that key off the `requireBoundary` name (`require-boundary-declaration`, `no-raw-db-in-route-bypassing-policy`). Real authorization stays exactly where it already is: `authorizeRead`/`authorizeWrite` calls inside handlers.
2. **Rate limiting — kill the whole feature.** One global limiter, a dedicated `/auth/*` limiter (`authMintLimiter` + `app.ts:368`), and FIVE per-route limiters (harnesses redetect 1/5s, credentials 20/min + 3/min, connections 20/min + 3/min, settings-agent-behavior 20/min) — guards layered on guards, throttling the user's own agents. Built by I2 "hardening," earned by no incident. Kills: `createRateLimiter`, `RateLimiterOptions`, `skipPaths` health-probe ceremony, `HYPERIDLE_RATE_LIMIT_PER_MIN`, the `rateLimit`/`authMintLimiter` stack fields, 7 mount sites, and the misplaced `domain-model/src/http/__tests__/rate-limit.test.ts`.
3. **Body cap — kill it.** 127 lines, half of which is a hand-rolled chunked-stream early-abort drain that the file itself admits is "rarely hit" in production — code written to satisfy a test contract. Kills: `createBodyLimit`, the `bodyLimit` stack field, `HYPERIDLE_MAX_BODY_BYTES`, per-route mounts in filesystems (x3) and artifacts (x2), `body-limit.integration.test.ts`.
4. **Timing-safe compare — kill it.** Defends against an attacker statistically timing a string compare over the network to recover an API key — a hypothetical no one has hit, on a product whose main deployment is localhost. Four call sites go back to `===`. Kills `constantTimeStringEqual`, `http-timing-safe.test.ts`, and the package's `@hyperidle/diagnostics` dep dies with the assertion logger.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `requireBoundary` | UI:all 43 declared data routes | DELETE | Sets a context string nobody enforces in prod; runtime duplicate of a lint rule; pure ceremony on every route registration. |
| 2 | `failClosedAssertion` | BOOTSTRAP (mounted once per app) | DELETE | Prod behavior is a log line; dev behavior duplicates the lint gate; designed for a paranoia the ethos forbids. |
| 3 | `createBodyLimit` | UI:/api/* (global) + filesystems/artifacts mounts | DELETE | Preemptive cap from I2; the streaming branch exists for a test; nothing real ever hit it. |
| 4 | `composeApiApplication` | BOOTSTRAP (desktop + remote-server create-server) | SIMPLIFY | Survives — probe-proven `notFound`/ordering fragility broke as hand-copies. Move to core-api; middleware param shrinks 6→3 fields (cors, errorHandler, auth). |
| 5 | `pendingStart` | INTERNAL + TEST-ONLY external (`agent-layer-boot-recovery.integration.test.ts`) | MERGE | Only production caller is `projectExplicitStartOutcome` in the same file — fold in as a private helper, un-export. |
| 6 | `projectExplicitStartOutcome` | UI:POST /api/sessions + GET /api/sessions/starts/:id (both apps) | KEEP | One wire contract, two apps that may not import each other; a silent divergence here is invisible to tsc. Moves to domain-model. |
| 7 | `sendStartProjection` | UI:same two routes | KEEP | The render half of the same contract; both apps call it. Moves with #6. |
| 8 | `createRateLimiter` | UI:/api/* + 5 per-route mounts | DELETE | Preemptive throttling of the user's own agents; guards on guards; no learning earned it. |
| 9 | `constantTimeStringEqual` | BOOTSTRAP (auth middleware, users, workers, worker-ingress) | DELETE | Anti-timing-attack crypto for a hypothetical attacker; 4 call sites revert to `===`. |
| 10 | `validationHook` | INTERNAL only — zero external references (rg-confirmed) | SIMPLIFY | "Exported for use in tests" that don't exist. Un-export; private detail of `validateBody`. |
| 11 | `validateBody` | UI:17 files across both layers | KEEP | Typed request bodies + canonical 400 shape at every write route; real developer value, genuinely dual-layer. Moves to domain-model. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `BoundaryKind` | DELETE | Dies with `requireBoundary`. Zero importers by name outside the package. |
| `BoundaryDeclaration` | DELETE | Same. A one-member interface wrapping a string union was already indirection. |
| `ComposedApiMiddleware` | SIMPLIFY | Survives as `composeApiApplication`'s param; shrinks 6→3 fields (`rateLimit`, `bodyLimit`, `failClosed` die). Zero importers by name — callers pass literals. |
| `ComposeApiApplicationOptions` | KEEP | Signature of the surviving compose fn; moves with it to core-api. |
| `HyperIdleEnv` | SIMPLIFY | 33 importers across both layers + tools/eval — the most-shared symbol here. Drop the `__boundary` member; move to domain-model. |
| `ExplicitStartRow` | KEEP | Structural row contract of the surviving projection; api-contract hand-mirrors against it. Moves with the family. |
| `PendingStartBody` | KEEP | Member of the `ExplicitStartProjection` union — required for the surviving exported signatures. No independent importers. |
| `StartFailureBody` | KEEP | Same family, same reason. |
| `ExplicitStartProjection` | KEEP | Return type of both surviving projection fns. |
| `RateLimiterOptions` | DELETE | Dies with the limiter. |
| `ValidatedJson` | KEEP | Carries `z.output<T>` typing through `validateBody`'s signature — the whole point of keeping it. |

## Holes this leaves

1. **No flood protection anywhere.** A runaway agent loop or an internet scanner against remote-server gets served at line rate; only the per-request auth check stands between a flood and the DB. Price: if it ever actually hurts, the ~60-line limiter comes back as a real learning — the honest order per ethos.
2. **Unbounded request bodies.** A multi-GB POST buffers into memory; possible OOM of the server process. If hit, the fix is a 10-line Content-Length check, not the 127-line streaming drain.
3. **API-key compare becomes prefix-timing-dependent.** The one DELETE a founder might veto: remote-server is internet-exposed. Practical remote timing recovery of a long random key on a modern async server is not a demonstrated attack, but it is 5 lines — if vetoed, inline it into core-api's auth middleware, don't keep a package for it.
4. **No mechanical check that a new data route wires authorization.** Both eslint-plugin-authz rules key off `requireBoundary` and die with it. Authz coverage then rests on handlers calling `authorizeRead`/`authorizeWrite` — which is where it really rested all along (the prod assertion only logged). If a static net is wanted later, a lint rule can detect `authorize*` calls directly, without a runtime stamp on 43 routes.
5. **domain-model's purity erodes.** It gains runtime `hono` + `@hono/zod-validator` usage (today hono is only a devDep there). `hono` is small and the web bundle tree-shakes server-only imports, but the "domain-model is shapes-only" instinct takes a dent. Fallback if the founder rejects the merge: keep a gutted 12-export http-middleware — still a 45% surface cut and all four security features dead.
6. **Mechanical churn:** 43 route files each drop one middleware argument; 7 limiter mounts, 5 body-cap mounts, 4 compare call sites, 3 package-local test files, 1 misplaced domain-model test, and 2 lint rules get deleted. All deletions — no new code beyond import respelling.


---

# presentation-format — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT then dissolve — package DELETED.**

Three unrelated things live here only because they were homeless:

1. **Time module** (`relativeShort`, `relativeLong`, `clockTime`, `absoluteDate`, `absoluteDateTime`, `TIME_PLACEHOLDER`, `TimestampInput`) → **DISSOLVE → `framework/design-system`**. After killing the one server caller (below) it is 100% display code: 2 design-system components + 14 core-ui files. This joins the display helpers and `segmentMentions` the `domain-model` destroyer is already sending to design-system — design-system becomes the single home for "how the app paints a value". The AI3 one-clock invariant (one shared time formatter, 8 prior impls collapsed) is real product value and survives intact — it just stops being a package.
2. **`deriveTitle`** → **DISSOLVE → the work service (`@hyperidle/work`)**. All four production callers are server routes composing bet views (bets, threads, search, teams-routes). Bet-title derivation is bet domain logic, not "presentation format". The one web caller uses the *deprecated alias* for a live preview — it inlines a 10-line local copy.
3. **`scopeKindToLabel` + `deriveInitials`** → **DISSOLVE → inline**. Details per row; both shared-package justifications are false on measurement.

The package's own claim to exist — "shared between server and web" — is true for exactly one 5-line function (`scopeKindToLabel`), and 5 lines do not buy a framework package. Everything else is either one-sided or a drift bug wearing a "canonical" badge.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/presentation-format" layers framework applications tools` → 3 package worlds, 26 production import sites. Nothing in `applications/` or `tools/`.

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `framework/design-system` (CommentRow, ArtifactTimestamp) | `clockTime`, `TIME_PLACEHOLDER`, `absoluteDate`, `relativeLong` | **Yes — becomes the owner.** Time module moves in; imports become sibling-file imports. |
| `layers/core-ui` (14 prod files) | `relativeShort` ×6, `relativeLong` ×3, `clockTime` ×3, `absoluteDate` ×2, `absoluteDateTime` ×2, `scopeKindToLabel` ×2, `deriveTitleFromPitch` ×1 | Time via design-system (already a dependency). `scopeKindToLabel`: core-ui **already has the file** (`src/utils/scope-labels.ts`, currently a thin re-export — restore the 5 lines). Title preview: inline copy in `WorkBetCreate.tsx`. |
| `layers/core-api` (7 route files) | `deriveTitle` ×4, `deriveInitials` ×2, `scopeKindToLabel` ×1, `relativeLong` ×1 | `deriveTitle` → work service. `deriveInitials` + `relativeLong` callers are DELETE (server presentation fields, below). `scopeKindToLabel` → 5 lines inline in the knowledge service's `resolveScopeName`. |

Note the shape: three consumers importing three *disjoint* symbol sets. Per the brief, that is not a shared package — it is symbols in the wrong place.

## If written today, from scratch

- A time module inside `design-system` — the 5 registers + placeholder, unexported input type. That's the whole survivor.
- `deriveTitle` as a private helper of the work service's bet view composition.
- No server-computed initials, no server-humanized timestamps, no deprecated aliases, no package.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 1 |
| KEEP | 7 |

Surface: 11 exports → 7 survivors, **0 remaining in this package — package deleted** (100% of the boundary cut; 36% of the symbol surface cut).

## Feature-level kills

1. **Server-computed presentation fields — kill the whole pattern.**
   - `agentInitials` in API responses (`routines-routes.ts:264`, `teams-routes.ts:751`, typed in `framework/domain-model/src/routine.ts:57,92`, echoed in the review-artifact payload). The web *already has its own* `deriveInitials` (`layers/core-ui/src/utils/initials.ts`) with **different semantics** — "Ada Lovelace" renders "AL" from the server, "AD" from the client. Two algorithms are live today; the "server-side canonical form" lore is a fiction. The API returns `agentName`; the client derives initials with the one function it already uses in 4 components. Kills the package's `deriveInitials` outright.
   - Humanized `executedAt` (`reviews.ts:126`: `relativeLong(pcView.outcome.executedAt)`). A relative time computed at response time is frozen — stale the moment it lands. Return ISO; ReviewPage (which already imports `relativeShort`) formats it. Kills the only server time-consumer, making the time module purely display code.
2. **`deriveTitleFromPitch`** — deprecated alias, one caller, U1 said "will be removed in a subsequent workpackage". This is that workpackage.
3. **The package itself** — after 1 and 2 no symbol has consumers on both sides of the server/web line except one 5-line mapping.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `deriveTitle` | fn | UI: bets/threads/search/teams routes (server view composition) | KEEP → move to `@hyperidle/work` | Bet domain logic with 4 server callers; web preview inlines its own copy. |
| 2 | `deriveTitleFromPitch` | fn | UI: WorkBetCreate preview only | DELETE | Deprecated alias of #1; migrate the one caller, honor the U1 removal promise. |
| 3 | `relativeShort` | fn | UI: 6 core-ui files (rows/chips) | KEEP → move to `design-system` | The default relative register; deleting it recreates the 8-impl drift AI3 killed. |
| 4 | `relativeLong` | fn | UI: 3 core-ui + ArtifactTimestamp; server caller (reviews.ts) DIES | KEEP → move to `design-system` | Prose register, 4 real display callers after the server one is killed. |
| 5 | `clockTime` | fn | UI: CommentRow + SessionView/PartList/SessionActivityPanel | KEEP → move to `design-system` | Wall-clock register for the activity log; 4 callers. |
| 6 | `absoluteDate` | fn | UI: ArtifactTimestamp, AgentProfile, RoutineDetailPane | KEEP → move to `design-system` | Calendar register, 3 callers. |
| 7 | `absoluteDateTime` | fn | UI: KnowledgeDetail, RoutineDetailPane | KEEP → move to `design-system` | Date+clock register, 2 callers. |
| 8 | `deriveInitials` | fn | UI: 2 server routes shipping `agentInitials` fields | DELETE | Server presentation field; web already owns a *different* `deriveInitials` and all 4 web components use it — the split-brain dies with this export. |
| 9 | `scopeKindToLabel` | fn | UI: knowledge.ts `resolveScopeName` fallbacks + KnowledgeDetail/ScopeChangeDialog | MERGE → inline into knowledge service AND `core-ui/src/utils/scope-labels.ts` | 5 pure lines; the web file already exists as a re-export — put the lines back. Two copies of a 3-branch mapping is cheaper than a package. |
| 10 | `TimestampInput` | type | none — zero external references (rg-confirmed) | SIMPLIFY | Unexport; internal parameter type of the time module, travels with it. |
| 11 | `TIME_PLACEHOLDER` | const | UI: CommentRow (design-system) + internal | KEEP → move to `design-system` | The invalid-timestamp sentinel CommentRow compares against; becomes a sibling import. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `TimestampInput` | SIMPLIFY (unexport) | No external importer anywhere; exists only for the time functions' signatures. |

## Holes this leaves

- **`agentInitials` removal is a contract change.** `WorkTeam.tsx:485` and `ReviewOutcomeSummary.tsx` render the API-provided field; both must derive from `agentName` via the existing `core-ui/utils/initials.ts`. `ReviewOutcomeSummary`'s payload type-guard (`isString(payload.agentInitials)`, line 346) must relax — old stored review-artifact payloads keep the field, new ones drop it. Visible side effect: initials switch to the web algorithm everywhere ("AL" → "AD" style) — a *consistency fix*, but a visible one.
- **`executedAt` becomes ISO** in the proposed-call review response — ReviewPage formats it client-side. The AL7 lore "never raw ISO in the response" is repealed for this field; the raw value is a timestamp, not user prose, so nothing injects.
- **`scopeKindToLabel` exists twice** (knowledge service + core-ui). Drift risk priced at 5 lines and 3 branches; the AE1/AD6 web tests pin the web copy.
- **`WorkBetCreate` preview duplicates `deriveTitle`** (~10 lines). Preview drift is cosmetic — the server value is the one persisted.
- **Test relocation:** package `__tests__` move with the time module to design-system; `time-vocabulary.spec.ts` (e2e) and the KnowledgeDetail/AE1/AD6 web tests keep passing untouched paths only if imports are re-pointed — mechanical.


---

# query-escaping — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → inline**

An entire npm package (package.json, tsconfig, index barrel, src file, test file) for ONE line of
production code: `s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")` — collapsible
to a single regex `s.replace(/[\\%_]/g, "\\$&")`.

The founder's question — load-bearing against SQL injection, or a line of code in its caller — has a
clear answer: **it is not injection protection at all.** Every call site feeds the escaped string
into a Drizzle-bound parameter (e.g. `knowledge-repository.ts:986` builds
`` `%${escapeLikePattern(query)}%` `` and passes it through Drizzle operators/`sql` bindings).
Drizzle parameterises the value; injection was never possible through this path. What the function
actually guards is LIKE **wildcard semantics** — the real I2 V4 bug where a search for `_` or `%`
matched every row. That is a correctness behavior worth keeping. It is one line. One line does not
get a package.

AU29 moved it out of `framework/db` with the argument "pure string substrate, so it gets a framework
package of its own." Wrong conclusion: pure one-line string substrate gets inlined, not packaged.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/src/routes/users.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/src/routes/threads.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/src/routes/search.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/knowledge/src/knowledge-repository.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/users/src/user-store.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/work/src/work-service.ts` | `escapeLikePattern` | Yes — one line |

Six consumers, one symbol, all inside the core-api layer. This is not a shared abstraction — it is
one line of code that was homeless and got a house instead of moving in with its callers.

## If written today, from scratch
No package. Each search-building call site escapes its own pattern with the one-liner (or the
three routes share a local helper inside core-api root). The `ESCAPE '\\'` pairing note lives as a
comment at each LIKE clause — which is where the obligation sits anyway; a comment in a distant
framework package never enforced it.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 0 |
| MERGE | 0 |
| SIMPLIFY | 1 |
| KEEP | 0 |
Surface: 1 export → 0 exports (100% package cut; behavior survives as an inline line)

## Feature-level kills
None — no feature dies. The package dies; the behavior (wildcard-literal search) survives at the
call sites. Its unit test dies with it; wildcard-literalness is assertable in the search tests of
each owning service if anyone cares to keep the I2 V4 regression pinned.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `escapeLikePattern` | function | INTERNAL to callers (reached via UI search/list routes: `/api/search`, threads, users, work, knowledge) | SIMPLIFY | One-line pure function; not injection defense (Drizzle parameterises), only wildcard correctness. Inline `s.replace(/[\\%_]/g, "\\$&")` at all 6 call sites; delete the package. |

## Holes this leaves
- Six copies of one regex can drift. Priced: the regex has three characters of domain knowledge and
  has changed once since inception (a comment fix). If drift ever bites, the fix is a failing search
  test, not a package.
- The central doc-comment explaining the `ESCAPE '\\'` contract loses its single home. Postgres
  defaults the escape char to `\`, so today's call sites already rely on default behavior; the
  comment moves to the call sites that need it.


---

# tool-protocol — destroyer verdict (framework)

## Where does this package go?
**Verdict: SPLIT then dissolve — seam types → `harness-protocol`, behavior → `tool-handlers`, catalog → DELETE. Package dies.**

This package's founding rationale is dead. The AU19 docstring in `tool.ts` says it exists so
`tool-provider` (agent-execution) and `tool-handlers` (agent-orchestration) can share types without
depending on each other. `tool-provider` no longer exists — AU31 moved `tool-registry.ts` into
`tool-handlers`. What remains is one package that owns almost everything (`tool-handlers` imports
16 of the 23 exports and is the sole production caller of 6 of the 9 functions) plus a thin
cross-layer residue of 4 seam types that execution and core-api consume via DI.

That residue (`ToolRegistry`, `ToolResult`, `ToolContext`, `RegisteredTool` + the `ClaudeToolSpec`
member type and the `ok`/`err` constructors) is exactly what `harness-protocol` already is: the
server-side execution-seam contract package, already imported by core-api, agent-orchestration,
agent-execution, and both applications. `tool-protocol` already depends on `harness-protocol`
(for `SessionWorkflow`) and has zero consumers `harness-protocol` doesn't have. Two packages, one
seam, one direction — merge them.

**The three-siblings answer: `tool-protocol` + `harness-protocol` should be ONE package.
`harness-capability` stays a second, separate one.** The audience test decides it:
- `tool-protocol` and `harness-protocol` have the identical audience — core-api / orchestration /
  execution / applications, **zero UI consumers**. Two names for one seam is tidiness, not value.
- `harness-capability` has a genuinely different audience: `core-ui` imports it in 7 files
  (SettingsHarnesses, AgentEditor, SetupFlow, SessionView, …) and must not see the worker
  protocol / EventBus / db-adjacent types that live in `harness-protocol`. That is the one
  audience split AU34 got right. (Its own 15-export surface is another destroyer's problem;
  per the `conversation-parts` finding, that package's edge to it — a six-line composer filter —
  should die regardless.)

So: three packages → two. `tool-protocol` is the one that dies.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/tool-protocol"` — 11 production files across 6 packages; everything else is
tests (30+ files, almost all importing only `ToolContext` to type fixtures).

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `agent-orchestration/tool-handlers` (tool-definitions.ts, tool-registry.ts) | `toRegistered`, `wrapForRegistry`, `toClaudeToolSpec`, `classifyReversibility`, `identityHash`, `ok`, `err`, `AssistantToolShape`, `ToolDefinition`, `BuildToolRegistryOptions`, `RegistrySessionWorkflow`, `ProposedCallWorkflowPort`, `ClaudeToolSpec`, `RegisteredTool`, `ToolContext`, `ToolRegistry`, `ToolResult` | **Yes — it is the real owner.** Sole production caller of 6 of 9 functions. All registry-building machinery moves here. |
| `agent-execution/harness-registry` (mcp-bridge, mcp/index, builtin-harness-adapter, return-status-tool) | `ToolRegistry`, `ToolResult`, `RegisteredTool`, `ToolContext`, `ok` | No — it consumes the built registry via DI. Needs a shared home → `harness-protocol`, which it already imports in 12 files. |
| `agent-execution` (boot.ts) | `RegisteredTool`, `ToolRegistry` (types) | No — same as above. |
| `agent-orchestration` (run-orchestration-composition.ts) | `ProposedCallWorkflowPort`, `ToolContext`, `ToolRegistry` (types) | Partly — same layer as `tool-handlers`, imports the port from there. |
| `core-api/review` (proposed-call-workflow.ts) | `ToolResult` (type, one import) | No — one type → `harness-protocol`, already a core-api dependency. |
| `core-api/settings` (plugin-configuration.ts) | `BUILTIN_TOOL_CATALOG` (one call site, line 761) | Yes — via a DI parameter wired at the composition root. The static import dies with the catalog. |

## If written today, from scratch

There is no `tool-protocol` package. The seam contract — "orchestration builds a tool registry,
execution invokes it, review records outcomes" — is five types and two 3-line constructors inside
`harness-protocol`:

- `ToolResult`, `ok`, `err`
- `ToolContext`
- `RegisteredTool`
- `ToolRegistry` (whose face carries `ClaudeToolSpec`)

Everything that *builds* registries (`ToolDefinition`, `toRegistered`, `toClaudeToolSpec`,
`classifyReversibility`, `identityHash`, `BuildToolRegistryOptions`, `RegistrySessionWorkflow`,
`ProposedCallWorkflowPort`) lives inside `tool-handlers`, mostly unexported. The builtin-tool
catalog is a projection computed from `ALL_TOOL_DEFINITIONS`, not a hand-maintained mirror.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 16 |
| SIMPLIFY | 0 |
| KEEP | 0 |
Surface: 23 exports → 0 (package deleted; ~9 survive as public exports elsewhere — 7 in `harness-protocol`, ~2 in `tool-handlers` — the rest become unexported internals or die). 100% of the package cut.

## Feature-level kills

1. **The AL7 native-carrier allow/deny composer never shipped.** `composeWorkflowAllowDeny`'s own
   docstring promises it is "used by per-harness native carriers (Claude allowedTools/
   disallowedTools)". No production file imports it — only
   `layers/core-api/src/__tests__/AL7-classifier.test.ts`. The real enforcement is the router
   inside `tool-registry.invoke`. TEST-ONLY = dead code plus a test that dies with it.
   What breaks: nothing; the native-carrier optimization was never wired.

2. **The hand-maintained builtin-tool mirror.** `BUILTIN_TOOL_CATALOG` (127 lines of duplicated
   name/description/roles/reversibility) exists only because `settings` (core-api) can't import
   `tool-handlers` (orchestration), and it is kept honest by a dedicated drift test
   (`builtin-tool-catalog-consistency.integration.test.ts`) that deep-equals it against
   `ALL_TOOL_DEFINITIONS`. A mirror plus a test proving the mirror is a mirror is pure ceremony.
   Kill both: `tool-handlers` exports a catalog *projection* derived from `ALL_TOOL_DEFINITIONS`;
   the composition roots (desktop, remote-server — they already import both layers) inject it into
   the settings service. Drift becomes impossible instead of tested-for.
   What breaks: one new constructor parameter on the settings service, one wiring line per app.

3. **The second way to define a tool.** The AD8b `AssistantToolShape`/`AssistantToolResult`/
   `wrapForRegistry` family exists so exactly **two** tools (`makeCreateBetTool`,
   `makeEditBetTool` in tool-definitions.ts) can return `{status: "ok"|"error"}` instead of
   `{success: boolean}` — and `wrapForRegistry` immediately converts it back to `ToolResult`.
   Two result grammars for one idea. Rewrite those two handlers as plain `ToolDefinition` + `ok`/
   `err` (mechanical, behavior-neutral — the wrapper already erased the difference on the wire)
   and delete all three exports.

4. **Centralized types nobody centralizes on.** `RegistrySessionWorkflow` was placed here to be
   shared — `run-orchestration/provisioner.ts:298` instead maintains its own structural copy
   (`SessionLifecycleRegistrySessionWorkflow`). The center bought nothing; the type goes to its
   one real importer, `tool-handlers`.

## Full export audit

Reach evidence: per-symbol `rg -a` over `layers framework applications tools` excluding tests;
graph blind spots re-checked for the three DEAD/TEST-ONLY rows (no dynamic dispatch on any of
these names — they are direct imports everywhere they appear; catalog is data, not dispatched).

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `ok` | fn | INTERNAL (tool-handlers bodies ×26 tools, harness-registry return-status-tool ×2) | MERGE → `harness-protocol` | 3-line constructor of `ToolResult`; rides with the type both layers consume. |
| 2 | `err` | fn | INTERNAL (tool-handlers bodies) | MERGE → `harness-protocol` | Same — the failure constructor lives next to the union it builds. |
| 3 | `toRegistered` | fn | INTERNAL (tool-definitions.ts only) | MERGE → `tool-handlers`, unexport | One production caller; boundary-erasure adapter for the registry builder — internal detail of building. |
| 4 | `wrapForRegistry` | fn | INTERNAL (tool-definitions.ts, 2 call sites) | DELETE | Exists to convert the second result grammar back to the first; dies with the AssistantTool family (kill #3). |
| 5 | `toClaudeToolSpec` | fn | INTERNAL (tool-registry.ts only + 1 test) | MERGE → `tool-handlers`, unexport | One production caller; the registry's `toClaudeToolSpecs()` face is the public thing, this helper is not. |
| 6 | `classifyReversibility` | fn | INTERNAL (tool-definitions.ts, tool-registry.ts) | MERGE → `tool-handlers` | Both callers in one package. 12 lines of if-chain is not a framework concern. |
| 7 | `canonicalJson` | fn | TEST-ONLY as export (only `identityHash` calls it in production; AL7-classifier.test imports it) | MERGE → into `identityHash` body | Sort-keys-then-stringify is an implementation detail of the hash; the export is dead. |
| 8 | `identityHash` | fn | INTERNAL (tool-registry.ts only; other `identityHash` hits are DB column/field names, not this function) | MERGE → `tool-handlers` | One production caller. The hash lands in `proposed_calls.identity_hash` as convenience metadata; the producer owns the producer function. |
| 9 | `composeWorkflowAllowDeny` | fn | TEST-ONLY (`AL7-classifier.test.ts`) | DELETE | Promised harness-carrier consumers never wired; the invoke-router does the real work. Delete function + its test cases (kill #1). |
| 10 | `ToolCatalogEntry` | interface | DEAD as import (zero external importers — settings uses the const, type inferred) | DELETE | Dies with the catalog; the projection's row type lives in `tool-handlers` (kill #2). |
| 11 | `ToolContext` | interface | Cross-layer: run-orchestration-composition, tool-handlers, harness-registry return-status-tool; ~25 test files | MERGE → `harness-protocol` | The genuine per-invocation seam contract every tool body receives; both layers need it, so it lives in the seam package. |
| 12 | `ToolResult` | type | Cross-layer: core-api/review, harness-registry mcp-bridge, tool-handlers | MERGE → `harness-protocol` | Three layers consume it; it is the wire shape of the seam. |
| 13 | `ToolHandler` | type | DEAD as export (zero external importers; only used as a member type inside this file) | DELETE export | Becomes an unexported alias next to `RegisteredTool`. Nobody names it. |
| 14 | `ToolDefinition` | interface | INTERNAL (tool-definitions.ts; return-status-tool hits are comments) | MERGE → `tool-handlers` | The authoring shape for tool bodies — lives with the 26 bodies and `toRegistered`. |
| 15 | `RegisteredTool` | interface | Cross-layer: agent-execution boot.ts (extraTools), harness-registry return-status-tool, tool-handlers | MERGE → `harness-protocol` | Execution injects extra tools of this shape into the registry — a real seam type. |
| 16 | `ClaudeToolSpec` | interface | INTERNAL by import (tool-registry.ts only; harness-registry consumes it structurally via `registry.toClaudeToolSpecs()` at builtin-harness-adapter.ts:1007) | MERGE → `harness-protocol` | Member of `ToolRegistry`'s face; rides with it. |
| 17 | `ToolRegistry` | interface | Cross-layer: boot.ts, harness-registry (mcp/index, mcp-bridge, builtin-harness-adapter), run-orchestration-composition; ~8 test files | MERGE → `harness-protocol` | **The** seam: orchestration builds it, execution invokes it. The one export that justifies any shared home at all. |
| 18 | `RegistrySessionWorkflow` | interface | INTERNAL (tool-registry.ts only; provisioner.ts keeps its own structural copy, harness-port.ts hit is a comment) | MERGE → `tool-handlers` | The one place that would share it already copied it instead (kill #4). Centralization proved worthless. |
| 19 | `BuildToolRegistryOptions` | interface | INTERNAL (tool-registry.ts only; composition infers it from `buildToolRegistry`'s signature) | MERGE → `tool-handlers`, unexport | A function's own options bag exported for uniformity — nobody imports it in production. |
| 20 | `ProposedCallWorkflowPort` | interface | INTERNAL to agent-orchestration (run-orchestration-composition.ts, tool-registry.ts; core-api/review implements it structurally without importing) | MERGE → `tool-handlers` | One implementation, but the seam is layer-real (orchestration cannot import review; composition wires it). Both importers are agent-orchestration — the port belongs to the layer that consumes it, not a framework package. |
| 21 | `AssistantToolResult` | type | DEAD as export (zero external importers; internal to the shape's handler signature) | DELETE | Second result grammar for two tools (kill #3). |
| 22 | `AssistantToolShape` | interface | INTERNAL (tool-definitions.ts, 2 factories: create_bet, edit_bet) | DELETE | Rewrite the two factories as plain `ToolDefinition`; the family dies (kill #3). |
| 23 | `BUILTIN_TOOL_CATALOG` | const | `UI:` indirectly — plugin-configuration.ts:761 seeds tool-capability defaults read by settings routes | DELETE | 127-line hand-kept mirror of `ALL_TOOL_DEFINITIONS` guarded by a drift test. Replace with a derived projection injected at the composition root; delete mirror + drift test (kill #2). |

Also dies with the package: `framework/tool-protocol/src/__tests__/tool.test.ts` (its surviving
cases move with the functions into `tool-handlers`), and the
`builtin-tool-catalog-consistency.integration.test.ts` drift test.

## Holes this leaves

1. **`harness-protocol` grows a `zod` type dependency** (`RegisteredTool.inputSchema: z.ZodType`).
   Type-only import; acceptable price for deleting a package.
2. **Settings service gains a constructor parameter** (`toolCatalog`); desktop and remote-server
   composition roots each add one wiring line from `tool-handlers`' derived projection. If a
   future third app forgets the wire, plugin defaults for builtin tools are empty — loud at first
   use, not silent.
3. **`create_bet`/`edit_bet` handlers get rewritten** from status-shape to `ToolResult`. Behavior
   is provably identical (the deleted wrapper already normalized them), but it touches two
   HIGH-RISK-labeled tool bodies; their existing integration tests must stay green unmodified.
4. **~30 test files churn an import path** (`@hyperidle/tool-protocol` → `@hyperidle/harness-protocol`
   for `ToolContext`/`ToolRegistry`). Mechanical, zero logic change.
5. **If AL7 native carriers are ever actually built**, `composeWorkflowAllowDeny` must be
   rewritten (~20 lines). It was never called; git history keeps it.
6. **Package count**: framework loses one package; the AU19 "Mechanism C" doc comments in
   `tool-handlers` need their pointers updated or they'll describe a package that no longer exists.


---

# toon-codec — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `run-orchestration` (inline); decoder half DELETED outright**

This "codec" encodes and never decodes. Production reach, measured:

- `encodeTyped` — exactly ONE production caller in the whole repo:
  `layers/agent-orchestration/run-orchestration/src/context.ts:142` (`buildSessionContextToon`),
  which writes `context/session.toon` into an agent sandbox. The agent reads that file as prompt
  text; the LLM is the decoder.
- `decode`, `decodeTyped`, `ToonParseError` — `rg -a` across `layers framework applications tools`
  finds ZERO references outside `framework/toon-codec/src` itself. Only the package's own test file
  exercises them. Nothing machine-parses a `.toon` file back, anywhere: not writeback, not the
  harness, not eval. The decoder — the majority of the file, ~170 of ~285 lines, including the
  whole nested-keypath parser and its error class — is TEST-ONLY, i.e. dead.

A codec used in one direction is not a codec; it is a serializer with a dead twin. The live half
(`encode` + `flattenToLines`, ~55 lines) moves into `context.ts` next to its only caller, and the
package dies.

**Does it merge with `presentation-format`?** No. Measured `presentation-format` consumers are
core-ui pages/components, design-system, and core-api routes — human-facing display formatting.
TOON is an LLM prompt-file format with one consumer in run-orchestration. Grafting a one-consumer
agent format onto a UI formatting package manufactures a fake shared audience. Dissolve into the
consumer instead.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/agent-orchestration/run-orchestration/src/context.ts` | `encodeTyped` only | Yes — sole consumer; ~55 lines move in |

## If written today, from scratch
A private `encodeToon(obj): string` function inside `run-orchestration/src/context.ts` (or a
sibling file in that package). No decoder until the day something actually reads TOON back — that
day has not come since the format was invented.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 3 |
| MERGE | 1 |
| SIMPLIFY | 0 |
| KEEP | 1 |
Surface: 5 exports → 1 private function (80% cut; package deleted)

## Feature-level kills
- **TOON parsing as a capability**: dies entirely. Round-trip fidelity stops being a maintained
  promise; the format's only contract becomes "readable by an LLM". Acceptable because no code has
  ever consumed the parse side in production.
- **The package's test file**: the decode/round-trip tests die with the decoder. Encoder behavior
  (undefined-skipping, multiline `|` blocks, empty-string vs null) gets pinned where the output is
  produced — a context.ts test asserting the written `session.toon` content, which is the only
  contract that matters.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `encodeTyped` | function | INTERNAL (one caller: `context.ts:142`, reached via session provisioning) | MERGE | Pure passthrough — its own comment admits "no cast needed". The generic wrapper exists to contain a cast that does not exist. Fold into `encode`. |
| 2 | `decodeTyped` | function | TEST-ONLY | DELETE | Zero production callers; a typed wrapper over a dead decoder, whose doc admits it validates nothing. |
| 3 | `encode` | function | INTERNAL (only via `encodeTyped`) | KEEP | The one live behavior: writes `session.toon` agent context. Survives as a private function inside `run-orchestration`; the package around it dies. |
| 4 | `decode` | function | TEST-ONLY | DELETE | Zero production callers anywhere in the repo. ~120 lines of parser + keypath reconstruction serving only its own test file. Write-only format — the LLM is the decoder. |
| 5 | `ToonParseError` | class | TEST-ONLY | DELETE | Only thrown by `decode`; dies with it. |

## Holes this leaves
- If a future feature needs to machine-read `session.toon`, the parser must be rewritten (~120
  lines) or the data re-emitted as JSON alongside. Priced: the context bundle that feeds `encode`
  is already structured data in the DB — anything wanting it back should read the source, not
  re-parse a prompt file.
- `encodeTyped`'s `@lore TOON-boundary` comment about cast containment becomes moot and must not be
  carried over — it documents a problem the code no longer has.


---

# work-intent-port — destroyer verdict (framework)

## Where does this package go?

**Verdict: DISSOLVE → `framework/domain-model`**

This package is one source file (361 lines) declaring the payload family of the core→orchestration
work-intent seam — and that family is already scattered across four packages:

1. `framework/work-intent-port` — the "canonical" copy (this package).
2. `framework/domain-model` — owns `AGENT_WORK_INTENT_KINDS` (`src/events.ts:14`), the runtime kind
   list this package's union discriminant is built from. This package's own doc comment
   (`agent-work-intent-recorder.ts:286`) says "see `AGENT_WORK_INTENT_KINDS` **below**" — the const
   isn't below, it's in a different package. The doc is lying because the family was split.
3. `framework/api-contract` — `AgentOrchestrationWorkIntentInput`/`AgentOrchestrationWorkIntentKind`
   (`agent-orchestration-port.ts:130-150`), a hand-typed structural mirror of
   `AgentWorkIntentRecorderInput` with `bakedRequest: unknown`, "duck-type compatible on purpose".
4. `layers/agent-orchestration/session-requests` — the ACTUAL owner of `agent_work_intents` does
   **not import this package at all**. `service.ts:1363-1400+` keeps local mirrors of
   `BakedContextKnowledgeItem` and `BakedContextBundle` with comments pointing back here
   ("local mirror — see `@hyperidle/work-intent-port`").

A "port" package whose one real implementation side refuses to import it and mirrors it instead is
not a shared contract — it is a shrine. The smoking gun for the dissolve target:
`domain-model/src/__tests__/agent-work-intent-recorder.test.ts` imports
`AgentWorkIntentRecorderInput` from this package to pin it against domain-model's own
`AGENT_WORK_INTENT_KINDS` — domain-model carries a devDependency **back-edge** on this package
purely to test one half of a declaration family against the other half. Put them in the same file
and the back-edge, the cross-package test reach, and the lying doc comment all disappear.

Feasibility is total: this package's only dependency is `@hyperidle/domain-model` (it already
imports `AgentSessionSourceKind`/`AgentSessionSourceCorrelation`/`UserRole` from there), and every
one of its 11 production consumers — session-requests, run-orchestration, harness-protocol,
routine, work, review, policy, knowledge, conversation, core-api/src, tools/eval — **already
depends on domain-model**. The move adds zero edges and deletes a package plus a dev back-edge.

Why not the other targets:
- **→ `session-requests`** (the implementing service): impossible — core-api emitters may not
  import an orchestration service; that direction rule is the one real thing the seam enforces.
- **→ `api-contract`**: its convention is zero-dep hand-typed mirrors with opaque `unknown`
  payloads; the baked shapes are domain content, not wire mirrors. And harness-protocol importing
  api-contract for `BakedContextBundle` would be a worse edge than the domain-model one it has.
- **→ inline**: 11 production consumers on both sides of a seam neither may cross. Inlining is
  exactly the disease already visible — two mirrors exist. STAYS SHARED is true of the *types*,
  but not of the *package*: shared types do not earn a package when a shared package that every
  consumer already imports sits right next to them holding the other half of the same family.

The AU31 reshape also hollowed the port's founding story. The package header
(`agent-work-intent-recorder.ts:11-19`) justifies the `TTx` generic with "the write must stay
atomic with the caller's own insert" and "the real concrete recorder (`enqueueWorkIntent`) is
assigned unchanged — no adapter needed." Both claims are now false: the only production
implementation is `buildSeamBackedWorkIntentRecorder` (`agent-orchestration-port-composition.ts:465`),
whose `record` **ignores the executor it is handed** (`_tx`) and does an HTTP round trip
(`port.intents.submit(input)`), with cross-layer atomicity explicitly relinquished (AU31 §3.1).
The port's one load-bearing parameter is a vestigial lie that makes every call site
(`threads.ts:1520 record(db, …)`, work's `AgentWorkIntentRecorder<WriteExecutor>` ports) look
transactional when it is not.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/work-intent-port"` — 11 production consumers + 5 test files:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/src` (threads.ts, sessions-routes.ts, app.ts, policy-bindings.ts, agent-orchestration-port-composition.ts) | `AgentWorkIntentRecorder`, `AgentWorkIntentRecorderInput`, `BakedWorkIntentRequest` | No — emit side, but orchestration must see the same types |
| `layers/core-api/conversation` | `bakeAgentRunnableConfig`, `BakedAgentRunnableConfig` | No |
| `layers/core-api/work` (ports, session-start-resolver, task-run-resolver, task-state-machine) | recorder type, both bakers, `BakedWorkIntentRequest`, baked types | No |
| `layers/core-api/review` (ports, proposed-call-workflow) | recorder type, both bakers, baked types | No |
| `layers/core-api/knowledge` | both bakers, `BakedAgentRunnableConfig`, `BakedContextBundle` | No |
| `layers/core-api/routine` (routine-service, ports) | both bakers, `BakedWorkIntentRequest`, `SessionKnowledgeItemLike` | No |
| `layers/core-api/policy` (ports) | `BakedWorkIntentRequest` | No |
| `layers/agent-orchestration/run-orchestration` (runtime, context, provisioner) | `BakedAgentRunnableConfig`, `BakedContextBundle`, `BakedContextKnowledgeItem` | No — consume side |
| `layers/agent-orchestration/session-requests` | **nothing** — comment references only; keeps local mirrors | It owns the table but can't be imported by core |
| `framework/harness-protocol` | `BakedAgentRunnableConfig`, `BakedContextBundle` | No — already imports domain-model |
| `tools/eval` | `bakeAgentRunnableConfig` | No |

Genuinely multi-consumer, both sides of a layering seam → the **types** stay shared; the
**package** dies into domain-model, which every consumer above already imports.

## If written today, from scratch

One file in `framework/domain-model` (e.g. `src/work-intent.ts`), sitting next to
`AGENT_WORK_INTENT_KINDS`:

- `BakedWorkIntentRequest`, `BakedAgentRunnableConfig`, `BakedContextBundle`,
  `BakedContextKnowledgeItem` (absorbing `SessionKnowledgeItemLike`)
- `AgentWorkIntentRecorderInput` — derived from a kind→sourceKind table instead of six copy-pasted
  54-line union members that differ only in two string literals
- `bakeAgentRunnableConfig`, `toBakedContextKnowledgeItems`
- **No recorder interface, no reader interface.** Emitters inject a function
  `(input: AgentWorkIntentRecorderInput) => Promise<{ id; idempotencyKey }>` — which is exactly
  what `AgentOrchestrationPort.intents.submit` already is.

Package `framework/work-intent-port`: deleted.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 1 |
| KEEP | 6 |

Surface: 10 exports → 7 surviving symbols (30% export cut) — and **1 package → 0 packages**,
plus two out-of-package mirror declarations (`session-requests`' local `BakedContextBundle` /
`BakedContextKnowledgeItem`) and two cross-package pin tests die as collateral.

## Feature-level kills

**The DI-port fiction.** `AgentWorkIntentRecorder<TTx>` + `AgentWorkIntentReader<TDb>` are ports
with, respectively, one implementation and zero implementations. The recorder's generic `tx`
parameter is ignored by its only production implementation (post-AU31 the seam is an HTTP call;
atomicity was formally relinquished), so every `record(db, …)` / `record(tx, …)` call site is
cosplay. The reader (`findByKindAndSource`) matches **nowhere** in the repo outside this package —
zero implementations, zero callers, kept alive only by two stale `@lore` comments
(`sessions-routes.ts:100`, `durable-agent-queue.ts:39`). What breaks when both die: nothing at
runtime. Call sites retype their injected dep as the plain submit-function; the two
`agent-work-intent-recorder-shared-type.test.ts` pin tests (work, review) are deleted with the
type they pin.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `bakeAgentRunnableConfig` | function | UI:POST /api/threads/:id/messages, /api/tasks/:id/transition, /api/knowledge/:id/flag, /api/routines/:id/trigger, /api/sessions/, /api/reviews/proposed-calls/* (7 production callers incl. tools/eval) | KEEP | Real credential-leak guard: whitelist-picks 4 fields off a full `User` row so name/avatar/credentials never ride into persisted `payloadJson`. Moves to domain-model. |
| 2 | `toBakedContextKnowledgeItems` | function | UI: same resolver doors (task-run, knowledge-action, routine, proposed-call — 4 production callers) | KEEP | One shared field-pick + `layer ?? null` normalize instead of 4 reimplementations. Moves to domain-model. |
| 3 | `BakedWorkIntentRequest` | interface | UI/SCHED: every intent-emitting door (15 UI doors, 2 timers via `enqueueWorkIntent` trace) | KEEP | The seam payload itself — the thing that makes orchestration a zero-read blind executor. Moves to domain-model. |
| 4 | `BakedAgentRunnableConfig` | interface | UI/SCHED: all emitters + run-orchestration `admitSession` + harness-protocol | KEEP | Consumed on both sides of the seam plus harness-protocol. Moves to domain-model. |
| 5 | `BakedContextKnowledgeItem` | interface | UI/SCHED: emitters + run-orchestration `context.ts` | KEEP | Bundle member read on the consume side. Moves; `session-requests`' local mirror of it dies. |
| 6 | `SessionKnowledgeItemLike` | interface | INTERNAL + routine/ports.ts (types the injected `assembleSessionKnowledge`) | MERGE | Same 6 fields as #5, differing only in `layer?` optionality — a duck-type of `@hyperidle/knowledge`'s `KnowledgeItemWithProjection`. Make `layer: string \| null` required at the knowledge boundary and this collapses into #5; the `?? null` in #2 dies too. |
| 7 | `BakedContextBundle` | type | UI/SCHED: emitters + run-orchestration runtime/context/provisioner + harness-protocol | KEEP | The 3-variant context bake the blind executor dispatches on. Moves; `session-requests`' local mirror dies. (Its `kind:"knowledge"` variant is a flagged capability-add per its own `@lore` — architecture reconciliation, not a destroyer kill.) |
| 8 | `AgentWorkIntentRecorderInput` | type | UI/SCHED: every emitter + intake routes + session-requests validation | SIMPLIFY | Six 9-line union members differing only in two string literals — derive from a kind→sourceKind table next to `AGENT_WORK_INTENT_KINDS` in domain-model, so the discriminant and the runtime list stop living in different packages and domain-model's pin test becomes same-file. `api-contract`'s hand mirror (`AgentOrchestrationWorkIntentInput`) stays as the deliberate opaque wire twin — but it now mirrors a neighbor, not a fourth package. |
| 9 | `AgentWorkIntentRecorder` | interface | BOOTSTRAP: `app.ts:405-437` wires `buildSeamBackedWorkIntentRecorder`; injected into threads.ts, work, policy, routine, review | DELETE | Port with one implementation = indirection, and its `TTx`/`tx` parameter is a lie — the sole implementation ignores it (`record: (_tx, input) => port.intents.submit(input)`). It is a second name for `AgentOrchestrationPort.intents.submit`. Replace every injected `AgentWorkIntentRecorder<X>` with the plain function type; delete the two shared-type pin tests with it; fix the false atomicity story in the package header by deleting the package. |
| 10 | `AgentWorkIntentReader` | interface | DEAD | DELETE | Zero implementations, zero callers — `findByKindAndSource` appears nowhere outside this package (`rg -a` across layers/framework/applications/tools). Referenced only by two stale `@lore` comments. Dead on arrival since the AU31 reshape. |

## Types / DI ports

Covered in rows 3-10 above. Net: 6 data shapes survive (5 KEEP + 1 absorbed by MERGE), both DI-port
interfaces die, the input union survives simplified. All survivors relocate to
`framework/domain-model`; the package is deleted.

## Holes this leaves

- **None at runtime for the dissolve itself** — pure relocation into a package every consumer
  already imports; `tsc` re-verifies conformance mechanically. ~30 import-path edits.
- **Row 9 (recorder delete):** every `record(tx, …)` call site loses its executor argument. That
  argument does nothing today, but the edit touches ~10 call sites across threads/work/policy/
  routine/review plus `app.ts`'s `options.agentWorkIntentRecorder` test-override hook, which must
  be retyped to the plain function. The two `agent-work-intent-recorder-shared-type.test.ts` files
  are deleted — they pin a type that no longer exists, which is the point.
- **Row 10 (reader delete):** none. Also delete the two stale `@lore` comments naming it
  (`layers/core-api/src/routes/sessions-routes.ts:100`,
  `layers/agent-orchestration/src/services/durable-agent-queue.ts:39`) or they will resurrect it in
  some future agent's head.
- **Row 6 (merge):** requires `@hyperidle/knowledge` to return `layer: string | null` (required)
  from `assembleSessionKnowledge` — a one-field tightening in one package; routine/ports.ts retypes
  one injected dep.
- **domain-model grows** by ~250 lines of seam types. That is not a hole — it is the family
  reuniting with the kind list, the source-kind types, and the pin test that already live there.


---

# harness-registry — destroyer verdict

## Should this service exist?

**KEEP AS the harness door.** This is the one service whose whole job is the thing HyperIdle *is* on the execution side: reaching a real harness (builtin / claude-code / codex / opencode / cursor-agent), streaming its events, and forcing agents to return their work. Every agent session in the product flows through `pool.select()` → an adapter here → the MCP bridge here. Delete this and there are no agents.

But it carries dead substrate: a 334-line session-probe file nothing calls, a 4-arm factory with one live arm, an eval-only adapter, a sandbox `exec` surface no production code invokes, a hand-kept duplicate of MODEL_CATALOG, a process-global singleton that exists so an adapter can secretly reach a registry the composition root already owns, and one HTTP door (`GET /api/workers`) no client has ever called.

## If written today, from scratch

- `createLocalAdapterPool()` + `AdapterPool` with `select/release` (session admission), `register/unregister/has/pause/resume` (worker WS), `describe/refresh/size` (Settings harness surface)
- `BuiltinHarnessAdapter`, `CliHarnessAdapter`, `RemoteHarnessAdapter` — the three real execution paths, each behind the `HarnessAdapter` contract; `callLlm` as the builtin's engine
- `discoverLocalHarnesses()` — one table-driven probe loop, not five hand-written probes
- MCP bridge: `createMcpToolBridge` (open/close return the URL themselves), `createMcpSession`, `createMcpRouter`, `returnStatusTool`
- `provisionHarnessEnvironment` (MCP config + return hooks into the sandbox)
- `createReturnEnforcement()` as a plain factory — instance owned by the composition root, injected everywhere, no singleton
- `createSandboxAdapter` with `spawn/destroy` only

Everything outside that list is a deletion candidate by construction — and is verdicted below.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 13 |
| MERGE | 3 |
| SIMPLIFY | 7 |
| KEEP | 46 |

Methods (sections A+B, 54 rows): DELETE 10, MERGE 3, SIMPLIFY 3, KEEP 38.
Surface: 54 methods → 41 methods (~24% cut). Files that die whole: `harness-session-probe.ts` (334 lines), `harness-adapter-factory.ts` (174), `mcp-tool-bridge.ts` shim (3); plus `exec`/`exists`/`runShell`, the `MODEL_CONTEXT_WINDOWS` map, two MCP wrappers, the enforcement singleton — roughly 700+ lines.

The KEEP count is high because this service *is* the execution spine: 30 of the 46 KEEPs are the member methods of the three adapters and the pool, each traced to a live door (session admission, worker WS, Settings UI, MCP bridge). The bloat here is in the exported-function layer and the types, not in the adapters.

## Feature-level kills

1. **Session-probe subsystem** (`harness-session-probe.ts`, `HarnessDiscoveryInput.sessionProbe`). "AM3 will wire it" — AM3 never did. Zero production callers; only an integration test and comments reference it. Because `runtimeFromDiscovery` gates `fileEditing/toolUse` on `sessionProbe?.ok`, those flags are already permanently false in production — deleting the probe is behavior-neutral. The AM2 real-discovery test and its fixtures die with it.
2. **`createHarnessAdapter` factory + `DirectHarnessAdapter`.** Production uses exactly one arm (`remote`, in `layers/agent-execution/src/boot.ts:196`). `builtin`/`cli` arms: production goes through `createLocalAdapterPool`'s direct `new` calls, never the factory. `direct` arm: only `tools/eval/src/provision-harness.ts` — eval tooling, not a product door. Delete the file; export `RemoteHarnessAdapter` (and `BuiltinHarnessAdapter`/`CliHarnessAdapter` for eval); move `DirectHarnessAdapter` (~90 lines) into `tools/eval` if the eval lane still wants a raw one-shot adapter.
3. **`GET /api/workers` dead door.** No UI, no client, nothing in `core-ui`/desktop/website fetches it (the desktop worker panel uses the Electron preload, not this route). Kill the route (`layers/core-api/src/routes/workers.ts`), the `workerConnections` read-model in `framework/harness-protocol`, and `AdapterPool.list` — its only production caller.
4. **Sandbox `exec` surface.** The provisioner calls `spawn` and `destroy` only (`provisioner.ts:1012,1702,1728`). `exec`, `exists`, the `runShell` helper, and `ExecResult` are test-only. The sandbox is a directory lifecycle, not a shell.
5. **`MODEL_CONTEXT_WINDOWS` duplicate catalog.** A hand-kept map with an @lore begging to be kept in sync with `MODEL_CATALOG` — which already carries `contextWindow` per model. Derive; delete the map and its two sync-assertion test files.
6. **Return-enforcement process singleton.** Exists only so `CliHarnessAdapter.streamEvents` can secretly re-fetch the shared registry (`cli-harness-adapter.ts:772`) and so tests can opt out via `{isolated: true}` — a test-only flag in production code. Inject the registry into `CliHarnessAdapter`; make `createReturnEnforcement()` a plain factory; the flag, the spec type, and the module-level global all die. Tests get simpler, not broken.
7. **MCP wrapper pair.** `closeMcpBridgeSession(bridge, token)` is literally `bridge.close(token)`. `openMcpBridgeSession` adds one string template. Fold the URL into `McpToolBridge.open`; delete both free functions. The AU31 "one Service knows `/api/mcp/`" ruling is preserved — the spelling moves inside the bridge, still in this package.
8. **Discovery probe sprawl** (SIMPLIFY, not delete). `probeCodexCli` / `probeClaudeCodeCli` / `inspectOpenCode` / `probeCursorAgentCli` are four ~60-line copies of version-check → auth-check → parse, differing only in commands and one parse rule. Collapse to one table-driven probe. The per-harness special-casing that must survive is the *config* (auth parse, models command), not four function bodies.
9. **`mcp-tool-bridge.ts` compat shim** — 3-line re-export kept "for frozen direct-import tests"; `index.ts` even routes its public `McpToolBridge` type through it. Delete; re-export from `./mcp/index.js`.
10. **Stale lore/slop:** `llm-client.ts` claims a `./llm-client` subpath that `package.json` does not export; `returnStatusTool` is a function-object `Object.assign` chimera so "both bridge factories are callable" — nothing calls it as a function; export the plain object.

## Full method audit

### A. Exported functions

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `createLocalAdapterPool` | BOOTSTRAP (agent-execution boot, local topology) | KEEP | Builds the pool every agent session runs on; the product's harness registration moment. |
| 2 | `modelContextWindow` | INTERNAL (builtin pre-compaction check) | MERGE | Duplicate of `MODEL_CATALOG.contextWindow` with a sync-burden lore comment; derive from the catalog, delete `MODEL_CONTEXT_WINDOWS`. |
| 3 | `createHarnessAdapter` (builtin overload) | TEST-ONLY (prod uses `new BuiltinHarnessAdapter` in pool factory; eval uses this) | DELETE | Factory arm with no production caller. |
| 4 | `createHarnessAdapter` (cli overload) | DEAD (prod uses `new CliHarnessAdapter` in pool factory) | DELETE | Factory arm nothing calls. |
| 5 | `createHarnessAdapter` (direct overload) | DEAD in product (only `tools/eval/provision-harness.ts:128`) | DELETE | `DirectHarnessAdapter` is eval-only; move class to tools/eval or delete outright. |
| 6 | `createHarnessAdapter` (remote overload) | BOOTSTRAP (`boot.ts:196` → worker WS) | MERGE | The one live arm; boot constructs `RemoteHarnessAdapter` directly, factory file dies. |
| 7 | `createHarnessAdapter` (implementation) | see 3–6 | DELETE | Dies with the factory; `isSocket` guard moves next to `RemoteHarnessAdapter` if kept at all. |
| 8 | `createCapabilityCatalog` | INTERNAL (AdapterPool.describe) | SIMPLIFY | Factory returning `{describe, missing}` — a wrapper around two functions; export the functions. |
| 9 | `discoverLocalHarnesses` | BOOTSTRAP + UI:POST /api/harnesses/redetect (via pool.refresh) | SIMPLIFY | Core discovery stays; collapse the four copy-paste CLI probes into one table-driven loop (feature kill 8). |
| 10 | `probeHarnessSession` | TEST-ONLY | DELETE | 334-line "AM3 will wire it" substrate; AM3 never came; deletion is behavior-neutral (caps already gated false). |
| 11 | `setLlmInterceptor` | dev-world seam (cassette installs; e2e lane entry) | KEEP | AU28 founder-ruled inversion: 15 lines that keep the replay e2e lane possible without prod→dev imports; deleting silently turns replay runs into live network calls. |
| 12 | `callLlm` | INTERNAL (builtin loop — every builtin session) | KEEP | The builtin harness's engine; retry/timeout/provider-switch is the product's direct-API path. |
| 13 | `createMcpToolBridge` | AGENT:/api/mcp/:token (mounted pre-auth by boot) | KEEP | THE tool-call door for every CLI harness session. |
| 14 | `openMcpBridgeSession` | BOOTSTRAP (boot wires provisioner port) | MERGE | One string template around `bridge.open`; fold URL construction into `McpToolBridge.open`. |
| 15 | `closeMcpBridgeSession` | BOOTSTRAP (boot wires provisioner port) | DELETE | Pure passthrough to `bridge.close` — the definition of a wrapper. |
| 16 | `createMcpSession` | INTERNAL (bridge.open) | KEEP | Token mint + per-session McpServer + stateful transport — the bridge's actual mechanics. |
| 17 | `createMcpRouter` | AGENT:/api/mcp/:token + POST .../return-status | KEEP | Routes agent JSON-RPC and adjudicates the claude/codex stop hooks — the return-enforcement door. |
| 18 | `provisionHarnessEnvironment` | INTERNAL via boot port (session provisioning, every CLI session) | KEEP | Writes the MCP config + return hook into the sandbox; without it CLI harnesses can't reach HyperIdle tools. |
| 19 | `createReturnEnforcement` | BOOTSTRAP (boot) + INTERNAL (cli adapter re-engage) | SIMPLIFY | Drop the test-only `{isolated}` spec and the module singleton; plain factory, instance injected into `CliHarnessAdapter` (feature kill 6). |
| 20 | `createSandboxAdapter` | BOOTSTRAP (boot, topology switch) | KEEP | Two-line topology switch between the only two real sandbox modes. |

### B. Class member methods

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 21 | `AdapterPool.refresh` | UI:POST /api/harnesses/redetect | KEEP | The Settings "redetect" button; refreshes readiness/auth/models. |
| 22 | `AdapterPool.size` | UI:agent-profile (`registeredHarnessCount` → harnessAvailable) | KEEP | One-line getter feeding a real UI availability flag. |
| 23 | `AdapterPool.register` | BOOTSTRAP + AGENT:WS /ws/worker (worker-ingress:194) | KEEP | How every adapter — local at boot, remote at worker register — enters the pool. |
| 24 | `AdapterPool.unregister` | AGENT:WS /ws/worker (close + stale-reconnect evict) | KEEP | Worker lifecycle; without it dead workers stay selectable. |
| 25 | `AdapterPool.has` | AGENT:WS /ws/worker (duplicate-id hijack guard) | KEEP | One-line guard the worker reconnect path depends on. |
| 26 | `AdapterPool.list` | DEAD door (only `workerConnections` → GET /api/workers, which nothing calls) | DELETE | Kill the route, the read-model, and this method together (feature kill 3). |
| 27 | `AdapterPool.pause` | UI:SettingsWorker toggle → WS pause msg | KEEP | Live shipped worker-pause control. |
| 28 | `AdapterPool.resume` | UI:SettingsWorker toggle → WS resume msg | KEEP | Other half of the same control. |
| 29 | `AdapterPool.select` | INTERNAL→provisioner:950 (every agent-session door) | KEEP | The pool's reason to exist — least-loaded eligible adapter per session. |
| 30 | `AdapterPool.describe` | UI:GET /api/harnesses (+ agent-profile, validate-agent-config) | KEEP | The capability-descriptor surface behind the harness picker and guided setup. |
| 31 | `AdapterPool.release` | INTERNAL→provisioner (session end/crash paths) | KEEP | Load accounting; without it capacity leaks to zero. |
| 32 | `BuiltinHarnessAdapter.setSessionToolRegistry` | INTERNAL→provisioner:1247 | KEEP | Per-session tool injection — the builtin's whole tool surface arrives here. |
| 33 | `BuiltinHarnessAdapter.startSession` | INTERNAL→provisioner (pool.select) | KEEP | HarnessAdapter contract; builtin session start. |
| 34 | `BuiltinHarnessAdapter.streamEvents` | INTERNAL→provisioner drain | KEEP | Event stream the whole session lifecycle consumes. |
| 35 | `BuiltinHarnessAdapter.stopSession` | INTERNAL→provisioner | KEEP | Contract; abort + outcome. |
| 36 | `BuiltinHarnessAdapter.getCapabilities` | INTERNAL→pool.describe + provisioner | KEEP | Feeds descriptor surface and channel selection. |
| 37 | `BuiltinHarnessAdapter.getForceReturnCount` | INTERNAL→provisioner:1617 | KEEP | Unifies in-turn force count into the turn metric the drain gate reads. |
| 38 | `CliHarnessAdapter.checkAvailability` | BOOTSTRAP (pool factory registration gate) | KEEP | Decides which CLI harnesses register at all; drop the test-only `whichFn` deps while here. |
| 39 | `CliHarnessAdapter.startSession` | INTERNAL→provisioner (pool.select) | KEEP | Spawns the real claude/codex/opencode/cursor-agent process — the core door. |
| 40 | `CliHarnessAdapter.streamEvents` | INTERNAL→provisioner drain | KEEP | ndjson→HarnessEvent translation + opencode process-reengage; live return enforcement. |
| 41 | `CliHarnessAdapter.stopSession` | INTERNAL→provisioner | KEEP | SIGTERM→SIGKILL teardown; contract. |
| 42 | `CliHarnessAdapter.getCapabilities` | INTERNAL→pool.describe + provisioner | KEEP | Declares channel + MCP dialect the provisioner branches on. |
| 43 | `DisabledSandboxAdapter.spawn` | BOOTSTRAP (server topology) | KEEP | Loud-reject guard letting the shared backend boot with zero agents (AQ1). |
| 44 | `DisabledSandboxAdapter.exec` | DEAD (port member `exec` has no production caller anywhere) | DELETE | Dies with the port member (row 68). |
| 45 | `DisabledSandboxAdapter.destroy` | BOOTSTRAP (server topology) | KEEP | Same guard, teardown half. |
| 46 | `LocalSandboxAdapter.spawn` | INTERNAL→provisioner:1012 | KEEP | Creates the per-session working directory — every local session. |
| 47 | `LocalSandboxAdapter.exec` | TEST-ONLY (`workspace-adapter.test.ts` only) | DELETE | No production caller; `runShell` helper and its lore die too. |
| 48 | `LocalSandboxAdapter.destroy` | INTERNAL→provisioner:1702,1728 | KEEP | Sandbox teardown on session end. |
| 49 | `LocalSandboxAdapter.exists` | TEST-ONLY | DELETE | Not even on the port; a test convenience living in production. |
| 50 | `RemoteHarnessAdapter.startSession` | AGENT:WS /ws/worker (dispatch to worker) | KEEP | Shared-mode's only agent execution path — a peer desktop runs the session. |
| 51 | `RemoteHarnessAdapter.streamEvents` | AGENT:WS /ws/worker | KEEP | Worker event relay into the same drain loop. |
| 52 | `RemoteHarnessAdapter.stopSession` | AGENT:WS /ws/worker | KEEP | Stop over the wire + result await. |
| 53 | `RemoteHarnessAdapter.getCapabilities` | INTERNAL→pool.describe + provisioner | KEEP | Declares process-reengage channel for remote. |
| 54 | `RemoteHarnessAdapter.dispatchMessage` | AGENT:WS /ws/worker (worker-ingress:214) | KEEP | The S2-F07 routing without which every remote streamEvents hangs forever. |

### Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `SelectRequirements` | KEEP | All three members production-live: provisioner passes modelProviders/harnessType, admitSession passes disabledTypes (AM4). |
| `AdapterFilter` | SIMPLIFY | `kind` member has zero production callers (routes filter by type/includeKnownMissing only); drop `kind`, and the type shrinks further when `list` dies. |
| `HarnessAdapterSpec` | DELETE | Dies with the factory (rows 3–7). |
| `CallLlmOptions` | KEEP | `callLlm`'s signature; internal. |
| `LlmInterceptor` | KEEP | The AU28 seam's type (row 11). |
| `LlmContentBlock` | KEEP | `LlmMessage.content`'s element type; internal wire shape. |
| `LlmMessage` | KEEP | Internal wire shape both providers normalize to. |
| `LlmResponse` | KEEP | Same. |
| `McpToolBridge` | SIMPLIFY | Survives as the bridge port, but `open` absorbs baseUrl/url (row 14) and the type moves out of the `mcp-tool-bridge.ts` shim. |
| `ProvisionOptions` | KEEP | `provisionHarnessEnvironment`'s input; every field production-used. |
| `ReturnEnforcementSpec` | DELETE | `isolated` is set by tests only; dies with the singleton (feature kill 6). |
| `SandboxHandle` | KEEP | spawn/destroy contract; provisioner holds it across the session. |
| `ExecResult` | DELETE | Dies with `exec` (rows 44/47). |
| `SandboxAdapter` | SIMPLIFY | Drop `exec`; the port becomes `spawn`/`destroy` — what the product actually uses. |

### Const / enum exports

| Declaration | Verdict | Reason |
|---|---|---|
| `returnStatusTool` | SIMPLIFY | Production-live (AGENT: `return_status` tool, injected per session by provisioner:1237) — but the callable-function `Object.assign` chimera serves nothing that calls it as a function; export the plain definition object. |

## Holes this leaves

- **Session probe:** the AM2 real-harness-discovery integration test and its committed fixtures die. Runtime `fileEditing/toolUse` capability flags stay false for undiscovered families — exactly what production already does today, so no observable change. If AM3-style probe-gated capabilities are ever wanted, the probe gets rewritten against that real need.
- **Factory deletion:** `tools/eval/provision-harness.ts` must construct `BuiltinHarnessAdapter`/`CliHarnessAdapter` directly (requires exporting both classes from the barrel) and absorb `DirectHarnessAdapter` (~90 lines) into tools/eval — or the eval "external raw adapter" mode dies with it.
- **`GET /api/workers`:** worker admin visibility over HTTP is gone. The desktop worker panel is unaffected (it uses the Electron preload). If a shared-server admin view is ever actually built, re-add the route then — earned, not preserved.
- **Sandbox `exec`:** any future "run a command in the sandbox from the server" feature re-adds it against a real caller. Today that caller does not exist.
- **Enforcement singleton removal:** touches `CliHarnessAdapter`'s constructor (inject the registry) and ~8 test files that currently pass `{isolated: true}` — they call the plain factory instead, which is strictly simpler.
- **MERGE of MCP wrappers:** `boot.ts` re-wires `openMcpBridge`/`closeMcpBridge` to the bridge methods; the provisioner port is unchanged.
- **`MODEL_CONTEXT_WINDOWS` merge:** the two catalog-sync test files (`context-window.test.ts` re-keying asserts, `AH2-cost-context.test.ts`) die — the sync problem itself no longer exists.


---

# knowledge — destroyer verdict

## Should this service exist?

**KEEP AS the shared-knowledge store + session-context assembler — nothing else.** Shared knowledge is one of HyperIdle's three pillars (conversations, bets, knowledge), and two things in this package are genuinely load-bearing: the CRUD surface behind the Knowledge UI + agent tools (`write_memory`, `query_practice`, `promote_knowledge`, `create_conflict_review`, writeback), and `assembleSessionKnowledge`, which puts shared knowledge into every agent session at launch.

Everything else is an autonomous curation bureaucracy bolted onto that store: **three separate scoring systems** (attention score, relevance score, session ranking score — three answers to "how important is this item", only the third is ever consumed by anything that matters), an access-telemetry log with its own retention reaper, two nightly sweeps (auto-promotion, stale-decay), a contradiction detector fed by `meta.claims`/`meta.forbids` JSON that **no production write path ever produces** (verified: zero writers repo-wide — it structurally cannot fire), and a flag→agent-review pipeline whose HTTP door has **zero callers** since AD6 removed Flag from the UI ("it is an agent operation, not user-facing" — no agent path exists either). Roughly half the package (~2,300 of 4,620 lines: attention-service, attention-scoring, attention-classifier, promotion-pipeline, relevance-service, relevance-engine, relevance-listener, fts, knowledge-action-resolver, factory-seed) serves machinery no human asked for and no door reaches, or reaches only through doors that themselves should die.

## If written today, from scratch

Eleven functions:

- `create`, `get` (item / joined-detail), `update`, `remove`, `list` (visible, retroForBet, titlesByIds, recentByLayers, relatedByTopic, base), `search` (text mode only), `count` (triage badge)
- `transition` (two targets: `promote`, `changeScope`)
- `recordConflict`, `findOpenConflict` (protect agent-proposed edits from silent loss on version conflict)
- `assembleSessionKnowledge` (with `rank` folded in as a private function)

No scoring engines, no sweeps, no access log, no FTS, no flag resolver, no factory seed.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 19 |
| MERGE | 2 |
| SIMPLIFY | 8 |
| KEEP | 13 |

Surface: 42 function rows → 21 surviving declarations (50% cut); ~4,620 lines → ~2,300 (10 of 21 source files deleted outright).

## Feature-level kills

1. **Attention engine — whole feature** (`attention-service.ts` 463 lines, `attention-scoring.ts` 340, `attention-classifier.ts` 52, attention half of `scoring-config.ts`). DB-weighted heuristic scores, a 0.7 threshold that auto-creates review items with idempotency markers, Mechanism-C ports into `work` and `review`. Kill the callers too: `score_attention` tool (already a literal no-op for its `item` target), `POST /api/knowledge/:id/recompute-attention`, `PATCH /:id/attention-score`, seam methods `recomputeAttentionScoreForItem` + `upsertKnowledgeAppProjectionAttentionScore`, `recomputeAttentionForCandidates` routine port, `review`'s `createReviewItemForKnowledge`/`attentionReviewReasoningMarker` and `work`'s `findItemByReasoningMarker` port wiring, `knowledgeAppProjection.attentionScore` column. What breaks: nothing auto-surfaces "knowledge needs attention"; triage sorts by updatedAt. Acceptable — a small team curates by reading. If wanted later, earn it from a real learning (ETHOS), don't pre-build it.
2. **Relevance engine — whole feature** (`relevance-service.ts` 254, `relevance-engine.ts` 119, `relevance-listener.ts` 47, relevance half of `scoring-config.ts`). Recomputes a denormalized `relevanceScore` on every item view; its only consumer is a sort pill in KnowledgeList. `rank()` — the scoring that actually matters — never reads it. What breaks: the "relevance" sort pill. Acceptable.
3. **Access telemetry — whole feature** (`recordAccess`, `countAccesses`, `reapAccessLog`, `knowledgeAccessLog` table, `knowledge_accessed` event). Per-item view logging with 30-day counts and its own retention reaper — an audit trail with a retention policy, the purest enterprise reflex in the package. Every seam version-lookup pollutes it. What breaks: accessCount on detail page, frequency sort pill, lastActivityAt in list. Acceptable.
4. **Auto-promotion + stale sweeps** (`promotion-pipeline.ts`, 634 lines, all of it). 5-cross-scope auto-promotion, 90-day auto-stale, contradiction detection over meta JSON nobody writes (provably dead logic). Kill callers: `builtin:knowledge-promotion` + `builtin:knowledge-decay` routine specs/crons/handlers/ports. Promotion stays what it honestly is: a deliberate `promote_knowledge` act by an agent or human. What breaks: no automatic lifecycle transitions. Acceptable — and the 9-status lifecycle these sweeps justify should shrink with them.
5. **Flag → knowledge_action pipeline** (`knowledge-action-resolver.ts` 177 lines, `POST /:id/flag` route, `transition({target:"flag"})`, `resolveOrCreateKnowledgeCallingThread` binding, the `knowledge_action` intent kind downstream). The door has zero UI and zero seam callers — TEST-ONLY end to end. Delete the route, the resolver, the tests.
6. **FTS** (`fts.ts`, 127 lines). The *default* mode of `search()` — and both production callers pass `mode:"text"`. The default is dead code. ILIKE is the search.
7. **Factory knowledge seed** (`factory-seed.ts`). Seeds one "Boil the Lake" row on first boot, with a dedicated writer whose only reason to exist is edit-log-free parity with a pre-move snapshot. The principle lives in ETHOS.md and system prompts; a fresh install with an empty fabric is honest.
8. **Dead read variants**: `get({view:"projection"})`, `list({exportable})` (lore cites a consumer in `server-factory.ts` — file renamed, usage gone), `list({scope})` + the `KnowledgeScope` type (core-api's own barrel records its re-export was deleted for zero consumers).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `recomputeAttention` | UI:POST /api/knowledge/:id/recompute-attention (seam←AGENT:score_attention) + SCHED:builtin:knowledge-promotion | DELETE | Attention bureaucracy; kill the tool, both routes, and the routine with it. |
| 2 | `ensureFactoryKnowledgeSeed` | BOOTSTRAP (factory-state.ts first boot) | DELETE | Seeds one decorative row; the principle lives in ETHOS.md. Empty fabric on install is honest. |
| 3 | `resolveKnowledgeActionRequest` | TEST-ONLY (sole caller is POST /:id/flag — zero UI/seam callers since AD6) | DELETE | Dead door end to end; 177-line resolver for a session kind that never fires. |
| 4 | `recordConflict` | UI:POST /api/knowledge/:id/conflicts (seam←AGENT:create_conflict_review + writeback) | KEEP | Stops agent-proposed edits being silently lost on version conflict — real collaboration value. |
| 5 | `findOpenConflict` | UI:GET /api/knowledge/:id/conflicts (seam←AGENT:create_conflict_review dupe check) | KEEP | Same door as recordConflict; the dupe check that keeps one open conflict per agent per item. |
| 6 | `create` | UI:POST /api/knowledge + AGENT:write_memory + writeback + bets retro | SIMPLIFY | Core writer. Drop `attentionScore`/`confidence`/`meta` inputs — no live producer, engines dead. |
| 7 | `update` | UI:PATCH /api/knowledge/:id (autosave) + writeback optimistic-lock + bets retro | SIMPLIFY | Core writer with version gate. Same input shrink as create. |
| 8 | `get` (view:"full") | UI:POST /api/bets retro (bets.ts:954) | KEEP | The one joined single-item read; detail folds into it (row 9). |
| 9 | `get` (view:"detail") | UI:GET /api/knowledge/:id | MERGE | Into `full` — after score columns die, detail ≡ full minus nothing. Two joined views is one view. |
| 10 | `get` (view:"projection") | DEAD (zero production callers; rg-confirmed) | DELETE | Nobody asks for layer+kind alone. |
| 11 | `get` (view:"summary") | UI:GET /api/knowledge/:id + seam version/status lookups + bets/threads/flag routes | KEEP | The raw-row read; most callers. |
| 12 | `get` (impl) | — | SIMPLIFY | Two views survive (item, full); switch shrinks 4→2. |
| 13 | `list` ({visibleWithSignals}) | UI:GET /api/knowledge/ (KnowledgeList + AppShell) | SIMPLIFY | Core list, but signals (accessCount30d/lastActivityAt/relevance/attention) die with telemetry — becomes a plain visible-items list. |
| 14 | `list` ({retroForBet}) | UI:POST bets retro (bets.ts:940) | KEEP | Bet-retro reflection upsert lookup — bets pillar feeding the knowledge pillar. |
| 15 | `list` ({titlesByIds}) | UI:threads route (threads.ts:472) | KEEP | Batched title resolve for knowledge references in threads. |
| 16 | `list` ({recentByLayers}) | SCHED:builtin:portfolio-retro | KEEP | Monthly portfolio retro's recent-knowledge digest; routine survives this audit. |
| 17 | `list` ({exportable}) | DEAD (lore cites `server-factory.ts` — renamed, zero usage) | DELETE | Export-format machinery with no consumer; enterprise reflex. |
| 18 | `list` ({relatedByTopic}) | UI:GET /api/knowledge/:id (related items panel) | KEEP | Real detail-page feature. |
| 19 | `list` ({scope}) | DEAD (zero production callers) | DELETE | Leftover from deleted knowledge-reader; kill `KnowledgeScope` with it. |
| 20 | `list` (base ListFilters) | INTERNAL (assembleSessionKnowledge's fetchAllForLayer only) | SIMPLIFY | Drop `topic`/`kind` filters nobody passes; layer/scopeId/limit/offset is the whole need. |
| 21 | `list` (impl) | — | SIMPLIFY | 8 variants → 6; dispatch shrinks accordingly. |
| 22 | `count` ({triageVisible}) | UI:GET /api/knowledge/triage-count (AppShell badge) | KEEP | The draft-awaiting-curation badge — the human side of agent write_memory drafts. |
| 23 | `search` | UI:GET /api/knowledge/search (seam←AGENT:query_practice) + UI:GET /api/search | SIMPLIFY | Both production callers pass `mode:"text"`. Delete FTS mode + `fts.ts` — the dead default. Text-only, no mode param. |
| 24 | `countAccesses` | UI:GET /api/knowledge/:id (accessCount display) | DELETE | Access telemetry; dies with the log. Kill the route field + detail-page display. |
| 25 | `transition` ({target:"recomputeAttention"}) | UI:PATCH /:id/attention-score (seam←AGENT:score_attention override) | DELETE | Agents hand-setting attention scores is ceremony; engine dead, column dead, tool dead. |
| 26 | `transition` ({target:"promote"}) | UI:POST /:id/promote (seam←AGENT:promote_knowledge) | KEEP | The one deliberate lifecycle door; conflict gate rides it. |
| 27 | `transition` ({target:"flag"}) | TEST-ONLY (POST /:id/flag has zero callers) | DELETE | Dead door — AD6 removed Flag from the UI; no agent path exists. |
| 28 | `transition` ({target:"changeScope"}) | UI:PATCH /:id/scope (ScopeChangeDialog) | KEEP | Real UI feature; scope drives layer + session visibility. |
| 29 | `transition` ({target:"merge"}) | TEST-ONLY (POST /:id/merge has zero UI/seam callers) | DELETE | Bulk-curation op nobody reaches. |
| 30 | `transition` ({target:"split"}) | TEST-ONLY (POST /:id/split has zero UI/seam callers) | DELETE | Same as merge. |
| 31 | `transition` (impl) | — | SIMPLIFY | 6 targets → 2 (promote, changeScope). |
| 32 | `remove` | UI:POST /api/knowledge/:id/archive (KnowledgeDetail) | KEEP | The archive path; only delete flavor the product needs. |
| 33 | `recordAccess` | UI:GET /api/knowledge/:id (fires on every view incl. seam lookups) | DELETE | Telemetry write on the read path; dies with the log and the `knowledge_accessed` event. |
| 34 | `sweep` ("autoPromotion") | SCHED:builtin:knowledge-promotion (daily 03:00) | DELETE | 5-cross-scope auto-promotion + contradiction detection over meta nobody writes — provably-dead logic in a nightly cron. Kill the routine. |
| 35 | `sweep` ("stale") | SCHED:builtin:knowledge-decay (daily 02:00) | DELETE | 90-day auto-stale is retention ceremony; nothing meaningful consumes "stale". Kill the routine. |
| 36 | `sweep` (impl) | — | DELETE | Both kinds dead; whole `promotion-pipeline.ts` goes. |
| 37 | `rank` | INTERNAL (assembleSessionKnowledge only; barrel export has zero external callers) | MERGE | Fold into assembleSessionKnowledge as a private function; drop the dead `attentionScore` + near-constant `confidence` + writer-less `meta.tags` factors while folding. |
| 38 | `recomputeRelevance` (itemIds) | EVENT:knowledge_accessed (relevance-listener only) | DELETE | Feeds a score whose sole consumer is a sort pill; rank never reads it. |
| 39 | `recomputeRelevance` (signals) | TEST-ONLY (computeSignals overload — no production caller) | DELETE | Test-facing exposure of internals. |
| 40 | `recomputeRelevance` (impl) | — | DELETE | Whole relevance engine goes (service/engine/listener). |
| 41 | `reapAccessLog` | SCHED:retention reaper (service-bootstrap.ts:518) | DELETE | A retention policy for telemetry nobody needs — enterprise reflex squared. Dies with the log. |
| 42 | `assembleSessionKnowledge` | AGENT:every session bake (task_run/routine_run/reengagement/assistant resolvers via DI) + UI:threads route | KEEP | The core value of the fabric: agents launch with ranked shared knowledge. Named doors everywhere. |

### Class

| # | Member | Reach | Verdict | Reason |
|---|---|---|---|---|
| C1 | `KnowledgeActionSourceUnavailableError` | TEST-ONLY (flag chain) | DELETE | Dies with the resolver. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `KnowledgeActionResolverDeps` | DELETE | Port for a dead resolver. |
| `BakedKnowledgeActionRequest` | DELETE | Return shape of a dead resolver. |
| `RecordConflictInput` | KEEP | Input of a kept writer. |
| `CreateKnowledgeItemInput` | SIMPLIFY | Drop `attentionScore`/`confidence`/`meta` — no live producer. |
| `UpdateKnowledgeItemInput` | SIMPLIFY | Same shrink. |
| `ListFilters` | SIMPLIFY | Drop `topic`/`kind` — nobody passes them. |
| `KnowledgeItemView` | SIMPLIFY | 4 views → 2 ("summary" \| "full"). |
| `KnowledgeItemWithProjection` | SIMPLIFY | Drop `attentionScore`/`confidence`/`meta` fields with their columns. |
| `PromoteTransitionResult` | KEEP | Result of the kept promote target. |
| `RecordAccessInput` | DELETE | Dies with recordAccess. |
| `SessionKnowledgeInput` | KEEP | Input of the kept assembler. |
| `KnowledgeLayer` | KEEP | The L0–L4 taxonomy — load-bearing across tools, UI, ranking. |
| `KnowledgeStatus` | SIMPLIFY | 7 statuses + kernel draft/needs_human = a 9-state lifecycle built for the dead sweeps. Honest shape: draft / active / archived (+needs_human if triage keeps it). Collapse once sweeps land. |
| `KnowledgeKind` | KEEP | 8 kinds used by write_memory, UI chips, retro reflections. |
| `KnowledgeScope` | DELETE | Only consumer was dead `list({scope})`; core-api's own barrel already deleted its re-export for zero consumers. |

Not in the input but dies with the above: `rankAndBudget` module export (test-only), `SearchOptions`/`ExportableKnowledgeItemFilters` type exports, `attention-scoring.ts`'s five exports, `attachRelevanceListener`, all of `fts.ts`, `token-budget.ts` survives only as a private helper of the folded rank.

## Holes this leaves

1. **Fresh installs start with an empty knowledge fabric** — no seeded principle row. The principle already ships in ETHOS.md and agent system prompts.
2. **Knowledge list loses its signals column and sort pills** (frequency/relevance/attention); list and triage sort by updatedAt. KnowledgeDetail loses the accessCount stat.
3. **No automatic curation**: no auto-promotion, no auto-stale, no attention-triggered review items. Lifecycle moves only when a human or agent moves it via `promote_knowledge` / the UI. If auto-curation is ever wanted, it gets earned from a real learning — not rebuilt first.
4. **The knowledge_action session kind loses its only producer** (already unreachable) — session-requests can retire that intent kind in its own audit.
5. **Schema debt to collect**: drop `knowledgeAccessLog`; drop `knowledgeAppProjection.attentionScore`/`relevanceScore` (and `confidence`/`meta` once inputs shrink); retire `knowledge_accessed` and the `attention_recomputed`/`auto_promoted`/`contradiction_flagged`/`marked_stale`/`flagged` actions of `knowledge_updated`; delete `builtin:knowledge-decay`/`builtin:knowledge-promotion` routine seeds; delete the `score_attention` tool and the two attention seam methods.


---

# notifications — destroyer verdict

## Should this service exist?

KEEP AS **in-app inbox only** — roughly 450 lines, not 2,739.

What users actually touch is small and real: the policy engine emits `notification` events, the listener writes typed rows (`typeKey`, `urgency`, `sourceLink`), the UI popover reads them (`GET /inbox`), marks them seen/read, and the Settings page mutes types. That is the whole product. Doors: `useNotifications.ts` and `useNotificationMute.ts` in `layers/core-ui/src/hooks/` — the only production clients of any notification endpoint.

Everything else — the entire push-delivery engine — is dead by construction, verified three independent ways:

1. **Off by default, no way on.** `enabled: false` in `layers/core-api/settings/src/server-config.ts:23`. The only writer is `PATCH /api/notifications/config`, and `rg` across `layers framework applications tools` finds **zero production callers** of that endpoint. No UI ever shipped for channels, recipients, or SMTP/ntfy settings. Every real install has run with delivery disabled since day one.
2. **Dead doors.** `GET/PATCH /config`, `POST /test`, `POST /flush`, `POST /digest`, `GET /queue`, `GET /api/status/digest` — the routes exist; nothing in web, desktop, agent tools, or tools/ calls any of them. Curl-only endpoints for a config no one can see.
3. **Dead trigger.** The digest fires on a routine whose id contains `daily_digest` — the only producer of such a routine is `tools/setup/src/demo-fixture.ts`. And even in the demo it no-ops because `enabled` is false.

Silence is the same story with a different mechanism: `server_config.notifications.silence` (`mode`, `silencedTeamIds`, `windowStart/End`) has **no writer anywhere** — no route, no UI. `isSilenced` returns false in every install that has ever existed. Quiet-hours prefs (`quietHoursEnabled` etc.) are PATCHable via `/api/settings` but no UI writes them either.

This is a textbook enterprise notification platform — per-channel adapters, delivery-status state machine, lease recovery, flood caps, digest batching, SSRF guards, credential encryption, secret scrubbing, retriable-error triage — built for a product whose only real notification surface is a popover in the same window.

## If written today, from scratch

Seven methods:

- `enqueue` — insert an inbox row (cap-bounded)
- `listNotifications` — `unread` (popover), `by-event-since` + `pending-by-event` (agent-health self-count/throttle)
- `markNotifications` — `read` / `seen`
- `reap` — TTL GC so the table stays bounded
- `installNotifications` — register the one event listener
- `readPreferences` / `updatePreferences` — mute toggles

No adapters, no channels, no config CRUD, no silence, no digest, no delivery statuses.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 9 |
| MERGE | 0 |
| SIMPLIFY | 5 |
| KEEP | 2 |

Surface: 16 methods → 7 methods (56% cut). By volume the cut is deeper: ~1,600 of `install.ts`'s 1,897 lines are delivery machinery.

## Feature-level kills

1. **Push-delivery engine** (`install.ts` ~lines 90–1,660: console/ntfy/SMTP adapters, dispatcher, drain interval, flushQueue, lease recovery, adapter cache, flood cap, SSRF guard + private-IP tables, secret encryption via credentialStore, error scrubbing, SMTP retriable triage). Breaks: nothing observable — it has never been enabled in any install and cannot be enabled from the product. Also deletes the `nodemailer` + `@types/nodemailer` dependencies and the `item_created` dispatcher subscription (a second, parallel classification path next to the listener — two ways to do one thing).
2. **Daily digest, both flavors.** (a) queue-digest via `routine_fired` — trigger exists only in the demo fixture; (b) `getDailyDigest` behind `GET /api/status/digest` — zero clients (the comment at `routes/status.ts:62` claiming consumers is stale; verified by search). Breaks: nothing. Kills the `digestCron` config field and `work.listQueuedItemsSince`'s only consumer (flag to the `work` destroyer).
3. **Silence + quiet hours** (`silence-policy.ts` entirely, the dispatcher quiet-hours branch, the silence schema in `server-config.ts`, and the consumer branch in `layers/core-api/policy/src/policy-engine.ts` ~line 126 + `PolicyDeps.silence`). Config has no writer; the predicate is constant-false in production. Zero behavior change.
4. **Delivery config CRUD + secrets** (`readConfig`/`updateConfig`, sanitizers, `writeSecret`/`readSecret`, the audit-diff logger in the route — an audit trail for an endpoint nobody calls is the ETHOS anti-pattern verbatim).
5. **Six dead endpoints** in `routes/notifications-routes.ts` + `routes/status.ts` (`/config` x2, `/test`, `/flush`, `/digest`, `/queue`, `/api/status/digest`) plus their test-bucket rate limiter.
6. **Delivery-status lifecycle on the queue** (`pending/sending/sent/failed/dropped`, `attempts`, `claimedAt`, `lastError`, `channel`, `reason`) — with no deliverer, rows have no lifecycle beyond unread → seen/read → reaped. Schema-level follow-up, priced under Holes.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `getDailyDigest` | UI:GET /api/status/digest (route has zero clients) | DELETE | Endpoint nothing calls; route comment claiming consumers is stale. Kill the route too. |
| 2 | `scrubErrorMessage` | INTERNAL (export is TEST-ONLY: `delivery-helpers.test.ts`) | DELETE | Serves only delivery-engine error paths; dies with the engine, test dies with it. |
| 3 | `priorityForSeverity` | INTERNAL (export is TEST-ONLY) | DELETE | ntfy priority mapping for a channel no install has ever enabled. |
| 4 | `classifySmtpRetriable` | INTERNAL (export is TEST-ONLY) | DELETE | SMTP retry triage for a channel with no UI; prior WP already stripped SMTP dev deps. |
| 5 | `installNotifications` | BOOTSTRAP (`service-bootstrap.ts:488`) | SIMPLIFY | Boots 3 workers; 2 are dead (dispatcher routes to disabled delivery, drain flushes to nothing). Shrink to listener-only registration. |
| 6 | `deliver` | UI:POST /api/notifications/test·flush·digest (zero clients) | DELETE | All three variants serve curl-only endpoints; flush/digest additionally no-op on `enabled:false`. Kill the three routes. |
| 7 | `readConfig` | UI:GET /api/notifications/config (zero clients) | DELETE | Redacted view of config no UI renders. Kill route. |
| 8 | `updateConfig` | UI:PATCH /api/notifications/config (zero clients) | DELETE | The only writer of delivery config, and nothing calls it — proof the whole config is dead. Kill route + sanitizers + secret writes. |
| 9 | `readPreferences` | UI:GET /api/notifications/mute | KEEP | Core value: mute toggles in Settings (`SettingsNotifications.tsx` → `useNotificationMute.ts`). Named door, real user. |
| 10 | `updatePreferences` | UI:PUT /api/notifications/mute/:key | KEEP | Same door, write side. Muting a noisy type is the one notification control users have. |
| 11 | `enqueue` | EVENT:notification (listener), EVENT:session_ended (agent-health), SCHED:lifecycle-propagation tick (via `PolicyDeps.notifications.insert`) | SIMPLIFY | Core inbox write. Delete the `dedupeBy` option (zero production callers — verified) and the digest-first cap-eviction loop (delivery-era severity logic); cap becomes "drop oldest". |
| 12 | `listNotifications` | UI:GET /inbox, EVENT:session_ended (agent-health) | SIMPLIFY | 10 filter variants → 3. Keep `unread`, `by-event-since`, `pending-by-event`. Delete `all` + `by-id` (test-support, self-documented as such — test-only reachable = dead), `by-status` (dead /queue), `pending`/`pending-digest`/`by-ids`/`stuck` (delivery-engine-only). |
| 13 | `markNotifications` | UI:POST /seen, POST /:id/read | SIMPLIFY | Keep `read`/`seen` + ids/all selector. Delete `status`/`attempts`/`sentAt`/`lastError`/`claimedAt` patch fields and `onlyIfStatus` guard — all claim/lease machinery for the dead deliverer. |
| 14 | `reap` | SCHED:6h retention tick (`service-bootstrap.ts:516`) | SIMPLIFY | GC is real (bounded local DB) but the predicate is wrong post-kill: nothing reaches `sent/failed/dropped` anymore. Repoint at read/old rows past TTL; drop the `statuses` param. |
| 15 | `isInSilenceWindow` | INTERNAL (silence + quiet-hours only) | DELETE | Both consumers die: silence config has no writer, quiet-hours has no UI. |
| 16 | `isSilenced` | BOOTSTRAP → policy-engine (`service-bootstrap.ts:244`), plus dead flush path | DELETE | Constant-false in every real install — `silence` config has no writer anywhere. Kill the caller too: policy-engine's silence branch + `PolicyDeps.silence` + the schema. Zero behavior change. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `DeliverySpec` | DELETE | Dies with `deliver`. |
| `DeliveryResult` | DELETE | Dies with `deliver`. |
| `NotificationConfigPatch` | DELETE | Dies with `updateConfig`; 18 members describing channels nobody configured. |
| `SafeNotificationConfig` | DELETE | Redaction wrapper for a config endpoint nothing calls. |
| `NotificationFilter` | SIMPLIFY | 10 variants → 3 (`unread`, `by-event-since`, `pending-by-event`). |
| `NotificationSelector` | SIMPLIFY | Keep `ids`/`all`; delete `onlyIfStatus` (claim guard for the dead deliverer). |
| `NotificationPatch` | SIMPLIFY | Keep `read`/`seen`; delete the 5 delivery-lifecycle fields. |
| `NotificationsDeps` | SIMPLIFY | 6 fields → 2. `credentialCipher` + `credentialStore` die with SMTP/ntfy secrets; `users` + `teams` die with `isSilenced`; `serverConfig` shrinks to `mutedTypes`; `work` shrinks to `getItemById` (`listQueuedItemsSince` dies with the digest). |
| `NotificationChannel` | DELETE | No channels survive. |
| `Notification` | DELETE | Adapter payload type; the inbox reads DB rows, never this shape. |
| `NotificationAdapter` | DELETE | No adapters survive; the tests' FakeAdapter dies with it. |

## Holes this leaves

1. **No out-of-app ping, ever.** When the founder is away from the app, nothing emails or pushes. This hole is not new — delivery has been off-by-default and unconfigurable since it shipped; deleting the code makes reality honest. If push is ever actually wanted, build ONE channel with a UI the same day, from a real learning, not this speculative three-channel platform.
2. **Queue retention must repoint.** With delivery statuses gone, `reap(["sent","failed","dropped"])` collects nothing; unaddressed, the inbox grows to the 10k cap. The SIMPLIFY on `reap` (TTL on read/old rows) closes this — it must land in the same change, not later.
3. **Rows with delivery-era fields.** `lifecycle-propagation.ts:645` inserts `severity: "warning"` (not even in the severity union) and agent-health writes `reason`/`channel`/`status` — the queue schema keeps dead columns until a follow-up migration trims it to inbox shape (`id`, `eventType`, `subjectId`, `typeKey`, `urgency`, `title`, `body`, `sourceLink`, `createdAt`, `seenAt`, `readAt`).
4. **Tests die in bulk**: `notifications/src/__tests__/delivery-helpers.test.ts` and most of `install.test.ts`, plus the delivery/dispatcher/silence/digest integration suites under `layers/core-api/src/__tests__/` (`dispatcher`, `AF8-notification-delivery`, `R8-signal-to-noise`, `silence-policy`, `daily-digest`, parts of `notifications-routes`). They test the deleted feature; they die with it.
5. **Cross-service flags**: `@hyperidle/work.listQueuedItemsSince` loses its only consumer (route to the `work` destroyer); `framework/host-process` SSRF helpers may lose a consumer; the two SMTP/ntfy rows in the credentials store become orphans.


---

# org — destroyer verdict

## Should this service exist?

**KILL THE NAME, KILL HALF THE BODY.** "org" is two unrelated things stapled together:

1. **An org chart** (`org-edges.ts`, `org-routing.ts`, the `orgEdges` table, `SettingsOrgChart.tsx`). This is the enterprise reflex incarnate — a routing matrix with THREE mechanisms (direct/function/team) deciding which human receives an agent's review, plus a settings page that literally draws an organogram. HyperIdle is for flat teams of 1–5 humans. The feature's own fallback — "no edges configured → all humans" — IS the flat-team answer, and it is what every fresh install runs on anyway. The entire edges feature is configuration ceremony layered on top of a fallback that already does the right thing. **DELETE the whole capability.**

2. **Teams + agent scaffolding** (`team-lookup.ts`, `scaffold-agents.ts`). Teams are one of the five process-layer primitives and `persistScaffoldedAgents` is the single writer of agent identity — agents as first-class teammates is the product. **This survives — as a service named `teams`, not `org`.**

Survivor routing: `team-lookup.ts` + `scaffold-agents.ts` + `ports.ts` become `@hyperidle/teams` (or fold into the existing team routes' service home). `org-edges.ts`, `org-routing.ts`, and the `orgEdges` table are deleted outright.

## If written today, from scratch

Five methods, one table:

- `getTeam(db, {id|name})`
- `listTeams(db, filter?)`
- `createTeam(db, input)` — single insert, single table
- `updateTeam(db, teamId, patch)`
- `persistScaffoldedAgents(db, deps, teamId, specs, harness?)`

No `teamMembers` table (1:1 with `teams` — a 1:1 companion table is one table wearing two names), no org edges, no review-routing matrix, no rollback-only delete helper.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 5 |
| MERGE | 7 |
| SIMPLIFY | 2 |
| KEEP | 3 |

Surface: 17 method rows (13 distinct functions) → 5 methods (71% cut by row, 62% by function)

## Feature-level kills

**1. The org chart / review-routing edges — whole capability dies.**
`orgEdges` table, `listOrgEdges`, `deleteOrgEdge`, `upsertOrgEdge`, `resolveReviewRecipients`, `SettingsOrgChart.tsx` (entire component + its settings-nav entry), `GET /api/org/` (org-chart payload), `PUT /api/org/edges`, `DELETE /api/org/edges/:id`, `GET /api/org/review-recipients`, and the `upsertOrgEdge` call inside `POST /api/teams` (`layers/core-api/src/routes/teams-routes.ts:330`) that auto-wires the founder as reviewer of every new team.
What breaks: reviews stop being routable to a chosen human; every review adds ALL humans as thread participants (`layers/core-api/review/src/session-review-creator.ts:88` and TOOL `create_item` via `resolveReviewRecipientsForItem`, `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:493` — both replace the call with one `listUsersByKind(db, "human")`).
Why acceptable: that is byte-for-byte the existing fallback behavior for any install that never opened the org-chart settings page. For a solo founder it is identical; for a 5-person team it is the flatter behavior — everyone sees agent reviews. If a real learning later shows review noise hurts, earn a routing feature back then (ETHOS §2: friction is added after evidence, never before).
Collateral to re-point: `SettingsFilesystems.tsx:77` and `SettingsAgents.tsx:167` fetch `/api/org` only to get the teams list — both switch to `GET /api/teams`.

**2. `teamMembers` folds into `teams` — the noun dies.**
The 1:1 invariant (enforced by app-level 500s in `getTeamMembers`) is the schema confessing that two tables are one entity. Fold `capacity`, `activeBets`, `leadAgentId`, `formedAt` into `teams`; re-point `users.teamId` at `teams.id` (one migration). Kills: the `ApiError` 500 machinery, the AK4 two-hop id resolution, `GET /api/org/teams/:teamId/membership`, `GET /api/org/team-members/:teamMembersId`, and the `teamMembersId` ceremony in `CreateTeamInput`. Bonus kill: `teamMembers.dissolvedAt` duplicates `teams.phase = "archive"` — two ways to deactivate a team; keep `phase`, drop `dissolvedAt`.

**3. `deleteTeam` — a rollback pretending to be a feature.**
Sole caller is the `POST /api/teams` specs-empty rollback (`teams-routes.ts:304`). Resolve the scaffold specs BEFORE inserting the team row (pure function, no reason it runs after) and the rollback path evaporates. There is no user-facing delete-team feature anywhere — a delete method with no product behind it does not get to live as "useful someday".

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `listOrgEdges` | UI:GET /api/org/, UI:DELETE /api/org/edges/:id | DELETE | Only feeds the org-chart page and the edge-delete existence check — dies with the edges feature. |
| 2 | `deleteOrgEdge` | UI:DELETE /api/org/edges/:id | DELETE | Edge deletion for a feature that dies; kill the route with it. |
| 3 | `upsertOrgEdge` | UI:PUT /api/org/edges, UI:POST /api/teams/ | DELETE | TOCTOU-safe upsert engineering for an enterprise routing matrix; the teams-routes founder-edge write dies too. |
| 4 | `resolveReviewRecipients` | EVENT:session_ended, AGENT:create_item, UI:GET /api/org/review-recipients | DELETE | Its no-edge fallback (all humans) is the flat-team answer; replace both production callers with one `listUsersByKind(db, "human")` line. |
| 5 | `persistScaffoldedAgents` | AGENT:create_team, AGENT:add_agent, UI:POST /api/teams/, UI:POST /api/users/, UI:GET+PATCH /api/users/:userId/assistant/, UI:POST /api/org/scaffolded-agents | KEEP | Core value: agents are first-class teammates; this is the single writer of agent identity, behind every agent-creation door (human and agent alike). |
| 6 | `resolveTeamAgentHarness` | INTERNAL | MERGE | Not in the barrel, exactly one caller (`persistScaffoldedAgents`); a 15-line if-block does not earn its own file + export — inline it, delete `team-default-harness.ts`. |
| 7 | `getTeam` | UI:GET /api/teams/:teamId +25 more routes, AGENT:add_agent/create_bet/create_routine, SCHED:routine-scheduler, EVENT:session_ended/task_state_changed | KEEP | Teams are a process-layer primitive; this read is load-bearing across bets, tasks, routines, reviews, knowledge. |
| 8 | `listTeams` | UI:GET /api/teams/, GET /api/bets/canvas, GET/PATCH /api/settings/, GET /api/search/ | KEEP | The team directory behind five real UI surfaces. |
| 9 | `getTeamMembers` (overload `require:true`) | UI:POST /api/bets/:id/commit +many, SCHED:notification drain, EVENT:item_created/session_ended | MERGE | The `require:true` 500-throwing invariant police exists only because the schema splits one entity into two tables; fold `teamMembers` into `teams` and this overload is `getTeam`. |
| 10 | `getTeamMembers` (overload optional) | UI:PUT /api/org/edges, GET /api/org/teams/:teamId/membership +many | MERGE | Same body — after the table fold every call site is `getTeam`. |
| 11 | `getTeamMembers` (implementation) | UI/AGENT/SCHED (35 doors via both overloads) | MERGE | Implementation row of #9/#10; dies into `getTeam` with the fold. |
| 12 | `listTeamMembers` (overload `withTeamName:true`) | UI:GET /api/org/ | MERGE | The join-projection exists solely to shape the org-chart payload; org chart dies, the projection dies, survivors use `listTeams`. |
| 13 | `listTeamMembers` (overload plain) | UI:GET /api/bets/canvas, GET /api/team-members/ | MERGE | After the fold this is `listTeams` with an `active` filter (which becomes `phase != "archive"`). |
| 14 | `listTeamMembers` (implementation) | UI (3 doors via overloads) | MERGE | Implementation row of #12/#13; dies into `listTeams`. |
| 15 | `createTeam` | UI:POST /api/teams/, UI:POST /api/org/teams, AGENT:create_team | SIMPLIFY | Survives as one insert into one table; `teamMembersId`/`capacity`/`activeBets`/`formedAt` bookkeeping leaves the signature (defaults live in the schema). |
| 16 | `updateTeam` | UI:PATCH /api/teams/:teamId, UI:POST /api/teams/, AGENT:create_team | SIMPLIFY | Survives; after the fold the two-table branch logic collapses to one UPDATE on `teams`. |
| 17 | `deleteTeam` | UI:POST /api/teams/ (rollback branch only) | DELETE | A rollback helper, not a feature — resolve scaffold specs before inserting and no rollback exists; no delete-team product surface exists anywhere. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `UpsertOrgEdgeInput` | DELETE | Dies with `upsertOrgEdge`. |
| `ReviewRoutingContext` | DELETE | Dies with `resolveReviewRecipients`. |
| `OrgUserDirectory` | SIMPLIFY | `listUsersByKind` member dies with org-routing; shrinks to `getUserById` + `insertUser` (scaffold's only needs). |
| `OrgAgentRunConfigWriter` | MERGE | One-function port always wired alongside `OrgUserDirectory` into the same `deps` object — fold its member into the one surviving port. |
| `ScaffoldResult` | KEEP | Return type of the keeper `persistScaffoldedAgents`. |
| `AgentScaffoldSpec` | KEEP | Input type of the keeper; the Strategy/Kernel split it encodes is real. |
| `ActiveTeamMembersWithTeamName` | DELETE | Org-chart payload shape; dies with feature kill 1. |
| `CreateTeamInput` | SIMPLIFY | Loses `teamMembersId`/`capacity`/`activeBets`/`formedAt` after the table fold; keeps id/name/phase/functions/factoryDbPath/createdAt. |

## Holes this leaves

1. **No review routing.** Every agent review adds all human users as thread participants. Identical to today's fresh-install behavior; a configured install loses its routing choices. Price: on a 5-human team, every human is a participant on every agent review thread. If that ever measurably hurts, a routing feature gets earned back from that evidence.
2. **One migration.** `teamMembers` columns move into `teams`, `users.teamId` re-points from `teamMembers.id` to `teams.id`, `orgEdges` table drops. Blast radius of the fold: ~15 production files call `getTeamMembers`/`listTeamMembers` (routes, policy-engine, notifications drain, bet-state-machine tx, durable-agent-queue, seam ports) — each becomes a `getTeam`/`listTeams` call; the AK4 two-hop resolution and its two seam routes (`/api/org/teams/:teamId/membership`, `/api/org/team-members/:teamMembersId`) delete outright.
3. **`/api/org` router mostly evaporates.** Org-chart GET, edge PUT/DELETE, review-recipients GET die. `SettingsOrgChart.tsx` deletes; `SettingsFilesystems.tsx` and `SettingsAgents.tsx` re-point to `GET /api/teams`. The surviving seam routes (`POST /org/teams`, `POST /scaffolded-agents`, `POST /team-routines`, `GET /org/teams/:teamId`) belong under `/api/teams` in the renamed service.
4. **`POST /api/teams` loses its rollback.** Spec resolution reorders to before the insert — if that reorder is refused, the create wraps in a transaction instead. Either way `deleteTeam` stays dead.
5. **Seam port members shrink.** `CoreApiOrgPort.resolveReviewRecipientsForItem` (framework/api-contract/src/core-api-port.ts:442) and tool-handlers' mirror member die; `create_item`'s handler calls the users seam for humans instead. `getTeamMembersByTeamId`-shaped port members collapse into the `getTeam` members.


---

# policy — destroyer verdict

## Should this service exist?

**KILL THE SERVICE (as a named thing). Route survivors into `work`.**

"Policy" the noun is dead on arrival under ETHOS.md — but the code behind it is not a policy
engine. What actually lives here is three unrelated things wearing one name:

1. **Task handoff** (`buildHandoff`) — an agent handing a task to a human, an agent, or a role.
   This is the flat-team collaboration act itself. Core value. It is work-domain code: every
   write is a task/item/thread mutation.
2. **Lifecycle cascade** (session ended → task review → bet completed → founder ship-confirmation
   thread). This is the time-boxed-bets loop. Core value. Also pure work-domain code.
3. **Trust routing + approval rate** (`item_created` → push/queue/auto_resolve by verdict
   history). Despite the smell of the words "policy engine", this is NOT a preemptive gate:
   nothing is blocked, the item exists either way — it routes *attention* (notify now / hold for
   digest / auto-approve), and the trust signal is earned from real verdict history, which is
   exactly ethos §2's "review fades as trust is earned". The approval rate is also user-visible
   on the Agent Profile page. Core value, wrong service name.

What is NOT core value — and it is the only thing `policy` actually *owns* — is the
**propagation_log durability apparatus**: a table, a write-only audit trail, a 30-second retry
heartbeat, a 3-attempt CAS-guarded exhaustion path with notifications, a retention reaper
predicate, and two domain events. I verified end to end: **zero production reads of the log's
`applied`/`skipped`/`failed` rows exist anywhere** (only the retry drain reads `pending_retry`),
and the `propagation_applied`/`propagation_failed` events have **zero consumers** — the WS hub
dropped them with the comment "zero real frontend consumers (verified)"
(`layers/core-api/src/ws-connection-hub.ts:47`) and the observability dispatcher explicitly
ignores them (`layers/core-api/src/observability/dispatcher.ts:425`). This is reliability
machinery built preemptively for a failure (a local DB write failing transiently, three times)
that nothing in the repo shows has ever happened. Delete it.

After that deletion `policy` owns **no table**. A service that owns nothing and reaches every
byte of data through ~30 mirrored port methods (`PolicyDeps`) exists only because it is a sibling
to `work` — the entire Mechanism-C ceremony is the cost of the service boundary, not of the
features. Fold the three survivors into `work` (which already owns tasks/bets/items, the things
they all mutate), keep one boot registration, and retire the `policy` noun. If the founder keeps
the package for ownership-model reasons, everything below still applies unchanged — the kill is
the propagation apparatus either way.

## If written today, from scratch

Three functions, living in `work`:

- `computeApprovalRate` — the earned-trust signal (profile display + attention routing).
- `handoffTask` (today's `buildHandoff`, uncurried) — CAS claim, ownership transfer or
  review-item creation, handoff message. No audit-trail appends, one item-creation path.
- `registerWorkReactions` (today's `registerPolicy`) — the three event subscribers,
  fire-and-forget, no timer, no log.

No propagation_log. No retry heartbeat. No `reap*`. If a cascade hop ever fails, the task sits
one state behind and a human moves it — `review ↔ in_progress` are legal moves both ways, the
same argument the founder already ruled for the AU26 J2 sibling-guard deletion.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 0 |
| SIMPLIFY | 2 |
| KEEP | 1 |

Surface: 5 methods → 3 methods (40% cut). By mass the cut is larger: `lifecycle-propagation.ts`
loses the entire retry/log half (~350 of 823 lines), the 30-second timer door dies, and the
service's one owned table is dropped.

Types: 7 declarations → DELETE 1, MERGE 1, SIMPLIFY 2, KEEP 3.

## Feature-level kills

**1. Propagation durability + observability — kill the whole capability.**
Dies: `propagation_log` table (schema + zod + migration), `recordPropagationHop`,
`reapTerminalPropagationLog`, internal `retryFailedPropagations`, the 30-second heartbeat in
`registerLifecyclePropagation` (`lifecycle-propagation.ts:806`), the `MAX_RETRY_ATTEMPTS`
exhaustion path with its `propagation_exhausted` notification, every `log()`/`LogSink` sink in
the propagation functions, the `propagation_applied`/`propagation_failed` events in
`framework/domain-model/src/events.ts` plus their dead case arms in
`observability/dispatcher.ts`, the failure-row insert in `policy-engine.ts:39`, and the callers
outside the service: the cascade hop writes in `layers/core-api/work/src/bet-kill-cascade.ts`,
the per-stopped-run hop in
`layers/agent-orchestration/run-orchestration/src/request-run-stop-for-tasks.ts`, the
`deps.policy.recordPropagationHop` port threaded into `POST /api/bets/:id/kill`
(`layers/core-api/src/routes/bets.ts:700`), the `reapTerminalPropagationLog` line in the
retention sweep (`service-bootstrap.ts:520`), and the tests that exist only to exercise this
machinery (`lifecycle-propagation.integration.test.ts` retry suite,
`retention-reaper.integration.test.ts` propagation case, `AF12` hop assertions).
What breaks: a transiently failed cascade hop is silently lost instead of retried; no
notification after three failures. Acceptable: the failure mode is a local Postgres write
erroring, no evidence it has ever fired, and the manual repair is one click on a state the UI
already allows. Several skipped-row writes exist "for observability and test synchronization"
(`lifecycle-propagation.ts:459`) — tests driving production writes; both die together.

**2. tasks.auditTrail appends from this service — kill the writes.**
`buildHandoff` does a read-append-write of `tasks.auditTrail` twice per handoff (state
transition + handoff entry, `handoff-protocol.ts:151,306`) and `transitionTask` appends on every
cascade hop (`lifecycle-propagation.ts:60`). I found **zero production reads** of
`tasks.auditTrail` content anywhere in `layers`/`framework`/`applications` — every hit is a
write. This is the brief's named enterprise reflex: an audit trail nobody reads. Killing the
appends deletes the fragile in-tx re-read at `handoff-protocol.ts:310` (with its §A6 tx-only
@lore) for free. (The column itself is `work`'s to drop — flagged, out of this service's scope.)

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `computeApprovalRate` | UI:GET /api/agents/:id/profile (+ EVENT:item_created via policy-engine) | KEEP | Core value: ethos §2's "review fades as trust is earned" — trust computed from real verdict history, rendered on AgentProfile.tsx and steering attention routing. Door named, user-visible. |
| 2 | `buildHandoff` | UI:POST /api/tasks/:id/handoff + AGENT:handoff_to | SIMPLIFY | The handoff itself is the flat-team core act — but shrink it: (a) drop both `tasks.auditTrail` appends (write-only audit, zero readers — kills the in-tx re-read too); (b) collapse the toRole-miss escalation branch into the toHuman review-item branch — two near-identical thread+item blocks are one idea, and `HandoffResult` loses `escalated`/`escalationItemId`; (c) uncurry the `buildHandoff(deps)` factory (it exists to feed one call site and pushed the function over the lint complexity threshold per its own biome-ignore). |
| 3 | `recordPropagationHop` | SCHED:30s heartbeat (lifecycle-propagation.ts:806) + EVENT:session_ended/task_state_changed/bet_state_changed + UI:POST /api/bets/:id/kill (cascade port) | DELETE | Writes a log with zero production readers; its events have zero consumers (verified at ws-connection-hub.ts:47 + dispatcher.ts:425). Reached from many doors, valuable to none — kill it and every caller (cascade hops, run-stop hops, all LogSink sinks). |
| 4 | `reapTerminalPropagationLog` | SCHED:retention-reaper (service-bootstrap.ts:520 — graph missed it, rg found it) | DELETE | Exists solely to garbage-collect the write-only rows of #3. A reaper for a log nobody reads is bloat squared; note it never reaps `failed` rows, so those accumulate forever anyway. Dies with the table. |
| 5 | `registerPolicy` | BOOTSTRAP (service-bootstrap.ts:476) | SIMPLIFY | The one boot call survives (three event subscribers ARE the bets loop: session→task→bet→ship-confirmation), but it loses the 30-second heartbeat, the retry drain (`retryFailedPropagations` is TEST-ONLY-importable internal → dies), all log sinks, and the exhaustion-notification path. Timer door: gone. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ApprovalRateResult` | KEEP | Return shape of a kept function; flows to the agent-profile route response. |
| `HandoffMetadata` | KEEP | The agent handoff wire format (`handoff_to` tool contract) — real protocol, real consumer. |
| `HandoffParams` | KEEP | Input of the kept handoff; unchanged by the simplification. |
| `HandoffResult` | SIMPLIFY | Escalation branch merges into the review-item branch → drop `"escalated"` from `status` and drop `escalationItemId`. Becomes `{ status: "success"; targetAgentId? }`. |
| `LogPropagationEntry` | DELETE | Input type of `recordPropagationHop`; dies with it. |
| `PolicySessionContext` | MERGE | Three fields with exactly one consumer (`HandoffParams.sessionContext`) — inline into `HandoffParams`, delete the export. |
| `PolicyDeps` | SIMPLIFY | Drop `notifications` (only caller was retry exhaustion — dead), drop the four `?`-optional members plus the `Required<Pick<…>>`/`NonNullable<…>` re-narrowing dance in `HandoffDeps` (make handoff deps plainly required), drop `updateMessage`-adjacent members none of the survivors call after the kills. If the service folds into `work` as recommended, most of the remaining ~25 mirrored methods evaporate because `work` calls itself directly. |

## Holes this leaves

- **A failed cascade hop is lost, not retried.** If the DB errors mid-propagation, the task
  stays `in_progress` after its session ended (or the bet stays `active` after its last task
  closed) with no notification. Repair is manual and legal in the existing UI. No evidence this
  failure has ever occurred; the retry machinery was preemptive.
- **No propagation forensics.** "Why did this bet auto-complete?" can no longer be answered from
  a log row. Nothing and nobody reads that log today, so nothing observable changes.
- **Role-miss handoffs produce a review item instead of an `escalation` item.** The distinct
  `escalation` kind and result status disappear; the human sees a review item saying no agent
  with that role was available. Same human, same thread, one fewer code path.
- **No handoff/transition entries in `tasks.auditTrail`.** Nothing read them; the column keeps
  existing (work-owned) until `work`'s own audit decides its fate.
- **If the fold-into-`work` recommendation lands**, the `@hyperidle/policy` package, its barrel,
  and the Mechanism-C port ceremony go with it; `registerPolicy` becomes a `work` registration.
  Until then the package survives at 3 functions with the "policy" name actively misdescribing
  what it does.


---

# review — destroyer verdict

## Should this service exist?

**KILL THE SERVICE.** `review` is two unrelated features glued together:

1. **The AL7 proposed-call approval loop** (proposed-call-workflow.ts, ~800 lines, 8 of the 11 exported functions, all 3 owned tables). **It has never run in production.** The ignition switch — `sessionWorkflow` on a provisioned session — is never constructed anywhere in production code. Every reference in `layers/`, `framework/`, `applications/`, `tools/` is a type declaration or an optional passthrough (`provisioner.ts:1239/1503`, `runtime.ts:456`, `contracts.ts:214`, `run-orchestration-composition.ts:333`); the only real durable-run construction site (`start-runtime.ts:167`) never passes it. So `tool-registry.ts`'s workflow router (`wf = options.sessionWorkflow`, line 84) never fires, `captureProposedCall` is never called, and `proposedCalls`/`tailoredGrants`/`operationOutcomes` are written by exactly one function (`recordProposedCall`) whose only production caller is that dead branch. Every downstream consumer — the reengagement resolver, the grant/consume state machine, the liveness net, the admission-failure reengagement — operates on rows that cannot exist. Confirmed with `rg -a` across all four roots; the graph's doors for these functions are real routes wired to a dead client.
   It is also DELETE **by policy**, independent of reachability: its own comments say "classify reversibility → route irreversible to review" and "fail-closed treats unknowns as irreversible" (`tool-registry.ts:13,100-101`, `tool.ts:327` falls back to `"irreversible"`). That is precisely the reversible/irreversible gate-by-default classifier ETHOS §2 forbids. Approval machinery that exists "because irreversible" — this is its purest specimen, and it was never even switched on.

2. **Review-item creation** (review-item-factory.ts + session-review-creator.ts subscriber 1, ~200 lines). Live, real doors (`score_attention` agent tool, `POST /api/knowledge/:id/recompute-attention`, routine scheduler, session-end review routing to humans). This is genuine core value — humans reviewing agent work and knowledge is the collaboration surface, non-blocking, post-hoc, not a gate.

After the delete, `review` owns **zero tables** and stops being a SQL-owning Service. The two survivors are pure composition over `work`/`conversation`/`users`/`org` ports — they belong beside the other reaction files in `layers/core-api/src/services/` (pattern: `work-session-end-reactions.ts`). Route survivors there; delete the package.

Practice-meeting check: relocated to `@hyperidle/knowledge`; nothing live remains in `review` (only `@lore` comments referencing the move + one test fixture string). Clean.

## If written today, from scratch

Three functions, no package, no owned tables:

- `createReviewItem(deps)` — the knowledge/attention review-item factory (live, multi-door)
- `attentionReviewReasoningMarker(id)` — its idempotency contract with the attention engine
- one `session_ended` subscriber creating a review item for medium/high-risk task sessions and routing it to humans (AD1)

Nothing else. The approval state machine, if a real learning ever earns it, gets rebuilt small at that time — not preserved dormant.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 8 |
| MERGE | 0 |
| SIMPLIFY | 1 |
| KEEP | 2 |

Surface: 11 methods → 3 methods (73% cut). Plus: 1 class DELETE; 9 type declarations → 6 DELETE, 1 SIMPLIFY, 2 KEEP. Net effect: the package itself dies; survivors relocate.

## Feature-level kills

**The AL7 proposed-call approval loop — whole-feature DELETE.** Kills, beyond this package:

- **Tables**: `proposedCalls`, `tailoredGrants`, `operationOutcomes` (`framework/db/src/schema.ts`) — only this package touches them.
- **Routes**: `POST /api/reviews/proposed-calls`, `POST /api/reviews/proposed-calls/consume`, `POST /api/reviews/proposed-calls/:id/outcome` (`layers/core-api/src/routes/reviews.ts:187-209`); the proposed-call nesting inside `GET /api/reviews/:reviewMessageId` (lines 101-166 — `pcView` is always undefined in production today, so deleting it changes zero observed behavior); the proposed-call branch of the verdict handler (`layers/core-api/src/routes/threads.ts:1619+` from `findProposedCall` onward — verdict survives as a plain thread-resolution act). Also the `"rev-1"` demo fixture (`FIXTURE_REVIEW`, reviews.ts:36-81) — a design stub living inside a production route; dies too.
- **Dispatch**: both workflow-router branches in `tool-registry.ts` (lines 100-119, 131-193); `ProposedCallWorkflowPort`, `classifyReversibility`, the `reversibility` field and the allow/routeToReview partition fn (`framework/tool-protocol/src/tool.ts:304-405`); `SessionWorkflow` (`framework/harness-protocol/src/harness/harness-adapter.ts`) and every `sessionWorkflow` passthrough (provisioner, runtime, contracts, harness-port).
- **Seam**: the three `review.*` ops on `CoreApiPort` (`framework/api-contract/src/core-api-port.ts:726-730`) + their wiring (`core-api-port-composition.ts:798-822`, `run-orchestration-composition.ts:231-233`).
- **Events/model**: `ProposedCallGrantedEvent`, `proposed_call_executed`, `framework/domain-model/src/proposed-call.ts` (`REVERSIBILITY` etc.), `AL7-proposed-call-types.test.ts`.
- **Intents**: the `"reengagement"` case in `agent-run-admission-reactions.ts:113` and the `reengagement` member of the shared intent union — no producer remains.
- **UI**: `ReviewOutcomeSummary.tsx`'s `"irreversible"` kind and any proposedCall rendering on `ReviewPage`.
- **Tests that die with it**: `reengagement-resolver.integration.test.ts`, `agent-work-intent-recorder-shared-type.test.ts`, `AL7-two-session-loop.integration.test.ts`, `session-review-creator.reengagement-liveness-baked-emit.integration.test.ts`, the AL7 slices of the admission-failure and boundary tests. Test-only reachable code confirms, not excuses, the verdict.

Why acceptable: nothing observable changes — the loop never fires today. The delete makes the shipped truth honest.

**The `review` package itself — DELETE after relocation.** Survivors move to `layers/core-api/src/services/` as a plain reaction module; the package, barrel, Mechanism-C ceremony, and Table-ACL claim over three empty tables all evaporate.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `findProposedCall` | UI:GET /api/reviews/:reviewMessageId (+3 more routes, 2 events) | DELETE | Reads tables with no reachable production writer; every door serves rows that cannot exist. |
| 2 | `resolveReengagementRequest` | INTERNAL (transitionProposedCall, applyLivenessRetry) | DELETE | Bakes reengagement runs for grants that are never minted; dies with the loop. |
| 3 | `recordProposedCall` | UI:POST /api/reviews/proposed-calls | DELETE | Sole writer of `proposedCalls`; its only client is the never-activated workflow router; hardcodes `reversibility:"irreversible"` — the gate-by-default classifier ETHOS forbids. |
| 4 | `transitionProposedCall` (consumed overload) | UI:POST /api/reviews/proposed-calls/consume | DELETE | CAS-consumes grants that never exist; dead route, dead seam client. |
| 5 | `transitionProposedCall` (non-consumed overload) | UI:POST /api/threads/:threadId/messages/:messageId/verdict, POST …/:id/outcome | DELETE | held/granted/outcome transitions on unreachable rows; verdict handler's PC branch dies with it. |
| 6 | `transitionProposedCall` (implementation) | same as 4-5 | DELETE | The state machine has no state to run on. |
| 7 | `handleUnconsumedGrantOnSessionEnd` | EVENT:session_ended (livenessHandler) | DELETE | Scans an always-empty `tailoredGrants` on every session end; liveness net for a feature that never lived. |
| 8 | `reengageOnAdmissionFailure` | EVENT:agent_run_admission_failed | DELETE | Reengagement intents are only recorded by rows 5-7 — deleted; case handler in admission-reactions dies too. |
| 9 | `attentionReviewReasoningMarker` | UI:POST /api/knowledge/:id/recompute-attention, AGENT:score_attention | KEEP | Live idempotency contract for attention-engine knowledge reviews — shared-knowledge core value; relocates with the factory. |
| 10 | `createReviewItem` | AGENT:score_attention, UI:recompute-attention, SCHED:routine-scheduler, +11 doors | KEEP | The one load-bearing thing here: creates the review items humans actually see, across knowledge/routine/bet surfaces; relocates out of the dying package. |
| 11 | `registerReviewSubscriptions` | BOOTSTRAP (service-bootstrap.ts:433) | SIMPLIFY | Delete subscriber 2 (liveness net) and all seven reengagement port wirings; survives as the AD1 session-review creator only, moved to core-api services. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ReviewAgentWorkIntentInput` | DELETE | Exists only to type reengagement intents; no producer remains. |
| `ReviewPorts` | SIMPLIFY | Keep `work`/`conversation`/`users`/`org` (the AD1 creator's real deps); DELETE `intentRecorder`, `requireRunnableAgent`, `getBetById`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread` — all seven exist solely for the reengagement bake. After the move it's a local deps type, not an exported port bag. |
| `ProposedCallQuery` | DELETE | Input type of deleted `findProposedCall`. |
| `ProposedCallView` | DELETE | Return type of deleted `findProposedCall`. |
| `ReengagementResolverDeps` | DELETE | Deps bag mirroring the deleted resolver — the exact `*Deps`-mirroring-one-function shape the brief names. |
| `BakedReengagementRequest` | DELETE | Return type of deleted resolver. |
| `ProposedCallTransition` | DELETE | The discriminated union IS the dead state machine. |
| `CreateReviewItemInput` | KEEP | Contract of the live factory (fixed by `KnowledgeReviewWriter`'s 3-arg port shape). |
| `CreateReviewItemResult` | KEEP | Two-field return of the live factory. |
| `ReengagementSourceUnavailableError` (class) | DELETE | Thrown only by the deleted resolver, caught-and-swallowed by deleted callers. |

## Holes this leaves

1. **No human-approval gate on agent tool calls, anywhere.** This hole already exists at runtime — the loop was never switched on — so the delete changes shipped behavior by exactly nothing; it changes the codebase's honesty by a lot. If a real learning ever earns a review gate on a specific tool, rebuild it small at that moment. Founder should know this kills the whole AL7 two-session grant/consume design, including three migration-managed tables. One tension to price consciously: a prior trust-model ruling ("AL7 gates unconditionally") suggests this loop was once chosen — but what shipped never turns it on, and the standing policy ruling for this pass is that irreversible-classifier approval machinery is DELETE.
2. **Verdict "approve" on a review message becomes purely a thread-resolution act** — no grant is minted. Identical to today's observable behavior.
3. **`review` stops existing as a Service** — the Table ACL entry for its three tables, the Mechanism-C port ceremony, and the package boundary all go; two small functions live on as ordinary core-api composition code.


---

# routine — destroyer verdict

## Should this service exist?

**KEEP AS: routine definition store + the generic scheduler.** Routines are one of the five process primitives, with real doors on all three fronts: UI (`/api/routines/*` CRUD + trigger, WorkRoutine page, RoutineDetailPane, team routine cards), agent tools (`create_routine`, `update_routine`), and the scheduler timer (`TICK every config.pollIntervalMs`, wired at `layers/core-api/src/service-bootstrap.ts:586`). "Recurring work fires an agent session on a clock or an event" is core HyperIdle.

**But half the package is a parallel second product that must die: the builtin-routine subsystem.** `fireBuiltinRoutine` is a second execution path that bypasses the entire agent-run architecture — no session, no intent queue, no skill. The four builtins run hardcoded TypeScript templates. The founder has already flagged this ("post-bet-retro bypasses the intent queue"). Three structural facts convict it:

1. **The per-team seeding is broken by construction.** `runKnowledgePromotion`, `runKnowledgeDecay`, and `runPortfolioRetro` take no teamId — the sweeps are global (`ports.ts:52-86`, wired to global `sweep(db, eventBus, ...)` in `routine-scheduler-bindings.ts`). Yet `provisionTeamRoutines` seeds each per team (`builtin:knowledge-decay:<teamId>`), so N teams fire the same global sweep N times daily and portfolio-retro writes N duplicate monthly items, all hosted at `factory/portfolio`.
2. **The "retros" are form letters, not retros.** `runPostBetRetro` writes `Hypothesis: X / Reality: completed at <date>` — field interpolation, no agent, no analysis. Each builtin spec carries a `skillId` (`bet_retro`, `portfolio_retro`, …) that nothing ever executes. The generic path (`triggerType:"event"` + skill + agent run) is the first way to do exactly this; the builtin path is the second way.
3. **The maintenance sweeps don't need routine rows.** Knowledge decay/promotion are clocks calling knowledge-service functions. They need a `setInterval` at the composition root, not per-team DB rows, id-string parsing (`builtin:kind:teamId`), a switch dispatch, and run records.

Survivors of the kill route nowhere — the generic machinery in this same package already covers the product need.

## If written today, from scratch

Ten exports:

- `insertRoutine`, `updateRoutine`, `getRoutine`, `listRoutines` — definition CRUD (UI + agent tools)
- `insertRoutineRun`, `updateRoutineRun`, `getRoutineRun`, `listRoutineRuns` — run records (coalescing guard, session-end closure, run history in the UI)
- `fireGenericRoutine` — the one firing path: resolve + bake + enqueue intent (resolver folded in)
- `startRoutineScheduler` — the tick loop + event-trigger registration
- plus `humanizeSchedule` as presentation sugar with a real UI door

Nothing named `builtin:*` exists.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 5 |
| MERGE | 1 |
| SIMPLIFY | 5 |
| KEEP | 6 |

Surface: 17 methods → 11 exported methods (35% of methods gone outright, 5 of the rest shrunk). Of ~860 lines in `routine-scheduler.ts`, roughly 470 (the builtin subsystem: lines 72–536 minus the generic pieces) are deleted.

## Feature-level kills

1. **Builtin routines — the whole subsystem.** Dies: `BUILTIN_ROUTINE_IDS`, `BUILTIN_SPECS`, `isBuiltinRoutineId`, `extractBuiltinKind`, `provisionTeamRoutines`, `fireBuiltinRoutine`, `registerBuiltinRoutineHandlers`, `runPostBetRetro`/`runPortfolioRetro`/`runKnowledgeDecay`/`runKnowledgePromotion`, the builtin branch of the scheduler tick, and the ports blocks that exist only for them (`work`, `conversation`, `knowledge`). Callers to kill with it: the builtin branch of `POST /api/routines/:id/trigger` (`routines-routes.ts:353`), `POST /api/org/team-routines` (`org.ts:331`), the `provisionTeamRoutines` call in `POST /api/teams` (`teams-routes.ts:216`), the seeding step in the `create_team` tool, `registerBuiltinRoutineReactions` + the builtin dispatch in `fireRoutine` (`routine-scheduler-bindings.ts`), and `tools/eval/src/scenarios/builtin-routines.ts`. What breaks and why it's acceptable — see Holes.
2. **Portfolio retro — dead forever.** A monthly review item that dumps a list of recent L3/L4 knowledge-item titles. A report nobody asked for, duplicated per team. No replacement.
3. **The reaper piggyback in the scheduler tick.** `config.reap`/`reaperCadenceMs`/`ROUTINE_REAPER_CADENCE_MS` — **never wired in production** (`service-bootstrap.ts:586` passes `reaperCadenceMs` but no `reap`; no production caller anywhere passes `reap:`). Dead branch shipped as config surface. Delete both fields; bootstrap stops threading `reaperCadenceMs`.
4. **Routine soft-delete.** `deletedAt` + `includeDeleted` + `DELETE /api/routines/:id` is a second off-switch next to retire (`active:false`), which the scheduler, manual trigger, and resolver all already honor. One off-switch. Hard-delete or drop the route; `includeDeleted`'s only production caller (`settings/src/plugin-configuration.ts:711` backfilling config defaults *for deleted routines*) then just reads all rows.
5. **Skipped-run audit rows on manual trigger.** `recordSkippedRun` writes a `skipped` run row whose only purpose is recording that nothing happened; the HTTP response already tells the caller `"coalesced"`. Audit trail nobody reads.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `isBuiltinRoutineId` | UI:POST /api/routines/:id/trigger, SCHED:TICK pollIntervalMs | DELETE | Exists only to recognize builtin id strings; dies with the builtin subsystem, kill both callers' builtin branches. |
| 2 | `extractBuiltinKind` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | DELETE | Id-string parsing (`builtin:kind:teamId`) for the subsystem being deleted. |
| 3 | `provisionTeamRoutines` | UI:POST /api/teams/, UI:POST /api/org/team-routines, AGENT:create_team | DELETE | Seeds per-team rows for global sweeps — N teams fire the same global sweep N times. Nothing to seed once builtins die; kill all three doors' seeding steps. |
| 4 | `fireBuiltinRoutine` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | DELETE | Second execution path bypassing the agent-run architecture; runs hardcoded templates, never the `skillId` its own specs declare. The generic path is the first way. |
| 5 | `registerBuiltinRoutineHandlers` | BOOTSTRAP (`routine-scheduler-bindings.ts:156` → `service-bootstrap.ts`) | DELETE | Subscribes bet_state_changed to write a form letter (`Hypothesis: X / Reality: <date>`) with no agent involved. Dies with the subsystem; hole named below. |
| 6 | `fireGenericRoutine` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:<db-configured eventType> via registerEventTriggers | SIMPLIFY | The core firing path — keep. Drop `recordSkippedRun` (audit row duplicating the HTTP response) and absorb the resolver (row 16); return type shrinks to `{fired, reason?, runId?}`. |
| 7 | `startRoutineScheduler` | BOOTSTRAP (`service-bootstrap.ts:586`) — IS the SCHED:TICK door | SIMPLIFY | The timer door — keep. Delete the builtin branch of the tick and the never-production-wired `reap`/`reaperCadenceMs` machinery. |
| 8 | `insertRoutine` | UI:POST /api/routines/, AGENT:create_routine, UI:POST /api/teams/ | SIMPLIFY | Keep the write. Drop `opts.onConflictDoNothing` — its only caller is `provisionTeamRoutines` (row 3, deleted). |
| 9 | `updateRoutine` | UI:PATCH /api/routines/:id, UI:POST /api/routines/:id/retire, AGENT:update_routine, SCHED:TICK, EVENT:session_ended | KEEP | Core value: retire toggle + the scheduler's `nextRunAt`/`lastRunAt` advance. Doors: PATCH route, update_routine tool, tick. |
| 10 | `getRoutine` | UI:GET /api/routines/:id (+5 more routes), AGENT:update_routine, SCHED:TICK | KEEP | Core value: every route and the scheduler load the definition through it. Door: GET /api/routines/:id. |
| 11 | `listRoutines` | UI:GET /api/routines/, UI:GET /api/teams/:teamId, SCHED:TICK, BOOTSTRAP (settings backfill via boot.ts) | SIMPLIFY | Keep the list. Drop `includeDeleted` with the soft-delete kill (sole production caller backfills config defaults for deleted routines — pointless work); other filters are all live. |
| 12 | `insertRoutineRun` | UI:POST /api/routines/:id/trigger, SCHED:TICK | KEEP | Core value: the run row is load-bearing — the coalescing guard and the resolver validate against it. Door: SCHED:TICK. |
| 13 | `updateRoutineRun` | SCHED:TICK, EVENT:session_ended, EVENT:agent_run_lifecycle_changed, EVENT:agent_run_admission_failed | KEEP | Core value: closes runs on session end / admission failure; `onlyIfRunning` race guard has three live production callers. Door: SCHED:TICK via the reactions. |
| 14 | `getRoutineRun` | SCHED:TICK (via resolver), EVENT:session_ended | KEEP | Core value: resolver validation + session-end closure both read the run row. Door: SCHED:TICK. |
| 15 | `listRoutineRuns` | UI:GET /api/routines/:id, UI:GET /api/teams/:teamId, SCHED:TICK | SIMPLIFY | Keep — run history in the UI and the coalescing guard. Drop `order`: no production caller ever passes `"asc"`; hardcode desc. |
| 16 | `resolveRoutineRunRequest` | INTERNAL (sole caller: `fireGenericRoutine`) | MERGE | One caller, one transaction, plus a `RoutineRunResolverDeps` interface mirroring fields `RoutineSchedulerPorts` already carries. Fold into `fireGenericRoutine`, unexport. |
| 17 | `humanizeSchedule` | UI:GET /api/routines/:id, UI:GET /api/teams/:teamId | KEEP | Core value: readable schedules ("Every Monday at 10:00 AM") on the routine cards and detail pane — the primitive's main surface, real UI door, pure, zero deps. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `RoutineRunSourceUnavailableError` (class) | SIMPLIFY | Unexport. After row 16's merge its only job — distinguishing expected rejection from infra failure — lives inside one file. |
| `RoutineSchedulerPorts` | SIMPLIFY | Drop `work`/`conversation`/`knowledge` blocks — every member serves only deleted builtin bodies. Survives as `{settings, workIntents, requireRunnableAgent, getTeamById, assembleSessionKnowledge}`, absorbing `RoutineRunResolverDeps`. |
| `BuiltinRoutineId` | DELETE | Dies with the builtin subsystem. |
| `RunBuiltinResult` | DELETE | Return type of a deleted function. |
| `PostBetRetroArgs` | DELETE | One-field args type for a deleted function. |
| `FireResult` | SIMPLIFY | `sessionId`/`emitted`/`extra` are never set by `fireGenericRoutine` — they exist for the builtin merge in the bindings. Shrink to `{fired, reason?, runId?}`; the bindings' duplicate `FireRoutineResult` copy dies too. |
| `RoutineSchedulerConfig` | SIMPLIFY | Drop `reap` + `reaperCadenceMs` (never production-wired). Survives as `{pollIntervalMs, canProvision?}`. |
| `RoutineScheduler` | KEEP | The stop handle the bootstrap disposer holds. Named door: BOOTSTRAP (`service-bootstrap.ts` disposer). |
| `Routine` | KEEP | The row type; used by routes, reactions, bindings, tools. |
| `RoutineRun` | KEEP | The row type for run records. |
| `RoutinePatch` | SIMPLIFY | Drop the `\| SQL` widening — its own @lore admits it is "not tied to any specific caller need anymore". `Partial<NewRoutine>`. |
| `RoutineRunPatch` | SIMPLIFY | Same: drop `\| SQL`, no production caller passes a fragment. |
| `BakedRoutineRunRequest` | KEEP | The emit-time contract the work-intent seam and agent-orchestration drain consume. Named door: SCHED:TICK → `enqueueWorkIntent`. |
| `RoutineRunResolverDeps` | MERGE | Dies as a declaration when row 16 merges — its four fields are already on `RoutineSchedulerPorts`. |

## Holes this leaves

1. **No automatic post-bet retro.** Completing a bet no longer produces the hypothesis-vs-reality item. What's lost is a form letter, not analysis. The honest replacement is a generic event routine (`triggerType:"event"`, `eventType:"bet_state_changed"`, `skillId:"bet_retro"`) firing a real agent run — but two capability gaps stand in the way today: `registerEventTriggers` ignores the event payload (the agent would not know which bet), and there is no `toState==="completed"` filter (it would fire on every state change). Ship broken-and-simple now; the founder already has "post-bet-retro bypasses the intent queue" parked as its own story — that story becomes "rebuild it as a generic event routine with event payload".
2. **No knowledge decay/promotion until re-wired.** Two `setInterval`s at the composition root calling `sweep(db, eventBus, "stale")` / `sweep(db, eventBus, "autoPromotion")` + `recomputeAttentionForCandidates` — about ten lines in `service-bootstrap.ts`, and the sweeps run once per day instead of once per team per day. Until written, stale knowledge doesn't decay and provisional items don't auto-promote.
3. **Portfolio retro is gone with no replacement.** Deliberate.
4. **New teams get an empty routine list.** No seeded rows. That is the correct default — routines are something the user or their agents create, not ceremony pre-installed four-deep per team.
5. **Manually triggering a coalesced routine leaves no `skipped` row.** The HTTP response still says `"coalesced"`; the history just doesn't record non-events.
6. **Deleted-routine history semantics change.** With hard delete, a routine's run rows go with it (FK) — acceptable; retire (`active:false`) remains the way to stop a routine while keeping its history.


---

# run-orchestration — destroyer verdict

## Should this service exist?

**KEEP — this is the engine room.** This package spawns, provisions, executes, and finalizes agent runs, and it owns the `sessions` table. Agents as first-class participants is what HyperIdle *is*; delete this and the product is a chat app with no agents. It has also already been destroyed twice (AU20 first pass absorbed three services, AU21 stripped it to a blind executor), so the survivors are mostly spine.

That does not make it clean. It still carries: a **dead feature** (effectiveness scoring — no production writer anywhere, only a demo-data seeder), a **second way to start a session** (legacy bare runs, kept "for tests and deployments that haven't wired the harness"), a **test-only run mode** (`assemble`), a **test-only execution seam** baked into a production type, a **test-only subpath export** (`scaffolding.ts`), **DI self-injection theater** (the composition injects this package's own `startWatcher` back into this package through a ports bag), two **dead interface members**, and a type mirror (`RuntimePorts.sessionRequests`) whose multiplexed signatures force `as` casts at every call site.

## If written today, from scratch

- `startRuntime` — boot: drain loop, worker ingress, writeback subscriber, reapers, recovery
- `runSession` — durable mode (+ one-shot for the eval bench)
- `transitionRun` — terminal transitions where a runtime is live
- `createProvisioner` (internal) — admit + run one session in a sandbox: the product core
- internal plumbing it composes: `createContextAssembler`, `createWorkerIngress`, `createWritebackProcessor`, `createRuntimeReapers`, `startWatcher`, `mountFilesystemsForAgent`, `buildProvisioningPlan`, `applyProvisioningPlan`
- `sessions` accessors behind real screens: `findSessionById`, `listSessions`, `countActiveRunsByAgent`, `listLatestOutcomeByTask`, `listRunSummaries`, one CAS terminal writer, `writeSessionNotes`
- core's two downward commands: `endRunForHandoff`, `requestRunStopForTasks`

Everything outside that shape is cut below.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 12 |
| KEEP | 8 |

Surface: 23 methods → 21 methods (9% of method count — but the real cut is 3 whole features, 2 run-mode/seam surfaces, 2 dead members, and 5 of 21 type declarations; see feature kills).

Types/ports: 21 declarations → 5 DELETE, 8 SIMPLIFY, 8 KEEP.

## Feature-level kills

1. **Effectiveness scoring (AC1) — dead feature.** `sessions.effectivenessScore/RecordedAt/RecordedBy` has **no production writer**. The only writers are the PATCH route's effectiveness branch (no UI, no agent tool, no subscriber calls it — confirmed across layers/framework/applications) and `tools/setup/src/demo-world/activity.ts`, which seeds fake scores so the badge renders in demos. The UI badge (`layers/core-ui/src/pages/WorkTask.tsx:88`) is permanently empty in real use. Kill: the effectiveness-only PATCH branch in `layers/agent-orchestration/src/routes/sessions.ts`, `recordSessionMetadata`, the effectiveness fields of `endSessionByCas`/`EndSessionByCasInput`/`RunSummary`, the three DB columns, the api-contract fields, the UI badge, the demo seeding. Breaks: nothing — nobody feeds it. A metric nobody writes is enterprise theater.
2. **Bare runs — a second way to start a session.** `createBareRun` fires only when the deployment wired no execution adapters; the route comment says it exists "for tests and deployments that haven't wired the harness" (`layers/core-api/src/routes/sessions-routes.ts:120`). Every real deployment wires builtin at minimum. Kill: `createBareRun`, `CreateBareRunInput`, seam route `POST /api/agent-orchestration/runs/bare`, port method `runs.createBareRun`, the legacy branch of `POST /api/sessions`. Breaks: a harness-less deployment cannot create a session row — acceptable, it could never run one.
3. **`assemble` run mode — test-only.** `runSession({mode:"assemble"})` has zero production callers; only core-api parity tests and this package's own tests use it, and `runtime.ts:479` even probes an untyped `deps.assemble` hook that exists in no declared type. Kill the mode, both union arms in `RunOptions`/`RunResult`, and the hook. Tests re-target `createContextAssembler` directly or die.
4. **`RuntimePorts.sessionProvisioner` — a test seam in a production type.** Its own doc says "Test-only execution seam; production runSession binds the internal provisioner" (`contracts.ts:188`). Tests must not drive production surface. Kill the member; tests stub at the adapter-pool level.
5. **`scaffolding.ts` subpath — test-only export file.** `@hyperidle/run-orchestration/scaffolding` is imported by exactly two test files. Kill the file.
6. **startWatcher DI self-injection loop.** `run-orchestration-composition.ts:76` injects this package's own exported `startWatcher` back into this package's context assembler via `composition.context.filesystems.startWatcher`. `context.ts` imports it directly instead; kill the barrel export, the `FilesystemsReader`/`ContextAssemblyPorts` mirror, `RuntimeDeps.composition.context`, and the `FileWatcher`/`FileWatcherConfig` exports.
7. **Dead members:** `RuntimeReapers.reapSandboxes` (zero callers anywhere, prod or test) and `WritebackProcessor.process` (zero production callers; the factory collapses to the subscriber function).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `buildProvisioningPlan` | INTERNAL (provisioner.ts:1425) | SIMPLIFY | Core value — agents hold their own credentials (Ethos 2) — but the barrel export serves only core-api tests; unexport, keep internal. |
| 2 | `applyProvisioningPlan` | INTERNAL (provisioner.ts:1429) | SIMPLIFY | Same: real work, test-only export. Unexport from barrel. |
| 3 | `createContextAssembler` | INTERNAL (runtime.ts, start-runtime.ts) | SIMPLIFY | Keep the assembler; kill the self-injection ports param (import `startWatcher` directly) and the test-only `scaffolding.ts` subpath. |
| 4 | `createBareRun` | UI:POST /api/sessions (legacy branch) + seam POST /runs/bare | DELETE | Second way to start a session, kept for tests/back-compat; kill callers, seam route, and port method with it. |
| 5 | `endRunForHandoff` | UI:POST /api/tasks/:id/handoff, AGENT:handoff_to | KEEP | Handoff between agents/humans is core collaboration; the three documented no-CAS/no-emit/no-outcome differences are load-bearing. |
| 6 | `startWatcher` | INTERNAL (context.ts, via DI loop) | SIMPLIFY | Sandbox change detection feeds shared-knowledge writeback — core. But de-loop the DI theater: direct import, kill barrel export. |
| 7 | `mountFilesystemsForAgent` | INTERNAL (provisioner Phase 4.5) | SIMPLIFY | Mounting injected filesystems is core agent capability; barrel export serves only a core-api test — unexport. |
| 8 | `createProvisioner` | INTERNAL (start-runtime, runtime) | KEEP | The spine: admit + run a session. 1,871 lines is heavy but it IS the product; every agent run goes through it. |
| 9 | `requestRunStopForTasks` | UI:POST /api/bets/:id/kill + seam /runs/stop-for-tasks | SIMPLIFY | Killing a bet must stop its runs — core. But `STOP_DISPOSITIONS` is a one-key map behind a `reason` param with one legal value; drop the param and map. |
| 10 | `createRuntimeReapers` | INTERNAL (start-runtime.ts:421) | SIMPLIFY | Routine reap + sandbox sweep are live; `reapSandboxes` member has zero callers anywhere — delete it. |
| 11 | `runSession` | INTERNAL (start-runtime drain, durable) + eval bench (one-shot) | SIMPLIFY | Durable is production; one-shot is the eval bench's door (Track AS, founder-valued). `assemble` mode + the untyped `deps.assemble` hook are test-only — delete. |
| 12 | `findSessionById` | UI:GET /api/sessions/:id/activity, /starts/:startId, seam sessions/:sessionId | KEEP | Sessions is a core primitive; this is its read. Multiple real screens (activity feed, start-projection polling, handoff resolution). |
| 13 | `listSessions` | UI:GET /api/sessions/ | SIMPLIFY | Conversations page queries task_id+state=active only; the agentId filter and limit/offset paging have no caller — drop them. |
| 14 | `countActiveRunsByAgent` | UI:GET /api/agent-orchestration/runs/active-counts | KEEP | Live agent state on the roster/recipients screens — core visibility into what agents are doing. |
| 15 | `listLatestOutcomeByTask` | UI:GET /api/agent-orchestration/runs/latest-outcomes | KEEP | Task-list run state — how humans see agent work land. |
| 16 | `listRunSummaries` | UI:GET /api/agent-orchestration/runs | SIMPLIFY | Run history per task/agent is core; drop the `effectivenessScore` column with the dead feature. |
| 17 | `endSessionByCas` | UI:PATCH /api/sessions/:id | MERGE | Fold with `transition-run.ts`'s private `updateSessionRow` — two CAS terminal writers in one package is one idea twice. Preserve the emit-gating invariants; drop effectiveness fields. Door stays: the only unstick for a hard-crash-orphaned run. |
| 18 | `recordSessionMetadata` | UI:PATCH /api/sessions/:id (effectiveness-only branch) | DELETE | Its only door branch serves effectiveness scoring, which has no production writer; dies with the feature, branch and all. |
| 19 | `writeSessionNotes` | AGENT:write_session_notes | KEEP | An agent recording what it did is shared-knowledge core; real tool door. |
| 20 | `startRuntime` | BOOTSTRAP (agent-orchestration boot.ts, remote-server create-server) | KEEP | The composition root of the whole engine: drain, ingress, writeback, reapers, recovery, disposal. |
| 21 | `transitionRun` | UI:PATCH /api/sessions/:id + INTERNAL (run-transition service, start-runtime) | SIMPLIFY | Core transition engine, but the 4-armed spec union returns `Promise<unknown>` and callers cast; split into honestly-typed operations. Delete the two dead `void ports;` statements (lines 44, 66). |
| 22 | `createWorkerIngress` | INTERNAL → worker WebSocket door via `RuntimeHandle.registerWorkerWebSocket` (boot.ts:400) | KEEP | Remote workers are the shared-backend deployment story; Zod-validated worker protocol is the agent-execution door. |
| 23 | `createWritebackProcessor` | INTERNAL (start-runtime.ts:419, event: sandbox_writeback_changes_detected) | SIMPLIFY | Writeback into shared knowledge is core. But the `process` member has zero production callers — collapse the factory to the subscribe function. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `HeldConnectionForProvisioning` | KEEP | Port member shape for the live spawn-time connection read; Mechanism C (machine-enforced boundary) forces the structural twin. |
| `HeldConnectionsReaderPort` | KEEP | Wired live in boot.ts; agents holding their own credentials is Ethos 2. |
| `ServiceConnectionResolverPort` | KEEP | The ONLY plaintext token path (AN1 hard rule 1); Application-composed by design. |
| `ProvisioningPlan` | SIMPLIFY | Its own @lore says "removed from barrel — no cross-package consumer" yet index.ts:26 still exports it. Remove from barrel; keep file-local for tests. |
| `RuntimePorts` | SIMPLIFY | The session-requests mirror multiplexes 6 `findSessionRequest` overloads and a 5-armed `transitionSessionRequest` returning an 8-way union — every caller casts (`as Promise<...>`). Split into named members with honest types. DELETE the `sessionProvisioner` member (self-documented test-only seam). |
| `RunResult` | SIMPLIFY | Drop the `assembled` arm with the assemble-mode kill; the `Awaited<ReturnType<ReturnType<typeof import(...)>>>` gymnastics goes with it. |
| `RunOptions` | SIMPLIFY | Drop the `assemble` arm. Durable + one-shot remain. |
| `RunTransitionSpec` | SIMPLIFY | Survives only as transitionRun's parameter; shrinks when transitionRun's union is split. |
| `RunTransitionResult` | DELETE | Alias of `Awaited<ReturnType<transitionRun>>` = `unknown`. A named type for `unknown` with zero production consumers. |
| `RuntimeDeps` | SIMPLIFY | The DI root, keep — but `composition.context` dies with the startWatcher de-loop, and several `Parameters<typeof import(...)>` chains flatten with the other kills. |
| `RuntimeHandle` | KEEP | startRuntime's owned-resource contract; boot uses both members (registerWorkerWebSocket, dispose). |
| `AgentTerminationReason` | DELETE | Zero external consumers, and transition-run.ts:30 declares its own private duplicate — the export is a stale mirror. |
| `CreateBareRunInput` | DELETE | Dies with createBareRun. |
| `FileWatcherConfig` | DELETE | No external consumer (composition imports only the function); becomes file-internal after the de-loop. |
| `FileWatcher` | DELETE | Same — the one-member (`stop`) handle type stays file-internal. |
| `FilesystemForProvisioning` | KEEP | Port member shape for the live filesystem read; Mechanism-C twin of `@hyperidle/filesystems`' own type. |
| `InjectedFilesystemsReaderPort` | KEEP | Wired live in boot.ts; injected filesystems into the sandbox is core agent capability. |
| `SessionLifecycleAgentRunConfigReader` | KEEP | Live per-agent config read at spawn (system prompt, harness, model); wired at composition.ts:388. Mechanism-C cost, one honest member. |
| `StoppedRun` | KEEP | The seam wire type for bet-kill; core writes one propagation-log hop per stopped run — a count could not serve that. |
| `RunSummary` | SIMPLIFY | The 8-column projection is right; drop `effectivenessScore` with the feature. |
| `EndSessionByCasInput` | SIMPLIFY | Drop `effectivenessScore`/`actor` with the feature; the rest is the CAS input. |

## Holes this leaves

- **A harness-less deployment cannot create sessions** (bare runs gone). Acceptable: it could never run them, and the explicit-start path is the one real door.
- **Effectiveness history is gone.** Nothing real ever wrote it; demo worlds lose a fake badge.
- **Two core-api parity tests lose their door** (`context-bundle-sandbox-byte-parity`, `session-knowledge-assembler-ranking-parity` ride assemble mode). Rewrite against the durable path or delete with the mode.
- **The endSessionByCas/updateSessionRow merge is delicate.** The no-emit rules for handoff (spurious review items) and the persisted-vs-emitted outcome split are asserted invariants; the merged CAS helper must keep both, or reviews fire on every handoff.
- **PATCH /api/sessions/:id remains an API-only door** — no UI button ends a stuck run, and the reaper covers routine sessions only, so a hard-crash-orphaned task run is curl-or-nothing. That hole predates this pass; named here so the founder can price a UI affordance or a broader reaper.
- Known-weak negatives were re-checked with `rg -a` across layers/framework/applications/tools before every DELETE/TEST-ONLY call; the graph's zero-door results for the bootstrap spine (startRuntime etc.) were confirmed as BOOTSTRAP wiring, not death.


---

# session-requests — destroyer verdict

## Should this service exist?

**KEEP AS the durable agent-work queue — but ~40% of the file is scar tissue from the two absorptions, and it dies.**

This service is the spine of "AI agents as first-class participants": every door that makes an agent do something (a thread message, a task dispatch, a routine tick, a knowledge flag, an explicit start) funnels into `enqueueWorkIntent`, and the runtime drains intents → session requests → running sessions. That is core value, verified end-to-end: 21 doors reach `enqueueWorkIntent` (UI routes, agent tools, the routine scheduler).

What does NOT deserve to exist inside it:

1. **The entire lifecycle-projection subsystem** (`agent_lifecycle_inbox` table + claim/lease/poison drain + 1s background poller + DI port). Six projectors are registered; **five are literal no-ops** (`observeOnly`). The sixth (`explicit_session_start`) is implemented — via `queueDeps` in `layers/agent-orchestration/src/services/durable-agent-queue.ts:121` — by **calling back into this same package's `transitionSessionRequest`**. A durable outbox whose only consumer is a same-package, same-DB, same-transaction UPDATE. Every terminal session pays 3 extra writes and a forever-poller for one conditional UPDATE that belongs inline in `finishRequestInTxInternal`.
2. **The trigger-resolution scar**: `admitClaimedRequestInternal` (service.ts:570) updates `trigger_resolution_history` — a table **nothing anywhere inserts into** (confirmed by `rg -a` across all four roots: only the schema, one migration, and this UPDATE exist). The UPDATE has matched zero rows since the absorbed trigger-resolution service was deleted. Dead write, dead table.
3. **Local type mirrors** of `@hyperidle/work-intent-port`'s `BakedWorkIntentRequest`/`BakedContextBundle`/`BakedContextKnowledgeItem` (~110 lines). `run-orchestration` — the same layer — imports the canonical ones from `@hyperidle/work-intent-port` directly (context.ts:12, runtime.ts:18). Two copies of a wire format is one drift away from a corrupted session payload.
4. **Dead query/create arms**: `findSessionRequest by:"idempotencyKey"` and `createSessionRequest kind:"direct"` have zero shipping-root callers.

## If written today, from scratch

Eleven callables, one const:

- `enqueueWorkIntent` — the single intake
- `listPendingIntentsByKind` — the coherence trigger's outstanding-work reader
- `createSessionRequest` — explicit-start insert only
- `findSessionRequest` — 6 query arms (drop `idempotencyKey`)
- `listSessionRequests` — source + running filters
- `claimSessionRequest` / `renewClaim` / `releaseClaim` — the lease triplet
- `transitionSessionRequest` — the state machine, explicit-start terminal projection done inline in the terminal transaction
- `drainIntents` — intents → requests
- `reapExpired` — terminal-row GC (intents + explicit starts only)
- `sessionRunRegistry` — the abort switch for running sessions

No inbox, no projector registry, no background lifecycle poller, no `DurableAgentQueueDeps`, no type mirrors, no trigger-history write.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 10 |
| MERGE | 0 |
| SIMPLIFY | 9 |
| KEEP | 17 |

Surface: 24 exported-function rows + 11 types + 1 const → 13 distinct callables become 11; `service.ts` 1792 lines → roughly 1100; two DB tables dropped (`agent_lifecycle_inbox`, `trigger_resolution_history`); one background interval timer removed.

(KEEP count is inflated by the overload-row format: the 17 KEEPs are overload rows of just 8 surviving methods plus `ClaimOptions` and the registry.)

## Feature-level kills

**1. Lifecycle-projection inbox — kill the whole subsystem.**
Dies: `agent_lifecycle_inbox` table, `processLifecycleInternal`, `startLifecycleInternal`, `appendLifecycleFactInternal`, `listReapableLifecycleInternal`, `deleteLifecycleFactsInternal`, `lifecycleProjectors`, `observeOnly`, `projectExplicitStart`, exports `drainLifecycleProjections` + `startLifecycleProjectionDrain`, types `LifecycleProjectionDrainStop` + `AgentLifecycleFact` + `DurableAgentQueueDeps.lifecycleProjection`, boot wiring (`layers/agent-orchestration/src/boot.ts:352`), the self-calling port in `durable-agent-queue.ts` (`queueDeps` shrinks to `{ db, eventBus }` or disappears), `layers/core-api/src/__testing__/durable-agent-queue-test-deps.ts`, and the test files that exist only to exercise the drain (`agent-lifecycle-projectors.integration.test.ts`, `agent-lifecycle-projection.integration.test.ts`, the drain cases in `durable-queue-regressions.integration.test.ts`).
Replacement: in `finishRequestInTxInternal`, after the winner row update — `if (winner.sourceKind === "explicit_session_start") await projectStartInternal(tx, …)`. Same transaction, strictly better crash-safety than the inbox (no window between terminal commit and projection).
What breaks: nothing observable. The UI's `GET /api/sessions/starts/:startId` poll sees terminal state *sooner* (no 1s drain lag).

**2. `trigger_resolution_history` — drop the table, delete the UPDATE.**
Dies: the phantom UPDATE in `admitClaimedRequestInternal` (service.ts:570–573), the schema entry + `TriggerResolutionHistoryRow` types in `framework/db`, a drop migration.
What breaks: nothing — zero inserts exist, the table has been empty since the trigger-resolution absorption.

**3. Baked* local mirrors — delete, import canonical.**
Dies: `BakedWorkIntentRequest`, `BakedContextKnowledgeItem`, `BakedContextBundle` declarations in service.ts (~110 lines). Add `@hyperidle/work-intent-port` to package deps — precedent already set by `run-orchestration` in the same layer. No importer anywhere consumes these types *from* `@hyperidle/session-requests`.

**4. `createSessionRequest kind:"direct"` — delete the arm.**
Only caller in shipping roots: none. The intent drain inserts via `insertRequestInternal` internally. The one real caller is `tools/eval/src/provision-harness.ts:128` — development world. Hole: the eval must provision by enqueuing a baked intent through `enqueueWorkIntent` like production does, which also makes the eval exercise the real admission path instead of skipping it.

## Full method audit

Reach evidence: the code graph misses `claimSessionRequest`/`renewClaim`/`releaseClaim`/`drainIntents` (0 doors reported) because run-orchestration consumes them through structurally-typed `RuntimePorts` re-declared in `contracts.ts`, >4 hops from any door; `rg -a` confirms production callers in `runtime.ts`/`start-runtime.ts`, driven by the runtime poll loop. Tagged `SCHED:runtime-poll` below.

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `enqueueWorkIntent` | UI:POST /api/threads/:id/messages (+20 more doors incl. AGENT:send_message, SCHED:routine-tick) | KEEP | The single intake spine of all agent work; fold the one-line `insertIntentInternal` passthrough into the export body. |
| 2 | `listPendingIntentsByKind` | UI:GET /api/agent-orchestration/requests/pending-intents; EVENT:thread_message_appended | KEEP | Assistant-turn coherence trigger's only outstanding-work reader — agents replying to the latest message is core conversation correctness. |
| 3 | `createSessionRequest` (direct overload) | DEAD (shipping roots; tools/eval only = dev world) | DELETE | Zero production callers; the drain inserts internally; eval must use the real intake path. |
| 4 | `createSessionRequest` (explicitStart overload) | UI:POST /api/sessions/ → seam POST /api/agent-orchestration/intents/explicit-start | KEEP | The "start a session on this task" button — a real product door with UI polling feedback. |
| 5 | `createSessionRequest` (impl) | UI (as above) | SIMPLIFY | Collapse union + overloads to a single explicit-start insert once the direct arm dies. |
| 6 | `findSessionRequest` (by id) | SCHED:runtime-poll (runtime.ts:56, provisioner) | KEEP | Targeted-run lookup in the runtime's claim path. |
| 7 | `findSessionRequest` (by idempotencyKey) | TEST-ONLY | DELETE | Zero production callers — request idempotency lives inside `insertRequestInternal`; `run-orchestration/contracts.ts` doesn't even declare this arm. |
| 8 | `findSessionRequest` (by sessionId) | EVENT:session_handoff_completed (start-runtime.ts:400) ← UI:POST /api/tasks/:id/handoff | KEEP | Handoff correlates the ended session back to its request. |
| 9 | `findSessionRequest` (by terminationReason) | UI:PATCH /api/sessions/:id (via transition-run.ts:70,131, provisioner) | KEEP | The kill-switch read: was this session asked to stop. |
| 10 | `findSessionRequest` (by claimActive) | SCHED:runtime-poll (runtime.ts:35) | KEEP | Custody check before executing a claimed request — the lease is the queue's one concurrency guarantee. |
| 11 | `findSessionRequest` (by explicitStart) | UI:GET /api/sessions/starts/:startId (+ idempotent retry on POST /api/sessions/) | KEEP | The UI poll for "did my session start" — the product feedback loop of door #4. |
| 12 | `findSessionRequest` (by intentSource) | SCHED:runtime-poll (start-runtime.ts:104, runtime.ts:272) | KEEP | Correlates an admission failure back to the originating intent for the `agent_run_admission_failed` emit. |
| 13 | `findSessionRequest` (impl) | all of the above | SIMPLIFY | Drop the `idempotencyKey` arm from `FindQuery` and the switch. |
| 14 | `listSessionRequests` | UI:GET /api/agent-orchestration/sessions; SCHED:runtime-poll (resume running on boot) | KEEP | Session listing + crash-resume of running sessions; both filters production-used. |
| 15 | `claimSessionRequest` | SCHED:runtime-poll (start-runtime.ts:91 `{next}`, runtime.ts:242 `{id}`) | KEEP | The heart of the queue — CAS claim with lease; both selectors live. |
| 16 | `renewClaim` | SCHED:runtime-poll (runtime.ts:322) | KEEP | Lease heartbeat during provisioning; without it a slow start gets double-executed after 30s. |
| 17 | `releaseClaim` | SCHED:runtime-poll (runtime.ts:404) | KEEP | Requeue on transient provisioning failure — the retry half of the lease. |
| 18 | `transitionSessionRequest` (transaction:"existing" overload) | SCHED:runtime-poll (transition-run.ts:89,104) | KEEP | Terminal transition inside the caller's event-emitting transaction. |
| 19 | `transitionSessionRequest` (plain overload) | UI:PATCH /api/sessions/:id; UI:POST /api/agent-orchestration/runs/explicit-start/fail | KEEP | The state machine's public door: running/termination-requested/terminal/admitted. |
| 20 | `transitionSessionRequest` (impl) | all of the above | SIMPLIFY | Delete the dead `deps` param (`void deps` — nothing ever reads it, every caller threading it is cargo); delete the `target:"explicitStart"` requestId-terminal arm (only caller is the dying drain port — projection moves inline into `finishRequestInTxInternal`). |
| 21 | `drainIntents` | SCHED:runtime-poll (start-runtime.ts:312) | SIMPLIFY | Live and load-bearing (intents → requests), but signature shrinks to `(db, eventBus, options)` when `DurableAgentQueueDeps` dies; make `eventBus` required — production always wires it, optionality exists only for old test call sites. |
| 22 | `drainLifecycleProjections` | TEST-ONLY | DELETE | No production caller anywhere (`rg -a` confirmed: only its own tests + one core-api test). The sync twin of a poller that shouldn't exist either. |
| 23 | `startLifecycleProjectionDrain` | BOOTSTRAP (boot.ts:352) | DELETE | A forever-poller + durable inbox whose only real work is one same-package UPDATE routed through a DI port back into itself; replaced by an inline conditional UPDATE in `finishRequestInTxInternal`. |
| 24 | `reapExpired` | SCHED:TICK AGENT_LAYER_REAP_INTERVAL_MS (start-runtime.ts:331) | SIMPLIFY | Own-table terminal-row GC stays (unbounded queue growth on a laptop DB is real); the inbox-GC third of it dies with the inbox. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `LifecycleProjectionDrainStop` | DELETE | Dies with `startLifecycleProjectionDrain`; no external importer. |
| `BakedWorkIntentRequest` | DELETE | Local mirror of `@hyperidle/work-intent-port`'s canonical type; nobody imports it from this package; same-layer precedent for importing the real one exists. |
| `BakedContextKnowledgeItem` | DELETE | Same mirror, same fix. |
| `BakedContextBundle` | DELETE | Same mirror, same fix. |
| `WorkIntentInput` | SIMPLIFY | Live (intake route contract) — but make `bakedRequest` required and delete the drain's unbaked-intent terminal-failure branch; every kind bakes at emit since AU21, the optionality guards a migration that finished. |
| `CreateSessionRequestInput` | SIMPLIFY | Drop the `direct` arm (row 3); the union collapses to the explicit-start shape. |
| `FindQuery` | SIMPLIFY | Drop the `idempotencyKey` arm (row 7). |
| `SessionRequestTransition` | SIMPLIFY | Drop the `target:"explicitStart"` requestId-terminal arm (drain-only); keep `transaction:"existing"` — transition-run uses it in production. |
| `ClaimOptions` | KEEP | The lease contract shared by claim/renew; three fields, all read. |
| `AgentLifecycleFact` | DELETE | Dies with the inbox; no production importer outside this package. |
| `DurableAgentQueueDeps` | DELETE | `lifecycleProjection` was its reason to exist and it's a self-call; what remains is `{ db, eventBus }` — pass them as parameters. `queueDeps()` and `durable-agent-queue.ts`'s port const die with it. |

## Holes this leaves

1. **`tools/eval/src/provision-harness.ts` breaks** — it provisions sessions via the deleted `createSessionRequest kind:"direct"`. Fix is to enqueue a baked intent via `enqueueWorkIntent`, which also makes the eval exercise the real admission path it currently bypasses. Until repointed, `tools/eval` does not compile.
2. **Two drop migrations needed** — `agent_lifecycle_inbox` and `trigger_resolution_history`. `trigger_resolution_history` has FK constraints to `users`/`agent_session_requests`; the drop must remove them.
3. **Tests die with the machinery** — `agent-lifecycle-projectors.integration.test.ts`, core-api's `agent-lifecycle-projection.integration.test.ts`, the drain/poison cases in `durable-queue-regressions.integration.test.ts`, `layers/core-api/src/__testing__/durable-agent-queue-test-deps.ts`. The surviving invariant (explicit-start row reaches terminal state when its request does) needs one new assertion against the inline projection.
4. **If `eventBus` becomes required on `drainIntents`**, every bare `queueDeps(db)`-style test call site must wire a bus. Deliberate: an admission failure that emits nowhere is a silent black hole.
5. **`agent_lifecycle_inbox` loses its incidental audit-trail role** — terminal facts for all six source kinds stop being recorded anywhere. Nothing reads them today (five no-op projectors, GC deletes the rows after 30 days); if someone later wants lifecycle history, the event bus + `agent_session_requests` terminal rows already carry it.


---

# settings — destroyer verdict

## Should this service exist?

**KEEP AS the `server_config` owner — and nothing else.** The honest core is one single-row
table (`server_config`) read by 26 doors and 6 event subscribers (notifications prefs, model
gateway tiers, harness disable list) and written by 3 doors. That read/write pair is load-bearing
for what HyperIdle is: agents need a model gateway, the founder needs notification prefs.

The other half of the service — the plugin-configuration resolution engine
(`plugin-configuration.ts`, 790 lines, 3 DB tables: `plugins`, `plugin_configuration_defaults`,
`configuration_overrides`) — **must die whole.** Verified with the code graph and `rg -a`:
**no production code anywhere reads the resolved configuration except the Settings → Agent
Behavior display route.** The `configuration_overrides` a user writes through that page are
consumed by *nothing at runtime* — agents spawn from `agent_run_config`, routines fire from the
`routines` table, triggers' one-and-only consumer was deleted in AU21 with "ZERO real callers
ever existed" on record. The engine is a boot-time mirror of live tables plus an override layer
that lies to the user: editing an agent's system prompt on that page marks it "user_override"
and changes nothing about how the agent actually runs. There is also no plugin system — the
`plugins` table has exactly one production row ever (the builtin source); the plugin-seeding
path is test-only.

Survivors stay here. Nothing routes elsewhere except the desktop credential bridge (→ `credentials`).

## If written today, from scratch

`server-config.ts` only, one file:

- `readServerConfig(db)` — the singleton blob, defaults on empty/corrupt.
- `updateServerConfig(db, patch)` — locked deep-merge patch.
- Types `ServerConfig` / `ServerConfigPatch` — minus the observability section.

Nothing else. No mirror tables, no override engine, no plugin state machine, no observability
accessor pair, no migration code, no DI ports.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 1 |
| SIMPLIFY | 0 |
| KEEP | 2 |

Surface: 10 methods → 2 methods (80% cut). Types: 10 declarations → 2 (both shrunk).
Tables: 4 owned → 1 (`plugins`, `plugin_configuration_defaults`, `configuration_overrides` dropped).

## Feature-level kills

**1. The plugin-configuration resolution engine (methods 1–5, three tables, five types).**
The entire default-vs-override-vs-origin resolution concept has zero runtime consumers. Its only
door is the Settings → Agent Behavior tab, which displays a boot-time projection of data that
already lives in real tables (`users` + `agent_run_config`, `routines`, `service_connections`,
`BUILTIN_TOOL_CATALOG`) and accepts edits that take effect nowhere. What breaks: that settings
tab, and the `agent-behavior-config-impl.ts` view-model over it. Acceptable because the tab's
display can be rebuilt read-only over the owning services' existing list functions in a fraction
of the code (the deep-links in the view-model already point at the real editors), and its edit
capability is not a loss — it never worked. Dies with it: the boot backfill run on every desktop
and remote-server start, the `SECRET_FIELD_NAMES` scanner, the per-kind Zod value schemas, the
sha256 id derivation, and four integration/component test files.

**2. The observability config section of `server_config` (methods 9–10, two types).**
No door can write it: `PATCH /api/settings` accepts only six notification fields,
`updateObservabilityConfig` has zero production callers, no UI surface exists. Every field
(`enabled`, `adapter`, `batchSize`, `flushIntervalMs`, `bufferCap`) has exactly one reachable
value — its default. A setting with one reachable value is a constant. Kill the section; the
observability runtime (`observability-runtime.ts`, its sole reader) hardcodes the five values.

**3. Flag for the notifications destroyer (not counted here):** `notifications.delivery`,
`notifications.silence`, and `notifications.mutedTypes` are equally write-orphaned — no door
writes them, so SMTP/ntfy delivery, silence windows, and per-type mutes run on defaults forever.
Either that whole delivery apparatus is a dead feature or it is missing its settings surface.
The fields sit in my `ServerConfig` shape but the verdict on the feature belongs to notifications.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `setPluginState` | TEST-ONLY | DELETE | Plugin enable/disable state machine for a plugin system that does not exist; only tests call it. |
| 2 | `listConfiguration` | UI:GET /api/settings/agent-behavior/config, UI:PATCH /api/settings/agent-behavior/config/:id | DELETE | Fronts a resolution engine whose output no runtime consumes; the one door is a display mirror — rebuild the tab over owning-service reads and kill the caller (`agent-behavior-config-impl.ts`). |
| 3 | `writeConfigurationOverride` | UI:PATCH /api/settings/agent-behavior/config/:id | DELETE | Writes overrides nothing reads; the edit UI lies — editing agent behavior here changes nothing about the running agent. Real edits belong to the owning tables' own doors. |
| 4 | `seedConfigurationDefaults` | TEST-ONLY | DELETE | Plugin-defaults seeding path; production only ever seeds the builtin source via the backfill, plugin sources exist only in tests. |
| 5 | `backfillConfigurationDefaults` | BOOTSTRAP (desktop + remote-server `create-server.ts` → `boot.ts` on every start) | DELETE | Rebuilds the display mirror from live tables at each boot; dies with the mirror. Also kills its call-site plumbing in `boot.ts` and both apps. |
| 6 | `readServerConfig` | UI:GET /api/settings/ (+25 more doors incl. SCHED routine-scheduler tick, model-gateway, harnesses, sessions; 6 event subscribers) | KEEP | Core value: the single server settings read every agent-facing door depends on (model gateway tiers, harness disable, notification prefs). Door named: GET /api/settings/. |
| 7 | `updateServerConfig` | UI:PATCH /api/settings/, UI:PATCH /api/model-gateway/, UI:POST /api/harnesses/:type/disabled | KEEP | Core value: the only write path for the surviving config; three real doors. Loses its observability merge branch when kill #2 lands. |
| 8 | `migrateCredentialsToStore` | BOOTSTRAP (`boot.ts` every start) | MERGE | Split it: Step 1 (legacy apiKey relocation out of pre-AH1 blobs) is migration archaeology for a population of ~one machine — DELETE. Step 2 (env `ANTHROPIC_API_KEY` → `server_credentials`) is the live desktop-onboarding bridge (`DbCredentialResolver` has no env fallback) but touches only the `credentials` service's table — fold those ~20 lines into `credentials` at boot and delete this function from settings. |
| 9 | `readObservabilityConfig` | BOOTSTRAP (`observability-runtime.ts` at startup, sole caller) | DELETE | Two-line wrapper over a config section no door can write; section becomes constants inside the runtime (kill #2). |
| 10 | `updateObservabilityConfig` | DEAD (rg: barrel + own file only) | DELETE | Zero callers anywhere, production or test; a write path for an unwritable setting. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `PluginConfigurationSource` | DELETE | Dies with the engine; only production value ever constructed is the builtin literal. |
| `PluginConfigurationSeed` | DELETE | Seed shape for the mirror; dies with methods 4–5. |
| `BackfillLegacyConfigurationDeps` | DELETE | Four-port DI mirror existing solely for method 5. |
| `RoutineReader` | DELETE | Port with one consumer (method 5); dies with it. |
| `SettingsUserDirectory` | DELETE | Port with one consumer (method 5); dies with it. |
| `SettingsCredentialCipher` | DELETE | Port for method 8 only; at home in `credentials` the cipher is imported directly — no port needed. |
| `ServerConfig` | SIMPLIFY | Survives as the core read shape; drop the `observability` member (kill #2). |
| `ServerConfigPatch` | SIMPLIFY | Survives as the core write shape; drop the `observability` member. |
| `ObservabilityConfig` | DELETE | Alias for a section that becomes constants; runtime declares its own local shape. |
| `ObservabilityConfigPatch` | DELETE | Patch type for the dead method 10. |

## Holes this leaves

- **Settings → Agent Behavior tab breaks** until rebuilt read-only over owning-service reads
  (users/agent-run-config, routines, service connections, tool catalog). The rebuilt page keeps
  the deep-links, drops the fake edit affordance. Smaller than the engine it replaces.
- **Any existing `configuration_overrides` rows are discarded.** No functional loss — they were
  never consumed — but a user who "edited" behavior there loses the illusion.
- **Drop-table migration required** for `plugins`, `plugin_configuration_defaults`,
  `configuration_overrides`.
- **The env→credential seed must land in `credentials` in the same change**, or fresh desktop
  installs lose model auth (safeStorage key never reaches `server_credentials`).
- **Pre-AH1 blobs keep inert legacy `apiKey` JSON fields** in `server_config` forever. Harmless:
  the typed schema ignores them; re-entering the key via the credentials UI covers any loss.
- **Observability becomes non-configurable** (it already is, in every way that counts): turning
  tracing off now requires a code change, not a DB row nobody could write anyway.
- **Test deletions ride along:** `plugin-configuration.integration.test.ts`,
  `agent-behavior-settings.integration.test.ts`, the settings-agent-behavior component test, and
  the seeding half of `builtin-tool-catalog-consistency.integration.test.ts` (re-base the
  consistency check directly on `BUILTIN_TOOL_CATALOG`).


---

# tool-handlers — destroyer verdict

**Census correction.** The input file lists 2 exported functions + 2 interfaces. That census is misleading: this package is the home of the AGENT TOOL surface — 22 tools registered in `buildToolDefinitions`'s `all` array (`tool-definitions.ts:1620`), each an `AGENT:` door in its own right (`trace_doors kind=agent` lists all 22 at head ba0fb454). This verdict audits **both** tables: the 2 exports and every one of the 22 agent tools.

## Should this service exist?

**KEEP AS the single home of the agent tool surface.** The tools are the product's hands — how an agent participates in conversations, bets, and knowledge. Killing the service kills the agent side of the product. But the surface carries dead weight: two write-only note sinks nobody reads, an inbox poller the push model already covers, a showcase "irreversible" tool nothing invokes, a half-no-op scoring tool, and a conflict tool that trusts agents to report their own stale writes. Those die.

## If written today, from scratch

The honest shape is one tool per primitive-act:

- **Converse:** `reply`, `send_message`
- **Work:** `create_task`, `create_bet`, `edit_bet`, `submit_review`, `create_artifact`
- **Escalate:** `create_item`, `handoff_to`
- **Org:** `create_team`, `add_agent`
- **Routines:** `create_routine`, `update_routine`
- **Knowledge:** `query_practice`, `write_memory` (absorbing edit/conflict), `promote_knowledge`, `score_attention` (knowledge override only)
- **Plumbing:** `buildToolDefinitions`, `buildToolRegistry`

Everything outside that shape — polling, note journals, file-write duplication — is a deletion by construction.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 4 |
| MERGE | 1 |
| SIMPLIFY | 8 |
| KEEP | 11 |

Surface: 24 callable surfaces (2 exports + 22 tools) → 19 (4 deleted, 1 merged away; 21% cut outright, 8 of the survivors shrink)

## Feature-level kills

1. **Session-notes persistence** (`write_session_notes` + `ToolHandlersSessionsAccessor.writeNotes` + `sessions.notes` writes). `sessions.notes` is a write-only column: written by the tool, by `writeback-processor.ts:338`, and by `routes/sessions.ts:305/321` — read by **nothing**. No UI render (`rg '\.notes' layers/core-ui/src` prod: zero), no next-session context read (`context.ts:550` seeds an *empty* `work/task-notes.md` every session). The builtin adapter's two programmatic `registry.invoke("write_session_notes", …)` calls (`builtin-harness-adapter.ts:647,697`) persist plan text into that void — kill those call sites too. Real harnesses that want a notes file just write it; the writeback watcher already sees it. What breaks: nothing observable — the column was never displayed or re-read.
2. **Task-notes log** (`log_task` + `appendTaskNote` port member + `PATCH /tasks/:id/notes` + `tasks.notes` column). Same disease: write-only audit trail. `tasks.notes` appears in `TaskView` (`core-api-port.ts:61`) but no UI page renders it and no handler reads it back. ETHOS names this exactly: "audit trails nobody reads." What breaks: agents lose a private journal; discoveries that matter go to the task thread (`reply`) or the fabric (`write_memory`) — the places humans actually look. The eval scenario `tools/eval/src/scenarios/log-task.ts` dies with it.
3. **Inbox polling** (`read_inbox` + `listInboxBySenderExclusion` port member + the agent leg of `GET /threads/inbox`). The system is push-model: sessions get a baked `transcript`/`contextBundle`/`callingThreadId` (`session-requests/src/service.ts:884-901`) and new messages re-trigger agents via reengagement. Polling is the second way, and it is badly built — fetch `limit*4`, filter participants client-side, hope. What breaks: an agent cannot pull arbitrary cross-thread context mid-session. Acceptable — the push model is the designed channel; if a real learning shows agents starving for context, widen the baked bundle, don't resurrect polling.
4. **`commit_file`** — outside its own definition and the catalog mirror, referenced by nothing: no system prompt, no eval scenario (`rg commit_file tools/eval`: zero), no production caller. It duplicates what every real harness does natively (write a file in its own sandbox) and exists as the AL7 showcase "irreversible" tool with a preemptive sandbox-escape guard — security nobody earned. AL7 doesn't need it: `classifyReversibility` fails closed for any undeclared tool, so the workflow router keeps a live irreversible path without a mascot.
5. **`score_attention`'s item target and recompute mode.** The `target:"item"` branch validates, looks up the row, and returns `ok` while doing **nothing** (`tool-definitions.ts:834`, `@lore O2: items.attentionScore removed — no-op`). The tool lies to the agent — and `facilitator.md:19` explicitly instructs "Score items for human attention," the exact no-op. Recompute mode duplicates the attention engine the routine scheduler already drives (`routine-scheduler.ts` → `attention-service.ts`). Survivor: knowledge_item override only.
6. **Agent-self-reported conflicts** (`create_conflict_review` merged into the knowledge write path). Today the agent must *notice* its own stale edit and volunteer a conflict row. The server should detect version mismatch at write time and record the conflict itself — the consumer loop (promotion-pipeline block, `KnowledgeDetail.tsx`, facilitator queue) stays; the honor-system tool goes.

## Full method audit

### Exported functions (input file table A)

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `buildToolDefinitions` | BOOTSTRAP (wired in `run-orchestration-composition.ts:326,340` via `tool-handlers-bindings.ts:225`; serves every AGENT:TOOL door) | KEEP | The one assembly point for the whole agent tool surface — the product's hands exist through this call. Shrinks automatically as tools die. |
| 2 | `buildToolRegistry` | BOOTSTRAP (`run-orchestration-composition.ts:327` → `provisioner.ts:1234`; every brokered/MCP tool call passes through `invoke`) | KEEP | The dispatch + AL7 workflow router — role filter, schema validation, review routing for every harness in one closure. Load-bearing for both the tool surface and the review→act loop. |

### Agent tools (the corrected census — every `AGENT:` door this package serves)

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `read_inbox` | AGENT:read_inbox | DELETE | Push model (baked transcript/contextBundle + reengagement) is the first way agents see messages; polling with a limit×4 overfetch hack is the second way. Kill `listInboxBySenderExclusion` and the qa-engineer prompt line with it. |
| 2 | `send_message` | AGENT:send_message | KEEP | Core value: agent-initiated collaboration — the conversations pillar. Door: return-actions trio member (`return-actions.ts:33`), standard tool in every role prompt. |
| 3 | `reply` | AGENT:reply | KEEP | Core value: answer whoever triggered you — how the assistant exists as a product. Door: every session kind's answer path (AU27); no-thread-arg design kills a loop class. |
| 4 | `query_practice` | AGENT:query_practice | SIMPLIFY | Knowledge read side survives, but push the layer filter into `coreApi.search` server-side and delete the limit×5 client overfetch. |
| 5 | `write_memory` | AGENT:write_memory | SIMPLIFY | Knowledge write side is core. Delete the facilitator-role layer gate (`FORBIDDEN insufficient role for L3+`) — a preemptive permission matrix nobody earned, straight against ETHOS §2 — and collapse the scopeKind/scopeId ceremony to one default. Absorbs `create_conflict_review` (see MERGE). |
| 6 | `handoff_to` | AGENT:handoff_to | KEEP | Core value: task ownership transfer between agents/humans — the session lifecycle itself. Door: return-actions trio, `POST /tasks/:id/handoff` seam. |
| 7 | `create_item` | AGENT:create_item | SIMPLIFY | Escalating to human attention is core (the review→act loop). The 9-kind × 6-verb × riskTier input surface is not — shrink to the kinds the attention view actually routes (review, escalation, knowledge) and delete the rest of the enum freight. |
| 8 | `write_session_notes` | AGENT:write_session_notes | DELETE | Writes `sessions.notes`, which nothing reads — no UI, no next-session read, `context.ts:550` even blanks the file each session. Duplicate of the writeback path for real harnesses. Kill the builtin adapter's two internal invokes with it. |
| 9 | `create_task` | AGENT:create_task | KEEP | Core value: agents decompose work under a bet — the bets/tasks pillar. Door: `POST /tasks` seam, standard tool in role prompts. |
| 10 | `submit_review` | AGENT:submit_review | KEEP | Core value: work returns as a reviewable message on the bet thread — the AL5 review loop. Door: return-actions trio member, `ReviewPayload` consumed by `ReviewComposition.tsx` etc. |
| 11 | `score_attention` | AGENT:score_attention | SIMPLIFY | The item target is a silent no-op (returns `ok`, writes nothing — `@lore O2`) and recompute duplicates the scheduler-driven engine. Survivor: knowledge_item override only, one mode, no superRefine. `recomputeAttentionScoreForItem` port member dies. |
| 12 | `promote_knowledge` | AGENT:promote_knowledge | SIMPLIFY | Lifecycle transitions are the fabric's designed loop (facilitator/PM prompts drive it). But the dual `KNOWLEDGE_STATUSES` + `KERNEL_KNOWLEDGE_STATUSES` union with `isAnyKnowledgeStatus` is two vocabularies for one concept — collapse to one status set and one transition table. |
| 13 | `create_conflict_review` | AGENT:create_conflict_review | MERGE | Fold into the knowledge write path (`write_memory` with `itemId`+`versionBase` = propose edit; server detects the stale version and records the conflict row). An agent should not be trusted to notice its own stale write — CAS at the write is the honest mechanism. Consumer loop (promotion block, `KnowledgeDetail.tsx`) survives untouched. `findOpenConflictByItemAndProposer`/`createKnowledgeConflict` port members move server-side. |
| 14 | `create_team` | AGENT:create_team | KEEP | Core value: the assistant scaffolds a flat team + roster + routines conversationally — the product's genesis move. Door: assistant-only tool over `createTeam`/`persistScaffoldedAgents`/`provisionTeamRoutines` seam. |
| 15 | `add_agent` | AGENT:add_agent | KEEP | Core value: growing the roster by talking to the assistant — agents as first-class hires. Door: assistant-only tool, `agent_added` event consumers. |
| 16 | `create_bet` | AGENT:create_bet | SIMPLIFY | Bets pillar, keep — but kill the `AssistantToolShape` + `wrapForRegistry` special shape (only these two tools deviate from `ToolDefinition`; two shapes for one idea). |
| 17 | `edit_bet` | AGENT:edit_bet | SIMPLIFY | Draft-refine loop with the human is real; same shape fix as `create_bet` — plain `ToolDefinition`, drop the parallel error idiom. |
| 18 | `create_routine` | AGENT:create_routine | KEEP | Core value: routines are one of the five primitives; the assistant setting up automation in conversation is the pitch. Door: assistant-only tool → `insertRoutine` seam → scheduler. |
| 19 | `update_routine` | AGENT:update_routine | SIMPLIFY | Pause/reschedule survives; delete the post-write re-read (`getRoutineById` twice per call) and take `triggerConfig` as an object, not JSON-in-a-string-in-JSON. |
| 20 | `commit_file` | AGENT:commit_file — but zero prompts, zero evals, zero production callers | DELETE | Duplicates native harness file-writing; exists as the AL7 irreversible showcase with a preemptive sandbox-escape guard. Fail-closed classification keeps AL7 honest without it. Catalog row and consistency-test row die with it. |
| 21 | `log_task` | AGENT:log_task | DELETE | Appends to `tasks.notes`, a column no UI and no handler ever reads — a write-only audit trail, the ETHOS anti-pattern by name. Kill `appendTaskNote`, `PATCH /tasks/:id/notes`, the column, and the eval scenario. |
| 22 | `create_artifact` | AGENT:create_artifact | KEEP | Core value: artifacts are the review surfaces (AL5) — how produced work becomes visible and reviewable. Door: `POST /artifacts` seam, `artifact_created` consumers, `submit_review.artifactRef`. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ToolHandlersSessionsAccessor` (`ports.ts:478`) | DELETE | Sole member `writeNotes` exists only for `write_session_notes`; dies with the tool. Its only implementation (composition-root binding to `run-orchestration`'s `setSessionNotes`) dies too. |
| `ToolHandlersPorts` (`ports.ts:488`) | SIMPLIFY | Loses the `sessions` member entirely; becomes `{ coreApi }` — at which point consider passing the accessor directly. |
| `ToolHandlersCoreApiAccessor` (internal, `ports.ts:144`) | SIMPLIFY | Members dying with their sole callers: `appendTaskNote` (log_task), `listInboxBySenderExclusion` (read_inbox), `recomputeAttentionScoreForItem` (score_attention recompute), `findOpenConflictByItemAndProposer` + `createKnowledgeConflict` (conflict detection moves server-side into the knowledge write). ~44 members → ~39. |

## Holes this leaves

- **No private agent journal.** With `log_task` and `write_session_notes` gone, an agent's only durable memory is the knowledge fabric and the conversation itself. That is the honest design — if continuity across sessions is a real need, the fix is reading notes somewhere, not writing them nowhere.
- **Builtin harness loses plan persistence.** `builtin-harness-adapter.ts:647,697` stop persisting plan text. Nothing read it; nothing visible changes.
- **No mid-session cross-thread pull.** An agent cannot browse messages outside its baked context. If a learning shows this starves agents, widen the baked `contextBundle` — the push channel — rather than restoring `read_inbox`.
- **No tool-mediated file write.** Builtin-harness agents have no way to produce a sandbox file via tool. No prompt ever told them to; if a real journey needs it, add it back against that journey, not as an AL7 mascot.
- **Cross-package fallout to schedule:** `BUILTIN_TOOL_CATALOG` (tool-protocol) loses 4 rows and its consistency test re-greens; `docs/system-prompts/qa-engineer.md` drops `read_inbox`/`write_session_notes`/`log_task`; `facilitator.md`/`product-manager.md` drop item-scoring instructions; `tools/eval` scenarios `read-inbox`, `log-task`, `write-session-notes`, `poc-session-notes`, `score-attention` (item half), `create-conflict-review` (rewritten against the merged write path) die or shrink; `routes/tasks.ts` notes-append endpoint and `tasks.notes`/`sessions.notes` columns drop.


---

# users — destroyer verdict

## Should this service exist?

KEEP AS the identity spine — sole owner of the `users` table. `findUser`/`listUsers`/`insertUser`/`updateUser` sit under 54/22/10/3 real doors and `requireRunnableAgent` is the one cross-domain invariant ("never trust the human sender as the agent") under 19 doors. That is the service.

Everything else in the package is a second product hiding inside it: a full per-human credential system (invites, bearer login sessions, revocation, credential retention) that **no client anywhere can reach**. It dies wholesale — see feature-level kills.

## If written today, from scratch

Seven public symbols:

- `findUser(exec, filter)` — single-row read
- `listUsers(exec, filter)` — multi-row read
- `insertUser(exec, values, opts?: { ifAbsent?: true })` — one insert, conflict mode as option
- `updateUser(exec, id, patch: Partial<NewUser>)` — plain patch, no SQL-expression admittance
- `requireRunnableAgent(db, agentId)` + `AgentNotRunnableError` — the runnability invariant
- `createUpgradeTokenStore()` — one-shot WS handshake tokens (in-memory, feeds the real UI's WebSocket)

Plus `UserFilter` as the one filter type. Nothing else.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 10 |
| MERGE | 2 |
| SIMPLIFY | 3 |
| KEEP | 4 |

Surface: 19 methods (18 functions + 1 class) → 7 (63% cut)

## Feature-level kills

### 1. The entire per-human credential stack (rows 1, 7–11, 18) — DELETE

`invite-code.ts`, `login-session.ts`, `credentials-reaper.ts`, and the `inviteCodes` + `loginSessions` tables. Three facts convict it:

1. **Gated behind an env var nothing sets.** `/api/auth/invite`, `/api/auth/claim`, `/api/auth/logout`, and the Bearer branch of the auth middleware mount only when `HYPERIDLE_SHARED_MODE=true`. Grep across repo, helm, desktop, docs: nothing sets it. Desktop "shared mode" (`--backend-mode=shared`) is a *client* connecting with the team API key — a different thing.
2. **Zero client.** No UI creates invites, no claim page exists, no logout button exists, no code anywhere stores or sends a login-session Bearer token (the one `Bearer` in `applications/desktop/src/credential-validator.ts` carries the API key). Every endpoint in this stack is curl-only.
3. **The documented deployment contradicts it.** `docs/deployment/shared-backend.md` §Auth: "one shared team `HYPERIDLE_API_KEY`". That is the ETHOS trust model — trust the team, share the key. Per-human credentials with admin/member invite roles (enforced nowhere — the only admin gate is holding the master key), 30-day sessions, revocation, and an invite "audit-window" reaper is preemptive enterprise identity built for a learning nobody has had.

Deleting it removes **zero user-reachable behavior** and aligns code with the deployed reality. Cascade kills: `auth-public.ts`, the shared-mode Bearer branch + `handleBearerAuth` in `middleware/auth.ts`, `INVITE_ROLES` + `LOGIN_SESSION_TTL_MS` + `INVITE_CODE_TTL_MS` in domain-model, `SESSION_EXPIRED`/`SESSION_REVOKED`/`INVITE_CLAIMED`/`INVITE_EXPIRED` error codes, `loginSessionId`/`authMethod="login_session"` context vars, the `reapExpiredCredentials` call in `service-bootstrap.ts:510`, both tables from schema, and the S1-* integration tests.

### 2. Server-side hint dismissal (rows 5–6) — DELETE

`hint-progress.ts`, the `hintProgress` table, both `/api/hint-progress` routes, and the server round-trip in `useHints.tsx`. A DB table + two endpoints + a service to remember "user closed a tooltip" is bloat; localStorage does this with zero backend. The hook already treats API failure as all-dismissed, so it degrades to exactly the localStorage shape.

### 3. Perpetual factory backfill (row 3) — DELETE

`setAgentCategoryForRole` re-runs the one-time AB0 `agentCategory` column backfill on **every launch**, and overwrites the category of *any* ai user sharing a factory role name — a founder who recategorizes a "builder" agent gets silently reverted at next boot. Every factory insert already sets its category. A migration wearing a bootstrap costume, with a side of data clobbering.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `reapExpiredCredentials` | SCHED:6h retention sweep (`service-bootstrap.ts:510` — graph missed the setInterval wiring) | DELETE | Reaps tables that are themselves deleted; and expired/revoked rows were already unusable — this was hygiene, the invite cutoff literally an "audit-window". |
| 2 | `insertUserIfAbsent` | BOOTSTRAP (`bootstrap/factory-state.ts` via desktop + tools/setup) | MERGE | Same idea as `insertUser` with `onConflictDoNothing` — fold in as `insertUser(exec, values, { ifAbsent: true })`; two insert functions are one insert function. |
| 3 | `setAgentCategoryForRole` | BOOTSTRAP (`bootstrap/factory-state.ts`) | DELETE | Permanent re-run of the one-time AB0 backfill; clobbers custom categories by role every launch; factory inserts already carry the category. |
| 4 | `listFactoryAgents` | BOOTSTRAP (`bootstrap/factory-state.ts`) | MERGE | Bespoke projected getter — exactly the species AU20 Am11 exterminated; `listUsers(db, {ids, kind:"ai"})` + caller projects `{id, role}`. |
| 5 | `listDismissedHints` | UI:GET /api/hint-progress/ | DELETE | Feature kill #2 — tooltip memory belongs in localStorage, not a DB table behind two endpoints. |
| 6 | `dismissHint` | UI:POST /api/hint-progress/:hintId/dismiss | DELETE | Dies with #5; the TOCTOU-safe upsert is careful engineering on a feature that shouldn't exist server-side. |
| 7 | `createInvite` | UI:POST /api/auth/invite (mounts only if `HYPERIDLE_SHARED_MODE=true` — nothing sets it; no client) | DELETE | Feature kill #1; admin/member invite roles are a permission matrix enforced by zero lines of code. |
| 8 | `claimInvite` | UI:POST /api/auth/claim (same dead gate; no client) | DELETE | Feature kill #1 — the only production human-creation path besides founder setup, and no user can reach it. |
| 9 | `createLoginSession` | INTERNAL (only caller is `claimInvite`; exported but no external production import) | DELETE | Dies with its only caller. |
| 10 | `validateBearerToken` | BOOTSTRAP (`middleware/auth.ts` shared-mode branch — dead-gated) | DELETE | The Bearer branch it serves is unreachable; deployed auth is the one team API key, per docs and ETHOS. |
| 11 | `revokeLoginSession` | UI:POST /api/auth/logout (shared mode only; no client) | DELETE | Logout for a login system nobody can log into. |
| 12 | `requireRunnableAgent` | UI:POST /api/threads/:id/messages + 18 more doors, 6 event subscribers | KEEP | The one cross-domain invariant (never run the human sender as the agent) — core to agents-as-participants. Cross-service note: `session-requests`' duplicate `requireRunnableActor` copy should die into this one (AU21 Increment 4 debt). |
| 13 | `createUpgradeTokenStore` | BOOTSTRAP (`app.ts`/`boot.ts`) → UI:POST /api/auth/ws-token → `core-ui/src/services/ws-client.ts` | SIMPLIFY | Real (the UI's WS handshake rides it) but drop the `HYPERIDLE_WS_TOKEN_TTL_MS`/`HYPERIDLE_WS_TOKEN_MAX` env knobs — operator toggles referenced nowhere but this file and its test; hardcode 60s/1000. |
| 14 | `findUser` | 54 doors (routes, agent tools, schedulers, subscribers) | KEEP | The identity spine's single-row read; the AU20 Am11 collapse already made it minimal. |
| 15 | `listUsers` | 22 doors | KEEP-shape, SIMPLIFY | Drop `orderById` — its only remaining caller is a test (`conversation-user-store-reads.integration.test.ts`); test-only surface is dead surface. |
| 16 | `insertUser` | 10 doors (user setup, agents, teams, scaffold, assistant) | KEEP | The one write door to `users`; absorbs row 2's conflict mode. |
| 17 | `updateUser` | UI:PATCH /api/users/:id, PATCH /api/agents/:id, DELETE /api/agents/:id | SIMPLIFY | `UserPatch`'s SQL-expression admittance lost its only use when cost metering died (AU21 14a) — the @lore admits it's kept "as reusable infrastructure", i.e. speculative generality. Patch becomes `Partial<NewUser>`. |
| 18 | `getOrCreateUser` | INTERNAL (only caller `claimInvite`, which passes a freshly random id — the "get" branch is structurally dead in production) | DELETE | A plain insert wearing a get-or-create costume plus a redundant re-select; dies with feature kill #1 regardless. |
| 19 | `AgentNotRunnableError` (class) | Caught by `routine/src/routine-service.ts` + route handlers | KEEP | The error contract of row 12 — callers map it to 4xx; one class, no members, earns its line. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ReapExpiredCredentialsArgs` | DELETE | Dies with row 1. |
| `ReapExpiredCredentialsResult` | DELETE | Dies with row 1. |
| `DismissedHint` | DELETE | Dies with rows 5–6. |
| `UpgradeTokenStore` | KEEP | Live DI port between boot composition and the auth route/WS handler; both members (`issue`, `consume`) have real callers. |
| `UserFilter` | SIMPLIFY | Drop `orderById` (test-only, row 15). The other eight fields all have production callers (`excludeId` via policy-bindings, `nameContains` via recipients, etc.). |

## Holes this leaves

1. **A second human cannot join a backend with their own identity.** This is the big one — and it is a hole in the *roadmap*, not the *product*: today no user-reachable path creates a second human anyway (`POST /api/users` returns the existing human once one exists; claim had no client). The product as shipped is single-human-per-backend, and deleting the stack makes the code stop pretending otherwise. When multi-human becomes real, build the smallest door that fits the documented trust model (share the team key, pick your name on connect) — not a credential system in advance. If a login UI is genuinely landing next, the founder overrules feature kill #1 and rows 7–11 flip to KEEP; the facts above say it is not wired to anything today.
2. **Hint dismissals stop roaming.** Dismissed onboarding tooltips reappear on a new device/browser profile. They are first-run UX; acceptable.
3. **`loginSessions`/`inviteCodes` tables drop** — a migration, plus deletion of the S1-* integration tests, `INVITE_ROLES`, both TTL constants, and four API error codes. The auth middleware collapses to API-key-only in both modes; the `sharedMode` flag likely shrinks to "is /api/users setup pre-auth or not" and may die entirely in a follow-up.
4. **Pre-AB0 databases never get `agentCategory` backfilled.** If such a DB still exists, one SQL migration fixes it once, correctly, instead of every launch, destructively.
5. **Nothing reaps credentials** — nothing is left to reap. The 6h sweep in `service-bootstrap.ts` keeps reaping its other tables untouched.


---

# work — destroyer verdict

## Should this service exist?

**KEEP AS the bet/task state machines plus the sole table path for `bets`/`tasks`/`items`/`artifacts`.**
Bets and tasks are the process primitive — this is one of the few services whose core is real. But
that core is wrapped in ceremony: two write-only audit ledgers, a dependency-unblock feature nothing
can trigger, a risk-tier reader over a table nothing writes, two error classes nothing catches, a DI
bundle nothing constructs, and ~10 dead branches inside the generic primitives. The genuine shape is
about ten callables. Everything else dies.

## If written today, from scratch

- `get(exec, entity, id)` / `list(exec, entity, filter)` — the read path (filter cut to keys with real doors)
- `create(exec, entity, values)` / `update(exec, entity, id, patch)` — the write path (incl. atomic note append)
- `transition(exec, entity, {id, guard, patch})` — single-row CAS, three guard shapes, no sweep, no `affected`
- `transitionBet` / `transitionTask` — the two state machines: validate, CAS, emit. No revision log, no audit blob.
- `cascadeBetKill` — kill bet → kill tasks → stop runs. No propagation-log hops.
- `resolveTaskRunRequest` — one emit-time resolver baking both `task_run` and `session_start` (they differ only by the attempt lookup and contextBundle)
- `taskDispatchAttemptStore` — the dispatch-attempt ledger (insert/get/settle/reap; no ordinal, no occasion)

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 10 |
| MERGE | 5 |
| SIMPLIFY | 14 |
| KEEP | 17 |

Surface: 16 callables (21 fn rows + 2 classes + 1 const) → 10 callables (37% callable cut); of 22 type
declarations, 6 die and 2 merge. On top of that, ~10 dead branches inside surviving functions and 6
write-only DB columns plus one whole table (`task_planning_signals`) go.

KEEP looks high only because the input counts every overload row of `get`/`update`/`list` and every
one-line row-type alias (`Bet`/`Task`/`Item`) as its own row. Deduped, only four callables survive
untouched: `get`, `create`, `update`, and the artifacts-page `list` overload.

## Feature-level kills

1. **Dependency auto-unblock is a permanent production no-op — DELETE the feature.**
   `tasks.dependencies` is written by NOTHING: not the create-task route, not the PATCH route, not any
   agent tool, not any service (`rg '\bdependencies\b'` across all four roots: only `framework/db/src/schema.ts:219`
   and the watcher's own LIKE read at `work-service.ts:464`). The writer was bet-decomposition, which
   was hard-deleted. So `checkAndUnblockDependents`' pre-filter matches zero rows forever. Kill: the
   function, the `dependencyId` branch of `list()`, the `task_state_changed` subscriber wiring in
   `layers/core-api/src/app.ts:527` that calls it, and the `tasks.dependencies` column. **Breaks:**
   nothing observable — it has never fired since decomposition died. If task dependencies ever come
   back, rebuild the watcher with a writer, or don't rebuild it.

2. **Task risk tier is a reader over a table nothing writes — DELETE the feature.**
   `task_planning_signals` has zero production writers (its own file admits it: "no production writer
   anywhere in the repo yet"; confirmed — every insert is in `__tests__`). `getTaskRiskTierByTaskId`
   therefore always returns `null`, and `review`'s `session-review-creator.ts:65`
   (`if (riskTier !== "medium" && riskTier !== "high") return;`) always returns early. Kill: the
   function, the table, `review`'s `getRiskTierByTaskId` port member, and the riskTier gate in
   session-review-creator. **Breaks — and the founder must hear this loudly:** automatic post-session
   review creation for risky tasks HAS NEVER WORKED in production. Deleting the code changes zero
   behavior; the question to answer separately is whether that review path should exist at all, and if
   yes, something must actually write risk tiers. (Distinct from `items.riskTier`, which is live.)

3. **Two write-only audit ledgers — DELETE both columns and all append machinery.**
   `bets.revisionLog` and `tasks.auditTrail` are parsed, appended to, and re-serialized by six writers
   (`transitionBet`, `updateBetField`, `bets.ts` `patchAtRisk`/description helpers,
   `lifecycle-propagation`, `transitionTask`, `handoff-protocol`) and displayed by NOTHING — zero reads
   in `applications/` or `layers/core-ui/` outside e2e assertions. This is ETHOS's named smell: an
   audit trail nobody reads. Kill both columns, `task-audit.ts` entirely, `RevisionLogEntry`, the
   parse/append helpers in `bet-state-machine.ts`, the audit block in `routes/tasks.ts` PATCH
   (outcomeVerdict), and policy's two local mirror unions. Note the CAS transactions survive — the
   compare-and-set guard is racing-writer correctness, not audit. **Breaks:** no change history for
   bets/tasks; the L14 e2e asserting `actor` in revisionLog dies with it. Nobody has looked at this
   data through ~20 waves of work.

4. **cascadeBetKill's propagation-log hops are audit rows nobody reads — SIMPLIFY.**
   The cascade writes `propagation_log` rows with `status:"applied"`. The only functional reader of
   that table selects `status = "pending_retry"` (`lifecycle-propagation.ts:622`); "applied" rows are
   only ever reaped (`:243`). Kill the `policy` port member of `BetKillCascadeDeps` and
   `writeCascadeRow`. The kill cascade itself (tasks killed, runs stopped) is core and stays.

5. **Phantom done_condition review — SIMPLIFY `updateBetField`.**
   It emits `item_created` with a fabricated `itemId: review-${betId}-${Date.now()}` for which no items
   row exists. Both subscribers (`policy-engine.ts:69`, `notifications/install.ts:1391`) do
   `getItemById(...); if (!item) return;` — guaranteed no-op. Delete the emit.

6. **Resolver ceremony — MERGE the two resolvers, DELETE the optional-deps theater and both error classes.**
   `resolveSessionStartRequest` is `resolveTaskRunRequest` minus the attempt lookup and contextBundle;
   `BakedSessionStartRequest` is a strict subset of `BakedTaskRunRequest`. One resolver serves both.
   All five "optional — absent at a call site not yet wired" deps members are wired at every real call
   site (there is exactly ONE deps object, `task-run-resolver-bindings.ts`, and `sessions-routes.ts`
   wires all three) — make them required, delete every degrade branch. Neither
   `SessionStartSourceUnavailableError` nor `TaskRunSourceUnavailableError` is caught anywhere
   (`rg` across all roots: zero imports outside this package) — throw plain `Error`.

7. **Dead interior of the generic primitives — SIMPLIFY `list`/`transition`.**
   Confirmed-dead branches (every production call site of both functions enumerated above): task count,
   item count, item `ids`, artifact `ids`, artifact bare-`taskIds` plain list, bare item list, bare
   artifact list, `dependencyId` (kill #1), the id-less bulk-sweep path of `transition()`, the
   `affected` return field (zero readers), and the `isNull` guard for bet.status / task.state. Delete
   them all. The generic entity-switch shape itself was AU20's own flagged risk: `WorkFilter` is 21
   optional keys with silent cross-entity ignore and if/else precedence the type system can't see. The
   branch cut plus per-entity key pruning is the honest fix short of re-splitting into named functions.

8. **`WorkDeps` / `UserStoreReader` / `WorkUserRow` — DELETE.**
   Zero references outside `work/src` (nothing constructs `WorkDeps`; the barrel export has no
   importer). Their consumers (bet-decomposition, agent-assignment) were deleted; the bundle outlived
   every member's purpose. `TeamCapacityReader` and `AgentWorkIntentRecorder` survive as the two ports
   real code still injects.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `cascadeBetKill` | UI:POST /api/bets/:id/kill | SIMPLIFY | Kill cascade is core; the per-hop `propagation_log` writes are audit rows only the reaper ever touches — drop `deps.policy` + `writeCascadeRow`. |
| 2 | `transitionBet` | UI:POST /api/bets/:id/commit,/ship,/kill; SCHED:lifecycle-propagation 30s | SIMPLIFY | CAS + capacity + emit is core; the revisionLog parse/append machinery feeds a column nothing displays — delete it (kill #3). |
| 3 | `updateBetField` | UI:PATCH /api/bets/:id; AGENT:edit_bet | MERGE | Same guarded-field-set mechanic exists a second time inline in `bets.ts` (`patchAtRisk` + description helper) — fold into ONE route-side patch path; delete the revision log and the phantom `item_created` emit (kills #3, #5). |
| 4 | `checkAndUnblockDependents` | EVENT:task_state_changed (app.ts:527) — permanent no-op | DELETE | `tasks.dependencies` has zero production writers since bet-decomposition died; the LIKE pre-filter matches nothing, forever. Kill function, subscriber wiring, column (kill #1). |
| 5 | `resolveSessionStartRequest` | UI:POST /api/sessions/ | MERGE | Strict subset of `resolveTaskRunRequest` (no attempt, no contextBundle); its task-existence check even duplicates the route's own 404 pre-read at `sessions-routes.ts:131`. One resolver, discriminated input (kill #6). |
| 6 | `getTaskRiskTierByTaskId` | BOOTSTRAP:service-bootstrap.ts:439 → review port — always returns null | DELETE | Reads `task_planning_signals`, which nothing writes in production; the sole consumer gate (`session-review-creator.ts:65`) has never passed. Kill function + table + port member (kill #2). |
| 7 | `resolveTaskRunRequest` | UI:POST /api/tasks/:id/transition,/handoff; AGENT:handoff_to; SCHED:30s tick; EVENT:task_state_changed/session_started | SIMPLIFY | Core emit-time bake; make all five deps required (exactly one fully-wired deps object exists), delete every optional-degrade branch, throw plain `Error`, absorb session-start (kill #6). |
| 8 | `transitionTask` | UI:POST /api/tasks/:id/transition,/kill(cascade); AGENT:handoff_to; SCHED:30s; EVENT:session_ended et al. | SIMPLIFY | CAS + dispatch + emit is core; drop the auditTrail append (kill #3) and replace the inline dispatch-attempt insert (lines 131-146) with `taskDispatchAttemptStore.insertAttempt` — it is a line-for-line duplicate in the same file. |
| 9 | `get` (artifact+taskTitle overload, :256) | UI:GET /api/artifacts/:id | KEEP | Core door: artifact detail with its producing task's title; single join, single caller shape. |
| 10 | `get` (generic overload, :263) | UI:GET /api/tasks/:id, /api/bets/:id, + ~30 sites across routes/bindings | KEEP | The get-by-id read primitive for all four owned entities — minimal honest shape. |
| 11 | `get` (impl, :268) | same as rows 9-10 | KEEP | Four `select ... where id` arms and one join; nothing to cut. |
| 12 | `list` (count overload, :304) | UI:GET /api/teams (teams-routes.ts:137,142) | SIMPLIFY | Only bet-count is ever called; the task-count and item-count arms are dead — restrict count to bets, delete the other two arms. |
| 13 | `list` (artifact taskTitle overload, :310) | UI:GET /api/artifacts | KEEP | The artifacts page: cursor-paginated join, live door, single mechanic. |
| 14 | `list` (artifact taskSummary overload, :316) | UI:GET /api/bets/:id/artifact-thread-summary | MERGE | A second projection of the same `artifacts ⋈ tasks` join — fold into the taskTitle include and let the one caller (bets.ts:1039) project its four fields. `ArtifactTaskSummaryRow` dies with it. |
| 15 | `list` (generic overload, :322) | UI: /api/tasks, /api/bets, /api/search, /api/threads, conversations, teams; SCHED:digest sweep | SIMPLIFY | Live for real key combos; prune `WorkFilter` to keys with doors (drop `dependencyId`, dead count semantics). |
| 16 | `list` (impl, :327) | same as rows 12-15 | SIMPLIFY | Delete confirmed-dead branches: item `ids`, artifact `ids`, artifact plain-`taskIds`, bare item, bare artifact, `dependencyId`, task/item count (kill #7). `marker`/`bodyMarker`/`queued` stay — live LIKE-dedup doors (conversations.ts:114, knowledge.ts:306, routine bindings:71,95, digest sweep) — but each is a find-one disguised as a list; flag for the routine track. |
| 17 | `create` | UI:POST /api/bets, /api/tasks, /api/artifacts, /api/conversations/items; AGENT:create_item; SCHED:retro routines | KEEP | The insert primitive; all four entities reached through real doors. |
| 18 | `update` (AppendNoteOp overload, :698) | AGENT:append-note tool (tool-definitions.ts:1482) via PATCH /api/tasks/:id/notes | KEEP | Atomic SQL-CASE note append with no pre-read — a genuinely distinct mechanic with an agent door. |
| 19 | `update` (generic overload, :711) | UI:PATCH /api/bets/:id, /api/tasks/:id, conversations items; EVENT:session_ended reactions | KEEP | The set-by-id write primitive for three entities. |
| 20 | `update` (impl, :717) | same as rows 18-19 | KEEP | Plain per-entity set; the audit-blob patches vanish caller-side with kill #3, impl unchanged. |
| 21 | `transition` | UI:PATCH /api/artifacts/:id/preview; via rows 2/8; SCHED via DI (`transitionBetStatus`/`transitionTaskState` bindings) | SIMPLIFY | Single-row CAS is core; every caller passes `id` and reads only `applied` — delete the id-less bulk-sweep path, the `affected` field, and the never-used `isNull` guards for bet.status/task.state (keep artifact.previewJson isNull and task.updatedAt equals — both have doors). |
| — | `SessionStartSourceUnavailableError` | thrown UI:POST /api/sessions/ — caught nowhere | DELETE | Zero catch sites in the repo; the route already 404s on the same condition before calling the resolver. Throw `Error`. |
| — | `TaskRunSourceUnavailableError` | thrown via rows 7/8 — caught nowhere | DELETE | Zero catch sites; the class discriminates nothing. Throw `Error`. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ArtifactRow` | KEEP | Row type of the artifact primitive; tables are private so the alias is load-bearing. Fold types-only `artifact-store.ts` into `work-service.ts` — the file has zero functions left. |
| `ArtifactWithTaskTitle` | KEEP | The artifacts-page row shape (rows 9/13). |
| `ArtifactTaskSummaryRow` | DELETE | Dies with row 14's merge — its one consumer projects from `ArtifactWithTaskTitle`. |
| `BetKillCascadeDeps` | SIMPLIFY | Drop the `policy` member (kill #4); shrinks to `TaskStateMachineDeps` + `runOrchestration`. |
| `RevisionLogEntry` | DELETE | The revision-log feature dies (kill #3); its only external "consumer" (lifecycle-propagation) already declares a local mirror instead of importing — the export was dead even before the kill. |
| `WorkDeps` | DELETE | Zero constructors, zero importers anywhere (kill #8). `UserStoreReader`/`WorkUserRow` inside `ports.ts` die with it. |
| `SessionStartResolverDeps` | MERGE | Into `TaskRunResolverDeps` with the resolver merge (kill #6). |
| `BakedSessionStartRequest` | MERGE | Strict subset of `BakedTaskRunRequest`; one baked-request type. |
| `StateTransitionAuditEntry` | DELETE | auditTrail dies (kill #3). |
| `HandoffAuditEntry` | DELETE | auditTrail dies; policy's writer appends to a blob nobody reads — kill its append too. |
| `TaskAuditEntry` | DELETE | Union of the two above. `task-audit.ts` deleted whole. |
| `TaskRunResolverDeps` | SIMPLIFY | All five members required — the "not yet wired" call site does not exist; one fully-wired binding serves every emit site. |
| `BakedTaskRunRequest` | KEEP | The real seam contract: the intent payload the drain dispatches with zero domain reads. Door: the whole task_run/session_start admission path. |
| `TaskStateMachineDeps` | KEEP | The two genuinely injected edges (`workIntents` — ruled-permanent same-tx port; `taskRunResolver`) that `transitionTask`/`cascadeBetKill` need. |
| `Bet` | KEEP | Row alias; tables private. |
| `Task` | KEEP | Row alias; tables private. |
| `Item` | KEEP | Row alias; tables private. |
| `WorkEntity` | KEEP | The discriminant of the five primitives. |
| `WorkFilter` | SIMPLIFY | Prune to keys with doors: drop `dependencyId` (kill #1), restrict `count` to bets, and delete the key→old-function legend comment — a filter bag that needs a translation table is documenting its own wrong altitude. |
| `AppendNoteOp` | KEEP | The one real patch operator (row 18). |
| `TransitionGuard` | SIMPLIFY | Narrow to the four guard shapes with callers: bet.status equals, task.state equals, task.updatedAt equals, artifact.previewJson isNull. |
| `TransitionSpec` | SIMPLIFY | Make `id` required — the id-less sweep form is dead (row 21). |

## Const / enum

| Declaration | Verdict | Reason |
|---|---|---|
| `taskDispatchAttemptStore` | SIMPLIFY | Core ledger — all five members have doors (`insertAttempt` AGENT:handoff_to via policy-bindings:83; `get` internal to row 7; `updateIfActive` EVENT:session_ended; `markFailed` EVENT:agent_run_admission_failed; `reapTerminal` SCHED:retention reaper). Cut the write-only ceremony: `ordinal` (the count-then-insert exists solely to compute a number nothing reads), `occasion`, and `predecessorSessionId` are columns with zero readers; `reapTerminal`'s `batchSize` param is a lie — the DELETE has no LIMIT, it deletes everything and then reports `min(count, batchSize)`. Drop the param or actually batch. Also becomes the single insert path once row 8's inline duplicate merges in. |

## Holes this leaves

- **No bet/task change history.** revisionLog/auditTrail are gone. Today nobody can see them anyway —
  no UI, no API consumer renders them. If history is ever wanted, build a read surface first, then a writer.
- **Session reviews for risky tasks stay uncreated** — but they already are: the riskTier gate has
  never passed in production. Deleting makes the truth visible instead of latent. The founder should
  decide whether the auto-review-on-risky-task concept is worth a real writer, as its own story.
- **Task dependencies stop existing as a concept.** Nothing can express "task B waits on task A"
  anymore. Nothing could trigger it before either — the writer died with bet-decomposition.
- **No propagation-log trace of bet-kill cascades.** The kill still works and returns
  `tasksKilled`/`sessionsStopped` to the route; only the forensic rows nobody queried disappear.
- **Coarser errors from the resolvers.** Plain `Error` instead of named classes — acceptable because
  nothing ever discriminated on the names.
- **One projection query replaced by caller-side mapping** (artifact-thread-summary) — trivially more
  bytes over the wire per bet, bounded by the existing task fan-out guard.
