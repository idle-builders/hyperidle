/**
 * L2 — Founder/Actor Routing Schema (shared types).
 *
 * Pins the contract from `docs/work-packages/TRACK-L.md` L2:
 *   - `Actor` type: { id, role: 'CEO' | 'CPO', domain_tags: string[] }
 *   - REASSIGN_VERB constant (replaces "Escalate" verb-level shorthand)
 */

import { type Actor, type ActorRole, REASSIGN_VERB } from "@hyperidle/shared";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("L2: ActorRole type", () => {
	it("is the literal union 'CEO' | 'CPO' (no widening to string)", () => {
		expectTypeOf<ActorRole>().toEqualTypeOf<"CEO" | "CPO">();
		const a: ActorRole = "CEO";
		const b: ActorRole = "CPO";
		expect([a, b]).toEqual(["CEO", "CPO"]);
	});
});

describe("L2: Actor interface shape", () => {
	it("requires id, role, domain_tags", () => {
		const a: Actor = {
			id: "actor:ceo",
			role: "CEO",
			domain_tags: ["market", "growth", "portfolio"],
		};
		expect(a.id).toBe("actor:ceo");
		expect(a.role).toBe("CEO");
		expect(a.domain_tags).toEqual(["market", "growth", "portfolio"]);
	});

	it("Actor.role is constrained to ActorRole (not arbitrary string)", () => {
		expectTypeOf<Actor["role"]>().toEqualTypeOf<ActorRole>();
	});

	it("Actor.domain_tags is a readonly string array (per type contract)", () => {
		// The plan documents `domain_tags: readonly string[]`. Assigning a literal
		// readonly tuple must satisfy the type.
		const tags = ["product", "design"] as const;
		const a: Actor = { id: "x", role: "CPO", domain_tags: tags };
		expect(a.domain_tags).toEqual(["product", "design"]);
	});
});

describe("L2: REASSIGN_VERB constant", () => {
	it("is exported from @hyperidle/shared", () => {
		expect(typeof REASSIGN_VERB).toBe("string");
		expect(REASSIGN_VERB.length).toBeGreaterThan(0);
	});

	it("is distinct from any 'escalate' shorthand", () => {
		// The track says "Reassign to <co-founder>" replaces "Escalate" — so the
		// canonical verb constant must NOT be the legacy string.
		expect(REASSIGN_VERB).not.toBe("escalate");
		expect(REASSIGN_VERB).not.toBe("Escalate");
		expect(REASSIGN_VERB.toLowerCase()).not.toBe("escalate");
	});

	it("identifies the new reassignment verb (contains 'reassign')", () => {
		expect(REASSIGN_VERB.toLowerCase()).toContain("reassign");
	});

	it("is a literal-typed constant (not widened to plain string)", () => {
		// The type must be more specific than `string` so callers can switch on it.
		expectTypeOf<typeof REASSIGN_VERB>().not.toEqualTypeOf<string>();
	});
});
