# M2 Architecture -- Replacement contracts (architecture pass)

> **Note (2026-05-14):** M2's contract approach (`packages/api-contract/` with hand-written type-only interfaces) is superseded
> by V6 API type-safety (`plans/api-typesafety/architecture.md`). V6 uses Hono RPC AppType inference + Zod response schemas
> in `packages/server/src/schemas/`. The existing M2-shipped types in `packages/api-contract/` will be migrated to V6 Zod
> schemas during V6 Phase 3. This document is retained as a historical record of the M2 deliverable.

**Workpackage:** M2 (Track M -- Mock-Data Purge)
**Author:** Designer (architecture phase)
**Date:** 2026-05-11

---

## Required reading (builder MUST open these)

1. `plans/mock-data-purge/inventory.md` -- M1-generated offender inventory (canonical row list)
2. `plans/mock-data-purge/inventory.json` -- machine-readable inventory
3. `plans/mock-data-purge/contracts.md` -- **THIS WP's primary output** (M3 builders read this)
4. `docs/guides/developer/mock-data-policy.md` -- ground-truth dev policy (hard rules)
5. `packages/api-contract/src/index.ts` -- type-only API contract definitions (M2 creates this)

---

## Scope summary

M2 reads the M1 inventory and pins a replacement contract for every `needs-contract` row plus triages every `borderline` row. No implementation code -- only types in `packages/api-contract/` and the `contracts.md` document.

---

## Cluster 1 -- Auth / identity context

### Problem

The string `"u-founder"` is hardcoded in 12 production locations (6 in bets.ts, 2 in coach.ts/threads.ts each, 1 in bet-state-machine.ts, 1 in lifecycle-propagation.ts, plus 3 client-side). The current auth middleware (`packages/server/src/middleware/auth.ts`) checks X-API-Key but does not set an identity. Server routes fall back to `DEFAULT_FOUNDER_ID = "u-founder"`.

### Real source

**Server:** The auth middleware should extract identity from the authenticated request and set it on Hono's context. For v1 (single-founder), the identity is derived from the API key holder -- a factory setting `founder_id` in `factorySettings` table.

**Client:** A `useCurrentUser()` hook that calls `GET /api/auth/me`. The endpoint reads the authenticated identity from the middleware context.

### Contract

```
GET /api/auth/me
Response 200:
{
  id: string          // e.g. "u-founder" from factory_settings
  name: string        // from factory_settings or agents table
  email: string       // from factory_settings
  avatarUrl: string | null
}
Response 401: { error: string, code: "UNAUTHORIZED" }
```

Server middleware extension:

```typescript
// In auth middleware: after successful key check, set identity on context
c.set("userId", founderId);  // founderId read from factorySettings
```

All `"u-founder"` literals in server routes become `c.get("userId")` or the `actor` parameter from the request context. All `"u-founder"` literals in client code become the value from `useCurrentUser()`.

### Type signature

```typescript
// packages/api-contract/src/index.ts
export interface AuthMeResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl: string | null;
}
```

### Empty / loading / error rules

- **Loading:** Client shows the current UI skeleton (AppShell already has a loading gate).
- **Error (401):** Redirect to an error page or show a full-page "Authentication required" message. No partial UI.
- **Empty:** Impossible -- the endpoint always returns the authenticated user or 401.

### Migration recipe

**Server (12 sites):**
1. Add `userId` to Hono context type in auth middleware.
2. Read `founder_id` from `factorySettings` in auth middleware (cache per-request).
3. Replace `"u-founder"` in `bets.ts` (lines 363, 400, 415, 444, 457, 472) with `c.get("userId")` or the `actor` parameter passed through from the route handler.
4. Replace `DEFAULT_FOUNDER_ID` + fallback in `threads.ts:49` and `coach.ts:24` with `c.get("userId")`.
5. Replace `"u-founder"` in `bet-state-machine.ts:15` -- this is in the `RevisionLogEntry` interface doc comment only; the actual actor comes from callers. Callers must pass `c.get("userId")`.
6. Replace `"u-founder"` in `lifecycle-propagation.ts:411` -- the participants array for auto-created threads should use the bet's creator id (from the bet row) or the factory founder id.

**Client (3 sites):**
1. Create `useCurrentUser()` hook that calls `GET /api/auth/me`.
2. Replace `DEMO_FOUNDER_ID` in `AppShell.tsx:92` with `useCurrentUser().id`.
3. Replace `FOUNDER_ID = "u-founder"` in `WorkBet.tsx:613` with `useCurrentUser().id`.
4. Replace `"u-founder"` in `HostThreadSection.tsx:67` with the user id from context.
5. Replace `founder@hyperidle.com` in `app-shell-data.ts:10` -- this is inside DEFAULT_SETTINGS which is replaced by cluster 2 (/api/settings).

### Test pattern

- Unit: mock the auth middleware context, assert route handlers use `c.get("userId")` not a literal.
- Integration: seed `factorySettings` with `founder_id = "test-founder"`, make authenticated requests, assert revision logs / thread participants contain `"test-founder"`.
- E2E: login flow verification -- Playwright asserts the user's name appears in the settings panel header.

### E2E ripple sites

`AppShell.tsx`, `WorkBet.tsx`, `HostThreadSection.tsx`, `bets.ts` (all action endpoints), `coach.ts`, `threads.ts`, `lifecycle-propagation.ts`, `bet-state-machine.ts` (callers only).

### Inventory rows addressed

| row | file:symbol | annotation |
|---|---|---|
| straight-swap | `bets.ts:u-founder` (x6) | contract-pinned (cluster 1) |
| straight-swap | `coach.ts:DEFAULT_FOUNDER_ID` | contract-pinned (cluster 1) |
| straight-swap | `coach.ts:u-founder` | contract-pinned (cluster 1) |
| straight-swap | `threads.ts:DEFAULT_FOUNDER_ID` | contract-pinned (cluster 1) |
| straight-swap | `threads.ts:u-founder` | contract-pinned (cluster 1) |
| straight-swap | `bet-state-machine.ts:u-founder` | contract-pinned (cluster 1) |
| straight-swap | `lifecycle-propagation.ts:u-founder` | contract-pinned (cluster 1) |
| straight-swap | `AppShell.tsx:DEMO_FOUNDER_ID` | contract-pinned (cluster 1) |
| straight-swap | `AppShell.tsx:u-founder` | contract-pinned (cluster 1) |
| straight-swap | `WorkBet.tsx:u-founder` | contract-pinned (cluster 1) |
| straight-swap | `HostThreadSection.tsx:u-founder` | contract-pinned (cluster 1) |
| straight-swap | `app-shell-data.ts:founder@hyperidle.com` | contract-pinned (cluster 1 + cluster 2) |

---

## Cluster 2 -- `/api/settings` contract

### Problem

`DEFAULT_SETTINGS` in `app-shell-data.ts:9` is a hardcoded `SettingsData` object consumed by `AppShell.tsx` for the SettingsPanel. It contains profile, products, agents, notifications, and appearance data -- all of which have real DB sources.

### Real source

A new `GET /api/settings` endpoint that aggregates:
- **profile**: from `factorySettings` (keys: `founder_name`, `founder_email`) + auth identity for `avatarUrl`
- **products**: from `products` table (`SELECT id, name, phase FROM products`)
- **agents**: from `agents` table (`SELECT id, name, status FROM agents`) with autonomy level from a factory setting or agent config
- **notifications**: from `factorySettings` (keys: `notif_review_alerts`, `notif_cost_alerts`, etc.)
- **appearance**: from client-side `localStorage` (density + theme) -- NOT from the server. The server does not store appearance preferences in v1.

### Contract

```
GET /api/settings
Response 200:
{
  profile: {
    name: string
    email: string
    avatarUrl: string | null
  }
  products: Array<{ id: string; name: string; active: boolean }>
  agents: Array<{ id: string; name: string; autonomyLevel: AutonomyLevel; paused: boolean }>
  notifications: {
    reviewAlerts: boolean
    costAlerts: boolean
    blockerAlerts: boolean
    quietHoursStart: string
    quietHoursEnd: string
    mutedProducts: string[]
  }
}
Response 401: standard auth error

PATCH /api/settings
Body: Partial<SettingsPayload>  (same shape as GET response, minus profile.avatarUrl)
Response 200: updated SettingsPayload
Response 400: validation error
Response 401: auth error
```

Note: `appearance` (density, theme) stays client-only via `localStorage` / `useTheme()` / `useAutoDensity()`. It is NOT part of the API contract. The `SettingsData` type used by the SettingsPanel component will compose the API response with the client-side appearance state.

### Type signature

```typescript
// packages/api-contract/src/index.ts
export type AutonomyLevel = "manual" | "supervised" | "autonomous";

export interface SettingsProfile {
  readonly name: string;
  readonly email: string;
  readonly avatarUrl: string | null;
}

export interface SettingsProduct {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface SettingsAgent {
  readonly id: string;
  readonly name: string;
  readonly autonomyLevel: AutonomyLevel;
  readonly paused: boolean;
}

export interface SettingsNotifications {
  readonly reviewAlerts: boolean;
  readonly costAlerts: boolean;
  readonly blockerAlerts: boolean;
  readonly quietHoursStart: string;
  readonly quietHoursEnd: string;
  readonly mutedProducts: readonly string[];
}

export interface SettingsResponse {
  readonly profile: SettingsProfile;
  readonly products: readonly SettingsProduct[];
  readonly agents: readonly SettingsAgent[];
  readonly notifications: SettingsNotifications;
}
```

### Empty / loading / error rules

- **Loading:** SettingsPanel does not open until data is fetched. Show a loading spinner in the panel overlay.
- **Error:** Show a toast "Failed to load settings" and keep the panel closed. Retry on next open.
- **Empty products/agents:** Render the section with an empty list and an "Add" action (existing SettingsPanel pattern).

### Migration recipe

1. Create `packages/server/src/routes/settings.ts` with `createSettingsRoutes(db)`.
2. Mount at `/api/settings` in `app.ts` (after auth middleware).
3. Create `packages/web/src/hooks/useSettings.ts` -- fetches `GET /api/settings`, composes with local `appearance` from `useTheme()`.
4. Replace `DEFAULT_SETTINGS` import in `AppShell.tsx` with `useSettings()`.
5. Update `SettingsPanel` to accept the composed data (API response + client appearance).
6. Delete `DEFAULT_SETTINGS` from `app-shell-data.ts` once no importers remain.

### Test pattern

- Unit: seed DB with products + agents + factory settings, assert `GET /api/settings` returns the composed shape.
- Integration: `PATCH /api/settings` with notification changes, re-GET, assert persistence.
- E2E: open settings panel, verify profile name matches seeded founder name.

### E2E ripple sites

`AppShell.tsx`, `SettingsPanel.tsx`.

### Inventory rows addressed

| row | file:symbol | annotation |
|---|---|---|
| needs-contract | `app-shell-data.ts:DEFAULT_SETTINGS` | contract-pinned (cluster 2) |

---

## Cluster 3 -- `/api/rail` contract

### Problem

Three mock constants in `app-shell-data.ts` feed the Rail component: `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST`. The server already has a fully wired `GET /api/rail` endpoint returning `RailResponse` (bets, blockers, awaitingOrdering, costBurnRate). The client just never calls it.

### Real source

`GET /api/rail` -- already implemented in `packages/server/src/routes/rail.ts`.

### Contract

The server endpoint already exists and returns:

```
GET /api/rail
Response 200:
{
  bets: Array<{
    id: string
    title: string
    status: string
    progress: { done: number; total: number }
  }>
  blockers: Array<{
    taskId: string
    title: string
    owner: string | null
    durationBlockedMs: number
  }>
  awaitingOrdering: Array<{ id: string; title: string; createdAt: string }>
  costBurnRate: {
    todaySpend: WireMoney | null
    todayCap: WireMoney | null
    weekSpend: WireMoney | null
    weekCap: WireMoney | null
    weekTokens: number | null
  }
}
```

**Shape mismatch:** The server's `RailBet` has `progress: { done, total }` but not `product`. The client's `BetItem` has `product` but not `progress`. The server's `RailBlocker` has `taskId, title, owner, durationBlockedMs` but the client's `BlockerItem` has `id, agent, reason, severity`.

**Resolution:** The server's response is the authority. The client's `BetItem` and `BlockerItem` types in `Rail.tsx` must be updated to match the server's `RailBet` and `RailBlocker` shapes. The Rail component rendering adapts to the new shapes.

The server's `CostBurnRate` allows null fields (caps may not be set). The client's `CostInfo` currently requires non-null `todayCap` and `weekCap`. The client type must be updated to accept nulls and render "No cap set" when null.

### Type signature

```typescript
// packages/api-contract/src/index.ts
import type { WireMoney } from "@hyperidle/shared";

export interface RailBet {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly progress: { readonly done: number; readonly total: number };
}

export interface RailBlocker {
  readonly taskId: string;
  readonly title: string;
  readonly owner: string | null;
  readonly durationBlockedMs: number;
}

export interface RailCostBurnRate {
  readonly todaySpend: WireMoney | null;
  readonly todayCap: WireMoney | null;
  readonly weekSpend: WireMoney | null;
  readonly weekCap: WireMoney | null;
  readonly weekTokens: number | null;
}

export interface RailResponse {
  readonly bets: readonly RailBet[];
  readonly blockers: readonly RailBlocker[];
  readonly awaitingOrdering: readonly Array<{
    readonly id: string;
    readonly title: string;
    readonly createdAt: string;
  }>;
  readonly costBurnRate: RailCostBurnRate;
}
```

### Empty / loading / error rules

- **Loading:** Rail shows a compact skeleton (three pulsing rows per section).
- **Error:** Rail shows an inline "Failed to load" message with a retry button. The rail stays visible (collapsed state) so it does not break the layout.
- **Empty bets:** "No active bets" in the bets section.
- **Empty blockers:** Section header shows count 0, section collapsed.
- **Empty cost (all nulls):** Show "---" for spend/cap values. "No cap set" where cap is null.

### Migration recipe

1. Create `packages/web/src/hooks/useRail.ts` -- fetches `GET /api/rail`, returns `{ data, status, error, retry }`.
2. Update `Rail.tsx` types: `BetItem` -> `RailBet` shape, `BlockerItem` -> `RailBlocker` shape, `CostInfo` -> nullable-aware shape.
3. Update `AppShell.tsx`: replace `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST` imports with `useRail()` hook data.
4. Adapt Rail rendering to handle `progress` (instead of `product` on bets), `durationBlockedMs` (instead of `severity` on blockers), and nullable cost fields.
5. Delete the three mock constants from `app-shell-data.ts` once no importers remain.
6. No precursor cost-aggregation endpoint needed -- the server already aggregates cost from sessions and factory settings in the rail endpoint.

### Test pattern

- Unit: seed DB with bets + tasks + sessions + factory settings, call `GET /api/rail`, assert response shape.
- Component: render Rail with empty / populated / error states, assert correct rendering.
- E2E: verify Rail shows real bet titles and cost figures from seeded data.

### E2E ripple sites

`AppShell.tsx`, `Rail.tsx`.

### Inventory rows addressed

| row | file:symbol | annotation |
|---|---|---|
| needs-contract | `app-shell-data.ts:MOCK_RAIL_BETS` | contract-pinned (cluster 3) |
| needs-contract | `app-shell-data.ts:MOCK_RAIL_BLOCKERS` | contract-pinned (cluster 3) |
| needs-contract | `app-shell-data.ts:MOCK_RAIL_COST` | contract-pinned (cluster 3) |

---

## Cluster 4 -- Agent-participant assignment contract

### Problem

`PLACEHOLDER_AGENT_PARTICIPANT_ID = "agent-unassigned"` in `host-threads.ts:27` is used when creating threads for entities that have no assigned agent. 5 importers in production code: `HostThreadSection.tsx`, `WorkBet.tsx`, `task-threads.ts` (re-export shim), plus 2 test files.

### Real source

When a thread is created for a host entity (bet, task, knowledge_item, artifact), the agent participant should come from the entity's assigned agent:
- **Tasks:** `tasks.ownerAgentId` -- already in the schema.
- **Bets:** derived from the bet's team lead: `teams.leadAgentId` where `teams.id = bets.teamId`.
- **Knowledge items / artifacts:** the producing agent, if any.

When no agent is assigned, the thread should still be created but with only the founder as participant. The sentinel value `"agent-unassigned"` should not appear in thread participants.

### Contract

```typescript
// Resolution function (client-side service)
async function resolveAgentForHost(
  hostKind: HostKind,
  hostId: string
): Promise<string | null>

// For tasks: GET /api/tasks/:id -> response includes ownerAgentId
// For bets: GET /api/bets/:id -> response includes team -> teams.leadAgentId
// These endpoints already exist.
```

When `resolveAgentForHost` returns `null`, thread creation uses `participants: [founderId]` (founder only). The thread can later add the agent as a participant when one is assigned.

### Type signature

No new API endpoint needed. The resolution uses existing endpoints. The change is in the client service:

```typescript
// packages/api-contract/src/index.ts
// No new type needed -- uses existing task/bet detail responses.
// The contract is behavioral: thread creation checks ownerAgentId/leadAgentId
// before falling back.
```

### Empty / loading / error rules

- **No agent assigned (null):** Thread is created with founder-only participants. UI shows thread normally. The HostThreadSection does not show an agent avatar -- just the founder's messages.
- **Agent assigned:** Thread is created with `[founderId, agentId]` as participants.
- **Error resolving agent:** Fall back to founder-only participants (same as null case). Log a warning.

### Migration recipe

1. Update `resolveOrCreateHostThread` in `host-threads.ts`: accept `agentParticipantId: string | null` instead of requiring a non-null string. When null, create thread with `participants: [founderId]`.
2. Update callers (`HostThreadSection.tsx`, `WorkBet.tsx`) to pass the entity's agent id from the already-fetched detail data (bet detail has `tasks[].ownerAgentId`; bet itself can derive team lead from the bet detail response).
3. Remove `PLACEHOLDER_AGENT_PARTICIPANT_ID` export from `host-threads.ts` and the `task-threads.ts` re-export shim.
4. Update tests that reference `"agent-unassigned"` -- they should use a real agent id from seed data or `null`.

### Test pattern

- Unit: call `resolveOrCreateHostThread` with `agentParticipantId = null`, assert thread created with single participant.
- Unit: call with a real agent id, assert thread created with two participants.
- Integration: create a task with no `ownerAgentId`, open thread, assert founder-only participants.

### E2E ripple sites

`host-threads.ts`, `task-threads.ts` (shim), `HostThreadSection.tsx`, `WorkBet.tsx`, all test files referencing `agent-unassigned`.

### Inventory rows addressed

| row | file:symbol | annotation |
|---|---|---|
| needs-contract | `host-threads.ts:agent-unassigned` | contract-pinned (cluster 4) |
| borderline | `host-threads.ts:PLACEHOLDER_AGENT_PARTICIPANT_ID` | contract-pinned (cluster 4) |

---

## Cluster 5 -- Avatar fallback contract

### Problem

`FALLBACK_AVATAR` in `useConversationsThreads.ts:45` is a data-URI SVG placeholder (32x32 gray rect). It is used as the avatar for every thread in the conversations list because the `/api/threads` endpoint does not return avatar URLs.

### Real source

Two options were evaluated:

**Option A -- Server guarantees `avatarUrl`:** The threads list endpoint includes participant avatars by joining agents/factorySettings. Cost: adds a join per thread list fetch, requires avatar storage.

**Option B -- Client renders initials chip:** The client renders a design-system-quality initials chip when no `avatarUrl` is present. Cost: zero server changes, renders from existing participant names.

**Decision: Option B.** The data-URI SVG is replaced by a client-side initials chip rendered from the thread participant name. This is consistent with the existing `lead: { name, initials }` pattern used in `portfolio-data.ts` and keeps avatar storage as a future concern.

### Contract

No new API endpoint. The contract is a rendering rule:

```
When rendering a thread avatar:
1. If the thread response includes an avatarUrl field (future): use it.
2. Otherwise: render an initials chip using the first participant's name.
   - Derive initials: first letter of first name + first letter of last name, uppercase.
   - Single-word name: first two letters.
   - Empty/missing name: render a generic user icon.
3. The data-URI FALLBACK_AVATAR constant is deleted.
```

### Type signature

```typescript
// packages/api-contract/src/index.ts
// No new type -- this is a rendering contract, not an API contract.
// The ThreadListRow already has participants: string[].
// A future extension adds avatarUrl?: string to the thread response.
```

### Empty / loading / error rules

- **No name available:** Render a generic user icon (Lucide `User` icon, 16px, `--text-3` color).
- **Name available:** Render initials chip with `--surface-2` background, `--text-1` foreground.

### Migration recipe

1. Remove `FALLBACK_AVATAR` constant from `useConversationsThreads.ts`.
2. Update `rowToItem()` in `useConversationsThreads.ts` to not set `avatarUrl` (or set to null).
3. Update `ThreadSections` component to render an initials chip when `avatarUrl` is null/empty.
4. The initials chip is a local render function, not a new component (component budget constraint).

### Test pattern

- Component: render ThreadSections with items that have no `avatarUrl`, assert initials chip appears.
- Component: render with `avatarUrl` present, assert img element appears.

### E2E ripple sites

`useConversationsThreads.ts`, `ThreadSections.tsx` (or wherever thread items render avatars).

### Inventory rows addressed

| row | file:symbol | annotation |
|---|---|---|
| borderline | `useConversationsThreads.ts:FALLBACK_AVATAR` | contract-pinned (cluster 5) |

---

## Cluster 6 -- Knowledge submenu count contract

### Problem

The knowledge submenu shows a hardcoded `count: 12` in `AppShell.tsx:67`. The `topicsForScope` function from `knowledge-data.ts` is imported to derive topic names for the submenu.

### Real source

The knowledge list API already exists: `GET /api/knowledge/:layer`. The count can be derived from the response length. The topics can be derived from the items' `topic` field.

However, the current knowledge pages (`KnowledgeList.tsx`, `KnowledgeDetail.tsx`) still use `MOCK_KNOWLEDGE_ITEMS` directly. These are in the borderline set because they have a real API counterpart (`GET /api/knowledge/:layer`) but the pages are not yet wired to it.

### Contract

**Count:** Remove the hardcoded `count: 12` from the submenu config. The count is either:
- Derived from the knowledge list response length (if the submenu fetches), or
- Removed entirely (submenu items do not need counts for knowledge).

**Decision:** Remove the count. The knowledge submenu has a single item "All Items" -- a count on the sole nav item adds no information. If counts are needed later, they come from a lightweight `GET /api/knowledge/count` or from the existing list response.

**topicsForScope:** This function derives topic strings from `MOCK_KNOWLEDGE_ITEMS`. When knowledge pages are wired to the real API (separate workpackage, not M3), the topics will come from the API response. For M3, the `topicsForScope` import in `AppShell.tsx` is replaced with topics derived from the same knowledge API, or the submenu drops topic-level navigation until the knowledge pages are fully wired.

### Type signature

No new API type needed. The existing `GET /api/knowledge/:layer` response already includes items with `topic` fields.

### Empty / loading / error rules

- **Loading:** Submenu shows "Knowledge" with items but no count.
- **Error:** Submenu remains static (no count, items from config).
- **Empty:** Submenu shows "All Items" with no count badge.

### Migration recipe

1. Remove `count: 12` from the knowledge submenu config in `AppShell.tsx:67`.
2. Replace `topicsForScope` import with a hook that derives topics from `GET /api/knowledge/:layer` (or remove topic-level submenu items until knowledge pages are fully wired -- tracked-out to knowledge wiring workpackage).
3. Knowledge pages (`KnowledgeList.tsx`, `KnowledgeDetail.tsx`) wiring to real API is a separate scope -- see borderline triage below.

### Test pattern

- Component: render AppShell submenu in knowledge view, assert no hardcoded "12" appears.
- E2E: navigate to knowledge view, assert submenu renders without mock counts.

### E2E ripple sites

`AppShell.tsx` (submenu config and topicsForScope usage).

### Inventory rows addressed

See borderline triage section below for knowledge-related rows.

---

## Borderline row triage

Every borderline row from the M1 inventory receives one of three annotations:

### contract-pinned (addressed by a cluster above)

| row | file:symbol | cluster |
|---|---|---|
| `host-threads.ts:PLACEHOLDER_AGENT_PARTICIPANT_ID` | cluster 4 (agent-assignment) |

### straight-swap (can be replaced mechanically without a new contract)

| row | file:symbol | rationale |
|---|---|---|
| `portfolio-data.ts:MOCK_PRODUCTS` | `useProducts()` hook already exists and is called in `WorkPortfolio.tsx`. The mock is a fallback for loading/unavailable states. M3 removes the fallback per hard rule 3 (no `useFoo() ?? FALLBACK_FOO`). The page renders loading/empty/error states directly. |
| `portfolio-data.ts:MOCK_CYCLE` | Paired with MOCK_PRODUCTS. The cycle data will come from a future cycle API (not yet built). For M3, the cycle section renders an empty state when no API exists. The mock is deleted. |
| `WorkPortfolio.tsx:../fixtures/portfolio-data` | Import follows from MOCK_PRODUCTS/MOCK_CYCLE deletion. |
| `useConversationsThreads.ts:FALLBACK_AVATAR` | Handled as cluster 5 above, but the swap itself is mechanical (delete constant, update render). Re-annotated as **contract-pinned** under cluster 5. |

### tracked-out (deferred to a dedicated workpackage, not M3)

| row | file:symbol | tracking rationale |
|---|---|---|
| `knowledge-data.ts:MOCK_KNOWLEDGE_ITEMS` | 3 production importers (`KnowledgeList.tsx`, `KnowledgeDetail.tsx`, `AppShell.tsx`). The real API (`GET /api/knowledge/:layer`) exists but the pages are not wired to it. Wiring requires reworking the knowledge page data flow (scope/topic filtering, detail lookup, curation suggestions). This is a standalone workpackage scoped under the knowledge track (L22-L25 follow-up). |
| `knowledge-data.ts:MOCK_CURATION_SUGGESTIONS` | Paired with MOCK_KNOWLEDGE_ITEMS. Same tracking rationale. |
| `AppShell.tsx:../fixtures/knowledge-data` | Import of `topicsForScope` -- depends on MOCK_KNOWLEDGE_ITEMS wiring. Tracked-out with the knowledge page wiring workpackage. |
| `KnowledgeDetail.tsx:../fixtures/knowledge-data` | Import of `MOCK_KNOWLEDGE_ITEMS` for detail lookup. Tracked-out. |
| `KnowledgeDetail.tsx:LEGACY_DETAILS` | Hardcoded k1/k2 detail records used as fallback when the item is not in MOCK_KNOWLEDGE_ITEMS. Tracked-out with knowledge page wiring. |
| `KnowledgeDetail.tsx:LEGACY_SOURCES` | Hardcoded k1/k2 source strings. Tracked-out. |
| `KnowledgeDetail.tsx:FALLBACK_DETAIL` | "Unknown Knowledge Item" fallback. This is arguably UI vocabulary (empty state), but it substitutes for a real 404/error state from the API. Tracked-out with knowledge page wiring. |

---

## Complete inventory annotation

All 34 M1 inventory rows annotated:

| # | file:symbol | M1 triage | M2 annotation | cluster |
|---|---|---|---|---|
| 1 | `bets.ts:u-founder` (L363) | straight-swap | contract-pinned | 1 |
| 2 | `bets.ts:u-founder` (L400) | straight-swap | contract-pinned | 1 |
| 3 | `bets.ts:u-founder` (L415) | straight-swap | contract-pinned | 1 |
| 4 | `bets.ts:u-founder` (L444) | straight-swap | contract-pinned | 1 |
| 5 | `bets.ts:u-founder` (L457) | straight-swap | contract-pinned | 1 |
| 6 | `bets.ts:u-founder` (L472) | straight-swap | contract-pinned | 1 |
| 7 | `coach.ts:DEFAULT_FOUNDER_ID` | straight-swap | contract-pinned | 1 |
| 8 | `coach.ts:u-founder` | straight-swap | contract-pinned | 1 |
| 9 | `threads.ts:DEFAULT_FOUNDER_ID` | straight-swap | contract-pinned | 1 |
| 10 | `threads.ts:u-founder` | straight-swap | contract-pinned | 1 |
| 11 | `bet-state-machine.ts:u-founder` | straight-swap | contract-pinned | 1 |
| 12 | `lifecycle-propagation.ts:u-founder` | straight-swap | contract-pinned | 1 |
| 13 | `app-shell-data.ts:DEFAULT_SETTINGS` | needs-contract | contract-pinned | 2 |
| 14 | `app-shell-data.ts:founder@hyperidle.com` | straight-swap | contract-pinned | 1+2 |
| 15 | `app-shell-data.ts:MOCK_RAIL_BETS` | needs-contract | contract-pinned | 3 |
| 16 | `app-shell-data.ts:MOCK_RAIL_BLOCKERS` | needs-contract | contract-pinned | 3 |
| 17 | `app-shell-data.ts:MOCK_RAIL_COST` | needs-contract | contract-pinned | 3 |
| 18 | `knowledge-data.ts:MOCK_KNOWLEDGE_ITEMS` | borderline | tracked-out | -- |
| 19 | `knowledge-data.ts:MOCK_CURATION_SUGGESTIONS` | borderline | tracked-out | -- |
| 20 | `portfolio-data.ts:MOCK_PRODUCTS` | borderline | straight-swap | -- |
| 21 | `portfolio-data.ts:MOCK_CYCLE` | borderline | straight-swap | -- |
| 22 | `useConversationsThreads.ts:FALLBACK_AVATAR` | borderline | contract-pinned | 5 |
| 23 | `AppShell.tsx:../fixtures/knowledge-data` | borderline | tracked-out | -- |
| 24 | `AppShell.tsx:DEMO_FOUNDER_ID` | straight-swap | contract-pinned | 1 |
| 25 | `AppShell.tsx:u-founder` | straight-swap | contract-pinned | 1 |
| 26 | `KnowledgeDetail.tsx:../fixtures/knowledge-data` | borderline | tracked-out | -- |
| 27 | `KnowledgeDetail.tsx:LEGACY_DETAILS` | borderline | tracked-out | -- |
| 28 | `KnowledgeDetail.tsx:LEGACY_SOURCES` | borderline | tracked-out | -- |
| 29 | `KnowledgeDetail.tsx:FALLBACK_DETAIL` | borderline | tracked-out | -- |
| 30 | `WorkBet.tsx:u-founder` | straight-swap | contract-pinned | 1 |
| 31 | `WorkPortfolio.tsx:../fixtures/portfolio-data` | borderline | straight-swap | -- |
| 32 | `host-threads.ts:PLACEHOLDER_AGENT_PARTICIPANT_ID` | borderline | contract-pinned | 4 |
| 33 | `host-threads.ts:agent-unassigned` | needs-contract | contract-pinned | 4 |
| 34 | `HostThreadSection.tsx:u-founder` | straight-swap | contract-pinned | 1 |

**Summary:**
- **contract-pinned:** 24 rows (clusters 1-5)
- **straight-swap:** 3 rows (MOCK_PRODUCTS, MOCK_CYCLE, portfolio-data import)
- **tracked-out:** 7 rows (knowledge page wiring -- deferred workpackage)

---

## API contract package

### Package setup

```
packages/api-contract/
  package.json
  tsconfig.json
  src/
    index.ts        -- all contract types (re-exports)
    auth.ts         -- AuthMeResponse
    settings.ts     -- SettingsResponse, SettingsProfile, etc.
    rail.ts         -- RailResponse, RailBet, RailBlocker, RailCostBurnRate
```

The package exports type-only definitions. No runtime code, no Zod schemas (those live in the server package near the route handlers). The package is `@hyperidle/api-contract` in the workspace.

### Package.json

```json
{
  "name": "@hyperidle/api-contract",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@hyperidle/shared": "workspace:*"
  }
}
```

### tsconfig.json

Extends the root tsconfig. Strict mode. No emit (consumed via workspace resolution).

---

## Self-critique

### Strengths
- Every inventory row is addressed with a clear annotation.
- API contracts are pinned with exact endpoint paths and payload shapes.
- Migration recipes are specific enough for mechanical application.
- No new abstractions introduced -- uses existing patterns (hooks, middleware, Hono context).

### Risks
- **Cluster 1 (auth/identity) is the largest blast radius** -- 12 server sites + 3 client sites. But the swap is mechanical once the middleware sets `userId` on context.
- **Cluster 3 (rail) has a type shape mismatch** between server and client. The Rail component will need rendering changes beyond a simple data-source swap. This is acceptable because the server type is the authority.
- **Cluster 6 (knowledge count) is thin** because the real fix (wiring knowledge pages to the API) is tracked-out. This is correct -- the count removal is mechanical and the page wiring is a separate scope.

### What could go wrong
- The `factorySettings` table may not have `founder_id`, `founder_name`, `founder_email` keys seeded. The seed script must be updated as a prerequisite for clusters 1 and 2.
- Tests that assert `"u-founder"` in revision logs will break. The migration recipe accounts for this but the blast radius in test files is large (~30 test references).

---

## Task ordering for M3

M3 should execute clusters in this order:

1. **Cluster 1 (auth/identity)** -- foundational; clusters 2, 3, 4 depend on `userId` being available.
2. **Cluster 2 (/api/settings)** -- depends on auth context for profile data.
3. **Cluster 3 (/api/rail)** -- independent of 2 but benefits from auth context.
4. **Cluster 4 (agent-assignment)** -- independent of 2 and 3.
5. **Cluster 5 (avatar fallback)** -- independent, smallest scope.
6. **Cluster 6 (knowledge count removal)** -- trivial, can be done anytime.
7. **Straight-swap rows** (MOCK_PRODUCTS, MOCK_CYCLE) -- independent, mechanical.
