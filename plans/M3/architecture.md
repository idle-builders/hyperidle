# M3 Architecture -- Parallel refactor pool

**Workpackage:** M3 (Track M -- Mock-Data Purge)
**Author:** Designer (architecture phase)
**Date:** 2026-05-11

---

## Required reading (builder MUST open these)

1. `plans/mock-data-purge/contracts.md` -- M2 replacement contracts (the swap recipes)
2. `plans/mock-data-purge/inventory.json` -- M1-generated inventory (27 in-scope rows)
3. `plans/mock-data-purge/queue.md` -- checkbox queue (mark rows closed as you go)
4. `plans/work-packages/TRACK-M.md` -- M3 acceptance criteria
5. `plans/M2/architecture.md` -- M2 architecture (cluster definitions, type signatures)
6. `packages/api-contract/src/index.ts` -- type-only contract package (M2 output)
7. `packages/server/src/middleware/auth.ts` -- current auth middleware (no userId yet)
8. `packages/server/src/app.ts` -- route mounting (line ~248 is auth, ~265+ is DB routes)
9. `packages/web/src/fixtures/app-shell-data.ts` -- the main fixture file to gut
10. `packages/web/src/fixtures/portfolio-data.ts` -- secondary fixture file to gut

---

## Scope

**In scope:** 27 rows from the M1 inventory annotated `straight-swap` or `contract-pinned`.

**Out of scope:** 7 rows annotated `tracked-out` (knowledge page wiring -- deferred). Listed explicitly in the final section of this document.

---

## Execution clusters and ordering

The 27 rows are grouped into 7 clusters. Clusters are ordered by dependency: Cluster A is foundational (auth middleware), everything else depends on it. Clusters B-G are independent of each other and can run in parallel after A lands.

```
                  ┌─── B (Settings endpoint + hook)
                  ├─── C (Rail hook + type alignment)
  A (Auth/identity) ─┼─── D (Agent participant)
                  ├─── E (Avatar fallback)
                  ├─── F (Knowledge count)
                  └─── G (Portfolio straight-swaps)
```

**Critical path:** A must land first. The auth middleware extension sets `c.get("userId")` which B, C, and D implicitly depend on (B reads founder profile from the same factory settings, C uses the auth context, D needs founderId from auth). In practice, B-G can begin in parallel immediately after A's middleware change merges, because their client-side work is independent.

---

## Cluster A -- Auth identity (Contract 1)

**Rows closed:** 18 (rows 1-12, 14, 24, 25, 30, 34, plus the doc-comment in row 11)

This is the largest cluster by row count but the swap is mechanical once the middleware sets identity.

### Files changed

#### A1. `packages/db/src/seed.ts` (EDIT -- prerequisite)

Add three `factorySettings` inserts after the existing `cost_cap` and `cost_cycle` entries (line ~174):

```typescript
db.insert(factorySettings)
  .values({ key: "founder_id", value: "u-founder", updatedAt: now })
  .onConflictDoNothing()
  .run();
db.insert(factorySettings)
  .values({ key: "founder_name", value: "Founder", updatedAt: now })
  .onConflictDoNothing()
  .run();
db.insert(factorySettings)
  .values({ key: "founder_email", value: "founder@hyperidle.com", updatedAt: now })
  .onConflictDoNothing()
  .run();
```

The value `"u-founder"` in the seed is intentional -- it is the identity for the default single-founder factory. The difference from the current code is that the identity now comes FROM the database rather than being hardcoded at each call site.

#### A2. `packages/db/src/seed-fixtures.ts` (EDIT -- prerequisite)

Add the same three factory settings for test fixtures. Use `"test-founder-1"` as the id so tests can distinguish real-source from hardcoded:

```typescript
db.insert(factorySettings)
  .values({ key: "founder_id", value: "test-founder-1", updatedAt: now })
  .onConflictDoNothing()
  .run();
db.insert(factorySettings)
  .values({ key: "founder_name", value: "Test Founder", updatedAt: now })
  .onConflictDoNothing()
  .run();
db.insert(factorySettings)
  .values({ key: "founder_email", value: "test@hyperidle.dev", updatedAt: now })
  .onConflictDoNothing()
  .run();
```

#### A3. `packages/server/src/middleware/auth.ts` (EDIT)

After the successful auth check (line 56, before `await next()`), read founder_id from factorySettings and set it on the Hono context:

```typescript
// M3: Set authenticated user identity on context.
// Read founder_id from factorySettings (single-founder v1).
// @lore M3: the middleware does NOT fail if founder_id is missing --
// it falls back to "u-founder" for unseeded DBs. This preserves
// backward compatibility with existing tests that don't seed
// factorySettings.
const founderRow = db.select()
  .from(factorySettings)
  .where(eq(factorySettings.key, "founder_id"))
  .get();
c.set("userId", founderRow?.value ?? "u-founder");
```

**Open question for builder:** The current `authMiddleware` signature is `(c, next) => ...` with no `db` parameter. The middleware needs access to the database. Two options:

- **Option 1 (factory function):** Convert `authMiddleware` to `createAuthMiddleware(db)` that returns a `MiddlewareHandler`. This is the standard Hono pattern for middleware that needs dependencies.
- **Option 2 (Hono context variable):** Set `db` on Hono's env/context at app construction time (it is already passed to routes via closure).

**Decision: Option 1.** The `createAuthMiddleware(db)` pattern is consistent with how routes are created (`createBetRoutes(db, eventBus)`). The current export `authMiddleware` becomes `createAuthMiddleware`. The call site in `app.ts` (line ~248) changes from `api.use("*", authMiddleware)` to `api.use("*", createAuthMiddleware(options.db))`.

The Hono context type must be extended to include `userId`:

```typescript
// In a shared types location or directly in the middleware file:
type HyperIdleEnv = {
  Variables: {
    userId: string;
  };
};
```

**Note:** This is the highest-risk change in M3. It touches the middleware that gates every authenticated route. The builder must:
1. Update every route file's `c` type to be aware of `Variables.userId`.
2. Ensure all existing tests still pass (most tests go through `createTestApp()` which wires the middleware).
3. Run the full Playwright suite.

#### A4. `packages/server/src/routes/auth.ts` (EDIT)

Add `GET /api/auth/me` endpoint. This endpoint returns the authenticated user's identity:

```typescript
router.get("/me", (c) => {
  const userId = c.get("userId");
  // Read full profile from factorySettings
  const nameRow = db.select()
    .from(factorySettings)
    .where(eq(factorySettings.key, "founder_name"))
    .get();
  const emailRow = db.select()
    .from(factorySettings)
    .where(eq(factorySettings.key, "founder_email"))
    .get();

  return c.json({
    id: userId,
    name: nameRow?.value ?? "Founder",
    email: emailRow?.value ?? "",
    avatarUrl: null,
  });
});
```

The `createAuthRoutes` function signature needs `db` added as a parameter.

**Note:** Currently `createAuthRoutes(store)` only takes the upgrade token store. The signature must become `createAuthRoutes(db, store)` (or `createAuthRoutes(options: { db, store })`) and the mount in `app.ts` must be updated. The builder should check that `/api/auth/me` still sits behind the `authMiddleware` catch-all (it does -- the auth route is mounted at line ~256, after `api.use("*", authMiddleware)` at line ~248).

**Complication:** The current code only mounts auth routes when `tokenStore` is defined (line ~254: `if (tokenStore)`). The `/me` endpoint should be available regardless of WebSocket support. The builder must restructure so `/api/auth/me` is always mounted while `/api/auth/ws-token` remains conditional.

#### A5. `packages/server/src/routes/bets.ts` (EDIT -- 6 sites)

Replace all 6 `"u-founder"` literals with `c.get("userId")`:

| Line | Current | Replacement |
|---|---|---|
| 400 | `actor: "u-founder"` | `actor: c.get("userId")` |
| 415 | `"u-founder"` (7th arg to `updateBetField`) | `c.get("userId")` |
| 444 | `actor: "u-founder"` | `actor: c.get("userId")` |
| 457 | `actor: "u-founder"` | `actor: c.get("userId")` |
| 472 | `actor: "u-founder"` | `actor: c.get("userId")` |
| 363 | Comment `actor "u-founder"` | Update comment to `actor from auth context` |

All six replacements are in route handler closures that have access to `c` (the Hono context). No function signature changes needed for the route handlers themselves.

#### A6. `packages/server/src/routes/coach.ts` (EDIT)

- Delete `const DEFAULT_FOUNDER_ID = "u-founder";` (line 24).
- Update `readSenderId()` (line 31-32) to use the Hono context's `userId`:

```typescript
// Before: return c.req.header(SENDER_HEADER) ?? DEFAULT_FOUNDER_ID;
// After:
function readSenderId(c: Context<HyperIdleEnv>): string {
  return c.req.header(SENDER_HEADER) ?? c.get("userId");
}
```

The `c` parameter type must carry the `HyperIdleEnv` variables type so `c.get("userId")` type-checks. This function is called from route handlers that have the typed context.

#### A7. `packages/server/src/routes/threads.ts` (EDIT)

Identical pattern to coach.ts:
- Delete `const DEFAULT_FOUNDER_ID = "u-founder";` (line 49).
- Update `readSenderId()` (line 51-56) to use `c.get("userId")`.

#### A8. `packages/server/src/services/bet-state-machine.ts` (EDIT -- doc comment only)

Line 15: update the doc comment from `actor: "u-founder"` to `actor comes from the authenticated user context`. No runtime change -- this is a `RevisionLogEntry` interface comment.

#### A9. `packages/server/src/services/lifecycle-propagation.ts` (EDIT)

Line 411: `participants: JSON.stringify([SYSTEM_PROPAGATION_AGENT_ID, "u-founder"])`.

Replace with the bet creator's id from the bet row, or accept a `founderId` parameter. The function `notifyParentsOnBlock` (which contains this line) is called from within the lifecycle propagation service. The service needs to derive the founder id.

**Resolution:** The function already has access to the `bet` object (it reads it from DB). The bet's `createdBy` field is not in the current schema, so the cleanest approach is:
1. Read `founder_id` from `factorySettings` at the start of the propagation function.
2. Use that value instead of the hardcoded `"u-founder"`.

The builder must check if `lifecycle-propagation.ts` already has access to `db` (it does -- the function is called with `db` as a parameter throughout). Import `factorySettings` from the schema.

#### A10. `packages/web/src/hooks/useCurrentUser.ts` (NEW)

Create the client-side hook per Contract 1:

```typescript
export function useCurrentUser(): {
  user: AuthMeResponse | null;
  status: "loading" | "ready" | "error";
  error: string | null;
}
```

Uses `fetch("/api/auth/me")` with the same API key header pattern as other hooks (check `useProducts.ts` for the fetch pattern -- it uses the `apiFetch` helper or raw `fetch` with headers from context).

**Note:** Check how other hooks pass the API key. If there is an `apiFetch` wrapper, use it. If hooks use raw `fetch` with browser-relative URLs (which the Vite proxy forwards to port 3001), follow that pattern.

#### A11. `packages/web/src/layouts/AppShell.tsx` (EDIT -- auth rows)

- Delete `const DEMO_FOUNDER_ID = "u-founder";` (line 92).
- Add `const { user } = useCurrentUser();` at the top of the component.
- Replace all usages of `DEMO_FOUNDER_ID` with `user?.id ?? ""`.

**Note:** AppShell has many other mock-data removals (Clusters B, C, F). The builder may batch all AppShell changes into one commit, but each cluster's changes must be independently testable.

#### A12. `packages/web/src/pages/WorkBet.tsx` (EDIT)

- Delete `const FOUNDER_ID = "u-founder";` (line 613).
- Add `const { user } = useCurrentUser();` inside the component.
- Replace `FOUNDER_ID` usage (line 682 and anywhere else it appears) with `user?.id ?? ""`.

#### A13. `packages/web/src/shell/HostThreadSection.tsx` (EDIT)

- Delete `const FOUNDER_ID = "u-founder";` (line 67).
- Add `const { user } = useCurrentUser();` inside the component.
- Replace `FOUNDER_ID` usage (line 113) with `user?.id ?? ""`.

#### A14. `packages/web/src/fixtures/app-shell-data.ts` (EDIT -- partial)

Row 14 (`founder@hyperidle.com` inside `DEFAULT_SETTINGS`): this row is closed when `DEFAULT_SETTINGS` is deleted entirely in Cluster B. No standalone edit needed here.

### Test pattern (Cluster A)

**Server tests:**
- Seed `factorySettings` with `founder_id = "test-founder-1"`.
- `PATCH /api/bets/:id` with a field change -- assert the revision log `actor === "test-founder-1"`.
- `GET /api/auth/me` -- assert response `{ id: "test-founder-1", name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null }`.
- `POST /api/threads` via coach routes -- assert `initiatorId === "test-founder-1"` (not "u-founder").

**Client tests:**
- Mock `useCurrentUser` to return `{ user: { id: "mock-user", name: "Mock", email: "mock@test.com", avatarUrl: null }, status: "ready", error: null }`.
- Render `WorkBet`, assert thread creation uses `"mock-user"` not `"u-founder"`.
- Render `HostThreadSection`, assert thread creation uses `"mock-user"`.
- Render `AppShell`, assert no `"u-founder"` string in the DOM.

**E2E ripple sites:**
- Every Playwright test that seeds a bet and checks revision logs must use the seeded founder_id.
- Every test that creates threads must expect the seeded founder_id as participant.

---

## Cluster B -- Settings endpoint + hook (Contract 2)

**Rows closed:** 1 (row 13: `DEFAULT_SETTINGS` in `app-shell-data.ts`)

This also subsumes row 14 (`founder@hyperidle.com`) since that string lives inside `DEFAULT_SETTINGS`.

### Files changed

#### B1. `packages/server/src/routes/settings.ts` (NEW)

Create `createSettingsRoutes(db)` per Contract 2. The endpoint aggregates:
- `profile`: from `factorySettings` keys `founder_name`, `founder_email`, `founder_avatar_url`
- `products`: `SELECT id, name, phase FROM products`
- `agents`: `SELECT id, name, status FROM agents` (derive `autonomyLevel` from agent config or default to `"supervised"`, `paused` from `status === "paused"`)
- `notifications`: from `factorySettings` keys prefixed `notif_`

Also implement `PATCH /api/settings` for notification preference updates.

#### B2. `packages/server/src/app.ts` (EDIT)

Mount the settings route:

```typescript
import { createSettingsRoutes } from "./routes/settings.js";
// Inside the `if (options?.db)` block, after the existing route mounts:
api.route("/settings", createSettingsRoutes(options.db));
```

#### B3. `packages/web/src/hooks/useSettings.ts` (NEW)

Create the hook per Contract 2:

```typescript
export function useSettings(): {
  settings: SettingsData | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  save: (updated: SettingsData) => Promise<void>;
  retry: () => void;
}
```

The hook composes the API response with client-side `appearance` from `useTheme()` and density state, producing the full `SettingsData` type that `SettingsPanel` expects.

#### B4. `packages/web/src/layouts/AppShell.tsx` (EDIT -- settings rows)

- Remove `DEFAULT_SETTINGS` from the import line (line 18).
- Add `const { settings } = useSettings();` in the component.
- Replace every usage of `DEFAULT_SETTINGS` with the hook's return value.
- Handle loading state: the SettingsPanel should not open until settings are loaded.

#### B5. `packages/web/src/fixtures/app-shell-data.ts` (EDIT)

Delete `DEFAULT_SETTINGS` export (lines 9-31). After Clusters B and C are done, this file may still have `MOCK_RAIL_*` constants -- they are removed in Cluster C.

### Test pattern (Cluster B)

- Seed DB with 2 products, 2 agents, founder settings.
- `GET /api/settings` -- assert response has correct profile, 2 products, 2 agents.
- `PATCH /api/settings` with `notifications.reviewAlerts = false` -- re-GET -- assert persisted.
- Component: render `AppShell` with `useSettings` returning mock data -- assert SettingsPanel shows the profile name.
- Component: render with `useSettings` returning loading state -- assert panel does not open.

---

## Cluster C -- Rail hook + type alignment (Contract 3)

**Rows closed:** 3 (rows 15-17: `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST`)

### Files changed

#### C1. `packages/web/src/hooks/useRail.ts` (NEW)

Create the hook per Contract 3:

```typescript
export function useRail(): {
  data: RailResponse | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  retry: () => void;
}
```

Fetches `GET /api/rail` (already implemented on server at `packages/server/src/routes/rail.ts`).

#### C2. `packages/web/src/shell/Rail.tsx` (EDIT -- type changes)

Update the three interfaces to match the server's response shape:

**`BetItem` becomes:**
```typescript
export interface BetItem {
  id: string;
  title: string;
  status: BetStatus;
  progress: { done: number; total: number };
}
```
- Removed `product: string` (server does not send it).
- Added `progress` (server sends `{ done, total }`).

**`BlockerItem` becomes:**
```typescript
export interface BlockerItem {
  taskId: string;
  title: string;
  owner: string | null;
  durationBlockedMs: number;
}
```
- Renamed `id` to `taskId`, `agent` to `owner`, `reason` to `title`.
- Replaced `severity` with `durationBlockedMs` (severity is derived client-side).

**`CostInfo` becomes:**
```typescript
export interface CostInfo {
  todaySpend: WireMoney | null;
  todayCap: WireMoney | null;
  weekSpend: WireMoney | null;
  weekCap: WireMoney | null;
  weekTokens: number | null;
}
```
- All fields become nullable.

#### C3. `packages/web/src/shell/Rail.tsx` (EDIT -- rendering)

- Update bet rendering: replace `item.product` display with a progress indicator (`item.progress.done / item.progress.total`).
- Update blocker rendering: derive severity from `durationBlockedMs` using the threshold function from Contract 3:
  ```typescript
  function deriveBlockerSeverity(durationBlockedMs: number): "low" | "medium" | "high" {
    const hours = durationBlockedMs / (1000 * 60 * 60);
    if (hours >= 24) return "high";
    if (hours >= 4) return "medium";
    return "low";
  }
  ```
- Update cost rendering: handle null caps by showing "No cap" text.
- The `RailProps` interface must also be updated to match the new types.

#### C4. `packages/web/src/layouts/AppShell.tsx` (EDIT -- rail rows)

- Remove `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST` from the import (line 19-21).
- Add `const { data: railData, status: railStatus } = useRail();` in the component.
- Wire `railData` into the `<Rail>` component props:
  ```typescript
  bets={railData?.bets ?? []}
  blockers={railData?.blockers ?? []}
  cost={railData?.costBurnRate ?? { todaySpend: null, todayCap: null, weekSpend: null, weekCap: null, weekTokens: null }}
  ```
- Add loading/error handling in the Rail area.

#### C5. `packages/web/src/fixtures/app-shell-data.ts` (EDIT)

Delete `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST` exports (lines 33-48).

After Cluster B deletes `DEFAULT_SETTINGS` and Cluster C deletes the rail mocks, the remaining content of `app-shell-data.ts` is just the type imports at the top. If the file is empty after both clusters, delete it entirely.

### Test pattern (Cluster C)

- Seed DB with 2 active bets + tasks (some done), 1 blocked task, factory settings with daily cap.
- `GET /api/rail` -- assert 2 bets with progress, 1 blocker, cost with non-null todayCap.
- Component: render `Rail` with `useRail()` data -- assert sections render correctly.
- Component: render with null caps -- assert "No cap" text appears.
- Component: render with empty bets -- assert "No active bets" empty state.
- Component: render with loading state -- assert skeleton placeholders.

---

## Cluster D -- Agent participant (Contract 4)

**Rows closed:** 2 (rows 32-33: `PLACEHOLDER_AGENT_PARTICIPANT_ID` and `agent-unassigned`)

### Files changed

#### D1. `packages/web/src/services/host-threads.ts` (EDIT)

- Delete `export const PLACEHOLDER_AGENT_PARTICIPANT_ID = "agent-unassigned" as const;` (line 27).
- Change `resolveOrCreateHostThread` signature: `agentParticipantId: string` becomes `agentParticipantId: string | null`.
- Update thread creation body (line 61):
  ```typescript
  participants: agentParticipantId
    ? [founderId, agentParticipantId]
    : [founderId],
  ```

#### D2. `packages/web/src/services/task-threads.ts` (EDIT)

- Remove `PLACEHOLDER_AGENT_PARTICIPANT_ID` from re-export (line 13).
- Update `resolveOrCreateTaskThread` signature: `agentParticipantId: string` becomes `agentParticipantId: string | null`.

#### D3. `packages/web/src/shell/HostThreadSection.tsx` (EDIT)

- Remove `PLACEHOLDER_AGENT_PARTICIPANT_ID` import (line 37).
- Line 114: replace `PLACEHOLDER_AGENT_PARTICIPANT_ID` with the entity's agent id (from props or context). The component receives `hostKind` and `hostId` -- it needs the assigned agent id. Two approaches:
  - **Pass as prop:** Add `agentId: string | null` to `HostThreadSectionProps`. Callers pass `task.ownerAgentId ?? null`.
  - **Resolve from context:** The component fetches the entity detail and extracts the agent id.

  **Decision: Pass as prop.** The caller already has the entity detail (WorkBet has the bet/task data, other callers have similar context). Adding a prop is simpler than an extra fetch.

#### D4. `packages/web/src/pages/WorkBet.tsx` (EDIT)

- Remove `PLACEHOLDER_AGENT_PARTICIPANT_ID` import (line 48).
- Line 682: replace `PLACEHOLDER_AGENT_PARTICIPANT_ID` with `task.ownerAgentId ?? null` (the task object from the bet detail response has `ownerAgentId`).
- Pass `agentId={task.ownerAgentId ?? null}` to `HostThreadSection` instances.

#### D5. Test files (EDIT)

Multiple test files reference `"agent-unassigned"` and `PLACEHOLDER_AGENT_PARTICIPANT_ID`:

| File | Change |
|---|---|
| `shell/__tests__/HostThreadSection.prefill.test.tsx` (line 31) | Replace `"agent-unassigned"` in mock participants with a seeded agent id or `null` |
| `shell/__tests__/HostThreadSection.test.tsx` (line 26) | Same |
| `__tests__/task-threads.service.test.ts` (lines 13, 123-124) | Remove import of `PLACEHOLDER_AGENT_PARTICIPANT_ID`; remove the "exports constant" assertion; update test calls to use `null` |
| `hooks/__tests__/useHostThread.test.tsx` (line 22) | Replace `"agent-unassigned"` with a seeded agent id or `null` |
| `services/__tests__/host-threads.test.ts` (line 17) | Replace `const AGENT_ID = "agent-unassigned"` with a real test agent id or `null` |
| `services/__tests__/task-threads-shim.test.ts` (lines 7, 12, 77-78) | Remove `PLACEHOLDER_AGENT_PARTICIPANT_ID` import and assertion |

### Test pattern (Cluster D)

- Unit: `resolveOrCreateHostThread("task", "t1", "founder", null)` -- assert POST body `participants: ["founder"]`.
- Unit: `resolveOrCreateHostThread("task", "t1", "founder", "agent-1")` -- assert POST body `participants: ["founder", "agent-1"]`.
- Component: render `HostThreadSection` with `agentId={null}` -- assert thread creation sends single participant.
- Component: render with `agentId={"agent-1"}` -- assert two participants.

---

## Cluster E -- Avatar fallback (Contract 5)

**Rows closed:** 1 (row 22: `FALLBACK_AVATAR` in `useConversationsThreads.ts`)

### Files changed

#### E1. `packages/web/src/hooks/useConversationsThreads.ts` (EDIT)

- Delete the `FALLBACK_AVATAR` constant (lines 45-46).
- Update `rowToItem()` (line 114): set `avatarUrl` to `null` (or remove the field assignment):
  ```typescript
  // Before: avatarUrl: FALLBACK_AVATAR,
  // After:  avatarUrl: null,
  ```

#### E2. Thread list item renderer (EDIT)

The component that renders thread list items (likely in `ThreadSections.tsx` or a child component) currently renders `<img src={avatarUrl}>`. Replace with conditional rendering:

```typescript
function renderAvatar(name: string | null, avatarUrl: string | null): JSX.Element {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full" />;
  }
  if (name) {
    const initials = deriveInitials(name);
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-medium text-[var(--text-1)]">
        {initials}
      </span>
    );
  }
  // No name available -- generic user icon
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-2)]">
      <User size={16} className="text-[var(--text-3)]" />
    </span>
  );
}

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
```

This is a local render function inside the thread list component, NOT a new custom component (respects the 19-component budget).

### Test pattern (Cluster E)

- Component: render thread item with `avatarUrl = null` and `title = "Task thread abc"` -- assert text "Ta" appears in the avatar slot (initials derived from title).
- Component: render with `avatarUrl = "https://example.com/av.png"` -- assert `<img>` element.
- Component: render with empty/null name -- assert Lucide User icon.

---

## Cluster F -- Knowledge count removal (Contract 6)

**Rows closed:** 0 new rows (this is a partial close of the knowledge concern)

Contract 6 specifies removing the hardcoded `count: 12` and leaving the `topicsForScope` import with an eslint-disable tracking comment (since the full knowledge wiring is tracked-out).

### Files changed

#### F1. `packages/web/src/layouts/AppShell.tsx` (EDIT)

Line 67: remove `count: 12`:

```typescript
// Before: { label: "All Items", path: "/knowledge", count: 12 }
// After:  { label: "All Items", path: "/knowledge" }
```

Line 23 (`import { topicsForScope } from "../fixtures/knowledge-data"`): This import stays temporarily but gets an eslint-disable with tracking reference:

```typescript
// eslint-disable-next-line design/no-mock-data-import -- tracked in knowledge-wiring follow-up
import { topicsForScope } from "../fixtures/knowledge-data";
```

**Note:** The disable comment uses "tracked in knowledge-wiring follow-up" rather than a numeric issue id because the follow-up workpackage does not yet have an issue number. The builder should use whatever tracking reference is available (the follow-up is documented in `plans/mock-data-purge/contracts.md` under "Tracked-out rows").

### Test pattern (Cluster F)

- Component: render AppShell with knowledge view active -- assert no "12" badge in submenu.
- Lint: `bun run lint:eslint` confirms the disable comment is accepted (has tracking reference).

---

## Cluster G -- Portfolio straight-swaps

**Rows closed:** 3 (rows 20, 21, 31: `MOCK_PRODUCTS`, `MOCK_CYCLE`, `WorkPortfolio.tsx:../fixtures/portfolio-data`)

### Files changed

#### G1. `packages/web/src/pages/WorkPortfolio.tsx` (EDIT)

**Current behavior (lines 47-62):**
```typescript
const items = products ?? productsData?.products.map(...) ?? MOCK_PRODUCTS;
```

**New behavior:** Remove the `MOCK_PRODUCTS` fallback. When the hook is loading or returns empty, render the appropriate state:

```typescript
const items = products ?? productsData?.products.map(...) ?? null;
```

- When `items` is `null` and `productsData` is loading: render skeleton (the `isLoading` path already exists).
- When `items` is `null` and `productsData` is error: render error state.
- When `items` is an empty array: render empty state ("No products").

Remove the `MOCK_PRODUCTS` import (line 22) and the `MOCK_CYCLE` import.

Delete the `MOCK_CYCLE` usage. The cycle stripe section should render "No active cycle" or be hidden entirely when no cycle data exists. Check how MOCK_CYCLE is used in the component -- it likely feeds a header or progress bar.

#### G2. `packages/web/src/pages/WorkPortfolio.tsx` (EDIT -- type change)

The `products` prop type is currently `typeof MOCK_PRODUCTS`. Once MOCK_PRODUCTS is deleted, this needs to become `readonly PortfolioProduct[]` (import the type from the portfolio-data file or define inline). The `PortfolioProduct` interface in `portfolio-data.ts` should be moved to a types file or kept in the same module if still needed by tests.

**Decision:** Move `PortfolioProduct` interface to `WorkPortfolio.tsx` (co-locate with its consumer). Delete `portfolio-data.ts` entirely once `MOCK_PRODUCTS` and `MOCK_CYCLE` are removed.

#### G3. `packages/web/src/fixtures/portfolio-data.ts` (DELETE)

Delete the entire file once all imports are removed.

### Test pattern (Cluster G)

- Component: render `WorkPortfolio` with `useProducts()` returning `{ data: null, loading: true }` -- assert skeleton renders.
- Component: render with `useProducts()` returning `{ data: { products: [] }, loading: false }` -- assert "No products" empty state.
- Component: render with `useProducts()` returning real data -- assert products render.
- Component: assert no `MOCK_PRODUCTS` string in any rendered output.

---

## Tracked-out rows (NOT in M3 scope)

These 7 rows are explicitly excluded. They are deferred to a knowledge page wiring workpackage.

| # | Row | File:symbol | Reason |
|---|---|---|---|
| 18 | `knowledge-data.ts:MOCK_KNOWLEDGE_ITEMS` | 3 production importers; pages need full API wiring |
| 19 | `knowledge-data.ts:MOCK_CURATION_SUGGESTIONS` | Paired with MOCK_KNOWLEDGE_ITEMS |
| 23 | `AppShell.tsx:../fixtures/knowledge-data` | `topicsForScope` depends on mock items (gets eslint-disable in F1) |
| 26 | `KnowledgeDetail.tsx:../fixtures/knowledge-data` | Detail lookup uses mock items |
| 27 | `KnowledgeDetail.tsx:LEGACY_DETAILS` | k1/k2 hardcoded records |
| 28 | `KnowledgeDetail.tsx:LEGACY_SOURCES` | k1/k2 source strings |
| 29 | `KnowledgeDetail.tsx:FALLBACK_DETAIL` | Error/404 fallback (should be API-driven) |

---

## Fixture file disposition after M3

| File | Fate |
|---|---|
| `app-shell-data.ts` | DELETE entirely (all exports removed by B + C) |
| `portfolio-data.ts` | DELETE entirely (all exports removed by G) |
| `knowledge-data.ts` | STAYS (tracked-out rows) |

---

## Verification strategy

### Per-row closure proof

Each row is proven closed by:
1. **Lint verification:** `bun run mock-inventory:check` regenerates the inventory. The closed row must be absent from the new `inventory.json`.
2. **Test assertion:** A Vitest test asserts the swap (the component/route uses the real source, not the old mock value).
3. **No regression:** `bun run verify` (typecheck + lint + test) is green.

### Per-cluster proof

After all rows in a cluster are closed:
1. The Playwright e2e suite covering the affected pages passes.
2. The lint warning count for the affected files drops to zero (except the one eslint-disable in F1).

### Final M3 proof

After all 7 clusters land:
1. `bun run mock-inventory:check` shows the inventory with only the 7 tracked-out rows.
2. `bun run verify` is green.
3. The full Playwright suite is green.
4. `grep -rn "u-founder\|agent-unassigned\|DEMO_FOUNDER_ID\|DEFAULT_FOUNDER_ID\|MOCK_RAIL\|DEFAULT_SETTINGS\|MOCK_PRODUCTS\|MOCK_CYCLE\|FALLBACK_AVATAR\|PLACEHOLDER_AGENT" packages/web/src/ packages/server/src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|__fixtures__\|\.test\.\|\.spec\.\|\.stories\.\|seed"` returns zero matches.

---

## Risk register

### R1. Auth middleware refactor (Cluster A) -- HIGH

**Risk:** Converting `authMiddleware` from a static export to `createAuthMiddleware(db)` touches the middleware that gates every authenticated route. If the builder misses updating the call site or the type signature, all routes break.

**Mitigation:**
- The change is a single call-site update in `app.ts` (line ~248).
- Run `bun run check` immediately after the middleware change to catch type errors.
- Run the full test suite before proceeding to other clusters.
- The fallback `founderRow?.value ?? "u-founder"` ensures backward compatibility with unseeded DBs.

### R2. `createAuthRoutes` restructuring (Cluster A) -- MEDIUM

**Risk:** The current code mounts auth routes only when `tokenStore` is defined (for WS support). The `/me` endpoint needs to be always available.

**Mitigation:** Split the mount: always mount a base auth router with `/me`; conditionally mount the WS token route. The builder should verify that the rate limiter for `/auth/*` still applies correctly.

### R3. Rail type mismatches (Cluster C) -- MEDIUM

**Risk:** The Rail component rendering assumes `product` on bets and `severity` on blockers. The type changes cascade into the rendering logic, which may have implicit assumptions about non-null values.

**Mitigation:** The builder should update types first, let TypeScript surface all incompatibilities, then fix rendering site by site. The `deriveBlockerSeverity` function is trivial and deterministic.

### R4. Test file blast radius (Cluster D) -- LOW

**Risk:** 6 test files reference `"agent-unassigned"` or `PLACEHOLDER_AGENT_PARTICIPANT_ID`. Missing one causes test failures.

**Mitigation:** `grep -rn "agent-unassigned\|PLACEHOLDER_AGENT" packages/web/src/` catches all sites. The builder must check every match.

### R5. `app-shell-data.ts` deletion timing (Clusters B + C) -- LOW

**Risk:** If Cluster B lands before C (or vice versa), the file still has exports from the other cluster. The builder must not delete the file until both clusters are merged.

**Mitigation:** Each cluster deletes only its own exports. The file deletion happens as a final cleanup after both B and C land. If both run in a single PR/branch (which they do -- this is one M3 branch), coordinate the deletion.

### R6. HostThreadSection needs agentId prop (Cluster D) -- LOW

**Risk:** Adding a required prop to `HostThreadSection` breaks every caller and every test that renders it.

**Mitigation:** Make the prop optional with default `null`. Callers that have the agent id pass it; callers that don't pass nothing (which resolves to `undefined`, treated as `null`). This is backward-compatible.

---

## Task ordering (recommended)

The builder should execute in this order within the single M3 branch:

1. **A1-A2** -- Seed factory settings (prerequisite, safe, no breaking changes).
2. **A3** -- Auth middleware extension (`createAuthMiddleware(db)` + `userId` on context). Run `bun run check` immediately.
3. **A4** -- Auth `/me` endpoint + restructure auth route mounting. Run tests.
4. **A5-A9** -- Server-side `u-founder` replacements (6 sites in bets.ts + 2 in coach/threads + 1 in lifecycle-propagation + 1 doc comment). Run tests.
5. **A10** -- `useCurrentUser` hook (client). No breaking changes yet.
6. **A11-A13** -- Client-side auth swaps (AppShell, WorkBet, HostThreadSection). Run tests.
7. **B1-B5** -- Settings endpoint + hook + AppShell wiring. Can overlap with C.
8. **C1-C5** -- Rail hook + type alignment + AppShell wiring. Can overlap with B.
9. **D1-D5** -- Agent participant removal.
10. **E1-E2** -- Avatar fallback removal.
11. **F1** -- Knowledge count removal.
12. **G1-G3** -- Portfolio straight-swaps.
13. **Cleanup** -- Delete `app-shell-data.ts` (after B + C), delete `portfolio-data.ts` (after G), run full suite, regenerate inventory.

Each numbered step should be a separate commit. Steps 7-12 are independent and can be reordered.

---

## Complete row-to-cluster mapping

| Row | File:symbol | Cluster | Task |
|---|---|---|---|
| 1 | `bets.ts:u-founder` (L363) | A | A5 |
| 2 | `bets.ts:u-founder` (L400) | A | A5 |
| 3 | `bets.ts:u-founder` (L415) | A | A5 |
| 4 | `bets.ts:u-founder` (L444) | A | A5 |
| 5 | `bets.ts:u-founder` (L457) | A | A5 |
| 6 | `bets.ts:u-founder` (L472) | A | A5 |
| 7 | `coach.ts:DEFAULT_FOUNDER_ID` | A | A6 |
| 8 | `coach.ts:u-founder` | A | A6 |
| 9 | `threads.ts:DEFAULT_FOUNDER_ID` | A | A7 |
| 10 | `threads.ts:u-founder` | A | A7 |
| 11 | `bet-state-machine.ts:u-founder` | A | A8 |
| 12 | `lifecycle-propagation.ts:u-founder` | A | A9 |
| 13 | `app-shell-data.ts:DEFAULT_SETTINGS` | B | B4/B5 |
| 14 | `app-shell-data.ts:founder@hyperidle.com` | B | B5 (inside DEFAULT_SETTINGS) |
| 15 | `app-shell-data.ts:MOCK_RAIL_BETS` | C | C4/C5 |
| 16 | `app-shell-data.ts:MOCK_RAIL_BLOCKERS` | C | C4/C5 |
| 17 | `app-shell-data.ts:MOCK_RAIL_COST` | C | C4/C5 |
| 20 | `portfolio-data.ts:MOCK_PRODUCTS` | G | G1/G3 |
| 21 | `portfolio-data.ts:MOCK_CYCLE` | G | G1/G3 |
| 22 | `useConversationsThreads.ts:FALLBACK_AVATAR` | E | E1/E2 |
| 24 | `AppShell.tsx:DEMO_FOUNDER_ID` | A | A11 |
| 25 | `AppShell.tsx:u-founder` | A | A11 |
| 30 | `WorkBet.tsx:u-founder` | A | A12 |
| 31 | `WorkPortfolio.tsx:../fixtures/portfolio-data` | G | G1 |
| 32 | `host-threads.ts:PLACEHOLDER_AGENT_PARTICIPANT_ID` | D | D1 |
| 33 | `host-threads.ts:agent-unassigned` | D | D1 |
| 34 | `HostThreadSection.tsx:u-founder` | A | A13 |

**Tracked-out (NOT in scope):** rows 18, 19, 23, 26, 27, 28, 29.

**Total in-scope rows:** 27. **Total clusters:** 7 (A-G).
