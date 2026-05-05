# Hardcoded Data Inventory

**Intent:** This document lists every hardcoded data source consumed at RUNTIME in the HyperIdle web package and supporting packages. Each row records the source location, shape, runtime consumer, the real API/DB source it should fetch from, and the proposed owner story for replacement.

**How to read:** Group sections by area (Conversations, Work, Knowledge, Shell, Cross-cutting). Within each section, rows are sorted by file path and line number. The "Owner story" column maps to the L-track task that owns removing that fixture. "Unassigned" rows are picked up by L29.

**Important distinction:** This inventory captures hardcoded data used at RUNTIME in pages, components, and runtime libraries. Test files, story (`.stories.tsx`) files, and dedicated fixture directories (`packages/web/src/fixtures/`) are ALLOWED to contain fixtures. The rows below are the FORBIDDEN runtime uses — data embedded in production code paths that should come from the API or database instead.

---

## Conversations

| Path:Line | Shape | Consumer | Real source | Owner story | Notes |
|-----------|-------|----------|-------------|-------------|-------|
| `/workspace/.worktrees/L6/packages/web/src/pages/ConversationsChat.tsx:14-32` | `MockThread[]` with mock messages and artifact kinds | ConversationsChat page renders hardcoded thread list; users see placeholder threads not real reviews | `/api/threads` or thread list endpoint (L1 work) | L7 | Known suspect: MOCK_THREADS has 2 test threads with mock MessageArtifactPreview kinds (text_diff, content_preview, etc.). AC: Chat page must fetch real threads from server. |
| `/workspace/.worktrees/L6/packages/web/src/layouts/AppShell.tsx:40-41` | `count: 3` and `count: 1` hardcoded review/chat counts | Submenu displays static "Review Queue (3)" and "Chat (1)" badges regardless of actual thread count | `/api/threads?view=review&view=chat` or similar grouped count endpoints | L8 | Known suspect from spec. Hardcoded counts in SUBMENU_CONFIG.conversations.items. L8 AC: render actual thread list from store, derive counts from fetched data. |
| `/workspace/.worktrees/L6/packages/web/src/layouts/AppShell.tsx:53` | `count: 12` hardcoded knowledge items count | Submenu displays static "All Items (12)" badge regardless of actual item count | `/api/knowledge/count?scope=practice` or similar | L8 | Hardcoded in SUBMENU_CONFIG.knowledge.items[0].count. |
| `/workspace/.worktrees/L6/packages/web/src/layouts/AppShell.tsx:64-75` | `SUBMENU_FILTERS` with hardcoded filter chip options: `[all, needs-review, chats, resolved]` for Conversations | Filter chips in Submenu are static options; filter state is local and does not drive actual list filtering | Database/server defines allowed filter dimensions per view | L10 | AC L6 spec cites: "filter unused" and per-kind unused filter state. Filter chips exist but data pages ignore them (AC 64: local state only). L10 owns wiring actual filter behavior to list queries. |

## Work

| Path:Line | Shape | Consumer | Real source | Owner story | Notes |
|-----------|-------|----------|-------------|-------------|-------|
| `/workspace/.worktrees/L6/packages/web/src/pages/WorkBet.tsx:49-142` | `MOCK_BETS` record with 2 bet details (b1, b2); each has tasks, comments, appetite strings | WorkBet page reads bet.id from URL params and looks up in MOCK_BETS; falls back to FALLBACK_BET if not found | `/api/bets/:betId` endpoint (L11 work) | L12 | Known suspect: MOCK_BETS[b1] and MOCK_BETS[b2] with hardcoded appetite ("2 weeks", "3 weeks"), mock tasks (3-5 per bet), mock comments (0-2 per bet). FALLBACK_BET at line 144 is empty fallback (id="unknown"). |
| `/workspace/.worktrees/L6/packages/web/src/pages/WorkBet.tsx:144-155` | `FALLBACK_BET` with all empty/placeholder fields | WorkBet renders "Unknown Bet" when URL param betId doesn't match any MOCK_BETS key | Real fallback handling after fetching `/api/bets/:betId` should 404; no local fallback needed | L12 | Fallback shows "Unknown", "Unknown Team", appetite="—", empty tasks/comments. |
| `/workspace/.worktrees/L6/packages/web/src/pages/WorkBet.tsx:24-28, 92-103` | Task cost strings (`"$4.20"`, `"$1.80"`, `"$6.50"`) and comment data in MOCK_BETS | BetCard and task table render hardcoded cost values; comments section shows mock author/body pairs | `/api/bets/:betId/tasks` (cost from task cost tracking) and `/api/bets/:betId/comments` (or comments as part of bet detail) | L14/L17 | Cost strings are hardcoded per-task in the MOCK_BETS fixture; should come from cost-tracking service (L17 owns cost string formatting). Comment fixtures (author, body) are hardcoded in MOCK_BETS.comments array. |
| `/workspace/.worktrees/L6/packages/web/src/pages/WorkTeam.tsx:14-30` | `CANVAS_BETS` array with 2 bets; each has appetite, status, progress | WorkTeam page mounts Canvas component with hardcoded bets | `/api/bets?team=:teamId` endpoint | L12 | CANVAS_BETS is page-level const with appetite ("2 weeks", "3 weeks"), status ("committed", "shaped"), progress (done/total). |
| `/workspace/.worktrees/L6/packages/web/src/pages/WorkTeam.tsx:32-73` | `INITIAL_TASKS` array with 5 hardcoded kanban tasks; each has owner, cost, betTag, state | WorkTeam useState initializes with INITIAL_TASKS; drag handlers mutate local state only | `/api/tasks?team=:teamId` endpoint | L15 | INITIAL_TASKS holds cost strings, owner names, state values (accepted, in_progress, done, review). Drag-to-column is a no-op (handler logs intent but does not persist). L15 owns wiring drag-to-column to real task-state-change API. |
| `/workspace/.worktrees/L6/packages/web/src/pages/WorkTeam.tsx:75-109` | `MOCK_PITCHES` array with 3 pitch-selector pitches; each has hypothesis, problem, solution, rabbit holes | PitchSelector overlay mounts with hardcoded pitches | `/api/pitches?team=:teamId` or `/api/pitches/shaped` endpoint | L12 | MOCK_PITCHES holds shaped bets awaiting canvas placement. Pitches have appetite ("2 weeks", "1 week", "3 weeks"), status, free-form text fields. |
| `/workspace/.worktrees/L6/packages/web/src/pages/WorkPortfolio.tsx:131-138` | `MOCK_CYCLE` with `label: "Cycle 12"`, `daysRemaining: 9` | WorkPortfolio page renders cycle-management stripe with static cycle name and day count | `/api/process/current-cycle` or similar (Process Layer endpoint) | L17 | MOCK_CYCLE is const-exported from portfolio-data.ts. Static cycle name and hardcoded days remaining. |
| `/workspace/.worktrees/L6/packages/web/src/fixtures/portfolio-data.ts:23-64` | `MOCK_PRODUCTS` array with 4 products; each has status, activeBets count, shipRate, lead avatar, shipped count, progress | WorkPortfolio page renders product cards from MOCK_PRODUCTS; components/GlobalSearchPanel references work items | `/api/products` endpoint | L12 | MOCK_PRODUCTS are imported into WorkPortfolio.tsx. Each product has hardcoded counts (activeBets: 1-4, shipped: 2-12) and shipRate strings ("78%", "62%", "—", "84%"). Progress (done/total) is hardcoded per product. |

## Knowledge

| Path:Line | Shape | Consumer | Real source | Owner story | Notes |
|-----------|-------|----------|-------------|-------------|-------|
| `/workspace/.worktrees/L6/packages/web/src/pages/KnowledgeDetail.tsx:64-121` | `LEGACY_DETAILS` record with k1/k2 items; each has content, observationLog array, relatedItems list | KnowledgeDetail page looks up knowledgeId in LEGACY_DETAILS first, then in MOCK_KNOWLEDGE_ITEMS; renders fetched data | `/api/knowledge/:id` endpoint | L23 | LEGACY_DETAILS["k1"] and ["k2"] are hardcoded items with legacy layer/kind values ("company"/"belief", "product"/"fact") and observation logs (3 entries each). Pre-J7 test dependency. |
| `/workspace/.worktrees/L6/packages/web/src/pages/KnowledgeDetail.tsx:118-121` | `LEGACY_SOURCES` map with source attribution strings per knowledge id | KnowledgeDetail metadata bar renders source under header | `/api/knowledge/:id` endpoint should include `source` field | L23 | Maps k1 → "Architecture review session, Architect Agent", k2 → "API design document, Developer Agent". |
| `/workspace/.worktrees/L6/packages/web/src/pages/KnowledgeDetail.tsx:123-131` | `FALLBACK_DETAIL` with all unknown/empty fields | KnowledgeDetail renders "Unknown Knowledge Item" when knowledgeId doesn't match any record | Real 404 handling after API fetch; no local fallback needed | L23 | Fallback placeholder for missing items. |
| `/workspace/.worktrees/L6/packages/web/src/fixtures/knowledge-data.ts:101-381` | `MOCK_KNOWLEDGE_ITEMS` array with 15+ knowledge items; each has attentionScore, whyNow reason, status, confidence, observationLog, relatedItems | KnowledgeList page filters/sorts by scope and status; KnowledgeDetail looks up by id; Triage tab renders by attention score | `/api/knowledge/items?scope=:scope` endpoint (server computes attention score and whyNow reason) | L22/L23 | Major fixture: 15 items across 3 scopes (practice, product, factory). Each carries hardcoded attentionScore (10-92), whyNow reason strings (max 60 chars), observationLog entries (agent-attributed), relatedItems lists, originAgent, confidence scores. Marked with @lore: "Attention score and whyNow come from API in production; these are representative fixtures." |
| `/workspace/.worktrees/L6/packages/web/src/fixtures/knowledge-data.ts:383-408` | `MOCK_CURATION_SUGGESTIONS` array with 3 curation cards | KnowledgeList filters suggestions by scope; CurationSuggestionCard renders hardcoded action/detail pairs | `/api/knowledge/curation-suggestions?scope=:scope` endpoint | unassigned | 3 cards: "Merge these 3 items?", "Review layer boundaries", "Archive stale batch". Free-form action/detail text. |
| `/workspace/.worktrees/L6/packages/web/src/pages/KnowledgeList.tsx:68-95` | Filter over `MOCK_KNOWLEDGE_ITEMS` by scope; sort by attentionScore descending for Triage tab | KnowledgeList renders filtered/sorted list depending on active tab (triage/curated) | Server filters/sorts; client receives pre-sorted list from `/api/knowledge/items?scope=:scope` | L22/L23 | No new hardcoded data here; logic is driven by fixture data above. Triage default: "show Triage when any items have status === needs_human". |
| `/workspace/.worktrees/L6/packages/web/src/pages/KnowledgeDetail.tsx:200-300+` | `<pre>` fallback for knowledge body (no markdown parser) | KnowledgeDetail renders content in a `<pre>` tag with whitespace preserved | Rich markdown rendering via server response; swap in react-markdown when added to package.json | L23 | @lore J7: react-markdown not a dependency; body renders in `<pre>` so markdown syntax is visible but readable. Not a hardcoded data row but a rendering fallback. When API adds markdown support, this component should parse the response with react-markdown. |

## Shell

| Path:Line | Shape | Consumer | Real source | Owner story | Notes |
|-----------|-------|----------|-------------|-------------|-------|
| `/workspace/.worktrees/L6/packages/web/src/fixtures/app-shell-data.ts:33-47` | `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST` | Rail component (right sidebar) mounts with hardcoded bet/blocker/cost items | `/api/rail/bets`, `/api/rail/blockers`, `/api/rail/cost` endpoints (or similar) | unassigned | MOCK_RAIL_BETS: 2 items with status (in_progress, blocked). MOCK_RAIL_BLOCKERS: 1 item with severity "high". MOCK_RAIL_COST: todaySpend="$12.40", todayBudget="$50.00", weekSpend="$84.20", weekBudget="$350.00". |
| `/workspace/.worktrees/L6/packages/web/src/fixtures/app-shell-data.ts:9-31` | `DEFAULT_SETTINGS` with hardcoded user profile, products list (2), agents list (2), notification defaults, appearance defaults | SettingsPanel and AppShell initialize with DEFAULT_SETTINGS when user settings not yet fetched | `/api/settings` endpoint or user context from auth | unassigned | Profile: name="Founder", email="founder@hyperidle.com". Products: "Product Alpha" (active), "Product Beta" (inactive). Agents: "Architect", "Developer" with autonomy levels. Notifications: all alerts ON, quiet hours 22:00-08:00. Appearance: density="auto" (factory default), theme from getInitialTheme(). |
| `/workspace/.worktrees/L6/packages/web/src/layouts/AppShell.tsx:119-123` | `SCOPE_LABELS` map with hardcoded scope display names | AppShell renders Knowledge Submenu scope browser with hardcoded labels (Practice, Product, Factory) | No API needed; scope names are canonical constants from `@hyperidle/shared` `KNOWLEDGE_SCOPES` | unassigned | Maps practice → "Practice", product → "Product", factory → "Factory". Design-time constant (acceptable). |
| `/workspace/.worktrees/L6/packages/web/src/layouts/AppShell.tsx:125-129` | `HEALTH_DOT` map with hardcoded Tailwind color classes for topic health status | AppShell renders health dots (colored circles) in Knowledge Submenu topic list | No API change needed; health status computation is in fabric/attention-scoring.ts | L22 (indirectly) | Maps fresh → "bg-success", some_stale → "bg-warning", mostly_stale → "bg-error". Rendering of health status is correct; hardcoded status values in the fixture data (knowledge-data.ts) drive this. |
| `/workspace/.worktrees/L6/packages/web/src/components/KnowledgeTopicGroup.tsx:22-32` | `HEALTH_DOT_CLASS` and `HEALTH_DOT_LABEL` maps with hardcoded status display text/colors | KnowledgeTopicGroup renders topic header with health dot and label text | No API change needed; same as above | L22 (indirectly) | Design-time rendering constants (acceptable). Maps health enum values to Tailwind classes and aria-labels. |

## Cross-cutting

| Path:Line | Shape | Consumer | Real source | Owner story | Notes |
|-----------|-------|----------|-------------|-------------|-------|
| `/workspace/.worktrees/L6/packages/fabric/src/attention-scoring.ts:20-29` | Per-kind impact priors (`IMPACT_BY_KIND` record, `COHORT_NOVELTY_CEILING`, `REPETITION_SATURATION`, `REVIEW_RECENCY_WINDOW_MS`, `REVIEW_RECENCY_SATURATION_MS`) | Attention scoring algorithm computes item urgency using hardcoded impact weights and saturation thresholds | Design decision: impact weights and thresholds should be configurable (moved to settings or database) | L22 | `IMPACT_BY_KIND`: principle=1.0, pattern=0.8, anti_pattern=0.8, decision=0.6, failure=0.7, reflection=0.4, brief=0.5, focus=0.5. Constants control novelty saturation (10 items), repetition saturation (5 scopes), review recency window (7 days), saturation point (90 days). @lore: "impact is derived solely from layer/scope/kind heuristics; agent-authored meta.impact is NOT honored." These are research-driven constants; L22 owns evaluating if they should move to settings. |
| `/workspace/.worktrees/L6/packages/web/src/components/SettingsPanel.tsx:75-81` | `TABS` array with 5 hardcoded tab options (profile, products, agents, notifications, appearance) | SettingsPanel renders tab list | No API change needed; tab structure is part of the UI layout | unassigned | Design-time component structure (acceptable). |
| `/workspace/.worktrees/L6/packages/web/src/components/SettingsPanel.tsx:83` | `TIME_24H_RE` regex for time validation | SettingsPanel validates quiet-hours time input | No API change; this is validation logic | unassigned | Regex: `^([01]\d\|2[0-3]):[0-5]\d$` (HH:MM in 24h format). Design-time constant (acceptable). |
| `/workspace/.worktrees/L6/packages/web/src/components/GlobalSearchPanel.tsx:60-98` | Flattened item list built from knowledge/bet/task items; keyboard nav index state | GlobalSearchPanel (Command+K overlay) renders search results and manages keyboard navigation | Results come from `/api/search?q=:query` endpoint (L19 work) | L19 | No hardcoded data rows; results are fetched from server. Keyboard nav logic is runtime UI state (acceptable). |

---

## Summary by Owner Story

- **L7** (Thread response unblocks agent): 1 row
  - ConversationsChat.tsx MOCK_THREADS (still in use; L7 owns replacing)
  
- **L8** (Submenu thread sections, hardcoded counts): 3 rows
  - AppShell.tsx hardcoded counts (Review Queue: 3, Chat: 1, Knowledge All Items: 12)
  
- **L10** (Submenu filter chip state): 1 row
  - AppShell.tsx SUBMENU_FILTERS (filter options exist but are unused)
  
- **L12** (Work surfaces: bets, products, pitches, canvas): 5 rows
  - WorkBet.tsx MOCK_BETS (2 bets with tasks/comments)
  - WorkTeam.tsx CANVAS_BETS (2 bets on canvas)
  - WorkTeam.tsx MOCK_PITCHES (3 pitch-selector pitches)
  - WorkPortfolio.tsx MOCK_PRODUCTS (4 products with counts, ship rates, progress)
  
- **L14/L17** (BetCard fixtures, cost strings, appetites): 1 row shared
  - WorkBet.tsx cost strings and appetites; WorkTeam.tsx appetites
  
- **L15** (Kanban drag handlers): 1 row
  - WorkTeam.tsx INITIAL_TASKS (tasks + state mutations on drag)
  
- **L17** (Cost strings, appetites, cycle metadata): 2 rows
  - WorkPortfolio.tsx MOCK_CYCLE (cycle name, days remaining)
  - WorkBet.tsx / WorkTeam.tsx appetite strings ("2 weeks", "3 weeks", "1 week")
  
- **L22** (Per-kind impact constant, whyNow strings, attention scoring): 2 rows
  - fabric/attention-scoring.ts IMPACT_BY_KIND + time constants
  - knowledge-data.ts MOCK_KNOWLEDGE_ITEMS attentionScore + whyNow fields
  
- **L23** (Knowledge body <pre> fallback, knowledge item fixtures): 4 rows
  - KnowledgeDetail.tsx LEGACY_DETAILS (k1/k2)
  - KnowledgeDetail.tsx LEGACY_SOURCES
  - KnowledgeDetail.tsx FALLBACK_DETAIL
  - knowledge-data.ts MOCK_KNOWLEDGE_ITEMS
  
- **Unassigned** (no obvious L-owner, deferred to L29): 3 rows
  - MOCK_RAIL_BETS, MOCK_RAIL_BLOCKERS, MOCK_RAIL_COST
  - DEFAULT_SETTINGS (user settings fixture)
  - MOCK_CURATION_SUGGESTIONS (knowledge curation cards)
  - SCOPE_LABELS, HEALTH_DOT, tab/validation design-time constants

---

## Totals

- **Total rows:** 27 data sources catalogued
- **By area:**
  - Conversations: 3
  - Work: 9
  - Knowledge: 7
  - Shell: 4
  - Cross-cutting: 4

---

## Top 5 Highest Priority (Blocking user story closure)

1. **WorkBet.tsx MOCK_BETS** (L12): 2 hardcoded bet records with full task/comment data; L12 cannot close until real `/api/bets/:betId` replaces this.
2. **knowledge-data.ts MOCK_KNOWLEDGE_ITEMS** (L22/L23): 15 items with attention scores, whyNow strings, observation logs; directly used by both Knowledge List (triage scoring) and Detail pages.
3. **ConversationsChat.tsx MOCK_THREADS** (L7): 2 hardcoded chat threads; Chat page currently non-functional without real `/api/threads` endpoint.
4. **AppShell.tsx hardcoded counts** (Review Queue: 3, Chat: 1, Knowledge: 12) (L8): Static badge counts in Submenu; L8 AC requires real count derivation from thread/item list.
5. **WorkTeam.tsx CANVAS_BETS + INITIAL_TASKS** (L12/L15): 2 canvas bets + 5 kanban tasks; drag-to-column is a no-op; L15 owns wiring persistence.
