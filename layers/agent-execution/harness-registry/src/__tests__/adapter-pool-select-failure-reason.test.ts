/**
 * `select()` returns null for six different reasons. Until now every one of
 * them surfaced as the single sentence "all adapters are at capacity", which
 * is a claim, not a description — and for the failure that actually happens in
 * practice (an EMPTY pool, because no harness was discovered) it is simply
 * false. Anyone reading it goes looking at concurrency limits for a problem
 * that is really a missing binary.
 *
 * The pool is the only thing that knows why it declined, so the pool has to be
 * the thing that says so.
 */

import type {
	AdapterMeta,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { AdapterPool } from "../adapter-pool.js";

function makeAdapter(): HarnessAdapter {
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "stub" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return { outcome: "completed", tokenUsage: { byTier: {} } };
		},
		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: false,
				returnEnforcement: "none",
			};
		},
	};
}

function meta(overrides: Partial<AdapterMeta> = {}): AdapterMeta {
	return {
		name: "local",
		kind: "local",
		type: "claude",
		modelProviders: ["anthropic"],
		maxConcurrent: 1,
		...overrides,
	};
}

describe("AdapterPool.describeSelectFailure", () => {
	it("says the pool is empty when no adapter is registered at all", () => {
		const pool = new AdapterPool();

		// The real production failure: harness discovery found nothing (no
		// binary on PATH, or a cached "missing" result), so the pool never got
		// an adapter. Reporting "at capacity" here sends the reader to the
		// wrong subsystem entirely.
		expect(pool.describeSelectFailure()).toMatch(/no harness adapters/i);
		expect(pool.describeSelectFailure()).not.toMatch(/capacity/i);
	});

	it("names the requested harness type, and what was actually available", () => {
		const pool = new AdapterPool();
		pool.register("a", makeAdapter(), meta({ type: "claude" }));

		const reason = pool.describeSelectFailure({ harnessType: "codex" });

		expect(reason).toContain("codex");
		expect(reason).toContain("claude");
	});

	it("says so when every eligible adapter is disabled in settings", () => {
		const pool = new AdapterPool();
		pool.register("a", makeAdapter(), meta({ type: "claude" }));

		expect(pool.describeSelectFailure({ disabledTypes: ["claude"] })).toMatch(/disabled/i);
	});

	it("still reports capacity when capacity really is the problem", () => {
		const pool = new AdapterPool();
		pool.register("a", makeAdapter(), meta({ maxConcurrent: 1 }));
		expect(pool.select()).not.toBeNull(); // fills the only slot

		expect(pool.describeSelectFailure()).toMatch(/capacity/i);
	});

	it("says so when every adapter is paused", () => {
		const pool = new AdapterPool();
		pool.register("a", makeAdapter(), meta());
		pool.pause("a");

		expect(pool.describeSelectFailure()).toMatch(/paused/i);
	});
});
