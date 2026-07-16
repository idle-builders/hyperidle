/**
 * I2 review HIGH-1 — upgrade-token store enforces a hard cap on live
 * tokens so a misconfigured rate limit or compromised key cannot drive
 * the in-process Map to unbounded size.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpgradeTokenStore } from "../upgrade-token-store.js";

describe("upgrade-token store enforces a hard live-token cap", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("evicts the oldest token once the configured cap is reached", () => {
		vi.stubEnv("HYPERIDLE_WS_TOKEN_MAX", "5");
		// Long TTL so no token expires during the test.
		vi.stubEnv("HYPERIDLE_WS_TOKEN_TTL_MS", "60000");

		const store = createUpgradeTokenStore();

		const issued: string[] = [];
		// Mint cap-many tokens.
		for (let i = 0; i < 5; i++) {
			issued.push(store.issue().token);
		}

		// All five must currently consume successfully.
		// Issue ONE more — capacity exceeded; the OLDEST token (the first
		// minted) must be evicted to make room.
		const overflow = store.issue();
		issued.push(overflow.token);

		const [oldest, ...rest] = issued;
		// Oldest (first minted) should now be gone.
		expect(oldest).toBeDefined();
		if (oldest === undefined) return;
		expect(store.consume(oldest).ok).toBe(false);
		// The remaining four originals + the new one should consume.
		for (let i = 0; i < rest.length; i++) {
			const token = rest[i];
			expect(token).toBeDefined();
			if (token === undefined) continue;
			expect(store.consume(token).ok, `token #${i + 1} should still consume`).toBe(true);
		}
	});

	it("default cap defends without explicit configuration", () => {
		// Sanity: default cap > 0 so a small workload is unaffected.
		const store = createUpgradeTokenStore();
		const t = store.issue();
		expect(store.consume(t.token).ok).toBe(true);
	});

	it("cap is per-store instance — separate stores do not share budget", () => {
		vi.stubEnv("HYPERIDLE_WS_TOKEN_MAX", "2");
		vi.stubEnv("HYPERIDLE_WS_TOKEN_TTL_MS", "60000");

		const a = createUpgradeTokenStore();
		const b = createUpgradeTokenStore();

		const a1 = a.issue().token;
		const a2 = a.issue().token;
		// Filling A does not cap B.
		const b1 = b.issue().token;
		const b2 = b.issue().token;

		expect(a.consume(a1).ok).toBe(true);
		expect(a.consume(a2).ok).toBe(true);
		expect(b.consume(b1).ok).toBe(true);
		expect(b.consume(b2).ok).toBe(true);
	});
});
