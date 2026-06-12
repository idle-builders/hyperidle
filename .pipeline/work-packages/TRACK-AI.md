# Track AI: Style Consolidation

Source: the exhaustive UI consistency review of 2026-06-12 — all 121 non-story `.tsx` files in `packages/web` and `packages/design-system` read in full, every claim verified against the tree (working artifact: `plans/reviews/area-ui-consistency.md`, regenerable; the load-bearing evidence is carried inline in each workpackage below). The headline: the design system is good and underused. The app ships ~30 references to CSS tokens that do not exist (the browser silently drops them — invisible borders, unstyled editor typography), eight independent relative-time formatters, page-local forks of the shared status system, two design-system row components reimplemented by the very pages they were built for, and a dialog layer with three incompatible implementations. None of this is new capability — it is making what exists true everywhere.

**Relationship to the reuse-first rule.** This track exists because duplication was cheaper than reuse at authoring time. `.claude/rules/reuse-first.md` (landed with this track) changes that default for all future work; Track AI pays down the existing debt so the rule has a clean baseline to defend.

**Track-wide proof bar.** Consistency claims are proven by looking, not by code reading: every workpackage that changes rendered output captures Playwright screenshots of the same element/state on multiple surfaces and the review judges them identical. Zero hard-rule violations against `.claude/rules/aesthetic-quality.md` on touched surfaces.

**Scope rules.** Presentation, tokens, shared primitives, and their adoption only. No behavior, data-model, or process-layer changes; every replaced call site keeps its existing data and interaction behavior. `npm run verify` must pass after every workpackage merges (same rule as Tracks AD–AH). See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

**Boundary with Tracks AG and AH.** AG owns the Work-view experience and three named primitives: **AG5** owns dropdowns/select-pickers and the popover menus, **AG6** owns the item-row/table primitive, **AG7** owns the Settings-page consistency pass, **AG1** owns the team-screen composition. **AH3** owns the shared textarea pill-shape fix and the Assistant persona surface. Track AI owns everything those do not: token integrity (AI1), the dialog layer (AI2), time (AI3) and status (AI4) vocabulary, app-wide adoption of avatars/buttons/state-components outside Settings (AI5), the design system's internal coherence (AI6), and cross-page header/scroll anatomy (AI7). Where an AI workpackage touches a Settings file, it fixes only its own dimension (e.g. AI1 fixes a dead token in `SettingsAssistant.tsx`) and leaves the section's restyling to AG7.

**Reference docs:** `packages/design-system/DESIGN.md`, `AESTHETICS.md`, `PRINCIPLES.md`, `src/tokens.css`, `.claude/rules/aesthetic-quality.md`, `.claude/rules/reuse-first.md`, `docs/ui-design/`.

---

### AI1 — Every styling token resolves

**Workpackage.** As a user anywhere in the app, I want every surface to render the styling it was designed with — visible dividers, styled editor typography, on-palette status colors — so that no part of the UI silently degrades because a style points at a token that doesn't exist; and as a contributor, I want the build to fail when I reference an unknown token, so this class of defect cannot recur.

**Why this matters.** This is shipping breakage, not style preference: ~30 `var(--…)` references across the app name tokens that are defined nowhere, and CSS silently drops them. The rich-text editor's headings, code blocks, and quotes render unstyled (`body-editor.css` references 10 dead tokens — leftovers of the W2 density removal), every TaskSheet section divider is invisible (`--border-lo` ×6), knowledge-body headings fall back to browser defaults (`index.css` `--density-text*`), and assistant-settings feedback text renders in literal browser `red`/`green` (`--color-error`/`--color-success`). Two refactors left these behind and nothing failed — the same will happen after the next refactor unless a gate exists. The founder sees a product that looks unfinished in ways no one chose.

**What exists today.** `packages/design-system/src/tokens.css` is the single token source; `packages/eslint-plugin-design` already enforces hardcoded-color, off-grid-spacing, and off-scale rules — but nothing validates that a referenced custom property is defined. Verified dangling references: `design-system/src/body-editor.css` (≈20 refs: `--ui`, `--density-text`, `--density-text-h1/h2`, `--leading-heading`, `--fw-emphasis`, `--border-emphasis`, `--mono`, `--surface-ghost`, `--r1`, `--primary-dim`), `web/src/shell/TaskSheet.tsx` (`--border-lo` ×6), `web/src/index.css` (`--density-text*` ×4), `design-system/src/KnowledgeRow.tsx` (`font-[var(--mono)]` ×3), `web/src/components/ThreadSections.tsx` (`--danger` ×3 — documented U9 leftover with protected tests asserting it), `web/src/components/CurationSuggestionCard.tsx` (`--border-emphasis`, `--primary-dim`), `web/src/pages/AgentProfile.tsx` (`--surface-base`), `web/src/components/CredentialsTab.tsx` (`--border`), `web/src/settings/SettingsAssistant.tsx` (`--color-error`, `--color-success`).

**What's genuinely missing.** The dangling references resolved to real tokens (restoring the intended rendering), and a static gate that makes an unknown-token reference a build failure instead of a silent no-op.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Every CSS custom property referenced in shipped styles and components resolves to a token defined in the design system — zero dangling references remain.
- The surfaces currently broken by dead tokens render their intended styling, verified visually: rich-text editor typography (headings, code, quotes), TaskSheet section dividers, knowledge-body headings, and assistant-settings feedback colors.
- Introducing a reference to an undefined token anywhere in web or design-system code causes the verification gate to fail, naming the file and the token.
- Status feedback text everywhere renders in Hearth status colors, never browser-literal `red`/`green` fallbacks.
- The legacy `--danger` reference is resolved in coordination with its protected tests — the tests still pass and still assert the rendered error treatment, against a defined token.

**Validation scenarios.**
- Given the merged change, when the rich-text editor renders a document with headings, code, and a quote, then a Playwright screenshot shows the Hearth type scale and container styling applied (compared against the pre-fix screenshot showing browser defaults).
- Given the TaskSheet open over a task, when captured at desktop and mobile widths, then section dividers are visible.
- Given a contributor adds `var(--does-not-exist)` to any component or stylesheet, when the verification gate runs, then it fails and names the file and token.
- Given the full lint/verify suite on the clean branch, when it runs, then it passes — proving the gate's allowlist/exception surface is empty, not papering over remaining debt.

**Plan calls.** Standard architecture pass; no `/design` (restores intended rendering, decides nothing visual). The gate mechanism (eslint-plugin-design rule vs build script) is an architecture decision — the rule must catch tokens inside Tailwind arbitrary values, template strings, and plain CSS.

**Contracts / constraints.**
- No new tokens invented to "make names resolve" without design intent — each dangling reference maps to the semantically correct existing token; genuinely missing semantic tokens belong to AI6, not here.
- The ThreadSections protected tests are updated in lockstep, never deleted or weakened.
- This workpackage does not restyle anything beyond restoring what the dead token was meant to do.

**Out of scope.** New semantic tokens (dim variants, scrim — AI6). Hardcoded-but-valid colors (AI6/AI5). Settings restyling (AG7).

**Effort.** M (~6h)

---

### AI2 — One dialog experience

**Workpackage.** As a user opening any dialog, sheet, or overlay in the app, I want them all to behave as one family — the same dismissal rules, the same protection for my unsaved input, the same layering and focus behavior — so that muscle memory from one dialog transfers to every other and I never lose typed work to a single accidental keypress.

**Why this matters.** The app has eleven dialog/overlay surfaces built three incompatible ways (DaisyUI modal-box, bare native `<dialog>`, hand-rolled fixed divs), and the divergence is user-hostile in a specific way: the bet-kill confirmation *blocks* Escape, while the bet-create and routine-create dialogs — where the founder has typed a pitch — close and discard it on one Escape press. The same ~25-line JSDOM guard is pasted into six files, four surfaces compete at `z-50`, two overlays share `z-30` with stacking decided by accidental DOM order, focus handling is implemented four different ways, and several dialogs overflow phone viewports. Every new dialog inherits a coin-flip of these behaviors.

**What exists today.** No shared dialog primitive exists in the design system. Surfaces: `AgentAddDialog` + `AgentEditDialog` (DaisyUI modal-box — mutually consistent, the closest thing to a reference implementation), `KnowledgeCreateDialog`, `ScopeChangeDialog`, `BetCreateDialog`, `RoutineCreateDialog`, and two inline dialogs in `WorkBet.tsx` (bare `<dialog>` with per-file Escape/JSDOM boilerplate), `TaskSheet`, `AssistantOverlay`, `NotificationPopover`, `GlobalSearchPanel`, and the `AppShell` mobile drawer (custom fixed divs; TaskSheet and GlobalSearchPanel carry real focus traps, others hand-roll subsets). Dialog headings in the knowledge dialogs use off-scale 14px type and an undefined `font-heading` utility.

**What's genuinely missing.** One design-system dialog primitive owning backdrop, dismissal (Escape / click-outside / close affordance), unsaved-input guarding, focus trap and restore, mobile sizing, and a documented z-layer scale — adopted by every dialog surface so the behavior matrix collapses to one row.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- Every dialog and overlay in the app shares one dismissal grammar: Escape and click-outside behave the same way for the same kind of surface, and a dialog containing unsaved user input is never discarded by a single accidental Escape or backdrop click.
- Keyboard focus moves into every dialog on open, stays trapped while open, and returns to the trigger on close — uniformly.
- Overlay layering is deterministic and documented: no two surfaces compete for the same layer, and any two that can be open simultaneously stack predictably regardless of DOM order.
- Every dialog fits and functions at phone viewport widths.
- A new dialog is built by composing the shared primitive — verifiable by the per-file Escape/JSDOM/focus boilerplate being gone from all migrated surfaces.
- Dialog chrome (heading scale, padding, close affordance) is visually consistent across all surfaces, proven by side-by-side Playwright screenshots of at least four dialogs.

**Validation scenarios.**
- Given a half-typed bet pitch in the create flow, when the user presses Escape once, then the input is not silently discarded (guarded per the design's chosen pattern), and a screenshot captures the guard state.
- Given any confirmation dialog, when Escape is pressed, then it closes — same as every other confirmation.
- Given the TaskSheet and the notification overlay open together, when captured, then they stack in the documented order at both opening sequences.
- Given Playwright opens four migrated dialogs and screenshots each at desktop and 375px width, then the review finds one consistent chrome and no viewport overflow.

**Plan calls.** `/design` for the dialog anatomy and the dismissal/guard grammar (when to guard, when to close freely — encode the rule, don't case-by-case it), then standard architecture pass. The primitive lives in the design system with a `.stories.tsx` covering its states.

**Contracts / constraints.**
- Exactly one dialog primitive; surfaces with a documented reason to differ (e.g. the non-modal AssistantOverlay's deliberate no-click-outside) compose it with flags, not forks.
- Coordinate with **AG3**: bet authoring moves out of its dialog entirely — do not invest in migrating `BetCreateDialog` if AG3 lands first; migrate whatever dialog surface AG3 leaves behind.
- Hearth tokens only; the knowledge-dialog off-scale headings are corrected as part of migration.
- No behavior changes beyond the dismissal/focus/layer contract — every dialog keeps its content and actions.

**Out of scope.** The dropdown/popover menus (**AG5**). Bet authoring journey (**AG3**). Toast positioning. New dialog features (resize, stacking beyond two).

**Effort.** L (~1.5d)

---

### AI3 — One clock

**Workpackage.** As a user scanning timestamps anywhere in the app, I want the same age to read the same way everywhere — one vocabulary, one set of thresholds — so that "how long ago" never depends on which page I happen to be on.

**Why this matters.** Eight independent relative-time implementations ship today, with three distinct vocabularies: `utils/format-time.ts` ("5m ago"), `utils/relative-time.ts` ("<1h", "3w", "6mo" — and the two files' names are semantically swapped), inline copies in `WorkTask.tsx`, `WorkBet.tsx` (comment: "Duplicated from WorkTask for locality"), `ArtifactThreadsSummary.tsx`, a seconds-granularity variant in `NotificationPopover.tsx` ("12s"), plus two more inside the design system itself (`ArtifactTimestamp.tsx` — "N min ago"; `CommentRow.tsx` — absolute `toLocaleTimeString`). Only one of the eight handles invalid dates. The same event age renders as "just now", "12s", "<1h", or "1 min ago" depending on surface — the product visibly disagrees with itself about time.

**What exists today.** The two exported utils plus six local implementations listed above; bare `toLocaleDateString()` calls with inconsistent options in `AgentProfile.tsx` (two different formats in one file) and `WorkRoutine.tsx`.

**What's genuinely missing.** One time-rendering source with an intentional vocabulary (the design decides whether compact and prose variants both survive — but as named variants of one implementation, not parallel forks), robust against invalid input, consumed by every surface including the design system.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Any two surfaces showing the same timestamp age render the identical label — proven by a side-by-side capture of at least four surfaces (notifications, work pages, knowledge list, thread/comment rows) seeded with identical timestamps.
- If distinct display registers exist (e.g. compact vs prose), each is a named variant of the single source; no surface computes time arithmetic locally.
- An invalid or future timestamp renders a graceful placeholder on every surface — never "NaN", a negative age, or a crash.
- Absolute dates (created-on, completed-on) render with one consistent format app-wide.
- The design system's own timestamp rendering consumes the same source as the web app.

**Validation scenarios.**
- Given fixture data with identical `createdAt` values, when Playwright captures the notification popover, a work task row, and a knowledge row, then all three show the same age label.
- Given an unparsable timestamp injected into each surface's data, when rendered, then every surface shows the graceful placeholder.
- Given the codebase after the change, when searched for local date-difference arithmetic in components, then none remains outside the single source.

**Plan calls.** Standard architecture pass; `/design` only to ratify the vocabulary (one register or two, exact thresholds) — a one-table decision, not a variant exploration. Note the package-boundary question (design-system cannot import from web) is an architecture decision.

**Contracts / constraints.**
- One implementation; variants are parameters, not files. The misleading `format-time.ts` / `relative-time.ts` naming does not survive.
- No change to which timestamp each surface displays — only how it is formatted.

**Out of scope.** Live-updating ("2m ago" ticking to "3m ago"). Locale/i18n. Date pickers.

**Effort.** M (~4h)

---

### AI4 — One status language

**Workpackage.** As a user reading status anywhere — a task's state, a bet's outcome, a knowledge item's lifecycle, an agent's health — I want the same state to look the same everywhere: same color, same shape, same label, same live-pulse signal, so that I learn the product's status language once and it never lies by dialect.

**Why this matters.** The shared status system (`StatusChip` + `status-mapping.ts`, exhaustive and type-safe) is used correctly by WorkRoutine and WorkTeam — and forked everywhere else. `WorkBet.tsx` hand-rolls `taskStateBadgeClass()` with hardcoded rgba tints *in a file that already imports StatusChip*; `WorkTask.tsx` renders the same TaskState as plain gray text that WorkBet shows as a colored pill; `KnowledgeList.tsx` builds two local badge-style functions; `AgentProfile.tsx` defines three local chip components; `NotificationPopover.tsx` redefines type labels that exist in `@hyperidle/shared`; `WorkBet` redefines verdict labels that exist in shared types. The pulsing LiveDot exists twice (WorkTask, TaskSheet — the copy's own `@lore AF12` asks for promotion) and is absent from WorkBet's task list for the same `in_progress` state. The user-visible result: identical states render differently across pages, and "is this thing alive?" has surface-dependent answers.

**What exists today.** `design-system/src/status-mapping.ts` (exhaustive `TASK_STATE_MAP`, `BET_STATUS_MAP`, `KNOWLEDGE_STATUS_MAP`, `SESSION_OUTCOME_MAP` with type-error-on-new-state safety) + `StatusChip` + `Tag`; shared label registries in `@hyperidle/shared` (`notifications.ts` NOTIFICATION_TYPES, verdict labels in `types.ts`). The forks listed above, all verified at file:line in the 2026-06-12 review.

**What's genuinely missing.** Adoption: every status rendering flows through the shared mapping and shared label registries; the live-activity indicator becomes a single promoted component applied wherever the state it signals appears.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- The same entity status renders with the same color, shape, and label on every surface that shows it — proven by Playwright captures of the same task state on the bet detail, task detail, and task sheet, and the same bet status on portfolio, team, and bet detail.
- Status and type labels derive from the shared registries; adding a new state to a shared union surfaces as a type error until every rendering path handles it (the existing exhaustiveness guarantee now actually guards all surfaces).
- The live-activity pulse appears wherever an in-progress/live state is shown — the same signal, every surface.
- No page-local status→color or status→label builder remains in the web package.
- Outcome verdicts render with semantic status coloring consistently (not neutral gray on one page and colored on another).

**Validation scenarios.**
- Given a task `in_progress`, when captured on WorkBet's task list, WorkTask's header, and the TaskSheet, then all three show the identical chip treatment and the live pulse.
- Given a bet with a recorded verdict, when captured on the portfolio and the bet detail, then the verdict's color and label match.
- Given the codebase after the change, when searched for local `*BadgeClass`/`*BadgeStyle`/label-map definitions duplicating shared ones, then none remain.

**Plan calls.** Standard architecture pass; no `/design` (the status language is already designed — `StatusChip` and the mapping are the spec; this is adoption). If a surface genuinely needs a rendering StatusChip cannot express, that gap is raised to the design system, not solved locally.

**Contracts / constraints.**
- `status-mapping.ts` stays the single mapping; pages never restate it.
- Label sources: `@hyperidle/shared` registries — the design system maps presentation, shared owns vocabulary.
- Existing protected/behavioral tests updated, not deleted.

**Out of scope.** Status *semantics* (which states exist — process-layer). The Settings panes' DaisyUI badge classes (**AG7** restyles Settings; it adopts this language). New status visualizations.

**Effort.** M (~6h)

---

### AI5 — Shared-primitive adoption sweep

**Workpackage.** As a user, I want the recurring atoms of the interface — people and agents, buttons, loading/empty/error moments, tabs, scope pickers — to look and behave identically wherever they appear, so the product reads as one system; and as a contributor, I want reaching for the existing primitive to be the path of least resistance, with no hand-rolled equivalent left in the tree to copy from.

**Why this matters.** The review found the design system bypassed at scale: `Avatar` is used at 3 of ~16 identity sites (hand-rolled circles in Sidebar, RecipientPicker, NotificationPopover, WorkBet, WorkTeam, SetupFlow and more — with four initials-derivation variants, four avatar sizes, and agent-vs-human distinction present on some surfaces and absent on others), `Button` is bypassed by hand-rolled buttons in Conversations (×3), KnowledgeCreate/Detail, NotFound, and DaisyUI `btn` sites; the knowledge scope picker is copy-pasted in four files, each hardcoding the rgba value that `--accent-primary-dim` already defines; `ArtifactThreadsSummary` and `BlockRefEmbed` hand-roll `animate-pulse` skeletons with a different animation than the DS `Skeleton`; `SessionActivityPanel` uses raw DaisyUI tabs although `TabBar` exists; design-system `KnowledgeRow` and `NotificationRow` are fully reimplemented by `KnowledgeList` and `NotificationPopover` respectively. Each hand-rolled copy is a template for the next one — the debt compounds until the canonical path wins.

**What exists today.** All the primitives exist, catalogued and story-backed: `Avatar`/`AvatarGroup`, `Button`, `Skeleton`/`SkeletonList`/`SkeletonCard`, `EmptyState`, `ErrorState`, `TabBar`, `Tag`, `KnowledgeRow`, `NotificationRow`. The bypass sites are enumerated with file:line in the 2026-06-12 review. Two bypasses are documented-intentional and stay: Sidebar's raw nav buttons (E2E selectors + density, per its lore) and HostThreadSection's role-hygiene empty state.

**What's genuinely missing.** Adoption — plus the small set of primitive extensions the holdouts genuinely need (e.g. compact/inline variants of EmptyState/ErrorState for panel contexts, a single shared scope-picker, initials derivation as a shared utility) so that "the primitive couldn't do it" stops being true. Touch-target repairs ride along where a hand-rolled control is replaced (the 24px triage buttons and 32px overflow button fail AQ-015 today).

**Depends on.** None. (AG5 owns dropdowns, AG6 owns rows, AG7 owns Settings surfaces — this sweep covers everything outside those. Where AI5 would touch a row that AG6 is unifying or a Settings pane AG7 owns, AI5 yields.)

**Complexity.** L

**Acceptance criteria.**
- The same person or agent renders identically (size scale, initials, agent-vs-human distinction, presence signal) on every surface that shows an identity — proven by capturing one agent across at least four surfaces.
- Every button of a given semantic role (primary action, secondary, ghost, destructive) shares one visual treatment app-wide; no hand-rolled button stylings remain outside the design system.
- Loading is one affordance family: skeletons with the system's animation everywhere content loads; empty and error moments use the shared state components — including compact contexts, via variants rather than hand-rolled divs.
- The knowledge scope picker is one implementation rendered in all four locations.
- Every interactive element on touched surfaces meets the 44px touch-target rule at applicable viewports.
- The two documented-intentional bypasses (Sidebar nav, HostThreadSection empty state) remain and carry their justification; no new undocumented bypass is introduced.

**Validation scenarios.**
- Given one agent present in the sidebar, the recipient picker, a team page, and the notification popover, when each is captured, then the identity rendering is identical in anatomy and the agent is distinguishable from humans on all four.
- Given the app's loading states triggered on four different surfaces, when captured, then all show the same skeleton family — no plain "Loading…" text or divergent pulse animation.
- Given the scope picker rendered from its four entry points, when captured, then all four are pixel-identical in chrome.
- Given the triage and overflow controls, when measured at ≤1024px viewport, then targets are ≥44px.

**Plan calls.** Standard architecture pass. `/design` only for the new compact state-component variants and the scope-picker anatomy (small, single-variant decisions). Where a primitive needs a prop the holdout requires, extend the primitive — do not fork it.

**Contracts / constraints.**
- `.claude/rules/reuse-first.md` is the operating rule: extend primitives over creating page-local equivalents; any surviving local implementation carries a written justification.
- No behavior changes — identical data, identical interactions, consistent rendering.
- Primitive extensions land with updated `.stories.tsx` states.

**Out of scope.** Dropdowns (**AG5**), the row/table primitive and its Work-view adoption (**AG6**), Settings surfaces (**AG7**), dialogs (**AI2**), status chips (**AI4**), time labels (**AI3**).

**Effort.** L (~1.5d)

---

### AI6 — The design system holds itself to its own rules

**Workpackage.** As a user interacting with any design-system component, I want the system's own atoms to be coherent — one focus-ring treatment, one uppercase-tracking treatment, no off-palette colors, the same content rendered with the same chrome by every renderer — so that the foundation everything else is being consolidated onto is itself clean; and as a contributor, I want the missing semantic tokens to exist so I never have a reason to hardcode a tint again.

**Why this matters.** The exhaustive review found the design system diverging from its own conventions: five focus-ring treatments across components (outline 2px/+2 offset vs 1px/−1 vs 1px/none vs shadow-based ×2), hardcoded uppercase tracking (0.02–0.05em) across the Artifact* family, RichMessageCard, ThreadShell, StatusChip, and CommentRow where `--tracking-caps`/`--tracking-caps-sm` tokens exist, hardcoded hover hexes in `Button.tsx` (`#c53e30`, `#b86305`) with no token counterpart, raw Tailwind palette in `url-renderer.tsx` (`bg-green-500/amber-400/red-500`) and undefined `bg-success/10` classes in `code-renderer.tsx`, `prose prose-invert` in `text-renderer.tsx`, and the block/ vs kinds/ renderer families disagreeing on container radius for identical content types. Meanwhile recurring tints (`rgba(217,119,6,0.08)` ×5, `rgba(46,125,186,0.08)` ×4, the AppShell scrim) have no token to use — the system forces the hardcoding it forbids. Every consolidation workpackage in this track and Track AG inherits whatever the primitives do; fixing the primitives once fixes every adopter.

**What exists today.** `tokens.css` defines `--accent-primary-dim` but no secondary/info/error dim variants, no scrim, no hover-tint scale, no Button hover colors; `clickable.ts` defines one focus convention that form controls don't follow; the divergences above verified at file:line in the 2026-06-12 review. The eslint-plugin-design color rules miss values inside template strings.

**What's genuinely missing.** One documented convention each for focus, hover tinting, and uppercase tracking — applied to every component; the missing semantic tokens; renderer families reconciled so the same payload kind gets the same chrome; lint coverage extended to the gaps that let these survive.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Keyboard focus looks the same on every interactive design-system component — one documented treatment, verified by tabbing through the component catalog and capturing the focus states.
- Every uppercase label in the design system carries a tracking token; no hardcoded tracking values remain in DS components.
- Zero hardcoded color values (hex, rgba, raw Tailwind palette) remain inside design-system components; the recurring tints and the scrim have semantic tokens, and the lint rules catch the template-string and arbitrary-value forms that previously slipped through.
- The same content kind rendered through a block payload and through an artifact kind-renderer shares the same container treatment (radius, border, empty-state styling).
- Hovered and selected states are visually distinct in every menu/list component that has both.
- All component motion uses the Hearth motion scale.

**Validation scenarios.**
- Given the `/designsystem` catalog, when Playwright tabs through Button, Input, Select, TabBar, ThreadRow, and Block and captures each focus state, then the review finds one consistent treatment.
- Given an image and a table rendered as a block payload and as an artifact preview, when captured side by side, then container chrome matches.
- Given the extended lint rules, when a hardcoded rgba is introduced inside a template string in a DS component, then lint fails.
- Given the slash-menu with one item hovered and another selected, when captured, then the two states are visually distinct.

**Plan calls.** `/design` for the three conventions (focus, hover-tint scale, tracking application) — single-variant ratification against `AESTHETICS.md`, not exploration; then standard architecture pass including the token additions and lint-rule extensions.

**Contracts / constraints.**
- Token additions go through `DESIGN.md`/`tokens.css` as the single source; components consume, never define.
- No component API changes — props and behavior stay; only chrome converges.
- `.stories.tsx` states updated where focus/hover rendering changes.

**Out of scope.** New components. The dialog primitive (**AI2**). Web-package adoption of DS components (**AI5**). The dropdown (**AG5**) and row (**AG6**) primitives — though both consume the conventions this lands.

**Effort.** M (~1d)

---

### AI7 — Every page shares one anatomy

**Workpackage.** As a user moving between the app's pages, I want every page to carry the same skeleton — the same title treatment, the same section-header treatment, the same scroll behavior — so that the product feels like one place with many rooms, not many apps behind one sidebar.

**Why this matters.** Today the page chrome forks: WorkBet/WorkTask/WorkPortfolio/Conversations/Knowledge pin their headers (`shrink-0` header + scrolling body) while WorkRoutine and WorkTeam let the header scroll away; section titles render at 13px on one half of the app and 12px (`text-xs font-heading` — an undefined utility class) on the other; page titles are consistent except where one page restates the same values as inline styles. Each difference is small; together they are why screens "feel built by different people on different days" — the same complaint that motivated AG7 for Settings, generalized to every page.

**What exists today.** A de-facto standard exists and most pages follow it: `text-[20px] font-[600] tracking-[-0.01em]` titles, `px-[24px] py-[18px]` pinned headers, 13px uppercase section titles with `tracking-[0.06em]`. The deviations are enumerated in the 2026-06-12 review: WorkRoutine/WorkTeam scroll-away headers and 12px `font-heading` section titles, KnowledgeCreate's inline-style title. No `PageHeader`/`SectionHeader` primitive exists — the standard lives as repeated class strings, which is how the forks happened.

**What's genuinely missing.** The page and section header as shared primitives embodying the existing de-facto standard, adopted by every primary page, with the scroll-behavior rule settled once.

**Depends on.** None. (AG1 recomposes the team screen's content; AI7 supplies the header/scroll anatomy that composition sits in — coordinate, AG1 leads on that page.)

**Complexity.** M

**Acceptance criteria.**
- Every primary page presents its title with one treatment and its section headers with one treatment — no per-page font-size or tracking forks, no undefined utility classes.
- Header scroll behavior follows one rule on every page: scrolling long content keeps orientation consistent app-wide.
- The header anatomy exists as catalogued, story-backed primitives, and the repeated header class strings are gone from page files — a new page composes the primitive.
- No regression to any page's content, actions, or navigation.
- Cross-page consistency is proven by a Playwright sweep capturing every primary page's header region and reviewing the set side by side.

**Validation scenarios.**
- Given all primary pages (portfolio, team, bet, task, routine, conversations, knowledge list/detail, agent profile), when each header region is captured at desktop width, then titles and section headers are visually uniform across the set.
- Given the longest page scrolled to mid-content, when captured on two pages that previously diverged (WorkBet vs WorkTeam), then both exhibit the same header behavior.
- Given the codebase after the change, when searched for the old repeated header class strings and `font-heading`, then none remain in page files.

**Plan calls.** `/design` as a single-variant ratification of the existing de-facto standard (the decision is the scroll rule and the primitive's slots, not a new look), then standard architecture pass.

**Contracts / constraints.**
- The de-facto standard wins unless the design pass documents a reason otherwise — this is consolidation, not redesign.
- Coordinate with **AG1** (team screen composition) — AG1 owns that page's content layout; AI7's primitive must serve it, not fight it.
- Hearth tokens only; primitives live in the design system with stories.

**Out of scope.** The team screen's internal composition (**AG1**). Row anatomy (**AG6**). Sidebar/navigation chrome (**AG4**). Mobile information architecture.

**Effort.** M (~6h)
