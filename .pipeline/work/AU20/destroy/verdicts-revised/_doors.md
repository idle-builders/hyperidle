# _doors — destroyer verdict, REVISED after founder rulings

Scope unchanged: 180 HTTP routes + 8 scheduler ticks + 6 worker-protocol messages = **194 doors**
(216 from `npx tsx tools/trace/trace-doors.ts` − 22 agent TOOLs). Enumeration re-run 2026-08-17 and
diffed against the first wave: identical.

Verdict vocabulary: DELETE, PLUGIN (delete from core, re-provide as a plugin), FINISH (feature is
completed, not removed — the row names the missing work), MERGE, SIMPLIFY, KEEP.

## What changed after the rulings

**18 doors changed verdict.** Every mover, with the ruling that moved it:

| # | Door | Old | New | Moved by |
|---|---|---|---|---|
| 43 | POST /api/reviews/proposed-calls | DELETE | KEEP | A1 = FINISH. Capture half of the approval loop; live at the agent seam, functional once #88 is wired. |
| 44 | POST /api/reviews/proposed-calls/consume | DELETE | KEEP | A1. Grant consumption at tool dispatch — finds grants once #88 mints them. |
| 45 | POST /api/reviews/proposed-calls/:id/outcome | DELETE | KEEP | A1. Execution outcome record for the granted call. |
| 88 | POST /api/threads/:threadId/messages/:messageId/verdict | DELETE | FINISH | A1. The unwired grant-composer. The missing work is ONE caller — see "A1 wiring" below. |
| 130 | GET /api/notifications/config | DELETE | FINISH | Ruling 1. Shared backend must reach a human not looking at the app; SMTP/ntfy config is that door. Needs a settings surface. |
| 131 | PATCH /api/notifications/config | DELETE | FINISH | Ruling 1. Same — the write half. First-wave kill leaned on the voided popover-only premise. |
| 132 | POST /api/notifications/test | DELETE | FINISH | Ruling 1. Test-send is part of configuring a channel; ships with the config surface. |
| 171 | POST /api/connections/:id/validate | DELETE | FINISH | A5 = FINISH. Connections are the credential path for authenticated mounts (AN1 resolver → AN2 sandbox injection); validate is the proof door. Wire SettingsConnections to it. |
| 32 | POST /api/bets/:id/retro/draft | KEEP | PLUGIN | Ruling 3. Retros are named ceremony. Moves out with the `bet_retro` skill + `builtin:post-bet-retro` routine. |
| 33 | POST /api/bets/:id/retro | KEEP | PLUGIN | Ruling 3. Same — retro save. |
| 58 | POST /api/knowledge/:id/merge | DELETE | PLUGIN | Ruling 3. Librarian ceremony → plugin, not plain delete. |
| 59 | POST /api/knowledge/:id/split | DELETE | PLUGIN | Ruling 3. Same. |
| 61 | POST /api/knowledge/:id/flag | DELETE | PLUGIN | Ruling 3. Flag-for-review ritual. |
| 64 | POST /api/knowledge/:id/promote | KEEP | PLUGIN | Ruling 3. Facilitator practice-promotion — driven by the `builtin:knowledge-promotion` ceremony routine. |
| 65 | PATCH /api/knowledge/:id/attention-score | KEEP | PLUGIN | Ruling 3. Attention scoring exists for the facilitator practice loop. |
| 66 | POST /api/knowledge/:id/recompute-attention | KEEP | PLUGIN | Ruling 3. Same. |
| 105 | POST /api/org/team-routines | KEEP | PLUGIN | Ruling 3. Its ONLY job is seeding the four builtin ceremony routines (post-bet-retro, portfolio-retro, knowledge-decay, knowledge-promotion — `routine-scheduler.ts:72-76`). A ceremony plugin provisions its own routines through POST /api/routines/. |
| 186 | TICK propagation retry 30s | DELETE | KEEP | Ruling 2. Not bookkeeping: `retryFailedPropagations` retries the real task→bet transition (which re-emits `bet_state_changed`) and emits `propagation_failed` + a user notification on exhaustion (`lifecycle-propagation.ts:615-655`). Killing it silently drops emissions plugins may hang off. First wave's "derived on read" claim was also wrong on its own terms — only bet→team is derived; task→bet is a real DB transition healed only here. |

**Reason-only rewrites (verdict unchanged):**
- #3, #7, #8 (`/api/auth/claim`, `/invite`, `/logout`) — still DELETE, but because **OIDC replaces
  them** (Ruling 1), not because the product is single-user. The single-user argument is retracted.
- #188 retention reaper — still SIMPLIFY, but it now **keeps** the propagation_log sweep (the log is
  live again per #186) and loses only the login_sessions/invite_codes sweeps.
- Kill-8 (user inboxes), kill-4 (status/ops), kill-13 singles — re-reached under the shared-backend
  premise and **re-confirmed DELETE on duplicate-door / zero-caller grounds alone**; no verdict below
  rests on a single-user argument anymore.

**Rulings with no door movement:**
- **Ruling 2 beyond #186:** no other door in this file was killed on subscriber-count. The five
  never-emitted event types are not doors; their KEEP lands in the event/service verdict files.
- **A6 (task dependency tree):** no existing door serves it. #39/#40 stay DELETE — the rebuilt
  dependency writer is in-process and event-driven (`dependency_met` is KEEP per Ruling 2); if the
  rebuild needs a door it is a new door, not these dead ones. See holes.
- **A7 (shared backend via OIDC):** no existing door moves. The OIDC identity doors do not exist yet
  and are scheduled work; `/api/auth/me`, `ws-token`, `worker-token`, `/api/health/auth` stay KEEP
  and become OIDC-backed.
- **A2 (auto review after risky work):** DELETE confirmed — no door in this file belongs to it.
- **A4 (live session surface):** the watching doors already exist and were already KEEP (#141 session
  list, #143 activity feed). The explicit-start family is about *starting* sessions over HTTP, not
  watching them — it stays dead.

### A1 wiring — precisely what must be built

The approve→act loop is four live routes and one missing fetch:

1. `ReviewPage.tsx` `handleSubmitVerdict` (`layers/core-ui/src/pages/review/ReviewPage.tsx:173-191`)
   currently calls only `postVerdictHostMessage` (`layers/core-ui/src/services/host-threads.ts:132`),
   which POSTs a verdict *message* to `/api/threads/:threadId/messages` — that path deliberately does
   NOT compose a grant (`layers/core-api/src/routes/threads.ts:1547-1561`, "handled by proposed-call
   workflow (Task 8) … `void decision`").
2. **The fix:** after the verdict message posts OK, add one call —
   `POST /api/threads/${threadId}/messages/${reviewMessageId}/verdict` with body
   `{ decision }` (`decision ∈ approve | request-changes | reject`, optional `rationale`).
   The route (`threads.ts:1607`) looks up the Proposed Call by `reviewMessageId`, and on approve
   transitions it captured→granted with tailored scope (taskScope/agentScope/approvedToolId/
   approvedArgs/identityHash), bakes and enqueues the reengagement intent, and emits
   `proposed_call_granted`; on non-approve it holds the PC. It appends no message, so calling both is
   correct and non-duplicating.
3. Nothing else changes: capture (#43) already fires from tool dispatch, consume (#44) finds the
   grant at the agent's next attempt, outcome (#45) records execution. The
   `CoreApiPort.review.*` + `CaptureProposedCall*`/`ConsumeTailoredGrant*` types revert to KEEP.

## Should this surface exist?

Yes — the door surface is where HyperIdle IS a product, and under the corrected premise it is a
**shared backend for a team and an organisation of teams**: conversations between multiple humans and
agents, bets, shared knowledge, an event stream plugins extend. After revision: **37 of 180 HTTP
routes are dead weight (21%)**, 9 more leave core for the ceremony plugin, 5 are half-built features
the founder has ruled to finish, and 5 are duplicate doors to merge.

## If written today, from scratch (shared backend, OIDC, plugin event stream)

The honest door surface: the ~112 UI-called routes behind the real pages; the ~30 seam routes backing
agent tools and the core↔orchestration split; the 2 MCP doors + worker WS + 6 worker messages; 7 of
the 8 timers. Identity arrives from an **OIDC provider** — no invite minting, no home-grown login
sessions, but `me`/token doors stay and team scoping stays. Outbound notification channels (SMTP/
ntfy) are core, because a shared deployment must reach humans who are not in the app. The AL7
approval loop is wired shut. Knowledge-management ceremony (retros, promotion, attention, merge/
split/flag, builtin ritual routines) is **not in core at all** — it is the flagship plugin, hanging
off the event stream. Still absent from the honest shape: explicit HTTP session starts, status/ops
dashboards, legacy conversations reads, user inboxes, manual task mutation, and every second door.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 37 (all routes) |
| PLUGIN | 9 (all routes) |
| FINISH | 5 (all routes) |
| MERGE | 5 (4 routes + 1 tick) |
| SIMPLIFY | 2 (1 route + 1 tick) |
| KEEP | 136 |

Surface: **194 doors → 148 in core** (37 DELETE + 9 PLUGIN out; 24% leaves core), plus 4 route-merges
folding to their targets. HTTP alone: 180 → 134 core routes.
First wave for diff: DELETE 49 / MERGE 5 / SIMPLIFY 2 / KEEP 138 — **18 rows moved**.

## Feature kill list (revised)

### 1. Explicit session start over HTTP — 7 doors, DELETE (unchanged)
`POST /api/sessions/`, `GET /api/sessions/starts/:startId`, `POST /api/agent-orchestration/intents/explicit-start`,
`GET .../requests/explicit-start`, `GET .../requests/explicit-start/:startId`, `POST .../runs/explicit-start/fail`,
`POST .../runs/bare`. Only reachable from itself; nothing in production dials `POST /api/sessions`; the
202 `pollUrl` has zero consumers. Real sessions start through the intent queue. A no-caller argument —
valid in a shared world. A4's live session surface *watches* via #141/#143 (KEEP); it does not start
sessions here.

### 2. AL7 proposed-call approval loop — REVERSED: 3 KEEP + 1 FINISH (A1)
`POST /api/reviews/proposed-calls` + `/consume` + `/:id/outcome` KEEP; the verdict route FINISH.
The founder wants the loop wired: one fetch in `handleSubmitVerdict` closes it (see "A1 wiring").
The first wave's evidence stands — the grant door has no caller — but the conclusion inverts: missing
emission-side wiring is work to schedule, not proof of no value.

### 3. Shared-mode auth: invites + login sessions — 3 doors, DELETE (reason corrected)
`POST /api/auth/claim`, `POST /api/auth/invite`, `POST /api/auth/logout`. They die because **OIDC
replaces them** (Ruling 1): multi-user access does not arrive by invitation, and login-session
machinery belongs to the provider. Zero callers today remains true. What a shared backend still
needs — identity of the acting human (`/api/auth/me`), WS/worker tokens, team scoping — all KEEP.
New OIDC doors are scheduled work (A7 FINISH), not rows in this file.

### 4. Ops/status observability — 4 doors, DELETE (re-confirmed under shared premise)
`GET /api/status/`, `GET /api/status/health`, `GET /api/status/digest`, `GET /api/workers/`.
Re-reached for a shared deployment with an operator: still zero callers anywhere, and liveness
already has a live door (`/api/health`, desktop-polled). If a shared deployment someday needs an ops
page, it is a new consumer decision — these four have none.

### 5. Outbound notification channels — SPLIT: 3 FINISH + 4 DELETE (Ruling 1)
**FINISH:** `GET+PATCH /api/notifications/config`, `POST /test`. A shared backend must reach a human
who is not currently looking at the app — SMTP/ntfy channels are that mechanism, and config is their
only door. The first-wave kill leaned on the voided popover-premise. Missing work: a settings surface
that dials them — `SettingsNotifications.tsx` handles only per-type mutes today, and its own AF8 lore
comment refers to a "Notifications config panel" that does not exist.
**DELETE:** `GET /api/notifications/` (root list — UI reads `/inbox`), `GET /queue` (introspection),
`POST /flush` (drain tick does this), `POST /digest` (manual digest-send; delivery mode belongs to
config + scheduler, the manual trigger has no consumer). In-app inbox/seen/read/mute all KEEP.

### 6. Knowledge-management ceremony — 9 doors, PLUGIN (Ruling 3)
The boundary applied: knowledge CRUD, search, scope, archive, triage, and write-time conflict
surfacing are the **machinery of shared knowledge** — KEEP. Ritual *about* the knowledge leaves core:
- `POST /api/knowledge/:id/merge`, `/split`, `/flag` — librarian ceremony (also zero callers).
- `POST /api/knowledge/:id/promote`, `PATCH .../attention-score`, `POST .../recompute-attention` —
  the facilitator practice loop, exercised by the `builtin:knowledge-promotion` / `knowledge-decay`
  ceremony routines and the `promote_knowledge`/`score_attention` tools (which move with them —
  agent-tool rows are out of this file's scope).
- `POST /api/bets/:id/retro/draft`, `POST /api/bets/:id/retro` — retros, named in the ruling. The
  WorkBet retro pane, `bet_retro`/`portfolio_retro` skills, and `builtin:post-bet-retro` /
  `builtin:portfolio-retro` routines ship in the plugin.
- `POST /api/org/team-routines` — exists solely to seed the four builtin ceremony routines at team
  creation (`routine-scheduler.ts:125-172`); the plugin provisions its routines via `POST
  /api/routines/` like everything else.
Kept in core from the first-wave kill-6 list: `GET /api/team-members/` — that one is not ceremony,
just a dead raw dump: plain DELETE. **No work package exists for this plugin yet — one needs writing
(per the ruling).**

### 7. Legacy conversations read API — 2 doors, DELETE (unchanged)
`GET /api/conversations/`, `GET /api/conversations/:threadId`. UI reads `/api/threads*`; only
remaining reference is a rollback doc. `/items*` seam sub-routes stay.

### 8. User inbox messaging — 2 doors, DELETE (re-confirmed under shared premise)
`GET+POST /api/users/:id/inbox`. In a multi-human deployment, human↔human messaging is threads:
`POST /api/threads/direct` + the thread surface. This is a second inbox with zero callers —
duplicate-door grounds, not single-user grounds.

### 9. Manual task mutation API — 2 doors, DELETE (A6 noted)
`PATCH /api/tasks/:id`, `POST /api/tasks/:id/transition`. Zero callers; task state moves via events/
policy in-process and via the agent seam. A6's dependency-tree rebuild (FINISH) is a real in-process
writer reacting to task completion — it does not resurrect these HTTP doors; if it needs a door it is
a new, designed one.

### 10. Bet lifecycle leftovers — 3 doors, DELETE (unchanged)
`GET /api/bets/canvas` (retired view), `POST /api/bets/:id/ship` (event-propagated), `POST
/api/bets/:id/outcome` (superseded — WorkBet.tsx:584; the retro that superseded it moves to the
plugin, but that does not revive this dead door).

### 11. Second doors — 4 route MERGEs (unchanged)
- `POST /api/org/teams` → `POST /api/teams/` — one create door.
- `GET /api/org/teams/:teamId` → `GET /api/teams/:teamId` — one read door.
- `POST /api/threads/scaffold` → `POST /api/threads/` — one create door.
- `GET /api/knowledge/search` → `GET /api/search/` with a scope param — one search door. (Knowledge
  *search* is machinery, not ceremony — agents and the future plugin both need it.)

### 12. Timers — REVISED
- **KEEP** the 30s propagation retry (`lifecycle-propagation.ts:806`) — reversed by Ruling 2 and by
  its own mechanics: it heals real task→bet transitions and re-emits `bet_state_changed` /
  emits `propagation_failed` — the event stream's reliability path.
- **MERGE** the agent-layer reap timer (`start-runtime.ts:331`) into the adjacent 1s wake drain —
  same loop, one fewer timer. Unchanged.
- **SIMPLIFY** the retention reaper (`service-bootstrap.ts:525`) — loses only the login_sessions/
  invite_codes sweeps (dead with OIDC); keeps notification_queue + knowledge_access_log +
  task_dispatch_attempts + propagation_log (live again).

### 13. Singles — DELETE (all re-confirmed, none moved except #171)
`POST /api/teams/:teamId/agents` (third add-agent way), `PATCH /api/artifacts/:id/preview` (create
carries preview), `POST /api/routines/:id/retire` (twin of DELETE), `GET+PATCH /api/settings/`
(unfetched M2 aggregate), `POST /api/harnesses/:type/disabled` (no UI toggle), `PATCH
/api/sessions/:id` (writes happen via worker protocol), `GET /api/agent-orchestration/sessions` +
`GET .../sessions/:sessionId/activity` (seam methods with zero consumers; #141/#143 serve the same
data in-layer — and are the substrate for A4's session page).
**Moved out of this list:** `POST /api/connections/:id/validate` → FINISH (A5): connections are the
credential mechanism for authenticated filesystem mounts (`ServiceConnectionResolver` → AN2 sandbox
injection is the only plaintext path); when the resolvers become real, validate is how a human proves
a mount will authenticate. Work: wire a validate action in `SettingsConnections`.

## Full door audit

Reach tags: `UI:` browser client. `AGENT-SEAM:` reached by agent tools via `buildCoreApiPort`.
`CORE-SEAM:` reached by core-api via `AgentOrchestrationPort`. `WORKER:` remote-worker client /
harness. `DEAD:` zero production callers (rg-confirmed, first wave; re-checked where a ruling touched
the row).

### HTTP routes (order of trace-doors)

| # | Door | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | GET /api/health | desktop boot + rate-limit floor | KEEP | Liveness probe the desktop app actually polls. |
| 2 | POST /api/users/ | UI:SetupFlow | KEEP | Human creation — first-run and shared-backend joins alike. |
| 3 | POST /api/auth/claim | DEAD | DELETE | Replaced by OIDC (Ruling 1) — invites are not how multi-user access arrives. |
| 4 | GET /api/auth/me | UI:useCurrentUser | KEEP | Identity of the acting human — becomes OIDC-backed (A7). |
| 5 | POST /api/auth/ws-token | UI:ws-client | KEEP | WS auth for live updates. |
| 6 | POST /api/auth/worker-token | WORKER:remote-worker-client | KEEP | Worker WS auth. |
| 7 | POST /api/auth/invite | DEAD | DELETE | Replaced by OIDC (Ruling 1); zero callers besides. |
| 8 | POST /api/auth/logout | DEAD | DELETE | Home-grown login sessions die with OIDC (Ruling 1). |
| 9 | GET /api/health/auth | desktop credential-validator | KEEP | Desktop validates its shared-backend credential with it. |
| 10 | GET /api/agents/:id/profile | UI:useAgentProfile | KEEP | Agent profile pane. |
| 11 | GET /api/agents/templates/:role | UI:AgentEditor, AgentAddDialog | KEEP | Prompt-template read for agent creation. |
| 12 | GET /api/agents/ | UI:SettingsAgents, useTeamAgents | KEEP | Agent roster. |
| 13 | POST /api/agents/ | UI:AgentAddDialog, SettingsAgents | KEEP | Create agent — core act. |
| 14 | PATCH /api/agents/:id | UI:AgentEditor | KEEP | Edit agent. |
| 15 | DELETE /api/agents/:id | UI:SettingsAgents | KEEP | Remove agent. |
| 16 | GET /api/model-gateway/ | UI:SettingsModels, SetupFlow | KEEP | Model config read. |
| 17 | PATCH /api/model-gateway/ | UI:SettingsModels, SetupFlow | KEEP | Model config write. |
| 18 | GET /api/teams/ | UI:useTeams, SetupFlow | KEEP | Team list — team scoping is load-bearing on a shared backend. |
| 19 | POST /api/teams/ | UI:SetupFlow, WorkOverview | KEEP | Team create — merge target for #102. |
| 20 | POST /api/teams/:teamId/agents | DEAD | DELETE | Third way to add an agent; zero callers (kill 13). |
| 21 | PATCH /api/teams/:teamId | UI:useTeam + AGENT-SEAM:updateTeam | KEEP | Team edit, both actors. |
| 22 | GET /api/teams/:teamId | UI:useTeam | KEEP | Team read — merge target for #99. |
| 23 | GET /api/bets/ | UI:WorkBetCreate, KnowledgeDetail | KEEP | Bet list. |
| 24 | GET /api/bets/canvas | DEAD | DELETE | Canvas view retired; zero callers (kill 10). |
| 25 | GET /api/bets/:id | UI:useBet + AGENT-SEAM:getBetById | KEEP | Bet detail. |
| 26 | POST /api/bets/ | UI:WorkBetCreate + AGENT-SEAM:create_bet | KEEP | Bet create, both actors. |
| 27 | PATCH /api/bets/:id | UI:WorkBet + AGENT-SEAM:edit_bet | KEEP | Bet field edit, both actors. |
| 28 | POST /api/bets/:id/commit | UI:WorkBet:545 | KEEP | Commit a bet — the time-box act. |
| 29 | POST /api/bets/:id/ship | DEAD | DELETE | Completion is event-propagated; no caller (kill 10). |
| 30 | POST /api/bets/:id/kill | UI:WorkBet | KEEP | Kill a bet + cascade — core act. |
| 31 | POST /api/bets/:id/outcome | DEAD | DELETE | Superseded (WorkBet.tsx:584); dead regardless of where retro lives (kill 10). |
| 32 | POST /api/bets/:id/retro/draft | UI:WorkBet:616 | PLUGIN | Retro ceremony — Ruling 3. Moves out with bet_retro skill + builtin routine (kill 6). |
| 33 | POST /api/bets/:id/retro | UI:WorkBet:593 | PLUGIN | Retro save — same (kill 6). |
| 34 | GET /api/bets/:id/artifact-thread-summary | UI:useArtifactThreadSummary | KEEP | Bet artifact panel. |
| 35 | POST /api/tasks/ | AGENT-SEAM:create_task | KEEP | Agents create tasks. |
| 36 | GET /api/tasks/ | UI:useAgentRunState (?ids= batch) | KEEP | Task batch read for run state. |
| 37 | GET /api/tasks/:id | AGENT-SEAM:getTaskById | KEEP | Seam read (log_task/handoff validation). |
| 38 | PATCH /api/tasks/:id/notes | AGENT-SEAM:log_task | KEEP | Agent task log. |
| 39 | PATCH /api/tasks/:id | DEAD | DELETE | No caller; A6's dependency writer is in-process, not this door (kill 9). |
| 40 | POST /api/tasks/:id/transition | DEAD | DELETE | No caller; transitions are event/policy-driven (kill 9). |
| 41 | POST /api/tasks/:id/handoff | AGENT-SEAM:handoff_to | KEEP | Handoff — core agent collaboration act. |
| 42 | GET /api/reviews/:reviewMessageId | UI:ReviewPage:44 | KEEP | Review page data — now load-bearing for the A1 loop. |
| 43 | POST /api/reviews/proposed-calls | AGENT-SEAM:tool dispatch (AL7) | KEEP | A1 = FINISH: capture half of the approval loop; live and functional once #88 wired. |
| 44 | POST /api/reviews/proposed-calls/consume | AGENT-SEAM:tool dispatch (AL7) | KEEP | A1: consumes the tailored grant at dispatch. |
| 45 | POST /api/reviews/proposed-calls/:id/outcome | AGENT-SEAM:tool dispatch (AL7) | KEEP | A1: records execution outcome of the granted call. |
| 46 | GET /api/artifacts/ | UI:useArtifacts | KEEP | Artifact gallery. |
| 47 | GET /api/artifacts/:id | UI:useArtifacts | KEEP | Artifact detail. |
| 48 | POST /api/artifacts/ | UI:useArtifacts + AGENT-SEAM:create_artifact | KEEP | Artifact create, both actors. |
| 49 | PATCH /api/artifacts/:id/preview | DEAD | DELETE | Create carries preview; patcher has no caller (kill 13). |
| 50 | POST /api/filesystems/:id/injections | UI:SettingsAgents | KEEP | Grant agent filesystem access — A5 substrate. |
| 51 | GET /api/knowledge/search | AGENT-SEAM:query_practice | MERGE | Fold into GET /api/search with a scope param (kill 11). Search is machinery, not ceremony. |
| 52 | GET /api/knowledge/ | UI:KnowledgeList | KEEP | Knowledge list — machinery of shared knowledge. |
| 53 | GET /api/knowledge/triage-count | UI:AppShell | KEEP | Draft/needs_human badge — the human touchpoint of the knowledge machinery, inline with work, not a scheduled ritual. |
| 54 | GET /api/knowledge/:id | UI:KnowledgeDetail + AGENT-SEAM | KEEP | Knowledge detail, both actors. |
| 55 | POST /api/knowledge/ | UI:KnowledgeCreate + AGENT-SEAM:write_memory | KEEP | Knowledge create, both actors. |
| 56 | PATCH /api/knowledge/:id/scope | UI:ScopeChangeDialog | KEEP | Scope move. |
| 57 | PATCH /api/knowledge/:id | UI:useAutoSave + AGENT-SEAM:writeback | KEEP | Content edit w/ optimistic lock, both actors. |
| 58 | POST /api/knowledge/:id/merge | DEAD | PLUGIN | Librarian ceremony → plugin, per Ruling 3 (kill 6). |
| 59 | POST /api/knowledge/:id/split | DEAD | PLUGIN | Same (kill 6). |
| 60 | POST /api/knowledge/:id/archive | UI:KnowledgeDetail | KEEP | Archive is the UI's remove action. |
| 61 | POST /api/knowledge/:id/flag | DEAD | PLUGIN | Flag-for-review ritual → plugin (kill 6). |
| 62 | GET /api/knowledge/:id/conflicts | AGENT-SEAM:conflict workflow | KEEP | Write-time conflict surfacing is knowledge-fabric machinery, not ceremony. |
| 63 | POST /api/knowledge/:id/conflicts | AGENT-SEAM:create_conflict_review | KEEP | Same — inline conflict capture at write time. |
| 64 | POST /api/knowledge/:id/promote | AGENT-SEAM:promote_knowledge | PLUGIN | Practice-promotion ceremony, driven by builtin:knowledge-promotion routine (kill 6). |
| 65 | PATCH /api/knowledge/:id/attention-score | AGENT-SEAM:score_attention | PLUGIN | Attention scoring serves the facilitator practice loop (kill 6). |
| 66 | POST /api/knowledge/:id/recompute-attention | AGENT-SEAM:score_attention | PLUGIN | Same (kill 6). |
| 67 | GET /api/team-members/ | DEAD | DELETE | Raw team_members dump, zero callers. Not ceremony — just dead. |
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
| 81 | POST /api/threads/direct | AGENT-SEAM:send_message DM | KEEP | Find-or-create DM — human↔human and agent↔human alike on a shared backend. |
| 82 | GET /api/threads/inbox | AGENT-SEAM:read_inbox | KEEP | Agent inbox — core loop. |
| 83 | PATCH /api/threads/:id | UI + AGENT-SEAM:updateThread | KEEP | Thread update, both actors. |
| 84 | GET /api/threads/ | UI:useConversationsThreads + seam | KEEP | Thread list, both actors. |
| 85 | GET /api/threads/:id | UI:useThreadDetail + seam | KEEP | Thread detail, both actors. |
| 86 | POST /api/threads/ | UI:RecipientPicker, host-threads | KEEP | Thread create — merge target for #80. |
| 87 | POST /api/threads/:id/messages | UI:Conversations + AGENT-SEAM:reply/send | KEEP | THE message door — the product's center. |
| 88 | POST /api/threads/:threadId/messages/:messageId/verdict | none yet (grant composer) | FINISH | A1: wire ONE fetch from ReviewPage.handleSubmitVerdict after postVerdictHostMessage — see "A1 wiring". |
| 89 | GET /api/users/ | UI:SetupFlow + AGENT-SEAM:listUsers | KEEP | User list, both actors. |
| 90 | GET /api/users/:id | UI:SettingsProfile + AGENT-SEAM | KEEP | User read. |
| 91 | PATCH /api/users/:id | UI:SettingsProfile | KEEP | Profile edit. |
| 92 | GET /api/users/:id/inbox | DEAD | DELETE | Second inbox; threads are the messaging surface, multi-human included (kill 8). |
| 93 | POST /api/users/:id/inbox | DEAD | DELETE | Second send door; threads/direct is the real one (kill 8). |
| 94 | GET /api/users/:userId/assistant/ | UI:SettingsAgents | KEEP | Assistant config read. |
| 95 | PATCH /api/users/:userId/assistant/ | UI:SettingsAgents | KEEP | Assistant config write. |
| 96 | GET /api/org/ | UI:SettingsOrgChart | KEEP | Org chart read — organisation of teams is the ruled deployment shape. |
| 97 | PUT /api/org/edges | UI:SettingsOrgChart | KEEP | Org edge upsert. |
| 98 | DELETE /api/org/edges/:id | UI:SettingsOrgChart | KEEP | Org edge remove. |
| 99 | GET /api/org/teams/:teamId | UI:useAgentRunState + AGENT-SEAM:getTeamById | MERGE | Duplicate of GET /api/teams/:teamId — one team-read door (kill 11). |
| 100 | GET /api/org/teams/:teamId/membership | AGENT-SEAM:add_agent/create_team | KEEP | Membership read for team tools. |
| 101 | GET /api/org/team-members/:teamMembersId | AGENT-SEAM:tool bindings | KEEP | Member-group read. |
| 102 | POST /api/org/teams | AGENT-SEAM:create_team | MERGE | Duplicate of POST /api/teams/ — one team-create door (kill 11). |
| 103 | GET /api/org/review-recipients | AGENT-SEAM:create_item routing | KEEP | Review routing resolution. |
| 104 | POST /api/org/scaffolded-agents | AGENT-SEAM:create_team/add_agent | KEEP | Agent scaffolding persistence. |
| 105 | POST /api/org/team-routines | AGENT-SEAM:create_team | PLUGIN | Sole job is seeding the four builtin ceremony routines — Ruling 3 (kill 6). |
| 106 | POST /api/routines/ | UI:RoutineCreateDialog + AGENT-SEAM:create_routine | KEEP | Routine create — also how the ceremony plugin provisions its routines. |
| 107 | GET /api/routines/ | UI:RoutineCreateDialog | KEEP | Routine list. |
| 108 | DELETE /api/routines/:id | UI:RoutineDetailPane | KEEP | Routine delete — the UI's remove action. |
| 109 | GET /api/routines/:id | UI:useRoutine + AGENT-SEAM | KEEP | Routine detail. |
| 110 | PATCH /api/routines/:id | UI:RoutineDetailPane + AGENT-SEAM:update_routine | KEEP | Routine edit, both actors. |
| 111 | POST /api/routines/:id/retire | DEAD | DELETE | Soft-retire twin of DELETE; zero callers (kill 13). |
| 112 | POST /api/routines/:id/trigger | UI:RoutineDetailPane | KEEP | Manual run-now. |
| 113 | GET /api/recipients/ | UI:useRecipients | KEEP | Recipient picker data. |
| 114 | POST /api/sessions/ | DEAD | DELETE | Explicit-start door nobody dials (kill 1). |
| 115 | GET /api/status/health | DEAD | DELETE | Authenticated probe nobody probes; /api/health is the live liveness door (kill 4). |
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
| 130 | GET /api/notifications/config | none yet | FINISH | Ruling 1: SMTP/ntfy config read — needs the missing settings surface (kill 5). |
| 131 | PATCH /api/notifications/config | none yet | FINISH | Ruling 1: channel config write — how a shared deployment reaches absent humans (kill 5). |
| 132 | POST /api/notifications/test | none yet | FINISH | Ruling 1: test-send belongs to the config surface (kill 5). |
| 133 | GET /api/notifications/queue | DEAD | DELETE | Queue introspection, zero callers (kill 5). |
| 134 | POST /api/notifications/flush | DEAD | DELETE | Manual flush; drain tick does this (kill 5). |
| 135 | POST /api/notifications/digest | DEAD | DELETE | Manual digest-send trigger with no consumer; delivery mode lives in config (kill 5). |
| 136 | GET /api/notifications/inbox | UI:useNotifications:45 | KEEP | In-app inbox. |
| 137 | POST /api/notifications/seen | UI:useNotifications:64 | KEEP | Mark seen. |
| 138 | POST /api/notifications/:id/read | UI:useNotifications:73 | KEEP | Mark read. |
| 139 | GET /api/notifications/mute | UI:useNotificationMute | KEEP | Mute list. |
| 140 | PUT /api/notifications/mute/:key | UI:useNotificationMute | KEEP | Mute toggle. |
| 141 | GET /api/sessions/ (orch app) | UI:Conversations:125 | KEEP | Active-session lookup — substrate for A4's session page. |
| 142 | GET /api/sessions/starts/:startId | DEAD | DELETE | pollUrl no client follows (kill 1). |
| 143 | GET /api/sessions/:id/activity | UI:useSessionActivity:150 | KEEP | Live session activity feed — the watching half A4 builds on. |
| 144 | PATCH /api/sessions/:id | DEAD | DELETE | State/effectiveness writes happen via worker protocol; no dialer (kill 13). |
| 145 | GET /api/agent-orchestration/sessions | DEAD | DELETE | Seam method listSessionHistoryBySource has zero consumers (kill 13). |
| 146 | GET /api/agent-orchestration/sessions/:sessionId | CORE-SEAM:tasks.ts handoff | SIMPLIFY | Sole surviving consumer (handoff) reads 2 fields — shrink response to {id, agentId}. |
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
| 160 | POST /api/agent-orchestration/runs/explicit-start/fail | DEAD | DELETE | Explicit-start family (kill 1). |
| 161 | GET /api/agent-orchestration/run-config/:agentId | CORE-SEAM:agent-profile, assistant | KEEP | Run-config read. |
| 162 | POST /api/agent-orchestration/run-config/batch | CORE-SEAM:teams-routes, boot | KEEP | Roster config batch read. |
| 163 | PATCH /api/agent-orchestration/run-config/:agentId | CORE-SEAM:assistant, scaffolding writer | KEEP | Run-config write. |
| 164 | GET /api/agent-orchestration/team-run-config-defaults/:teamId | CORE-SEAM:teams-routes:543 | KEEP | Team defaults read. |
| 165 | PATCH /api/agent-orchestration/team-run-config-defaults/:teamId | CORE-SEAM:teams-routes:282 | KEEP | Team defaults write on create. |
| 166 | GET /api/agent-orchestration/filesystems/:id/team | CORE-SEAM:filesystems.ts | KEEP | Injection authz read — A5 substrate. |
| 167 | POST /api/agent-orchestration/filesystems/:id/injections/persist | CORE-SEAM:filesystems.ts | KEEP | Injection persistence — A5 substrate. |
| 168 | GET /api/connections/ | UI:SettingsConnections | KEEP | Connection list. |
| 169 | POST /api/connections/ | UI:SettingsConnections | KEEP | Connection create — the credential source for authenticated mounts (A5). |
| 170 | DELETE /api/connections/:id | UI:SettingsConnections | KEEP | Connection remove. |
| 171 | POST /api/connections/:id/validate | none yet | FINISH | A5: the proof door for an authenticated mount — wire a validate action in SettingsConnections when the resolvers become real. |
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

| # | Door | Reach | Verdict | Reason |
|---|---|---|---|---|
| 181 | TICK sandbox reaper (60min, runtime-reapers.ts:122) | n/a | KEEP | Reclaims dead sandbox dirs — real disk. |
| 182 | TICK 1s wake drain (start-runtime.ts:330) | n/a | KEEP | Dispatches all agent work; process-death recovery — the heartbeat of the product. |
| 183 | TICK agent-layer reap (start-runtime.ts:331) | n/a | MERGE | Second timer on the same loop; fold reapExpired into the wake drain cadence (kill 12). |
| 184 | TICK session-requests poll (service.ts:254) | n/a | KEEP | Lifecycle projection drain; recovery path. |
| 185 | TICK notification drain (install.ts:1651) | n/a | KEEP | Delivers the queue the UI inbox displays — and, post-FINISH, the SMTP/ntfy channels. |
| 186 | TICK propagation retry 30s (lifecycle-propagation.ts:806) | n/a | KEEP | REVERSED (Ruling 2): heals real task→bet transitions and re-emits their events; also emits propagation_failed + user notification on exhaustion. The event stream's reliability path. |
| 187 | TICK routine scheduler (routine-scheduler.ts:802) | n/a | KEEP | Routines primitive — cron IS the feature. Engine stays in core; the builtin ceremony *definitions* leave with the plugin (#105). |
| 188 | TICK retention reaper (service-bootstrap.ts:525) | n/a | SIMPLIFY | Loses only login_sessions/invite_codes sweeps (dead with OIDC); keeps notification_queue + knowledge_access_log + task_dispatch_attempts + propagation_log (live again per #186). |

### Worker-protocol messages

| # | Door | Reach | Verdict | Reason |
|---|---|---|---|---|
| 189 | WORKER register | remote-worker-client | KEEP | Worker joins the pool. |
| 190 | WORKER event | remote-worker-client | KEEP | Session activity streaming — also feeds A4's live session surface. |
| 191 | WORKER session_result | remote-worker-client | KEEP | Session completion — the run lifecycle depends on it. |
| 192 | WORKER error | remote-worker-client | KEEP | Session failure path. |
| 193 | WORKER pause | desktop main.ts:766 | KEEP | User pauses agent work from the desktop app. |
| 194 | WORKER resume | desktop main.ts:770 | KEEP | User resumes. |

## Types / DI ports (revised)

| Declaration | Verdict | Reason |
|---|---|---|
| `AgentOrchestrationPort.intents.createExplicitStart` + `requests.findExplicitStartBy*` + `runs.createBareRun` + `runs.failExplicitStart` | DELETE | Only callers are the dead explicit-start routes. |
| `AgentOrchestrationPort.sessions.listSessionHistoryBySource` / `getRecentActivity` | DELETE | Zero consumers. |
| `framework/http-middleware/src/http/explicit-start-projection.ts` (whole module) | DELETE | Projects a wire shape only the dead family renders. |
| `CoreApiPort.review.*` + `CaptureProposedCall*`/`ConsumeTailoredGrant*` types | KEEP | REVERSED — A1 = FINISH; the AL7 machinery is load-bearing once #88 is wired. |
| `SettingsResponse`/`SettingsNotifications` etc. in `framework/api-contract/src/settings.ts` | DELETE | Mirrors the unfetched GET/PATCH /api/settings aggregate. Distinct from the notification-channel config contract, which stays (FINISH #130-132). |

## Work the FINISH verdicts schedule

1. **A1 (approval loop):** one fetch in `ReviewPage.handleSubmitVerdict` to
   `POST /api/threads/:threadId/messages/:reviewMessageId/verdict` after the verdict message posts —
   full mechanics in "A1 wiring" above. Everything else is already live.
2. **Ruling 1 (channels):** a notification-channel config surface (the panel `SettingsNotifications`'
   own lore comment references but that was never built) dialing #130/#131, with #132 as its
   test-send action.
3. **A5 (authenticated mounts):** real `ServiceConnectionResolver` resolution into AN2 sandbox
   injection, plus a validate action in `SettingsConnections` dialing #171.
4. **A7 (OIDC):** new identity doors — none exist; not rows in this file.
5. **Ruling 3 plugin:** a work package for the knowledge-ceremony plugin — none exists yet; the 9
   PLUGIN rows above are its door inventory.

## Holes this leaves

1. **No manual "start a session on this task" API.** Unchanged; the intent door (#151) is the right
   substrate if a "run agent now" button ever ships.
2. **Until the A1 fetch lands, gated tool calls are still captured into a void.** FINISH removes the
   first wave's "delete the machinery" escape hatch — the hole now closes only by shipping the wiring.
3. **Invite/logout deletion leaves the shared backend without ANY multi-user access path until OIDC
   lands.** That is a deliberate sequencing hole: A7 is scheduled work, and the doors being deleted
   could not fill it anyway (no client implements them).
4. **The 9 PLUGIN doors leave core before the plugin exists.** Between the deletion and the plugin
   shipping, teams lose retros, knowledge promotion/decay/attention, and merge/split/flag. The ruling
   accepts this; the plugin work package prices it.
5. **Ceremony state left behind in core schema** — `attention_score`, promotion status, retro fields
   on bets, the builtin routine rows already seeded in existing deployments — is for the service/table
   destroyers to rule on; doors only stop serving it.
6. **Session effectiveness scores lose their write door** (#144) — nothing writes them today; the
   column is already inert.
7. **`tools/eval` scenario prose mentions `POST /api/sessions/start`** in a fictional error log —
   cosmetic, not a caller.
