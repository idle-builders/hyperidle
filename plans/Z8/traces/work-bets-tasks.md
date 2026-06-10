# Deep Trace — WORK: Portfolio, Bet Detail, Task Detail

Audit date: 2026-06-10. Scope: WorkPortfolio.tsx, WorkBet.tsx, WorkTask.tsx, BetCreateDialog.tsx, TaskSheet.tsx, ConsequencePreviewDialog/AppetiteDialog (inline in WorkBet), BetCard, BetPitch, AnchoredMessages, BlockActionsPopover, hooks (useBets/useBet/useTeams/useTaskSessions/useBetDescriptionSave/useHostThread/useFetch), server routes (bets.ts, tasks.ts, sessions-routes.ts, teams-routes.ts, threads.ts), services (bet-state-machine, task-state-machine, handoff-protocol, lifecycle-propagation, cost-cap), DB schema (bets, tasks, sessions, propagation_log).

All file paths absolute under `/Users/tg/hyperidle/`.

---

## Element Inventory

### A. WorkPortfolio — `packages/web/src/pages/WorkPortfolio.tsx` (route `work/portfolio`, router.tsx:71)

#### Interactive elements

| # | Element | file:line | Handler chain | API | Server handler | DB |
|---|---|---|---|---|---|---|
| A1 | Status filter pills (All/Active/Completed/Draft) | WorkPortfolio.tsx:199-213 | `onClick → setStatusFilter` (local state only) | none | — | — |
| A2 | Verdict filter pills (Validated/Refuted/Partial/Inconclusive/Not evaluated, multi-select) | WorkPortfolio.tsx:220-247 | `onClick → setActiveVerdictFilters` (Set toggle, local) | none | — | — |
| A3 | Team filter pills (toggle) | WorkPortfolio.tsx:254-281 | `onClick → setSelectedTeamId(prev===id?null:id)` (local) | none | — | — |
| A4 | "New bet" button (header) | WorkPortfolio.tsx:286-295 | `onClick → setDialogOpen(true)` → BetCreateDialog | (via dialog, see B) | — | — |
| A5 | "New bet" CTA in empty state (only when no team filter) | WorkPortfolio.tsx:330-339 | same as A4 | — | — | — |
| A6 | BetCard link wrapper | WorkPortfolio.tsx:358-373 | `<Link to=/work/bet/:id>` (client nav, deliberately not BetCard onClick — lore AC1) | none | — | — |
| A7 | BetCreateDialog (mounted) | WorkPortfolio.tsx:381-389 | `onCreated → setDialogOpen(false); refreshBets()` → re-GET /api/bets | GET /api/bets | bets.ts:359 | bets SELECT |

#### Display elements

| Element | file:line | Source field | Transformation |
|---|---|---|---|
| "All bets" h2 | :155-157 | static | — |
| Routine summary "N routines across M teams" | :160-169 | `useTeams()` → GET /api/teams → `team.routineCount` (teams-routes.ts:215-219, COUNT(routines) WHERE teamId AND deletedAt IS NULL) | sum over teams |
| Agent summary "N agents, M active" + red health dot | :178-194 | `team.agentCount` / `team.activeAgentCount` / `team.agentHealthWarning` (teams-routes.ts:222-260, users WHERE teamId=memberGroup.id AND kind='ai' + session health signals) | sums + `some()` |
| Team pill agent count + health dot | :267-279 | same per-team fields | raw |
| BetCard title | :366 | `bet.title \|\| bet.description.slice(0,60)` — **bet.title is ALWAYS undefined** (see FLAG-1) | description slice incl. markdown `# ` prefix |
| BetCard status dot + badge | BetCard.tsx:178-187 | `bet.status` | STATUS_DOT_COLOR / STATUS_LABEL maps (BetCard.tsx:41-54) |
| BetCard verdict badge | BetCard.tsx:189-197 | `bet.outcomeVerdict` (bets.outcome_verdict column, raw row passthrough in GET /bets) | capitalize first char |
| BetCard budget badge | :370 → BetCard.tsx:199 | `bet.costAppetite ? formatMoney(...)` — **always undefined in list** (see FLAG-2) | never renders |
| BetCard description | :369 | `bet.description` (bets.description) | line-clamp-3 |
| BetCard team label | :349, :367 | `teams.find(t=>t.id===bet.teamId)?.name ?? bet.teamId` | client-side join |
| Progress bar in BetCard | not passed | — | **never rendered on portfolio** (no progress data in list response) |
| Loading skeletons | :120-141 | `useBets().loading` | 3× SkeletonCard |
| Empty states | :301-341 | filteredBets.length===0 | "No bets yet" (with CTA) vs "No bets for this team" (no CTA, intentional) |

**Data flow A:** `useBets()` (hooks/useBets.ts:44) → `apiFetch("/api/bets")` → bets.ts:359 `router.get("/")` → `db.select().from(bets).limit(limit).offset(offset)` (bets.ts:363) → grouped `{draft,active,completed,killed}` with only `atRisk` normalized → hook flattens client-side. Default `limit=50` (max 200) — **no pagination UI** (FLAG-15).

`useTeams()` (hooks/useTeams.ts:19) → GET /api/teams → teams-routes.ts:152 `router.get("/")` → per team: teamMembers SELECT, bets COUNT×2, tasks SELECT per active bet (N+1), routines COUNT, users SELECT, sessions SELECT.

---

### B. BetCreateDialog — `packages/web/src/pages/work/BetCreateDialog.tsx`

| # | Element | file:line | Handler chain | API | Server | DB |
|---|---|---|---|---|---|---|
| B1 | Team `<select>` (only when teams.length>1; single team auto-resolved) | :138-157 | `onChange → setTeamId` | — | — | — |
| B2 | Description BodyEditor (ProseMirror) | :167-174 | `onChange(md) → setDescription` | — | — | — |
| B3 | Title preview | :178-186 | `deriveTitleFromPitch(description,"")` (shared/format/bet.ts:42) | — | — | — |
| B4 | Cancel button | :195-201 | `handleCancel → onClose()` (guarded by submitting) | — | — | — |
| B5 | Create button | :203-210 | `handleSubmit` (:93) → POST `/api/bets` `{teamId, description}` | POST /api/bets | bets.ts:562 `router.post("/", validateBody(createBetSchema))` | teams SELECT (existence, :565), bets INSERT (:591) with status='draft', revisionLog seed entry, costAppetite from body (never sent by dialog), bets SELECT (re-read :604) |

Validation: Zod `createBetSchema` (bets.ts:45-63, `.strict()` — rejects old `appetite` field). Error → inline `role="alert"` (:188-192). Events: **none emitted on bet creation** (no `bet_created` event).

Note (R2 lore): appetite fields removed from dialog → UI-created bets always have `costAppetiteMinor=null` (see FLAG-6 chain).

---

### C. WorkBet — `packages/web/src/pages/WorkBet.tsx` (route `work/bet/:betId`, router.tsx:78)

**Primary fetch:** `useBet(betId)` (hooks/useBet.ts:26) → GET `/api/bets/:id` → bets.ts:446 `router.get("/:id")`:
- bets SELECT by id (:448)
- tasks SELECT WHERE betId (:460-489) — selected columns: id, betId, teamId, **ownerAgentId**, title, description, doneCondition, state, dependencies, artifacts, costCap, costActual, threadId, notes, auditTrail, createdAt, updatedAt, `latestSessionOutcome` (correlated subquery on sessions ORDER BY startedAt DESC LIMIT 1, :479-483), outcomeVerdict, outcomeRecordedAt
- teams SELECT name (:494)
- derived: `title = deriveTitle(description, id)` (:492), `team`, `progress = {done: tasks.filter(state==='done').length, total: tasks.length}` (:501-502), `costAppetite`/`costActual` WireMoney from minor+currency columns, `tokensActual` JSON parse
- task `costActual`/`costCap` mapped to WireMoney with hardcoded "USD" (:551-552)

**Secondary fetch:** `useHostThread("bet", bet.id)` (hooks/useHostThread.ts:61) → GET `/api/threads?host_kind=bet&host_id=` then GET `/api/threads/:id` (threads.ts:404/:497) — used for `messagesByBlockId` (WorkBet.tsx:710-722, filters plain non-redacted messages by `payload.blockId`). HostThreadSection fetches the same data again (documented double-fetch, lore L18).

#### Interactive elements

| # | Element | file:line | Handler chain | API | Server | DB |
|---|---|---|---|---|---|---|
| C1 | Breadcrumb "Work" link | :991-996 | `<Link to="/work">` | — | — | **dead link — no `/work` route exists** (FLAG-13) |
| C2 | Breadcrumb team link | :998-1003 | `<Link to="/work/portfolio">` (labelled with team name) | — | — | — |
| C3 | CocAttachButton (header, bet ref) | :1012 | CocContext.attachContext({kind:"bet",...}) — renders only when Assistant overlay open (CocAttachButton.tsx:35) | — | — | — |
| C4 | Overflow `···` button | :1021-1032 | `onClick → document.getElementById(overflow-dropdown-:id).toggleAttribute("open")` — raw DOM toggle, **no outside-click/Escape close** | — | — | — |
| C5 | "Adjust appetite" menu item (draft\|active) | :1038-1048 | `handleAction("adjust-appetite")` (:755) → `setAppetiteDialogOpen(true)` → see C13 | — | — | — |
| C6 | "Unblock" menu item (active only) | :1049-1059 | `handleAction("unblock")` → `document.querySelector('[data-testid="composer-textarea"]')` scrollIntoView+focus (HostThreadSection.tsx:328 — exists) | none | — | — |
| C7 | "Kill" menu item (not completed/killed) | :1060-1070 | `handleAction("kill")` → `setConsequenceDialog({open:true})` → see C12 | — | — | — |
| C8 | Hint "Got it" dismiss (add-credential) | :1094-1101 | `hintAddCredential.dismiss` (useHints) → hints API | POST /api/hints dismiss | hints.ts | hints table |
| C9 | "Add knowledge" button | :1108-1114 | `setAddKnowledgeOpen(true)` → KnowledgeCreateDialog (scope locked to bet) | POST /api/knowledge (in dialog) | knowledge.ts | knowledge_items INSERT |
| C10 | "Record outcome" / "Edit outcome" links (completed/killed only) | :1252-1263, :1276-1287 | set form state, `setOutcomeEditMode("editing")` | — | — | — |
| C11 | Outcome form: "Draft with AI" / verdict select / Reality textarea / Learnings textarea / Cancel / Save (submit) | :1294-1428 | Save → `handleOutcomeSave` (:780) → POST `/api/bets/:id/retro` `{verdict, summary, learnings?}`; Draft → `handleRetroDraft` (:812) → POST `/api/bets/:id/retro/draft` | POST /bets/:id/retro (bets.ts:898), POST /bets/:id/retro/draft (bets.ts:833) | retro: Zod `betRetroSchema` (verdict∈BET_OUTCOME_VERDICTS, summary≤2000, learnings≤4000); guard status∈{completed,killed} else 400; revisionLog append when overriding; **db.transaction** (:984): bets UPDATE (outcomeVerdict/Summary/RecordedAt/RecordedBy/revisionLog) + knowledge_items INSERT-or-UPDATE (version++) + knowledge_strategy_fabric INSERT/UPDATE (kind='reflection', meta{betId,hypothesis snapshot immutable,verdict,validatedAt,validatedBy}). draft: stub deriving verdict from task outcomeVerdicts (no LLM). | bets, knowledge_items, knowledge_strategy_fabric. Events: none. |
| C12 | ConsequencePreviewDialog (kill) — Cancel / reason textarea / "Kill bet" confirm; Escape+backdrop blocked via `cancel` event preventDefault | :323-457 (component), :1118-1122 (mount) | `handleConsequenceConfirm` (:835) → POST `/api/bets/:id/kill` `{reason}` → on ok close + `fetched.refresh()` | POST /bets/:id/kill | bets.ts:735 `validateBody(killBetSchema)` (reason min 1); `assertBetReadable` 404 guard; `transitionBet(db,eventBus,betId,"killed",{reason,actor:userId})` (bet-state-machine.ts:92); InvalidTransitionError → 400 VALIDATION_ERROR | see State Machine §1. **Does NOT halt tasks/sessions despite dialog copy** (FLAG-5) |
| C13 | AppetiteDialog — select (1 week/2 weeks/6 weeks) + reason + Save | :475-605 (component), :1125-1130 (mount) | `handleAppetiteConfirm` (:853) → PATCH `/api/bets/:id` `{field:"cost_appetite", value:"2 weeks", reason}` | PATCH /bets/:id | bets.ts:626 → Zod `updateBetCostAppetiteSchema` (bets.ts:77-81) requires `value` = **WireMoney object or null** | **ALWAYS 400 — UI sends a duration string** (FLAG-4). Never reaches patchCostAppetite (bets.ts:294, mutable in 'active' only, bets UPDATE costAppetiteMinor/Currency + revisionLog) |
| C14 | Pitch BodyEditor (draft/active) | :1473-1493 | `handleDescriptionChange` (:694, dirty-check vs initialDescriptionRef) → `useBetDescriptionSave.save` (hooks/useBetDescriptionSave.ts:79, 1500ms debounce) → PATCH `/api/bets/:id` `{field:"description", value, reason:"Edited by user"}` → onSaved → `fetched.refresh()` | PATCH /bets/:id | bets.ts:632 → `patchDescription` (bets.ts:239): status∈{draft,active} guard, bets UPDATE description + revisionLog append (old/new value, actor) | bets SELECT/UPDATE/SELECT. Events: none |
| C15 | Block gutter handle (BetPitch, completed/killed only) | :1497-1503, BetPitch :261-275 | Block `onOpenActions` → `setOpenBlockId(b.id)` (Space/Enter on block or gutter click, Block.tsx:96-117) | — | — | — |
| C16 | BlockActionsPopover "Discuss" | :1511-1533 | `handleDiscussBlock` (:925): DOM-query block text → `setThreadPrefill({blockId, blockExcerpt})` → HostThreadSection composer prefill; submit posts message with `payload.blockId` | POST /api/threads/:id/messages (via HostThreadSection → host-threads.ts postPlainHostMessage) | threads.ts:685 | messages INSERT |
| C17 | BlockActionsPopover "Share" (only when overlay open) | :1523-1531 | `handleShareBlock` (:943) → `CocContext.attachContext({kind:"block",...})` | — | — | — |
| C18 | Per-block CocAttachButton | BetPitch :277-286 | attachContext block ref, label via `blockExcerptFromPayload` | — | — | — |
| C19 | Task rows (button) | :1561-1588 | `onClick → navigate(/work/bet/:betId/task/:taskId)` | — | — | — |
| C20 | TaskSheet (mounted :1623-1630) | open=`selectedTaskId !== null` | **UNREACHABLE — `setSelectedTaskId` is never called with a non-null value anywhere in WorkBet** (FLAG-7). Task rows navigate instead. | — | — | — |
| C21 | HostThreadSection composer (Discussion) | :1610-1617 | resolveOrCreateHostThread → POST /api/threads (threads.ts:548) or POST /api/threads/:id/messages; `onMessagePosted → refreshThreadData` | GET/POST /api/threads* | threads.ts | threads INSERT, messages INSERT |
| C22 | ArtifactSection / ArtifactThreadsSummary | :1597-1603, :1620 | GET /api/artifacts?betId / GET /api/bets/:id/artifact-thread-summary (bets.ts:1087 — artifacts⋈tasks⋈threads + correlated message subqueries, cap 10) | artifacts.ts / bets.ts:1087 | artifacts, tasks, threads, messages SELECT |

#### Display elements (WorkBet)

| Element | file:line | Source | Transformation / failure mode |
|---|---|---|---|
| Status badge | :1013, :958-983 | `bet.status` | inline class map; killed falls to amber `default` branch |
| Appetite badge (header) | :1014-1017 | `bet.costAppetite` (bets.cost_appetite_minor/currency) | `formatMoney` — hidden when null (always null for UI-created bets) |
| **Progress %** | :1148-1151 | `bet.progress` = server-computed `{done: COUNT(tasks.state='done'), total: COUNT(tasks)}` (bets.ts:501-502) | `bet.progress ? Math.round(done/total*100)+"%" : "0%"`. progress is ALWAYS an object (truthy) → when `total===0` ⇒ `0/0=NaN` ⇒ renders **"NaN%"** (FLAG-3a). "0%" appears when tasks exist but none are `done` — there is **no UI path that moves a task to done** (review→done only via API), so 0% is the steady state for human-only usage (FLAG-3b). Killed tasks don't count as done → completed bets can show <100%. |
| Progress bar fill | :1153-1162 | same | `width: NaN%` invalid style when total=0 |
| **Budget spent** | :1169-1171 | `bet.costActual` ← bets.cost_actual_minor/currency | `formatMoney(null)` → **"--"**. The ONLY writer of cost_actual_minor is `accumulateSessionCost` in `packages/fabric/src/services/cost-cap.ts:260-268` (`coalesce(costActualMinor,0)+effectiveCostMinor` keyed by task.betId), driven by session cost reporting. No sessions with cost ⇒ null forever ⇒ "--" (FLAG-3c). |
| "of X appetite" | :1172-1174 | `bet.costAppetite` | `formatMoney(null)` → "of -- appetite" |
| Team stat card | :1180-1202 | `bet.team` (server join teams.name) | initials avatar; no member list (documented API gap, lore D-11) |
| Outcome section (completed/killed) | :1206-1431 | `bet.outcomeVerdict/outcomeSummary/hypothesis` (bets columns) | BET_VERDICT_LABEL map (:72-77); "Not evaluated" when null |
| Pitch save indicator ×2 | :1439-1470 and :1482-1492 | `useBetDescriptionSave.status` | **duplicate indicators** — header `pitch-save-indicator` AND inline `bet-save-indicator` both render Saving/Saved/Save failed (FLAG-16) |
| Task row title/meta | :1570-1577 | `task.title`, `task.owner`, TASK_STATE_LABEL, `formatTaskRelativeTime(task.startedAt)` | **`task.owner` and `task.startedAt` are NOT in the server response** (server sends `ownerAgentId`, `createdAt`) → owner blank, relTime "" (FLAG-8) |
| Task outcome badge | :1579-1586 | `task.outcomeVerdict` (tasks.outcome_verdict, set only via PATCH /api/tasks/:id by agents) | TASK_VERDICT_LABEL (:62-67) |
| Task state badge | :1587 | `task.state` | TASK_STATE_LABEL (:80-89) + taskStateBadgeClass (:92-101) |
| Anchored messages + "anchor lost" | :177-206, :288-290 | thread messages with payload.blockId not matching any current block | catch-all renders orphans with indicator |
| Tasks empty state | :1549-1554 | tasks.length===0 | no CTA (tasks are agent-created — intentional) |
| Sort machinery | :55-56, :130-157, :640-641, :907-914 | `sortTasks`, `_handleSort` | **dead code** — `_handleSort` never called, sortColumn stays null, sortTasks is identity (FLAG-9) |

---

### D. WorkTask — `packages/web/src/pages/WorkTask.tsx` (route `work/bet/:betId/task/:taskId`, router.tsx:79)

**Fetches:** `useBet(betId)` (whole bet; task found client-side :201) + `useTaskSessions(taskId)` (hooks/useTaskSessions.ts:29) → GET `/api/tasks/:id/sessions`.

> **FLAG-10 (critical): `GET /api/tasks/:id/sessions` DOES NOT EXIST on the server.** tasks.ts registers only POST /, GET /, PATCH /:id, POST /:id/transition, POST /:id/handoff. sessions-routes.ts (mounted at /api/sessions) has GET / (filter `?task_id=`), POST /, GET /:id/activity, PATCH /:id. The hook always gets 404 → `useFetch` error → `sessionsData=null` → sessions list permanently "No sessions yet." and count "0 active / 0 completed". (Only WorkTask.stories.tsx mocks this URL.) Additionally the hook's `TaskSession` type expects `status`, `agent`, `title`, `cost`, `effectivenessScore` — even the existing GET /api/sessions returns raw rows with `state`, `agentId`, `modelTier`, no title/cost shape, so wiring it up would still mismatch.

#### Interactive elements

| # | Element | file:line | Handler | API |
|---|---|---|---|---|
| D1 | Breadcrumb links Work / team / bet | :237-257 | Links to `/work` (**dead route**, FLAG-13), `/work/portfolio`, `/work/bet/:id` | — |
| D2 | Overflow `···` "More actions" button | :267-273 | **NO onClick — completely unwired** (FLAG-11) | — |
| D3 | "Dial in" button (when activeSession) | :350-358 | **NO onClick — unwired** (FLAG-12); also unreachable since sessions are always empty (FLAG-10) | — |
| D4 | ArtifactSection open | :401-406 | useArtifactOpen → artifact view | GET /api/artifacts?taskId |
| D5 | HostThreadSection composer (Discussion) | :412 | same chain as C21, hostKind="task" | GET/POST /api/threads* |

#### Display elements

| Element | file:line | Source | Notes |
|---|---|---|---|
| Status badge (header) | :218-228 | `task.state` | `replace(/_/g," ")` raw label (not TASK_STATUS_LABEL — header shows "in progress" lowercase while meta strip shows "In progress") |
| Owner cell | :291-298 | `task.owner` | **always blank — server sends ownerAgentId, never `owner`** (FLAG-8) |
| Status cell + LiveDot | :302-312 | `task.state` | TASK_STATUS_LABEL (:70-79); pulse dot when in_progress |
| Started cell | :314-326 | `task.startedAt` | **never renders — field not in API response** (FLAG-8); would use formatRelativeTime (:35) |
| Cost cell | :328-337 | `task.costActual` (tasks.cost_actual via WireMoney mapping bets.ts:551) | `$ (minor/100).toFixed(2)` — hardcoded USD division, ignores currency scale helper |
| Sessions cell | :339-359 | `sessionsData.sessions` filtered by `s.status==="active"` / done/completed | **always "0 active / 0 completed"** (FLAG-10) |
| Outcome cell | :361-373 | `task.outcomeVerdict` | snake_case → Title Case; "--" when null (this is the observed "--") |
| SessionRow (title/agent/effectivenessScore/cost/status) | :103-155 | TaskSession fields | unreachable (FLAG-10) |
| Not-found state | :204-210 | bet loaded but task absent | plain text, no CTA back-link |

---

### E. TaskSheet — `packages/web/src/shell/TaskSheet.tsx`

Mounted in WorkBet (unreachable, FLAG-7) and WorkTeam.tsx (live, out of scope).

| # | Element | file:line | Handler chain | API |
|---|---|---|---|---|
| E1 | Close ✕ / Escape / focus trap | :307-309, :188-199, :202-221 | onClose; focus restore via priorFocusRef (:139-162) | — |
| E2 | "Open thread" | :376-382 | `handleOpenThread` (:242) → `resolveThreadId(task.id)` prop → task-threads.ts shim → host-threads.ts `resolveOrCreateHostThread("task",...)` → GET /api/threads?host_kind=task → (404 path) POST /api/threads → `onNavigateToThread(threadId)` → WorkBet navigates `/conversations/chat?thread=` (legacy redirect, router.tsx:68) | threads.ts:404/:548 |
| E3 | Inline HostThreadSection | :386-391 | hostKind="task", agentId=task.ownerAgentId | threads endpoints |
| E4 | Request intent radiogroup (blocked/in_progress/done/hold/killed) | :401-419 | `handleIntentChange` toggle (:281) | — |
| E5 | Note textarea | :422-434 | setNote | — |
| E6 | "Send request" | :448-457 | `handleSendRequest` (:252): text = template+note, clientKey=randomUUID → `resolveThreadId` → `postRequest(threadId,text,clientKey)` → host-threads.ts `postPlainHostMessage` → POST /api/threads/:id/messages `{type:"plain", payload:{text}, clientKey}` → success status → auto-close 800ms | threads.ts:685 → messages INSERT |
| E7 | Artifact single preview | :328 | ArtifactSection limit=1 | GET /api/artifacts?taskId |
| E8 | Session metadata strip | :331-367 | `task.latestSessionOutcome/Cost/Tokens/HarnessUrl` (KanbanTask optional fields — **NOT provided by the BetDetail task shape in WorkBet**; only WorkTeam supplies them) | — |

**Deprecated-props verdict (asked):** Props `resolveThreadId` / `postRequest` / `onNavigateToThread` are marked `@deprecated` in TaskSheetProps (:72-88) and the file header claims they are "no longer used by the sheet" (:9-12) — **this is false**: all three are actively used by `handleOpenThread` (:245-246) and `handleSendRequest` (:268-269). Contradictory docs, not dead props (FLAG-14). Crucially, the REQUEST intents post a *plain text message* — they do **not** call POST /api/tasks/:id/transition; an agent must read the message and act. No UI path exists to actually transition a task.

---

## State Machine Maps

### 1. Bet state machine — `packages/server/src/services/bet-state-machine.ts`

States: `draft | active | completed | killed` (schema.ts:126-128). VALID_TRANSITIONS (:37-42):
- draft → active, killed
- active → completed, killed
- completed → ∅, killed → ∅ (terminal)

(The prompt's draft→active→paused→… model is obsolete: pause was removed in AD5/U1; no `paused` state exists.)

| Transition | Endpoint | Trigger surface | Validation | Writes (all in `db.transaction`, bet-state-machine.ts:162-220) | Cascades | Events |
|---|---|---|---|---|---|---|
| (create)→draft | POST /api/bets (bets.ts:562) | BetCreateDialog | createBetSchema strict | bets INSERT, revisionLog seeded | none | **none** |
| draft→active | POST /api/bets/:id/commit (bets.ts:664) | **NO UI SURFACE — unreachable from frontend** (FLAG-6) | optional reason parse; `loadTeamMembers` **called without await** (bets.ts:689 — try/catch can't catch the rejection; FLAG-17); in-tx capacity check `activeBets >= capacity` → CapacityExceededError; CAS UPDATE `WHERE id AND status=fromState` → loser throws InvalidTransitionError → 400 | bets UPDATE (status, revisionLog), teamMembers UPDATE activeBets+1 | none downward | `bet_state_changed` (streamId=teamId) post-commit |
| active→completed | POST /api/bets/:id/ship (bets.ts:718) — no UI; OR lifecycle propagation (see §3) | agents/propagation only | CAS as above | bets UPDATE (status, revisionLog, completedAt), teamMembers activeBets−1 | propagation logs bet→team (derived-on-read, no write) | `bet_state_changed`; then `propagation_applied` |
| draft/active→killed | POST /api/bets/:id/kill (bets.ts:735) | WorkBet overflow → ConsequencePreviewDialog (C12) | killBetSchema reason min 1; transitionBet requires reason (:111); CAS | bets UPDATE; teamMembers activeBets−1 only if fromState was active (not draft) (:207-217) | **no cascade to tasks/sessions — dialog copy "All active tasks will be halted" is false** (FLAG-5) | `bet_state_changed` → propagation handler logs bet→team row |
| field updates | PATCH /api/bets/:id | description (C14, draft/active), at_risk (no UI in these pages), cost_appetite (C13 — broken, FLAG-4), done_condition/hypothesis via `updateBetField` (active only; emits `item_created` kind=done_condition_change on done_condition) | discriminated union Zod (bets.ts:119-124) | bets UPDATE + revisionLog append | — | item_created (done_condition only) |
| outcome | POST /api/bets/:id/outcome (AC1, bets.ts:760 — no current UI caller) and POST /api/bets/:id/retro (AC2, bets.ts:898 — WorkBet C11) | completed/killed only | betOutcomeSchema / betRetroSchema | bets UPDATE outcome* columns (+revisionLog when overriding); retro adds knowledge_items + knowledge_strategy_fabric in one tx | — | none |

Concurrency: compare-and-set `WHERE status=fromState` + `.returning()`; loser rolls back via thrown InvalidTransitionError (bet-state-machine.ts:180-191). Capacity re-read inside tx (:165-177).

### 2. Task state machine — `packages/server/src/services/task-state-machine.ts`

States: `proposed | accepted | hold | in_progress | blocked | review | done | killed`. VALID_TRANSITIONS (:7-16):
- proposed → accepted, killed
- accepted → in_progress, hold, killed
- hold → accepted, killed
- in_progress → review, blocked, killed
- blocked → in_progress, killed
- review → done, in_progress, killed
- done → killed; killed → ∅

(The prompt's ready→in_progress→completed/blocked/failed naming does not exist; there is no `failed` task state — failure is a session outcome / handoff status.)

| Transition | Endpoint | Validation | Writes | Events |
|---|---|---|---|---|
| any valid | POST /api/tasks/:id/transition (tasks.ts:154) | Zod `state ∈ TASK_STATES` (400) then state machine (InvalidTransitionError → mapped to **409** by the global error handler — intentionally different from bets' 400, lore bets.ts:697-699) | tasks UPDATE (state, auditTrail append `{from,to,timestamp}`, updatedAt) — task-state-machine.ts:72-79. **No transaction** (single UPDATE), **no CAS** (read-then-write race possible, unlike bets) | `task_state_changed` (streamId=taskId) |
| in_progress→review (auto) | propagation handler on `session_ended` | outcome==="completed", task in_progress, no other active sessions | same UPDATE via inlined copy (lifecycle-propagation.ts:87-133) | task_state_changed + propagation_applied |
| →blocked (handoff toHuman) | POST /api/tasks/:id/handoff | inlined VALID_TRANSITIONS check inside tx (handoff-protocol.ts:122-125) | see §4 | task_state_changed + item_created post-commit |
| create | POST /api/tasks (tasks.ts:57) | createTaskSchema; bet existence 404 | tasks INSERT state='proposed' | **none** |
| PATCH fields | PATCH /api/tasks/:id (tasks.ts:109) | updateTaskSchema (title/description/doneCondition/ownerAgentId/outcomeVerdict∈TASK_OUTCOME_VERDICTS) | tasks UPDATE; outcomeVerdict also writes outcomeRecordedAt/By + auditTrail append. Note: router is plain `Hono()` (untyped env) but calls `c.get("userId")` — works at runtime because auth middleware is global (app.ts:336) | none |

**No UI surface calls /transition or PATCH /tasks** — task lifecycle is entirely agent/API-driven; humans can only *request* changes via plain thread messages (TaskSheet E6).

Task outcome verdicts: `met | met_with_rework | partially_met | not_met` (tasks.outcome_verdict). Written only by PATCH /api/tasks/:id. Displayed: WorkBet task-row badge (C: :1579), WorkTask Outcome cell ("--" fallback), and consumed by retro draft stub (bets.ts:855-871).

### 3. Lifecycle propagation — `packages/fabric/src/services/lifecycle-propagation.ts` (registered via bootstrap)

Handlers (registerLifecyclePropagation :667-705):
1. `session_ended` → `propagateSessionToTask` (:255): outcome≠completed → log **skipped**; task missing → skipped; task.state≠in_progress → skipped; other active sessions on task → skipped; else transitionTask(→review) → log **applied** (`targetTransition:"in_progress -> review"`) + emit `propagation_applied`. InvalidTransition race → skipped; other errors → **pending_retry**.
2. `task_state_changed` (toState done|killed) → `propagateTaskToBet` (:390): bet terminal → skipped; not all tasks ∈ {done,killed} → skipped ("Not all tasks are terminal"); else `transitionBetToCompletedAsync` (:159 — CAS active→completed, revisionLog entry actor="system:propagation") → log **applied** — but with stale label `targetTransition: "${fromStatus} -> review"` while the actual transition is →completed (FLAG-18) → `createShipConfirmationThread` (:493): threads INSERT (hostKind='bet', initiator system:propagation, participants [system:propagation, founder]) + messages INSERT (type='review', payload kind='ship_confirmation', "All tasks on this bet are complete. Confirm shipping?") + emit `thread_created`. Note the bet is ALREADY completed when this "confirm?" message is posted; the message has no action affordance anywhere in the UI.
3. `bet_state_changed` (completed|killed) → `logBetToTeamPropagation` (:554): propagation_log INSERT (target team, targetTransition null — team status derived on read) + `propagation_applied`.

Retry heartbeat every 30s (:693): re-runs pending_retry rows; at attempts ≥ 3 → status='failed', notification_queue INSERT (eventType='propagation_exhausted', severity=warning), emit `propagation_failed`.

**propagation_log writes** (`logPropagation` :234-251): every attempt INSERTs one row `{id, sourceLevel, sourceId, sourceEvent, targetLevel, targetId, targetTransition, status: applied|skipped|failed|pending_retry, failureReason, attempts, createdAt, appliedAt(when applied)}` → table schema.ts:722-751.

### 4. Handoff protocol — POST /api/tasks/:id/handoff (tasks.ts:165 → handoff-protocol.ts:64)

Request: `{sessionId, toAgent?, toRole?, toHuman?, reason(min 1), artifacts?, remainingWork?}` (handoffSchema tasks.ts:39-47). Route: tasks SELECT 404-guard, sessions SELECT 404-guard, builds SessionContext (workspacePath sentinel `/tmp/.hyperidle-noop-:id` when no snapshot — I6 rm() safety).

Inside ONE `db.transaction` (handoff-protocol.ts:107-309):
1. sessions UPDATE `{state:'done', endedAt}` (:110-113) — **deliberately no `session_ended` event** (handoff is not a cost-attribution event; prevents session-review-creator + propagation firing).
2. Branch:
   - **toHuman**: inline task transition →blocked (validated against VALID_TRANSITIONS; tasks UPDATE state+auditTrail) ; threads INSERT (hostKind='task'); items INSERT kind='review' ("Human review requested…"); captures task_state_changed + item_created events. Result `{status:"success"}`.
   - **toAgent**: pre-validated users SELECT; tasks UPDATE ownerAgentId. Result `{status:"success", targetAgentId}`.
   - **toRole**: teamMembers SELECT by task.teamId → users SELECT (role match, teamId∈memberGroups, status='active', ≠ current agent) LIMIT 1. Found → tasks UPDATE ownerAgentId; else threads INSERT + items INSERT kind='escalation' → `{status:"escalated", escalationItemId}` + item_created.
3. If task.threadId: messages INSERT type='handoff', payload `{type, context_id, status, reason, artifacts, remaining_work, error?}` (:261-283).
4. tasks UPDATE auditTrail append `HandoffAuditEntry {type:"handoff", fromAgent, toAgent?, toHuman?, reason, timestamp}` (re-read in-tx to include step-2 entry) (:288-306).

Post-commit: emit task_state_changed then item_created (:312-317); `releaseSessionDedup(sessionId)` (fabric cost-cap dedup map) (:326). **No UI caller** — agent harness only.

---

## Data Flow Chains (condensed end-to-end)

1. **Portfolio grid**: BetCard grid ← useBets ← GET /api/bets ← bets.ts:359 `db.select().from(bets).limit(50)` ← `bets` table (SELECT). Teams pills ← useTeams ← GET /api/teams ← teams-routes.ts:152 ← `teams`,`team_members`,`bets`(COUNT),`tasks`,`routines`(COUNT),`users`,`sessions` (SELECT).
2. **Create bet**: Create btn → handleSubmit → POST /api/bets → bets.ts:562 → `teams` SELECT, `bets` INSERT(status=draft) → onCreated → refreshBets → GET /api/bets.
3. **Bet detail**: useBet ← GET /api/bets/:id ← bets.ts:446 ← `bets` SELECT, `tasks` SELECT (+sessions correlated subquery), `teams` SELECT; progress/title/team derived in route.
4. **Edit pitch**: BodyEditor onChange → dirty check → debounce 1500ms → PATCH /api/bets/:id {field:description} → patchDescription → `bets` SELECT/UPDATE(description, revision_log)/SELECT → refresh GET /bets/:id.
5. **Kill bet**: overflow Kill → ConsequencePreviewDialog confirm(reason) → POST /api/bets/:id/kill → transitionBet(killed) → tx[`bets` CAS UPDATE, `team_members` UPDATE if was active] → emit bet_state_changed → propagation: `propagation_log` INSERT (bet→team applied) → UI refresh.
6. **Record retro**: outcome form Save → POST /api/bets/:id/retro → tx[`bets` UPDATE outcome*, `knowledge_items` UPSERT, `knowledge_strategy_fabric` UPSERT] → refresh.
7. **Discuss block**: Block handle → popover Discuss → prefill → HostThreadSection composer → POST /api/threads/:id/messages (payload.blockId) → `messages` INSERT → refreshThreadData → GET /api/threads?host_kind=bet… + GET /api/threads/:id → messagesByBlockId → AnchoredMessages inline.
8. **Agent-driven lifecycle** (no UI): session ends (session-lifecycle.ts:239/:310 emits session_ended) → propagation task→review (`tasks` UPDATE, `propagation_log` INSERT) → agent POSTs /tasks/:id/transition review→done → propagation bet→completed (`bets` CAS UPDATE, `propagation_log` INSERT, ship-confirmation `threads`+`messages` INSERT) → bet→team log row. Cost: cost-cap.ts:260 `bets.cost_actual_minor += effectiveCost` per session cost event.
9. **Task detail**: useBet (as #3) + useTaskSessions → GET /api/tasks/:id/sessions → **404, endpoint missing** → empty sessions.
10. **Handoff** (API-only): POST /api/tasks/:id/handoff → tx[`sessions` UPDATE done, branch (`tasks` UPDATE / `threads`+`items` INSERT), `messages` INSERT(handoff), `tasks` auditTrail UPDATE] → events → releaseSessionDedup.

---

## Display Element Sources (the "--"/0% question, answered)

- **Progress %** (WorkBet stat card): server-derived `{done,total}` where done = tasks with `state==='done'`, total = all tasks of the bet (bets.ts:501-502). Renders 0% whenever no task has reached `done`. Since (a) no UI can transition tasks and (b) propagation only takes tasks to `review` (human/agent must approve review→done via API), progress is structurally stuck at 0% in human-only flows. When the bet has **zero tasks**, the code path renders **"NaN%"**, not 0% (WorkBet.tsx:1149-1151).
- **Budget spent**: `bets.cost_actual_minor` — written exclusively by `packages/fabric/src/services/cost-cap.ts:260-268` when a session reports cost (accumulateSessionCost, keyed via tasks.betId). Never written by any route in bets.ts/tasks.ts. NULL → `formatMoney(null)` → `"--"` (shared/format/money.ts:15). The "of -- appetite" sibling is NULL because BetCreateDialog stopped sending costAppetite (R2) and the only UI to set it (AppetiteDialog) sends an invalid payload (FLAG-4).
- **Appetite badge** (header + portfolio budget badge): `bets.cost_appetite_minor/currency` → WireMoney → formatMoney. Portfolio list never gets it (FLAG-2).
- **Task Cost cell / row cost**: `tasks.cost_actual` integer minor → `{minor, currency:"USD"}` (bets.ts:551) → `$ minor/100`.
- **Status dots**: BetCard 8px dot from STATUS_DOT_COLOR[status] (BetCard.tsx:41-46); LiveDot (WorkTask.tsx:57) pure CSS pulse for in_progress/active.
- **Verdict badges**: bet → `bets.outcome_verdict` (BET_VERDICT_LABEL); task → `tasks.outcome_verdict` (TASK_VERDICT_LABEL); portfolio BetCard badge capitalizes raw verdict.
- **Task counts** ("N active / M completed" sessions): would come from GET /api/tasks/:id/sessions — endpoint missing → always 0/0.
- **Session effectiveness score**: `sessions.effectiveness_score` (text float, schema.ts:233) → SessionRow `.toFixed(2)` — unreachable (FLAG-10).
- **latestSessionOutcome**: correlated subquery in GET /bets/:id (bets.ts:479-483) — fetched but only used by the dead sort path and the unreachable TaskSheet metadata strip in WorkBet.

---

## FLAGS

**Critical (broken user-facing behavior)**
1. **FLAG-1 — Portfolio bet titles are a lie.** `BetListItem.title` (useBets.ts:19) is never returned by GET /api/bets (raw rows, no `deriveTitle`). Cards always fall back to `description.slice(0,60)` including the literal markdown `# ` heading prefix. FE/BE field mismatch.
2. **FLAG-2 — Portfolio budget badge can never render.** `BetListItem.costAppetite` expected as WireMoney; GET /api/bets returns raw `costAppetiteMinor/costAppetiteCurrency` columns. `bet.costAppetite` is always undefined → `budgetLabel` never set.
3. **FLAG-3 — Progress/Budget stat cards.** (a) zero-task bets render **"NaN%"** (0/0) — WorkBet.tsx:1149; (b) 0% is the steady state because no UI exists to move tasks to `done`; (c) Budget spent "--" because `bets.cost_actual_minor` is only written by fabric cost-cap on session cost events — never populated in human-only/dev environments; "of -- appetite" because appetite is never set via UI (see FLAG-6).
4. **FLAG-4 — "Adjust appetite" is 100% broken.** AppetiteDialog offers duration strings ("1 week"/"2 weeks"/"6 weeks", WorkBet.tsx:473) and PATCHes `{field:"cost_appetite", value:"2 weeks"}`; the server schema requires WireMoney `{minor,currency}` or null (bets.ts:77-81) → guaranteed 400 every time. Also `currentAppetite={formatMoney(bet.costAppetite)}` ("$50.00") never matches the options; and the menu item shows for `draft` while the server only allows mutation in `active` (bets.ts:305).
5. **FLAG-5 — Kill dialog copy is false.** "STOPS: All active tasks will be halted" — POST /bets/:id/kill performs no cascade to tasks or sessions (bet-state-machine.ts kill path only touches bets + team_members; propagation is upward-only). Tasks/sessions keep running on a killed bet.
6. **FLAG-6 — draft→active is unreachable from the UI.** POST /api/bets/:id/commit has zero web callers (grep confirms). The WorkBet overflow comment "Activate and Pause buttons removed (no pause state)" removed the *Activate* affordance along with Pause, but draft→active is still a required, valid transition. Bets created via BetCreateDialog stay `draft` forever unless an agent/API call commits them. Likewise POST /:id/ship has no UI.
7. **FLAG-7 — TaskSheet in WorkBet is dead code.** `open={selectedTaskId !== null}` but `setSelectedTaskId` is only ever called with `null` (onClose, WorkBet.tsx:1626). Task rows navigate to WorkTask instead (:1567). The three callbacks (handleResolveThreadId/handlePostRequest/handleNavigateToThread, :735-751) exist solely to feed this unreachable component.
8. **FLAG-8 — Task `owner` and `startedAt` don't exist on the wire.** BetDetail.tasks expects `owner` and `startedAt` (types/bet.ts:50,64); GET /bets/:id returns `ownerAgentId`, `createdAt`, `updatedAt` only. Result: WorkBet task-row meta shows blank owner segment; WorkTask Owner cell renders empty; Started cell never renders. Also `tokenAppetite` (types/bet.ts:31) is never returned.
9. **FLAG-10 — GET /api/tasks/:id/sessions does not exist.** useTaskSessions (the only consumer) always 404s. WorkTask Sessions section is permanently "No sessions yet."/"0 active / 0 completed"; SessionRow, effectiveness score, and Dial-in are unreachable. The closest real endpoint is GET /api/sessions?task_id= whose row shape (`state`, `agentId`, no title/cost/agent-name) doesn't match the hook's `TaskSession` (`status`, `agent`, `title`, `cost`) either.

**High (unwired/inert controls)**
10. **FLAG-11 — WorkTask overflow `···` button has no onClick** (WorkTask.tsx:267-273). Pure decoration.
11. **FLAG-12 — "Dial in" button has no onClick** (WorkTask.tsx:350-358). Doubly dead via FLAG-10.
12. **FLAG-13 — Breadcrumb "Work" links to `/work`, which has no route** (router.tsx has only work/portfolio, work/team/:id, work/routine/:id, work/bet/...) → lands on NotFound. Present in both WorkBet (:991) and WorkTask (:238).
13. **FLAG-9 — Dead sort machinery in WorkBet**: `_handleSort` (:907) never invoked; `sortColumn` permanently null; `sortTasks` (:130-157) is an identity pass; `latestSessionOutcome` fetched mainly for this dead path.
14. **FLAG-14 — TaskSheet deprecation docs contradict the code**: header (:9-12) and prop JSDoc (:72-88) claim resolveThreadId/postRequest/onNavigateToThread are "no-op / no longer used", but handleOpenThread and handleSendRequest depend on all three. Removing them per the comment would break the sheet. Additionally TaskSheet's REQUEST intents only post plain-text messages — there is no path from human intent to an actual POST /tasks/:id/transition anywhere in the product.

**Medium (server-side correctness)**
15. **FLAG-17 — Missing `await` on `loadTeamMembers`** in POST /bets/:id/commit (bets.ts:689): the function is async; the surrounding try/catch can never catch its ApiError → unhandled promise rejection instead of the intended 500 mapping, and the existence check it was meant to perform is skipped (transitionBet does its own lookup, so behavior mostly survives by accident).
16. **FLAG-18 — propagation_log stale label**: propagateTaskToBet logs `targetTransition: "${fromStatus} -> review"` (lifecycle-propagation.ts:457) while the actual transition (U1) is `active -> completed`. Audit trail misrepresents the applied transition. Related: the ship-confirmation thread asks "Confirm shipping?" *after* the bet has already transitioned to completed, and no UI affordance exists to answer it.
17. **FLAG-19 — Task transitions have no CAS**: transitionTask (task-state-machine.ts:44) is read-then-write with no transaction/compare-and-set, unlike transitionBet. Two concurrent transitions can both pass validation and double-emit task_state_changed (the bet machine explicitly fixed this; the task machine did not). The fabric copy (lifecycle-propagation.ts:87) has the same gap and is a hand-maintained duplicate of the kernel logic (documented, but a drift hazard).
18. **FLAG-20 — Error-code asymmetry**: bet InvalidTransitionError → 400 VALIDATION_ERROR (caught per-route), task InvalidTransitionError → 409 via global handler. Documented as intentional (bets.ts:697-699) but FE code treats both as generic failures.

**Low (polish/consistency)**
19. **FLAG-15** — GET /api/bets default limit 50 (max 200) with no pagination UI in WorkPortfolio; >50 bets silently truncated. Filters are client-side over the truncated page.
20. **FLAG-16** — Duplicate save indicators in WorkBet pitch section: `pitch-save-indicator` (:1440) and `bet-save-indicator` (:1482) render the same status twice, the first styled `--status-success` even for "Saving...".
21. **FLAG-21** — `BetPitch.onShareBlock` prop is accepted but renamed `_onShareBlock` and unused inside BetPitch (WorkBet.tsx:233) — sharing actually flows through the page-level popover; the prop is a dead pass-through.
22. **FLAG-22** — WorkTask header status label uses raw `state.replace(/_/g," ")` (lowercase "in progress") while the meta strip uses TASK_STATUS_LABEL ("In progress") — inconsistent casing on the same page; header badge class for `blocked`/`review` falls to the neutral branch (no error/amber styling, unlike WorkBet rows).
23. **FLAG-23** — Cost rendering divides `minor/100` with hardcoded `$` in WorkTask/SessionRow/TaskSheet instead of `formatMoney` (ignores currency + scale); task WireMoney currency is hardcoded "USD" server-side (bets.ts:551-552).
24. **FLAG-24** — WorkBet overflow dropdown (raw `toggleAttribute("open")`) has no outside-click or Escape dismissal and stays open after selecting an action that opens a dialog.
25. **FLAG-25** — `bets.appetite` legacy column and `MUTABLE_FIELDS`/`updateBetField` "appetite" mapping (bet-state-machine.ts:51,282) survive even though the PATCH schema can no longer deliver an `appetite` field — unreachable server branch.
26. **FLAG-26** — Naming: `CocAttachButton`/`CocContext` (and WorkBet imports) still carry the banned "CoC" name per the CoS/CoC purge directive; UI strings say "Assistant" but identifiers don't.
27. **FLAG-27** — `transitionBet` returns early on `!transitioned` (bet-state-machine.ts:225) but `transitioned` is always `true` when the tx commits — dead branch.
28. **FLAG-28** — bet `progress.done` excludes killed tasks while bet completion propagation treats done|killed as terminal — a completed bet can permanently display <100% progress.
