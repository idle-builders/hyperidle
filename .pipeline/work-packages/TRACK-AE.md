# Track AE: Product Expansion & Polish

Expand HyperIdle's capabilities once the core loop works. These workpackages build on the fix-and-simplify work in Track AD — they add new capabilities, new form factors, and new interaction patterns.

**Prerequisite assumption:** Track AD has made the core loop functional (reviews route to humans, tasks dispatch sessions, routines fire automatically, broken promises are resolved). These workpackages extend a working product, not fix a broken one.

**Constraint:** Same as AD — no enterprise features, open source, `npm run verify` must pass.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AE1 — Purge False Knowledge & Doc Hygiene

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

### AE2 — Team Creation & Onboarding Journey

**Workpackage.** As a new user installing HyperIdle, I want a guided path from "first launch" to "agents are working on my first bet," where the Assistant walks me through setup conversationally — so that I understand what my team does, my agents are properly configured, and I know what to do next without reading documentation.

**Why this matters.** Today's onboarding creates 1 team with 2 hardcoded agents (builder + PM) and drops the user on an empty page. The `defaultRoster()` function exists but isn't called. 8 soul prompt templates are stored but not used during setup. Users coming from GitHub, Confluence, or a blank slate all get the same empty experience. The first 5 minutes determine whether a user stays or leaves — and right now those 5 minutes are "name + API key → blank page → now what?"

**What exists today.** SetupFlow (name + API key + optional repo path → 1 team + 2 agents). `defaultRoster(functions)` computes optimal agent roster from team functions. `AGENT_ROLE_CATALOG` with 16 roles. 8 soul templates in `factorySettings`. Hint system (6 contextual hints). CocOverlay + CocAttachButton UI for Assistant. Coach thread endpoint (`/api/threads/coach`). BetCreateDialog.

**What's genuinely missing.** Three things: (1) Team creation should ask "what does your team do?" and use `defaultRoster()` to seed appropriate agents. (2) The Assistant should be able to respond and guide the user through their first bet. (3) Import journeys for users coming from different contexts (GitHub repos, existing docs, blank slate).

**Depends on.**
- AD2 — Task-to-Session Dispatcher. The Assistant needs session provisioning to respond conversationally.
- AD8 — Coach / Assistant Restructure. The assistant concept must be settled before building the onboarding around it.

**Complexity.** L

**Acceptance criteria.**
- Team creation offers a choice of team functions and creates agents matching the selected functions using `defaultRoster()` with appropriate soul templates.
- Adding a new member to an existing team presents the predefined agent roles from the catalog with soul templates pre-loaded.
- The Assistant can respond to human messages in the coach thread — a human types a message, the Assistant responds.
- A first-time user is guided to a first meaningful action through conversation with the Assistant.
- Install to first agent working takes under 10 minutes.

**Validation scenarios.**
- Given a new user selects "development + marketing" as team functions, when setup completes, then the team roster includes builder, qa_engineer, growth, and product_manager agents.
- Given a first-time user opens the Assistant and types "I want to build a SaaS app," when the message is sent, then the Assistant responds with guidance.
- Given a user with a GitHub repo, when they provide the repo path during setup, then initial knowledge is seeded from the repo context.

**Plan calls.** `/concept` needed for the Assistant-as-onboarding-guide pattern. `/design` needed for the team function selector. Architecture pass for session spawning on assistant thread message.

**Contracts / constraints.**
- `defaultRoster()` is the source of truth for function-to-role mapping.
- Assistant responses must be real agent sessions, not canned responses.
- Import flows work with local filesystem only for v1.

**Out of scope.**
- Assistant tools for creating teams/agents programmatically (AE3).
- OAuth-based import from external services.

**Effort.** L (~5d)

---

### AE3 — Assistant System Tools

**Workpackage.** As a founder, I want the Assistant to create teams, add agents, shape bets, and manage routines on my behalf through conversation — turning the assistant from a listener into an operator.

**Why this matters.** AE2 makes the Assistant conversational. This makes it capable. A non-technical founder (PM, marketer, ops) interacts with HyperIdle by talking to the Assistant — they don't learn the UI, they describe what they want.

**What exists today.** REST endpoints for all CRUD operations. The skill-tools system registers tools per role with authorization. The session provisioning system can run Assistant sessions.

**What's genuinely missing.** System-management skill tools: create_team, add_agent_to_team, create_bet, create_routine, update_agent_config. Plus role-based authorization so only personal-category agents can use management tools.

**Depends on.**
- AE2 — Team Creation & Onboarding Journey. The Assistant must be conversational before it can use tools.

**Complexity.** M

**Acceptance criteria.**
- The Assistant can create a new team with specified functions and auto-generated agent roster.
- The Assistant can add an agent to an existing team with a specified role and soul template.
- The Assistant can create a bet on a specified team with a pitch description.
- The Assistant can create or modify routines.
- System-management tools are restricted to personal-category agents.
- Each management action produces a confirmation message in the thread.

**Validation scenarios.**
- Given a founder says "create a marketing team," when the Assistant session runs, then a new team exists with marketing agents.
- Given a builder agent attempts to invoke `create_team`, then the tool registry rejects it.

**Plan calls.** Standard architecture pass. Key decision: tools call service layer directly vs internal HTTP.

**Contracts / constraints.**
- Tools must call existing service-layer functions — no bypassing validation.
- Every tool invocation creates an audit trail.

**Out of scope.**
- Natural language understanding (the LLM handles this via tool-use).
- Multi-step workflows (one tool per turn; multi-step = conversation).

**Effort.** M (~4h)

---

### AE4 — Mobile & Responsive Access

**Workpackage.** As a founder away from my desk, I want to review agent work and unblock blocked agents from my phone's browser — so that my agents aren't stuck waiting for me.

**Why this matters.** The "3-minute morning check" (scan blockers, approve reviews, unblock agents) requires a laptop. Mobile access multiplies value by making the review loop accessible anywhere. The server already serves the web app statically, auth works in a browser, no drag-and-drop or hover-only interactions.

**What exists today.** Server serves web app via `HYPERIDLE_STATIC_DIR`. Auth works in browser. `useViewportBreakpoint()` hook exists but unused. Tailwind breakpoints configured. ESLint rules for touch targets.

**What's genuinely missing.** CORS for non-localhost. Responsive sidebar (collapse to drawer). Responsive content areas. PWA manifest.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A founder can open the web app in a mobile browser and authenticate.
- The sidebar collapses at mobile viewport widths.
- Conversations, Work, and Knowledge views are usable at 375px width.
- Touch targets meet 44px minimum.
- PWA manifest enables install-to-homescreen.
- The review flow works end-to-end on mobile.

**Validation scenarios.**
- Given a phone viewport, when the sidebar is visible, then it's a dismissible drawer.
- Given a review thread on mobile, when the user taps a verdict button, then the verdict is recorded.

**Plan calls.** /design for mobile navigation pattern. Architecture pass for CORS and PWA.

**Contracts / constraints.**
- Desktop remains primary — no desktop regressions.
- CORS must be configurable.
- Use existing Tailwind infrastructure.

**Out of scope.**
- Native mobile app. Offline support. Push notifications.

**Effort.** L (~5d)

---

### AE5 — Communication Refinements

**Workpackage.** As a team member (human or agent), I want @mentions to pull attention, navigable thread context within conversations, and agent presence indicators — so that HyperIdle replaces Slack for daily work coordination.

**Why this matters.** Three gaps affect daily usability: (1) @mentions — no way to pull a specific person's attention within a thread. (2) Thread navigation — within conversations you can't easily navigate to the thread's context (bet, task, session). (3) Presence — no indicator of whether an agent is currently working or idle.

**What exists today.** Thread system with participant management, block-anchored comments, thread pinning, thread-to-host linking. Agent operational status in WorkTeam AgentRow.

**What's genuinely missing.** @mention syntax fitted to the block+thread model. Thread-within-conversation navigation. Agent presence indicators.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Users can @mention a specific participant, and the mentioned user receives a notification.
- @mentions are a recognized inline element within the block primitive.
- Within conversations, a user can see and navigate to the thread's host context (bet, task, session).
- Agent presence is visible — whether currently in an active session or idle.

**Validation scenarios.**
- Given participant A @mentions participant B, then B receives a notification.
- Given a thread attached to a task, when viewing the thread, then the task context is visible and clickable.

**Plan calls.** `/concept` for @mentions (new inline primitive within blocks). /design for thread navigation and presence indicators.

**Contracts / constraints.**
- @mentions integrate with existing notification system.
- Presence derives from session state, not real-time pings.
- Human presence deferred.

**Out of scope.**
- Emoji reactions. Page nesting for knowledge. Human presence indicators.

**Effort.** M (~8h)

---

### AE6 — Artifact Extensibility

**Workpackage.** As the HyperIdle team, we want to rethink the artifact type system to support an open, extensible model — so that HyperIdle becomes the place where you review any type of work produced by agents, not just code diffs.

**Why this matters.** Today there are 13 artifact kinds in a closed enum, with only 3 having renderers. Adding a new kind requires changes in 4 files. The vision is extensible review for every business function: dev produces code diffs, design produces visual comparisons, marketing produces content previews.

**What exists today.** `ARTIFACT_KINDS` closed enum (13 kinds). 3 renderers mapped. Database stores `kind` as plain text. Block primitive system exists separately.

**What's genuinely missing.** An open registration model for artifact kinds with per-kind preview schemas and renderers.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- New artifact kinds can be added without modifying core source files.
- Each kind defines its own preview schema and renderer.
- Existing 13 kinds continue to work.
- The extensibility model is documented for contributors.

**Validation scenarios.**
- Given a contributor adds a "blog_post" kind, then it works without modifying core files.
- Given an unrecognized kind, then a sensible fallback renders.

**Plan calls.** `/concept` needed — reshapes the Artifact primitive. Then standard architecture + design.

**Contracts / constraints.**
- Backward compatibility non-negotiable.
- Extension model must work at TypeScript level.
- Renderers must be lazy-loadable.

**Out of scope.**
- Implementing many kinds. Marketplace.

**Effort.** M (~6h)
