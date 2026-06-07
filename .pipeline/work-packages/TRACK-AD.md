# Track AD: Product-Market Fit & Operational Readiness

Close the gaps between what's built and what's needed for HyperIdle to be usable by its target users: solo AI founders, small teams (2-5 humans + agents), and agencies. Derived from the June 2026 product analysis — 24 codebase audits that compared documentation claims against actual code.

The codebase is solid (19/20 features work end-to-end, 1300+ files, 95+ test files). The gaps are wiring, UX, and false knowledge — not missing architecture. The harness runtime is production-ready. The knowledge fabric works. The thread/message system is complete. What's missing is the connective tissue that turns working subsystems into a coherent user experience.

**What exists today.** Session provisioning orchestrator (11 phases, 4 harness adapters), multi-provider model gateway, cost tracking (L17 WireMoney), knowledge fabric with cross-team sharing (practice scope), thread system with human-to-human support, review/verdict system with 5 decisions, agent role catalog (16 roles, 8 soul templates, `defaultRoster()` function), org chart routing kernel (`resolveReviewRecipients()`), hint system (6 contextual hints), notification queue with 3 adapters.

**Constraint:** No enterprise features (SSO, RBAC, compliance). Open source, not a product to sell. Positioned as "the OS for your agent factory" — not competing with single-agent tools like Claude Code. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AD1 — Purge False Knowledge & Doc Hygiene

**Workpackage.** As an AI agent building HyperIdle, I want the documentation to accurately reflect what the codebase actually does, so that I don't waste hours building on false assumptions or reimplementing what already exists. As a founder, I want doc references to link to actual source files so I can tell when documentation has drifted from code.

**Why this matters.** The June 2026 audit found three categories of false knowledge actively misleading agents: (1) cycle management (6w+2w Shape Up model) described in requirements docs but never implemented — zero code exists, (2) the Rail sidebar documented across the human interface layer but deleted in U6, and (3) "product" terminology persisting in UI labels, E2E tests, and 5+ doc files after the U1 rename to "teams." Additionally, knowledge layer labels (L0-L4) leak into 2 user-facing surfaces despite being invisible strategy. Every agent that reads these docs builds on lies. The cost is measured in hours of rework per workpackage.

**What exists today.** Docs reference cycles in `functional-requirements.md` § F-11, `usability-requirements.md` § UX-5.2/5.6/5.8, `the-three-views-the-rail.md` (6+ references), `our-components.md`. Rail references persist in human-interface-layer docs and user guide despite U6 deletion. Knowledge layer labels display in `KnowledgeDetail.tsx` (line 622, `<Tag label={item.layer} />`) and `GlobalSearchPanel.tsx` (line 253). Knowledge scope pills in `KnowledgeList.tsx` render raw `scopeKind: "product"` instead of "Team." Two E2E tests broken (`Q3-bet-creation.spec.ts`, `navigation.spec.ts`). The "meta layer" positioning language persists across architecture docs.

**What's genuinely missing.** A single documentation sweep that: removes false cycle/rail references, replaces layer badges with scope badges, fixes "product" → "team" in UI labels and E2E tests, updates positioning language from "meta layer" to "OS for your agent factory," and establishes a doc-to-code linking convention so future drift is detectable.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- No documentation file references cycle management, 6-week build cycles, 2-week cooldown, shaping/betting/building/cooldown phases, or the Shape Up cycle model as a current or planned feature.
- No documentation file references the Rail as a current UI element. Current awareness surfaces (Conversations filter chips, WorkTeam AgentRow health, Sidebar triage badge) are documented instead.
- Knowledge detail view shows a human-readable scope badge (e.g., "Team: Nimmly", "Practice: Building", "Factory") instead of a layer label (L0/L1/L2/L3/L4). Layer terminology is invisible to users everywhere in the UI.
- Knowledge scope pills in list views display "Team" instead of raw `scopeKind: "product"`.
- All E2E tests that reference "product" labels or removed UI elements are updated and pass.
- Architecture and positioning docs use "OS for your agent factory" framing, not "meta layer on top of agent harnesses."
- Key documentation sections include a code-reference annotation linking to the source file they describe, following a defined convention.

**Validation scenarios.**
- Given a fresh `docs/` search for "cycle", "cooldown", "6-week", "Shape Up", when results are reviewed, then zero matches reference these as current features.
- Given the KnowledgeDetail page for a team-scoped item, when the metadata bar renders, then the badge shows "Team: [name]" not "L2."
- Given `npm run test:e2e`, when the full suite runs, then no test fails due to "product" label selectors.
- Given a doc section about the Work view, when an agent reads it, then it links to the actual source files implementing that view.

**Plan calls.** Skip /design — this is a doc sweep + 2 UI label fixes + E2E test repairs. Standard architecture pass to enumerate all files to touch.

**Contracts / constraints.**
- No code logic changes — only display labels, doc text, and test selectors.
- The scope badge replacement must use the existing scope metadata (scopeKind + scopeId), resolved to human-readable labels via the team/practice/factory names from the API.
- Doc linking convention must be simple enough for agents to maintain (inline comment, not a separate manifest).

**Out of scope.**
- Rewriting the knowledge API to join strategy-fabric tables (separate concern).
- Changing the scopeKind enum values in the database (they stay as-is; display labels transform them).
- Mobile responsiveness or layout changes.

**Effort.** M (~4h)

---

### AD2 — Wire Review Routing to Humans

**Workpackage.** As a founder reviewing agent work, I want review items created by agents to appear in my conversation queue, so that I can actually see and verdict on the work my agents produce. As a second founder on the same factory, I want reviews routed to me based on my team ownership, so that each founder sees the reviews relevant to their domain.

**Why this matters.** The review flow is the daily driver — the single most important interaction between humans and agents. Currently, when an agent creates a review item, the thread participants are hardcoded to `[agentId]` only. Humans are never added. The `resolveReviewRecipients()` function exists, is tested, and works — but is never called. This means every review item goes to nobody. The entire Plan > Interact > Review > Repeat loop is broken at the Review step. Without this fix, the product is unusable for its core purpose.

**What exists today.** `resolveReviewRecipients()` in `org-routing.ts` queries `org_edges` by 3 mechanisms (direct/function/team), deduplicates, falls back to all humans if no edges match. P2 tests pass comprehensively. Thread participant filtering works — `GET /api/threads?participant_id=<userId>` correctly returns only threads where the user is a participant. The IDOR vulnerability (participant_id not validated against auth identity) is documented and deferred.

**What's genuinely missing.** Two call sites need to invoke `resolveReviewRecipients()` and add the returned human IDs to thread participants: `create-item.ts` (line 75) and `session-review-creator.ts`. Additionally, the threads API should validate that `participant_id` matches the authenticated user to close the IDOR vulnerability.

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- When an agent creates a review item, the resulting thread includes the appropriate human(s) as participants — determined by `resolveReviewRecipients()` based on org_edges.
- When no org_edges match, all human users are added as participants (the fallback behavior already in `resolveReviewRecipients()`).
- When a founder queries their conversation queue, review threads created by their team's agents appear in the list.
- The threads API validates that the `participant_id` query parameter matches the authenticated user, returning 403 for mismatches (IDOR fix).

**Validation scenarios.**
- Given founder A owns team "Tech" via org_edges, when a tech builder agent creates a review item, then founder A sees it in their conversations.
- Given no org_edges exist, when any agent creates a review item, then all human users see it.
- Given founder A's API key, when querying `GET /api/threads?participant_id=<founderB_id>`, then the response is 403.

**Plan calls.** Standard architecture pass — identify the exact insertion points, the context threading needed to pass db + agent role + team ID to the routing function, and the IDOR validation middleware.

**Contracts / constraints.**
- The fallback (all humans) must be preserved — removing it would silently break factories without org_edges configured.
- Thread participant arrays must remain sorted and deduplicated (existing convention).
- IDOR fix must not break local-mode single-founder setups where participant_id validation would be against the only user.

**Out of scope.**
- Multi-human approval quorum (first-verdict-wins is acceptable for now).
- Review routing UI in settings (org_edges CRUD already exists in SettingsOrgChart).
- Notification delivery for new reviews (H2 notification system handles this separately).

**Effort.** S (~2h)

---

### AD3 — Task-to-Session Dispatcher

**Workpackage.** As a founder who writes bets, I want tasks to automatically trigger agent sessions when they're ready for work, so that the flow from "I shaped what I want" to "agents are building it" happens without manual intervention. Humans write bets, agents decompose into tasks, tasks auto-provision sessions — no "Run" button.

**Why this matters.** The session provisioning orchestrator is production-ready (11 phases, 4 harness adapters, cost tracking). But nothing triggers it for ad-hoc tasks. Routines have a scheduler; tasks don't. When an agent decomposes a bet into tasks with `ownerAgentId`, nothing picks them up. The entire Interact phase of the wedge (Plan > Interact > Review > Repeat) is broken — agents literally cannot start working on tasks. This is the #1 gap blocking the product from being usable end-to-end.

**What exists today.** `POST /api/sessions { agentId, taskId, modelTier }` runs the full provisioning chain. Task state machine handles proposed → accepted → in_progress → done. Routine scheduler (`builtin-routines.ts`) calls `provisionSession()` for recurring work. Handoff protocol (`handoff-protocol.ts`) creates subtasks with `ownerAgentId`. LocalWorkspaceAdapter spawns isolated directories. BuiltinHarnessAdapter runs direct LLM loops. Multi-provider model gateway resolves credentials.

**What's genuinely missing.** A dispatcher service that watches for tasks ready for execution (state=accepted with ownerAgentId set, or state transitions triggered by bet commitment) and provisions sessions automatically. Also: clarity on what non-coding tasks look like — what workspace, tools, and harness configuration does a marketing or content task need versus a development task?

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- When a bet is committed and agents decompose it into tasks, sessions are automatically provisioned for tasks that have an assigned agent — no manual trigger needed.
- When an agent creates a subtask via handoff with `ownerAgentId`, the receiving agent's session is automatically provisioned.
- The dispatcher respects cost caps — if an agent, team, or factory is at capacity, tasks queue rather than fail.
- The dispatcher respects concurrency limits — agents don't exceed `maxConcurrentSessions`.
- Non-coding tasks (marketing, content, service) can be dispatched to appropriate harnesses with workspace configurations that don't assume a git repository.
- The dispatcher is observable — a founder can see queued tasks waiting for capacity.

**Validation scenarios.**
- Given a founder commits a bet, when the PM agent decomposes it into 3 tasks with assigned agents, then 3 sessions are provisioned (respecting concurrency limits).
- Given agent A hands off a subtask to agent B, when the subtask is created, then agent B's session starts automatically.
- Given an agent is at its `maxConcurrentSessions` limit, when a new task is assigned to it, then the task queues until a slot opens.
- Given a marketing team, when a content task is dispatched, then the session provisions with a workspace and harness appropriate for non-code work.

**Plan calls.** Standard architecture pass. Key design decisions: polling vs event-driven dispatch, queue data structure (in-memory vs BullMQ), non-code workspace shape, harness selection for non-technical tasks. The multi-harness positioning (Claude for code, ChatGPT for content, Gemini for marketing) should be documented as part of this work.

**Contracts / constraints.**
- Must reuse the existing `provisionSession()` orchestrator — no parallel execution path.
- Must integrate with the existing cost-cap system (C7) — dispatch is a consumer, not a bypass.
- Non-code workspaces must not require `git` or a repository path.
- The dispatcher must be idempotent — restarting it doesn't duplicate sessions for already-dispatched tasks.

**Out of scope.**
- Priority ordering of queued tasks (FIFO is fine for v1).
- Human-triggered session start (this is agent-driven, not button-driven).
- New harness adapters (existing builtin/claude-code/CLI adapters are sufficient).

**Effort.** L (~3d)

---

### AD4 — Team Creation & Onboarding Journey

**Workpackage.** As a new user installing HyperIdle, I want a guided path from "first launch" to "agents are working on my first bet," where the Chief of Staff walks me through setup conversationally — so that I understand what my team does, my agents are properly configured, and I know what to do next without reading documentation.

**Why this matters.** Today's onboarding creates 1 team with 2 hardcoded agents (builder + PM) and drops the user on an empty portfolio page. The `defaultRoster()` function exists but isn't called. 8 soul prompt templates are stored but not used during setup. The Chief of Staff agent has a UI overlay but can't actually respond to messages. Users coming from GitHub, Confluence, or a blank slate all get the same empty experience. The first 5 minutes determine whether a user stays or leaves — and right now those 5 minutes are "name + API key → blank page → now what?"

**What exists today.** SetupFlow (name + API key + optional repo path → 1 team + 2 agents). `defaultRoster(functions)` computes optimal agent roster from team functions. `AGENT_ROLE_CATALOG` with 16 roles. 8 soul templates in `factorySettings`. Hint system (6 contextual hints). CocOverlay + CocAttachButton UI for Chief of Staff. Coach thread endpoint (`/api/threads/coach`). BetCreateDialog with empty bet creation.

**What's genuinely missing.** Three things: (1) Team creation should ask "what does your team do?" and use `defaultRoster()` to seed appropriate agents instead of hardcoding builder + PM. Adding a member to a team should offer predefined role selection. (2) The Chief of Staff should be able to respond to messages — the conversational onboarding tour where CoS guides the user through their first bet. (3) Import journeys for users coming from different contexts (GitHub repos, existing docs, blank slate) to bootstrap knowledge and context.

**Depends on.**
- AD3 — Task-to-Session Dispatcher. The CoS needs to be able to run sessions to respond conversationally. The dispatcher must exist for CoS sessions to be provisioned.

**Complexity.** L

**Acceptance criteria.**
- Team creation offers a choice of team functions (development, product, design, marketing, ops, etc.) and creates agents matching the selected functions using `defaultRoster()` with appropriate soul templates.
- Adding a new member to an existing team presents the predefined agent roles from the catalog, with soul templates pre-loaded.
- The Chief of Staff can respond to human messages in the coach thread — a human types a message, the CoS processes it and replies within the same thread.
- A first-time user is guided to a first meaningful action (creating their first bet or describing what they want built) through conversation with the CoS, not a static checklist.
- The positioning messages for each user group (solo founder, small team, agency) are refined and visible in the landing/marketing materials.
- The "deliver the whole race team" promise is real — install to first agent working takes under 10 minutes.

**Validation scenarios.**
- Given a new user selects "development + marketing" as team functions, when setup completes, then the team roster includes builder, qa_engineer, growth, and product_manager agents with appropriate soul prompts.
- Given a user adds a new agent to an existing team, when they open the add dialog, then they see role options from the catalog with descriptions.
- Given a first-time user opens the CoS overlay and types "I want to build a SaaS app," when the message is sent, then the CoS responds with guidance and follow-up questions.
- Given a user with a GitHub repo, when they provide the repo path during setup, then initial knowledge is seeded from the repo context.

**Plan calls.** This workpackage needs `/concept` for the CoS-as-onboarding-guide pattern (introduces a new behavioral mode for the CoS agent). `/design` needed for the team function selector in setup flow and the refined add-member experience. Architecture pass should plan: CoS session spawning on coach thread message, team function → roster wiring, import journey flows.

**Contracts / constraints.**
- `defaultRoster()` is the source of truth for function-to-role mapping — no hardcoded role lists.
- CoS responses must be real agent sessions (not canned responses) — the quality of guidance improves as the CoS learns.
- Import flows must not require external API access (GitHub API, etc.) — they work with local filesystem context only for v1.
- Positioning messages (D6, D8) ship as part of this workpackage in the Z worktree / landing materials.

**Out of scope.**
- CoS tools for creating teams/agents programmatically (future — CoS guides, human acts).
- Agent marketplace or community templates (FUTURE-2).
- OAuth-based import from external services (v1 is local filesystem only).

**Effort.** L (~5d)

---

### AD5 — Chief of Staff System Tools

**Workpackage.** As a founder, I want the Chief of Staff to be able to create teams, add agents, shape bets, and manage routines on my behalf through conversation, so that I can say "set up a marketing team" and the CoS does it — turning the assistant from a listener into an operator.

**Why this matters.** AD4 makes the CoS conversational. This workpackage makes it capable. The CoS has facilitation tools today (route_item, score_attention, promote_knowledge, create_conflict_review) but no system-management tools. A CoS that can talk but not act is a chatbot, not an assistant. The target user experience is: founder says what they want in natural language → CoS translates to system actions → founder confirms. This is how non-technical operators (the "PM, Marketer, Ops" user group) interact with HyperIdle — they don't learn the UI, they talk to the CoS.

**What exists today.** REST endpoints for all CRUD operations: `POST /api/teams`, `POST /api/agents`, `POST /api/bets`, `POST /api/routines`, `PATCH /api/users/:id/skills/:skillId`. The skill-tools system (`packages/server/src/skill-tools/`) registers tools per role with authorization. CoS is categorized as "personal" with FACILITATOR_TOOLS. The session provisioning system can run CoS sessions.

**What's genuinely missing.** System-management skill tools that the CoS can invoke during sessions: create_team, add_agent_to_team, create_bet, create_routine, update_agent_config. These tools would call the existing REST API internally (or the service layer directly). Plus: role-based authorization so only CoS/personal agents can use management tools.

**Depends on.**
- AD4 — Team Creation & Onboarding Journey. The CoS must be conversational (able to run sessions and respond) before it can use tools.

**Complexity.** M

**Acceptance criteria.**
- The CoS can create a new team with specified functions and auto-generated agent roster through a skill tool invocable during a session.
- The CoS can add an agent to an existing team with a specified role and soul template.
- The CoS can create a bet on a specified team with a pitch description.
- The CoS can create or modify routines.
- System-management tools are restricted to personal-category agents (CoS) — team agents cannot create teams or manage other agents.
- Each management action produces a confirmation message in the coach thread with a summary of what was created.

**Validation scenarios.**
- Given a founder says "create a marketing team with growth and content agents," when the CoS session runs, then a new team exists with growth and content agents, and the coach thread shows a confirmation.
- Given a builder agent attempts to invoke `create_team`, then the tool registry rejects the call with an authorization error.
- Given the CoS creates a bet, when the founder views the Work page, then the new bet appears with the CoS as initiator.

**Plan calls.** Standard architecture pass. Key decision: tools call service layer directly vs internal HTTP calls. Role authorization boundary in the tool registry.

**Contracts / constraints.**
- Tools must call existing service-layer functions — no bypassing validation or state machines.
- Every tool invocation creates an audit trail (existing event bus pattern).
- CoS must not bypass cost caps or create unbounded resources.

**Out of scope.**
- Natural language understanding / intent parsing (the LLM handles this via tool-use, not custom NLP).
- CoS autonomy graduation (uses existing L1-L4 system).
- Multi-step workflows (CoS executes one tool per turn; multi-step flows are conversations).

**Effort.** M (~4h)

---

### AD6 — Single-User UX Polish

**Workpackage.** As a solo founder with one team and a few agents, I want the UI to feel clean and purposeful — not cluttered with multi-team features I don't use — so that every element on screen earns its space and I can focus on what matters.

**Why this matters.** The primary user (solo AI founder) has one team. Five specific UI elements add friction: team pill filters in portfolio (noise with 1 team), team sidebar list (clickable switcher to nowhere), org chart settings (meaningless solo), knowledge scope dropdown (7 options where 3 suffice), notification toggles (4 where 2 matter). Each is a small paper cut, but combined they make the product feel enterprise-heavy for its core user. The fix is conditional hiding — show these elements only when the user's factory has grown to need them.

**What exists today.** Bet/task/agent creation already auto-resolves team when `teams.length === 1` (good pattern to extend). Empty states hide filters until data exists. The UI correctly adapts in some places but not others.

**What's genuinely missing.** Consistent conditional rendering based on team count and human count across 5 surfaces: WorkPortfolio team pills, Sidebar team list, SettingsOrgChart, KnowledgeCreate scope picker, SettingsNotifications toggles.

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- With 1 team, the Work portfolio hides team filter pills — only status/verdict filters are visible.
- With 1 team, the sidebar Work section auto-navigates to the team page instead of showing a 1-item team list.
- With 1 human user, the Org Chart settings section is hidden or shows a contextual message instead of an empty edge table.
- With 1 team, the knowledge scope picker shows simplified options (Shared / Personal / contextual scopes like bet/task) instead of all 7 scope kinds.
- With a solo user, notification settings show only the 2 most relevant toggles (reviews, cost alerts).

**Validation scenarios.**
- Given a factory with 1 team, when the portfolio loads with 3 bets, then no team filter pills appear.
- Given a factory with 2 teams, when the portfolio loads, then team filter pills appear for both teams.
- Given a solo founder, when they open Settings, then the Org Chart section is not visible.

**Plan calls.** Standard architecture pass — enumerate the 5 components, define the threshold conditions, plan the conditional rendering.

**Contracts / constraints.**
- Conditional hiding must be based on runtime data (API response counts), not configuration flags.
- When a user adds a second team, the hidden elements must appear without a page reload (reactive).
- No features are removed — they're hidden until the context justifies them.

**Out of scope.**
- Redesigning the scope model itself (the 7 scope kinds remain in the database).
- Settings restructuring beyond the 5 identified friction points.

**Effort.** S (~2h)

---

### AD7 — Mobile & Responsive Access

**Workpackage.** As a founder away from my desk, I want to review agent work and unblock blocked agents from my phone's browser, so that my agents aren't stuck waiting for me to get back to my laptop.

**Why this matters.** The "3-minute morning check" — scan blockers, approve reviews, unblock agents — is the core daily rhythm. Currently it requires opening the Electron app on a laptop. Mobile access multiplies the product's value by making the review loop accessible anywhere. The server already serves the web app statically, auth works in a browser, and there's no drag-and-drop or hover-only interactions. The main blockers are CORS (only allows localhost), fixed-width sidebar layout, and no PWA capability.

**What exists today.** Server serves web app via `HYPERIDLE_STATIC_DIR` with full SPA fallback. Auth works in browser (API key or Bearer token). WebSocket works same-origin. `useViewportBreakpoint()` hook exists but is unused. Tailwind breakpoints configured. ESLint rules for touch targets (AQ-015: ≥44px) and mobile input size (AQ-005: 16px). TaskSheet already has responsive `sm:` breakpoint switching.

**What's genuinely missing.** CORS configuration for non-localhost origins. Responsive sidebar (collapse to drawer or hide at mobile breakpoints). Responsive main content areas. PWA manifest for install-to-homescreen.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A founder can open the HyperIdle web app in a mobile browser (connected to the same network as the server) and authenticate.
- The sidebar collapses to a drawer or is hidden at mobile viewport widths, giving the main content full width.
- Conversations, Work, and Knowledge views are usable at phone viewport widths (375px) — content is readable, actions are tappable.
- Touch targets meet the 44px minimum on viewports ≤1024px.
- A PWA manifest exists so the app can be installed to the home screen with an appropriate icon.
- The review flow (read review, issue verdict) works end-to-end on mobile.

**Validation scenarios.**
- Given a phone on the same network as the server, when the user opens the app URL, then the login/setup flow works and conversations load.
- Given a phone viewport (375px wide), when the sidebar is visible, then it's a dismissible drawer, not a permanent 200px column.
- Given a review thread on mobile, when the user taps a verdict button, then the verdict is recorded and the thread resolves.
- Given the app is installed as a PWA, when launched from the home screen, then it opens full-screen with the HyperIdle icon.

**Plan calls.** /design needed for the mobile navigation pattern (drawer, bottom tabs, or minimal sidebar). Architecture pass for CORS configuration, PWA manifest, and responsive breakpoint strategy.

**Contracts / constraints.**
- Mobile is a secondary form factor — desktop remains primary. No desktop regressions.
- CORS must be configurable (not hardcoded origins) — users deploy on various network topologies.
- The responsive work must use existing Tailwind infrastructure, not a CSS framework switch.
- Touch target compliance enforced by existing ESLint rules — no new linting infrastructure.

**Out of scope.**
- Native mobile app (iOS/Android).
- Offline support (PWA is online-only for v1).
- Push notifications (email/ntfy adapters exist for async notification).
- Mobile-specific features not on desktop.

**Effort.** L (~5d)

---

### AD8 — Artifact Extensibility ("GitHub for Agent Work")

**Workpackage.** As the HyperIdle team, we want to rethink the artifact type system to support an open, extensible model — so that HyperIdle becomes the place where you review any type of work produced by agents, not just code diffs. Like GitHub democratized code review, HyperIdle should democratize review of everything agents produce across development, design, marketing, sales, and operations.

**Why this matters.** Today there are 13 artifact kinds in a closed enum, with only 3 having full renderers. Adding a new kind requires changes in 4 files. The vision is hundreds of review types — GitHub-style approval for every business function. Companies don't operate purely on text. Dev produces code diffs, design produces visual comparisons, marketing produces content previews, finance produces data tables. If the artifact system can't grow, HyperIdle stays a developer tool instead of becoming the universal review platform for agent-produced work.

**What exists today.** `ARTIFACT_KINDS` closed enum (13 kinds). Discriminated union preview schema in Zod. `artifactToView.tsx` switch statement mapping 3 kinds to renderers. `WRITABLE_ARTIFACT_KINDS` local duplicate in create-artifact.ts (drift risk). Database stores `kind` as plain text (no constraint) and `preview_json` as JSONB. Block primitive system (10 kinds) exists separately.

**What's genuinely missing.** This workpackage is concept-first — it needs to answer: How do we open the kind system without losing type safety? What's the renderer plugin model? How do artifact kinds compose with the block primitive? What does the extension point look like for community contributors? The output is an architectural vision + first implementation of extensible artifact kinds, not the full "hundreds of types."

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- The artifact kind system supports adding new kinds without modifying core source files (open registration model).
- Each artifact kind defines its own preview schema and renderer — new kinds don't require changes to `artifactToView.tsx` or `artifact-preview.ts`.
- The `WRITABLE_ARTIFACT_KINDS` duplication in create-artifact.ts is eliminated — one source of truth for available kinds.
- Existing 13 artifact kinds continue to work without migration (backward compatible).
- The extensibility model is documented for community contributors — "here's how to add a new artifact kind."
- The architectural vision for "review any type of agent work" is articulated and recorded in docs, including how it positions against GitHub.

**Validation scenarios.**
- Given a community contributor wants to add a "blog_post" artifact kind, when they follow the extension docs, then the new kind works without modifying core files.
- Given an agent creates an artifact with an unrecognized kind, when the UI renders it, then a sensible fallback is shown (not a crash or empty state).
- Given the existing 13 kinds, when the system boots after the refactor, then all existing artifacts render correctly.

**Plan calls.** `/concept` needed — this reshapes the Artifact primitive (a load-bearing noun). The concept pass should answer: open enum vs registry pattern, preview schema validation strategy, renderer plugin architecture. Then standard architecture + design passes.

**Contracts / constraints.**
- Backward compatibility with existing artifacts is non-negotiable — no migrations that break stored data.
- The extension model must work at the TypeScript level (not runtime-only) — contributors get type checking.
- Renderers must be lazy-loadable — don't bundle all renderers in the main bundle.

**Out of scope.**
- Implementing hundreds of artifact kinds (this workpackage opens the system; future work fills it).
- Marketplace / distribution of community-created kinds.
- Block-to-artifact composition (separate concern in L-track).

**Effort.** M (~6h)

---

### AD9 — Autonomy Graduation Pipeline

**Workpackage.** As a founder, I want agents to earn more autonomy over time based on their track record, so that I review less as agents prove themselves — graduating from "approve everything" to "autonomous unless blocked" without manual configuration.

**Why this matters.** The policy engine works (L4+low-risk auto-resolves, high-risk always escalates). But agents are stuck at their assigned autonomy level forever because success/failure counts are never updated and no graduation logic exists. The promise of graduated autonomy — "on day one you're in every loop, by month six you're only in loops that matter" — is the core trust-building mechanism. Without it, founders either over-approve (rubber-stamping) or burn out reviewing everything.

**What exists today.** `userSkills` table with `autonomyLevel` (1-4), `successCount`, `failureCount`, `promotedAt`, `lastUsedAt` columns — all exist but `successCount`/`failureCount`/`promotedAt` are never written in production. Policy engine in `policy-engine.ts` reads `autonomyLevel` and applies rules. `PATCH /api/users/:id/skills/:skillId` endpoint exists for manual level changes with audit trail. Session outcome recording captures effectiveness scores. Verdict decisions (approve/reject/request-changes) are recorded on threads.

**What's genuinely missing.** Two things: (1) Scoring — what counts as "success" or "failure" for an agent skill? The current columns suggest binary counts, but the real signal is richer (verdicts, session outcomes, rework rates). This needs a clear definition. (2) Graduation — logic that watches an agent's track record and promotes/demotes autonomy levels based on thresholds. Both need to integrate with the existing session outcome and verdict flows.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Agent skill success/failure is tracked automatically based on session outcomes and human verdicts — no manual counting.
- The definition of "success" and "failure" for a skill is clear and documented (e.g., approve verdict = success, request-changes = partial, reject = failure).
- Autonomy levels change automatically when an agent's track record crosses defined thresholds (e.g., 10 consecutive approvals → promote from L2 to L3).
- Autonomy demotions happen automatically on repeated failures (e.g., 3 rejections → demote from L3 to L2).
- A founder can see an agent's autonomy history — when levels changed and why — in the agent profile.
- Manual autonomy overrides remain possible (existing API endpoint) and are logged in the same history.

**Validation scenarios.**
- Given an agent at L2 with 10 consecutive approved sessions, when the graduation logic runs, then the agent's autonomy is promoted to L3 and a `promotedAt` timestamp is recorded.
- Given an agent at L3 that receives 3 rejections, when the graduation logic runs, then the agent is demoted to L2.
- Given a founder views an agent's profile, when the skills section loads, then autonomy level history is visible with timestamps and reasons.
- Given a founder manually overrides an agent to L4, when the override is applied, then the history shows "manual override by [founder]."

**Plan calls.** `/concept` may be needed to define the scoring model (what signals feed into success/failure, how they weight). Standard architecture pass for the graduation service and integration with session/verdict flows.

**Contracts / constraints.**
- Graduation thresholds must be configurable via factory settings, not hardcoded.
- The scoring model must be explainable — founders should understand why an agent was promoted or demoted.
- Must integrate with the existing policy engine — graduation changes the level, the policy engine uses it.

**Out of scope.**
- Per-routine autonomy enforcement (column exists, deferred).
- UI for configuring graduation thresholds (settings API is sufficient for v1).
- Skill-specific graduation (v1 graduates at the agent level; per-skill comes later).

**Effort.** M (~6h)

---

### AD10 — Communication Refinements

**Workpackage.** As a team member (human or agent), I want communication primitives that feel natural for work coordination — @mentions to pull someone's attention, navigable thread context within conversations, and page nesting for knowledge organization — so that HyperIdle replaces Slack and Notion for my team's daily work.

**Why this matters.** The Slack/Notion replacement audit (R21) confirmed HyperIdle covers most communication patterns, but three gaps affect daily usability: (1) @mentions — implicit membership works but there's no way to pull a specific person's attention within a thread. (2) Thread navigation — threads are linked to tasks/bets/sessions but within the conversation view you can't easily navigate to the thread's context or respond to a specific sub-thread. (3) Page nesting — knowledge scoping works as a tagging system but some users expect hierarchical page organization (parent/child pages like Notion). Additionally, presence indicators (showing if a human is online or an agent is working/idle) would improve awareness.

**What exists today.** Thread system with participant management, block-anchored comments (exceeds Notion), thread pinning, thread-to-host linking (task/bet/knowledge/artifact). Message types (plain/review/verdict/questionnaire). `isBlocking()` predicate for thread-level blocking. Knowledge items with `scopeKind`/`scopeId` (flat, not nested). Agent operational status in WorkTeam AgentRow.

**What's genuinely missing.** @mention syntax/semantics fitted to the block+thread model. Thread-within-conversation navigation (seeing a conversation's thread context and responding in-place). Knowledge page nesting (parent/child relationships beyond scope tags). Presence indicators for humans and agents.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Users can @mention a specific participant in a message, and the mentioned user receives a notification even if they wouldn't normally be notified for that thread.
- @mentions work within the existing block primitive — they're a recognized inline element, not just text matching.
- Within the conversation view, a user can see the context a thread is attached to (bet, task, session) and navigate to it without losing their place.
- Knowledge items support a parent-child relationship — an item can be nested under another item, creating a browsable hierarchy within a scope.
- Agent presence is visible — whether an agent is currently in an active session (working) or idle.

**Validation scenarios.**
- Given a thread with 3 participants, when participant A @mentions participant B in a message, then participant B receives a notification.
- Given a conversation thread attached to a task, when the user views the thread, then the task context (title, status, bet) is visible and clickable.
- Given a knowledge item "Architecture" with child items "API Design" and "Data Model," when browsing Knowledge, then the hierarchy is navigable.
- Given an agent with an active session, when the team roster loads, then the agent shows a "working" indicator.

**Plan calls.** `/concept` needed for @mentions (introduces a new inline primitive within blocks) and knowledge nesting (reshapes the knowledge item model). /design needed for thread navigation within conversations and presence indicators.

**Contracts / constraints.**
- @mentions must integrate with the existing notification system (H2) — not a separate notification path.
- Knowledge nesting must not break the existing scope model — nesting is orthogonal to scoping.
- Presence must not require a persistent WebSocket from every client — derive from session state, not real-time pings.
- Human presence is deferred to a later phase (complex due to real-time sync) — this workpackage focuses on agent presence.

**Out of scope.**
- Emoji reactions (deliberate architectural choice — verdicts instead).
- Database views / multiple view modes for the same data (Notion feature, not our model).
- Knowledge templates (separate concern).
- Human presence indicators (marked for later due to real-time sync complexity).

**Effort.** M (~8h)

---

### AD11 — Cost Visibility

**Workpackage.** As a founder monitoring my AI spend, I want to see cost information at the team level on the Work screen, so that I know what each team is costing me alongside what they're producing.

**Why this matters.** Cost tracking is built and works (L17 WireMoney, per-agent/team/bet tracking, cost-cap enforcement). But after the Rail was deleted in U6, cost burn data has no UI surface. The backend `/api/rail` endpoint still computes it. Bets already show their cost. But there's no team-level cost display. For a product where cost visibility is a core value proposition, having zero cost UI is a critical gap. Founders need to see spend to make resource allocation decisions.

**What exists today.** `costActualMinor` on teams, bets, sessions, routines, agents. `/api/rail` endpoint returns `costBurnRate` with daily/weekly spend, caps, and token counts (but spend values currently return `{ minor: 0 }` pending fabric wiring). Bet cards show cost appetite. Cost-cap enforcement fires warnings and breaches via event bus. WireMoney formatting utilities in `packages/shared/src/format/`.

**What's genuinely missing.** A cost display on the WorkTeam page showing team-level spend (daily/weekly/total), cost against cap, and per-agent cost breakdown. The fabric layer needs to actually populate the cost values that the rail endpoint computes (currently returning zeros).

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- The Work team page displays the team's current cost: daily spend, weekly spend, and cost against cap.
- Each agent in the team roster shows their individual cost contribution.
- Cost values are real (populated by the fabric layer from session cost accumulation), not zeros.
- Cost is formatted using the existing WireMoney formatting utilities (currency-aware, minor-to-major conversion).

**Validation scenarios.**
- Given a team with 2 agents that have run sessions, when the team Work page loads, then the team cost section shows non-zero daily and weekly spend.
- Given a team with a cost cap of $100/day and $45 spent today, when the team Work page loads, then both the spend ($45) and cap ($100) are visible.
- Given an agent with $20 in session costs, when the team roster loads, then the agent row shows $20 cost.

**Plan calls.** Standard architecture pass. Key investigation: why does the rail endpoint return `{ minor: 0 }`? Where does `costActualMinor` on teams get populated — is it the fabric layer's `recordCostAndCheck()` or something else?

**Contracts / constraints.**
- Must use existing WireMoney formatting — no new money display patterns.
- Cost display must update in near-real-time (WebSocket push or polling) — not just on page load.
- Must not break the existing cost-cap enforcement (read-only display, not a new write path).

**Out of scope.**
- Cost forecasting ("at this rate you'll spend $X this month").
- Factory-level cost dashboard (team-level is sufficient for v1).
- Cost alerts in the UI (notification system handles this via H2).

**Effort.** S (~3h)
