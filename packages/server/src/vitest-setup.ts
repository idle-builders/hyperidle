/**
 * Vitest worker setup file — pre-warms PGlite WASM before the first test runs.
 *
 * @lore S1: PGlite WASM cold-start (loading the WASM binary into the V8 engine)
 * takes 60-120s on the first `new PGlite()` call in a worker process. This
 * cold-start happens inside the FIRST `beforeEach` that calls `createTestDb()`,
 * causing hook timeouts even at 60s.
 *
 * Solution: run the cold-start here in setupFiles, which executes BEFORE any
 * test file is loaded and OUTSIDE of any hook timeout window. By the time
 * `beforeEach` runs, PGlite WASM is warm and subsequent `createTestDb()` calls
 * complete in <5s (pool hit) or ~700ms (warm WASM + migrations).
 *
 * setupFiles runs once per worker thread. The Drizzle pool in test-utils.ts
 * (module-level array) persists across test files in the same worker, so the
 * warmed instance is available to all test files.
 */

import { createTestDb } from "@hyperidle/db";

// Pre-warm PGlite: allocate one instance, run migrations, return it to the pool.
// No timeout applies to setupFiles — Vitest does not enforce hookTimeout here.
const handle = await createTestDb();
await handle.close();
