# L15 — Reviews Applied

Apply-review pass over the four parallel reviews
(`architecture-review.md`, `adversary-review.md`, `security-review.md`,
`design-review.md`). Final status: **3257 passing / 1 failed
(pre-existing pipeline `runner-otel`, unrelated to L15) / 3 skipped**.
Baseline before apply: 3256 passing.

## Findings disposition

| ID | Source | Severity | Status | Notes |
|---|---|---|---|---|
| DR4 | design-review | blocker | applied | `handleOpenThread` now bootstraps a thread server-side via POST /api/threads when none exists, then navigates to `/conversations/review?id=<thread.id>`. New unit test seeded with a fetch mock. |
| AR1 / SR1 / DR5 | adv / sec / design | high | applied | Per-task `pendingByTask` map in WorkTeam.tsx; passed through Kanban → TaskCard as `pendingVerb` prop. Kebab disabled, menu stays open with `loading-xs` spinner inline next to active verb. New `WorkTeam.in-flight-guard.test.tsx` proves rapid double-click posts only one fetch. |
| AR3 / DR6 | adv / design | high | applied (fallback) | Title-row gets `max-lg:min-h-[44px]` when interactive; menu rows get `max-lg:[&_li>button]:min-h-[44px]` so taps clear AQ-015. Full bottom-sheet (`modal modal-bottom`) deferred as `task-card-mobile-bottom-sheet` follow-up — visible in `plans/L15/follow-ups.md`. |
| DR1 | design-review | high | applied | Replaced `var(--surface-border)` with `var(--border-default)` (the actual token in `tokens.css`). |
| DR2 | design-review | high | applied | Kebab `aria-label` is now `Task actions for ${title}` (per-task disambiguation). Title-row tests updated to use exact-name match. |
| DR3 | design-review | high | applied | Added `<li role="none"><hr/></li>` dividers between Open thread / Request rows / Kill row sections per approved §4.1. |
| AR2 / DR9 | adv / design | medium | applied | `packages/design-system/html/TaskCard.html` updated to mirror the new TSX DOM (kebab + thread-dot + dropdown menu with all sections + dividers). Used `plans/L15/design/approved-mockup.html` as visual blueprint. |
| A1 | architecture-review | medium | applied (option b) | Updated `plans/L15/architecture.md` §9 protected-tests YAML to point at `packages/web/src/__tests__/TaskCard.optimistic-prohibition.test.tsx` (the actual location). Adding a jsdom runtime to design-system was a bigger footprint than the path drift; documented the reasoning inline in the plan. |
| A2 | architecture-review | medium | applied | Subsumed by DR4 fix. |
| DR7 | design-review | medium | applied | Added `KebabOpen` story that programmatically opens the menu via `useEffect(() => button.click(), [])`. |
| DR8 | design-review | medium | partial | Added `RequestInFlight` story (Pause pending). `WithUnreadDot` already covers the post-rejection visual; no separate `RequestRejected` story added (mapping is documented inline). |
| DR10 | design-review | medium | applied | Unread thread-dot now carries the `shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_30%,transparent)]` halo per approved-mockup line 29. |
| DR11 | design-review | low | applied | All four `tracking-[0.05em]` literals replaced with `tracking-[var(--tracking-caps)]`. |
| DR12 | design-review | low | applied | Kebab SVG bumped to `width=16 height=16`. |
| DR13 | design-review | low | applied | Menu width bumped from `w-56` (224 px) to `min-w-[240px]`. |
| AR4 | adversary-review | medium | deferred | Verb matrix `hold`/`killed` extension is implementer-filled; needs designer amendment. Tracked as `verb-matrix-spec-amendment` follow-up. |
| AR5 | adversary-review | medium | deferred | Async handler does not abort on unmount. Real but low-impact for L15's mock-data page; tracked as part of `task-card-mobile-bottom-sheet` work-up if the wrap-up surfaces it. |
| AR6 | adversary-review | medium | deferred | Menu items recompute from `state` on each render. Documented; not L15-blocking because `state` only updates via server events that L15 does not yet consume. |
| AR7 | adversary-review | medium | rejected | The test description is correct AS WRITTEN — `INITIAL_TASKS` has no `threadId`, so the first call IS a bootstrap, and the test's `rawBody.initialMessage ?? rawBody` shape-handler is by design. The lazy-bootstrap test covers the second-request branch explicitly. Adding a duplicate test for the seeded-threadId path adds noise without coverage gain. |
| AR9 / A8 | adv / arch | medium / low | deferred | StatusChip-unchanged assertion missing in Playwright spec. Vitest layer (`TaskCard.optimistic-prohibition.test.tsx`) covers it; defence-in-depth gap acknowledged. |
| AR8 | adversary-review | low | deferred | Drag-no-op e2e doesn't assert zero network. Added to follow-ups via the existing `kanban-no-dnd-network-assertion` slot. |
| AR10 | adversary-review | low | deferred | `isThreadCreateResponse` only validates `thread.id`. Tightening adds bytes without preventing a realistic failure mode (server returns a different thread.id — that would still be caught by the bootstrap navigation contract). |
| AR11 | adversary-review | low | deferred | Toast `role="alert"` for errors. Cosmetic a11y improvement. |
| AR12 | adversary-review | low | deferred | Explicit `draggable={false}` belt-and-suspenders. The drag-removal contract is already enforced by `Kanban.no-dnd.test.ts`. |
| AR13 | adversary-review | low | applied (verified) | Confirmed no caller passes `onClick` after the F2 simplification — `grep -rn "TaskCard"` clean across packages. No CHANGELOG needed (internal package, breaking change documented in `plans/L15/scans-applied.md`). |
| AR14 | adversary-review | low | rejected | Hardcoded English copy is acceptable for L15; no i18n infrastructure exists and adding one is its own workpackage. |
| AR15 | adversary-review | low | deferred | Title-row click vs kebab focus race — covered by AR5 follow-up. |
| A3 | architecture-review | low | deferred | `draggable={true}` absence not asserted in tests. The visible regression is caught by `Kanban.no-dnd.test.ts` source-text guard at the consumer surface. |
| A4 / A5 | architecture-review | low | deferred | Same as AR4 — verb matrix amendment. |
| A6 | architecture-review | low | rejected | Pre-existing no-op handlers; `@lore` annotations in place. |
| A7 | architecture-review | low | rejected | `@ts-expect-error` compile-time guard is sufficient; runtime test for an untyped JS caller is not the right level. |
| A9 | architecture-review | low | deferred | `participants: ["u-founder"]` only — tracked as `task-thread-agent-participant`. |
| A10 | architecture-review | low | applied (doc) | Added apply-review note to `plans/L15/architecture.md` §9 covering the F1 collapse + protected-test path drift. |
| SR2 / SR3 / SR4 / SR5 / SR6 | security-review | medium / low | deferred | All pre-existing — added/reaffirmed in `plans/L15/follow-ups.md`. |
| SR7-SR10 | security-review | informational | acknowledged | No action required. |

## Verification evidence

- `bun run check` — **clean** (zero type errors).
- `bun run lint` — **clean** (158 warnings, 0 errors; 1 formatting fix
  applied to TaskCard.stories.tsx).
- `bun run test` — **3257 passed / 1 failed (pre-existing
  `runner-otel.test.ts`, unrelated to L15) / 3 skipped (3261 total)**.
  Baseline before apply: 3256 passing.

## New tests added

- `packages/web/src/__tests__/WorkTeam.in-flight-guard.test.tsx` — proves
  rapid second click while a request is in flight does NOT fire a second
  fetch (AR1 / SR1 / DR5).

## Files touched (non-test)

- `packages/design-system/src/TaskCard.tsx` — pendingVerb prop, dividers,
  spinner, halo, aria-label, tracking token, SVG size, mobile min-h.
- `packages/design-system/src/TaskCard.stories.tsx` — `KebabOpen` and
  `RequestInFlight` stories.
- `packages/design-system/html/TaskCard.html` — full DOM mirror of the
  new TSX (kebab + dropdown + thread-dot + dividers).
- `packages/web/src/pages/WorkTeam.tsx` — bootstrap on Open thread,
  in-flight guard via `pendingByTask` state.
- `packages/web/src/shell/Kanban.tsx` — `pendingByTask` prop wiring.
- `plans/L15/architecture.md` — protected-tests YAML path correction +
  apply-review note.
- `plans/L15/follow-ups.md` — new file.
- `plans/work-packages/follow-ups.md` — L15 summary appended.

## Test path drift notes

- `WorkTeam.open-thread.test.tsx` — rewrote test description and added a
  fetch mock (since DR4 made Open thread bootstrap a thread); test now
  asserts navigation to `/conversations/review?id=<bootstrapped-id>`.
- `TaskCard.title-row.test.tsx` — selectors switched from
  `name: /implement login/i` to `name: "Implement login"` (exact match)
  because the kebab now also matches the regex via DR2's per-task label.
