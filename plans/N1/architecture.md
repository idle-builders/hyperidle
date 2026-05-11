# N1 Architecture Plan — Node Runtime for the Server

**Workpackage:** N1 — Node runtime for the user-shipped server
**Goal:** Migrate `packages/server` (and production deps) from Bun-specific runtime APIs to Node-compatible equivalents so the server can run inside Electron's main process. Dev stays on Bun.

---

## 1. Concept & Design Gates

- **Concept:** N1 introduces no domain primitives. It is a runtime migration. No concept work needed.
- **Design:** N1 has no UI surface. No design work needed.

---

## 2. Current Bun-Specific API Surface (Exhaustive)

Scanned all `packages/{server,db,shared,fabric}` source (excluding tests). Every Bun-specific usage:

| File | Line(s) | API | Action |
|------|---------|-----|--------|
| `packages/server/src/server-factory.ts` | 6 | `import { serve } from "bun"` | Replace with `@hono/node-server` serve |
| `packages/server/src/server-factory.ts` | 31-32 | `import("bun:sqlite")`, `import("drizzle-orm/bun-sqlite")` | Replace with better-sqlite3 |
| `packages/server/src/routes/ws.ts` | 4, 9 | `createBunWebSocket` from `"hono/bun"` | Replace with `upgradeWebSocket` from `@hono/node-server` |
| `packages/db/src/setup-cli.ts` | 14-17 | `globalThis.Bun` declaration, `RUNNING_UNDER_BUN` | Remove; use better-sqlite3 unconditionally |
| `packages/db/src/setup-cli.ts` | 138-153 | `bun:sqlite` branch in `applyLaptopMigrations` | Remove entire branch |
| `packages/db/src/setup-cli.ts` | 283-286 | `globalThis.Bun` + `import.meta.main` entrypoint guard | Simplify |
| `packages/db/src/seed.ts` | 24-28 | Comment mentioning `bun:sqlite` | Update comment |
| `packages/fabric/src/knowledge-repository.ts` | 189 | Comment: `bun:sqlite / better-sqlite3` | Update to `better-sqlite3` only |
| `packages/server/src/services/git-export-runner.ts` | 14-15 | `@lore` comment mentioning `Bun.spawn` | Update comment |
| `packages/server/src/services/ws-broadcaster.ts` | 7 | Comment: `hono/bun requires Bun runtime` | Update comment |
| `packages/design-system/scripts/serve.ts` | 37,45,70 | `Bun.serve()`, `Bun.file()` | **OUT OF SCOPE** — constraint says no changes to design-system |

---

## 3. New Dependencies

### Add to `packages/server/package.json` dependencies:

| Package | Version | Purpose |
|---------|---------|---------|
| `@hono/node-server` | `^1.14.0` | Node HTTP adapter for Hono; `serve()` + built-in `upgradeWebSocket` |
| `ws` | `^8.20.0` | WebSocketServer (move from devDeps to deps — needed at runtime under Node) |
| `better-sqlite3` | `^11.7.0` | SQLite driver for production DB (replaces `bun:sqlite`) |

### Add to `packages/server/package.json` devDependencies:

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/better-sqlite3` | `^7.6.0` | Type definitions for better-sqlite3 |

### Move in `packages/server/package.json`:

- `ws`: from `devDependencies` to `dependencies` (already `^8.20.0`).
- `@types/ws`: stays in `devDependencies` (already there).

### No changes to:
- `packages/db/package.json` — already has `better-sqlite3` + `@types/better-sqlite3`.
- `packages/shared/package.json` — no Bun APIs used.
- `packages/fabric/package.json` — only a comment change.
- Root `package.json` — no runtime deps affected.

---

## 4. File-by-File Changes

### 4.1 `packages/server/src/server-factory.ts`

**Current state:** Imports `serve` from `"bun"`, uses `bun:sqlite`/`drizzle-orm/bun-sqlite` in `openProductionDb`, calls `serve({ fetch, port, websocket: wsHandler })`, returns `BunServerHandle`.

**Changes:**

1. **Line 6** — Replace `import { serve } from "bun"` with `import { serve } from "@hono/node-server"`.

2. **Lines 15-18** — Rename `BunServerHandle` to `ServerHandle`. Change `server` field type from `ReturnType<typeof serve>` to `import("node:http").Server`. Add `readonly httpServer: import("node:http").Server` for WS attachment clarity. Export the new type.

3. **Lines 22-41** — Rewrite `openProductionDb`:
   ```ts
   function openProductionDb(dbPath: string): HyperIdleDb {
     const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;
   ```
   No — this is ESM. Use static imports at the top of the file instead of dynamic import:
   ```ts
   import Database from "better-sqlite3";
   import { drizzle } from "drizzle-orm/better-sqlite3";
   ```
   The function becomes synchronous:
   ```ts
   function openProductionDb(dbPath: string): HyperIdleDb {
     const sqlite = new Database(dbPath);
     sqlite.pragma("journal_mode = WAL");
     sqlite.pragma("foreign_keys = ON");
     return drizzle(sqlite, { schema: dbSchema });
   }
   ```
   This matches `packages/db/src/connection.ts:createDb` exactly. The `@lore` block about `bun:sqlite` is removed and replaced with a note that production now uses `better-sqlite3` via `createDb` or equivalent.

   **Decision:** Should `openProductionDb` just call `createDb` from `@hyperidle/db`? Yes. It is literally the same code. The function collapses to:
   ```ts
   import { createDb } from "@hyperidle/db";
   // ...
   const db = createDb(dbPath);
   ```
   Remove `openProductionDb` entirely. Add a `@lore` comment explaining that N1 unified the production and test DB paths.

4. **Line 8** — Remove `wsHandler` from the import of `./routes/ws.js`. The new WebSocket setup does not need a standalone `wsHandler` object.

5. **Lines 106-164** — Rename `createBunServer` to `createServer`. Rewrite:
   - `openProductionDb(dbPath)` becomes `createDb(dbPath)` (synchronous, no await needed).
   - The `serve()` call changes from Bun's `serve({ fetch, port, websocket })` to `@hono/node-server`'s `serve({ fetch: staticFetch, port })`. The `websocket` attachment happens differently (see ws.ts changes below).
   - The WebSocket server is created here: `const wss = new WebSocketServer({ noServer: true })`, and passed into the `serve` options: `serve({ fetch: staticFetch, port, websocket: { server: wss } })`.
   - `serve()` returns `ServerType` which is `http.Server | Http2Server | Http2SecureServer`. In our case it is `http.Server`. Store it.
   - The `dispose` function calls `server.close()` instead of `server.stop()`.
   - The `registerWsRoute` call no longer produces a `wsHandler`; the `upgradeWebSocket` from `@hono/node-server` is used in the route definition (see ws.ts).
   - The function signature changes: `export async function createServer(port: number): Promise<ServerHandle>`.

   **Return type:**
   ```ts
   export interface ServerHandle {
     readonly httpServer: ServerType;
     readonly dispose: () => void;
   }
   ```
   Where `ServerType` is imported from `@hono/node-server`.

6. **Static file serving (lines 43-89)** — No changes needed. `createStaticHandler` uses only `node:fs` and `node:path`.

### 4.2 `packages/server/src/routes/ws.ts`

**Current state:** Imports `createBunWebSocket` from `"hono/bun"`, calls it at module scope to get `{ upgradeWebSocket, websocket: wsHandler }`, exports both `registerWsRoute` and `wsHandler`.

**Changes:**

1. **Line 4** — Remove `import { createBunWebSocket } from "hono/bun"`.

2. **Line 9** — Remove `const { upgradeWebSocket, websocket: wsHandler } = createBunWebSocket()`.

3. **`registerWsRoute` signature** — Add `upgradeWebSocket` as a parameter so the route can use the Node adapter's version:
   ```ts
   import type { UpgradeWebSocket } from "hono/ws";

   function registerWsRoute(
     apiApp: Hono,
     eventBus: EventBus | undefined,
     tokenStore: UpgradeTokenStore,
     injectedBroadcaster: WsBroadcaster | null,
     upgradeWebSocket: UpgradeWebSocket,
   ): () => void {
   ```
   The `upgradeWebSocket` parameter replaces the module-scope `createBunWebSocket()` call.

4. **Line 152** — Remove `export { wsHandler }`. Only export `registerWsRoute`.

5. **Lines 90-141** — The `upgradeWebSocket(() => ({ onOpen, onMessage, onClose }))` call stays identical in shape. The `hono/ws` `WSContext` type is the same for both Bun and Node adapters. The `ws.raw` access pattern needs verification:
   - Under `hono/bun`: `ws.raw` is a Bun `ServerWebSocket`.
   - Under `@hono/node-server`: `ws.raw` is a `ws.WebSocket` instance.
   - The `WsContextAdapter` wraps `ws.raw as WSContext` — this cast will need to change. Under the Node adapter, `ws.raw` is the raw `ws.WebSocket` object. The `WsContextAdapter` only calls `.send(data: string)` which both Bun's `ServerWebSocket` and Node's `ws.WebSocket` support. However, the `adapters` Map is keyed by `WSContext` — this needs to be changed to a generic key. Since `ws.raw` returns the underlying WebSocket regardless of runtime, key by that directly (type it as `unknown` or use the `WSContext` from `hono/ws`).

   **Refined approach:** The `WSContext` from `hono/ws` is the Hono wrapper. Inside `onOpen(evt, ws)`, `ws` is a `WSContext`. The adapter currently does `ws.raw as WSContext` which is wrong already (it casts the raw socket to WSContext). The correct approach:
   - Key the `adapters` Map by `WSContext` (the Hono wrapper), not by `ws.raw`.
   - Construct the adapter from the `WSContext` itself (using `ws.send()` which delegates to the raw socket).
   - This removes the dependency on `ws.raw` and makes the code runtime-agnostic.

   Revised `WsContextAdapter`:
   ```ts
   class WsContextAdapter implements WsClient {
     constructor(private readonly ws: WSContext) {}
     send(data: string): void {
       this.ws.send(data);
     }
   }
   ```
   The `adapters` Map becomes `Map<WSContext, WsContextAdapter>`, and `onOpen`/`onMessage`/`onClose` all use `ws` (the WSContext) as the key directly instead of `ws.raw`.

6. **Update `@lore` comments** — Remove "This module requires the Bun runtime (uses hono/bun)." Replace with note that the route is runtime-agnostic; `upgradeWebSocket` is injected by the caller.

### 4.3 `packages/server/src/index.ts`

**Current state:** Calls `createBunServer(port)`.

**Changes:**

1. **Line 2** — Change import from `createBunServer` to `createServer`.
2. **Line 19** — Change `await createBunServer(port)` to `await createServer(port)`.

### 4.4 `packages/db/src/setup-cli.ts`

**Current state:** Declares `globalThis.Bun`, uses `RUNNING_UNDER_BUN` to branch between `bun:sqlite` and `better-sqlite3` in `applyLaptopMigrations`. Entrypoint guard uses `globalThis.Bun` + `import.meta.main`.

**Changes:**

1. **Lines 14-17** — Remove the `declare global { var Bun ... }` block and `RUNNING_UNDER_BUN` constant.

2. **Lines 137-168** — Rewrite `applyLaptopMigrations` to use only the `better-sqlite3` path (currently lines 156-168). Remove the `if (RUNNING_UNDER_BUN)` branch entirely.

   Result:
   ```ts
   async function applyLaptopMigrations(dbPath: string, migrationsFolder: string): Promise<void> {
     const { default: BetterSqlite } = await import("better-sqlite3");
     const { drizzle: nodeDrizzle } = await import("drizzle-orm/better-sqlite3");
     const { migrate: nodeMigrate } = await import("drizzle-orm/better-sqlite3/migrator");
     const sqlite = new BetterSqlite(dbPath);
     try {
       sqlite.pragma("journal_mode = WAL");
       sqlite.pragma("foreign_keys = ON");
       const db = nodeDrizzle(sqlite, { schema });
       nodeMigrate(db, { migrationsFolder });
       seed(db);
     } finally {
       sqlite.close();
     }
   }
   ```
   (Can also be simplified to use `createDb` from connection.ts + separate migrate call, but keeping the explicit flow is fine since setup-cli has its own lifecycle.)

3. **Lines 279-297** — Simplify entrypoint guard. Without `globalThis.Bun`, use `process.argv[1]` check or just remove the auto-execution guard and rely on the `bin/setup` wrapper. The current guard prevents the module from auto-executing when imported by tests under Node. Since we're removing the Bun check, the guard needs a Node-compatible entrypoint detection.

   **Decision:** Use a simple `import.meta.url` + `process.argv[1]` comparison:
   ```ts
   import { fileURLToPath } from "node:url";
   const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
   ```
   This works under both Bun and Node. Bun supports `import.meta.url` and `process.argv[1]`.

4. **Line 39** — Update USAGE string from `"Usage: bun run setup [options]"` to `"Usage: bun run setup [options]"` — actually, keep as-is. The setup script is invoked via `bun run setup` in the root package.json. No change needed.

5. **Update `@lore` comment at top** — Remove the paragraph about Bun refusing to dlopen better-sqlite3. Replace with: "N1: setup-cli uses better-sqlite3 unconditionally. The bun:sqlite branch was removed."

### 4.5 `packages/server/src/services/git-export-runner.ts`

**Current state:** `@lore` comment at line 14-15 says "the plan mandates `Bun.spawn`; we use `node:child_process.spawn`..."

**Changes:**

1. **Lines 14-18** — Update `@lore` block. Remove reference to `Bun.spawn` mandate. New text:
   ```
   @lore N1: `node:child_process.spawn` is the canonical subprocess API.
   Both Bun and Node execute the same code path — Bun provides the
   Node compatibility shim. No runtime-specific branching needed.
   ```

### 4.6 `packages/fabric/src/knowledge-repository.ts`

**Current state:** Line 189-190 comment says `db.transaction` on `bun:sqlite / better-sqlite3 issues BEGIN IMMEDIATE`.

**Changes:**

1. **Line 189-190** — Update comment to remove `bun:sqlite` reference:
   ```
   // `db.transaction` on better-sqlite3 issues BEGIN IMMEDIATE which
   // serialises writes — the version-check is atomic.
   ```

2. **AC6 requirement:** "Vitest covers BEGIN/COMMIT under better-sqlite3." This means a test must verify that `db.transaction()` correctly wraps operations in BEGIN/COMMIT. The existing test suite for knowledge-repository already exercises transactions via `createTestDb()` which uses better-sqlite3. **Verification:** Run existing tests; if they pass, AC6 is satisfied. If there's no explicit BEGIN/COMMIT assertion, add one in the knowledge-repository test file.

### 4.7 `packages/server/src/services/ws-broadcaster.ts`

**Current state:** Line 7 comment says "Extracted from ws.ts route for testability (hono/bun requires Bun runtime)."

**Changes:**

1. **Line 7** — Update comment: "Extracted from ws.ts route for testability and runtime independence."

### 4.8 `packages/db/src/seed.ts`

**Current state:** Lines 24-28 comment mentions `bun:sqlite`.

**Changes:**

1. **Lines 24-28** — Update comment. Remove `bun:sqlite` references. New text:
   ```ts
   // @lore N1: `seed` accepts any synchronous SQLite Drizzle instance over our
   // schema. `TRunResult` is `unknown` because different Drizzle drivers
   // return different types; the seed discards the value.
   ```

### 4.9 `packages/server/package.json`

**Changes:**

1. Add to `dependencies`:
   - `"@hono/node-server": "^1.14.0"`
   - `"better-sqlite3": "^11.7.0"`
2. Move `ws` from `devDependencies` to `dependencies` (keep `"^8.20.0"`).
3. Add to `devDependencies`:
   - `"@types/better-sqlite3": "^7.6.0"`
4. Add `scripts`:
   - `"start:node": "node dist/index.cjs"` — AC8 requirement.
5. **Build script for Node:** The `start:node` script references `dist/index.cjs`. We need a build step. Add:
   - `"build": "bun build src/index.ts --target=node --outfile=dist/index.cjs"` — Bun's bundler can produce a CJS bundle targeting Node. This bundles all source into a single file. **However**, native modules like `better-sqlite3` cannot be bundled — they must be external.

   **Revised approach:** Use `tsup` or `esbuild` for the build, or use `tsx` to run the TypeScript directly under Node without a build step.

   **Decision:** AC8 says `node dist/index.cjs`. This implies a build step. But there's a simpler path: `tsx` can run TypeScript directly under Node. However, the AC is explicit about `dist/index.cjs`. Let's use Bun's bundler with externals:
   ```
   "build:node": "bun build src/index.ts --target=node --outdir=dist --format=cjs --external=better-sqlite3 --external=ws"
   ```
   Then `start:node` becomes `node dist/index.cjs`.

   **Problem:** Workspace package imports (`@hyperidle/db`, `@hyperidle/shared`, etc.) would also need to be bundled or externalized. Bun's bundler can resolve workspace packages. But `better-sqlite3` has native bindings that must be loaded from `node_modules`.

   **Simpler alternative:** Use `tsx` to run the source directly. Change AC8 script to:
   ```
   "start:node": "tsx src/index.ts"
   ```
   This avoids a build step entirely. `tsx` is `esbuild`-powered TypeScript execution for Node. However, AC8 explicitly states `node dist/index.cjs`.

   **Final decision:** Respect the AC literally. Produce a Node-compatible bundle:
   ```
   "build:node": "bun build src/index.ts --target=node --outdir=dist --format=cjs --packages=external"
   ```
   `--packages=external` tells Bun's bundler to externalize all `node_modules` imports (keep them as `require()` calls). The workspace packages get bundled in (their source is inlined). Native modules stay external.

   Add `tsx` as a devDependency for integration testing under Node (AC9: "Integration tests pass under both Bun and Node (via tsx)").

### 4.10 Root `package.json`

**Changes:**

1. Add to root `devDependencies`:
   - `"tsx": "^4.19.0"` — for running tests and the server under Node.
2. Add script:
   - `"start:node": "bun run --filter @hyperidle/server build:node && node packages/server/dist/index.cjs"` — convenience script.

### 4.11 `packages/server/tsconfig.json`

**No changes needed.** The TypeScript config uses `module: ES2022` and `moduleResolution: bundler`. The build step (Bun bundler) handles CJS output. Type checking remains ESM-based.

---

## 5. Ordered Implementation Tasks

### Task 1: Add dependencies
- `bun add @hono/node-server better-sqlite3 --filter @hyperidle/server`
- `bun add -d @types/better-sqlite3 --filter @hyperidle/server`
- Move `ws` from server devDeps to deps.
- `bun add -d tsx` (root).
- Run `bun install`.

### Task 2: Rewrite `packages/server/src/routes/ws.ts`
- Remove `hono/bun` import and `createBunWebSocket()` call.
- Add `upgradeWebSocket` as a parameter to `registerWsRoute`.
- Refactor `WsContextAdapter` to use `WSContext` from `hono/ws` (not `ws.raw`).
- Remove `wsHandler` export.
- Update `@lore` comments.
- **Why first:** ws.ts is imported by server-factory.ts. Changing its exports first prevents cascading compile errors.

### Task 3: Rewrite `packages/server/src/server-factory.ts`
- Replace `import { serve } from "bun"` with `import { serve, upgradeWebSocket } from "@hono/node-server"`.
- Remove `openProductionDb`; use `createDb` from `@hyperidle/db`.
- Remove `wsHandler` import from `./routes/ws.js`.
- Create `WebSocketServer` with `{ noServer: true }`, pass to `serve({ ..., websocket: { server: wss } })`.
- Pass `upgradeWebSocket` to `registerWsRoute`.
- Rename `BunServerHandle` to `ServerHandle`, `createBunServer` to `createServer`.
- Fix `dispose`: `server.close()` instead of `server.stop()`.
- Update `@lore` comments.

### Task 4: Update `packages/server/src/index.ts`
- Change import from `createBunServer` to `createServer`.
- Update the call site.

### Task 5: Rewrite `packages/db/src/setup-cli.ts`
- Remove `globalThis.Bun` declaration and `RUNNING_UNDER_BUN`.
- Remove `bun:sqlite` branch from `applyLaptopMigrations`.
- Replace entrypoint guard with `process.argv[1] === fileURLToPath(import.meta.url)`.
- Update `@lore` comments.

### Task 6: Update comments (non-functional changes)
- `packages/server/src/services/git-export-runner.ts` lines 14-18: update `@lore`.
- `packages/fabric/src/knowledge-repository.ts` line 189: update comment.
- `packages/server/src/services/ws-broadcaster.ts` line 7: update comment.
- `packages/db/src/seed.ts` lines 24-28: update comment.

### Task 7: Add build and start scripts
- Add `build:node` script to `packages/server/package.json`.
- Add `start:node` script to `packages/server/package.json`.
- Add root-level convenience script.

### Task 8: Update existing tests
- `server-factory.integration.test.ts`: rename `createBunServer` references if any exist (the test spawns `bun run src/index.ts` as subprocess — this still works).
- `websocket.test.ts`: same — spawns subprocess, no direct import.
- `index.startup.integration.test.ts`: same — spawns subprocess.
- `ws-broadcaster.test.ts`: no changes needed (tests the broadcaster, not the WS route).
- `ws-broadcaster.thread-topic.test.ts`: no changes needed.
- `ws-subscribe-authz.test.ts`: no changes needed.
- Any test that imports `wsHandler` from `./routes/ws.js` must be updated.

### Task 9: Write new tests
- **Node server integration test** (`node-server.integration.test.ts`): spawn the server under Node (via `tsx packages/server/src/index.ts`) and verify:
  - HTTP health endpoint responds.
  - Domain routes are mounted.
  - WebSocket upgrade works.
  - This satisfies AC9.
- **WebSocket e2e under Node** (`node-ws-e2e.integration.test.ts`): full WS lifecycle test against Node-served path:
  - Connect via upgrade token.
  - Subscribe to a topic.
  - Receive a broadcast.
  - Unsubscribe.
  - Disconnect.
  - This satisfies AC10.
- **Transaction test for knowledge-repository** — verify existing tests exercise BEGIN/COMMIT under better-sqlite3 (AC6). If not, add explicit assertion.
- **setup-cli under Node** — verify `runSetup` works when `globalThis.Bun` is undefined (existing tests already run under Vitest/Node, so this should pass).

### Task 10: Verify `bun run dev` still works (AC7)
- Run `bun run dev` and confirm the server starts with `bun --hot`.
- The `dev` script in server package.json is `bun run --hot src/index.ts`. Since we replaced `import { serve } from "bun"` with `import { serve } from "@hono/node-server"`, the dev path now uses the Node adapter even under Bun. This is intentional — `@hono/node-server` works under Bun because Bun implements the Node `http` module.
- Confirm `bun --hot` still provides HMR.

### Task 11: Build and verify Node bundle
- Run `bun run build:node` (in server package).
- Run `node dist/index.cjs` with appropriate env vars.
- Verify the server starts and responds to health checks.

### Task 12: Full verification
- `bun run check` — zero type errors.
- `bun run lint` — zero lint errors.
- `bun run test` — all tests green.
- Manual verification of Node subprocess tests.

---

## 6. Test Strategy

### Existing tests to update

| Test file | Change needed |
|-----------|---------------|
| `server-factory.integration.test.ts` | None — spawns `bun run src/index.ts` subprocess. Still works. |
| `websocket.test.ts` | None — spawns `bun run src/index.ts` subprocess. Still works. |
| `index.startup.integration.test.ts` | None — spawns subprocess. |
| `ws-broadcaster.test.ts` | None — tests the broadcaster service, not the WS transport. |
| `ws-subscribe-authz.test.ts` | Check if it imports `wsHandler` — if so, remove that import. |

### New tests to write

| Test file | Purpose | AC |
|-----------|---------|-----|
| `node-server.integration.test.ts` | Spawn server via `tsx`, verify HTTP + WS under Node | AC9 |
| `node-ws-e2e.integration.test.ts` | Full WebSocket lifecycle under Node-served path | AC10 |
| Knowledge repo transaction test | Verify BEGIN/COMMIT under better-sqlite3 | AC6 |

### Test infrastructure

The new Node integration tests follow the existing pattern in `server-factory.integration.test.ts`:
1. Create a temp directory with a seeded SQLite DB.
2. Spawn the server as a subprocess (using `tsx` instead of `bun`).
3. Wait for the health endpoint to respond.
4. Run assertions against HTTP and WS endpoints.
5. Kill the subprocess and clean up.

The `tsx` binary must be available. It's added as a root devDependency.

---

## 7. Verification Matrix

| AC | Criterion | Verification Method |
|----|-----------|-------------------|
| AC1 | `server-factory.ts` uses `@hono/node-server` serve; Bun serve removed; exports raw `http.Server` | Code inspection: no `import "bun"`, `serve` from `@hono/node-server`, `ServerHandle.httpServer` typed as `ServerType`. `bun run check` passes. |
| AC2 | `routes/ws.ts` uses Node-compatible upgradeWebSocket; `wsHandler` replaced | Code inspection: no `hono/bun` import, `upgradeWebSocket` injected as parameter, no `wsHandler` export. WS tests pass. |
| AC3 | `openProductionDb` uses `better-sqlite3` only; `bun:sqlite` deleted | Code inspection: no `bun:sqlite` in server-factory.ts. `grep -r "bun:sqlite" packages/server/src/` returns nothing (excluding tests). |
| AC4 | `setup-cli.ts` no `RUNNING_UNDER_BUN`; `globalThis.Bun` shim removed | Code inspection: `grep -r "RUNNING_UNDER_BUN\|globalThis.Bun" packages/db/src/setup-cli.ts` returns nothing. Existing setup-cli tests pass under Vitest (Node). |
| AC5 | `git-export-runner.ts` `@lore` updated | Code inspection: `@lore` block references `node:child_process.spawn` as canonical. |
| AC6 | `knowledge-repository.ts:189` comment updated; Vitest covers BEGIN/COMMIT | Code inspection for comment. Test run: existing `knowledge.test.ts` or new transaction test passes under Vitest. |
| AC7 | `bun run dev` works | Manual: run `bun run dev`, hit `http://localhost:3001/api/health`, get 200. |
| AC8 | `start:node` script exists: `node dist/index.cjs` | `package.json` inspection. Run: `bun run build:node && HYPERIDLE_API_KEY=test node packages/server/dist/index.cjs` starts successfully. |
| AC9 | check + lint + test green; integration tests pass under both Bun and Node | `bun run verify` exits 0. `node-server.integration.test.ts` passes (spawns tsx subprocess). |
| AC10 | Full e2e WebSocket test suite passes against Node-served WS path | `node-ws-e2e.integration.test.ts` passes — connect, subscribe, receive broadcast, unsubscribe, disconnect. |

---

## 8. Risk Areas and Edge Cases

### 8.1 `@hono/node-server` `serve()` return type

`serve()` returns `ServerType = http.Server | Http2Server | Http2SecureServer`. We need to assert or narrow to `http.Server` for the `ServerHandle` type. Since we don't pass `createServer: createSecureServer` or HTTP/2 options, the return is always `http.Server`. A runtime check or type assertion is acceptable here.

**Mitigation:** Use `as http.Server` with a `@lore` comment explaining the narrowing.

### 8.2 `upgradeWebSocket` API compatibility

The `upgradeWebSocket` from `@hono/node-server` has the same signature as `hono/bun`'s version (both implement `UpgradeWebSocket` from `hono/ws`). The `WSContext` wrapper type is the same. However, `ws.raw` returns different underlying objects:
- Bun: `ServerWebSocket`
- Node: `ws.WebSocket`

**Mitigation:** The revised ws.ts avoids accessing `ws.raw` entirely — it uses the `WSContext` wrapper's `.send()` method, which abstracts the runtime.

### 8.3 `bun --hot` with `@hono/node-server`

Bun's `--hot` flag works with any module — it re-executes the module on file change. Since `@hono/node-server`'s `serve()` creates a standard `http.Server`, and Bun's Node compatibility layer supports `http.createServer`, this should work. The previous `bun serve` had native HMR support; the Node adapter relies on Bun's module-level hot reload (process restarts on change).

**Risk:** `serve()` binds a port. On hot reload, the old server must be closed before the new one binds. Bun's `--hot` handles this for `Bun.serve()` automatically. For Node's `http.Server`, Bun's hot reload will kill and restart the process, which closes the port. If Bun's `--hot` does in-process reload (not process restart), the old `http.Server` might hold the port.

**Mitigation:** Test `bun --hot` manually. If port conflicts occur, switch `dev` script to `bun --watch` (which does process restart) instead of `bun --hot` (which does in-process reload). `bun --watch` is the safer option for servers.

### 8.4 `better-sqlite3` native module under Electron

AC explicitly states "Native modules not rebuilt for Electron (that's N4)." So `better-sqlite3` will work in dev/test under Node but will need `electron-rebuild` in N4. No action needed here.

### 8.5 `ws` package as production dependency

Moving `ws` from devDeps to deps is correct — the `WebSocketServer` is now used in the production server path (passed to `serve()`'s `websocket` option). The `ws` package is also used in tests (as a client). Both uses are legitimate.

### 8.6 Bundle size for `dist/index.cjs`

Bun's bundler with `--packages=external` will inline workspace package source but keep `node_modules` imports as `require()` calls. The bundle should be modest (the server source is ~15-20 files). Native modules (`better-sqlite3`) are external and loaded from `node_modules` at runtime.

**Risk:** If workspace packages import from each other circularly, the bundler might produce incorrect output.

**Mitigation:** Test the bundle by running it: `node dist/index.cjs`.

### 8.7 `setup-cli.ts` entrypoint detection

The `import.meta.url` + `process.argv[1]` pattern works under both Bun and Node for ESM modules. Under Bun, `process.argv[1]` is the script path. Under Node with `tsx`, `process.argv[1]` is the tsx loader, not the script. However, since setup-cli is always invoked via `bun packages/db/src/setup-cli.ts` (from root package.json), and tests import it as a module (where the guard should be false), the pattern is safe.

**Alternative:** Keep the `c8 ignore` block but simplify to just the `import.meta.url` check. Or use a separate `bin/setup.ts` entrypoint that imports and calls `runSetup`.

### 8.8 Concurrent `bun run test` and Node subprocess tests

The new Node integration tests spawn a subprocess on a random port. The existing Bun integration tests do the same. Port collisions are unlikely (random port in 10000-60000 range) but possible.

**Mitigation:** The existing tests already use random ports. No additional mitigation needed.

---

## 9. What NOT to Change

- `packages/design-system/` — Uses `Bun.serve()` and `Bun.file()` in its dev server. Out of scope per constraints.
- `packages/web/` — No Bun APIs used. No changes needed.
- `packages/shared/` — No Bun APIs used. No changes needed.
- `scripts/` — Pipeline and build scripts. Out of scope per constraints.
- Test files that spawn `bun run src/index.ts` — These continue to test the Bun execution path. The new Node tests use `tsx` to test the Node path.

---

## 10. Dependency on Hono Version

The project uses `hono: ^4.7.0`. The `@hono/node-server` built-in WebSocket support (with `upgradeWebSocket` export) requires `@hono/node-server >= 1.14.0`. Verify compatibility:

- `@hono/node-server@1.14.0` requires `hono >= 4.x`. Our `^4.7.0` satisfies this.
- The `upgradeWebSocket` from `@hono/node-server` is available since v1.14.0 (⚠️ UNVERIFIED — check changelog before implementation).

If `upgradeWebSocket` is not available in the `@hono/node-server` version installed, fall back to `@hono/node-ws` (deprecated but functional). The architecture supports either approach since `upgradeWebSocket` is injected as a parameter to `registerWsRoute`.

---

## 11. File Path Summary

Files modified:
- `packages/server/src/server-factory.ts`
- `packages/server/src/routes/ws.ts`
- `packages/server/src/index.ts`
- `packages/server/package.json`
- `packages/db/src/setup-cli.ts`
- `packages/db/src/seed.ts`
- `packages/server/src/services/git-export-runner.ts`
- `packages/server/src/services/ws-broadcaster.ts`
- `packages/fabric/src/knowledge-repository.ts`
- `package.json` (root)

Files created:
- `packages/server/src/__tests__/node-server.integration.test.ts`
- `packages/server/src/__tests__/node-ws-e2e.integration.test.ts`

Files deleted:
- None.
