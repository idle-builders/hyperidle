# AG4 — Concept

**Result: no new primitives. No reshaped load-bearing nouns. Proceed to /design.**

AG4 ships navigation *affordances* over machinery that already exists (React Router history + an existing parent-path resolver). It introduces no new domain concept and reshapes none. The five process primitives (Teams, Bets, Tasks, Sessions, Routines), Threads, Blocks, Artifacts are all inputs, used as-is.

## Phase 0 — Nouns the spec uses

| Noun | Working definition | Classification |
|---|---|---|
| **History** (visit history) | The ordered stack of URLs the user has visited this session; React Router's `window.history`. | **Stable** — exists, surfaced by AG4, not redefined. |
| **Back / Forward** | Traverse one step along visit history. | Stable verb on History; not a primitive. |
| **Up one level / parent path** | The structural parent of the current screen in the app's IA hierarchy (bet → portfolio, task → bet, knowledge item → list). Independent of visit history. | **Stable** — already implemented as `navigateToParent`/`isDetailRoute` in `AppShell.tsx` (mobile-only today). AG4 surfaces it on desktop and makes it consistent. |
| **Breadcrumb** | The orientation strip on a detail screen showing where you are in the hierarchy and offering the up-path. | **Stable concept, inconsistently realized.** Exists hand-rolled per page; no design-system component. AG4 unifies it — a *consolidation*, not a new concept. |
| **View** (primary view) | One of the three top-level surfaces: Conversations, Work, Knowledge. | **Stable** — `ViewId` in `shell-types.ts`, `deriveViewFromPath` in AppShell. AG4 adds keyboard switching (⌘1/2/3). |
| **Accelerator / shortcut** | A keystroke bound to a navigation action. | Stable mechanism (`useCommandK` is the template). Not a primitive. |

## Phase 1-3 — Essence (the two that matter)

Two distinctions are load-bearing for AG4 and are already settled in the codebase — restating them so /design and /architecture do not collapse them.

**Back ≠ Up.** These are two different traversals and AG4 must ship both as separate affordances:
- **Back** traverses *temporal visit history* (`navigate(-1)`). Cross-view by nature: work → knowledge → Back lands on work. Answers "where was I just now?"
- **Up** traverses the *structural IA hierarchy* (explicit parent path). View-local. Answers "what contains this screen?"
- They diverge constantly: arriving at a bet via ⌘K search from a knowledge item — Back returns to the knowledge item; Up goes to the portfolio. Both are correct for their question. Folding Up into `navigate(-1)` is the bug the existing code deliberately avoids (`@lore AE4` in AppShell: "Using navigate(-1) would break deep links").
- This is exactly the load-bearing distinction `/concept` exists to protect — Back is not Up, the way a Thread is not a Message.

**Deep-link rule (the preserved contract).** A screen opened fresh (deep link, no prior history) has *no* sane Back target — but it always has an Up target, because Up is computed from the URL structure, not from history. Therefore: the **Up affordance (breadcrumb) is the always-available orientation**; the **Back affordance is offered only when history exists** behind the current entry. This is what makes "no dead or misleading back affordance" (AC-4) achievable — Back disables/hides when there's nowhere to go back to; Up never lies because it's derived from the path.

## What AG4 is NOT (rejection list)

- **Not a router change.** Routes, route shapes, and deep-link URLs are untouched. AG4 is chrome on top of the existing `createBrowserRouter` tree.
- **Not a new Breadcrumb data model.** No structured breadcrumb-trail state, no per-route metadata registry beyond what's needed to name the parent. The parent path is computed from `location.pathname` (as `navigateToParent` already does), not stored.
- **Not history rewriting / `replace` games.** AG4 reads history; it does not manipulate the stack to fake breadcrumbs.
- **Not Up = Back.** (See above — the core rejection.)
- **Not sidebar IA.** Explicitly out of scope.
- **Not threading/Conversations nav.** Out of scope. (But the Conversations *view-switch* shortcut ⌘1 is in scope — switching to a view ≠ navigating inside it.)
- **Not verb/keyboard shortcuts for actions.** Only navigation shortcuts (Back/Forward/view-switch). A/R/X/S verdict shortcuts are a different workpackage's concern.

## Phase 4 — Contracts (one line each)

- **Cardinality.** Every detail screen has exactly one Up target. Back has zero-or-one target (zero on fresh deep-link entry).
- **Closure.** The set of Up mappings is closed and lives in one resolver (the consolidated `navigateToParent`). Adding a new detail route requires adding its parent mapping there — not scattering it.
- **Source of truth.** Back/Forward target = `window.history` (owned by React Router). Up target = derived from `location.pathname` (owned by the parent-path resolver). Breadcrumb labels = derived from loaded entity data already on the page (team name, bet title), with a structural fallback.
- **Identity.** No new identity; affordances key off `location.pathname` + history length.
- **Hard rule.** Up is never `navigate(-1)`. Up is always an explicit path computed from the URL. Violating this re-breaks deep links — the exact regression `@lore AE4` documents.

## Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Back / Forward** | Traverse visit history one step. | "go back" meaning Up; "previous page" |
| **Up** | Navigate to the structural parent of the current screen. | "back to list" used as a history op; "parent breadcrumb back" (existing test id `team-breadcrumb-back` is fine as an id, but the *concept* is Up) |
| **Breadcrumb** | The orientation strip carrying the Up affordance + hierarchy labels on a detail screen. | "nav header", "back bar" |
| **View switch** | Jump between the three primary views (⌘1/2/3). | "tab", "navigate" |

## UX-8 reconciliation note (for /architecture)

UX-8.4 documents ⌘1/2/3 (switch views), J/K, A/R/X/S, `?`. AG4's mandate is only the **navigation** shortcuts. The chosen mapping for ⌘1/2/3 must match the sidebar view order. AC says "either implement them or correct the doc" — /architecture decides per-shortcut: implement ⌘1/2/3 + Back/Forward; leave J/K/verdict/`?` to their owners and do not claim them. If the shipped ⌘1/2/3 ordering differs from any implied doc ordering, correct UX-8.4 to match. No doc contradiction found at concept level — UX-8.4 is underspecified (lists keys, not which number maps to which view), so /architecture fills it, it doesn't override it.

## Required reading (for /design and /architecture)

- `.pipeline/work-packages/TRACK-A*.md` → AG4 section (authoritative AC).
- `docs/requirements/usability-requirements.md` → UX-5.1 (drill-down hierarchy + "breadcrumbs navigate back up") and UX-8.4 (shortcuts).
- `docs/information-architecture/cross-view-navigation-map.md` (the parent/child edges Up must honor).
- `packages/web/src/layouts/AppShell.tsx` → `isDetailRoute`, `navigateToParent` (the existing mobile back/parent logic to extend), `useCommandK` wiring, desktop vs mobile branches.
- `packages/web/src/hooks/useCommandK.ts` (shortcut + text-input-guard template).
- `packages/web/src/pages/WorkBet.tsx`, `WorkTask.tsx`, `WorkTeam.tsx`, `KnowledgeDetail.tsx` (four hand-rolled breadcrumbs to consolidate).
- `packages/desktop/src/main.ts` + `app-menu.ts` + `preload.ts` (Electron menu/accelerator + IPC bridge; renderer loads over `http://` so browser history works natively).
- `packages/design-system/src/index.ts` + `DESIGN.md` (no Breadcrumb component exists — component-budget decision for /design).

## Rationale

The founder reframe is "the journey is broken — no forth and back buttons, it's a one-way door." That is not a request for a new concept; it's a request to *expose* concepts the system already has but only shows at mobile width. The single trap this concept doc guards against: a downstream agent wiring the desktop Back button or the breadcrumb to `navigate(-1)` for simplicity, silently merging Back and Up and re-introducing the deep-link bug `@lore AE4` was written to prevent. Back is temporal, Up is structural; ship both, keep them distinct.
