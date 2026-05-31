# Track U: Hearth — Design Language & UX Rewrite

Complete transition from the Lucid design system to Hearth. Every token, component, and screen layout changes. The domain model simplifies: products become teams, the pitch ceremony is removed, the 4-panel shell collapses to a 2-panel sidebar+main layout. The result is a warm, approachable app that feels like a modern collaboration tool, not a dense productivity dashboard.

**Scope rules (apply to every story in this track):**
- **Hearth reference is authoritative.** `packages/design-system/03-hearth.html` is the design source of truth for the new aesthetic. Components match its warm palette, generous radii, shadow-based depth, and pill-shaped interactive elements.
- **Both light and dark modes ship.** Every token change, component restyle, and screen layout must work in hearth-light and hearth-dark. Dark mode uses warm earth tones, not cool grays.
- **No cool grays anywhere.** Every neutral must be warm-tinted (brown/earth undertones). `#e8e0d0` yes, `#e8e8e8` no.
- **System must compile at each boundary.** `npm run verify` (check + lint + test) must pass after each workpackage. Tests are updated as part of the workpackage that changes the tested surface.
- **Concept doc is locked.** `plans/U0/concept.md` defines the domain changes (team, bet, sidebar, theme). Do not re-litigate concept decisions during implementation.

**Reference docs:** `plans/U0/concept.md` (locked concept), `packages/design-system/03-hearth.html` (design reference), `packages/design-system/DESIGN.md`, `packages/design-system/src/tokens.css`, `docs/process-layer/the-five-primitives.md`, `docs/information-architecture/app-shell-always-present.md`.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/dependency-graph.md` for the dependency graph.

---

### U1 — Schema Migration: Products → Teams + Bet Simplification

**Story.** As a developer working on HyperIdle, I want the database schema to reflect the new domain model — `products` renamed to `teams`, bet lifecycle simplified (shaped/committed states removed, pitch→description), and all foreign keys updated — so that the API and UI layers can build on the correct data model.

**Depends on.** None.

**Acceptance criteria.**
- Drizzle migration renames the `products` table to `teams` and all `product_id` columns to `team_id` across bets, tasks, threads, and any other referencing tables.
- The existing `teams` table (agent membership: members, lead_agent_id, capacity, etc.) is renamed to `team_members` to avoid collision.
- Bet status enum changes from `shaped | committed | in_progress | shipped | killed` to `draft | active | completed | killed`.
- Bet `pitch` column renamed to `description`. Bet `shipped_at` column renamed to `completed_at`.
- New boolean column `at_risk` on bets (default false).
- Zod schemas in `packages/db/src/zod-schemas.ts` updated to match.
- TypeScript types (`Product` → `Team`, `NewProduct` → `NewTeam`) updated in `packages/db/src/schema.ts`.
- Seed data updated to use new table/column names and valid status values.
- `npm run db:generate` produces a clean migration. `npm run db:migrate` applies it.
- `npm run check` passes with zero type errors across all packages.

**Validation scenarios.**
- Given the migration runs, when querying `SELECT * FROM teams`, then the former products data is present with all columns intact.
- Given a bet with status `shaped`, when the migration runs, then its status is `draft`.
- Given a bet with status `in_progress` or `committed`, when the migration runs, then its status is `active`.
- Given a bet with status `shipped`, when the migration runs, then its status is `completed` and `shipped_at` is now `completed_at`.

**Contracts / constraints.**
- Migration is forward-only. No down migration.
- The `at_risk` column is a simple boolean, not a computed column. The computation logic lives in the API/UI layer.
- All foreign key constraints are preserved after rename.
- Seed fixtures produce valid data against the new schema.

**Out of scope.**
- API endpoint renaming (U2).
- UI changes (later workpackages).
- Computed `at_risk` logic (deferred to U2 or later).

**Effort.** M (~4h)

---

### U2 — API Layer: Products → Teams + Bet Endpoints

**Story.** As a frontend developer, I want the server API to expose `/api/teams` (replacing `/api/products`) and updated `/api/bets` endpoints with the simplified lifecycle, so that the UI can build against the new domain model.

**Depends on.** U1 (schema must exist before API can query it).

**Acceptance criteria.**
- All `/api/products/*` routes renamed to `/api/teams/*` with the same CRUD semantics.
- Bet endpoints accept the new status values (`draft | active | completed | killed`) and reject the old ones (`shaped | committed | in_progress | shipped`).
- Bet creation accepts `description` (not `pitch`) and defaults status to `draft`.
- Bet update accepts `at_risk` boolean field.
- `PATCH /api/bets/:id` state transitions enforce the lifecycle graph: draft→active, active→completed, active→killed, draft→killed. Invalid transitions return 400.
- Shared types in `packages/shared` updated: `Product` → `Team`, bet status union updated.
- All existing API tests updated to use new endpoints and field names.
- `npm run verify` passes.

**Validation scenarios.**
- Given a POST to `/api/teams` with name "Growth", when the response is received, then status is 201 and the body contains a team object with `id` and `name`.
- Given a bet with status `draft`, when PATCH sets status to `completed`, then the response is 400 (invalid transition — must go through `active` first).
- Given a bet with status `active`, when PATCH sets `at_risk: true`, then the bet's `at_risk` flag is true in subsequent GET.

**Contracts / constraints.**
- No backwards-compatible `/api/products` aliases. Clean cut.
- The state transition enforcement is in the API layer, not the DB layer.
- Error responses follow the existing project format.

**Out of scope.**
- Frontend routing changes (U6).
- Computed `at_risk` signals (the API accepts a manual boolean for now; computed signals are a future workpackage).

**Effort.** M (~4h)

---

### U3 — Hearth Token System (Light + Dark)

**Story.** As a designer and developer, I want the design system token CSS to define the complete Hearth palette — surfaces, text, accents, status colors, borders, shadows, radii, spacing, typography, and motion — for both light and dark modes, so that all components can be restyled by consuming Hearth tokens.

**Depends on.** None.

**Acceptance criteria.**
- `packages/design-system/src/tokens.css` is rewritten with Hearth tokens. The Lucid token blocks are replaced entirely.
- Light mode tokens match `packages/design-system/03-hearth.html` values: page=#f5f0e6, container=#ede7db, elevated=#ffffff, accent-primary=#16764f, accent-secondary=#d97706, text-primary=#2c241a, etc.
- Dark mode tokens use warm earth tones: deep browns for surfaces, warm-tinted text, same accent colors. All text colors pass WCAG 2.1 AA (4.5:1) against their intended surfaces.
- Radius scale: none=0, subtle=10px, default=16px, pill=9999px.
- Spacing grid: 6px base (3/6/9/12/18/24/36/48px).
- Shadow tokens: subtle, default, elevated — warm-tinted (rgba with brown base, not black).
- Border width tokens: thin=1px, default=1.5px, strong=2.5px. Border color tokens: solid warm colors (not alpha-based).
- Motion tokens: fast=120ms, default=240ms, slow=450ms, ease=cubic-bezier(0.25, 0.1, 0.25, 1).
- Typography: system-ui font stack, weight scale 400/500/600/700, sizes 12/13/15/17/20/24/30px.
- Density presets (compact/default/comfortable) rebuilt on the 6px grid.
- `data-theme="hearth-light"` and `data-theme="hearth-dark"` selectors. Default (no attribute) follows `prefers-color-scheme`.
- Existing token tests in `packages/design-system/src/__tests__/tokens.test.ts` updated to validate Hearth values.
- `npm run check` passes.

**Validation scenarios.**
- Given `data-theme="hearth-light"`, when CSS variables are computed, then `--surface-page` resolves to `#f5f0e6` and `--accent-primary` to `#16764f`.
- Given `data-theme="hearth-dark"`, when text contrast is measured, then `--text-primary` on `--surface-page` meets 4.5:1 WCAG AA.
- Given the density set to "comfortable", when spacing tokens are read, then `--density-pad-x` is on the 6px grid.

**Contracts / constraints.**
- Token names change from Lucid convention (surface-0…surface-6, text-hi/mid/lo) to Hearth convention (surface-page/container/elevated/overlay, text-primary/secondary/tertiary). This is a breaking change — all consumers must update.
- No cool grays in any token value (light or dark mode).
- Shadow tokens are used on cards at rest (not reserved for overlays).

**Out of scope.**
- DaisyUI theme mapping (U4).
- Component restyling (U7–U9).
- Tailwind config update (U4).

**Effort.** M (~6h)

---

### U4 — DaisyUI Theme + Tailwind Config Update

**Story.** As a developer using DaisyUI classes in components, I want the DaisyUI theme to map Hearth tokens so that `btn`, `badge`, `input`, `modal`, and other DaisyUI primitives render with the Hearth aesthetic, and the Tailwind config exposes Hearth color utilities.

**Depends on.** U3 (Hearth tokens must exist before mapping to DaisyUI).

**Acceptance criteria.**
- `packages/web/tailwind.config.ts` updated: `lucid-dark` and `lucid-light` DaisyUI themes replaced with `hearth-light` and `hearth-dark`.
- DaisyUI theme variables mapped: `primary`→forest green, `base-100/200/300`→Hearth surfaces, `--rounded-box`→16px, `--rounded-btn`→9999px (pill), `--rounded-badge`→9999px (pill), error/warning/success/info→Hearth status colors.
- Tailwind `extend.colors` updated from `surface-0…6` to `surface-page/container/elevated/overlay`, from `text-hi/mid/lo` to `text-primary/secondary/tertiary`.
- Tailwind `extend.borderColor` updated to match Hearth border tokens.
- Font family updated from Geist to system-ui in Tailwind config.
- `packages/web/src/index.css` updated: font import for Geist removed, `@import` points to updated tokens.
- Theme persistence hook (`useTheme.ts`) updated to use `hearth-light`/`hearth-dark` values instead of `lucid-dark`/`lucid-light`.
- `npm run check` passes (type errors from renamed utilities are expected to surface — those are fixed in component workpackages).

**Validation scenarios.**
- Given the app renders with `data-theme="hearth-light"`, when a `btn btn-primary` element is inspected, then its background is forest green (#16764f) and its border-radius is pill (9999px).
- Given an `input` element, when focused, then the focus ring is forest green.
- Given the Settings appearance panel, when switching theme, then the values `hearth-light`/`hearth-dark` are persisted and applied.

**Contracts / constraints.**
- DaisyUI stays as a dependency. The theme is a pure CSS variable override, not a fork.
- Old Lucid theme names are removed, not aliased.
- All DaisyUI component classes that HyperIdle uses must render acceptably with the new theme (buttons, badges, inputs, modals, drawers, dropdowns, toggles, checkboxes, radios, tooltips).

**Out of scope.**
- Custom component restyling (U7–U9).
- App shell layout changes (U6).

**Effort.** M (~4h)

---

### U5 — Shared Types + Frontend Type Sweep

**Story.** As a frontend developer, I want all TypeScript types, hooks, and utilities across `packages/web` and `packages/shared` to use the new domain vocabulary (Team instead of Product, description instead of pitch, new bet statuses), so that the codebase compiles cleanly against the U1/U2 backend changes.

**Depends on.** U1 (schema types changed), U2 (API endpoints changed).

**Acceptance criteria.**
- `packages/web/src/types/bet.ts`: `pitch` field → `description`, status type updated, `at_risk` boolean added.
- `packages/web/src/hooks/useProduct.ts` → renamed to `useTeam.ts`. `useProducts.ts` → `useTeams.ts`. All internal references updated.
- `packages/web/src/settings/settings-types.ts`: `ProductSetting` → `TeamSetting`, `mutedProducts` → `mutedTeams`, settings section "products" → "teams".
- `packages/web/src/settings/SettingsProducts.tsx` → renamed to `SettingsTeams.tsx`. Internal copy/labels updated.
- All hooks, components, and pages that reference `product`/`Product`/`productId` updated to `team`/`Team`/`teamId`.
- `packages/web/src/pages/WorkProduct.tsx` → renamed to `WorkTeam.tsx`.
- All imports across the web package updated.
- `npm run check` passes with zero type errors.
- `npm run lint` passes.

**Validation scenarios.**
- Given the full codebase, when `grep -r "product" packages/web/src` is run, then zero results reference the old Product concept (only legitimate uses like "productivity" in comments are allowed).
- Given `npm run check`, when executed, then zero type errors across all packages.

**Contracts / constraints.**
- This is a mechanical rename + type update. No behavioral changes.
- Test files are updated to compile, but test assertions may still reference old UI text — those are fixed in the component workpackages.

**Out of scope.**
- Visual/behavioral changes to settings pages (U9).
- Component restyling (U7–U9).
- Router path changes (U6).

**Effort.** M (~4h)

---

### U6 — App Shell: Sidebar + Main (Layout Restructure)

**Story.** As a user, I want a single 200px sidebar on the left with three view sections (Conversations, Work, Knowledge) and contextual sub-items, replacing the old IconRail + Submenu + Rail layout, so that navigation is simpler — I click a view to see all items, use pills in the main pane to filter, and the sidebar gives me shortcuts to my recent chats, teams, and scopes.

**Depends on.** U4 (Hearth DaisyUI theme for component styling), U5 (shared types use Team, not Product).

**Acceptance criteria.**
- New `Sidebar` component at `packages/web/src/shell/Sidebar.tsx`: 200px fixed width, brand wordmark at top, three sections (Conversations, Work, Knowledge) with sub-items, dividers between sections, settings access at bottom.
- `AppShell.tsx` restructured: renders `<Sidebar /> | <main>` instead of `<IconRail /> | <Submenu /> | <main> | <Rail />`.
- **Conversations section**: primary "Conversations" nav item + up to 5 recent conversation sub-items for quick jump. Clicking "Conversations" navigates to `/conversations` showing all threads.
- **Work section**: primary "Work" nav item + team name sub-items. Clicking "Work" navigates to `/work/portfolio` showing all bets. Clicking a team sub-item navigates to `/work/portfolio?team=:teamId` (filtered view).
- **Knowledge section**: primary "Knowledge" nav item + specific scope sub-items — concrete practices (e.g., "Design", "Frontend") and concrete teams (e.g., "Nimmly", "Growth") the user owns. Clicking "Knowledge" navigates to `/knowledge` showing all items. Clicking a specific scope sub-item filters to knowledge for that practice or team.
- Active view section highlighted. Active sub-item has elevated white background with shadow. Status dots on relevant sub-items.
- Settings access at bottom of sidebar (gear icon or user avatar).
- `IconRail.tsx`, `Rail.tsx`, `Submenu.tsx` are deleted (along with their `.stories.tsx` files).
- `PitchSelector.tsx` is deleted (pitch ceremony removed).
- Router paths updated: `work/product/:productId` → `work/team/:teamId`.
- `useRail.ts` hook deleted (Rail no longer exists). `useViewportBreakpoint.ts` simplified (no rail/submenu collapse — only sidebar mobile overlay).
- `CocOverlay` trigger relocated (no longer anchored to Rail).
- Filters that were in the Submenu (Blocking/Async for Conversations, scope browser for Knowledge) move to the main pane header as pill tab bars.
- All shell-related tests updated or replaced.
- `npm run verify` passes.

**Validation scenarios.**
- Given the app loads, when the user sees the left panel, then it is 200px wide with "HyperIdle" brand, three sections (Conversations, Work, Knowledge), and sub-items under each.
- Given the user clicks "Work" in the sidebar, then the main pane shows all bets at `/work/portfolio`.
- Given the user clicks a team name under Work, then the main pane shows bets filtered by that team.
- Given the user clicks a recent conversation sub-item, then the main pane shows that conversation thread.
- Given the user resizes to mobile width (≤768px), then the sidebar becomes an overlay/drawer.

**Plan calls.** Multi-version exploration on the sidebar layout — `/design` should explore the sidebar structure and sub-item rendering, then standard architecture pass.

**Contracts / constraints.**
- Sidebar is not collapsible on desktop. On mobile, it becomes an overlay.
- Three view sections (Conversations, Work, Knowledge) are fixed. Sub-items are dynamic.
- Clicking a sub-item = navigating to the parent view with a filter pre-applied. Not a separate navigation context.
- No drag-to-reorder sidebar items.
- No nested folders or tree structure. Two levels max: section → sub-items.

**Out of scope.**
- Component restyling within the main pane (U7–U9).
- CoC overlay redesign (keep functional, relocate trigger).
- Mobile-specific sidebar behavior refinement (follow-up).

**Effort.** L (~2d)

---

### U7 — Design System Components: Tier 1 Primitives Restyle

**Story.** As a user, I want all Tier 1 design system primitives (StatusChip, Tag, NavItem, SearchField, Skeleton, EmptyState, ErrorState, KeyValue) to render with the Hearth aesthetic — warm colors, generous rounding, pill shapes, colored status — so that the app feels cohesive.

**Depends on.** U3 (Hearth tokens must exist), U4 (DaisyUI theme must be mapped).

**Acceptance criteria.**
- `StatusChip`: uses colored badges (green=active/completed, amber=at_risk, red=blocked/killed, blue=draft/info) instead of monochrome. Pill-shaped (border-radius: 9999px).
- `Tag`: pill-shaped, colored tint backgrounds matching Hearth badge styles. Tag kinds (pattern, decision, failure) use warm tints.
- `NavItem`: styled as sidebar items with warm hover states, rounded-10px corners, status dot support.
- `SearchField`: 16px border-radius, forest green focus ring, warm border colors, placeholder in `--text-placeholder`.
- `Skeleton`: pulse animation on warm cream backgrounds (not dark surfaces).
- `EmptyState` / `ErrorState`: warm card styling with shadow, generous padding, forest green action buttons.
- `KeyValue`: warm border separators, text hierarchy using Hearth text tokens.
- HTML reference files in `packages/design-system/html/` updated to match Hearth aesthetic for each component.
- `.stories.tsx` files updated to render correctly with Hearth tokens.
- Component unit tests updated for any changed class names or DOM structure.
- `npm run verify` passes.

**Validation scenarios.**
- Given a StatusChip with status "active", when rendered, then it shows a green pill badge with white text on forest green background.
- Given a Tag with kind "decision", when rendered, then it has a warm primary tint background and pill shape.
- Given a SearchField, when focused, then the border turns forest green with a 3px green shadow ring.
- Given the design system viewer at `/designsystem`, when opened, then all Tier 1 primitives render with Hearth styling.

**Contracts / constraints.**
- HTML reference files are updated IN THIS WORKPACKAGE (not deferred). Both HTML and TSX must match.
- Status color mapping: the Lucid monochrome philosophy (only red carries color) is replaced with Hearth's 4-color status system.
- All components must work in both hearth-light and hearth-dark modes.

**Out of scope.**
- Tier 2 components (U8).
- Screen layouts (U9).
- PitchCard (deleted in U6, not restyled).

**Effort.** L (~2d)

---

### U8 — Design System Components: Tier 2 Composites Restyle

**Story.** As a user, I want all Tier 2 design system composites (BetCard, ThreadRow, TaskCard, KnowledgeRow, CommentRow, Composer, RichMessageCard, NotificationRow, ThreadHostBanner, ThreadShell, Block and its payloads, Artifact family) to render with the Hearth aesthetic, so that every content surface in the app uses warm colors, shadows, and generous rounding.

**Depends on.** U7 (Tier 1 primitives must be restyled first — Tier 2 composes them).

**Acceptance criteria.**
- `BetCard`: white elevated card with warm shadow, 16px radius, progress bar (green/amber fill on cream track), team avatar group, budget badge, status dot. Hover lifts card with translateY(-2px) + elevated shadow.
- `ThreadRow`: unread dot (green when unread, transparent when read), thread title + preview text, avatar group, message count badge, timestamp. Warm hover state.
- `TaskCard`: warm card styling with status dot, cost display, owner avatar.
- `KnowledgeRow`: warm card with health dot, scope badge, staleness indicators.
- `CommentRow`: avatar + name + timestamp + body layout matching Hearth message style.
- `Composer`: forest green "Send" button (pill-shaped), warm input background, placeholder text.
- `RichMessageCard`: agent messages with forest green avatar border, action boxes with green tint, card max-height preserved.
- `NotificationRow`: colored left border by status type, icon circles with colored tint backgrounds.
- `ThreadHostBanner`: warm surface with participant avatars, team/bet context.
- `ThreadShell`: cream/elevated main area, thread header with badges.
- `Block` and payloads: warm code blocks, warm table borders, heading sizes per Hearth type scale.
- Artifact family (ArtifactCostChip, ArtifactEmbed, ArtifactGalleryCard, ArtifactKindBadge, ArtifactPreview, ArtifactPreviewSurface, ArtifactStackItem, ArtifactTimestamp): warm styling, green/amber accents.
- HTML reference files updated for all Tier 2 components.
- `.stories.tsx` files updated.
- Component unit tests updated.
- `npm run verify` passes.

**Validation scenarios.**
- Given a BetCard for an active bet, when rendered, then it shows a white card with warm shadow, green status dot, and progress bar.
- Given a BetCard, when hovered, then it lifts 2px with an elevated shadow.
- Given a ThreadRow for an unread thread, when rendered, then the title is semibold and a green unread dot appears.
- Given a Composer, when the send button is visible, then it is forest green with pill shape.

**Contracts / constraints.**
- All Tier 2 components must work in both hearth-light and hearth-dark modes.
- HTML and TSX must match visually.
- PitchCard is NOT restyled — it is deleted in U6. Remove it from the design system exports.

**Out of scope.**
- Screen-level layout changes (U9).
- New components not in the current catalog.

**Effort.** L (~3d)

---

### U9 — Screen Layouts: Conversations, Work, Knowledge

**Story.** As a user, I want the three main content areas (Conversations thread view, Work bet/team views, Knowledge list/detail) to use the Hearth aesthetic and work with the new sidebar navigation, so that every screen in the app feels warm, focused, and consistent.

**Depends on.** U6 (shell must be restructured), U8 (components must be restyled).

**Acceptance criteria.**
- **Conversations page**: full conversation list as main content. Pill tab filters at top (All, Blocking, Async). Clicking a sidebar sub-item or applying a filter narrows the list. Thread detail with Hearth-styled messages, composer at bottom. New Thread button with forest green accent.
- **Work — All Bets (Portfolio)**: 2-column grid of BetCard components. Team pill filters at top — clicking one filters bets by team (equivalent to clicking a team sub-item in sidebar). Header with "All bets" title, "New bet" button. Cards show status dot, progress bar, team avatars, budget.
- **Work — Team view**: same bet grid, pre-filtered by team. Team header with name and members at top.
- **Work — Bet detail**: bet title + description (markdown rendered as blocks). Task list. Progress bar. Thread section. Budget/cost display.
- **Knowledge — List**: all knowledge items at top level. Specific scope pill filters at top — concrete practices (e.g., "Design", "Frontend") and teams (e.g., "Nimmly") — clicking one filters to knowledge for that scope (equivalent to clicking a scope sub-item in sidebar). Items as KnowledgeRow components with health dots.
- **Knowledge — Detail**: block-based body renderer on warm elevated surface. Metadata sidebar or header.
- Settings pages (SettingsTeams replacing SettingsProducts, all other settings sections) styled with Hearth inputs, toggles, and cards.
- `BetCreateDialog` updated: accepts `description` (not pitch), assigns to a team, creates as `draft`.
- Canvas/Kanban views removed or replaced with the bet grid (no drag-based betting ceremony).
- All Playwright E2E tests updated for new layout structure, routes, and element selectors.
- `npm run verify` passes.

**Validation scenarios.**
- Given the user clicks "Work" in the sidebar, then the main pane shows a 2-column grid of all bet cards on a cream background with warm shadows, with team pill filters at top.
- Given the user clicks a team pill filter on the Work page, then only bets for that team are shown. Clicking again deselects and shows all bets.
- Given the user clicks "New bet", then a dialog appears with a description field (not pitch), team selector, and budget field.
- Given the user clicks "Conversations" in the sidebar, then the main pane shows all conversations with pill filters (All, Blocking, Async) at top.
- Given the user clicks "Knowledge" then a scope pill (e.g., "Design"), then only knowledge items for the Design practice are shown.

**Contracts / constraints.**
- No pitch-related UI elements remain in any screen.
- Canvas.tsx and Kanban.tsx are deleted if they served only the betting ceremony. If they have other uses, they are restyled.
- All screens must work in both hearth-light and hearth-dark modes.

**Out of scope.**
- Mobile-specific layouts (follow-up).
- New features not in the current app (only restyling existing features).

**Effort.** L (~3d)

---

### U10 — Aesthetic Rules, Docs & Lint Config Update

**Story.** As a developer or AI agent working on HyperIdle, I want the aesthetic quality rules, frontend rules, design system docs, and ESLint plugin config to reflect the Hearth design language, so that future changes are validated against the correct token system and design principles.

**Depends on.** U9 (all visual changes must be complete before updating the rules that enforce them).

**Acceptance criteria.**
- `.claude/rules/aesthetic-quality.md` updated: spacing grid 6px (AQ-001), Hearth radius scale (AQ-011), shadows on cards allowed (AQ-012 relaxed), Hearth motion values (AQ-013), rail rule AQ-112 deleted, new rule for no cool grays.
- `.claude/rules/frontend.md` updated: Hearth design system reference (not Lucid), component count updated, aesthetic description updated.
- `.claude/rules/design-system.md` updated: Hearth theme names, token source of truth, story format.
- `packages/design-system/DESIGN.md` rewritten for Hearth token reference (surfaces, text, accents, status, borders, shadows, radii, spacing, typography, motion).
- `packages/design-system/PRINCIPLES.md` updated to reflect Hearth's four design principles (warmth signals trust, status through content, generous rounding, mixed hierarchy).
- `packages/design-system/THEMES.md` updated: hearth-light + hearth-dark replacing lucid-dark + lucid-light.
- `packages/design-system/AESTHETICS.md` updated where Hearth contradicts Lucid recommendations.
- ESLint plugin (`packages/eslint-plugin-design`) rules updated for Hearth token names, radius scale, spacing grid.
- Density allowlist updated if component density classifications changed.
- `docs/` files referencing products, pitches, rail, or Lucid updated to reflect the new domain and design.
- `npm run verify` passes.

**Validation scenarios.**
- Given a developer reads `.claude/rules/aesthetic-quality.md`, then all token names, scales, and rules match the Hearth design system.
- Given `npm run lint` is run on a file using `surface-0` (old Lucid token), then the linter flags it as an error.
- Given `packages/design-system/DESIGN.md` is read, then the color tables show Hearth values (forest green, amber, cream surfaces).

**Contracts / constraints.**
- All `docs/` files are updated for the product→team rename and pitch removal. This includes process-layer, information-architecture, human-interface-layer, and ui-design folders.
- The aesthetic-quality rules are the enforcement mechanism — they must be updated AFTER the visual changes land, not before.

**Out of scope.**
- New lint rules for Hearth-specific patterns (follow-up).
- Architecture docs that describe backend systems not affected by the UI rewrite.

**Effort.** L (~1d)

---

### U11 — Visual Validation & Test Re-baseline

**Story.** As a quality gate, I want all visual regression baselines re-captured against the Hearth aesthetic, all Playwright E2E tests passing against the new layout and routes, and a screenshot-based review confirming every screen matches the Hearth reference, so that the migration is proven complete.

**Depends on.** U9 (all screens must be restyled), U10 (rules must be updated so lint passes).

**Acceptance criteria.**
- All visual regression baseline screenshots re-captured for Hearth (both light and dark modes).
- Playwright E2E tests pass for: navigation (sidebar clicks route correctly), bet CRUD (create/read/update status), thread viewing, knowledge browsing, settings.
- Screenshot comparison of every main screen (conversations list, thread detail, bet grid, bet detail, team view, knowledge list, knowledge detail, settings) against the Hearth reference aesthetic.
- Zero type errors (`npm run check`), zero lint errors (`npm run lint`), all tests green (`npm run test`).
- No references to old Lucid tokens, old product/pitch vocabulary, or deleted components (IconRail, Rail, Submenu, PitchCard, PitchSelector) remain in production code.
- `npm run verify` passes.

**Validation scenarios.**
- Given the full test suite, when `npm run verify` is executed, then exit code is 0.
- Given a grep for `lucid-dark|lucid-light|surface-0|surface-1|surface-2|surface-3|surface-4|surface-5|surface-6|text-hi|text-mid|text-lo|PitchCard|PitchSelector|IconRail` across `packages/web/src` and `packages/design-system/src`, then zero results in production code (test fixtures may reference old values if testing migration).
- Given the design system viewer at `/designsystem`, when every component is rendered, then all match the Hearth aesthetic in both light and dark modes.

**Contracts / constraints.**
- This is a validation workpackage. It does not introduce new features or change behavior.
- Any issues found are fixed in-workpackage, not deferred.
- Visual regression threshold remains at 5% max pixel diff.

**Out of scope.**
- Performance optimization.
- New features.
- Mobile-specific testing (follow-up).

**Effort.** M (~6h)
