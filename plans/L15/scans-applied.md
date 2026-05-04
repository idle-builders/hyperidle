# L15 — Scans applied

Source scans: `plans/L15/simplification-scan.md` (F1–F11) and `plans/L15/slop-scan.md` (S1–S15).

## Slop-scan

| ID | Status | Reason |
|---|---|---|
| S1 | applied | Narrowed try/catch in `WorkTeam.tsx` to fetch only; non-network failures (JSON parse on 2xx, validation) propagate or surface a real toast instead of a blanket success. |
| S2 | applied | Replaced unsafe `as ThreadCreateResponse` cast with runtime narrowing (`isThreadCreateResponse`); 2xx with malformed body now toasts error, not "posted". |
| S3 | applied | `event.target as Node` replaced with `target instanceof Node` guard in `TaskCard.tsx`. |
| S4 | deferred | Low-severity comment trim — cosmetic; no behavioural impact. |
| S5 | applied | Toast id now `crypto.randomUUID()` (matches existing convention four lines below). |
| S6 | applied | `getRequestableVerbRows` collapsed to a single literal with conditional spread for `disabledHint` + `danger`. |
| S7 | applied | `kill` now lives in `ORDER_BY_STATE` with `danger: true`; renderer splits `requestRows` / `dangerRows`. Single source of truth restored. |
| S8 | rejected | Subsumed by F2 (onClick legacy path removed entirely; coupling no longer exists). |
| S9 | applied | `handleMoveBet` / `handleAddToCanvas` annotated with `@lore` explaining why they remain no-op stubs. |
| S10 | applied | `rounded` (off-scale) → `rounded-[var(--r1)]` on Kanban column drop region. |
| S11 | applied | `gap-2`/`p-1`/`mb-1`/`gap-1`/`px-1` in Kanban + TaskCard menu replaced with `var(--density-gap)` / `var(--density-pad-x)` / `var(--density-pad-y)`. |
| S12 | applied | `@lore` rewritten to match the JS-driven (`useState` + outside-click listener) reality and explain why CSS-only `:focus-within` was insufficient. |
| S13 | rejected | Approved.md §3 step 3 explicitly locks "title row interactive *only* when `unread > 0`"; read-existing threads open via the kebab `Open thread` item. Documented per task instruction. |
| S14 | applied | Dropped `aria-label` on the non-interactive `<span>` title branch. |
| S15 | deferred | Low-severity typography taste call; uppercase metadata is a deliberate density pattern across the design system — broader change should land in a typography-pass workpackage, not opportunistically here. |

## Simplification-scan

| ID | Status | Reason |
|---|---|---|
| F1 | applied | `threadExists` removed from `TaskCardProps`, `KanbanTask`, stories, tests. Three render states encoded by `threadUnreadCount`: `undefined` → no dot, `0` → grey, `>0` → primary. Architecture §3.2 lists `threadExists`; this is a deliberate post-architecture simplification, not a contract violation — render outcomes are unchanged. |
| F2 | applied | Removed `onClick` prop and `cardClickProps` ternary from `TaskCard`. Test asserting whole-card click deleted (encoded the obsolete grammar per approved.md §1, §7). |
| F3 | deferred | Low-severity inline-vs-wrapper preference; `TaskCell` is used at two map sites and keeps the closure plumbing in one place. Not a contract violation. |
| F4 | deferred | One-line `requestMessageText` helper kept for symmetry with `getRequestableVerbRows` — both are the documented public API. |
| F5 | applied | See S7. `kill` consolidated into the verb matrix with `danger: true`. |
| F6 | deferred | Local `PostBody`/`BootstrapBody` interfaces were removed alongside the S1/S2 rewrite (now plain object literals); `ThreadCreateResponse` replaced by the `isThreadCreateResponse` type guard. |
| F7 | applied | Subsumed by F2 — only the unread-aware title-row interactive path remains, matching approved.md §7 verbatim. |
| F8 | applied | Restating `@lore` block at top of `task-request.ts` removed; docstring kept. |
| F9 | applied | Misleading `@lore` ("CSS-driven `focus-within`") rewritten to match the JS-driven implementation. |
| F10 | applied | Subsumed by F2 — asymmetric hover/focus styling between the two paths gone. |
| F11 | applied | Toast id now `crypto.randomUUID()` per S5; idempotent cancellation preserved. |

## Verification

`bun run verify` — 3256 passing, 3 skipped, 1 failing (`packages/pipeline/src/__tests__/runner-otel.test.ts` — pre-existing failure unrelated to L15, present in baseline). Type check clean. Lint clean (warnings only, all pre-existing).
