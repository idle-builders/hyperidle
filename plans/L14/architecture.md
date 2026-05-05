# L14 — Architecture Plan

## Required reading

- `plans/L14/concept.md` — vocabulary lock, noun classifications
- `plans/L14/design/approved.md` — visual contract, component vocabulary, all states
- `packages/server/src/services/bet-state-machine.ts` — existing transitions, VALID_TRANSITIONS
- `packages/server/src/routes/bets.ts` — existing endpoints; what's missing
- `packages/shared/src/types.ts` — BET_STATUSES, MUTABLE_BET_FIELDS
- `packages/db/src/schema.ts` — bets table (no title/costActual columns)
- `packages/web/src/pages/WorkBet.tsx` — existing page structure
- `packages/web/src/types/bet.ts` — BetDetail type
- `packages/web/src/hooks/useBet.ts` — data fetch hook
- `docs/process-layer/canonical-shapes.md` — RevisionLogEntry shape
- `plans/reviews/hardcoded-data-inventory.md` — L14/L17 fixture row

---

## Phase 0 — Interrogate

### Q1: Pause and resume — new routes or PATCH?

**Answer:** Two new routes: `POST /bets/:id/pause` and `POST /bets/:id/resume`. They follow the same pattern as `/commit`, `/ship`, `/kill` — one route per transition verb, body carries `{ reason: string }`. PATCH `/bets/:id` already handles mutable field updates (done_condition, hypothesis, appetite) — conflating lifecycle transitions into PATCH would break the state-machine's single-responsibility pattern and make the intent ambiguous at the HTTP layer.

### Q2: Does the actor belong in RevisionLogEntry?

**Answer:** Yes, extend RevisionLogEntry with `actor: string`. The spec says "who did it." The current shape (`{ timestamp, field, old_value, new_value, reason }`) is missing this. L14 adds `actor` to the type. The actor value for all L14-surfaced actions is `"u-founder"` — the same static constant used throughout the codebase (`WorkBet.tsx:183 FOUNDER_ID`). When real auth lands, this constant is replaced in one place. The RevisionLogEntry type is extended now; old entries written without actor will have `actor: undefined` at read time — safe because the field is optional at the type level.

### Q3: What does GET /bets/:id actually return vs. what BetDetail expects?

**Critical spec/reality drift:** The `bets` DB table has no `title`, `product`, `team`, or `progress` fields. The current `GET /bets/:id` returns `{ ...bet, tasks: betTasks }` — a raw DB row. The `BetDetail` type (and all E2E tests) assume `title`, `product`, `team`, `progress` are on the response. This means either:
- (a) The wire shape never matched the BetDetail type — all existing tests mock the API and never hit the real endpoint
- (b) The real app currently shows `undefined` for title/product/team in production

The safest fix for L14: **enrich the GET /bets/:id response server-side with joins** to derive the missing fields. This is the correct long-term shape. The alternative (client-side derivation) violates the three-layer boundary.

Server enrichment:
- `title`: derived from the first non-empty line of `pitch` (strip markdown markers, take first 60 chars). No new DB column needed; computed at query time.
- `product`: join `products.name` via `bets.productId`.
- `team`: join `teams.id` (display as team ID for now, or join a future name column if available).
- `progress`: `{ done: count(tasks WHERE state='done'), total: count(tasks) }` — computed from the tasks already fetched.

### Q4: Cost context in ConsequencePreview — L17 dependency?

**Answer:** The `bets` table has no `costActual` column. L17 adds money tracking to bets. L14 must render the cost context block conditionally — `bet.costActual !== null && bet.costActual !== undefined`. Since the field doesn't exist yet, it will always be absent and the block will always be hidden. The UI component receives an optional `costActual?: number` prop; when undefined, the block does not render. No blocking dependency on L17.

### Q5: Actor field — update RevisionLogEntry in shared package?

**Answer:** Yes. The `RevisionLogEntry` interface in `bet-state-machine.ts` is extended with `actor?: string` (optional, backward-compatible). The shape in `docs/process-layer/canonical-shapes.md` is updated to match. The `transitionBet` and `updateBetField` functions accept an optional `actor` parameter.

---

## Phase 1 — Plan reconciliation

| Spec assumption | Reality | Resolution |
|---|---|---|
| `POST /bets/:id/pause` route | Does NOT exist | Add in `bets.ts` |
| `POST /bets/:id/resume` route | Does NOT exist | Add in `bets.ts` |
| `bets` table has `title` column | Does NOT exist | Derive from pitch at the API layer |
| `bets` table has `costActual` column | Does NOT exist | Optional field, always absent until L17 |
| `BetDetail.product` and `.team` come from API | API returns raw row without joins | Add joins in GET /bets/:id enrichment |
| `BetDetail.progress` comes from API | API returns raw row; tasks are there but progress is not computed | Compute from tasks array in response |
| `RevisionLogEntry` has `actor` field | Does NOT exist | Add `actor?: string` to type and wire calls |
| `MUTABLE_BET_FIELDS` includes `appetite` | Exists — `["done_condition", "hypothesis", "appetite"]` | No change needed |
| State machine supports `in_progress → paused` | Exists in VALID_TRANSITIONS | Just need the route |
| State machine supports `paused → in_progress` (resume) | Exists in VALID_TRANSITIONS | Just need the route |
| Kill requires `reason` | Already enforced in kill route and state machine | No change needed |
| `BetCard.actions` prop slot | Exists in `BetCard.tsx:33` | Use as designed |
| `HostThreadSection` exists in WorkBet | Exists at `WorkBet.tsx:457-464` | Scroll-to-focus works |

---

## Phase 2 — Acceptance criteria + tasks

### Acceptance criteria

**AC-1 — Pause endpoint**
POST /api/bets/:id/pause with `{ reason: string }` transitions `in_progress → paused`, `behind → paused`, `blocked → paused`. Returns 200 with updated bet. Returns 409 if transition is invalid.
_Verification: Vitest integration test — insert bet in `in_progress`, POST /pause with reason, assert response status=200 and body.status="paused"; assert revisionLog contains new entry with field="status", new_value="paused", actor="u-founder"._

**AC-2 — Resume endpoint**
POST /api/bets/:id/resume with `{ reason?: string }` transitions `paused → in_progress`. Returns 200 with updated bet. Returns 409 if transition is invalid.
_Verification: Vitest integration test — insert bet in `paused`, POST /resume, assert status=200 and body.status="in_progress"._

**AC-3 — Kill requires reason**
POST /api/bets/:id/kill with `{ reason: "" }` returns 400. Already tested for kill; verify the new pause route also requires reason (min-length 1).
_Verification: Vitest integration test — POST /pause with `{ reason: "" }` asserts 400._

**AC-4 — Appetite adjust via existing PATCH**
PATCH /api/bets/:id with `{ field: "appetite", value: "1 week", reason: "..." }` updates the appetite and writes a RevisionLogEntry.
_Verification: existing PATCH test in `bets.validation.test.ts` already covers this pattern. Add a test asserting the specific appetite enum values are accepted and a duration string is rejected with 400._

**AC-5 — RevisionLogEntry actor field**
Every action writes a RevisionLogEntry with `actor: "u-founder"`. The existing entries (from state machine tests) continue to pass — actor is optional, so existing tests without actor remain valid.
_Verification: Vitest test — POST /pause with reason, GET /bets/:id, parse revisionLog, assert last entry has `actor: "u-founder"`._

**AC-6 — GET /bets/:id enrichment**
GET /api/bets/:id returns `title` (derived from first line of pitch), `product` (joined product name), `team` (team id), `progress` ({ done, total } from tasks).
_Verification: Vitest integration test — insert product, team, bet with known pitch "# Hello\nBody", seed two tasks (one done, one in_progress), GET /bets/:id, assert response.title="Hello", response.product=product.name, response.progress.done=1, response.progress.total=2._

**AC-7 — Action bar renders correct buttons per bet status**
WorkBet page with bet in `in_progress` shows [Pause] [Adjust appetite] [Unblock] [Kill bet]. Bet in `paused` shows [Resume] [Adjust appetite] [Unblock] [Kill bet]. Bet in `shipped` shows no action bar.
_Verification: Vitest unit test using WorkBet with `overrideBet` prop — render with `status: "in_progress"`, assert getByRole("button", { name: "Pause" }) exists; assert getByRole("button", { name: "Kill bet" }) exists; render with `status: "shipped"`, assert no action buttons._

**AC-8 — ConsequencePreview dialog is non-skippable**
Clicking Kill bet opens a dialog. Pressing Escape does not close it. Clicking the backdrop does not close it. Clicking Cancel closes it.
_Verification: Playwright E2E — click "Kill bet", assert dialog visible; press Escape, assert dialog still visible; click Cancel, assert dialog closed._

**AC-9 — ConsequencePreview confirm submits and transitions**
Filling in reason and clicking "Kill bet" in the dialog calls POST /bets/:id/kill, closes the dialog on success, and updates the bet status chip on the page.
_Verification: Playwright E2E — intercept POST /bets/:id/kill, fill reason, click confirm, assert API called with correct body, assert status chip shows "Killed"._

**AC-10 — Appetite dialog submits via existing PATCH**
Adjusting appetite to "1 week" with a reason and clicking Save calls PATCH /api/bets/:id with `{ field: "appetite", value: "1 week", reason: "..." }`.
_Verification: Playwright E2E — intercept PATCH /bets/:id, fill appetite select and reason, click Save, assert API called._

**AC-11 — Unblock action scrolls to thread**
Clicking Unblock scrolls the page and focuses the Composer textarea in HostThreadSection.
_Verification: Playwright E2E — click Unblock, assert Composer textarea is focused (page.locator('[data-testid="composer-textarea"]').isFocused())._

**AC-12 — Revision log recorded**
After pause action, GET /bets/:id response revisionLog array contains an entry with `{ field: "status", old_value: "in_progress", new_value: "paused", actor: "u-founder" }`.
_Verification: Playwright E2E — perform pause action, GET /api/bets/:id directly, parse revisionLog, assert last entry shape._

**AC-13 — Fixture closure (L6 inventory row)**
WorkBet page renders bet.appetite from the API (not a fixture). Since appetite already comes from the real DB via useBet hook (L16), this AC is about verifying NO fixture appetite string ("small", "big") bypasses the enum validation at the route level.
_Verification: Vitest integration test — POST /bets with `appetite: "small"` returns 400 (invalid enum). The existing appetite enum validation in createBetSchema already covers this; verify it hasn't regressed._

**AC-14 — bun run check, lint, test all green**
_Verification: `bun run verify` exits 0._

---

### Ordered task list

**T1 — Server: RevisionLogEntry actor field**
File: `packages/server/src/services/bet-state-machine.ts`
- Add `actor?: string` to `RevisionLogEntry` interface
- Add `actor?: string` to `TransitionOptions` and the `updateBetField` signature
- Thread `actor` into `addRevisionEntry` calls

File: `docs/process-layer/canonical-shapes.md`
- Update RevisionLogEntry shape to include `actor?: string`

_Depends on: nothing. Test: unit test in `bet-state-machine.test.ts` (add actor to entry; existing tests stay green)._

**T2 — Server: GET /bets/:id enrichment**
File: `packages/server/src/routes/bets.ts`
- Change the GET /:id handler to join `products` and `teams` tables for name fields
- Derive `title` from first non-empty line of `pitch` (strip `# ` prefix, take first 60 chars)
- Compute `progress: { done, total }` from betTasks (tasks with state="done" vs total)
- Return the enriched shape instead of raw bet row

File: `packages/web/src/types/bet.ts`
- No change needed — BetDetail already has these fields

_Depends on: T1 (none). Test: integration test asserts enriched shape. Note: existing E2E tests mock the API and are unaffected._

**T3 — Server: POST /bets/:id/pause route**
File: `packages/server/src/routes/bets.ts`
- Add `pauseBetSchema = z.object({ reason: z.string().min(1) })`
- Add `router.post("/:id/pause", validateBody(pauseBetSchema), async (c) => { ... transitionBet(db, eventBus, betId, "paused", { reason, actor: "u-founder" }) ... })`

_Depends on: T1. Test: integration test in `bets.validation.test.ts` extension — covers 200/409/400._

**T4 — Server: POST /bets/:id/resume route**
File: `packages/server/src/routes/bets.ts`
- Add `resumeBetSchema = z.object({ reason: z.string().optional() })`
- Add `router.post("/:id/resume", validateBody(resumeBetSchema), async (c) => { ... transitionBet(db, eventBus, betId, "in_progress", { reason: body.reason ?? "Resumed by founder", actor: "u-founder" }) ... })`

_Depends on: T1. Test: integration test — paused bet → resume → 200 and status=in_progress._

**T5 — Frontend: BetActionsBar component (co-located in WorkBet.tsx)**
File: `packages/web/src/pages/WorkBet.tsx`
- Add `BetActionsBar` function (co-located, not exported — same pattern as BetPitch)
- Receives `bet: BetDetail`, `onAction: (action: BetActionKind) => void`
- Returns state-driven button set per approved design's action table
- Returns `null` for shipped/killed

_Depends on: T2 (bet.status from real API). Test: Vitest unit test with WorkBet + overrideBet for each status variant._

**T6 — Frontend: ConsequencePreviewDialog component (co-located in WorkBet.tsx)**
File: `packages/web/src/pages/WorkBet.tsx`
- Add `ConsequencePreviewDialog` function (co-located)
- Props: `open: boolean`, `kind: "pause" | "kill"`, `onConfirm: (reason: string) => Promise<void>`, `onCancel: () => void`
- Implements non-skippable dialog: Escape `preventDefault()`, backdrop `cancel` event `preventDefault()`
- Sections: STOPS / CONTINUES / SAVED per approved design copy
- Reason textarea with whitespace-only guard on Confirm button
- Loading spinner state, error state

_Depends on: T5. Test: Vitest unit test — render with kind="kill", assert dialog-title contains "Kill", assert Escape does not close, assert empty reason disables Confirm._

**T7 — Frontend: AppetiteDialog component (co-located in WorkBet.tsx)**
File: `packages/web/src/pages/WorkBet.tsx`
- Add `AppetiteDialog` function (co-located)
- Props: `open: boolean`, `currentAppetite: string`, `onConfirm: (appetite: string, reason: string) => Promise<void>`, `onCancel: () => void`
- Select with the three valid values; reason textarea; Confirm disabled when reason empty
- Same non-skippable dialog behavior

_Depends on: T5. Test: Vitest unit test — render, assert current appetite is pre-selected, assert Save disabled when reason empty._

**T8 — Frontend: Wire actions to API in WorkBet**
File: `packages/web/src/pages/WorkBet.tsx`
- Add `handlePause`, `handleResume`, `handleKill`, `handleAdjustAppetite` async functions
- Each calls `fetch(...)` with the correct method/body
- On success: call `fetched.refresh()` (or re-derive local state from response) to update bet status
- Wire Unblock button to `scrollIntoView` + `focus()` on Composer textarea

_Depends on: T5, T6, T7. Test: Playwright E2E for the full flow._

**T9 — Frontend: useBet hook refresh mechanism**
File: `packages/web/src/hooks/useBet.ts`
- Add `refresh: () => void` to `UseBetResult` type
- Implement refresh by incrementing a counter that triggers the useEffect

_Depends on: none. Test: add to useBet.test.ts — call refresh(), assert new fetch is triggered._

**T10 — E2E: Playwright test suite**
File: `packages/web/e2e/L14-bet-actions.spec.ts`
- Test: open WorkBet → mock GET /bets/:id → action bar visible → click Kill bet → dialog opens → Escape doesn't close → Cancel closes → click Kill bet again → fill reason → click Kill bet confirm → mock POST /kill → assert status chip updates
- Test: open WorkBet → click Pause → dialog opens → fill reason → confirm → mock POST /pause → status updates
- Test: open WorkBet → click Adjust appetite → dialog opens → change select → fill reason → confirm → mock PATCH → dialog closes
- Test: open WorkBet → click Unblock → Composer textarea focused

_Depends on: T5-T8._

---

## Phase 3 — Design it twice: GET /bets/:id enrichment

### Option A — Server-side join + compute

The `GET /:id` handler runs a join query: `products` for `product`, `teams` for `team`, derives `title` from pitch, computes `progress` from the tasks array already in memory.

**Trade-off:** Adds a product+team join to every bet detail fetch. At expected volumes (1-10 bets per product), this is negligible. Server is the correct layer for data transformation — keeps the client thin.

**Reason to reject:** None. This is the correct approach.

### Option B — Client-side enrichment in useBet hook

The hook normalizes the API response, deriving `title` from pitch and fetching product name separately.

**Trade-off:** Requires a second API call or passing context down. Violates three-layer boundary (client doing data assembly that belongs in the API layer). The `BetDetail` type would need to accept raw DB fields alongside derived fields — structural ambiguity.

**Reason to reject:** Two-fetch for one page load. Client should not be assembling joins. The `BetDetail` type is the page shape, not the wire shape — the mapping belongs in the server layer.

**Decision:** Option A. Server-side join + compute.

---

## Type signatures

### RevisionLogEntry (updated)

```typescript
// packages/server/src/services/bet-state-machine.ts
export interface RevisionLogEntry {
  timestamp: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  actor?: string;   // L14: "u-founder" for all human-surfaced actions
}
```

### TransitionOptions (updated)

```typescript
interface TransitionOptions {
  reason?: string;
  actor?: string;
}
```

### Pause/Resume route schemas

```typescript
const pauseBetSchema = z.object({
  reason: z.string().min(1),   // required — non-skippable
});

const resumeBetSchema = z.object({
  reason: z.string().optional(),  // optional — resume is non-destructive
});
```

### BetDetail enriched response (GET /bets/:id)

```typescript
// The API now returns this shape; BetDetail type in packages/web/src/types/bet.ts already matches
{
  id: string;
  productId: string;
  teamId: string;
  pitch: string;
  appetite: string;           // "1 week" | "2 weeks" | "6 weeks"
  doneCondition: string | null;
  hypothesis: string | null;
  status: BetStatus;
  revisionLog: string | null;  // JSON string of RevisionLogEntry[]
  createdAt: string;
  shippedAt: string | null;
  tasks: Task[];               // joined from tasks table
  // Enriched fields:
  title: string;               // derived from first pitch line
  product: string;             // joined from products.name
  team: string;                // from teams.id (name join when available)
  progress: { done: number; total: number };  // computed from tasks
  costActual?: number;         // undefined until L17
}
```

### BetActionKind

```typescript
// packages/web/src/pages/WorkBet.tsx (internal co-located type)
type BetActionKind = "pause" | "resume" | "kill" | "adjust-appetite" | "unblock";
```

### useBet refresh

```typescript
export interface UseBetResult {
  data: BetDetail | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;   // L14 addition
}
```

---

## Route checklist

All new routes in `packages/server/src/routes/bets.ts`:

| Route | Method | Auth guard | Body schema | State machine call |
|---|---|---|---|---|
| `/bets/:id/pause` | POST | X-API-Key middleware | `pauseBetSchema` | `transitionBet(..., "paused", { reason, actor })` |
| `/bets/:id/resume` | POST | X-API-Key middleware | `resumeBetSchema` | `transitionBet(..., "in_progress", { reason, actor })` |

Existing routes unchanged:
- `PATCH /bets/:id` — appetite adjust uses this; no change needed
- `POST /bets/:id/kill` — already exists with reason required

The X-API-Key auth middleware is already mounted on all bet routes via the app-level middleware in `packages/server/src/index.ts`. No per-route change needed.

---

## Security & abuse cases

| Concern | Applicability | Handling |
|---|---|---|
| Rate limiting on POST/PATCH | Applicable | X-API-Key auth already throttles — the key is long-lived and not user-facing. No additional rate limit needed for v1. |
| Input trust on reason field | Applicable | `reason` is stored in revisionLog JSON. Zod validates it is a string. Length soft-cap 500 chars at the client (approved design). No HTML injection risk since revisionLog is never rendered as HTML — it's displayed as text. |
| IDOR on pause/kill endpoints | Applicable | The existing `assertBetReadable` helper (bets.ts:55-57) is extended to cover pause/kill routes. Any betId not in the DB returns 404 before the state machine is called. Currently no per-user ownership check exists — all requests with a valid API key can act on any bet. Acceptable for v1 (single-founder system). |
| Concurrent pause+kill race | Applicable | Already handled by the compare-and-set pattern in `transitionBet` (bets.ts comment `@lore I1 adversary-M1`). The update pins `WHERE status = fromState`; the loser gets `InvalidTransitionError` mapped to 409. |
| Appetite enum bypass | N/A | The `appetite` field update goes through `PATCH /bets/:id` which uses `z.string()` for value — the existing appetite enum validation is in the CREATE schema only. The `updateBetField` function accepts any string for the appetite field. **Risk:** a client could set appetite to "big". Mitigation: add server-side appetite enum validation in `updateBetField` when `field === "appetite"`. This is a new guard added in T3. |
| Path traversal / SSRF | N/A — no file paths or outbound URLs in these routes |
| Secret handling | N/A — no new credentials |

**Appetite enum guard (new — discovered above):** In `updateBetField`, add a check when `field === "appetite"` that `newValue` is in `["1 week", "2 weeks", "6 weeks"]`. If not, throw `Error("Invalid appetite value")`. This maps to a 400 at the route level via the global error handler.

---

## Risks and ambiguities

**R1 — BetDetail.title derivation:**
The pitch is freeform markdown. "First non-empty line, strip `# ` prefix" may produce ugly titles if the pitch doesn't start with a heading. Mitigation: fall back to `bet.id` (truncated) if no heading found. This matches the L16 breadcrumb pattern.

**R2 — useBet refresh after action:**
Currently useBet has no refresh mechanism. Calling `fetched.refresh()` after a pause action requires T9. If T9 is not done first, the action bar won't update optimistically. The plan orders T9 before T8. The UI does NOT use optimistic update (per approved design rejection list) — it waits for the server response, then re-fetches.

**R3 — E2E test API mocking:**
All existing E2E tests mock GET /bets/:id. The L14 E2E will also mock this endpoint. This means the enrichment in T2 is proven only by the Vitest integration test, not by E2E. This is acceptable — the Vitest integration test hits the real route with a real test DB.

**R4 — `comments` field on BetDetail:**
The useBet test fixture and the L16 E2E fixture include `comments: []`. BetDetail type has no comments field in current `types/bet.ts` (the `BetComment` interface is deprecated per L18). The `comments` field in test fixtures is a leftover that is safe to leave in fixtures but must not be added to the BetDetail type. This is a minor cleanup the builder can skip.

---

## Protected tests

```
protectedTests:
  - packages/server/src/routes/__tests__/bets.validation.test.ts
  - packages/server/src/routes/__tests__/bets.artifact-thread-summary.test.ts
  - packages/web/src/hooks/__tests__/useBet.test.ts
  - packages/web/e2e/L16-bet-pitch.spec.ts
  - packages/web/e2e/bet-thread.spec.ts
```

These test files must not have their existing assertions changed. New assertions may be added. The bet state machine lore comments (`@lore I1 B1-B3`, `@lore I1 adversary-M1`) must not be removed.
