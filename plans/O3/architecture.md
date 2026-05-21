# O3 Architecture Plan — Service Move and Bootstrap

**Story.** As a developer, I want all strategy services living in `packages/fabric` behind a single `bootstrapFabric()` entry point, so that the kernel/strategy boundary is enforced by the package dependency graph — not just convention.

**Scope:** Architecture Tasks 6 + 7 from Track O.

**Required reading:**
- `docs/architecture/` — system overview, three-layer boundary
- `docs/knowledge-architecture/` — five storage layers, fabric, sync
- `packages/fabric/src/index.ts` — current fabric exports
- `packages/fabric/src/types.ts` — strategy types (moved in O1)
- `packages/server/src/app.ts` — current register* calls and AppOptions
- `packages/server/src/server-factory.ts` — production entry point

---

## Plan Reconciliation: Spec vs Reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| 7 disposer-registered services to move | Confirmed: `session-review-creator`, `policy-engine`, `lifecycle-propagation`, `builtin-routines`, `cost-cap` (registerCostCapDedupReleaser), `git-export` (registerGitExportHandler), `notifications/dispatcher` (registerNotificationDispatcher). All 7 are called in app.ts lines 356-370. | Move all 7. |
| 9 non-disposer strategy services to move | Confirmed: `founder-router`, `item-router`, `relevance-service`, `attention-service`, `review-item-factory`, `silence-policy`, `daily-digest`, `practice-meeting`, `routine-scheduler`. | Move all 9. |
| `notifications/` subtree to move | 8 files: `config.ts`, `console-adapter.ts`, `digest.ts`, `dispatcher.ts`, `ntfy-adapter.ts`, `redact.ts`, `smtp-adapter.ts`, `types.ts`. | Move all 8 as a subtree. |
| `git-export-config.ts` and `git-export-runner.ts` | NOT listed in the 16 services but imported by `git-export.ts` (which IS listed). Without them, `git-export.ts` has broken imports. | Move `git-export-config.ts` and `git-export-runner.ts` alongside `git-export.ts`. They are part of the git-export service cluster. |
| Frontend imports strategy types from `@hyperidle/shared` | Already migrated in O1. All frontend files import from `@hyperidle/fabric/types`. The validation grep `grep -rn "KnowledgeScope|..." packages/web/src/ | grep "@hyperidle/shared"` already returns zero. | AC already satisfied. Include validation step but no code changes needed. |
| Knowledge pages use `/:layer/:id` URL shape | O2 already rewrote server routes to `/:id`. But frontend `KnowledgeList.tsx` line 167 still fetches `/api/knowledge/L3` (the old layer-based URL). This hits `GET /:id` with id="L3" and returns 404/null. | Fix: change fetch URL to `/api/knowledge` (list all items). Update `ApiKnowledgeItem` interface and response parsing since `layer`/`kind` are no longer on `knowledgeItems` but on `knowledgeStrategyFabric`. The list endpoint already joins the fabric table — extend it to include `layer` and `kind` in the response. |
| Components referencing removed columns (session costs, `items.costEstimate`, artifact costs) | No frontend references to `costEstimate` or `items.cost` columns found. The only "cost" mention is in a test description string in `TaskSheet.session.test.tsx` which is just prose, not a column reference. | AC already satisfied. No code changes needed. |
| `observability/` stays in server | Confirmed at `packages/server/src/services/observability/`. 5 files. Routes import from it. | No move needed. Stays in kernel. |
| server already depends on `@hyperidle/fabric` | Confirmed in `packages/server/package.json`. | No new dependency needed. |
| web already depends on `@hyperidle/fabric` | Confirmed in `packages/web/package.json`. | No new dependency needed. |

### Critical Finding: Route Imports from Strategy Services

Several server routes and skill-tools import strategy services via relative paths:

| Consumer (stays in server) | Current import | Post-move import |
|---|---|---|
| `routes/status.ts` | `../services/daily-digest.js` | `@hyperidle/fabric` |
| `routes/status.ts` | `../services/notifications/config.js` (REDACTED) | `@hyperidle/fabric` |
| `routes/routines-routes.ts` | `../services/builtin-routines.js` | `@hyperidle/fabric` |
| `routes/git-export-routes.ts` | `../services/git-export.js` | `@hyperidle/fabric` |
| `routes/git-export-routes.ts` | `../services/git-export-config.js` | `@hyperidle/fabric` |
| `routes/git-export-routes.ts` | `../services/git-export-runner.js` | `@hyperidle/fabric` |
| `routes/notifications-routes.ts` | `../services/notifications/config.js` | `@hyperidle/fabric` |
| `routes/notifications-routes.ts` | `../services/notifications/dispatcher.js` | `@hyperidle/fabric` |
| `routes/notifications-routes.ts` | `../services/notifications/types.js` | `@hyperidle/fabric` |
| `skill-tools/route-item.ts` | `../services/item-router.js` | `@hyperidle/fabric` |
| `skill-tools/create-item.ts` | `../services/item-router.js` | `@hyperidle/fabric` |
| `skill-tools/score-attention.ts` | `../services/attention-service.js` | `@hyperidle/fabric` |
| `app.ts` | All 7 register* imports + notification adapter imports | `@hyperidle/fabric` |

### Critical Finding: Test File Imports

~30 test files in `packages/server/src/__tests__/` import strategy services via relative paths. All must be updated to `@hyperidle/fabric` after the move. Full list in Task 4.

---

## Design Decision: bootstrapFabric Signature

### Option A: bootstrapFabric returns disposers only (spec)
```typescript
export function bootstrapFabric(ctx: {
  db: HyperIdleDb;
  eventBus: EventBus;
}): Array<() => void>
```
The 7 disposer-registered services are called inside `bootstrapFabric`. The caller (app.ts) receives only disposer functions. Notification adapter factory, git runner factory, and observability adapter are NOT passed through — they remain app.ts concerns that are passed to the register functions inside bootstrapFabric via additional context.

Problem: `app.ts` currently passes `notificationAdapterFactory`, `gitRunnerFactory`, and constructs the notification adapter factory inline. These are app-level configuration concerns that bootstrapFabric needs.

### Option B: bootstrapFabric accepts full configuration (recommended)
```typescript
export interface BootstrapFabricContext {
  db: HyperIdleDb;
  eventBus: EventBus;
  notificationAdapterFactory?: (cfg: NotificationConfig) => NotificationAdapter;
  gitRunnerFactory?: (repoPath: string) => GitRunner;
}

export function bootstrapFabric(ctx: BootstrapFabricContext): Array<() => void>
```
This lets bootstrapFabric wire all 7 disposer services internally. The caller passes configuration; bootstrapFabric does the wiring.

**Trade-off:** Option A is simpler but forces app.ts to still know about notification/git internals. Option B encapsulates all strategy wiring in fabric but expands the context surface.

**Decision: Option B.** The whole point of O3 is that app.ts should not know about strategy service internals. The notification/git config types are already fabric types after the move. The `AppOptions` additions (`strategyBootstrap`) should accept a single function, and the production entry point constructs the context.

However, the spec says `bootstrapFabric({ db, eventBus })`. The `notificationAdapterFactory` and `gitRunnerFactory` are currently injected through `AppOptions` for testability. After the move, these factories are internal to fabric's bootstrap — test apps can pass `strategyBootstrap: undefined` for kernel-only testing, or pass a custom bootstrapFabric wrapper for strategy testing.

**Revised decision: Split the difference.** The `bootstrapFabric` signature matches the spec: `{ db, eventBus }`. The notification adapter factory selection and git runner factory are internalized in `bootstrapFabric` — they read config from `factorySettings` (which they already do in the current register* functions). For tests that need to override these, the test creates a custom `strategyBootstrap` function that calls individual register* functions from fabric with custom factories. This preserves testability without bloating the bootstrap context.

BUT: `app.ts` currently accepts `notificationAdapterFactory` and `gitRunnerFactory` in `AppOptions` and passes them through. Tests like notification integration tests inject fake adapters this way. If bootstrapFabric internalizes these, tests lose the injection point.

**Final decision: Keep the extended context.** Add optional overrides to the bootstrap context for testability:

```typescript
export interface BootstrapFabricContext {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly notificationAdapterFactory?: (cfg: NotificationConfig) => NotificationAdapter;
  readonly gitRunnerFactory?: (repoPath: string) => ReturnType<typeof createGitRunner>;
}

export function bootstrapFabric(ctx: BootstrapFabricContext): Array<() => void>
```

`AppOptions` changes:
```typescript
interface AppOptions {
  // ... existing fields ...
  strategyBootstrap?: (ctx: BootstrapFabricContext) => Array<() => void>;
  // Remove: notificationAdapterFactory, gitRunnerFactory
  // (these move into BootstrapFabricContext)
}
```

Wait — the spec says `AppOptions` gains `strategyBootstrap?: (ctx: { db: HyperIdleDb; eventBus: EventBus }) => Array<() => void>`. The spec is explicit about the signature. Let me honor it and handle the factory injection differently.

**Truly final decision:** Follow the spec. `strategyBootstrap` takes `{ db, eventBus }`. The `notificationAdapterFactory` and `gitRunnerFactory` options stay on `AppOptions` and are passed through to `strategyBootstrap` by the caller. In production, `server-factory.ts` constructs `bootstrapFabric` with defaults. In tests, the test provides its own `strategyBootstrap` function (or `undefined` for kernel-only). The bootstrap function itself accepts `{ db, eventBus }` but the production wrapper in `server-factory.ts` curries the factories:

```typescript
// server-factory.ts (production)
const app = createApp({
  db,
  eventBus,
  strategyBootstrap: ({ db, eventBus }) =>
    bootstrapFabric({ db, eventBus }),
});
```

And `bootstrapFabric` uses default factories internally (reads config from DB, constructs default adapters). Tests that need custom adapters wire their own bootstrap function.

Actually, re-reading the spec more carefully: `app.ts` replaces 7 hardwired register* calls with `options.strategyBootstrap?.({ db, eventBus })`. The notification adapter factory is currently passed from `AppOptions` to `registerNotificationDispatcher`. After the move, `bootstrapFabric` needs to know which adapter factory to use.

The cleanest approach: `bootstrapFabric` accepts `{ db, eventBus }` per spec, and internally uses `defaultNotificationAdapterFactory` (which moves to fabric along with the notifications subtree). The `defaultNotificationAdapterFactory` function currently lives in `app.ts` — it moves to `fabric/src/services/notifications/`. Tests that need a fake adapter pass a custom `strategyBootstrap` that calls individual register functions.

This matches the spec exactly. The `notificationAdapterFactory` and `gitRunnerFactory` fields on `AppOptions` become unnecessary since `bootstrapFabric` encapsulates them. Tests that previously relied on `createApp({ notificationAdapterFactory: fakeAdapter })` instead do:

```typescript
createApp({
  strategyBootstrap: ({ db, eventBus }) => {
    const disposers: Array<() => void> = [];
    // ... wire with custom adapter ...
    return disposers;
  },
})
```

Or more likely, since many tests call `createApp()` without caring about strategy, they pass `strategyBootstrap: undefined`.

---

## Acceptance Criteria + Verification

### AC-1: Service move (disposer-registered)
7 disposer-registered services moved to `packages/fabric/src/services/`:
- `session-review-creator.ts`
- `policy-engine.ts`
- `lifecycle-propagation.ts`
- `builtin-routines.ts`
- `cost-cap.ts`
- `git-export.ts` (+ `git-export-config.ts` + `git-export-runner.ts`)
- `notifications/dispatcher.ts` (part of subtree)

**Verification:** `grep -rn "registerPolicyEngine\|registerSessionReviewCreator\|registerLifecyclePropagation\|registerBuiltinRoutineHandlers\|registerCostCapDedupReleaser\|registerGitExportHandler\|registerNotificationDispatcher" packages/server/src/app.ts` returns zero matches.

### AC-2: Service move (non-disposer)
9 non-disposer strategy services moved to `packages/fabric/src/services/`:
- `founder-router.ts`
- `item-router.ts`
- `relevance-service.ts`
- `attention-service.ts`
- `review-item-factory.ts`
- `silence-policy.ts`
- `daily-digest.ts`
- `practice-meeting.ts`
- `routine-scheduler.ts`

**Verification:** `grep -rn "founder-router\|item-router\|relevance-service\|attention-service\|review-item-factory\|silence-policy\|daily-digest\|practice-meeting\|routine-scheduler" packages/server/src/services/` returns zero matches (files no longer exist there).

### AC-3: Notifications subtree move
`notifications/` subtree (8 files) moved to `packages/fabric/src/services/notifications/`.

**Verification:** `ls packages/fabric/src/services/notifications/` shows 8 files. `ls packages/server/src/services/notifications/` returns error (directory no longer exists).

### AC-4: Observability stays in kernel
`observability/` remains at `packages/server/src/services/observability/`.

**Verification:** `ls packages/server/src/services/observability/` shows 5 files.

### AC-5: bootstrapFabric exists
`packages/fabric/src/bootstrap.ts` exports `bootstrapFabric({ db, eventBus })` returning `Array<() => void>`.

**Verification:** `bun run check` passes. Import `bootstrapFabric` from `@hyperidle/fabric` and verify it type-checks.

### AC-6: AppOptions gains strategyBootstrap
`AppOptions` gains `strategyBootstrap?: (ctx: { db: HyperIdleDb; eventBus: EventBus }) => Array<() => void>`.

**Verification:** `bun run check` passes. Type assertion test confirms the field exists.

### AC-7: app.ts uses strategyBootstrap
`app.ts` replaces 7 hardwired register* calls with `options.strategyBootstrap?.({ db, eventBus })`.

**Verification:** AC-1 grep returns zero. `app.ts` contains `strategyBootstrap` call.

### AC-8: Kernel-only boot
`createApp({ strategyBootstrap: undefined })` boots without error.

**Verification:** Integration test: `createApp({})` (no strategyBootstrap) creates app, `GET /api/health` returns 200.

### AC-9: Production entry point
Production entry point passes `bootstrapFabric` as `strategyBootstrap`.

**Verification:** `grep "bootstrapFabric\|strategyBootstrap" packages/server/src/server-factory.ts` shows the wiring.

### AC-10: Frontend knowledge URL shape
KnowledgeList triage view updated from `/api/knowledge/L3` to `/api/knowledge` (or appropriate new shape). `ApiKnowledgeItem` interface updated to handle the new response shape.

**Verification:** `grep -rn "/api/knowledge/L3" packages/web/src/` returns zero. Triage view fetches from the correct endpoint.

### AC-11: Frontend strategy type imports
All frontend imports of strategy types reference `@hyperidle/fabric` instead of `@hyperidle/shared`.

**Verification:** `grep -rn "KnowledgeScope\|KnowledgeLayer\|KNOWLEDGE_LAYERS\|KnowledgeKind\|KnowledgeStatus\|KNOWLEDGE_STATUSES\|KnowledgeSortOption\|KNOWLEDGE_SORT_OPTIONS\|KnowledgeTopicHealth" packages/web/src/ | grep "@hyperidle/shared"` returns zero. (Already passes.)

### AC-12: Full verification
`bun run verify` (check + lint + test) passes with zero errors.

**Verification:** Run `bun run verify`.

---

## Ordered Task List

### Task 1: Move service files to fabric/src/services/

**Dependencies:** None.

**What:** Physical file moves. Create `packages/fabric/src/services/` directory. Move all 18 service files + 8 notification files.

**Files to create:**
- `packages/fabric/src/services/` (directory)
- `packages/fabric/src/services/notifications/` (directory)

**Files to move (server/src/services/ -> fabric/src/services/):**

Disposer-registered (7 logical services, 10 files):
1. `session-review-creator.ts`
2. `policy-engine.ts`
3. `lifecycle-propagation.ts`
4. `builtin-routines.ts`
5. `cost-cap.ts`
6. `git-export.ts`
7. `git-export-config.ts`
8. `git-export-runner.ts`

Non-disposer (9 files):
9. `founder-router.ts`
10. `item-router.ts`
11. `relevance-service.ts`
12. `attention-service.ts`
13. `review-item-factory.ts`
14. `silence-policy.ts`
15. `daily-digest.ts`
16. `practice-meeting.ts`
17. `routine-scheduler.ts`

Notifications subtree (8 files):
18. `notifications/config.ts`
19. `notifications/console-adapter.ts`
20. `notifications/digest.ts`
21. `notifications/dispatcher.ts`
22. `notifications/ntfy-adapter.ts`
23. `notifications/redact.ts`
24. `notifications/smtp-adapter.ts`
25. `notifications/types.ts`

Total: 25 files moved.

**Files that stay in server/src/services/:**
- `bet-state-machine.ts` (kernel — bet lifecycle)
- `dependency-watcher.ts` (kernel — task dependency)
- `direct-thread.ts` (kernel — thread creation)
- `handoff-protocol.ts` (kernel — session handoff)
- `like-escape.ts` (kernel utility)
- `observability/` (kernel infrastructure, 5 files)
- `product-team.ts` (kernel — product/team loading)
- `session-lifecycle.ts` (kernel — session state)
- `session-provisioning.ts` (kernel — session creation)
- `task-audit.ts` (kernel — task audit trail)
- `task-state-machine.ts` (kernel — task lifecycle)
- `team-management.ts` (kernel — team CRUD)
- `ws-broadcaster.ts` (kernel — WebSocket)

**Internal import fixes within moved files:**
After moving, services that import other strategy services via relative paths need updating:
- `builtin-routines.ts` imports `./practice-meeting.js` — stays relative (both moved)
- `attention-service.ts` imports `./review-item-factory.js` — stays relative (both moved)
- `policy-engine.ts` imports `./silence-policy.js` — stays relative (both moved)
- `notifications/dispatcher.ts` imports from `./config.js`, `./digest.js`, `./redact.js`, `./types.js` — all stay relative (all moved together)
- `git-export.ts` imports `./git-export-config.js` and `./git-export-runner.js` — stay relative (all moved)

Services that import from `@hyperidle/db`, `@hyperidle/shared`, or `@hyperidle/fabric` — no change needed (workspace imports work from any package).

Services that import from other server services that did NOT move:
- `cost-cap.ts` — check if it imports any kernel service. Currently imports only from `@hyperidle/db` and `@hyperidle/shared`. OK.
- `lifecycle-propagation.ts` — imports from `@hyperidle/db` and `@hyperidle/shared` and `@hyperidle/fabric`. OK.
- `builtin-routines.ts` — imports `./practice-meeting.js` (moves with it) and from `@hyperidle/fabric` (runStaleSweep). OK.
- `session-review-creator.ts` — imports from `@hyperidle/db` and `@hyperidle/shared`. OK.
- `relevance-service.ts` — imports from `@hyperidle/db` and `@hyperidle/fabric`. OK.
- `attention-service.ts` — imports from `@hyperidle/db`, `@hyperidle/fabric`, `@hyperidle/shared`, and `./review-item-factory.js`. OK.
- `git-export.ts` — imports `./git-export-config.js` and `./git-export-runner.js` (move together). Also imports from `@hyperidle/db` and `@hyperidle/shared`. OK.
- `daily-digest.ts` — imports from `@hyperidle/db`. OK.
- `routine-scheduler.ts` — imports from `@hyperidle/db` and `@hyperidle/shared`. OK.
- `practice-meeting.ts` — imports from `@hyperidle/db`, `@hyperidle/fabric`, `@hyperidle/shared`. OK.

No moved service imports a kernel service that stays in server. Clean separation confirmed.

**Verification:** `ls packages/fabric/src/services/` shows 17 .ts files. `ls packages/fabric/src/services/notifications/` shows 8 .ts files.

### Task 2: Update fabric/src/index.ts to re-export service functions

**Dependencies:** Task 1.

**What:** Add exports from the moved services to `packages/fabric/src/index.ts` so that server routes, skill-tools, and tests can import them via `@hyperidle/fabric`.

**Exports to add (grouped by service):**

From `session-review-creator.ts`:
- `registerSessionReviewCreator`

From `policy-engine.ts`:
- `registerPolicyEngine`

From `lifecycle-propagation.ts`:
- `registerLifecyclePropagation` + any exported types

From `builtin-routines.ts`:
- `registerBuiltinRoutineHandlers`, `BUILTIN_ROUTINE_IDS`, `isBuiltinRoutineId`, `runBuiltinRoutine`, `ROUTINE_SLUG_TO_ID` (check actual exports)

From `cost-cap.ts`:
- `registerCostCapDedupReleaser`, `checkCostCap`, `recordCostAndCheck`, `clearDeduplicationCache`, `CostCapResult`, `CheckCostCapParams`, `RecordCostAndCheckParams` (check actual exports)

From `git-export.ts`:
- `registerGitExportHandler`, `runGitExport`, `createNodeFsAdapter`, `resetExportMutexes`, `FsAdapter` (check actual exports)

From `git-export-config.ts`:
- `GitExportConfig`, `GIT_EXPORT_CONFIG_DEFAULTS`, `loadGitExportConfig`, `readGitExportConfig`, `sanitizePathSegment`, `writeLastCommit`, `writeLastPush` (check actual exports)

From `git-export-runner.ts`:
- `createGitRunner`, `GitRunner` (check actual exports)

From `notifications/dispatcher.ts`:
- `registerNotificationDispatcher`

From `notifications/config.ts`:
- `NotificationConfig`, `SafeNotificationConfig`, `REDACTED`, `pickRecipient`, `readNotificationConfig` etc.

From `notifications/types.ts`:
- `NotificationAdapter`, `NotificationSeverity`, `NotificationChannel`, `Notification`, `Recipient`

From `notifications/console-adapter.ts`:
- `createConsoleAdapter`

From `notifications/ntfy-adapter.ts`:
- `createNtfyAdapter`

From `notifications/smtp-adapter.ts`:
- `createSmtpAdapter`

From `notifications/digest.ts`:
- `DigestResult`, `sendDigest` etc.

From `notifications/redact.ts`:
- `scrubErrorMessage`

From `founder-router.ts`:
- `routeToFounder`

From `item-router.ts`:
- `routeItem`

From `relevance-service.ts`:
- `createRelevanceService`, `SignalSet`

From `attention-service.ts`:
- `buildAttentionService`, `MAX_RECOMPUTE_BATCH`

From `review-item-factory.ts`:
- `createReviewItemForKnowledge`, `attentionReviewReasoningMarker`, `ATTENTION_REVIEW_SOURCE`, `CreateReviewItemForKnowledgeInput`, `CreateReviewItemForKnowledgeResult`

From `silence-policy.ts`:
- `isSilenced`, `isInSilenceWindow`

From `daily-digest.ts`:
- `getDailyDigest`

From `practice-meeting.ts`:
- `createPracticeMeeting`, `runPracticeMeetingTurn`

From `routine-scheduler.ts`:
- `checkAndFireRoutine`, `RoutineScheduler`, `RoutineSchedulerConfig`, `FireResult` etc.

**Implementation note:** The builder MUST read each service file's actual exports (look for `export function`, `export const`, `export type`, `export interface`) rather than relying on this list. This list is approximate.

**Also add `nodemailer` to fabric's dependencies** since `smtp-adapter.ts` imports it. Check `notifications/` files for any dependencies that are currently in server's `package.json` but not in fabric's:
- `nodemailer` (used by smtp-adapter.ts) — add to fabric dependencies
- `ws` — NOT used by moved services, stays in server only
- `@hono/zod-validator` — NOT used by moved services
- `zod` — check if any moved service uses zod (unlikely — they're pure logic, not route validators)

**Verification:** `bun run check` passes after exports are wired. Importing any exported function from `@hyperidle/fabric` works.

### Task 3: Create bootstrapFabric and update AppOptions

**Dependencies:** Tasks 1-2.

**What:** Create `packages/fabric/src/bootstrap.ts`. Update `AppOptions` in `app.ts`. Replace 7 register* calls with `strategyBootstrap`.

**File: `packages/fabric/src/bootstrap.ts`**

```typescript
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { registerBuiltinRoutineHandlers } from "./services/builtin-routines.js";
import { registerCostCapDedupReleaser } from "./services/cost-cap.js";
import { registerGitExportHandler } from "./services/git-export.js";
import { createGitRunner } from "./services/git-export-runner.js";
import { registerLifecyclePropagation } from "./services/lifecycle-propagation.js";
import { defaultNotificationAdapterFactory } from "./services/notifications/config.js";
import { registerNotificationDispatcher } from "./services/notifications/dispatcher.js";
import { registerPolicyEngine } from "./services/policy-engine.js";
import { registerSessionReviewCreator } from "./services/session-review-creator.js";

/**
 * Wire all strategy-layer event-bus handlers and return their disposers.
 *
 * Called by the production entry point via `createApp({ strategyBootstrap: bootstrapFabric })`.
 * Kernel-only tests pass `strategyBootstrap: undefined` to skip strategy wiring entirely.
 *
 * @lore O3: The notification adapter factory and git runner factory are
 * internalized here with defaults (read from factory_settings). Tests that
 * need custom adapters construct their own strategyBootstrap function that
 * calls individual register* functions with custom factories.
 */
export function bootstrapFabric(ctx: {
  db: HyperIdleDb;
  eventBus: EventBus;
}): Array<() => void> {
  const { db, eventBus } = ctx;
  const disposers: Array<() => void> = [];

  disposers.push(registerSessionReviewCreator(db, eventBus));
  disposers.push(registerPolicyEngine(db, eventBus));
  disposers.push(registerLifecyclePropagation(db, eventBus));
  disposers.push(registerBuiltinRoutineHandlers(db, eventBus));
  disposers.push(registerCostCapDedupReleaser(eventBus));
  disposers.push(
    registerGitExportHandler(db, eventBus, {
      runnerFactory: (repoPath) => createGitRunner(repoPath),
    }),
  );
  disposers.push(
    registerNotificationDispatcher(db, eventBus, {
      adapterFactory: defaultNotificationAdapterFactory,
    }),
  );

  return disposers;
}
```

**Note:** `defaultNotificationAdapterFactory` currently lives in `app.ts`. It moves to `fabric/src/services/notifications/config.ts` (or a new file) since all the adapter constructors move to fabric. The function reads `NotificationConfig` and returns the appropriate adapter — all of its dependencies (`createNtfyAdapter`, `createSmtpAdapter`, `createConsoleAdapter`, `NotificationConfig`) are in the notifications subtree.

**File: `packages/fabric/src/index.ts`** — add:
```typescript
export { bootstrapFabric } from "./bootstrap.js";
```

**File: `packages/fabric/package.json`** — add export path:
```json
{
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts",
    "./bootstrap": "./src/bootstrap.ts"
  }
}
```

Actually, `bootstrapFabric` should be importable from `@hyperidle/fabric` (the main entry), not a separate subpath. Keep it in the main index export.

**File: `packages/server/src/app.ts`** changes:

1. Remove all 7 register* imports (lines 30-40, 56-57).
2. Remove `defaultNotificationAdapterFactory` function.
3. Remove notification adapter-related imports that only served `defaultNotificationAdapterFactory`.
4. Add to `AppOptions`:
```typescript
strategyBootstrap?: (ctx: { db: HyperIdleDb; eventBus: EventBus }) => Array<() => void>;
```
5. Remove `notificationAdapterFactory` and `gitRunnerFactory` from `AppOptions`.
6. Replace lines 355-370 (the 7 register* calls + disposer pushes) with:
```typescript
const strategyDisposers = options.strategyBootstrap?.({ db, eventBus }) ?? [];
disposers.push(...strategyDisposers);
```

**IMPORTANT:** The notification routes in `app.ts` (line 291) currently receive `adapterFactory` from `AppOptions`:
```typescript
const adapterFactory = options.notificationAdapterFactory ?? defaultNotificationAdapterFactory;
api.route("/notifications", createNotificationRoutes(options.db, { adapterFactory }));
```
After removing `notificationAdapterFactory` from AppOptions, the notification route needs a different adapter factory source. Since the route is a kernel concern (HTTP routing), but the adapter is a strategy concern, the route should use `defaultNotificationAdapterFactory` imported from `@hyperidle/fabric`. The `createNotificationRoutes` function receives the adapter factory directly.

Actually: `createNotificationRoutes` is used for the HTTP API surface (`/notifications/test`, `/notifications/flush`). These routes create one-shot adapters for testing. The dispatcher (which is the event-bus subscriber) has its own adapter factory via `registerNotificationDispatcher`. The route and the dispatcher currently share the same factory. After O3, the route can import `defaultNotificationAdapterFactory` from `@hyperidle/fabric` directly.

**File: `packages/server/src/server-factory.ts`** changes:

1. Add import: `import { bootstrapFabric } from "@hyperidle/fabric";`
2. Pass to createApp:
```typescript
const app = createApp({
  db,
  eventBus,
  strategyBootstrap: bootstrapFabric,
  registerWebSocket: (apiRouter, tokenStore) => { ... },
});
```
3. Remove `gitRunnerFactory` if it was passed through.

**Verification:**
- `grep -c "register.*Engine\|register.*Creator\|register.*Propagation\|register.*Handlers\|register.*Releaser\|register.*Export\|register.*Dispatcher" packages/server/src/app.ts` returns 0.
- `grep "strategyBootstrap" packages/server/src/app.ts` returns 2+ matches.
- Integration test: `createApp({})` boots, `GET /api/health` returns 200.
- Integration test: `createApp({ strategyBootstrap: bootstrapFabric })` boots with db+eventBus, all strategy handlers fire.

### Task 4: Update all import paths in server

**Dependencies:** Tasks 1-2.

**What:** Update every file in `packages/server/` that imports a moved service via relative path to use `@hyperidle/fabric` instead.

**Route files to update:**

| File | Old import path | New import path |
|---|---|---|
| `routes/status.ts` | `../services/daily-digest.js` | `@hyperidle/fabric` |
| `routes/status.ts` | `../services/notifications/config.js` | `@hyperidle/fabric` |
| `routes/routines-routes.ts` | `../services/builtin-routines.js` | `@hyperidle/fabric` |
| `routes/git-export-routes.ts` | `../services/git-export.js` | `@hyperidle/fabric` |
| `routes/git-export-routes.ts` | `../services/git-export-config.js` | `@hyperidle/fabric` |
| `routes/git-export-routes.ts` | `../services/git-export-runner.js` | `@hyperidle/fabric` |
| `routes/notifications-routes.ts` | `../services/notifications/config.js` | `@hyperidle/fabric` |
| `routes/notifications-routes.ts` | `../services/notifications/dispatcher.js` | `@hyperidle/fabric` |
| `routes/notifications-routes.ts` | `../services/notifications/types.js` | `@hyperidle/fabric` |

**Skill-tool files to update:**

| File | Old import path | New import path |
|---|---|---|
| `skill-tools/route-item.ts` | `../services/item-router.js` | `@hyperidle/fabric` |
| `skill-tools/create-item.ts` | `../services/item-router.js` | `@hyperidle/fabric` |
| `skill-tools/score-attention.ts` | `../services/attention-service.js` | `@hyperidle/fabric` |

**Test files to update (all in `packages/server/src/__tests__/`):**

| Test file | Services imported |
|---|---|
| `attention-service.test.ts` | `attention-service`, `review-item-factory` |
| `relevance-service.test.ts` | `relevance-service` |
| `practice-meeting.test.ts` | `practice-meeting` |
| `routine-scheduler.test.ts` | `routine-scheduler` |
| `founder-router.test.ts` | `founder-router` |
| `silence-policy.test.ts` | `silence-policy` |
| `daily-digest.test.ts` | `daily-digest` |
| `item-router.test.ts` | `item-router` |
| `builtin-routines.test.ts` | `builtin-routines` |
| `cost-cap.test.ts` | `cost-cap` |
| `cost-cap.dedup.test.ts` | `cost-cap` |
| `cost-cap.session-end-paths.test.ts` | `cost-cap`, `handoff-protocol`, `session-lifecycle` |
| `L17-money-wire.test.ts` | `cost-cap` |
| `policy-engine.test.ts` | `policy-engine` |
| `session-review-creator.test.ts` | `session-review-creator` |
| `lifecycle-propagation.test.ts` | `lifecycle-propagation` |
| `M3-lifecycle-propagation-auth.test.ts` | `lifecycle-propagation` |
| `git-export.test.ts` | `git-export`, `git-export-config`, `git-export-runner` |
| `git-export.integration.test.ts` | `git-export`, `git-export-runner` |
| `git-export-routes.test.ts` | `git-export`, `git-export-runner` |
| `session-provisioning.test.ts` | `cost-cap`, `session-review-creator` |
| `session-provisioning.integration.test.ts` | `cost-cap` |
| `sessions.test.ts` | `cost-cap` |
| `redact.test.ts` | `notifications/redact` |
| `notifications/smtp-adapter.test.ts` | `notifications/smtp-adapter`, `notifications/types` |
| `notifications/ntfy-adapter.test.ts` | `notifications/ntfy-adapter`, `notifications/types` |
| `notifications/notifications-routes.test.ts` | `notifications/config` |
| `notifications/routine-digest.integration.test.ts` | `notifications/dispatcher`, `notifications/types`, `routine-scheduler` |

**Note on test imports:** Test files that import both moved services (from `@hyperidle/fabric`) AND kernel services (relative path) keep a mixed import style. For example, `cost-cap.session-end-paths.test.ts` imports `cost-cap` (moves to fabric) AND `handoff-protocol` + `session-lifecycle` (stay in server). The cost-cap imports change to `@hyperidle/fabric`; the kernel imports stay relative.

**Verification:** `bun run check` passes. No remaining relative imports to moved service files.

### Task 5: Update fabric package.json dependencies

**Dependencies:** Task 1 (know which files moved).

**What:** Add dependencies to `packages/fabric/package.json` that the moved service files need but fabric doesn't currently have.

**Dependencies to add:**
- `nodemailer` — used by `notifications/smtp-adapter.ts`. Currently in server's dependencies. Must be added to fabric's dependencies (and `@types/nodemailer` to devDependencies).

**Dependencies to verify (may already be present):**
- `@hyperidle/db` — already present
- `@hyperidle/shared` — already present
- `drizzle-orm` — already present

**Dependencies NOT needed:**
- `hono` — no moved service uses Hono (routes stay in server)
- `ws` — stays in server
- `zod` — only used in route validators which stay in server

**Verification:** `bun install` succeeds. `bun run check` passes in fabric package.

### Task 6: Move defaultNotificationAdapterFactory to fabric

**Dependencies:** Task 1.

**What:** The `defaultNotificationAdapterFactory` function in `app.ts` (lines 122-143) must move to fabric since all its dependencies (adapter constructors, config types) are moving. Place it in `packages/fabric/src/services/notifications/config.ts` or a new file like `packages/fabric/src/services/notifications/adapter-factory.ts`.

**Current code (from app.ts):**
```typescript
function defaultNotificationAdapterFactory(cfg: NotificationConfig): NotificationAdapter {
  switch (cfg.primaryChannel) {
    case "ntfy":
      return createNtfyAdapter({ ... });
    case "smtp":
      if (!(cfg.smtp.host && cfg.smtp.from)) return createConsoleAdapter();
      return createSmtpAdapter({ ... });
    default:
      return createConsoleAdapter();
  }
}
```

This function uses `NotificationConfig`, `NotificationAdapter`, `createNtfyAdapter`, `createSmtpAdapter`, `createConsoleAdapter` — all from the notifications subtree which is already moving.

**Decision:** Place in `fabric/src/services/notifications/adapter-factory.ts` as a separate file. Export from fabric index.

**Verification:** `bootstrapFabric` can import and use `defaultNotificationAdapterFactory`. `app.ts` (for notification routes) imports it from `@hyperidle/fabric`.

### Task 7: Fix frontend knowledge URL shape

**Dependencies:** None (can run in parallel with Tasks 1-6).

**What:** Update `packages/web/src/pages/KnowledgeList.tsx` to use the new knowledge API shape.

**Changes:**
1. Line 167: Change `"/api/knowledge/L3"` to `"/api/knowledge"`.
2. Update `ApiKnowledgeListResponse` interface — the server returns `{ items: [...] }` not `{ layer: string, items: [...] }`. Remove the `layer` field.
3. Update `ApiKnowledgeItem` interface — `layer` and `kind` are no longer root fields on the response items. They may need to come from the strategy fabric join. Check if the current `GET /api/knowledge` route includes fabric fields. Currently it only includes `signals.relevanceScore`. The builder should extend the route to include `layer` and `kind` from the fabric join, OR the frontend should handle their absence.
4. The server `GET /api/knowledge/` route already joins `knowledgeStrategyFabric` for `relevanceScore`. Extend the select to include `layer` and `kind` from the fabric table and include them in the response items.
5. Update the `@lore L22` comments to reflect the new endpoint.

**Also update test file:** `packages/web/src/__tests__/KnowledgeList.test.tsx` line 6 references `/api/knowledge/L3`.

**Verification:**
- `grep -rn "/api/knowledge/L3" packages/web/src/` returns zero.
- `bun run check` passes for web package.

### Task 8: Verify and clean up

**Dependencies:** Tasks 1-7.

**What:** Run full verification suite. Fix any remaining issues.

**Steps:**
1. `bun install` (ensure new dependencies resolve)
2. `bun run check` (zero type errors across all packages)
3. `bun run lint` (zero lint errors — may need to fix import ordering)
4. `bun run test` (all green)
5. Run all AC validation greps:
   - `grep -rn "registerPolicyEngine\|registerSessionReviewCreator\|registerLifecyclePropagation\|registerBuiltinRoutineHandlers\|registerCostCapDedupReleaser\|registerGitExportHandler\|registerNotificationDispatcher" packages/server/src/app.ts` — zero results
   - `grep -rn "founder-router\|item-router\|relevance-service\|attention-service\|review-item-factory\|silence-policy\|daily-digest\|practice-meeting\|routine-scheduler" packages/server/src/services/` — zero results
   - `grep -rn "KnowledgeScope\|KnowledgeLayer\|KNOWLEDGE_LAYERS\|KnowledgeKind\|KnowledgeStatus\|KNOWLEDGE_STATUSES\|KnowledgeSortOption\|KNOWLEDGE_SORT_OPTIONS\|KnowledgeTopicHealth" packages/web/src/ | grep "@hyperidle/shared"` — zero results
   - Kernel-only boot test: `createApp({ strategyBootstrap: undefined })` succeeds

**Verification:** `bun run verify` passes with zero errors.

---

## Type Signatures

### bootstrapFabric

```typescript
// packages/fabric/src/bootstrap.ts
export function bootstrapFabric(ctx: {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
}): Array<() => void>;
```

### AppOptions (updated)

```typescript
// packages/server/src/app.ts
interface AppOptions {
  db?: HyperIdleDb;
  eventBus?: EventBus;
  // NEW — replaces 7 hardwired register* calls
  strategyBootstrap?: (ctx: { db: HyperIdleDb; eventBus: EventBus }) => Array<() => void>;
  // REMOVED: gitRunnerFactory (internalized in bootstrapFabric)
  // REMOVED: notificationAdapterFactory (internalized in bootstrapFabric)
  observabilityAdapter?: ObservabilityAdapter;
  registerWebSocket?: (apiRouter: Hono, tokenStore: UpgradeTokenStore) => void;
  upgradeTokenStore?: UpgradeTokenStore;
}
```

### defaultNotificationAdapterFactory

```typescript
// packages/fabric/src/services/notifications/adapter-factory.ts
export function defaultNotificationAdapterFactory(
  cfg: NotificationConfig,
): NotificationAdapter;
```

---

## Boundary Rule Enforcement

After O3 completes, the following invariant holds:

**Kernel code (`packages/server/`) NEVER imports from `@hyperidle/fabric` at the service layer.** Server routes and skill-tools import strategy functions from `@hyperidle/fabric` (the package), not from relative paths to co-located service files.

**Single honest import in app.ts:** `app.ts` does NOT import `bootstrapFabric` directly. It receives `strategyBootstrap` as an option. Only `server-factory.ts` (production entry point) imports `bootstrapFabric`.

Wait — routes and skill-tools DO import from `@hyperidle/fabric`. That is the intended design: server depends on fabric at the package level. The boundary rule is: **fabric NEVER imports from `@hyperidle/server`**. The dependency direction is server -> fabric -> shared -> db.

---

## Security & Abuse Cases

| Vector | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A — no new endpoints | Existing rate-limiting unchanged |
| Input-trust boundary | N/A — no new user input surfaces | Services move unchanged |
| Secret-handling | N/A — no new credential surfaces | Existing secret handling (SMTP, ntfy tokens) moves with the services |
| Path-traversal | N/A — git-export path handling moves unchanged | Existing sanitization in `git-export-config.ts` moves with it |
| SSRF | N/A — no new outbound URL surfaces | Existing ntfy/SMTP adapter URLs move unchanged |
| Dependency boundary violation | Applicable | Verify: `grep -rn "from.*@hyperidle/server" packages/fabric/src/` returns zero after all moves. |

---

## Protected Tests

These test files' assertions must not change (they test correctness of existing logic, not import paths):

```
protectedTests:
  - packages/server/src/__tests__/health.test.ts
  - packages/server/src/__tests__/api-scaffold.test.ts
  - packages/server/src/__tests__/cors.test.ts
  - packages/server/src/__tests__/error-handler.test.ts
  - packages/server/src/__tests__/api-availability.integration.test.ts
  - packages/server/src/__tests__/api-e2e.integration.test.ts
  - packages/fabric/src/__tests__/ (all existing tests)
```

Test files that WILL change (import paths only, not assertions):
- All test files listed in Task 4 — only import statements change, all assertions remain identical.

---

## Migration Inventory

### Symbol renames/moves

Every moved file creates a broken import at every call site. The full call-site inventory is enumerated in Task 4 above.

### Deleted AppOptions fields

`notificationAdapterFactory` and `gitRunnerFactory` are removed from `AppOptions`. Call sites:

1. **`app.ts`** — uses `options.notificationAdapterFactory ?? defaultNotificationAdapterFactory`. After O3: removed, notification route gets factory from `@hyperidle/fabric` directly.
2. **`server-factory.ts`** — does not currently pass `gitRunnerFactory` or `notificationAdapterFactory` to createApp. No change needed.
3. **Test files that pass `notificationAdapterFactory` to `createApp()`:**
   - `notifications/routine-digest.integration.test.ts` — this test creates an app with a custom adapter. After O3, it either passes a custom `strategyBootstrap` or the test architecture changes.
   - Any other test that constructs `createApp({ notificationAdapterFactory: ... })` — search and update.

The builder MUST grep for `notificationAdapterFactory` and `gitRunnerFactory` across all test files before declaring the migration complete.

### Frontend URL change

`/api/knowledge/L3` -> `/api/knowledge` in `KnowledgeList.tsx` line 167 and `KnowledgeList.test.tsx` line 6 (comment).

---

## Risks & Ambiguities

1. **Circular dependency risk:** fabric already imports from `@hyperidle/db` and `@hyperidle/shared`. The moved services also import from those packages. No new dependency edges are introduced. Server already depends on fabric. Risk: LOW.

2. **Test isolation:** Some server tests create full apps with `createApp({ db, eventBus })`. After O3, these tests will NOT have strategy services wired (since `strategyBootstrap` defaults to undefined). Tests that relied on strategy handlers firing (e.g., policy-engine firing on item_created) need to either pass `bootstrapFabric` as strategyBootstrap or be updated. The builder must identify which integration tests need this.

3. **nodemailer dependency move:** Adding `nodemailer` to fabric's package.json should be straightforward but the builder must verify that Bun resolves it correctly in the fabric package context.

4. **Notification route adapter factory:** After removing `notificationAdapterFactory` from AppOptions, the notification routes need an adapter factory. The cleanest approach is importing `defaultNotificationAdapterFactory` from `@hyperidle/fabric` in the route file. But this means the notification route file imports from fabric — which is the intended post-O3 pattern (routes in server import strategy logic from fabric).

5. **Knowledge API response shape:** The frontend expects `layer` and `kind` on API response items. The current `GET /api/knowledge/` route does not include them. Extending the route to include fabric fields (layer, kind) is a small change but introduces a strategy concern into a kernel route. Alternatively, the frontend could fetch these from a separate fabric endpoint. Recommended: extend the join in the existing route — it already joins `knowledgeStrategyFabric` for `relevanceScore`, adding `layer` and `kind` to the select is trivial and consistent.

---

## Task Parallelism

```
Task 1 (file moves) ─────────┐
                              ├─> Task 2 (fabric exports)
                              │   Task 5 (fabric deps)
                              │   Task 6 (adapter factory)
                              │         │
                              │         v
                              ├─> Task 3 (bootstrap + AppOptions)
                              │         │
                              │         v
                              └─> Task 4 (import path updates)
                                        │
Task 7 (frontend URL) ─────────────────>│
                                        v
                                  Task 8 (verify)
```

Tasks 1 is the critical path start. Tasks 2, 5, 6 can run in parallel after Task 1. Task 3 depends on 2 and 6. Task 4 depends on 2. Task 7 is independent. Task 8 is the final gate.

Recommended execution order for a single builder:
1. Task 1 (file moves)
2. Tasks 2 + 5 + 6 (exports, deps, adapter factory) — batch
3. Task 3 (bootstrap)
4. Task 4 (import updates)
5. Task 7 (frontend URL)
6. Task 8 (verify)
