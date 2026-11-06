/**
 * Vitest worker setup file — pre-warms PGlite WASM before the first test runs.
 *
 * @lore: PGlite WASM cold-start — takes 60-120s; setupFiles warm-up avoids hookTimeout; pool persists for worker lifetime
 */

import { mkdtempSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createTestDb } from "./test-utils.js";

// Safety net: prevent agent-space code from writing to ~/HyperIdle during tests.
// Individual tests that need a specific path use vi.stubEnv on top of this.
if (!process.env.HYPERIDLE_SPACES_DIR) {
	process.env.HYPERIDLE_SPACES_DIR = mkdtempSync(path.join(os.tmpdir(), "hyperidle-spaces-test-"));
}

// Pre-warm PGlite: allocate one instance, run migrations, return it to the pool.
const handle = await createTestDb();
await handle.close();
