# Track AG: Work View Experience

Founder feedback from daily desktop use (2026-06-12): the Work view fails the Hearth quality bar in practice. The team screen renders as unstructured full-bleed boxes at desktop widths, the portfolio greets an empty factory with a stripped screen plus outcome filters that cannot match anything, bet authoring happens in a cramped dialog while the same block-backed content gets a full-page editor in Knowledge, and the Electron shell offers no back/forward affordances on desktop. The same session surfaced systemic inconsistency: dropdowns are styled ad-hoc rather than from a shared component, there is no shared item-table/row primitive, and the Settings screen is inconsistently designed. This track makes the Work view feel composed, honest, and navigable, and pulls the app's repeated UI shapes onto shared primitives.

**Track-wide proof bar.** Every workpackage in this track is only done when its surface has been exercised end-to-end via Playwright at desktop width, screenshots of every reworked state are captured and visually reviewed, and the review judges the journey seamless and the screens aesthetic (zero hard-rule violations against `.claude/rules/aesthetic-quality.md`). Component tests alone do not close these workpackages — the founder's complaints are about what the rendered app looks and feels like, so the proof must be the rendered app.

**Scope rules.** UI and journey quality of the Work view, shared UI primitives, and app-shell navigation only. No changes to bet/task lifecycle semantics, cost accounting, or the process-layer model. `npm run verify` must pass after every workpackage merges (same rule as Tracks AD–AF). Open source, no enterprise features. See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

**Reference docs:** `docs/ui-design/`, `docs/human-interface-layer/`, `docs/information-architecture/`, `docs/blocks/`, `docs/requirements/usability-requirements.md` (UX-8), `.claude/rules/aesthetic-quality.md`, `packages/design-system/DESIGN.md`.

---

### AG1 — Team screen composes at desktop widths

**Founder report (2026-06-12).** "I just opened the app — the work screen for a team is an absolute mess right now." (Screenshot evidence: full-bleed beige boxes spanning the whole window, cost labels and values at opposite window edges, section headers clipping into the pane edge.)

**Workpackage.** As a founder opening a team's Work screen in the desktop app, I want the page to read as a composed, legible surface — sections with clear boundaries, metric labels sitting next to their values, headers that are never clipped — so that I can scan the team's state (burn, bets, routines, agents) at a glance instead of deciphering it from edge-to-edge boxes.

**Why this matters.** The team screen is the daily landing surface for work; the founder reported it as "an absolute mess" on first open. Today, at a normal desktop window width, cost labels and their amounts sit two thousand pixels apart and section headers clip into the pane edge — the screen actively fights comprehension. The cost of not fixing it: the product's core work surface contradicts the Hearth quality bar the whole design system exists to enforce.

**What exists today.** The team detail page (`/work/team/:id`) renders a working stacked single column: team header with breadcrumb and status, burn-vs-cap metrics with a capacity progress bar, active bets, routines with a create dialog, agents with add/customize dialogs, first-run hints, artifact stack, and full empty/loading/error states. All data wiring, dialogs, and tests work. The layout has no width constraint or composition strategy for wide windows, so every section stretches full-bleed and key-value rows justify to opposite window edges.

**What's genuinely missing.** A desktop-quality composition of the existing content. The data and interactions are right; the spatial arrangement is not. Nothing functional needs to be added or removed.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- At desktop window widths from 1280px to 2560px, every section of the team screen is fully visible with no clipped or cropped text, and no text block or metric row exceeds a readable measure.
- Related values (a metric's label and its amount, a section's title and its action) read as visually paired rather than separated by the full window width.
- Empty states and first-run hints occupy proportionate space — a team with no bets and no routines still produces a screen that looks intentional, not abandoned.
- The narrow-viewport layout and all existing team-screen behaviors (dialogs, navigation, hints) continue to work unchanged.
- The screen is visually tested via Playwright at desktop width: screenshots of the empty-team and populated-team states are captured and reviewed, and the review finds the screen seamless to use and aesthetic — zero hard-rule violations against `.claude/rules/aesthetic-quality.md`.

**Validation scenarios.**
- Given a team with no bets and no routines, when Playwright renders the screen at 2000px window width and captures a screenshot, then the visual review shows no clipped section headers, no full-bleed unstructured boxes, and an intentional-looking empty composition.
- Given a team with active bets, routines, and agents, when Playwright captures the screen at 1280px and at 2560px, then all rows are legible and paired label/value pairs are adjacent at both widths.
- Given the existing component test suite, when it runs after the change, then all team-screen behavior tests still pass.

**Plan calls.** `/design` required — this is a layout redesign of an existing surface; explore variants against the Hearth bar (`packages/design-system/03-hearth.html` is the quality reference) before architecture. Then standard architecture pass.

**Contracts / constraints.**
- Hearth tokens only — no off-grid spacing, no off-scale type, no cool grays (AQ rules enforced by lint).
- No new data requirements; the screen renders from the same team detail payload.
- No behavior regressions: existing dialogs, hints, and navigation keep working.

**Out of scope.** The portfolio screen (AG2). Bet creation flow (AG3). Navigation chrome and breadcrumb consistency (AG4). Shared row/table primitive (AG5). Any change to burn/cost calculation or team data shape.

**Effort.** M (~6h)

---

### AG2 — Portfolio arrival and honest filters

**Founder report (2026-06-12).** "When you click on the portfolio button you get to a weird screen — something in the journey is off." And: "On the list of all bets there are weird selectors (validated, refuted, partial, inconclusive, not evaluated) always shown but they have no meaning even to me, and there are no options they could filter, so the filtering is a mess."

**Workpackage.** As a founder clicking through to the portfolio, I want a screen that explains itself and offers only controls that can do something — a clear way to create the first bet when the portfolio is empty, and filters that only appear when they can actually distinguish bets — so that arriving there never feels like landing in a broken or different app.

**Why this matters.** The founder reported the portfolio as "a weird screen" and its filters as meaningless: today an empty portfolio strips away every control, and once a single bet exists, five outcome-verdict filter pills appear even though outcomes are only ever recorded after a bet completes — so for a young factory they are permanent dead chrome. The portfolio is the cross-team work overview; if its first impression is incoherent, the Work view's credibility is gone at the door.

**What exists today.** The portfolio page (`/work/portfolio`) renders a title, status tabs (all/active/completed/draft), outcome-verdict filter pills (validated / refuted / partial / inconclusive / not evaluated), per-team filter pills, a "New bet" button, and a bet card grid — but every one of those controls is hidden when zero bets exist, leaving only a title and an empty-state card. Outcome verdicts are recorded through a working evaluation flow that only applies to completed or killed bets, so young portfolios have no evaluated bets at all. Filtering, multi-select, and the create dialog all function.

**What's genuinely missing.** A coherent arrival state — the screen's purpose and primary action visible regardless of how much data exists — and honest filtering: controls that earn their place by being able to change what's shown, instead of rendering unconditionally once any bet exists.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Arriving at an empty portfolio, the user can tell what the screen is for and create a bet from a prominent affordance without hunting.
- Outcome-verdict filters are offered only when at least one bet has a recorded outcome; before that, no verdict chrome appears anywhere on the screen.
- Every filter control shown can change the visible result set given the current data; no control is permanent dead chrome.
- The screen's structure reads as the same place whether it holds zero, one, or fifty bets — controls appear as they become meaningful rather than the layout reassembling itself.
- Status and team filtering remain available once bets exist and combine predictably with each other.
- The arrival journey is visually tested via Playwright: clicking into the portfolio from the team screen and from the sidebar is exercised end-to-end at desktop width, screenshots of the empty, unevaluated, and evaluated portfolio states are captured and reviewed, and the review finds the journey seamless and the screens aesthetic — zero hard-rule violations against `.claude/rules/aesthetic-quality.md`.

**Validation scenarios.**
- Given zero bets, when Playwright navigates to the portfolio and captures a screenshot, then no verdict pills or status tabs render, the purpose of the screen is stated, and a create-bet affordance is visible.
- Given three bets none of which has a recorded outcome, when the portfolio renders, then status and team filters appear but no verdict filters do.
- Given at least one bet with a recorded outcome, when the portfolio renders, then verdict filters appear and selecting one changes the visible bet set.
- Given a team filter and a status filter active together, when bets are displayed, then only bets matching both are shown.

**Plan calls.** `/design` for the arrival and progressive-filter states (empty / unevaluated / evaluated portfolios), then standard architecture pass.

**Contracts / constraints.**
- No change to the outcome-recording flow or the verdict vocabulary — this workpackage governs when filters appear, not what outcomes mean.
- Hearth aesthetic rules apply to any reworked states.
- Filter controls reuse the shared dropdown/control primitives (AG5) where applicable rather than introducing new bespoke chrome.
- Existing portfolio tests updated, not deleted.

**Out of scope.** Sidebar navigation behavior, including the skip-portfolio-when-one-team rule (AG4 owns journey coherence). New filter dimensions (cost, date). Bet evaluation UX itself.

**Effort.** M (~5h)

---

### AG3 — Bet authoring is block editing

**Founder report (2026-06-12).** "When you add a new bet that's the wrong editor — that should be the exact same experience as when editing a block in the knowledge, because the content on the bet is also a block."

**Workpackage.** As a founder creating or editing a bet, I want the same full-page block-editing experience I get when writing a knowledge item — because a bet's content is the same block-backed body — so that shaping a bet feels like writing a document, not squeezing prose into a small box inside a form dialog.

**Why this matters.** Bets are the central commitment object of the process layer; shaping one well is the highest-leverage writing a founder does in the product. Today that writing happens in a cramped modal with a small fixed-height editor, while the identical content type gets a generous full-page surface in Knowledge — the founder immediately read this as "the wrong editor." The inconsistency also teaches users a false model (that bet content is a lesser kind of text), which the block architecture explicitly contradicts.

**What exists today.** Bet content is markdown stored on the bet, derived into Blocks at render time and displayed through the same block-rendering pipeline as knowledge items, with anchored discussions already wired. The same rich body editor component is used in three places: the bet create dialog (small fixed-height instance inside a form), the bet detail edit mode, and the knowledge create/edit pages (full-page surface with autosave and save-status feedback). The create dialog also collects bet-specific commitments (team, appetite). Docs (`docs/blocks/composition.md`) already name the bet pitch as a block host.

**What's genuinely missing.** Experience parity: a full-page authoring surface for creating and editing bets that matches the knowledge writing experience, with bet-specific commitments present but not crowding the writing. The editor component itself needs no replacement — the journey around it does.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Creating a bet offers the same authoring experience as creating a knowledge item: a full-page writing surface with the same block-editing capabilities and the same save feedback, not a dialog-constrained box.
- Editing an existing bet's content offers the same experience as editing a knowledge item's body.
- Bet-specific commitments (team, appetite) can be set during creation without interrupting or crowding the writing surface, and a bet cannot be created without the commitments that are required today.
- Content authored through the new flow renders identically in the bet detail view — blocks, headings, and anchored-discussion affordances all preserved.
- Abandoning creation mid-write does not leave a half-created bet behind.
- The authoring journey is visually tested via Playwright: creating a bet end-to-end (open, write with headings and lists, set commitments, commit) and editing an existing bet are exercised at desktop width, screenshots are captured alongside the equivalent knowledge authoring screens, and the review finds the two experiences matching, the journey seamless, and the screens aesthetic — zero hard-rule violations against `.claude/rules/aesthetic-quality.md`.

**Validation scenarios.**
- Given the user starts creating a bet, when Playwright opens the authoring surface and captures it next to the knowledge create surface, then the visual review confirms the same full-page writing experience with the same block capabilities.
- Given a bet authored with headings and lists, when its detail view renders, then the content displays through the block pipeline identically to how knowledge bodies render.
- Given the user abandons bet creation before committing, when they return to the portfolio, then no draft artifact of the abandoned bet appears.
- Given a bet is created through the new flow, when the team screen and portfolio render, then the bet appears exactly as bets created before this change.

**Plan calls.** `/design` for the authoring journey (entry points, where commitments live relative to the writing surface, create vs edit symmetry), then standard architecture pass. No new nouns — Bet and Block concepts are established (`docs/blocks/`, `docs/process-layer/`).

**Contracts / constraints.**
- The shared body editor remains the single rich-text editing component; no second editor implementation.
- Bet content stays a block-derived markdown body — no new storage dialect.
- Any team/appetite pickers use the shared dropdown primitive (AG5).
- Existing bet creation API contract preserved or evolved compatibly; bets created before this change render unchanged.

**Out of scope.** Version/conflict-safe saving parity for bet edits (knowledge has optimistic locking, bets do not — a real gap, but a data-integrity workpackage, not an authoring-experience one; register separately if prioritized). Task editing. Knowledge authoring changes.

**Effort.** M (~1d)

---

### AG4 — Desktop navigation: back, up, and shortcuts

**Founder report (2026-06-12).** "Jumping between the different screens feels very awkward — since it's an Electron app there are no forth and back buttons. The journey is broken."

**Workpackage.** As a founder using the HyperIdle desktop app, I want to move between screens the way I move through any desktop app — go back to where I just was, see where I am, and jump between views from the keyboard — so that drilling into a bet or a knowledge item never feels like a one-way door.

**Why this matters.** The app ships in an Electron window with no browser chrome, and today the only back affordance renders at mobile widths — on desktop there is none, which the founder experiences as "the journey is broken" every time he drills down. Navigation friction taxes every single interaction with the product; it is the difference between the app feeling like a place and feeling like a maze.

**What exists today.** The desktop shell is Electron; routing is React Router with real history, so back/forward state exists but is never surfaced on desktop. A back button and parent-path logic exist but render only at narrow viewports. Breadcrumbs exist on some Work and Knowledge screens but not consistently across detail surfaces. Global search (⌘K) with keyboard navigation works. View-switch shortcuts (⌘1/2/3) are documented in `docs/requirements/usability-requirements.md` (UX-8) but not implemented.

**What's genuinely missing.** Desktop-visible back/forward affordances (visual and keyboard), a consistent "where am I / go up one level" orientation on every detail screen, and the documented keyboard view-switching. The routing machinery is in place; the affordances on top of it are not.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- From any screen at desktop width, the user can return to the previous screen with one click and with one keystroke, without using the sidebar.
- Back and forward traverse the user's actual visit history, including across views (e.g. work → knowledge → back lands on work).
- Every detail screen shows where the user is in the app's hierarchy and offers a one-step path up a level.
- A screen opened fresh via deep link still offers a sane upward path — no dead or misleading back affordance.
- A keyboard-first user can switch between the primary views and traverse history without touching the mouse, and the shipped shortcuts match what `docs/requirements/usability-requirements.md` documents (either by implementing them or correcting the doc).
- The journeys are visually tested via Playwright: the portfolio → team → bet → back → back path and a cross-view jump-and-return are exercised end-to-end at desktop width, screenshots of the navigation affordances are captured and reviewed, and the review finds moving between screens seamless and the affordances aesthetic — zero hard-rule violations against `.claude/rules/aesthetic-quality.md`.

**Validation scenarios.**
- Given Playwright navigates portfolio → team → bet at desktop width, when the back affordance is activated twice (once by click, once by keystroke), then the app lands on the team screen and then the portfolio, with screenshots confirming the affordance is visible at each step.
- Given the user jumps from a work screen to a knowledge item via ⌘K search, when they go back, then they return to the work screen they came from.
- Given a bet detail page opened directly by URL with no prior history, when the screen renders, then an upward path to its parent context is offered and works.
- Given the documented view-switch shortcuts, when each is pressed, then the corresponding primary view opens (E2E).

**Plan calls.** `/design` for affordance placement (window chrome vs in-pane, relationship to breadcrumbs and the existing mobile back button), then standard architecture pass. Electron menu/accelerator integration is an architecture decision.

**Contracts / constraints.**
- History navigation must not break deep links (the existing parent-path behavior for fresh opens is a deliberate decision — preserve its intent).
- Shortcuts must not collide with existing ⌘K or text-input behavior (no hijacking keys while typing).
- Works in both the Electron shell and the plain browser dev environment.

**Out of scope.** Sidebar information architecture changes. Conversations-view threading or its navigation model. Multi-window support. Touch/mobile navigation (already has a back button).

**Effort.** M (~1d)

---

### AG5 — One canonical dropdown

**Founder report (2026-06-12).** "The dropdowns are all inconsistent. Do we not have a dropdown component that is shared?"

**Workpackage.** As a founder using any dropdown in the app — picking a team for a bet, a role for an agent, a model tier, a filter — I want every dropdown to look and behave the same, so that the product reads as one coherent system instead of a patchwork where each picker was styled by hand.

**Why this matters.** The founder noticed the inconsistency on sight, which means every user will. Dropdowns are one of the most repeated controls in the app; when each one is slightly different, the whole product feels unfinished. There is also a hidden cost: a shared design-system dropdown already exists but is bypassed everywhere, so today's divergence is pure accident, and every new picker added inherits the mess unless the canonical one is made the obvious default.

**What exists today.** The design system ships a `Select` primitive (catalogued Tier 0, with stories) — but it is never imported anywhere in the web app. Instead roughly sixteen call sites hand-roll native `<select>` elements with DaisyUI `select select-sm select-bordered` classes (settings model/agent pickers, bet and routine team pickers, appetite/schedule pickers, scope-change dialog), with class strings that drift between sites. Separately, three bespoke popover menus (the bet-actions overflow menu, the knowledge-detail overflow menu, the recipient picker) and one pill segmented control (knowledge scope) each reimplement open/close, positioning, and item styling from scratch.

**What's genuinely missing.** A single canonical dropdown that is actually adopted across the repeated select-style pickers, plus a decision on the bespoke popover menus — either folded into one shared menu primitive or explicitly kept distinct with a documented reason. The component largely exists; adoption and consolidation do not.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Every select-style picker in the app (settings, bet/routine creation, appetite/schedule, scope change, portfolio filters) renders through one shared dropdown primitive — no remaining hand-rolled native `<select>` with ad-hoc class strings for these pickers.
- All dropdowns share the same resting, hover, focus, open, and disabled appearance and the same keyboard behavior.
- The repeated popover/overflow menus are either consolidated onto one shared menu primitive or each carries a documented reason for staying distinct; no two menus duplicate the same open/position/item-style logic by accident.
- The shared dropdown is the catalogued, story-backed component a future contributor reaches for first, and using it requires less code than hand-rolling.
- The narrow-viewport and accessibility behavior (keyboard selection, focus ring, screen-reader roles) is at least as good as the controls it replaces.
- The consolidation is visually tested via Playwright: screenshots of dropdowns across at least three different surfaces are captured and reviewed side by side, and the review finds them visually consistent and aesthetic — zero hard-rule violations against `.claude/rules/aesthetic-quality.md`.

**Validation scenarios.**
- Given the settings, bet-creation, and routine-creation surfaces, when Playwright opens a dropdown on each and captures it, then the three are visually identical in chrome and behavior.
- Given a dropdown rendered by the shared primitive, when navigated by keyboard only, then it opens, moves selection, commits, and closes without a mouse, with a visible focus ring.
- Given the codebase after this change, when searched for hand-rolled `select select-sm select-bordered` pickers, then none remain outside the shared primitive.

**Plan calls.** `/design` to settle the canonical dropdown's anatomy and whether the popover menus fold into a shared menu primitive (evaluate promoting/replacing the existing `Select`), then standard architecture pass. Reference `packages/design-system/DESIGN.md` (the catalogued component list) so the result stays within the documented system.

**Contracts / constraints.**
- Exactly one canonical dropdown primitive — do not add a second parallel one.
- Hearth tokens only; no off-scale type, off-grid padding, or cool grays in the control chrome.
- Every replaced call site keeps its existing data and selection behavior — this is a presentation/consolidation change, not a behavior change.
- Component lives in the design system with a `.stories.tsx` rendering its key states at `/designsystem`.

**Out of scope.** The shared item-row/table primitive (AG6). The settings consistency pass (AG7). Net-new dropdown features (multi-select, async search) beyond what the replaced controls already do.

**Effort.** M (~1d)

---

### AG6 — One shared item-row / table primitive

**Founder report (2026-06-12).** "We should have a shared item table element with rows."

**Workpackage.** As a founder scanning any list in the app — a team's agents and routines, the bets on a portfolio, knowledge items, settings lists — I want rows that share one consistent anatomy (alignment, separators, hover, density, touch target), so that lists everywhere feel like the same product and a new list never has to be invented from scratch.

**Why this matters.** Lists of rows are the most repeated layout in the entire app, and right now several of the most visible ones are hand-rolled one-offs that drift in padding, separators, and column behavior. The founder explicitly wants a shared table/row element; building it pays off every time a list is added or changed, and removes a class of subtle inconsistency the eye registers as "unpolished" even when no single row looks wrong.

**What exists today.** The design system has four catalogued row molecules (thread, knowledge, comment, notification rows) that already share a flex-based anatomy, but they are not a general primitive and the Work view does not use them. Instead the team screen hand-rolls three row components (agent row, routine row, bet row) plus a repeated `rounded / surface-container / padding` list-container wrapper, each with its own column widths, separators, and touch-target handling. There is no shared `Row` / `ItemList` / `Table` base that arbitrary list surfaces can adopt.

**What's genuinely missing.** A single shared item-row/table primitive — a row with consistent alignment, hairline separators, hover, focus, and a guaranteed touch target, plus the list-container treatment around it — adopted by the repeated list surfaces so their bespoke row code collapses onto it.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A shared item-row/table primitive exists in the design system, catalogued with a `.stories.tsx` showing its key states (plain, with status indicator, with trailing action, selected, empty list).
- The repeated Work-view lists (a team's agents and routines, and at least one other list surface) render through the shared primitive rather than bespoke per-page row components.
- Rows rendered through the primitive share one consistent alignment, separator, hover, focus, and touch-target treatment, and meet the 44px touch-target rule at applicable viewports.
- Adding a new list to the app requires composing the shared primitive, not copying a hand-rolled row — verifiable by the bespoke Work-view row components being removed or reduced to thin column configs.
- Empty and loading states for lists are handled consistently through the primitive or its documented companions.
- The result is visually tested via Playwright: screenshots of at least two different list surfaces built on the primitive are captured and reviewed, and the review finds them consistent and aesthetic — zero hard-rule violations against `.claude/rules/aesthetic-quality.md`.

**Validation scenarios.**
- Given a team with agents and routines, when Playwright captures both lists, then their rows share one visual anatomy (alignment, separators, hover) and both meet the touch-target rule.
- Given the codebase after this change, when the Work-view row components are inspected, then the duplicated row/list-container logic is gone, replaced by the shared primitive.
- Given the shared primitive's stories, when rendered at `/designsystem`, then plain / status / trailing-action / selected / empty states all display correctly.

**Plan calls.** `/design` to define the row/table anatomy and column-configuration model (reconciling the existing thread/knowledge/notification rows with the Work-view rows), then standard architecture pass. Reference `packages/design-system/DESIGN.md`.

**Contracts / constraints.**
- One shared row/table primitive — existing specialized rows either compose it or are explicitly justified as distinct.
- Hearth tokens only; honor the touch-target and spacing AQ rules.
- Adopting the primitive must not regress existing list behavior (navigation, per-row actions, keyboard access) — the agent-row nested-button accessibility constraint in particular must be preserved.
- Lives in the design system with stories at `/designsystem`.

**Out of scope.** The canonical dropdown (AG5). The settings consistency pass (AG7). Converting every list in the app in one pass — adopt the repeated Work-view lists plus one more; remaining surfaces migrate opportunistically.

**Effort.** M (~1d)

---

### AG7 — Settings design-consistency pass

**Founder report (2026-06-12).** "The settings screen is inconsistently designed. I want a design consistency review throughout the settings page."

**Workpackage.** As a founder moving through the Settings page section by section, I want every section to feel designed by the same hand — the same section headers, labels, form controls, spacing, dropdowns, list rows, and buttons — so that configuring the product feels coherent instead of like a stack of screens built by different people on different days.

**Why this matters.** Settings is where a user forms their judgment of how carefully the product is made; inconsistency there reads as carelessness everywhere. A review of the page found systemic divergence: section headers that break the established title pattern, labels at five different sizes, form controls split across design-system components, raw DaisyUI classes, and hand-written inline styles, off-grid spacing, an undersized input, and dropdowns styled three different ways. Each is small; together they make the page incoherent, and the founder noticed.

**What exists today.** The Settings page is a working stacked single-page layout with a shared section-title pattern and roughly ten sections (profile, org chart, models, agents, assistant, appearance, credentials, notifications, worker, backend), all reachable and persisting correctly (per Track AF's settings work). The density toggle has already been removed. What varies is the construction: some sections use design-system `Input`/`Toggle`/`Button`, others use raw DaisyUI classes, and the org-chart section uses inline style objects; gap sizes, label typography, hint text, card-vs-flat treatment, dropdown styling, and input sizing differ section to section. The assistant section's internal heading breaks the section-title contract.

**What's genuinely missing.** Not new functionality — consistency. Every section needs to be brought onto one set of patterns for headers, labels, hints, spacing, controls, lists, and buttons, adopting the canonical dropdown (AG5) and the shared item-row/table primitive (AG6) where they apply.

**Depends on.**
- AG5 — the settings sections are among the heaviest dropdown offenders (model, agent, org-chart pickers); bringing them onto consistent dropdowns requires the canonical dropdown to exist first.
- AG6 — the agent and org-chart sections render list/table surfaces; unifying them onto the shared row/table primitive requires that primitive to exist first.

**Complexity.** M

**Acceptance criteria.**
- Every Settings section uses the same section-header treatment, the same label and hint typography, and the same spacing scale — no section breaks the established header pattern, and no off-grid spacing remains.
- Every form control of a given kind (text input, toggle, dropdown, button) is the same component across all sections; no section reaches for raw inline styles or a divergent control for a job another section solves with a shared component.
- All dropdowns in Settings render through the canonical dropdown (AG5); all list/table surfaces in Settings render through the shared item-row/table primitive (AG6).
- Card-versus-flat treatment follows one documented rule across the page rather than varying section to section without reason.
- No regression to settings reachability or persistence — every section still loads, edits, and saves as before.
- The whole page is visually tested via Playwright: every section is screenshotted top to bottom, the set is reviewed for cross-section consistency, and the review finds the page coherent and aesthetic — zero hard-rule violations against `.claude/rules/aesthetic-quality.md`.

**Validation scenarios.**
- Given the full Settings page, when Playwright screenshots each section, then headers, labels, hints, and spacing are visually consistent across all sections in review.
- Given any two sections with the same control type (e.g. a dropdown in models and a dropdown in agents), when captured, then they are the same component rendering identically.
- Given each section, when edited and saved, then persistence works exactly as before this change (regression check).
- Given the assistant section, when rendered, then its heading conforms to the shared section-title pattern.

**Plan calls.** `/design-critique` of the current page against the established patterns to produce the consistency target, then standard architecture pass to apply it section by section. No new nouns.

**Contracts / constraints.**
- This is a consistency/presentation pass — no settings behavior, persistence, or section set changes.
- Adopt AG5 and AG6 primitives rather than introducing new bespoke controls.
- Hearth tokens only; the page must pass the AQ lint rules with zero violations after the pass.
- Existing settings tests updated, not deleted; persistence tests must stay green.

**Out of scope.** Adding or removing settings sections. Changing what any setting does. Reworking credential/account security flows. The density toggle (already removed).

**Effort.** M (~1d)
