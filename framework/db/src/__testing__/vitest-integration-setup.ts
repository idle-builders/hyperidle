import { mkdtempSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { warmPool } from "./test-pool.js";

// Safety net: prevent agent-space code from writing to ~/HyperIdle during tests.
// Individual tests that need a specific path use vi.stubEnv on top of this.
if (!process.env.HYPERIDLE_SPACES_DIR) {
	process.env.HYPERIDLE_SPACES_DIR = mkdtempSync(path.join(os.tmpdir(), "hyperidle-spaces-test-"));
}

await warmPool();
