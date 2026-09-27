/**
 * Unit tests for the per-session return-enforcement registry.
 *
 * The enforcement registry is a per-session key-value store:
 *   { gate, forceCount, exempt }
 * keyed by sessionId. Used by:
 *   - the return_status tool handler (reads ctx.sessionId → registry)
 *   - the in-process SDK Stop closure (reads registry directly)
 *   - the process-wrapper re-engage (reads registry for budget tracking)
 *
 * Covers:
 *   - register / get / incrementForce / unregister lifecycle
 *   - forceCount increments correctly
 *   - unregistered sessionId returns undefined
 *   - multiple sessions are independent (no shared state)
 *   - exempt flag is preserved
 *
 * Tests FAIL (red) until:
 *   - packages/server/src/harness/return-enforcement-registry.ts is created (Task 2)
 */

import { describe, expect, it } from "vitest";

// FAILS red: module does not exist yet (green phase Task 2)
import { createReturnEnforcement } from "../return-enforcement.js";

const createEnforcementRegistry = () => createReturnEnforcement();

describe("return-enforcement-registry", () => {
	// ── Lifecycle: register / get / unregister ────────────────────────────

	it("register then get returns the entry", () => {
		// FAILS red: createEnforcementRegistry does not exist
		const registry = createEnforcementRegistry();
		const gate = { returned: false };

		registry.register("session-1", { gate, forceCount: 0, exempt: false });
		const entry = registry.get("session-1");

		expect(entry).toBeDefined();
		expect(entry?.gate).toBe(gate);
		expect(entry?.forceCount).toBe(0);
		expect(entry?.exempt).toBe(false);
	});

	it("get on unknown sessionId returns undefined", () => {
		const registry = createEnforcementRegistry();

		const result = registry.get("nonexistent-session");
		expect(result).toBeUndefined();
	});

	it("unregister removes the entry", () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };

		registry.register("session-1", { gate, forceCount: 0, exempt: false });
		expect(registry.get("session-1")).toBeDefined();

		registry.unregister("session-1");
		expect(registry.get("session-1")).toBeUndefined();
	});

	it("unregister on unknown sessionId does not throw", () => {
		const registry = createEnforcementRegistry();
		registry.unregister("nonexistent");
		expect(registry.get("nonexistent")).toBeUndefined();
	});

	// ── incrementForce ────────────────────────────────────────────────────

	it("incrementForce increments forceCount for the session", () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };

		registry.register("session-1", { gate, forceCount: 0, exempt: false });
		registry.incrementForce("session-1");

		expect(registry.get("session-1")?.forceCount).toBe(1);
	});

	it("incrementForce can be called multiple times", () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };

		registry.register("session-1", { gate, forceCount: 0, exempt: false });
		registry.incrementForce("session-1");
		registry.incrementForce("session-1");

		expect(registry.get("session-1")?.forceCount).toBe(2);
	});

	it("incrementForce on unknown sessionId does not throw", () => {
		const registry = createEnforcementRegistry();
		registry.incrementForce("nonexistent");
		expect(registry.get("nonexistent")).toBeUndefined();
	});

	// ── Gate reference is live ───────────────────────────────────────────

	it("gate reference is shared — gate.returned mutation is reflected in registry.get()", () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };

		registry.register("session-1", { gate, forceCount: 0, exempt: false });

		// Mutate the gate externally (as the event-stream observer would do)
		gate.returned = true;

		// The registry must reflect the live reference
		expect(registry.get("session-1")?.gate.returned).toBe(true);
	});

	// ── Multiple sessions are independent ─────────────────────────────────

	it("multiple sessions do not share forceCount", () => {
		const registry = createEnforcementRegistry();
		const gate1 = { returned: false };
		const gate2 = { returned: false };

		registry.register("session-A", { gate: gate1, forceCount: 0, exempt: false });
		registry.register("session-B", { gate: gate2, forceCount: 0, exempt: false });

		registry.incrementForce("session-A");
		registry.incrementForce("session-A");

		expect(registry.get("session-A")?.forceCount).toBe(2);
		expect(registry.get("session-B")?.forceCount).toBe(0);
	});

	it("unregistering one session does not affect another", () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };

		registry.register("session-A", { gate, forceCount: 0, exempt: false });
		registry.register("session-B", { gate, forceCount: 0, exempt: false });

		registry.unregister("session-A");

		expect(registry.get("session-A")).toBeUndefined();
		expect(registry.get("session-B")).toBeDefined();
	});

	// ── Exempt flag ───────────────────────────────────────────────────────

	it("exempt:true is preserved through register and get", () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };

		registry.register("exempt-session", { gate, forceCount: 0, exempt: true });
		expect(registry.get("exempt-session")?.exempt).toBe(true);
	});

	it("registering with initial forceCount>0 is allowed (re-register after partial force)", () => {
		const registry = createEnforcementRegistry();
		const gate = { returned: false };

		registry.register("session-1", { gate, forceCount: 1, exempt: false });
		expect(registry.get("session-1")?.forceCount).toBe(1);
	});

	// ── createEnforcementRegistry returns a fresh isolated instance ───────

	it("two registries created separately are isolated", () => {
		const reg1 = createEnforcementRegistry();
		const reg2 = createEnforcementRegistry();
		const gate = { returned: false };

		reg1.register("session-1", { gate, forceCount: 0, exempt: false });

		// reg2 must not see reg1's sessions
		expect(reg2.get("session-1")).toBeUndefined();
	});
});
