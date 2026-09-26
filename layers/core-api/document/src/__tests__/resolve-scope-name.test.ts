/**
 * `resolveScopeName` — the document module's own copy, lifted from
 * `routes/knowledge.ts`'s `resolveScopeName` (architecture.md §3.4/§16 B5).
 * That route-level version stubbed a raw drizzle db; this one is rewritten
 * against `deps.users.getUserById`/`deps.org.getTeam`, so the fakes here are
 * plain functions, not a drizzle query stub.
 */
import type { Team, User, WriteExecutor } from "@hyperidle/db";
import { describe, expect, it } from "vitest";
import { resolveScopeName } from "../document-actions.js";

const fakeExec = {} as WriteExecutor;

const found = {
	users: { getUserById: async () => ({ name: "Alice" }) as User, listOwnedBy: async () => [] },
	org: { getTeam: async () => ({ name: "Team Nimmly" }) as Team },
};
const missing = {
	users: { getUserById: async () => undefined, listOwnedBy: async () => [] },
	org: { getTeam: async () => undefined },
};

describe("resolveScopeName — resolves scopeId to a human-readable scope name", () => {
	it.each([
		["factory", null, found, "Factory"],
		["factory", "some-id", found, "Factory"],
		["user", "user-1", found, "Alice"],
		["user", "nonexistent", missing, "Private"],
		["user", null, missing, "Private"],
		["team", "team-1", found, "Team Nimmly"],
		["team", "nonexistent", missing, "Team"],
		["team", null, missing, "Team"],
	] as const)("%s scope, id %s -> %s", async (scopeKind, scopeId, deps, expected) => {
		expect(await resolveScopeName(deps, fakeExec, scopeKind, scopeId)).toBe(expected);
	});

	it("a missing user or team never leaks the raw id it looked up", async () => {
		const uuid = "550e8400-e29b-41d4-a716-446655440000";
		expect(await resolveScopeName(missing, fakeExec, "user", uuid)).not.toBe(uuid);
		expect(await resolveScopeName(missing, fakeExec, "team", uuid)).not.toBe(uuid);
	});
});
