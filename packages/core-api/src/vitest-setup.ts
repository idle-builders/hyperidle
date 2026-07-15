/**
 * Vitest worker setup — pre-warms the PGlite instance pool before tests run.
 * Runs once per worker thread. All test files in the worker share the pool.
 */

import { warmPool } from "@hyperidle/db";

await warmPool();
