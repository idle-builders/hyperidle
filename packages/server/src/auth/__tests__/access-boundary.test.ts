/**
 * AF11 — Unit tests for access-boundary chokepoint (AC6).
 *
 * Tests the pure predicate `canRead/canWrite(principal, resource)` over the
 * HOST_SCOPE map. No DB, no server — pure in-memory logic.
 */

import { describe, expect, it } from "vitest";
import { type AuthorizableResource, canRead, canWrite, HOST_SCOPE } from "../access-boundary.js";

// ---------------------------------------------------------------------------
// HOST_SCOPE map — every host kind maps to the right scope
// ---------------------------------------------------------------------------

describe("HOST_SCOPE map", () => {
	it("user → participant-scope", () => {
		expect(HOST_SCOPE.user).toBe("participant");
	});

	it("agent → participant-scope", () => {
		expect(HOST_SCOPE.agent).toBe("participant");
	});

	it("bet → host-scope", () => {
		expect(HOST_SCOPE.bet).toBe("host");
	});

	it("task → host-scope", () => {
		expect(HOST_SCOPE.task).toBe("host");
	});

	it("knowledge_item → host-scope", () => {
		expect(HOST_SCOPE.knowledge_item).toBe("host");
	});

	it("artifact → host-scope", () => {
		expect(HOST_SCOPE.artifact).toBe("host");
	});

	it("team → host-scope", () => {
		expect(HOST_SCOPE.team).toBe("host");
	});

	it("factory → host-scope", () => {
		expect(HOST_SCOPE.factory).toBe("host");
	});
});

// ---------------------------------------------------------------------------
// canRead — host-scope resources (any authenticated principal)
// ---------------------------------------------------------------------------

describe("canRead — host-scope", () => {
	const hostKinds: Array<AuthorizableResource["hostKind"]> = [
		"bet",
		"task",
		"knowledge_item",
		"artifact",
		"team",
		"factory",
	];

	for (const hostKind of hostKinds) {
		it(`returns true for ${hostKind} host — any principal`, () => {
			const resource: AuthorizableResource = { hostKind, hostId: "h1" };
			expect(canRead("u-anyone", resource)).toBe(true);
		});

		it(`returns true for ${hostKind} host even with empty participants`, () => {
			const resource: AuthorizableResource = { hostKind, hostId: "h1", participants: [] };
			expect(canRead("u-not-in-participants", resource)).toBe(true);
		});
	}
});

// ---------------------------------------------------------------------------
// canRead — participant-scope resources (user / agent host)
// ---------------------------------------------------------------------------

describe("canRead — participant-scope (user host)", () => {
	it("returns true when principal IS in participants", () => {
		const resource: AuthorizableResource = {
			hostKind: "user",
			hostId: "u-alice",
			participants: ["u-alice", "ast-alice"],
		};
		expect(canRead("u-alice", resource)).toBe(true);
	});

	it("returns false when principal is NOT in participants", () => {
		const resource: AuthorizableResource = {
			hostKind: "user",
			hostId: "u-alice",
			participants: ["u-alice", "ast-alice"],
		};
		expect(canRead("u-bob", resource)).toBe(false);
	});

	it("returns false when participants is empty", () => {
		const resource: AuthorizableResource = {
			hostKind: "user",
			hostId: "u-alice",
			participants: [],
		};
		expect(canRead("u-alice", resource)).toBe(false);
	});

	it("returns false when participants is undefined", () => {
		const resource: AuthorizableResource = {
			hostKind: "user",
			hostId: "u-alice",
		};
		expect(canRead("u-alice", resource)).toBe(false);
	});
});

describe("canRead — participant-scope (agent host)", () => {
	it("returns true when agent principal IS in participants", () => {
		const resource: AuthorizableResource = {
			hostKind: "agent",
			hostId: "ast-alice",
			participants: ["u-alice", "ast-alice"],
		};
		expect(canRead("u-alice", resource)).toBe(true);
	});

	it("returns false when agent principal is NOT in participants", () => {
		const resource: AuthorizableResource = {
			hostKind: "agent",
			hostId: "ast-alice",
			participants: ["u-alice", "ast-alice"],
		};
		expect(canRead("u-mallory", resource)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// canWrite — mirrors canRead (same boundary today)
// ---------------------------------------------------------------------------

describe("canWrite", () => {
	it("host-scope: returns true for any principal", () => {
		const resource: AuthorizableResource = { hostKind: "task", hostId: "task-1" };
		expect(canWrite("u-anyone", resource)).toBe(true);
	});

	it("participant-scope: returns true for participant", () => {
		const resource: AuthorizableResource = {
			hostKind: "user",
			hostId: "u-alice",
			participants: ["u-alice"],
		};
		expect(canWrite("u-alice", resource)).toBe(true);
	});

	it("participant-scope: returns false for non-participant", () => {
		const resource: AuthorizableResource = {
			hostKind: "user",
			hostId: "u-alice",
			participants: ["u-alice"],
		};
		expect(canWrite("u-bob", resource)).toBe(false);
	});
});
