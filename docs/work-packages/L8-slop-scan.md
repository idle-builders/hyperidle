# L8 — Slop Scan

Read-only findings. AI-specific anti-patterns only.

Severities: **Blocking** / **Major** / **Minor**.

---

## Blocking

None.

## Major

### M1 — Confused naming: `mode="legacy"`
**File:** `packages/web/src/components/ThreadSections.tsx:185-198`
**Finding:** "Legacy" labels the original behavior as deprecated while it is still the default and still has tests / stories. Either it's the default (rename to `default` or drop the prop) or it's deprecated (delete it). Naming behavior "legacy" the same week it ships is an AI tell — mirrors the doc's "see plan §3.2 for retirement plan" comment.
**Fix:** Resolve M1 / M2 from the simplification scan; rename or delete.

### M2 — Defensive `errorMessage !== null` instead of truthy check
**File:** `packages/web/src/components/ThreadSections.tsx:203`
**Finding:** Prop type is `string | null` with default `null`. Empty string would slip through `!== null` and render the error state with no message. Either widen to `string | null | undefined` and check truthily, or accept `boolean`. As written, the strict `!== null` is defensive paranoia about a value the component itself controls the default of.

### M3 — `participantId` is hardcoded `"u-founder"` at call site
**File:** `packages/web/src/layouts/AppShell.tsx:369` (`useConversationsThreads("u-founder")`)
**Finding:** The literal `"u-founder"` matches the demo seed user. There is no comment, no constant, no @lore. Future readers will hunt for where the current user is supposed to come from. Either thread it from the auth context or, if this is intentional for L8 (no auth yet), replace with a SCREAMING_SNAKE_CASE constant + a `@lore L8` comment naming the story that introduces real auth.

### M4 — `as HostKind` cast in `isThreadListRow`
**File:** `packages/web/src/hooks/useConversationsThreads.ts:56`
**Finding:** `HOST_KIND_SET.has(v.hostKind as HostKind)` — the cast happens before the membership check that would justify it. Use `Set<string>` typing so `.has(v.hostKind)` accepts a string and the post-check narrowing makes the cast unnecessary, or change the predicate to `(HOST_KIND_SET as ReadonlySet<string>).has(v.hostKind)`.

### M5 — Unused snippet/timestamp duplication
**File:** `packages/web/src/hooks/useConversationsThreads.ts:84-85`
**Finding:** Both `snippet` and `timestamp` are set to the same `formatRelative(row.lastActiveAt)`. Either real snippet copy is missing (and this is a placeholder that needs a `// TODO` with a story id), or one of the two ThreadRow visual fields is redundant for conversations mode and shouldn't be passed. The duplication looks like AI fill.

### M6 — Comment-as-essay around `borderClass` ordering
**File:** `packages/design-system/src/ThreadRow.tsx:47-55`
**Finding:** Comment "L8 §3.4 visual contract: when both `blocking` and `selected` are true, the primary (selected) border wins. Order classes so the selected border-color comes after the blocking one." But the code uses an `if/else if/else` — the ordering concern the comment describes (cascade order via class concatenation) is not what the code actually does. The comment describes a different design that was abandoned. Drop the comment; the ternary is self-explanatory.

## Minor

### m1 — Verbose JSDoc restating the prop name
**File:** `packages/design-system/src/ThreadRow.tsx:20-34`
**Finding:** Three new prop docstrings open with "L8 §3.4:" and re-state the prop's type/effect. Story references in component-internal docs rot fast. Trim to one short line per prop, drop the section refs.

### m2 — `: ("danger" as const)` and `: ("neutral" as const)` redundant
**File:** `packages/web/src/components/ThreadSections.tsx:173`
**Finding:** Already covered in simplification scan m6 — also reads as AI "be safe with literal types" noise.

### m3 — Empty-state copy drift
**File:** `packages/web/src/components/ThreadSections.tsx:222` ("No threads") vs `:273` ("No threads yet")
**Finding:** Two empty-state titles for the same component, differing by one word. Pick one.

### m4 — `aria-label="Pinned"` on a presentational glyph
**File:** `packages/design-system/src/ThreadRow.tsx:80-90`
**Finding:** The pin SVG has `role="img"` + `aria-label="Pinned"`, so screen readers announce "Pinned" before the title. Then the title element has `aria-label={`Thread: ${title}`}`. So a focused pinned row reads: "Pinned. Thread: Pricing experiment. …". Verify this matches the design intent (likely fine, but pin glyph could also be `aria-hidden` and pinned status conveyed via the row's accessible name instead).

### m5 — `tick` counter as retry trigger
**File:** `packages/web/src/hooks/useConversationsThreads.ts:99,138-142`
**Finding:** The `setTick((n) => n + 1)` retry pattern with a `useEffect` dep is the canonical "I don't know how to imperatively re-run an effect" AI pattern. Functional, but a `refetch` ref or a tiny query lib would be cleaner. Acceptable for L8; flag for the next refactor.

### m6 — `capitalize` helper used once on host kind for a placeholder title
**File:** `packages/web/src/hooks/useConversationsThreads.ts:76-78, 83`
**Finding:** Title is synthesized as `${capitalize(row.hostKind)} thread ${row.id.slice(0, 8)}`. This is a placeholder string masquerading as a thread title. Either the API needs to return a real title (file a follow-up), or mark the placeholder loudly with a `// TODO L?` comment. The polite-looking `capitalize` helper makes it look intentional.

### m7 — `data-thread-section-count` attribute with no consumer
**File:** `packages/web/src/components/ThreadSections.tsx:305`
**Finding:** Attribute is added but no test, CSS, or analytics hook reads it (only `data-thread-section` is referenced). If it's for tests, point a test at it; otherwise drop.

### m8 — Comment "// L8" prefix everywhere
**Files:** `ThreadSections.tsx`, `AppShell.tsx`, `useConversationsThreads.ts`, `ThreadRow.tsx`
**Finding:** Twelve "L8 §x.y:" comments across the diff. They make sense as @lore at decision points; on routine prop additions ("L8 §3.4: small mono pill at the right of the title") they're noise. Keep two or three load-bearing ones, drop the rest.
