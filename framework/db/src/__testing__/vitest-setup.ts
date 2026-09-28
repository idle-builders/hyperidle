/**
 * Vitest worker setup file — pre-warms PGlite WASM before the first test runs.
 *
 * @lore: PGlite WASM cold-start — takes 60-120s; setupFiles warm-up avoids hookTimeout; pool persists for worker lifetime
 */

import { createTestDb } from "./test-utils.js";

// Pre-warm PGlite: allocate one instance, run migrations, return it to the pool.
const handle = await createTestDb();
await handle.close();
