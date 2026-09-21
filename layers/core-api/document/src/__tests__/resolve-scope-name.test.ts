/**
 * `resolveScopeName` — the document module's own copy, lifted from
 * `routes/knowledge.ts`'s `resolveScopeName` (architecture.md §3.4/§16 B5).
 * That route-level version stubbed a raw drizzle db; this one is rewritten
 * against `deps.users.getUserById`/`deps.org.getTeam`, so the fakes here are
 * plain functions, not a drizzle query stub.
 *
 * Narrowed scope: `SCOPE_KINDS` is closed to `factory`/`team`/`user` now —
 * the `task`/`product`/`practice`/`filesystem` fallback cases the original
 * test carried are gone with the scope kinds themselves.
 */

import type { Team, User, WriteExecutor } from "@hyperidle/db";
import { scopeKindToLabel } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { resolveScopeName } from "../document-actions.js";

const fakeExec = {} as WriteExecutor;

function depsStub(overrides?: {
	readonly getUserById?: (exec: WriteExecutor, id: string) => Promise<User | undefined>;
	readonly getTeam?: (exec: WriteExecutor, q: { id: string }) => Promise<Team | undefined>;
}) {
	return {
		users: {
			getUserById: overrides?.getUserById ?? (async () => undefined),
			listOwnedBy: async () => [],
		},
		org: {
			getTeam: overrides?.getTeam ?? (async () => undefined),
		},
	};
}

describe("resolveScopeName — resolves scopeId to a human-readable scope name", () => {
	it("factory → 'Factory' (literal, no query)", async () => {
		const result = await resolveScopeName(depsStub(), fakeExec, "factory", null);
		expect(result).toBe("Factory");
	});

	it("factory with a non-null scopeId still returns 'Factory'", async () => {
		const result = await resolveScopeName(depsStub(), fakeExec, "factory", "some-id");
		expect(result).toBe("Factory");
	});

	it("user → the user's name when found", async () => {
		const deps = depsStub({
			getUserById: async () => ({ name: "Alice" }) as User,
		});
		const result = await resolveScopeName(deps, fakeExec, "user", "user-1");
		expect(result).toBe("Alice");
	});

	it("user missing → scopeKindToLabel('user') = 'Private'", async () => {
		const result = await resolveScopeName(depsStub(), fakeExec, "user", "nonexistent");
		expect(result).toBe(scopeKindToLabel("user"));
		expect(result).toBe("Private");
	});

	it("user with a null scopeId → 'Private'", async () => {
		const result = await resolveScopeName(depsStub(), fakeExec, "user", null);
		expect(result).toBe("Private");
	});

	it("team → the team's name when found", async () => {
		const deps = depsStub({
			getTeam: async () => ({ name: "Team Nimmly" }) as Team,
		});
		const result = await resolveScopeName(deps, fakeExec, "team", "team-1");
		expect(result).toBe("Team Nimmly");
	});

	it("team missing → scopeKindToLabel('team') = 'Team'", async () => {
		const result = await resolveScopeName(depsStub(), fakeExec, "team", "nonexistent");
		expect(result).toBe(scopeKindToLabel("team"));
		expect(result).toBe("Team");
	});

	it("team with a null scopeId → 'Team'", async () => {
		const result = await resolveScopeName(depsStub(), fakeExec, "team", null);
		expect(result).toBe("Team");
	});

	it("user missing — never returns the raw uuid", async () => {
		const uuid = "550e8400-e29b-41d4-a716-446655440000";
		const result = await resolveScopeName(depsStub(), fakeExec, "user", uuid);
		expect(result).not.toBe(uuid);
		expect(result).toBe("Private");
	});

	it("team missing — never returns the raw uuid", async () => {
		const uuid = "550e8400-e29b-41d4-a716-446655440001";
		const result = await resolveScopeName(depsStub(), fakeExec, "team", uuid);
		expect(result).not.toBe(uuid);
		expect(result).toBe("Team");
	});
});
