# L15 Slop Scan

Read-only AI anti-pattern scan over the L15 working-tree changes in `ab/L15-1a`.
Scope: only the L15 files listed in the task brief. Pre-existing block-1a
plumbing (vitest-toon-reporter, scripts/verify.ts, pipeline/progress.ts) was
not scanned.

Anti-patterns checked: redundant comments, defensive null-checks,
ceremonial annotations, magical numbers, copy-paste functions, emojis
(forbidden), TODOs, unused exports, unsafe casts, dead code, narrative-style
comments that do not aid the next agent.

---

## MUST-FIX

### M1. Unsafe `as unknown as Thread` cast in `decodeThreadDetail`
File: `packages/web/src/pages/WorkTeamTaskThread.tsx:67-78`

```ts
const thread = {
    ...threadRaw,
    participants,
    pinned: threadRaw.pinned ?? false,
    resolvedAt: threadRaw.resolvedAt ?? null,
    lastActiveAt: threadRaw.lastActiveAt ?? new Date(0).toISOString(),
    createdAt: threadRaw.createdAt ?? new Date(0).toISOString(),
    initiatorId: threadRaw.initiatorId ?? "",
} as unknown as Thread;
```

Project rule (`.claude/rules/typescript.md`): "No `any`, no `@ts-ignore`,
no unsafe `as` casts." This is the textbook unsafe double-cast. Same
function has `value.messages as unknown as ReadonlyArray<Message>`
(line 78). The decoder validates four fields then lies to the type
system about the rest. If the server omits a required `Thread` field,
`ThreadShell` crashes on render with no decode error pointing at the
cause.

### M2. Defensive defaults that mask server contract drift
File: `packages/web/src/pages/WorkTeamTaskThread.tsx:60-75`

The "Defensively populate ThreadShell-required fields the server may
omit (participants, resolvedAt, pinned, etc.). Missing fields are
treated as safe defaults rather than crashing the render." comment plus
the `?? false`, `?? null`, `?? new Date(0).toISOString()`, `?? ""`
chain is classic defensive-null-check slop. Either the server contract
guarantees these fields (then defaults are dead code) or it doesn't
(then a missing field is a real bug that should surface, not be
swallowed by epoch-zero timestamps and empty-string `initiatorId`).
`new Date(0).toISOString()` silently producing `1970-01-01T00:00:00.000Z`
will break date sorting in `ThreadShell` without any error.

### M3. `biome-ignore lint/correctness/noUnusedImports` on imports that ARE used
File: `packages/shared/src/__tests__/task-verbs.test.ts:13`

```ts
// biome-ignore lint/correctness/noUnusedImports: imports are exercised by the contract assertions
import {
    formatRequestMessageBody,
    REQUEST_VERBS,
    ...
} from "../task-verbs.js";
```

Every one of those imports is referenced in the test body below. The
biome-ignore is a ceremonial annotation that lies. Either the lint
never fires here (then delete the comment) or there is a real config
drift (then fix that, don't paper over it). Carrying suppress comments
that don't apply teaches future agents to ignore lint output.

### M4. Stale `@lore` recording process meta, not architectural lore
File: `packages/design-system/src/__tests__/Tag.test.tsx:11-14`

```ts
* @lore L15 critique Round-2: Tag.test.tsx in the design-system package was
* mandated as a NEW file (it did not exist before) with three explicit
* assertion shapes. ...
```

`@lore` is for non-obvious facts that surprise the next agent reading
the code. "Critique Round 2 mandated this file" is process meta-
commentary, not a runtime/architectural gotcha. It will be stale within
a week and adds noise to `/lore` indexing. (Contrast: the `@lore` in
`packages/shared/src/task-verbs.ts:8-11` IS load-bearing — it explains
why the file lives in `@hyperidle/shared`. Keep that one.)

---

## SHOULD-FIX

### S1. Redundant `?? null` on a value already `string | null`
File: `packages/web/src/shell/Kanban.tsx:133`

```ts
const hasThread = (task.threadId ?? null) !== null && threadCount > 0;
```

`task.threadId` is typed `string | null | undefined`. `?? null`
collapses `undefined` to `null`, but the comparison `!== null` already
covers both. Simpler: `task.threadId != null && threadCount > 0`.

### S2. Magic constants for fake identity baked into a Tier-3 shell
File: `packages/web/src/shell/Kanban.tsx:110-111`

```ts
const DEFAULT_FOUNDER_ID = "u-founder";
const DEFAULT_FOUNDER_NAME = "A. Founder";
```

Fixture identities living in production code with no `@lore` flagging
them as fixture-only and no follow-up reference. The same string
`"u-founder"` appears unguarded across `WorkTeam.tsx`, the e2e test,
and the unit tests. When real auth lands, every default lives in
production code and must be hunted down. Mark them
`// @lore L15: fixture-only — replace when auth lands` or move to a
shared fixtures module.

### S3. Triple-nested ternary for chip rendering
File: `packages/web/src/shell/Kanban.tsx:155-163`

```tsx
{hasThread ? (
    threadUnread > 0 ? (
        <Tag label={`Thread (${threadCount})`} unread />
    ) : (
        <Tag label={`Thread (${threadCount})`} />
    )
) : (
    <span ...>Open thread</span>
)}
```

Same `Tag label={...}` repeated twice; the only difference is the
`unread` prop. Pass `unread={threadUnread > 0}` directly (the prop is
already `unread?: boolean`) and collapse to a single ternary, or
extract a tiny `<ThreadChip>`. Reading nested ternaries to discover a
one-bit difference is exactly the AI tell `/slop-scan` exists for.

### S4. Conditional with redundant clause
File: `packages/web/src/shell/Kanban.tsx:131-135`

```ts
const hasThread = (task.threadId ?? null) !== null && threadCount > 0;
if (!(hasRequest || hasThread) && threadCount === 0) {
    return null;
}
```

`hasThread` already requires `threadCount > 0`, so `!hasThread`
implies `threadCount === 0` OR `threadId === null`. The trailing
`&& threadCount === 0` adds nothing the prior `!hasThread` did not
already cover. Simplify to `if (!hasRequest && !hasThread) return null;`.

### S5. Redundant aria-label duplicating visible link text
File: `packages/web/src/shell/Kanban.tsx:147-163`

```tsx
const ariaLabel = hasThread ? ... : "Open thread";
<a href={...} aria-label={ariaLabel}>
    {hasThread ? <Tag .../> : <span>Open thread</span>}
</a>
```

When `!hasThread`, the visible text content of `<a>` is "Open thread"
AND the aria-label is "Open thread". Identical accessible name from
both — the aria-label is dead in that branch. The two-tier ternary
exists only to feed the unused branch.

### S6. `<a href>` for in-app navigation triggers a full reload
File: `packages/web/src/shell/Kanban.tsx:151`

`<a href={`/work/team/tasks/${task.id}/thread`}>` triggers a full page
load instead of using react-router's `<Link>`. This resets all in-page
state including any open popovers and any in-flight fetches.
`MemoryRouter` is now wrapped around the Kanban stories — the affordance
exists; use `<Link to=...>`.

### S7. Mock-only `handleMoveBet` left as a no-op stub
File: `packages/web/src/pages/WorkTeam.tsx:200-205`

```ts
const handleMoveBet = useCallback(
    (_betId: string, _targetStatus: "shaped" | "committed"): void => {
        // Mock — the team-board canvas does not persist bet moves yet.
    },
    [],
);
```

If Canvas drag-to-status is not implemented yet, the prop should be
optional on Canvas (let the caller omit it) rather than forcing every
caller to pass a no-op stub. Same applies to `handleSelectPitch` (line
208-211) — early-returns into nothing.

### S8. `INITIAL_TASKS` captured by mount effect — silent staleness once data is real
File: `packages/web/src/pages/WorkTeam.tsx:140-185`

The effect closes over `INITIAL_TASKS` (module constant) and only fires
on mount. When real task data arrives via SWR/server fetch, this effect
will silently use the stale fixture list. No `@lore` flags this. At
minimum add a `// @lore L15: rebind to live tasks once L17 lands the
server fetch.` so the next agent does not silently ship a broken thread
fan-out.

### S9. ARIA pattern mismatch on the Request popover trigger
File: `packages/web/src/shell/TaskRequestPopover.tsx:160-170`

The trigger declares `aria-haspopup="menu"` (line 160) but the popover
renders `role="dialog"` (line 169). ARIA mismatch — either the popup
is a `menu` (then verb buttons want `role="menuitem"` and arrow-key
navigation) or it's a `dialog` (then `aria-haspopup="dialog"` and the
focus management you have is correct). Pick one. The current focus-
management code (`triggerRef.current?.focus()` on close) matches the
dialog pattern; flip the trigger.

### S10. Empty `<span />` as a flex spacer
File: `packages/web/src/shell/Kanban.tsx:147`

```tsx
{hasRequest ? <TaskRequestPopover ... /> : <span />}
```

Empty-`<span />`-as-spacer is layout slop. Use `ml-auto` on the link
when there is no left affordance, or wrap the right side in
`<div className="ml-auto">`.

### S11. E2E test mock fan-out conflated into one giant handler
File: `packages/web/e2e/team-request.spec.ts:20-98`

The single `page.route("**/api/threads*", ...)` handler does method +
URL discrimination via string matching with mutable `postedBodies`. It
re-builds responses per request, mutates module state, and conflates
list/detail/create/append into one if/else tower. A test failure here
gives no signal about WHICH endpoint contract broke. Split into
separate `page.route` calls per endpoint pattern.

### S12. Test asserts on raw Tailwind class strings
File: `packages/design-system/src/__tests__/Tag.test.tsx:67-72`

Asserting on raw Tailwind class strings (`"bg-[var(--surface-ghost)]"`
etc.) couples the test to the implementation's exact utility classes.
Refactor `Tag` and the test breaks for no behavioural reason. Prefer
asserting on rendered styles or on `data-*` attributes.

---

## NICE-TO-HAVE

### N1. Narrative file-header comment on `task-verbs.ts`
File: `packages/shared/src/task-verbs.ts:1-11`

The header reads like prose ("Closed enum at 5 verbs", "The L15 popover
renders one row per verb..."). The TSDoc on each export already says
this. Trim to a one-line purpose statement plus the load-bearing
`@lore`.

### N2. Verbose RED-phase contract preambles in test files
Files:
- `packages/web/src/__tests__/TaskRequestPopover.test.tsx:1-15`
- `packages/web/src/__tests__/WorkTeamTaskThread.test.tsx:1-11`
- `packages/web/src/__tests__/Kanban.test.tsx:1-16`
- `packages/shared/src/__tests__/task-verbs.test.ts:1-11`
- `packages/web/e2e/team-request.spec.ts:1-13`

Every test file opens with a "RED phase / Contract" preamble listing
what the tests below assert. The `it(...)` strings already say it.
The preambles will go stale faster than the tests. Slim to 1-2 lines
or delete.

### N3. Numbered `// (a1) ... (a2) ... (a3)` sub-step comments inside one `it()`
File: `packages/design-system/src/__tests__/Tag.test.tsx:43-53`

Numbered sub-step comments inside a single `it()` are a tell that the
test is doing too many things. Either split into three `it()`s or
delete the labels — the asserts are self-describing.

### N4. Repeated `JSON.stringify` Response-builder boilerplate
Files:
- `packages/web/src/__tests__/WorkTeamTaskThread.test.tsx:38-48`
- `packages/web/src/__tests__/TaskRequestPopover.test.tsx:43-50`
- `packages/web/src/__tests__/WorkTeam.test.tsx:8-19`

Each test re-implements a tiny `Response`-builder. Extract a
`jsonResponse(body, init)` helper.

### N5. `@lore` block reads like documentation
File: `packages/web/src/pages/WorkTeam.tsx:5-11`

```
* @lore L15: handleMoveTask + COLUMN_TO_STATE are deleted (drag is gone from
* the Kanban). On mount we fetch per-task thread metadata via
* `GET /api/threads?host_kind=task&host_id={id}` for each visible task. The
* fan-out uses Promise.allSettled — a single failed fetch falls back to
* `threadId=null, threadCount=0` for that card. SLO: ≤ 800ms p95 for ≤ 25
* tasks (plan §5.3).
```

The "deleted X" half belongs in a commit message, not a perpetual file
header. The SLO belongs in the plan/spec, not at the top of every file
that touches it. Trim to "L15: fetches per-task thread metadata at
mount; see plan §5.3".

### N6. `// L15:` prefix on every inline comment is noise
Multiple files: `task-verbs.ts`, `Tag.tsx`, `TaskCard.tsx`,
`Kanban.tsx`, `WorkTeam.tsx`, `WorkTeamTaskThread.tsx`,
`TaskRequestPopover.tsx`.

Once the story ships, the `L15:` tag is just visual noise — `git blame`
records the story. Story-tagging works for `@lore` (lives forever);
for transient inline comments it's slop.

### N7. Unicode chevron `▾` instead of an SVG caret
File: `packages/web/src/shell/TaskRequestPopover.tsx:165`

```tsx
Request <span aria-hidden="true">▾</span>
```

AQ-105 forbids emoji-as-iconography. ▾ is U+25BE (geometric shape, not
an emoji), but the same family. The unread-dot in the same component
family uses a CSS-attached background span specifically because
"AQ-105 forbids emoji-as-iconography" (per the test comment in
`Tag.test.tsx:48`). Either the chevron is sanctioned, or it should
match the unread-dot policy. Confirm with /design.

### N8. No emojis found in scanned files. PASS.

### N9. No `TODO` / `FIXME` / `XXX` markers found. PASS.

### N10. No `console.log` calls found. PASS.

### N11. `JSX.Element | null` return on `WorkTeamTaskThread` is wrong
File: `packages/web/src/pages/WorkTeamTaskThread.tsx:90`

`WorkTeamTaskThread()` always returns one of four `<div>` blocks
exhaustively over a `LoadState` discriminated union — never `null`.
Declared as `JSX.Element` (correct). Flagged here only to note the
asymmetry vs `TaskRequestPopover(): JSX.Element | null` which IS
correct — the popover legitimately returns null for terminal-state
tasks.

### N12. `INITIAL_TASKS` `ownerAgentId` documented as fixture-only — good
File: `packages/web/src/pages/WorkTeam.tsx:39-43`

The `@lore` here ("`ownerAgentId` is fixture-only synthetic data...")
is exactly the right shape for a `@lore`. Positive finding — keep
this pattern, drop the rest.

---

## Summary

- **MUST-FIX:** 4
- **SHOULD-FIX:** 12
- **NICE-TO-HAVE:** 12 (N8, N9, N10, N12 are positive findings)

### Top 3 findings

1. **M1 — Unsafe `as unknown as Thread` double-cast** in
   `WorkTeamTaskThread.tsx:75` violates the explicit project ban on
   unsafe casts. The decoder validates four fields and lies about the
   rest.
2. **M2 — Defensive defaults masking server contract drift.** The same
   decoder papers over missing fields with `new Date(0)`, empty
   strings, and `false` — silently corrupting render data instead of
   surfacing the real problem.
3. **M3 — Lying biome-ignore comment.** `noUnusedImports` is
   suppressed on imports that are demonstrably used in the test body.
   Either the suppression is wrong or the lint config is — either way,
   ceremonial annotations that don't reflect reality train future
   agents to ignore the linter.
