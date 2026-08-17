# Delete batch — `_doors`

41 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `POST /api/auth/claim` | DEAD | Replaced by OIDC (Ruling 1) — invites are not how multi-user access arrives. |
| 2 | `POST /api/auth/invite` | DEAD | Replaced by OIDC (Ruling 1); zero callers besides. |
| 3 | `POST /api/auth/logout` | DEAD | Home-grown login sessions die with OIDC (Ruling 1). |
| 4 | `POST /api/teams/:teamId/agents` | DEAD | Third way to add an agent; zero callers (kill 13). |
| 5 | `GET /api/bets/canvas` | DEAD | Canvas view retired; zero callers (kill 10). |
| 6 | `POST /api/bets/:id/ship` | DEAD | Completion is event-propagated; no caller (kill 10). |
| 7 | `POST /api/bets/:id/outcome` | DEAD | Superseded (WorkBet.tsx:584); dead regardless of where retro lives (kill 10). |
| 8 | `PATCH /api/tasks/:id` | DEAD | No caller; A6's dependency writer is in-process, not this door (kill 9). |
| 9 | `POST /api/tasks/:id/transition` | DEAD | No caller; transitions are event/policy-driven (kill 9). |
| 10 | `PATCH /api/artifacts/:id/preview` | DEAD | Create carries preview; patcher has no caller (kill 13). |
| 11 | `GET /api/team-members/` | DEAD | Raw team_members dump, zero callers. Not ceremony — just dead. |
| 12 | `GET /api/settings/` | DEAD | M2 aggregate; UI never fetches it (kill 13). |
| 13 | `PATCH /api/settings/` | DEAD | Writer for the unread aggregate (kill 13). |
| 14 | `GET /api/conversations/` | DEAD | Legacy thread list; UI uses /api/threads (kill 7). |
| 15 | `GET /api/conversations/:threadId` | DEAD | Only reference is a DB rollback doc (kill 7). |
| 16 | `GET /api/users/:id/inbox` | DEAD | Second inbox; threads are the messaging surface, multi-human included (kill 8). |
| 17 | `POST /api/users/:id/inbox` | DEAD | Second send door; threads/direct is the real one (kill 8). |
| 18 | `POST /api/routines/:id/retire` | DEAD | Soft-retire twin of DELETE; zero callers (kill 13). |
| 19 | `POST /api/sessions/` | DEAD | Explicit-start door nobody dials (kill 1). |
| 20 | `GET /api/status/health` | DEAD | Authenticated probe nobody probes; /api/health is the live liveness door (kill 4). |
| 21 | `GET /api/status/` | DEAD | Route's own comment: zero consumers repo-wide (kill 4). |
| 22 | `GET /api/status/digest` | DEAD | Daily digest with no reader (kill 4). |
| 23 | `GET /api/workers/` | DEAD | Worker admin visibility, comments-only references (kill 4). |
| 24 | `POST /api/harnesses/:type/disabled` | DEAD | Disable toggle with no UI (kill 13). |
| 25 | `GET /api/notifications/` | DEAD | Root list; UI reads /inbox (kill 5). |
| 26 | `GET /api/notifications/queue` | DEAD | Queue introspection, zero callers (kill 5). |
| 27 | `POST /api/notifications/flush` | DEAD | Manual flush; drain tick does this (kill 5). |
| 28 | `POST /api/notifications/digest` | DEAD | Manual digest-send trigger with no consumer; delivery mode lives in config (kill 5). |
| 29 | `GET /api/sessions/starts/:startId` | DEAD | pollUrl no client follows (kill 1). |
| 30 | `PATCH /api/sessions/:id` | DEAD | State/effectiveness writes happen via worker protocol; no dialer (kill 13). |
| 31 | `GET /api/agent-orchestration/sessions` | DEAD | Seam method listSessionHistoryBySource has zero consumers (kill 13). |
| 32 | `GET /api/agent-orchestration/sessions/:sessionId/activity` | DEAD | Duplicate of #143 served in-layer; seam method unconsumed (kill 13). |
| 33 | `POST /api/agent-orchestration/intents/explicit-start` | DEAD (only from #114) | Explicit-start family (kill 1). |
| 34 | `GET /api/agent-orchestration/requests/explicit-start` | DEAD (only from #114) | Explicit-start family (kill 1). |
| 35 | `GET /api/agent-orchestration/requests/explicit-start/:startId` | DEAD (only from #114) | Explicit-start family (kill 1). |
| 36 | `POST /api/agent-orchestration/runs/bare` | DEAD (only from #114 fallback) | Legacy bare-insert fallback of the dead door (kill 1). |
| 37 | `POST /api/agent-orchestration/runs/explicit-start/fail` | DEAD | Explicit-start family (kill 1). |
| 38 | `AgentOrchestrationPort.intents.createExplicitStart + requests.findExplicitStartBy + runs.createBareRun + runs.failExplicitStart` |  | Only callers are the dead explicit-start routes. |
| 39 | `AgentOrchestrationPort.sessions.listSessionHistoryBySource / getRecentActivity` |  | Zero consumers. |
| 40 | `framework/http-middleware/src/http/explicit-start-projection.ts (whole module)` |  | Projects a wire shape only the dead family renders. |
| 41 | `SettingsResponse/SettingsNotifications etc. in framework/api-contract/src/settings.ts` |  | Mirrors the unfetched GET/PATCH /api/settings aggregate. Distinct from the notification-channel config contract, which stays (FINISH #130-132). |
