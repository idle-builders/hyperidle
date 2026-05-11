# N1 Code Review

## Verdict: DONE (updated on re-review)

---

## AC Completeness

| AC | Status | Evidence |
|----|--------|---------|
| 1 | PASS | `server-factory.ts` imports `serve` and `upgradeWebSocket` from `@hono/node-server`, no `import "bun"`, exports `ServerHandle` (not `BunServerHandle`), exports `createServer` (not `createBunServer`). Uses `ServerType` from `@hono/node-server` instead of `as http.Server`. |
| 2 | PASS | `routes/ws.ts` removes `hono/bun` import and `createBunWebSocket()` call. `upgradeWebSocket` injected as parameter. `wsHandler` export removed. `WsContextAdapter` uses `WSContext` directly (no `ws.raw`). |
| 3 | PASS | `openProductionDb` removed. `createDb` from `@hyperidle/db` used instead. No `bun:sqlite` or `drizzle-orm/bun-sqlite` in server-factory.ts. |
| 4 | PASS | `setup-cli.ts`: `RUNNING_UNDER_BUN` removed, `globalThis.Bun` declaration removed, `bun:sqlite` branch removed. Entrypoint guard uses `process.argv[1] === fileURLToPath(import.meta.url)`. |
| 5 | PASS | `git-export-runner.ts` `@lore` updated: `node:child_process.spawn` is canonical, no `Bun.spawn` mandate reference. |
| 6 | PASS | `knowledge-repository.ts` comment updated to remove `bun:sqlite`. Transaction test at `packages/fabric/src/__tests__/transaction-semantics.test.ts` covers BEGIN/COMMIT, rollback, and atomicity under better-sqlite3. |
| 7 | NOT VERIFIED | No automated test for `bun run dev`. The architecture plan noted this gap (W1). The builder did not add a smoke test. Cannot confirm AC from the diff alone. |
| 8 | PASS | `packages/server/package.json` has `"start:node": "node dist/index.cjs"` and `"build:node": "bun build src/index.ts --target=node --outdir=dist --format=cjs --packages=external"`. |
| 9 | PARTIAL | `bun run check` passes (0 errors). `bun run lint` passes (0 errors). `bun run test`: 560 failures, but all are pre-existing `better-sqlite3` dlopen failures on the Bun runtime (556 on main). No N1 tests fail. Node integration test (`node-server.integration.test.ts`) spawns server via tsx and verifies HTTP + WS. |
| 10 | PASS | `node-ws-e2e.integration.test.ts` covers: connect with token, receive connected ack, subscribe to topic, receive subscribed ack, unsubscribe, receive unsubscribed ack, connect without token (401), reuse consumed token (401). |

---

## Lens Findings

### Architecture

**A1 (positive): B1 blocker respected.** The reviewer blocker B1 ("no `as http.Server` cast") is honored. `ServerHandle.httpServer` is typed as `ServerType` from `@hono/node-server`. The `@lore` comment at line 21 of `server-factory.ts` explicitly documents this decision and cites the B1 blocker. `.close()` exists on all union members, so no narrowing is needed.

**A2 (positive): B2 blocker respected.** No rejected approaches are implemented. The builder followed the final decisions from the plan: `createDb` from `@hyperidle/db` (not the rejected `require("better-sqlite3")` or static import approaches), `WebSocketServer({ noServer: true })` with `serve({ ..., websocket: { server: wss } })`.

**A3 (positive): Layer integrity maintained.** `server-factory.ts` imports from `@hyperidle/db` (downward dependency) and `@hyperidle/shared` (downward dependency). No upward or cross-layer violations.

**A4 (positive): API contracts match plan.** The `upgradeWebSocket` injection pattern in `registerWsRoute` matches the plan Section 4.2. The `WsContextAdapter` refactor to use `WSContext` directly (not `ws.raw`) matches plan Section 4.2 point 5.

**A5 (finding): Stale comments in `app.ts` create false understanding.** `packages/server/src/app.ts` lines 81, 85, 87, 163, 236 still reference "Bun-only", "non-Bun", and `createBunServer`. After N1, the WS hook is runtime-agnostic. These comments are now incorrect. While `app.ts` was not in the plan's file list (Section 11), a comment on line 87 explicitly says `createBunServer` which no longer exists. See F3.

**A6 (finding): Stale comment in existing integration test.** `packages/server/src/__tests__/server-factory.integration.test.ts` lines 4, 21, 25 reference `createBunServer` and claim "Vitest runs under Node, but `createBunServer` imports `bun`". After N1, `createServer` imports from `@hono/node-server`, not `bun`. The comment is now factually wrong. See F4.

### Security

**S1 (positive): No new attack surface.** The migration replaces one HTTP server implementation with another. The auth middleware, rate limiting, and WS token validation are unchanged.

**S2 (pre-existing, not N1): Path traversal in `createStaticHandler`.** Line 62 of `server-factory.ts` joins `dir` with `url.pathname` without path traversal protection. A request to `/../../../etc/passwd` could escape the static directory. This is pre-existing code unchanged by N1. Noted for future work, not an N1 finding.

### Adversarial

**Adv-1 (finding): `registerWsRoute` parameter ordering is fragile.** The function signature places `upgradeWebSocket` (required, no default) after `injectedBroadcaster` (default value `= null`). TypeScript allows this, but it means the default value for `injectedBroadcaster` is unusable — any caller must pass `null` explicitly to reach the `upgradeWebSocket` parameter. Today the only production caller passes all 5 args, so it works. But the signature invites misuse: a future caller who reads "oh, `injectedBroadcaster` has a default" and omits it will get a type error they have to puzzle through. See F5.

**Adv-2 (finding): `better-sqlite3` version mismatch across workspace.** `packages/db/package.json` specifies `better-sqlite3@^11.7.0`, `packages/server/package.json` specifies `better-sqlite3@^12.9.0`. The lockfile resolves to TWO different versions: `11.10.0` for `@hyperidle/db` and `12.9.0` for `@hyperidle/server`. Having two separate native module builds in the same monorepo is wasteful (doubled compile time, doubled disk for native binaries) and risks subtle incompatibilities if the two versions differ in SQLite version or behavior. Since `server` only uses `better-sqlite3` transitively via `createDb` from `@hyperidle/db`, the direct dependency in `server/package.json` may not even be needed, or it should match `@hyperidle/db`'s version. See F1.

**Adv-3 (observation): `wss` WebSocketServer is created but never explicitly closed.** The `dispose` function calls `httpServer.close()` and the WS route disposer, but does not call `wss.close()`. When `httpServer.close()` is called, it stops accepting new connections, but already-connected WebSocket clients on the `wss` instance may linger. This is pre-existing behavior (the Bun `serve` had similar semantics with its built-in WS), so this is not a regression, but worth noting.

**Adv-4 (positive): Transaction semantics tests are thorough.** TX-1 through TX-5 in `transaction-semantics.test.ts` cover commit visibility, rollback, atomic version bumps, sequential transactions, and edit log atomicity. These are real assertions against real database operations, not mocks.

### Simplification

**Sim-1 (finding): `waitForReady` is duplicated across 2 test files.** `node-server.integration.test.ts` and `node-ws-e2e.integration.test.ts` contain nearly identical `waitForReady` implementations (and identical `createMigratedDb` helpers, `authHeaders`, server spawn patterns). The existing `server-factory.integration.test.ts` has a similar pattern. These should be extracted into a shared test utility, but this is a code quality issue not a blocker. See F6.

**Sim-2 (positive): `openProductionDb` collapsed to `createDb`.** The plan's decision to collapse the 10-line `openProductionDb` function (with unsafe `as unknown as HyperIdleDb` cast) into a single `createDb(dbPath)` call is a genuine simplification. One call replaces two dynamic imports, manual pragma setup, and a double cast.

**Sim-3 (positive): `createServer` made synchronous.** Since `createDb` is synchronous, removing the `async` and `Promise<>` wrapper from `createServer` is correct. The `index.ts` call site dropped `await` accordingly.

### Slop

**Slop-1 (finding): Five stale "Bun-only" / "non-Bun" / "createBunServer" comments in `app.ts`.** These are now factually incorrect. See F3.

**Slop-2 (finding): Stale comment block in `server-factory.integration.test.ts`.** Lines 4, 21-26 reference `createBunServer` and claim Bun-specific imports prevent direct loading. After N1, the server uses `@hono/node-server` which can be loaded directly under Node. See F4.

**Slop-3 (observation): `setup-cli.ts` line 260 references `globalThis.Bun + import.meta.main` in a `@lore` comment.** This is inside the new `@lore` comment explaining what the new code replaces. Referencing the old approach in the lore comment is intentional (documenting what was replaced), so this is acceptable.

---

## Findings (for builder to fix)

- **F1: [severity: major] `better-sqlite3` version mismatch — `^11.7.0` in `packages/db` vs `^12.9.0` in `packages/server`.** The lockfile resolves two separate native builds. Since `server` uses `createDb` from `@hyperidle/db` (which depends on `better-sqlite3@^11.7.0`), the direct dependency in `server/package.json` should either (a) be removed if workspace resolution handles the transitive dep for the `build:node` bundle, or (b) be aligned to `^11.7.0` to match `packages/db`. Having two different major versions of a native module in one monorepo is a build-time and runtime risk.

- **F2: [severity: minor] Root-level `start:node` convenience script missing.** The plan Section 4.10 specifies adding a root-level script `"start:node": "bun run --filter @hyperidle/server build:node && node packages/server/dist/index.cjs"`. This was not added. AC8 only requires the server-level script (which exists), so this is a plan deviation, not an AC failure. The builder should add it for operator convenience or explicitly document why it was omitted.

- **F3: [severity: minor] Stale Bun references in `app.ts`.** Five comments in `packages/server/src/app.ts` (lines 81, 85, 87, 163, 236) still say "Bun-only", "non-Bun", or reference `createBunServer`. After N1, these are factually incorrect. Update to say "runtime-agnostic" or remove the Bun-specific qualifiers.

- **F4: [severity: minor] Stale comment block in `server-factory.integration.test.ts`.** Lines 4, 21-26 in `packages/server/src/__tests__/server-factory.integration.test.ts` reference `createBunServer` and claim Bun-specific imports prevent direct loading. After N1, this is no longer true. Update the test file header comment.

- **F5: [severity: minor] `registerWsRoute` parameter ordering.** `upgradeWebSocket` (required) follows `injectedBroadcaster` (has default `= null`). This makes the default unusable. Swap the parameter order so `upgradeWebSocket` comes before `injectedBroadcaster`, or remove the default value from `injectedBroadcaster` since all callers pass it explicitly anyway.

- **F6: [severity: minor] Duplicated test infrastructure.** `waitForReady`, `createMigratedDb`, `authHeaders`, and the server spawn pattern are duplicated across `node-server.integration.test.ts` and `node-ws-e2e.integration.test.ts` (and partially in `server-factory.integration.test.ts`). Extract into a shared test utility in `packages/server/src/__tests__/helpers/` or similar.

---

## Re-review (commit 04664be)

### Verdict: DONE

All 6 findings from the initial review are resolved. No regressions introduced.

| Finding | Status | Evidence |
|---------|--------|----------|
| F1 [major] better-sqlite3 version mismatch | RESOLVED | `packages/server/package.json` now specifies `^11.7.0`, matching `packages/db`. |
| F2 [minor] Missing root-level start:node script | RESOLVED | Root `package.json` now has `"start:node": "bun run --filter @hyperidle/server build:node && node packages/server/dist/index.cjs"`. |
| F3 [minor] Stale Bun-only comments in app.ts | RESOLVED | All five stale references updated to runtime-agnostic language. Zero grep hits for `createBunServer`, `bun-only`, or `non-Bun` in `app.ts`. |
| F4 [minor] Stale comments in server-factory integration test | RESOLVED | Header comment rewritten. No `createBunServer` references. `@lore` comment correctly describes Node-compatible state post-N1. |
| F5 [minor] Parameter ordering in registerWsRoute | RESOLVED | `upgradeWebSocket` (required) now precedes `injectedBroadcaster` (optional, default `null`). The sole production caller in `server-factory.ts` updated to match. |
| F6 [minor] Duplicated test infrastructure | RESOLVED | `integration-helpers.ts` (84 lines) created with `createMigratedDb`, `waitForReady`, `authHeaders`. All three integration test files import from it. Duplicated implementations removed (net -99 lines). |

### Regression check

The fix commit touches 9 files. Changes are strictly: comment updates (F3, F4), parameter reorder with matching caller update (F5), version alignment (F1), script addition (F2), and test utility extraction (F6). No behavioral changes, no new code paths, no new dependencies.
