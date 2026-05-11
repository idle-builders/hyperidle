# Replacement contracts -- M2 output

**Purpose:** This document pins the replacement contract for every `needs-contract` and triaged `borderline` row from the M1 inventory. M3 builders read this file and swap mechanically. Each section contains: endpoint path, payload schema, client hook name, migration recipe, test pattern, and ripple sites.

**Rule:** No mock may be removed without implementing its replacement contract here. Removing a mock removes its fallback -- the UI must render honest empty/loading/error states.

---

## Contract 1 -- Auth identity (`GET /api/auth/me`)

**Replaces:** All `"u-founder"` literals (12 server, 3 client), `DEFAULT_FOUNDER_ID` symbols, `founder@hyperidle.com`, `DEMO_FOUNDER_ID`.

### Endpoint

```
GET /api/auth/me
Headers: X-API-Key (required)
```

### Response schema

```typescript
// 200
{
  id: string            // founder id from factory_settings "founder_id" key
  name: string          // from factory_settings "founder_name" key
  email: string         // from factory_settings "founder_email" key
  avatarUrl: string | null  // null until avatar upload is implemented
}

// 401 — missing or invalid API key
{ error: string, code: "UNAUTHORIZED" }
```

### Client hook

```typescript
// packages/web/src/hooks/useCurrentUser.ts
function useCurrentUser(): {
  user: AuthMeResponse | null;
  status: "loading" | "ready" | "error";
  error: string | null;
}
```

### Empty / loading / error

| State | Behavior |
|---|---|
| Loading | AppShell shows existing loading gate; no partial UI |
| Error (401) | Full-page auth error; no partial rendering |
| Empty | Impossible -- endpoint returns user or 401 |

### Server middleware change

In `packages/server/src/middleware/auth.ts`, after the API key check succeeds:

```typescript
// Read founder_id from factorySettings (cached per-request, not per-call)
const founderRow = db.select()
  .from(factorySettings)
  .where(eq(factorySettings.key, "founder_id"))
  .get();
const founderId = founderRow?.value ?? "u-founder";  // fallback for unseeded DBs
c.set("userId", founderId);
```

### Migration recipe per site

| File | Line(s) | Current | Replacement |
|---|---|---|---|
| `bets.ts` | 363, 400, 415, 444, 457, 472 | `"u-founder"` as actor string | `c.get("userId")` passed through route handler |
| `coach.ts` | 24, 32 | `DEFAULT_FOUNDER_ID = "u-founder"` + fallback | `c.get("userId")` -- delete the constant |
| `threads.ts` | 49, 56 | `DEFAULT_FOUNDER_ID = "u-founder"` + fallback | `c.get("userId")` -- delete the constant |
| `bet-state-machine.ts` | 15 | Doc comment mentions `"u-founder"` | Update doc comment; actor comes from caller |
| `lifecycle-propagation.ts` | 411 | `["...", "u-founder"]` in thread participants | Use bet creator's id (from bet row) or factory founder id |
| `AppShell.tsx` | 92 | `DEMO_FOUNDER_ID = "u-founder"` | `useCurrentUser().user?.id` |
| `WorkBet.tsx` | 613 | `FOUNDER_ID = "u-founder"` | `useCurrentUser().user?.id` |
| `HostThreadSection.tsx` | 67 | `"u-founder"` literal | `useCurrentUser().user?.id` |
| `app-shell-data.ts` | 10 | `founder@hyperidle.com` | Removed with DEFAULT_SETTINGS (contract 2) |

### Prerequisite

Seed `factorySettings` with keys: `founder_id`, `founder_name`, `founder_email`. Update `packages/db/src/seed.ts` and `seed-fixtures.ts`.

### Test pattern

- Seed `factorySettings` with `founder_id = "test-user-1"`.
- `PATCH /api/bets/:id` -> assert revision log `actor === "test-user-1"`.
- `GET /api/auth/me` -> assert response `id === "test-user-1"`.
- Client: mock `useCurrentUser` -> assert components use the returned id.

---

## Contract 2 -- Settings (`GET /api/settings`)

**Replaces:** `DEFAULT_SETTINGS` in `app-shell-data.ts:9`.

### Endpoint

```
GET /api/settings
Headers: X-API-Key (required)

PATCH /api/settings
Headers: X-API-Key (required), Content-Type: application/json
Body: partial settings payload
```

### Response schema (GET)

```typescript
{
  profile: {
    name: string
    email: string
    avatarUrl: string | null
  }
  products: Array<{
    id: string
    name: string
    active: boolean   // derived from product.phase !== "archived"
  }>
  agents: Array<{
    id: string
    name: string
    autonomyLevel: "manual" | "supervised" | "autonomous"
    paused: boolean   // derived from agent.status === "paused"
  }>
  notifications: {
    reviewAlerts: boolean
    costAlerts: boolean
    blockerAlerts: boolean
    quietHoursStart: string    // "HH:MM"
    quietHoursEnd: string      // "HH:MM"
    mutedProducts: string[]    // product ids
  }
}
```

**Note:** `appearance` (density, theme) is NOT in the API response. It stays in `localStorage` via `useTheme()` / `useAutoDensity()`. The `SettingsData` type composed by the client merges the API response with local appearance state.

### Data sources

| Field | Source |
|---|---|
| `profile.name` | `factorySettings` key `"founder_name"` |
| `profile.email` | `factorySettings` key `"founder_email"` |
| `profile.avatarUrl` | `factorySettings` key `"founder_avatar_url"` (nullable) |
| `products` | `SELECT id, name, phase FROM products` |
| `agents` | `SELECT id, name, role, status FROM agents` |
| `notifications.*` | `factorySettings` keys prefixed `notif_` |

### Client hook

```typescript
// packages/web/src/hooks/useSettings.ts
function useSettings(): {
  settings: SettingsData | null;   // composed: API response + local appearance
  status: "loading" | "ready" | "error";
  error: string | null;
  save: (updated: SettingsData) => Promise<void>;
  retry: () => void;
}
```

### Empty / loading / error

| State | Behavior |
|---|---|
| Loading | SettingsPanel does not open; trigger button shows a spinner |
| Error | Toast "Failed to load settings"; panel stays closed; retry on next click |
| Empty products | Products section renders empty list with "No products" |
| Empty agents | Agents section renders empty list with "No agents" |

### Migration recipe

1. Create `packages/server/src/routes/settings.ts`.
2. Mount `api.route("/settings", createSettingsRoutes(db))` in `app.ts` after auth middleware line ~248.
3. Create `packages/web/src/hooks/useSettings.ts`.
4. In `AppShell.tsx`: replace `DEFAULT_SETTINGS` with `useSettings()` return value.
5. In `SettingsPanel.tsx`: the `SettingsData` interface stays but `appearance` is composed client-side, not from the API.
6. Delete `DEFAULT_SETTINGS` from `app-shell-data.ts`.

### Test pattern

- Seed DB with 2 products + 2 agents + founder settings.
- `GET /api/settings` -> assert response has 2 products, 2 agents, correct profile.
- `PATCH /api/settings` with `notifications.reviewAlerts = false` -> re-GET -> assert persisted.
- Component: render SettingsPanel with mock hook data, assert sections render.

---

## Contract 3 -- Rail data (`GET /api/rail`)

**Replaces:** `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST` in `app-shell-data.ts`.

### Endpoint

```
GET /api/rail
Headers: X-API-Key (required)
```

**Already implemented** at `packages/server/src/routes/rail.ts`. No new server code needed.

### Response schema (already live)

```typescript
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
  awaitingOrdering: Array<{
    id: string
    title: string
    createdAt: string
  }>
  costBurnRate: {
    todaySpend: WireMoney | null
    todayCap: WireMoney | null
    weekSpend: WireMoney | null
    weekCap: WireMoney | null
    weekTokens: number | null
  }
}
```

### Type shape mismatches to resolve

The current client types in `Rail.tsx` do not match the server response:

| Client type | Server type | Resolution |
|---|---|---|
| `BetItem.product: string` | `RailBet` has no `product` | Drop `product` from client type; use `progress` instead |
| `BetItem.status: BetStatus` | `RailBet.status: string` | Accept `string`, cast to `BetStatus` with validation |
| `BlockerItem.id: string` | `RailBlocker.taskId: string` | Rename field |
| `BlockerItem.agent: string` | `RailBlocker.owner: string\|null` | Rename + accept null |
| `BlockerItem.reason: string` | `RailBlocker.title: string` | Map `title` to display text |
| `BlockerItem.severity` | Not in server response | Remove; derive urgency from `durationBlockedMs` thresholds |
| `CostInfo` fields non-null | `CostBurnRate` fields nullable | Accept nulls; render "No cap" |

### Client hook

```typescript
// packages/web/src/hooks/useRail.ts
function useRail(): {
  data: RailResponse | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  retry: () => void;
}
```

### Empty / loading / error

| State | Behavior |
|---|---|
| Loading | Rail sections show skeleton placeholders (3 pulsing rows per section) |
| Error | Inline "Failed to load" with retry button; rail stays visible collapsed |
| Empty bets | "No active bets" text in bets section |
| Empty blockers | Section collapsed, header shows (0) |
| Null cost caps | Render spend value; show "No cap" where cap is null |

### Migration recipe

1. Create `packages/web/src/hooks/useRail.ts` -- fetches `GET /api/rail`.
2. Update `BetItem` type in `Rail.tsx`: remove `product`, add `progress`.
3. Update `BlockerItem` type in `Rail.tsx`: rename to match `RailBlocker`, remove `severity`.
4. Update `CostInfo` type in `Rail.tsx`: make caps nullable.
5. Update Rail rendering: show progress bar instead of product label; derive blocker urgency from `durationBlockedMs`; handle null caps.
6. In `AppShell.tsx`: replace `MOCK_RAIL_*` imports with `useRail()` hook.
7. Delete `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST` from `app-shell-data.ts`.

### Severity derivation from durationBlockedMs

Since the server does not provide `severity`, the client derives it from how long the task has been blocked:

```typescript
function deriveBlockerSeverity(durationBlockedMs: number): "low" | "medium" | "high" {
  const hours = durationBlockedMs / (1000 * 60 * 60);
  if (hours >= 24) return "high";
  if (hours >= 4) return "medium";
  return "low";
}
```

Thresholds: >=24h = high, >=4h = medium, <4h = low. These are presentation logic, not domain logic.

### Test pattern

- Seed DB with 2 active bets + tasks (some done), 1 blocked task, factory settings with daily cap.
- `GET /api/rail` -> assert 2 bets with progress, 1 blocker, cost with non-null todayCap.
- Component: render Rail with `useRail()` data, assert sections render correctly.
- Component: render Rail with null caps, assert "No cap" text.

---

## Contract 4 -- Agent participant assignment

**Replaces:** `PLACEHOLDER_AGENT_PARTICIPANT_ID = "agent-unassigned"` in `host-threads.ts:27`.

### No new endpoint

The agent id comes from existing detail responses:
- **Tasks:** `GET /api/tasks/:id` returns `ownerAgentId: string | null`.
- **Bets:** `GET /api/bets/:id` returns the bet detail; the team's `leadAgentId` is accessible via the teams table.

### Behavioral contract

```
When creating a thread for a host entity:

1. Resolve the entity's assigned agent:
   - Task: task.ownerAgentId
   - Bet: team.leadAgentId (via bet.teamId)
   - Other: null (no assignment mechanism yet)

2. If agentId is non-null:
   participants = [founderId, agentId]

3. If agentId is null:
   participants = [founderId]
   (Thread is founder-only; agent can be added later)

4. The sentinel "agent-unassigned" must NOT appear in
   thread participants or any API payload.
```

### Client service change

```typescript
// packages/web/src/services/host-threads.ts
export async function resolveOrCreateHostThread(
  hostKind: HostKind,
  hostId: string,
  founderId: string,
  agentParticipantId: string | null,  // was: string (required)
): Promise<string>
```

When `agentParticipantId` is `null`, the `participants` array in the POST body is `[founderId]`.

### Migration recipe

1. Change `resolveOrCreateHostThread` signature: `agentParticipantId: string | null`.
2. Update thread creation body: `participants: agentParticipantId ? [founderId, agentParticipantId] : [founderId]`.
3. Update `HostThreadSection.tsx`: pass `task.ownerAgentId ?? null` instead of `PLACEHOLDER_AGENT_PARTICIPANT_ID`.
4. Update `WorkBet.tsx:682`: pass `task.ownerAgentId ?? null` instead of `PLACEHOLDER_AGENT_PARTICIPANT_ID`.
5. Delete `PLACEHOLDER_AGENT_PARTICIPANT_ID` from `host-threads.ts`.
6. Update `task-threads.ts` re-export shim: remove the re-export of the deleted constant.
7. Update all test files that use `"agent-unassigned"`: use a seeded agent id or `null`.

### Test pattern

- Unit: `resolveOrCreateHostThread("task", "t1", "founder", null)` -> assert POST body `participants: ["founder"]`.
- Unit: `resolveOrCreateHostThread("task", "t1", "founder", "agent-1")` -> assert POST body `participants: ["founder", "agent-1"]`.
- Integration: create task with `ownerAgentId = null`, open thread, verify single participant.

---

## Contract 5 -- Avatar fallback (rendering rule)

**Replaces:** `FALLBACK_AVATAR` data-URI SVG in `useConversationsThreads.ts:45`.

### No endpoint

This is a rendering contract, not an API contract.

### Rendering rule

```
Thread avatar resolution:

1. If thread response includes avatarUrl (future field): render <img>.
2. If participant name is available:
   - Two-word name: uppercase first letter of each word -> "JD"
   - Single word: uppercase first two letters -> "JO"
   - Render as text in a 24x24 circle with --surface-2 bg, --text-1 fg.
3. If no name available:
   - Render Lucide User icon, 16px, --text-3 color, in a 24x24 circle
     with --surface-2 bg.
```

### Migration recipe

1. Delete `FALLBACK_AVATAR` from `useConversationsThreads.ts:45-46`.
2. Update `rowToItem()` at line 114: set `avatarUrl` to `null` (or remove the field).
3. In the component that renders thread list items (ThreadSections or its children): replace `<img src={avatarUrl}>` with conditional rendering: if `avatarUrl` is non-null/empty, render img; otherwise render initials chip.
4. The initials chip is a local render function (`renderInitials`), not a new custom component.

### Test pattern

- Component: render thread item with `avatarUrl = null` and `title = "Task thread abc"` -> assert text "Ta" appears in the avatar slot.
- Component: render with `avatarUrl = "https://example.com/av.png"` -> assert img element.

---

## Contract 6 -- Knowledge submenu count (removal)

**Replaces:** Hardcoded `count: 12` in `AppShell.tsx:67`.

### No endpoint

The count is deleted, not replaced with an API call.

### Migration recipe

1. In `AppShell.tsx` line 67: change `{ label: "All Items", path: "/knowledge", count: 12 }` to `{ label: "All Items", path: "/knowledge" }`.
2. `topicsForScope` import from `knowledge-data.ts`: tracked-out (deferred to knowledge page wiring workpackage). For M3, this import stays temporarily -- it does not violate the mock-data policy because `topicsForScope` is a pure function deriving UI vocabulary (topic label strings), not mock data per se. However, it transitively imports `MOCK_KNOWLEDGE_ITEMS`, so the lint rule will flag it. M3 should add an `eslint-disable` with a tracking issue comment referencing the knowledge wiring workpackage.

### Test pattern

- Component: render AppShell with knowledge view active, assert no "12" badge in submenu.

---

## Straight-swap rows (no contract needed)

These rows can be swapped mechanically without defining a new contract:

| Row | Swap recipe |
|---|---|
| `MOCK_PRODUCTS` | Delete import + fallback in `WorkPortfolio.tsx`. The `useProducts()` hook is already called. When hook returns loading/empty/error, render those states directly instead of falling back to MOCK_PRODUCTS. |
| `MOCK_CYCLE` | Delete. Render "No active cycle" empty state. Cycle data comes from a future API. |
| `WorkPortfolio.tsx:../fixtures/portfolio-data` | Follows from above deletions. |

---

## Tracked-out rows (not M3 scope)

These rows are deferred to a dedicated knowledge page wiring workpackage:

| Row | Reason |
|---|---|
| `MOCK_KNOWLEDGE_ITEMS` | 3 production importers; pages need full API wiring |
| `MOCK_CURATION_SUGGESTIONS` | Paired with MOCK_KNOWLEDGE_ITEMS |
| `AppShell.tsx:../fixtures/knowledge-data` | topicsForScope depends on mock items |
| `KnowledgeDetail.tsx:../fixtures/knowledge-data` | Detail lookup uses mock items |
| `KnowledgeDetail.tsx:LEGACY_DETAILS` | k1/k2 hardcoded records |
| `KnowledgeDetail.tsx:LEGACY_SOURCES` | k1/k2 source strings |
| `KnowledgeDetail.tsx:FALLBACK_DETAIL` | Error/404 fallback (should be API-driven) |

**Tracking:** These 7 rows must be resolved in a follow-up workpackage that wires `KnowledgeList.tsx` and `KnowledgeDetail.tsx` to `GET /api/knowledge/:layer` and the related detail/curation endpoints.
