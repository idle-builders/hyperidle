# L15 — Simplification Scan

Read-only scan of L15 changes against `plans/L15/architecture.md` and `plans/L15/design/approved.md`. Files in scope: `packages/shared/src/task-request.ts`, `packages/design-system/src/TaskCard.tsx`, `packages/web/src/pages/WorkTeam.tsx`, `packages/web/src/shell/Kanban.tsx`, plus the modified stories.

## Findings

### F1 — `threadExists` prop is redundant given `threadUnreadCount`
- File: `packages/design-system/src/TaskCard.tsx:50-51`, `packages/web/src/shell/Kanban.tsx:21-22`
- What: `hasThread = threadExists === true || unread > 0` collapses two booleans into one. The render only branches on three states (no dot / grey dot / primary dot). Those three states can be modelled with a single optional number: `undefined` → no thread, `0` → grey, `>0` → primary. The boolean adds a fourth representable combination (`threadExists=false, unread=3`) that is nonsensical.
- Why it's a problem: Two independent props gating one piece of UI invite contradictory call sites. Architecture §3.2 specifies the prop, but the design (§6) admits one-prop modelling — the boolean is design-locked to a state that the count already encodes.
- Suggested fix: Drop `threadExists` from `TaskCardProps`, `KanbanTask`, and the stories. Treat `threadUnreadCount: undefined` as "no thread", `0` as "thread, all read", `>0` as "thread, unread". Update `WithReadDot` to pass `threadUnreadCount={0}` only. (If you want to keep architecture compliance verbatim, leave it but document the redundancy — the simpler change is to delete the prop.)
- Severity: medium

### F2 — `onClick` legacy prop on TaskCard is dead in production
- File: `packages/design-system/src/TaskCard.tsx:16, 44, 93-107`
- What: `onClick` is preserved with a `cardClickProps` block that only fires when `!showKebab`. Architecture §3.2 keeps it for "legacy callers in stories/tests". But the new `WorkTeam.tsx` never passes `onClick` and the kebab is always shown when handlers exist. The 14-line `cardClickProps` ternary serves only stories/tests.
- Why it's a problem: Carrying production-card-body click semantics for a path that production never uses is exactly the "framework with one caller" anti-pattern. It also conflicts with approved.md §1: "Drag is a complete no-op... the card body is non-interactive" — the prop preserves an opt-in to the rejected always-clickable-body grammar.
- Suggested fix: Remove `onClick` and `cardClickProps`. Migrate any test/story that needs whole-card click to use the title row + `onOpenThread` path (the post-L15 grammar). One ternary, four state combinations, ~14 LOC gone.
- Severity: medium

### F3 — `TaskCell` wrapper inside Kanban is over-abstraction
- File: `packages/web/src/shell/Kanban.tsx:90-114`
- What: `TaskCell` is a one-call-site wrapper that maps `(taskId, verb)` callbacks back to per-task closures. It's used in two map sites in the same file (grouped + flat). The wrapper exists to dedupe ~10 lines of JSX.
- Why it's a problem: Inlining the `<TaskCard ... />` at both call sites is clearer than a private wrapper component — the component adds an extra render layer and a separate prop interface that mirrors `TaskCardProps` minus three fields. Architecture §6 task #10 doesn't mandate a separate component.
- Suggested fix: Inline the `<TaskCard …/>` JSX at both map sites; delete `TaskCell`. Net change is roughly zero LOC, fewer indirection layers.
- Severity: low

### F4 — `requestMessageText` helper is one-call-site indirection
- File: `packages/shared/src/task-request.ts:131-133`, used at `packages/web/src/pages/WorkTeam.tsx:202`
- What: `requestMessageText(verb)` is a one-line lookup wrapper around `REQUEST_TEXT[verb]`. Only one production caller (`WorkTeam.tsx`). The architecture §3.1 lists it as part of the "single source of truth", but exporting `REQUEST_TEXT` directly (or merging it into `RequestableVerbRow`) achieves the same and removes a function.
- Why it's a problem: A function whose body is `return TABLE[key]` is one inlining away from being clearer; the test surface duplicates the table.
- Suggested fix: Either (a) export `REQUEST_TEXT` directly and have callers index it, or (b) add `messageText: string` to `RequestableVerbRow` so the kebab and the post handler share one row object. Option (b) also removes the second lookup at the post site.
- Severity: low

### F5 — `getRequestableVerbRows` includes a row even when it duplicates the danger row
- File: `packages/shared/src/task-request.ts:70-79`, consumed at `packages/design-system/src/TaskCard.tsx:209-247`
- What: `ORDER_BY_STATE` lists `kill` only for `killed` (as "reopen"... wait — `kill` is intentionally NOT in the per-state arrays per the comment line 67-68). Good. But the TaskCard renders an extra hard-coded `Kill task` button below the verbRows map (lines 231-247) that bypasses `getRequestableVerbRows`. So the matrix helper is the source of truth for 6 verbs, and `kill` is hand-rolled in the component. Two sources of truth for "what verbs render".
- Why it's a problem: The architecture promised one helper as SSoT. A future agent adding a new danger verb (e.g. "abandon") will not know whether to extend the matrix or add another hard-coded button.
- Suggested fix: Either include `kill` in `ORDER_BY_STATE` with a `danger: true` flag on `RequestableVerbRow`, or document the split with a `@lore` comment in TaskCard pointing to why kill is special. Prefer the former — one render loop, one matrix.
- Severity: medium

### F6 — Lazy-bootstrap branch in `handleRequestStateChange` is fine but the `BootstrapBody` and `PostBody` types are over-typed for one call site
- File: `packages/web/src/pages/WorkTeam.tsx:128-145`
- What: Three local interfaces (`PostBody`, `BootstrapBody`, `ThreadCreateResponse`) defined for two `fetch` calls in one function. `satisfies PostBody` on the inline `initialMessage` is fine, but the named interfaces add ~17 lines for ergonomic types whose shapes are already enforced by the server's Zod schema.
- Why it's a problem: Local one-shot type aliases for inline JSON bodies are noise. The fetch payload shape is already pinned by the test (`WorkTeam.request-post.test.tsx`) and the server schema.
- Suggested fix: Inline the JSON shapes at the call sites with `as const` (or just plain object literals). Keep `ThreadCreateResponse` if the JSON parse needs a cast, but consider importing a server-side response type via `@hyperidle/shared` if one exists rather than re-declaring locally.
- Severity: low

### F7 — `onClick`-vs-`showKebab` branching means two separate keyboard paths on the title
- File: `packages/design-system/src/TaskCard.tsx:93-142`
- What: When `showKebab` is true and `titleInteractive` is true, the card renders a title row that's both an `<span role="button">` (with its own keydown handler) AND lives inside a card that may have `cardClickProps` if the kebab were absent. The interplay between `onClick` (whole card, when kebab hidden) and `onOpenThread` (title only, when unread + kebab present) is implicit and only correct because `cardClickProps` checks `!showKebab`.
- Why it's a problem: Two interaction modes selected by a hidden ternary. Hard to reason about, and conflicts with approved.md §7 keyboard spec ("Tab order on a card with kebab only: kebab. One stop per card, no body stop") — the `onClick` path violates the locked rule when no kebab handlers are passed.
- Suggested fix: Resolve via F2 (delete `onClick`). After F2 the only interactive title-row path is the unread-aware one, which matches approved.md §7 verbatim.
- Severity: medium

### F8 — `@lore` comment in `task-request.ts:9-11` restates the architecture doc
- File: `packages/shared/src/task-request.ts:9-12`
- What: The lore "humans REQUEST state changes; agents decide. The verb is encoded as a plain message payload" duplicates architecture.md §3.1 verbatim and the file-level docstring two lines above.
- Why it's a problem: Lore should capture non-obvious decisions or gotchas. This one is the API surface; it's already documented in approved.md and architecture.md.
- Suggested fix: Delete the `@lore` block; keep the docstring.
- Severity: low

### F9 — `@lore` on `TaskCard.tsx:25-36` is two long restatements of approved.md
- File: `packages/design-system/src/TaskCard.tsx:25-36`
- What: Two `@lore` paragraphs explain (a) optimistic update prohibition and (b) DaisyUI dropdown choice. Both are documented in approved.md §12 item 5 and architecture.md §3.5.
- Why it's a problem: The `setMenuOpen` React state in this file CONTRADICTS the lore comment ("dropdown opens on focus-within (CSS-driven) so we don't need React state"). The lore is actively wrong about the implementation.
- Suggested fix: Delete the second `@lore` paragraph (it's lying); shrink the first to one line referencing approved.md §12.5 — or delete it entirely since the type signature already enforces the prohibition.
- Severity: medium (the lore is wrong, not just redundant)

### F10 — `bg-accent/10` and other AQ-008 risks not flagged here, but `cardClickProps` introduces hover-bg `surface-ghost` only on the legacy onClick path
- File: `packages/design-system/src/TaskCard.tsx:105`
- What: The hover-tint and focus ring exist on the legacy whole-card-click branch but not on the new title-row-click branch. After F2, this asymmetry disappears.
- Why it's a problem: Inconsistent visual feedback between the two interactive paths.
- Suggested fix: Subsumed by F2.
- Severity: low

### F11 — `ToastState.id = Date.now() + Math.random()` — non-determinism for one piece of UI
- File: `packages/web/src/pages/WorkTeam.tsx:156`
- What: `id` is generated with `Date.now() + Math.random()` to make the close-timer cancellation safe across overlapping toasts.
- Why it's a problem: For a single-toast UI (only one toast slot in JSX), the id is unnecessary — a counter ref or even just `setToast(null)` after the timeout would do. The current code is correct but over-engineered for a single-slot toast.
- Suggested fix: Use a `useRef<number>(0)` counter and increment, OR drop the id check entirely and accept that an in-flight earlier-toast timeout might clear a freshly-shown toast (acceptable for a 4 s toast).
- Severity: low

## Severity counts

- high: 0
- medium: 5 (F1, F2, F5, F7, F9)
- low: 6 (F3, F4, F6, F8, F10, F11)

## Top 3 by severity

1. **F2** — Dead `onClick` legacy path on TaskCard. Production never uses it; conflicts with approved.md §7 keyboard spec; carries 14 LOC of indirection. Delete.
2. **F1** — `threadExists` prop is redundant with `threadUnreadCount`. Two booleans encoding three states invite contradictory call sites. Collapse to one optional number.
3. **F9** — `@lore` paragraph in `TaskCard.tsx` claims dropdown is CSS-driven, but the implementation uses `useState(menuOpen)`. Lore actively misleads future agents. Delete or rewrite.
