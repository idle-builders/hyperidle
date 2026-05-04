# L15 Slop Scan

Read-only scan for AI-specific anti-patterns across the L15 diff.

## Findings

### S1 — Try/catch swallows error with no information added
- File: `packages/web/src/pages/WorkTeam.tsx:204-256`
- Pattern: Useless try/catch — the `catch {}` block (no binding) swallows every error (network, JSON parse, abort) and collapses them into a single generic toast. Per `.claude/rules/typescript.md`: "Let unexpected errors propagate — no swallowing with try-catch." A failed `await response.json()` after a successful `response.ok` will be presented as "Could not post request" even though the request succeeded — leaving local state out of sync with the server.
- Suggested fix: Narrow the try to just `fetch(...)`. Re-throw or surface unexpected errors via the observability adapter; do not blanket-catch JSON parse failures from a 2xx response.
- Severity: high

### S2 — Optimistic-update toast lies about reality
- File: `packages/web/src/pages/WorkTeam.tsx:253`
- Pattern: Defensive fallback for impossible states / wishful-thinking copy — `showToast("Request posted to thread", "info")` fires even when `await response.json()` succeeded but `json.thread` is undefined (the `as ThreadCreateResponse` cast hides this). The unsafe `as` cast also violates the no-unsafe-`as` rule.
- Suggested fix: Validate the response shape (zod or manual check) and only toast success when `newThreadId` is a non-empty string; drop the `as` cast.
- Severity: high

### S3 — Unsafe `as Node` cast in click-outside handler
- File: `packages/design-system/src/TaskCard.tsx:62`
- Pattern: Unsafe type assertion (`event.target as Node`). Forbidden by `.claude/rules/typescript.md` ("no unsafe `as` casts"). `event.target` may be `null` or a non-Node EventTarget.
- Suggested fix: Guard with `event.target instanceof Node` before calling `.contains()`.
- Severity: medium

### S4 — Comment restates the code
- File: `packages/web/src/shell/Kanban.tsx:44-49`
- Pattern: Comment that restates the code in English ("Maps every TaskState to a Kanban column…") — the `Record<TaskState, …>` already documents this exhaustively. The "exhaustive Record" rationale is the only useful part.
- Suggested fix: Trim to a single sentence about why `null` is used (skip-set) rather than a partial map.
- Severity: low

### S5 — `id = Date.now() + Math.random()` for toast keys
- File: `packages/web/src/pages/WorkTeam.tsx:156`
- Pattern: Hand-rolled implementation of `crypto.randomUUID` (already used four lines later in the same file). Inconsistent and slightly slower; `Date.now() + Math.random()` is a fractional number used as an identity key.
- Suggested fix: Use `crypto.randomUUID()` for the toast id (or a monotonically-increasing counter ref).
- Severity: low

### S6 — Branched object literal duplicates fields just to omit one optional
- File: `packages/design-system/src/task-request.ts` consumer at `packages/shared/src/task-request.ts:111-128`
- Pattern: Defensive ternary that constructs two object literals (one with `disabledHint`, one without) when a single literal with `disabledHint: disabled ? hint : undefined` (omitted via exactOptionalPropertyTypes guard) is fine. Adds 16 lines of duplication that exists only to satisfy aesthetic preference.
- Suggested fix: Build one row object; conditionally spread `...(disabled ? { disabledHint: hint } : {})`.
- Severity: low

### S7 — `kill` row hardcodes "KILLED" outside the verb matrix
- File: `packages/design-system/src/TaskCard.tsx:235-246`
- Pattern: Hardcoded copy that duplicates what `task-request.ts` is supposed to be the source of truth for. The kebab renders all other verbs through `getRequestableVerbRows`, but `kill` bypasses the matrix and inlines the label and target — defeating the "single source of truth" claim in the task-request.ts header comment.
- Suggested fix: Either include `kill` in `ORDER_BY_STATE` with a `dangerous: true` flag, or expose a `getKillRow(state)` from shared so the label/target come from one place.
- Severity: medium

### S8 — `cardClickProps` branch makes the card silently non-interactive when kebab is present
- File: `packages/design-system/src/TaskCard.tsx:93-107`
- Pattern: Hidden coupling — when `showKebab` is true, the card-level `onClick` is silently dropped (`role="button"` and keyboard handler removed). A caller that passes both `onClick` and `onRequestStateChange` will see their `onClick` vanish at runtime with no warning. This is "configuration that's really code."
- Suggested fix: Document explicitly (lore comment) that kebab presence disables card click, or assert that `onClick` and `showKebab` are mutually exclusive at the type level.
- Severity: medium

### S9 — Mock callback bodies that do nothing
- File: `packages/web/src/pages/WorkTeam.tsx:163-178`
- Pattern: `handleMoveBet` and `handleAddToCanvas` are no-op callbacks with `_`-prefixed args and "Mock —" comments. These are placeholder stubs in production page code.
- Suggested fix: If L15 is shipping behavior, these should either persist or surface "not yet wired" via a toast — silent no-ops on user action are a bad pattern. At minimum gate behind an obvious UI affordance ("Coming soon").
- Severity: medium

### S10 — Bare `rounded` (no token) on column drop region
- File: `packages/web/src/shell/Kanban.tsx:167`
- Pattern: AQ-011 closed radius scale — `rounded` (Tailwind default 0.25rem) is off-scale; the project uses `--r0`/`--r1`/`--r2`/`--r3`/`--r-pill` exclusively.
- Suggested fix: Replace with `rounded-[var(--r1)]` or remove (the column has no visible border/background, so the radius is invisible anyway).
- Severity: low

### S11 — Off-grid `gap-2`/`p-1`/`mb-1`/`mt-1` outside density tokens
- File: `packages/web/src/shell/Kanban.tsx:160,161,167,178` and `packages/design-system/src/TaskCard.tsx:177,186,217`
- Pattern: AQ-002 — component internals must use `var(--density-gap)`/`var(--density-pad-*)`. Bare `gap-2`/`p-1` are 8px/4px hardcoded values that bypass the density ladder and break compact/comfortable density modes.
- Suggested fix: Replace with density tokens; add to opt-out manifest only if the component is intentionally density-static.
- Severity: medium

### S12 — Hand-rolled click-outside instead of DaisyUI focus-within
- File: `packages/design-system/src/TaskCard.tsx:56-68`
- Pattern: The `@lore` comment on line 31 claims "dropdown opens on focus-within (CSS-driven) so we don't need React state" — but the code below uses `useState(menuOpen)` + a `mousedown` document listener. The lore comment now lies about the implementation, which is worse than no comment.
- Suggested fix: Either revert to focus-within CSS approach (remove state) or update the lore comment to match the actual JS-driven implementation and explain why focus-within wasn't sufficient.
- Severity: medium

### S13 — `unread` ?? 0 then comparing `> 0` three lines later
- File: `packages/design-system/src/TaskCard.tsx:50-52`
- Pattern: `threadUnreadCount?: number` is optional; coalesce-to-zero then `> 0` check is fine, but `hasThread = threadExists === true || unread > 0` then `titleInteractive = unread > 0` — the title becomes a button only when there are unread messages, NOT when `threadExists`. Means a user cannot click the title to open an existing thread that has been read. Likely a logic bug masquerading as defensive code.
- Suggested fix: `titleInteractive = hasThread` (or document why read threads must be opened via kebab only).
- Severity: high

### S14 — `aria-label={`Task: ${title}`}` on non-interactive span
- File: `packages/design-system/src/TaskCard.tsx:139`
- Pattern: ARIA on a plain `<span>` with no role; screen readers will read "Task: …" for static text that isn't a control. Useless decoration.
- Suggested fix: Drop the aria-label on the non-interactive branch.
- Severity: low

### S15 — `font-heading uppercase tracking-[0.05em]` chrome on every metadata span
- File: `packages/design-system/src/TaskCard.tsx:196,206,224,242`
- Pattern: Heavy uppercase metadata typography repeated four times in one menu (UNREAD, "Request state change", per-row target, KILLED). AQ-007 + design-credo "dense, purposeful" — uppercase is a strong signal that loses meaning when applied to every secondary string.
- Suggested fix: Reserve uppercase for the section title; render verb targets in normal case, smaller `text-[var(--text-lo)]`.
- Severity: low

## Summary

- high: 3 (S1, S2, S13)
- medium: 5 (S3, S7, S8, S9, S11, S12) — note S11 medium counted once
- low: 6 (S4, S5, S6, S10, S14, S15)

Recount: high 3, medium 5 (S3, S7, S8, S9, S11, S12 = 6), low 6.
Final: **high 3, medium 6, low 6**.
