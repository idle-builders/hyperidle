# Track R: Journey Bliss

Make the end-to-end user journey work — from install to daily rhythm. No new features. Wire what exists, strip what's unnecessary, verify what's built actually functions. Derived from `plans/journey-bliss.md`.

**Constraint:** After each work package merges to main, `npm run dev` must work — the app runs in dev mode at every merge boundary. No new npm dependencies unless existing ones are insufficient.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/dependency-graph.md` for the dependency graph.

---

### R1 — Wire Agent Execution

**Workpackage.** As a founder using HyperIdle, I want agent sessions to actually execute when triggered — connecting the existing provisionSession orchestrator to the POST /sessions API route and instantiating the Claude Agent SDK and Workspace adapters on server startup — so that agents can pick up work, create tasks, and produce real output instead of sitting inert in the database.

**Depends on.** None. All infrastructure exists and is tested: ClaudeAgentSdkAdapter (D2), LocalWorkspaceAdapter (D3), provisionSession (D5), session routes (E6). This workpackage wires them together.

**Complexity.** M

**Acceptance criteria.**
- ClaudeAgentSdkAdapter and LocalWorkspaceAdapter are instantiated during server startup in createApp().
- POST /api/sessions calls provisionSession() instead of a bare DB insert.
- An agent session runs end-to-end: provisions workspace, materializes knowledge, executes via Claude API, streams harness events, ends cleanly.
- Session state transitions correctly: active → done (success) or active → crashed (error).
- Cost and token usage from the harness adapter are persisted to the session record.
- The ANTHROPIC_API_KEY is resolved from the credential store (Electron safeStorage in desktop mode, process.env in dev mode).

**Validation scenarios.**
- Given an API key is configured and a bet exists with a pending task, when POST /api/sessions is called with agentId and taskId, then the agent executes, the session transitions to done, and the task has been worked on.
- Given no API key is configured, when POST /api/sessions is called, then the request fails with a clear error indicating missing credentials (not an unhandled crash).
- Given a running session encounters an unrecoverable error, when the harness reports the error, then the session transitions to crashed and the workspace is preserved for debugging.

**Plan calls.** Skip /design step. Pure backend wiring — instantiate adapters in createApp, update POST route to call provisionSession, resolve credentials from the appropriate store. Architecture pass should focus on adapter lifecycle (singleton vs per-session) and credential resolution pattern.

**Contracts / constraints.**
- provisionSession's 11-phase orchestrator is not modified — only wired into the route.
- LocalWorkspaceAdapter only runs in desktop mode or dev mode (not production shared backend).
- Adapter instantiation follows the existing dependency injection pattern in createApp.

**Out of scope.**
- Automatic session triggering (bet created → agent session starts). Sessions are API-triggered for now.
- N3a env sandboxing (WORKSPACE_ENV_ALLOWLIST). Important but separate hardening concern.
- Docker workspace adapter completion.

**Effort.** M (~1d)

---

### R2 — Work-First Landing

**Workpackage.** As a new user launching HyperIdle for the first time, I want the setup flow stripped to two required fields (name and API key), the product created silently with defaults, and the post-setup landing to be the Work view — and I want bet creation to be just title and pitch — so that I go from install to "my first bet is submitted" in under two minutes.

**Depends on.** None. SetupFlow (P4) and WorkPortfolio exist; this simplifies them.

**Complexity.** M

**Acceptance criteria.**
- Setup flow has two required fields: name and API key. Repo path is optional. Product name is optional (defaults to repo folder name if given, or "My Product").
- Backend mode selection is removed from the setup flow.
- Email field is removed from setup.
- Product is created silently with defaults during setup submission — no visible "First Product" section with required fields.
- After setup completion, the app routes to /work/portfolio (not /conversations).
- BetCreateDialog requires only title and pitch. Product picker is removed (uses default product).
- "Create bet" is the most visually prominent action on WorkPortfolio when no bets exist.

**Validation scenarios.**
- Given a fresh install, when the user fills name and API key and clicks Start, then a product is created with a default name, and the user lands on WorkPortfolio.
- Given a fresh install with an optional repo path provided, when the user completes setup, then the product name is auto-derived from package.json name or folder name.
- Given the user is on WorkPortfolio with no bets, when they look at the page, then "Create bet" is the most obvious available action.
- Given the user clicks "Create bet", when the dialog opens, then only title and pitch fields are shown (no product picker, no extra metadata).

**Plan calls.** Requires /design for the stripped setup layout and the WorkPortfolio empty-state with prominent bet creation. Standard architecture pass for post-setup routing and BetCreateDialog simplification.

**Contracts / constraints.**
- Setup must still create a valid user + product + team in the database (same entities, fewer visible fields).
- Existing Settings must still allow editing product name, adding repo path, configuring email — just not during first-run.
- No new UI components — this is removal and simplification of existing components.

**Out of scope.**
- API key validation call during setup (nice-to-have, not blocking).
- Guided first-bet creation (the simple dialog is sufficient).
- Changing the Settings panel.

**Effort.** M (~1d)

---

### R3 — Block Rendering in Messages

**Workpackage.** As a user reading agent messages in a thread, I want messages to render with proper formatting — code blocks, bold, lists, headings — using the existing block rendering infrastructure, so that agent responses are readable and match the quality of any modern AI chat interface instead of displaying as raw monospace text.

**Depends on.** None. The block rendering system (deriveBlocks) and ThreadShell/CommentRow exist. Messages currently render as plain whitespace-pre-wrap text.

**Complexity.** M

**Acceptance criteria.**
- Plain message payloads are processed through the block rendering pipeline before display in CommentRow.
- Fenced code blocks render in monospace with visual distinction from surrounding text.
- Bold, italic, lists, and headings render correctly.
- Links are clickable.
- Messages with no markdown render identically to today (no regression for plain text).

**Validation scenarios.**
- Given an agent sends a message containing a fenced code block, when the user views the thread, then the code renders in a visually distinct monospace block.
- Given an agent sends a message with **bold**, *italic*, and a bullet list, when the user views the thread, then all formatting renders correctly.
- Given a plain text message with no markdown syntax, when rendered, then it looks the same as today's whitespace-pre-wrap.

**Plan calls.** Standard architecture pass — determine whether to use deriveBlocks() (block pipeline with anchoring support) or a lightweight markdown-to-HTML pass. The choice depends on whether block-level features (per-block discussion) should apply to messages.

**Contracts / constraints.**
- Must use existing dependencies — no new markdown libraries unless nothing suitable is present.
- Must not break existing message type rendering (review, questionnaire, verdict cards).
- Markdown output must be sanitized to prevent XSS.

**Out of scope.**
- Per-block discussion anchoring on messages.
- Image rendering in messages.
- Message editing.
- Syntax highlighting in code blocks (monospace + background is sufficient for v1).

**Effort.** M (~4h)

---

### R4 — Thread Identity Fix

**Workpackage.** As a user viewing a thread, I want sender names and roles to display correctly on every message — so that I can tell who said what without seeing blank or missing sender information.

**Depends on.** None. The fix pattern exists in the coach endpoint (GET /api/threads/coach correctly includes identities); this copies it to the general thread detail endpoint.

**Complexity.** S

**Acceptance criteria.**
- GET /api/threads/:id response includes an identities map matching the pattern used in the coach endpoint.
- ThreadShell renders sender names correctly for all messages in any thread.

**Validation scenarios.**
- Given a thread with messages from both a human user and an AI agent, when GET /api/threads/:id is called, then the response includes identities for both participants with correct names and roles.
- Given the thread detail is rendered in the UI, then each message group shows the correct sender name.

**Plan calls.** Skip /design step. One-file server fix — query thread participants and build identity map in the threads route handler, same pattern as coach.ts.

**Contracts / constraints.**
- Response shape matches what useThreadDetail hook already expects (identities field).
- No new API endpoints.

**Out of scope.**
- Avatar images in threads.
- Participant list or presence indicators.

**Effort.** S (~30min)

---

### R5 — Agent Work Loop

**Workpackage.** As a founder watching an agent work on a bet, I want to see the full loop functioning: agent picks up a bet, creates tasks, tasks appear in the WorkBet page, agent submits work for review, I approve or reject, and cost is tracked throughout — so that the core human-agent collaboration cycle works end-to-end.

**Depends on.**
- R1 (Wire Agent Execution): The agent must actually run to verify the work loop.

**Complexity.** M

**Acceptance criteria.**
- Agent reads the bet pitch and creates tasks using skill tools. Created tasks appear in the WorkBet task table with correct title and status.
- Agent submits a review message when work is complete. The review renders as a RichMessageCard in the bet's host thread.
- User can submit a verdict (approve/reject) on the review. The verdict is persisted and readable by the agent.
- Cost from the harness adapter flows through and displays in the WorkBet cost section.
- Task status updates from the agent are reflected in the WorkBet task table status chips.

**Validation scenarios.**
- Given a committed bet with a pitch, when an agent session runs against it, then at least one task is created and visible in the WorkBet task table.
- Given an agent submits a review message, when the user views the bet's host thread, then a RichMessageCard appears with verdict action buttons.
- Given the user approves a review, when the verdict is persisted, then the agent can read it in a subsequent session.
- Given a completed session with cost tracked, when the user views the WorkBet page, then the cost section shows actual spend in dollars and tokens.

**Plan calls.** Skip /design step. Integration verification — run an agent against a real bet, observe the output at each stage, fix broken connections. Architecture pass should map the exact data flow: agent tool call → DB write → API response → UI render for each of tasks, reviews, and cost.

**Contracts / constraints.**
- No modifications to existing skill tool signatures — verify they work as designed.
- If the review→verdict→agent loop has a protocol gap, fix the minimum needed to close it.
- Cost display uses the existing WorkBet cost section — no new UI.

**Out of scope.**
- Automatic session triggering (bet committed → agent starts automatically).
- Multi-session orchestration (agent A finishes → agent B picks up).
- Task dependency resolution between tasks.

**Effort.** M (~1d)

---

### R6 — Artifacts Pipeline

**Workpackage.** As a founder reviewing agent output, I want artifacts that agents produce to be accessible via API and visible in the WorkBet and WorkPortfolio views — so that I can see tangible, measurable results from agent work, not just status chip changes on tasks.

**Depends on.**
- R1 (Wire Agent Execution): Agent must run to produce artifacts.

**Complexity.** M

**Acceptance criteria.**
- GET /api/artifacts/:id endpoint exists and returns artifact data (currently referenced by ArtifactView but the endpoint does not exist).
- Artifacts created by agent sessions appear in the WorkBet ArtifactSection.
- Artifacts appear in the WorkPortfolio artifact gallery.
- Artifact metadata (kind, cost, timestamp) renders correctly in ArtifactStackItem.

**Validation scenarios.**
- Given an agent session produced an artifact, when GET /api/artifacts/:id is called, then the response includes the artifact's content, kind, and metadata.
- Given a bet with completed agent work that produced artifacts, when the user views the WorkBet page, then the ArtifactSection shows artifacts with correct kind badges and timestamps.

**Plan calls.** Standard architecture pass — artifact schema exists in the DB, ArtifactView components exist in the frontend. The gap is the API endpoint and verifying the agent's artifact creation writes data that these components can consume.

**Contracts / constraints.**
- Uses existing artifact schema — no schema changes.
- Uses existing ArtifactView, ArtifactStackItem components — no new UI components.
- Artifact content may be file references or inline content — the endpoint handles both.

**Out of scope.**
- Artifact diffing or comparison views.
- Artifact versioning.
- Inline artifact preview in thread messages.

**Effort.** M (~4h)

---

### R7 — Knowledge & Bet Cycles

**Workpackage.** As a founder using HyperIdle daily, I want the knowledge capture cycle (agent captures knowledge → it appears in KnowledgeList → it materializes into the next session) and the bet lifecycle (shaped → committed → in_progress → shipped in one day) to work end-to-end — so that the system accumulates intelligence over time and bets complete on a daily rhythm.

**Depends on.**
- R5 (Agent Work Loop): The agent must create tasks, complete work, and interact via threads before knowledge capture and bet completion can be verified.

**Complexity.** M

**Acceptance criteria.**
- Agent's write_memory and promote_knowledge tools create items that appear in the KnowledgeList view.
- Knowledge items captured in session N are materialized into the workspace for session N+1 (provisionSession phase 6).
- A bet transitions through its full lifecycle (shaped → committed → in_progress → shipped) within a single day via agent completion and API calls.
- Shipped bets appear in WorkPortfolio with correct status and updated ship rate.
- KnowledgeList triage tab shows draft items created by agents. Curated tab shows promoted items.

**Validation scenarios.**
- Given an agent session where write_memory was called, when the user opens KnowledgeList, then the captured item appears in the triage tab with correct title and content.
- Given knowledge items exist from prior sessions, when a new session provisions, then the materialized workspace contains those items.
- Given a bet is committed and all its tasks are completed, when the bet is transitioned to shipped, then WorkPortfolio shows the updated ship rate and the bet appears as shipped.

**Plan calls.** Skip /design step. Integration verification across knowledge and bet subsystems. Architecture pass should trace: agent tool call → knowledge DB write → KnowledgeList API → UI display, and bet state machine → WorkPortfolio aggregation.

**Contracts / constraints.**
- No changes to the knowledge materialization algorithm — verify it works as designed.
- Bet lifecycle transitions follow the existing state machine — no new states or transitions.
- Knowledge items from agents default to product scope.

**Out of scope.**
- Knowledge curation workflow (human reviews triage → promotes to curated).
- Knowledge conflict resolution.
- Multi-day bet velocity metrics.

**Effort.** M (~1d)

---

### R8 — Signal-to-Noise Defaults

**Workpackage.** As a founder using HyperIdle daily, I want sensible notification defaults — routine task completions are quiet, blockers and budget warnings are prominent, and reviews needing my input are clearly surfaced — so that the system respects my attention instead of drowning me in noise from every minor state change.

**Depends on.**
- R5 (Agent Work Loop): The work loops must function to observe what generates noise and what needs attention.

**Complexity.** M

**Acceptance criteria.**
- Notification event subscriptions are reviewed and defaults documented: which events trigger user-facing notifications, which are silent.
- Routine task status changes (pending → in_progress → done) do not generate prominent notifications.
- Blocked tasks and cost cap warnings generate clear, visible notifications or thread messages.
- Reviews pending human verdict are surfaced prominently via the existing unresolved review indicator.
- Default quiet hours are off (user configures in Settings if desired).

**Validation scenarios.**
- Given an agent completes a routine task, when the user checks the app, then no prominent notification was generated — the task status simply updated in the WorkBet table.
- Given an agent encounters a blocker, when the user checks the app, then a clear notification or thread message surfaces the blocker with context.
- Given a review is pending verdict, when the user opens the bet view, then the unresolved review is visually prominent with action buttons.

**Plan calls.** Skip /design step. Review existing notification dispatcher and event subscriptions in fabric. Adjust default subscription filters and event-to-notification mappings. No new notification infrastructure.

**Contracts / constraints.**
- Uses existing notification system — no new notification types or delivery channels.
- Defaults must be overridable via existing notification preferences in Settings.
- No toast notifications, modals, or sound effects.

**Out of scope.**
- Desktop push notifications (Electron notification API).
- Notification history or inbox view.
- Per-agent or per-bet notification configuration.

**Effort.** M (~2h)

---

### R9 — Action Prominence Audit

**Workpackage.** As a user at any stage of the journey (first 10 seconds through day 100), I want the two most important actions on every page to be the most visually prominent and accessible elements — so that I never have to hunt for what to do next, and the interface guides me naturally through the journey from onboarding to daily rhythm.

**Depends on.**
- R2 (Work-First Landing): Setup and WorkPortfolio are redesigned in R2 — auditing them before that change lands would produce throwaway findings.

**Complexity.** M

**Acceptance criteria.**
- Every page has its top-2 actions defined and documented, mapped to the journey stage where that page becomes relevant:
  - **Setup** (first 10s): #1 fill name + API key, #2 click Start.
  - **WorkPortfolio** (first 10min): #1 create bet, #2 open existing bet.
  - **WorkBet** (first hour): #1 submit verdict on pending review, #2 view task progress.
  - **Conversations / Thread** (first hour+): #1 send message, #2 act on review card.
  - **KnowledgeList** (day 10+): #1 review triage item, #2 search/browse curated items.
  - **KnowledgeDetail** (day 10+): #1 edit content, #2 change scope.
  - **Settings** (any time): #1 add/update API key, #2 edit profile.
- For each page, the #1 action is the largest or most visually dominant interactive element (largest button, highest contrast, most prominent position).
- The #2 action is the second most prominent — not buried in a menu, submenu, or overflow.
- No page has a decorative or low-value element (empty illustration, generic help text) more visually prominent than its #1 action.
- Actions that are irrelevant at the current data state are de-emphasized, not hidden (e.g. "open existing bet" is greyed when no bets exist, but "create bet" is amplified).

**Validation scenarios.**
- Given WorkPortfolio with zero bets, when the user views the page, then "Create bet" is the single most visually dominant element — larger, higher-contrast, or more prominently positioned than any other interactive element.
- Given WorkBet with a pending review, when the user views the page, then the verdict action buttons on the RichMessageCard are more prominent than the task table, action bar, or any other element.
- Given KnowledgeList with triage items, when the user views the page, then the triage tab and its items are more visually prominent than the curated tab.
- Given a page screenshot at each journey stage, when compared against the documented top-2 actions, then the visual hierarchy matches the documented priority.

**Plan calls.** Requires /design for the visual audit — screenshot each page, annotate the visual hierarchy, compare against the journey-defined priorities, and specify targeted fixes (button size, contrast, position, empty-state treatment). Implementation is CSS/layout adjustments to existing components, not new components.

**Contracts / constraints.**
- No new components — this is adjustment of existing visual weight (size, color, position, contrast).
- Follows existing design tokens and density ladder — no one-off overrides.
- Empty states guide toward the #1 action, not away from it.
- The audit covers desktop viewport only (mobile is out of scope for this pass).

**Out of scope.**
- Mobile or tablet layout adjustments.
- Adding new actions to any page.
- Restructuring page layouts beyond visual weight adjustments.
- Onboarding hints or guided tours (covered by P5).

**Effort.** M (~4h)

---

## Track Summary

| Story | Title | Effort | Depends on |
|-------|-------|--------|------------|
| R1 | Wire Agent Execution | M (~1d) | None |
| R2 | Work-First Landing | M (~1d) | None |
| R3 | Block Rendering in Messages | M (~4h) | None |
| R4 | Thread Identity Fix | S (~30min) | None |
| R5 | Agent Work Loop | M (~1d) | R1 |
| R6 | Artifacts Pipeline | M (~4h) | R1 |
| R7 | Knowledge & Bet Cycles | M (~1d) | R5 |
| R8 | Signal-to-Noise Defaults | M (~2h) | R5 |
| R9 | Action Prominence Audit | M (~4h) | R2 |

**Critical path:** R1 → R5 → R7

**Total effort:** ~5.5d (8 M + 1 S)

**Parallelism windows:**
- R1, R2, R3, R4 are fully independent — all four can run in parallel.
- R5 and R6 can run in parallel after R1 completes.
- R7, R8 can run in parallel after R5 completes.
- R9 can run in parallel with R5/R6 (after R2 completes).
