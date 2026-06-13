# AG4 — Architecture

Inputs (locked): `plans/AG4/concept.md` (Back≠Up), `plans/AG4/design/approved.md` (in-pane nav header + consolidated `Breadcrumb`).

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handles |
|---|---|---|
| "back button + parent-path logic exist, narrow-viewport only" | `AppShell.tsx` `isDetailRoute` (L168) + `navigateToParent` (L191) — mobile branch only, deliberately NOT `navigate(-1)` (`@lore AE4`) | Extract both into pure `parentPathFor(pathname)` + reuse in desktop breadcrumb. Keep mobile back wired to same resolver. |
| "Breadcrumbs exist on some screens, inconsistent" | **7** hand-rolled: WorkBet L912 + WorkTask L179 (`/`-separated text links); WorkTeam L251, WorkRoutine L173, AgentProfile L140 (`← X` chip style); KnowledgeDetail L292 (`KnowledgeDetailBreadcrumb` fn); **KnowledgeCreate L117** (`Knowledge / New`, create page — breadcrumb-only, no cluster) | One `Breadcrumb` DS component replaces all seven. 6 detail routes get the `leading` cluster; KnowledgeCreate gets breadcrumb-only (not a detail route). |
| "⌘K works, ⌘1/2/3 documented not implemented" | `useCommandK.ts` = document keydown + preventDefault, **no text-input guard** (fires globally). The real typing guard lives at **AppShell L446-447** (`tagName input/textarea / isContentEditable`). UX-8.4 lists ⌘1/2/3 but no impl, no `[`/`]`. | New `useNavShortcuts` hook: keydown/preventDefault pattern from `useCommandK`, **text-input guard from AppShell L446-447** (not from `useCommandK` — it has none). Update UX-8.4 to add ⌘[ / ⌘]. |
| "React Router with real history" | `createBrowserRouter` (router.tsx L125). Renderer loads `http://127.0.0.1:port` (Electron) or `http://localhost:5173` (dev) — **real browser history both ways**, no `file://`/hash router. | Back/Forward = `navigate(-1)`/`navigate(1)`; history works natively in both. |
| RR exposes `canGoBack`/`canGoForward` | **It does NOT.** RR v7.15.1 stores monotonic `idx` on `window.history.state.idx` (verified in `chunk-D6LUOGOQ.js`). Forward-availability is not derivable from `idx`. | `canGoBack = (window.history.state?.idx ?? 0) > 0`. `canGoForward` via Chromium **Navigation API** `window.navigation?.canGoForward` (guaranteed in Electron Chromium renderer; present in Chromium dev browsers; falls back to `false`/always-render-disabled when absent). See Decision 2. |
| Electron `globalShortcut` available | `main.ts` uses `Menu` + IPC (`onOpenSettings`), no `globalShortcut`, no nav accelerators | Decision 1: renderer-level keydown, no Electron accelerators. |

No spec/concept-doc contradictions. Proceed.

## Phase 0 — Interrogations (resolved, not blocking)

1. **`canGoForward` reliability across environments.** Resolved → Decision 2. Electron renderer is Chromium ⇒ `window.navigation` present. Plain-browser dev: Chromium-based dev browsers have it; non-Chromium fall back to rendering Forward disabled (acceptable — Forward is the rare case; AC only mandates Back+Up to be reliable).
2. **Should ⌘1/2/3 use Work's single-team skip rule?** Yes — ⌘2 must call the same `handleViewChange("work")` that already encodes AD3's "1 team → skip portfolio" logic. Don't reinvent the target path. Confirmed against `AppShell.tsx` L314.
3. **Does `Breadcrumb` compute its own segments or receive them?** Receive. Pages already hold the entity (bet, team, knowledge item). `Breadcrumb` stays dumb (`segments` prop). `parentPathFor` is for the Up-target the mobile button + a future deep-link fallback need; breadcrumb segments carry their own `to`. Confirmed against approved.md OQ-2.

## Decisions (design-it-twice where non-trivial)

### Decision 1 — Where keyboard shortcuts live: renderer keydown vs Electron accelerators

**Chosen: renderer-level `document` keydown** (one `useNavShortcuts` hook in AppShell), NO Electron menu accelerators.

- *Alt A — Electron app-menu accelerators* (`accelerator: "CmdOrCtrl+1"` in `app-menu.ts`, IPC → renderer). Trade-off: native menu visibility + OS-level capture. Reject: (a) does **not work in browser dev** (no Electron menu) → violates "works in both" AC, forcing a *second* renderer impl anyway; (b) menu accelerators fire even when focus is in a text input (no per-keystroke guard) → violates "no hijacking while typing"; (c) couples nav to the desktop package.
- *Alt B — renderer keydown* (clone `useCommandK`). Trade-off: not shown in the native menu; must `preventDefault` to beat any browser default. Reject reason: none material — `useCommandK` already proves this pattern works in both Electron and dev, with the text-input guard.
- **Synthesis:** renderer keydown is the single impl that satisfies "both environments" + "no typing collision" with zero desktop-package change. ⌘, (settings) stays an Electron accelerator (unchanged) because it's not a nav key and already works.

### Decision 2 — Back/Forward availability signal

**Chosen: hybrid.** `canGoBack` from RR's `window.history.state.idx`; `canGoForward` from Navigation API with fallback.

- `useHistoryAvailability()` returns `{ canGoBack, canGoForward }`, recomputed on every `location` change (via `useLocation`) + on `popstate`.
  - `canGoBack = (typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0)`.
  - `canGoForward = window.navigation?.canGoForward ?? false`. (`window.navigation` is the Chromium Navigation API. ⚠️ UNVERIFIED that every dev browser exposes it — fallback `false` means Forward simply never shows in those, which is safe and within AC.)
- *Alt — track our own stack in sessionStorage.* Reject: re-implements what RR already maintains; brittle across deep-link reloads; the `idx` approach is what RR itself uses internally.
- **@lore to capture:** RR v7 has no public canGoBack/canGoForward; `idx` on `history.state` is the load-bearing internal we read. If RR changes its state shape this breaks — pin to the behavior, add a test asserting `idx` presence after a push.

## Component & file plan

### NEW: `Breadcrumb` (DS, Tier 1)
- `packages/design-system/src/Breadcrumb.tsx` + `Breadcrumb.stories.tsx` + barrel export in `src/index.ts`.
- Signature:
  ```ts
  export interface BreadcrumbSegment { label: string; to?: string; testId?: string } // to absent ⇒ current (non-link); testId passthrough for migration parity
  export interface BreadcrumbProps {
    segments: ReadonlyArray<BreadcrumbSegment>;
    leading?: ReactNode; // slot for the Back/Forward cluster
    LinkComponent?: ComponentType<{ to: string; className?: string; children: ReactNode }>;
  }
  ```
  - `LinkComponent` injected so DS stays router-agnostic (no `react-router` import in design-system). Web passes RR's `Link`; stories pass an `<a>`.
  - Renders `<nav aria-label="Breadcrumb">` flex row, 13px. Link segments + separators `--text-secondary` (AQ-010 ≥4.5:1 — **not** `--text-tertiary`, which is 2.85:1 decorative-only); current (non-link) segment `--text-primary`; links hover `--accent-primary`. Link `:focus-visible` = `outline: 2px solid var(--accent-primary); outline-offset: 2px` (reuse of Button's ring; links aren't DS Buttons so it's explicit). Middle segments `truncate max-w-[120px]`. `leading` rendered before the first segment inside the same flex row.
- Stories: 2-seg, 3-seg, 4-seg (truncated middle), with-leading-cluster, deep-link (leading = disabled back only).
- **Visual-parity:** also produce `packages/design-system/html/Breadcrumb.html` (design source of truth) matching the TSX; data-attrs per design-system rule.

### NEW: hooks (web)
- `packages/web/src/hooks/useNavShortcuts.ts` — document keydown:
  ```ts
  export function useNavShortcuts(opts: {
    onBack: () => void; onForward: () => void; onSwitchView: (v: ViewId) => void;
  }): void
  ```
  Guards: ignore when `target` is `input`/`textarea`/`isContentEditable`. **Guard template = AppShell L446-447** (`tagName === "input" || tagName === "textarea" || el.isContentEditable`) — this is the real, correct text-input guard. **Do NOT clone `useCommandK` for the guard:** `useCommandK.ts` has **no** typing guard (it fires ⌘K globally, only `preventDefault`s); copying it would ship `useNavShortcuts` with no guard → violates the "must not fire while typing" constraint + AC-5. Use `useCommandK` only as the document-keydown + `preventDefault` template, not for the guard. Binds: ⌘/Ctrl+`[`→onBack, ⌘/Ctrl+`]`→onForward, ⌘/Ctrl+`1|2|3`→onSwitchView(conversations|work|knowledge). `preventDefault` on match.
- `packages/web/src/hooks/useHistoryAvailability.ts` — `{ canGoBack, canGoForward }` (Decision 2).

### EXTRACT: parent-path resolver (web)
- `packages/web/src/navigation/parentPathFor.ts` — pure `parentPathFor(pathname: string): string | null`. Lifts the **matched-route branch logic** from AppShell `navigateToParent` (returns the explicit parent path string), but **deliberately does not reproduce the `navigate(-1)` fallback** (AppShell L208) for an unmatched route — a pure path-returning function structurally cannot, and "unknown→same path" would silently turn go-back into a no-op (a Back-vs-Up boundary violation: it mixes a history op into the structural resolver).
- **Fallback contract (explicit):** for an unmatched route `parentPathFor` returns **`null`**. The caller no-ops on `null` (Up has no structural target ⇒ do nothing, do NOT silently `navigate(-1)`). This drops the latent `navigate(-1)` deep-link smell that lived in the old resolver.
- `navigateToParent` becomes: `const parent = parentPathFor(location.pathname); if (parent && parent !== location.pathname) navigate(parent);`.
- **Required test:** the task-1 unit test must include the unmatched-route case asserting `parentPathFor("/some/unknown/route") === null` (replacing the previously-listed "unknown→same" assertion). Wire the AppShell refactor so the AE4 mobile-drawer test still passes (on an unmatched route the mobile back button now no-ops instead of going back — confirm no protected test asserts a go-back on an unmatched route; if one does, it is the latent smell and the assertion is updated, not the behavior bent).
- Used by mobile back button + available for deep-link fallback. Pure ⇒ unit-testable without a router.

### NEW: shell component for the nav cluster (web)
- `packages/web/src/shell/NavHistoryCluster.tsx` (+ `.stories.tsx`) — the `[←][→]` pair. Consumes `useHistoryAvailability` + receives `onBack`/`onForward`. Back: `Button variant="ghost"` icon-only 28×28, `disabled={!canGoBack}`. Forward: rendered only when `canGoForward`. This is the `leading` slot passed into `Breadcrumb` on detail pages.
  - @lore: cluster is desktop-only; mobile keeps the existing 48px header chevron.

### EDIT: AppShell (web)
- `packages/web/src/layouts/AppShell.tsx`:
  - Add `useNavShortcuts({ onBack: () => navigate(-1), onForward: () => navigate(1), onSwitchView: handleViewChange })` (desktop + mobile both — shortcuts global).
  - Refactor `navigateToParent` to `const parent = parentPathFor(location.pathname); if (parent && parent !== location.pathname) navigate(parent);` — no `navigate(-1)` fallback (see EXTRACT: parent-path resolver; `null` ⇒ no-op).
  - No new global band (Variant B rejected). Desktop branch otherwise unchanged.

### EDIT: detail pages + 1 create page — replace hand-rolled breadcrumbs with `Breadcrumb`
For the 6 detail routes, build `segments` from already-loaded entity data and (on desktop only) pass `<NavHistoryCluster .../>` as `leading`. KnowledgeCreate (create page) gets a `Breadcrumb` with **no `leading`** cluster (not a detail route — see route-checklist):
- `packages/web/src/pages/WorkBet.tsx` (L909-930 header) → `segments=[{label:"Work",to:"/work/portfolio"},{label:bet.team,to:"/work/portfolio"},{label:bet.title}]`.
- `packages/web/src/pages/WorkTask.tsx` (L176-210) → adds bet + task segments (`to:/work/bet/:id`).
- `packages/web/src/pages/WorkTeam.tsx` (L251-259) → replace `← Portfolio` chip with `segments=[{label:"Work",to:"/work/portfolio"},{label:team.name}]`. **Migration:** `data-testid="team-breadcrumb-back"` is asserted by tests → keep an equivalent reachable link; see Migrations.
- `packages/web/src/pages/KnowledgeDetail.tsx` (L291-320 `KnowledgeDetailBreadcrumb`) → delete local fn, use `Breadcrumb` with `segments=[{label:"Knowledge",to:"/knowledge"},{label:scope},{label:topic}]`.
- `packages/web/src/pages/KnowledgeCreate.tsx` (L117 local `<nav>`) → replace with `Breadcrumb`, `segments=[{label:"Knowledge",to:"/knowledge"},{label:"New"}]`, **no `leading` cluster** (create page, not a detail route). This also fixes its `--text-tertiary` AQ-010 violation via the new `--text-secondary` link color.
- Cluster/`leading` rendered only when `!sidebarMobile` (read `useViewportBreakpoint`) — and only on the 6 detail routes, never on KnowledgeCreate.

### EDIT: docs
- `docs/requirements/usability-requirements.md` UX-8.4 — add ⌘[ / ⌘] (Back/Forward) and pin ⌘1=Conversations, ⌘2=Work, ⌘3=Knowledge.

## Acceptance criteria → verification

| # | AC (from spec) | Verification |
|---|---|---|
| AC-1 | Detail screen: return to previous screen, 1 click + 1 keystroke, no sidebar | E2E `navigation.spec.ts`: portfolio→team→bet; click Back chevron → team; ⌘[ → portfolio. Assert URL + visible affordance each step. |
| AC-2 | Back/Forward traverse real history incl. cross-view | E2E: work bet → ⌘K → knowledge item → Back → asserts URL back on the bet. |
| AC-3 | Every detail screen shows hierarchy + 1-step up | E2E: on bet/task/team/knowledge detail, `nav[aria-label="Breadcrumb"]` visible; click parent segment → lands on parent. Component test per page renders `Breadcrumb` with expected segments. |
| AC-4 | Deep-link fresh screen: sane up path, no dead/misleading back | E2E: `page.goto('/work/bet/:id')` fresh; assert Back chevron `disabled` (or `aria-disabled`), breadcrumb present, parent segment works. Unit: `useHistoryAvailability` returns `canGoBack:false` when `history.state.idx===0`. |
| AC-5 | Keyboard-first: switch views + traverse history mouse-free; shortcuts match doc | E2E: ⌘1/⌘2/⌘3 switch views (assert active view); ⌘[/⌘] traverse. Unit: `useNavShortcuts` fires callbacks for each combo and **does not** fire while focus in an `<input>`. Doc updated (lint/manual). |
| AC-6 | Visually tested via Playwright, screenshots reviewed, zero hard-rule violations | E2E captures screenshots at portfolio→team→bet→back→back + cross-view; reviewer checks against `.claude/rules/aesthetic-quality.md`. |

## Ordered tasks

1. `parentPathFor.ts` (extract pure fn, `string | null`) + unit test (asserts bet→portfolio, task→bet, knowledge→list, agents→conversations, **unmatched route → `null`**). Refactor AppShell `navigateToParent` to `if (parent && parent !== pathname) navigate(parent)` — no `navigate(-1)` fallback. *(matched-route behavior unchanged — existing mobile tests stay green; the only delta is unmatched routes no longer go-back, which the old code shouldn't have done from a structural Up; confirm AE4 protected test holds)*
2. `useHistoryAvailability.ts` + unit test (idx-based canGoBack; navigation-API canGoForward with jsdom fallback false).
3. `useNavShortcuts.ts` + unit test (each combo fires; input-guard; preventDefault). Wire into AppShell.
4. `Breadcrumb.tsx` + `.html` + `.stories.tsx` + barrel export + component test (segments render, current non-link, link via `LinkComponent`, truncation class on middle).
5. `NavHistoryCluster.tsx` + `.stories.tsx` + component test (Back disabled when !canGoBack; Forward absent when !canGoForward).
6. Replace breadcrumbs in WorkBet, WorkTask, WorkTeam, KnowledgeDetail, WorkRoutine, AgentProfile (6 detail sites — pass cluster as `leading` desktop-only) **+ KnowledgeCreate (7th site, breadcrumb-only, NO cluster — create page)**. Preserve `team-breadcrumb-back` / `routine-breadcrumb-back` testids on the equivalent `Breadcrumb` link (Migrations).
7. Update UX-8.4 doc.
8. E2E `navigation.spec.ts` additions (AC-1..AC-6) + screenshots.
9. `npm run check && lint && test && test:e2e`.

## Type signatures / contracts
(see component plan above — `BreadcrumbProps`, `useNavShortcuts` opts, `useHistoryAvailability` return.)
`parentPathFor(pathname: string): string | null` — returns the explicit parent path for a matched route, **`null` for an unmatched route** (caller no-ops; no `navigate(-1)` fallback).
ViewId order for ⌘1/2/3: `["conversations","work","knowledge"]` (sidebar order; matches `deriveViewFromPath`).

## route-checklist (breadcrumb coverage — every detail route must render `Breadcrumb`)
- `/work/bet/:betId` → WorkBet ✓
- `/work/bet/:betId/task/:taskId` → WorkTask ✓
- `/work/team/:teamId` → WorkTeam ✓
- `/work/routine/:routineId` → WorkRoutine — has a hand-rolled `← Portfolio` chip (L173-181, `data-testid="routine-breadcrumb-back"`). **Consolidate** → `Breadcrumb` (`segments=[{label:"Work",to:"/work/portfolio"},{label:team?},{label:routine.name}]`) + cluster. Migration: preserve a reachable parent link (see Migrations). Add to task 6.
- `/knowledge/:knowledgeId` → KnowledgeDetail ✓
- `/agents/:agentId` → AgentProfile — has a hand-rolled `← {teamName}` chip (L140-148). **Consolidate** → `Breadcrumb` (`segments=[{label: data.teamName ?? "Agents", to: <team-or-conversations>},{label:agent.name}]`). Note: AgentProfile's existing up-target is team-aware (team agents → team page, else portfolio/conversations); `parentPathFor` returns agents→conversations. Keep the page's richer team-aware `to` on the breadcrumb segment (the page has `teamName`); `parentPathFor` remains the generic fallback for the mobile button. Add to task 6.
- `/knowledge/new` → **KnowledgeCreate** (L117) — hand-rolled `<nav aria-label="Breadcrumb">`, static 2-segment (`Knowledge / New`), currently `--text-tertiary` (the AQ-010 violation). **NOT a detail route** — `isDetailRoute` (`@lore AE4`) excludes `/knowledge/new`, so **no Back/Forward cluster** belongs here. **Decision: migrate breadcrumb-only** (DS `Breadcrumb`, `segments=[{label:"Knowledge",to:"/knowledge"},{label:"New"}]`, **no `leading` cluster**). Rationale: leaving it hand-rolled ships the consolidation with a known-divergent 7th instance *and* keeps the `--text-tertiary` AQ-010 violation alive — a breadcrumb-only swap is cheap (2 static segments, no entity, no cluster) and inherits the `--text-secondary` fix for free. This is the "one Breadcrumb owner" premise honored, not silently broken. Add to task 6. No testid grepped on this breadcrumb — verify before deleting the local `<nav>`.
- `/conversations/:threadId` → Conversations — **out of scope** (spec: "Conversations-view threading nav" excluded). No breadcrumb change; cluster/⌘[ still work via global shortcut. Documented exclusion. (Distinct from KnowledgeCreate: Conversations threading nav is explicitly out of spec scope; KnowledgeCreate was merely an unlisted breadcrumb, now migrated.)

## Migrations (renamed/removed symbols → call sites)
Three chip-style breadcrumbs carry testids that tests/e2e assert. Replacing them with `Breadcrumb` removes those testids → must update or preserve:
- `team-breadcrumb-back` (WorkTeam) — grep tests/e2e; the `Breadcrumb`'s first segment link to `/work/portfolio` is the equivalent. Either (a) keep the testid on the first `Breadcrumb` link, or (b) reroute assertions to `nav[aria-label="Breadcrumb"] >> text=Work`. Prefer (a): `Breadcrumb` segment may accept an optional `data-testid` passthrough on links. List call sites: `WorkTeam.AG1.test.tsx`, `WorkProduct.test.tsx`, any `*.spec.ts` matching `team-breadcrumb-back`.
- `routine-breadcrumb-back` (WorkRoutine) — same treatment. Call sites: `WorkRoutine.AA1.test.tsx`, e2e.
- AgentProfile chip (no testid grepped) — verify before deleting.
- `KnowledgeDetailBreadcrumb` (local fn, not exported) — delete; no external call sites.
- KnowledgeCreate local `<nav>` (L117) — breadcrumb-only migration; no testid grepped on this `<nav>`. Verify before deleting (grep `knowledge-create` testids stay on the page wrapper, not the breadcrumb).
Builder must `grep -rn "team-breadcrumb-back\|routine-breadcrumb-back" packages/web` and update each before deleting the chips. This migration is part of task 6, not a follow-up.

## Security & abuse cases
- Rate-limit POST/PATCH — N/A (no new endpoints; pure client nav).
- Input-trust boundary — breadcrumb `to` paths are app-constructed from route params, not agent-authored free strings. Existing `sanitizeRouteId` already guards search-derived ids feeding `navigate`. `Breadcrumb` `to` comes from page entity ids already validated upstream. N/A new surface.
- Path traversal / SSRF — N/A (client-side route strings, no fs/network).
- Keyboard handler — must not `preventDefault` global keys it doesn't own (only the 5 combos) to avoid swallowing app shortcuts. Covered by unit test.

## protectedTests
- `packages/web/src/__tests__/AE4-mobile-drawer.test.tsx` — mobile back button behavior must not regress (parentPathFor refactor).
- `packages/web/e2e/navigation.spec.ts` existing assertions (sidebar layout, view switching) — extend, don't alter.
- `packages/web/src/__tests__/AppShell.*.test.tsx` — settings/filter behavior unaffected.

## sharedFiles
- `packages/web/src/layouts/AppShell.tsx`
- `packages/web/src/router.tsx` (read-only; no route changes expected)
- `packages/design-system/src/index.ts` (barrel — add `Breadcrumb` export)
- `packages/web/e2e/navigation.spec.ts`
- `docs/requirements/usability-requirements.md`

## Risks / ambiguities
- ⚠️ UNVERIFIED: `window.navigation.canGoForward` presence in the specific dev browser used for E2E (Playwright Chromium has it). Fallback: Forward hidden ⇒ no false affordance. Back (the load-bearing AC) uses the robust `idx` path.
- @lore risk: reading `window.history.state.idx` couples to RR internals. Mitigate with a unit test that pushes a route and asserts `idx` increments, so a future RR upgrade that changes state shape fails loudly.
- jsdom has no `window.navigation` and a minimal `history.state` — `useHistoryAvailability` tests must stub `window.history.state` / `window.navigation`; test-setup already shims matchMedia, follow that pattern.

## Required reading (builder)
- `plans/AG4/concept.md`, `plans/AG4/design/approved.md`
- `packages/web/src/layouts/AppShell.tsx` (L168-210 parent logic; **L446-447 = the text-input guard template for `useNavShortcuts`** — the only correct guard source)
- `packages/web/src/hooks/useCommandK.ts` (document-keydown + `preventDefault` template ONLY — has **no** text-input guard, do not copy it for the guard)
- `packages/web/src/pages/{WorkBet,WorkTask,WorkTeam,KnowledgeDetail,WorkRoutine,AgentProfile,KnowledgeCreate}.tsx` (7 breadcrumb sites — KnowledgeCreate is breadcrumb-only, no cluster)
- `packages/web/e2e/navigation.spec.ts` (extend)
- `packages/design-system/src/index.ts`, `DESIGN.md`, `.claude/rules/design-system.md` + `visual-parity.md` (Breadcrumb + .html requirement)
- `docs/requirements/usability-requirements.md` UX-8.4
