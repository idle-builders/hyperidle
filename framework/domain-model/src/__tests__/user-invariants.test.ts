/**
 * Pure invariant unit tests for the user module's declarations —
 * `editUserInvariants`, plus the schema shapes `SearchUsersInputSchema`,
 * `OpenUserInputSchema`, `EditUserInputSchema`, `UserRowSchema`,
 * `ChangeRowSchema`, `USER_ACTIONS`. Exact equality on `problems[0]?.code`
 * where one problem is expected, `toContain` where several pure checks can
 * fire on the same malformed input.
 */

import { describe, expect, it } from "vitest";
import {
	ChangeRowSchema,
	EditUserInputSchema,
	editUser,
	editUserInvariants,
	OBJECT_EVENTS,
	OpenUserInputSchema,
	openUser,
	SearchUsersInputSchema,
	searchUsers,
	USER_ACTIONS,
	USER_KINDS,
	USER_STATUSES,
	UserRowSchema,
} from "../actions/user.js";

describe("USER_KINDS / USER_STATUSES", () => {
	it("kinds are exactly human and ai", () => {
		expect(USER_KINDS).toEqual(["human", "ai"]);
	});

	it("statuses are exactly the four the real writers use", () => {
		expect(USER_STATUSES).toEqual(["active", "idle", "inactive", "retired"]);
	});
});

describe("OBJECT_EVENTS", () => {
	it("is exactly the nine object events, edit-in / changed-out per object", () => {
		expect(OBJECT_EVENTS).toEqual([
			"task.created",
			"task.changed",
			"thread.created",
			"thread.message",
			"thread.changed",
			"document.created",
			"document.changed",
			"user.created",
			"user.changed",
		]);
	});
});

describe("editUserInvariants — create", () => {
	it("kind_required: a create with no kind", () => {
		const problems = editUserInvariants({ name: "Ada", team: { name: "Core" } });
		expect(problems.map((p) => p.code)).toContain("kind_required");
	});

	it("name_required: a create with no name", () => {
		const problems = editUserInvariants({ kind: "human", team: { name: "Core" } });
		expect(problems.map((p) => p.code)).toContain("name_required");
	});

	it("name_required: a create with a blank name", () => {
		const problems = editUserInvariants({ kind: "human", name: "   ", team: { name: "Core" } });
		expect(problems.map((p) => p.code)).toContain("name_required");
	});

	it("belonging_required: a create with neither team nor ownerUserId", () => {
		const problems = editUserInvariants({ kind: "human", name: "Ada" });
		expect(problems.map((p) => p.code)).toContain("belonging_required");
	});

	it("belonging_required does not fire when a team is named", () => {
		const problems = editUserInvariants({ kind: "human", name: "Ada", team: { name: "Core" } });
		expect(problems.map((p) => p.code)).not.toContain("belonging_required");
	});

	it("belonging_required does not fire when an owner is named", () => {
		const problems = editUserInvariants({
			kind: "ai",
			name: "Assistant",
			ownerUserId: "u1",
			identity: "You help.",
		});
		expect(problems.map((p) => p.code)).not.toContain("belonging_required");
	});

	it("owned_agent_has_no_team: a create naming both an owner and a team", () => {
		const problems = editUserInvariants({
			kind: "ai",
			name: "Assistant",
			ownerUserId: "u1",
			team: { name: "Core" },
		});
		expect(problems.map((p) => p.code)).toContain("owned_agent_has_no_team");
	});

	it("person_has_no_owner: a person create naming an owner", () => {
		const problems = editUserInvariants({
			kind: "human",
			name: "Ada",
			ownerUserId: "u1",
		});
		expect(problems.map((p) => p.code)).toContain("person_has_no_owner");
	});

	it("agent_fields_for_agents: a person create with identity/agentCategory/runConfig", () => {
		const problems = editUserInvariants({
			kind: "human",
			name: "Ada",
			team: { name: "Core" },
			identity: "You help.",
			agentCategory: "individual",
			runConfig: { harnessType: "claude-code" },
		});
		expect(problems.map((p) => p.code)).toContain("agent_fields_for_agents");
	});

	it("agent_fields_for_agents does not fire for an agent create", () => {
		const problems = editUserInvariants({
			kind: "ai",
			name: "Assistant",
			ownerUserId: "u1",
			identity: "You help.",
			agentCategory: "individual",
			runConfig: { harnessType: "claude-code" },
		});
		expect(problems.map((p) => p.code)).not.toContain("agent_fields_for_agents");
	});

	it("a well-formed person create has no problems", () => {
		expect(editUserInvariants({ kind: "human", name: "Ada", team: { name: "Core" } })).toEqual([]);
	});

	it("a well-formed owned-agent create has no problems", () => {
		expect(
			editUserInvariants({
				kind: "ai",
				name: "Ada's Assistant",
				ownerUserId: "u1",
				agentCategory: "individual",
				identity: "You help.",
			}),
		).toEqual([]);
	});

	it("a well-formed team-agent create has no problems", () => {
		expect(
			editUserInvariants({
				kind: "ai",
				name: "Core Agent",
				team: { name: "Core" },
				agentCategory: "team",
			}),
		).toEqual([]);
	});
});

describe("editUserInvariants — edit", () => {
	it("kind_is_create_only: an edit naming kind", () => {
		const problems = editUserInvariants({ id: "u1", kind: "human" });
		expect(problems.map((p) => p.code)).toContain("kind_is_create_only");
	});

	it("owner_is_create_only: an edit naming ownerUserId", () => {
		const problems = editUserInvariants({ id: "u1", ownerUserId: "u2" });
		expect(problems.map((p) => p.code)).toContain("owner_is_create_only");
	});

	it("identity_is_create_only: an edit naming identity", () => {
		const problems = editUserInvariants({ id: "u1", identity: "New persona" });
		expect(problems.map((p) => p.code)).toContain("identity_is_create_only");
	});

	it("name_required: an edit blanking the name", () => {
		const problems = editUserInvariants({ id: "u1", name: "  " });
		expect(problems.map((p) => p.code)).toContain("name_required");
	});

	it("a well-formed profile edit has no problems", () => {
		expect(editUserInvariants({ id: "u1", name: "Ada Lovelace", role: "Builder" })).toEqual([]);
	});

	it("a well-formed status edit has no problems", () => {
		expect(editUserInvariants({ id: "u1", status: "retired" })).toEqual([]);
	});
});

describe("editUserInvariants — event_or_schedule", () => {
	it("fires when an added subscription names neither event nor schedule", () => {
		const problems = editUserInvariants({
			id: "u1",
			subscriptions: { add: [{ paused: false }] },
		});
		expect(problems.map((p) => p.code)).toContain("event_or_schedule");
	});

	it("fires when an added subscription names both event and schedule", () => {
		const problems = editUserInvariants({
			id: "u1",
			subscriptions: { add: [{ event: "task.changed", schedule: "0 9 * * *" }] },
		});
		expect(problems.map((p) => p.code)).toContain("event_or_schedule");
	});

	it("does not fire for an event-only subscription", () => {
		const problems = editUserInvariants({
			id: "u1",
			subscriptions: { add: [{ event: "task.changed" }] },
		});
		expect(problems.map((p) => p.code)).not.toContain("event_or_schedule");
	});

	it("does not fire for a schedule-only subscription", () => {
		const problems = editUserInvariants({
			id: "u1",
			subscriptions: { add: [{ schedule: "0 9 * * *" }] },
		});
		expect(problems.map((p) => p.code)).not.toContain("event_or_schedule");
	});
});

describe("SearchUsersInputSchema", () => {
	it("an empty filter parses — no filter lists everyone", () => {
		expect(SearchUsersInputSchema.safeParse({}).success).toBe(true);
	});

	it("rejects an unknown field (.strict())", () => {
		expect(SearchUsersInputSchema.safeParse({ bogus: true }).success).toBe(false);
	});

	it("rejects a limit above 500", () => {
		expect(SearchUsersInputSchema.safeParse({ limit: 501 }).success).toBe(false);
	});

	it("accepts a kind filter", () => {
		expect(SearchUsersInputSchema.safeParse({ kind: "ai" }).success).toBe(true);
	});
});

describe("OpenUserInputSchema", () => {
	it("accepts no id — opens the caller", () => {
		expect(OpenUserInputSchema.safeParse({}).success).toBe(true);
	});

	it("accepts an id", () => {
		expect(OpenUserInputSchema.safeParse({ id: "u1" }).success).toBe(true);
	});
});

describe("EditUserInputSchema", () => {
	it("rejects an unknown top-level field (.strict())", () => {
		expect(EditUserInputSchema.safeParse({ id: "u1", bogus: true }).success).toBe(false);
	});

	it("parses a create with team by name", () => {
		const result = EditUserInputSchema.safeParse({
			kind: "human",
			name: "Ada",
			team: { name: "Core" },
		});
		expect(result.success).toBe(true);
	});

	it("rejects an unknown event on a subscription", () => {
		const result = EditUserInputSchema.safeParse({
			id: "u1",
			subscriptions: { add: [{ event: "not.a.real.event" }] },
		});
		expect(result.success).toBe(false);
	});

	it("parses folders.add with a code resourceRef", () => {
		const result = EditUserInputSchema.safeParse({
			id: "u1",
			folders: {
				add: [
					{
						kind: "code",
						resourceRef: { kind: "code", repo: "org/repo", branch: "main" },
						writeback: "git",
					},
				],
			},
		});
		expect(result.success).toBe(true);
	});

	it("parses inbox.seen as the literal 'all'", () => {
		expect(EditUserInputSchema.safeParse({ id: "u1", inbox: { seen: "all" } }).success).toBe(true);
	});

	// B1: a create (no `id`) carries `folders`/`connections` too — nothing in
	// the schema, nor in `editUserInvariants`, is create-only for them, so a
	// welcome-screen call that picks a folder is never silently ignored.
	it("parses folders and connections on a create — no id required for either", () => {
		const result = EditUserInputSchema.safeParse({
			kind: "human",
			name: "Ada",
			team: { name: "Core" },
			folders: {
				add: [
					{
						kind: "doc_set",
						resourceRef: { kind: "doc_set", folder: "/home/ada" },
						writeback: "none",
					},
				],
			},
			connections: { add: [{ authSource: "mcp", serverUrl: "https://example.com/mcp" }] },
		});
		expect(result.success).toBe(true);
	});

	it("editUserInvariants raises no problem for a create carrying folders/connections", () => {
		const problems = editUserInvariants({
			kind: "human",
			name: "Ada",
			team: { name: "Core" },
			folders: {
				add: [
					{
						kind: "doc_set",
						resourceRef: { kind: "doc_set", folder: "/home/ada" },
						writeback: "none",
					},
				],
			},
			connections: { add: [{ authSource: "mcp", serverUrl: "https://example.com/mcp" }] },
		});
		expect(problems).toEqual([]);
	});
});

describe("UserRowSchema", () => {
	const row = {
		id: "u1",
		kind: "ai" as const,
		name: "Assistant",
		role: "assistant",
		status: "active" as const,
		avatarUrl: null,
		createdAt: "2026-09-22T00:00:00.000Z",
		agentCategory: "individual" as const,
		ownerUserId: "u0",
		health: null,
		team: { id: "t1", name: "Core" },
		edges: [{ id: "e1", mechanism: "direct" as const, target: "u0" }],
	};

	it("parses a full row", () => {
		expect(UserRowSchema.safeParse(row).success).toBe(true);
	});

	it("accepts a null team — a rowless caller in the first-run moment", () => {
		expect(UserRowSchema.safeParse({ ...row, team: null }).success).toBe(true);
	});

	it("carries no email — a person is a name and an avatar", () => {
		expect(Object.keys(UserRowSchema.shape)).not.toContain("email");
	});
});

describe("EditUserInputSchema — no email", () => {
	it("rejects an email on an edit", () => {
		expect(EditUserInputSchema.safeParse({ id: "u1", email: "ada@example.com" }).success).toBe(
			false,
		);
	});
});

describe("ChangeRowSchema", () => {
	it("round-trips a user change row", () => {
		const result = ChangeRowSchema.safeParse({
			id: "c1",
			object: "user",
			objectId: "u1",
			kind: "changed",
			actor: "u0",
			before: { status: "idle" },
			after: { status: "active" },
			at: "2026-09-22T00:00:00.000Z",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a kind outside created/changed/message", () => {
		const result = ChangeRowSchema.safeParse({
			id: "c1",
			object: "user",
			objectId: "u1",
			kind: "deleted",
			actor: "u0",
			before: null,
			after: {},
			at: "2026-09-22T00:00:00.000Z",
		});
		expect(result.success).toBe(false);
	});
});

describe("USER_ACTIONS", () => {
	it("names exactly search_users, open_user, edit_user", () => {
		expect(Object.keys(USER_ACTIONS).sort()).toEqual(["edit_user", "open_user", "search_users"]);
	});

	it("each declaration's own name matches its map key", () => {
		for (const [key, declaration] of Object.entries(USER_ACTIONS)) {
			expect(declaration.name).toBe(key);
		}
	});

	it("the individually exported declarations are the same objects the map carries", () => {
		expect(USER_ACTIONS.search_users).toBe(searchUsers);
		expect(USER_ACTIONS.open_user).toBe(openUser);
		expect(USER_ACTIONS.edit_user).toBe(editUser);
	});
});
