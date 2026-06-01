# Architecture Critique: U9 — Screen Layouts

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:9 N:8 MD:8 FMC:7 S:8 V:7

**Reviewed artifact:** `plans/U9/architecture.md`
**Spec reference:** TRACK-U.md lines 329-365
**Design reference:** `plans/U9/design/approved.md`

---

## Dimension Scores

### 1. Spec Alignment — 8/10

Every spec acceptance criterion maps to at least one plan AC:

| Spec AC | Plan AC(s) |
|---------|------------|
| Conversations page Hearth + pills + New Thread | AC-1 (Task 1, 4) |
| Work — All Bets (Portfolio) 2-column grid | AC-2, AC-3 (Task 5) |
| Work — Team view Hearth styling | AC-4 (Task 8) |
| Work — Bet detail Hearth styling | AC-5 (Task 9) |
| Knowledge — List scope pills | AC-6 (Task 6) |
| Knowledge — Detail Hearth styling | AC-7 (Task 7) |
| Settings pages Hearth styling | AC-8 (Task 2) |
| BetCreateDialog updated | AC-9 (Task 1) |
| Canvas/Kanban removed | AC-10 (Task 10) |
| E2E tests updated | AC-11 (Task 12) |
| npm run verify passes | AC-13 (Task 13) |

The plan adds AC-12 (no old Lucid token references) which is not explicitly in the spec but is a reasonable completeness check derived from the spec's "all Hearth aesthetic" requirement. Not scope creep -- it is a verification aid.

The plan correctly identifies that BetCreateDialog already uses `description` (not pitch) and assigns to team (from U1/R2), so no logic change is needed -- only token migration. This matches reality.

### 2. Layer Integrity — 9/10

All tasks operate within the Human Interface layer (`packages/web`). No tasks reach into `packages/server` or `packages/db`. The plan correctly identifies that `GET /api/bets` already exists and no new API endpoints are needed. The client-side flatten + join pattern (`useBets()` + `useTeams()`) respects the layer boundary.

The plan does NOT propose modifying any server routes. Token migration is purely frontend. Canvas/Kanban deletion is purely frontend.

### 3. API Contracts — 8/10

The plan specifies the API contracts it consumes:

- `GET /api/bets` response shape: `{ draft: BetRow[], active: BetRow[], completed: BetRow[], killed: BetRow[] }` -- verified against the actual route at `packages/server/src/routes/bets.ts:339-360`.
- `GET /api/teams` consumed via existing `useTeams()` hook.
- `GET /api/bets/:id` and `POST /api/bets` marked as unchanged.

The `BetListItem` type signature is specified with field types. The `UseBetsResult` return type is specified.

### 4. Data Model Alignment — 9/10

No schema changes. No migrations. The plan correctly identifies that the `bets` table has `teamId` but the list endpoint does NOT join team names. The client-side join resolution is documented in the design-it-twice section.

The `KanbanTask` type migration (Kanban.tsx -> TaskSheet.tsx inline) is specified with the instruction to "copy existing shape." This is adequate since the type is being moved, not modified.

### 5. Naming — 8/10

- `useBets()` -- honest name, returns all bets. Distinguishes from the deleted `useCanvasBets()` which returned only draft/active.
- `BetListItem` -- clear, distinguishes from `BetRow` (DB row) and `CanvasBet` (old Canvas shape).
- `selectedTeamId` -- standard filter state naming.
- `onNewThread` callback -- clear intent.

No naming conflicts with existing primitives.

### 6. Module Depth — 8/10

`useBets()` is a thin hook (fetch + flatten), which is appropriate. The flatten operation is trivial but the hook provides the standard `loading/error/refresh` interface the pages expect. Single entry point, single consumer (WorkPortfolio).

The outlet context extension (`onNewThread`) is the narrowest possible surface for the RecipientPicker wiring. One function, one purpose.

### 7. Failure-Mode Coverage — 7/10

The plan's security/abuse section correctly marks all checks as N/A with reasoning. No new endpoints, no new input surfaces, no new credential surfaces. Correct for a pure restyling workpackage.

Risk section identifies the three real risks: API response shape (bets may lack progress data), token migration completeness, and Canvas deletion test coverage. Each has a documented resolution.

### 8. Simplicity / Over-Engineering Risk — 8/10

The design-it-twice section (Portfolio data strategy) is genuine, not theatre. Option A (client-side join) vs Option B (server enrichment) have real tradeoffs. The decision (Option A) is well-reasoned: existing endpoint works, server modification increases scope, client join is trivial.

The plan avoids over-engineering: no new API endpoints, no new shared types beyond `BetListItem`, no abstraction layers. The token migration is mechanical find-and-replace. The portfolio restructure is one component rewrite, not a framework change.

### 9. Verifiability — 7/10

Every AC has a verification method:
- AC-1 through AC-9: unit test (specific assertion) + grep (no old tokens)
- AC-10: grep for production imports of deleted components + TypeScript compile
- AC-11: `npm run test:e2e` passes
- AC-12: specific grep command with old token patterns
- AC-13: `npm run verify` exits 0

The protected-tests list is thorough (21 files) with clear separation of protected vs deletable tests. E2E test files are enumerated.

---

## CRITICAL

None.

## WARNING

1. **[plan: Token migration map] `var(--primary)` -> `var(--accent-primary)` mapping is incomplete.** The plan's token migration map lists this mapping but does not account for the DaisyUI `--primary` CSS variable which is the theme-level primary color. DaisyUI components like `btn-primary`, `progress-accent`, `outline-[var(--primary)]` use `--primary` which is set by the DaisyUI theme configuration, not by Hearth tokens directly. The plan's map entry suggests replacing all `var(--primary)` occurrences, but some are DaisyUI focus-visible outlines (e.g., `focus-visible:outline-[var(--primary)]` in WorkTeam.tsx:357 and WorkPortfolio.tsx:166). **Resolution needed:** Clarify that `var(--primary)` in `focus-visible:outline-[var(--primary)]` should become `focus-visible:outline-[var(--accent-primary)]` (Hearth token) OR remain as `var(--primary)` (DaisyUI theme variable that maps to the same color). The builder needs this disambiguation to avoid breaking focus rings.

2. **[plan: Task 3] Component/shell token migration scope is broader than stated.** Task 3 lists ~19 component/shell files but the actual grep shows old tokens in additional files: `BlockRefEmbed.stories.tsx`, `SessionActivityPanel.stories.tsx`, `ArtifactThreadsSummary.stories.tsx`. The plan says "Story files should also be migrated for consistency" in Risk 2, but Task 3 does not explicitly include story files in its file list. **Impact:** The builder may skip story files, leaving old tokens in stories. AC-12's grep only covers `pages/`, `settings/`, and "touched shell files" -- story files would slip through. **Recommendation:** Add story file migration as an explicit sub-task of Task 3, or expand AC-12's grep scope.

3. **[plan: Task 3] `HostThreadSection.tsx` is missing from Task 3's file list.** The plan lists `HostThreadSection` as a file with old tokens (from the reconciliation grep) but it does not appear in Task 3's explicit file list. HostThreadSection is used in WorkBet and KnowledgeDetail pages. If its tokens are not migrated, pages that compose it will show mixed old/new tokens. This file appears in the shell directory and should be explicitly listed.

4. **[plan: AC-8] Settings file count discrepancy.** AC-8 says "All 7 settings files" then lists 8 files (SettingsProfile, SettingsOrgChart, SettingsCredentials, SettingsNotifications, SettingsAppearance, SettingsTeams, SettingsBackend, SettingsWorker). Task 2 also says "7 files" then lists 8. This is a minor count error but could cause the builder to think one file is out of scope if they count and stop at 7. **Fix:** Update to "all 8 settings files."

5. **[plan: Task dependency graph] Task 5 lists dependency on Task 10 but the graph shows them in different waves.** Task 5 says "Dependencies: Task 1 (tokens), Task 10 (Canvas deletion)" and the dependency graph shows Task 10 in wave 1 (parallel with token migration) and Task 5 in wave 2. This is correct -- Task 5 runs in wave 2 after wave 1 completes. But the plan's Task 5 description says "Remove Canvas import and rendering" which overlaps with Task 10's deletion. **Clarification needed:** Task 10 should delete the source files (Canvas.tsx, Kanban.tsx, etc.) while Task 5 should remove the imports and usages from WorkPortfolio.tsx. The plan does say this, but the overlap could confuse the builder. Recommend adding a note: "Task 5 removes Canvas usage from WorkPortfolio; Task 10 deletes the Canvas source files. Both can happen in the same commit."

## SUGGESTION

1. **[plan: Type signatures] `BetListItem.title` derivation should reference the existing `deriveTitle` utility.** The plan's `PortfolioBet` type (in design/approved.md) mentions `deriveTitleFromPitch` and the server route uses `deriveTitle`. The plan's `BetListItem` type has a `title` field but does not specify how it is derived from the API response (which returns `description`, not `title`). The builder will need to find and use the existing title derivation utility. **Recommendation:** Add a note in the `useBets()` hook spec: "Title derived from `description` using the existing `deriveTitle()` utility in the codebase."

2. **[plan: Task 4] The "New Thread" button should specify its position in the tab order.** The button is placed "positioned right" in the filter bar. If the filter pills use `role="tablist"` and the button is inside the tablist container, the button should NOT have `role="tab"`. It should be outside the tablist or use `role="none"`. The architecture plan specifies the RecipientPicker wiring but not the semantic HTML placement.

3. **[plan: Risks section] Risk 1 about progress data could be resolved by reading the actual response shape.** The plan says "the bet list endpoint may not include task counts -- if not, progress is omitted from the portfolio grid." The actual `GET /bets` response at line 343 of bets.ts returns `allBets` from `db.select().from(bets)` which includes the raw schema columns but no joined task counts. The plan should state definitively: "The `GET /bets` endpoint does NOT include progress data. BetCard in the portfolio will show title, status, team, budget, and at_risk -- but no progress bar. Progress is available on the detail endpoint (`GET /bets/:id`) only."

4. **[plan: E2E test section] Consider listing the specific E2E assertions that will break.** Task 12 lists 15 E2E spec files but says "changes should be minimal" because most use `data-testid` attributes. A more precise plan would grep for `canvas`, `team-card`, `btn-neutral` in these files to identify the exact lines that need updating. This is a builder convenience, not a structural issue.

---

## What's Working Well

1. **Plan reconciliation table.** The "Spec vs Reality" table at the top of the plan is the strongest section. Every spec assumption is verified against actual codebase state with a concrete resolution. This prevents the builder from implementing against assumptions that don't match reality. The table correctly identifies that BetCreateDialog is already correct (no changes needed), that Canvas is only imported in WorkPortfolio (clean deletion), and that the knowledge scope pills require a v1 simplification.

2. **Protected-tests / deletable-tests split.** The explicit separation of 21 protected test files from 7 deletable test files is precisely what prevents the builder from accidentally deleting a test that guards a prior workpackage's contract. The deletable list matches the Canvas/Kanban files 1:1. This is the right way to handle test file lifecycle in a migration workpackage.

3. **Migrations table (symbol renames/removals).** The call-site-by-call-site breakdown for Canvas.tsx and Kanban.tsx deletion is thorough. Each import site is listed with its file and the required action. This is the level of precision that prevents broken imports after deletion.

---

## Verdict

Score 8/10 -- exceeds the advancement threshold. The plan is well-structured for a large restyling workpackage with a clear restructure (WorkPortfolio) and a clean deletion (Canvas/Kanban). The warnings are minor ambiguities that the builder can resolve by reading the codebase, not structural flaws. The plan can advance to the build phase.
