# Track E: API Layer

See `CLAUDE.md` for tech stack and `plans/work-packages/dependency-graph.md` for the dependency graph.

---

### E1 — API Scaffold + Auth

**Story.** As a client, I want a Hono API with auth middleware, error handling, request validation, and WebSocket support, so that requests are routed correctly, validated, and errors are consistent.

**Depends on.** A2, A3.

**Acceptance criteria.**
- GET /api/health returns 200 with status.
- Request without API key to /api/* returns 401.
- Request with valid API key passes auth.
- Invalid JSON body returns 400 with validation errors.
- Unhandled error returns 500 with consistent error shape (no stack trace).
- WebSocket upgrade works on /api/ws.
- CORS allows localhost:5173.

**Validation scenarios.**
- Given invalid API key, when request made, then 401 returned.
- Given invalid JSON body, when request made, then 400 with validation errors.

**Contracts / constraints.**
- Error response shape: `{ error: string, code: string, details?: object }`.
- Request validation via Zod (auto-generated from types where possible).

**Effort.** S (~1d)

---

### E2 — Conversations + Items + Responses Endpoints

**Story.** As a human, I want to see review items and chat threads, respond with verdicts (approve, request changes, reject, snooze, etc.), and receive real-time push updates, so that I can oversee agent work and provide feedback.

**Depends on.** E1, B1, C1, D5.

**Acceptance criteria.**
- GET /api/conversations list threads, paginated, sorted by recency or attention_score.
- GET /api/conversations/:threadId thread with items and responses.
- POST /api/items create item (from agent tools, facilitators).
- POST /api/responses record verdict (10 actions: approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate).
- WebSocket /api/ws/conversations pushes new items/responses in real time.
- Item routing: risk_tier, kind → correct view (Conversations vs Rail vs Knowledge).
- Founder routing: Market/Growth → CEO; Product/Design/Tech → CPO; Strategic → Both.
- E2 subscribes to session_ended, creates review items for high-value outcomes.

**Validation scenarios.**
- Given new item created, when WebSocket connected, then item received within 1 second.
- Given human responds with approve, when response recorded, then response_recorded event fires.

**Contracts / constraints.**
- Item routing rules per HUMAN_INTERFACE_LAYER.md §7.
- Founder routing per AGENT_LAYER.md §7.

**Effort.** L (~4d)

---

### E3 — Work Endpoints (Bets + Tasks)

**Story.** As a human planning work, I want to see bets grouped by status, commit bets to cycles respecting capacity, transition tasks through states, and view the canvas, so that work planning is visible and constrained.

**Depends on.** E1, C1, C2.

**Acceptance criteria.**
- GET /api/bets list grouped by status (shaped, committed, in_progress, shipped).
- GET /api/bets/:id bet detail with tasks.
- POST /api/bets create shaped bet.
- PATCH /api/bets/:id update fields (triggers revision logging).
- POST /api/bets/:id/commit transition shaped→committed (capacity enforced).
- POST /api/bets/:id/ship transition in_progress→shipped.
- POST /api/bets/:id/kill kill with reason.
- GET /api/tasks list, filterable by bet_id, state, owner.
- PATCH /api/tasks/:id update.
- POST /api/tasks/:id/transition state transition (validates).
- GET /api/bets/canvas data for Canvas region: shaped, committed, capacity info.
- Concurrent commit at capacity: first succeeds, second rejected 409 (no race).

**Validation scenarios.**
- Given shaped bet, when committed and capacity checked, then bet_shipped event fires.
- Given team at capacity, when concurrent commits attempted, then first succeeds, second rejected 409.

**Contracts / constraints.**
- Canvas data: `{ shaped: [...], committed: [...], capacity: { used, max } }`.
- Kill requires reason (validation).

**Effort.** L (~4d)

---

### E4 — Knowledge Endpoints

**Story.** As a human curator, I want to view knowledge items by layer/scope, create/update/merge/split/archive items, search across knowledge, and receive real-time updates, so that knowledge can be curated and kept coherent.

**Depends on.** E1, B1, B4.

**Acceptance criteria.**
- GET /api/knowledge/:layer list by layer, grouped by topic, kind.
- GET /api/knowledge/:layer/:id single item.
- POST /api/knowledge/:layer create (version=1).
- PATCH /api/knowledge/:layer/:id update (optimistic locking).
- Update stale version → 409 with current version.
- POST /api/knowledge/:layer/:id/merge merge two items (combine body, both IDs redirect).
- POST /api/knowledge/:layer/:id/split split into two.
- POST /api/knowledge/:layer/:id/archive archive (status = 'archived').
- POST /api/knowledge/:layer/:id/flag flag for review.
- GET /api/knowledge/search?q=... FTS5 search, ranked by relevance.
- WebSocket /api/ws/knowledge pushes updates when files written back by agents.
- Edit log: every PATCH creates knowledge_edit_log entry.
- WebSocket delivers updates in same shape as PATCH response + `_event` field.

**Validation scenarios.**
- Given knowledge search, when results returned, then ranked by relevance.
- Given agent writes practice file, when writeback occurs, then WebSocket push delivered within 2s.

**Contracts / constraints.**
- Optimistic concurrency via version column.
- Merge/split maintain cross-links and edit log.

**Effort.** L (~4d)

---

### E5 — Rail Endpoint + WebSocket

**Story.** As a human at a glance, I want to see active bets, blockers, awaiting-ordering items, and cost burn rate on the Rail, with real-time updates via WebSocket, so that I have ambient awareness without opening conversations.

**Depends on.** E1, A3, C1, C7.

**Acceptance criteria.**
- GET /api/rail current state: bets with status, blockers, awaiting-ordering items, cost burn rate.
- WebSocket /api/ws/rail subscribes to: task_state_changed (blockers), bet_committed/shipped (status), cost_cap_warning/breached (cost), item_created (ordering queue).
- Block task → WebSocket blocker_added within 5s (NF-1.2).
- Cost warning → WebSocket cost_warning within 5s.
- Bets returned with one-liner: id, title, status, progress.
- Blockers include: task id, title, owner, duration blocked.
- Cost updates pushed every 30s or per session cost.

**Validation scenarios.**
- Given task blocked, when Rail WebSocket connected, then blocker received within 5s.
- Given factory cost at warning threshold, when cost incremented, then warning pushed.

**Contracts / constraints.**
- Rail data assembled from bets, tasks, factory_settings, items.
- Push latency target: 5s (NF-1.2).

**Effort.** M (~2d)

---

### E6 — Agents + Sessions + Status Endpoints

**Story.** As an operator, I want to view and manage agents (skills, autonomy levels), routines (trigger config, status), inbox, and factory status (active sessions, cost, uptime), so that operations are visible and configurable.

**Depends on.** E1, D5.

**Acceptance criteria.**
- GET /api/agents list all with status, team, role, current sessions.
- GET /api/agents/:id detail with skills, autonomy levels, cost.
- PATCH /api/agents/:id/skills/:skillId update autonomy level (creates review thread if changed).
- GET /api/routines list with trigger config, last/next run.
- PATCH /api/routines/:id update (enable/disable, change config).
- POST /api/routines/:id/retire retire (reassign or deactivate).
- POST /api/routines/:id/trigger manually trigger for testing.
- GET /api/agents/:id/inbox agent's inbox.
- POST /api/agents/:id/inbox send message to agent.
- POST /api/sessions create session (triggers D5).
- PATCH /api/sessions/:id update state (end, crash).
- GET /api/status factory-wide: active sessions, agent states, total cost, uptime.
- GET /api/settings factory settings.
- PATCH /api/settings update settings (cost caps, etc.).
- Autonomy update creates review thread item.

**Validation scenarios.**
- Given agent, when autonomy level changed, then review item created.
- Given routine, when manually triggered, then session created.

**Contracts / constraints.**
- Autonomy changes require human awareness (review thread created).
- Routine retirement respects mutual dependencies.

**Effort.** L (~4d)

---

### E7 — Autonomy + Silence Policy Engine (Backend v1, UI deferred to v2)

**Story.** As the system, I want to evaluate each item against autonomy levels and silence modes to decide whether to push, queue silently, or auto-resolve, so that humans only see what needs their attention and low-risk work auto-approves.

**Depends on.** E2, C7.

**Acceptance criteria.**
- Autonomy L4 + risk_tier low → auto-resolve (no notification).
- Autonomy L3 + risk_tier low → queue silently (in daily digest).
- Autonomy L2 or risk_tier ≥ medium → push notification.
- Autonomy L1 → push for every action.
- Silence mode active → queue all non-blocking items.
- Auto-resolution creates Response with approver='policy_engine'.
- High-risk items NEVER auto-resolve (regardless of autonomy).
- Skill-change items NEVER auto-resolve.
- Daily digest includes all queued items from past 24h.
- Per-product silence: silence product P → all P items queued.
- Silence windows: time-based quiet hours (e.g., 10pm–7am, no pushes).

**Validation scenarios.**
- Given L4 agent and low-risk item, when policy engine runs, then item auto-resolved.
- Given silence mode active, when item created, then item queued (not pushed).

**Contracts / constraints.**
- Policy engine runs on every item creation (E2).
- Auto-resolution policy configurable via factory_settings.
- UI for silence modes deferred to v2 (backend only in v1).

**Effort.** M (~2d)

---
