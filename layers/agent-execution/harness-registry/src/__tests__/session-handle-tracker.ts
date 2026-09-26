/**
 * AR1-style test-support helper (development world — lives in `__tests__/`,
 * never imported by production code).
 *
 * @lore process-group kill only helps once `stopSession` is actually called.
 * The 2026-09-26 incident's real mechanism was that the test run ENDED before
 * stopSession ran at all — an assertion failure or a vitest timeout unwinds
 * the test body without reaching the `stopSession` call at the bottom, so the
 * real CLI process (and, before the process-group fix, its children) kept
 * running with nothing left supervising it. Process-group kill fixes what
 * happens once stopSession runs; this fixes whether it runs at all.
 *
 * `trackHarnessSessions()` is called once per test file (module scope, before
 * any `test`). It registers a single `afterEach` that stops every handle the
 * test tracked but never stopped itself — timeouts and thrown assertions
 * included, because `afterEach` runs even when the test body did not finish.
 * `stopSession` is idempotent (a handle already stopped is simply not found
 * and returns harmlessly — see CliHarnessAdapter.stopSession), so calling it
 * again for a handle the test already stopped is always safe.
 */

import type { HarnessAdapter, SessionHandle } from "@hyperidle/harness-protocol";
import { afterEach } from "vitest";

interface TrackedSession {
	readonly adapter: HarnessAdapter;
	readonly handle: SessionHandle;
}

export interface HarnessSessionTracker {
	/**
	 * Call immediately after every `startSession`/`resumeSession` that returns
	 * a real handle. Returns the handle unchanged so it composes at the call
	 * site: `const handle = track(adapter, await adapter.startSession(cfg));`.
	 * `resumeSession?.()` can return `undefined` (optional method, absent
	 * harness); passing `undefined` through is a no-op — nothing to track.
	 */
	track<H extends SessionHandle | undefined>(adapter: HarnessAdapter, handle: H): H;
}

export function trackHarnessSessions(): HarnessSessionTracker {
	const tracked: TrackedSession[] = [];

	afterEach(async () => {
		// Stop every handle this test started, in whatever order, regardless of
		// whether the test body reached its own stopSession call.
		const pending = tracked.splice(0, tracked.length);
		await Promise.all(
			pending.map(async ({ adapter, handle }) => {
				try {
					await adapter.stopSession(handle);
				} catch {
					// Already gone — nothing left to clean up.
				}
			}),
		);
	});

	return {
		track(adapter, handle) {
			if (handle) {
				tracked.push({ adapter, handle });
			}
			return handle;
		},
	};
}
