# Track Q: Human Initiative

Give humans the ability to initiate — not just react. Three capabilities: start conversations (DM any user or agent, dial into live sessions), author knowledge at any scope (factory down to personal notes), and create bets directly from the Work Canvas. All three follow the collaborative continuation principle: who starts doesn't matter, everything is a shared artifact between humans and agents.

**Concept:** `plans/human-authoring/concept.md`

**Scope rules (apply to every workpackage in this track):**
- **Concept is locked.** The three concepts (scope kernel/layer strategy separation, collaborative continuation, session dial-in as thread view) are fixed inputs. Do not reshape them.
- **Kernel/strategy boundary.** `scope_kind` lives on the kernel `knowledgeItems` table. Layer stays on the strategy extension. This track respects the O-track separation — kernel code never imports from `@hyperidle/fabric`.
- **Existing primitives.** Thread, Bet, and KnowledgeItem primitives are stable. This track adds human entry points and extends scope, not new primitives.
- **Collaborative continuation.** Every creation flow produces an artifact that both humans and agents can subsequently edit. No "human-only" or "agent-only" items.
- **No founder-filter regressions.** No customizable dashboards, no emoji reactions, no keyboard verb shortcuts, no search-modifier mini-language.

---

### Q1 — Human-initiated conversations and session dial-in

**Workpackage.** As a founder, I want to start a conversation with any user or agent from the Conversations view — pick a recipient, type a message, send — so that I can proactively communicate instead of waiting for agents to surface threads. When an agent is mid-session, I want to dial into its task thread and see live session activity (cost, actions, reasoning) alongside the conversation, with the ability to interject by posting a message the agent picks up in context.

**Depends on.** None (Thread primitive from L1 already supports DM configuration with host=user/agent and human participants; session activity events already flow through the event bus).

**Complexity.** L

**Acceptance criteria.**
- A "new thread" action is accessible from the Conversations view.
- The action opens a recipient picker showing all users and agents in the system, with a search/filter affordance.
- Selecting a recipient and sending a message creates a DM-configured thread (host=sender, two participants) and persists it via the existing thread API.
- The new thread appears in the Conversations submenu thread list immediately after creation.
- When viewing a thread where the recipient agent has an active session, a "dial in" affordance is visible.
- Dial-in mode shows the session's activity stream (recent actions, cost burn, reasoning excerpts) alongside the thread's message history, composed into one view.
- In dial-in mode, the user can post a message (interject) that appears in the task's thread — the same thread the agent reads.
- Observe mode is read-only — the agent's session is not interrupted or notified by observation alone.
- When the session ends, the dial-in view gracefully transitions to a normal thread view (activity stream stops, thread remains).
- Vitest tests cover: thread creation via API with DM configuration, recipient picker filtering, session activity stream subscription.
- Playwright E2E: create a new DM thread with an agent, verify it appears in thread list; open dial-in on an active session and verify activity renders.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given the user is on Conversations view, when they tap "new thread" and select an agent, then a DM thread is created with host=user and participants=[user, agent], and it appears in the thread list.
- Given agent Builder is mid-session on task T-42, when the user dials into T-42's thread, then the activity overlay shows the session's recent actions, cost, and reasoning — and the user can scroll the thread messages independently.
- Given the user interjects "stop working on this" into a dial-in session, when the agent checks its context, the message is visible as a plain message in the task's thread.
- Given no agents have active sessions, when the user opens any thread, then no dial-in affordance is shown.

**Plan calls.** Standard architecture pass. The recipient picker, session activity stream (WebSocket subscription), and the composed dial-in view need design exploration — `/design` first, then `/architecture`. The activity stream composition (thread messages + session events in one timeline) is the key design decision.

**Contracts / constraints.**
- DM threads use the existing Thread primitive with DM configuration (host=sender, two participants). No new thread types.
- Session activity is read from existing session/event-bus infrastructure — no new event types needed for observe mode.
- Interjection is a standard message post to the task's thread — no special message type.
- The recipient picker must include both users and agents. Agent status (active session / idle) is visible but does not gate messaging.
- No real-time co-editing of agent work. The agent owns its session.

**Out of scope.**
- Group conversations (3+ participants). Threads are two-party DM or broadcast feed.
- Agent interruption semantics (forcing an agent to stop). Interjection is advisory.
- Notification rules for new DM threads (handled by existing notification infrastructure).
- Voice or video communication.

**Effort.** L (~5d)

---

### Q2 — Human-authored knowledge at any scope

**Workpackage.** As a founder, I want to create knowledge items from the Knowledge view and from bet/task detail pages — picking a scope (factory, product, practice, team, bet, task, or user), writing a title and markdown body, and saving — so that I can capture insights, decisions, constraints, and personal notes directly in the knowledge store where agents can materialize them. Scope is mutable: I can promote a private note to product-level knowledge by changing its scope.

**Depends on.** None (knowledge_items kernel table and POST /api/knowledge endpoint exist; the scope_kind concept is locked in `plans/human-authoring/concept.md` and ground-truth updated in `docs/knowledge-architecture/the-canonical-store.md`).

**Complexity.** L

**Acceptance criteria.**
- `scope_kind` column added to the kernel `knowledgeItems` table as a closed enum: `factory | product | practice | team | bet | task | user`. `scope_id` remains on the kernel table as the entity identifier.
- The `KnowledgeScope` type in `packages/fabric/src/types.ts` is extended to include `bet | task | user | team` (or a new kernel-level scope type is created in `packages/shared`).
- A "new item" action is accessible from the Knowledge view.
- The creation flow presents: scope picker (scope_kind + scope_id), title field, markdown body editor. Scope defaults to `factory` when created from Knowledge view.
- When creating from a bet detail page, scope defaults to `bet` with `scope_id` pre-filled. Same for task detail pages (scope=`task`).
- A user-scoped item is visible only to the author in the Knowledge view. Changing scope to `product` or higher makes it visible to agents and other users.
- Scope is mutable after creation — an explicit "change scope" action on the knowledge detail page. Scope changes are tracked in version history.
- Items at any scope use the same schema, lifecycle, and rendering as agent-generated items. The `updated_by` field records the human user's identity.
- The Knowledge Fabric assigns a layer (L0-L4) to items whose scope maps to a layer (factory→L4, product→L2, practice→L3, task→L1). Items with scope `bet`, `team`, or `user` have no layer assignment.
- Vitest tests cover: scope_kind schema validation (closed enum enforcement), creation at each scope level, scope mutation with version bump, layer assignment logic.
- Playwright E2E: create a knowledge item from Knowledge view at factory scope; create one from bet detail at bet scope; change scope from user to product and verify visibility changes.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given the user is on Knowledge view, when they tap "new item" and select scope=product for product "Nimmly", write a title and markdown body, and save, then the item appears in the Knowledge list with scope=product and is materializable by agents working on Nimmly.
- Given the user is on bet detail for bet B-7, when they tap "add knowledge" and write integration constraints, then the item is created with scope=bet, scope_id=B-7, and no layer assignment.
- Given a user-scoped item exists, when the user changes its scope to `practice` with scope_id="building", then the item gains layer=L3 from the fabric and becomes visible to agents in the building practice.
- Given an agent creates a knowledge item at product scope, when the user edits its body and saves, then `updated_by` reflects the user's identity, version increments, and both the agent and user appear in the derived contributor list.

**Plan calls.** This workpackage combines a schema change (scope_kind on kernel) with a UI creation flow. The schema change should be planned carefully — it touches the kernel/strategy boundary established by Track O. `/architecture` should plan the migration, the scope picker component, and the contextual creation flows (from Knowledge view vs. from entity detail pages). `/design` for the creation form and scope picker.

**Contracts / constraints.**
- `scope_kind` is a closed enum on the kernel table. Adding a scope kind requires a concept-doc update first.
- Layer assignment is the fabric's job — the creation flow does not set layer. The fabric derives it from scope_kind mapping (or leaves it null for bet/team/user).
- Scope mutation is tracked in version history. No silent re-scoping.
- User-scoped items are not materialized into agent sessions. Promotion to a layer-mapped scope is an explicit user action.
- The kernel `knowledgeItems` table gains `scope_kind` + keeps `scope_id`. No other kernel schema changes.

**Out of scope.**
- Rich block editor (callouts, wiki-links). Creation uses plain markdown. Block rendering on read is handled by existing L2 Block primitive.
- Automatic promotion (L1→L3 knowledge flow). That's the fabric's existing promotion pipeline.
- Access control / permissions beyond scope-based natural visibility.
- Knowledge templates or structured creation wizards.

**Effort.** L (~5d)

---

### Q3 — Human-created bets

**Workpackage.** As a founder, I want to create a bet directly from the Work Canvas — writing a title, pitch body in markdown, selecting a product, and optionally setting an appetite — so that I can shape and commit my own ideas without round-tripping through a PM agent. The pitch lands in the "shaped" column and follows the normal bet lifecycle from there, available for agents to refine and decompose.

**Depends on.** None (POST /api/bets endpoint already exists and creates a shaped bet with productId, teamId, pitch, and optional costAppetite; the Canvas UI exists with shaped/committed columns).

**Complexity.** M

**Acceptance criteria.**
- A "new pitch" action is accessible from the Work Canvas shaped column.
- The creation form presents: product picker, title (or extracted from first line of pitch), pitch body (markdown textarea), optional appetite (Money input matching the existing costAppetite schema).
- Submitting creates a bet via the existing POST /api/bets endpoint with status=`shaped`.
- The new pitch appears as a PitchCard in the shaped column immediately after creation.
- The pitch body renders as markdown in the bet detail view (same rendering as agent-shaped pitches).
- The founder can edit the pitch body after creation (using the existing PATCH /api/bets/:id endpoint for mutable fields).
- An agent can subsequently edit the same pitch — collaborative continuation. The bet's version history tracks both human and agent edits.
- `teamId` is auto-assigned based on the selected product's team (the founder picks product, not team).
- Vitest tests cover: bet creation via API with human author, pitch markdown round-trip, version history after human+agent edits.
- Playwright E2E: create a pitch from Canvas, verify PitchCard appears in shaped column; open bet detail and verify pitch renders as markdown; edit the pitch and verify version increments.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given the user is on Work Canvas, when they tap "new pitch", select product "Nimmly", write a title and markdown pitch body with appetite $500, and submit, then a new bet appears in the shaped column with status=shaped and the pitch renders correctly in detail view.
- Given a human-created bet exists in shaped, when the user DMs the PM agent "can you flesh this out?", and the agent edits the pitch body, then both the user and agent appear in the bet's version history.
- Given the user creates a pitch with no appetite, when it appears in shaped column, the appetite field shows "—" (not $0, not an error).
- Given the user submits an empty pitch body, then the form shows a validation error and does not submit.

**Plan calls.** Standard architecture pass — the API exists, this is primarily a UI workpackage. `/design` for the creation form placement (inline in Canvas? modal? slide-over?) and the product picker. `/architecture` for form validation, team auto-assignment logic, and the optimistic UI update pattern.

**Contracts / constraints.**
- Bets created by humans use the same schema and lifecycle as agent-created bets. No `created_by_type` discriminator needed — `updated_by` already tracks actor identity.
- Status starts at `shaped`. The founder must explicitly commit (drag to committed) — no auto-commit on creation.
- `teamId` is derived from the product's assigned team, not user-selected.
- The form rejects the deprecated string `appetite` field (per existing API validation in bets.ts).

**Out of scope.**
- Structured pitch templates (problem/appetite/rabbit-holes/no-gos sections). The pitch is freeform markdown — PM agents can add structure if asked.
- Task creation by humans. Task decomposition remains the agent's job after bet commitment.
- Batch bet creation or import.
- Canvas drag-to-commit in this workpackage (already exists).

**Effort.** M (~3d)
