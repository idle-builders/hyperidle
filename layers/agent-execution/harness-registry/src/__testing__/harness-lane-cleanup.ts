/**
 * Harness-project-wide setup (wired via `vitest.integration.config.ts`'s
 * `harness` project `setupFiles` — loaded once per worker, before every
 * real-binary file in the lane, never imported by an individual test).
 *
 * Sweeps `cursor-agent`'s orphaned `worker-server` process after every test,
 * regardless of whether the test itself ever imported the sweep. Before this,
 * `killOrphanedCursorAgentWorkers` (harness-sandbox.ts) existed and was
 * published via the package's test-fixtures subpath, but no file actually
 * called it — a real incident left an orphaned cursor-agent process running
 * because the sweep was opt-in by import, and the file that needed it never
 * opted in. Wiring it here makes the sweep unconditional: every harness-lane
 * file gets it by construction, the same way `trackHarnessSessions()` makes
 * `stopSession` unconditional for the files that call it explicitly.
 */

import { afterEach } from "vitest";
import { killOrphanedCursorAgentWorkers } from "../__tests__/harness-sandbox.js";

afterEach(() => {
	killOrphanedCursorAgentWorkers();
});
