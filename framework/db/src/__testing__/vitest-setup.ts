/**
 * Vitest worker setup file — pre-warms PGlite WASM before the first test runs.
 *
 * @lore S1: Same warm-up pattern as packages/server/src/vitest-setup.ts.
 * PGlite WASM cold-start takes 60-120s. Running it here in setupFiles avoids
 * the hookTimeout window. The pool in test-utils.ts (module-level array) persists
 * for the worker lifetime and the warm instance is reused by all test files.
 */

import { createTestDb } from "./test-utils.js";

// Pre-warm PGlite: allocate one instance, run migrations, return it to the pool.
const handle = await createTestDb();
await handle.close();
