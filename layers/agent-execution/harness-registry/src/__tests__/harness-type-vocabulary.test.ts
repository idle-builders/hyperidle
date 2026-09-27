/**
 * `HARNESS_TYPES` is only useful if it names the types adapters actually
 * register under. Selection compares the string for exact equality, so a
 * vocabulary that has drifted from the registration side is worse than none:
 * it makes an unrunnable value look sanctioned.
 *
 * The demo world pinned its builder agent to `"claude"` while the adapter
 * registered as `"claude-code"`. That agent could never be selected, every one
 * of its runs failed, and nothing on the path — seed, column, port, or pool —
 * was typed tightly enough to notice. These tests hold the two sides together.
 */

import { HARNESS_TYPES, type HarnessType } from "@hyperidle/domain-model";
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
import { AdapterPool, createLocalAdapterPool } from "../adapter-pool.js";
import type { CliAvailabilityDeps } from "../cli-harness-adapter.js";
import type { HarnessProbeDeps } from "../harness-discovery.js";

// No real binary is ever spawned or shelled out to here: both discovery and
// availability are injected with stubs that report "nothing installed" — the
// same seam discoverLocalHarnesses/checkAvailability already expose for
// production callers, not a test-only export. The assertions below hold
// whatever the pool discovers (see each test's own comment), so a fully
// hermetic pool proves the same thing a real one would.
const noDiscovery: HarnessProbeDeps = {
	run: async () => ({ stdout: "", stderr: "not found", exitCode: 1 }),
};
const noBinaries: CliAvailabilityDeps = {
	whichFn: async () => {
		throw new Error("not found");
	},
};
function fakeLocalAdapterPool() {
	return createLocalAdapterPool({ discoveryDeps: noDiscovery, availabilityDeps: noBinaries });
}

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
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: [],
				mcpSupport: false,
				returnEnforcement: "none",
			};
		},
	};
}

describe("harness type vocabulary", () => {
	it("accounts for every vocabulary entry, installed or not", async () => {
		// @lore what the pool can account for and what the vocabulary offers must be the same set, host-independent.
		const pool = await fakeLocalAdapterPool();
		const accounted = new Set(pool.describe().map((d) => d.type));

		expect([...accounted].sort()).toEqual([...HARNESS_TYPES].sort());
	});

	it("registers nothing under a type outside the vocabulary", async () => {
		const pool = await fakeLocalAdapterPool();
		const known = new Set<string>(HARNESS_TYPES);

		for (const descriptor of pool.describe({ includeKnownMissing: false })) {
			// A type absent here is unreachable: no agent can pin a value the
			// vocabulary does not offer, so the adapter would never be selected.
			expect(known).toContain(descriptor.type);
		}
	});

	it("selects an adapter by every vocabulary spelling it registers under", () => {
		// Guards the exact-equality trap directly: register each vocabulary
		// value and confirm it is selectable under its own name. A near-miss
		// spelling (`claude` for `claude-code`) fails here.
		for (const type of HARNESS_TYPES) {
			const pool = new AdapterPool();
			const meta: AdapterMeta = {
				name: type,
				kind: "local",
				type,
				modelProviders: [],
				maxConcurrent: 1,
			};
			pool.register(`local-${type}`, makeAdapter(), meta);

			expect(pool.select({ harnessType: type })?.id).toBe(`local-${type}`);
		}
	});

	it("does not select for a near-miss spelling", () => {
		const pool = new AdapterPool();
		pool.register("local-claude-code", makeAdapter(), {
			name: "Claude Code",
			kind: "local",
			type: "claude-code",
			modelProviders: [],
			maxConcurrent: 1,
		});

		// The exact shape of the demo-world bug.
		expect(pool.select({ harnessType: "claude" })).toBeNull();
		expect(pool.describeSelectFailure({ harnessType: "claude" })).toContain("claude-code");
	});

	it("offers no vocabulary value that is impossible to spell", () => {
		const unique = new Set<HarnessType>(HARNESS_TYPES);
		expect(unique.size).toBe(HARNESS_TYPES.length);
		for (const type of HARNESS_TYPES) {
			expect(type.trim()).toBe(type);
			expect(type.length).toBeGreaterThan(0);
		}
	});
});
