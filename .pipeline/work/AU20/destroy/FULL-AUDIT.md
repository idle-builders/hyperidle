# AU20 (reopened) — full destroyer audit

One row per method, per door, per type. Every one carries a verdict. Nothing sampled.

Baseline at reopen (`ba0fb454d`): 19 services, 21 framework packages, 268 exported functions, 16 classes (38 member methods), 176 interface/type declarations (620 member signatures), 216 doors.

**15 of 41 packages were re-audited** after the founder rulings in `FOUNDER-RULINGS.md`; those sections carry a REVISED banner and supersede the first wave.

`PLUGIN` = leaves core and ships as a plugin. `FINISH` = work to schedule, not a survivor that needs nothing.

## Roll-up

| Verdict | Count | Share |
|---|---|---|
| DELETE | 423 | 25% |
| PLUGIN | 21 | 1% |
| FINISH | 22 | 1% |
| MERGE | 72 | 4% |
| SIMPLIFY | 327 | 19% |
| KEEP | 848 | 50% |
| **Total rows** | **1713** | |

Leaves core outright or folds away: **516** of 1713 (30%).

## Per package

| Package | Rows | DELETE | PLUGIN | FINISH | MERGE | SIMPLIFY | KEEP | Out of core |
|---|---|---|---|---|---|---|---|---|
| _doors ✎ | 199 | 41 | 9 | 5 | 5 | 2 | 137 | 28% |
| fw-db | 151 | 53 | 0 | 0 | 1 | 3 | 94 | 36% |
| fw-domain-model ✎ | 254 | 50 | 0 | 1 | 0 | 75 | 128 | 20% |
| knowledge ✎ | 65 | 24 | 7 | 0 | 2 | 14 | 18 | 51% |
| fw-design-system | 251 | 22 | 0 | 0 | 2 | 57 | 170 | 10% |
| fw-diagnostics | 26 | 20 | 0 | 0 | 1 | 2 | 3 | 81% |
| users ✎ | 30 | 18 | 0 | 1 | 2 | 4 | 5 | 67% |
| fw-filesystem-contract | 20 | 11 | 0 | 0 | 8 | 1 | 0 | 95% |
| review ✎ | 40 | 15 | 0 | 4 | 4 | 4 | 13 | 48% |
| harness-registry | 69 | 13 | 0 | 0 | 3 | 7 | 46 | 23% |
| org ✎ | 25 | 7 | 0 | 0 | 9 | 4 | 5 | 64% |
| settings | 20 | 15 | 0 | 0 | 1 | 2 | 2 | 80% |
| work ✎ | 46 | 9 | 0 | 1 | 5 | 14 | 17 | 30% |
| fw-api-contract | 98 | 13 | 0 | 0 | 0 | 13 | 72 | 13% |
| fw-harness-protocol | 21 | 7 | 0 | 0 | 4 | 3 | 7 | 52% |
| routine ✎ | 31 | 5 | 3 | 0 | 2 | 11 | 10 | 32% |
| session-requests | 35 | 10 | 0 | 0 | 0 | 9 | 16 | 29% |
| fw-factory-defaults ✎ | 11 | 5 | 2 | 0 | 2 | 1 | 1 | 82% |
| notifications ✎ | 27 | 9 | 0 | 2 | 0 | 14 | 2 | 33% |
| filesystems | 19 | 6 | 0 | 0 | 2 | 4 | 7 | 42% |
| fw-conversation-parts ✎ | 21 | 8 | 0 | 3 | 0 | 3 | 7 | 38% |
| fw-http-middleware ✎ | 22 | 7 | 0 | 0 | 1 | 4 | 10 | 36% |
| run-orchestration | 44 | 7 | 0 | 0 | 1 | 20 | 16 | 18% |
| fw-host-process | 23 | 6 | 0 | 0 | 1 | 14 | 2 | 30% |
| agent-run-config | 11 | 5 | 0 | 0 | 1 | 1 | 4 | 55% |
| fw-harness-capability ✎ | 15 | 4 | 0 | 3 | 2 | 4 | 2 | 40% |
| fw-tool-protocol | 6 | 6 | 0 | 0 | 0 | 0 | 0 | 100% |
| tool-handlers | 27 | 5 | 0 | 0 | 1 | 10 | 11 | 22% |
| conversation ✎ | 29 | 3 | 0 | 0 | 2 | 10 | 14 | 17% |
| fw-event-bus | 8 | 4 | 0 | 0 | 1 | 0 | 3 | 63% |
| fw-toon-codec | 5 | 3 | 0 | 0 | 1 | 0 | 1 | 80% |
| policy ✎ | 12 | 3 | 0 | 2 | 1 | 4 | 2 | 33% |
| connections | 11 | 1 | 0 | 0 | 2 | 5 | 3 | 27% |
| fw-block-derivation | 8 | 2 | 0 | 0 | 1 | 0 | 5 | 38% |
| fw-work-intent-port | 10 | 2 | 0 | 0 | 1 | 1 | 6 | 30% |
| filesystem-mounting | 5 | 1 | 0 | 0 | 1 | 3 | 0 | 40% |
| fw-presentation-format | 3 | 2 | 0 | 0 | 0 | 1 | 0 | 67% |
| credentials | 5 | 0 | 0 | 0 | 1 | 1 | 3 | 20% |
| fw-credential-access | 5 | 1 | 0 | 0 | 0 | 0 | 4 | 20% |
| fw-cron | 4 | 0 | 0 | 0 | 1 | 1 | 2 | 25% |
| fw-query-escaping | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0% |

✎ = revised after the founder rulings.


---


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/_doors.md` for comparison.

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


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/conversation.md` for comparison.

# conversation — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

Rows whose **verdict moved**:

| Row | Method | Old | New | Ruling | Why |
|---|---|---|---|---|---|
| 8 | `findOrCreateDirectThread` | SIMPLIFY (keep, drop `recipientKind`) | **MERGE** (into the AF14 `directKey` dedupe; `recipientKind` survives and gets wired) | Ruling 1 | The first wave judged `recipientKind` dead flexibility because "no production caller passes it" in a one-user world. Re-tracing on the shared-backend premise found the real defect: there are **two DM find-or-create mechanisms that cannot see each other's threads**. The UI door (`POST /api/threads`, threads.ts:1016–1027) dedupes by `directKey` and supports human↔human DMs today; the store's `findOrCreateDirectThread` scans `(hostKind, hostId)`, never sets `directKey`, and hard-defaults `hostKind:"agent"` — so an agent sending to a human (tool-definitions.ts:122, :197) creates a thread labeled `hostKind:"agent"`, `hostId:<userId>` that the UI's dedupe can never find. Same pair, opposite initiator → **two forked conversations**. In a multi-human deployment where agents DM humans and humans DM each other, this is a core-product correctness bug, not a param to delete. Fold the two mechanisms into one store function that computes `directKey` and takes the recipient's real kind. |

Rows/kills whose **verdict stands but whose first-wave reasoning was voided by Ruling 1 and had to be re-reached**:

| Row / kill | Verdict (unchanged) | Old reasoning (void) | New reasoning (shared backend) |
|---|---|---|---|
| Kill 1 — `GET /api/conversations/` + `/:threadId` | DELETE | "no client calls it" (single-user usage argument) | The kill gets **stronger** multi-human: the list route does zero participant filtering (`countThreads` + `listThreads({order:"created"})`, conversations.ts:82–93) — on a shared backend it returns **every human's DM threads to any authenticated principal**. Only the `/:threadId` detail route calls `authorizeRead`. The product's real thread list, `GET /api/threads?participant_id`, is participant-scoped and multi-human correct. The conversations list is a second, scope-bypassing way to do what the first way does safely. Dead AND a leak. |
| Kill 2 — `GET`/`POST /api/users/:id/inbox` | DELETE | "no client sends these requests" | Re-judged as product: a human's "what is waiting for me" is core in a team deployment — and these routes are a **half-built third inbox that would damage the product if used**. GET (users.ts:291) is a firehose of every message in your threads, including ones you sent — no unread state, no read markers, no sender exclusion. The real human inbox is `GET /api/notifications/inbox` (AU18 ownership, has read state). POST (users.ts:326) is a second send path that skips the entire message-append contract: no `thread_message_appended` emission (so no coherence trigger, no pin reaction, no WS push — Ruling 2: the fact happens, nothing announces it), no `lastActiveAt` bump (the thread never rises in the recipient's list), no idempotency triple, and it mislabels human recipients via the `recipientKind` default. The canonical pair `POST /api/threads/direct` + `POST /api/threads/:id/messages` does all of this correctly. Rebuild-don't-keep: DELETE both routes; the genuine gap they gesture at is named in Holes (DM notification emission). |
| Row 11 — `countThreads` | DELETE | dies with kill 1 | Unchanged mechanically, but now also: a global thread count is meaningless to any principal on a shared backend — there is no surface where one human should see the org-wide total. |
| Row 14 — `listInbox` participant-probe variant | SIMPLIFY | probe variant's only door is dead route | Same fact, corrected frame: the probe variant IS the half-built third inbox (kill 2). The surviving `excludeSenderId` variant is the agent `read_inbox` tool — live and multi-human correct (each agent excludes itself). Per-human inbox stays with notifications where read state lives. |
| First-wave hole "No human→human DM kind" | **RETRACTED** | "if human-to-human DMs ship, the parameter comes back" | Human↔human DMs are not a future feature — they exist now through `POST /api/threads` (`hostKind:"user"`, 2 participants, `directKey` dedupe) and are core product per Ruling 1. `recipientKind` is the right vocabulary with missing wiring (same shape as Ruling 2's missing emissions); it survives inside the row-8 MERGE. |

Ruling 2 check: this package's surface contains no event types; nothing here was killed on subscriber count. The soft-delete/redaction guard kill (kill 4) rests on "no production writer ever sets the column" — that is a payload-nothing-sets fact, which Ruling 2 explicitly does not protect. Stands.

Ruling 3 check: nothing in this package is knowledge-management ritual. No PLUGIN verdicts.

A4 check (live session surface): the conversation package's contribution to "dial into a session and watch" is `resolveAssistantTurnRequest` (the turn producer) and `registerSessionNotReturnedNotice` (the session-died-tell-the-human net). Both were already KEEP/SIMPLIFY in wave 1 and are now additionally **protected** — the resolver's baked-transcript machinery (`BakedTranscriptRow`, `BakedAssistantTurnRequest`) is the substrate the live-session producer will extend. Nothing in this verdict deletes anything A4 needs.

## Should this service exist?

**KEEP — this IS the product, and Ruling 1 makes it more so.** Conversation between several humans and their agents on one shared backend is the first clause of what HyperIdle is. `threads` + `messages` are the central tables; every agent tool that talks (`send_message`, `reply`, `read_inbox`, `submit_review`) and every chat surface lands here. The AU12 ownership seam (single owner of thread/message row writes) is what the AU-track governance stands on.

The function surface was already destroyed once (AU20 Am5: 29 → 14 store functions). The remaining rot, re-judged for a team deployment: one scope-bypassing dead door (the unscoped conversations list — now a leak, not just dead), one half-built third inbox (users inbox routes), one superseded route (coach), guards for a writer-less feature, a typed error nobody catches — and one genuine multi-human correctness bug the single-user lens hid: **the forked DM dedupe**.

## If written today, from scratch

For several humans and their agents talking on one shared backend, OIDC-identified, with an event stream plugins hang off:

- `insertThread` / `updateThread` / `insertMessage` — the irreducible writes
- `resolveMessageIfUnresolved` — the one conditional write (verdict CAS, absorbs `updateMessage`)
- `findThread` / `listThreads` / `findMessage` / `listMessages` — the filtered reads; every thread read participant-scoped at the door, because on a shared backend every list is somebody's privacy boundary
- **one** `findOrCreateDirectThread(db, senderId, recipientId, recipientKind, now)` — `directKey`-deduped, so the SAME thread resolves regardless of who initiates: human→human, human→agent, agent→human. Not two mechanisms.
- `listInbox({excludeSenderId, limit})` — the agent `read_inbox` tool; the *human* inbox lives with notifications, which owns read state
- `searchConversations` — global search across what the principal can see
- `resolveAssistantTurnRequest` — human message → assistant turn; also the producer seam for the A4 live-session surface
- plus two bootstrap reactions: pin-after-first-AI-reply (moved to Layer code) and session-not-returned notice

Not in the from-scratch shape: `countThreads`, `updateMessage`, the typed error class, the participant-probe inbox variant, the deleted/redacted read guards, a second DM-dedupe mechanism, an unscoped thread list.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| PLUGIN | 0 |
| FINISH | 0 |
| MERGE | 2 |
| SIMPLIFY | 4 |
| KEEP | 10 |

Surface: 18 callable units (17 functions + 1 class) → 15 functions, 0 classes. Same route-level kills as wave 1 (4 dead HTTP routes, 1 DI interface, 1 policy-port member, 7 filter/param fields) — with kill 1 upgraded from "dead" to "dead and a participant-scope bypass", and one new MERGE consolidating the two DM dedupe mechanisms into one.

## Feature-level kills

1. **`GET /api/conversations/` + `GET /api/conversations/:threadId` (routes/conversations.ts) — dead door, and on a shared backend a scope bypass.** Zero production callers (UI uses `GET /api/threads?participant_id=…`, agent seam uses only `client.conversations.items.*`). The list route filters by nothing — every thread on the backend, other humans' DMs included, to any authenticated principal; only the detail route does `authorizeRead`. Sole caller of `countThreads`. The `:threadId` route still ships `responses: []` "for one release" — that release shipped. The `/items` routes on the same router are live (agent seam) and stay. What breaks: nothing observable; what closes: an information leak the single-user lens graded as merely dead.
2. **`GET /api/users/:id/inbox` + `POST /api/users/:id/inbox` (routes/users.ts:291, 326) — half-built third inbox and event-blind second send path.** Zero production callers, re-confirmed (`rg -a`: only their own definitions). Judged as product for a team: GET has no read state, no sender exclusion, returns your own messages back to you — the notifications inbox (AU18) is the real per-human "waiting for you" surface and owns read state. POST inserts a message with no `thread_message_appended`, no WS push, no `lastActiveAt` bump, no idempotency, and a mislabeled thread — a DM sent through it would be invisible to the recipient's live UI and would never trigger an assistant turn. Keeping it multi-human would mean rebuilding it into `POST /threads/direct` + `POST /threads/:id/messages` — which already exist. DELETE both; sole callers of the participant-probe `listInbox` variant die with them.
3. **`GET /api/threads/coach/` (routes/coach.ts) — superseded door.** Killed for supersession, not usage: AD8b replaced it with `/api/threads/assistant` (per-user, `hostKind:"user"` + `hostId` lookup — already multi-human correct; every human gets their own assistant thread). Coach queried `pinned=true`, which the assistant design made wrong (threads start unpinned). Sole caller of `findThread({pinned})`. What breaks: nothing; `useAssistantThread.ts` moved in AD8b.
4. **Message soft-delete/redaction read-guards — defense for a feature with no writer.** No production code sets `messages.deletedAt` or `messages.redactedAt`. Four read paths guard a state the DB cannot reach: `MessageFilter.includeDeleted`, the resolver's deleted/redacted throw, `searchConversations`' `deletedAt IS NULL`, `getArtifactThreadSummaries`' non-deleted filtering. Strip all four. Multi-human framing: retract-my-message is a real team feature *someday* — when its writer ships, it re-adds the guards it needs, on its own read paths. Ruling 2 does not protect writer-less columns. (Schema columns are `framework/db`'s surface — flagged, not verdicted here.)
5. **`AssistantTurnSourceUnavailableError` — a typed error nobody catches.** No importer outside the package + barrel, no `instanceof` anywhere. Ceremony around `throw new Error(...)`.
6. **NEW — the forked DM dedupe (MERGE, not delete).** Two mechanisms decide "does a direct thread between A and B already exist": AF14 `directKey` (threads.ts:385, :1016–1027, with a unique partial index and race-winner resolution) and the store's `findOrCreateDirectThread` (hostKind-scan, `directKey` never set, `recipientKind` defaulted to `"agent"` by every caller). They cannot find each other's threads; agent-initiated and human-initiated DMs between the same pair fork. One mechanism survives: move `directKey` computation into the store function, wire `recipientKind` from the recipient's real identity, point `POST /threads/direct` and the AF14 path at it. Everything about DMs the product promises — one thread per pair, either side can start it — depends on this being one mechanism.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `registerAssistantThreadPinReaction` | BOOTSTRAP (service-bootstrap.ts) → EVENT:thread_message_appended | SIMPLIFY | Unchanged from wave 1. Live product effect (assistant thread sorts pinned-first), but 80 lines + DI interface + WeakSet for one conditional UPDATE. Move to Layer code, import `findUser` statically, delete `AssistantThreadPinReactionDeps` + WeakSet. Write still routes through `updateThread`. |
| 2 | `resolveAssistantTurnRequest` | UI:POST /api/threads/:id/messages + EVENT:thread_message_appended (coherence trigger) | SIMPLIFY | Unchanged, now A4-protected: this is the turn producer the live-session surface extends. Shrink: make `readServerConfig` required (both real call sites wire it), delete the absent-branch; delete the deleted/redacted guard (kill 4). Do not touch the baked-transcript machinery. |
| 3 | `insertThread` | UI:POST /api/threads/ (+12 more doors, 2 agent tools, 2 schedulers) | KEEP | Irreducible row write; AU12 ownership seam for thread creation. |
| 4 | `updateThread` | UI:PATCH /api/threads/:id, message-append lastActiveAt bump, agent seam | KEEP | Irreducible row write; recency bumps drive the thread list every human sees. |
| 5 | `insertMessage` | UI:POST /api/threads/:id/messages + AGENT:send_message/reply/submit_review + SCHED:lifecycle | KEEP | The most core write in the product — a message getting sent. |
| 6 | `updateMessage` | EVENT:item_created → policy-engine.ts (only production caller) | MERGE | Unchanged. One caller, one field (`resolvedAt`); `resolveMessageIfUnresolved` does it with first-wins semantics. Switch policy-engine, delete this + the `updateMessage` port member in `policy/src/ports.ts`. |
| 7 | `resolveMessageIfUnresolved` | UI:POST /api/threads/:id/messages (verdict path) + AGENT:submit_review | KEEP | The verdict CAS — first-verdict-wins matters MORE with several humans reviewing concurrently. Absorbs #6. |
| 8 | `findOrCreateDirectThread` | UI:POST /api/threads/direct + AGENT:send_message/reply (seam port) + users.ts POST inbox (dying, kill 2) | **MERGE** | **CHANGED (Ruling 1), was SIMPLIFY-drop-recipientKind.** Second of two DM dedupe mechanisms; cannot see AF14 `directKey` threads, mislabels human recipients `hostKind:"agent"`, and races without the unique-index backstop AF14 has. Merge with the `directKey` mechanism into ONE store function; `recipientKind` survives and callers pass the recipient's real kind. See feature kill 6. |
| 9 | `findThread` | 14 UI doors + agent tools + 2 event subscribers | KEEP | The single-thread read behind every thread route, authz check, and reaction. Drop the `pinned` filter field (kill 3 — supersession, not usage). |
| 10 | `listThreads` | UI:GET /api/threads/ (participant-scoped, the real list), GET /api/search/, routine scheduler | SIMPLIFY | Unchanged. Drop `order:"created"` and `offset` — their only caller is the conversations route, which dies as a scope bypass (kill 1). Every surviving caller orders by `lastActive`, no offset. |
| 11 | `countThreads` | UI:GET /api/conversations/ — a door with zero production callers | DELETE | Unchanged, strengthened: dies with kill 1, and an org-global thread count has no principal it should ever be shown to on a shared backend. |
| 12 | `findMessage` | UI:POST /api/threads/:id/messages (idempotency + verdict target), GET /api/reviews/:id, EVENT:coherence trigger | KEEP | Idempotency replay and verdict-target lookup — correctness of the core send path. |
| 13 | `listMessages` | 7 direct UI doors + resolver + trust-model verdict windows (policy-bindings.ts) | KEEP | Every conversation render and the approval-rate trust model. `legacyItemIds`/`noLegacyItem`/`threadInitiatorId` are live trust-model inputs. Drop only `includeDeleted` (kill 4). |
| 14 | `listInbox` | UI:GET /api/threads/inbox → AGENT:read_inbox (seam) | SIMPLIFY | Verdict unchanged, reasoning re-reached (Ruling 1): the `excludeSenderId` variant is the agent inbox — live, multi-human correct. The participant-probe variant is the half-built third inbox (kill 2); the human "waiting for you" surface is notifications, which owns read state. Keep `{excludeSenderId, limit}` only; delete the probe branch, `"%%"` fallback, `offset`. |
| 15 | `searchConversations` | UI:GET /api/search/ → GlobalSearchPanel (live) | KEEP | Global search over conversations, a real product surface. Drop the `deletedAt IS NULL` clause (kill 4). Multi-human note for its caller (search.ts, not this row): the participant pattern is the scoping mechanism — it must stay principal-derived. |
| 16 | `getArtifactThreadSummaries` | UI:GET /api/bets/:id/artifact-thread-summary → live bet page hook | KEEP | Distinct aggregate surface: conversation state on a bet's artifacts. Drop the deleted-message filtering (kill 4). |
| 17 | `registerSessionNotReturnedNotice` | BOOTSTRAP (service-bootstrap.ts) → EVENT:session_not_returned | KEEP | Unchanged, A4-protected: the never-silent net. On a shared backend, N humans wait on agent turns — each must be told when a session died instead of hanging. Part of the session-surface trust story the founder wants finished. |
| 18 | `AssistantTurnSourceUnavailableError` (class) | INTERNAL — thrown at resolver:126, caught by nobody | DELETE | Unchanged. No importer outside package+barrel, no `instanceof`. Replace with plain `Error`. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `AssistantThreadPinReactionDeps` | DELETE | Dies with row 1's move to Layer code. Unchanged. |
| `AssistantTurnResolverDeps` | SIMPLIFY | Keep `requireRunnableAgent`; make `readServerConfig` required. Unchanged. |
| `BakedTranscriptRow` | KEEP | The resolver's transcript element; also A4 substrate. Unchanged. |
| `BakedAssistantTurnRequest` | SIMPLIFY | Make `harnessDisabled` required once its dep is; drop the barrel export. Unchanged. |
| `ThreadFilter` | SIMPLIFY | Drop `offset`, `order:"created"`, `pinned` (kills 1, 3). `directKey` gains a second caller when row 8's merge lands. Survivors: id, directKey, host, hostKind, participantProbe, ids, order:"lastActive", limit. |
| `MessageFilter` | SIMPLIFY | Drop `includeDeleted` (kill 4). Trust-model trio stays. Do not grow it. Unchanged. |
| `InboxFilter` | SIMPLIFY | Drop `participantProbe` and `offset` (row 14). Survives as `{excludeSenderId, limit}`. Reasoning re-reached under Ruling 1; verdict unchanged. |
| `InboxRow` | KEEP | `read_inbox` wire element; `participants` returned to the agent. Unchanged. |
| `ThreadSearchRow` | KEEP | Exact projection of the live search route. Unchanged. |
| `ArtifactThreadSummaryRow` | KEEP | Wire shape of a live UI hook. Unchanged. |
| `SESSION_NOT_RETURNED_NOTICE_TEXT` (const) | SIMPLIFY | Un-export; only tests import it externally. Unchanged. |

## Holes this leaves

- **RETRACTED from wave 1: "No human→human DM kind."** Human↔human DMs exist today via `POST /api/threads` (directKey path) and are core product (Ruling 1). `recipientKind` survives inside the row-8 merge instead of coming back "with its first real caller" — its callers exist now.
- **No global thread list endpoint.** Still fine — better than fine: the only unscoped list was a participant-scope bypass. Anyone wanting an org-wide overview must build it participant-aware; do not resurrect this route.
- **DM-to-human emits no notification (pre-existing gap, now named as work).** `notification` events are emitted only by policy-engine and dependency-watcher; a human DMing a human (or an agent DMing a human) reaches the recipient only through the WS thread-list bump. In a team deployment "someone messaged you" belongs in the notifications inbox. This is Ruling-2-shaped missing emission — schedule an emission on the canonical message-append path / a notifications subscriber. It is not a reason to keep the users-inbox routes, which also lacked it.
- **No per-human read state on threads.** Unread markers per participant do not exist anywhere; notifications carries read state for its own rows only. Genuine multi-human product gap, owned by whoever ships unread — not by resurrecting any killed surface here.
- **Message deletion/redaction loses its read-side guards.** Unchanged: the feature has no writer; its future implementation (a real team want — retract my message) re-adds the guards it needs.
- **Coach route deletion** — stale external clients pinned to `/api/threads/coach` get 404. None known.
- **Policy-engine resolve becomes first-wins** (CAS merge) — strictly safer with several humans issuing verdicts concurrently.
- **Until the row-8 merge lands, DMs stay forked.** This is not a hole the deletions open — it is the live defect the single-user premise hid, and the reason row 8 is MERGE rather than a signature trim.


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


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/fw-conversation-parts.md` for comparison.

# conversation-parts — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

Ruling A4 inverts the first wave's headline. The first wave found that production only ever
produces generic neutral tool rows and concluded the rich renderers were Storybook fiction to
cut. The ruling says the renderers are the *right* half of a live session surface you dial
into; the missing half is a producer and a place to watch. So the rich-vocabulary rows move
from SIMPLIFY/DELETE to FINISH, and the evidence below is re-cast as a producer gap analysis
instead of a deletion warrant. Ruling A3 separately kills the composer-pill path outright.

| # | Export | Old verdict | New verdict | Ruling |
|---|---|---|---|---|
| 3 | `derivePartsFromSession` | SIMPLIFY (cut reasoning/answer/rich-tool branches) | **FINISH** | A4 — branches are the right half; build the producer |
| 4 | `aggregateToolRun` | SIMPLIFY (status rules never fire → degenerate fold) | **FINISH** | A4 — status rules go live when tool results are emitted |
| 5 | `deriveComposerPills` | MERGE (inline into SessionView) | **DELETE** | A3 — per-message composer pills die; option concept moves to agent config |
| 7 | `ToolKind` | DELETE (fiction) | **SIMPLIFY** | A4 revives the family; alias-pair defect stands independently |
| 18 | `ToolRunBlock` | SIMPLIFY (drop failedCount) | **FINISH** | A4 — failedCount becomes real with statuses |
| 20 | `TOOL_KINDS` | DELETE (fiction) | **SIMPLIFY** | A4 revives the family; collapse the alias duplicates |

**6 rows changed.** All 15 other rows stand: the seven KEEPs were never in question, and the
remaining DELETEs (`PartKind`, `PartId`, `ReviewTarget`, `FoldDescriptor`, `EmbedKind`,
`PART_KINDS`, `EMBED_KINDS`) plus the `Embed` SIMPLIFY rest on zero-reference / test-only
evidence that is independent of the single-user premise and of A4 — the founder explicitly
kept them.

### What must be built for the live session surface

**What the producer emits today — file and shape.** The canonical harness vocabulary is
`framework/harness-protocol/src/harness/harness-events.ts`: exactly five event types —
`token_usage`, `tool_call { toolName, args }`, `completion { text }`, `error`,
`pre_compaction`. The drain loop is
`layers/agent-orchestration/run-orchestration/src/provisioner.ts` (Phase 10, ~1549–1580): it
handles `token_usage` (accumulate), `tool_call` (emit
`tool_call_recorded { sessionId, toolName, argsSummary, timestamp }` on the EventBus, args
summarized via `ports.observability.summarizeToolArgs`), and `error` (crash). **`completion`
and `pre_compaction` fall through the if/else and are silently dropped.**
`layers/agent-orchestration/src/session-activity-buffer.ts` subscribes to
`tool_call_recorded` only and stores
`{ type: "tool_call", timestamp, data: { toolName, argsSummary } }` — the only
`ActivityEntry` kind production ever creates. Client side,
`layers/core-ui/src/hooks/useSessionActivity.ts` does a REST snapshot
(`GET /api/sessions/:id/activity`) plus WS topic `session:<id>`, and its WS handler branches
only on `tool_call_recorded` and `session_ended`.

**Per missing Part kind — does the wire already carry it?**

1. **Agent prose (`answer_settled`) — already arrives, dropped.** Every adapter emits
   `completion { text }`: claude assistant text blocks
   (`harness-event-normalization.ts` `preMapClaudeEvent`, lines 80–84), opencode `text`
   events carrying `part.text` (lines 181–195), codex `item.completed` `item.text`
   (lines 225–230), builtin at many sites (`builtin-harness-adapter.ts:574–912`). The
   provisioner has no `completion` branch. Job: add one — emit an
   `agent_answer_recorded`-style event, add a buffer branch and a WS-handler branch. No
   harness-protocol change. **Smallest item on this list.**
2. **Streaming deltas (`answer_delta`) — partially on the wire.** opencode `text` events are
   already per-chunk (verified in the AR5 lore at that pre-map); claude needs
   `--include-partial-messages`; codex is per-item; builtin is per-call. The canonical
   vocabulary cannot distinguish delta from settled — either treat each `completion` as a
   settled prose turn (the adapter's existing merge machinery already appends and settles) or
   add a delta member to `HarnessEvent`. Medium.
3. **Reasoning — counts arrive everywhere, text arrives for claude and is dropped at the
   pre-map.** `token_usage.reasoningOutputTokens` already flows (enough for the "Thought for
   Ns" resting label, no body). Claude stream-json assistant messages carry `thinking`
   blocks; `preMapClaudeEvent` (lines 61–85) inspects only `tool_use` and `text` blocks, so
   thinking falls through to an empty completion. Job: pre-map branch + a canonical
   `reasoning` event + the same emit/buffer/WS plumbing. codex/opencode reasoning-text
   availability is unverified — do not promise it there. Medium.
4. **Tool status / output — dropped at the pre-maps.** Claude tool results arrive as `user`
   events with `tool_result` blocks; the pre-map maps `user` → benign empty completion
   (lines 92–94). opencode `tool_use` events carry `part.state`, of which only `state.input`
   is read (lines 162–169). Correlating a result back to its call needs a call id — canonical
   `ToolCallEvent` has no id field, so this one requires a harness-protocol extension.
   Medium-large.
5. **Diff stats — not on any wire.** Must be computed from edit-tool args/results; the
   package's own `diffEmbed` lore already admits the label-as-artifactId placeholder. Do
   last among the tool enrichments.
6. **Sub-agent nesting (`opensSession`) — nothing emits child session ids.** Harness
   sub-agents (e.g. claude's Task tool) never become HyperIdle sessions; this needs
   orchestration-level invention (provision or virtualize child sessions and link them).
   Largest; defer until the rest of the surface is live.
7. **`human_message` — requires interactive sessions.** Sessions are one-shot provisioned
   runs; there is no route that feeds input into a running harness, and `SessionView`'s
   `onSend` is a stubbed no-op at its only production mount (`Conversations.tsx`
   `SessionViewPanel`: "sending is not supported here"). Whole input path missing
   (UI → route → harness stdin). Part of the surface build, not this package.

**Where would the surface live — what is missing.** Two components exist in
`layers/core-ui/src/components/`: `SessionActivityPanel.tsx` and `SessionView.tsx`. Only the
first is reachable: `Conversations.tsx` shows a "Dial in" button when a session is active and
opens `SessionActivityPanel` in the right split. `SessionView` — the rich renderer this
package feeds — is mounted via `SessionViewPanel` but opened only by `onOpenSession`, which
fires from a `session-reference` Embed click or a sub-agent tool-row click, **both of which
are production-dead**. So the rich surface is mounted-but-unreachable. There is no
`Session*.tsx` in `layers/core-ui/src/pages/` and no `/sessions/:id` route. Missing, in build
order:

1. **A reachable opener** — a session page/route, or make dial-in open `SessionView`. Note
   `SessionActivityPanel` and `SessionView` are two renderers of the same activity feed; the
   finished surface should be ONE of them (core-ui destroyer's turf, flagged here).
2. **`answer_settled` emission** (item 1 above) — the cheapest visible win: real agent prose
   in the live view.
3. **Reasoning** (item 3), then **tool status/output** (item 4), then **deltas** (item 2).
4. **Diffs, sub-agent sessions, interactive input** (items 5–7) — each is real invention,
   schedule separately.

## Where does this package go?
**Verdict: DISSOLVE → `layers/core-ui` — unchanged by the rulings.**

Every production consumer is `layers/core-ui`. Measured:
`rg -a -l "@hyperidle/conversation-parts" layers framework applications tools` → 23 files,
all under `layers/core-ui/` (the one `framework/domain-model` hit is a doc comment). The
live-session ruling does not change this: the producer work lands in
`agent-orchestration` + `harness-protocol` + `domain-model` (`ActivityEntry` already lives
in `domain-model/src/session-activity.ts` — the normalized boundary is already outside this
package). What this package holds is the client-side derivation and view vocabulary, and its
only consumer is the renderer layer. A Part is "derived, never stored"; the server owns
`Message` and `ActivityEntry`, never a Part. The package boundary still exists for one
reason — a scoped ESLint `no-restricted-imports` rule proving the renderer never imports
`Message`/`HarnessEvent` — and a directory-scoped lint rule inside core-ui holds that
boundary equally well. Dissolve stands; do the lint re-scope in the same PR as the move.

The A3 deletion of `deriveComposerPills` also removes the package's ONLY dependency on
`@hyperidle/harness-capability` — the dissolve gets cheaper, not harder.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-ui` (23 files: PartList, SessionView, Conversations, ConversationSurface, open-handler, parts/*, tests, stories) | Everything the package exports that is used at all | Yes — it is the only consumer. Move `part.ts` to `layers/core-ui/src/parts/part.ts`, delete the package. |
| `framework/domain-model/src/session-activity.ts` | Nothing — mentions `derivePartsFromSession` in a comment | n/a |

## If written today, from scratch

Against the corrected premise — a shared backend, a team of humans and agents, an event
stream plugins hang off, and a live session surface you dial into to watch an agent work:

A single `layers/core-ui/src/parts/part.ts` (+ the existing `parts/*` renderers) holding:
- `Part` union — **including** reasoning and the rich tool shape, because the surface that
  renders them is product, with the producer scheduled (see above)
- `PartAuthor`, `PartGroup`, `Embed` (minus the never-constructed `session-reference`
  variant), `OpenTarget`, `OpenHandler`
- `derivePartsFromMessages` — the load-bearing conversation adapter
- `derivePartsFromSession` — kept at full vocabulary, fed by the finished producer
- `groupParts`, `aggregateToolRun` (with a status field that finally varies)
- a tool-kind family of **canonical members only** — `command, read, edit, search,
  web-search, mcp, sub-agent, create, generic` — with a normalizer that actually maps the
  legacy alias spellings instead of pattern-matching on both

No package, no `@hyperidle/harness-capability` dependency, no composer pills, no exported
const sets.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 8 |
| MERGE | 0 |
| SIMPLIFY | 3 |
| FINISH | 3 |
| KEEP | 7 |
Surface: 21 exports → 13 survivors (38% export cut), package itself still deleted
(100% package cut). First wave was DELETE 9 / MERGE 1 / SIMPLIFY 4 / KEEP 7.

## Feature-level kills (and un-kills)
1. **UN-KILLED: the rich session-stream vocabulary** (reasoning / answer streaming / tool
   status / diffs / sub-agent nesting). First wave: cut ~150 lines of fiction. Ruling A4:
   FINISH — the renderers stay, the producer gets built per the gap analysis above. Stories
   and tests that fabricate rich entries stop being fiction the moment the emitter lands;
   they stay until then as the only spec of the target shape.
2. **KILLED (A3): the composer-pill path.** `deriveComposerPills` and SessionView's pill
   rendering (`SessionView.tsx:565`) die; per-model options move into agent configuration.
   Breaks: nothing — pills rendered options for a composer whose `onSend` is a no-op.
3. **KILLED (stands): `session-reference` Embed kind.** No adapter and no production code
   ever constructs one — only stories and tests (`rg -a 'kind: "session-reference"'`). The
   renderer branch in `embeds.tsx` dies with the union member. If the live surface later
   wants conversation-embedded session links, re-add it with a real producer in the same PR.
4. **KILLED (stands): the package boundary itself.** The W1 ESLint rule re-scopes from a
   package name to a core-ui directory glob. One-line lint config change.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `groupParts` | function | UI: Conversations + SessionView via PartList | KEEP | Real grouping both live surfaces run on every render; moves to core-ui. |
| 2 | `derivePartsFromMessages` | function | UI: `/conversations` (Conversations.tsx, ConversationSurface.tsx) | KEEP | The load-bearing adapter; review/resolved/questionnaire/verdict paths all have real API producers; moves to core-ui. |
| 3 | `derivePartsFromSession` | function | UI: SessionView | FINISH | A4: keep the full branch set (reasoning/answer/rich tool); today only the tool_call branch runs because the provisioner drops `completion` and the pre-maps drop thinking/tool_result — build the producer per the gap analysis; moves to core-ui. |
| 4 | `aggregateToolRun` | function | UI: SessionView only | FINISH | A4: the running-standalone rule and `failedCount` activate when tool statuses are emitted (harness-protocol tool-result extension); moves to core-ui. |
| 5 | `deriveComposerPills` | function | UI: SessionView composer only | DELETE | A3: the per-message composer-pill path dies; option concept moves to agent config. Kills the package's only `harness-capability` dependency and SessionView's pill block. |
| 6 | `PartKind` | type | none (PartList mention is a comment) | DELETE | Stands: exported to nobody; internal use inlines into the union. |
| 7 | `ToolKind` | type | none outside package | SIMPLIFY | A4 revives the family, but the defect stands: collapse the duplicate alias pairs to canonical members and make the normalizer actually normalize (today `normalizeToolKind` claims to canonicalize read/file-read and edit/file-change but returns the raw value — part.ts:446-450 vs the lore at 443). |
| 8 | `PartId` | type | none | DELETE | Stands: alias of `string`, zero consumers. |
| 9 | `PartAuthor` | interface | UI: Conversations.tsx, SessionView.tsx | KEEP | Real author shape both adapters and pages construct; moves to core-ui. |
| 10 | `ReviewTarget` | interface | none outside package | DELETE | Stands: internal-only; inline the shape; `betId` is always `""` at the only construction site. |
| 11 | `FoldDescriptor` | interface | DEAD | DELETE | Stands: zero references anywhere, not even inside its own package. Pure corpse. |
| 12 | `Part` | type | UI: PartList, SessionView, all parts/* renderers | KEEP | The core vocabulary of the conversation surface; under A4 also the vocabulary of the live session surface; moves to core-ui. |
| 13 | `EmbedKind` | type | DEAD | DELETE | Stands: zero references outside its own derivation line. |
| 14 | `Embed` | type | UI: embeds.tsx, ProsePart, adapters | SIMPLIFY | Stands: survives minus the `session-reference` variant no production code ever constructs; re-add only with a real producer. Moves to core-ui. |
| 15 | `OpenTarget` | type | UI: open-handler.ts, Conversations, SessionView, ToolPart | KEEP | The real routing seam; the `route: "session"` arm becomes the opener of the live surface under A4. Moves to core-ui. |
| 16 | `OpenHandler` | type | UI: 8 production files | KEEP | The single open-hook signature every part renderer takes; moves to core-ui. |
| 17 | `PartGroup` | interface | UI: PartList, SessionView | KEEP | Return shape of groupParts; moves with it. |
| 18 | `ToolRunBlock` | type | UI: SessionView only | FINISH | A4: keep `failedCount` — it goes live with tool statuses; still single-consumer, still inlines beside aggregateToolRun in core-ui. |
| 19 | `PART_KINDS` | const | TEST-ONLY externally; internal type derivation | DELETE | Stands: no runtime production reader; inline the union literals. |
| 20 | `TOOL_KINDS` | const | TEST-ONLY externally; internal `normalizeToolKind` membership check | SIMPLIFY | A4: the family is the target vocabulary the producer must emit — keep it, but drop the alias duplicates (`file-read`/`read`, `file-change`/`edit`) and keep `sub-agent` only as the declared target of the deferred nesting item. |
| 21 | `EMBED_KINDS` | const | TEST-ONLY | DELETE | Stands: only readers are the package's own tests asserting the const equals itself. |

## Holes this leaves
- **The live surface stays honest-but-thin until the producer ships.** Nothing here makes
  the session view richer by itself — SessionView still renders generic neutral tool rows
  until the schedulable items above land, and SessionView itself stays unreachable until an
  opener exists. The FINISH verdicts are work orders, not survivors that need nothing.
- **A producer work package must exist.** The emission gaps live outside this package
  (provisioner drain loop, harness pre-maps, harness-protocol vocabulary, buffer, WS
  handler) — none of it is conversation-parts code, so dissolving the package neither helps
  nor hinders it. Sequence the dissolve and the producer independently.
- **Composer-pill deletion leaves agent config owing a home for per-model options** (A3's
  other half) — `harness-capability` descriptors survive; the agent-config surface that
  renders them is separate scheduled work.
- **W1 lint boundary** re-scopes from `@hyperidle/conversation-parts` to a core-ui directory
  glob in the same PR as the move, or the source-agnostic guarantee silently evaporates.
- **SessionActivityPanel vs SessionView duplication** — two renderers of one activity feed;
  the finished surface should keep one. Flagged for the core-ui destroyer.


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


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/fw-domain-model.md` for comparison.

# domain-model — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

12 rows moved. Verdict vocabulary now DELETE / PLUGIN / FINISH / MERGE / SIMPLIFY / KEEP.

| Row | Export | Old verdict | New verdict | Ruling |
|---|---|---|---|---|
| C.78 | `DependencyMetEvent` | DELETE | KEEP | Ruling 2 (events are an extension surface) + A6 FINISH (task dependencies) |
| C.81 | `BetRevisedEvent` | DELETE | KEEP | Ruling 2 |
| C.87 | `ThreadArchivedEvent` | DELETE | KEEP | Ruling 2 |
| C.91 | `WorkSelectionRequestedEvent` | DELETE | KEEP | Ruling 2 |
| C.95 | `ProposedCallExecutedEvent` | DELETE | KEEP | Ruling 2 + A1 FINISH (approval loop is being wired) |
| C.140 | `ProposedCallStatus` | MERGE → core-ui | KEEP | A1 FINISH — the status vocabulary is two-sided once the loop is wired: server writes executed/failed, review pages narrow it |
| C.142 | `ProposedCall` | DELETE | FINISH | A1 FINISH — the wire model of the approval surface being completed, not a dead mirror |
| D.59 | `PROPOSED_CALL_STATUSES` | MERGE → core-ui | KEEP | A1 FINISH — derivation source + server-side validation of the kept two-sided status type |
| C.34 | `InviteRole` | MERGE → core-api/users | DELETE | Ruling 1 — OIDC replaces invites; the machinery this would move next to is itself dead |
| D.7 | `INVITE_ROLES` | MERGE → core-api/users | DELETE | Ruling 1 — same |
| D.8 | `LOGIN_SESSION_TTL_MS` | MERGE → core-api/users | DELETE | Ruling 1 — home-grown login sessions die; OIDC owns session lifetime |
| D.9 | `INVITE_CODE_TTL_MS` | MERGE → core-api/users | DELETE | Ruling 1 — invite codes are not the access mechanism |

Note Ruling 1 cut **against** four rows here: the first wave routed the invite/login-session
constants to core-api/users as single-owner code. Their sole consumer is machinery the founder
ruled dead (OIDC replaces it), so the constants die with it instead of moving.

**Sweep result — rows checked for the same mistake and confirmed unchanged**, with the boundary
Ruling 2 itself draws (it protects event types, not plumbing dead for other reasons, nor payloads
nothing sets):

- `KernelEvent` / `StrategyEvent` (C.97/98, DELETE) — union *groupings*, not event types. Deleting
  them removes zero events from the extension surface; every member stays in `DomainEvent`. The
  kernel/strategy split is a docs concept with no runtime seam.
- `PropagationStatus` / `PropagationResult` (C.126/127, DELETE) — not events; a result record
  nothing constructs. The live `propagation_applied`/`propagation_failed` events carry their own
  fields and are untouched. This is the "payload nothing ever sets" boundary.
- `isTriggerEventType` (A.38, DELETE) — a guard with zero callers, dead not for lack of a
  subscriber but because its own family validates with `TriggerRuleValueSchema` instead. The
  trigger vocabulary itself (`TriggerEventType`, `TRIGGER_EVENT_TYPES`) survives via MERGE.
- `urgencyForType` (A.26, DELETE) — a helper over the live `NotificationEvent` registry, not an
  event. Zero callers.
- `buildSessionLifecycleCorrelation` (A.28, DELETE) — event-adjacent plumbing that is a literal
  identity function. Founder confirmed this finding stands.
- `KnowledgeRelevanceSignals`, `TriggerResolutionResult`, `RoutineCreatePayload`,
  `ThreadConfiguration`, `SessionState` — none are events; all dead for non-subscriber reasons.
- Money library, `VersionConflictError` (never instantiated, `instanceof` can never match),
  `UserRole = string`, `USER_KINDS`/`UserKind`/`UserStatus` — stand, founder-confirmed. Ruling 1's
  shared-backend premise does not resurrect them: a shared backend gets identity/role facts from
  OIDC, not from a `type UserRole = string` alias with zero type safety or a users vocabulary
  nothing imports. Dead is dead.

**Ruling 3 (knowledge-ritual → PLUGIN): zero rows in this package.** The KNOWLEDGE_* vocabulary
here is the machinery of the knowledge store itself (layers, statuses, scopes), not
practice-meeting/retro ceremony. No PLUGIN verdicts.

### Events whose emission is missing

The defect is inverted from the first wave's report: the vocabulary is right, the announcement is
missing. Per event — where the fact occurs, and where the emission belongs. All five keep their
dispatcher cases in `layers/core-api/src/observability/dispatcher.ts` (`bet_revised` :410,
`thread_archived` :424, `work_selection_requested` :436, plus `dependency_met` and
`proposed_call_executed` cases in the same switch).

1. **`dependency_met`** — the fact occurs in
   `layers/core-api/work/src/dependency-watcher.ts` (`checkAndUnblockDependents`): when every
   dependency of a hold-state task is done, it auto-transitions the task hold→accepted via
   `transitionTask(...)` (~line 93) and today emits only an ambient `notification` with
   `kind: "auto_unblock"` (~lines 102–111). **Emit here**: directly after the `transitionTask`
   call, beside the existing notification emit —
   `{ type: "dependency_met", streamId: task.id, taskId: task.id, dependencyId: completedTaskId, timestamp }`,
   once per unblocked dependent. A6 (FINISH) rebuilds the dependency tree with a real writer; this
   watcher is that writer's emission point.

2. **`bet_revised`** — the fact occurs in
   `layers/core-api/work/src/bet-state-machine.ts:260` (`updateBetField`): the mutated column +
   revision-log entry are written via `work.update(...)` (~line 302), reached from the door
   PATCH /api/bets (`layers/core-api/src/routes/bets.ts:559`). Today it emits only `item_created`,
   and only when the field is `done_condition`. **Emit here**: immediately after the
   `work.update` write, for *every* mutated field —
   `{ type: "bet_revised", streamId: bet.teamId, betId, field, timestamp }`. The function already
   receives the `eventBus`; this is a three-line addition.

3. **`proposed_call_executed`** — the fact occurs in
   `layers/core-api/review/src/proposed-call-workflow.ts`, the `"outcome-recorded"` transition
   (~lines 615–637): it inserts the `operationOutcomes` row and sets `proposedCalls.status` to
   `"executed"`/`"failed"` at :634–635. **Emit here**: immediately after that status update —
   `{ type: "proposed_call_executed", streamId: pc.subjectThreadId, proposedCallId: id, reviewMessageId: pc.reviewMessageId, status: result.success ? "ok" : "failed", timestamp }`
   (the transition holds the PC id; fetch the row for `subjectThreadId`/`reviewMessageId`). The
   event's own `@lore` (AL7 W4) already specifies `streamId = subjectThreadId` so the review
   canvas Outcome band can subscribe per thread — this emission IS part of the A1 FINISH wiring.

4. **`thread_archived`** — the fact does **not occur yet**: `threads`
   (`framework/db/src/schema.ts:732`) has `pinned` and `resolvedAt` but no archival column, and no
   route archives a thread. The schedulable work is the archival operation itself (an
   `archivedAt` column + a threads route action) with the emission beside the DB write. The
   pattern to copy is the resolve path: `layers/core-api/src/routes/threads.ts:1550` emits
   `thread_resolved` after the write and pushes it over WS at :1588. The archive emission belongs
   in the same shape, same file.

5. **`work_selection_requested`** — the emitters named in the event's own doc comment (AK7:
   `bet-decomposition.ts` for `bet_task`/`bet_decomposer`, routine `agent-delegation.ts` for
   `routine_delegate`) were deleted by AU21 §6 Decision F1 (see the `@lore` in
   `layers/core-api/work/src/ports.ts` ~lines 51–60). The fact — work needs an agent — still
   occurs at two surviving sites: **(a)** routine firing,
   `layers/core-api/routine/src/routine-scheduler.ts:684`, where the baked request takes
   `bakedRequest.defaultAgentId` — emit with `surface: "routine_delegate"` before that selection
   settles; **(b)** task intake, POST/PATCH /api/tasks
   (`layers/core-api/src/routes/tasks.ts:33`, nullish `ownerAgentId`) — emit when a task arrives
   or moves without an owner. When A6's rebuilt decomposition/dependency writer lands, it becomes
   the third emitter (the original `bet_task`/`bet_decomposer` surfaces).

---

## Where does this package go?

**Verdict: SPLIT — dissolve ~55% of the surface into its real owners; a slimmed shared core remains.**

456 files across every layer import `@hyperidle/domain-model`, so "delete the package" is not on the table. But the 395-export surface is three different things wearing one name:

1. **A real client↔server wire contract** (core-api / agent-orchestration serve it, core-ui / design-system render it). Neither side may import the other, so this part legitimately needs a shared home. It survives, slimmed. ~124 exports.
2. **The event vocabulary + bus typing** (`events.ts`, ~48 exports). `EventType`/`EventByType`/`EventHandler`/`WildcardHandler` exist *only* to type `framework/event-bus`'s API; every subscriber already imports event-bus. **DISSOLVE → `framework/event-bus`.** Under Ruling 2 this vocabulary is a published extension surface — plugins hang triggers and actions off it — so it moves *whole*: all events survive, including the five whose emission is missing (see above). Nothing in events.ts dies except the `KernelEvent`/`StrategyEvent` groupings, which remove no event.
3. **Single-owner code parked here for tidiness** (~120 exports): trigger schemas only core-api reads, block types only the block pipeline produces, health derivations only the browser runs, session-request internals only orchestration reads, a whole Money arithmetic library nobody calls. Each moves to its sole consumer or dies. The auth TTL/invite constants no longer move — Ruling 1 kills their sole consumer, so they die here.

Plus ~44 exports that are **dead**: never imported by any production file, duplicated locally by their supposed consumer, or guards/vocab for features that were hard-deleted (AU21 cost-cap) or founder-ruled dead (invite/login-session access, Ruling 1).

## Consumers (measured, not assumed)

456 importing files: core-api 153, core-ui 125, design-system 47, agent-orchestration 42, agent-execution 9, block-derivation 8, tools/eval 7, harness-protocol 6, http-middleware 5, event-bus 5, conversation-parts 5, factory-defaults 4, db 4, tool-protocol 3, harness-capability 3, credential-access 3, desktop 3, work-intent-port 2, diagnostics 2, others ≤2. (`api-contract` and `eslint-plugin-design` reference it only in comments/messages — not real consumers.)

| Consumer | What it actually imports | Could it own this? |
|---|---|---|
| core-api | wire response types, state vocabularies (TASK_STATES, BET_STATUSES…), API_ERROR_CODES, event types, mention parsing, trigger/config schemas, errors | Owns: trigger.ts, task-transition.ts, OLD_KIND_MAP, mention parsing, model defaults, org/propagation vocab, its errors. auth.ts no longer moves to it — Ruling 1 deletes it. |
| core-ui | same wire types from the other side, label registries, health derivations, KnowledgeScope/SortOption, SCHEDULE_PRESETS, ASSISTANT_TURN_TIMEOUT_MS | Owns: health derivations, agent-profile sub-shapes, knowledge UI vocab, schedule presets, timeout const |
| design-system | thread/message model, block payloads, kind registry display fns, status vocab | Owns: segmentMentions, promotedRichMessageId, verdictDecisionToStatus, summarizePreview, artifactDisplayTitle, KnowledgeKind |
| agent-orchestration | session-request schema/kinds, events, connection provisioning types, its errors | Owns: intent guards, request statuses, held-auth/inherited-connection types, its 3 error classes |
| agent-execution | ResolvedModel, ModelTier, TokenUsage, HttpError, MODEL_CATALOG | Owns: HttpError (thrower AND catcher are both in llm-client.ts — the "cross-seam instanceof" lore is obsolete) |
| event-bus | DomainEvent, EventType, EventByType, EventHandler, WildcardHandler | Owns: all of events.ts — the union exists to type the bus, and the bus is where an external plugin would reach for the event vocabulary |
| block-derivation | every symbol in blocks/types.ts | Owns: all of blocks/types.ts — it is the producer; design-system/core-ui import block-derivation |
| db | ConfigurationKind, PluginState (column typing) | Owns those two |
| credential-access | ModelRequest, ModelGatewayConfig, CredentialName, MissingCredentialError | Owns: ModelRequest, MissingCredentialError (it is the resolver/thrower) |
| harness-protocol / tool-protocol / work-intent-port | AgentSessionSourceKind/Correlation, Reversibility, ModelTier, TokenUsage | No — these genuinely cross seams; stay shared |
| desktop / tools/eval / factory-defaults | credential vocabulary; role catalog; seeding vocab | No — genuinely shared |

## If written today, from scratch

Written against the corrected premise: a **shared backend** serving a team and an organisation of
teams, identity from an **OIDC provider**, and an **event stream that plugins hang off**.

One slim `domain-model` (~124 exports, down from 395): the state/verdict/label vocabularies both
sides render, the thread/message model, the artifact kind registry, the credential + model-gateway
catalog, the team/routine/agent-profile wire contracts, `ApiErrorResponse` + `API_ERROR_CODES`,
`AgentSessionSourceKind`/`Correlation`, `TokenUsage`, and the proposed-call approval vocabulary
(A1 is being finished, not deleted). Events live in `event-bus` — the complete vocabulary,
including the five not-yet-emitted ones, because who listens is not knowable from this repo.
Blocks live in `block-derivation`. Everything with one consumer lives in that consumer. No invite
codes, no login-session TTLs, no home-grown auth vocabulary of any kind — OIDC owns identity. No
Money library, no `UserRole = string` fake type, no identity-function "builders", no
never-instantiated error classes.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 50 |
| FINISH | 1 |
| PLUGIN | 0 |
| MERGE (move to named owner) | 140 |
| SIMPLIFY (survives in package; unexported family member or shrinks) | 75 |
| KEEP | 128 |

Surface: 395 input entries → 394 verdict rows (one input entry, `OldKindMapping`, is listed twice
in the input; counted once at C.106). 265 of 394 leave the public shared surface (67%): 50 dead
outright, 140 moved to their real owner, 75 demoted to unexported internals. 129 survive as public
contract (128 KEEP + 1 FINISH), of which the five KEEP events and their family relocate with
events.ts → event-bus per the package-level SPLIT — KEEP here means *survives*, not *stays put*.

## Feature-level kills

1. **The Money library** (`types/money.ts` minus TokenUsage/TierTokenCount — 13 exports). Bigint currency arithmetic with USD/EUR/GBP/JPY scales, wire conversion, add/compare. Zero production callers. It is the orphan of the AU21-deleted cost-cap feature; only `@lore` comments still reference it. Hole: none — the token-accounting types it shares a file with survive.
2. **Invite/login-session access vocabulary** (`auth.ts` — InviteRole, INVITE_ROLES, LOGIN_SESSION_TTL_MS, INVITE_CODE_TTL_MS). Ruling 1: OIDC replaces invites and home-grown login sessions. These constants' only consumer is that dead machinery; they die with it rather than moving to core-api/users. Hole: none in this package — the cross-package hole (deleting the invite-code/login-session code in core-api/users) belongs to that package's revised verdict.
3. **Dead type-guard family**: `isConfigurationKind`, `isPluginState`, `isConnectionAuthSource`, `isHeldAuthSource`, `isTriggerEventType`, `urgencyForType`, `buildSessionLifecycleCorrelation` (a literal identity function), `classifyThreadConfiguration` (self-described "documentation-only classifier — never persisted"). Zero production callers; `core-api/settings/plugin-configuration.ts` even wrote its own private `isConfigurationKind` rather than import this one.
4. **Dead mirrors of DB rows**: `CreateArtifactInput` (core-api/work has its own in `artifact-store.ts`), `MUTABLE_BET_FIELDS` (live copy is `bet-state-machine.MUTABLE_FIELDS`; the "both must stay in sync" doc comment is false — nothing imports this one), `VersionConflictError` (core-api/knowledge throws its own 2-arg class; this 3-arg one is never instantiated, so the `instanceof` check in error-handler.ts:25 never matches and only the `err.name` string fallback works). `ProposedCall` is NOT in this family anymore — A1 rules the proposed-call model live machinery for a feature being completed (FINISH).
5. **Never-thrown errors**: `ActiveRoutinesError`, `ProviderTimeoutError` — no `new` site anywhere. `CassetteMissError` — thrown only from `agent-execution/harness-registry/src/__testing__/llm-cassette.ts` (development world); a production package exporting an error class for a test-only module is dead weight here.
6. **Fake types**: `UserRole = string` (imported at 9 production sites for zero type safety), `UserStatus`, `UserKind`/`USER_KINDS`, `SessionState`, `KnowledgeFormat`, `RiskTier`, `AutonomyLevel` — none imported by any production file. Ruling 1's shared-backend premise does not save them: role/identity facts come from OIDC, and none of these carry any.

**Feature-level un-kill (was #2 in the first wave):** the five never-emitted events are KEEP under
Ruling 2 — see "Events whose emission is missing" for the schedulable work each one names.

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
| 26 | `urgencyForType` | DEAD | DELETE | Zero callers. Not an event — a helper over the live registry; Ruling 2 boundary does not protect it. |
| 27 | `shortLabelForType` | UI:NotificationPopover (core-ui ×1) | MERGE → core-ui | One caller; NOTIFICATION_TYPES stays shared, the helper moves. |
| 28 | `buildSessionLifecycleCorrelation` | TEST-ONLY | DELETE | Literal identity function (`return input;`). One test imports it. Founder-confirmed. |
| 29 | `canTransitionTaskState` | INTERNAL:core-api ×3 | MERGE → core-api/work | Task state machine is core-api's domain logic; no other consumer. |
| 30 | `exhaustiveAssert` | INTERNAL: conversation-parts, design-system | DELETE | 3-line language util; each consumer inlines its own never-guard. |
| 31 | `isRedactedPayload` | UI:many (core-ui ×5, conversation-parts, design-system ×3) | KEEP | Real shared narrowing across 3 packages. |
| 32 | `classifyThreadConfiguration` | TEST-ONLY | DELETE | Self-described "documentation-only classifier — never persisted". Zero prod callers. |
| 33 | `headCollapsePredicate` | UI:GET /api/threads (core-api) + internal | KEEP | Same head rule evaluated server-side and (via isBlocking) client-side. |
| 34 | `isBlocking` | UI: design-system ThreadShell | KEEP | Pairs with 33 across the seam. |
| 35 | `promotedRichMessageId` | UI: design-system ThreadShell ×1 | MERGE → design-system | Single consumer, pure render rule. |
| 36 | `verdictDecisionLabel` | UI: core-ui + conversation-parts + design-system | KEEP | Three consumers; the label registry lint rule depends on it. |
| 37 | `verdictDecisionToStatus` | UI: design-system CommentRow ×1 | MERGE → design-system | Belongs in status-mapping.ts, its only consumer's file's sibling. |
| 38 | `isTriggerEventType` | DEAD | DELETE | Zero callers; the trigger intake validates via TriggerRuleValueSchema instead. Dead plumbing for a non-subscriber reason — Ruling 2 boundary does not protect it. The vocabulary it guards survives (C.204/D.78). |
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
| 2 | `VersionConflictError` | DEAD (as a class) | DELETE | Never instantiated. core-api/knowledge throws its OWN 2-arg VersionConflictError; error-handler's `instanceof` on this one never matches — the `err.name` string fallback does the real work. Founder-confirmed. |
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
| 34 | `InviteRole` | core-api ×1 | DELETE | **REVISED (Ruling 1).** Was MERGE → core-api/users. OIDC replaces invites; its only consumer (invite-code.ts) is machinery the founder ruled dead. Dies with it. |
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
| 78 | `DependencyMetEvent` | declared; emission missing | KEEP | **REVISED (Ruling 2 + A6 FINISH).** Extension-surface vocabulary; who listens is not knowable from this repo. The fact occurs in `dependency-watcher.ts` (hold→accepted auto-transition) and today announces itself only as an ambient notification — the emission is the missing half. See "Events whose emission is missing" #1. Travels with the event family → event-bus. |
| 79 | `SandboxWritebackChange` | agent-orchestration file-watcher | MERGE → event-bus | Member of live writeback event. |
| 80 | `SandboxWritebackChangesDetectedEvent` | EVENT:sandbox_writeback_changes_detected | MERGE → event-bus | Live event. |
| 81 | `BetRevisedEvent` | declared; emission missing | KEEP | **REVISED (Ruling 2).** The fact occurs in `bet-state-machine.ts` `updateBetField` (PATCH /api/bets door); nothing announces it — `item_created` fires for done_condition only. Emission missing, not the type dead. See "Events whose emission is missing" #2. Travels → event-bus. |
| 82 | `ToolCallRecordedEvent` | EVENT:tool_call_recorded | MERGE → event-bus | Live event. |
| 83 | `ThreadCreatedEvent` | EVENT:thread_created | MERGE → event-bus | Live event. |
| 84 | `ThreadMessageAppendedEvent` | EVENT:thread_message_appended | MERGE → event-bus | Live event. |
| 85 | `ThreadResolvedEvent` | EVENT:thread_resolved | MERGE → event-bus | Live event. |
| 86 | `ThreadReopenedEvent` | EVENT:thread_reopened | MERGE → event-bus | Live event. |
| 87 | `ThreadArchivedEvent` | declared; fact + emission missing | KEEP | **REVISED (Ruling 2).** Vocabulary is ahead of the operation: no archival column or route exists yet. The schedulable work is the archive operation + emission beside it, patterned on the resolve path (`routes/threads.ts:1550`). See "Events whose emission is missing" #4. Travels → event-bus. |
| 88 | `ArtifactCreatedEvent` | EVENT:artifact_created | MERGE → event-bus | Live event. |
| 89 | `PropagationAppliedEvent` | EVENT:propagation_applied | MERGE → event-bus | Live event. |
| 90 | `PropagationFailedEvent` | EVENT:propagation_failed | MERGE → event-bus | Live event. |
| 91 | `WorkSelectionRequestedEvent` | declared; emitters deleted by AU21 F1 | KEEP | **REVISED (Ruling 2).** Its AK7 emitters were removed by AU21 §6 F1; the fact (work needs an agent) still occurs at routine firing and task intake, and returns with A6's rebuilt writer. Emission missing. See "Events whose emission is missing" #5. Travels → event-bus. |
| 92 | `TeamCreatedEvent` | EVENT:team_created | MERGE → event-bus | Live event. |
| 93 | `AgentAddedEvent` | EVENT:agent_added | MERGE → event-bus | Live event. |
| 94 | `UserCreatedEvent` | EVENT:user_created | MERGE → event-bus | Live event. |
| 95 | `ProposedCallExecutedEvent` | declared; emission missing | KEEP | **REVISED (Ruling 2 + A1 FINISH).** The executed/failed transition happens in `proposed-call-workflow.ts` "outcome-recorded" (:634) with no announcement; the event's own @lore (AL7 W4) specifies the per-thread subscription the review canvas needs. Emitting it is part of finishing A1. See "Events whose emission is missing" #3. Travels → event-bus. |
| 96 | `ProposedCallGrantedEvent` | EVENT:proposed_call_granted | MERGE → event-bus | Live event. |
| 97 | `KernelEvent` | TEST-ONLY | DELETE | Union *grouping*, not an event type — inlining into DomainEvent removes zero events from the extension surface. The kernel/strategy split is a docs concept, not a runtime seam. Ruling 2 boundary: plumbing, not vocabulary. |
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
| 121 | `KnowledgeRelevanceSignals` | DEAD | DELETE | Zero references outside declaration + barrel. Not an event; not protected. |
| 122 | `KnowledgeSortOption` | core-ui ×1 | MERGE → core-ui | Single consumer. |
| 123 | `RiskTier` | DEAD | DELETE | Trust-model vocabulary nobody imports; the live riskTier lives in DB/service code. |
| 124 | `AutonomyLevel` | TEST-ONLY | DELETE | Same. |
| 125 | `PropagationLevel` | core-api ×1 + event member | MERGE → event-bus | Member of live propagation events. |
| 126 | `PropagationStatus` | DEAD | DELETE | Member of dead PropagationResult only. Ruling 2 boundary: a payload nothing ever sets is not protected; the live propagation *events* carry their own fields and survive (C.89/90). |
| 127 | `PropagationResult` | DEAD | DELETE | Zero external references; same boundary as #126. |
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
| 140 | `ProposedCallStatus` | core-ui ×2 + server transitions | KEEP | **REVISED (A1 FINISH).** Was MERGE → core-ui on the half-wired premise. With the approval loop being completed, the status vocabulary is two-sided: the workflow writes executed/failed, review pages narrow it. |
| 141 | `Reversibility` | harness-protocol + tool-protocol ×2 | KEEP | Two independent framework consumers across the tool seam. |
| 142 | `ProposedCall` | A1 wire model | FINISH | **REVISED (A1 FINISH).** Was DELETE as a "dead mirror" of `proposedCalls.$inferSelect`. The founder ruled the proposed-call model live machinery for a feature being completed: finishing A1 means the approval surface serves this shape over the wire (or consciously adopts the DB-inferred type and retires this — that call belongs to the A1 work, not to a destroyer pass). |
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
| 204 | `TriggerEventType` | internal | MERGE → core-api/settings | Whole trigger module has one owner: the settings/behavior-config service. The trigger *vocabulary* stays alive — it is part of the extension surface Ruling 2 describes; only its location changes. |
| 205 | `TriggerResultState` | internal | MERGE → core-api/settings | Same. |
| 206 | `TriggerRuleValue` | internal | MERGE → core-api/settings | Same. |
| 207 | `TriggerResolutionResult` | DEAD | DELETE | Zero references anywhere outside declaration. A record type nothing constructs — not an event; not protected. |
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
| 229 | `UserRole` | 9 prod files | DELETE | `type UserRole = string` — a fake type providing zero safety. Replace every import with `string`. Ruling 1 does not resurrect it: OIDC carries the real role facts; this alias carries none. Founder-confirmed. |
| 230 | `UserStatus` | DEAD | DELETE | Zero imports. Dead is dead under any deployment premise. |
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
| 7 | `INVITE_ROLES` | core-api ×1 | DELETE | **REVISED (Ruling 1).** Was MERGE → core-api/users. OIDC replaces invites; the consumer dies, the constant dies with it. |
| 8 | `LOGIN_SESSION_TTL_MS` | core-api ×1 | DELETE | **REVISED (Ruling 1).** Home-grown login-session machinery is dead; OIDC owns session lifetime. |
| 9 | `INVITE_CODE_TTL_MS` | core-api ×1 | DELETE | **REVISED (Ruling 1).** Invite codes are not the access mechanism. |
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
| 59 | `PROPOSED_CALL_STATUSES` | derives kept two-sided type | KEEP | **REVISED (A1 FINISH).** Was MERGE → core-ui. Derivation source + server-side validation of the kept ProposedCallStatus once the approval loop is wired. |
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
| 71 | `proposedCallSessionRequestInputSchema` | none external | SIMPLIFY | Same. Union branch of the kept intake schema; A1's wiring flows through the kept parent (D.72). |
| 72 | `agentSessionRequestInputSchema` | agent-orchestration ×2 | KEEP | The intake contract. |
| 73 | `TASK_STATE_TRANSITIONS` | core-api ×1 | MERGE → core-api/work | Task state machine data. |
| 74 | `HOST_KINDS` | core-api ×1 | KEEP | Derives shared HostKind; server zod. |
| 75 | `MESSAGE_TYPES` | core-api ×1 | KEEP | Same for MessageType. |
| 76 | `VERDICT_DECISIONS` | core-api ×1 | KEEP | Same for VerdictDecision. |
| 77 | `ARTIFACT_VIEW_SHAPES` | agent-orchestration + core-api | KEEP | Two-sided. |
| 78 | `TRIGGER_EVENT_TYPES` | internal | MERGE → core-api/settings | Trigger module moves whole; vocabulary stays alive (see C.204). |
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

- **No event holes.** All five formerly-condemned events survive with their dispatcher cases in `core-api/src/observability/dispatcher.ts` intact. The gap they expose is schedulable work (the five emissions above), not a deletion.
- **auth.ts delete (Ruling 1)**: `core-api/users`' invite-code and login-session machinery loses its TTL/role constants — correct, because Ruling 1 kills that machinery itself; the cross-package deletion belongs to core-api/users' revised verdict. Until OIDC lands, deleting the login path removes the only access mechanism — the OIDC work (A7 FINISH) and this deletion must land together.
- **`VersionConflictError` delete**: `error-handler.ts` must drop the dead `instanceof` and rely on (or import) core-api/knowledge's real class. Behavior today already flows through the `err.name` fallback, so nothing user-visible changes — but the middleware should stop pretending the instanceof works.
- **`UserRole` delete**: 9 production files change an import to `string`. Any future closed role enum would be a new decision informed by OIDC claims, which is correct — the current type falsely implies one exists.
- **blocks/types.ts → block-derivation**: design-system and core-ui gain an import edge on `@hyperidle/block-derivation`; the framework-surfaces/reach declarations need updating. If governance forbids design-system→block-derivation, the fallback is keeping blocks/types in the slim shared core — the DELETE/SIMPLIFY rows are unaffected.
- **events.ts → event-bus**: every subscriber file changes an import path (large mechanical diff, zero behavior). `framework/db`'s intent-kind parity test follows the vocabulary to its new home. Under Ruling 2 this move is also the honest statement of what the vocabulary is: the published surface plugins subscribe against.
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


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/fw-factory-defaults.md` for comparison.

# factory-defaults — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

| Row | Export | Old verdict | New verdict | Ruling | Why it moved |
|---|---|---|---|---|---|
| 5 | `FactoryFacilitatorSpec` | DELETE | **PLUGIN** | Ruling 3 | A facilitator-per-community-of-practice is a legitimate knowledge-management ritual — exactly "preconfigure agents, skills, routines and triggers". It leaves core and ships as a plugin's agent declaration, in plugin-manifest terms. |
| 9 | `COMMUNITY_DISPLAY_NAMES` | DELETE | **PLUGIN** | Ruling 3 | The community vocabulary (build/product/growth/ops/facilitation) is the ritual's naming, not garbage. Travels with the plugin. |
| 10 | `defaultFactoryRoster` | SIMPLIFY | SIMPLIFY (re-reasoned) | Ruling 3 | Verdict value unchanged — core still shrinks to the assistant singleton, inlined. But the five facilitator entries are no longer discarded: they become the plugin's preconfigured roster. The removed half's fate flipped DELETE → PLUGIN. |
| Feature kill 1 | 5-facilitator factory pre-seed | DELETE (whole feature) | **PLUGIN** (whole feature) | Ruling 3 | See "What leaves core and becomes a plugin". |

**Rows changed: 3** (2 verdict flips DELETE → PLUGIN, 1 SIMPLIFY re-reasoned). Everything else re-checked against Rulings 1–3 and confirmed unchanged — the reasons below say where Ruling 1 was re-applied.

**What did NOT move, and why the structural findings stand:**

- `FactoryRosterSpec` stays **DELETE**. Ruling 3 rescues the ritual, not the fiction around it. A "registry-free injection seam" whose one consumer hardcodes `const roster = defaultFactoryRoster` has never injected anything; the plugin surface declares agents through the plugin mechanism, not through a roster-spec interface in core. Nobody would want this seam in any form.
- `AgentScaffoldSpec` stays **MERGE**. A duplicated scaffold type is still a duplicate — `layers/core-api/org/src/scaffold-agents.ts:75` already redeclares it locally and admits it in its own header.
- `FactorySystemAssistantSpec`, `FactoryAgentRef`, `AgentScaffoldRequest`, `SYSTEM_PROMPT_TEMPLATE_FILES` stay **DELETE**. The assistant is machinery, not ritual — Ruling 3 does not touch it — and these are two-field types and an export-shape nobody imports. No ruling protects indirection.
- **Ruling 1 re-check** (shared backend, team, OIDC): the first-wave case against the facilitators never rested on a single-user premise — it rested on zero UI surface and their only job being the convicted knowledge sweeps. Re-judged as "what does a *team* get on first run": a team-shaped install has a *stronger* claim to a preconfigured practice roster than a solo founder — which is precisely why the ritual is worth re-providing as a plugin (possibly installed by default on team setups) instead of dying outright. Ruling 1 moved the fate from DELETE toward PLUGIN; it does not move it back into core. Meanwhile Ruling 1 *strengthens* the survivors: `resolveAgentScaffoldSpecs`' three triggers are the multi-user paths — `user_assistant` mints a per-human assistant (`ast-<userId>`, "<name>'s Assistant") which is what OIDC user provisioning will call per teammate, and `team_scaffold` builds a roster per created team in an org of several teams. The package's surviving symbols are exactly the team-shaped code.
- **Ruling 2**: not applicable — this package defines no event types and no row was killed on subscriber count.

### What leaves core and becomes a plugin

**The practice-communities ritual, whole.** One "knowledge-management practice communities" plugin providing:

- **Five facilitator agents**, one per community of practice (build, product, growth, ops, facilitation), with their ids (`seed-agent-pf-<community>`), display names (the `COMMUNITY_DISPLAY_NAMES` vocabulary), and the facilitator persona template.
- **The two knowledge sweeps they own** — `builtin:knowledge-decay` and `builtin:knowledge-promotion` (`routine-scheduler.ts:149-169`, both `ownerRole: "facilitator"`). These are knowledge-management ceremony by name and belong in the same plugin as their owners. This intersects the routine destroyer's builtin-routine conviction: under Ruling 3 those two sweeps are not merely deleted, they are re-provided as plugin routines+triggers — the two revised verdicts must land the same way.
- **Boundary note for other verdicts:** the `facilitator` entry in `AGENT_ROLE_CATALOG` and `facilitator.md` in `docs/system-prompts/` (served via the map row in `SYSTEM_PROMPT_TEMPLATE_FILES`) are the role's core-side residue. If the plugin carries its own persona, both are candidates to leave with it — that call belongs to the domain-model verdict, not this package's. Until then they stay: the map is a closed allowlist and the row is harmless.

What stays in core is the machinery of working: the assistant singleton seed, per-user assistant scaffolding, per-team roster scaffolding, template serving. None of it is ritual *about* the work.

**No work package exists for the plugin yet** (per the rulings file) — the extraction above is scope for the one that needs writing.

---

## Where does this package go?

**Verdict: DISSOLVE → `layers/core-api`** (unchanged). Scaffold resolution into the org/teams service beside `persistScaffoldedAgents`; the assistant seed inlined into `bootstrap/factory-state.ts`; the template reader beside its route. The facilitator/community content leaves for the plugin. Package deleted.

The package is three unrelated things stapled together by the word "defaults":

1. **Scaffold-spec resolution** (`resolveAgentScaffoldSpecs`) — agent-identity logic; belongs beside `persistScaffoldedAgents` in the org/teams service. Widen the seam to accept the scaffold *request* and resolve inside core-api; orchestration (a blind executor) hands over requests, not composed identity specs. After that, agent-orchestration imports **nothing** from this package. Under Ruling 1 this is the most load-bearing code here: it is the per-user (OIDC provisioning → assistant) and per-team (team creation → roster) path of a shared backend.
2. **The factory roster seed** — the AK6 "injection seam" is fiction (one hardcoded value, zero alternative rosters, consumer reads the const directly). The assistant half inlines into `factory-state.ts`; the facilitator half is the plugin's roster (Ruling 3).
3. **System-prompt template reading** (`readSystemPromptTemplateForRole` + map) — lands in core-api beside `GET /api/agents/templates/:role`.

`tools/setup` and the desktop app reach everything through the core-api faces they already call (`applyFactoryCoreState`, `runFactoryBootstrap`). No consumer needs a framework package to exist.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/factory-defaults" layers framework applications tools` — re-run against the current tree, list unchanged since the first wave; production files only:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/src/bootstrap/factory-state.ts` | `COMMUNITY_DISPLAY_NAMES`, `defaultFactoryRoster`, `FactoryAgentRef` | Yes — sole consumer of all three; assistant seed inlines, facilitator/community content leaves for the plugin. |
| `layers/core-api/src/routes/users.ts` | `resolveAgentScaffoldSpecs`, `AgentScaffoldSpec` | Yes — core-api. |
| `layers/core-api/src/routes/teams-routes.ts` | `resolveAgentScaffoldSpecs` | Yes — core-api. |
| `layers/core-api/src/routes/assistant.ts` | `resolveAgentScaffoldSpecs` | Yes — core-api. |
| `layers/core-api/src/routes/agents.ts` | `readSystemPromptTemplateForRole` | Yes — core-api. |
| `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` | `resolveAgentScaffoldSpecs` | Doesn't need it — widen the `persistScaffoldedAgents` seam to take the request; resolution is core-api's job. |
| `layers/agent-orchestration/src/factory-run-config.ts` | `FactoryAgentRef`, `readSystemPromptTemplateForRole`, `SYSTEM_PROMPT_TEMPLATE_FILES` | Doesn't need it — the template backfill loop only ever matched facilitators; with facilitators out of core the loop is dead. `FactoryAgentRef` inlines as `{id, role}`. |
| `tools/setup/src/demo-fixture.ts` | `readSystemPromptTemplateForRole` | Imports the core-api face — same sanctioned tooling→layer-face reach `runFactoryBootstrap` already uses. |

`layers/core-api/org/src/scaffold-agents.ts` still redeclares `AgentScaffoldSpec` locally ("structurally identical" per its own header) — the package's export duplicates a type the owning service already carries.

## If written today, from scratch — against the corrected premise

A shared backend for a team and an organisation of several teams, identity from OIDC, an event stream plugins hang off. First boot of that system seeds:

- **One org-wide system assistant** (`seed-agent-cos`) — inlined literal in `factory-state.ts`. Load-bearing: `coach.ts:43` hardcodes it, `knowledge/src/factory-seed.ts:31` stamps it as `updatedBy`, `builtin:portfolio-retro` runs as `ownerRole: "assistant"`.
- **A per-human assistant minted at OIDC provisioning** — the `user_assistant` trigger of `resolveAgentScaffoldSpecs`, living in the org/teams service behind the `persistScaffoldedAgents` seam. Every teammate who arrives via the identity provider gets one.
- **A per-team roster minted at team creation** — the `team_scaffold` trigger, same home.
- **Template serving** — `readSystemPromptTemplateForRole` in core-api beside its route; map module-internal.
- **Ritual comes from plugins** — the practice-communities plugin preconfigures facilitators + knowledge sweeps for installs that want the ceremony. Core seeds none of it.

Three symbols, zero packages, no roster spec types, no injection seam, no shared `{id, role}` interface.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 5 |
| PLUGIN | 2 |
| MERGE | 2 |
| SIMPLIFY | 1 |
| FINISH | 0 |
| KEEP | 1 |

Surface: 11 exports → 0 exports (package deleted; 3 symbols survive relocated into core-api; the facilitator roster + community vocabulary re-provide as a plugin).

## Feature-level kills

**1. The 5-facilitator factory pre-seed — whole feature, PLUGIN (was DELETE; Ruling 3).**
Every fresh install seeds five "facilitator" agents, one per community of practice. Zero UI surface (`rg -a -i "communit"` across `applications/` and `layers/core-ui/` production files: one unrelated comment in `SettingsConnections.tsx:13` — re-confirmed on the current tree). Their only production job is owning the two builtin knowledge sweeps (`routine-scheduler.ts:151,162`, `ownerRole: "facilitator"` — the sweeps are `knowledge-decay` and `knowledge-promotion`, knowledge-management ceremony by name). Under Ruling 3 the whole cluster — five facilitators, the community vocabulary, the two sweeps, their triggers — leaves core and ships as one plugin. Judged under Ruling 1 as "what does a team get on first run": the ritual is *more* plausible for a team than a solo founder, which argues for the plugin existing and perhaps installing by default on team setups — not for the ritual staying in core tables and bootstrap code. What breaks in core: `tools/eval/src/seeding.ts:520`, `tools/eval/src/scenarios/builtin-routines.ts:72`, `tools/setup/src/demo-world/ids.ts:22` hardcode `seed-agent-pf-facilitation` — eval/demo install the plugin or seed locally.

**2. The AK6 roster-injection seam — DELETE (unchanged).**
`FactoryRosterSpec` / `FactorySystemAssistantSpec` have zero external importers (the one `FactoryRosterSpec` hit outside the package is a doc comment in `scaffold-agents.ts:24`). The seam was never injected — `factory-state.ts` hardcodes the value it pretends to receive. A seam that hardcodes the value it claims to inject is fiction; the plugin surface, not a core interface, is how alternative rosters arrive. Nobody wants this in any form.

**3. The run-config template backfill — DELETE (unchanged, collateral).**
`factory-run-config.ts:49-56` iterates `SYSTEM_PROMPT_TEMPLATE_FILES` to backfill prompts onto roster agents. With facilitators out of core the roster is one assistant, which is deliberately **not** in the map (lore in `system-prompt-templates.ts:19-23` preserves that 404), so the loop writes nothing, ever. `applyFactoryRunConfigDefaults` shrinks to one AH2-defaults write for the assistant.

**4. Orchestration-side scaffold resolution — MERGE behind the seam (unchanged, strengthened by Ruling 1).**
`create_team` / `add_agent` tool handlers resolve specs locally, spread-widen them past the opaque seam type, then push through `persistScaffoldedAgents` (`tool-definitions.ts:1036,1131`). Seam takes the request; core-api resolves. On a shared backend the resolver is identity-minting for real teams and real humans — one owner, one home, in the org/teams service.

**Survives on evidence — the assistant seed.** `seed-agent-cos` is load-bearing (coach.ts:43, knowledge factory-seed:31, `builtin:portfolio-retro`). One seeded org-wide system agent is the honest factory state of a shared backend.

**Sibling cross-checks:**
- **routine destroyer**: the convicted builtin-routine subsystem contains the two facilitator-owned knowledge sweeps. Under Ruling 3 both revised verdicts must converge on PLUGIN for that pair (and the retro builtins are the same shape — theirs to rule). The kills still compound, now into the same plugin.
- **settings destroyer** (drop `plugins` + `plugin_configuration_defaults` tables): factory-defaults feeds neither (`rg -a -i "plugin" framework/factory-defaults/src/` = zero hits). But Ruling 3 makes the plugin surface the designated landing zone for the ritual — the settings verdict on those tables should be re-read against that before the tables die.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `resolveAgentScaffoldSpecs` | function | UI:POST /api/teams, UI:POST /api/users, UI:GET+PATCH /api/users/:userId/assistant, AGENT:create_team, AGENT:add_agent | MERGE | Agent-identity logic; folds into the org/teams service behind `persistScaffoldedAgents`. Ruling 1 strengthens: `user_assistant` is the per-teammate path OIDC provisioning calls, `team_scaffold` the per-team path of a multi-team org. |
| 2 | `readSystemPromptTemplateForRole` | function | UI:GET /api/agents/templates/:role (AgentEditor, AgentAddDialog, AgentDetailPane) + scaffold paths + demo fixture | KEEP | Core value: agent personas from `docs/system-prompts/` behind a live UI door; relocates to core-api, traversal-closed allowlist unchanged. |
| 3 | `AgentScaffoldRequest` | interface | INTERNAL — zero external importers; callers pass literals | DELETE | An exported request shape nobody imports; a 7-field union where every call null-pads 4 fields — fold into per-trigger parameters when the resolver moves. |
| 4 | `AgentScaffoldSpec` | interface | users.ts, tool-definitions.ts, org (redeclared locally) | MERGE | The owning service already carries a structurally identical local copy (`org/src/scaffold-agents.ts:75`); make that the single declaration, delete this duplicate. Ruling 3 does not launder duplicates. |
| 5 | `FactoryFacilitatorSpec` | interface | INTERNAL — types the literal only | PLUGIN | Ruling 3: a facilitator per community of practice is legitimate knowledge-management ritual — re-provide as the plugin's agent declaration (plugin-manifest terms, not this core interface). Leaves core either way; zero external importers even today. |
| 6 | `FactorySystemAssistantSpec` | interface | INTERNAL — types the literal only | DELETE | The assistant is machinery, not ritual — Ruling 3 does not apply. Two fields typing one inlined literal; zero external importers. |
| 7 | `FactoryRosterSpec` | interface | INTERNAL — only non-package mention is a doc comment | DELETE | The AK6 injection seam that never injects; `factory-state.ts` hardcodes the value it pretends to receive. A hardcoded seam is fiction — the plugin surface replaces it; nobody wants this shape in any form. |
| 8 | `FactoryAgentRef` | interface | BOOTSTRAP (factory-state.ts → factory-run-config.ts handoff) | DELETE | A `{id, role}` pair does not justify a package hop — inline the structural type in each face; duplicating two fields beats importing them. |
| 9 | `COMMUNITY_DISPLAY_NAMES` | const | BOOTSTRAP (factory-state.ts only) | PLUGIN | Ruling 3: the community vocabulary (Build/Product/Growth/Ops/Facilitation) is the ritual's naming and travels with the plugin. Leaves core; no UI surface in core remains. |
| 10 | `defaultFactoryRoster` | const | BOOTSTRAP (factory-state.ts only, hardcoded) | SIMPLIFY | Core shrinks to the assistant singleton inlined into `factory-state.ts` (`seed-agent-cos` load-bearing: coach.ts:43, knowledge factory-seed:31). The five facilitator entries are the plugin's preconfigured roster (Ruling 3), not discarded. |
| 11 | `SYSTEM_PROMPT_TEMPLATE_FILES` | const | factory-run-config.ts backfill loop (dead with facilitators out of core) + tests | DELETE | Export dies: sole surviving caller is `readSystemPromptTemplateForRole` in-module; the backfill loop it feeds can never match the assistant-only core roster by design. Map becomes module-internal; the `facilitator` row's fate rides the domain-model verdict on the role catalog. |

## Holes this leaves

- **Fresh core installs seed 1 agent, not 6.** Facilitators arrive by installing the practice-communities plugin. Ruling 1 framing: an org onboarding a team can install the plugin at setup; core stays clean.
- **The plugin does not exist yet, and no work package exists for it.** Until it is written, landing these deletes removes the ritual with no replacement. Sequencing call for the founder: extract-to-plugin in one move, or accept a gap. The rulings file already flags that a WP needs writing.
- **If the routine destroyer's revised verdict lands the sweeps as PLUGIN too** (it must, same ruling), the plugin carries agents + routines + triggers together and the `ownerRole: "facilitator"` orphaning problem disappears — owners and sweeps travel as one unit.
- **Seam signature change.** `persistScaffoldedAgents` (Mechanism C seam + its api-contract mirror) widens to accept the scaffold request; `tool-definitions.ts` create_team/add_agent shrink. Mechanical, net deletion.
- **Tooling repoints.** `tools/eval/src/seeding.ts:520` + `scenarios/builtin-routines.ts:72` and `tools/setup/src/demo-world/ids.ts:22` reference `seed-agent-pf-facilitation` — eval/demo install the plugin or seed their own facilitator.
- **Tests die with the package.** `framework/factory-defaults/src/__tests__/` (3 files) delete; roster/map assertions in `factory-and-demo`, `AF17-factory-bootstrap`, `X3-agent-config-bootstrap`, `X3-agents` integration tests shrink to the assistant-only seed; plugin-side seeding gets its own tests in the plugin's WP.
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


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/fw-harness-capability.md` for comparison.

# harness-capability — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

**Ruling A3 (per-model options → agent configuration)** is the only ruling that moves rows in this
package. The first wave killed the entire five-export option subsystem as producer-less. The ruling
splits it: the *pill path* (per-message composer toggling) stays dead, but the *option concept*
survives as part of the agent's configuration — an agent is configured once with how its model
should run.

| Export / site | Old verdict | New verdict | Ruling |
|---|---|---|---|
| `HarnessModelOptionDescriptor` (#10) | DELETE | **FINISH** → harness-protocol descriptor + AgentEditor | A3 — the harness's declaration of which options a model supports survives; its consumer moves from composer to agent config. `scope: "launch" \| "durable"` member still dies — per-message ("launch") scope is the pill concept. |
| `HarnessModelOptionControl` (#9) | DELETE | **FINISH** → harness-protocol | A3 — the control union is what tells AgentEditor which input to render (select/boolean/number/text). Survives with #10. |
| `HarnessOptionChoice` (#8) | DELETE | **FINISH** → harness-protocol | A3 — member of the `select` control arm; survives with #9. |
| `HarnessModelDescriptor.options` member (inside #11) | delete member | **keep member (FINISH)** | A3 — `models[].options` is the declaration channel: the harness declares per-model options on the same wire DTO AgentEditor already reads for the model dropdown. #11's verdict value stays SIMPLIFY; the member list changes. |
| `deriveComposerPills` + SessionView pill branch (feature kill #1 downstream) | DELETE | **DELETE — unchanged** | A3 explicitly: "As per-message composer pills they are not valuable. Delete the pill path." |
| `HarnessOptionControlKind` (#3), `HARNESS_OPTION_CONTROL_KINDS` (#15) | DELETE | **DELETE — unchanged** | A3 does not resurrect them. The control union's own `kind` discriminant is the vocabulary; the standalone union was never referenced even inside its own package, and the const's only consumer is a test asserting the literal back at itself. Validation of a submitted option value is per-descriptor (against the specific declared control), never against a kind list — no runtime iteration need exists. |

**Rows changed: 4** (#8, #9, #10 verdict-value changes; #11 member-level change). Everything else
stands at full strength.

**Ruling 1 (shared backend, OIDC) — re-judged, no row moves.** None of this package's kills rested
on a single-user premise. `HarnessAccessMode` is written-at-every-construction, read-by-zero-files —
dead on any user count. The runtime-capability badges display crossed wires (`toolUse ←
preCompactionTrigger`, `fileEditing ← subAgents`, agent-profile.ts:214,218) — wrong for one user and
wrong for a team of twenty. `"sdk-inprocess"`/`"soft-continue"` are declared by zero adapters —
adapter count doesn't scale with humans. `derivePrimaryHarness` serves SetupFlow team creation,
which a multi-team org runs *more*, not less — MERGE into core-ui stands. The shared-backend premise
actually *strengthens* A3's reshape: per-agent options configured once server-side are shared team
state; per-message pills would have been per-human ephemera.

**Ruling 2 (events) — N/A.** This package declares no event types.

**Ruling 3 (knowledge ritual → plugin) — N/A.** Nothing here is ritual-about-the-work; no PLUGIN
verdicts.

### Per-model options as agent configuration

**Where the concept lives — nothing invented, every piece exists today:**

- **Storage:** `agent_run_config` table, sole reader/writer
  `layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts`. It already holds
  exactly the sibling facts (`harnessType`, `modelTierPreference`, `modelId`, `modelProvider`) —
  "how this agent's model should run" is this table's one sentence. Add one nullable jsonb column
  `model_options` (`Record<string, string | number | boolean> | null`). `null` ≡ no overrides,
  preserving the store's absent-row ≡ all-null invariant (`DEFAULT_AGENT_RUN_CONFIG` gains
  `modelOptions: null`; `AgentRunConfigPatch`, `CONFIG_COLUMNS`, and the upsert's `"field" in patch`
  walk each gain the field).
- **Declaration:** the harness declares which options each model supports via
  `HarnessModelDescriptor.options` on the GET `/api/harnesses` wire DTO — the field that exists
  today and that every production construction site writes as `[]`
  (harness-discovery.ts:101,141,762,801; harness-capability-descriptors.ts:87). FINISH means a first
  real producer: at least one adapter declares a real option (the obvious candidate: a
  thinking/reasoning-budget select on the builtin or claude adapter).
- **Edit surface:** `layers/core-ui/src/settings/AgentEditor.tsx`. It already selects the
  descriptor and derives the model dropdown from `descriptor.models` via
  `model-options-for-harness.ts` (AgentEditor.tsx:142-143). When the selected model's `options` is
  non-empty, render one control per `HarnessModelOptionDescriptor` (`control.kind` picks the
  input), prefilled from `runConfig.modelOptions ?? defaultValue`.
- **Write path:** PATCH `/api/agents/:id` (`layers/core-api/src/routes/agents.ts`), which already
  builds an `AgentRunConfigPatch` with `"field" in body` semantics (line 125 pattern). Validate the
  submitted map against the selected model's declared descriptors — unknown key or value violating
  its control (bad choice, out-of-range number) → 400 — mirroring the existing AH2
  (harness, provider, modelId) triple validation at line 248.
- **Resolution:** the provisioner already reads the run config at provisioner.ts:923 and resolves
  model facts into session start. Pass `runConfig.modelOptions` through to the adapter's
  session-start params. The `HarnessAdapter` contract (harness-protocol/harness-adapter.ts) has
  **no options input today** (`rg modelOptions` → zero hits) — adding that parameter is part of the
  FINISH, and each adapter maps recognized keys onto its real invocation (CLI flag, settings file,
  API param).
- **What is NOT rebuilt:** no per-message override, no composer surface, no session-scoped option
  state. `scope` disappears from the descriptor — every option is durable agent config.

**Build list (the FINISH, concretely):** 1 jsonb column + store plumbing; descriptor validation in
the PATCH route; AgentEditor option controls; adapter start-param + per-adapter mapping; one real
declared option to prove the wire end-to-end. Until the first adapter declares an option, the UI
renders nothing new — the feature lights up per-harness as declarations appear, which is the correct
producer-first ordering the first wave found violated (UI machinery existed, producer never did).

---

## Where does this package go?

**Verdict: MERGE → `framework/harness-protocol`** (the one runtime function merges the other way,
into `core-ui`). Unchanged by the rulings — the surviving option types are *declaration-side* (part
of the descriptor the harness serves), so they move with the descriptor into harness-protocol; the
chosen *values* live in `agent_run_config`, which is a table, not a type home.

This package is not a package. It is 13 type declarations, 1 const, and one 9-line function.
`harness-protocol` — the adapter contract — imports six of the thirteen types to define its own
surface. The two packages describe one noun: *what a harness is and can do*. They were split in AU34
solely to break an import cycle; inside one package that cycle is just file imports, and the
file-level graph is already acyclic. A package boundary whose only job is cycle bookkeeping is
tidiness, not core value.

The one reason this package exists apart from harness-protocol: `core-ui` and `conversation-parts`
want descriptor types without the adapter machinery. But every one of their imports is
`import type` — zero runtime cost. Keeping a whole package so a UI `package.json` stays prettier is
exactly the invented boundary the brief names.

**On the three-package question:** harness-capability and harness-protocol are **one thing** —
merge them, no hesitation. tool-protocol is a different noun (tools, not harnesses) — no claim it
must join.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/harness-capability"` → 8 production consumers (rest are tests/stories):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `framework/harness-protocol` (harness-adapter.ts, read-model) | `HarnessAccessMode`, `HarnessAuthActionDescriptor`, `HarnessDiscoveryStatus`, `HarnessModelDescriptor`, `ReturnEnforcementChannel`, `HarnessCapabilityDescriptor` | **Yes — this is the merge target.** |
| `layers/agent-execution/harness-registry` (5 files) | descriptor + readiness + enforcement types | No — execution layer; imports harness-protocol already. |
| `layers/agent-execution/src/boot.ts` | `ReturnEnforcementChannel` (type) | No — same. |
| `layers/agent-orchestration/run-orchestration/provisioner.ts` | `ReturnEnforcementChannel` (type) | No — same. |
| `layers/core-api/routes/harnesses.ts` | `HarnessCapabilityDescriptor` (type) | No — wire producer, not owner. |
| `layers/core-ui` (7 files) | `HarnessCapabilityDescriptor` (type), `derivePrimaryHarness` (runtime) | Owns `derivePrimaryHarness` (sole caller: SetupFlow). |
| `framework/conversation-parts/part.ts` | option types for `deriveComposerPills` | Dies with the pill path — the surviving option types' consumer is AgentEditor (core-ui), not conversation-parts. |
| `framework/domain-model` | none (reverse dependency) | — |

## If written today, from scratch

Against the corrected premise — a shared backend serving a team and an org of teams, identity via
OIDC, an event stream plugins hang off — one file in `framework/harness-protocol` next to
`harness-adapter.ts`:

- `HarnessCapabilityDescriptor` — the GET /api/harnesses wire DTO the shared backend serves to
  every team member's client (shrunk: no `accessMode`, no `runtime`, one `modelProviders`)
- `HarnessDiscoveryStatus` + `HarnessReadinessState` — row greying and the disable toggle; these
  are server facts about the backend's harness pool, identical for every viewer
- `HarnessAuthActionDescriptor` — the auth CTA (kind, label, command only)
- `HarnessModelDescriptor` — model pickers (id, label, provider, selectable, **options**)
- `HarnessModelOptionDescriptor` / `HarnessModelOptionControl` / `HarnessOptionChoice` — the
  harness's declaration of per-model knobs; rendered once, in agent configuration, by whoever on
  the team administers the agent; values stored per-agent in `agent_run_config`
- `ReturnEnforcementChannel` — 5 members, the one capability the system genuinely branches on
- `derivePrimaryHarness` → a private helper inside `core-ui/src/pages/SetupFlow.tsx`

The package `framework/harness-capability` does not exist. No standalone control-kind union, no
exported kind const, no per-message option scope, no composer pill derivation.

## Kill summary (revised)

| Verdict | Count |
|---|---|
| DELETE | 4 |
| FINISH | 3 |
| MERGE | 2 |
| SIMPLIFY | 4 |
| KEEP | 2 |

15 rows total. Surface: 15 exports → 9 surviving declarations, all relocated into
`harness-protocol` (plus one function inlined into core-ui). Package count: −1. First wave cut 60%;
the ruling converts three of those cuts into FINISH work with a named home.

## Feature-level findings

**1. Per-model options — pill path DELETE, option concept FINISH (reshaped by A3).**
The measured facts stand exactly as found: no production code has ever constructed a
`HarnessModelOptionDescriptor` — every `HarnessModelDescriptor` construction writes `options: []`
(harness-discovery.ts:101,141,762,801; harness-capability-descriptors.ts:87); the only non-empty
`options:` in the repo are a demo-world questionnaire and tests; `deriveComposerPills`
(conversation-parts/part.ts:721, consumed at SessionView.tsx:565) filters a permanently empty array
and redeclares its own local `RECOGNIZED_CONTROL_KINDS` rather than importing the exported const;
SessionView's pill row (~628-686) has never painted a pill. What changes is the disposition:
delete `deriveComposerPills`, the SessionView pill branch, `scope`, `HarnessOptionControlKind`,
`HARNESS_OPTION_CONTROL_KINDS`, and their tests — but keep the three descriptor shapes and the
`options` member, and FINISH them into agent configuration per the section above. What breaks
today: nothing observable — the UI paints identically until an adapter declares the first option.

**2. Runtime capability badges — DELETE, unchanged, and Ruling 1 does not soften it.**
`HarnessRuntimeCapabilities` is declared three times across three packages. On the descriptor it is
display-only; the exhaustive branch search found exactly ONE runtime branch in the repo
(provisioner.ts:1510 on `mcpSupport`) and it reads harness-protocol's own `HarnessCapabilities`,
not this type. The smoking gun: `core-api/routes/agent-profile.ts` maps
`toolUse: caps.preCompactionTrigger` (line 214) and `fileEditing: caps.subAgents` (line 218) — the
UI has displayed the WRONG flags indefinitely under "rough proxy" comments and nobody noticed,
because no decision hangs on them. A whole team seeing wrong flags is worse than one founder seeing
them. Kill `HarnessRuntimeCapabilities`, the descriptor's `runtime` field,
`provenCapabilities`/`capabilitySummary` badge plumbing, `mapCapabilities` +
`AgentHarnessCapabilities` (domain-model copy), and the badge rows. Keep `mcpSupport` and
`returnEnforcement` on harness-protocol's `HarnessCapabilities` — the two members with real
branches.

**3. Dead enforcement channels — DELETE, unchanged.** `"sdk-inprocess"` — declared by zero
adapters; its own doc comment says "dead"; provision-return-hook.ts:78 keeps a no-op case for
nothing. `"soft-continue"` — declared by zero production adapters (cursor-agent derives to
`"none"` via cli-harness-adapter.ts:338-340); referenced only by tests. Union shrinks 7 → 5.

## Full export audit (revised)

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `derivePrimaryHarness` | function | UI:SetupFlow (team creation) | MERGE | Sole caller is SetupFlow.tsx — 9 lines with a hardcoded stale-model fallback (`"claude-sonnet-4-6"`); inline into core-ui. Ruling 1 re-check: team creation exists per team in a multi-team org — used more, not less; MERGE stands. |
| 2 | `ReturnEnforcementChannel` | type | AGENT: provisioner.ts:1456 → provision-return-hook dispatch; declared by every adapter | SIMPLIFY | The one genuinely load-bearing capability. Drop dead members `"sdk-inprocess"` + `"soft-continue"` (feature #3); relocate beside `HarnessCapabilities.returnEnforcement` in harness-protocol. |
| 3 | `HarnessOptionControlKind` | type | DEAD | DELETE | Zero references anywhere, including inside its own package — `HarnessModelOptionControl`'s `kind` discriminant respells the literals. A3 does not resurrect it: the surviving control union carries its own vocabulary. |
| 4 | `HarnessAccessMode` | type | DEAD (written, never read) | DELETE | Every descriptor construction stamps it; `.accessMode` read by zero production files. Premise-free — dead at any user count. Delete type + descriptor field + `HarnessCapabilities.accessMode` + construction sites. |
| 5 | `HarnessReadinessState` | type | UI:/settings harnesses + SetupFlow (row greying, CTA gating) | KEEP | Discovery produces it, the UI branches on it — real runtime-tested capability. Moves to harness-protocol. |
| 6 | `HarnessAuthActionKind` | type | INTERNAL (member of #7 only) | MERGE | Inline the union into `HarnessAuthActionDescriptor.kind`, stop exporting. |
| 7 | `HarnessAuthActionDescriptor` | interface | UI: SetupFlow.tsx:107-108, SettingsHarnesses.tsx:148, harness-presentation.ts:98,191 | SIMPLIFY | `kind`/`label`/`command` branch the auth CTA — real. `description` and `credentialNames` written (harness-discovery.ts:707-726), read by nobody — delete both members. Moves to harness-protocol. |
| 8 | `HarnessOptionChoice` | interface | member of #9's `select` arm | **FINISH** | **Was DELETE — Ruling A3.** Survives as part of the select control's declaration shape; consumer becomes AgentEditor. Moves to harness-protocol with #9/#10. |
| 9 | `HarnessModelOptionControl` | type | member of #10 | **FINISH** | **Was DELETE — Ruling A3.** The discriminated union that tells AgentEditor which input to render. Moves to harness-protocol. |
| 10 | `HarnessModelOptionDescriptor` | interface | producer-less today: every production `options:` write is `[]` | **FINISH** | **Was DELETE — Ruling A3.** The harness's per-model option declaration. FINISH = first real adapter declaration + AgentEditor controls + `agent_run_config.model_options` column + PATCH validation + provisioner→adapter pass-through (see "Per-model options as agent configuration"). Member `scope: "launch" \| "durable"` DIES — per-message scope is the pill concept; all options are durable agent config. `required` dies with it — agent options are overrides atop `defaultValue`. |
| 11 | `HarnessModelDescriptor` | interface | UI: AgentEditor model dropdown (model-options-for-harness.ts:39, AgentEditor.tsx:142), SetupFlow, SettingsHarnesses | SIMPLIFY | `id`/`label`/`provider`/`selectable` read today; **`options` now survives as the declaration channel (A3)** — was slated for member deletion. `contextWindow` (copied at descriptors.ts:84, read nowhere) and `inheritedFromGateway` (written, read nowhere) still die. Moves to harness-protocol. |
| 12 | `HarnessRuntimeCapabilities` | interface | display-only badges; zero runtime branches on the descriptor copy | DELETE | Feature #2. Crossed-wire badge mapping shipped unnoticed — proof the display carries no value. Ruling 1 re-check: wrong flags shown to a whole team are still wrong flags; DELETE stands. |
| 13 | `HarnessDiscoveryStatus` | interface | UI: settings/setup greying, toggle, disabled stamp (AM4) | KEEP | `state`/`disabled` branched on in harness-presentation; route stamps `disabled` from server_config. Moves to harness-protocol. |
| 14 | `HarnessCapabilityDescriptor` | interface | UI: GET /api/harnesses wire DTO → SetupFlow, SettingsHarnesses, SettingsAgents, AgentEditor, SessionView | SIMPLIFY | The package's actual product surface. Shrink: drop `accessMode` (#4), drop `runtime` (#12), collapse the duplicate provider lists to one. `models[].options` stays (A3). Moves to harness-protocol. |
| 15 | `HARNESS_OPTION_CONTROL_KINDS` | const | TEST-ONLY (own package's descriptor test) | DELETE | Only reference outside its declaration is its own test asserting the literal back at itself; part.ts redeclared a private copy rather than import it. A3 does not need it: option-value validation is per-descriptor against the specific control, never against a kind list. |

## Types / DI ports

No DI ports. All 13 declarations verdicted above. Parallel copies that die with #12:
`AgentHarnessCapabilities` (framework/domain-model/src/agent-profile.ts:93-100) and
`mapCapabilities` (core-api/routes/agent-profile.ts:202-221). `HarnessCapabilities`
(harness-protocol) survives as the single flags home, shrunk to the branched-on members.

## Holes this leaves

1. **Settings/AgentProfile capability chips disappear** (feature #2). Two of the four were mapped
   from the wrong source flags; the honest replacement is nothing.
2. **Composer pill machinery gone; option surface moves to AgentEditor** (feature #1, reshaped).
   Until the FINISH lands and a first adapter declares an option, no option UI exists anywhere —
   which is exactly today's observable state. A user wanting a per-message override has no path;
   that is the ruling's explicit trade (configure the agent, don't toggle the message).
3. **The FINISH is real work with a schema migration** — `agent_run_config` gains a column, the
   PATCH route gains descriptor validation, the adapter contract gains a start param, and at least
   one adapter must map recognized keys onto its real invocation. Until an adapter maps a key,
   a stored option is written-never-consumed — the same disease this audit kills elsewhere. The
   pass-through must land in the same work package as the first declaration, or the FINISH just
   rebuilds dead machinery one layer lower.
4. **core-ui and conversation-parts gain a `@hyperidle/harness-protocol` dependency** for type-only
   imports. Zero runtime weight. If governance forbids the edge, fallback: a single
   `harness-descriptor.ts` file inside harness-protocol, never a package.
5. **`"soft-continue"` removal** — a future spawnable cursor-agent re-adds one union member and one
   case arm, earned when cursor actually spawns.
6. The two in-package test files die with the package; descriptor-shape coverage lives where it
   really lives — adapter and route tests that construct descriptors. The FINISH brings new tests
   at the real seams: PATCH validation, store round-trip, adapter param mapping.


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


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/fw-http-middleware.md` for comparison.

# http-middleware — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

The first wave killed all four security features. One of its arguments — "a solo founder's agents
hammering their own API is the product working, not an attack" and "a product whose main deployment
is localhost" — is voided by Ruling 1. Each of the four was re-reached separately against the
corrected premise: a shared backend for a team and an organisation of teams, reachable over a
network, identity from OIDC.

| Row | Old verdict | New verdict | Ruling | Why it moved (or did not) |
|---|---|---|---|---|
| `constantTimeStringEqual` | DELETE | **KEEP** | Ruling 1 | The ONLY row whose kill rested on the voided premise. First-wave reason was explicitly "main deployment is localhost" — no longer true. Four call sites compare long-lived static secrets (admin API key x3, worker WS token x1) against attacker-supplied input at a network boundary that now, by ruling, serves an org over a network — including LAN distances, where timing recovery of a prefix-compare is the demonstrated case, not the hypothetical one. Full argument in the audit table. |
| `createRateLimiter` | DELETE | DELETE (**reason replaced**) | Ruling 1 | Verdict survives, but not for the first wave's reason. "Throttling the user's own agents" is void. The surviving reasons: (a) still preemptive — no flood has ever occurred, no learning earned it (ethos); (b) the implementation is wrong-shaped for the corrected premise it would need to invoke: it runs pre-auth, keys on `X-API-Key` → proxy header (env-gated) → direct address, and never sees an OIDC/Bearer principal — behind a reverse proxy without `HYPERIDLE_TRUST_PROXY` the entire team collapses into ONE shared bucket, so one teammate's runaway agent 429s everyone. A shared-backend limiter, if a flood ever teaches us to build one, is per-authenticated-principal and mounted post-auth. This code is not that and cannot become it. |
| `requireBoundary` | DELETE | DELETE (unchanged) | — | Kill never rested on user count. Prod behavior of the pair is a log line (source: "Production: log only. Lint is the real gate."); dev behavior duplicates the `require-boundary-declaration` lint rule; gate-by-default classifier shape the ethos forbids. True at any user count. |
| `failClosedAssertion` | DELETE | DELETE (unchanged) | — | Same feature, same reason. Multi-user makes the REAL authz (`authorizeRead`/`authorizeWrite` in handlers, identity from OIDC per Ruling 1/A7) more load-bearing — and that lives in handlers, untouched by this deletion. A stamp that only logs protects nobody, whether one human or fifty. |
| `createBodyLimit` | DELETE | DELETE (unchanged) | — | Kill reason was user-count independent: preemptive I2 cap, streaming-drain branch written to satisfy a test, nothing real ever hit it. The hole is repriced (an OOM now downs the team's backend, not one person's) — see Holes — but the ethos order stands: the earned fix is a 10-line Content-Length check when it actually hurts. |
| `RateLimiterOptions` | DELETE | DELETE (unchanged) | — | Dies with the limiter. |
| Kill summary / top-line | 8 DELETE / 9 KEEP, 45% cut | 7 DELETE / 10 KEEP, 41% cut | Ruling 1 | One row moved DELETE → KEEP. Package still dissolves to 0. |

Rulings 2 and 3 do not touch this package: it declares no event types and contains no
knowledge-ritual machinery. No PLUGIN or FINISH rows. (A7's FINISH — OIDC on the shared backend —
will reshape the auth *middleware* in core-api and the auth-identity members of `HyperIdleEnv`;
noted on that row, work belongs to the A7 finisher, not this verdict.)

Verdict changes: **1 row** (`constantTimeStringEqual`). Reason replaced, verdict unchanged: **1 row**
(`createRateLimiter`). All other 20 rows stand as first-waved.

## Where does this package go?

**Verdict: SPLIT then dissolve — DELETE the package.** Unchanged.

- **Security ceremony → DELETE** (6 of 22 exports now, was 8): the AF11 boundary pair + its 2 types,
  the rate limiter + its options type, the body cap. All preemptive walls from I2/AF11 hardening,
  earned by no incident — and the one of them a shared backend could have justified (the limiter) is
  built in a shape the shared backend cannot use (pre-auth, principal-blind).
- **Wire/boundary contract → `framework/domain-model`**: the explicit-start projection family
  (2 fns + 4 types after merge), `validateBody`/`ValidatedJson`, `HyperIdleEnv`, and now
  `constantTimeStringEqual`. The timing-safe compare has genuinely dual-layer consumers —
  `core-api` (auth middleware, users, workers) and `agent-orchestration/run-orchestration`
  (worker-ingress), which may not import each other; its own `@lore AU26` records that a hand-rolled
  duplicate in worker-ingress was exactly the drift already learned from and deleted once. That is a
  real learning, which is the ethos currency — do not re-create the duplicate by inlining.
  domain-model already holds `ApiErrorResponse`/`API_ERROR_CODES`, the shapes these render.
- **Mount recipe → `layers/core-api`**: `composeApiApplication` + its 2 option types move next to
  `api-middleware-stack.ts`. Its only two consumers (desktop + remote-server `create-server.ts`)
  already import core-api.

Why not STAYS SHARED: after the kills, every survivor is a wire/context/boundary **contract**, not
middleware. A package named http-middleware whose middleware is all dead is a boundary invented for
tidiness. Two real homes already exist.

## Consumers (measured, not assumed)

Unchanged from first wave — `rg -a -l "@hyperidle/http-middleware"` → 67 files. One row updated:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api` (29 route files + stack + auth + app) | `requireBoundary`, `validateBody`, `createRateLimiter`, `createBodyLimit`, `constantTimeStringEqual`, `failClosedAssertion`, `HyperIdleEnv`, projection fns | Gets `composeApiApplication`; rest from domain-model |
| `layers/agent-orchestration` (6 route files + app + boot) | `requireBoundary`, `validateBody`, `createRateLimiter`, `createBodyLimit`, `HyperIdleEnv`, projection fns | Shared survivors ride domain-model, which it already imports |
| `layers/agent-orchestration/run-orchestration` | `constantTimeStringEqual` only | **REVISED:** follows the symbol to domain-model (was: "inlines `===`"). The AU26 lore on this exact file is why it does not get a private copy. |
| `layers/agent-execution/harness-registry` (`mcp-route.ts`) | `requireBoundary` only | Dependency vanishes entirely |
| `applications/desktop`, `applications/remote-server` | `composeApiApplication` only | Import it from core-api, which they already boot |
| `tools/eval` | `HyperIdleEnv` (type-only) | Follows the type to domain-model |
| `framework/api-contract` | comment-only mention (hand-mirrored types, no import) | n/a |
| `framework/domain-model` | TEST-ONLY: `src/http/__tests__/rate-limit.test.ts` tests this package's limiter | Misplaced leftover; dies with the limiter |
| `tools/eslint-plugin-authz` | references the NAME `requireBoundary` in 2 lint rules | Rules die or get re-keyed (see holes — repriced) |

## If written today, from scratch

Written against the corrected premise: a shared backend serving a team and an org of teams over a
network; humans identified by OIDC; agents and workers identified by long-lived keys/tokens; every
event on a stream plugins hang off.

Nothing called "http-middleware" would exist. You would write:

- `domain-model/src/http/`: `validateBody` (typed 400s in the canonical error shape),
  `HyperIdleEnv` (the authenticated context both apps run on — its identity members become
  OIDC-shaped under A7), `projectExplicitStartOutcome` + `sendStartProjection` (the one wire
  contract for `POST /api/sessions` / `GET /api/sessions/starts/:id`), and
  `constantTimeStringEqual` (the correct spelling of "compare a static secret to attacker input on a
  network boundary" — you would write it on day one of a networked deployment because it is a
  property of the compare, not a wall in front of it: zero gates, zero friction, zero classifier,
  28 lines).
- `core-api/src/compose-api-application.ts`: the ~35-line mount recipe (probe-proven `notFound`
  trap + pre-auth/auth ordering — the one copy earned its keep by breaking twice as hand-copies).

Still no rate limiter — when a real flood on the shared backend teaches us, the buy-back is a
per-principal limiter mounted post-auth, which today's pre-auth principal-blind one is not. Still no
body cap — the earned fix is a Content-Length check, not a 127-line streaming drain. Still no
boundary stamps — if a static authz net is wanted for a multi-team backend, it is a lint rule that
detects `authorize*` calls directly, with no runtime ceremony on 43 routes.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| PLUGIN | 0 |
| FINISH | 0 |
| MERGE | 1 |
| SIMPLIFY | 4 |
| KEEP | 10 |

Surface: 22 exports → 13 (41% cut), **package count → 0** (survivors absorbed into domain-model +
core-api). First wave was 22 → 12 (45%); the difference is one row, `constantTimeStringEqual`,
moved by Ruling 1.

## Feature-level kills

1. **AF11 boundary-declaration ceremony — kill it all. Unchanged, ruling-proof.** `requireBoundary`
   is stamped on 43 production route files; `failClosedAssertion` then checks the stamp. In
   production it **only logs** — the source says "Lint is the real gate." The runtime pair is a
   dev-mode duplicate of a static lint check — a gate-by-default classifier the ethos forbids, at
   any user count. Kills: both functions, 2 types, the `__boundary` member of `HyperIdleEnv`, one
   middleware slot per composition root, 43 call-site stamps, `http-access-boundary.test.ts`. The
   two `tools/eslint-plugin-authz` rules keyed off the name: see hole 4 — the static net is worth
   re-keying on a shared backend, but re-keyed on `authorize*` presence, never on a runtime stamp.
2. **Rate limiting — kill the whole feature. Verdict unchanged, reason replaced (Ruling 1).** One
   global limiter, an `/auth/*` mint limiter, and five per-route limiters. The first wave's "own
   agents" argument is void. What kills it now: no flood has ever occurred (preemptive per ethos),
   and the implementation cannot serve the shared premise — it runs pre-auth, keys on API-key
   header or client address, never on the OIDC principal, and behind a proxy without
   `HYPERIDLE_TRUST_PROXY` it funnels the whole team into one bucket, converting one runaway agent
   into a team-wide 429 outage. The mint limiter guards `/auth/*` — home-grown login/session
   machinery that Ruling 1 deletes in favor of OIDC; its mount dies with its ward. Kills:
   `createRateLimiter`, `RateLimiterOptions`, `skipPaths` ceremony, `HYPERIDLE_RATE_LIMIT_PER_MIN`,
   the `rateLimit`/`authMintLimiter` stack fields, 7 mount sites, and the misplaced
   `domain-model/src/http/__tests__/rate-limit.test.ts`.
3. **Body cap — kill it. Unchanged, reason user-count independent.** 127 lines, half a hand-rolled
   chunked-stream early-abort drain the file admits is "rarely hit" — written to satisfy a test.
   Kills: `createBodyLimit`, the `bodyLimit` stack field, `HYPERIDLE_MAX_BODY_BYTES`, per-route
   mounts in filesystems (x3) and artifacts (x2), `body-limit.integration.test.ts`. Hole repriced
   below.
4. **Timing-safe compare — SPARED. This is the one Ruling 1 reverses.** The first-wave kill said
   "main deployment is localhost" — void. On the corrected premise the four compares guard the
   identity boundary of a network-reachable shared backend: shared-mode admin key
   (`auth.ts:200,219,246`), post-setup user-creation guard (`users.ts:125`), worker listing
   (`workers.ts:26`), worker WS token (`worker-ingress.ts:250`). With OIDC handling humans, these
   key/token compares are exactly the surviving identity mechanism for agents and workers — the
   thing Ruling 1 says a shared backend still needs. And it is not preemptive-security theatre: it
   erects no wall, gates nothing, adds zero friction and zero ceremony; it is the correct spelling
   of a compare that must exist anyway. Deleting it would not simplify the product by one visible
   feature — it would save 28 lines by deliberately weakening the one boundary everything else in
   this verdict leans on ("only the per-request auth check stands between a flood and the DB").
   KEEP; rides to domain-model with the other dual-layer survivors.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `requireBoundary` | UI:all 43 declared data routes | DELETE | Sets a context string nobody enforces in prod; runtime duplicate of a lint rule; ceremony on every route. Reason never rested on user count — stands under Ruling 1. |
| 2 | `failClosedAssertion` | BOOTSTRAP (mounted once per app) | DELETE | Prod behavior is a log line; dev behavior duplicates the lint gate. Real authz is `authorize*` in handlers and survives untouched. Stands under Ruling 1. |
| 3 | `createBodyLimit` | UI:/api/* (global) + filesystems/artifacts mounts | DELETE | Preemptive I2 cap; streaming branch exists for a test; nothing real ever hit it. User-count independent — stands; hole repriced. |
| 4 | `composeApiApplication` | BOOTSTRAP (desktop + remote-server create-server) | SIMPLIFY | Unchanged. Survives — probe-proven `notFound`/ordering fragility broke twice as hand-copies. Move to core-api; middleware param shrinks 6→3 fields (cors, errorHandler, auth). |
| 5 | `pendingStart` | INTERNAL + TEST-ONLY external | MERGE | Unchanged. Only production caller is `projectExplicitStartOutcome` in the same file — fold in, un-export. |
| 6 | `projectExplicitStartOutcome` | UI:POST /api/sessions + GET /api/sessions/starts/:id (both apps) | KEEP | Unchanged. One wire contract, two apps that may not import each other. Moves to domain-model. |
| 7 | `sendStartProjection` | UI:same two routes | KEEP | Unchanged. Render half of the same contract. Moves with #6. |
| 8 | `createRateLimiter` | UI:/api/* + /auth/* + 5 per-route mounts | DELETE | **Reason replaced (Ruling 1).** Preemptive — no flood ever occurred; and wrong-shaped for the shared premise: pre-auth, principal-blind, collapses the team into one bucket behind a proxy. The earned buy-back, if ever, is per-principal post-auth — not this. |
| 9 | `constantTimeStringEqual` | BOOTSTRAP (auth middleware) + UI:users/workers routes + worker WS upgrade | **KEEP** | **CHANGED DELETE → KEEP (Ruling 1).** Old reason "deployment is localhost" is void. Guards static-secret compares on a network-reachable org backend, on both sides of the core↔agent boundary; the surviving non-OIDC identity check per Ruling 1. No wall, no gate, no friction — 28 lines. AU26 lore already proved inlined copies drift. Moves to domain-model. |
| 10 | `validationHook` | INTERNAL only — zero external references (rg-confirmed) | SIMPLIFY | Unchanged. "Exported for use in tests" that don't exist. Un-export; private detail of `validateBody`. |
| 11 | `validateBody` | UI:17 files across both layers | KEEP | Unchanged. Typed bodies + canonical 400 shape at every write route; genuinely dual-layer. Moves to domain-model. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `BoundaryKind` | DELETE | Unchanged. Dies with `requireBoundary`. |
| `BoundaryDeclaration` | DELETE | Unchanged. One-member interface wrapping a string union — indirection even while alive. |
| `ComposedApiMiddleware` | SIMPLIFY | Unchanged. Survives as `composeApiApplication`'s param; shrinks 6→3 fields (`rateLimit`, `bodyLimit`, `failClosed` die). |
| `ComposeApiApplicationOptions` | KEEP | Unchanged. Signature of the surviving compose fn; moves to core-api. |
| `HyperIdleEnv` | SIMPLIFY | Unchanged verdict. Drop the `__boundary` member; move to domain-model. Note: its auth-identity Variables (`loginSessionId` etc.) get reshaped by A7's FINISH (OIDC) — that is the finisher's work, not a reason to hold the move. |
| `ExplicitStartRow` | KEEP | Unchanged. Structural row contract of the surviving projection. |
| `PendingStartBody` | KEEP | Unchanged. Member of the surviving union. |
| `StartFailureBody` | KEEP | Unchanged. Same family. |
| `ExplicitStartProjection` | KEEP | Unchanged. Return type of both surviving projection fns. |
| `RateLimiterOptions` | DELETE | Unchanged. Dies with the limiter. |
| `ValidatedJson` | KEEP | Unchanged. Carries `z.output<T>` typing through `validateBody`. |

## Holes this leaves — repriced for a shared backend

1. **No flood protection anywhere — repriced UP.** A runaway agent or an internet scanner against
   the shared backend gets served at line rate, and now the outage cost lands on a whole team, not
   one founder. Still killed: the ethos order is learn-then-build, and the deleted limiter would not
   have protected the team anyway (one shared bucket behind a proxy — the flood and the victims
   share a budget). When a real flood happens, build the per-principal post-auth limiter that
   incident specifies.
2. **Unbounded request bodies — repriced UP.** A multi-GB POST buffers into memory; possible OOM now
   takes down every team's backend at once. If hit, the fix is a 10-line Content-Length check, not
   the 127-line streaming drain.
3. **API-key compare timing — CLOSED.** First wave priced this as "the one DELETE a founder might
   veto." Ruling 1 is that veto. Kept, relocated to domain-model; no hole remains.
4. **No mechanical check that a new data route wires authorization — repriced UP, and re-scoped.**
   Both eslint-plugin-authz rules key off the `requireBoundary` name and lose their anchor when the
   ceremony dies. On a multi-team backend a missed `authorize*` call now exposes another team's
   data, so a static net is worth having — but as a lint rule that detects `authorize*` presence in
   route handlers directly. The runtime stamp on 43 routes buys nothing toward that and stays dead.
   Re-keying the rule is small, static, and gate-free; recommend scheduling it with A7's FINISH,
   where the authz surface gets touched anyway.
5. **domain-model's purity erodes — slightly more than first wave.** It gains runtime `hono` +
   `@hono/zod-validator` usage and now a `node:crypto` import (timing-safe). All server-only; the
   web bundle must tree-shake or the http exports go on a subpath. Fallback if the founder rejects
   the merge: keep a gutted 13-export http-middleware — still a 41% surface cut and three of four
   security features dead.
6. **Mechanical churn:** 43 route files drop one middleware argument; 7 limiter mounts, 5 body-cap
   mounts, 3 package-local test files, 1 misplaced domain-model test deleted; 2 lint rules deleted
   or re-keyed; 4 `constantTimeStringEqual` call sites keep their import, respelled to domain-model.
   All deletions plus import respelling — no new code.


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


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/knowledge.md` for comparison.

# knowledge — destroyer verdict (REVISED after founder rulings)

Revision of `verdicts/knowledge.md`. Vocabulary now includes `PLUGIN` (delete from core, re-provide
as a plugin) and `FINISH`. Same no-sampling standard: all 42 function rows + 1 class + 15 type rows.

## What changed after the rulings

The line Ruling 3 demands, drawn through this service:

- **The store** (core): create/update/get/list/search/archive, deliberate `promote` and
  `changeScope` acts, the draft→human-accept triage flow, conflict capture, and
  `assembleSessionKnowledge`. This is the machinery of a team and its agents building and using
  shared knowledge as they work.
- **The ritual** (leaves core): everything scheduled or automated *about* that knowledge —
  attention scoring, the auto-promotion pipeline, stale decay, bet retros, the portfolio retro.
  These preconfigure routines + agent judgment, which is exactly the plugin surface.
- **Plain dead** (neither): relevance engine, access-log telemetry, flag resolver, factory seed,
  FTS, dead read variants. Re-examined per instruction; nobody would want these in any form —
  they stay DELETE.

The prompt's explicit re-examinations, answered:

| Convicted feature | Re-examined verdict | Why |
|---|---|---|
| Attention scoring | **PLUGIN** | "Scoring systems that decide what is important" — named ritual. Legitimate as a curation plugin's routine + agent judgment. The heuristic-weights implementation does not travel; the ritual does. |
| Relevance scoring | **DELETE** | Not ritual — denormalized machinery feeding one sort pill. A plugin wanting frequency/relevance hangs off the kept `knowledge_accessed` event, not this code. |
| Session ranking (`rank`) | **stays (MERGE)** | Not ritual — machinery of assembling session context. Never was convicted. |
| Promotion pipeline (sweep) | **PLUGIN** | "Promotion pipelines" — named ritual verbatim. Contradiction detection inside it does NOT travel: provably dead (zero `meta.claims`/`meta.forbids` writers repo-wide), plain delete even in the plugin conception. |
| Stale decay (sweep) | **PLUGIN** | Scheduled lifecycle ceremony — same shape as promotion. |
| Access telemetry | **DELETE** | Telemetry, not ritual. But see Ruling 2 correction below: the event survives, the log dies. |
| Flag resolution | **DELETE** | Dead door end to end, and the honest re-provision is no machinery at all — a human asks an agent in conversation to fix an item. Nothing to preconfigure, so nothing to ship as a plugin. |

### Rows that moved

| # | Method | Old | New | Ruling |
|---|---|---|---|---|
| 1 | `recomputeAttention` | DELETE | **PLUGIN** | R3 — attention/importance scoring is curation ritual |
| 25 | `transition({recomputeAttention})` | DELETE | **PLUGIN** | R3 — agent score-override is the same ritual's door |
| 34 | `sweep("autoPromotion")` | DELETE | **PLUGIN** | R3 — promotion pipeline, named ritual |
| 35 | `sweep("stale")` | DELETE | **PLUGIN** | R3 — scheduled decay ceremony |
| 36 | `sweep` (impl) | DELETE | **PLUGIN** | R3 — dies from core with both kinds |
| 14 | `list({retroForBet})` | KEEP | **PLUGIN** | R3 — retros are named ritual; this variant exists only for the bet-retro reflection upsert (bets.ts:940) |
| 16 | `list({recentByLayers})` | KEEP | **PLUGIN** | R3 — portfolio retro is scheduled reflection; sole caller is `builtin:portfolio-retro` (routine-scheduler-bindings.ts:109) |

**7 verdict moves.** Plus two non-verdict corrections:

- **Ruling 2 correction — `knowledge_accessed` event is KEEP.** First wave killed it with the
  telemetry feature. Wrong: the event is emitted by the route itself
  (`layers/core-api/src/routes/knowledge.ts:497`), separately from the `recordAccess` log insert
  (`knowledge-repository.ts:1557`, which only writes `knowledgeAccessLog`). The fact — an item was
  viewed — keeps happening and keeps being announced; plugins (including a future relevance/frequency
  plugin) hang off it. The log table, `recordAccess`, `countAccesses`, `reapAccessLog` still die.
  The `knowledge_updated` payload *actions* `attention_recomputed`/`auto_promoted`/
  `contradiction_flagged`/`marked_stale`/`flagged` still retire — Ruling 2 does not protect payload
  values nothing sets once their features leave core; the event type `knowledge_updated` stays.
- **Row 8 `get(view:"full")` reach correction.** Its only caller is the bet-retro flow
  (bets.ts:954), which leaves core under Ruling 3. It survives anyway as the merge target of row 9:
  after the merge, the single joined view's door is `UI:GET /api/knowledge/:id`.

**Ruling 1 re-check:** none of the first-wave knowledge kills rested on a single-user premise —
nothing to un-kill. In the other direction it hardens four KEEPs: `recordConflict`/`findOpenConflict`
(multiple humans + agents editing the same item is the normal case on a shared backend),
`transition({changeScope})` (team/org scopes are the product, not decoration), `count({triageVisible})`
(a team's shared triage queue), and `assembleSessionKnowledge` (every agent of every team launches
with the *shared* fabric).

### What leaves core and becomes a plugin

One knowledge-curation-and-ritual plugin (or a small family). No work package exists yet — the
founder rulings note one needs writing. Per feature, what travels:

1. **Attention triage** — "surface knowledge that needs attention."
   - Core code deleted: `attention-service.ts` (463 lines), `attention-scoring.ts` (340),
     `attention-classifier.ts` (52), attention half of `scoring-config.ts`;
     `recomputeAttention`; `transition({target:"recomputeAttention"})`.
   - Routes deleted: `POST /api/knowledge/:id/recompute-attention`, `PATCH /api/knowledge/:id/attention-score`.
   - Agent tool travels: `score_attention` (`tool-definitions.ts:760-794`, `builtin-tool-catalog.ts:118`) —
     retired from the core catalog; the plugin preconfigures its curation agent instead.
   - Schema deleted: `knowledgeAppProjection.attentionScore` column.
   - Cross-service wiring deleted (flag to those audits): seam methods
     `recomputeAttentionScoreForItem` + `upsertKnowledgeAppProjectionAttentionScore`; routine port
     `recomputeAttentionForCandidates`; `review`'s `createReviewItemForKnowledge` +
     `attentionReviewReasoningMarker`; `work`'s `findItemByReasoningMarker`.
   - Plugin shape: a scheduled routine whose agent reads the fabric and opens reviews through
     existing review doors. No score column anywhere — the judgment lives in the agent.
2. **Auto-promotion** — nightly cross-scope promotion.
   - Core code deleted: `sweep("autoPromotion")` in `promotion-pipeline.ts`; the contradiction
     detector inside it is plain DELETE (dead logic, does not travel).
   - Routine travels: `builtin:knowledge-promotion` (`routine-scheduler.ts:160,476`,
     `routines-routes.ts:28`) — deleted from core seeds, re-provided as a plugin routine.
   - Plugin shape: routine + agent that reviews cross-scope duplicates and calls the kept
     `promote_knowledge` door. Promotion the *act* stays core (row 26).
3. **Stale decay** — 90-day lifecycle sweep.
   - Core code deleted: `sweep("stale")` in `promotion-pipeline.ts`.
   - Routine travels: `builtin:knowledge-decay` (`routine-scheduler.ts:149,473`, `routines-routes.ts:27`).
   - Status vocabulary shrinks with it: `stale` (and the other sweep-only statuses) leave
     `KnowledgeStatus`; the plugin marks items via archive or meta, not a core enum.
   - Plugin shape: routine + agent that re-verifies or archives old items through existing
     update/archive doors.
4. **Bet retro (knowledge side)** — reflection item upserted when a bet outcome is recorded.
   - Core code deleted: `list({retroForBet})` (`knowledge-repository.ts:705`); the reflection-upsert
     block inside the bet-outcome route (`bets.ts:~920-980` — create/update + meta snapshot logic;
     the bet-outcome write itself is bets machinery and stays — flag to the bets audit).
   - Plugin shape: trigger on the bet-outcome event (`bet_revised` is KEEP per Ruling 2 and is the
     natural hook once its emission is finished) + retro agent writing the reflection via
     `write_memory`.
5. **Portfolio retro** — monthly recent-knowledge digest.
   - Core code deleted: `list({recentByLayers})` (`knowledge-repository.ts:719`) and its binding
     (`routine-scheduler-bindings.ts:109`).
   - Routine travels: `builtin:portfolio-retro` (`routine-scheduler.ts:138,470`,
     `routines-routes.ts:26`) — the routine row belongs to the routine service's audit; flagged.
   - Plugin shape: monthly routine whose agent gathers recent knowledge through the kept
     `query_practice`/search doors.

## Should this service exist?

**KEEP AS the shared-knowledge store + session-context assembler — nothing else.** Unchanged from
the first wave, sharpened by the rulings: on a shared backend the fabric is the team's collective
memory and one of the product's three pillars. What is gone from core is now split honestly in two:
the ritual (attention, promotion pipeline, decay, retros) leaves as a plugin; the machinery that was
never ritual and never wanted (relevance, telemetry log, flag resolver, FTS, seed, dead variants)
just dies.

## If written today, from scratch

Against the corrected premise — a shared backend for a team and an organisation of teams, OIDC
identity, an event stream plugins hang off:

- `create`, `get` (summary / one joined view), `update`, `remove`, `list` (visible, titlesByIds,
  relatedByTopic, base), `search` (text only), `count` (triage badge)
- `transition` (two targets: `promote`, `changeScope`) — deliberate acts by a human or agent
- `recordConflict`, `findOpenConflict` — concurrent human+agent edits are the normal case
- `assembleSessionKnowledge` (with `rank` folded in as a private function)
- Every mutation and every view announces itself on the bus (`knowledge_created`,
  `knowledge_updated`, `knowledge_accessed`) — that event surface, not core tables, is where
  curation and retro rituals attach.

No scoring engines, no sweeps, no access log, no FTS, no flag resolver, no factory seed, no
retro-shaped read variants.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 14 |
| PLUGIN | 7 |
| MERGE | 2 |
| SIMPLIFY | 8 |
| KEEP | 11 |
| FINISH | 0 |

Surface: 42 function rows → 19 surviving core declarations (55% out of core; was 50%).
~4,620 lines → ~2,250 in core. Same 10 of 21 source files deleted outright; `promotion-pipeline.ts`
and the three attention files are now PLUGIN-fated rather than plain-DELETE-fated — either way they
leave `layers/core-api/knowledge`.

## Feature-level kills

1. **Attention engine — PLUGIN** (was DELETE). Everything listed in first wave leaves core: engine
   files, both routes, `score_attention` tool, seam methods, routine port, `attentionScore` column,
   `review`/`work` wiring. What breaks in core: nothing auto-surfaces "needs attention"; triage
   sorts by updatedAt. Re-provided as a curation plugin's routine + agent.
2. **Relevance engine — DELETE** (confirmed on re-examination). Not ritual; machinery for a sort
   pill that `rank` never reads. A future relevance plugin builds on the kept `knowledge_accessed`
   event, not on this code. What breaks: the "relevance" sort pill.
3. **Access telemetry — DELETE, minus the event** (Ruling 2 correction). `recordAccess`,
   `countAccesses`, `reapAccessLog`, the `knowledgeAccessLog` table and its reaper die — enterprise
   telemetry. The `knowledge_accessed` event type and its route emission
   (`routes/knowledge.ts:497`) are **KEEP**: the fact happens, plugins may listen. What breaks:
   accessCount display, frequency sort, lastActivityAt.
4. **Auto-promotion + stale sweeps — PLUGIN** (was DELETE). Both routines and both sweep kinds
   leave core, re-provided as plugin routines driving agents through the kept `promote_knowledge` /
   update doors. The contradiction detector inside the promotion sweep is plain DELETE — provably
   dead logic (zero `meta.claims`/`meta.forbids` writers), and the plugin uses agent judgment, not
   this code. Promotion as a deliberate act stays core.
5. **Bet-retro + portfolio-retro read variants — PLUGIN** (was KEEP). Retros are named ritual in
   Ruling 3. `list({retroForBet})` and `list({recentByLayers})` exist solely for them; both leave
   with the retro plugin. Cross-service: the bets route's reflection-upsert block and the
   `builtin:portfolio-retro` routine row are flagged to their owning audits.
6. **Flag → knowledge_action pipeline — DELETE** (confirmed). Dead door end to end since AD6; the
   honest re-provision is a conversation with an agent, which needs no plugin.
7. **FTS — DELETE** (unchanged). Both production callers pass `mode:"text"`; the default is dead.
8. **Factory knowledge seed — DELETE** (confirmed). Onboarding decoration, not ritual; the
   principle ships in ETHOS.md and system prompts. If starter practice-content is ever wanted, it
   is a plugin's job — but nobody wants this row.
9. **Dead read variants — DELETE** (unchanged): `get({view:"projection"})`, `list({exportable})`,
   `list({scope})` + `KnowledgeScope`.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `recomputeAttention` | UI:POST /api/knowledge/:id/recompute-attention (seam←AGENT:score_attention) + SCHED:builtin:knowledge-promotion | PLUGIN | R3: importance-scoring ritual; leaves core with tool, routes, column, routine port. Plugin = routine + agent judgment. |
| 2 | `ensureFactoryKnowledgeSeed` | BOOTSTRAP (factory-state.ts first boot) | DELETE | Not ritual — decorative onboarding row; principle lives in ETHOS.md. Empty fabric on install is honest. |
| 3 | `resolveKnowledgeActionRequest` | TEST-ONLY (sole caller POST /:id/flag — zero UI/seam callers since AD6) | DELETE | Dead door end to end; re-provision is a conversation with an agent, no plugin machinery needed. |
| 4 | `recordConflict` | UI:POST /api/knowledge/:id/conflicts (seam←AGENT:create_conflict_review + writeback) | KEEP | R1 hardens it: concurrent human+agent edits are the normal case on a shared backend; stops silent loss. |
| 5 | `findOpenConflict` | UI:GET /api/knowledge/:id/conflicts (seam←AGENT:create_conflict_review dupe check) | KEEP | Same door; one open conflict per agent per item. |
| 6 | `create` | UI:POST /api/knowledge + AGENT:write_memory + writeback + bets retro | SIMPLIFY | Core writer. Drop `attentionScore`/`confidence`/`meta` — the last core `meta` producer (bet-retro upsert) leaves under R3, making the shrink safe. |
| 7 | `update` | UI:PATCH /api/knowledge/:id (autosave) + writeback optimistic-lock + bets retro | SIMPLIFY | Core writer with version gate; same input shrink, same R3-enabled `meta` drop. |
| 8 | `get` (view:"full") | was UI:POST bets retro (bets.ts:954) — that caller leaves core (R3); post-merge door is UI:GET /api/knowledge/:id | KEEP | Survives as the single joined view (merge target of row 9); its retro caller departs with the retro plugin. |
| 9 | `get` (view:"detail") | UI:GET /api/knowledge/:id | MERGE | Into `full` — after score columns die, two joined views are one view. |
| 10 | `get` (view:"projection") | DEAD (zero production callers; rg-confirmed first wave) | DELETE | Nobody asks for layer+kind alone. |
| 11 | `get` (view:"summary") | UI:GET /api/knowledge/:id + seam version/status lookups + bets/threads routes | KEEP | The raw-row read; most callers. |
| 12 | `get` (impl) | — | SIMPLIFY | Two views survive (summary, full); switch shrinks 4→2. |
| 13 | `list` ({visibleWithSignals}) | UI:GET /api/knowledge/ (KnowledgeList + AppShell) | SIMPLIFY | Core list; signals die with telemetry/scores — becomes a plain visible-items list. |
| 14 | `list` ({retroForBet}) | UI:POST bets retro (bets.ts:940) — a ritual caller | PLUGIN | R3: bet-retro reflection is retro ritual; variant exists only for it. Plugin's retro agent writes via write_memory instead. |
| 15 | `list` ({titlesByIds}) | UI:threads route (threads.ts:472) | KEEP | Batched title resolve for knowledge references in threads. |
| 16 | `list` ({recentByLayers}) | SCHED:builtin:portfolio-retro (routine-scheduler-bindings.ts:109) | PLUGIN | R3: portfolio retro is scheduled reflection; sole caller is its routine. Plugin agent uses query_practice/search. |
| 17 | `list` ({exportable}) | DEAD (lore cites `server-factory.ts` — renamed, zero usage) | DELETE | Export machinery with no consumer; enterprise reflex. |
| 18 | `list` ({relatedByTopic}) | UI:GET /api/knowledge/:id (related items panel) | KEEP | Real detail-page feature. |
| 19 | `list` ({scope}) | DEAD (zero production callers) | DELETE | Leftover from deleted knowledge-reader; `KnowledgeScope` dies with it. |
| 20 | `list` (base ListFilters) | INTERNAL (assembleSessionKnowledge's fetchAllForLayer only) | SIMPLIFY | Drop `topic`/`kind` filters nobody passes. |
| 21 | `list` (impl) | — | SIMPLIFY | 8 variants → 4 (visible, titlesByIds, relatedByTopic, base) — two more leave than first wave, via R3. |
| 22 | `count` ({triageVisible}) | UI:GET /api/knowledge/triage-count (AppShell badge) | KEEP | Re-judged against R3: draft→human-accept is the machinery of building shared knowledge — a deliberate act, not scheduled ceremony. R1: it is the team's shared triage queue. |
| 23 | `search` | UI:GET /api/knowledge/search (seam←AGENT:query_practice) + UI:GET /api/search | SIMPLIFY | Both production callers pass `mode:"text"`; delete FTS mode + `fts.ts`. Text-only, no mode param. |
| 24 | `countAccesses` | UI:GET /api/knowledge/:id (accessCount display) | DELETE | Re-examined: telemetry, not ritual. Dies with the log; kill route field + display. |
| 25 | `transition` ({target:"recomputeAttention"}) | UI:PATCH /:id/attention-score (seam←AGENT:score_attention override) | PLUGIN | R3: score-override door of the attention ritual; travels with it. |
| 26 | `transition` ({target:"promote"}) | UI:POST /:id/promote (seam←AGENT:promote_knowledge) | KEEP | The deliberate act stays core; the automated pipeline (row 34) leaves. Conflict gate rides it. |
| 27 | `transition` ({target:"flag"}) | TEST-ONLY (POST /:id/flag has zero callers) | DELETE | Re-examined: dead door, and no plugin-worthy ritual behind it. |
| 28 | `transition` ({target:"changeScope"}) | UI:PATCH /:id/scope (ScopeChangeDialog) | KEEP | R1 hardens it: team/org scopes are the product on a shared backend. |
| 29 | `transition` ({target:"merge"}) | TEST-ONLY (zero UI/seam callers) | DELETE | Bulk-curation op nobody reaches. |
| 30 | `transition` ({target:"split"}) | TEST-ONLY (zero UI/seam callers) | DELETE | Same as merge. |
| 31 | `transition` (impl) | — | SIMPLIFY | 6 targets → 2 (promote, changeScope). |
| 32 | `remove` | UI:POST /api/knowledge/:id/archive (KnowledgeDetail) | KEEP | The archive path; only delete flavor the product needs. |
| 33 | `recordAccess` | UI:GET /api/knowledge/:id (log insert only — the event is emitted by the route, not here) | DELETE | R2-checked: the log write is telemetry and dies with the table; the `knowledge_accessed` EVENT stays (routes/knowledge.ts:497) as extension surface. |
| 34 | `sweep` ("autoPromotion") | SCHED:builtin:knowledge-promotion (daily 03:00) | PLUGIN | R3: promotion pipeline is named ritual. Routine leaves core with it. Contradiction detector inside is plain-dead and does not travel. |
| 35 | `sweep` ("stale") | SCHED:builtin:knowledge-decay (daily 02:00) | PLUGIN | R3: scheduled decay ceremony; routine leaves core with it. |
| 36 | `sweep` (impl) | — | PLUGIN | Both kinds leave core; whole `promotion-pipeline.ts` exits the package. |
| 37 | `rank` | INTERNAL (assembleSessionKnowledge only) | MERGE | Re-judged: session ranking is context-assembly machinery, not ritual. Fold in as private fn; drop dead `attentionScore`/near-constant `confidence`/writer-less `meta.tags` factors. |
| 38 | `recomputeRelevance` (itemIds) | EVENT:knowledge_accessed (relevance-listener only) | DELETE | Re-examined: not ritual — machinery for a sort pill `rank` never reads. Its input event stays for real plugins. |
| 39 | `recomputeRelevance` (signals) | TEST-ONLY (no production caller) | DELETE | Test-facing exposure of internals. |
| 40 | `recomputeRelevance` (impl) | — | DELETE | Whole relevance engine goes (service/engine/listener). |
| 41 | `reapAccessLog` | SCHED:retention reaper (service-bootstrap.ts:518) | DELETE | Re-examined: retention policy for telemetry — enterprise reflex, not ritual. |
| 42 | `assembleSessionKnowledge` | AGENT:every session bake (task_run/routine_run/reengagement/assistant resolvers via DI) + UI:threads route | KEEP | R1 hardens it: every agent of every team launches with the shared fabric. The core value. |

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
| `CreateKnowledgeItemInput` | SIMPLIFY | Drop `attentionScore`/`confidence`/`meta` — R3 removes the last core `meta` producer (bet-retro upsert), making the first wave's shrink actually true. |
| `UpdateKnowledgeItemInput` | SIMPLIFY | Same shrink, same R3 enablement. |
| `ListFilters` | SIMPLIFY | Drop `topic`/`kind` — nobody passes them. |
| `KnowledgeItemView` | SIMPLIFY | 4 views → 2 ("summary" \| "full"). |
| `KnowledgeItemWithProjection` | SIMPLIFY | Drop `attentionScore`/`confidence`/`meta` fields with their columns. |
| `PromoteTransitionResult` | KEEP | Result of the kept promote target. |
| `RecordAccessInput` | DELETE | Dies with recordAccess. |
| `SessionKnowledgeInput` | KEEP | Input of the kept assembler. |
| `KnowledgeLayer` | KEEP | The L0–L4 taxonomy — load-bearing across tools, UI, ranking. |
| `KnowledgeStatus` | SIMPLIFY | Collapse to draft / active / archived (+needs_human for triage). `stale` and the sweep-only states leave core with the ritual (R3); the plugin marks items via archive/meta, not a core enum. |
| `KnowledgeKind` | KEEP | 8 kinds used by write_memory, UI chips, retro reflections (plugin will keep writing kinds through write_memory). |
| `KnowledgeScope` | DELETE | Only consumer was dead `list({scope})`; core-api's barrel already dropped its re-export. |

Not in the input but resolved by the above: `rankAndBudget` module export (test-only, dies),
`SearchOptions`/`ExportableKnowledgeItemFilters` (die), `attention-scoring.ts`'s five exports
(leave with the attention ritual), `attachRelevanceListener` (dies), all of `fts.ts` (dies),
`token-budget.ts` (survives as a private helper of the folded rank).

## Holes this leaves

1. **Until the curation/retro plugin exists, the rituals are simply gone**: no bet-retro reflection
   item on outcome recording, no monthly portfolio digest, no attention triage, no auto-promotion,
   no stale decay. Lifecycle moves only when a human or agent moves it deliberately. The founder
   rulings note no work package exists for the plugin — one needs writing; its scope is the five
   features in "What leaves core and becomes a plugin".
2. **Fresh installs start with an empty fabric** — no seeded principle row (ETHOS.md and system
   prompts carry it).
3. **Knowledge list loses signals and sort pills** (frequency/relevance/attention); list and triage
   sort by updatedAt; detail loses accessCount.
4. **The knowledge_action session kind loses its only producer** (already unreachable) —
   session-requests can retire that intent kind in its own audit.
5. **Schema/wiring debt to collect**: drop `knowledgeAccessLog`; drop
   `knowledgeAppProjection.attentionScore`/`relevanceScore` (and `confidence`/`meta` once inputs
   shrink); **keep the `knowledge_accessed` event type and its route emission** (Ruling 2 — reverses
   first wave); retire the sweep-only `knowledge_updated` actions; delete
   `builtin:knowledge-decay`/`builtin:knowledge-promotion` seeds and retire `score_attention` from
   the core tool catalog (both re-provided by the plugin); delete the two attention seam methods.
6. **Cross-service flags** (other audits must pick these up): bets route's reflection-upsert block
   (`bets.ts:~920-980` — bet-outcome write stays, knowledge upsert leaves); `builtin:portfolio-retro`
   routine row (routine service); `score_attention` tool rows (tool-handlers / tool-protocol);
   `review`'s `createReviewItemForKnowledge` + `work`'s `findItemByReasoningMarker`.


---


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/notifications.md` for comparison.

# notifications — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

The first wave's central argument — "enterprise notification platform for a product whose only
notification surface is a popover in the same window" — is void under **Ruling 1**. The product is a
shared backend for a team and an organisation of teams. Reaching a human who is *not* looking at the
app is exactly what outbound notification is for: an agent blocked on an approval (A1 FINISH) with
the approver away from the app is a broken core loop without it. So a minimal outbound path is now
core, not enterprise reflex.

That rescues the **config write path and one channel** — nothing else. Everything with no writer, no
trigger, or no reader still dies on its own terms.

Rows whose verdict moved (7):

| Row | Old | New | Ruling |
|---|---|---|---|
| `deliver` | DELETE | SIMPLIFY | Ruling 1 — test-send becomes the settings UI's "does my SMTP work" button; flush/digest variants still die |
| `readConfig` | DELETE | FINISH | Ruling 1 — the read side of the delivery-settings UI that was never built |
| `updateConfig` | DELETE | FINISH | Ruling 1 — the only config writer; the missing half is the UI that calls it |
| `DeliverySpec` | DELETE | SIMPLIFY | Ruling 1 — shrinks with `deliver` to the test variant |
| `DeliveryResult` | DELETE | SIMPLIFY | Ruling 1 — same |
| `NotificationConfigPatch` | DELETE | SIMPLIFY | Ruling 1 — 18 members → ~7 (enabled + SMTP fields); recipient/ntfy/flood/digest/test-cap fields still die |
| `SafeNotificationConfig` | DELETE | SIMPLIFY | Ruling 1 — redaction is legit once a UI reads config back |

Verdict unchanged, substance changed (2):

- `installNotifications` — still SIMPLIFY, but the surviving shape is listener + one inline urgent
  send, not listener-only.
- `NotificationsDeps` — still SIMPLIFY, but the membership flips: `users`, `credentialStore`,
  `credentialCipher` now **survive** (per-user email addressing from OIDC identity; SMTP password at
  rest reuses the credential infra A5 keeps). `teams` still dies with silence.

**What did NOT change — dead is still dead, on its own terms, at any user count:**

- Silence (`isSilenced`, `isInSilenceWindow`, the `silence` schema): **no writer anywhere** — no
  route, no UI. Re-confirmed with `rg -a` across `layers framework applications tools`: only the
  schema defaults (`settings/src/server-config.ts:43–44`) and the reader. Constant-false since day
  one. DELETE.
- Quiet-hours prefs: PATCHable via `/api/settings` but **zero UI writers** (re-confirmed; only route
  plumbing and an e2e fixture). DELETE.
- Daily digest, both flavors: trigger exists only in `tools/setup/src/demo-fixture.ts:225`
  (`demo-routine-daily_digest`); `GET /api/status/digest` has zero clients. A team premise adds no
  reader. DELETE.
- Delivery-status state machine, lease recovery, drain worker, flood cap, adapter cache, SSRF guard,
  ntfy + console channels, SMTP retry triage, error scrubbing: judged on readers — with a fire-once
  inline send, nothing reads `pending/sending/sent/claimedAt/attempts`, nothing recovers leases,
  and ntfy/console die as second and third ways to do one thing. DELETE, all of it.

## Should this service exist?

KEEP AS **in-app inbox + one outbound channel a team can actually turn on**.

The inbox half is unchanged from the first wave: policy engine emits `notification` events, the
listener writes typed rows, the popover reads them (`useNotifications.ts`), Settings mutes types
(`useNotificationMute.ts`). Real doors, real users.

The outbound half is re-judged under Ruling 1. In a shared deployment humans are away from the app
while agents run; approvals, mentions, and urgent failures must reach them or the human-in-the-loop
stalls. The engine's delivery core demonstrably works (dispatcher + adapters carry unit and
integration coverage: `AF8-notification-delivery`, `install.test.ts`); what never existed is a
**writer for its config** — `enabled: false` by default, and the only writer (`PATCH
/api/notifications/config`) has zero production callers. The verdict is FINISH the writer (a
delivery-settings UI), not delete the engine — but finish it at one-channel size, and delete the
platform around it.

One channel: **email (SMTP)**. Every teammate already has an address — OIDC supplies it per user —
while ntfy needs every human to install an app and subscribe to a topic. Additional channels are
exactly what the event extension surface is for (Ruling 2): a plugin subscribing to `notification`
events can deliver anywhere. The three-channel platform never returns to core.

## If written today, from scratch

For a team on a shared backend, OIDC identity, plugins on the event stream. Ten methods:

- `enqueue` — insert an inbox row, cap-bounded (drop oldest)
- `listNotifications` — `unread` (popover), `by-event-since` + `pending-by-event` (agent-health)
- `markNotifications` — `read` / `seen`
- `reap` — TTL GC on read/old rows
- `installNotifications` — the one event listener; for urgent, unmuted rows with an addressable
  recipient, fire one inline email send — no queue lifecycle, no retry, no lease
- `readPreferences` / `updatePreferences` — mute toggles
- `readConfig` / `updateConfig` — SMTP settings behind a real settings screen (FINISH)
- `deliver` — test-send only, the settings screen's "verify it works" button

Per-user is the honest team shape and the current code is not it — named in Holes, not silently
absorbed: inbox rows carry no `userId` (every teammate shares one inbox and one read/seen state),
mutes are global (one human muting a type silences the whole org), and outbound addressing is a
single global `recipientEmail` instead of the recipient user's OIDC email. The from-scratch shape
scopes rows and mutes per user and addresses outbound mail from the user row.

No adapters abstraction, no channel union, no silence, no quiet hours, no digest, no flood cap, no
delivery statuses, no lease recovery, no ntfy, no console channel.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 6 |
| FINISH | 2 |
| MERGE | 0 |
| SIMPLIFY | 6 |
| KEEP | 2 |
| PLUGIN | 0 |

Surface: 16 methods → 10 methods (38% cut). By volume the cut stays deep: of `install.ts`'s ~1,600
delivery lines, only the SMTP send path, config CRUD, and test-send survive (~350 lines); ntfy +
console adapters, dispatcher state machine, drain worker, lease recovery, flood cap, adapter cache,
SSRF guard, digest, and silence all still go. PLUGIN is 0 because nothing here is Ruling-3 ritual —
extra channels are future plugins, but no existing code re-provides as one.

## Feature-level kills

1. **Two of three channels + the adapter abstraction** (ntfy adapter, console adapter,
   `NotificationAdapter`/`Notification`/`NotificationChannel`, priority mapping, SSRF guard +
   private-IP tables, ntfy auth token). One channel, hardcoded, composed from the row. Breaks:
   nothing — neither channel was ever enabled in any install.
2. **Queue-based delivery lifecycle** (delivery statuses `pending/sending/sent/failed/dropped`,
   `attempts`, `claimedAt`, `lastError`, drain interval, flushQueue, lease recovery, `onlyIfStatus`
   claim guard, SMTP retry triage, error scrubbing). Replaced by fire-once inline send at listener
   time; a failed send logs via observability and the row is still in the inbox — the inbox IS the
   fallback. Breaks: a transient SMTP failure loses that one email. Acceptable; the row survives.
3. **Flood cap + coalescing** (`floodMaxPerMinute`, `floodCoalesceWindowMs`, window state). The real
   flood control is "only urgent, unmuted rows go outbound." Breaks: a storm of urgent events sends
   a storm of emails — fix the storm at the policy engine, not with rate-limit machinery.
4. **Daily digest, both flavors** (`getDailyDigest`, `GET /api/status/digest`, the `routine_fired`
   digest worker, `digestCron`, `pending-digest`/`stuck` filters, `work.listQueuedItemsSince` — flag
   to the `work` destroyer stands). Demo-only trigger, zero-client route. If a team ever wants a
   digest it is a plugin on routines + events (Ruling 2), not core.
5. **Silence + quiet hours** (`silence-policy.ts` entirely, the silence schema, the quiet-hours
   branch, policy-engine's silence consumer + `PolicyDeps.silence`, `teams` dep). No writer has ever
   existed for either. Zero behavior change.
6. **Dead endpoints**: `POST /flush`, `POST /digest`, `GET /queue`, `GET /api/status/digest` die.
   `GET/PATCH /config` and `POST /test` **live** — they become the settings screen's backend
   (FINISH). The route-level audit-diff logger on config PATCH still dies (ETHOS: audit trail
   nobody reads).
7. **Single-recipient config** (`recipientEmail`, `recipientNtfyTopic`). Single-user relics.
   Outbound mail addresses the recipient user's email from their user row (OIDC-fed).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `getDailyDigest` | UI:GET /api/status/digest (zero clients) | DELETE | Demo-only trigger, zero-client route — dead on its own terms at any team size. Digest-as-plugin if ever wanted. |
| 2 | `scrubErrorMessage` | INTERNAL (export TEST-ONLY) | DELETE | Serves the retry/error paths of the platform being cut; fire-once send logs via observability. Preemptive-security reflex. |
| 3 | `priorityForSeverity` | INTERNAL (export TEST-ONLY) | DELETE | ntfy priority mapping; ntfy dies — email is the one channel. |
| 4 | `classifySmtpRetriable` | INTERNAL (export TEST-ONLY) | DELETE | Retry triage for a retry machine that dies; fire-once + inbox fallback needs no triage. |
| 5 | `installNotifications` | BOOTSTRAP (`service-bootstrap.ts:488`) | SIMPLIFY | 3 workers → 1: listener that writes the row and inline-sends urgent unmuted ones. Dispatcher state machine, drain worker, lease recovery die. |
| 6 | `deliver` | UI:POST /test·flush·digest (zero clients today) | SIMPLIFY | Was DELETE; Ruling 1. Keep test-send as the settings screen's verify button. flush/digest variants and their routes die. |
| 7 | `readConfig` | UI:GET /api/notifications/config (zero clients today) | FINISH | Was DELETE; Ruling 1. Read side of the delivery-settings UI that was never built. Redaction stays. |
| 8 | `updateConfig` | UI:PATCH /api/notifications/config (zero clients today) | FINISH | Was DELETE; Ruling 1. The only config writer; build the UI that calls it, shrink the patch to enabled + SMTP. Kill recipient/ntfy/flood/digest sanitizers and the smtpIgnoreTls carve-out. |
| 9 | `readPreferences` | UI:GET /api/notifications/mute | KEEP | Core value: mute toggles in Settings, named door, real users. Per-user mutes are the honest team shape — priced in Holes. |
| 10 | `updatePreferences` | UI:PUT /api/notifications/mute/:key | KEEP | Same door, write side. |
| 11 | `enqueue` | EVENT:notification, EVENT:session_ended, SCHED:lifecycle-propagation tick | SIMPLIFY | Core inbox write. Delete `dedupeBy` (zero production callers) and digest-first cap eviction; cap = drop oldest. |
| 12 | `listNotifications` | UI:GET /inbox, EVENT:session_ended | SIMPLIFY | 10 filters → 3: `unread`, `by-event-since`, `pending-by-event`. `all`/`by-id` test-only; `by-status`/`pending`/`pending-digest`/`by-ids`/`stuck` die with queue lifecycle. |
| 13 | `markNotifications` | UI:POST /seen, POST /:id/read | SIMPLIFY | Keep `read`/`seen` + ids/all. Delete `status`/`attempts`/`sentAt`/`lastError`/`claimedAt` fields and `onlyIfStatus` — lease machinery for a deleted deliverer. |
| 14 | `reap` | SCHED:6h retention tick (`service-bootstrap.ts:516`) | SIMPLIFY | Repoint at read/old rows past TTL; drop the `statuses` param — no row reaches `sent/failed/dropped` anymore. |
| 15 | `isInSilenceWindow` | INTERNAL (silence + quiet-hours only) | DELETE | Both consumers have no writer anywhere — re-confirmed. Dead regardless of user count. |
| 16 | `isSilenced` | BOOTSTRAP → policy-engine (`service-bootstrap.ts:244`) | DELETE | `silence` config has no writer; constant-false in every install that has ever existed. Kill the policy-engine branch + `PolicyDeps.silence` + schema. Team-wide hush, if ever wanted, gets built from a real learning. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `DeliverySpec` | SIMPLIFY | Was DELETE; Ruling 1. Shrinks to the test variant. |
| `DeliveryResult` | SIMPLIFY | Was DELETE; Ruling 1. Survives with test-send. |
| `NotificationConfigPatch` | SIMPLIFY | Was DELETE; Ruling 1. 18 members → ~7: `enabled`, `smtpHost/Port/Secure/Username/Password/From`. Recipient, ntfy, flood, digestCron, testMaxPerHour, smtpIgnoreTls die. |
| `SafeNotificationConfig` | SIMPLIFY | Was DELETE; Ruling 1. Redaction is legit once the settings UI reads config back. |
| `NotificationFilter` | SIMPLIFY | 10 variants → 3 (`unread`, `by-event-since`, `pending-by-event`). |
| `NotificationSelector` | SIMPLIFY | Keep `ids`/`all`; delete `onlyIfStatus`. |
| `NotificationPatch` | SIMPLIFY | Keep `read`/`seen`; delete the 5 delivery-lifecycle fields. |
| `NotificationsDeps` | SIMPLIFY | 6 → 5, different five than the first wave: keep `serverConfig` (shrunk), `credentialCipher` + `credentialStore` (SMTP password at rest, reusing the credential infra A5 keeps), `users` (per-user email addressing — Ruling 1); delete `teams` (silence-only); `work` shrinks to `getItemById`. |
| `NotificationChannel` | DELETE | One hardcoded channel needs no union. |
| `Notification` | DELETE | Adapter payload; compose the email from the DB row directly. |
| `NotificationAdapter` | DELETE | Adapter abstraction over one channel is a wrapper; FakeAdapter tests die with it. |

## Holes this leaves

1. **The FINISH is real work, not a survivor.** Until the delivery-settings UI ships, outbound email
   remains exactly as unreachable as today (`enabled: false`, no writer). The FINISH must include:
   the settings screen calling `GET/PATCH /config` + `POST /test`, per-user addressing from the user
   row's OIDC email, and the listener's inline urgent send. Countable work — do not book it as KEEP.
2. **Per-user scoping gap (Ruling 1).** Inbox rows have no `userId` — one shared inbox, shared
   read/seen state for the whole team; mutes are global. Works crudely for one team, wrong for an
   organisation. Needs a follow-up: recipient column on the queue, mutes keyed by user. Without it,
   outbound "email the approver" has to derive its recipient from the event payload each time.
3. **Transient email loss.** Fire-once send means a flaky SMTP moment drops that one email; the
   inbox row remains. Accepted trade for deleting the retry/lease/status machine.
4. **Reap must repoint in the same change** as the status-machine deletion, or the inbox grows to
   the 10k cap.
5. **Schema debt.** Queue keeps dead columns (`status`, `attempts`, `claimedAt`, `lastError`,
   `channel`, `reason`) until a follow-up migration trims to inbox shape + recipient;
   `lifecycle-propagation.ts:645` still inserts `severity: "warning"` (not in the union).
6. **Tests.** Silence/digest/dispatcher-lifecycle suites die with their features
   (`silence-policy`, `daily-digest`, `R8-signal-to-noise`, dispatcher lease/flood cases, FakeAdapter
   suites). `AF8-notification-delivery` shrinks to cover the one surviving send path instead of
   dying — the finished feature needs it.
7. **Cross-service flags stand**: `@hyperidle/work.listQueuedItemsSince` loses its only consumer
   (route to `work` destroyer); `framework/host-process` SSRF helpers may lose a consumer; the ntfy
   credential row orphans. The SMTP credential row now has a live owner.


---


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/org.md` for comparison.

# org — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

**Verdict moved (1 row):**

| Row | Method | Old | New | Ruling |
|---|---|---|---|---|
| 4 | `resolveReviewRecipients` | DELETE | MERGE | Ruling 1 — on a shared backend serving an organisation of several teams, "replace with all humans" is wrong: it puts every human in every team on every agent review thread. Team scoping is exactly what Ruling 1 says survives. The capability lives; the edges matrix still dies; the honest home is `@hyperidle/users` as one team-scoped human query. |

**Verdict letter unchanged, argument re-based (these rows' first-wave reasons leaned on the voided solo/single-user premise and are rewritten; the kill stands on the corrected premise):**

| Row | Method | Verdict | What changed in the argument |
|---|---|---|---|
| 1–3 | `listOrgEdges` / `deleteOrgEdge` / `upsertOrgEdge` | DELETE | First wave: "solo founder never configures this, fallback is identical." Void. New argument: the edges matrix is an org chart — named reviewers per agent, per role, per team, drawn as an organogram. That is hierarchy and roles-as-permissions ceremony the ethos forbids at any team count. The thing a multi-team backend actually needs — scope by team — needs no edges: team membership already exists (`users.teamId`). |
| — | `ReviewRoutingContext` | DELETE | Old reason: dies with `resolveReviewRecipients`. New reason: the resolver survives but its context collapses to a plain `teamId` argument — the `userId`/`agentRole` members are the direct/function edge mechanisms wearing a type, and they die with the edges. |
| — | `OrgUserDirectory` | SIMPLIFY | Same shrink to `getUserById` + `insertUser`, different reason: `listUsersByKind` leaves not because recipient resolution died but because it moved to `@hyperidle/users`, where reading users is native (service ownership covers reads). |
| — | Hole 1 (review routing) | — | Completely rewritten. "All humans as participants is acceptable" was the solo-founder argument and is void. New shape: recipients = the agent's team's humans; fallback to all humans only when the team has none. No hole of cross-team review noise is opened. |
| — | Hole 5 (seam port member) | — | `CoreApiOrgPort.resolveReviewRecipientsForItem` no longer dies — the `create_item` tool still needs "which humans should see this review". It survives re-shaped as a team-scoped users query behind the seam. |

**Checked against the other rulings, no movement:** org emits no event types (Ruling 2 has nothing to protect here — confirmed: no `emit`/event vocabulary in the package). Nothing in org is knowledge-management ritual (Ruling 3): the org chart is routing config, not a practice-meeting; teams and agent scaffolding are the machinery of working itself. No PLUGIN rows. No FINISH rows — A7's shared-backend/OIDC work lands in users/auth, not here; this service already never mints human identity (scaffold inserts `kind: "ai"` only, `scaffold-agents.ts:183`), so it is OIDC-compatible as-is.

**Unchanged and premise-free:** the `teamMembers`→`teams` fold (rows 9–14) is a schema-shape argument — a 1:1 companion table is one table wearing two names at any number of teams; `deleteTeam` (row 17) is a rollback-helper argument; both stand exactly as written.

## Should this service exist?

**KILL THE NAME, KILL THE ORG CHART, KEEP THE TEAMS.** Same split as the first wave, now on firmer ground:

1. **The org chart** (`org-edges.ts`, the `orgEdges` table, `SettingsOrgChart.tsx`, the edge routes): still DELETE, and the corrected premise makes the argument *stronger*, not weaker. A shared backend with several teams does need review scoping — and the scoping unit the product already has is the **team**. The edges feature is a second, hand-drawn answer to a question team membership already answers: three mechanisms (direct = a named human reviews a named agent; function = a named human reviews a role; team = a named human reviews a team) are an approval-chart. Direct and function edges are hierarchy and roles-as-permissions; even the "team" mechanism is redundant with membership. The `POST /api/teams` auto-edge that wires the founder as reviewer of every new team (`teams-routes.ts:330`) is the approval-chain reflex in one line. All of it dies.

2. **Teams + agent scaffolding** (`team-lookup.ts`, `scaffold-agents.ts`): under Ruling 1 this is *more* load-bearing than the first wave credited. Several teams genuinely coexist on one backend; team scoping of work and conversation runs through `getTeam`/`listTeams`; `persistScaffoldedAgents` is the single writer of agent identity. Survives as a service named `teams`.

3. **Recipient resolution**: the one capability that moves. Survives, but shrinks to "the humans of this team, else all humans" — one query whose honest owner is `@hyperidle/users`.

Survivor routing: `team-lookup.ts` + `scaffold-agents.ts` + `ports.ts` become `@hyperidle/teams`. `org-edges.ts` and the `orgEdges` table delete outright. `org-routing.ts`'s surviving intent merges into `@hyperidle/users`.

## If written today, from scratch

For an organisation of several small teams of humans and agents on one shared backend, humans arriving via OIDC, events as the plugin surface:

- `getTeam(db, {id|name})`
- `listTeams(db, filter?)`
- `createTeam(db, input)` — single insert, single table
- `updateTeam(db, teamId, patch)`
- `persistScaffoldedAgents(db, deps, teamId, specs, harness?)` — agents are minted here; humans are never minted here, they arrive from the OIDC provider and get attached to teams
- *(in `users`, not here)* `listHumans(db, {teamId?})` — the whole of review routing: a review of a team's agent goes to that team's humans; a team with no humans falls back to all humans so every review reaches someone

Still no `teamMembers` table (1:1 companion = one table wearing two names), no org edges, no routing matrix, no rollback-only delete helper. One thing the from-scratch shape exposes that today's schema gets wrong for the corrected premise: `users.teamId` is a single FK, but a human belongs to *one or more* teams. When multi-team membership is built (users-service work, not this package), it becomes a membership relation owned by `users`; nothing in this service's surviving five methods changes shape when that lands.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 4 |
| PLUGIN | 0 |
| FINISH | 0 |
| MERGE | 8 |
| SIMPLIFY | 2 |
| KEEP | 3 |

Surface: 17 method rows (13 distinct functions) → 5 methods here + 1 query relocated to `users` (65% cut by row).

## Feature-level kills

**1. The org chart / review-routing edges — the matrix dies, the scoping survives elsewhere.**
Dies: `orgEdges` table, `listOrgEdges`, `deleteOrgEdge`, `upsertOrgEdge`, `SettingsOrgChart.tsx` (component + settings-nav entry), `GET /api/org/` (org-chart payload), `PUT /api/org/edges`, `DELETE /api/org/edges/:id`, `GET /api/org/review-recipients` (zero callers — the route's own comment says "No UI action reaches this directly today", `routes/org.ts:282`), and the founder-auto-edge write in `POST /api/teams` (`teams-routes.ts:330`).
Survives, relocated: recipient resolution as a team-scoped human query in `@hyperidle/users`. Both production callers (`session-review-creator.ts:88`, `tool-definitions.ts:493`) already pass `teamId`; they drop the `userId`/`agentRole` fields and keep working.
Why the matrix dies on the corrected premise: named-reviewer edges are an approval chart. On a flat multi-team org the unit of visibility is the team you are on — which membership already encodes. Configuring *which specific human* reviews *which specific agent or role* is exactly the org-chart ceremony the ethos forbids, at 2 humans or 20.
Collateral to re-point: `SettingsFilesystems.tsx:77` and `SettingsAgents.tsx:167` fetch `/api/org` only for the teams list — both switch to `GET /api/teams`.

**2. `teamMembers` folds into `teams` — the noun dies.** Unchanged from the first wave; the argument is schema-shape, not user-count. The 1:1 invariant enforced by app-level 500s (`team-lookup.ts:113–154`) is the schema confessing two tables are one entity. Fold `capacity`, `activeBets`, `leadAgentId`, `formedAt` into `teams`; re-point `users.teamId` at `teams.id` (one migration — and this re-point is a prerequisite for the team-scoped recipient query anyway, killing the AK4 two-hop). Kills the `ApiError` 500 machinery, `GET /api/org/teams/:teamId/membership`, `GET /api/org/team-members/:teamMembersId`, the `teamMembersId` ceremony in `CreateTeamInput`, and `teamMembers.dissolvedAt` (duplicates `teams.phase = "archive"`).

**3. `deleteTeam` — a rollback pretending to be a feature.** Unchanged. Sole caller is the `POST /api/teams` specs-empty rollback (`teams-routes.ts:304`); resolve scaffold specs before inserting the team row and the rollback path evaporates. No user-facing delete-team surface exists; a multi-team org retires a team via `phase = "archive"`, not row deletion.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `listOrgEdges` | UI:GET /api/org/, UI:DELETE /api/org/edges/:id | DELETE | Feeds only the org-chart page and the edge-delete existence check; the edges matrix is approval-chart ceremony at any team count — dies with the feature. |
| 2 | `deleteOrgEdge` | UI:DELETE /api/org/edges/:id | DELETE | Edge deletion for a feature that dies; kill the route with it. |
| 3 | `upsertOrgEdge` | UI:PUT /api/org/edges, UI:POST /api/teams/ | DELETE | TOCTOU-safe upsert engineering for an approval chart; the `teams-routes.ts:330` founder-auto-edge — founder reviews every new team — is the approval-chain reflex and dies with it. |
| 4 | `resolveReviewRecipients` | EVENT:session_ended, AGENT:create_item, UI:GET /api/org/review-recipients | MERGE | **Moved by Ruling 1.** On a multi-team shared backend recipients must be the agent's *team's* humans, not all humans — team scoping survives, edges don't. Fold into `@hyperidle/users` as `listHumans(db, {teamId?})` carrying the fallback (team has no humans → all humans, so every review reaches someone); both callers already pass `teamId`. The zero-caller GET route still deletes. |
| 5 | `persistScaffoldedAgents` | AGENT:create_team, AGENT:add_agent, UI:POST /api/teams/, UI:POST /api/users/, UI:GET+PATCH /api/users/:userId/assistant/, UI:POST /api/org/scaffolded-agents | KEEP | Core value: agents are first-class teammates; single writer of agent identity behind every agent-creation door. Inserts `kind: "ai"` only — already clean against OIDC-sourced human identity. |
| 6 | `resolveTeamAgentHarness` | INTERNAL | MERGE | One caller (`persistScaffoldedAgents`), not in the barrel; a 15-line if-block does not earn a file + export — inline it, delete `team-default-harness.ts`. |
| 7 | `getTeam` | UI:GET /api/teams/:teamId +25 more routes, AGENT:add_agent/create_bet/create_routine, SCHED:routine-scheduler, EVENT:session_ended/task_state_changed | KEEP | Teams are the scoping unit of a multi-team shared backend; this read is load-bearing across bets, tasks, routines, reviews, knowledge. |
| 8 | `listTeams` | UI:GET /api/teams/, GET /api/bets/canvas, GET/PATCH /api/settings/, GET /api/search/ | KEEP | The team directory behind five real UI surfaces — on an org of several teams this IS the org view; no organogram needed. |
| 9 | `getTeamMembers` (overload `require:true`) | UI:POST /api/bets/:id/commit +many, SCHED:notification drain, EVENT:item_created/session_ended | MERGE | The 500-throwing invariant police exists only because one entity is split across two tables; fold `teamMembers` into `teams` and this overload is `getTeam`. Premise-free — stands. |
| 10 | `getTeamMembers` (overload optional) | UI:PUT /api/org/edges, GET /api/org/teams/:teamId/membership +many | MERGE | Same body — after the fold every call site is `getTeam`. |
| 11 | `getTeamMembers` (implementation) | UI/AGENT/SCHED (35 doors via both overloads) | MERGE | Implementation row of #9/#10; dies into `getTeam` with the fold. |
| 12 | `listTeamMembers` (overload `withTeamName:true`) | UI:GET /api/org/ | MERGE | The join-projection exists solely to shape the org-chart payload; org chart dies, projection dies, survivors use `listTeams`. |
| 13 | `listTeamMembers` (overload plain) | UI:GET /api/bets/canvas, GET /api/team-members/ | MERGE | After the fold this is `listTeams` with `phase != "archive"`. |
| 14 | `listTeamMembers` (implementation) | UI (3 doors via overloads) | MERGE | Implementation row of #12/#13; dies into `listTeams`. |
| 15 | `createTeam` | UI:POST /api/teams/, UI:POST /api/org/teams, AGENT:create_team | SIMPLIFY | Survives as one insert into one table; `teamMembersId`/`capacity`/`activeBets`/`formedAt` bookkeeping leaves the signature (defaults live in the schema). |
| 16 | `updateTeam` | UI:PATCH /api/teams/:teamId, UI:POST /api/teams/, AGENT:create_team | SIMPLIFY | Survives; after the fold the two-table branch logic collapses to one UPDATE on `teams`. |
| 17 | `deleteTeam` | UI:POST /api/teams/ (rollback branch only) | DELETE | A rollback helper, not a feature — resolve scaffold specs before inserting and no rollback exists; team retirement on a shared backend is `phase = "archive"`, never row deletion. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `UpsertOrgEdgeInput` | DELETE | Dies with `upsertOrgEdge`. |
| `ReviewRoutingContext` | DELETE | The resolver survives (merged into `users`) but its context collapses to a plain `teamId` argument; `userId`/`agentRole` are the direct/function edge mechanisms wearing a type and die with the edges. |
| `OrgUserDirectory` | SIMPLIFY | Shrinks to `getUserById` + `insertUser` (scaffold's only needs); `listUsersByKind` leaves because recipient resolution moves into `@hyperidle/users`, where reading users is native. |
| `OrgAgentRunConfigWriter` | MERGE | One-function port always wired alongside `OrgUserDirectory` into the same `deps` object — fold its member into the one surviving port. |
| `ScaffoldResult` | KEEP | Return type of the keeper `persistScaffoldedAgents`. |
| `AgentScaffoldSpec` | KEEP | Input type of the keeper; the Strategy/Kernel split it encodes is real. |
| `ActiveTeamMembersWithTeamName` | DELETE | Org-chart payload shape; dies with feature kill 1. |
| `CreateTeamInput` | SIMPLIFY | Loses `teamMembersId`/`capacity`/`activeBets`/`formedAt` after the table fold; keeps id/name/phase/functions/factoryDbPath/createdAt. |

## Holes this leaves

1. **Review routing loses the hand-drawn choices, keeps team scoping.** A review of a team's agent reaches that team's humans (fallback: all humans only when the team has none — every review still reaches someone). What's lost is only the configured direct/function edges — "this named human reviews this named agent/role". On a flat org that choice is the approval chart itself; if a real learning ever shows a team needs a designated reviewer, earn it back then (ETHOS: friction after evidence, never before). No cross-team review noise is introduced — the first wave's "all humans everywhere" replacement is retracted.
2. **One migration.** `teamMembers` columns move into `teams`, `users.teamId` re-points from `teamMembers.id` to `teams.id`, `orgEdges` drops. Blast radius unchanged from the first wave: ~15 production files calling `getTeamMembers`/`listTeamMembers` become `getTeam`/`listTeams` calls; the AK4 two-hop resolution and its two seam routes (`/api/org/teams/:teamId/membership`, `/api/org/team-members/:teamMembersId`) delete outright. The re-point is also the prerequisite for the team-scoped recipient query.
3. **`/api/org` router mostly evaporates.** Org-chart GET, edge PUT/DELETE, review-recipients GET die. `SettingsOrgChart.tsx` deletes; `SettingsFilesystems.tsx:77` and `SettingsAgents.tsx:167` re-point to `GET /api/teams`. Surviving seam routes (`POST /org/teams`, `POST /scaffolded-agents`, `POST /team-routines`, `GET /org/teams/:teamId`) move under `/api/teams` in the renamed service.
4. **`POST /api/teams` loses its rollback.** Spec resolution reorders to before the insert; if refused, wrap the create in a transaction. Either way `deleteTeam` stays dead.
5. **Seam port members re-shape, not die.** `CoreApiOrgPort.resolveReviewRecipientsForItem` (framework/api-contract/src/core-api-port.ts:442) and tool-handlers' mirror (`tool-handlers/src/ports.ts:336`) SURVIVE — `create_item` still must find the humans who should see a review — but their query shape shrinks to `{teamId}` and their implementation becomes the relocated users query. `getTeamMembersByTeamId`-shaped port members still collapse into `getTeam`. This retracts the first wave's hole 5, which deleted the member.
6. **Multi-team human membership is not built here.** `users.teamId` is a single FK; "a human belongs to one or more teams" needs a membership relation owned by `users` someday. Nothing in this service's survivors blocks or prejudges that — flagging so the founder prices it where it belongs, in the users track.


---


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/policy.md` for comparison.

# policy — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

| Row | Old verdict | New verdict | Ruling | Why it moved |
|---|---|---|---|---|
| `computeApprovalRate` | KEEP | **FINISH** | A1 + Ruling 1 | The trust signal is now machinery for a feature being COMPLETED: its `auto_resolve` path is the dial that will auto-grant A1's one-time permission at earned trust. And it is unfinished for a shared backend — it aggregates ALL humans' verdicts into one per-agent rate (`approval-rate.ts:52-70` never looks at the verdict's sender), while Ruling 1 says approval rate is **per-human-per-agent**. Verdict messages carry `senderId`; the finish is attributing by approver. |
| `ApprovalRateResult` | KEEP | **FINISH** | A1 + Ruling 1 | Return shape of the finished function — grows approver attribution (per-human breakdown); `recentVerdicts` entries gain who decided. |
| `propagation_applied` event (blast radius of feature kill 1) | DELETE | **KEEP** | Ruling 2 | First wave killed it on "zero consumers (verified at ws-connection-hub.ts:47 + dispatcher.ts:425)". That reasoning is **void** — events are an extension surface, plugins may listen. And it is not a duplicate: `task_state_changed`/`bet_state_changed` announce the transition but carry no cause; `propagation_applied` announces *this transition was a cascade consequence* (source→target linkage). Emitted today at `lifecycle-propagation.ts:360-371,593-602`, independent of the log write — the emission survives the log kill untouched. |
| `propagation_failed` event (blast radius of feature kill 1) | DELETE | **KEEP** (emitter simplifies) | Ruling 2 | Same void reasoning. The fact "a cascade hop failed" still happens after the retry apparatus dies — the emitter moves from the 3-attempt exhaustion path to the first-failure catch, and the event on the bus **replaces** the internal `notifications.insert` as the extension point. `attempts` in the payload becomes meaningless → payload loses it (Ruling 2 does not protect a field nothing sets). |
| `registerPolicy` ship-confirmation addressee | KEEP (unflagged inside SIMPLIFY) | **SIMPLIFY, with named FINISH work** | Ruling 1 | `lifecycle-propagation.ts:516-519` resolves "the founder" as `getFirstUserByKind(db, "human")` — **the first human by insertion order**, fallback `"u-founder"`. On a shared backend serving a team that is the wrong human: the ship-confirmation thread for a completed bet must go to the bet's owner/team (`bet.teamId` is already on the row at line 168). First wave passed this without flagging it; it is a solo-backend premise baked into a kept path. |

**What did NOT change — re-reached, not carried over:**

- **The propagation_log kill stands in full** (founder affirmed it explicitly): table, `recordPropagationHop`, `reapTerminalPropagationLog`, the 30-second heartbeat, the retry drain, the 3-attempt CAS exhaustion path, the exhaustion `notifications.insert` (`lifecycle-propagation.ts:645` — sole use of the port), the failure-row insert at `policy-engine.ts:39`, and every external hop-writer. A ledger with zero production readers of its `applied`/`skipped`/`failed` rows is dead at any user count.
- **The `tasks.auditTrail` append kill stands, re-verified under Ruling 1.** "Who approved what is real information" — and that information lives in **verdict messages** (read by `computeApprovalRate`, rendered in threads) and in the **handoff message** `buildHandoff` posts to the thread. The `tasks.auditTrail` column duplicates both into a blob with zero production reads — re-confirmed by `rg -a`: every production hit (`tasks.ts:226`, `handoff-protocol.ts:151,306`, `lifecycle-propagation.ts:60`, `task-state-machine.ts:105`) is read-to-append; `applications/` has zero references. A shared backend does not rescue an unread duplicate of a record that already exists where humans look.
- **Escalation-branch collapse, `buildHandoff` uncurry, `PolicySessionContext` merge, `PolicyDeps` shrink, fold-into-`work` recommendation** — none rested on a voided premise; all stand.
- **New evidence found while re-checking (strengthens a KEEP):** the policy engine's `queue` action append of `policy_queued` to `items.auditTrail` (`policy-engine.ts:204-214`) **is read in production** — `work-service.ts:495` (`like(items.auditTrail, "%policy_queued%")`) feeds the daily digest (`notifications/src/daily-digest.ts:22`). The hold-for-digest leg of trust routing is load-bearing, not bookkeeping. (Contrast with `tasks.auditTrail`: same column name, one has a reader, one does not. The one with a reader lives.)

## Should this service exist?

**Still KILL THE SERVICE (as a named thing). Route survivors into `work`. The rulings strengthen this, not weaken it.**

Re-reached against the corrected premise — a shared backend, a team of humans, OIDC identity, an event stream plugins hang off:

1. A1 being FINISHED does not give `policy` an asset. The one-time-permission machinery — `proposedCalls` table, grant CAS-consumption, outcome recording — lives in `@hyperidle/review` (`framework/tool-protocol/src/tool.ts:202-207`, `layers/core-api/src/routes/reviews.ts`). Policy's contribution to the loop is the **attention router** (`item_created` → push/queue/auto_resolve) and the **trust signal** — both of which read work-owned items and write conversation-owned messages. Work-domain reactions, wrong roof.
2. After the propagation_log dies (affirmed), `policy` owns **no table**. A service owning nothing, reaching everything through ~30 mirrored `PolicyDeps` port methods, is Mechanism-C ceremony purchased by the boundary, not the features.
3. Shared backend makes the trust path MORE work-domain, not less: per-human-per-agent rates are joins over work items and conversation verdicts, exactly the data `work` and `conversation` own.

Fold `computeApprovalRate`, `buildHandoff`, and the `registerPolicy` reactions into `work`; retire the "policy" noun. If the founder keeps the package for ownership-model reasons, every row below applies unchanged.

## If written today, from scratch

Against a shared backend, used by a team, OIDC identity, plugins on the event stream — four functions, living in `work`:

- `computeApprovalRate(agentId)` → per-human-per-agent earned-trust rates (profile display, attention routing, A1 auto-grant dial). Attribution by verdict `senderId`.
- `handoffTask` (uncurried `buildHandoff`) — CAS claim, ownership transfer or review-item creation, handoff message in the thread as the human-visible record. No auditTrail appends, one item-creation path.
- `registerWorkReactions` — the three lifecycle subscribers (session→task→bet→ship-confirmation) + the `item_created` trust router. Fire-and-forget; a failed hop emits `propagation_failed` on the bus and stops. No timer, no log, no retry.
- Ship-confirmation addressed to the completed bet's team/owner, never "first human in the table".

No propagation_log. No reaper. If a hop fails, the task sits one state behind and a teammate moves it — `review ↔ in_progress` are legal both ways.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| FINISH | 1 |
| MERGE | 0 |
| SIMPLIFY | 2 |
| KEEP | 0 |

Surface: 5 methods → 3 methods (40% cut) — unchanged from first wave; what moved is one KEEP → FINISH. By mass the cut is unchanged: `lifecycle-propagation.ts` still loses the retry/log half (~350 of 823 lines), the 30-second timer door still dies, the owned table is still dropped. The two domain events previously in the blast radius now survive it.

Types: 7 declarations → DELETE 1, MERGE 1, SIMPLIFY 2, KEEP 2, FINISH 1.

## Feature-level kills (revised)

**1. Propagation durability apparatus — kill stands, blast radius corrected.**
Still dies: `propagation_log` table (schema + zod + migration), `recordPropagationHop`, `reapTerminalPropagationLog`, internal `retryFailedPropagations`, the 30-second heartbeat (`lifecycle-propagation.ts:806`), the `MAX_RETRY_ATTEMPTS` exhaustion path with its `propagation_exhausted` notification (sole `notifications.insert` caller, line 645), every `log()`/`LogSink` sink, the failure-row insert at `policy-engine.ts:39`, the cascade hop writes in `layers/core-api/work/src/bet-kill-cascade.ts`, the per-stopped-run hop in `layers/agent-orchestration/run-orchestration/src/request-run-stop-for-tasks.ts`, the `deps.policy.recordPropagationHop` port threaded into `POST /api/bets/:id/kill` (`layers/core-api/src/routes/bets.ts:700`), the `reapTerminalPropagationLog` line in the retention sweep (`service-bootstrap.ts:520`), and the machinery-only tests.
**No longer dies (Ruling 2):** `propagation_applied` / `propagation_failed` in `framework/domain-model/src/events.ts:454-475` and their dispatcher case arms. `propagation_applied` keeps its current emit sites (they never depended on the log). `propagation_failed`'s emitter moves to the first-failure catch and its payload drops `attempts`.
What breaks: a transiently failed hop is announced on the bus but not retried; no internal notification. Acceptable: failure mode is a local Postgres write erroring (never observed), manual repair is one legal click, and any team that wants a notification hangs a trigger on `propagation_failed` — that is what the event surface is for.

**2. `tasks.auditTrail` appends — kill stands, re-argued under Ruling 1.**
`buildHandoff`'s two appends (`handoff-protocol.ts:151,306`) and `transitionTask`'s per-hop append (`lifecycle-propagation.ts:60`) die. Zero production reads re-confirmed; the who-did-what record a team actually needs already exists where the team looks — the handoff message in the thread and the verdict messages `computeApprovalRate` reads. Killing the appends deletes the fragile in-tx re-read at `handoff-protocol.ts:310` for free. (Column drop remains `work`'s call.) The **`items`**.auditTrail `policy_queued` append is explicitly NOT part of this kill — it has a production reader (`work-service.ts:495` → daily digest).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `computeApprovalRate` | UI:GET /api/agents/:id/profile (+ EVENT:item_created via policy-engine) | **FINISH** | A1 machinery being completed: its rate drives `auto_resolve` — the earned-trust auto-grant of the approval loop (`policy-engine.ts:142-154`, cold-start push under 10 verdicts, auto-resolve ≥0.9 on low risk). Unfinished per Ruling 1: aggregates all humans' verdicts into one rate, ignoring verdict `senderId`; a shared backend needs per-human-per-agent. Finish = attribute by approver; wire the same signal into `review`'s proposed-call grant path when A1's emit lands. |
| 2 | `buildHandoff` | UI:POST /api/tasks/:id/handoff + AGENT:handoff_to | SIMPLIFY | Unchanged — the handoff is the flat-team core act, and every shrink survives the rulings: (a) drop both `tasks.auditTrail` appends (zero readers re-verified; thread message is the record a team sees — Ruling 1 re-argued, kill stands); (b) collapse the toRole-miss escalation branch into the review-item branch (two near-identical blocks, one idea; `toHuman` already means an unaddressed shared-queue item any teammate claims — correct for a flat team, no single-user premise here); (c) uncurry the `buildHandoff(deps)` factory (exists for one call site, pushed the function over the lint complexity threshold per its own biome-ignore at line 125). |
| 3 | `recordPropagationHop` | SCHED:30s heartbeat + EVENT:session_ended/task_state_changed/bet_state_changed + UI:POST /api/bets/:id/kill (cascade port) | DELETE | Stands — founder affirmed: a write-only ledger is dead at any user count. Kill it and every caller (cascade hops, run-stop hops, LogSink sinks). Correction: the `propagation_applied`/`propagation_failed` EVENTS exit the blast radius (Ruling 2) — only the log rows, timer, and retry die. |
| 4 | `reapTerminalPropagationLog` | SCHED:retention-reaper (service-bootstrap.ts:520) | DELETE | Stands. A reaper for a log nobody reads is bloat squared; it never reaps `failed` rows anyway. Dies with the table. |
| 5 | `registerPolicy` | BOOTSTRAP (service-bootstrap.ts:476) | SIMPLIFY | The boot call survives and is now doing A1's delivery: the `item_created` router's three legs are each proven — push (bus notification, kind "attention"), queue (`policy_queued` → daily digest, READ at `work-service.ts:495`), auto_resolve (verdict message → the earned-trust auto-grant). Still loses the 30-second heartbeat, retry drain (`retryFailedPropagations` dies), log sinks, and the exhaustion-notification path; `propagation_failed` emission moves to the failure catch. **Named FINISH work (Ruling 1):** ship-confirmation addressee at `lifecycle-propagation.ts:516-519` — replace first-human-by-insertion (`getFirstUserByKind(db, "human")`, fallback `"u-founder"`) with the bet's team/owner; `bet.teamId` is already in hand at the call site. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ApprovalRateResult` | **FINISH** | Moves with row 1 (A1 + Ruling 1): grows per-approver attribution; `recentVerdicts` entries gain the deciding human. |
| `HandoffMetadata` | KEEP | The agent handoff wire format (`handoff_to` tool contract) — real protocol, real consumer. Unchanged. |
| `HandoffParams` | KEEP | Input of the kept handoff. Unchanged. |
| `HandoffResult` | SIMPLIFY | Stands: escalation merges into review-item → drop `"escalated"` from `status`, drop `escalationItemId`. Becomes `{ status: "success"; targetAgentId? }`. |
| `LogPropagationEntry` | DELETE | Stands: input type of `recordPropagationHop`, dies with it. |
| `PolicySessionContext` | MERGE | Stands: three fields, one consumer (`HandoffParams.sessionContext`) — inline, delete the export. |
| `PolicyDeps` | SIMPLIFY | Stands: drop `notifications` (sole caller was retry exhaustion — confirmed line 645, dead), drop the `?`-optional/`Required<Pick<…>>` re-narrowing dance, drop members no survivor calls after the kills. `users.getFirstUserByKind` gets REPLACED (not kept) by a team/owner resolution when the Ruling-1 addressee fix lands. If the fold-into-`work` lands, most of the ~30 mirrored methods evaporate because `work` calls itself directly. |

## Holes this leaves

- **A failed cascade hop is announced, not retried.** `propagation_failed` fires on the bus; nothing internal retries or notifies. Repair is one legal click by any teammate. The event is the hook for anyone who wants more.
- **No propagation forensics table.** "Why did this bet auto-complete?" is answerable from the live `propagation_applied` event (plugins/observability can persist it) but not from a core table. Nothing reads that table today, so nothing observable changes.
- **Role-miss handoffs produce a review item instead of an `escalation` item.** Same human surface, one fewer code path.
- **No handoff/transition entries in `tasks.auditTrail`.** The thread message remains the human-visible record; the column's fate is `work`'s.
- **Until the Ruling-1 addressee fix lands, ship-confirmation threads go to the first human by insertion order** — on a team backend that is a real mis-delivery, not cosmetics. It is named FINISH work, not optional polish.
- **Until the fold-into-`work` lands**, the package survives at 3 functions with "policy" actively misdescribing an attention router + a trust signal + a handoff.


---


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/review.md` for comparison.

# review — destroyer verdict (REVISED after founder rulings)

Supersedes `.pipeline/work/AU20/destroy/verdicts/review.md`. Same 21 rows, same no-sampling standard.

---

## What changed after the rulings

My headline call was wrong in the founder's direction and wrong in my own direction on the same
file: I killed the loop the founder wants finished (A1), and I kept the auto-review the founder
killed (A2). Row 11 flipped end-for-end — I said "keep subscriber 1, delete subscriber 2"; the
correct call is "delete subscriber 1 (A2), keep subscriber 2 (A1)".

**21 of 21 rows changed.** Nothing in this package is DELETE any more. The cuts this pass still
buys land outside the package (A2's gate, its risk-tier reader, seven port members, the demo
fixture) and in a relocation (the knowledge review-item factory leaves).

### Methods

| # | Method | Old | New | Ruling |
|---|---|---|---|---|
| 1 | `findProposedCall` | DELETE | KEEP | A1 FINISH — it is the reader the verdict endpoint and the review page both call. |
| 2 | `resolveReengagementRequest` | DELETE | FINISH | A1 — must additionally bake the approved call, else session 2 can never be grant-bearing. |
| 3 | `recordProposedCall` | DELETE | FINISH | A1 — must stop hardcoding `reversibility:"irreversible"` and must mint the review anchor. |
| 4 | `transitionProposedCall` (consumed overload) | DELETE | KEEP | A1 — the CAS-consume is correct as written. |
| 5 | `transitionProposedCall` (non-consumed overload) | DELETE | KEEP | A1 — the granted/held/outcome signature is correct as written. |
| 6 | `transitionProposedCall` (implementation) | DELETE | FINISH | A1 — its granted branch swallows the bake failure; that swallow is the loop's silent-death path. |
| 7 | `handleUnconsumedGrantOnSessionEnd` | DELETE | KEEP | A1 — the liveness net becomes live the moment grants exist. |
| 8 | `reengageOnAdmissionFailure` | DELETE | KEEP | A1 — same behavior, second trigger point; its producer returns. |
| 9 | `attentionReviewReasoningMarker` | KEEP | MERGE | Not a ruling — re-check of "should this service exist". Belongs in `@hyperidle/knowledge`. |
| 10 | `createReviewItem` | KEEP | MERGE | Same re-check. `review` becomes one feature, not two. |
| 11 | `registerReviewSubscriptions` | SIMPLIFY (keep sub 1, kill sub 2) | SIMPLIFY (kill sub 1, keep sub 2) | A2 kills the risk-tier session-review creator; A1 keeps the liveness net. Exact inversion. |

### Types / DI ports

| Declaration | Old | New | Ruling |
|---|---|---|---|
| `ReviewAgentWorkIntentInput` | DELETE | KEEP | A1 — its producer returns. |
| `ReviewPorts` | SIMPLIFY (keep work/conversation/users/org, drop the 7 reengagement deps) | SIMPLIFY (keep the reengagement deps, drop the A2 routing deps) | A1 + A2 — exact inversion of which half survives. |
| `ProposedCallQuery` | DELETE | KEEP | A1. |
| `ProposedCallView` | DELETE | KEEP | A1. |
| `ReengagementResolverDeps` | DELETE | SIMPLIFY | A1 — survives, but its five optional members must become required. |
| `BakedReengagementRequest` | DELETE | FINISH | A1 — must carry the approved call. |
| `ProposedCallTransition` | DELETE | KEEP | A1. |
| `CreateReviewItemInput` | KEEP | MERGE | Moves with the factory. |
| `CreateReviewItemResult` | KEEP | MERGE | Moves with the factory. |
| `ReengagementSourceUnavailableError` (class) | DELETE | SIMPLIFY | A1 — survives in substance, but as a returned result, not a thrown error every caller swallows. |

### Ruling 3 — knowledge ritual

Nothing of that shape is left inside `review`: the practice-meeting sub-module already relocated to
`@hyperidle/knowledge`, and only `@lore` comments referencing the move remain
(`layers/core-api/review/src/index.ts:10-12`, `ports.ts:11-12,83-85`). **The relocated machinery is
still core and is `PLUGIN` under Ruling 3** — it is a ritual about the work, not the machinery of
working. It lives across `layers/core-api/knowledge/src/index.ts`,
`layers/core-api/src/routes/knowledge.ts`, `layers/core-api/routine/src/routine-scheduler.ts` +
`ports.ts`, `layers/core-api/src/services/routine-scheduler-bindings.ts`, and role/event vocabulary
in `framework/domain-model/src/agent-roles.ts` + `events.ts`. Out of my rows — flagging it so it
lands in whoever owns `knowledge`/`routine`.

The **attention-engine knowledge review** (rows 9/10's real caller,
`layers/core-api/knowledge/src/attention-service.ts:295-322`) is NOT ritual and NOT A2: it is the
knowledge fabric noticing an item has drifted and putting a non-blocking item in a human's inbox.
That is the machinery of keeping shared knowledge true. It stays core — it just stops living in
`review`.

### Ruling 1 — shared backend

My first wave did not rest this service's verdicts on a single-user premise (I killed the loop for
never having run, not for having one user), so no row moves on Ruling 1 alone. It does harden two
things: the AD1 human-routing code I am now deleting under A2 was the only multi-human routing in
this package, and **that routing logic must not be lost** — it moves to wherever the approval review
item is created (see W3 below). Approve→act between several humans and their agents is exactly the
shared-backend case, and the acting human's identity for the verdict must come from OIDC, not from
the participant list `authorizeWrite` reads today (`layers/core-api/src/routes/threads.ts:1651-1656`).

---

### What must be wired for approve→act to work

Nine pieces. Today **none** of them is connected, so the honest description of the current product
is not "approval is broken" — it is "there is no approval, and agents execute irreversible tools
directly", because with no `sessionWorkflow` the router at
`layers/agent-orchestration/tool-handlers/src/tool-registry.ts:133` is skipped entirely and
`def.handler` runs (line 197).

**W1 — the ignition switch. Nothing ever constructs a `RegistrySessionWorkflow`.**
`options.sessionWorkflow` is read at `tool-registry.ts:84` and threaded through
`layers/agent-orchestration/run-orchestration/src/provisioner.ts:1239` and `:1503`,
`run-orchestration/src/runtime.ts:456`, `run-orchestration/src/contracts.ts:214`, and
`layers/agent-orchestration/src/services/run-orchestration-composition.ts:333`. The only durable
construction path never sets it — `start-runtime.ts:166-173` calls
`runSession(deps, { mode:"durable", request, sandboxBasePath, modelTier, resolvedModel, completion:"admit" })`.
Every other reference in `layers/`, `framework/`, `applications/`, `tools/` is a type declaration, a
passthrough, or a test. The `ProposedCallWorkflowPort` behind it **is** correctly wired
(`run-orchestration-composition.ts:226-234, 323-337` over `CoreApiPort.review`) — the port is live,
the switch is absent.

**W2 — the capture anchors cannot exist at provision time.** `RegistrySessionWorkflow` demands
`reviewMessageId` + `subjectThreadId` + `artifactId` up front
(`framework/tool-protocol/src/tool.ts:160-168`), but those only come into being *during* the session
(`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:1575` creates the artifact,
`:740` posts the `type:"review"` message). `rg -a reviewMessageId` across all four roots finds zero
production producers; only the AL7 integration tests hand-seed them
(`layers/core-api/src/__tests__/AL7-proposed-call-capture.integration.test.ts:150-158`). This is a
design defect, not a missing line: the anchor must be minted **at capture time** inside
`recordProposedCall`, and the session-time workflow must shrink to the dial (which tools this human
asked to be asked about) plus the session role.

**W3 — the human is never told.** On capture the router returns `AWAITING_REVIEW` to the agent and
aborts session 1 (`tool-registry.ts:105-119` and `:177-191`), and that is all that happens. No
review message, no `items` row, no recipients. Needs: create the review message + item at capture,
and reuse the human-routing that A2's dying subscriber holds today
(`layers/core-api/review/src/session-review-creator.ts:86-107` — `org.resolveReviewRecipients`,
falling back to all humans, merged into thread participants). The `items` row is what makes the
existing policy engine work — it already decides push vs queue vs auto-resolve from riskTier and the
agent's approval rate (`layers/core-api/policy/src/policy-engine.ts:119-150`).

**W4 — approve goes to the endpoint that throws the decision away.** The UI's approve button calls
`handleSubmitVerdict` (`layers/core-ui/src/pages/review/ReviewPage.tsx:173-195`) →
`postVerdictHostMessage` (`layers/core-ui/src/services/host-threads.ts:132-151`) →
`POST /api/threads/:threadId/messages` with `type:"verdict"`. That handler emits `thread_resolved`
and then literally discards the decision:

```ts
// layers/core-api/src/routes/threads.ts:1558-1561
const decision = input.payload.decision;
// AL7 trust-first: approve verdict handled by proposed-call workflow (Task 8).
// Tailored grant composed + proposed_call_granted emitted there.
void decision; // will be used by Task 8 implementation
```

The endpoint that *does* mint the grant — `POST /api/threads/:threadId/messages/:messageId/verdict`
(`threads.ts:1619-1736`, calling `transitionProposedCall({to:"granted"})` at `:1680-1718` and
emitting `proposed_call_granted` at `:1720-1728`) — has **zero clients**; `rg -a` over the repo finds
no caller outside its own definition. Fix: one of the two paths, not both. Either the message
handler's verdict branch calls the same granted-transition block, or the UI calls the verdict
endpoint. Today it is neither, which is the single line that makes approve→act impossible.

**W5 — session 2 is never grant-bearing, so a minted grant could never be consumed anyway.**
Nothing in production ever constructs `approvedCall` — `rg -a approvedCall` returns only its two
readers (`tool-registry.ts:139-144`, `framework/tool-protocol/src/tool.ts:395`) and the type
(`framework/harness-protocol/src/harness/harness-adapter.ts:35-40`). The reengagement intent the
granted transition records (`proposed-call-workflow.ts:583-595`) drains into an ordinary session:
`runtime.ts:432-470` builds `provisionParams` from the baked request and copies
`options.sessionWorkflow`, which is `undefined`. Needs: `BakedReengagementRequest` carries the
approved call (`toolId`/`args`/`argPinned`/`identityHash`, all already on the `tailoredGrants` row),
and the drain turns it into
`sessionWorkflow: { sessionRole:"grant-bearing", routeToReview:["irreversible"], approvedCall, ...anchors }`.

**W6 — the two bake failures are swallowed, and that is how the finished loop will fail silently.**
`proposed-call-workflow.ts:579-581` and `:705-707` both `catch { bakedRequest = undefined; }`. With
W5 done, an undefined bake means the reengagement session runs with no approved call → the grant is
never consumed → the liveness net burns `retryCount` and then writes a `failed` outcome
(`applyLivenessRetry`, `:718-730`). The human sees "approved" and then, two sessions later, "did not
execute". Surface the failure at approve time instead.

**W7 — the classifier must become the human's dial, not a fail-closed default.**
`recordProposedCall` hardcodes `reversibility: "irreversible"` (`proposed-call-workflow.ts:419`) and
`classifyReversibility` returns `"irreversible"` for any unsignalled tool
(`framework/tool-protocol/src/tool.ts:324-327`), and the unknown-tool branch routes to review before
it even knows the tool exists (`tool-registry.ts:102-120`). That is the gate-by-default classifier
ETHOS forbids, and it is the difference between finishing A1 and shipping a general approval gate.
The dial already has a home: every tool is seeded into `settings` with its `reversibility`
(`layers/core-api/settings/src/plugin-configuration.ts:760-771`), and exactly one builtin tool
declares itself irreversible (`framework/tool-protocol/src/builtin-tool-catalog.ts:171-176`,
`commit_file`). Default must be "no review"; review happens only for a tool a human marked.

**W8 — the harness-side allowlist carrier is test-only.** `composeWorkflowAllowDeny`
(`framework/tool-protocol/src/tool.ts:383-410`) has no production caller — confirmed with `rg -a`;
only `layers/core-api/src/__tests__/AL7-classifier.test.ts` uses it. Without it the per-harness
native allow/deny lists never learn about the grant, so a subscription-CLI harness can run its own
copy of the tool without passing the registry router. Not required for a builtin-harness loop; is
required before claiming the loop holds across harnesses.

**W9 — the demo fixture sits in the live route.** `FIXTURE_REVIEW` / `"rev-1"`
(`layers/core-api/src/routes/reviews.ts:36-91`) short-circuits the real loader with a hand-written
story. It must go before this feature is real. (Unchanged from the first wave — still DELETE.)

**Where the line is.** Finishing A1 licenses exactly this: *a human marked a tool "ask me first", so
when an agent calls it the call is staged, the human approves, and the agent gets a one-shot,
scope-tuple-keyed permission to do that one thing.* It does not license: routing unknown tools to
review, defaulting unsignalled tools to irreversible, deriving "needs review" from a risk tier, or
any gate justified by "irreversible". W7 is where that line is enforced in code — if W7 is skipped,
finishing A1 ships the thing ETHOS forbids.

---

## Should this service exist?

**KEEP AS the proposed-call approval Service — one feature, three owned tables.** With A1 finished,
`review` owns the only durable state in the approve→act loop (`proposedCalls`, `tailoredGrants`,
`operationOutcomes`), plus the state machine over it and the two liveness triggers. That is a
coherent Service with a real product purpose: a human approves a specific agent action, and the
agent gets to do it. It is not a wrapper, not a port bag, not observability.

But it should be **one** feature, not two. After A2's subscriber dies, the leftover
`createReviewItem` + `attentionReviewReasoningMarker` have nothing to do with proposed calls: their
only real caller is the knowledge attention engine's threshold crossing
(`layers/core-api/knowledge/src/attention-service.ts:295-322`), plus a knowledge-action failure flag
(`layers/core-api/src/services/agent-run-admission-reactions.ts:59-81`) and the two composition sites
that curry them (`layers/core-api/src/routes/knowledge.ts:296-311`,
`layers/core-api/src/services/routine-scheduler-bindings.ts:61-76`). Move them into
`@hyperidle/knowledge`, which already owns both callers and both tables' domain. That deletes the
`KnowledgeReviewWriter` port, the currying factory that exists only to satisfy its 3-arg shape, and
the `review → knowledge` fan-in entirely.

Net: `review` survives, smaller and single-purpose. The package boundary earns itself for the first
time.

## If written today, from scratch

The loop, at MVP tier, is six functions and one dial:

- `recordProposedCall(db, input)` — capture the staged call **and mint its review anchor** (artifact
  + review message + item), taking the classified reversibility as input rather than hardcoding it
- `findProposedCall(db, query)` — the parameterized reader
- `transitionProposedCall(db, transition, ports)` — `held | granted | consumed | outcome-recorded`
- `resolveReengagementRequest(db, id, deps)` — bake the grant-bearing session's request, **including
  the approved call**
- `handleUnconsumedGrantOnSessionEnd` — the crash/no-show net
- `reengageOnAdmissionFailure` — the same net, pre-handoff trigger
- the dial: a per-tool "ask me first" flag a human sets, replacing `classifyReversibility`'s
  fail-closed default

Everything else in the current package either moves out (the knowledge factory) or dies with A2.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 0 |
| PLUGIN | 0 (in-package; see Ruling 3 note for the out-of-package pointer) |
| FINISH | 4 |
| MERGE | 4 |
| SIMPLIFY | 4 |
| KEEP | 9 |

Surface: 11 methods → 9 in this package (2 relocate). **0% cut inside the package.** Say it plainly:
this pass cuts nothing here. The cuts it does buy are elsewhere — A2's gate and subscriber, the
`work` risk-tier reader and its table, seven `ReviewPorts` members, the `KnowledgeReviewWriter` port,
the `"rev-1"` fixture, and ~9 test files that assert on A2's behavior.

## Feature-level kills

**A2 — automatic review after risky work: whole-feature DELETE.** Confirmed with evidence: the gate
is `riskTier !== "medium" && riskTier !== "high" → return`
(`layers/core-api/review/src/session-review-creator.ts:64-65`), reading
`work.getRiskTierByTaskId` → `task_planning_signals`
(`layers/core-api/work/src/task-planning-signals.ts:21-25`). `rg -a` over all four roots finds
**zero production writers** of that table — every `insert(taskPlanningSignals)` is a test
(`layers/core-api/work/src/__tests__/task-planning-signals.integration.test.ts`,
`layers/core-api/src/__tests__/session-review-creator.integration.test.ts`,
`AD1-session-review-routing.integration.test.ts`, `handoff-to.integration.test.ts`). The gate always
returns early. Dies with it: subscriber 1 of `registerReviewSubscriptions`, `getRiskTierByTaskId` and
its `ReviewPorts.work` member, the `task_planning_signals` table and `work`'s reader, the
`ReviewPorts` `users`/`org`/`conversation.updateThread`/`conversation.getThreadById`/
`work.updateTaskById` members, and the tests above.

**Salvage from A2 before it goes:** the human-routing block
(`session-review-creator.ts:86-107`) is the only code in the repo that resolves *which humans* should
see a review. Under Ruling 1 that is core. Move it to the approval review item's creation (W3), then
delete the subscriber.

**The `"rev-1"` demo fixture — DELETE.** `FIXTURE_REVIEW` at `layers/core-api/src/routes/reviews.ts:36-81`
is a hand-written story served by a production route. Unchanged from the first wave.

**Not killed, contrary to the first wave:** the three proposed-call write routes
(`reviews.ts:187-209`), the seam ops (`framework/api-contract/src/core-api-port.ts:726-730` and their
composition), the workflow router branches, `ProposedCallWorkflowPort`, the three tables, and the
`ProposedCallGrantedEvent` / `proposed_call_executed` event types (also protected by Ruling 2 — the
defect there is missing emission, not a missing subscriber: `proposed_call_executed` is declared at
`framework/domain-model/src/events.ts:554-563`, cased in the dispatcher at
`layers/core-api/src/observability/dispatcher.ts:438`, and emitted nowhere).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `findProposedCall` | UI:GET /api/reviews/:reviewMessageId, UI:POST /api/threads/:threadId/messages/:messageId/verdict, INTERNAL | KEEP | The reader both the review page and the verdict endpoint need; correct as written. |
| 2 | `resolveReengagementRequest` | INTERNAL (granted transition, applyLivenessRetry) | FINISH | Must also bake the approved call from the grant row — without it session 2 is never grant-bearing (W5). |
| 3 | `recordProposedCall` | UI:POST /api/reviews/proposed-calls (seam: `CoreApiPort.review.captureProposedCall`) | FINISH | Must mint the review anchor it currently assumes exists (W2) and take the classified reversibility instead of hardcoding `"irreversible"` at line 419 (W7). |
| 4 | `transitionProposedCall` (consumed overload) | UI:POST /api/reviews/proposed-calls/consume (seam) | KEEP | The CAS claim on `(taskScope, agentScope, approvedToolId, consumed=false)` is exactly right; one-shot, no double-execute. |
| 5 | `transitionProposedCall` (non-consumed overload) | UI:POST /api/threads/…/verdict, UI:POST /api/reviews/proposed-calls/:id/outcome | KEEP | Signature is honest about the four transitions; no change needed. |
| 6 | `transitionProposedCall` (implementation) | same as 4-5 | FINISH | The granted branch's `catch { bakedRequest = undefined }` (lines 579-581) turns a failed approve into a silent two-session-later failure (W6). |
| 7 | `handleUnconsumedGrantOnSessionEnd` | EVENT:session_ended (livenessHandler, `session-review-creator.ts:137-157`) | KEEP | Crash/no-show net; becomes live the moment grants exist. Already wired at `service-bootstrap.ts:432-471`. |
| 8 | `reengageOnAdmissionFailure` | EVENT:agent_run_admission_failed (`agent-run-admission-reactions.ts:113-126`) | KEEP | Same behavior, pre-handoff trigger; its producer returns with A1. |
| 9 | `attentionReviewReasoningMarker` | UI:POST /api/knowledge/:id/recompute-attention, AGENT:score_attention, SCHED:routine-scheduler | MERGE | Fold into `@hyperidle/knowledge` beside `attention-service.ts`, its only real consumer — the LIKE-probe idempotency contract is knowledge's, not review's. |
| 10 | `createReviewItem` | AGENT:score_attention, UI:recompute-attention, SCHED:routine-scheduler, EVENT:agent_run_admission_failed | MERGE | Fold into `@hyperidle/knowledge`; kills the `KnowledgeReviewWriter` port and the currying factory that exists only to satisfy its 3-arg shape. |
| 11 | `registerReviewSubscriptions` | BOOTSTRAP (`service-bootstrap.ts:432`) | SIMPLIFY | Delete subscriber 1 (A2's risk-tier session-review creator) and its five routing ports; keep subscriber 2 (the liveness net) and its seven bake ports. Exact inverse of the first wave. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ReviewAgentWorkIntentInput` | KEEP | The recorder contract for the `reengagement` intent the granted transition and the liveness net both produce. |
| `ReviewPorts` | SIMPLIFY | KEEP `intentRecorder`, `requireRunnableAgent`, `work.getTaskById`, `getBetById`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread`. DELETE `work.getRiskTierByTaskId`, `work.updateTaskById`, `conversation.updateThread`, `conversation.getThreadById`, `users.*`, `org.*` — all A2's, except `org.resolveReviewRecipients` which is salvaged to the new capture path (W3), not deleted outright. `work.createItem` + `conversation.insertThread` leave with rows 9/10. |
| `ProposedCallQuery` | KEEP | Input of the live reader; the `by`-variant shape is the right extension point. |
| `ProposedCallView` | KEEP | Return of the live reader; the review page consumes exactly this shape. |
| `ReengagementResolverDeps` | SIMPLIFY | Survives as the resolver's deps, but make the five optional members (`getBetById`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread`) required — every production wiring site already supplies all five (`threads.ts:1705-1716`, `service-bootstrap.ts:449-467`), and optionality only buys a half-baked request that fails later. `optionalReengagementBakeDeps` (lines 232-246) dies with the optionality. |
| `BakedReengagementRequest` | FINISH | Must carry the approved call (`toolId`/`args`/`argPinned`/`identityHash`) so the drain can build a grant-bearing `sessionWorkflow` (W5). |
| `ProposedCallTransition` | KEEP | The discriminated union IS the state machine, and the state machine is the feature. |
| `CreateReviewItemInput` | MERGE | Moves to `@hyperidle/knowledge` with row 10. |
| `CreateReviewItemResult` | MERGE | Moves to `@hyperidle/knowledge` with row 10. |
| `ReengagementSourceUnavailableError` (class) | SIMPLIFY | Both call sites catch and discard it (lines 579-581, 705-707). Return a result type instead of throwing an error nobody handles — the discard is W6, the loop's silent-failure path. |

## Holes this leaves

1. **Automatic post-hoc review of risky agent work disappears entirely** (A2). Nothing observable
   changes — the gate never fired, because nothing ever wrote a risk tier. What genuinely goes is the
   *idea* that finishing a medium/high-risk task should produce a review item. If that idea is wanted
   later, it comes back as a human-set dial, not a tier classifier.
2. **The multi-human review routing must be moved, not deleted.** `org.resolveReviewRecipients` +
   the participant merge is the only "who should see this" logic in the repo. Under Ruling 1 it is
   core. If A2 is deleted carelessly, the finished A1 loop will mint approvals nobody is told about.
3. **Finishing A1 is nine wiring pieces, not one.** W1-W9 above. Any subset short of {W1, W2, W3, W4,
   W5} leaves approve→act still impossible; W6 and W7 decide whether the finished loop is honest;
   W8 decides whether it holds outside the builtin harness.
4. **Until W7 lands, the code in the repo is a gate-by-default classifier.** `recordProposedCall`'s
   hardcoded `"irreversible"`, `classifyReversibility`'s unsignalled default, and the unknown-tool
   branch all say "route it to a human unless proven safe". Switching on the loop before inverting
   that default ships the exact thing ETHOS forbids — the founder should treat W7 as a precondition
   of W1, not a follow-up.
5. **`review` keeps its three tables and its Service boundary.** The first wave's "package dies"
   conclusion is withdrawn. What does leave is the knowledge review-item factory and the
   `KnowledgeReviewWriter` port that exists only to shape it.


---


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/routine.md` for comparison.

# routine — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

| Row | Old verdict | New verdict | Ruling | Why it moved |
|---|---|---|---|---|
| 3 `provisionTeamRoutines` | DELETE | **PLUGIN** | Ruling 3 | Seeding a team with ritual routines (retros, knowledge sweeps) is exactly what a plugin's install step does. The capability moves to the plugin; this function and its `builtin:kind:teamId` id scheme still leave core. The structural bug stands: it seeds a **global** sweep once per team (Ruling 1 — that duplication is still a bug even on a shared backend). |
| 4 `fireBuiltinRoutine` | DELETE | **PLUGIN** | Ruling 3 | The four rituals it dispatches (post-bet retro, portfolio retro, knowledge decay, knowledge promotion) are legitimate knowledge-management ceremony — re-provided by a plugin as generic routines. The structural conviction stands unchanged: this function is a second execution path that bypasses the agent-run architecture (no session, no intent queue, never runs the `skillId` its own specs declare). The plugin re-provision uses the generic path, **not** this function. |
| 5 `registerBuiltinRoutineHandlers` | DELETE | **PLUGIN** | Ruling 3 | The post-bet retro ritual (bet completes → retro happens) is a plugin-provided event trigger on `bet_state_changed`. The form-letter implementation (`Hypothesis: X / Reality: <date>`, no agent) is not re-provided. Ruling 2 confirms the trigger shape is right: `bet_state_changed` is an extension-surface event a plugin hangs off. |
| Feature: portfolio retro | DELETE ("dead forever, no replacement") | **PLUGIN** | Ruling 3 | A monthly portfolio retro is a ritual of the retro/practice-meeting kind — plugin territory. What is *not* re-provided: the current title-dump implementation and the per-team firing of a global read (Ruling 1). |
| Feature: knowledge decay/promotion sweeps | DELETE + re-wire as core `setInterval`s (Hole 2) | **PLUGIN** | Ruling 3 | First wave routed the sweeps to the composition root as core clocks. Wrong destination — the founder named "builtin knowledge sweeps" as knowledge-management ritual. They leave core entirely and come back as plugin-provided scheduled routines, fired **once globally**, not once per team (Ruling 1). |

**Ruling 2 re-examination — no rows flip.** Every DELETE in the first wave was re-checked against "did this rest on subscriber count?": none did. `registerBuiltinRoutineHandlers` was convicted for being a form letter bypassing the agent path, not for lacking listeners. `FireResult.sessionId/emitted/extra` die as payload fields nothing ever sets — the case Ruling 2 explicitly does not protect. The reaper kill is a config branch no production caller wires (re-confirmed: `service-bootstrap.ts:589` threads `reaperCadenceMs` but nothing passes `reap:`), not an event argument. And the standing blind spot is now doctrine, not a caveat: `registerEventTriggers` (`routine-scheduler.ts:702`) subscribes to whatever `eventType` stored routine rows name — **runtime data**. No event type reachable through routine triggers may ever be judged dead from this repository; plugins and users attach triggers to any event the product emits.

**Ruling 1 re-examination — no rows flip, one hole reworded.** No routine verdict rested on a single-user premise. Per-team routine rows are legitimate on a shared backend (a team's own retro cadence is per-team by nature); what remains convicted is seeding a **teamId-ignoring global sweep** once per team — re-confirmed in code: `runKnowledgeDecay` calls `ports.knowledge.runStaleSweep(db, eventBus, nowMs, undefined, …)` and `runPortfolioRetro` reads global `listRecentByLayers`, both discarding the seeded routine's team. Hole 4 ("empty routine list is the correct default") is restated for a shared backend: teams start with what their installed plugins provision — core still pre-installs nothing.

### What leaves core and becomes a plugin

**A knowledge-ritual plugin** (no work package exists yet — FOUNDER-RULINGS says one needs writing) re-provides, via the **generic** routine machinery this package keeps:

1. **Post-bet retro** — an event routine (`triggerType:"event"`, `eventType:"bet_state_changed"`, skill `bet_retro`) firing a real agent run that analyzes hypothesis vs reality, replacing the form letter. Two generic-path capability gaps block it today and become plugin-enabling core work: `registerEventTriggers` drops the event payload (the agent would not know which bet), and there is no payload filter (it would fire on every state change, not just `toState:"completed"`).
2. **Portfolio retro** — a monthly scheduled routine + `portfolio_retro` skill, agent-run, provisioned once (org-scoped), not per team.
3. **Knowledge decay sweep** and **knowledge promotion sweep** — scheduled routines invoking the knowledge service's sweeps, provisioned once globally.
4. **Per-team ritual provisioning** — the plugin's install/team-join step creates its routine rows through plain `insertRoutine`, replacing `provisionTeamRoutines`.

**What is deleted plain and never re-provided:** the `builtin:*` id scheme (`isBuiltinRoutineId`, `extractBuiltinKind`, `BuiltinRoutineId`), the bypass execution path (`fireBuiltinRoutine`'s switch, `RunBuiltinResult`, `PostBetRetroArgs`, the builtin branches in the tick / trigger route / bindings), the hardcoded TypeScript ritual bodies, the form-letter retro text, and per-team firing of global sweeps. Nobody would want these in any form; the plugin uses the generic path.

---

## Should this service exist?

**KEEP AS: routine definition store + the generic scheduler — unchanged, and strengthened by Ruling 2.** Routines are one of the five process primitives, with real doors on all three fronts: UI (`/api/routines/*` CRUD + trigger, WorkRoutine page, RoutineDetailPane, team routine cards), agent tools (`create_routine`, `update_routine`), and the scheduler timer (TICK every `config.pollIntervalMs`, wired at `layers/core-api/src/service-bootstrap.ts`). Under Ruling 2 this package is not just a feature — it is **the attachment mechanism** for the event extension surface: "plugins or users attach triggers and actions to events" is implemented here (`registerEventTriggers` + event-trigger routine rows). That raises the generic path's status and deepens the conviction of the builtin path, which sidesteps the product's own extension mechanism from inside core.

The builtin-routine subsystem still leaves core in its entirety. What changes is the destination: the rituals it carries are re-provided as a plugin (Ruling 3); the mechanism dies plain. The three structural findings stand:

1. **Per-team seeding of global sweeps is broken by construction** — N teams fire the same teamId-ignoring sweep N times daily (re-confirmed in `runKnowledgeDecay`/`runPortfolioRetro` signatures). Ruling 1 does not soften this: per-team *rituals* are fine, per-team *global sweeps* are duplication.
2. **The "retros" are form letters** — field interpolation, no agent, and each builtin spec declares a `skillId` nothing ever executes. The generic path is the first way to do exactly this.
3. **A second execution path bypassing the agent-run architecture is wrong** regardless of what it runs — no session, no intent queue, invisible to the extension surface.

## If written today, from scratch

Against the corrected premise — a shared backend serving several teams, OIDC identity, an event stream that plugins hang off:

- `insertRoutine`, `updateRoutine`, `getRoutine`, `listRoutines` — definition CRUD (UI + agent tools + **plugin provisioning**)
- `insertRoutineRun`, `updateRoutineRun`, `getRoutineRun`, `listRoutineRuns` — run records (coalescing guard, session-end closure, run history)
- `fireGenericRoutine` — the one firing path: resolve + bake + enqueue intent (resolver folded in), **carrying the triggering event's payload through to the run**
- `startRoutineScheduler` — the tick loop + event-trigger registration; this *is* the "attach a trigger to any event" extension surface
- `humanizeSchedule` — presentation sugar with a real UI door

Nothing named `builtin:*` exists. Rituals arrive as plugin-provisioned rows through the same CRUD everyone else uses. The one genuinely missing piece of the from-scratch shape is event-payload delivery to the fired run — today's `registerEventTriggers` discards it, which is what forced the builtin bypass into existence in the first place.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| PLUGIN | 3 |
| MERGE | 1 |
| SIMPLIFY | 5 |
| KEEP | 6 |

Surface: 17 methods → 11 exported methods in core (2 deleted plain, 3 leave core for the plugin, 1 merged in). Of ~860 lines in `routine-scheduler.ts`, roughly 470 (the builtin subsystem) leave core; only the ritual *intent* — four routines and two skills — is re-provided in the plugin, through the generic path.

## Feature-level kills

1. **Builtin-routine mechanism — DELETE, whole subsystem, nothing re-provided.** Dies plain: `BUILTIN_ROUTINE_IDS`, `BUILTIN_SPECS`, `isBuiltinRoutineId`, `extractBuiltinKind`, the `fireBuiltinRoutine` switch and ritual bodies (`runPostBetRetro`/`runPortfolioRetro`/`runKnowledgeDecay`/`runKnowledgePromotion`), the builtin branch of the scheduler tick, the ports blocks that exist only for them (`work`, `conversation`, `knowledge`), the builtin branch of `POST /api/routines/:id/trigger`, `POST /api/org/team-routines`, the seeding call in `POST /api/teams` and the `create_team` tool, `registerBuiltinRoutineReactions` + the builtin dispatch in `fireRoutine` (bindings), and `tools/eval/src/scenarios/builtin-routines.ts`.
2. **Knowledge rituals — PLUGIN (Ruling 3).** Post-bet retro, portfolio retro, knowledge decay, knowledge promotion: removed from core, re-provided by a knowledge-ritual plugin as generic routines + skills (see "What leaves core"). Requires the event-payload gap in `registerEventTriggers` closed as core work.
3. **The reaper piggyback — DELETE, unchanged.** `config.reap`/`reaperCadenceMs`/`ROUTINE_REAPER_CADENCE_MS`: never production-wired (re-confirmed — bootstrap threads `reaperCadenceMs`, nothing passes `reap:`). Dead branch shipped as config surface.
4. **Routine soft-delete — DELETE, unchanged.** `deletedAt` + `includeDeleted` + `DELETE /api/routines/:id` is a second off-switch next to retire (`active:false`). Not voided by any ruling — it is an enterprise reflex, not a single-user argument.
5. **Skipped-run audit rows on manual trigger — DELETE, unchanged.** `recordSkippedRun` duplicates the HTTP response into a run row. Audit trail nobody reads; no ruling touches it.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `isBuiltinRoutineId` | UI:POST /api/routines/:id/trigger, SCHED:TICK pollIntervalMs | DELETE | Recognizes `builtin:*` id strings — pure mechanism of the bypass path; the plugin uses ordinary routine ids. Kill both callers' builtin branches. |
| 2 | `extractBuiltinKind` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | DELETE | Id-string parsing (`builtin:kind:teamId`) for a scheme nobody re-provides. |
| 3 | `provisionTeamRoutines` | UI:POST /api/teams/, UI:POST /api/org/team-routines, AGENT:create_team | PLUGIN | Ruling 3: seeding ritual routines is the plugin's install step, done via `insertRoutine` with generic rows. This function leaves core; its bug (seeds a teamId-ignoring global sweep once per team) is not carried over — plugin provisions global sweeps once (Ruling 1). |
| 4 | `fireBuiltinRoutine` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | PLUGIN | Ruling 3: the four rituals it dispatches are re-provided by the plugin — through the generic path. The function itself is the second execution path bypassing the agent-run architecture (never runs its specs' own `skillId`) and is not re-provided. |
| 5 | `registerBuiltinRoutineHandlers` | BOOTSTRAP (bindings → `service-bootstrap.ts`) | PLUGIN | Ruling 3: bet-completes→retro is a plugin event trigger on `bet_state_changed` firing a real agent run. The form-letter body (`Hypothesis: X / Reality: <date>`) is not re-provided. Ruling 2: the event is the right attachment point. |
| 6 | `fireGenericRoutine` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:<db-configured eventType> via registerEventTriggers | SIMPLIFY | The core firing path — and post-rulings the plugin's execution vehicle. Drop `recordSkippedRun`, absorb the resolver (row 16), shrink return to `{fired, reason?, runId?}`. New core work it must gain for the plugin: carry the triggering event payload. |
| 7 | `startRoutineScheduler` | BOOTSTRAP (`service-bootstrap.ts`) — IS the SCHED:TICK door | SIMPLIFY | The timer door plus the event-trigger extension surface (Ruling 2 elevates it). Delete the builtin tick branch and the never-wired `reap`/`reaperCadenceMs` machinery. |
| 8 | `insertRoutine` | UI:POST /api/routines/, AGENT:create_routine, UI:POST /api/teams/ | SIMPLIFY | Keep the write — it becomes the plugin's provisioning door too. Drop `opts.onConflictDoNothing`… unless the plugin install step proves idempotent-seed need; today its only caller is row 3, which leaves core, so it goes. |
| 9 | `updateRoutine` | UI:PATCH /api/routines/:id, UI:POST /api/routines/:id/retire, AGENT:update_routine, SCHED:TICK, EVENT:session_ended | KEEP | Core value: retire toggle + the scheduler's `nextRunAt`/`lastRunAt` advance. Doors: PATCH route, update_routine tool, tick. |
| 10 | `getRoutine` | UI:GET /api/routines/:id (+5 more routes), AGENT:update_routine, SCHED:TICK | KEEP | Every route and the scheduler load the definition through it. Door: GET /api/routines/:id. |
| 11 | `listRoutines` | UI:GET /api/routines/, UI:GET /api/teams/:teamId, SCHED:TICK, BOOTSTRAP (settings backfill) | SIMPLIFY | Keep the list. Drop `includeDeleted` with the soft-delete kill; other filters live. |
| 12 | `insertRoutineRun` | UI:POST /api/routines/:id/trigger, SCHED:TICK | KEEP | Run row is load-bearing — coalescing guard and resolver validate against it. Door: SCHED:TICK. |
| 13 | `updateRoutineRun` | SCHED:TICK, EVENT:session_ended, EVENT:agent_run_lifecycle_changed, EVENT:agent_run_admission_failed | KEEP | Closes runs on session end / admission failure; `onlyIfRunning` race guard has three live production callers. |
| 14 | `getRoutineRun` | SCHED:TICK (via resolver), EVENT:session_ended | KEEP | Resolver validation + session-end closure both read the run row. |
| 15 | `listRoutineRuns` | UI:GET /api/routines/:id, UI:GET /api/teams/:teamId, SCHED:TICK | SIMPLIFY | Keep — run history + coalescing guard. Drop `order`: no production caller passes `"asc"`; hardcode desc. |
| 16 | `resolveRoutineRunRequest` | INTERNAL (sole caller: `fireGenericRoutine`) | MERGE | One caller, one transaction, plus a deps interface mirroring `RoutineSchedulerPorts`. Fold into `fireGenericRoutine`, unexport. |
| 17 | `humanizeSchedule` | UI:GET /api/routines/:id, UI:GET /api/teams/:teamId | KEEP | Readable schedules on the routine cards and detail pane — the primitive's main surface. Pure, zero deps. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `RoutineRunSourceUnavailableError` (class) | SIMPLIFY | Unexport. After row 16's merge its only job lives inside one file. |
| `RoutineSchedulerPorts` | SIMPLIFY | Drop `work`/`conversation`/`knowledge` blocks — every member serves only the ritual bodies leaving core; the plugin brings its own access, core ports do not serve it. Survives as `{settings, workIntents, requireRunnableAgent, getTeamById, assembleSessionKnowledge}`, absorbing `RoutineRunResolverDeps`. |
| `BuiltinRoutineId` | DELETE | Id scheme of the bypass mechanism — not re-provided. |
| `RunBuiltinResult` | DELETE | Return type of the bypass dispatcher — not re-provided. |
| `PostBetRetroArgs` | DELETE | One-field args type of a ritual body; the plugin's retro is a generic event routine, not this signature. |
| `FireResult` | SIMPLIFY | `sessionId`/`emitted`/`extra` are payload fields nothing sets on the generic path — exist only for the builtin merge. Ruling 2 does not protect never-set fields. Shrink to `{fired, reason?, runId?}`; the bindings' duplicate `FireRoutineResult` dies too. |
| `RoutineSchedulerConfig` | SIMPLIFY | Drop `reap` + `reaperCadenceMs` (never production-wired, re-confirmed). Survives as `{pollIntervalMs, canProvision?}` — and `canProvision` dies too once row 3 leaves core. |
| `RoutineScheduler` | KEEP | The stop handle the bootstrap disposer holds. Door: BOOTSTRAP. |
| `Routine` | KEEP | The row type; used by routes, reactions, bindings, tools — and the plugin surface. |
| `RoutineRun` | KEEP | The row type for run records. |
| `RoutinePatch` | SIMPLIFY | Drop the `\| SQL` widening — its own @lore admits it serves no caller. `Partial<NewRoutine>`. |
| `RoutineRunPatch` | SIMPLIFY | Same: drop `\| SQL`, no production caller passes a fragment. |
| `BakedRoutineRunRequest` | KEEP | The emit-time contract the work-intent seam and agent-orchestration drain consume. Door: SCHED:TICK → `enqueueWorkIntent`. Grows an event-payload field when the plugin work lands. |
| `RoutineRunResolverDeps` | MERGE | Dies as a declaration when row 16 merges — its four fields are already on `RoutineSchedulerPorts`. |

## Holes this leaves

1. **No automatic post-bet retro until the plugin exists.** What is lost meanwhile is a form letter, not analysis. The plugin's version needs two pieces of core work first: `registerEventTriggers` must pass the event payload through to the fired run, and event-trigger routines need a payload filter (`toState:"completed"`). The founder's parked "post-bet-retro bypasses the intent queue" story becomes: close those two gaps, then ship the ritual in the plugin.
2. **No knowledge decay/promotion until the plugin exists.** Changed from the first wave: these do **not** get re-wired as core `setInterval`s — Ruling 3 sends them to the plugin as globally-provisioned scheduled routines. Until then, stale knowledge does not decay and provisional items do not auto-promote. If that gap is unacceptable for long, the plugin is the work to schedule, not a core shim.
3. **No portfolio retro until the plugin exists.** Changed from "gone forever": the ritual returns in the plugin as an agent-run monthly review, provisioned once — not the current per-team title dump.
4. **New teams get no pre-installed routines from core.** Restated for the shared backend: teams start with whatever their installed plugins provision. Core seeding ceremony is gone; that is the correct division of labor.
5. **Manually triggering a coalesced routine leaves no `skipped` row.** The HTTP response still says `"coalesced"`. Unchanged.
6. **Deleted-routine history semantics change.** Hard delete takes run rows with it (FK); retire (`active:false`) remains the way to stop a routine while keeping history. Unchanged.
7. **No knowledge-ritual plugin work package exists.** FOUNDER-RULINGS confirms none is registered. Until one is written, every PLUGIN row in this file is a deletion with an IOU attached.


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


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/users.md` for comparison.

# users — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

### Rows whose verdict moved

| # | Method | Old verdict | New verdict | Ruling |
|---|---|---|---|---|
| 18 | `getOrCreateUser` | DELETE | FINISH | Ruling 1 + A7 — resolve-or-provision a user record for an authenticated identity is exactly what OIDC just-in-time provisioning needs. The current form (caller-supplied random id, redundant re-select, only caller `claimInvite`) dies; the idea is the one survivor of the credential stack and the countable carrier of the A7 work inside this package. |

One verdict moved. Every other verdict stands — but five stand on **corrected reasoning**:

### Rows whose verdict stands on a new premise (Ruling 1)

| # | Method | Verdict (unchanged) | Old reason (voided) | New reason |
|---|---|---|---|---|
| 7 | `createInvite` | DELETE | "no client / product is single-user" | Invites are not the access mechanism — OIDC is. Ruling 1 names invite minting as correctly dead. |
| 8 | `claimInvite` | DELETE | same | Invite claiming dies because OIDC replaces it, not because there is one user. |
| 9 | `createLoginSession` | DELETE | dies with its only caller | Home-grown session minting dies because the OIDC provider owns sessions. (Also still: only caller is `claimInvite` — re-confirmed with `rg -a`.) |
| 10 | `validateBearerToken` | DELETE | "the Bearer branch is unreachable; deployed auth is one team key" | Home-grown token-table lookup is replaced by OIDC token verification (JWKS), which shares zero code with this function. The replacement middleware is A7 work in `core-api/src/middleware/auth.ts`, not a finish of this function. |
| 11 | `revokeLoginSession` | DELETE | "logout for a system nobody can log into" | Logout belongs to the OIDC provider. |

Rows 5–6 (hint progress) were re-judged under Ruling 1 and **stand as DELETE**: the first-wave argument ("tooltip memory belongs in localStorage") never rested on single-user. Under a shared backend, localStorage is per-human-per-browser, which is exactly right for first-run tooltips; a DB table + two routes + a service so a dismissed tooltip roams across a human's devices is still not core value.

Ruling 2 (events) moves nothing here — this verdict killed no event types. Ruling 3 (ritual → plugin) has no rows in this package; no PLUGIN verdicts.

**Re-verification on the current tree** (all with `rg -a`): nothing sets `HYPERIDLE_SHARED_MODE` anywhere (code, docs, helm, desktop — the one new reference since the first wave is a doc comment in `layers/agent-orchestration/connections/src/held-connections-for-provisioning.ts`, not code); `getOrCreateUser` and `createLoginSession` have exactly one production caller each (`invite-code.ts`); `orderById` has exactly one caller and it is a test; **zero OIDC code exists in the repo** — A7 is entirely unbuilt.

## Should this service exist?

KEEP AS the identity spine — sole owner of the `users` table, now judged against the real deployment: a **shared backend for a team, and an organisation of several teams, with identity from an OIDC provider**. `findUser`/`listUsers`/`insertUser`/`updateUser` sit under 54/22/10/3 real doors, `requireRunnableAgent` is the one cross-domain invariant ("never run the human sender as the agent") under 19 doors, and — new under Ruling 1 — this service is where an OIDC-authenticated human becomes a `users` row. "Who is the acting human" is not an enterprise reflex on a shared backend; it is load-bearing (conversation attribution, per-human held connections in the connections service key on `userId`, team membership).

The per-human credential stack inside it still dies wholesale — but for the corrected reason: **OIDC replaces it**, it was never the wrong goal, only the wrong mechanism (home-grown invites + bearer sessions), and it shipped gated behind an env var nothing sets, with no client.

## If written today, from scratch

Against the corrected premise — shared backend, team of humans + agents, OIDC identity, event stream plugins hang off — eight public symbols:

- `findUser(exec, filter)` — single-row read
- `listUsers(exec, filter)` — multi-row read
- `insertUser(exec, values, opts?: { ifAbsent?: true })` — one insert, conflict mode as option
- `updateUser(exec, id, patch: Partial<NewUser>)` — plain patch, no SQL-expression admittance
- `getOrCreateUserForIdentity(exec, subject, profile)` — the finished row 18: map a verified OIDC subject to a `users` row, create on first login (JIT provisioning). The only human-creation door besides founder setup.
- `requireRunnableAgent(db, agentId)` + `AgentNotRunnableError` — the runnability invariant
- `createUpgradeTokenStore()` — one-shot WS handshake tokens (in-memory, hardcoded TTL/cap)

Plus `UserFilter` (minus `orderById`) as the one filter type. What is deliberately **not** in the from-scratch shape: invite codes, home-grown sessions/logout, credential reaping (the OIDC provider owns session lifecycle), a role matrix (`admin`/`member` — if a human role distinction is ever earned, it arrives as an OIDC claim, not a table), server-side tooltip memory, and a perpetual backfill.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 9 |
| MERGE | 2 |
| SIMPLIFY | 3 |
| FINISH | 1 |
| KEEP | 4 |

Surface: 19 methods (18 functions + 1 class) → 8 (58% cut). Delta vs first wave: one DELETE became FINISH; the cut shrinks by one symbol because OIDC provisioning keeps a door.

## Feature-level kills

### 1. The home-grown credential mechanism (rows 1, 7–11) — DELETE, replaced by OIDC (Ruling 1 / A7)

`invite-code.ts`, `login-session.ts`, `credentials-reaper.ts`, and the `inviteCodes` + `loginSessions` tables. The conviction is re-based:

1. **Wrong mechanism by ruling.** Access to the shared backend arrives via an OIDC provider. Invite minting, invite claiming, and home-grown bearer sessions are the mechanism OIDC replaces — Ruling 1 names them dead explicitly.
2. **Still unreachable as shipped.** All of it mounts only under `HYPERIDLE_SHARED_MODE=true`, which nothing sets (re-confirmed on current tree), and no client mints invites, claims them, stores a session token, or logs out. Nothing real breaks when it goes.
3. **What it tried to do survives elsewhere.** Per-human identity on a shared backend is real and needed — it is re-provided by A7 (OIDC middleware + row 18's FINISH), not preserved by keeping this code.

Cascade kills, adjusted: `auth-public.ts`, the shared-mode Bearer branch + `handleBearerAuth` in `middleware/auth.ts` (its successor is the A7 OIDC verification, written fresh), `INVITE_ROLES` + `LOGIN_SESSION_TTL_MS` + `INVITE_CODE_TTL_MS`, `SESSION_EXPIRED`/`SESSION_REVOKED`/`INVITE_CLAIMED`/`INVITE_EXPIRED` error codes, `loginSessionId`/`authMethod="login_session"` context vars, the `reapExpiredCredentials` call in `service-bootstrap.ts:510`, both tables, the S1-* integration tests. **Not** killed: the `sharedMode` flag itself — under Ruling 1 shared mode is the real deployment, so the flag's fate (probably "which auth middleware mounts") is decided by A7, not by this deletion.

### 2. Server-side hint dismissal (rows 5–6) — DELETE (re-judged under Ruling 1, stands)

`hint-progress.ts`, the `hintProgress` table, both `/api/hint-progress` routes, the round-trip in `useHints.tsx`. Multi-human changes nothing: localStorage is already per-human-per-browser. The only capability lost is dismissals roaming across one human's devices — first-run tooltips do not earn a table and two endpoints for that. The hook already degrades to the localStorage shape on API failure.

### 3. Perpetual factory backfill (row 3) — DELETE (premise-neutral, unchanged)

`setAgentCategoryForRole` re-runs the one-time AB0 backfill every launch and clobbers any recategorized factory-role agent at next boot. On a shared backend this is *worse* than first judged: one boot reverts a category some other team member set. A migration wearing a bootstrap costume.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `reapExpiredCredentials` | SCHED:6h retention sweep (`service-bootstrap.ts:510`) | DELETE | Reaps tables that die with feature kill #1; under OIDC the provider owns session lifecycle — there is nothing home-grown left to reap. |
| 2 | `insertUserIfAbsent` | BOOTSTRAP (`bootstrap/factory-state.ts` via desktop + tools/setup) | MERGE | Fold into `insertUser(exec, values, { ifAbsent: true })`; two insert functions are one insert function. Unchanged. |
| 3 | `setAgentCategoryForRole` | BOOTSTRAP (`bootstrap/factory-state.ts`) | DELETE | Permanent re-run of the one-time AB0 backfill; on a shared backend it reverts another human's recategorization every boot. Unchanged. |
| 4 | `listFactoryAgents` | BOOTSTRAP (`bootstrap/factory-state.ts`) | MERGE | Bespoke projected getter; `listUsers(db, {ids, kind:"ai"})` + caller projects `{id, role}`. Unchanged. |
| 5 | `listDismissedHints` | UI:GET /api/hint-progress/ | DELETE | Re-judged under Ruling 1, stands — localStorage is per-human already; tooltip memory earns no table. |
| 6 | `dismissHint` | UI:POST /api/hint-progress/:hintId/dismiss | DELETE | Dies with #5. Unchanged. |
| 7 | `createInvite` | UI:POST /api/auth/invite (mounts only under `HYPERIDLE_SHARED_MODE=true` — nothing sets it) | DELETE | Ruling 1: invites are not the access mechanism, OIDC is. Reason re-based; verdict stands. |
| 8 | `claimInvite` | UI:POST /api/auth/claim (same dead gate) | DELETE | Invite claiming is replaced by OIDC login. Reason re-based; verdict stands. |
| 9 | `createLoginSession` | INTERNAL (only production caller `claimInvite` — re-confirmed) | DELETE | The OIDC provider owns sessions; also dies with its only caller. |
| 10 | `validateBearerToken` | BOOTSTRAP (`middleware/auth.ts` shared-mode branch) | DELETE | Home-grown token-table lookup; its successor is OIDC JWT verification, which shares zero code — that successor is A7 middleware work, not a finish of this function. |
| 11 | `revokeLoginSession` | UI:POST /api/auth/logout (shared mode only; no client) | DELETE | Logout belongs to the OIDC provider. Reason re-based; verdict stands. |
| 12 | `requireRunnableAgent` | UI:POST /api/threads/:id/messages + 18 more doors, 6 event subscribers | KEEP | The one cross-domain invariant (never run the human sender as the agent) — on a shared backend with several humans it matters *more*. Cross-service debt unchanged: `session-requests`' duplicate `requireRunnableActor` should die into this one. |
| 13 | `createUpgradeTokenStore` | BOOTSTRAP (`app.ts`/`boot.ts`) → UI:POST /api/auth/ws-token → `core-ui` ws-client | SIMPLIFY | Live (the UI's WS handshake rides it); drop the `HYPERIDLE_WS_TOKEN_TTL_MS`/`HYPERIDLE_WS_TOKEN_MAX` env knobs — referenced nowhere but this file and its test; hardcode 60s/1000. Unchanged. |
| 14 | `findUser` | 54 doors (routes, agent tools, schedulers, subscribers) | KEEP | The identity spine's single-row read. Unchanged. |
| 15 | `listUsers` | 22 doors | SIMPLIFY | Drop `orderById` — sole caller is `conversation-user-store-reads.integration.test.ts` (re-confirmed); test-only surface is dead surface. Unchanged. |
| 16 | `insertUser` | 10 doors (user setup, agents, teams, scaffold, assistant) | KEEP | The one write door to `users`; absorbs row 2's conflict mode; becomes the insert under row 18's provisioning. Unchanged. |
| 17 | `updateUser` | UI:PATCH /api/users/:id, PATCH /api/agents/:id, DELETE /api/agents/:id | SIMPLIFY | `UserPatch`'s SQL-expression admittance lost its only use when cost metering died; patch becomes `Partial<NewUser>`. Unchanged. |
| 18 | `getOrCreateUser` | INTERNAL (only production caller `claimInvite`) | **FINISH** | Ruling 1 + A7. Reshape into OIDC just-in-time provisioning: key by verified OIDC subject (not a caller-supplied random id), get the mapped `users` row or create it on first login, drop the redundant post-insert re-select. This is the countable A7 work inside this package — the one idea from the credential stack that a shared backend genuinely needs. |
| 19 | `AgentNotRunnableError` (class) | Caught by `routine/src/routine-service.ts` + route handlers | KEEP | The error contract of row 12. Unchanged. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ReapExpiredCredentialsArgs` | DELETE | Dies with row 1. |
| `ReapExpiredCredentialsResult` | DELETE | Dies with row 1. |
| `DismissedHint` | DELETE | Dies with rows 5–6. |
| `UpgradeTokenStore` | KEEP | Live DI port between boot composition and the auth route/WS handler; both members have real callers. |
| `UserFilter` | SIMPLIFY | Drop `orderById` (test-only). The other eight fields have production callers; on a shared backend `teamIds`/`excludeId`/`nameContains` are load-bearing, not speculative. |

## Holes this leaves

1. **Until A7 lands, a second human has no individual identity.** This is now a **scheduled gap, not an accepted one** (the first wave's "hole in the roadmap, not the product" framing is void). Deleting the invite/session stack removes nothing reachable, but the shared backend the product *is* needs OIDC: verification middleware in `core-api/src/middleware/auth.ts` and row 18's FINISH in this package. Zero OIDC code exists today — **a work package for A7 needs writing**; nothing in any track registry covers it.
2. **Per-human held connections keep working.** `held-connections-for-provisioning.ts` scopes plaintext tokens per `userId`; its doc comment cites "shipped shared mode + invite codes" as the identity source, but the code keys on `userId` only — OIDC supplies that instead. Comment goes stale, behavior does not break.
3. **Hint dismissals stop roaming across a human's devices.** First-run UX; acceptable even multi-human.
4. **`loginSessions`/`inviteCodes` tables drop** — a migration, plus S1-* integration tests, `INVITE_ROLES`, both TTL constants, four API error codes. Auth middleware collapses to API-key-only *for now*; A7 replaces the shared-mode branch with OIDC verification. The `sharedMode` flag survives this deletion — its fate is A7's to decide, since shared mode is the real deployment (Ruling 1), not an edge case.
5. **Pre-AB0 databases never get `agentCategory` backfilled** — one SQL migration fixes it once instead of every launch, destructively.
6. **Nothing reaps credentials** — nothing home-grown is left to reap; the OIDC provider owns session lifecycle. The 6h sweep keeps reaping its other tables untouched.


---


> **REVISED after the founder rulings.** The first-wave verdict is kept at `.pipeline/work/AU20/destroy/verdicts/work.md` for comparison.

# work — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

| Row / artifact | Old verdict | New verdict | Ruling |
|---|---|---|---|
| `checkAndUnblockDependents` (row 4) | DELETE | **FINISH** | A6 — tasks carry a dependency tree; finishing unblocks dependents and moves them into progress. The watcher is the right machinery; the writer is what's missing. |
| `tasks.dependencies` column | DELETE (kill #1) | **KEEP** | A6 — it is the tree. Writer to be built. |
| `task_state_changed` subscriber wiring (`app.ts:527`) | DELETE (kill #1) | **KEEP** | A6 — it is the trigger of the finished feature. |
| `list` `dependencyId` branch (`work-service.ts:464`) + `WorkFilter.dependencyId` | DELETE (inside kills #1/#7) | **KEEP** | A6 — it is the watcher's pre-filter. Rows 15/16 and `WorkFilter` stay SIMPLIFY but their kill-scope shrinks by this branch. |
| `getTaskRiskTierByTaskId` (row 6) + `task_planning_signals` + review port member + gate | DELETE | **DELETE — founder-confirmed** | A2. Unchanged. |
| Phantom `item_created` emit in `updateBetField` (kill #5) | DELETE | **DELETE — survives Ruling-2 recheck** | Ruling 2 protects event types whose emission is missing. This is the inverse: an emission whose fact is missing. No items row exists for the fabricated `review-${betId}-${Date.now()}` id — on an extension surface a false announcement is worse than none, because a plugin trigger would act on an item that isn't there. The `item_created` event TYPE stays (live elsewhere); only this lying emission dies. If done-condition-change review is wanted, it is the A2-shaped ceremony the founder just confirmed dead. |
| `dependency_met` event type | (not in my surface — noted) | **KEEP, emission to be added** | Ruling 2. Where to emit: see build section below. |

**Ruling 1 recheck (shared backend):** swept every row for single-user reasoning. None of my kills rest on it. The write-only ledgers (`revisionLog`/`auditTrail`) die for zero readers — a table with no read surface is dead at any user count, and the founder said these findings stand. `teamId` scoping in `list`, `ownerAgentId` filters, and the `Bet`/`Task` row types already survive as KEEP — the work service takes identity (`teamId`, `ownerAgentId`) as data and never authenticates; OIDC lands upstream of it. No row moves.

**Ruling 3 recheck (knowledge ritual → plugin):** the only ritual-shaped traffic touching this package is retro routines reaching the generic `create` door (row 17). The ritual lives in routine/knowledge surfaces, not here; `create` is the machinery of working and stays regardless of where the retro plugin lands. **Zero PLUGIN rows in `work`.**

**Row deltas:** 1 verdict flipped (DELETE→FINISH), 3 rows keep their verdict letter with shrunken kill-scope (rows 15, 16, `WorkFilter`), 2 non-row artifacts flipped DELETE→KEEP (column, subscriber wiring), 1 DELETE founder-confirmed, 1 DELETE re-justified under Ruling 2.

### What must be built for the task dependency tree (A6 = FINISH)

The watcher body is essentially right already. What's missing is the writer, a gate, and one event emission:

1. **Tree shape.** `tasks.dependencies` (`framework/db/src/schema.ts:219`) stays a JSON text array of task ids on the *dependent* row — each child lists its parents. That edge-list is a DAG; sufficient. Keep the JSON-quoted LIKE pre-filter with `ESCAPE` (`work-service.ts:464`) — it is the reason the watcher doesn't scan the table.

2. **Writers — three doors, all currently missing the field:**
   - `POST /api/tasks` (`layers/core-api/src/routes/tasks.ts:97`): `createTaskSchema` gains optional `dependencies: string[]`; route validates every id is an existing task **in the same bet**, no self-reference, no duplicates; `work.create` writes the column.
   - `create_task` agent tool (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:605`): schema gains optional `dependencies`; flows through the same route via `ports.coreApi.createTask` — `CreateTaskRequest` on the seam gains the field. This is the primary writer: agents decomposing work is where trees come from now that bet-decomposition is gone.
   - `PATCH /api/tasks/:id` (`routes/tasks.ts:197`): `updateTaskSchema` gains `dependencies` so the tree can be rewired after creation.
   - **Cycle guard at write time:** walk the bet's tasks (bounded set) and reject a write that closes a cycle. Not paranoia — a cycle parks every member in `hold` forever with no event that can ever free them.

3. **Hold gate at accept time — the real missing half.** Today `transitionTask` dispatches on `toState === "accepted" && ownerAgentId` (`task-state-machine.ts:131`) with zero dependency check: an accepted dependent would start its agent before its dependencies finish. Build: inside the accept transition, read the dependency rows; if any is not `done`, skip the dispatch block and CAS the task on to `hold` (legal edge: `accepted → hold`). The dep-read and the hold-write must serialize against the dependency's own done-CAS (same-tx or ordered CAS) so a dependency finishing concurrently can't strand the task in `hold` with the watcher's trigger already fired.

4. **"Move into progress" against the existing state machine** (checked: `framework/domain-model/src/task-transition.ts`). The grammar has **no `hold → in_progress` edge**, and `in_progress` has exactly one production writer: the `session_started` reaction (`layers/core-api/src/services/work-session-started-reactions.ts:72`) doing `accepted → in_progress`. So "unblock and move into progress" is not a new transition — it is the existing chain: watcher does `hold → accepted` (as today, `task-state-machine.ts` dispatch fires because `ownerAgentId` is set), the accepted branch bakes a `task_run` intent, the drain dispatches, the session starts, the reaction flips `accepted → in_progress`. **For agent-owned tasks the ruling's behavior is emergent once the writer + gate exist.** For a task with no `ownerAgentId` there is no session to start: it lands in `accepted` for a human to pick up — do not fake `in_progress` with no worker attached.

5. **`dependency_met` emission (Ruling 2).** `DependencyMetEvent` (`framework/domain-model/src/events.ts:317`) is `{taskId, dependencyId}` — a per-edge fact. Emit it from `checkAndUnblockDependents`, once per candidate the pre-filter matches, **before** the all-done check: "one of your dependencies is met" happens per edge even when other edges remain open. Dispatcher case already exists (`layers/core-api/src/observability/dispatcher.ts:409`). Keep the existing `auto_unblock` ambient notification emit on the actual unblock — different fact, different event.

---

## Should this service exist?

**KEEP AS the bet/task state machines plus the sole table path for `bets`/`tasks`/`items`/`artifacts` — now including the dependency tree.**
Bets and tasks are the process primitive — this is one of the few services whose core is real, and after A6 the dependency watcher joins that core instead of dying. The core is still wrapped in ceremony: two write-only audit ledgers, a risk-tier reader over a table nothing writes (A2-confirmed dead), two error classes nothing catches, a DI bundle nothing constructs, and ~9 dead branches inside the generic primitives. The genuine shape is about eleven callables. Everything else dies.

## If written today, from scratch

Against the corrected premise — a shared backend serving a team and an organisation of teams, identity from OIDC upstream (this service takes `teamId`/`ownerAgentId` as data and never authenticates — correct as-is), and an event stream plugins hang off (every state change already emits; the one missing emission is `dependency_met`):

- `get(exec, entity, id)` / `list(exec, entity, filter)` — the read path (filter cut to keys with real doors, `dependencyId` now among them)
- `create(exec, entity, values)` / `update(exec, entity, id, patch)` — the write path (incl. atomic note append; `dependencies` becomes writable)
- `transition(exec, entity, {id, guard, patch})` — single-row CAS, four guard shapes, no sweep, no `affected`
- `transitionBet` / `transitionTask` — the two state machines: validate, CAS, emit; `transitionTask` gains the dependency hold-gate. No revision log, no audit blob.
- `checkAndUnblockDependents` — the dependency watcher: pre-filter, all-done check, `hold → accepted`, emit `dependency_met` + `auto_unblock`
- `cascadeBetKill` — kill bet → kill tasks → stop runs. No propagation-log hops.
- `resolveTaskRunRequest` — one emit-time resolver baking both `task_run` and `session_start`
- `taskDispatchAttemptStore` — the dispatch-attempt ledger (insert/get/settle/reap; no ordinal, no occasion)

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 9 |
| PLUGIN | 0 |
| FINISH | 1 |
| MERGE | 5 |
| SIMPLIFY | 14 |
| KEEP | 17 |

Surface: 16 callables (21 fn rows + 2 classes + 1 const) → 11 callables (31% callable cut); of 22 type
declarations, 6 die and 2 merge. On top of that, ~9 dead branches inside surviving functions and 6
write-only DB columns plus one whole table (`task_planning_signals`, A2-confirmed) go. `tasks.dependencies`
leaves the kill list.

KEEP looks high only because the input counts every overload row of `get`/`update`/`list` and every
one-line row-type alias (`Bet`/`Task`/`Item`) as its own row. Deduped, only four callables survive
untouched: `get`, `create`, `update`, and the artifacts-page `list` overload.

## Feature-level verdicts

1. **Task dependency tree — FINISH (was: DELETE). Founder ruling A6.**
   The first-wave diagnosis stands as fact: `tasks.dependencies` has zero production writers since
   bet-decomposition died, so `checkAndUnblockDependents` has never fired. The verdict reverses: the
   watcher, the column, the `dependencyId` pre-filter branch, and the `app.ts:527` subscriber are the
   right half of a feature whose writer half must be built. Full build spec in "What must be built for
   the task dependency tree" above. Add the missing `dependency_met` emission while in there (Ruling 2).

2. **Task risk tier is a reader over a table nothing writes — DELETE. Founder-confirmed (A2).**
   `task_planning_signals` has zero production writers; `getTaskRiskTierByTaskId` always returns `null`;
   `review`'s `session-review-creator.ts:65` gate has never passed. Kill: the function, the table,
   `review`'s `getRiskTierByTaskId` port member, and the riskTier gate in session-review-creator.
   Automatic post-session review for risky tasks HAS NEVER WORKED in production; the founder has now
   ruled the concept itself dead, so no rebuild question remains. (Distinct from `items.riskTier`, which is live.)

3. **Two write-only audit ledgers — DELETE both columns and all append machinery. Stands; not softened.**
   `bets.revisionLog` and `tasks.auditTrail` are appended to by six writers and displayed by NOTHING —
   zero reads in `applications/` or `layers/core-ui/` outside e2e assertions. Rechecked under Ruling 1:
   a multi-human team makes "who changed this" *conceivable*, but conceivable is not a reader — no UI,
   no API consumer, ~20 waves without a look. Dead is still dead. Kill both columns, `task-audit.ts`
   entirely, `RevisionLogEntry`, the parse/append helpers in `bet-state-machine.ts`, the audit block in
   `routes/tasks.ts` PATCH, and policy's two local mirror unions. The CAS transactions survive —
   racing-writer correctness, not audit. If a team ever wants change history, build a read surface
   first, then a writer.

4. **cascadeBetKill's propagation-log hops — SIMPLIFY. Stands.**
   Only reader of `status:"applied"` rows is the reaper. Kill the `policy` port member of
   `BetKillCascadeDeps` and `writeCascadeRow`. The kill cascade itself is core and stays.

5. **Phantom done_condition review emit — DELETE. Survives Ruling-2 recheck.**
   `updateBetField` emits `item_created` with a fabricated `itemId` for which no items row exists;
   both subscribers no-op on `getItemById`. Ruling 2 protects a true fact with a missing announcement;
   this is a false announcement of a fact that never happens — poison for an extension surface. The
   `item_created` TYPE stays; this emission dies. The underlying "auto-review on done-condition change"
   concept is A2-shaped ceremony the founder confirmed dead.

6. **Resolver ceremony — MERGE the two resolvers, DELETE the optional-deps theater and both error classes. Stands.**
   `resolveSessionStartRequest` is `resolveTaskRunRequest` minus the attempt lookup and contextBundle.
   One resolver, discriminated input. All five "optional" deps members are wired at every real call
   site — make them required, delete every degrade branch. Neither error class is caught anywhere —
   throw plain `Error`.

7. **Dead interior of the generic primitives — SIMPLIFY `list`/`transition`. Stands, minus one branch.**
   Confirmed-dead branches: task count, item count, item `ids`, artifact `ids`, artifact bare-`taskIds`
   plain list, bare item list, bare artifact list, the id-less bulk-sweep path of `transition()`, the
   `affected` return field, and the `isNull` guard for bet.status / task.state. **`dependencyId` leaves
   this kill list** (A6 — it is the watcher's pre-filter). `marker`/`bodyMarker`/`queued` stay — live
   doors — but each is a find-one disguised as a list; still flagged for the routine track.

8. **`WorkDeps` / `UserStoreReader` / `WorkUserRow` — DELETE. Stands.**
   Zero references outside `work/src`; consumers (bet-decomposition, agent-assignment) were deleted.
   `TeamCapacityReader` and `AgentWorkIntentRecorder` survive as the two ports real code still injects.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `cascadeBetKill` | UI:POST /api/bets/:id/kill | SIMPLIFY | Kill cascade is core; the per-hop `propagation_log` writes are audit rows only the reaper ever touches — drop `deps.policy` + `writeCascadeRow`. |
| 2 | `transitionBet` | UI:POST /api/bets/:id/commit,/ship,/kill; SCHED:lifecycle-propagation 30s | SIMPLIFY | CAS + capacity + emit is core; the revisionLog parse/append machinery feeds a column nothing displays — delete it (kill #3). |
| 3 | `updateBetField` | UI:PATCH /api/bets/:id; AGENT:edit_bet | MERGE | Same guarded-field-set mechanic exists a second time inline in `bets.ts` — fold into ONE route-side patch path; delete the revision log and the false `item_created` emit (kills #3, #5 — the emit dies as a lying announcement, not as an event-type kill; Ruling 2 rechecked). |
| 4 | `checkAndUnblockDependents` | EVENT:task_state_changed (app.ts:527) — no-op today, writer to be built | **FINISH** | **A6 reversal.** The watcher is the right half of the dependency-tree feature; build the writers (`POST /tasks`, `create_task` tool, `PATCH /tasks/:id`), the accept-time hold-gate in `transitionTask`, and add the per-edge `dependency_met` emission (Ruling 2). Full spec in the build section. Column, pre-filter branch, and subscriber wiring all KEEP. |
| 5 | `resolveSessionStartRequest` | UI:POST /api/sessions/ | MERGE | Strict subset of `resolveTaskRunRequest`; its task-existence check duplicates the route's own 404 pre-read. One resolver, discriminated input (kill #6). |
| 6 | `getTaskRiskTierByTaskId` | BOOTSTRAP:service-bootstrap.ts:439 → review port — always returns null | DELETE | **A2 founder-confirmed.** Reads `task_planning_signals`, which nothing writes in production; the sole consumer gate has never passed. Kill function + table + port member + gate (kill #2). |
| 7 | `resolveTaskRunRequest` | UI:POST /api/tasks/:id/transition,/handoff; AGENT:handoff_to; SCHED:30s tick; EVENT:task_state_changed/session_started | SIMPLIFY | Core emit-time bake; make all five deps required, delete every optional-degrade branch, throw plain `Error`, absorb session-start (kill #6). |
| 8 | `transitionTask` | UI:POST /api/tasks/:id/transition,/kill(cascade); AGENT:handoff_to; SCHED:30s; EVENT:session_ended et al. | SIMPLIFY | CAS + dispatch + emit is core; drop the auditTrail append (kill #3), replace the inline dispatch-attempt insert with `taskDispatchAttemptStore.insertAttempt`. Gains the A6 dependency hold-gate at the accept branch (build section §3) — new behavior, same function. |
| 9 | `get` (artifact+taskTitle overload, :256) | UI:GET /api/artifacts/:id | KEEP | Core door: artifact detail with its producing task's title. |
| 10 | `get` (generic overload, :263) | UI:GET /api/tasks/:id, /api/bets/:id, + ~30 sites | KEEP | The get-by-id read primitive for all four owned entities. |
| 11 | `get` (impl, :268) | same as rows 9-10 | KEEP | Four `select ... where id` arms and one join; nothing to cut. |
| 12 | `list` (count overload, :304) | UI:GET /api/teams (teams-routes.ts:137,142) | SIMPLIFY | Only bet-count is ever called; task-count and item-count arms are dead — restrict count to bets. |
| 13 | `list` (artifact taskTitle overload, :310) | UI:GET /api/artifacts | KEEP | The artifacts page: cursor-paginated join, live door, single mechanic. |
| 14 | `list` (artifact taskSummary overload, :316) | UI:GET /api/bets/:id/artifact-thread-summary | MERGE | Second projection of the same join — fold into the taskTitle include; caller projects its four fields. `ArtifactTaskSummaryRow` dies with it. |
| 15 | `list` (generic overload, :322) | UI: /api/tasks, /api/bets, /api/search, /api/threads, conversations, teams; SCHED:digest sweep; EVENT:task_state_changed (watcher pre-filter) | SIMPLIFY | Live for real key combos; prune `WorkFilter` to keys with doors. **`dependencyId` stays** — it is the watcher's pre-filter (A6). Dead count semantics still go. |
| 16 | `list` (impl, :327) | same as rows 12-15 | SIMPLIFY | Delete confirmed-dead branches: item `ids`, artifact `ids`, artifact plain-`taskIds`, bare item, bare artifact, task/item count (kill #7). **The `dependencyId` branch at :464 is KEEP** (A6). `marker`/`bodyMarker`/`queued` stay — live doors; each still a find-one disguised as a list, flagged for the routine track. |
| 17 | `create` | UI:POST /api/bets, /api/tasks, /api/artifacts, /api/conversations/items; AGENT:create_item; SCHED:retro routines | KEEP | The insert primitive; all four entities reached through real doors. Gains `dependencies` writability (A6). Retro-routine traffic through this door is fine even when the retro ritual moves to a plugin (Ruling 3) — plugins call the same doors. |
| 18 | `update` (AppendNoteOp overload, :698) | AGENT:append-note tool via PATCH /api/tasks/:id/notes | KEEP | Atomic SQL-CASE note append with no pre-read — distinct mechanic, agent door. |
| 19 | `update` (generic overload, :711) | UI:PATCH /api/bets/:id, /api/tasks/:id, conversations items; EVENT:session_ended reactions | KEEP | The set-by-id write primitive. Gains `dependencies` patchability (A6). |
| 20 | `update` (impl, :717) | same as rows 18-19 | KEEP | Plain per-entity set; audit-blob patches vanish caller-side with kill #3. |
| 21 | `transition` | UI:PATCH /api/artifacts/:id/preview; via rows 2/8; SCHED via DI | SIMPLIFY | Single-row CAS is core; delete the id-less bulk-sweep path, the `affected` field, and the never-used `isNull` guards for bet.status/task.state (keep artifact.previewJson isNull and task.updatedAt equals). |
| — | `SessionStartSourceUnavailableError` | thrown UI:POST /api/sessions/ — caught nowhere | DELETE | Zero catch sites; the route already 404s the same condition. Throw `Error`. |
| — | `TaskRunSourceUnavailableError` | thrown via rows 7/8 — caught nowhere | DELETE | Zero catch sites; the class discriminates nothing. Throw `Error`. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ArtifactRow` | KEEP | Row type of the artifact primitive; tables private so the alias is load-bearing. Fold types-only `artifact-store.ts` into `work-service.ts`. |
| `ArtifactWithTaskTitle` | KEEP | The artifacts-page row shape (rows 9/13). |
| `ArtifactTaskSummaryRow` | DELETE | Dies with row 14's merge. |
| `BetKillCascadeDeps` | SIMPLIFY | Drop the `policy` member (kill #4). |
| `RevisionLogEntry` | DELETE | Revision-log feature dies (kill #3); its only external "consumer" declares a local mirror instead of importing. |
| `WorkDeps` | DELETE | Zero constructors, zero importers (kill #8). `UserStoreReader`/`WorkUserRow` die with it. |
| `SessionStartResolverDeps` | MERGE | Into `TaskRunResolverDeps` (kill #6). |
| `BakedSessionStartRequest` | MERGE | Strict subset of `BakedTaskRunRequest`; one baked-request type. |
| `StateTransitionAuditEntry` | DELETE | auditTrail dies (kill #3). |
| `HandoffAuditEntry` | DELETE | auditTrail dies; policy's writer appends to a blob nobody reads. |
| `TaskAuditEntry` | DELETE | Union of the two above; `task-audit.ts` deleted whole. |
| `TaskRunResolverDeps` | SIMPLIFY | All five members required — one fully-wired binding serves every emit site. |
| `BakedTaskRunRequest` | KEEP | The real seam contract: the intent payload the drain dispatches with zero domain reads. |
| `TaskStateMachineDeps` | KEEP | The two genuinely injected edges `transitionTask`/`cascadeBetKill`/`checkAndUnblockDependents` need — the FINISHED watcher keeps injecting both. |
| `Bet` | KEEP | Row alias; tables private. |
| `Task` | KEEP | Row alias; tables private. |
| `Item` | KEEP | Row alias; tables private. |
| `WorkEntity` | KEEP | The discriminant of the five primitives. |
| `WorkFilter` | SIMPLIFY | Prune to keys with doors — **`dependencyId` now has one** (the watcher, A6) and stays; restrict `count` to bets; delete the key→old-function legend comment. |
| `AppendNoteOp` | KEEP | The one real patch operator (row 18). |
| `TransitionGuard` | SIMPLIFY | Narrow to the four guard shapes with callers. |
| `TransitionSpec` | SIMPLIFY | Make `id` required — the id-less sweep form is dead (row 21). |

## Const / enum

| Declaration | Verdict | Reason |
|---|---|---|
| `taskDispatchAttemptStore` | SIMPLIFY | Core ledger — all five members have doors. Cut the write-only ceremony: `ordinal`, `occasion`, `predecessorSessionId` are columns with zero readers; `reapTerminal`'s `batchSize` param lies (no LIMIT in the DELETE) — drop it or actually batch. Becomes the single insert path once row 8's inline duplicate merges in. |

## Holes this leaves

- **No bet/task change history.** revisionLog/auditTrail gone. Rechecked under Ruling 1: still zero
  readers at any user count. If a team ever wants history, build a read surface first, then a writer.
- **Session reviews for risky tasks stay uncreated** — as they always were; A2 now confirms the concept
  itself is dead, so this is no longer an open question, just a removed lie.
- ~~Task dependencies stop existing as a concept~~ — **reversed by A6.** The hole is now the opposite:
  until the writers + hold-gate land, the tree exists but nothing populates or respects it. The build
  section above is the price.
- **No propagation-log trace of bet-kill cascades.** The kill still works and returns
  `tasksKilled`/`sessionsStopped`; only forensic rows nobody queried disappear.
- **Coarser errors from the resolvers.** Plain `Error` — nothing ever discriminated on the names.
- **One projection query replaced by caller-side mapping** (artifact-thread-summary) — trivially more
  bytes per bet, bounded by the existing task fan-out guard.
- **No `done_condition`-change review item.** The false `item_created` emit dies and nothing replaces
  it — by A2's own logic, correctly so.
