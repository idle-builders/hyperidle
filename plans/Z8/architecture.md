# Z8 Architecture Plan: Feature Polish & Launch Readiness Audit

## 1. What This Workpackage Produces

A single markdown document at `docs/product/launch-readiness-audit.md` containing:
- A complete feature inventory with per-feature categorizations
- A Quick Wins section (top 10 polish items, 1-2 days each)
- A Hidden Gems section with surfacing recommendations
- Honest, evidence-based assessments with UI paths and screenshots

No code is written. No tests are written. The deliverable is a document.

## 2. Audit Methodology

### 2.1 Feature Discovery — Three Passes

**Pass 1: Static inventory from code.** The builder reads the codebase to enumerate every user-facing feature. Sources, in order:

| Source | What it reveals |
|---|---|
| `packages/web/src/router.tsx` | Every navigable route (13 routes + 2 legacy redirects + 2 dev-only) |
| `packages/web/src/settings/settings-types.ts` | Settings sections: profile, orgchart, models, appearance, credentials, notifications, teams, backend, worker, agents |
| `packages/web/src/shell/Sidebar.tsx` | Navigation structure and what surfaces in the sidebar |
| `packages/web/src/pages/*.tsx` | Page-level features: Conversations, WorkPortfolio, WorkTeam, WorkBet, WorkTask, KnowledgeList, KnowledgeCreate, KnowledgeDetail, SetupFlow, ArtifactPermalink, NotFound |
| `packages/web/src/components/*.tsx` | Cross-cutting features: GlobalSearchPanel, CurationSuggestionCard, SessionActivityPanel, RecipientPicker, BlockRefEmbed, ArtifactSection, ArtifactThreadsSummary, ReasoningBlockView, CocOverlay, ThreadSections, CredentialsTab, KnowledgeTopicGroup |
| `packages/web/src/hooks/*.ts(x)` | Feature hooks: useCommandK (Cmd+K search), useHints (first-time hints), useAutoSave, useBlockResolution, useCocThread, useSessionActivity, useGlobalSearch, useKeyboardNavigation, useTheme, useViewportBreakpoint |
| `packages/web/src/shell/*.tsx` | Shell features: Sidebar, CocOverlay, TaskSheet, HostThreadSection, ArtifactView, ToastRegion |
| `packages/server/src/routes/*.ts` | API features not necessarily surfaced in UI: coach, git-export, mcp-route, model-gateway, observability, notifications, routines, workers, worker-ws, status |
| `packages/server/src/harness/*.ts` | Agent harness adapters: builtin, cli, claude-agent-sdk, isolated, remote, docker-workspace, local-workspace |
| `packages/server/src/skill-tools/*.ts` | Agent skill-tools: create-artifact, create-item, send-message, promote-knowledge, query-practice, etc. |
| `packages/server/src/services/*.ts` | Backend services: model-gateway, session-provisioning, credential-encryption, org-routing, handoff-protocol, bet/task state machines, etc. |
| `packages/fabric/src/*.ts` | Knowledge fabric: attention-scoring, promotion-pipeline, materialization, conflict-resolution, relevance-engine, prompt-composition, writeback |
| `packages/db/src/schema.ts` | All data entities: teams, users, teamMembers, bets, tasks, sessions, routines, threads, messages, items, userSkills, orgEdges, factorySettings, knowledgeItems, knowledgeEditLog, knowledgeAccessLog, knowledgeConflicts, knowledgeStrategyFabric, taskStrategyFabric, notificationQueue, propagationLog, artifacts, serverCredentials, serverConfig, hintProgress, loginSessions, inviteCodes |
| `packages/design-system/src/*.tsx` | Design system primitives and their state coverage |

This produces a raw feature list of ~60-80 features.

**Pass 2: Live application walkthrough.** The builder starts the app (`npm run dev`) and navigates every route and settings section. For each feature:
- Navigate to it
- Take a screenshot (Playwright or manual)
- Note: does it load? Does it show data? Is the empty state handled? Is the error state handled?
- Record the exact UI path (e.g., "Sidebar > Knowledge > click item > Edit button")

**Pass 3: Test coverage mapping.** For each feature, check whether tests exist:
- Unit tests in `packages/web/src/__tests__/`
- Component tests in `packages/web/src/pages/__tests__/` and `packages/web/src/components/__tests__/`
- E2E tests in `packages/web/e2e/`
- Server route tests in `packages/server/src/routes/__tests__/`
- Server service tests in `packages/server/src/__tests__/`
- Fabric tests in `packages/fabric/src/__tests__/`

A feature with zero relevant test files across all layers cannot be "launch-ready."

### 2.2 Feature Grouping

Features are grouped by view/area for the audit document:

1. **Conversations View** — thread list, thread detail, filters (all/blocking/async), direct messages, recipient picker, coach thread, message composition, rich messages, reasoning blocks, block references, CoC overlay
2. **Work View** — portfolio (bet grid), team drill-down, bet detail (description, tasks, cost, tokens, artifacts, threads, actions), task detail (task sheet, sessions, threads), bet creation dialog, lifecycle propagation
3. **Knowledge View** — knowledge list (scope pills, topic groups, search, triage badge), knowledge detail (metadata, body, edit, threads, block anchored comments, block popover, share block, scope change), knowledge create, curation suggestion cards
4. **Navigation & Shell** — sidebar (sections, sub-items, badge counts), settings overlay, global search (Cmd+K), first-run redirect, setup flow, theme switching, toast notifications, error boundary, 404 page, keyboard navigation
5. **Settings** — profile, org chart, models, appearance, credentials, notifications, teams, backend, worker (shared-mode only), agents (X3)
6. **Artifacts** — artifact section on bets, artifact permalink, artifact preview, artifact cost chip, artifact gallery card, artifact thread summary, artifact view
7. **Agent Runtime** (backend-only, no direct UI) — session provisioning, harness adapters, skill-tools, model gateway, MCP bridge, worker WebSocket, routines/scheduler
8. **Infrastructure** (backend-only) — authentication (S1), notification dispatch, observability, git export, health endpoint, lifecycle propagation engine, dependency watcher

### 2.3 Feature Scope Boundary

**In scope:** Every feature that a user or agent interacts with through the UI or API. This includes backend features that have API routes, even if no UI exists yet (they still need to work for API consumers and agent tooling).

**Out of scope:** Internal implementation details (e.g., the debounce utility, the TOON codec internals, the event bus wiring). These are building blocks, not features.

## 3. Categorization Rubric

Each feature is rated into exactly one category:

### Launch-Ready
ALL of these must be true:
- The feature is navigable from the UI (or, for API-only features, callable via documented endpoints)
- The feature handles populated, empty, loading, and error states visibly and gracefully
- The feature has meaningful test coverage (at least one of: unit test, component test, E2E test covering its primary user flow)
- The feature is discoverable without documentation (reachable within 2 clicks from the sidebar, or surfaced by onboarding hints)
- The feature works with real data (not just mock fixtures)

### Built But Rough
The feature works but fails at least one "launch-ready" criterion:
- Missing empty/error states
- No test coverage
- Relies on hardcoded mock data that should come from the API
- UI works but is visually rough (alignment, spacing, missing labels)
- Feature works but the interaction is awkward (too many clicks, no keyboard shortcuts where expected)
- Works with seed data but breaks with empty DB

### Hidden Gem
The feature is powerful and functional but fails discoverability:
- Not reachable from the sidebar navigation
- Only accessible via URL, keyboard shortcut, or API
- No contextual entry point (e.g., no "Create bet" button visible when looking at a team with no bets)
- The user would not know it exists without reading documentation or source code

### Incomplete
The feature has scaffolding but is not functional end-to-end:
- Routes exist but the page is a stub
- API endpoints exist but the UI does not call them
- Schema exists but no read/write path from the UI
- Feature started but abandoned mid-implementation

## 4. Per-Feature Entry Format

Each entry in the audit document uses this structure:

```markdown
### [Feature Name]

**Category:** Launch-Ready | Built But Rough | Hidden Gem | Incomplete
**UI Path:** Sidebar > Section > Action (or "API-only: GET /api/...")
**Discoverability:** [1-5 scale] 1=invisible, 5=obvious
**Test Coverage:** [list relevant test files or "None"]

**What works:** [Honest description of current state]
**What's rough:** [Specific issues, not "needs polish"]
**Recommendation:** [Concrete action — "Add empty state CTA with text '...'" not "needs better UX"]
```

## 5. Document Structure

```
docs/product/launch-readiness-audit.md
├── Header (date, commit SHA, methodology summary)
├── Executive Summary (counts per category, overall readiness score)
├── Quick Wins (top 10 highest-impact items — each with name, effort, impact, specific fix)
├── Hidden Gems (powerful features that need surfacing — each with name, value, recommendation)
├── Feature Inventory by Area
│   ├── Conversations View
│   ├── Work View
│   ├── Knowledge View
│   ├── Navigation & Shell
│   ├── Settings
│   ├── Artifacts
│   ├── Agent Runtime (API-only)
│   └── Infrastructure (API-only)
└── Appendix: Test Coverage Matrix (feature vs test file mapping)
```

## 6. Evidence Gathering

### 6.1 Running the Application

The builder must:
1. Run `npm run dev` in the Z8 worktree
2. Navigate to `http://localhost:5173`
3. Complete the setup flow if needed (or verify seed data loads)
4. Systematically visit every route listed in the router
5. Open every settings section
6. Try every interactive element (create, edit, delete, filter, search, keyboard nav)

### 6.2 Screenshots

For each feature area, the builder takes a Playwright screenshot as evidence. These go into `plans/Z8/screenshots/` (not into the audit document itself — the document references UI paths, not embedded images).

Screenshot checklist:
- [ ] Conversations list (populated)
- [ ] Conversations list (empty)
- [ ] Thread detail with messages
- [ ] Thread detail with reasoning blocks
- [ ] Work portfolio
- [ ] Team drill-down
- [ ] Bet detail (populated with tasks, artifacts, threads)
- [ ] Task sheet
- [ ] Knowledge list (with topic groups)
- [ ] Knowledge detail (view mode)
- [ ] Knowledge detail (edit mode)
- [ ] Knowledge create dialog
- [ ] Settings overlay (each section)
- [ ] Global search panel
- [ ] Setup flow
- [ ] CoC overlay
- [ ] Artifact permalink
- [ ] 404 page
- [ ] Error states (simulate by navigating to invalid IDs)
- [ ] Empty states (for each view)

### 6.3 Test Coverage Verification

For each feature, the builder runs:
```bash
# Check for relevant test files
find packages -path "*__tests__*" -name "*.test.*" | grep -i "<feature-keyword>"
# Check E2E coverage
find packages/web/e2e -name "*.spec.ts" | grep -i "<feature-keyword>"
```

A feature's test coverage is "sufficient" if at least one test file exists that exercises its primary user flow. Coverage depth is not assessed — existence is the bar for "launch-ready."

## 7. Known Feature Inventory (Pre-Audit)

Based on static code analysis, here is the expected feature list. The builder verifies each against the running application.

### 7.1 Conversations (8 features)
- Thread list with sections (All/Blocking/Async filter)
- Thread detail / message view
- Message composition (Composer)
- Direct message creation (RecipientPicker)
- Rich message rendering (RichMessageCard, markdown)
- Reasoning block view
- Coach thread (L21)
- CoC overlay (Chain of Custody — context attachment)

### 7.2 Work (10 features)
- Portfolio / bet grid view
- Team drill-down page
- Bet detail page (description, metadata, status)
- Bet description editing (inline, autosave)
- Bet creation dialog
- Bet actions (complete, kill, etc. — L14)
- Task list on bet
- Task detail / TaskSheet (session info, threads)
- Cost & token tracking display (L17)
- Lifecycle propagation (auto-cascade session->task->bet status)

### 7.3 Knowledge (9 features)
- Knowledge list with scope pills
- Knowledge list with topic groups
- Knowledge search/filter
- Knowledge triage badge (Y4)
- Knowledge detail (metadata, body, status)
- Knowledge body editing (L23, TipTap BodyEditor)
- Knowledge create dialog (Q2)
- Knowledge scope change dialog
- Curation suggestion cards

### 7.4 Artifacts (5 features)
- Artifact section on bet detail
- Artifact permalink page
- Artifact preview/gallery
- Artifact cost chip
- Artifact thread summary

### 7.5 Threads & Blocks (6 features)
- Host thread section (threaded discussion on any entity)
- Block anchored comments (T5)
- Block reference embed (T4)
- Block actions popover (share, discuss)
- Thread host banner
- Thread resolution (resolve/unresolve)

### 7.6 Navigation & Shell (9 features)
- Sidebar navigation (3 views + sub-items)
- Global search (Cmd+K)
- Setup flow / first-run
- First-run redirect
- Settings overlay
- Theme switching (light/dark/system)
- Keyboard navigation (J/K, arrows)
- Toast notifications
- Error boundary + 404 page

### 7.7 Settings (10 sections)
- Profile
- Org chart
- Models (X4)
- Appearance (theme)
- Credentials
- Notifications
- Teams
- Backend
- Worker (shared-mode only)
- Agents (X3)

### 7.8 Agent Runtime — API-only (8 features)
- Session provisioning
- Harness adapter pool (builtin, CLI, Claude SDK, isolated, remote)
- Skill-tool registry (18 tools)
- Model gateway (X4)
- MCP bridge
- Worker WebSocket protocol
- Routine scheduler
- Handoff protocol

### 7.9 Infrastructure — API-only (7 features)
- Authentication (S1 — login, invite codes, bearer tokens)
- Notification dispatch (H2 — ntfy, SMTP, console adapters)
- Observability (traces, spans, audit)
- Git export
- Health endpoint
- Lifecycle propagation engine (L20)
- Dependency watcher

**Total pre-audit: ~72 features**

## 8. Ordered Tasks

The builder executes these tasks in sequence:

### Task 1: Static Feature Inventory (est. 1h)
1. Read `router.tsx`, enumerate all routes
2. Read `settings-types.ts`, enumerate all settings sections
3. Read all page components (`pages/*.tsx`), note which features each exposes
4. Read all shell components (`shell/*.tsx`), note features
5. Read all API route files (`routes/*.ts`), note endpoints and whether they have UI consumers
6. Read the design system component list, note which are used in the app
7. Produce a raw feature list in a working scratch document

### Task 2: Test Coverage Mapping (est. 30m)
1. For each feature in the inventory, search for relevant test files across:
   - `packages/web/src/__tests__/`
   - `packages/web/src/pages/__tests__/`
   - `packages/web/src/components/__tests__/`
   - `packages/web/src/shell/__tests__/`
   - `packages/web/src/hooks/__tests__/`
   - `packages/web/src/settings/__tests__/`
   - `packages/web/e2e/`
   - `packages/server/src/__tests__/`
   - `packages/server/src/routes/__tests__/`
   - `packages/server/src/services/__tests__/`
   - `packages/server/src/harness/__tests__/`
   - `packages/server/src/skill-tools/__tests__/`
   - `packages/fabric/src/__tests__/`
   - `packages/shared/src/__tests__/`
   - `packages/db/src/__tests__/`
2. Record test file names next to each feature
3. Flag features with zero test coverage

### Task 3: Live Application Walkthrough (est. 2h)
1. Start the app with `npm run dev`
2. Run seed/migration if needed
3. Complete the setup flow
4. Navigate every route systematically:
   - `/` (first-run redirect behavior)
   - `/conversations` (empty state, populated state)
   - `/conversations/:threadId` (thread detail)
   - `/work/portfolio` (empty, populated)
   - `/work/team/:teamId` (team drill-down)
   - `/work/bet/:betId` (bet detail — all sections)
   - `/work/bet/:betId/task/:taskId` (task detail)
   - `/knowledge` (list, filters, topic groups, search)
   - `/knowledge/new` (create flow)
   - `/knowledge/:id` (detail, edit, threads)
   - `/artifacts/:id` (permalink)
   - `/settings` (redirect behavior)
   - Settings overlay (each section)
   - Cmd+K (global search)
5. For each feature, note:
   - Does it load without errors?
   - Is the empty state handled?
   - Is the error state handled (try invalid IDs)?
   - Is the loading state visible?
   - Are interactive elements discoverable?
   - Does it work with keyboard?
6. Take Playwright screenshots for evidence

### Task 4: Categorize Every Feature (est. 1h)
1. Apply the rubric from Section 3 to each feature
2. For each "built but rough" entry, write specific issues
3. For each "hidden gem" entry, explain why it is hidden and how to surface it
4. For each "incomplete" entry, describe what exists and what is missing
5. Be honest — no rounding up

### Task 5: Identify Quick Wins (est. 30m)
1. From the "built but rough" and "hidden gem" lists, rank by:
   - Impact: how much does fixing this improve the first impression? (1-5)
   - Effort: how many days to fix? (must be <= 2 days)
   - Severity: how bad does the rough state look? (1-5)
2. Select the top 10 by (Impact * Severity) / Effort
3. For each, write a concrete recommendation that a developer can execute without further investigation

### Task 6: Write the Audit Document (est. 1.5h)
1. Create `docs/product/launch-readiness-audit.md`
2. Write the executive summary with counts
3. Write the Quick Wins section
4. Write the Hidden Gems section
5. Write the full feature inventory with per-feature entries
6. Write the test coverage appendix
7. Include the commit SHA and date in the header

### Task 7: Self-Review (est. 30m)
1. Verify every implemented feature appears in the inventory (cross-check against router, settings, routes)
2. Verify each entry has: name, UI path, discoverability, what's rough, recommendation
3. Verify Quick Wins has exactly 10 items, each fixable in 1-2 days
4. Verify Hidden Gems has surfacing recommendations
5. Verify "launch-ready" entries all have test coverage
6. Verify the document is honest (no euphemisms for broken features)

## 9. Verification

Since this workpackage produces a document (not code), verification is structural:

| AC | Verification Method |
|---|---|
| Every implemented feature is categorized | Cross-check feature inventory against router.tsx routes (13), settings sections (10), and API routes (31). Any route/section not in the inventory is a gap. |
| Each entry includes: name, UI path, discoverability, what's rough, recommendation | Grep the output document for the entry format. Every `###` heading must have all five fields. |
| Quick Wins: 10 highest-impact items, 1-2 days each | Count entries in the Quick Wins section. Each must have effort estimate. |
| Hidden Gems with surfacing recommendations | Every Hidden Gem entry must have a "Recommendation" field describing how to make it discoverable. |
| Audit performed by actually using the running app | The document header includes the commit SHA and screenshots exist in `plans/Z8/screenshots/`. |
| "Launch-ready" requires test coverage | Every "Launch-Ready" entry must list at least one test file. |

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Seed data is stale or missing, making features look broken when they work | Run `npm run db:migrate` and `npm run db:seed` (if available). If seed is missing, note "untestable without seed" and categorize as "built but rough." |
| Some features require API keys to function (model gateway, external services) | Categorize API-key-dependent features separately. Note the dependency. Do not mark as "incomplete" if the code path exists but needs credentials. |
| Feature count is larger than expected | Do not shortcut. Every feature gets an entry. Group small features (e.g., all artifact sub-components under "Artifacts") but still assess each. |
| Builder runs out of time on the walkthrough | Prioritize UI-visible features over API-only features. API-only features can be assessed from code + test coverage without a live walkthrough. |

## 11. File Outputs

| File | Content |
|---|---|
| `docs/product/launch-readiness-audit.md` | The audit document (primary deliverable) |
| `plans/Z8/screenshots/` | Playwright or manual screenshots as evidence (not committed to main — evidence only) |

## 12. What the Builder Should NOT Do

- Do not write any application code
- Do not fix any bugs found during the audit (document them as recommendations)
- Do not add tests (document missing coverage as findings)
- Do not modify any existing files except creating the audit document
- Do not run `npm run verify` (no code changes to verify)
- Do not create a PR (the pipeline handles that)
