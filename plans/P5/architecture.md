# P5 FirstTimeHints -- Architecture Plan

## Required reading

- `plans/work-packages/TRACK-P.md` section P5
- `plans/P5/design/approved.md`
- `packages/db/src/schema.ts` and `packages/db/src/schema.pg.ts` (for table patterns)
- `packages/server/src/app.ts` (route registration)
- `packages/server/src/routes/settings.ts` (existing settings route pattern)
- `packages/server/src/middleware/auth.ts` (auth middleware, userId resolution)
- `packages/web/src/hooks/useFetch.ts` (fetch hook pattern)
- `packages/web/src/hooks/useCurrentUser.ts` (user identity hook)
- `packages/web/src/pages/WorkProduct.tsx` (hint #1 location)
- `packages/web/src/pages/WorkBet.tsx` (hint #2 location)
- `packages/web/src/pages/KnowledgeList.tsx` (hint #3 location)
- `packages/web/src/pages/Conversations.tsx` (hint #4 location)
- `packages/web/src/shell/Rail.tsx` (hint #5 location)

---

## Phase 0 -- Interrogation

**Q1: Server-side or client-local hint progress?**
The spec says "per-user tracking" and the validation scenario says "a second human user on a shared backend gets their own hint progression." This requires server-side storage. A client-local approach (localStorage) would lose progress on device switch and can't scope per-user on shared backends. Decision: **server-side `hint_progress` table**.

**Q2: Where does the hint catalog live?**
The spec says "hints are strategy-layer code" in `packages/fabric`. But the hint catalog is consumed by both the server (to validate hint IDs on dismiss) and the client (to render hint text and evaluate triggers). The catalog definition (hint IDs, copy, trigger descriptions) belongs in `packages/shared` -- it's a contract between layers, not strategy logic. The trigger *evaluation* (checking view state against conditions) is client-side code in `packages/web`. The hint *persistence* (recording dismiss) is kernel-level storage. The fabric connection point is zero for v1 -- hints don't subscribe to kernel events, they check view state. Decision: **Catalog types in `packages/shared`. Trigger evaluation in `packages/web`. Storage in `packages/db`.**

**Q3: API shape -- bulk fetch or per-hint?**
A single `GET /api/hint-progress` returning all dismissed hint IDs for the authenticated user is the simplest approach. The client fetches once at app boot, caches in a React context, and all hint hooks read from the context. With 5 hints, the payload is trivially small. Per-page APIs would create unnecessary coupling. Decision: **Single bulk endpoint.**

**Q4: Does the hint system need to integrate with `createApp({ strategyBootstrap: undefined })`?**
Yes -- when strategy is disabled, no hints should appear. Since hint progress is kernel-level storage (just a table), the API endpoints work regardless. The constraint is on the *client side*: the hint context provider must be conditioned on strategy being enabled. In practice, the web client doesn't know about strategyBootstrap -- it just calls APIs. The simplest approach: if `GET /api/hint-progress` returns data, hints are active. If the endpoint doesn't exist (e.g., a stripped kernel-only server), the fetch fails gracefully and no hints show. The approved design already specifies "if hint progress API fails, hints are NOT shown." This satisfies the constraint without any explicit strategyBootstrap awareness.

Actually, re-reading the constraint: `createApp({ strategyBootstrap: undefined })` is a server-side concern. The hints API route should be registered unconditionally (it's kernel-level CRUD). The client's `HintProvider` fetches from the API; if the API works, hints work. If someone runs a kernel-only build without the hint_progress table, the endpoint returns an error and hints don't show. This is naturally correct.

**Q5: Auto-dismiss vs explicit-dismiss -- who writes the `seenAt` record?**
The approved design says auto-dismiss happens "when the trigger condition is no longer true." But auto-dismiss also records `seenAt` in the database. This means the client must detect when a hint's trigger condition transitions from true to false and POST a dismiss. This is over-complex for v1. Simpler: auto-dismiss is purely visual (the hint doesn't render when its trigger is false), and `seenAt` is only written on explicit "Got it" dismiss. If the user creates a bet (making hint #1's trigger false) without clicking "Got it," the hint never shows again because the trigger is false -- but there's no `seenAt` record. This is fine: on a fresh page load, the trigger is re-evaluated and still false, so the hint stays hidden. Decision: **`seenAt` is written only on explicit dismiss. Auto-dismiss is a pure client-side render gate.**

---

## Phase 1 -- Plan reconciliation

**Symbols verified against codebase:**

| Symbol | Expected | Actual | Resolution |
|---|---|---|---|
| `hint_progress` table | Does not exist | Confirmed absent | Task 1: create migration |
| `packages/shared/src/hint.ts` | Does not exist | Confirmed absent | Task 2: create catalog |
| `/api/hint-progress` route | Does not exist | Confirmed absent | Task 3: create route |
| `packages/web/src/hooks/useHints.ts` | Does not exist | Confirmed absent | Task 4: create hook + context |
| `WorkProduct.tsx` "Active Bets" EmptyState | Exists at line 206-210 | Confirmed at correct location | Task 5: add hint #1 |
| `WorkBet.tsx` bet detail header | Exists, loaded section starts at ~line 126 | Confirmed | Task 5: add hint #2 |
| `KnowledgeList.tsx` empty state | Uses EmptyState, ErrorState imports | Confirmed | Task 5: add hint #3 |
| `Conversations.tsx` thread detail area | ThreadShell renders messages | Confirmed | Task 5: add hint #4 |
| `Rail.tsx` expanded view | `RailProps.expanded` controls expansion | Confirmed | Task 5: add hint #5 |
| `users.id` column | `text("id").primaryKey()` | Confirmed in both SQLite and PG schemas | FK reference valid |
| `createAuthMiddleware` sets `userId` | Via `c.set("userId", ...)` | Confirmed in auth.ts | Route can read userId |
| `useFetch<T>(url)` pattern | Returns `{ data, error, isLoading }` | Confirmed | Hook reuse valid |
| `apiFetch` utility | Exists in `packages/web/src/services/api-fetch.ts` | Confirmed | POST dismiss reuse valid |

No spec/codebase contradictions found. All referenced symbols exist with expected shapes.

---

## Acceptance criteria + verification

### AC1: `hint_progress` table exists in both SQLite and PostgreSQL schemas

**Schema:** `userId` (text, FK to users.id, NOT NULL), `hintId` (text, NOT NULL), `seenAt` (text, NOT NULL, ISO timestamp). Composite primary key on `(userId, hintId)`.

**Verification:** Migration runs without error on both drivers. Unit test inserts a row, reads it back, asserts shape. Unit test inserts duplicate `(userId, hintId)`, asserts unique constraint violation.

### AC2: Hint catalog with 5 entries defined in `packages/shared`

**Catalog type:** `HintId` union type, `HINT_CATALOG` constant array with id + copy + testid for each hint.

**Verification:** `bun run check` passes. The catalog exports are importable from `@hyperidle/shared`. Unit test asserts catalog has >= 5 entries and each entry has required fields.

### AC3: `GET /api/hint-progress` returns dismissed hints for the authenticated user

**Response shape:** `{ dismissed: Array<{ hintId: string; seenAt: string }> }`

**Verification:** Integration test: insert 2 hint_progress rows for user A and 1 for user B. GET as user A returns 2 entries. GET as user B returns 1 entry.

### AC4: `POST /api/hint-progress/:hintId/dismiss` records dismissal

**Request:** No body needed. The hintId is in the URL path. The userId comes from auth middleware.

**Response:** `{ ok: true }` on success. 400 if hintId is not in the catalog. 409 if already dismissed.

**Verification:** Integration test: POST dismiss for hint "create-bet". GET hint-progress shows it dismissed. POST same hintId again returns 409. POST invalid hintId returns 400.

### AC5: Hints render inline in the 5 specified views

Each hint appears at the location specified in the approved design. The visual treatment uses the approved token classes. Each hint has a `data-testid` attribute.

**Verification:** Playwright E2E for each hint:
- Navigate to the view in a state that triggers the hint
- Assert the hint element is visible with correct testid
- Assert the hint text matches the catalog copy

### AC6: Hints disappear after explicit dismiss ("Got it" click)

**Verification:** Playwright E2E:
- Navigate to view, assert hint visible
- Click "Got it"
- Assert hint element is absent from DOM
- Refresh the page
- Assert hint element is still absent

### AC7: Hints never reappear after dismissal

**Verification:** Playwright E2E:
- Dismiss a hint
- Navigate away and back to the same view (with trigger still active)
- Assert hint is absent

### AC8: Second user gets independent hint progression

**Verification:** Integration test on the API: dismiss hint as user A, GET as user B shows no dismissals.

### AC9: `bun run verify` passes

**Verification:** Run `bun run verify` and assert zero errors.

---

## Type signatures / schemas / endpoints

### 1. Database schema (`packages/db/src/schema.ts` and `schema.pg.ts`)

```typescript
// SQLite
export const hintProgress = sqliteTable(
  "hint_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hintId: text("hint_id").notNull(),
    seenAt: text("seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.hintId] }),
  ],
);

// PostgreSQL (same shape, pgTable)
export const hintProgress = pgTable(
  "hint_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hintId: text("hint_id").notNull(),
    seenAt: text("seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.hintId] }),
  ],
);

// Inferred types
export type HintProgressRow = typeof hintProgress.$inferSelect;
export type NewHintProgressRow = typeof hintProgress.$inferInsert;
```

### 2. Hint catalog (`packages/shared/src/hint.ts`)

```typescript
/** Closed union of all hint identifiers. */
export type HintId =
  | "create-bet"
  | "add-credential"
  | "knowledge-empty"
  | "review-verdict"
  | "rail-indicators";

/** Hint catalog entry — the static definition of a hint. */
export interface HintCatalogEntry {
  readonly id: HintId;
  /** One-sentence, action-oriented copy. */
  readonly copy: string;
  /** data-testid for E2E selection. */
  readonly testId: string;
}

/** All known hints. Open for additions, closed for rendering mechanism. */
export const HINT_CATALOG: readonly HintCatalogEntry[] = [
  {
    id: "create-bet",
    copy: "Create a bet to give your team something to work on.",
    testId: "hint-create-bet",
  },
  {
    id: "add-credential",
    copy: "Your team will pick this up. Add a credential in Settings if you haven't yet.",
    testId: "hint-add-credential",
  },
  {
    id: "knowledge-empty",
    copy: "Knowledge items are created by your team as they work. You can also add your own.",
    testId: "hint-knowledge",
  },
  {
    id: "review-verdict",
    copy: "Approve, request changes, or reject. Your verdict tells the agent what to do next.",
    testId: "hint-review-verdict",
  },
  {
    id: "rail-indicators",
    copy: "Active bets, blockers, and cost alerts appear here. Red means something needs your attention.",
    testId: "hint-rail",
  },
] as const;

export const HINT_IDS: readonly HintId[] = HINT_CATALOG.map((h) => h.id);

export function isHintId(value: string): value is HintId {
  return (HINT_IDS as readonly string[]).includes(value);
}
```

### 3. API endpoints (`packages/server/src/routes/hints.ts`)

```typescript
import { type HyperIdleDb, hintProgress } from "@hyperidle/db";
import { isHintId } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { HyperIdleEnv } from "../middleware/auth.js";

export function createHintRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
  const router = new Hono<HyperIdleEnv>();

  // GET /api/hint-progress — all dismissed hints for the authenticated user
  router.get("/", async (c) => {
    const userId = c.get("userId");
    const rows = await db
      .select()
      .from(hintProgress)
      .where(eq(hintProgress.userId, userId));
    return c.json({
      dismissed: rows.map((r) => ({
        hintId: r.hintId,
        seenAt: r.seenAt,
      })),
    });
  });

  // POST /api/hint-progress/:hintId/dismiss — record dismissal
  router.post("/:hintId/dismiss", async (c) => {
    const userId = c.get("userId");
    const hintId = c.req.param("hintId");

    if (!isHintId(hintId)) {
      return c.json({ error: "Unknown hint ID", code: "VALIDATION_ERROR" }, 400);
    }

    // Check if already dismissed
    const existing = await db
      .select()
      .from(hintProgress)
      .where(
        and(eq(hintProgress.userId, userId), eq(hintProgress.hintId, hintId)),
      );

    if (existing.length > 0) {
      return c.json({ error: "Already dismissed", code: "CONFLICT" }, 409);
    }

    await db.insert(hintProgress).values({
      userId,
      hintId,
      seenAt: new Date().toISOString(),
    });

    return c.json({ ok: true });
  });

  return router;
}
```

**Route registration in `app.ts`:**
```typescript
// After other authenticated routes:
api.route("/hint-progress", createHintRoutes(db));
```

### 4. React hint context + hook (`packages/web/src/hooks/useHints.ts`)

```typescript
import type { HintId } from "@hyperidle/shared";
import { HINT_CATALOG } from "@hyperidle/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "../services/api-fetch.js";

interface HintContextValue {
  /** Set of hint IDs the user has dismissed. */
  dismissed: ReadonlySet<string>;
  /** Whether the hint progress data has loaded. */
  ready: boolean;
  /** Dismiss a hint by ID. Optimistic — hides immediately. */
  dismiss: (hintId: HintId) => void;
}

const HintContext = createContext<HintContextValue>({
  dismissed: new Set(),
  ready: false,
  dismiss: () => {},
});

export function HintProvider({ children }: { children: ReactNode }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/hint-progress")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          dismissed: Array<{ hintId: string; seenAt: string }>;
        }>;
      })
      .then((data) => {
        if (!cancelled) {
          setDismissed(new Set(data.dismissed.map((d) => d.hintId)));
          setReady(true);
        }
      })
      .catch(() => {
        // Graceful failure: treat all hints as dismissed (don't show any).
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback((hintId: HintId) => {
    // Optimistic update
    setDismissed((prev) => new Set([...prev, hintId]));
    // Fire-and-forget POST
    apiFetch(`/api/hint-progress/${hintId}/dismiss`, { method: "POST" })
      .catch(() => {
        // Best effort — don't re-show the hint on failure
      });
  }, []);

  return (
    <HintContext.Provider value={{ dismissed, ready, dismiss }}>
      {children}
    </HintContext.Provider>
  );
}

/**
 * Hook to check whether a specific hint should be shown.
 *
 * Returns `{ visible, dismiss, copy, testId }`.
 * - `visible` is true only when: data is loaded AND hint is NOT dismissed.
 * - The caller must ALSO check their view-local trigger condition.
 *   The hook handles progress only; the trigger is the caller's responsibility.
 *
 * Usage:
 *   const hint = useHint("create-bet");
 *   if (hint.visible && activeBets.length === 0) {
 *     // render the hint
 *   }
 */
export function useHint(hintId: HintId): {
  visible: boolean;
  dismiss: () => void;
  copy: string;
  testId: string;
} {
  const { dismissed, ready, dismiss } = useContext(HintContext);
  const entry = HINT_CATALOG.find((h) => h.id === hintId);

  return {
    visible: ready && !dismissed.has(hintId),
    dismiss: () => dismiss(hintId),
    copy: entry?.copy ?? "",
    testId: entry?.testId ?? "",
  };
}
```

### 5. Inline hint rendering pattern (used in each view)

No new component. Each view renders the hint inline using this pattern:

```tsx
// Example: WorkProduct.tsx hint #1
const hintCreateBet = useHint("create-bet");

// Inside the "Active Bets" section, after EmptyState:
{hintCreateBet.visible && activeBets.length === 0 && (
  <div
    data-testid={hintCreateBet.testId}
    className="rounded-[var(--r1)] bg-[var(--surface-2)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)]"
  >
    <p className="text-[length:var(--density-text)] text-[var(--text-mid)] leading-[var(--leading-body)]">
      {hintCreateBet.copy}
    </p>
    <div className="flex gap-2">
      <button
        type="button"
        className="btn btn-ghost btn-xs text-[var(--text-lo)] min-h-[44px]"
        onClick={hintCreateBet.dismiss}
      >
        Got it
      </button>
    </div>
  </div>
)}
```

This pattern repeats (with view-specific trigger conditions) in all 5 locations.

---

## Ordered task list

### Task 1: Schema -- `hint_progress` table

**Files:**
- `packages/db/src/schema.ts` -- add `hintProgress` table + types
- `packages/db/src/schema.pg.ts` -- add `hintProgress` table + types (PG mirror)
- Run `bun run db:generate` to create migration files

**Test:** `packages/db/src/__tests__/hint-progress.test.ts`
- Insert a row, select it, assert shape matches
- Insert duplicate (userId, hintId), assert constraint violation
- Insert with FK to non-existent user, assert FK violation
- Delete user, assert cascade deletes hint_progress rows

**Depends on:** Nothing.

### Task 2: Shared types -- hint catalog

**Files:**
- `packages/shared/src/hint.ts` -- `HintId`, `HintCatalogEntry`, `HINT_CATALOG`, `HINT_IDS`, `isHintId`
- `packages/shared/src/index.ts` -- export new types and constants

**Test:** `packages/shared/src/__tests__/hint.test.ts`
- Assert `HINT_CATALOG.length >= 5`
- Assert each entry has `id`, `copy`, `testId`
- Assert `isHintId("create-bet") === true`
- Assert `isHintId("nonexistent") === false`
- Assert all `HintId` values appear in `HINT_IDS`

**Depends on:** Nothing. Can run in parallel with Task 1.

### Task 3: API routes -- hint progress endpoints

**Files:**
- `packages/server/src/routes/hints.ts` -- `createHintRoutes(db)` factory
- `packages/server/src/app.ts` -- register `api.route("/hint-progress", createHintRoutes(db))`

**Test:** `packages/server/src/routes/__tests__/hints.test.ts`
- GET /api/hint-progress with no rows returns `{ dismissed: [] }`
- POST /api/hint-progress/create-bet/dismiss returns `{ ok: true }`
- GET after dismiss returns the dismissed hint
- POST same hint again returns 409
- POST invalid hint ID returns 400
- GET as user B after user A dismissed returns empty (per-user isolation)

**Depends on:** Task 1 (table must exist), Task 2 (isHintId validator).

### Task 4: React context + hook -- `useHints`

**Files:**
- `packages/web/src/hooks/useHints.ts` -- `HintProvider`, `useHint`
- `packages/web/src/App.tsx` -- wrap app tree with `<HintProvider>`

**Test:** `packages/web/src/hooks/__tests__/useHints.test.ts` (unit test with mocked fetch)
- When API returns empty dismissed list, `useHint("create-bet").visible` is true
- When API returns `["create-bet"]` dismissed, `useHint("create-bet").visible` is false
- When API fails, all hints are invisible (graceful degradation)
- After calling `dismiss("create-bet")`, the hint becomes invisible immediately (optimistic)

**Depends on:** Task 2 (shared types).

### Task 5: View integration -- render hints in 5 views

**Files:**
- `packages/web/src/pages/WorkProduct.tsx` -- hint #1 ("create-bet")
- `packages/web/src/pages/WorkBet.tsx` -- hint #2 ("add-credential")
- `packages/web/src/pages/KnowledgeList.tsx` -- hint #3 ("knowledge-empty")
- `packages/web/src/pages/Conversations.tsx` -- hint #4 ("review-verdict")
- `packages/web/src/shell/Rail.tsx` -- hint #5 ("rail-indicators")

**Per-hint trigger conditions:**

| Hint | Trigger condition (client-side) |
|---|---|
| #1 create-bet | `activeBets.length === 0` (on WorkProduct page) |
| #2 add-credential | First bet exists (page loaded) AND no credential (check via `useFetch` on `/api/credentials` for credential state, or pass credential status as prop) |
| #3 knowledge-empty | Knowledge item list is empty (existing data already available in KnowledgeList) |
| #4 review-verdict | Thread is loaded AND has review-type messages (check `messages` array for review content) |
| #5 rail-indicators | Rail `expanded === true` (prop already available in Rail component) |

**Test:** Playwright E2E (see Task 6).

**Depends on:** Task 4 (useHint hook must exist).

### Task 6: Playwright E2E tests

**Files:**
- `packages/web/e2e/hints.spec.ts` (or `packages/web/src/__tests__/hints.e2e.test.tsx` if using Vitest + JSDOM for component tests)
- More precisely: Vitest component tests for each view, since Playwright E2E requires a running server

**Tests (component-level with mocked API):**

1. **Hint appears on trigger:**
   - Render WorkProduct with zero bets + hint not dismissed
   - Assert `data-testid="hint-create-bet"` is visible
   - Assert text matches catalog copy

2. **Hint disappears after dismiss:**
   - Render WorkProduct with zero bets + hint not dismissed
   - Click "Got it" button
   - Assert `data-testid="hint-create-bet"` is absent from DOM

3. **Hint never reappears:**
   - Render WorkProduct with zero bets + hint dismissed in API mock
   - Assert `data-testid="hint-create-bet"` is absent from DOM

4. **Hint hidden when trigger is false:**
   - Render WorkProduct with active bets + hint not dismissed
   - Assert `data-testid="hint-create-bet"` is absent (trigger condition false)

5. **Each hint renders in correct location:**
   - One test per hint verifying it appears in the expected view with the right testid

**Depends on:** Task 5.

### Task 7: Verify

Run `bun run verify` and fix any type errors, lint errors, or test failures.

**Depends on:** All previous tasks.

---

## Design-it-twice: hint catalog location

### Alternative A: Catalog in `packages/shared`

The catalog (IDs, copy, testIds) lives in `packages/shared/src/hint.ts`. Both server (for ID validation) and client (for rendering) import from `@hyperidle/shared`.

**Trade-off:** Shared package grows by one small file. Catalog changes require rebuilding shared + downstream.

**Reject reason:** None -- this is the chosen approach.

### Alternative B: Catalog in `packages/web` only, server uses bare `isHintId`

The catalog lives in `packages/web/src/hints/catalog.ts`. The server only knows the hint ID union type (exported from shared) for validation, not the copy/testId.

**Trade-off:** Simpler shared package. But the server can't validate hint IDs without duplicating the union, or the shared package exports just the type without the catalog.

**Reject reason:** Splitting the type and the catalog across packages creates drift risk. If someone adds a hint to the web catalog but forgets the shared type, `bun run check` might not catch it (depending on how the type is constructed). Keeping both together in shared eliminates this class of error.

**Decision:** Alternative A.

---

## Design-it-twice: HintProvider placement

### Alternative A: Wrap at App.tsx root

`<HintProvider>` wraps the entire app tree in `App.tsx`. One fetch at app boot. All views can call `useHint()`.

**Trade-off:** One extra API call on every app boot, even for returning users who've seen all hints (returns empty array, trivially fast). The provider exists in the tree even when no hints are active.

### Alternative B: Wrap only hint-containing views

Each view that shows a hint wraps itself in a local `<HintProvider>`. Multiple fetches if the user navigates between hint views.

**Trade-off:** Avoids the boot-time fetch for users who never visit hint-containing views. But causes redundant fetches and the provider state is lost on navigation.

**Decision:** Alternative A. The single-fetch-at-boot cost is negligible (one small JSON response). Having a stable context prevents flash-of-hint on navigation.

---

## Security & abuse cases

| Concern | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST dismiss | Yes | POST `/api/hint-progress/:hintId/dismiss` inherits the global rate limiter (60 req/min). No dedicated limiter needed -- hint dismissal is infrequent (max 5 per user lifetime). |
| Input-trust boundary | Yes | `hintId` from URL path is validated against the `isHintId` type guard before any database operation. Invalid IDs return 400. |
| Secret handling | N/A | No credentials involved in hint system. |
| Path traversal | N/A | `hintId` is validated against a closed enum, not used as a file path. |
| SSRF | N/A | No outbound URLs in hint system. |
| Enumeration | Low risk | The hint catalog is public knowledge (it's in the client bundle). An attacker could enumerate all 5 hint IDs, but they're static and non-sensitive. |
| Data leakage | N/A | Hint progress contains only userId + hintId + timestamp. No sensitive data. Per-user isolation enforced by auth middleware (userId from auth context). |

---

## Protected tests

```
protectedTests: []
```

No existing test files are modified by this workpackage. All tests are new.

---

## Migrations

No existing symbols are renamed, removed, or moved. This workpackage is purely additive:
- New table: `hint_progress`
- New file: `packages/shared/src/hint.ts`
- New file: `packages/server/src/routes/hints.ts`
- New file: `packages/web/src/hooks/useHints.ts`
- Modified files: `packages/db/src/schema.ts`, `packages/db/src/schema.pg.ts` (add table), `packages/shared/src/index.ts` (add exports), `packages/server/src/app.ts` (register route), `packages/web/src/App.tsx` (wrap provider), and the 5 view files (add hint rendering).

No breaking changes. No existing test modifications.

---

## Risks and ambiguities

1. **Hint #2 trigger -- credential state check.** The approved design says hint #2 shows "when no valid credential is configured." Checking credential state from WorkBet.tsx requires either a new hook or reading from the existing settings data. The simplest approach: add a `hasValidCredential` field to the `/api/hint-progress` response (server checks credential state when building the response), or use a separate lightweight check. Recommendation: add a `context` object to the GET response that includes `hasValidCredential: boolean`. This avoids an extra fetch and keeps trigger data collocated.

   Revised GET response shape:
   ```typescript
   {
     dismissed: Array<{ hintId: string; seenAt: string }>,
     context: {
       hasValidCredential: boolean
     }
   }
   ```
   The `context` field is extensible for future trigger conditions that require server-side data.

2. **Hint #4 trigger -- detecting a review thread.** The Conversations page uses ThreadShell which renders different message types. Detecting "first review thread" requires knowing whether the current thread contains review-type messages. The thread detail data (from `useThreadDetail`) includes the messages array -- the trigger can check if any message has a review-related type. This is a client-side check with data already available.

3. **Hint #5 trigger -- "first rail expansion."** The Rail component receives `expanded` as a prop. The hint should show on the first expansion ever, not just the current session. Since we only write `seenAt` on explicit dismiss, and the trigger is `expanded === true`, the hint will show every time the rail is expanded until the user clicks "Got it." This is acceptable -- it's a gentle reminder, not aggressive.

4. **HintProvider and SetupFlow.** During SetupFlow (P4), the main UI is not rendered, so hints don't show. After SetupFlow completes, the main UI renders with HintProvider, which fetches hint progress. Since the user just completed setup, all hints are undismissed and will show at the appropriate triggers. This is correct behavior.
