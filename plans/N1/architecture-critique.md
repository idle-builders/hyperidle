# N1 Architecture Critique

**Reviewer:** Phase 2 Reviewer
**Plan:** `plans/N1/architecture.md`
**Workpackage:** N1 — Node runtime for the user-shipped server

---

## Step 1: Design Critique — SKIPPED

N1 has no UI surface. No design critique needed. Confirmed: this is a backend-only runtime migration.

---

## Step 2: Architecture Critique — 9 Dimensions

### 1. Completeness — 8/10

The plan covers all 10 ACs with a clear verification matrix (Section 7). Every AC maps to at least one task and a verification method. The exhaustive scan of Bun-specific APIs in Section 2 is thorough and correctly identifies all sites including comment-only references.

**Gap:** The plan does not explicitly list the ACs from the workpackage spec — they are referenced by number (AC1-AC10) but their text is never quoted. A builder encountering this plan cold would need to cross-reference a separate document (which does not appear to exist as a standalone track file — N1 has no TRACK-N.md). The plan IS self-contained enough in its verification matrix to compensate, but this is a minor gap.

**Gap:** AC6 verification is weak: "Run existing tests; if they pass, AC6 is satisfied." The plan hedges with "If there's no explicit BEGIN/COMMIT assertion, add one" but does not commit to writing the test. A builder could read this as "check existing tests and move on."

### 2. Correctness — 7/10

**Correct claims verified:**

- `@hono/node-server` DOES export `upgradeWebSocket` directly (confirmed via GitHub source: `export { upgradeWebSocket } from './websocket'`). The plan's import pattern `import { serve, upgradeWebSocket } from "@hono/node-server"` is correct.
- `@hono/node-ws` IS deprecated on npm ("Package no longer supported"). The plan's recommendation to use `@hono/node-server`'s built-in `upgradeWebSocket` instead is the correct modern approach.
- `createDb` from `packages/db/src/connection.ts` does exactly what the plan says: `new Database(path)` + WAL pragma + FK pragma + `drizzle(sqlite, { schema })`. The collapse of `openProductionDb` to `createDb` is sound.
- The `WSContext.send()` abstraction approach is correct: `hono/ws`'s `WSContext` exposes `.send()` which delegates to the underlying raw socket regardless of runtime.
- The WebSocket setup pattern (`new WebSocketServer({ noServer: true })` + `serve({ ..., websocket: { server: wss } })`) matches the official Hono docs exactly.

**Incorrect or problematic claims:**

- **Section 4.1 contradiction:** The plan first proposes `require("better-sqlite3")` (CJS dynamic import), then immediately rejects it ("No — this is ESM"), then proposes static imports, then decides to collapse to `createDb`. This self-correcting monologue is fine for a design doc but leaves three different approaches in the plan text. A builder could get confused about which approach to follow. The final decision (use `createDb`) is correct.

- **Section 4.3 import path:** The plan says `serve()` returns `ServerType` which is `http.Server | Http2Server | Http2SecureServer`. This is correct per the `@hono/node-server` exports. The plan proposes `as http.Server` with a `@lore` comment. This violates the project's TypeScript rule: "No `any`, no `@ts-ignore`, no unsafe `as` casts." The narrowing should use a runtime check or the `ServerType` union directly.

- **Section 8.7 tsx + `process.argv[1]`:** The plan states "Under Node with tsx, `process.argv[1]` is the tsx loader, not the script." This claim is INCORRECT for modern tsx. When you run `tsx script.ts`, `process.argv[1]` IS the script path (e.g., `/path/to/script.ts`). tsx uses Node's `--import` registration mechanism since Node 20+, so it does not insert itself into `process.argv`. The plan then contradicts itself by saying "the pattern is safe" because setup-cli is always invoked via `bun`. The entrypoint guard `process.argv[1] === fileURLToPath(import.meta.url)` will work correctly under both Bun and tsx/Node. The risk note creates unnecessary confusion.

### 3. Feasibility — 8/10

The plan is implementable. Task ordering is logical (deps first, then ws.ts, then server-factory, then index.ts). The file-by-file changes are specific enough for a builder to follow.

**Ambiguity:** The `serve()` call in Section 4.1 Task 3 shows `serve({ fetch: staticFetch, port, websocket: { server: wss } })` — but this is a Hono-specific API pattern. The plan should clarify that `upgradeWebSocket` from `@hono/node-server` is a middleware creator (not a serve option), while `websocket: { server: wss }` is a `serve()` option. Both are needed but serve different purposes: `upgradeWebSocket` creates the route handler; `websocket.server` tells `serve()` where to pipe upgrade requests.

**Ambiguity:** The plan does not specify what `@hono/node-server` version to target. Section 10 says `>= 1.14.0` with a flag "UNVERIFIED — check changelog before implementation." The `^1.14.0` in Section 3 is a guess. The builder should install the latest and verify.

### 4. Risk Awareness — 9/10

Section 8 identifies 8 distinct risk areas with mitigations. This is thorough for a migration workpackage.

**Standout good:** Risk 8.3 (`bun --hot` with `@hono/node-server`) is well-identified. Web search confirms this is a real issue: Bun issue #26036 documents EADDRINUSE errors with `bun --hot` when using `Bun.listen()` or Node's `http.createServer()`. The plan correctly proposes testing and falling back to `--watch`. This is the single highest-risk item in the migration.

**Standout good:** Risk 8.2 (WSContext.raw runtime differences) is correctly identified and the mitigation (avoid `.raw`, use the WSContext wrapper) is the right approach.

**Missing risk:** The plan does not address what happens to existing integration tests that spawn `bun run src/index.ts` as a subprocess. After the migration, `src/index.ts` imports from `@hono/node-server` instead of `bun`. When Bun runs this file, it will use its Node compatibility layer for the `http` module. This should work, but the plan should explicitly call out that the Bun subprocess tests now exercise `@hono/node-server` under Bun's Node compat shim — a materially different code path from the current `Bun.serve()` path. If the tests pass, great; if not, the failure mode is non-obvious.

### 5. Test Coverage — 7/10

The plan defines two new test files (`node-server.integration.test.ts`, `node-ws-e2e.integration.test.ts`) following the existing subprocess pattern. This covers AC9 and AC10.

**Weakness:** The test strategy for AC6 (BEGIN/COMMIT under better-sqlite3) is hand-wavy. "Run existing tests; if they pass, AC6 is satisfied" is not a test strategy — it is a hope. The existing `knowledge.test.ts` tests exercise transactions but there is no explicit assertion that `BEGIN IMMEDIATE` is issued. The plan should commit to either (a) adding a test that hooks into SQLite's trace callback to verify transaction boundaries, or (b) declaring AC6 satisfied by the fact that the existing tests already run under better-sqlite3 via Vitest (which is true — the test harness already uses better-sqlite3, so if transactions work in tests, they work under the driver).

**Weakness:** No test for the `bun --hot` / `bun --watch` dev path (AC7). The plan says "Manual: run `bun run dev`, hit health endpoint." For an autonomous builder agent, "manual verification" is not a valid test strategy. The builder should either (a) spawn `bun run dev` as a subprocess in a test and verify the health endpoint, or (b) document that AC7 is verified by running the existing integration tests which already spawn `bun run src/index.ts`.

**Weakness:** The plan mentions updating `ws-subscribe-authz.test.ts` if it imports `wsHandler` but does not check. I verified: it does NOT import `wsHandler`. This is fine, but the plan should have done the verification instead of leaving it as "check if."

### 6. Dependency Safety — 9/10

- `@hono/node-server ^1.14.0` — justified (replaces `Bun.serve()`), version is reasonable.
- `better-sqlite3 ^11.7.0` — justified (replaces `bun:sqlite`), already used in `packages/db`.
- `ws ^8.20.0` — moving from devDeps to deps is correct (now used in production path).
- `@types/better-sqlite3 ^7.6.0` — correct for dev.
- `tsx ^4.19.0` — justified for running tests under Node.

No unnecessary deps. All are well-maintained packages with clear purpose.

**Minor:** `better-sqlite3` is added to `packages/server/package.json` as a direct dependency, but `packages/db` already has it. Since `server` imports `createDb` from `@hyperidle/db`, the `better-sqlite3` dependency is transitive. Adding it directly to server is defensive but creates a version-sync burden. The builder should consider whether the direct dependency is actually needed or whether the workspace resolution handles it.

### 7. Scope Discipline — 9/10

The plan correctly excludes `packages/design-system/`, `packages/web/`, `packages/shared/`, and `scripts/`. Comment-only changes (Task 6) are minimal and justified — they remove now-incorrect `bun:sqlite` references.

**Minor scope question:** The plan includes updating `packages/db/src/seed.ts` comments and `packages/fabric/src/knowledge-repository.ts` comments. These are cosmetic changes in packages outside `packages/server`. They are low-risk but technically expand the blast radius. Acceptable for a migration workpackage.

### 8. Ordering — 8/10

Task 1 (deps) -> Task 2 (ws.ts) -> Task 3 (server-factory.ts) -> Task 4 (index.ts) -> Task 5 (setup-cli.ts) is correct. The rationale for ws.ts before server-factory.ts ("changing its exports first prevents cascading compile errors") is sound.

**Issue:** Task 7 (build/start scripts) should come BEFORE Task 9 (new tests) since `node-server.integration.test.ts` needs `tsx` to be available and the `build:node` script to produce `dist/index.cjs`. The plan's ordering has scripts at Task 7 and tests at Task 9, which works if the builder installs tsx in Task 1. But the `build:node` script is defined in Task 7 and the bundle verification test in Task 11 depends on it. This ordering is fine as written.

**Issue:** Task 8 (update existing tests) is placed after Task 7 but before Task 9 (new tests). Since the existing tests do not import `wsHandler` (verified), Task 8 is effectively a no-op. The plan should acknowledge this to avoid wasted builder time.

### 9. Clarity — 6/10

The plan is comprehensive but verbose. At 566 lines, it contains significant self-correcting monologue (Section 4.1's three rejected approaches before landing on `createDb`; Section 4.9's four rejected build strategies before landing on `--packages=external`). A builder reading this cold would need to mentally filter out the exploration to find the final decisions.

**Specific clarity issues:**

- Section 4.1 shows three approaches to `openProductionDb` inline before settling on `createDb`. The rejected approaches should be removed or collapsed into a single "Decision:" block.
- Section 4.9 contains five paragraphs of deliberation about the build script before landing on `"build:node": "bun build src/index.ts --target=node --outdir=dist --format=cjs --packages=external"`. A builder might implement one of the intermediate approaches.
- The plan uses "Lines X-Y" references to the current source, but line numbers drift. File-path + function-name references would be more stable.
- Section 4.2 point 5 is a 20-line analysis of `ws.raw` that the builder must parse to understand: "use `ws` (WSContext) as the Map key and adapter source, not `ws.raw`." The conclusion is buried.

---

## Overall Score: 7.9 / 10

Weighted average: (8 + 7 + 8 + 9 + 7 + 9 + 9 + 8 + 6) / 9 = 7.89

---

## BLOCKERS (must fix before builder starts)

**B1 — `as http.Server` cast violates TypeScript rules.** Section 4.1 proposes `as http.Server` to narrow the `serve()` return type. Project rules prohibit unsafe `as` casts. The plan should specify using the `ServerType` union directly or a runtime guard. This is a blocker because the builder will either violate the TypeScript rules or deviate from the plan.

**Resolution path:** Use the `ServerType` type from `@hono/node-server` directly in the `ServerHandle` interface. The only consumer that needs the narrowed type is the `dispose` function, which calls `.close()` — a method that exists on all three union members. No narrowing needed.

**B2 — Clarity of final decisions.** Section 4.1 and 4.9 contain rejected approaches inline with the final approach. The builder may implement a rejected approach. The plan should mark the final decision clearly and remove or collapse the deliberation.

**Resolution path:** For each section with multiple approaches, keep only the final "Decision:" paragraph. Move rejected alternatives to a "Considered and rejected" appendix or delete them.

---

## WARNINGS (builder should be aware)

**W1 — `bun --hot` is a real risk.** Bun issue #26036 confirms EADDRINUSE with non-Bun servers under `--hot`. The builder should test `bun --hot` early (Task 10) and switch to `bun --watch` if needed. The `dev` script change from `bun run --hot` to `bun run --watch` is a one-line fix but changes the DX (watch restarts the process; hot does in-process reload).

**W2 — Existing integration tests change code path silently.** After migration, `bun run src/index.ts` exercises `@hono/node-server` under Bun's Node compat shim, not `Bun.serve()`. This is a behavioral change that the existing tests will not detect (they test HTTP/WS responses, not the server implementation). The builder should be aware that "all tests pass" does not mean "the Bun-native path is preserved" — it means "the Node-compat path works under Bun."

**W3 — `better-sqlite3` in server package.json may be unnecessary.** If `server` only uses `createDb` from `@hyperidle/db`, the transitive dependency via the workspace should suffice. The builder should verify whether the direct dependency is needed for the bundle step (`--packages=external` would need it resolvable from server's `node_modules`).

**W4 — AC6 test strategy needs commitment.** The plan should commit to one of: (a) accept that existing Vitest tests already prove better-sqlite3 transactions work (since Vitest runs under Node with better-sqlite3), or (b) add an explicit transaction-boundary test. Do not leave this as "check and maybe add."

**W5 — Section 8.7 tsx claim is incorrect.** The plan states `process.argv[1]` under tsx is "the tsx loader, not the script." This is wrong for tsx v4+ which uses `--import` registration. `process.argv[1]` IS the script path. The entrypoint guard will work correctly. The builder should not add unnecessary workarounds based on this incorrect claim.

**W6 — `@hono/node-server` version.** The plan flags `upgradeWebSocket` availability as "UNVERIFIED." It IS available (confirmed via GitHub source). The builder can proceed with confidence. The `^1.14.0` floor is conservative; the latest stable should work.

---

## Verdict: APPROVED

Score 7.9/10 clears the 7.0 threshold. The two blockers (B1, B2) are resolvable by the builder without architectural changes — they concern a TypeScript rule violation and plan clarity, not structural unsoundness. The core migration strategy (replace `Bun.serve()` with `@hono/node-server`, collapse `openProductionDb` to `createDb`, inject `upgradeWebSocket` as a parameter, avoid `ws.raw`) is correct and well-justified.

The builder should read the BLOCKERS and WARNINGS sections before starting implementation.
