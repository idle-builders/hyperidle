# U9 Architecture Plan — Screen Layouts: Conversations, Work, Knowledge

**Fixed inputs:** `plans/U9/concept.md` (no new nouns), `plans/U9/design/approved.md` (Hearth token migration, portfolio bet grid, Canvas removal, pill filters, settings restyle).

---

## Required reading for the engineer

- `plans/U0/concept.md` — locked domain concepts (Team, Bet, Sidebar, Hearth)
- `plans/U9/design/approved.md` — locked visual contract
- `packages/design-system/src/tokens.css` — Hearth token names
- `packages/design-system/DESIGN.md` — token reference
- `.claude/rules/aesthetic-quality.md` — hard rules for token usage
- `packages/web/src/layouts/AppShell.tsx` — shell structure
- `packages/web/src/shell/Sidebar.tsx` — sidebar component
- `packages/web/src/pages/WorkPortfolio.tsx` — primary restructure target
- `packages/web/src/shell/Canvas.tsx` — component being removed
- `packages/web/src/shell/Kanban.tsx` — component being removed (referenced by TaskSheet)

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| "BetCreateDialog updated: accepts description (not pitch)" | Already done in U1/R2. BetCreateDialog.tsx uses `description`, no pitch field. | No change needed to BetCreateDialog logic. Only Hearth token migration on text classes. |
| "Canvas/Kanban views removed" | Canvas.tsx imported only in WorkPortfolio.tsx (production). Kanban.tsx exports `KanbanTask` type imported by TaskSheet.tsx. Canvas uses `@dnd-kit/core` (only import site in production code). | Remove Canvas from WorkPortfolio. Move `KanbanTask` type to TaskSheet or shared types so Kanban.tsx can be deleted. Delete Canvas.tsx, Canvas.stories.tsx, Kanban.tsx, Kanban.stories.tsx. Delete Canvas/Kanban tests. Remove `useCanvasBets` hook. |
| "2-column grid of BetCard components" | `GET /api/bets` exists, returns `{ draft: [], active: [], completed: [], killed: [] }`. Need a flat array. BetCard component exists in design system. | Use existing `GET /api/bets` endpoint. Flatten the grouped response client-side. BetCard already restyled in U8. |
| "Team pill filters at top" | `useTeams()` hook exists, returns team list. No team filter on portfolio currently. | Add filter state to WorkPortfolio. Team pills use team data from `useTeams()`. Filter bets client-side by `teamId`. |
| "Specific scope pill filters at top" (Knowledge) | KnowledgeList has `KNOWLEDGE_SORT_OPTIONS` and Triage/Curated tabs. No scope pills yet. Sidebar has 3 fixed scopes (Practices, Products, Factory). Spec says "concrete practices (e.g., 'Design', 'Frontend') and teams". | For v1, use the same 3 fixed scope items as sidebar (Practices, Products, Factory). The "concrete practices" level of granularity requires backend scope discovery (out of scope for U9 — the spec says "only restyling existing features"). |
| "New Thread button with forest green accent" | RecipientPicker exists, triggered by keyboard shortcut N in AppShell. No visible "New Thread" button. | Add a `btn btn-xs btn-primary` "New Thread" button in the Conversations filter bar that opens RecipientPicker. |
| "All Playwright E2E tests updated" | 58 E2E spec files exist. Many reference old selectors (team-card, canvas, old token values). | Tests that assert Canvas/Kanban behavior need updating. Token migrations in page components will change rendered class names but not data-testid attributes, so most E2E tests should pass without changes. Canvas-specific tests need deletion or rewrite. |
| Settings pages with Hearth styling | 7 settings files all contain old Lucid token references. | Token migration sweep across all 7 settings files. |
| `btn-neutral` for active filter pills | Used in Conversations.tsx and KnowledgeList.tsx | Replace with `btn-primary` per design spec. |

---

## Token migration map

All occurrences across `packages/web/src/` must be updated. This is the complete Lucid-to-Hearth mapping:

| Old token | New token | Notes |
|---|---|---|
| `var(--surface-2)` | `var(--surface-container)` | Warm linen container |
| `var(--surface-3)` | `var(--surface-elevated)` | White/warm card |
| `var(--surface-4)` | `var(--surface-container)` | Merge with container |
| `var(--surface-ghost)` | `var(--surface-container)` | No ghost in Hearth |
| `var(--text-hi)` | `var(--text-primary)` | Primary text |
| `var(--text-mid)` | `var(--text-secondary)` | Secondary text |
| `var(--text-lo)` | `var(--text-tertiary)` | Tertiary text |
| `var(--r0)` | `var(--r-none)` | No rounding |
| `var(--r1)` | `var(--r-subtle)` | 10px subtle |
| `var(--r2)` | `var(--r-subtle)` | Merge into subtle (10px); was 8px, Hearth has no 8px step |
| `var(--r3)` | `var(--r-default)` | 16px default |
| `var(--ok)` | `var(--accent-primary)` or `var(--status-success)` | Context-dependent: accent for interactive, status for indicators |
| `var(--danger)` | `var(--status-error)` | Error/danger |
| `var(--primary)` | `var(--accent-primary)` | Primary accent (if referencing old Lucid primary) |
| `btn-neutral` (active filter) | `btn-primary` | Forest green active filter pills |
| `bg-base-200` | `bg-[var(--surface-container)]` | Warm container |
| `bg-base-300` | `bg-[var(--surface-elevated)]` | Warm elevated |
| `bg-base-100` | `bg-[var(--surface-page)]` | Page background |

---

## Acceptance criteria

### AC-1: Conversations page Hearth styling
**What:** Conversations.tsx filter pill bar uses `btn-primary` for active filter (not `btn-neutral`). All old Lucid tokens replaced. "New Thread" button visible in filter bar header.
**Verify:** Unit test renders Conversations with filter, asserts `btn-primary` class on active pill. E2E test navigates to /conversations, sees filter bar + "New Thread" button.

### AC-2: WorkPortfolio bet grid
**What:** WorkPortfolio.tsx renders a 2-column grid of BetCard components from `GET /api/bets` (all statuses). Team pill filters at top. "New bet" button styled as `btn-primary`. Canvas and team card grid removed.
**Verify:** Unit test renders WorkPortfolio with mock bet data, asserts `grid-cols-2` layout + BetCard rendering. Unit test with team filter asserts filtered results. E2E test navigates to /work/portfolio, sees bet cards in grid.

### AC-3: WorkPortfolio team pill filters
**What:** Team pill filter bar shows "All teams" + one pill per team. Clicking a team pill filters bets. Active pill uses `btn-primary`, inactive uses `btn-ghost`.
**Verify:** Unit test asserts pills render from teams data, clicking filters bets. E2E test clicks team pill, verifies bet count changes.

### AC-4: WorkTeam Hearth styling
**What:** WorkTeam.tsx uses Hearth tokens throughout. Section cards use `surface-elevated` + `shadow-default` + `r-default`. Breadcrumb, header, burn section, bet rows, roster all use correct tokens.
**Verify:** Unit test renders WorkTeam with fixture data, spot-checks key class names. No old token references found by grep.

### AC-5: WorkBet Hearth styling
**What:** WorkBet.tsx uses Hearth tokens throughout. Cost section, hint banners, breadcrumb, task table hover, dialogs all use correct tokens.
**Verify:** Unit test renders WorkBet with fixture data, spot-checks key classes. No old token references found by grep.

### AC-6: KnowledgeList scope pills + Hearth styling
**What:** KnowledgeList.tsx adds scope pill filter bar above Triage/Curated tabs. Active pills use `btn-primary`. "+ New" button uses `btn-primary`. All old tokens replaced.
**Verify:** Unit test asserts scope pills render, clicking filters items. Triage/Curated tabs use `btn-primary` for active. E2E test navigates to /knowledge, sees scope pills.

### AC-7: KnowledgeDetail Hearth styling
**What:** KnowledgeDetail.tsx body content wrapped in elevated card surface. Metadata bar, related sidebar, conflict banner all use Hearth tokens.
**Verify:** Unit test renders KnowledgeDetail, asserts card wrapper on body. No old token references.

### AC-8: Settings pages Hearth styling
**What:** All 7 settings files (SettingsProfile, SettingsOrgChart, SettingsCredentials, SettingsNotifications, SettingsAppearance, SettingsTeams, SettingsBackend, SettingsWorker) use Hearth tokens. Section cards use elevated surface pattern.
**Verify:** Grep across settings files confirms zero old token references. SettingsWorker test still passes.

### AC-9: BetCreateDialog Hearth styling
**What:** BetCreateDialog.tsx uses Hearth tokens for labels, hints, title preview. Dialog surface uses `surface-elevated` + `shadow-elevated` + `r-default`.
**Verify:** Unit test renders BetCreateDialog, asserts key class names. Existing Q3 bet creation E2E test still passes.

### AC-10: Canvas/Kanban removal
**What:** Canvas.tsx, Canvas.stories.tsx, Kanban.tsx, Kanban.stories.tsx deleted. useCanvasBets.ts deleted. Canvas/Kanban test files deleted or updated. `KanbanTask` type moved to TaskSheet.tsx. `@dnd-kit/core` removed from WorkPortfolio imports (kept in package.json since Canvas.test.tsx may still reference it — actual package removal is optional).
**Verify:** No production import of Canvas or Kanban exists. `grep -rn "import.*Canvas" packages/web/src/ --include="*.tsx" --include="*.ts" | grep -v test | grep -v stories` returns empty. TypeScript compiles clean.

### AC-11: E2E tests updated
**What:** All Playwright E2E tests pass. Tests that assert Canvas behavior are deleted or rewritten to assert bet grid behavior. Tests that navigate to work pages see the new layout.
**Verify:** `npm run test:e2e` passes. `npm run verify` passes.

### AC-12: No old Lucid token references in page/settings/shell files
**What:** Zero instances of `surface-2`, `surface-3`, `surface-4`, `text-hi`, `text-mid`, `text-lo`, `--r0`, `--r1`, `--r2`, `--r3`, `--ok`, `--danger`, `surface-ghost` in any `.tsx` file under `packages/web/src/pages/`, `packages/web/src/settings/`, or in the components/shell files touched by U9.
**Verify:** `grep -rn "surface-2\|surface-3\|surface-4\|text-hi\|text-mid\|text-lo\|--r0\b\|--r1\b\|--r2\b\|--r3\b\|--ok\b\|--danger\b\|surface-ghost" packages/web/src/pages/ packages/web/src/settings/ --include="*.tsx"` returns empty.

### AC-13: npm run verify passes
**What:** Full verification pipeline passes (typecheck + lint + test + build + E2E).
**Verify:** `npm run verify` exits 0.

---

## Ordered task list

### Task 1: Token migration — pages (6 files)
**Files:** `Conversations.tsx`, `WorkPortfolio.tsx`, `WorkTeam.tsx`, `WorkBet.tsx`, `KnowledgeList.tsx`, `KnowledgeDetail.tsx`
**What:** Replace all old Lucid token references per the token migration map above. This is a mechanical find-and-replace within each file.
**Also:** `pages/knowledge/KnowledgeBody.tsx`, `pages/knowledge/KnowledgeCreateDialog.tsx`, `pages/knowledge/ScopeChangeDialog.tsx`, `pages/work/BetCreateDialog.tsx`
**Dependencies:** None.
**Proves:** AC-12 (partial), AC-1/4/5/7/9 (partial).

### Task 2: Token migration — settings (7 files)
**Files:** `SettingsProfile.tsx`, `SettingsOrgChart.tsx`, `SettingsCredentials.tsx`, `SettingsNotifications.tsx`, `SettingsAppearance.tsx`, `SettingsTeams.tsx`, `SettingsBackend.tsx`, `SettingsWorker.tsx`
**What:** Replace all old Lucid token references.
**Dependencies:** None (parallel with Task 1).
**Proves:** AC-8, AC-12 (partial).

### Task 3: Token migration — components and shell files
**Files:** All files in `packages/web/src/components/` and `packages/web/src/shell/` that contain old tokens (listed in reconciliation grep: GlobalSearchPanel, CurationSuggestionCard, SessionActivityPanel, BlockRefEmbed, CredentialsTab, ArtifactSection, ArtifactThreadsSummary, RecipientPicker, ThreadSections, ReasoningBlockView, CocAttachButton, ErrorBoundary, KnowledgeTopicGroup, Kanban, ArtifactView, TaskSheet, CocOverlay, HostThreadSection, ToastRegion).
**What:** Replace old token references. Some of these may not be in U9 scope (design-system components were done in U7/U8), but web-layer components that compose them are in scope.
**Dependencies:** None (parallel with Tasks 1-2).
**Proves:** AC-12 (complete).

### Task 4: Conversations — "New Thread" button + filter pill restyle
**Files:** `Conversations.tsx`
**What:**
1. Change `btn-neutral` to `btn-primary` for active filter pill.
2. Add "New Thread" button to the filter bar header, positioned right. Uses `btn btn-xs btn-primary`. Clicking it triggers the RecipientPicker (need to wire through OutletContext or add a callback).
**Dependencies:** Task 1 (tokens already migrated).
**Proves:** AC-1.

### Task 5: WorkPortfolio restructure — bet grid + team pills
**Files:** `WorkPortfolio.tsx`, new hook or modification to data fetching
**What:**
1. Remove `Canvas` import and rendering.
2. Remove `useCanvasBets` import and usage.
3. Remove team card grid (the inline `<button>` team cards).
4. Add bet list data source: use `GET /api/bets` which returns `{ draft, active, completed, killed }`. Flatten into a single array. Use `useFetch` or a new `useBets()` hook.
5. Add team pill filter bar: "All teams" + team pills from `useTeams()`. State: `selectedTeamId: string | null`.
6. Render 2-column bet grid: `grid grid-cols-1 sm:grid-cols-2 gap-[var(--density-gap)]`. Each bet renders as a clickable BetCard (navigate to `/work/bet/:betId`).
7. Header: "All bets" title (mono uppercase) + "New bet" button (`btn btn-xs btn-primary`).
8. Keep BetCreateDialog and ArtifactSection.
**API shape consumed:**
```typescript
// GET /api/bets response (existing)
interface BetsGroupedResponse {
  draft: BetRow[];
  active: BetRow[];
  completed: BetRow[];
  killed: BetRow[];
}

// Flattened client-side
interface PortfolioBet {
  id: string;
  title: string;           // derived from description via deriveTitleFromPitch
  teamId: string;
  teamName: string;        // resolved from teams lookup
  status: BetStatus;
  costAppetite: WireMoney | null;
  progress: { done: number; total: number };
  atRisk: boolean;
}
```
**Dependencies:** Task 1 (tokens), Task 10 (Canvas deletion).
**Proves:** AC-2, AC-3.

### Task 6: KnowledgeList scope pills
**Files:** `KnowledgeList.tsx`
**What:**
1. Add scope pill filter bar between header and Triage/Curated tabs.
2. Scope pill options: "All", "Practices", "Products", "Factory" (same 3 items as sidebar `KNOWLEDGE_SCOPE_ITEMS` plus "All").
3. Active pill uses `btn-primary`, inactive `btn-ghost`.
4. Clicking a scope pill updates the URL `?scope=` param (existing mechanism).
5. Change Triage/Curated tabs from `btn-neutral` to `btn-primary` for active.
6. Change sort radio buttons from `btn-neutral` to `btn-primary` for active.
7. Style "+ New" button as `btn btn-xs btn-primary`.
**Dependencies:** Task 1 (tokens).
**Proves:** AC-6.

### Task 7: KnowledgeDetail body card
**Files:** `KnowledgeDetail.tsx`
**What:** Wrap the body content area (KnowledgeBody or BodyEditor) in an elevated card surface: `bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[var(--density-card-pad)]`.
**Dependencies:** Task 1 (tokens).
**Proves:** AC-7.

### Task 8: WorkTeam section cards
**Files:** `WorkTeam.tsx`
**What:** Apply Hearth card surface pattern to the burn-vs-cap section, bet rows, and roster rows. Replace all old tokens.
**Dependencies:** Task 1 (tokens).
**Proves:** AC-4.

### Task 9: WorkBet section cards + dialogs
**Files:** `WorkBet.tsx`
**What:** Apply Hearth card surface to cost section, hint banners. Update dialog surfaces. Replace all old tokens.
**Dependencies:** Task 1 (tokens).
**Proves:** AC-5.

### Task 10: Canvas/Kanban deletion
**Files to delete:**
- `packages/web/src/shell/Canvas.tsx`
- `packages/web/src/shell/Canvas.stories.tsx`
- `packages/web/src/shell/Kanban.tsx`
- `packages/web/src/shell/Kanban.stories.tsx`
- `packages/web/src/hooks/useCanvasBets.ts`
- `packages/web/src/hooks/__tests__/useCanvasBets.test.ts`
- `packages/web/src/__tests__/Canvas.test.tsx`
- `packages/web/src/__tests__/Canvas.q3.test.tsx`
- `packages/web/src/__tests__/WorkCanvas.capacity.test.tsx`
- `packages/web/src/__tests__/Kanban.test.tsx`
- `packages/web/src/__tests__/Kanban.no-drag.test.tsx`
- `packages/web/src/__tests__/WorkKanban.grouped.test.tsx`

**Files to modify:**
- `packages/web/src/shell/TaskSheet.tsx`: Move `KanbanTask` type inline (it's just an interface). Remove import from Kanban.
- `packages/web/src/pages/WorkPortfolio.tsx`: Remove Canvas and useCanvasBets imports (done in Task 5).

**Dependencies:** None (can run parallel, but Task 5 depends on this).
**Proves:** AC-10.

### Task 11: Unit test updates
**Files:** All test files in `packages/web/src/__tests__/` and `packages/web/src/pages/__tests__/` that reference Canvas, Kanban, old portfolio structure, or old token values.
**What:**
- Delete Canvas/Kanban test files (listed in Task 10).
- Update `WorkPortfolio.test.tsx`, `WorkPortfolio.j8.test.tsx`, `WorkPortfolio.L13.test.tsx`, `M3-WorkPortfolio.no-mock.test.tsx`, `BetCard.portfolio.test.tsx` to assert the new bet grid structure.
- Update `WorkPortfolio.cycle.test.tsx` — cycle stripe was already hidden; may need deletion.
- Update Conversations tests if they assert `btn-neutral`.
- Update any test asserting old token class names.
**Dependencies:** Tasks 1-10.
**Proves:** AC-11 (partial), AC-13 (partial).

### Task 12: E2E test updates
**Files:** E2E spec files under `packages/web/e2e/` that interact with:
- Work views: `work.spec.ts`, `work-surface.spec.ts`, `Q3-bet-creation.spec.ts`, `R2-work-first-landing.spec.ts`
- Conversations: `conversations.spec.ts`, `conversations-submenu.spec.ts`, `l10-conversations-filter.spec.ts`
- Knowledge: `knowledge.spec.ts`, `knowledge-ia.spec.ts`, `knowledge-detail.spec.ts`
- Settings: `settings.spec.ts`, `settings-overlay.spec.ts`, `settings-redesign.spec.ts`
- Navigation: `navigation.spec.ts`, `synthesis.spec.ts`
**What:** Update selectors and assertions that reference Canvas, old team-card structure, or old token-dependent visual assertions. Most E2E tests use `data-testid` attributes which are stable, so changes should be minimal.
**Dependencies:** Tasks 1-11 (all functional changes complete).
**Proves:** AC-11, AC-13.

### Task 13: Final verification
**What:** Run `npm run verify` (full pipeline). Fix any remaining issues.
**Dependencies:** All prior tasks.
**Proves:** AC-13.

---

## Type signatures

### New: useBets hook
```typescript
// packages/web/src/hooks/useBets.ts
interface BetListItem {
  id: string;
  title: string;
  teamId: string;
  status: BetStatus;
  description: string;
  costAppetite: WireMoney | null;
  atRisk: boolean;
  // progress comes from task counts — may need to be derived
}

interface UseBetsResult {
  bets: BetListItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBets(): UseBetsResult;
```

### Modified: KanbanTask type moved to TaskSheet
```typescript
// packages/web/src/shell/TaskSheet.tsx (inline, was in Kanban.tsx)
export interface KanbanTask {
  id: string;
  title: string;
  state: string;
  owner: string;
  bet: string;
  // ... (copy existing shape from Kanban.tsx)
}
```

### WorkPortfolio filter state
```typescript
// Added to WorkPortfolio component state
const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
```

### Conversations New Thread callback
```typescript
// Added to AppShellOutletContext
interface AppShellOutletContext {
  // ... existing
  onNewThread: () => void;  // opens RecipientPicker
}
```

---

## Endpoint usage (existing, no new endpoints)

| Endpoint | Consumer | Notes |
|---|---|---|
| `GET /api/bets` | `useBets()` (new hook in WorkPortfolio) | Returns grouped by status. Client flattens. |
| `GET /api/teams` | `useTeams()` (existing) | Team list for pill filters. |
| `GET /api/bets/:id` | `useBet()` (existing) | Bet detail — unchanged. |
| `POST /api/bets` | `BetCreateDialog` (existing) | Bet creation — unchanged. |

---

## Risks and ambiguities

1. **`GET /api/bets` response shape.** The endpoint returns bets grouped by status (`{ draft: [], active: [], completed: [], killed: [] }`). Each bet object has `teamId` but NOT `teamName` or `progress`. The portfolio needs team names (for pills and card labels) and progress (for BetCard). **Resolution:** Fetch teams separately via `useTeams()` and join client-side. For progress, the bet list endpoint may not include task counts — if not, progress is omitted from the portfolio grid (it's available on bet detail). The architect should check the bet list response shape and add `progressDone`/`progressTotal` fields if not present.

2. **Token migration completeness.** The old Lucid tokens (`surface-2`, `text-hi`, etc.) might also exist in story files, test files, and non-page components. The AC says "pages, settings, and touched shell files." Story files should also be migrated for consistency, but test files that assert specific class names will need careful handling — the assertion must match the new token name.

3. **Canvas deletion and test coverage.** Deleting Canvas.tsx removes 6 test files. The work portfolio tests that assert Canvas behavior need complete rewrite. This is the highest-risk task because the existing tests may have been written to be "protected" (assertions that must not change).

4. **Knowledge scope pill data.** The spec says "concrete practices (e.g., 'Design', 'Frontend')." The current system only has 3 fixed scopes (Practices, Products, Factory). For v1, we use these 3 + "All." If the spec intends more granular scopes, that requires a backend API change (out of U9 scope per "only restyling existing features").

---

## Security & abuse cases

| Check | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | No new endpoints. Existing rate limits on `/api/bets` POST unchanged. |
| Input trust boundary | N/A | No new user input surfaces. BetCreateDialog unchanged. |
| Secret handling | N/A | No new credential surfaces. |
| Path traversal | N/A | No new path inputs. |
| SSRF | N/A | No outbound URLs. |
| XSS via token migration | Low risk | Token names are CSS custom properties, not user input. No HTML injection surface. |

---

## Protected tests

The following test files contain assertions that are part of prior workpackage contracts. Their assertions may need updating for token name changes, but the test FILE should not be deleted:

```
protectedTests: [
  "packages/web/src/__tests__/Conversations.test.tsx",
  "packages/web/src/__tests__/Conversations.dispatch.test.tsx",
  "packages/web/src/__tests__/Conversations.reasoning.test.tsx",
  "packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx",
  "packages/web/src/__tests__/WorkPortfolio.test.tsx",
  "packages/web/src/__tests__/WorkPortfolio.j8.test.tsx",
  "packages/web/src/__tests__/WorkPortfolio.L13.test.tsx",
  "packages/web/src/__tests__/M3-WorkPortfolio.no-mock.test.tsx",
  "packages/web/src/pages/__tests__/WorkBet.thread.test.tsx",
  "packages/web/src/pages/__tests__/WorkBet.L14-actions.test.tsx",
  "packages/web/src/pages/__tests__/WorkBet.anchored-messages.test.tsx",
  "packages/web/src/pages/__tests__/WorkBet.artifact-section.test.tsx",
  "packages/web/src/pages/__tests__/WorkBet.block-popover.test.tsx",
  "packages/web/src/pages/__tests__/WorkBet.discuss-block.test.tsx",
  "packages/web/src/pages/__tests__/WorkBet.share-block.test.tsx",
  "packages/web/src/pages/__tests__/KnowledgeDetail.thread.test.tsx",
  "packages/web/src/pages/__tests__/KnowledgeDetail.block-popover.test.tsx",
  "packages/web/src/pages/__tests__/KnowledgeDetail.anchored-messages.test.tsx",
  "packages/web/src/pages/__tests__/KnowledgeDetail.share-block.test.tsx",
  "packages/web/src/pages/knowledge/__tests__/KnowledgeBody.test.tsx",
  "packages/web/src/settings/__tests__/SettingsWorker.test.tsx"
]
```

Tests that CAN be deleted (Canvas/Kanban specific, no longer applicable):
```
deletableTests: [
  "packages/web/src/__tests__/Canvas.test.tsx",
  "packages/web/src/__tests__/Canvas.q3.test.tsx",
  "packages/web/src/__tests__/WorkCanvas.capacity.test.tsx",
  "packages/web/src/__tests__/Kanban.test.tsx",
  "packages/web/src/__tests__/Kanban.no-drag.test.tsx",
  "packages/web/src/__tests__/WorkKanban.grouped.test.tsx",
  "packages/web/src/hooks/__tests__/useCanvasBets.test.ts"
]
```

---

## Migrations (symbol renames/removals)

### Canvas.tsx deletion
| Call site | File | Action |
|---|---|---|
| `import { Canvas } from "../shell/Canvas.js"` | `WorkPortfolio.tsx` | Remove import + JSX |
| `import { useCanvasBets } from "../hooks/useCanvasBets.js"` | `WorkPortfolio.tsx` | Remove import + hook call + all `canvasBets`/`canvasCapacity`/`refreshCanvas` references |
| `import type { CanvasBet } from "../shell/Canvas.js"` | `useCanvasBets.ts` | File deleted |
| Tests importing Canvas | 3 test files | Files deleted |

### Kanban.tsx deletion
| Call site | File | Action |
|---|---|---|
| `import type { KanbanTask } from "./Kanban"` | `TaskSheet.tsx` | Move `KanbanTask` interface inline into TaskSheet.tsx |
| Tests importing Kanban | 3 test files | Files deleted |

### Token renames (all files in pages/, settings/, components/, shell/)
Mechanical find-and-replace. No logic changes. Each old token appears in class name strings and is replaced with the Hearth equivalent per the migration map above.

---

## Design-it-twice: Portfolio data strategy

**Option A: New `useBets()` hook with `GET /api/bets`**
- Fetches the existing grouped endpoint, flattens client-side
- Joins with `useTeams()` for team names
- Progress may not be available (bet list response may lack task counts)
- Cost: 1 new hook file, 2 API calls (bets + teams)

**Option B: Enhance `GET /api/bets` to return flat list with team names and progress**
- Server-side join of bets + teams + task counts
- Add query param `?team_id=` for server-side filtering
- Cost: Server route modification, response shape change, existing test updates

**Decision: Option A.** The existing `GET /api/bets` endpoint works and is tested. Adding server-side enrichment increases scope and risks breaking existing consumers (Canvas used the `/canvas` sub-endpoint, not the main list). Client-side join with `useTeams()` is trivial. Progress data can be deferred — the BetCard already handles missing progress gracefully. If the bet list response does include `teamId`, the client can look up team names from the teams cache.

---

## Task dependency graph

```
Tasks 1, 2, 3 (token migration) — parallel, no dependencies
Task 10 (Canvas/Kanban deletion) — parallel with token migration
  ↓
Task 4 (Conversations New Thread) — depends on Task 1
Task 5 (WorkPortfolio restructure) — depends on Tasks 1, 10
Task 6 (KnowledgeList scope pills) — depends on Task 1
Task 7 (KnowledgeDetail body card) — depends on Task 1
Task 8 (WorkTeam section cards) — depends on Task 1
Task 9 (WorkBet section cards) — depends on Task 1
  ↓
Task 11 (Unit test updates) — depends on all functional tasks
  ↓
Task 12 (E2E test updates) — depends on Task 11
  ↓
Task 13 (Final verification) — depends on all
```

**Parallelism:** Tasks 1-3 and 10 can all run in parallel (first wave). Tasks 4-9 can all run in parallel (second wave). Tasks 11-12 are sequential. Task 13 is the gate.
